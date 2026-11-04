import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { arsenalHash } from "@shared/arsenalContent";
import { preparationReceipt } from "@shared/generationPreparationReceipt";
import { ENV } from "../../_core/env";
import { resolveGenerationModelConfig } from "../generationModel";
import { generationReleasePostgresFixture, releaseOwner, releaseOther as releaseOtherOwner } from "./generationReleasePostgres.fixture";

let pg: PGlite;
const oldStrategy = ENV.generationStrategyVersion;
ENV.generationStrategyVersion = 2;
const { editorialIntentVersion: _editorialVersion, configurationHash: _currentHash, ...historicalConfig } = resolveGenerationModelConfig({ generationModel: "gpt", postMode: "carousel", slideCount: 7 });
const config = { ...historicalConfig, configurationHash: createHash("sha256").update(JSON.stringify(historicalConfig)).digest("hex") };
ENV.generationStrategyVersion = oldStrategy;
const expectation = { kind: "generation_preparation_v1" as const, configurationHash: config.configurationHash,
  model: config.model, messagesHash: arsenalHash([{ role: "user", content: "frozen" }]),
  responseFormatHash: "b".repeat(64), requestHash: "c".repeat(64) };
const receipt = preparationReceipt({ id: "provider-known-id", model: config.model,
  choices: [{ message: { role: "assistant", content: '{"version":1,"slots":[]}' } }] }, expectation);
async function scalar(sql: string, args: unknown[] = []) {
  const r = await pg.query<{ value: any }>(sql, args); return r.rows[0]?.value;
}
async function admit(id = randomUUID(), owner = releaseOwner) {
  const input = { ownerId: owner, inputType: "text", content: "Um carrossel", platform: "instagram", postMode: "carousel", creationMode: "execution", slideCount: 7, idempotencyKey: id };
  return scalar("SELECT postspark.generation_admit_configured($1::uuid,$2::uuid,$3,$4,$5::jsonb,false,now()+interval '10 minutes',$6::jsonb) AS value",
    [id, owner, id, "a".repeat(64), JSON.stringify(input), JSON.stringify(config)]);
}
async function pending() {
  const request = await admit(), lease = await scalar("SELECT postspark.generation_v5_claim('prep-test') AS value");
  await scalar("SELECT postspark.generation_v5_operation($1::uuid,$2::uuid,'prepare:selection','begin',NULL) AS value", [request.id, lease.lease_token]);
  await pg.query("SELECT postspark.generation_preparation_expectation($1::uuid,$2::uuid,'prepare:selection',$3::jsonb)", [request.id, lease.lease_token, JSON.stringify(expectation)]);
  await scalar("SELECT postspark.generation_v5_operation($1::uuid,$2::uuid,'prepare:selection','uncertain',NULL) AS value", [request.id, lease.lease_token]);
  for (const p of request.proposals) {
    const delivery = { ...p, status: "awaiting_reconciliation", failure: { code: "preparation_reconciliation_required", stage: "selection", retryable: false }, errorReason: "preparation_reconciliation_required" };
    await scalar("SELECT postspark.generation_v5_lease_update($1::uuid,$2::uuid,'checkpoint',$3::jsonb) AS value", [request.id, lease.lease_token, JSON.stringify({ delivery, projection: null })]);
  }
  const record = await scalar("SELECT postspark.generation_v5_finish($1::uuid,$2::uuid,'awaiting_reconciliation','provider_timeout') AS value", [request.id, lease.lease_token]);
  return { record, lease };
}
const recover = (id: string, owner = releaseOwner, result: unknown = receipt, expected: unknown = expectation) => scalar(
  "SELECT postspark.generation_recover_preparation($1::uuid,$2::uuid,'prepare:selection',$3::jsonb,$4::jsonb) AS value", [id, owner, JSON.stringify(expected), JSON.stringify(result)]);

