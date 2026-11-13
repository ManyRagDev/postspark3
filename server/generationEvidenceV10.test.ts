/** Offline contract tests. Model judgments, pixels, font metrics and provider IDs
 * are explicitly controlled; they do not establish semantic quality. */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { generationReleasePostgresFixture } from "./ai/workflows/generationReleasePostgres.fixture";
import { authorFamilyCarouselRepertoire } from "./designCatalog/familyCarouselRepertoire";
import { compactComponentCard } from "../shared/componentAssembly";
import { completeDesignTestDefinitions } from "../shared/completeDesignGeneration.fixture";
import { createComponentTextMeasurer } from "./ai/componentTextMeasurer";
import { renderReviewScenes, closeReviewRenderer } from "./ai/workflows/proposalRenderer";
import { invokeLLM } from "./_core/llm";
import { compileCompleteDesign } from "../client/src/pages/CanvasLab/lib/completeDesignCompiler";
import { canvasModelToSavePayload, savedPostToCanvasModel } from "../client/src/pages/CanvasLab/lib/saveAdapter";
vi.mock("../client/src/pages/CanvasLab/lib/arsenalAssets", () => ({ ensureArsenalFont: vi.fn(async () => {}) }));
vi.mock("./_core/operationalLog", async importOriginal => ({ ...(await importOriginal() as object), appendOperationalLog: vi.fn(async () => {}) }));
import { projectProposalVariation } from "../shared/proposalProjection";
import { arsenalHash } from "../shared/arsenalContent";
import { orchestratedGenerationInputSchema } from "../shared/generationRequest";
import { defaultStudioPreferences } from "../shared/studioPreferences";
import { sealGenerationPlanningReceipt } from "../shared/generationPlan";
import { editorialCatalogHash, type EditorialIntentReading, type FrozenEditorialCatalog } from "../shared/editorialIntent";
import {
  electionCatalogFixture,
  electionCatalogRequest,
} from "./designCatalog/designElection.fixture";
import { withCatalogRevision } from "./designCatalog/versionedCatalog";
import { reconcileCatalogCoverage } from "./designCatalog/catalogCoverage";
import { shortlistCompleteDesigns } from "./designCatalog/designShortlist";
import { prepareOrchestratedGeneration } from "./ai/workflows/generationPreparation";
import { replanGenerationSlot } from "./ai/workflows/generationPlanning";
import { GenerationCoordinator } from "./ai/workflows/generationCoordinator";
import { healthyReviewV10Fixture } from "./ai/workflows/proposalReviewV10.fixture";
import { healthyReviewV8Fixture } from "./ai/workflows/proposalReviewV8.fixture";
import { reviewPayloadV7 } from "./ai/workflows/proposalReviewV7.fixture";
import { renderReviewFixtureScenes } from "./ai/workflows/proposalReview.fixture";
import {
  journalResultWithTrace,
  readJournalResult,
} from "./ai/workflows/generationJournalTrace";
import {
  runWithGenerationTrace,
  recordLlmTraceCall,
  type GenerationTrace,
} from "./ai/generationTrace";
import { resolveGenerationModelConfig } from "./ai/generationModel";
import { ENV } from "./_core/env";
import { inspectGenerationEvidence } from "./generationEvidence";
import { inspectDesignElection } from "./designElectionEvidence";
import type { InvokeParams } from "./_core/llm";

const actor = "11111111-1111-4111-8111-111111111111",
  runId = "22222222-2222-4222-8222-222222222222";
