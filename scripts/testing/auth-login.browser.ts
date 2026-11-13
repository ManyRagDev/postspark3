/** Local Chromium integration: real App + Supabase SDK + bridge, simulated auth/API server.
 * No .env values, live credentials, OAuth provider, SMTP, VPS or billing actions are used.
 * Run: node --import tsx scripts/testing/auth-login.browser.ts
 */
import { createServer } from "vite";
import { chromium, type BrowserContext } from "playwright-core";
import { createHash } from "node:crypto";
import { mkdir, writeFile, rm, mkdtemp } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import superjson from "superjson";

const root = process.cwd();
const output = path.resolve(process.env.AUTH_LOGIN_OUTPUT ?? "/tmp/postspark-auth-login");
await mkdir(output,{recursive:true});
const origin = "http://127.0.0.1:5198";
const owner = "00000000-0000-4000-8000-000000000011";
const user = { id:owner,aud:"authenticated",role:"authenticated",email:"fixture@example.test",email_confirmed_at:"2026-11-12T00:00:00Z",created_at:"2026-11-12T00:00:00Z",app_metadata:{provider:"email",providers:["email"]},user_metadata:{name:"Ensaio local"},identities:[] };
const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
// Deliberately unsigned fixture; the simulated server accepts it. Never valid against any real project.
const token = `${encoded({alg:"HS256",typ:"JWT"})}.${encoded({sub:owner,role:"authenticated",aud:"authenticated",email:user.email,exp:Math.floor(Date.now()/1000)+3600})}.fixture-signature`;
const marker = createHash("sha256").update(token).digest("hex");
console.info("[auth-login] Preparing isolated Vite server");
const server = await createServer({ configFile:path.join(root,"vite.config.ts"),envDir:output,
  define:{
    "import.meta.env.VITE_SUPABASE_URL":JSON.stringify(`${origin}/auth-fixture`),
    "import.meta.env.VITE_SUPABASE_ANON_KEY":JSON.stringify("public-fixture-key-not-a-real-credential"),
    "import.meta.env.VITE_POSTSPARK_LOCAL_AUTH":"undefined",
    "import.meta.env.VITE_POSTSPARK_AUTH_MODE":"undefined",
    "import.meta.env.VITE_POSTSPARK_SIGNUP_ENABLED":"undefined",
    "import.meta.env.VITE_POSTSPARK_EMAIL_DELIVERY_ENABLED":"undefined",
  },
  server:{host:"127.0.0.1",port:5198,strictPort:true},
  plugins:[{name:"auth-login-harness",configureServer(vite){
    vite.middlewares.use(async(req,res,next)=>{
      if (!req.url?.split("?")[0].match(/^\/(|criar|thevoid)$/)) return next();
      const html=await vite.transformIndexHtml(req.url,'<html><head><meta charset="utf-8" /></head><body><div id="root"></div><script type="module" src="/@fs/'+path.join(root,"harness/authLogin/browser.tsx")+'"></script></body></html>');
      res.setHeader("content-type","text/html"); res.end(html);
    });
  }}],
});
await server.listen();
type Scenario = "invalid-password" | "bridge-denied" | "bridge-delayed" | "stale-marker";
type Evidence = {scenario:Scenario;authCalls:string[];bridgeCalls:number;trpcCalls:string[];externalBlocked:number;pageErrors:string[];passed:boolean};
const evidence:Evidence[]=[];

