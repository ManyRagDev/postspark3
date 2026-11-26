// Invoked by httpAuthBundle.test.ts in an empty directory with a fixture-only environment.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const [, , bundle, target] = process.argv;
const authOrigin = "http://127.0.0.1:1";
assert.equal(process.env.SUPABASE_URL, authOrigin);
assert.equal(process.env.DOTENV_CONFIG_PATH, "/dev/null");
assert.equal(process.env.VERCEL, "1"); // Import the Express app without starting its listener or worker.
assert.equal(process.env.BYPASS_AUTH, "true");
assert.ok(["development", "production"].includes(process.env.NODE_ENV));
const localReview = process.env.NODE_ENV === "development";

const users = new Map();
function identity(session, role, grant) {
  const id = randomUUID();
  users.set(session, { id, role, grant });
  return id;
}
const operatorToken = "fixture." + Buffer.from(JSON.stringify({ session_id: randomUUID() })).toString("base64url") + ".fixture";
const operator = identity(operatorToken, "admin", "full");
const developerToken = "fixture." + Buffer.from(JSON.stringify({ session_id: randomUUID() })).toString("base64url") + ".fixture";
const developerId = identity(developerToken, "user", "full");
let developerPlan = "DEV";
const member = identity("member", "user", "full");
identity("administrator", "admin", "full");
identity("denied", "admin", null);
identity("start", "admin", "start");
identity("agency", "admin", "agency");
const hash = "a".repeat(64);
const media = `/api/post-media/${member}/${hash}`;
const review = "/api/acervo82/review/acervo82-reference-01/reference";
const restricted = "/api/trpc/brandKit.get";
const admin = "/trpc/admin.getAiRollout";
const unexpected = [];
let downloads = 0;

// Only the test client uses the native transport, bound to the ephemeral loopback server.
// The real Supabase SDK sees these Auth, PostgREST and Storage responses in memory.
const clientFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const req = new Request(input, init);
  const { origin, pathname, searchParams } = new URL(req.url);
  if (origin !== authOrigin) {
    unexpected.push("external origin");
    throw new Error("External request blocked");
  }
  if (pathname === "/auth/v1/user") {
    const user = users.get(req.headers.get("authorization")?.replace(/^Bearer /, ""));
    if (!user) return Response.json({ message: "Invalid fixture session" }, { status: 401 });
    return Response.json({
      id: user.id, aud: "authenticated", email_confirmed_at: "2026-01-01T00:00:00Z",
      app_metadata: { role: user.role }, user_metadata: { role: "admin" },
    });
  }
  if (pathname.startsWith("/rest/v1/rpc/")) {
    const { p_user_id } = await req.json();
    const user = [...users.values()].find(item => item.id === p_user_id);
    assert.ok(user, "RPC must use a verified fixture identity");
    switch (pathname.split("/").pop()) {
      case "has_app_access":
      case "has_manylabs_app_access": return Response.json(user.grant === "full");
      case "has_start_pilot": return Response.json(user.grant === "start");
      case "has_agency_access": return Response.json(user.grant === "agency");
      case "refill_pro_sparks": return Response.json(null);
      case "agency_can_read_media": return Response.json(false);
    }
  }
  if (pathname === "/rest/v1/profiles") {
    const id = searchParams.get("id")?.replace(/^eq\./, "");
    assert.ok([...users.values()].some(user => user.id === id));
    return Response.json({ id, plan: id === developerId ? developerPlan : "SOLO", sparks: 27 });
  }
  if (pathname === "/rest/v1/profiles") {
    const user = [...users.values()].find(item => searchParams.get("id") === "eq." + item.id);
    if (user) return Response.json({id:user.id, plan:user.role === "admin" && user.grant === "full" ? "DEV" : "SOLO", sparks:0});
  }
  if (pathname === "/rest/v1/brand_kits" && searchParams.get("user_uuid") === `eq.${member}`) {
    return Response.json([{ user_uuid: member }]);
  }
  if (pathname === `/storage/v1/object/postspark-media/${member}/${hash}`) {
    downloads++;
    return new Response("fixture image", { headers: { "Content-Type": "image/png" } });
  }
  unexpected.push(pathname);
  throw new Error("Unexpected fixture request");
};

