/** Live read-only API probe. No users, blueprints, approvals or posts are created. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { getDb } from "../../server/db";
import { listCatalog } from "../../server/designCatalog/store";
import { designCatalogRouter } from "../../server/routers/designCatalog";
import type { TrpcContext } from "../../server/_core/context";

const checks: string[] = [];
const entries = await listCatalog();
checks.push("Backend reads catalog via configured PostgREST schema");
const db = getDb();
const { error: rpcError } = await db.rpc("design_catalog_status", {
  p_id: randomUUID(), p_status: "approved", p_actor: randomUUID(), p_trace: randomUUID(),
});
assert.equal(rpcError?.code, "P0001");
assert.equal(rpcError?.message, "Catalog version not found");
checks.push("PostgREST resolves status RPC; unknown version rejected without mutation");
const { error: postsError } = await db.from("posts").select("canvas_model").limit(0);
assert.equal(postsError, null);
checks.push("Authoritative canvas_model column accessible through API");

const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
assert.ok(anonKey, "VITE_SUPABASE_ANON_KEY required for anonymous access probe");
const anon = createClient(process.env.SUPABASE_URL!, anonKey, { auth: { persistSession: false }, db: { schema: "postspark" } });
const { error: deniedRead } = await anon.from("design_catalog_versions").select("id").limit(1);
assert.equal(deniedRead?.code, "42501");
checks.push("Anonymous REST read denied");
const { error: deniedRpc } = await anon.rpc("design_catalog_status", {
  p_id: randomUUID(), p_status: "approved", p_actor: randomUUID(), p_trace: randomUUID(),
});
assert.equal(deniedRpc?.code, "42501");
checks.push("Anonymous REST RPC denied");

// Injected caller contexts exercise middleware only, not cookie/session authentication.
const caller = (role?: "admin" | "user") => designCatalogRouter.createCaller({
  req: {}, res: {}, user: role ? { id: randomUUID(), name: "Validation", email: "validation@example.invalid", role } : null,
} as TrpcContext);
await assert.rejects(caller().list({ offset: 0 }), { code: "FORBIDDEN" });
await assert.rejects(caller("user").list({ offset: 0 }), { code: "FORBIDDEN" });
checks.push("tRPC rejects anonymous and non-admin catalog reads (injected contexts)");
await assert.rejects(caller("user").setStatus({ id: randomUUID(), status: "approved" }), { code: "FORBIDDEN" });
checks.push("tRPC rejects non-admin approval (injected context)");
const adminEntries = await caller("admin").list({ offset: 0 });
assert.equal(adminEntries.length, entries.length);
checks.push("Admin router reaches catalog backend (injected context)");
const output = "artifacts/design-catalog/api.json";
await mkdir("artifacts/design-catalog", { recursive: true });
await writeFile(output, JSON.stringify({ at: new Date().toISOString(), checks, entries: entries.length, limitations: ["No browser, session/cookie authentication or paid generation", "Authenticated database role tested by rollback SQL probe, not a real user JWT"] }, null, 2));
console.log(JSON.stringify({ passed: checks.length, entries: entries.length, report: output }));
