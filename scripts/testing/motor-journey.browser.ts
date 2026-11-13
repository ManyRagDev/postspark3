/** Real Chromium + React/Konva; intentionally simulated API, Auth, billing and provider.
 * Run: node --import tsx scripts/testing/motor-journey.browser.ts
 */
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import superjson from "superjson";

const root = process.cwd();
const output = path.resolve(process.env.MOTOR_JOURNEY_OUTPUT ?? "/tmp/postspark-motor-journey");
await mkdir(output, { recursive: true });
const server = await createServer({ configFile: path.join(root,"vite.config.ts"), envDir: output,
  define: { "import.meta.env.VITE_SUPABASE_URL": "undefined", "import.meta.env.VITE_SUPABASE_ANON_KEY": "undefined" },
  server: { host: "127.0.0.1", port: 5197, strictPort: true },
  plugins: [{ name: "motor-journey-harness", configureServer(vite) {
    vite.middlewares.use(async (req,res,next) => {
      if (!req.url?.split("?")[0].match(/^\/(thevoid|saved-posts)$/)) return next();
      const html = await vite.transformIndexHtml(req.url, '<html><head><meta charset="utf-8" /></head><body><div id="root"></div><script type="module" src="/@fs/'+path.join(root,"harness/motorJourney/browser.tsx")+'"></script></body></html>');
      res.setHeader("content-type","text/html"); res.end(html);
    });
  } }],
});
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? chromium.executablePath(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
page.setDefaultTimeout(20000);
await page.addInitScript(() => localStorage.setItem("postspark.canvasAutoSaveEnabled", "false"));
const owner = "00000000-0000-4000-8000-000000000001", requestId = "00000000-0000-4000-8000-000000000002";
const calls: Array<{ path: string; bytes: number }> = [], events: any[] = [], errors: string[] = [];
let fixture: any, saved: any;
const snapshot = () => ({ contractVersion:1, requestId,runId:requestId,overallStatus:"completed",updatedAt:Date.now(), proposals:[0,1,2].map(slot=>({contractVersion:1,proposalId:`proposal-${slot}`,runId:requestId,slot,revision:1,findings:[],diagnostics:[],status:"ready",fixedCanvas:{...structuredClone(fixture),id:`motor-${slot}`,headline:`Proposta ${slot+1}`,fontFamily:"Arial",familyName:`Direção ${slot+1}`,slides:fixture.slides.slice(0,2).map((s:any,i:number)=>({...s,headline:`Proposta ${slot+1} · slide ${i+1}`}))}})) });
page.on("pageerror", error => errors.push(error.message));
await page.route("**/*", async route => {
  const url = new URL(route.request().url());
  if (url.hostname !== "127.0.0.1") return route.abort();
  if (!url.pathname.startsWith("/api/trpc/")) return route.continue();
  const names = url.pathname.slice("/api/trpc/".length).split(",");
  const inputs = JSON.parse(route.request().postData() ?? url.searchParams.get("input") ?? "{}");
  const results = names.map((name,index) => {
    const input: any = inputs[index] ? superjson.deserialize(inputs[index]) : undefined;
    calls.push({path:name,bytes:Buffer.byteLength(JSON.stringify(input??null))});
    let data: any = null;
    if (name === "auth.me") data = {id:owner,name:"Ensaio local",email:"fixture@example.test",role:"user"};
    else if (name === "billing.getProfile") data = {plan:"PRO",sparks:900,savedPostsCount:saved?1:0};
    else if (name === "brandProjects.list") data = [];
    else if (name === "generation.capabilities") data = {ownerId:owner,enabled:true,selectable:true,reason:"ready",contractVersion:6};
    else if (name === "generation.start") data = {snapshot:snapshot(),created:true};
    else if (name === "generation.get") data = {snapshot:snapshot(),billingPending:false};
    else if (name === "generation.progress") data = {requestId,status:"completed",billingPending:false,proposals:snapshot().proposals.map(({proposalId,revision,status}:any)=>({proposalId,revision,status}))};
    else if (name === "generationTelemetry.record") { events.push(...input.events); data={accepted:input.events.length}; }
    else if (name === "post.save") { saved={...input,id:1,revision:1,canvas_model:input.canvasModel,createdAt:new Date().toISOString()}; data={id:1,revision:1}; }
    else if (name === "post.update") { assert.equal(input.expectedRevision,saved.revision); saved={...saved,...input,canvas_model:input.canvasModel,revision:saved.revision+1}; data={success:true,revision:saved.revision}; }
    else if (name === "post.get") data=saved;
    else if (name === "post.listSummary") data={items:saved?[{...saved,canvas_model:undefined}]:[],total:saved?1:0};
    else if (name === "post.list") data=saved?[saved]:[];
    return {result:{data:superjson.serialize(data)}};
  });
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(results)});
});
try {
  await page.goto("http://127.0.0.1:5197/thevoid");
  await page.waitForFunction(() => Boolean((window as any).__motorFixture));
  fixture = await page.evaluate(() => (window as any).__motorFixture);
  await page.getByRole("textbox",{name:"Tema ou ideia do post"}).fill("Uma ideia de café artesanal para a comunidade");
  await page.getByRole("button",{name:"Criar posts",exact:true}).click();
  await page.getByRole("button",{name:"Personalizar Post",exact:true}).nth(2).waitFor({timeout:30000});
  await page.screenshot({path:path.join(output,"gallery.png")});
  await page.getByRole("button",{name:"Personalizar Post",exact:true}).nth(1).click();
  await page.getByRole("button",{name:"Salvar post",exact:true}).waitFor();
  await page.getByRole("button",{name:"Desativar ímã",exact:true}).click();
  await page.getByRole("button",{name:"Legenda",exact:true}).click();
  await page.getByRole("textbox",{name:"Legenda do post",exact:true}).fill("Legenda editada no navegador e preservada na reabertura.");
  await page.getByRole("button",{name:"Fechar painel",exact:true}).click();
  await page.screenshot({path:path.join(output,"edited.png")});
  await page.getByRole("button",{name:"Baixar post",exact:true}).click();
  const beforeDownload = page.waitForEvent("download");
  await page.getByRole("menuitem",{name:"Imagem do slide atual · PNG 4K",exact:true}).click();
  await (await beforeDownload).saveAs(path.join(output,"before-save.png"));
  await page.getByRole("button",{name:"Salvar post",exact:true}).click();
  await page.getByRole("button",{name:"Salvar como novo post",exact:true}).focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.body.innerText.includes("Post salvo na sua biblioteca") || document.body.innerText.includes("Post atualizado na sua biblioteca"));
  assert.equal(saved.canvas_model.provenance.journey.proposalId,"proposal-1");
  assert.equal(saved.canvas_model.caption,"Legenda editada no navegador e preservada na reabertura.");
  const original = structuredClone(saved.canvas_model);
  await page.getByRole("button",{name:"Ver salvos",exact:true}).click();
  await page.getByRole("button",{name:/Abrir/}).first().click();
  await page.getByRole("button",{name:"Salvar post",exact:true}).waitFor();
  await page.getByRole("button",{name:"Legenda",exact:true}).click();
  assert.equal(await page.getByRole("textbox",{name:"Legenda do post",exact:true}).inputValue(),original.caption);
  await page.getByRole("button",{name:"Fechar painel",exact:true}).click();
  await page.screenshot({path:path.join(output,"reopened.png")});
  for (const [label,file] of [["Imagem do slide atual · PNG 4K","export.png"],["Todos os slides · ZIP","export.zip"]]) {
    await page.getByRole("button",{name:"Baixar post",exact:true}).click();
    const downloaded=page.waitForEvent("download");
    await page.getByRole("menuitem",{name:label,exact:true}).click();
    await (await downloaded).saveAs(path.join(output,file));
    assert.ok((await readFile(path.join(output,file))).length>100);
  }
  await page.waitForTimeout(2500);
  const idleBefore = calls.filter(c=>/generation\.(get|progress|capabilities)|billing.getProfile/.test(c.path)).length;
  await page.waitForTimeout(6500);
  assert.equal(calls.filter(c=>/generation\.(get|progress|capabilities)|billing.getProfile/.test(c.path)).length,idleBefore);
  assert.deepEqual(saved.canvas_model,original);
  const exported = await readFile(path.join(output,"export.png"));
  assert.deepEqual(exported,await readFile(path.join(output,"before-save.png")));
  assert.equal(exported.readUInt32BE(16),3840);
  assert.equal(exported.readUInt32BE(20),3840);
  assert.ok(events.some(e=>e.kind==="choice"&&e.proposalId==="proposal-1"));
  assert.ok(events.some(e=>e.kind==="reopen"&&e.proposalId==="proposal-1"));
  assert.ok(events.some(e=>e.kind==="export_png"));
  assert.ok(events.some(e=>e.kind==="export_zip"));
  assert.deepEqual(errors,[]);
  await writeFile(path.join(output,"report.json"),JSON.stringify({scope:"Real React/Konva/Chromium; simulated API, Auth, billing, provider and persistence. No remote calls.",calls,events,errors,selectedProposal:"proposal-1",saveReopenModelEqual:true,exportBeforeAfterByteIdentical:true,pngDimensions:[3840,3840],idleWindowMs:6500},null,2));
  await Promise.all(["failure.json","failure.png"].map(file=>rm(path.join(output,file),{force:true})));
  console.log(`Browser journey passed: ${output}`);
} catch(error) {
  await page.screenshot({path:path.join(output,"failure.png")});
  await writeFile(path.join(output,"failure.json"),JSON.stringify({message:String(error),errors,calls,events,body:await page.locator("body").innerText()},null,2));
  throw error;
} finally { await browser.close(); server.httpServer?.closeAllConnections(); await server.close(); }