const { default: app } = await import(pathToFileURL(bundle));
const server = createServer(app);
server.listen(0, "127.0.0.1");
await once(server, "listening");
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  const cookie = session => `app_session_id=${session}`;
  const get = (path, sessionCookie) => clientFetch(origin + path, {
    headers: sessionCookie ? { cookie: sessionCookie } : {}, redirect: "error",
  });
  const bridge = session => clientFetch(origin + "/api/auth/supabase-session", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: session }), redirect: "error",
  });
  for (const [session, bridgeStatus] of [[undefined, 400], ["invalid", 401], ["denied", 403]]) {
    const sessionCookie = session && cookie(session);
    assert.equal((await get(restricted, sessionCookie)).status, 401);
    assert.equal((await get(admin, sessionCookie)).status, 403);
    assert.equal((await get(media, sessionCookie)).status, 401);
    assert.equal((await get(review, sessionCookie)).status, localReview ? 401 : 404);
    const response = await bridge(session);
    assert.equal(response.status, bridgeStatus);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  assert.equal(downloads, 0);

  async function login(session) {
    const response = await bridge(session);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).id, users.get(session).id);
    const header = response.headers.get("set-cookie");
    assert.match(header, /; HttpOnly/i);
    return header.split(";")[0];
  }
  const memberCookie = await login("member");
  const brandKit = await get(restricted, memberCookie);
  assert.equal(brandKit.status, 200);
  assert.equal((await brandKit.json()).result.data.json.user_uuid, member);
  assert.equal((await get(admin, memberCookie)).status, 403);
  assert.equal((await get(review, memberCookie)).status, localReview ? 403 : 404);
  const image = await get(media, memberCookie);
  assert.equal(image.status, 200);
  assert.equal(await image.text(), "fixture image");
  const adminCookie = await login("administrator");
  assert.equal((await get(admin, adminCookie)).status, 200);
  assert.equal((await get(media, adminCookie)).status, 404);
  users.get("member").grant = null;
  assert.equal((await get(restricted, memberCookie)).status, 401);
  assert.equal((await get(media, memberCookie)).status, 401);
  assert.equal(downloads, 1);

  if (target === "current") {
    for (const path of ["/mare", "/mare/", "/mare/index.html", "/api/mare/projects", "/api/mare/capabilities"]) {
      assert.equal((await get(path)).status, 401, path);
    }
    assert.equal((await get("/previa-mare/")).status, localReview ? 401 : 404);
    process.env.POSTSPARK_MARE_ENABLED = "true";
    process.env.POSTSPARK_MARE_PILOT_USERS = users.get("administrator").id;
    const editor = await get("/mare/", adminCookie);
    assert.equal(editor.status, 200);
    assert.match(editor.headers.get("cache-control"), /private, no-store/);
    assert.match(await editor.text(), /id="studio-editor"/);
    assert.equal((await get("/previa-mare/", adminCookie)).status, localReview ? 200 : 404);
    // Exercise the same HTTP mutation and session cookies used by the account dropdown.
    const operatorCookie = await login(operatorToken);
    const choose = (plan, session) => clientFetch(origin + "/api/trpc/auth.impersonatePlan", {
      method: "POST", headers: { "content-type": "application/json", cookie: session },
      body: JSON.stringify({ json: { plan } }),
    });
    const who = async session => (await (await get("/api/trpc/auth.me", session)).json()).result.data.json;
    const asCustomer = await choose("AGENCY", operatorCookie);
    assert.equal(asCustomer.status, 200);
    assert.match(asCustomer.headers.get("set-cookie"), /HttpOnly/i);
    const preference = asCustomer.headers.get("set-cookie").split(";")[0];
    const effective = operatorCookie + "; " + preference;
    assert.equal((await who(effective)).id, operator);
    assert.equal((await who(effective)).studioPlan, "AGENCY");
    assert.equal((await who(effective)).canImpersonate, true);
    assert.equal((await get(admin, effective)).status, 403);
    assert.equal((await who(operatorCookie)).studioPlan, "SOLO");
    assert.equal((await get(admin, operatorCookie)).status, 200);
    assert.equal((await choose(null, effective)).status, 200);
    users.get("member").grant = "full";
    assert.equal((await choose("AGENCY", memberCookie)).status, 403);
    assert.equal((await who(memberCookie + "; " + preference)).impersonatedPlan, null);
    const developerCookie = await login(developerToken);
    assert.equal((await who(developerCookie)).canImpersonate, true);
    const preview = await choose("PRO_PLUS", developerCookie);
    assert.equal(preview.status, 200);
    const devPreview = developerCookie + "; " + preview.headers.get("set-cookie").split(";")[0];
    const staleEditor = await clientFetch(origin + "/api/mare/projects", { headers: {
      cookie: developerCookie, "X-PostSpark-Editor-Owner": operator,
    } });
    assert.equal(staleEditor.status, 401);
    const [simulated, ordinary] = await Promise.all([who(devPreview), who(memberCookie)]);
    assert.deepEqual([simulated.id, simulated.studioPlan, ordinary.id, ordinary.studioPlan], [developerId, "PRO_PLUS", member, "SOLO"]);
    developerPlan = "SOLO";
    assert.equal((await who(devPreview)).canImpersonate, false);
    assert.equal((await who(devPreview)).impersonatedPlan, null);
    for (const session of ["start", "agency"]) {
      const scopedCookie = await login(session);
      const restrictedEditor = await get("/mare/index.html", scopedCookie);
      assert.equal(restrictedEditor.status, 403);
      assert.doesNotMatch(await restrictedEditor.text(), /id="studio-editor"/);
      assert.equal((await get("/previa-mare/", scopedCookie)).status, localReview ? 403 : 404);
      const me = await get("/api/trpc/auth.me", scopedCookie);
      assert.equal((await me.json()).result.data.json.access, session);
      assert.equal((await get(restricted, scopedCookie)).status, 403);
      assert.equal((await get(admin, scopedCookie)).status, 403);
      assert.equal((await get(review, scopedCookie)).status, localReview ? 403 : 404);
    }
  }
  assert.deepEqual(unexpected, []);
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
