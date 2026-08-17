/**
 * SPEC-004 — `verify:runtime`: verificador read-only do ambiente.
 *
 * Valida configuração (sem imprimir secrets), valida sintaticamente as
 * migrations locais com o parser real do Postgres (libpg_query/WASM),
 * sonda o Supabase configurado (read-only: selects com limit 0 e chamadas
 * RPC com argumentos sentinela sem efeito colateral) e grava um relatório
 * JSON com timestamp, identificador mascarado do projeto e hashes.
 *
 * Exit codes:
 * - 0: tudo presente (ou apenas requisitos não-críticos ausentes)
 * - 1: requisito crítico ausente/incompatível OU migration aplicável inválida
 * - 2: configuração inválida
 *
 * Modos:
 * - `npm run verify:runtime`            → relatório completo + exit code
 * - `npm run verify:runtime -- --health` → apenas resumo (usado pelo health)
 */

import pgParser from "@pgsql/parser";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { ENV } from "./_core/env";
import { RUNTIME_MANIFEST, manifestHash, type RuntimeRequirement } from "./runtimeManifest";

// Interop do pacote WASM: no vitest o default é o namespace (com `.Parser`);
// no tsx (ESM) o default é a própria classe. Resolve os dois casos.
interface PostgresParser {
  parse(sql: string): Promise<unknown>;
}
const parserModule = pgParser as unknown as { Parser?: new () => PostgresParser };
const Parser: new () => PostgresParser =
  parserModule.Parser ?? (pgParser as unknown as new () => PostgresParser);

export type ProbeStatus = "present" | "absent" | "incompatible" | "not_verifiable";

export interface ProbeResult {
  requirement: string;
  kind: RuntimeRequirement["kind"];
  critical: boolean;
  status: ProbeStatus;
  detail?: string;
}

export interface MigrationValidation {
  file: string;
  status: "valid" | "invalid" | "invalid_historical" | "skipped";
  error?: string;
}

export interface VerifyReport {
  command: "verify:runtime";
  version: number;
  timestamp: string;
  environment: {
    projectRef: string;
    nodeEnv: string;
    billingConfigured: boolean;
  };
  hashes: {
    manifest: string;
    migrations: Array<{ file: string; sha256: string }>;
  };
  local: {
    migrations: MigrationValidation[];
  };
  remote: {
    mode: "probed" | "not_configured";
    results: ProbeResult[];
    buckets?: string[];
    note?: string;
  };
  summary: {
    criticalMissing: number;
    requiredMissing: number;
    invalidApplicableMigrations: number;
    ok: boolean;
  };
}

const DRIZZLE_DIR = path.resolve(process.cwd(), "drizzle");
const REPORT_DIR = path.resolve(process.cwd(), "verify-output");

// 0012 nunca foi aplicada em nenhum ambiente verificado (histórico remoto não
// a contém e seu SQL tem erro de sintaxe): é classificada como artefato
// histórico inválido, não como migration aplicável.
const HISTORICAL_INVALID_MIGRATIONS = new Set(["0012_add_generation_events.sql"]);

const MIGRATION_GLOB = /^\d{4}_.+\.sql$/;

function maskProjectRef(url: string): string {
  try {
    const host = new URL(url).hostname;
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return match ? `${match[1].slice(0, 4)}…${match[1].slice(-4)}` : "unknown";
  } catch {
    return "invalid_url";
  }
}

export function listMigrationFiles(): string[] {
  if (!fs.existsSync(DRIZZLE_DIR)) return [];
  return fs
    .readdirSync(DRIZZLE_DIR)
    .filter((file) => MIGRATION_GLOB.test(file))
    .sort();
}

