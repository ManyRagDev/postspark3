/** Read-only deployment contract. Never starts workers, migrates or calls AI. */
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

type Check = { name: string; ok: boolean; reason?: string };
type TrialConfig = { revision: string; adminUuid: string };
type Session = {
  connect(): Promise<unknown>;
  query(sql: string, values?: string[]): Promise<{ rows: any[] }>;
  end(): Promise<unknown>;
};
type Dependencies = {
  env?: NodeJS.ProcessEnv;
  fileExists?: (file: string) => Promise<boolean>;
  readTrialConfig?: () => TrialConfig | null | Promise<TrialConfig | null>;
  session?: () => Session;
  rpc?: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: unknown }>;
};
const headQuery = "SELECT active_revision::text,source_revision::text,published_source_revision::text FROM postspark.catalog_state WHERE id=true";

/** Dependencies allow local contract tests without loading .env or opening sockets. */
export async function runMotorPreflight(options: { online: boolean; trial: boolean }, deps: Dependencies = {}) {
  const env = deps.env ?? process.env;
  const checks: Check[] = [];
  const check = (name: string, ok: boolean, reason?: string) => checks.push({ name, ok: Boolean(ok), ...(!ok && reason ? { reason } : {}) });
  const fileExists = deps.fileExists ?? (file => access(file).then(() => true, () => false));
  for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GENERATION_DATABASE_SESSION_URL", "GENERATION_WORKER_READINESS_URL", "OPENROUTER_API_KEY"])
    check(name, Boolean(env[name]), "required");
  check("external_mode", env.GENERATION_WORKER_MODE === "external" && env.GENERATION_LOCAL_DEMAND_ENABLED !== "true", "set external; disable local-demand");
  check("admission_paused", env.GENERATION_ADMISSION_PAUSED === "true", "keep admissions paused during preactivation");
  check("selection_policy", [undefined, "legacy", "capability_v1"].includes(env.POSTSPARK_SELECTION_POLICY), "unknown policy");
  for (const [name, file] of [["renderer", env.REVIEW_RENDERER_BUNDLE ?? "dist/review-renderer/renderer.js"], ["chromium", env.REVIEW_CHROMIUM_EXECUTABLE_PATH]])
    check(name!, Boolean(file) && await fileExists(file!), "explicit existing executable/bundle required");
  let trial: TrialConfig | null = null;
  if (options.trial) {
    try {
      trial = await (deps.readTrialConfig ?? (async () => (await import("../server/designCatalog/trialCatalog")).readTrialCatalogConfig()))();
      check("trial_configuration", Boolean(trial), "explicit trial revision and administrator UUID required");
    } catch {
      check("trial_configuration", false, "invalid trial revision, administrator UUID or executor mode");
    }
  }
  let onlineSummary: { postgresVersion: string; pending: any[] } | undefined;
  if (options.online && checks.every(c => c.ok)) {
    const session: Session = deps.session?.() ?? new Client({ connectionString: env.GENERATION_DATABASE_SESSION_URL, connectionTimeoutMillis: 10000, statement_timeout: 10000, lock_timeout: 3000, query_timeout: 15000, application_name: "postspark-preflight-readonly" });
    try {
      await session.connect();
      await session.query("BEGIN READ ONLY");
      const metadata = await session.query(`SELECT postspark.demand_work_schedule() AS schedule,
        current_setting('server_version') AS version,
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='postspark' AND table_name='posts' AND column_name='revision') AS post_revision,
        to_regprocedure('postspark.generation_record_telemetry(uuid,jsonb)') IS NOT NULL AS telemetry`);
      const rpc = deps.rpc ?? ((name, args) => {
        const db = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { db: { schema: "postspark" }, auth: { persistSession: false }, global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) }) } });
        return Promise.resolve(db.rpc(name, args));
      });
      const { data: rest, error } = await rpc("demand_work_schedule");
      const row = metadata.rows[0];
      check("same_database", !error && Boolean(rest?.installationId) && rest.installationId === row.schedule?.installationId, "REST/listener mismatch or missing RPC");
      check("post_revision", row.post_revision, "apply 0067 before rollout");
      check("telemetry", row.telemetry, "apply 0066 before rollout");
      if (trial) {
        const before = await session.query(headQuery);
        check("trial_inactive", before.rows.length === 1 && before.rows[0].active_revision !== trial.revision, "trial revision must be staged, not globally active");
        const result = await session.query(`SELECT
          to_regprocedure('postspark.generation_admit_trial_external(uuid,uuid,text,text,jsonb,boolean,timestamptz,bigint,jsonb)') IS NOT NULL AS trial_rpc,
          EXISTS(SELECT 1 FROM auth.users WHERE id=$2::uuid AND raw_app_meta_data->>'role'='admin') AS administrator,
          postspark.has_app_access($2::uuid) AS app_access,
          EXISTS(SELECT 1 FROM postspark.catalog_revisions WHERE revision=$1::bigint AND format_version=1) AS catalog_revision`, [trial.revision, trial.adminUuid]);
        const contract = result.rows[0];
        check("trial_rpc", contract.trial_rpc, "apply 0070 before trial; admission was not invoked");
        check("trial_administrator", contract.administrator, "configured identity must have operator-owned admin role");
        check("trial_app_access", contract.app_access, "configured administrator must have app access");
        check("trial_catalog_revision", contract.catalog_revision, "immutable trial revision missing or incompatible");
        const editorial = await rpc("editorial_catalog_head", { p_catalog_revision: trial.revision });
        check("trial_editorial", !editorial.error && /^[a-f0-9-]{36}$/i.test(editorial.data?.revision ?? "") && /^[a-f0-9]{64}$/.test(editorial.data?.hash ?? ""), "publish editorial annotations for the exact trial revision before trial");
        const after = await session.query(headQuery);
        check("catalog_head_unchanged", before.rows.length === 1 && JSON.stringify(before.rows) === JSON.stringify(after.rows), "global catalog state changed during preflight; recheck before trial");
      } else {
        const catalog = await rpc("catalog_manifest");
        check("catalog", !catalog.error && Boolean(catalog.data?.revision) && !catalog.data.dirty, "publish and verify catalog before activation");
      }
      // Aggregate only; no document, briefing, identity or provider receipt leaves the DB.
      const pending = await session.query(`SELECT status,count(*)::int AS count FROM postspark.generation_v5_requests
        WHERE status IN ('queued','running','awaiting_reconciliation') OR billing_mode='reserved' AND billing_settled_at IS NULL GROUP BY status ORDER BY status`);
      check("reconciled_requests", pending.rows.length === 0, "active work/reservations require coordinated reconciliation");
      onlineSummary = { postgresVersion: row.version, pending: pending.rows };
    } catch (error) {
      // Connection/provider messages can contain secrets. Emit only a bounded class/code.
      const code = (error as { code?: string })?.code;
      check("online_contract", false, code && /^[A-Z0-9_]{2,40}$/.test(code) ? code : "connection_or_schema_unavailable");
    } finally {
      await session.query("ROLLBACK").catch(() => {});
      await session.end().catch(() => {});
    }
  }
  return { version: 1, mode: options.online ? "read-only-online" : "configuration-only", scope: options.trial ? "trial" : "production", checks, ...(onlineSummary ? { onlineSummary } : {}), activated: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await import("dotenv/config");
  const report = await runMotorPreflight({ online: process.argv.includes("--online"), trial: process.argv.includes("--trial") });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.checks.every(c => c.ok) ? 0 : 1;
}