const intent = {
  version: 1,
  objective: "Ajudar a planejar",
  tone: {
    description: "Cuidadoso",
    origin: "inferred",
    rationale: "Tema envolve riscos",
  },
  adaptation: "controlled",
  requirements: [],
  content: [
    {
      id: "idea",
      meaning: "Planejar com antecedência",
      sourceIds: [],
      requirementIds: [],
    },
  ],
};
function option(candidate: any, slot: number) {
  return {
    slot,
    status: "viable",
    candidateId: candidate.candidateId,
    reason: "Cabe a ideia",
    editorialApproach: "Planejamento prático",
    captionContentIds: [],
    pages: candidate.profile.sequence.map((page: any, slideIndex: number) => ({
      slideIndex,
      componentId: page.alternatives[0],
      purpose: "Apresentar a ideia",
      rhythm: "highlight",
      assignments: [
        {
          fieldId: "field-0",
          contentIds: ["idea"],
          itemCount: null,
          instruction: "Preserve a ideia útil",
        },
      ],
    })),
  };
}
async function scenario(
  options: {
    fallback?: boolean;
    badSlot?: boolean;
    count?: number;
    strategy?: 1 | 2;
    reverseFields?: boolean;
    slideCount?: number;
    allReady?: boolean;
    localSelection?: boolean;
    ellipticalExecutionQuote?: boolean;
    confidenceRanking?: boolean;
    editorial?: boolean;
    automatic?: boolean;
    positiveIdeaReviewError?: boolean;
    measureText?: any;
    renderReviewScenes?: any;
    transport?: (params: InvokeParams, response: any) => Promise<any>;
  } = {}
) {
  const base = electionCatalogFixture(options.count ?? 14);
  const definitions = options.slideCount
    ? base.definitions.flatMap(d => [d, ...authorFamilyCarouselRepertoire(d)])
    : base.definitions;
  const editorialDocument = {
    version: 1 as const,
    intents: [
      { id: "explain", label: "Explicar", description: "Apresentar uma ideia e seu significado com clareza." },
      { id: "compare", label: "Comparar", description: "Confrontar alternativas por critérios declarados." },
    ],
    designs: definitions.map(d => ({ sourceId: d.id, sourceHash: d.hash, intentIds: ["explain", "compare"], rationale: "Composição capaz de apresentar ideias e alternativas." })),
  };
  const frozenEditorialCatalog: FrozenEditorialCatalog = {
    version: 1, catalogRevision: "1", revision: "00000000-0000-4000-8000-000000000001",
    hash: editorialCatalogHash(editorialDocument), document: editorialDocument,
  };
  const editorial: EditorialIntentReading = { version: 1, signals: [{
    intentId: "explain", state: "requested", origin: "explicit", clarity: "clear",
    requestQuote: "Explique como planejar diante de riscos", rationale: "Explicação pedida expressamente.",
  }] };
  const inventory = options.slideCount ? {
    registered: definitions.map(d => ({ id: d.id, definition_hash: d.hash, status: "approved", aspect_ratios: d.aspectRatios, roles: d.roles, source: d.source, design: d.completeDesign! })),
    indexed: definitions.map(d => ({ component_id: d.id, definition_hash: d.hash, card: compactComponentCard(d) })),
  } : base.inventory;
  const input = orchestratedGenerationInputSchema.parse({
    ownerId: actor,
    idempotencyKey: runId,
    inputType: "text",
    content: (options.slideCount ? `Carrossel de ${options.slideCount} slides. ` : "") +
      "Explique como planejar diante de riscos, apenas texto, sem fotografia.",
    platform: "instagram",
    postMode: options.slideCount ? "carousel" : "static",
    // These replay fixtures exercise the historical single-model wire contracts.
    generationModel: options.automatic ? "auto" : options.slideCount ? "gpt" : "gemini",
    ...(options.slideCount ? { slideCount: options.slideCount } : {}),
  });
  const old = ENV.generationStrategyVersion;
  ENV.generationStrategyVersion = options.strategy ?? 2;
  // Existing fixtures replay the protocol admitted before editorial sidecars.
  const resolvedConfig = resolveGenerationModelConfig(input);
  const { editorialIntentVersion: _editorialVersion, configurationHash: _currentHash, ...historicalConfig } = resolvedConfig;
  const generationConfig = options.editorial || options.automatic ? resolvedConfig : { ...historicalConfig, configurationHash: createHash("sha256").update(JSON.stringify(historicalConfig)).digest("hex") };
  ENV.generationStrategyVersion = old;
  const operations = new Map<string, any>();
  async function operation<T>(key: string, work: () => Promise<T>): Promise<T> {
    if (operations.has(key))
      return readJournalResult(operations.get(key).result);
    const entry: any = { operation_key: key, state: "started" };
    operations.set(key, entry);
    const trace: GenerationTrace = {
      id: key,
      userUuid: actor,
      inputType: "text",
      inputContent: input.content,
      platform: input.platform,
      postMode: input.postMode,
      startedAt: Date.now(),
      calls: [],
      events: [],
    };
    const value = await runWithGenerationTrace(trace, work);
    entry.state = "completed";
    entry.result = journalResultWithTrace(value, trace);
    return value;
  }
  const providerCall = (params: any, result: any) => {
    recordLlmTraceCall({
      label: params.traceLabel ?? "controlled_jev",
      requestedModel: "controlled-offline",
      effectiveModel: result.model ?? "controlled-offline",
      effectiveModelReported: true,
      provider: "controlled-offline",
      providerId: "controlled-provider-receipt",
      promptHash: arsenalHash(params.messages ?? params),
      messages: params.messages ?? [params],
      response: result,
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      latencyMs: 1,
      estimatedCostUsd: 0,
      costSource: "provider",
    });
    return result;
  };
  let initialSlotCopies = 0;
  let injectedIdeaCheck = false;
  const generate = vi.fn(async (params: InvokeParams): Promise<any> => {
    let result: unknown;
    if (params.taskRoute === "post_evaluation") {
      result =
        options.strategy === 1
          ? healthyReviewV8Fixture(params)
          : params.response_format?.type==="json_schema" && params.response_format.json_schema.name==="proposal_review_exceptions_v10"
            ? {status:"reviewed",reviewedSlides:reviewPayloadV7(params).slides.map((s:any)=>s.index),limitation:null,findings:[]}
            : healthyReviewV10Fixture(params);
      if (options.positiveIdeaReviewError && !injectedIdeaCheck) {
        const review = result as ReturnType<typeof healthyReviewV10Fixture>;
        review.intentChecks = [{requirementId:"idea-1",status:"met",explanation:"Ideia editorial atendida; erro de namespace controlado.",deliveries:[{contentId:"idea-1",unitIds:[review.unitChecks[0].unitId]}]}];
        injectedIdeaCheck = true;
      }
    } else if (params.traceLabel?.startsWith("generation_")) {
      const data = JSON.parse(
        params.messages.find(m => m.role === "user")!.content as string
      );
      if (data.catalog?.encoding) data.catalog = decodeGenerationSelectionCatalog(data.catalog);
      result =
        options.strategy === 1
          ? {
              version: 3,
              options: data.catalog.slice(0, 3).map((c: any) => ({
                offerId: c.offerId,
                reason: "Adequação visual controlada",
                editorialApproach: "Explicação útil sobre planejamento",
              })),
            }
          : params.traceLabel.includes("intent")
            ? options.automatic ? {objective:intent.objective,tone:intent.tone.description,semanticQuery:"Planejamento cuidadoso diante de riscos, tipografia clara",ideas:intent.content.map(({meaning,sourceIds})=>({meaning,sourceIds}))} : options.slideCount ? {
                ...intent,
                requirements: [{
                  id: "pages",
                  description: "Quantidade confirmada de lâminas",
                  kind: "execution",
                  surface: "art",
                  origin: "explicit",
                  requestQuote: `Carrossel de ${options.slideCount} slides`,
                  itemCount: options.slideCount,
                }],
              } : options.ellipticalExecutionQuote ? {
                ...intent,
                requirements: [{
                  id: "typography",
                  description: "Usar uma composição somente com texto",
                  kind: "execution",
                  surface: "art",
                  origin: "explicit",
                  requestQuote: "Explique como planejar [...] sem fotografia.",
                  itemCount: null,
                }],
              } : intent
            : params.traceLabel.includes("template_replan")
              ? {
                  slotPlan: option(
                    { candidateId: data.candidateId, profile: data.profile },
                    data.slot
                  ),
                }
              : {
                  version: 1,
                  slots: [
                    option(data.catalog[0], 0),
                    option(data.catalog[1], 1),
                    options.badSlot
                      ? {
                          ...option(data.catalog[2], 2),
                          candidateId: "ffffffff-ffff-4fff-afff-ffffffffffff",
                        }
                      : options.allReady ? option(data.catalog[2], 2) : {
                          slot: 2,
                          status: "insufficient_fit",
                          reason: "Falta uma alternativa adequada",
                          unmetRequirementIds: [],
                        },
                  ],
                };
    } else {
      const slot0 = params.traceLabel?.includes(`${runId}-0`),
        recovery = params.traceLabel?.endsWith("_copy_recovery");
      const long =
        options.fallback && slot0 && (recovery || initialSlotCopies++ === 0);
      result = {
        caption: "Comece a planejar",
        hashtags: [],
        slides: Array.from({ length: options.slideCount ?? 1 }, () => ({
            values: [
              {
                fieldId: "field-0",
                value: long
                  ? "LONG Planeje com antecedência"
                  : "Planeje com antecedência",
              },
              { fieldId: "field-1", value: "Reserve tempo para organizar" },
            ],
            mediaPrompts: [],
          })),
      };
      if (options.reverseFields) (result as any).slides[0].values.reverse();
    }
    if (options.editorial && params.traceLabel === "generation_intent_v1")
      result = { ...(result as object), editorial };
    const response = {
      id: "controlled-response",
      model: "controlled-offline",
      choices: [
        { message: { content: JSON.stringify(result) }, finish_reason: "stop" },
      ],
    };
    response.model = params.pinnedModel ?? response.model;
    return options.transport ? options.transport(params, response) : providerCall(params, response);
  });
  const hydrate = async (ids: string[]) =>
    definitions.filter(d => ids.includes(d.id));
  const deadlineMs = Date.now() + 600_000;
  const prepare = () => prepareOrchestratedGeneration(
    input,
    actor,
    false,
    deadlineMs,
    {
      generationConfig,
      useLegacyLlmSelection: !options.automatic && !(options.localSelection ?? Boolean(options.slideCount)),
      generate,
      hydrate,
      operation: (k, w) => operation(`prepare:${k}`, w),
      expectPreparation: async (key: string, expectation: unknown) => {
        operations.get(`prepare:${key}`).expectation = expectation;
      },
      loadContext: async () => input.content,
      preferences: async () => defaultStudioPreferences,
      ...(options.automatic ? { readEditorialCatalog: async () => null, automaticSemantic: {engine:{metadata:{modelId:"offline-unavailable"}} as any} } : options.editorial ? { readEditorialCatalog: async () => frozenEditorialCatalog } : {}),
      recentSelections: async () => [],
      retrieve: async () =>
        reconcileCatalogCoverage(
          { ...electionCatalogRequest, text: input.content, postMode: input.postMode, slideCount: input.slideCount ?? 1 },
          inventory
        ),
      shortlist: p =>
        shortlistCompleteDesigns(p, async request =>
          providerCall(request, {
            id: "controlled-jev",
            model: request.model,
            answers: Object.fromEntries(
              Object.keys(request.questions).map((id, index) => [
                id,
                { type: "score", score: options.confidenceRanking ? index % 2 ? 3 : 4 : 3, confidence: options.confidenceRanking ? index % 2 ? 1 : 0 : 0.9 },
              ])
            ),
            usage: { input_tokens: 1, output_tokens: 1, cost: 0 },
          })
        ),
    }
  );
  const prepared = options.automatic ? await withCatalogRevision("1", prepare) : await prepare();
  const coordinator = new GenerationCoordinator(
    {
      ...prepared,
      generationConfig,
      requestId: runId,
      runId,
      actor,
      prompt: input.content,
      platform: input.platform,
      postMode: input.postMode,
      deadlineMs,
      executionBrief: input.executionBrief,
    },
    {
      actor,
      generateText: generate,
      renderReviewScenes: options.renderReviewScenes ?? renderReviewFixtureScenes,
      measureText: options.measureText ?? (p => ({
        height: p.text.includes("LONG") ? 5000 : 20,
        lines: [{ width: 100 }],
        runs: [{ fill: p.fill, fontSize: p.fontSize, fontStyle: p.fontStyle }],
      })),
      operationForProposal: id => (o, work) =>
        operation(`${id}:${o.operationKey}`, work),
      reviewOperations: async id =>
        Array.from(operations.values())
          .filter(o => o.operation_key.startsWith(`${id}:`))
          .map(o => ({
            ...o,
            operationKey: o.operation_key.slice(id.length + 1),
          })),
      expectationForProposal: async (id, key, expectation) => {
        operations.get(`${id}:${key}`).expectation = expectation;
      },
      recoveryOperationKeys: async (id, attempt = id) =>
        Array.from(operations.keys())
          .filter(
            k =>
              (k.startsWith(`${id}:`) || k.startsWith(`${id}-fb`)) &&
              /:(copy_recovery|review_correction:)/.test(k)
          )
          .map(k =>
            k.startsWith(`${attempt}:`)
              ? k.slice(attempt.length + 1)
              : `previous_attempt:${k.replace(/^.*?:(copy_recovery|review_correction:)/, "$1")}`
          ),
      replan: (slot, attempt, currentFamilies) =>
        replanGenerationSlot(
          {
            prepared,
            slot,
            attempt,
            currentFamilies,
            generationConfig,
            deadlineMs,
            experimental: false,
          },
          {
            generate,
            hydrate,
            operation: (key, work) =>
              operation(`p-${runId}-${slot}:${key}`, work),
          }
        ),
    }
  );
  const snapshot = await coordinator.start();
  const debit = (input.postMode === "carousel" ? 4 : 1) + snapshot.proposals.filter(p => p.status === "ready").length * (input.postMode === "carousel" ? 12 : 3);
  const request = {
    id: runId,
    owner_id: actor,
    input,
    generation_config: generationConfig,
    ...(options.automatic ? {catalog_revision:1} : {}),
    prepared,
    proposals: snapshot.proposals,
    status: snapshot.overallStatus,
    billing_mode: "reserved",
    billing_reserved: input.postMode === "carousel" ? 40 : 10,
    billing_preparation: input.postMode === "carousel" ? 4 : 1,
    billing_per_proposal: input.postMode === "carousel" ? 12 : 3,
    billing_debited: debit,
    billing_reservation_id: "hold",
    billing_settled_at: new Date().toISOString(),
  };
  const evidenceInput = {
    request,
    operations: Array.from(operations.values()),
    reservation: {
      id: "hold",
      user_uuid: actor,
      amount: debit,
      status: "committed",
    },
  };
  return {
    definitions,
    request,
    operations,
    evidenceInput,
    prepared,
    generate,
    frozenEditorialCatalog,
    editorial,
    inspect: () => inspectGenerationEvidence(evidenceInput),
  };
}

