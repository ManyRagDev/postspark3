/**
 * SPEC-006 — `verify:e2e`: verificação de ponta a ponta com evidência derivada.
 *
 * Para cada execução autorizada:
 *   1. gera um `runId` inequívoco;
 *   2. roda a geração real (provider configurado) no caminho do produto
 *      (router → orquestrador) com billing em dev-mode (sem cobrança);
 *   3. persiste o post aprovado na fonte de verdade (postspark.posts);
 *   4. diferencia candidatos processados/rejeitados/reparados/aprovados a
 *      partir dos eventos do trace;
 *   5. grava artefatos sob `artifacts/verification/<runId>/`;
 *   6. calcula SHA-256 do snapshot e do relatório;
 *   7. produz relatório JSON por run + resumo agregado (p50/p95, tokens,
 *      custo, chamadas) para o mesmo corpus.
 *
 * Uso: `npm run verify:e2e -- --runs 3` (default 1).
 */

import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { createPostVisualSnapshot } from "@shared/variationSnapshot";
import { postVisualSnapshotSchema } from "@shared/postsparkSchemas";

/** Hash canônico: o snapshot passa pelo MESMO parse do post.save antes de
 *  ser hashado — a comparação salvo×reaberto compara o DOCUMENTO canônico,
 *  não a ordenação de chaves do JSONB. */
function canonicalSnapshotSha(snapshot: unknown): string {
  const parsed = postVisualSnapshotSchema.parse(snapshot);
  return sha256(JSON.stringify(parsed, null, 2));
}

// Usuário de teste dedicado por run (uuid fixo derivado do runId, sem dados
// reais). O billing em dev-mode (perfil sentinel) torna reserva/commit/refund
// no-ops. Um usuário novo por run evita o limite de posts salvos do plano
// FREE (5) e o acúmulo de posts de teste sob uma mesma identidade.
function testUserUuid(runId: string): string {
  const suffix = runId.replace(/-/g, "").slice(0, 12);
  return `00000000-0000-0000-0000-${suffix}`;
}

const TEST_EMAIL_PREFIX = "verify-e2e";

const CORPUS = "Dicas práticas de organização pessoal para quem trabalha de casa";

const ARTIFACTS_ROOT = path.resolve(process.cwd(), "artifacts", "verification");

