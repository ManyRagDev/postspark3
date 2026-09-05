/**
 * SPEC-004 — Manifesto de requisitos de runtime.
 *
 * Derivado do inventário dos consumidores ativos: `server/db.ts`,
 * `server/billing.ts`, `server/_core/analytics.ts`, `server/_core/gdpr.ts`,
 * `server/routers.ts` e autenticação bridge. O verificador
 * `verify:runtime` compara este manifesto contra o Supabase configurado.
 *
 * Regras de classificação:
 * - `critical: true`  → ausência/incompatibilidade faz o verificador
 *   retornar exit code != 0 (falha cedo e diagnosticável).
 * - `critical: false` → requisito presente no código, mas com degradação
 *   graciosa registrada; é reportado sem derrubar o verificador.
 * - Buckets: o runtime usa o proxy Forge (`server/storage.ts`), não o
 *   storage do Supabase; o manifesto registra zero buckets exigidos.
 */

import { createHash } from "node:crypto";

export type RequirementKind = "table" | "column" | "rpc" | "bucket";

export interface RuntimeRequirement {
  kind: RequirementKind;
  schema: string;
  table?: string;
  name: string;
  critical: boolean;
  consumers: string[];
  note?: string;
}

export interface RuntimeManifest {
  version: number;
  requirements: RuntimeRequirement[];
}