describe("V10 persisted evidence with controlled providers", () => {
  it.each([2, 3])("audits the authoritative recovery decision of fb%s rather than the first candidate", async index => {
    const s = await scenario({ count: 4, automatic: true, allReady: true, localSelection: true });
    const proposal = s.request.proposals[0];
    expect(proposal.status).toBe("ready");
    expect(s.prepared.planning!.deliveryReserves).toBeDefined();
    const prefix = `${proposal.proposalId}:`;
    const copyOp = s.evidenceInput.operations.find(op => op.operation_key === `${prefix}copy`)!;
    const copy = JSON.parse(readJournalResult<any>(copyOp.result).choices[0].message.content);
    proposal.attempt = { index, id: `${proposal.proposalId}-fb${index}` };
    for (const op of s.evidenceInput.operations) {
      if (op.operation_key.startsWith(prefix) && (op !== copyOp || index === 3))
        op.operation_key = op.operation_key.replace(prefix, `${proposal.proposalId}-fb${index}:`);
    }
    const key = `${prefix}delivery_recovery:${index}:candidate`;
    const local = { __generationTrace: { version: 1, calls: [], events: [] } };
    s.evidenceInput.operations.push(
      { operation_key: `${prefix}delivery_recovery:candidate`, state: "completed", result: { mode: "unavailable", ...local } },
      { operation_key: key, state: "completed", result: { mode: index === 3 ? "write_for_design" : "repair_text", copy, plan: s.prepared.planning!.slots[0], ...local } },
    );
    const result = s.inspect();
    expect(result.designElection.issues).toEqual([]);
    expect(result.checks.filter(check => !check.passed)).toEqual([]);
    expect(result.passed).toBe(true);
    const missing = structuredClone(s.evidenceInput);
    missing.operations = missing.operations.filter(op => op.operation_key !== key);
    expect(inspectGenerationEvidence(missing).passed).toBe(false);
  });
  it("plans and delivers three seven-slide proposals with the local selector", async () => {
    const s = await scenario({ count: 3, slideCount: 7, allReady: true });
    expect(s.request.status, JSON.stringify(s.prepared.planning?.slots)).toBe("completed");
    expect(s.request.proposals.map(p => p.status)).toEqual(["ready", "ready", "ready"]);
    expect(s.prepared.planning?.intent.requirements[0]).toMatchObject({ id: "pages", itemCount: null });
    for (const proposal of s.request.proposals) if (proposal.status === "ready") {
      expect(proposal.bundle.slides).toHaveLength(7);
      expect(proposal.reviews?.at(-1)?.reviewedSlides).toEqual([0, 1, 2, 3, 4, 5, 6]);
    }
    expect(s.inspect().checks.filter(c => !c.passed), JSON.stringify(s.inspect().designElection.issues)).toEqual([]);
  }, 30000);

  it("audits a deterministic local selection without inventing a provider receipt", async () => {
    const s = await scenario({ count: 3, allReady: true, localSelection: true, ellipticalExecutionQuote: true });
    expect(s.request.status).toBe("completed");
    expect(s.prepared.planning?.intent.requirements[0]?.requestQuote).toBe(s.request.input.content);
    expect(s.inspect().checks.filter(c => !c.passed)).toEqual([]);
    const selection = s.operations.get("prepare:selection");
    expect(selection.result.__preparationReceipt).toBeUndefined();
    expect(selection.result.__generationTrace.calls).toEqual([]);
    const broken = structuredClone(s.evidenceInput);
    delete broken.operations.find(o => o.operation_key === "prepare:selection")!.result.__generationTrace;
    expect(inspectGenerationEvidence(broken).designElection.issues).toContain("preparation_receipt_identity_mismatch:prepare:selection");
  });

  it("audits confidence-weighted suitability without requiring excluded high-uncertainty scores", async () => {
    const s = await scenario({ count: 14, allReady: true, localSelection: true, confidenceRanking: true });
    expect(s.inspect().checks.filter(c => !c.passed)).toEqual([]);
    expect(s.inspect().designElection.complete).toBe(true);
  });

  it("rejects a modified preparation receipt on resume without repurchasing the selector", async () => {
    const s = await scenario({ count: 3, allReady: true });
    const selection = s.operations.get("prepare:selection");
    selection.result.__preparationReceipt.expectation = { ...selection.result.__preparationReceipt.expectation, requestHash: "f".repeat(64) };
    const effect = vi.fn(async () => { throw new Error("Unexpected provider call"); });
    await expect(prepareOrchestratedGeneration(s.request.input, actor, false, Date.now() + 600_000, {
      generationConfig: s.request.generation_config,
      operation: async (key, work) => { const existing = s.operations.get(`prepare:${key}`); return existing ? readJournalResult(existing.result) : work(); },
      loadContext: effect, preferences: effect, retrieve: effect, hydrate: async ids => s.definitions.filter(d => ids.includes(d.id)),
      recentSelections: effect, generate: effect,
      shortlist: p => shortlistCompleteDesigns(p, effect),
    })).rejects.toMatchObject({ failure: { code: "preparation_contract_incompatible", stage: "selection" } });
    expect(effect).not.toHaveBeenCalled();
    expect(s.inspect().designElection.issues).toContain("preparation_receipt_identity_mismatch:prepare:selection");
  }, 30000);

  it.runIf(process.env.POSTSPARK_REAL_RENDER_TEST === "1")("verifies the seven-slide journey through real transport, renderer and reopened local PostgreSQL", async () => {
    const originalEnv = { ...ENV }, dir = await mkdtemp(join(tmpdir(), "postspark-seven-slide-"));
    let pg: PGlite | undefined;
    const replies = new Map<string, any>();
    const requests: any[] = [];
    const userText = (messages: any[]) => {
      const content = messages.find(m => m.role === "user")?.content;
      return typeof content === "string" ? content : content?.find((part: any) => part.type === "text")?.text;
    };
    ENV.openRouterApiKey = "fixture-no-network";
    ENV.localDemandEnabled = false;
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, options: any) => {
      const payload = JSON.parse(String(options.body)), key = userText(payload.messages), response = replies.get(key);
      if (!response) throw new Error("Unmocked provider request blocked");
      requests.push(payload);
      return new Response(JSON.stringify({ ...response, id: `controlled-${requests.length}`, model: payload.model,
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.001 } }), { status: 200 });
    }));
    try {
      const measureText = await createComponentTextMeasurer(completeDesignTestDefinitions().flatMap(d => d.assets));
      const s = await scenario({ count: 3, slideCount: 7, allReady: true, editorial: true, measureText, renderReviewScenes,
        transport: async (params, response) => { replies.set(userText(params.messages), response); return invokeLLM(params); },
      });
      expect(s.request.status, JSON.stringify(s.request.proposals.map(p => p.failure))).toBe("completed");
      expect(s.request.proposals.every(p => p.status === "ready")).toBe(true);
      expect(requests).toHaveLength(7); // intent + 3 copies + 3 reviews
      const selectionTrace = s.operations.get("prepare:selection").result.__generationTrace;
      expect(selectionTrace.calls).toEqual([]);
      for (const p of s.request.proposals) if (p.status === "ready") {
        expect(p.bundle.slides).toHaveLength(7);
        expect(p.reviews?.at(-1)?.reviewedSlides).toEqual([0, 1, 2, 3, 4, 5, 6]);
      }

      pg = await generationReleasePostgresFixture({ dataDir: dir });
      for (const name of ["0044_generation_model_config.sql", "0046_generation_review_v10.sql", "0052_generation_preparation_reconciliation.sql", "0054_generation_execution_requirements.sql"])
        await pg.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8"));
      const scalar = async (sql: string, args: unknown[] = []) => (await pg!.query<{ value: any }>(sql, args)).rows[0]?.value;
      for (const d of s.definitions) {
        await pg.query("INSERT INTO postspark.design_components(id,definition_hash,definition,kind,status,actor_id) VALUES($1,$2,$3::jsonb,'content','approved',$4)",
          [d.id, d.hash, JSON.stringify(d), actor]);
        for (const a of d.assets) if (a.kind === "bundled")
          await pg.query("INSERT INTO postspark.generation_v5_bundled_assets(id,sha256,mime_type,bytes,family,weight,license) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
            [a.id, a.sha256, a.mimeType, a.bytes, a.family, a.weight, a.license]);
        else {
          await pg.query("INSERT INTO postspark.design_catalog_assets(id,manifest) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING", [a.id, JSON.stringify(a)]);
          await pg.query("INSERT INTO postspark.design_component_assets(component_id,asset_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [d.id, a.id]);
        }
      }
      await scalar("SELECT postspark.generation_admit_configured($1,$2,$3,$4,$5::jsonb,false,now()+interval '10 minutes',$6::jsonb) value",
        [runId, actor, runId, "a".repeat(64), JSON.stringify(s.request.input), JSON.stringify(s.request.generation_config)]);
      const claimed = await scalar("SELECT postspark.generation_v5_claim('seven-slide-test') value");
      const update = (action: string, payload: unknown) => scalar("SELECT postspark.generation_v5_lease_update($1,$2,$3,$4::jsonb) value", [runId, claimed.leaseToken, action, JSON.stringify(payload)]);
      const saveOperation = async (op: any) => {
        await scalar("SELECT postspark.generation_v5_operation($1,$2,$3,'begin',NULL) value", [runId, claimed.leaseToken, op.operation_key]);
        if (op.expectation) await scalar(`SELECT postspark.${op.operation_key.startsWith("prepare:") ? "generation_preparation_expectation" : "generation_review_expectation"}($1,$2,$3,$4::jsonb) value`,
          [runId, claimed.leaseToken, op.operation_key, JSON.stringify(op.expectation)]);
        await scalar("SELECT postspark.generation_v5_operation($1,$2,$3,'complete',$4::jsonb) value", [runId, claimed.leaseToken, op.operation_key, JSON.stringify(op.result)]);
      };
      for (const op of s.evidenceInput.operations.filter(o => o.operation_key.startsWith("prepare:"))) await saveOperation(op);
      await update("prepared", s.prepared);
      for (const p of s.request.proposals) await update("checkpoint", { delivery: {
        proposalId: p.proposalId, runId, slot: p.slot, revision: p.revision, status: "running", contractVersion: 1,
      }, projection: null });
      for (const op of s.evidenceInput.operations.filter(o => !o.operation_key.startsWith("prepare:"))) await saveOperation(op);
      for (const p of s.request.proposals) if (p.status === "ready")
        await update("commit", { delivery: p, projection: projectProposalVariation(p.bundle, s.request.input) });
      await scalar("SELECT postspark.generation_v5_finish($1,$2,'completed',NULL) value", [runId, claimed.leaseToken]);
      const persisted = await scalar("SELECT to_jsonb(r) value FROM postspark.generation_v5_requests r WHERE id=$1", [runId]);
      expect(persisted.status).toBe("completed"); expect(persisted.billing_debited).toBe(40);
      expect(await scalar("SELECT count(*)::int value FROM postspark.spark_transactions")).toBe(1);
      const ops = (await pg.query<any>("SELECT operation_key,state,result,expectation FROM postspark.generation_v5_operations WHERE request_id=$1", [runId])).rows;
      const reservation = await scalar("SELECT to_jsonb(r) value FROM postspark.next_spark_reservations r WHERE id=$1", [persisted.billing_reservation_id]);
      expect(inspectGenerationEvidence({ request: persisted, operations: ops, reservation }).checks.filter(c => !c.passed)).toEqual([]);

      await pg.exec("ALTER TABLE postspark.posts ADD COLUMN canvas_model jsonb; ALTER TABLE postspark.posts ADD COLUMN user_uuid uuid;");
      for (const p of s.request.proposals) if (p.status === "ready") {
        const model = await compileCompleteDesign(p.bundle, { assetDeadline: performance.now() + 5000 });
        const payload = canvasModelToSavePayload(model, { inputType: "text", inputContent: s.request.input.content });
        await pg.query("INSERT INTO postspark.posts(id,user_uuid,canvas_model) VALUES($1,$2,$3::jsonb)", [p.slot + 1, actor, JSON.stringify(payload.canvasModel)]);
      }
      await pg.close(); pg = new PGlite(dir);
      const rows = (await pg.query<any>("SELECT id,canvas_model FROM postspark.posts WHERE user_uuid=$1 ORDER BY id", [actor])).rows;
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        const proposal = s.request.proposals[row.id - 1];
        if (proposal.status !== "ready") throw new Error("Expected ready proposal");
        const reopened = savedPostToCanvasModel({ id: Number(row.id), canvas_model: row.canvas_model } as any);
        expect(reopened.slides.map(slide => arsenalHash(slide.composition))).toEqual(proposal.bundle.slides.map(slide => arsenalHash(slide.composition)));
      }
    } finally {
      await pg?.close(); await closeReviewRenderer(); await rm(dir, { recursive: true, force: true });
      Object.assign(ENV, originalEnv); vi.unstubAllGlobals();
    }
  }, 120_000);

  it.each([false, true, "automatic-v4"] as const)("audits PostgreSQL V10 commit, settlement and replay without repurchase (mode=%s)", async mode => {
    const automatic = mode === "automatic-v4", editorial = mode === true;
    const expectedStatus = automatic ? "completed" : "partial", expectedDebit = automatic ? 10 : 7;
    // Current editorial receipts pin the deterministic selector. Two families
    // yield a genuine partial; the historical case retains its paid selector.
    const s = await scenario({ count: editorial ? 2 : 3, editorial, ...(automatic ? {automatic:true,allReady:true,localSelection:true} : editorial ? { localSelection: true } : {}) }),
      pg = await generationReleasePostgresFixture();
    try {
      if (automatic) {
        expect(s.prepared.reviewExecutionConfig).toMatchObject({automaticReviewVersion:4,nativeInventoryVersion:1});
        expect(s.request.proposals.map(p=>p.status)).toEqual(["ready","ready","ready"]);
        const calls=s.generate.mock.calls.map(([params])=>params);
        expect(calls.filter(p=>p.traceLabel?.endsWith("_copy"))).toHaveLength(3);
        expect(calls.filter(p=>p.taskRoute==="post_evaluation")).toHaveLength(3);
        expect(calls.some(p=>p.traceLabel?.includes("evidence_repair"))).toBe(false);
        for(const proposal of s.request.proposals){
          const review=proposal.reviews!.at(-1)!;
          expect(review).toMatchObject({automaticReviewVersion:4,status:"passed",inspectionStatus:"reviewed"});
          expect(review).not.toHaveProperty("unitChecks");expect(review).not.toHaveProperty("factualAudit");
          const raw=s.operations.get(review.operationKeys[0]).result;
          expect(JSON.parse(raw.choices[0].message.content)).toMatchObject({status:"reviewed",limitation:null,findings:[]});
        }
      }
      if (editorial) {
        expect(s.prepared.planning?.intent.editorial).toEqual(s.editorial);
        expect(s.prepared.planning?.editorialCatalog).toEqual(s.frozenEditorialCatalog);
        const calls = s.generate.mock.calls.map(([params]) => params);
        expect(calls.filter(p => p.traceLabel === "generation_intent_v1")).toHaveLength(1);
        const copies = calls.filter(p => p.traceLabel?.endsWith("_copy"));
        expect(copies).toHaveLength(2);
        for (const copy of copies) {
          const prompt = copy.messages.find(m => m.role === "user")!.content as string;
          const paragraphs = prompt.split("\n\n");
          const plan = JSON.parse(paragraphs.find(p => p.startsWith("Plano narrativo e visual congelado"))!.split("\n").slice(1).join("\n"));
          expect(plan.intent.editorial).toEqual(s.editorial);
          const readingLines = paragraphs.find(p => p.startsWith("Leitura editorial parcial:"))!.split("\n");
          const definitions = JSON.parse(readingLines[1]);
          expect(definitions).toEqual([s.frozenEditorialCatalog.document.intents[0]]);
          expect(JSON.parse(readingLines.find(line => line.startsWith("Sinais congelados: "))!.slice("Sinais congelados: ".length))).toEqual(s.editorial);
          expect(prompt).toContain("ausência é neutra");
        }
        const reviews = calls.filter(p => p.taskRoute === "post_evaluation");
        expect(reviews).toHaveLength(2);
        for (const review of reviews) {
          const data = reviewPayloadV7(review);
          expect(data.generationIntent.editorial).toEqual(s.editorial);
          expect(data.editorialInterpretation.definitions).toEqual([s.frozenEditorialCatalog.document.intents[0]]);
          expect(data.editorialInterpretation.rule).toContain("Aspectos ausentes são neutros");
          expect(data.checkInventories.intentChecks).toEqual([]);
        }
      }
      for (const name of [
        "0044_generation_model_config.sql",
        ...(automatic ? ["0045_staged_catalog_local_admission.sql"] : []),
        "0046_generation_review_v10.sql",
        "0052_generation_preparation_reconciliation.sql",
        ...(automatic ? ["0053_generation_model_choices.sql","0057_generation_task_routing.sql","0060_generation_task_routing_v2.sql","0054_generation_execution_requirements.sql","0055_editorial_catalog.sql","0061_generation_review_exceptions.sql"] : []),
      ])
        await pg.exec(
          readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8")
        );
      const scalar = async (sql: string, params: unknown[] = []) =>
        (await pg.query<{ value: any }>(sql, params)).rows[0]?.value;
      for (const definition of s.definitions) {
        await pg.query(
          "INSERT INTO postspark.design_components(id,definition_hash,definition,kind,status,actor_id) VALUES($1,$2,$3::jsonb,'content','approved',$4)",
          [definition.id, definition.hash, JSON.stringify(definition), actor]
        );
        for (const asset of definition.assets) {
          if (asset.kind === "bundled")
            await pg.query(
              "INSERT INTO postspark.generation_v5_bundled_assets(id,sha256,mime_type,bytes,family,weight,license) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
              [
                asset.id,
                asset.sha256,
                asset.mimeType,
                asset.bytes,
                asset.family,
                asset.weight,
                asset.license,
              ]
            );
          else {
            await pg.query(
              "INSERT INTO postspark.design_catalog_assets(id,manifest) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING",
              [asset.id, JSON.stringify(asset)]
            );
            await pg.query(
              "INSERT INTO postspark.design_component_assets(component_id,asset_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
              [definition.id, asset.id]
            );
          }
        }
      }
      let catalogRevision: number | null = null;
      if (automatic) {
        for (const definition of s.definitions) await pg.query("INSERT INTO postspark.design_component_search_documents(component_id,definition_hash,card) VALUES($1,$2,$3::jsonb)",[definition.id,definition.hash,JSON.stringify(compactComponentCard(definition))]);
        const staged = await scalar("SELECT postspark.catalog_staged_snapshot() value");
        catalogRevision = await scalar("SELECT postspark.catalog_publish($1,$2::jsonb,'{}'::jsonb,$3) value",[staged.sourceRevision,JSON.stringify(staged.rows),arsenalHash(staged.rows)]);
        expect(catalogRevision).toBe(1);
      }
      await scalar(
        "SELECT postspark.generation_admit_configured($1,$2,$3,$4,$5::jsonb,false,now()+interval '5 minutes',$6::jsonb,NULL,$7::bigint) value",
        [
          runId,
          actor,
          runId,
          arsenalHash(s.request.input),
          JSON.stringify(s.request.input),
          JSON.stringify(s.request.generation_config),
          catalogRevision,
        ]
      );
      const claimed = await scalar(
        "SELECT postspark.generation_v5_claim('evidence-test') value"
      );
      const update = (action: string, value: unknown) =>
        scalar(
          "SELECT postspark.generation_v5_lease_update($1,$2,$3,$4::jsonb) value",
          [runId, claimed.leaseToken, action, JSON.stringify(value)]
        );
      const saveOperation = async (op: any) => {
        await scalar("SELECT postspark.generation_v5_operation($1,$2,$3,'begin',NULL) value", [runId, claimed.leaseToken, op.operation_key]);
        if (op.expectation) await scalar(`SELECT postspark.${op.operation_key.startsWith("prepare:") ? "generation_preparation_expectation" : "generation_review_expectation"}($1,$2,$3,$4::jsonb) value`,
          [runId, claimed.leaseToken, op.operation_key, JSON.stringify(op.expectation)]);
        await scalar("SELECT postspark.generation_v5_operation($1,$2,$3,'complete',$4::jsonb) value", [runId, claimed.leaseToken, op.operation_key, JSON.stringify(op.result)]);
      };
      for (const op of s.evidenceInput.operations.filter(o => o.operation_key.startsWith("prepare:"))) await saveOperation(op);
      await update("prepared", s.prepared);
      for (const proposal of s.request.proposals.filter(
        p => p.status === "ready"
      ))
        await update("checkpoint", {
          delivery: {
            proposalId: proposal.proposalId,
            runId,
            slot: proposal.slot,
            revision: proposal.revision,
            attempt: proposal.attempt,
            status: "running",
            contractVersion: 1,
          },
        });
      // Persist exactly the controlled provider receipts produced by the real workflow.
      for (const op of s.evidenceInput.operations.filter(o => !o.operation_key.startsWith("prepare:"))) await saveOperation(op);
      const coordinatorInput = {
        ...s.prepared,
        generationConfig: s.request.generation_config,
        requestId: runId,
        runId,
        actor,
        prompt: s.request.input.content,
        platform: s.request.input.platform,
        postMode: s.request.input.postMode,
      };
      for (const proposal of s.request.proposals)
        await update(proposal.status === "ready" ? "commit" : "checkpoint", {
          delivery: proposal,
          projection:
            proposal.status === "ready"
              ? projectProposalVariation(proposal.bundle, coordinatorInput)
              : null,
        });
      await scalar(
        "SELECT postspark.generation_v5_finish($1,$2,$3,NULL) value",
        [runId, claimed.leaseToken,expectedStatus]
      );
      const request = await scalar(
        "SELECT to_jsonb(r) value FROM postspark.generation_v5_requests r WHERE id=$1",
        [runId]
      );
      if (editorial) {
        expect(request.generation_config.editorialIntentVersion).toBe(1);
        expect(request.prepared.planning.editorialCatalog).toEqual(s.frozenEditorialCatalog);
        expect(request.prepared.planning.intent.editorial).toEqual(s.editorial);
      }
      const operations = (
        await pg.query<any>(
          "SELECT operation_key,state,result,expectation FROM postspark.generation_v5_operations WHERE request_id=$1",
          [runId]
        )
      ).rows;
      const reservation = await scalar(
        "SELECT to_jsonb(r) value FROM postspark.next_spark_reservations r WHERE id=$1",
        [request.billing_reservation_id]
      );
      const result = inspectGenerationEvidence({
        request,
        operations,
        reservation,
      });
      expect(result.checks.filter(c => !c.passed), JSON.stringify(result.designElection.issues)).toEqual([]);
      expect(result).toMatchObject({
        passed: true,
        status: expectedStatus,
        billing: { debited: expectedDebit },
      });
      expect(
        await scalar(
          "SELECT sparks value FROM postspark.profiles WHERE id=$1",
          [actor]
        )
      ).toBe(150-expectedDebit);
      const count = s.generate.mock.calls.length;
      const replayed = await new GenerationCoordinator(
        { ...coordinatorInput, ...request.prepared, generationConfig: request.generation_config, savedProposals: request.proposals },
        { actor, generateText: s.generate }
      ).start();
      expect(replayed.overallStatus).toBe(expectedStatus);
      expect(replayed.proposals).toEqual(request.proposals);
      if (automatic) {
        const completedReview = operations.find(op=>op.operation_key.includes(":review:") && JSON.parse(op.result.choices[0].message.content).status === "reviewed");
        expect(completedReview).toBeDefined();
        const after=(await pg.query<any>("SELECT operation_key,state,result,expectation FROM postspark.generation_v5_operations WHERE request_id=$1",[runId])).rows;
        expect(after).toEqual(operations);
      }
      expect(s.generate).toHaveBeenCalledTimes(count);
      await scalar("SELECT postspark.generation_settle($1) value", [runId]);
      expect(
        await scalar(
          "SELECT count(*)::int value FROM postspark.spark_transactions"
        )
      ).toBe(1);
    } finally {
      await pg.close();
    }
  }, 30000);
  it.each([1, 2] as const)(
    "preserves valid reordered model fields in strategy %s",
    async strategy => {
      const s = await scenario({ strategy, reverseFields: true, count: 3 });
      expect(s.inspect().checks.filter(c => !c.passed)).toEqual([]);
    }
  );
  it("retains the V9 baseline with its config4, context4 and compact profile2 contracts", async () => {
    const s = await scenario({ strategy: 1 });
    expect(s.prepared).toMatchObject({
      preparationVersion: 5,
      reviewPolicyVersion: 9,
    });
    expect(s.request.status).toBe("completed");
    expect(s.inspect().checks.filter(c => !c.passed)).toEqual([]);
    expect(s.inspect().passed).toBe(true);
  });
  it("verifies real preparation/coordinator receipts, all 14 assessed profiles and a two-ready partial", async () => {
    const s = await scenario();
    expect(s.request.status).toBe("partial");
    const result = s.inspect();
    expect(result.designElection).toMatchObject({
      complete: true,
      selectionProfileVersion: 3,
      evaluated: 14,
      eligibleOffers: 14,
      selectorOptions: 12,
    });
    expect(result.checks.filter(c => !c.passed), JSON.stringify(result.designElection.issues)).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.proposals.map(p => p.status)).toEqual([
      "ready",
      "ready",
      "failed",
    ]);
    expect(result.billing.debited).toBe(7);
    const broken = structuredClone(s.evidenceInput);
    broken.request.billing_debited = 10;
    expect(
      inspectGenerationEvidence(broken).checks.find(
        c => c.code === "billing_amount_matches_deliveries"
      )?.passed
    ).toBe(false);
  });
  it("distinguishes an invalid model plan from insufficient fit without erasing ready siblings", async () => {
    const s = await scenario({ badSlot: true, count: 3 });
    expect(s.prepared.planning?.slots[2].status).toBe("planning_failed");
    expect(s.request.proposals[2].failure?.code).toBe(
      "planning_response_invalid"
    );
    expect(s.inspect().checks.filter(c => !c.passed)).toEqual([]);
    expect(s.inspect().passed).toBe(true);
    const broken = structuredClone(s.evidenceInput);
    broken.request.proposals[2].failure!.code = "selection_insufficient_fit";
    expect(inspectGenerationEvidence(broken).designElection.complete).toBe(
      false
    );
  });
  it("checks fb1's actual plan and operation prefix while retaining canonical review identities", async () => {
    const s = await scenario({ fallback: true });
    expect(s.request.proposals[0]).toMatchObject({
      status: "ready",
      attempt: { index: 1, id: `p-${runId}-0-fb1` },
    });
    const result = s.inspect();
    expect(result.designElection.issues).toEqual([]);
    expect(result.checks.filter(c => !c.passed), JSON.stringify(result.designElection.issues)).toEqual([]);
    const reviewOp = s.evidenceInput.operations.find(o =>
      o.operation_key.startsWith(`p-${runId}-0-fb1:review:`)
    )!;
    expect(reviewOp.result.__proposalReview.proposalId).toBe(`p-${runId}-0`);
    reviewOp.result.__proposalReview.proposalId += "-fb1";
    expect(
      s
        .inspect()
        .checks.some(
          c => c.code === "review_receipt_context_pinned" && !c.passed
        )
    ).toBe(true);
  });
  it("rejects resealed profile/card changes, omitted JEV receipts and mismatched delivered units", async () => {
    const s = await scenario();
    const original = s.prepared.planning!;
    const { hash, ...changed } = structuredClone(original);
    changed.candidates[0].profileHash = "a".repeat(64);
    s.request.prepared.planning = sealGenerationPlanningReceipt(changed);
    expect(s.inspect().designElection.issues).toContain(
      "planning_candidates_reconstruction_mismatch"
    );
    s.request.prepared.planning = original;
    expect(
      inspectDesignElection(
        s.request,
        s.evidenceInput.operations.filter(
          o => !o.operation_key.startsWith("prepare:design-shortlist:")
        )
      ).complete
    ).toBe(false);
    const proposal = s.request.proposals[0];
    if (proposal.status !== "ready") throw new Error("fixture_not_ready");
    proposal.bundle.caption = "Uma legenda diferente depois da revisão";
    expect(
      s
        .inspect()
        .checks.some(
          c => c.code === "final_review_matches_delivered_text" && !c.passed
        )
    ).toBe(true);
  });
});
import { decodeGenerationSelectionCatalog } from "@shared/generationSelectionTransport";