export async function validateMigrations(): Promise<MigrationValidation[]> {
  const files = listMigrationFiles();
  const parser = new Parser();
  const results: MigrationValidation[] = [];

  for (const file of files) {
    // Tolerância a BOM: alguns arquivos foram gravados com BOM UTF-8, que o
    // parser real do Postgres rejeita como caractere inválido.
    const sql = fs
      .readFileSync(path.join(DRIZZLE_DIR, file), "utf8")
      .replace(/^\uFEFF/, "");
    try {
      await parser.parse(sql);
      results.push({ file, status: "valid" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (HISTORICAL_INVALID_MIGRATIONS.has(file)) {
        results.push({ file, status: "invalid_historical", error: message });
      } else {
        results.push({ file, status: "invalid", error: message });
      }
    }
  }

  return results;
}

// ─── Sondas remotos (read-only) ──────────────────────────────────────────────

const SENTINEL_UUID = "00000000-0000-0000-0000-000000000000";

const RPC_PROBE_ARGS: Record<string, Record<string, unknown>> = {
  reserve_sparks: {
    p_user_id: SENTINEL_UUID,
    p_amount: 0,
    p_idempotency_key: "__verify_sentinel__",
    p_description: "__verify_sentinel__",
  },
  commit_spark_reservation: { p_reservation_id: SENTINEL_UUID, p_generation_run_id: "__verify_sentinel__" },
  refund_spark_reservation: { p_reservation_id: SENTINEL_UUID, p_error_detail: "__verify_sentinel__" },
  debit_sparks: {
    p_user_id: SENTINEL_UUID,
    p_amount: 0,
    p_description: "__verify_sentinel__",
    p_generation_id: SENTINEL_UUID,
    p_metadata: {},
  },
  process_topup: {
    p_user_id: SENTINEL_UUID,
    p_package_id: "__verify_sentinel__",
    p_stripe_payment_intent_id: "__verify_sentinel__",
  },
  start_trial: {
    p_user_id: SENTINEL_UUID,
    p_email: "verify@sentinel.invalid",
    p_ip_address: "0.0.0.0",
    p_plan: "PRO",
  },
  get_billing_profile: { p_user_id: SENTINEL_UUID },
  has_manylabs_app_access: { p_user_id: SENTINEL_UUID },
  // ensure_manylabs_app_access NÃO é sondado: a função auto-ativa acesso
  // (cria registros) — auditoria read-only não a invoca. Presença é
  // verificada por information_schema (auditoria externa, ver SPEC-004).
};

export function isFunctionNotFound(error: { message?: string } | null): boolean {
  return Boolean(
    error &&
      (/Could not find the function/i.test(error.message ?? "") ||
        /function .* does not exist/i.test(error.message ?? "")),
  );
}

export function isTableNotFound(error: { message?: string; code?: string } | null): boolean {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        /could not find the table/i.test(error.message ?? "") ||
        /relation .* does not exist/i.test(error.message ?? "")),
  );
}

export function isColumnNotFound(error: { message?: string; code?: string } | null): boolean {
  return Boolean(
    error &&
      (error.code === "42703" || /column .* does not exist/i.test(error.message ?? "")),
  );
}

async function probeTable(client: SupabaseClient<any, any>, requirement: RuntimeRequirement): Promise<ProbeResult> {
  const label = `${requirement.schema}.${requirement.name}`;
  try {
    const { error } = await client.from(requirement.name).select("*").limit(0);
    if (isTableNotFound(error)) {
      return { requirement: label, kind: requirement.kind, critical: requirement.critical, status: "absent", detail: error?.message };
    }
    if (error) {
      return { requirement: label, kind: requirement.kind, critical: requirement.critical, status: "incompatible", detail: error.message };
    }
    return { requirement: label, kind: requirement.kind, critical: requirement.critical, status: "present" };
  } catch (error) {
    return { requirement: label, kind: requirement.kind, critical: requirement.critical, status: "not_verifiable", detail: error instanceof Error ? error.message : String(error) };
  }
}

