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
      operationKey,
    };
    const key = arsenalHash([
      operationKey ?? null,
      call.providerId ?? null,
      call.label,
      call.attempt ?? 1,
      call.promptHash ?? null,
    ]);
    calls.set(key, data);
  };
  for (const call of runCalls) addCall(call);
  // A worker can copy the same observation to the operation journal and to the run.
  // Keep separate evaluations at the same instant when their payloads differ.
  function event(e: Row, operationKey?: string) {
    const id = arsenalHash([
      e.at ?? null,
      e.stage,
      e.status ?? null,
      e.detail ?? null,
      e.data ?? null,
    ]);
    if (!operationKey && timeline.has(id)) return;
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
      "proposalId",
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
  for (const op of operations) {
    const key = String(op.operation_key);
    step(key + ":start", op.started_at, key, "started", { operationKey: key });
    for (const e of rows(op.result?.__generationTrace?.events)) event(e, key);
    const documentedCalls = rows(op.result?.__generationTrace?.calls);
    for (const call of documentedCalls) addCall(call, key);
    if (op.state !== "started")
      step(key + ":result", op.updated_at, key, op.state, {
        model: op.result?.model,
        kind: op.result?.kind,
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
    issues: decision.issues,
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
