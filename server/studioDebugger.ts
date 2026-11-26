import { TRPCError } from "@trpc/server";
import { arsenalHash } from "../shared/arsenalContent";
import {
  describeDebugScene,
  type StudioDebugStep,
} from "../shared/studioDebugger";
import { getDb } from "./db";
import {
  inspectGenerationDecisionTrace,
  type DecisionTraceSource,
} from "./generationDecisionTrace";
import {
  localDiagnosticsEnabled,
  readLocalDiagnosticRecords,
} from "./ai/localDiagnostics";

type Row = Record<string, any>;
const rows = (value: unknown): Row[] =>
  Array.isArray(value) ? value.filter(x => x && typeof x === "object") : [];
const fields = (value: Row, keys: string[]) =>
  Object.fromEntries(
    keys.filter(k => value[k] != null).map(k => [k, value[k]])
  );

export function buildStudioDebugger(
  source: DecisionTraceSource,
  runCalls: Row[] = []
) {
  const { request, operations } = source;
  const decision = inspectGenerationDecisionTrace(source);
  const timeline = new Map<string, StudioDebugStep>();
  function step(
    id: string,
    at: string | undefined,
    title: string,
    status: string,
    detail: unknown
  ) {
    timeline.set(id, {
      id,
      at: at ?? null,
      origin: "Servidor",
      title,
      status,
      detail,
    });
  }
  step("admission", request.created_at, "Pedido admitido", "registrado", {
    ...fields(request.input ?? {}, [
      "platform",
      "postMode",
      "inputType",
      "aspectRatio",
      "selectionPolicy",
      "creationMode",
    ]),
    fixedDesign: request.input?.fixedDesign?.kind,
    catalogRevision: request.catalog_revision,
  });
  const calls = new Map<string, Row>();
  const addCall = (call: Row, operationKey = call.operationKey) => {
    const key = call.providerId
      ? arsenalHash(["provider", call.providerId])
      : arsenalHash([
          call.label,
          call.attempt ?? 1,
          call.promptHash ?? null,
          call.requestedModel ?? null,
          call.effectiveModel ?? null,
        ]);
    const existing = calls.get(key);
    const data = {
      ...fields(call, [
        "label",
        "requestedModel",
        "effectiveModel",
        "provider",
        "attempt",
        "promptTokens",
        "completionTokens",
        "latencyMs",
        "failureKind",
        "costSource",
        "estimatedCostUsd",
      ]),
      operationKey: existing?.operationKey ?? operationKey,
    };
    calls.set(key, data);
  };
  for (const call of runCalls) addCall(call);
  // A worker can copy the same observation to the operation journal and to the run.
  // Keep separate evaluations at the same instant when their payloads differ.
  const debuggerIssues = [...decision.issues];
  function event(e: Row, operationKey?: string) {
    const id = arsenalHash([
      e.at ?? null,
      e.stage,
      e.status ?? null,
      e.detail ?? null,
      e.data ?? null,
    ]);
    if (timeline.has(id)) return;
    if (e.stage === "proposal_copy_validation_failed" || (e.stage === "proposal_failure" && e.detail === "copy_response_invalid")) {
      const target = String(e.data?.attemptId ?? e.data?.proposalId ?? operationKey ?? "proposal");
      if (e.stage === "proposal_copy_validation_failed" || !debuggerIssues.some(i => i.target === target && i.code === "copy_response_invalid_detail")) {
        debuggerIssues.push({ code: e.stage === "proposal_copy_validation_failed" ? "copy_response_invalid_detail" : "copy_response_invalid",
          target, detail: e.data?.issues ? JSON.stringify(e.data.issues) : "A resposta de redação foi rejeitada pelo validador." });
      }
    }
    const data = fields(e.data ?? {}, [
      "slot",
      "round",
      "attempt",
      "model",
      "policy",
      "seed",
      "chosenCandidateId",
      "reason",
      "paidEffect",
      "registered",
      "indexed",
      "evaluated",
      "selectorIds",
      "offerIds",
      "selectedIds",
      "families",
      "substitutions",
      "requestHash",
      "estimatedInputTokens",
      "remainingMs",
      "outcome",
      "targetCount",
      "remainingFindings",
      "elapsedMs",
      "proposalId",
      "attemptId",
      "detailHash",
      "issues",
      "slideCount",
      "findings",
      "inspectedSlides",
      "checkpoint",
      "stage",
      "status",
      "calls",
      "totalTokens",
      "costComplete",
      "effectiveModels",
      "operationKey",
    ]);
    step(
      id,
      e.at,
      e.stage === "proposal_checkpoint" ? String(e.detail) : String(e.stage),
      e.status ?? "registrado",
      { detail: e.detail, operationKey, ...data }
    );
  }
  let finalFitAttempts = 0, finalFitKnownCost = 0, finalFitUnknownCosts = 0;
  const finalFitDeliveries = new Set<string>();
  for (const op of operations) {
    const key = String(op.operation_key);
    step(key + ":start", op.started_at, key, "started", { operationKey: key });
    for (const e of rows(op.result?.__generationTrace?.events)) event(e, key);
    const documentedCalls = rows(op.result?.__generationTrace?.calls);
    for (const call of documentedCalls) addCall(call, key);
    const rejection = op.result?.__providerRejection;
    if (rejection && typeof rejection === "object") {
      debuggerIssues.push({
        code: "provider_request_rejected",
        target: key,
        detail: `${rejection.provider ?? "provider"}:${rejection.model ?? ""} HTTP ${rejection.httpStatus ?? "?"} (${rejection.reason ?? "rejected"})`,
      });
    }
    const fit = /:copy_final_fit(?:_residual)?$/.exec(key);
    if (fit) {
      const proposalId = key.slice(0, -fit[0].length);
      const proposal = rows(request.proposals).find(p => p.proposalId === proposalId);
      const call = documentedCalls.find(call => ["provider", "estimate"].includes(call.costSource) && typeof call.estimatedCostUsd === "number");
      const cost = op.result?.usage?.cost ?? call?.estimatedCostUsd;
      finalFitAttempts++;
      if (proposal?.status === "ready" && op.state === "completed" &&
          rows(proposal.diagnostics).some(d => d.code === "final_text_fit_passed" && d.target === op.result?.finalFit?.attemptId)) finalFitDeliveries.add(proposalId);
      if (typeof cost === "number") finalFitKnownCost += cost;
      else finalFitUnknownCosts++;
      step(key + ":fit", op.updated_at, key.endsWith("_residual") ? "Reparo do texto restante" : "Ajuste final de texto", rejection ? "provider_rejected" : op.state, {
        proposalId, operationKey: key,
        ...fields(op.result?.finalFit ?? {}, ["attemptId", "targetCount", "durationMs"]),
        costUsd: cost ?? null,
        costSource: typeof op.result?.usage?.cost === "number" ? "provider" : call?.costSource ?? "unknown",
        deliveryStatus: proposal?.status,
      });
    }
    if (op.state !== "started")
      step(key + ":result", op.updated_at, key, rejection ? "provider_rejected" : op.state, {
        model: op.result?.model,
        kind: op.result?.kind,
        ...(rejection ? { providerRejection: rejection } : {}),
        operationKey: key,
        calls: documentedCalls.map(call =>
          fields(call, [
            "label",
            "effectiveModel",
            "attempt",
            "latencyMs",
            "failureKind",
          ])
        ),
      });
  }
  for (const e of source.events ?? []) event(e);
  for (const p of rows(request.proposals)) {
    if (p.status === "failed") debuggerIssues.push({
      code: "proposal_failed", target: String(p.proposalId ?? p.slot),
      detail: [p.failure?.stage, p.failure?.code ?? p.errorReason].filter(Boolean).join(" / "),
    });
    for (const diag of rows(p.diagnostics)) {
      if (diag.code === "copy_response_invalid_detail" || diag.code === "copy_recovery_provider_rejected") {
        debuggerIssues.push({
          code: String(diag.code),
          target: String(p.proposalId ?? `slot-${p.slot}`),
          detail: String(diag.evidence ?? ""),
        });
      }
    }
    if (typeof p.completedAt === "number" && Number.isFinite(p.completedAt)) {
      step(
        "delivery:" + p.proposalId,
        new Date(p.completedAt).toISOString(),
        "Entrega da proposta " + (p.slot + 1),
        p.status,
        {
          proposalId: p.proposalId,
          revision: p.revision,
          family: p.bundle?.family,
          failure: p.failure?.code,
        }
      );
    }
  }
  if (finalFitAttempts) step("final-fit-summary", request.updated_at, "Resultado dos reparos finais", request.status, {
    attempts: finalFitAttempts, delivered: finalFitDeliveries.size, knownCostUsd: finalFitKnownCost, unknownCosts: finalFitUnknownCosts,
    costUsdPerRecoveredProposal: finalFitDeliveries.size && !finalFitUnknownCosts ? finalFitKnownCost / finalFitDeliveries.size : null,
  });
  return {
    requestId: String(request.id),
    status: String(request.status),
    updatedAt:
      typeof request.updated_at === "string" ? request.updated_at : null,
    hasFinalMetrics:
      source.events?.some(
        e => e.stage === "generation_metrics" && e.detail === "journal_summary"
      ) ?? false,
    fixedDesign: request.input?.fixedDesign?.kind as string | undefined,
    timeline: Array.from(timeline.values()).sort(
      (a, b) => (Date.parse(a.at ?? "") || 0) - (Date.parse(b.at ?? "") || 0)
    ),
    calls: Array.from(calls.values()),
    coverage: decision.coverage,
    issues: debuggerIssues,
    candidates: decision.candidates.map(c => ({
      id: String(c.offerId),
      sourceId: c.sourceId as string | undefined,
      score: c.score as number | null,
      family: String(c.family),
      outcome: String(c.outcome),
      ...fields(c, [
        "confidence",
        "scoreOrigin",
        "scoreTargetId",
        "sentToSelector",
        "shortlistPosition",
        "familyRetrieved",
        "selectionReasons",
        "decisions",
        "generatedPosts",
      ]),
    })),
    plans: rows(request.prepared?.planning?.slots),
    slots: decision.selectionObservations,
    catalog: decision.registeredDesigns as Row[],
    assessments: decision.assessments,
    families: decision.families,
    recoveries: [
      ...decision.recoveryDecisions,
      ...decision.recoveryObservations,
    ],
    deliveries: decision.generatedPosts,
    criteria: decision.criteria,
    plannedSlides: rows(request.proposals).map(p => ({
      slot: Number(p.slot),
      status: String(p.status),
      name: p.bundle?.name ?? p.fixedCanvas?.familyName,
      reason: p.bundle?.reason,
      slides: rows(p.bundle?.slides ?? p.fixedCanvas?.slides).map(s => ({
        id: s.id,
        role: s.role ?? s.assemblyRole,
        variant: s.composition?.sourceVariantKey,
        candidate: s.composition?.origin?.candidateId,
        components: s.composition?.origin?.componentAssembly?.componentIds,
        elements: s.composition?.elements?.length,
        state: s.composition?.state,
        scene:
          Array.isArray(s.composition?.elements) && s.composition?.base
            ? describeDebugScene(s.composition)
            : undefined,
      })),
    })),
  };
}

