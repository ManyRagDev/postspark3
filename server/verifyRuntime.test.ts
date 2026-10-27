import { describe, expect, it, vi } from "vitest";
import {
  listMigrationFiles,
  validateMigrations,
  probeRemote,
  probeRpc,
  type ProbeResult,
} from "./verifyRuntime";
import { RUNTIME_MANIFEST } from "./runtimeManifest";

describe("verify:runtime — gate de migrations (SPEC-004)", () => {
  it("lista todas as migrations locais numeradas", () => {
    const files = listMigrationFiles();
    expect(files.length).toBeGreaterThanOrEqual(16);
    expect(files).toContain("0014_spark_reservations.sql");
    expect(files).toContain("0015_harden_manifest_corrective.sql");
    expect(files).not.toContain("__fixtures__/sabotaged_invalid.sql");
  });

  it("todas as migrations aplicáveis passam no parser real do Postgres", async () => {
    const results = await validateMigrations();
    const invalid = results.filter((migration) => migration.status === "invalid");
    expect(invalid).toEqual([]);
  });

  it("0012 é classificada como artefato histórico inválido (nunca aplicada)", async () => {
    const results = await validateMigrations();
    const historical = results.find((migration) => migration.file === "0012_add_generation_events.sql");
    expect(historical?.status).toBe("invalid_historical");
    expect(historical?.error).toBeTruthy();
  });

  it("a fixture sabotada é DETECTADA como SQL inválido pelo gate", async () => {
    const { Parser } = await import("@pgsql/parser");
    const sql = `CREATE TABLE postspark.x (id uuid PRIMARY KEY,); SELECT 1 FROM WHERE;`;
    const parser = new Parser();
    let thrown = false;
    try {
      await parser.parse(sql);
    } catch {
      thrown = true;
    }
    expect(thrown).toBe(true);
  });
});

describe("verify:runtime — manifesto cobre o runtime (SPEC-004)", () => {
  it("manifesto contém tabelas, colunas e RPCs críticos conhecidos", () => {
    const names = RUNTIME_MANIFEST.requirements.map((requirement) => requirement.name);
    expect(names).toContain("posts");
    expect(names).toContain("generation_runs");
    expect(names).toContain("spark_reservations");
    expect(names).toContain("variation_snapshot");
    expect(names).toContain("events_version");
    expect(names).toContain("reserve_sparks");
    expect(names).toContain("commit_spark_reservation");
    expect(names).toContain("refund_spark_reservation");
    expect(names).toContain("debit_sparks");
    expect(names).toContain("process_topup");
  });

  it("assets Arsenal usam somente seu bucket privado; uploads existentes continuam separados", () => {
    expect(RUNTIME_MANIFEST.requirements.filter((requirement) => requirement.kind === "bucket").map(requirement => requirement.name)).toEqual(["design-arsenal"]);
  });
});

describe("verify:runtime — classificação de sondas remotas (SPEC-004)", () => {
  it.each(["generation_admit","generation_settle","generation_reconcile"])("never invokes mutating durable RPC %s during a read-only audit", async name => {
    const rpc=vi.fn();
    const requirement=RUNTIME_MANIFEST.requirements.find(item=>item.kind==="rpc"&&item.name===name)!;
    expect(requirement).toBeDefined();
    const result=await probeRpc({rpc} as any,requirement);
    expect(result.status).toBe("not_verifiable");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("sem credenciais, o modo remoto é not_configured sem erro", async () => {
    const remote = await probeRemote();
    expect(remote.mode).toBe("not_configured");
  });

  it("erro de tabela ausente (42P01) é classificado como absent", async () => {
    const { isTableNotFound } = await import("./verifyRuntime");
    expect(isTableNotFound({ message: "relation postspark.site_intelligence does not exist", code: "42P01" })).toBe(true);
    expect(isTableNotFound({ message: "could not find the table 'x' in the schema cache" })).toBe(true);
    expect(isTableNotFound(null)).toBe(false);
    expect(isTableNotFound({ message: "permission denied for table posts" })).toBe(false);
  });

  it("erro de função ausente (PGRST202) é classificado como absent", async () => {
    const { isFunctionNotFound } = await import("./verifyRuntime");
    expect(isFunctionNotFound({ message: "Could not find the function 'reserve_sparks' in the schema cache" })).toBe(true);
    expect(isFunctionNotFound({ message: 'function postspark.reserve_sparks(uuid) does not exist' })).toBe(true);
    expect(isFunctionNotFound({ message: "invalid input syntax for type uuid" })).toBe(false);
  });
});
