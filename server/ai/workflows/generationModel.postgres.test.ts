import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { generationReleasePostgresFixture, releaseOwner } from "./generationReleasePostgres.fixture";
import { resolveGenerationModelConfig } from "../generationModel";
import { requestRecord } from "./generationStore";

let pg: PGlite;
const input = { ownerId: releaseOwner, inputType: "text", content: "A ideia", platform: "instagram", postMode: "static", creationMode: "ideation", idempotencyKey: "configured" };
const config = resolveGenerationModelConfig({ generationModel: "gpt", postMode: "static" });
const verificationSql = readFileSync(new URL("../../../scripts/sql/verify-generation-model-choices.sql", import.meta.url), "utf8");
let revision: number;

beforeAll(async () => {
  pg = await generationReleasePostgresFixture();
  await pg.exec(readFileSync(new URL("../../../drizzle/0044_generation_model_config.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../../../drizzle/0045_staged_catalog_local_admission.sql", import.meta.url), "utf8"));
  const before = await pg.query<{ active_choices_allowed: boolean }>(verificationSql);
  expect(before.rows).toHaveLength(2);
  expect(before.rows.every(row => !row.active_choices_allowed)).toBe(true);
  await pg.exec(readFileSync(new URL("../../../drizzle/0053_generation_model_choices.sql", import.meta.url), "utf8"));
  const catalog = await pg.query<{ revision: number }>("INSERT INTO postspark.catalog_revisions(source_revision,snapshot,summary,content_hash) VALUES(1,'{}','{}',$1) RETURNING revision", ["c".repeat(64)]);
  revision = catalog.rows[0].revision;
}, 30_000);
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  await pg.exec("DELETE FROM postspark.generation_v5_requests; DELETE FROM postspark.generation_runs; DELETE FROM postspark.next_spark_reservations;");
});

async function admit(configuration: unknown = config, hash = "a".repeat(64), mode: "configured" | "staged" = "configured", postMode: "static" | "carousel" = "static") {
  const sql = mode === "staged"
    ? "SELECT postspark.generation_admit_staged_local($1::uuid,$2::uuid,$3,$4,$5::jsonb,false,now()+interval '5 minutes','model-test',$7::bigint,$6::jsonb) AS receipt"
    : "SELECT postspark.generation_admit_configured($1::uuid,$2::uuid,$3,$4,$5::jsonb,false,now()+interval '5 minutes',$6::jsonb) AS receipt";
  const result = await pg.query<{ receipt: any }>(
    sql,
    [randomUUID(), releaseOwner, input.idempotencyKey, hash, JSON.stringify({ ...input, postMode }), configuration == null ? null : JSON.stringify(configuration), ...(mode === "staged" ? [revision] : [])],
  );
  return result.rows[0].receipt;
}