async function readOperations(db: ReturnType<typeof getDb>, requestId: string) {
  const operations: Row[] = [];
  const pageSize = 100;
  let cursor = "";
  for (;;) {
    let query = db
      .from("generation_v5_operations")
      .select("operation_key,state,result,expectation,started_at,updated_at")
      .eq("request_id", requestId);
    if (cursor) query = query.gt("operation_key", cursor);
    const page = await query.order("operation_key").limit(pageSize);
    if (page.error) throw new Error("Falha ao ler as operações da geração.");
    operations.push(...(page.data ?? []));
    if (!page.data || page.data.length < pageSize) return operations;
    cursor = page.data[page.data.length - 1].operation_key;
  }
}

export async function readStudioDebugger(requestId: string, ownerId: string) {
  const db = getDb();
  const request = await db
    .from("generation_v5_requests")
    .select(
      "id,status,input,prepared,proposals,catalog_revision,generation_config,created_at,updated_at"
    )
    .eq("id", requestId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (request.error) throw new Error("Falha ao consultar o pedido.");
  if (!request.data)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Pedido indisponível nesta conta.",
    });
  const [ops, run, records] = await Promise.all([
    readOperations(db, requestId),
    db
      .from("generation_runs")
      .select("events,calls:prompt_snapshot->calls")
      .eq("id", requestId)
      .eq("user_uuid", ownerId)
      .maybeSingle(),
    localDiagnosticsEnabled() ? readLocalDiagnosticRecords(requestId) : [],
  ]);
  if (run.error) throw new Error("Falha ao ler os registros da geração.");
  const local = records.filter(
    r => r.id === requestId && r.userUuid === ownerId
  );
  return buildStudioDebugger(
    {
      request: request.data,
      operations: ops,
      events: [
        ...rows(run.data?.events),
        ...local.flatMap(r => rows(r.events)),
      ],
    },
    [...rows(run.data?.calls), ...local.flatMap(r => rows(r.calls))]
  );
}
