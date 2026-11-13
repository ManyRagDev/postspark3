import { describe, expect, it, vi } from "vitest";
import { runMotorPreflight } from "../../scripts/motorPreflight";

const trial = { revision: "23", adminUuid: "00000000-0000-4000-8000-000000000011" };
const env = {
  SUPABASE_URL: "http://fixture.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
  GENERATION_DATABASE_SESSION_URL: "fixture-only", GENERATION_WORKER_READINESS_URL: "fixture-only",
  OPENROUTER_API_KEY: "fixture-only", GENERATION_WORKER_MODE: "external",
  GENERATION_ADMISSION_PAUSED: "true", REVIEW_CHROMIUM_EXECUTABLE_PATH: "/fixture/chromium",
};
function fixture(options: {
  contract?: Record<string, boolean>;
  editorial?: { data: unknown; error: unknown };
  active?: string | null;
  headChanged?: boolean;
  manifest?: { data: unknown; error: unknown };
  mismatch?: boolean;
} = {}) {
  let headReads = 0;
  const query = vi.fn(async (sql: string, _values?: string[]) => {
    if (sql === "BEGIN READ ONLY" || sql === "ROLLBACK") return { rows: [] };
    if (sql.includes("AS schedule")) return { rows: [{ schedule: { installationId: "fixture-project" }, version: "fixture", post_revision: true, telemetry: true }] };
    if (sql.includes("FROM postspark.catalog_state")) {
      headReads++;
      return { rows: [{ active_revision: options.headChanged && headReads > 1 ? "99" : options.active ?? null, source_revision: "24", published_source_revision: null }] };
    }
    if (sql.includes("AS trial_rpc")) return { rows: [{ trial_rpc: true, administrator: true, app_access: true, catalog_revision: true, ...options.contract }] };
    if (sql.includes("GROUP BY status")) return { rows: [] };
    throw new Error("unexpected_query");
  });
  const session = { connect: vi.fn(async () => {}), query, end: vi.fn(async () => {}) };
  const rpc = vi.fn(async (name: string, _args?: Record<string, unknown>) => {
    if (name === "demand_work_schedule") return { data: { installationId: options.mismatch ? "other-project" : "fixture-project" }, error: null };
    if (name === "editorial_catalog_head") return options.editorial ?? { data: { revision: trial.adminUuid, hash: "a".repeat(64) }, error: null };
    if (name === "catalog_manifest") return options.manifest ?? { data: { revision: null }, error: null };
    throw new Error("unexpected_rpc");
  });
  const deps = { env, fileExists: vi.fn(async () => true), readTrialConfig: vi.fn(() => trial), session: vi.fn(() => session), rpc };
  return { deps, session, rpc };
}
const failed = (report: Awaited<ReturnType<typeof runMotorPreflight>>) => report.checks.filter(c => !c.ok).map(c => c.name);

describe("motor preflight trial contract (simulated DB; no sockets or credentials)", () => {
  it("accepts an inactive pinned revision with editorial without requiring or changing a global head", async () => {
    const f = fixture();
    const report = await runMotorPreflight({ online: true, trial: true }, f.deps);
    expect(failed(report)).toEqual([]);
    expect(report).toMatchObject({ scope: "trial", mode: "read-only-online", activated: false });
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["demand_work_schedule", "editorial_catalog_head"]);
    expect(f.rpc).toHaveBeenCalledWith("editorial_catalog_head", { p_catalog_revision: "23" });
    expect(f.session.query).toHaveBeenCalledWith(expect.stringContaining("AS trial_rpc"), [trial.revision, trial.adminUuid]);
    for (const [sql] of f.session.query.mock.calls) expect(sql.trim()).toMatch(/^(SELECT|BEGIN READ ONLY|ROLLBACK)\b/);
    expect(f.session.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(f.session.end).toHaveBeenCalledOnce();
    expect(JSON.stringify(report)).not.toContain(trial.adminUuid);
  });

  it.each(["trial_rpc", "administrator", "app_access", "catalog_revision"])("rejects missing %s without invoking admission", async key => {
    const f = fixture({ contract: { [key]: false } });
    const report = await runMotorPreflight({ online: true, trial: true }, f.deps);
    const expected = { trial_rpc: "trial_rpc", administrator: "trial_administrator", app_access: "trial_app_access", catalog_revision: "trial_catalog_revision" }[key];
    expect(failed(report)).toContain(expected);
    expect(f.rpc.mock.calls.every(([name]) => !name.includes("admit"))).toBe(true);
  });

  it.each([
    { data: null, error: null },
    { data: null, error: { message: "private failure" } },
    { data: { revision: trial.adminUuid, hash: "invalid" }, error: null },
  ])("rejects missing or invalid editorial on the pinned revision", async editorial => {
    const f = fixture({ editorial });
    expect(failed(await runMotorPreflight({ online: true, trial: true }, f.deps))).toContain("trial_editorial");
  });

  it("rejects an already active trial or a concurrent global state change", async () => {
    for (const [options, check] of [[{ active: "23" }, "trial_inactive"], [{ headChanged: true }, "catalog_head_unchanged"]] as const) {
      expect(failed(await runMotorPreflight({ online: true, trial: true }, fixture(options).deps))).toContain(check);
    }
  });

  it("preserves production publication checks even when a trial config exists", async () => {
    const f = fixture();
    expect(failed(await runMotorPreflight({ online: true, trial: false }, f.deps))).toEqual(["catalog"]);
    expect(f.deps.readTrialConfig).not.toHaveBeenCalled();
    expect(f.rpc).toHaveBeenCalledWith("catalog_manifest");
    expect(f.rpc.mock.calls.some(([name]) => name === "editorial_catalog_head")).toBe(false);
    expect(failed(await runMotorPreflight({ online: true, trial: false }, fixture({ manifest: { data: { revision: "7", dirty: false }, error: null } }).deps))).toEqual([]);
    expect(failed(await runMotorPreflight({ online: true, trial: false }, fixture({ manifest: { data: { revision: "7", dirty: true }, error: null } }).deps))).toEqual(["catalog"]);
  });

  it("keeps configuration-only mode offline and fails closed for absent/invalid explicit trial config", async () => {
    const f = fixture();
    expect(failed(await runMotorPreflight({ online: false, trial: true }, f.deps))).toEqual([]);
    expect(f.deps.session).not.toHaveBeenCalled();
    expect(f.rpc).not.toHaveBeenCalled();
    for (const readTrialConfig of [() => null, () => { throw new Error("configuration_invalid"); }]) {
      expect(failed(await runMotorPreflight({ online: true, trial: true }, { ...f.deps, readTrialConfig }))).toEqual(["trial_configuration"]);
      expect(f.deps.session).not.toHaveBeenCalled();
    }
  });

  it("retains same-database validation and sanitizes failures while closing the read-only session", async () => {
    const f = fixture({ mismatch: true });
    expect(failed(await runMotorPreflight({ online: true, trial: true }, f.deps))).toContain("same_database");
    f.session.query.mockRejectedValueOnce(new Error("private connection value"));
    const report = await runMotorPreflight({ online: true, trial: true }, f.deps);
    expect(failed(report)).toContain("online_contract");
    expect(JSON.stringify(report)).not.toContain("private connection value");
    expect(f.session.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });
});
