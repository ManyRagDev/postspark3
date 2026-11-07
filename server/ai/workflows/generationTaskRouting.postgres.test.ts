import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { generationModelConfigSchema } from "@shared/generationModel";
import { preparationReceipt } from "@shared/generationPreparationReceipt";
import { resolveGenerationModelConfig } from "../generationModel";
import { generationReleasePostgresFixture, releaseOwner, releaseOther } from "./generationReleasePostgres.fixture";

let pg: PGlite;
let revision: number;
const config = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
const legacy = (() => {
  const copy: any = structuredClone(config);
  copy.taskRouting.version = 1; copy.taskRouting.policy = "deepseek_haiku_v1";
  for (const stage of ["intent", "repair"]) {
    copy.taskRouting[stage].providerEndpoint = "deepinfra/fp8";
    delete copy.taskRouting[stage].allowProviderFallbacks;
  }
  const { configurationHash: _hash, ...snapshot } = generationModelConfigSchema.parse(copy);
  return generationModelConfigSchema.parse({ ...snapshot, configurationHash: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex") });
})();

const input = { ownerId: releaseOwner, inputType: "text", content: "Uma ideia", platform: "instagram", postMode: "static", creationMode: "ideation", idempotencyKey: "auto-routing" };
const migration = (file: string) => readFileSync(new URL(`../../../drizzle/${file}`, import.meta.url), "utf8");
const taskRoutingMigration = migration("0057_generation_task_routing.sql");
const taskRoutingV2Migration = migration("0060_generation_task_routing_v2.sql");
async function scalar(sql: string, args: unknown[] = []) {
  return (await pg.query<{ value: any }>(sql, args)).rows[0]?.value;
}
async function admit(configuration: unknown = config, mode: "configured" | "staged" = "configured", hash = "a".repeat(64), scope = "task-routing") {
  const sql = mode === "staged"
    ? "SELECT postspark.generation_admit_staged_local($1::uuid,$2::uuid,$3,$4,$5::jsonb,false,now()+interval '10 minutes',$7,$8::bigint,$6::jsonb) AS value"
    : "SELECT postspark.generation_admit_configured($1::uuid,$2::uuid,$3,$4,$5::jsonb,false,now()+interval '10 minutes',$6::jsonb) AS value";
  return scalar(sql, [randomUUID(), releaseOwner, input.idempotencyKey, hash, JSON.stringify(input), configuration == null ? null : JSON.stringify(configuration), ...(mode === "staged" ? [scope, revision] : [])]);
}
const expectation = (stage: "intent" | "selection", pinned = config) => ({
  kind: "generation_preparation_v1" as const, configurationHash: pinned.configurationHash,
  model: pinned.taskRouting?.[stage === "intent" ? "intent" : "copy"].model ?? pinned.model,
  messagesHash: "b".repeat(64), responseFormatHash: "c".repeat(64), requestHash: "d".repeat(64),
});
const resultFor = (stage: "intent" | "selection", expected = expectation(stage)) => preparationReceipt({
  id: `known-${stage}`, model: expected.model, choices: [{ message: { role: "assistant", content: '{"version":1}' } }],
}, expected);
const recover = (id: string, stage: "intent" | "selection", owner = releaseOwner, result: unknown = resultFor(stage), expected: unknown = expectation(stage)) => scalar(
  "SELECT postspark.generation_recover_preparation($1::uuid,$2::uuid,$3,$4::jsonb,$5::jsonb) AS value",
  [id, owner, `prepare:${stage}`, JSON.stringify(expected), JSON.stringify(result)],
);
async function pending(pinned = config) {
  const request = await admit(pinned);
  const lease = await scalar("SELECT postspark.generation_v5_claim('routing-test') AS value");
  for (const stage of ["intent", "selection"] as const) {
    await scalar("SELECT postspark.generation_v5_operation($1::uuid,$2::uuid,$3,'begin',NULL) AS value", [request.id, lease.lease_token, `prepare:${stage}`]);
    await pg.query("SELECT postspark.generation_preparation_expectation($1::uuid,$2::uuid,$3,$4::jsonb)", [request.id, lease.lease_token, `prepare:${stage}`, JSON.stringify(expectation(stage, pinned))]);
    await scalar("SELECT postspark.generation_v5_operation($1::uuid,$2::uuid,$3,'uncertain',NULL) AS value", [request.id, lease.lease_token, `prepare:${stage}`]);
  }
  for (const proposal of request.proposals) {
    const delivery = { ...proposal, status: "awaiting_reconciliation", failure: { code: "preparation_reconciliation_required", stage: "intent", retryable: false } };
    await scalar("SELECT postspark.generation_v5_lease_update($1::uuid,$2::uuid,'checkpoint',$3::jsonb) AS value", [request.id, lease.lease_token, JSON.stringify({ delivery, projection: null })]);
  }
  const record = await scalar("SELECT postspark.generation_v5_finish($1::uuid,$2::uuid,'awaiting_reconciliation','provider_timeout') AS value", [request.id, lease.lease_token]);
  return { record, lease };
}

beforeAll(async () => {
  pg = await generationReleasePostgresFixture();
  for (const file of ["0044_generation_model_config.sql", "0045_staged_catalog_local_admission.sql", "0052_generation_preparation_reconciliation.sql", "0053_generation_model_choices.sql"]) await pg.exec(migration(file));
  expect(await scalar("SELECT to_regprocedure('postspark.generation_task_routing_available()') IS NULL AS value")).toBe(true);
  await pg.exec(taskRoutingMigration);
  expect(config.taskRouting?.version).toBe(2);
  expect(await scalar("SELECT postspark.generation_task_routing_valid($1::jsonb) AS value", [JSON.stringify(legacy)])).toBe(true);
  expect(await scalar("SELECT postspark.generation_task_routing_valid($1::jsonb) AS value", [JSON.stringify(config)])).toBe(false);
  expect(await scalar("SELECT to_regprocedure('postspark.generation_task_routing_available(integer)') IS NULL AS value")).toBe(true);
  await pg.exec(taskRoutingV2Migration);
  revision = await scalar("INSERT INTO postspark.catalog_revisions(source_revision,snapshot,summary,content_hash) VALUES(1,'{}','{}',$1) RETURNING revision AS value", ["e".repeat(64)]);
}, 30_000);
afterAll(async () => { await pg?.close(); });
beforeEach(async () => { await pg.exec("DELETE FROM postspark.generation_v5_requests; DELETE FROM postspark.generation_runs; DELETE FROM postspark.next_spark_reservations; DELETE FROM postspark.spark_transactions;"); });

describe("automatic task routing PostgreSQL migration", () => {
  it("reports readiness for service_role and detects older admission functions reapplied out of order", async () => {
    await pg.exec("SET ROLE service_role");
    try {
      expect(await scalar("SELECT postspark.generation_task_routing_available() AS value")).toBe(true);
      for (const version of [1,2]) expect(await scalar("SELECT postspark.generation_task_routing_available($1::integer) AS value", [version])).toBe(true);
      expect(await scalar("SELECT postspark.generation_task_routing_available(3) AS value")).toBe(false);
    }
    finally { await pg.exec("RESET ROLE"); }
    try {
      await pg.exec(migration("0053_generation_model_choices.sql"));
      expect(await scalar("SELECT postspark.generation_task_routing_available() AS value")).toBe(false);
    } finally { await pg.exec(taskRoutingMigration); await pg.exec(taskRoutingV2Migration); }
  });


  it("fails V2 readiness when the old validator is reapplied while preserving the V1 readiness API", async () => {
    try {
      await pg.exec(taskRoutingMigration);
      expect(await scalar("SELECT postspark.generation_task_routing_available() AS value")).toBe(true);
      expect(await scalar("SELECT postspark.generation_task_routing_available(1) AS value")).toBe(true);
      expect(await scalar("SELECT postspark.generation_task_routing_available(2) AS value")).toBe(false);
    } finally { await pg.exec(taskRoutingV2Migration); }
  });

  describe.each(["configured", "staged"] as const)("%s admission", mode => {
    it("pins automatic stages and replays one reservation without replacing the original receipt", async () => {
      await pg.exec("SET ROLE service_role");
      let first: any; let replay: any;
      try {
        first = await admit(config, mode);
        replay = await admit(resolveGenerationModelConfig({ generationModel: "gemini", postMode: "static" }), mode);
      } finally { await pg.exec("RESET ROLE"); }
      expect(first.generation_config).toEqual(config);
      expect(first.billing_reserved).toBe(10);
      expect(replay).toMatchObject({ id: first.id, created: false, generation_config: config, billing_reservation_id: first.billing_reservation_id });
      expect(await scalar("SELECT requested_model AS value FROM postspark.generation_runs WHERE id=$1", [first.id])).toBe(config.taskRouting!.copy.model);
      expect(await scalar("SELECT count(*)::int AS value FROM postspark.next_spark_reservations")).toBe(1);
      expect(await scalar("SELECT count(*)::int AS value FROM postspark.spark_transactions")).toBe(0);
      await expect(admit(config, mode, "f".repeat(64))).rejects.toThrow(/Idempotency/);
      if (mode === "staged") await expect(admit(config, mode, undefined, "another-scope")).rejects.toThrow(/scope_mismatch/);
    });


    it("keeps a V1 receipt and hash literal on a V2 retry with one reservation", async () => {
      const first = await admit(legacy, mode);
      const replay = await admit(config, mode);
      expect(first.generation_config).toEqual(legacy);
      expect(replay).toMatchObject({ id: first.id, created: false, generation_config: legacy, billing_reservation_id: first.billing_reservation_id });
      expect(await scalar("SELECT count(*)::int AS value FROM postspark.next_spark_reservations")).toBe(1);
      expect(await scalar("SELECT count(*)::int AS value FROM postspark.spark_transactions")).toBe(0);
    });
    it.each([
      ["V1 policy on V2", (c: any) => { c.taskRouting.policy = "deepseek_haiku_v1"; }],
      ["V1 route in V2", (c: any) => { c.taskRouting.intent.providerEndpoint = "deepinfra/fp8"; }],
      ["missing provider fallback", (c: any) => { delete c.taskRouting.repair.allowProviderFallbacks; }],
      ["disabled provider fallback", (c: any) => { c.taskRouting.intent.allowProviderFallbacks = false; }],
      ["fallback on copy route", (c: any) => { c.taskRouting.copy.allowProviderFallbacks = true; }],
      ["missing routing", (c: any) => { delete c.taskRouting; }],
      ["null routing", (c: any) => { c.taskRouting = null; }],
      ["wrong policy", (c: any) => { c.taskRouting.policy = "unknown"; }],
      ["wrong version type", (c: any) => { c.taskRouting.version = "1"; }],
      ["wrong strategy", (c: any) => { c.generationStrategyVersion = 1; }],
      ["wrong intent model", (c: any) => { c.taskRouting.intent.model = c.model; }],
      ["wrong copy projection", (c: any) => { c.model = c.taskRouting.intent.model; }],
      ["unvalidated endpoint", (c: any) => { c.taskRouting.copy.providerEndpoint = "google"; }],
      ["higher price ceiling", (c: any) => { c.taskRouting.repair.maxPrice.completion = 10; }],
      ["reasoning enabled", (c: any) => { c.taskRouting.intent.reasoningEnabled = true; }],
      ["text schema", (c: any) => { c.taskRouting.copy.structuredOutputMode = "text_schema"; }],
      ["unsupported sampling", (c: any) => { c.taskRouting.copy.temperature = 0.5; }],
      ["top-level sampling", (c: any) => { c.temperature = 0.5; }],
      ["extra routing stage", (c: any) => { c.taskRouting.selection = c.taskRouting.copy; }],
      ["string timeout", (c: any) => { c.taskRouting.intent.transportTimeoutMs = "90000"; }],
      ["fractional timeout", (c: any) => { c.taskRouting.intent.transportTimeoutMs = 0.5; }],
      ["excessive timeout", (c: any) => { c.taskRouting.intent.transportTimeoutMs = 180001; }],
      ["manual policy graft", (c: any) => { c.choice = "claude"; }],
    ])("rejects %s before creating requests or billing reservations", async (_name, mutate) => {
      const malformed = structuredClone(config); (mutate as (c: any) => void)(malformed);
      await expect(admit(malformed, mode)).rejects.toThrow(/Invalid generation configuration/);
      for (const table of ["generation_v5_requests", "generation_runs", "next_spark_reservations", "spark_transactions"]) expect(await scalar(`SELECT count(*)::int AS value FROM postspark.${table}`)).toBe(0);
      expect(await scalar("SELECT sparks AS value FROM postspark.profiles WHERE id=$1", [releaseOwner])).toBe(150);
    });

    it.each(["gemini", "claude", "deepseek", "gpt"] as const)("keeps manual %s receipts unchanged on an automatic retry", async choice => {
      const manual = resolveGenerationModelConfig({ generationModel: choice, postMode: "static" });
      const first = await admit(manual, mode); const replay = await admit(config, mode);
      expect(first.generation_config).toEqual(manual);
      expect(replay).toMatchObject({ created: false, id: first.id, generation_config: manual });
      expect(await scalar("SELECT count(*)::int AS value FROM postspark.next_spark_reservations")).toBe(1);
    });
  });

  it("recovers distinct intent/copy models with immutable receipts and no second inference reservation", async () => {
    const { record } = await pending();
    expect(expectation("intent").model).not.toBe(config.model);
    const partiallyRecovered = await recover(record.id, "intent");
    expect(partiallyRecovered.status).toBe("awaiting_reconciliation");
    expect((await recover(record.id, "intent")).status).toBe("awaiting_reconciliation");
    await expect(recover(record.id, "intent", releaseOwner, { ...resultFor("intent"), id: "replacement" })).rejects.toThrow(/Immutable result/);
    const resumed = await recover(record.id, "selection");
    expect(resumed).toMatchObject({ status: "queued", generation_config: config, billing_reservation_id: record.billing_reservation_id });
    expect(resumed.proposals.every((p: any) => p.status === "planned")).toBe(true);
    const lease = await scalar("SELECT postspark.generation_v5_claim('resume-routing') AS value");
    for (const stage of ["intent", "selection"] as const) {
      const operation = await scalar("SELECT postspark.generation_v5_operation($1::uuid,$2::uuid,$3,'begin',NULL) AS value", [record.id, lease.lease_token, `prepare:${stage}`]);
      expect(operation).toMatchObject({ state: "completed", result: { id: `known-${stage}`, model: expectation(stage).model } });
    }
    expect(await scalar("SELECT count(*)::int AS value FROM postspark.next_spark_reservations")).toBe(1);
    expect(await scalar("SELECT count(*)::int AS value FROM postspark.spark_transactions")).toBe(0);
  });

  it("rejects wrong stage models and changed expectations while the lease is active", async () => {
    const record = await admit(); const lease = await scalar("SELECT postspark.generation_v5_claim('identity-routing') AS value");
    await scalar("SELECT postspark.generation_v5_operation($1::uuid,$2::uuid,'prepare:intent','begin',NULL) AS value", [record.id, lease.lease_token]);
    const set = (expected: unknown, token = lease.lease_token) => pg.query("SELECT postspark.generation_preparation_expectation($1::uuid,$2::uuid,'prepare:intent',$3::jsonb)", [record.id, token, JSON.stringify(expected)]);
    await expect(set({ ...expectation("intent"), model: config.model })).rejects.toThrow(/expectation mismatch/);
    await expect(set(expectation("intent"), randomUUID())).rejects.toThrow(/lease lost/);
    await set(expectation("intent"));
    await expect(set({ ...expectation("intent"), requestHash: "e".repeat(64) })).rejects.toThrow(/Immutable preparation expectation/);
  });

  it("preserves ownership, deadline, terminal-state and result identity guards on recovery", async () => {
    const { record } = await pending();
    await expect(recover(record.id, "intent", releaseOther)).rejects.toThrow(/not awaiting/);
    await expect(recover(record.id, "intent", releaseOwner, { ...resultFor("intent"), model: config.model })).rejects.toThrow(/identity mismatch/);
    await expect(recover(record.id, "intent", releaseOwner, resultFor("intent"), { ...expectation("intent"), configurationHash: "e".repeat(64) })).rejects.toThrow(/identity mismatch/);
    await pg.query("UPDATE postspark.generation_v5_requests SET deadline_at=now()-interval '1 second' WHERE id=$1", [record.id]);
    await expect(recover(record.id, "intent")).rejects.toThrow(/not awaiting/);
    await pg.query("UPDATE postspark.generation_v5_requests SET deadline_at=now()+interval '5 minutes',status='failed' WHERE id=$1", [record.id]);
    await expect(recover(record.id, "intent")).rejects.toThrow(/not awaiting/);
  });

  it("still recovers historical single-model preparation receipts", async () => {
    const historical = resolveGenerationModelConfig({ generationModel: "gpt", postMode: "static" });
    const { record } = await pending(historical);
    for (const stage of ["intent", "selection"] as const) {
      const expected = expectation(stage, historical);
      const recovered = await recover(record.id, stage, releaseOwner, resultFor(stage, expected), expected);
      expect(recovered.generation_config).toEqual(historical);
    }
  });

  it.each(["configured", "staged"] as const)("preserves historical null config on %s automatic retry", async mode => {
    const historical = mode === "staged" ? await admit(null, mode) : await scalar(
      "SELECT postspark.generation_admit($1::uuid,$2::uuid,$3,$4,$5::jsonb,false,now()+interval '10 minutes') AS value",
      [randomUUID(), releaseOwner, input.idempotencyKey, "a".repeat(64), JSON.stringify(input)],
    );
    const replay = await admit(config, mode);
    expect(replay).toMatchObject({ id: historical.id, created: false, generation_config: null });
    expect(await scalar("SELECT count(*)::int AS value FROM postspark.next_spark_reservations")).toBe(1);
  });

  it.each(["anon", "authenticated"])("denies %s admission, readiness, validation and reconciliation RPCs", async role => {
    const { record, lease } = await pending();
    await pg.exec(`SET ROLE ${role}`);
    try {
      await expect(admit(config)).rejects.toThrow(/permission denied/);
      await expect(admit(config, "staged")).rejects.toThrow(/permission denied/);
      await expect(recover(record.id, "intent")).rejects.toThrow(/permission denied/);
      await expect(scalar("SELECT postspark.generation_task_routing_available() AS value")).rejects.toThrow(/permission denied/);
      await expect(scalar("SELECT postspark.generation_task_routing_available(2) AS value")).rejects.toThrow(/permission denied/);
      await expect(scalar("SELECT postspark.generation_task_routing_valid($1::jsonb) AS value", [JSON.stringify(config)])).rejects.toThrow(/permission denied/);
      await expect(pg.query("SELECT postspark.generation_preparation_expectation($1::uuid,$2::uuid,'prepare:intent',$3::jsonb)", [record.id, lease.lease_token, JSON.stringify(expectation("intent"))])).rejects.toThrow(/permission denied/);
    } finally { await pg.exec("RESET ROLE"); }
  });
});