async function probeColumn(client: SupabaseClient<any, any>, requirement: RuntimeRequirement): Promise<ProbeResult> {
  const label = `${requirement.schema}.${requirement.table}.${requirement.name}`;
  try {
    const { error } = await client.from(requirement.table!).select(requirement.name).limit(1);
    if (isColumnNotFound(error)) {
      return { requirement: label, kind: requirement.kind, critical: requirement.critical, status: "absent", detail: error?.message };
    }
    if (isTableNotFound(error)) {
      return { requirement: label, kind: requirement.kind, critical: requirement.critical, status: "absent", detail: `tabela ausente (${error?.message})` };
    }
    if (error) {
      return { requirement: label, kind: requirement.kind, critical: requirement.critical, status: "incompatible", detail: error.message };
    }
    return { requirement: label, kind: requirement.kind, critical: requirement.critical, status: "present" };
  } catch (error) {
    return { requirement: label, kind: requirement.kind, critical: requirement.critical, status: "not_verifiable", detail: error instanceof Error ? error.message : String(error) };
  }
}

async function probeRpc(client: SupabaseClient<any, any>, requirement: RuntimeRequirement): Promise<ProbeResult> {
  if (requirement.name === "ensure_manylabs_app_access") {
    return {
      requirement: requirement.name,
      kind: requirement.kind,
      critical: requirement.critical,
      status: "not_verifiable",
      detail: "função auto-ativa acesso (write) — auditoria read-only não a sonda; presença verificada por information_schema na auditoria externa",
    };
  }
  const args = RPC_PROBE_ARGS[requirement.name] ?? {};
  try {
    const { error } = await client.rpc(requirement.name, args);
    if (isFunctionNotFound(error)) {
      return { requirement: requirement.name, kind: requirement.kind, critical: requirement.critical, status: "absent", detail: error?.message };
    }
    if (error) {
      // Função existe (o erro é de validação de argumentos/perfil sentinela).
      return { requirement: requirement.name, kind: requirement.kind, critical: requirement.critical, status: "present", detail: `probe com sentinela sem efeito (${error.code ?? "erro"}); função respondeu` };
    }
    return { requirement: requirement.name, kind: requirement.kind, critical: requirement.critical, status: "present", detail: "sentinela aceito; função presente" };
  } catch (error) {
    return { requirement: requirement.name, kind: requirement.kind, critical: requirement.critical, status: "not_verifiable", detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function probeRemote(): Promise<VerifyReport["remote"]> {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
    return { mode: "not_configured", results: [] };
  }

  const client = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
    auth: { persistSession: false },
    db: { schema: "postspark" },
  });

  const results: ProbeResult[] = [];
  for (const requirement of RUNTIME_MANIFEST.requirements) {
    if (requirement.kind === "table") results.push(await probeTable(client, requirement));
    else if (requirement.kind === "column") results.push(await probeColumn(client, requirement));
    else if (requirement.kind === "rpc") results.push(await probeRpc(client, requirement));
  }

  let buckets: string[] = [];
  try {
    const { data } = await client.storage.listBuckets();
    buckets = (data ?? []).map((bucket) => bucket.name);
  } catch {
    buckets = [];
  }

  return { mode: "probed", results, buckets };
}

// ─── Relatório ───────────────────────────────────────────────────────────────

