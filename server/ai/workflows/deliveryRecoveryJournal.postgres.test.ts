import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { deliveryRecoveryKey } from "@shared/generationPlan";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { proposalDeliverySchema } from "@shared/generationContracts";
import { createGenerationStore, type RequestRecord } from "./generationStore";
import { durableOperations } from "./generationRuntime";
import { generationReleasePostgresFixture, releaseOwner } from "./generationReleasePostgres.fixture";

let pg: PGlite;
const id = randomUUID(), lease = randomUUID(), proposal = `p-${id}-1`;
const input = orchestratedGenerationInputSchema.parse({ ownerId: releaseOwner, inputType: "text", content: "Fixture local", platform: "instagram", idempotencyKey: id });
const record: RequestRecord = { id, ownerId: releaseOwner, input, inputHash: "a".repeat(64), status: "running", experimental: true,
  deadlineAt: Date.now() + 600_000, proposals: [0, 1, 2].map(slot => proposalDeliverySchema.parse({
    proposalId: `p-${id}-${slot}`, runId: id, slot, status: "planned", revision: 1,
  })), billingMode: "unlimited" };
beforeAll(async () => {
  // Includes migration0043's real :candidate$ guard, not a permissive RPC mock.
  pg = await generationReleasePostgresFixture();
  await pg.query(`INSERT INTO postspark.generation_runs(id,user_uuid,status,input_type,input_content,platform,post_mode,creation_mode,requested_model)
    VALUES($1,$2,'running','text','Fixture local','instagram','static','ideation','test')`, [id, releaseOwner]);
  await pg.query(`INSERT INTO postspark.generation_v5_requests(id,owner_id,idempotency_key,input_hash,input,status,experimental,deadline_at,lease_token,lease_until,billing_mode,proposals)
    VALUES($1::uuid,$2::uuid,$1::text,$3,$4::jsonb,'running',true,now()+interval '10 minutes',$5::uuid,now()+interval '10 minutes','unlimited',$6::jsonb)`,
    [id, releaseOwner, record.inputHash, JSON.stringify(input), lease, JSON.stringify(record.proposals)]);
}, 30_000);
afterAll(async () => { await pg?.close(); });
const store = createGenerationStore({ rpc: async (name, args = {}) => {
  expect(name).toBe("generation_v5_operation");
  await pg.exec("SET ROLE service_role");
  try {
    const result = await pg.query<{ value: unknown }>("SELECT postspark.generation_v5_operation($1,$2,$3,$4,$5::jsonb) value",
      [args.p_id, args.p_lease_token, args.p_operation_key, args.p_action, JSON.stringify(args.p_result)]);
    return { data: result.rows[0].value, error: null };
  } catch (error) { return { data: null, error: error as Error & { code: string } }; }
  finally { await pg.exec("RESET ROLE"); }
} });
const operation = () => durableOperations(store, record, lease, new AbortController().signal, `${proposal}:`, true);
describe("delivery recovery through durable runtime → real store → PostgreSQL RPC", () => {
  it("reproduces the rejected old fb2 key before running local work or creating a journal row", async () => {
    const work = vi.fn(async () => ({ local: true }));
    await expect(operation()("delivery_recovery:candidate:2", work)).rejects.toMatchObject({ code: "22023" });
    expect(work).not.toHaveBeenCalled();
    expect((await pg.query("SELECT * FROM postspark.generation_v5_operations WHERE operation_key=$1", [`${proposal}:delivery_recovery:candidate:2`])).rows).toHaveLength(0);
  });
  it.each([2, 3])("persists and replays attempt%s immutably across a new runtime adapter", async attempt => {
    const key = deliveryRecoveryKey(attempt), value = { mode: "write_for_design", localPreflightVersion: 1, attempt };
    const work = vi.fn(async () => value);
    expect(await operation()(key, work)).toEqual(value);
    expect(await operation()(key, work)).toEqual(value);
    expect(work).toHaveBeenCalledTimes(1);
    await expect(store.persistOperationResult(id, lease, `${proposal}:${key}`, { changed: true })).rejects.toMatchObject({ code: "23505" });
  });
  it("keeps paid-copy replay prohibited and lease fencing intact", async () => {
    await expect(store.beginOperation(id, lease, `${proposal}-fb2:copy`, true)).rejects.toMatchObject({ code: "22023" });
    await expect(store.beginOperation(id, randomUUID(), `${proposal}:${deliveryRecoveryKey(2)}`, true)).rejects.toThrow(/lease/i);
    expect((await pg.query("SELECT operation_key FROM postspark.generation_v5_operations ORDER BY operation_key")).rows)
      .toEqual([2, 3].map(attempt => ({ operation_key: `${proposal}:${deliveryRecoveryKey(attempt)}` })));
  });
});