describe("generation model PostgreSQL admission", () => {
  it("verifies both exact signatures, active choices and server-only permissions after migration", async () => {
    const result = await pg.query<Record<string, unknown>>(verificationSql);
    expect(result.rows).toHaveLength(2);
    for (const row of result.rows) {
      for (const [field, value] of Object.entries(row)) if (field !== "signature") expect(value, field).toBe(true);
    }
  });

  describe.each(["configured", "staged"] as const)("%s admission", mode => {
    it.each(["gemini", "claude", "deepseek", "gpt"] as const)("pins %s and its run model without charging a retry twice", async choice => {
      const pinned = resolveGenerationModelConfig({ generationModel: choice, postMode: "static" });
      const first = await admit(pinned, undefined, mode);
      expect(first.generation_config).toEqual(pinned);
      expect(first.billing_reserved).toBe(10);
      const run = await pg.query<{ requested_model: string }>("SELECT requested_model FROM postspark.generation_runs WHERE id=$1", [first.id]);
      expect(run.rows[0].requested_model).toBe(pinned.model);
      const retry = await admit(config, undefined, mode);
      expect(retry.created).toBe(false);
      expect(retry.id).toBe(first.id);
      expect(retry.generation_config).toEqual(pinned);
      expect((await pg.query<{ count: number }>("SELECT count(*)::int AS count FROM postspark.next_spark_reservations")).rows[0].count).toBe(1);
      await expect(admit(pinned, "b".repeat(64), mode)).rejects.toThrow(/Idempotency/);
    });

    it("reserves the existing carousel price and rejects invalid choices before billing", async () => {
      await expect(admit({ ...config, choice: "unsupported" }, undefined, mode)).rejects.toThrow("Invalid generation configuration");
      expect((await pg.query<{ count: number }>("SELECT count(*)::int AS count FROM postspark.next_spark_reservations")).rows[0].count).toBe(0);
      const receipt = await admit(resolveGenerationModelConfig({ generationModel: "deepseek", postMode: "carousel" }), undefined, mode, "carousel");
      expect(receipt).toMatchObject({ billing_reserved: 40, billing_preparation: 4, billing_per_proposal: 12 });
    });

    it.each(["anon", "authenticated"])("denies direct %s execution", async role => {
      await pg.exec(`SET ROLE ${role}`);
      try { await expect(admit(config, undefined, mode)).rejects.toThrow(/permission denied/); }
      finally { await pg.exec("RESET ROLE"); }
    });
  });

  it("commits the immutable config beside original input and one billing reservation", async () => {
    const receipt = await admit();
    expect(receipt.created).toBe(true);
    expect(receipt.generation_config).toEqual(config);
    expect(receipt.input).toEqual(input);
    expect(requestRecord(receipt).generationConfig).toEqual(config);
    const rows = await pg.query<{ count: number }>("SELECT count(*)::integer AS count FROM postspark.next_spark_reservations");
    expect(rows.rows[0].count).toBe(1);

    const retry = await admit(resolveGenerationModelConfig({ generationModel: "gemini", postMode: "static" }));
    expect(retry.created).toBe(false);
    expect(retry.id).toBe(receipt.id);
    expect(retry.generation_config).toEqual(config);
    await expect(admit(config, "b".repeat(64))).rejects.toThrow(/Idempotency/);
  });

  it("admits Claude and DeepSeek configurations into PostgreSQL successfully", async () => {
    const claudeConfig = resolveGenerationModelConfig({ generationModel: "claude", postMode: "static" });
    const claudeReceipt = await admit(claudeConfig);
    expect(claudeReceipt.created).toBe(true);
    expect(claudeReceipt.generation_config.choice).toBe("claude");
    expect(claudeReceipt.generation_config.model).toBe("anthropic/claude-haiku-5.5");

    await pg.exec("DELETE FROM postspark.generation_v5_requests; DELETE FROM postspark.generation_runs; DELETE FROM postspark.next_spark_reservations;");

    const deepseekConfig = resolveGenerationModelConfig({ generationModel: "deepseek", postMode: "carousel", slideCount: 5 });
    const deepseekReceipt = await admit(deepseekConfig);
    expect(deepseekReceipt.created).toBe(true);
    expect(deepseekReceipt.generation_config.choice).toBe("deepseek");
    expect(deepseekReceipt.generation_config.model).toBe("deepseek/deepseek-v4.1-flash");
  });

  it.each(["configured", "staged"] as const)("rolls back %s admission and the billing hold if config persistence fails", async mode => {
    await pg.exec(`
      CREATE FUNCTION postspark.reject_test_config() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.generation_config IS NOT NULL THEN RAISE EXCEPTION 'test config write failure'; END IF; RETURN NEW;
      END $$;
      CREATE TRIGGER reject_test_config BEFORE UPDATE ON postspark.generation_v5_requests FOR EACH ROW EXECUTE FUNCTION postspark.reject_test_config();
    `);
    try {
      await expect(admit(config, undefined, mode)).rejects.toThrow("test config write failure");
      for (const table of ["generation_v5_requests", "generation_runs", "next_spark_reservations"]) {
        const result = await pg.query<{ count: number }>(`SELECT count(*)::integer AS count FROM postspark.${table}`);
        expect(result.rows[0].count).toBe(0);
      }
    } finally {
      await pg.exec("DROP TRIGGER reject_test_config ON postspark.generation_v5_requests; DROP FUNCTION postspark.reject_test_config();");
    }
  });

  it("preserves a staged historical null config when retrying with a new model", async () => {
    const historical = await admit(null, undefined, "staged");
    const retry = await admit(resolveGenerationModelConfig({ generationModel: "claude", postMode: "static" }), undefined, "staged");
    expect(retry.id).toBe(historical.id);
    expect(retry.created).toBe(false);
    expect(retry.generation_config).toBeNull();
  });

  it("keeps historical nullable receipts unchanged on a new-code retry", async () => {
    const historical = await pg.query<{ receipt: any }>(
      "SELECT postspark.generation_admit($1::uuid,$2::uuid,$3,$4,$5::jsonb,false,now()+interval '5 minutes') AS receipt",
      [randomUUID(), releaseOwner, input.idempotencyKey, "a".repeat(64), JSON.stringify(input)],
    );
    const retry = await admit();
    expect(retry.id).toBe(historical.rows[0].receipt.id);
    expect(retry.generation_config).toBeNull();
    expect(requestRecord(retry).generationConfig).toBeUndefined();
  });

  it("restricts the server config RPC to service_role and rejects malformed config before billing", async () => {
    await pg.exec("SET ROLE authenticated");
    try { await expect(admit()).rejects.toThrow(/permission denied/); }
    finally { await pg.exec("RESET ROLE"); }
    await expect(admit({ ...config, choice: undefined })).rejects.toThrow("Invalid generation configuration");
    const result = await pg.query<{ count: number }>("SELECT count(*)::integer AS count FROM postspark.next_spark_reservations");
    expect(result.rows[0].count).toBe(0);
  });
});