export async function runVerification(): Promise<VerifyReport> {
  const migrations = await validateMigrations();
  const remote = await probeRemote();

  const criticalMissing = remote.results.filter(
    (result) => result.critical && (result.status === "absent" || result.status === "incompatible"),
  ).length;
  const requiredMissing = remote.results.filter(
    (result) => !result.critical && (result.status === "absent" || result.status === "incompatible"),
  ).length;
  const invalidApplicableMigrations = migrations.filter(
    (migration) => migration.status === "invalid",
  ).length;

  const migrationHashes = migrations.map((migration) => ({
    file: migration.file,
    sha256: createHash("sha256")
      .update(fs.readFileSync(path.join(DRIZZLE_DIR, migration.file), "utf8"))
      .digest("hex"),
  }));

  const report: VerifyReport = {
    command: "verify:runtime",
    version: 1,
    timestamp: new Date().toISOString(),
    environment: {
      projectRef: maskProjectRef(ENV.supabaseUrl || ""),
      nodeEnv: ENV.isProduction ? "production" : "development",
      billingConfigured: Boolean(ENV.supabaseUrl && ENV.supabaseServiceRoleKey),
    },
    hashes: {
      manifest: manifestHash(),
      migrations: migrationHashes,
    },
    local: { migrations },
    remote,
    summary: {
      criticalMissing,
      requiredMissing,
      invalidApplicableMigrations,
      ok: criticalMissing === 0 && invalidApplicableMigrations === 0,
    },
  };

  return report;
}

function printSummary(report: VerifyReport): void {
  console.log(`\n── VERIFY:RUNTIME · ${report.environment.projectRef} · ${report.timestamp} ──`);
  console.log(`manifesto:    ${report.hashes.manifest}`);
  console.log(`migrations:   ${report.local.migrations.length} arquivos (${report.local.migrations.filter((m) => m.status === "valid").length} válidos, ${report.local.migrations.filter((m) => m.status === "invalid_historical").length} históricos inválidos documentados, ${report.local.migrations.filter((m) => m.status === "invalid").length} inválidos)`);
  if (report.remote.mode === "not_configured") {
    console.log("remoto:       SUPABASE_URL/SERVICE_ROLE_KEY ausentes — modo não configurado");
  } else {
    console.log(`remoto:       ${report.remote.results.length} sondas (${report.remote.results.filter((r) => r.status === "present").length} presentes, ${report.remote.results.filter((r) => r.status === "absent").length} ausentes, ${report.remote.results.filter((r) => r.status === "incompatible").length} incompatíveis, ${report.remote.results.filter((r) => r.status === "not_verifiable").length} não verificáveis)`);
    if (report.remote.buckets?.length) {
      console.log(`buckets:      ${report.remote.buckets.join(", ")}`);
    }
  }
  console.log(`resumo:       ${report.summary.criticalMissing} críticos ausentes/incompatíveis, ${report.summary.requiredMissing} não-críticos, ${report.summary.invalidApplicableMigrations} migrations inválidas aplicáveis`);
  console.log(report.summary.ok ? "✅ OK" : "❌ FALHOU (requisito crítico ausente ou migration inválida)");

  const critical = report.remote.results.filter(
    (result) => result.critical && (result.status === "absent" || result.status === "incompatible"),
  );
  if (critical.length > 0) {
    console.log("\nAUSENTES/INCOMPATÍVEIS CRÍTICOS:");
    for (const result of critical) {
      console.log(`  - ${result.requirement} (${result.status})`);
      if (result.detail) console.log(`      ${result.detail}`);
    }
  }
}

async function main(): Promise<number> {
  const healthMode = process.argv.includes("--health");
  const report = await runVerification();

  if (!healthMode) {
    printSummary(report);

    if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
    const outFile = path.join(REPORT_DIR, `verify-runtime-${report.timestamp.replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");
    console.log(`\nrelatório:    ${outFile}`);
  } else {
    console.log(JSON.stringify({ ok: report.summary.ok, criticalMissing: report.summary.criticalMissing, requiredMissing: report.summary.requiredMissing }));
  }

  if (report.environment.projectRef === "invalid_url" || report.environment.projectRef === "unknown") {
    return 2;
  }
  return report.summary.ok ? 0 : 1;
}

const isMainModule =
  typeof process !== "undefined" &&
  (process.argv[1]?.endsWith("verifyRuntime.ts") ?? false);

if (isMainModule) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error("verify:runtime failed:", error instanceof Error ? error.message : error);
      process.exitCode = 2;
    });
}
