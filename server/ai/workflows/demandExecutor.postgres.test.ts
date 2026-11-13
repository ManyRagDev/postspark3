import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { generationReleasePostgresFixture, releaseOwner } from "./generationReleasePostgres.fixture";
let pg: PGlite;
const signals: string[] = [];
beforeAll(async () => {
  pg = await generationReleasePostgresFixture();
  // pg_dump --no-acl restores CREATE FUNCTION with the default PUBLIC EXECUTE.
  // Model that real baseline, rather than inheriting migration-only fixture ACLs.
  await pg.exec("GRANT EXECUTE ON FUNCTION postspark.generation_reconcile(),postspark.generation_v5_claim(text),postspark.brand_capture_claim(uuid,text) TO PUBLIC");
  for (const signature of ["postspark.generation_reconcile()", "postspark.generation_v5_claim(text)", "postspark.brand_capture_claim(uuid,text)"]) {
    expect((await pg.query<{ allowed: boolean }>("SELECT has_function_privilege('anon',$1,'EXECUTE') allowed", [signature])).rows[0].allowed).toBe(true);
  }
  await pg.exec(readFileSync(new URL("../../../drizzle/0065_demand_executor.sql", import.meta.url), "utf8"));
  await pg.listen("postspark_work", value => { signals.push(value); });
}, 30_000);
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  await pg.exec("DELETE FROM postspark.generation_v5_requests; DELETE FROM postspark.generation_runs; DELETE FROM postspark.brand_captures; UPDATE postspark.demand_executor_control SET retry_at=NULL,failure_count=0,failure_class=NULL");
  signals.length = 0;
});
async function admit() {
  const id = randomUUID();
  await pg.query("INSERT INTO postspark.generation_runs(id,user_uuid,status,input_type,input_content,platform,post_mode,creation_mode,requested_model) VALUES($1,$2,'running','text','SECRET BRIEF','instagram','static','ideation','test')", [id, releaseOwner]);
  await pg.query("INSERT INTO postspark.generation_v5_requests(id,owner_id,idempotency_key,input_hash,input,status,experimental,deadline_at,proposals) VALUES($1::uuid,$2::uuid,$1::text,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','{}','queued',false,now()+interval '10 minutes','[{},{},{}]')", [id, releaseOwner]);
  return id;
}
const schedule = async () => (await pg.query<{ value: { version: number; wakeAt: string | null } }>("SELECT postspark.demand_work_schedule() value")).rows[0].value;
describe("demand signal and durable scheduling SQL", () => {
  it("hardens restored PUBLIC functions while preserving the service executor", async () => {
    const queries = [
      "SELECT postspark.generation_reconcile() value",
      "SELECT postspark.generation_v5_claim('service-worker') value",
      "SELECT postspark.brand_capture_claim(NULL,NULL) value",
    ];
    for (const role of ["anon", "authenticated"]) {
      await pg.exec(`SET ROLE ${role}`);
      try {
        for (const query of queries) await expect(pg.query(query)).rejects.toMatchObject({ code: "42501" });
      } finally { await pg.exec("RESET ROLE"); }
    }
    await pg.exec("SET ROLE service_role");
    try {
      const values = [];
      for (const query of queries) values.push((await pg.query<{ value: unknown }>(query)).rows[0].value);
      expect(values).toEqual([0, null, null]);
    } finally { await pg.exec("RESET ROLE"); }
  });
  it("publishes only opaque identity after commit and none after rollback", async () => {
    await pg.exec("BEGIN");
    const id = await admit();
    expect(signals).toHaveLength(0);
    await pg.exec("COMMIT");
    expect(signals.map(s => JSON.parse(s))).toEqual([{ kind: "generation", id }]);
    signals.length = 0;
    await pg.exec("BEGIN"); await admit(); await pg.exec("ROLLBACK");
    expect(signals).toHaveLength(0);
  });
  it("recovers admitted work without receiving its notification; lease fences duplicate claims", async () => {
    await admit();
    expect((await schedule()).wakeAt).not.toBeNull();
    const first = (await pg.query<{ value: any }>("SELECT postspark.generation_v5_claim('worker-a') value")).rows[0].value;
    expect(first.status).toBe("running");
    const duplicate = (await pg.query<{ value: any }>("SELECT postspark.generation_v5_claim('worker-b') value")).rows[0].value;
    expect(duplicate).toBeNull();
    expect(Date.parse((await schedule()).wakeAt!)).toBeGreaterThan(Date.now() + 60_000);
    await pg.query("INSERT INTO postspark.generation_v5_operations(request_id,operation_key,state) VALUES($1,'paid:copy','started')", [first.id]);
    await pg.query("UPDATE postspark.generation_v5_requests SET lease_until=now()-interval '1 second' WHERE id=$1", [first.id]);
    const recovered = (await pg.query<{ value: any }>("SELECT postspark.generation_v5_claim('worker-b') value")).rows[0].value;
    expect(recovered.leaseToken).not.toBe(first.leaseToken);
    expect((await pg.query<{ state: string }>("SELECT state FROM postspark.generation_v5_operations")).rows[0].state).toBe("uncertain");
  });
  it("signals capture admission and exposes a bounded envelope without documents", async () => {
    const value = (await pg.query<{ value: any }>("SELECT postspark.brand_capture_start($1,'https://example.com','capture','external',NULL,false) value", [releaseOwner])).rows[0].value;
    expect(signals.map(s => JSON.parse(s))).toContainEqual({ kind: "capture", id: value.id });
    const metadata = await schedule();
    expect(metadata.version).toBe(1);
    expect(Buffer.byteLength(JSON.stringify(metadata))).toBeLessThan(250);
    expect(JSON.stringify(metadata)).not.toMatch(/example.com|SECRET|owner/);
  });
  it("persists cooldown across consumers and carries the same database identity", async () => {
    await admit();
    const before = (await pg.query<{ value: any }>("SELECT postspark.demand_work_schedule() value")).rows[0].value;
    expect(before.installationId).toMatch(/^[a-f0-9-]{36}$/);
    await pg.exec("SELECT postspark.demand_executor_backoff('credentials')");
    const after = (await pg.query<{ value: any }>("SELECT postspark.demand_work_schedule() value")).rows[0].value;
    expect(after.installationId).toBe(before.installationId);
    expect((await pg.query<{ value: any }>("SELECT postspark.generation_v5_claim('another-worker') value")).rows[0].value).toBeNull();
    expect((await pg.query<{ value: any }>("SELECT postspark.brand_capture_claim(NULL,NULL) value")).rows[0].value.blockedUntil).toBeTruthy();
    expect(Date.parse(after.notBefore)).toBeGreaterThan(Date.now() + 700_000);
    // The request deadline is earlier than credential retry: expiry/settlement must still run.
    expect(Date.parse(after.wakeAt)).toBeLessThan(Date.parse(after.notBefore));
    expect((await pg.query<{ status: string }>("SELECT status FROM postspark.generation_v5_requests")).rows[0].status).toBe("queued");
    await expect(pg.exec("SELECT postspark.demand_executor_backoff('unknown')")).rejects.toThrow(/Invalid failure class/);
  });
  it("has no deadline at rest and denies metadata APIs to end users", async () => {
    expect((await schedule()).wakeAt).toBeNull();
    for (const role of ["anon", "authenticated"]) {
      await pg.exec(`SET ROLE ${role}`);
      await expect(schedule()).rejects.toMatchObject({ code: "42501" });
      await pg.exec("RESET ROLE");
    }
  });
  it("reconciles terminal billing without requeuing or rerunning generation", async () => {
    const id = await admit();
    await pg.query("UPDATE postspark.generation_v5_requests SET status='failed',billing_mode='reserved',billing_settled_at=NULL,billing_retry_at=now()-interval '1 second' WHERE id=$1", [id]);
    await pg.query("UPDATE postspark.generation_v5_requests SET billing_retry_at=now()-interval '1 second' WHERE id=$1", [id]);
    await pg.exec("SELECT postspark.generation_reconcile()");
    const row = (await pg.query<{ status: string; billing_attempts: number; billing_retry_at: string }>("SELECT status,billing_attempts,billing_retry_at FROM postspark.generation_v5_requests WHERE id=$1", [id])).rows[0];
    expect(row.status).toBe("failed");
    expect(row.billing_attempts).toBe(1);
    expect(new Date(row.billing_retry_at).getTime()).toBeGreaterThan(Date.now() + 20_000);
    expect((await pg.query<{ value: any }>("SELECT postspark.generation_v5_claim('worker') value")).rows[0].value).toBeNull();
  });
});