async function scenario(name:Scenario) {
  console.info(`[auth-login] Scenario: ${name}`);
  const record:Evidence={scenario:name,authCalls:[],bridgeCalls:0,trpcCalls:[],externalBlocked:0,pageErrors:[],passed:false};
  evidence.push(record);
  const profile=await mkdtemp("/tmp/postspark-auth-browser-");
  // Every scenario gets a fresh disposable profile; never connect to the user's browser.
  let context:BrowserContext;
  try {
    context=await chromium.launchPersistentContext(profile,{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??chromium.executablePath(),headless:true,timeout:20000,args:["--no-sandbox","--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost"],viewport:{width:1440,height:1000}});
  } catch(error) { await rm(profile,{recursive:true,force:true}); throw error; }
  console.info(`[auth-login] Context ready: ${name}`);
  const page=context.pages()[0]??await context.newPage();
  console.info(`[auth-login] Page ready: ${name}`);
  page.setDefaultTimeout(20000);
  page.on("pageerror",error=>record.pageErrors.push(error.message));
  await context.addInitScript(({staleMarker})=>{
    // Consent is fixture setup, not a change to real user preferences.
    localStorage.setItem("postspark_consent_given",JSON.stringify({given:true,version:"1.0",timestamp:new Date().toISOString(),aiImprovements:false}));
    if(staleMarker && !sessionStorage.getItem("auth-fixture-marker-seeded")) {
      localStorage.setItem("postspark.session-bridge.v2",staleMarker);
      sessionStorage.setItem("auth-fixture-marker-seeded","true");
    }
  },{staleMarker:name==="stale-marker"?marker:null});
  let releaseBridge:()=>void=()=>{};
  const bridgeGate=name==="bridge-delayed"?new Promise<void>(resolve=>{releaseBridge=resolve;}):Promise.resolve();
  let bridgeStartedResolve:()=>void=()=>{};
  const bridgeStarted=new Promise<void>(resolve=>{bridgeStartedResolve=resolve;});
  await context.route("**/*",async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin) {record.externalBlocked++;return route.abort();}
    if(url.pathname.startsWith("/auth-fixture/")) {
      const endpoint=url.pathname.slice("/auth-fixture".length)+url.search;
      record.authCalls.push(endpoint);
      if(url.pathname.endsWith("/token")&&url.searchParams.get("grant_type")==="password") {
        if(name==="invalid-password") return route.fulfill({status:400,contentType:"application/json",body:JSON.stringify({error:"invalid_grant",error_description:"Invalid login credentials",code:"invalid_credentials"})});
        return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({access_token:token,token_type:"bearer",expires_in:3600,refresh_token:"fixture-refresh-token",user})});
      }
      if(url.pathname.endsWith("/user")) return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(user)});
      return route.fulfill({status:400,contentType:"application/json",body:JSON.stringify({error:"unexpected_fixture_auth_endpoint"})});
    }
    if(url.pathname==="/api/auth/supabase-session") {
      record.bridgeCalls++; bridgeStartedResolve();
      await bridgeGate;
      if(name==="bridge-denied") return route.fulfill({status:403,contentType:"application/json",body:JSON.stringify({error:"postspark_access_required"})});
      return route.fulfill({status:200,contentType:"application/json",headers:{"set-cookie":"auth_fixture_session=confirmed; Path=/; HttpOnly; SameSite=Lax"},body:JSON.stringify({success:true})});
    }
    if(url.pathname.startsWith("/api/trpc/")) {
      const authorized=request.headers().cookie?.includes("auth_fixture_session=confirmed")??false;
      const results=url.pathname.slice("/api/trpc/".length).split(",").map(name=>{
        record.trpcCalls.push(name);
        let data:unknown=null;
        if(name==="auth.me") data=authorized?{id:owner,name:"Ensaio local",email:user.email,role:"user"}:null;
        else if(name==="brandProjects.list") data=[];
        else if(name==="billing.getProfile") data={plan:"FREE",sparks:0,savedPostsCount:0};
        else if(name==="post.listSummary") data={items:[],total:0};
        else if(name==="generation.capabilities") data={ownerId:owner,selectable:true,enabled:false,reason:"maintenance",contractVersion:6};
        return {result:{data:superjson.serialize(data)}};
      });
      return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(results)});
    }
    if(url.pathname.startsWith("/api/")) return route.fulfill({status:404,contentType:"application/json",body:"{}"});
    return route.continue();
  });
  try {
    console.info(`[auth-login] Opening App: ${name}`);
    await page.goto(`${origin}${name==="invalid-password"?"/criar":"/"}`);
    console.info(`[auth-login] App loaded: ${name}`);
    if(name==="invalid-password") {
      await page.getByRole("button",{name:"Entrar",exact:true}).first().click();
      await page.waitForURL(`${origin}/`);
    }
    await page.getByRole("button",{name:"Entrar",exact:true}).first().click();
    await page.getByRole("textbox",{name:"E-mail",exact:true}).waitFor();
    assert.equal(await page.getByRole("button",{name:/Google/}).count(),0);
    assert.equal(await page.getByRole("button",{name:/Criar conta|Cadastre/}).count(),0);
    assert.equal(await page.getByText(/Esqueci.*senha|Recuperar senha/i).count(),0);
    await page.getByRole("textbox",{name:"E-mail",exact:true}).fill(user.email);
    await page.getByLabel("Senha",{exact:true}).fill("fixture-only-password");
    await page.getByRole("button",{name:"Entrar no PostSpark",exact:true}).click();
    if(name==="invalid-password") {
      await page.getByText("E-mail ou senha incorretos.",{exact:true}).waitFor();
      assert.equal(record.bridgeCalls,0);
      assert.equal(new URL(page.url()).pathname,"/");
      assert.equal(await page.getByRole("textbox",{name:"Tema ou ideia do post"}).count(),0);
    } else {
      let deadline:ReturnType<typeof setTimeout>|undefined;
      try { await Promise.race([bridgeStarted,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error("Bridge was not invoked")),20000);})]); }
      finally { if(deadline)clearTimeout(deadline); }
      if(name==="bridge-delayed") {
        await page.waitForTimeout(350);
        assert.equal(new URL(page.url()).pathname,"/");
        assert.equal(await page.getByRole("textbox",{name:"Tema ou ideia do post"}).count(),0);
        assert.equal((await context.cookies()).some(cookie=>cookie.name==="auth_fixture_session"),false);
        releaseBridge();
      }
      if(name==="bridge-denied") {
        await page.waitForFunction(()=>{
          const form=document.querySelector("form");
          return Boolean(form?.querySelector("div.border-red-500\\/30"));
        });
        assert.equal(new URL(page.url()).pathname,"/");
        assert.equal(await page.getByRole("textbox",{name:"Tema ou ideia do post"}).count(),0);
        assert.equal((await context.cookies()).some(cookie=>cookie.name==="auth_fixture_session"),false);
        assert.ok(!record.trpcCalls.includes("generation.start"));
      } else {
        await page.waitForURL(`${origin}/thevoid`);
        await page.getByRole("textbox",{name:"Tema ou ideia do post"}).waitFor();
        assert.ok(record.bridgeCalls>=1);
        assert.equal((await context.cookies()).some(cookie=>cookie.name==="auth_fixture_session"),true);
      }
    }
    assert.equal(record.authCalls.filter(call=>call.includes("grant_type=password")).length,1);
    assert.ok(record.authCalls.every(call=>!call.includes("/signup")&&!call.includes("/recover")&&!call.includes("/authorize")));
    assert.ok(record.trpcCalls.every(call=>!call.startsWith("billing.create")&&!call.startsWith("billing.start")&&call!=="generation.start"));
    assert.deepEqual(record.pageErrors,[]);
    await page.screenshot({path:path.join(output,`${name}.png`)});
    record.passed=true;
  } catch(error) {
    await page.screenshot({path:path.join(output,`${name}-failure.png`)});
    await writeFile(path.join(output,"failure.json"),JSON.stringify({message:String(error),evidence,body:await page.locator("body").innerText()},null,2));
    throw error;
  } finally {releaseBridge();await context.close();await rm(profile,{recursive:true,force:true});}
}

try {
  for(const name of ["invalid-password","bridge-denied","bridge-delayed","stale-marker"] as const) await scenario(name);
  await writeFile(path.join(output,"report.json"),JSON.stringify({scope:"Real Chromium/App/routes/Supabase SDK/bridge client. Auth responses, cookie authorization and tRPC API simulated locally; all external browser requests blocked. No production authentication or SMTP verification.",evidence},null,2));
  await rm(path.join(output,"failure.json"),{force:true});
  console.log(`Auth login browser checks passed: ${output}`);
} catch(error) {
  const applicationReached=evidence.some(item=>item.authCalls.length||item.trpcCalls.length||item.bridgeCalls);
  await writeFile(path.join(output,"report.json"),JSON.stringify({status:applicationReached?"failed":"blocked",scope:"Local browser test with simulated Auth/API; no production validation",applicationReached,error:String(error),evidence},null,2));
  throw error;
} finally {server.httpServer?.closeAllConnections();await server.close();}