beforeAll(async () => {
  pg = await generationReleasePostgresFixture();
  for (const file of ["0044_generation_model_config.sql", "0052_generation_preparation_reconciliation.sql"])
    await pg.exec(readFileSync(new URL(`../../../drizzle/${file}`, import.meta.url), "utf8"));
}, 30_000);
afterAll(async () => { await pg?.close(); });
beforeEach(async () => { await pg.exec("DELETE FROM postspark.generation_v5_requests; DELETE FROM postspark.generation_runs; DELETE FROM postspark.next_spark_reservations; DELETE FROM postspark.spark_transactions;"); });

describe("durable preparation reconciliation in PostgreSQL", () => {
  it("keeps uncertainty active, resumes from the receipt with the same reservation/config, and never changes a known result", async () => {
    const { record } = await pending();
    expect(record.status).toBe("awaiting_reconciliation"); expect(record.billing_settled_at).toBeNull();
    const telemetry = await scalar("SELECT jsonb_build_object('status',status,'model',requested_model,'error',error_message) AS value FROM postspark.generation_runs WHERE id=$1", [record.id]);
    expect(telemetry).toEqual({ status: "awaiting_reconciliation", model: config.model, error: "provider_timeout" });
    const resumed = await recover(record.id);
    expect(resumed.status).toBe("queued"); expect(resumed.generation_config).toEqual(config);
    expect(resumed.proposals.every((p: any) => p.status === "planned")).toBe(true);
    expect(resumed.billing_reservation_id).toBe(record.billing_reservation_id);
    expect((await pg.query("SELECT * FROM postspark.next_spark_reservations")).rows).toHaveLength(1);
    expect((await recover(record.id)).status).toBe("queued");
    await expect(recover(record.id, releaseOwner, { ...receipt, id: "replacement" })).rejects.toThrow(/Immutable result/);
    const lease = await scalar("SELECT postspark.generation_v5_claim('resumed-prep') AS value");
    const op = await scalar("SELECT postspark.generation_v5_operation($1::uuid,$2::uuid,'prepare:selection','begin',NULL) AS value", [record.id, lease.lease_token]);
    expect(op.state).toBe("completed"); expect(op.result.id).toBe(receipt.id);
  });

  it("rejects a different owner, model, expectation, lease, and terminal/deadline reset", async () => {
    const { record, lease } = await pending();
    await expect(recover(record.id, releaseOtherOwner)).rejects.toThrow(/not awaiting/);
    await expect(recover(record.id, releaseOwner, { ...receipt, model: "wrong" })).rejects.toThrow(/identity mismatch/);
    await expect(recover(record.id, releaseOwner, receipt, { ...expectation, requestHash: "d".repeat(64) })).rejects.toThrow();
    await expect(pg.query("SELECT postspark.generation_preparation_expectation($1::uuid,$2::uuid,'prepare:selection',$3::jsonb)", [record.id, lease.lease_token, JSON.stringify(expectation)])).rejects.toThrow(/lease lost/);
    await pg.query("UPDATE postspark.generation_v5_requests SET deadline_at=now()-interval '1 second' WHERE id=$1", [record.id]);
    await expect(recover(record.id)).rejects.toThrow(/not awaiting/);
    await pg.query("UPDATE postspark.generation_v5_requests SET status='failed',deadline_at=now()+interval '5 minutes' WHERE id=$1", [record.id]);
    await expect(recover(record.id)).rejects.toThrow(/not awaiting/);
  });

  it("does not expose preparation writes to authenticated or anonymous roles", async () => {
    const { record } = await pending();
    expect(await scalar("SELECT postspark.generation_preparation_available() AS value")).toBe(true);
    for (const role of ["anon", "authenticated"]) {
      await pg.exec(`SET ROLE ${role}`);
      try { await expect(recover(record.id)).rejects.toThrow(/permission denied/); }
      finally { await pg.exec("RESET ROLE"); }
    }
  });
});