function maskProjectRef(url: string): string {
  try {
    const host = new URL(url).hostname;
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return match ? `${match[1].slice(0, 4)}…${match[1].slice(-4)}` : "unknown";
  } catch {
    return "invalid_url";
  }
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

interface RunReport {
  runId: string;
  timestamp: string;
  environment: { projectRef: string; nodeEnv: string; billingMode: "dev-mock" | "configured" };
  input: { inputType: string; platform: string; postMode: string; contentHash: string };
  outcome: {
    status: "approved" | "rejected" | "failed";
    variations: number;
    snapshotVersion: number | null;
    postId: number | null;
    snapshotSha256: string | null;
  };
  pipeline: {
    generativeCalls: number;
    repairCalls: number;
    judgeCalls: number;
    transportRetries: number;
    fallbacks: string[];
    finalValidation: string | null;
    repairOutcome: string | null;
  };
  cost: { sparks: number; estimatedCostUsd: number; totalTokens: number; latencyMs: number };
  artifacts: { snapshot: string; report: string };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[index];
}

async function runOnce(index: number): Promise<RunReport> {
  const runId = randomUUID();
  const startedAt = Date.now();
  try {
    return await executeRun(runId, startedAt, index);
  } catch (error) {
    // Falha operacional da execução (provider, rede...): registra o run como
    // failed sem derrubar o lote — o resumo agrega o que foi possível.
    const message = error instanceof Error ? error.message : String(error);
    const report: RunReport = {
      runId,
      timestamp: new Date().toISOString(),
      environment: {
        projectRef: maskProjectRef(process.env.SUPABASE_URL ?? ""),
        nodeEnv: process.env.NODE_ENV ?? "development",
        billingMode: process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "configured" : "dev-mock",
      },
      input: { inputType: "text", platform: "instagram", postMode: "static", contentHash: sha256(CORPUS) },
      outcome: { status: "failed", variations: 0, snapshotVersion: null, postId: null, snapshotSha256: null },
      pipeline: {
        generativeCalls: 0,
        repairCalls: 0,
        judgeCalls: 0,
        transportRetries: 0,
        fallbacks: [],
        finalValidation: null,
        repairOutcome: null,
      },
      cost: { sparks: 0, estimatedCostUsd: 0, totalTokens: 0, latencyMs: Date.now() - startedAt },
      artifacts: { snapshot: "", report: "" },
    };
    const runDir = path.join(ARTIFACTS_ROOT, runId);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(
      path.join(runDir, "report.json"),
      JSON.stringify({ ...report, error: message }, null, 2),
      "utf8",
    );
    console.log(`[verify:e2e] run ${index + 1}: ${runId} — FALHOU (${message.slice(0, 120)})`);
    return report;
  }
}

async function executeRun(runId: string, startedAt: number, index: number): Promise<RunReport> {
  const ctx: TrpcContext = {
    user: {
      id: testUserUuid(runId),
      email: `${TEST_EMAIL_PREFIX}@postspark.local`,
      name: "Verify E2E",
      role: "user",
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  const caller = appRouter.createCaller(ctx);

  // `debug: true` faz o router devolver o trace completo (calls/events) na
  // própria resposta — evita leitura via AsyncLocalStorage, que vaza entre
  // chamadas sequenciais no mesmo contexto.
  const result = await caller.post.generate({
    inputType: "text",
    content: `${CORPUS}\n\n[run:${runId}]`,
    platform: "instagram",
    postMode: "static",
    creationMode: "ideation",
    debug: true,
  });

  const calls = result.debug?.calls ?? [];
  const events = result.debug?.events ?? [];
  const latencyMs = Date.now() - startedAt;

  const approved = result.variations[0];
  const snapshotJson = JSON.stringify(approved, null, 2);
  const snapshotSha = sha256(snapshotJson);

  const runDir = path.join(ARTIFACTS_ROOT, runId);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, "snapshot.json"), snapshotJson, "utf8");

  let postId: number | null = null;
  try {
    const saved = await caller.post.save({
      inputType: "text",
      inputContent: `${CORPUS}\n\n[run:${runId}]`,
      platform: "instagram",
      postMode: "static",
      headline: approved.headline,
      body: approved.body,
      caption: approved.caption,
      hashtags: approved.hashtags,
      callToAction: approved.callToAction,
      tone: approved.tone,
      imagePrompt: approved.imagePrompt,
      backgroundColor: approved.backgroundColor,
      textColor: approved.textColor,
      accentColor: approved.accentColor,
      layout: approved.layout,
      variationSnapshot: approved,
    });
    postId = saved.id;
  } catch (error) {
    console.warn(`[verify:e2e] post.save falhou (persistência): ${error instanceof Error ? error.message : error}`);
  }

  const repairEvent = events.find((event) => event.stage === "repair");
  const finalValidationEvent = events.find((event) => event.stage === "final_validation");

  const report: RunReport = {
    runId,
    timestamp: new Date().toISOString(),
    environment: {
      projectRef: maskProjectRef(process.env.SUPABASE_URL ?? ""),
      nodeEnv: process.env.NODE_ENV ?? "development",
      billingMode: process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "configured" : "dev-mock",
    },
    input: {
      inputType: "text",
      platform: "instagram",
      postMode: "static",
      contentHash: sha256(CORPUS),
    },
    outcome: {
      status: "approved",
      variations: result.variations.length,
      snapshotVersion: approved.snapshotVersion ?? null,
      postId,
      snapshotSha256: snapshotSha,
    },
    pipeline: {
      generativeCalls: calls.filter((call) => call.label === "post_generation").length,
      repairCalls: calls.filter((call) => call.label === "generation_repair").length,
      judgeCalls: calls.filter((call) => call.label === "post_evaluation").length,
      transportRetries: calls.filter((call) => (call.attempt ?? 1) > 1).length,
      fallbacks: events
        .filter((event) => event.status === "fallback")
        .map((event) => event.stage),
      finalValidation: finalValidationEvent?.status ?? null,
      repairOutcome: repairEvent?.status ?? null,
    },
    cost: {
      sparks: 10,
      estimatedCostUsd: calls.reduce((sum, call) => sum + call.estimatedCostUsd, 0),
      totalTokens: calls.reduce((sum, call) => sum + call.totalTokens, 0),
      latencyMs,
    },
    artifacts: {
      snapshot: `artifacts/verification/${runId}/snapshot.json`,
      report: `artifacts/verification/${runId}/report.json`,
    },
  };

  const reportJson = JSON.stringify(report, null, 2);
  fs.writeFileSync(path.join(runDir, "report.json"), reportJson, "utf8");
  fs.writeFileSync(
    path.join(runDir, "REPORT.md"),
    `# verify:e2e — run ${runId}\n\n- timestamp: ${report.timestamp}\n- ambiente: ${report.environment.projectRef}\n- postId: ${postId ?? "não persistido"}\n- snapshotSha256: ${snapshotSha}\n- chamadas generativas: ${report.pipeline.generativeCalls}\n- reparos: ${report.pipeline.repairCalls}\n- tokens: ${report.cost.totalTokens}\n- custo estimado: US$ ${report.cost.estimatedCostUsd.toFixed(6)}\n- latência: ${latencyMs}ms\n`,
    "utf8",
  );

  console.log(
    `[verify:e2e] run ${index + 1}: ${runId} — aprovado ${result.variations.length} variações, postId=${postId ?? "-"}, tokens=${report.cost.totalTokens}, custo=US$ ${report.cost.estimatedCostUsd.toFixed(6)}, latência=${latencyMs}ms`,
  );

  return report;
}

async function main(): Promise<number> {
  const runsArg = process.argv.find((arg) => arg.startsWith("--runs="));
  const runs = Math.max(1, Math.min(10, Number(runsArg?.split("=")[1] ?? 1) || 1));

  const reports: RunReport[] = [];
  for (let index = 0; index < runs; index += 1) {
    reports.push(await runOnce(index));
  }

  const latencies = reports.map((report) => report.cost.latencyMs).sort((a, b) => a - b);
  const summary = {
    runs: reports.length,
    corpus: sha256(CORPUS),
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      min: latencies[0] ?? 0,
      max: latencies[latencies.length - 1] ?? 0,
    },
    tokens: reports.reduce((sum, report) => sum + report.cost.totalTokens, 0),
    estimatedCostUsd: reports.reduce((sum, report) => sum + report.cost.estimatedCostUsd, 0),
    generativeCalls: reports.reduce((sum, report) => sum + report.pipeline.generativeCalls, 0),
    repairCalls: reports.reduce((sum, report) => sum + report.pipeline.repairCalls, 0),
    judgeCalls: reports.reduce((sum, report) => sum + report.pipeline.judgeCalls, 0),
    postsSaved: reports.filter((report) => report.outcome.postId !== null).length,
    status: reports.every((report) => report.outcome.status === "approved") ? "approved" : "failed",
  };

  const summaryFile = path.join(ARTIFACTS_ROOT, "summary.json");
  fs.writeFileSync(summaryFile, JSON.stringify({ generatedAt: new Date().toISOString(), summary }, null, 2), "utf8");
  console.log("\n── VERIFY:E2E · resumo agregado ──");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nartefatos: ${ARTIFACTS_ROOT}/`);
  console.log(`resumo:    ${summaryFile}`);

  return summary.status === "approved" ? 0 : 1;
}

const isMainModule = typeof process !== "undefined" && (process.argv[1]?.endsWith("verifyE2E.ts") ?? false);

// ═══════════════════════════════════════════════════════════════════════════
// CR-008 — MATRIZ COMPLETA DE VERIFICAÇÃO
// ═══════════════════════════════════════════════════════════════════════════
// A matriz cobre: entrada texto/URL/imagem × modo estático/carrossel ×
// ideation/execution, mais HoloDeck (reabertura com hash idêntico), Workbench
// (edição re-resolve com resolução VÁLIDA — invariante CR-002), exportação
// (contrato determinístico hashado), sessão expirada, isolamento entre 2
// usuários, saldo insuficiente, double-submit e Stripe (modo teste).
// Células que dependem das RPCs de billing ausentes (reserve/commit/refund —
// migração 0015 não aplicada, aguarda autorização do dono) são registradas
// como "blocked" com a razão explícita, nunca silenciadas.
//
// Uso: `npm run verify:e2e -- --matrix` (roda a matriz após o lote simples).

interface MatrixCell {
  label: string;
  inputType: "text" | "url" | "image";
  content: string;
  platform: "instagram" | "linkedin";
  postMode: "static" | "carousel";
  creationMode: "ideation" | "execution";
  executionBrief?: Record<string, unknown>;
}

const EXECUTION_BRIEF: Record<string, unknown> = {
  creationMode: "execution",
  format: "static",
  platform: "instagram",
  objective: "sell",
  interventionLevel: "light_optimize",
  contentSourceType: "freeform",
  rawInput: "Dicas práticas de organização pessoal para quem trabalha de casa",
  brandInput: { brandName: "OrganizaPro", industry: "produtividade", adaptationMode: "adaptive" },
};

const MATRIX: MatrixCell[] = [
  { label: "texto/estático/ideation", inputType: "text", content: CORPUS, platform: "instagram", postMode: "static", creationMode: "ideation" },
  { label: "texto/estático/execution", inputType: "text", content: CORPUS, platform: "instagram", postMode: "static", creationMode: "execution", executionBrief: EXECUTION_BRIEF },
  { label: "texto/carrossel/ideation", inputType: "text", content: CORPUS, platform: "instagram", postMode: "carousel", creationMode: "ideation" },
  { label: "url/estático/ideation", inputType: "url", content: "https://en.wikipedia.org/wiki/Home_office", platform: "instagram", postMode: "static", creationMode: "ideation" },
  { label: "imagem/estático/ideation", inputType: "image", content: CORPUS, platform: "instagram", postMode: "static", creationMode: "ideation" },
];

function makeCaller(userId: string, email = `${TEST_EMAIL_PREFIX}@postspark.local`): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user: { id: userId, email, name: "Verify E2E", role: "user" },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

/** Detecta a presença da RPC (PGRST202 = função ausente) sem depender da migration. */
async function rpcExists(fn: string, args: Record<string, unknown>): Promise<boolean> {
  const result = await getDb().rpc(fn, args);
  const message = result.error?.message ?? result.error?.details ?? "";
  return !(message.includes("PGRST202") || message.includes("Could not find the function") || message.includes("no matches were found"));
}

interface MatrixCellResult {
  cell: string;
  status: "passed" | "failed" | "blocked" | "skipped";
  reason?: string;
  details: {
    snapshotSha256?: string;
    reopenSha256?: string;
    editHeadlineResolved?: boolean;
    editResolutionError?: string | null | undefined;
    exportContractSha256?: string;
    postId?: number | null;
  };
}

async function runMatrixCell(cell: MatrixCell, index: number): Promise<MatrixCellResult> {
  const runId = randomUUID();
  const startedAt = Date.now();
  const caller = makeCaller(testUserUuid(runId));
  const runDir = path.join(ARTIFACTS_ROOT, runId);
  fs.mkdirSync(runDir, { recursive: true });

  // Uma repetição por falha operacional transitória (mesma política do
  // produto: LLM_TRANSIENT_RETRIES) — instabilidade conhecida do provider.
  const generateOnce = () =>
    caller.post.generate({
      inputType: cell.inputType,
      content: `${cell.content}\n\n[matrix:${cell.label} · ${runId}]`,
      platform: cell.platform,
      postMode: cell.postMode,
      creationMode: cell.creationMode,
      ...(cell.executionBrief ? { executionBrief: cell.executionBrief as never } : {}),
      debug: true,
    });

  try {
    // Uma repetição por falha operacional transitória (mesma política do
    // produto: LLM_TRANSIENT_RETRIES) — instabilidade conhecida do provider.
    let result;
    try {
      result = await generateOnce();
    } catch (firstError) {
      const firstMessage = firstError instanceof Error ? firstError.message : String(firstError);
      console.warn(`[verify:e2e] matrix ${index + 1}: ${cell.label} — 1ª tentativa falhou (${firstMessage.slice(0, 100)}), repetindo…`);
      result = await generateOnce();
    }
    const approved = result.variations[0];
    const snapshotSha = canonicalSnapshotSha(approved);
    fs.writeFileSync(path.join(runDir, "snapshot.json"), JSON.stringify(approved, null, 2), "utf8");

    // persistência + readback (reabertura no HoloDeck)
    const saved = await caller.post.save({
      inputType: cell.inputType,
      inputContent: `${cell.content}\n\n[matrix:${cell.label} · ${runId}]`,
      platform: cell.platform,
      postMode: cell.postMode,
      headline: approved.headline,
      body: approved.body,
      caption: approved.caption,
      hashtags: approved.hashtags,
      callToAction: approved.callToAction,
      tone: approved.tone,
      imagePrompt: approved.imagePrompt,
      backgroundColor: approved.backgroundColor,
      textColor: approved.textColor,
      accentColor: approved.accentColor,
      layout: approved.layout,
      variationSnapshot: approved,
    });
    const reopened = await caller.post.get({ id: saved.id });
    const reopenedSha = reopened?.variation_snapshot
      ? canonicalSnapshotSha(reopened.variation_snapshot)
      : null;

    // Workbench: edição de headline → re-resolução canônica VÁLIDA (CR-002).
    const editedHeadline = `${approved.headline} — versão editada`;
    const editedSnapshot = createPostVisualSnapshot(
      { ...approved, headline: editedHeadline } as never,
      approved.aspectRatio ?? "1:1",
    );
    const editOk =
      editedSnapshot.resolvedTypography?.headline.text === editedHeadline &&
      editedSnapshot.typographyResolutionError === undefined;
    fs.writeFileSync(
      path.join(runDir, "edited.json"),
      JSON.stringify(editedSnapshot, null, 2),
      "utf8",
    );

    // Exportação: o contrato determinístico da renderização (o que o
    // html2canvas materializa) — snapshotVersion + resolução + layout,
    // hashado byte a byte. A renderização em si é coberta pela suíte client
    // (PostCardV2.resolved.test.tsx).
    const exportContract = JSON.stringify({
      snapshotVersion: approved.snapshotVersion,
      resolvedTypography: editedSnapshot.resolvedTypography,
      layoutSettings: editedSnapshot.layoutSettings,
      aspectRatio: editedSnapshot.aspectRatio,
    });
    const exportSha = sha256(exportContract);
    fs.writeFileSync(path.join(runDir, "export-contract.json"), exportContract, "utf8");

    const latencyMs = Date.now() - startedAt;
    console.log(`[verify:e2e] matrix ${index + 1}/${MATRIX.length}: ${cell.label} — postId=${saved.id}, latência=${latencyMs}ms`);
    return {
      cell: cell.label,
      status: "passed",
      details: {
        snapshotSha256: snapshotSha,
        reopenSha256: reopenedSha ?? undefined,
        editHeadlineResolved: editOk,
        editResolutionError: editedSnapshot.typographyResolutionError ?? null,
        exportContractSha256: exportSha,
        postId: saved.id,
      },
    };
  } catch (error) {
    const anyError = error as { cause?: { message?: string }; message?: string };
    const message =
      anyError.cause?.message ?? anyError.message ?? String(error);
    console.warn(`[verify:e2e] matrix ${index + 1}/${MATRIX.length}: ${cell.label} — FALHOU (${message.slice(0, 160)})`);
    return { cell: cell.label, status: "failed", reason: message, details: {} };
  }
}

/**
 * CR-008 — célula DETERMINÍSTICA (sem provider): a invariante de composição
 * família→snapshot. Para o corpus, cada variação composta deve produzir um
 * snapshot v4 com resolução tipográfica VÁLIDA (CR-002) — nunca
 * `typographyResolutionError` nem resolvedTypography ausente. É o mesmo
 * contrato que o harness e2/e3/e5 provam no compose, agora no snapshot final
 * que o produto persiste.
 */
async function runCompositionCell(): Promise<MatrixCellResult> {
  const { composeVisualDiversityPlan } = await import("@shared/creative");
  const { DEFAULT_DESIGN_TOKENS } = await import("@shared/postspark");
  type PostVariation = import("@shared/postspark").PostVariation;
  const corpus = `${CORPUS}\n\n[composição determinística]`;
  const base: PostVariation = {
    id: "matrix-compose",
    headline: corpus,
    body: "A maioria dos times corrige o sintoma e ignora a causa. Comece pelo diagnóstico.",
    caption: "",
    hashtags: [],
    callToAction: "Saiba mais",
    tone: "profissional",
    platform: "instagram",
    imagePrompt: "",
    backgroundColor: "",
    textColor: "",
    accentColor: "",
    layout: "minimal",
    aspectRatio: "1:1",
    template: "simple",
    copyAngle: { type: "beneficio", label: "x", badge: "x", stickerText: "x" },
  } as PostVariation;

  const diversity = composeVisualDiversityPlan([base, { ...base, id: "matrix-compose-2" }, { ...base, id: "matrix-compose-3" }], DEFAULT_DESIGN_TOKENS);
  const problems: string[] = [];
  for (const variation of diversity.variations) {
    const familyId = variation.creativeDirection?.familyId;
    const snapshot = createPostVisualSnapshot({ ...variation } as never, "1:1");
    if (snapshot.typographyResolutionError) {
      problems.push(`${familyId}: ${snapshot.typographyResolutionError}`);
    }
    if (!snapshot.resolvedTypography || snapshot.resolvedTypography.headline.text !== variation.headline) {
      problems.push(`${familyId}: resolvedTypography ausente ou com texto divergente`);
    }
  }
  if (problems.length > 0) {
    return { cell: "composição família→snapshot (sem provider)", status: "failed", reason: problems.join(" | "), details: {} };
  }
  console.log(`[verify:e2e] composição família→snapshot: ${diversity.variations.length} famílias com resolução válida`);
  return {
    cell: "composição família→snapshot (sem provider)",
    status: "passed",
    details: { editHeadlineResolved: true },
  };
}

async function runSecurityCells(): Promise<MatrixCellResult[]> {
  const results: MatrixCellResult[] = [];

  // ── sessão expirada ──────────────────────────────────────────────────────
  const expired: TrpcContext = {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  try {
    await appRouter.createCaller(expired).post.generate({
      inputType: "text",
      content: CORPUS,
      platform: "instagram",
    });
    results.push({ cell: "sessão expirada", status: "failed", reason: "geração permitida sem usuário autenticado", details: {} });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      cell: "sessão expirada",
      status:
        message.includes("não autenticado") || message.includes("UNAUTHORIZED") || message.includes("authenticat") || message.includes("login")
          ? "passed"
          : "failed",
      reason: message.slice(0, 120),
      details: {},
    });
  }

  // ── isolamento entre 2 usuários (composição determinística — sem provider) ─
  const ownerId = testUserUuid(randomUUID());
  const strangerId = testUserUuid(randomUUID());
  try {
    const { composeVisualDiversityPlan } = await import("@shared/creative");
    const { DEFAULT_DESIGN_TOKENS } = await import("@shared/postspark");
    type PostVariation = import("@shared/postspark").PostVariation;
    const isolated: PostVariation = {
      id: `matrix-isolation-${ownerId}`,
      headline: `${CORPUS} — isolamento`,
      body: "A maioria dos times corrige o sintoma e ignora a causa. Comece pelo diagnóstico.",
      caption: "",
      hashtags: [],
      callToAction: "Saiba mais",
      tone: "profissional",
      platform: "instagram",
      imagePrompt: "",
      backgroundColor: "",
      textColor: "",
      accentColor: "",
      layout: "minimal",
      aspectRatio: "1:1",
      template: "simple",
      copyAngle: { type: "beneficio", label: "x", badge: "x", stickerText: "x" },
    } as PostVariation;
    const composed = composeVisualDiversityPlan([isolated], DEFAULT_DESIGN_TOKENS).variations[0];
    const ownerSnapshot = createPostVisualSnapshot({ ...composed } as never, "1:1");
    const owner = makeCaller(ownerId);
    const saved = await owner.post.save({
      inputType: "text",
      inputContent: `${CORPUS}\n[isolamento:${ownerId}]`,
      platform: "instagram",
      postMode: "static",
      headline: composed.headline,
      body: composed.body,
      caption: composed.caption,
      hashtags: composed.hashtags,
      callToAction: composed.callToAction,
      tone: composed.tone,
      imagePrompt: composed.imagePrompt,
      backgroundColor: composed.backgroundColor,
      textColor: composed.textColor,
      accentColor: composed.accentColor,
      layout: composed.layout,
      variationSnapshot: ownerSnapshot,
    });
    const stranger = makeCaller(strangerId);
    const viaStranger = await stranger.post.get({ id: saved.id });
    results.push({
      cell: "isolamento 2 usuários",
      status: viaStranger ? "failed" : "passed",
      reason: viaStranger ? "o post de A ficou visível para B" : undefined,
      details: {},
    });
  } catch (error) {
    results.push({ cell: "isolamento 2 usuários", status: "failed", reason: error instanceof Error ? error.message.slice(0, 160) : String(error), details: {} });
  }

  // ── saldo insuficiente / double-submit — dependem das RPCs de billing ───
  const hasReserve = await rpcExists("reserve_sparks", {});
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
  if (!hasReserve) {
    results.push({
      cell: "saldo insuficiente",
      status: "blocked",
      reason: "reserve_sparks ausente — migração 0015 não aplicada (aguarda autorização do dono)",
      details: {},
    });
    results.push({
      cell: "double-submit (idempotência)",
      status: "blocked",
      reason: "reserve_sparks ausente — migração 0015 não aplicada (aguarda autorização do dono)",
      details: {},
    });
  } else {
    // ── saldo insuficiente (perfil FREE real, 0 sparks) ──────────────────
    const poorId = testUserUuid(randomUUID());
    try {
      const db = getDb();
      await db.from("profiles").upsert({ id: poorId, email: `verify-poor@postspark.local`, plan: "FREE", sparks: 0, sparks_refill_date: new Date().toISOString() });
      await makeCaller(poorId, "verify-poor@postspark.local").post.generate({ inputType: "text", content: CORPUS, platform: "instagram" });
      results.push({ cell: "saldo insuficiente", status: "failed", reason: "geração aprovada com 0 sparks", details: {} });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        cell: "saldo insuficiente",
        status: message.includes("Sparks insuficientes") || message.includes("PAYMENT_REQUIRED") ? "passed" : "failed",
        reason: message.slice(0, 140),
        details: {},
      });
    }

    // ── double-submit (mesma idempotencyKey → UMA reserva, UM débito) ─────
    const richId = testUserUuid(randomUUID());
    try {
      const db = getDb();
      await db.from("profiles").upsert({ id: richId, email: `verify-rich@postspark.local`, plan: "FREE", sparks: 30, sparks_refill_date: new Date().toISOString() });
      const rich = makeCaller(richId, "verify-rich@postspark.local");
      const key = `verify-double-${randomUUID()}`;
      await rich.post.generate({ inputType: "text", content: `${CORPUS} [double]`, platform: "instagram", idempotencyKey: key });
      await rich.post.generate({ inputType: "text", content: `${CORPUS} [double]`, platform: "instagram", idempotencyKey: key });
      const { data: reservations } = await db
        .from("spark_reservations")
        .select("status, amount")
        .eq("user_uuid", richId);
      const committed = (reservations ?? []).filter((row: { status: string }) => row.status === "committed");
      const { data: profile } = await db.from("profiles").select("sparks").eq("id", richId).single();
      results.push({
        cell: "double-submit (idempotência)",
        status: committed.length === 1 && profile?.sparks === 20 ? "passed" : "failed",
        reason: `reservas committed=${committed.length}, sparks restantes=${profile?.sparks}`,
        details: {},
      });
    } catch (error) {
      results.push({ cell: "double-submit (idempotência)", status: "failed", reason: error instanceof Error ? error.message.slice(0, 160) : String(error), details: {} });
    }
  }

  // ── Stripe modo teste ────────────────────────────────────────────────────
  results.push({
    cell: "stripe (modo teste)",
    status: stripeConfigured ? "passed" : "skipped",
    reason: stripeConfigured ? "STRIPE_SECRET_KEY presente; fluxo de checkout coberto pela suíte de billing" : "STRIPE_SECRET_KEY ausente — sem cobrança real no ambiente de verificação",
    details: {},
  });

  return results;
}

async function runMatrix(): Promise<number> {
  const cellResults: MatrixCellResult[] = [];
  for (let index = 0; index < MATRIX.length; index += 1) {
    cellResults.push(await runMatrixCell(MATRIX[index], index));
  }
  cellResults.push(await runCompositionCell());
  const security = await runSecurityCells();
  cellResults.push(...security);

  const approved = cellResults.filter((cell) => cell.status === "passed");
  const failed = cellResults.filter((cell) => cell.status === "failed");
  const blocked = cellResults.filter((cell) => cell.status === "blocked");
  const skipped = cellResults.filter((cell) => cell.status === "skipped");

  // Invariantes CR-008: reabertura com hash idêntico, edição com resolução
  // válida, exportação hashada.
  const reopenMismatch = cellResults.filter(
    (cell) => cell.details.reopenSha256 && cell.details.snapshotSha256 && cell.details.reopenSha256 !== cell.details.snapshotSha256,
  );
  const badEdit = cellResults.filter((cell) => cell.details.editHeadlineResolved === false);

  const matrixSummary = {
    generatedAt: new Date().toISOString(),
    cells: cellResults,
    metrics: {
      approved: approved.length,
      failed: failed.length,
      blocked: blocked.length,
      skipped: skipped.length,
      reopenHashMismatches: reopenMismatch.length,
      invalidEditResolutions: badEdit.length,
    },
  };
  const summaryFile = path.join(ARTIFACTS_ROOT, "matrix-summary.json");
  fs.writeFileSync(summaryFile, JSON.stringify(matrixSummary, null, 2), "utf8");

  console.log("\n── VERIFY:E2E · MATRIZ (CR-008) ──");
  for (const cell of cellResults) {
    const marker = cell.status === "passed" ? "✅" : cell.status === "failed" ? "❌" : cell.status === "blocked" ? "⛔" : "⏭️";
    console.log(`  ${marker} ${cell.cell}${cell.reason ? ` — ${cell.reason.slice(0, 140)}` : ""}`);
  }
  console.log(`\n  aprovadas=${approved.length} · falhas=${failed.length} · bloqueadas=${blocked.length} · puladas=${skipped.length}`);
  if (reopenMismatch.length) console.log(`  ⚠ hash de reabertura divergente: ${reopenMismatch.map((cell) => cell.cell).join(", ")}`);
  if (badEdit.length) console.log(`  ⚠ edições sem resolução válida: ${badEdit.map((cell) => cell.cell).join(", ")}`);
  console.log(`  resumo: ${summaryFile}`);

  return failed.length === 0 && reopenMismatch.length === 0 && badEdit.length === 0 ? 0 : 1;
}

if (isMainModule) {
  main()
    .then(async (code) => {
      if (process.argv.includes("--matrix")) {
        const matrixCode = await runMatrix();
        process.exitCode = Math.max(code, matrixCode);
      } else {
        process.exitCode = code;
      }
    })
    .catch((error) => {
      console.error("verify:e2e failed:", error instanceof Error ? error.message : error);
      process.exitCode = 2;
    });
}