export const RUNTIME_MANIFEST: RuntimeManifest = {
  version: 1,
  requirements: [
    // ── Tabelas ──────────────────────────────────────────────────────────────
    { kind: "table", schema: "postspark", name: "profiles", critical: true, consumers: ["billing.ts:100,316,329"] },
    { kind: "table", schema: "postspark", name: "posts", critical: true, consumers: ["db.ts:622,638,687,704"] },
    { kind: "table", schema: "postspark", name: "background_assets", critical: false, consumers: ["db.ts:721,743"] },
    { kind: "table", schema: "postspark", name: "site_intelligence", critical: false, consumers: ["db.ts:762,781,803"], note: "ausência degrada fluxo URL com warn (analyzeSiteIntelligence)" },
    { kind: "table", schema: "postspark", name: "generation_runs", critical: true, consumers: ["db.ts:866,899,974,1084,1109"] },
    { kind: "table", schema: "postspark", name: "content_fingerprints", critical: false, consumers: ["db.ts:948"], note: "ausência degrada persistência de fingerprints com warn" },
    { kind: "table", schema: "postspark", name: "brand_kits", critical: false, consumers: ["db.ts:914"], note: "ausência degrada contexto de execução" },
    { kind: "table", schema: "postspark", name: "personas", critical: false, consumers: ["db.ts:931"], note: "ausência degrada contexto de execução" },
    { kind: "table", schema: "postspark", name: "subscriptions", critical: true, consumers: ["billing.ts:459,488,502"] },
    { kind: "table", schema: "postspark", name: "topup_packages", critical: true, consumers: ["billing.ts:290"] },
    { kind: "table", schema: "postspark", name: "topup_purchases", critical: false, consumers: ["billing.ts:435 (process_topup)"] },
    { kind: "table", schema: "postspark", name: "spark_reservations", critical: true, consumers: ["drizzle/0014_spark_reservations.sql", "billing.ts:206,236,267"] },
    { kind: "table", schema: "postspark", name: "spark_transactions", critical: false, consumers: ["billing.ts:133 (debit_sparks legado)"], note: "usada pela RPC debit_sparks legada" },
    { kind: "table", schema: "postspark", name: "trials", critical: false, consumers: ["routers.ts:243 (start_trial)"] },
    { kind: "table", schema: "postspark", name: "founders", critical: false, consumers: ["billing.ts (RPCs de founder)"] },
    { kind: "table", schema: "postspark", name: "plan_save_limits", critical: false, consumers: ["routers.ts (limite de posts salvos)"] },
    { kind: "table", schema: "postspark", name: "users", critical: false, consumers: ["_core/gdpr.ts:50,115,191,250,309,394"] },
    { kind: "table", schema: "postspark", name: "analytics_pageviews", critical: false, consumers: ["_core/analytics.ts:48"], note: "ausência degrada com console.log" },
    { kind: "table", schema: "postspark", name: "analytics_events", critical: false, consumers: ["_core/analytics.ts:88"], note: "ausência degrada com console.log" },
    { kind: "table", schema: "postspark", name: "privacy_logs", critical: false, consumers: ["_core/privacyLog.ts:46,120"], note: "ausência degrada com warn" },

    // ── Colunas críticas ─────────────────────────────────────────────────────
    { kind: "column", schema: "postspark", table: "posts", name: "user_uuid", critical: true, consumers: ["db.ts:594"] },
    { kind: "column", schema: "postspark", table: "posts", name: "variation_snapshot", critical: true, consumers: ["db.ts:618"], note: "reabertura rica de posts novos (SPEC-001/002/003)" },
    { kind: "column", schema: "postspark", table: "posts", name: "image_settings", critical: false, consumers: ["db.ts:613"] },
    { kind: "column", schema: "postspark", table: "posts", name: "layout_settings", critical: false, consumers: ["db.ts:614"] },
    { kind: "column", schema: "postspark", table: "posts", name: "bg_value", critical: false, consumers: ["db.ts:615"] },
    { kind: "column", schema: "postspark", table: "posts", name: "bg_overlay", critical: false, consumers: ["db.ts:616"] },
    { kind: "column", schema: "postspark", table: "posts", name: "copy_angle", critical: false, consumers: ["db.ts:617"] },
    { kind: "column", schema: "postspark", table: "posts", name: "canvas_model", critical: false, consumers: ["db.ts (createPost/updatePost)", "drizzle/0016_add_canvas_model_to_posts.sql"], note: "reabertura com fidelidade do editor CanvasLab (PostSpark Studio)" },
    { kind: "column", schema: "postspark", table: "generation_runs", name: "events", critical: true, consumers: ["db.ts:866", "generationTrace.ts:188"], note: "runtime persiste eventos de geração" },
    { kind: "column", schema: "postspark", table: "generation_runs", name: "events_version", critical: true, consumers: ["db.ts:849", "generationTrace.ts:188"] },
    { kind: "column", schema: "postspark", table: "profiles", name: "id", critical: true, consumers: ["billing.ts:102"] },
    { kind: "column", schema: "postspark", table: "profiles", name: "email", critical: true, consumers: ["billing.ts:102"] },
    { kind: "column", schema: "postspark", table: "profiles", name: "plan", critical: true, consumers: ["billing.ts:102,473,486"] },
    { kind: "column", schema: "postspark", table: "profiles", name: "sparks", critical: true, consumers: ["billing.ts:102", "0014 (commit_spark_reservation)"] },

    // ── RPCs ─────────────────────────────────────────────────────────────────
    { kind: "rpc", schema: "postspark", name: "reserve_sparks", critical: true, consumers: ["billing.ts:206"] },
    { kind: "rpc", schema: "postspark", name: "commit_spark_reservation", critical: true, consumers: ["billing.ts:236"] },
    { kind: "rpc", schema: "postspark", name: "refund_spark_reservation", critical: true, consumers: ["billing.ts:267"] },
    { kind: "rpc", schema: "postspark", name: "debit_sparks", critical: true, consumers: ["billing.ts:133"] },
    { kind: "rpc", schema: "postspark", name: "process_topup", critical: true, consumers: ["billing.ts:435"] },
    { kind: "rpc", schema: "postspark", name: "start_trial", critical: false, consumers: ["routers.ts:243"] },
    { kind: "rpc", schema: "postspark", name: "get_billing_profile", critical: false, consumers: ["_core/gdpr.ts:343"] },
    { kind: "rpc", schema: "postspark", name: "has_manylabs_app_access", critical: true, consumers: ["_core/manylabs.ts:29"], note: "checagem de acesso por request (auth bridge)" },
    { kind: "rpc", schema: "postspark", name: "ensure_manylabs_app_access", critical: true, consumers: ["_core/manylabs.ts:57"], note: "auto-ativação de acesso na emissão do cookie" },

    // ── Buckets ──────────────────────────────────────────────────────────────
    // Nenhum bucket do Supabase é usado pelo runtime: uploads passam pelo
    // proxy Forge (`server/storage.ts`), configurado por BUILT_IN_FORGE_*.
  ],
};

export function manifestHash(manifest: RuntimeManifest = RUNTIME_MANIFEST): string {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}
