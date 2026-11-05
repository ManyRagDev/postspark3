import { z } from "zod";
import type { ComponentCardV1 } from "@shared/componentAssembly";
import type { OrchestratedGenerationInput } from "@shared/generationRequest";
import { arsenalHash } from "@shared/arsenalContent";
import { completeDesignFields } from "@shared/completeDesignGeneration";
import {
  resolveDesignFamilyRepertoires,
  materializeDesignFamilyOffer,
} from "@shared/designRepertoire";
import {
  describeDesignFamilyRepertoire,
  describeConciseDesignFamilyRepertoire,
  describeCoverOnlyDesignFamilyRepertoire,
  compactDesignProfileV3Legend,
  type CompactOfferProfileV3,
} from "@shared/compactDesignProfile";
import { buildHeuristicGenerationPlan } from "./heuristicPlanBuilder";
import {
  encodeGenerationSelectionCatalog,
  type GenerationSelectionCandidate,
} from "@shared/generationSelectionTransport";
import type { DesignFamilyRepertoire } from "@shared/designRepertoire";
import { normalizeGenerationIntent, type GenerationIntent } from "@shared/generationPlan";
import type { GenerationModelConfig } from "@shared/generationModel";
import {
  DESIGN_SHORTLIST_SIZE,
  type DesignShortlistResult,
} from "../../designCatalog/designShortlist";
import type { InvokeParams } from "../../_core/llm";
import type { EditorialContext } from "./editorialContextV8";
import {
  designHasPhotographicContent,
  type RecentDesignSelection,
} from "@shared/designSelection";
import {
  generationIntentLegacySchema,
  generationEditorialIntentSchema,
  generationPlanResponseSchema,
  generationSlotPlanSchema,
  validateGenerationIntent,
  validateGenerationPlan,
  sealGenerationPlanningReceipt,
  repertoireMeetsMedia,
  type GenerationSlotPlan,
} from "@shared/generationPlan";
import { GenerationFailureError } from "@shared/generationFailure";
import type { CatalogCoverage } from "@shared/designElection";
import {
  selectionInputReceiptSchema,
  type PreparedGeneration,
  type PreparationDeps,
} from "./generationPreparation";
import { editorialContextV9 } from "./editorialContextV9";
import {
  resolvedEditorialContext,
  referenceContextInstructions,
} from "./editorialContextV8";
import { compactSelectionContextV1 } from "./editorialContextTransport";
import { resolveReviewExecutionConfigV10 } from "./reviewExecutionConfigV10";
import { assertPinnedReviewConfig } from "./pinnedReviewConfig";
import { generationModelCallOptions, preparationCallBudget } from "../generationModel";
import { preparationReceipt, readPreparationResult, type PreparationExpectation } from "@shared/generationPreparationReceipt";
import { failureFromError } from "@shared/generationFailure";
import { preparationTransportSnapshot } from "../../_core/llm";
import { extractTextContent, safeJsonParse } from "../llmJson";
import { recordGenerationEvent } from "../generationTrace";
import { ENV } from "../../_core/env";
import { hydrateCompleteDesignComponents } from "../../designCatalog/completeDesignStore";
import { safeObserveEditorialAffinity } from "../editorialAffinity/observe";
import { combineEditorialDesignProfile, editorialIntentInstructions, editorialSelectionGuidance, editorialRequestEvidence, validateEditorialIntent } from "@shared/editorialIntent";
import { pinnedCatalogRevision } from "../../designCatalog/versionedCatalog";
import { readEditorialCatalog } from "../../designCatalog/editorialCatalog";
import { buildFamilySelectionCandidates } from "@shared/designFamilySelection";
import { shortlistDesignFamilies } from "../../designCatalog/familyShortlist";
import type { GenerationPlanningReceipt } from "@shared/generationPlan";
import { FAMILY_RETRIEVAL_POLICY } from "@shared/familyRetrieval";
import { retrieveFamilyCandidates, familySearchQuery, assertFamilyRetrieval } from "../../designCatalog/familyRetrieval";
import { readSearchIndex, sourceSearchDocument } from "../../designCatalog/familySearchIndex";
import { boundedFamilyShortlist } from "../../designCatalog/boundedFamilyShortlist";

const narrativePlanningGuidance = [
  "Distribua primeiro o conteúdo essencial pelo número de páginas solicitado, considerando a capacidade real das variantes, antes de acrescentar seções.",
  "Cada página de desenvolvimento deve entregar uma ideia do pedido, aprofundá-la com explicação concreta ou mostrar uma aplicação/exemplo claramente ilustrativo. Não gaste as ideias cedo para depois preencher páginas com vantagens abstratas ou slogans que apenas renomeiam o assunto.",
  "Dê profundidade proporcional aos itens: um item não deve virar só título enquanto os demais recebem explicação sem motivo editorial. Uma síntese pode repetir conteúdo quando organiza a conclusão ou orienta uma ação específica; não precisa inventar outra lista.",
  "Repetir uma composição útil é preferível a forçar uma mudança sem contribuição para a leitura. O ritmo emerge dessa distribuição e do papel de cada página, sem uma sequência visual obrigatória.",
].join(" ");

type Base = Pick<
  PreparedGeneration,
  | "contextContent"
  | "sourceReferences"
  | "imageSourceReading"
  | "visualPreference"
  | "executionBrief"
  | "imageObligation"
>;
export interface PlanningPreparationInput extends Base {
  input: OrchestratedGenerationInput;
  cards: ComponentCardV1[];
  coverage: CatalogCoverage | null;
  recentSelections: RecentDesignSelection[];
  count: number;
  requestedPhotoMix: boolean;
  visualReferenceImages: string[];
  visualReferenceSites: unknown;
  experimental: boolean;
  deadlineMs: number;
}

/** Canonical evidence remains unchanged for JEV, validation and audit. */
export function buildGenerationSelectionCatalog(
  repertoires: DesignFamilyRepertoire[],
  profiles: Record<string, CompactOfferProfileV3>,
  evaluated: DesignShortlistResult["evaluated"]
): GenerationSelectionCandidate[] {
  return repertoires.map(r => ({
    candidateId: r.defaultOffer.offerId,
    profile: profiles[r.defaultOffer.offerId],
    suitability: evaluated.find(e => e.id === r.defaultOffer.offerId) ?? null,
    fields: Object.fromEntries(
      Array.from(
        new Map(r.slides.flatMap(s => s.variants).map(c => [c.id, c])).values()
      ).map(c => [c.id, completeDesignFields(c)])
    ),
  }));
}

export type GenerationSelectionRequestInput = Pick<
  PlanningPreparationInput,
  | "input"
  | "count"
  | "imageObligation"
  | "visualPreference"
  | "requestedPhotoMix"
  | "visualReferenceImages"
  | "deadlineMs"
> & {
  intent: GenerationIntent;
  editorialContext: EditorialContext;
  catalog: GenerationSelectionCandidate[];
  generationConfig: GenerationModelConfig;
  signal?: AbortSignal;
};

/** Pure request builder shared with pre-dispatch checks. Only the catalog is encoded. */
export function buildGenerationSelectionRequest(
  args: GenerationSelectionRequestInput
): InvokeParams {
  const schema = z.toJSONSchema(generationPlanResponseSchema);
  delete schema.$schema;
  const instruction = `Planeje exatamente três slots (0,1,2), cada um viable ou insufficient_fit. Escolha uma família e exatamente uma variante oferecida por página, antes de escrever a copy. Preserve a relação visual com a capa e varie pelo papel: leitura, lista, comparação, imagem comentada, destaque ou síntese. Repetir variante é válido quando serve à progressão. Não há obrigação de três famílias/teses diferentes: adequação vem antes de variedade. reason explica adequação; editorialApproach explica conteúdo útil. Distribua contentIds pelos fieldId reais e captionContentIds. Campos obrigatórios devem ter assignment; itemCount indica itens independentes, nunca palavras de uma frase fragmentada. Promessas de N itens exigem N ideias identificáveis na superfície pedida. Não some capacidades de alternativas incompatíveis. As estimativas de chars são indicativas; capacidades desconhecidas não são proibições. ${narrativePlanningGuidance} Só marque insufficient_fit quando nenhum candidato permite cumprir requisitos essenciais; descreva o impedimento concreto em reason/unmetRequirementIds. Não invente copy ou componentId para preencher esse slot. ${args.requestedPhotoMix ? "Nos slots viáveis 0 e 1 use fotografia; slot2 deve ser tipográfico sem fotografia." : ""}`;
  const data = JSON.stringify({
    intent: args.intent,
    editorialContext: compactSelectionContextV1(args.editorialContext),
    requestedPages: args.count,
    imageObligation: args.imageObligation,
    visualPreference: args.visualPreference,
    profileLegend: compactDesignProfileV3Legend,
    catalog: encodeGenerationSelectionCatalog(args.catalog, args.generationConfig.preparationBudget?.catalogEncoding ?? 1),
  });
  return {
    taskRoute:
      args.input.postMode === "carousel"
        ? "carousel_generation"
        : "static_generation",
    traceLabel: "generation_selection_v1",
    signal: args.signal,
    maxTransportAttempts: 1,
    disableStructuredRepair: true,
    messages: [
      {
        role: "system",
        content: `${referenceContextInstructions}\n${instruction}`,
      },
      {
        role: "user",
        content: args.visualReferenceImages.length
          ? [
              { type: "text", text: data },
              ...args.visualReferenceImages.map(url => ({
                type: "image_url" as const,
                image_url: { url, detail: "high" as const },
              })),
            ]
          : data,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "generation_selection_v1", strict: true, schema },
    },
    maxCompletionTokens: args.count > 5 ? 14000 : 9000,
    ...generationModelCallOptions(args.generationConfig),
    ...preparationCallBudget(args.generationConfig, "selection", args.deadlineMs),
  };
}

export async function verifyPlannedEligibility(
  prepared: PreparedGeneration,
  experimental: boolean,
  hydrate = hydrateCompleteDesignComponents,
  requestedSlots = [0, 1, 2]
) {
  const plan = prepared.planning;
  if (
    !plan ||
    prepared.reviewPolicyVersion !== 10 ||
    prepared.reviewExecutionConfig?.policyVersion !== 10 ||
    prepared.editorialContext?.version !== 3 ||
    prepared.editorialContext.hash !== prepared.editorialContextHash ||
    plan.slots.length !== 3 ||
    plan.offers.length !== 3 ||
    prepared.selectedDefinitions.length !== 3
  )
    throw new GenerationFailureError(
      "preparation_contract_incompatible",
      "catalog"
    );
  assertPinnedReviewConfig(prepared.reviewExecutionConfig);
  const { hash, ...basis } = plan;
  if (hash !== arsenalHash(basis))
    throw new GenerationFailureError(
      "preparation_contract_incompatible",
      "catalog"
    );
  const pinned = [] as Array<{ componentId: string; componentHash: string }>;
  for (let slot = 0; slot < 3; slot++) {
    const selected = plan.slots[slot],
      offer = plan.offers[slot],
      definitions = prepared.selectedDefinitions[slot];
    if (selected.slot !== slot)
      throw new GenerationFailureError(
        "preparation_contract_incompatible",
        "catalog"
      );
    if (selected.status !== "viable") {
      if (offer !== null || definitions.length)
        throw new GenerationFailureError(
          "preparation_contract_incompatible",
          "catalog"
        );
      continue;
    }
    if (
      !offer ||
      validateGenerationPlan(selected, offer, plan.intent).length ||
      definitions.length !== offer.slides.length ||
      offer.slides.some(
        (s, i) =>
          definitions[i]?.id !== s.componentId ||
          definitions[i]?.hash !== s.componentHash
      )
    )
      throw new GenerationFailureError(
        "preparation_contract_incompatible",
        "catalog"
      );
    if (requestedSlots.includes(slot)) pinned.push(...offer.slides);
  }
  if (!pinned.length) return;
  const current = await hydrate(
    Array.from(new Set(pinned.map(s => s.componentId))),
    experimental
  );
  const byId = new Map(current.map(d => [d.id, d.hash]));
  if (pinned.some(s => byId.get(s.componentId) !== s.componentHash))
    throw new GenerationFailureError("catalog_component_ineligible", "catalog");
}

/** One interpretation, then a joint narrative/visual choice. Copy is a later effect. */
export async function preparePlannedGeneration(
  args: PlanningPreparationInput,
  deps: PreparationDeps
): Promise<PreparedGeneration> {
  const {
    input,
    cards,
    count,
    executionBrief,
    contextContent,
    sourceReferences,
    imageObligation,
    deadlineMs,
  } = args;
  if (!deps.generationConfig)
    throw new GenerationFailureError(
      "preparation_contract_incompatible",
      "selection"
    );
  const requestText = [
    input.content,
    executionBrief?.rawInput,
    executionBrief?.notes,
    executionBrief?.callToAction,
    ...(executionBrief?.contentRequirements?.map(r => r.value) ?? []),
    ...(executionBrief?.slides?.map(s => s.rawText) ?? []),
    ...(executionBrief?.mustInclude ?? []),
    ...(executionBrief?.mustKeep ?? []),
  ]
    .filter(Boolean)
    .join("\n");

  const editorialContext = editorialContextV9({
    prompt: input.content,
    executionBrief: executionBrief ?? undefined,
    contextContent,
    sourceReferences,
    projectSnapshot: input.projectSnapshot,
    projectDossier:
      input.projectDossier ?? (input.projectId ? contextContent : undefined),
    platform: input.platform,
    postMode: input.postMode,
    tone: input.tone,
  });
  const editorialEnabled = deps.generationConfig.editorialIntentVersion === 1;
  const preliminary = resolveDesignFamilyRepertoires(cards, {
    slideCount: count, contentMode: executionBrief?.interventionLevel === "visual_only" ? "literal" : "compose", instructions: requestText,
  }).filter(r => repertoireMeetsMedia(r, imageObligation));
  let semanticIndex: Awaited<ReturnType<typeof readSearchIndex>> | undefined;
  const loadSemanticIndex = async (catalog: Parameters<typeof readSearchIndex>[1]) => {
    try {
      const revision = pinnedCatalogRevision() ?? catalog?.catalogRevision ?? ENV.localCatalogRevision;
      semanticIndex = await (deps.familySearchIndex ? deps.familySearchIndex(catalog) : readSearchIndex(revision, catalog));
      for (const repertoire of preliminary) {
        const root = repertoire.slides.flatMap(s => s.variants).find(c => c.id === repertoire.sourceId)!;
        const document = sourceSearchDocument(root, catalog), indexed = semanticIndex.index.documents.find(d => d.id === root.id);
        if (!indexed || indexed.sourceHash !== document.sourceHash || indexed.textHash !== document.textHash) throw new Error("stale_index");
      }
      return semanticIndex;
    } catch {
      throw new GenerationFailureError("catalog_retrieval_unavailable", "catalog");
    }
  };
  const expectedInput = {
    brief: "Pedido e fontes no contexto editorial referenciado.",
    requirements: resolvedEditorialContext(editorialContext).requirements,
    editorialContext,
    reviewExecutionConfig: resolveReviewExecutionConfigV10(
      deps.generationConfig.model
    ),
    jevModel: ENV.openRouterDesignSelectionModel,
    shortlistContextEncoding: 1 as const,
    shortlistProfileEncoding: "repertoire_pages_v1" as const,
  };
  const selectionInput = selectionInputReceiptSchema.parse(
    await deps.operation("selection_input", async () => {
      if (editorialEnabled) {
        const revision = pinnedCatalogRevision();
        const editorialCatalog = deps.readEditorialCatalog
          ? await deps.readEditorialCatalog()
          : revision ? await readEditorialCatalog(revision) : null;
        // Fail before the paid interpretation if a large catalogue has no
        // complete local index. A replay uses the recorded receipt instead.
        const large = new Set(preliminary.map(r => r.family)).size > FAMILY_RETRIEVAL_POLICY.initialFamilies;
        const semantic = large ? await loadSemanticIndex(editorialCatalog) : undefined;
        return { ...expectedInput, editorialCatalog, familyRankingVersion: 1 as const, familyRetrievalVersion: 1 as const,
          ...(semantic ? { familyRetrievalIndex: { hash: semantic.index.hash, modelFingerprint: semantic.index.modelFingerprint } } : {}) };
      }
      const observation = await safeObserveEditorialAffinity(
        { input, cards, imageObligation, repertoireInstructions: requestText, signal: deps.signal, deadlineMs },
        deps.observeEditorialAffinity
      );
      return { ...expectedInput, ...(observation ? { editorialAffinity: observation } : {}) };
    })
  );
  if (editorialEnabled && (!Object.hasOwn(selectionInput, "editorialCatalog") ||
      (pinnedCatalogRevision() && selectionInput.editorialCatalog && selectionInput.editorialCatalog.catalogRevision !== pinnedCatalogRevision())))
    throw new GenerationFailureError("preparation_contract_incompatible", "selection");
  const editorialCatalog = selectionInput.editorialCatalog ?? null;
  const familyFirst = selectionInput.familyRankingVersion === 1;
  const boundedRetrieval = selectionInput.familyRetrievalVersion === 1;
  if (boundedRetrieval && !familyFirst) throw new GenerationFailureError("preparation_contract_incompatible", "selection");
  assertPinnedReviewConfig(selectionInput.reviewExecutionConfig);
  if (
    selectionInput.reviewExecutionConfig.policyVersion !== 10 ||
    selectionInput.editorialContext?.hash !== editorialContext.hash
  )
    throw new GenerationFailureError(
      "preparation_contract_incompatible",
      "selection"
    );

  async function generate<T>(
    key: string,
    schema: z.ZodType<T>,
    instruction: string | InvokeParams,
    data?: unknown,
    maxCompletionTokens?: number
  ): Promise<T> {
    const json = z.toJSONSchema(schema);
    delete json.$schema;
    const params: InvokeParams = typeof instruction !== "string" ? instruction : {
      taskRoute: input.postMode === "carousel" ? "carousel_generation" : "static_generation",
      traceLabel: `generation_${key}_v1`, signal: deps.signal,
      maxTransportAttempts: 1, disableStructuredRepair: true,
      messages: [
        { role: "system", content: `${referenceContextInstructions}\n${instruction}` },
        { role: "user", content: JSON.stringify(data) },
      ],
      response_format: { type: "json_schema", json_schema: { name: `generation_${key}_v1`, strict: true, schema: json } },
      maxCompletionTokens,
      ...generationModelCallOptions(deps.generationConfig),
      ...preparationCallBudget(deps.generationConfig!, key === "intent" ? "intent" : "selection", deadlineMs),
    };
    const receiptEnabled = Boolean(deps.generationConfig!.preparationBudget);
    const transport = receiptEnabled ? preparationTransportSnapshot(params) : undefined;
    const expectation: PreparationExpectation = {
      kind: "generation_preparation_v1", configurationHash: deps.generationConfig!.configurationHash,
      model: deps.generationConfig!.model, messagesHash: arsenalHash(transport?.messages ?? params.messages),
      responseFormatHash: arsenalHash(params.response_format),
      requestHash: arsenalHash({ messages: params.messages, responseFormat: params.response_format, model: deps.generationConfig!.model,
        reasoningEffort: params.reasoningEffort, maxCompletionTokens: params.maxCompletionTokens }),
    };
    let raw: unknown;
    try { raw = await deps.operation(key, async () => {
      deps.signal?.throwIfAborted();
      if (Date.now() >= (params.deadlineMs ?? deadlineMs))
        throw new GenerationFailureError("provider_timeout", "selection", true);
      const serialized = JSON.stringify(transport?.messages ?? params.messages);
      recordGenerationEvent({ stage: "preparation_request", status: "started", detail: key, data: {
        requestHash: expectation.requestHash, model: expectation.model,
        requestCharacters: serialized.length, requestBytes: Buffer.byteLength(serialized),
        estimatedInputTokens: Math.ceil(serialized.length / 3), tokenCountIsEstimate: true,
        transportTimeoutMs: params.transportTimeoutMs ?? 60_000,
        deadlineAt: params.deadlineMs, remainingMs: (params.deadlineMs ?? deadlineMs) - Date.now(),
        maxCompletionTokens: params.maxCompletionTokens,
      } });
      if (receiptEnabled) await deps.expectPreparation?.(key, expectation);
      const response = await deps.generate({ ...params, ...(receiptEnabled ? { structuredValidationOwner: "caller" as const, durablePreparationReceipt: true } : {}) });
      if (receiptEnabled) return preparationReceipt(response, expectation);
      return safeJsonParse<unknown>(
        extractTextContent(response.choices?.[0]?.message?.content),
        null
      );
    }); } catch (error) {
      // The journal retains uncertainty independently of the public phase/reason.
      if (error instanceof Error && error.message.startsWith("reconciliation_required:")) throw error;
      const failure = failureFromError(error, "selection");
      throw Object.assign(new GenerationFailureError(failure.code, "selection", failure.retryable), { cause: error });
    }
    if (receiptEnabled) {
      if (!raw || typeof raw !== "object" || !("__preparationReceipt" in raw))
        throw new GenerationFailureError("preparation_contract_incompatible", "selection", false);
      const receipt = raw as { id?: unknown; model?: unknown; __preparationReceipt?: { version?: unknown; expectation?: unknown } };
      if (receipt.__preparationReceipt?.version !== 1 || typeof receipt.id !== "string" || !receipt.id || receipt.model !== expectation.model ||
          arsenalHash(receipt.__preparationReceipt.expectation) !== arsenalHash(expectation))
        throw new GenerationFailureError("preparation_contract_incompatible", "selection", false);
    }
    const parsed = schema.safeParse(readPreparationResult(raw));
    if (!parsed.success)
      throw new GenerationFailureError(
        "planning_response_invalid",
        "selection"
      );
    return parsed.data;
  }

  const factualSourceIds = new Set(
    editorialContext.sources
      .filter(
        source =>
          source.origin !== "requirement" &&
          !source.origin.startsWith("piece_") &&
          !editorialContext.guidanceRanges.some(
            range =>
              range.sourceId === source.id &&
              range.start === 0 &&
              range.end >= source.text.length
          )
      )
      .map(s => s.id)
  );
  const providerIntent = await generate(
    "intent",
    editorialEnabled ? generationEditorialIntentSchema : generationIntentLegacySchema,
    "Interprete a peça antes de escolher o layout. Identifique objetivo útil, tom contextual e núcleo de conteúdo, distinguindo instrução explícita de inferência. Um tema sério pode pedir cuidado mesmo sem dizer 'sério'; contexto não é licença para inventar restrições. Não imponha engajamento, humor, CTA, suspense ou três teses diferentes. Adaptação controlled preserva identidade e fatos com texto/distribuição adequados; literal preserva texto e ordem expressos. Classifique cada requirement com kind. Use kind=content somente para obrigações de conteúdo que precisam aparecer materialmente na arte ou legenda. Use kind=execution para formato, tom, escolha de mídia e limites factuais (ex.: composição tipográfica, sem foto, usar os fatos fornecidos): essas diretrizes continuam preservadas e verificadas no contexto editorial, com itemCount=null, e não exigem um content próprio. Todo requirement de kind=content explícito deve estar associado a pelo menos um content por requirementIds; requestQuote deve ser trecho literal do pedido para origin=explicit. itemCount só quando uma quantidade exata de itens for exigida. Para cada requisito com N itens, dê exatamente N content IDs distintos (um por item), separados de títulos e fechamento. Cada content descreve uma ideia, não copy final; sourceIds são referências reais para fatos, ou [] para ideia editorial sem suporte factual. Em sourceIds use estritamente os IDs existentes em factualSourceIds: " +
      (Array.from(factualSourceIds).join(", ") || "nenhuma (deve usar [])") +
      ". Nunca invente ou alucine novos IDs de fontes. Requisitos pedidos na arte não podem migrar para caption por falta de espaço. Não trate orientações de marca como fatos sobre o produto." +
      (editorialEnabled ? `\n${editorialIntentInstructions}` : ""),
    {
      editorialContext: compactSelectionContextV1(editorialContext),
      factualSourceIds: Array.from(factualSourceIds),
      ...(editorialEnabled ? {
        editorialVocabulary: editorialCatalog?.document.intents ?? [],
        editorialRequestEvidence: editorialRequestEvidence({ ...input, executionBrief: executionBrief ?? undefined }),
      } : {}),
      requestedPages: count,
      adaptation:
        executionBrief?.interventionLevel === "visual_only"
          ? "literal"
          : "controlled",
    },
    editorialEnabled ? 6500 : 4500
  );

  const intent = normalizeGenerationIntent(providerIntent, count, factualSourceIds, requestText);
  if (
    (editorialEnabled && (!intent.editorial || validateEditorialIntent(intent.editorial, editorialCatalog,
      editorialRequestEvidence({ ...input, executionBrief: executionBrief ?? undefined })).length > 0)) ||
    validateGenerationIntent(intent, requestText, factualSourceIds).length ||
    intent.adaptation !==
      (executionBrief?.interventionLevel === "visual_only"
        ? "literal"
        : "controlled")
  )
    throw new GenerationFailureError("planning_response_invalid", "selection");

  const repertoires = resolveDesignFamilyRepertoires(cards, {
    slideCount: count,
    contentMode: intent.adaptation === "literal" ? "literal" : "compose",
    instructions: requestText,
  });
  const mediaCapable = (r: (typeof repertoires)[number]) =>
    r.slides.some(s => s.variants.some(c => c.mediaSlots.length));
  const eligible = repertoires.filter(r =>
    repertoireMeetsMedia(r, imageObligation)
  );
  // The persisted selection input keeps shortlist requests reproducible on retry.
  const describeProfile = selectionInput.shortlistProfileEncoding === "repertoire_pages_v1"
    ? describeConciseDesignFamilyRepertoire
    : describeCoverOnlyDesignFamilyRepertoire;
  const profiles = Object.fromEntries(
    eligible.map(r => [
      r.defaultOffer.offerId,
      editorialEnabled ? combineEditorialDesignProfile(describeProfile(r), editorialCatalog, r.sourceId, r.sourceHash) : describeProfile(r),
    ])
  );
  const projections = eligible.map(r => ({
    ...r.slides[0].variants[0],
    id: r.defaultOffer.offerId,
    hash: r.defaultOffer.signature,
  }));
  const families = familyFirst ? buildFamilySelectionCandidates(eligible, editorialCatalog) : [];
  let familyElection: GenerationPlanningReceipt["familyElection"] = familyFirst
    ? { version: 1, candidates: [], ranking: [], shortlistedIds: [] } : undefined;
  const runShortlist: NonNullable<PreparationDeps["shortlist"]> = async params => {
    if (!familyFirst) return deps.shortlist(params);
    if (!boundedRetrieval) {
      const result = await shortlistDesignFamilies(params, families, deps.shortlist);
      familyElection = result.familyElection;
      return result;
    }
    const visualQuery = args.visualPreference.enabled ? args.visualPreference.language ?? "" : "";
    const query = familySearchQuery(intent, editorialCatalog, visualQuery);
    const retrieval = await deps.operation("family_retrieval", async () => {
      if (families.length > FAMILY_RETRIEVAL_POLICY.initialFamilies && !semanticIndex) await loadSemanticIndex(editorialCatalog);
      const pinned = selectionInput.familyRetrievalIndex;
      if (semanticIndex && pinned && (semanticIndex.index.hash !== pinned.hash || semanticIndex.index.modelFingerprint !== pinned.modelFingerprint))
        throw new GenerationFailureError("preparation_contract_incompatible", "selection");
      return retrieveFamilyCandidates({ families, intent, catalog: editorialCatalog, visualPreference: visualQuery,
        mixedMedia: args.requestedPhotoMix, semantic: semanticIndex, signal: deps.signal });
    });
    assertFamilyRetrieval(retrieval, families, query);
    const result = await boundedFamilyShortlist({ input: params, families, retrieval, shortlist: deps.shortlist,
      sufficient: partial => {
        const retained = new Set(partial.cards.map(c => c.id));
        const options = eligible.filter(r => retained.has(r.defaultOffer.offerId));
        // Account for the same assessed media restoration performed below.
        for (const photo of args.requestedPhotoMix ? [true, false] : imageObligation.required ? [true] : []) {
          if (options.some(r => mediaCapable(r) === photo)) continue;
          const extra = eligible.find(r => mediaCapable(r) === photo && partial.evaluated.some(e => e.id === r.defaultOffer.offerId && e.score >= 2));
          if (extra) options.push(extra);
        }
        return buildHeuristicGenerationPlan({ familyFirst: true, intent, eligible: options, shortlist: partial,
          imageObligation, requestedPhotoMix: args.requestedPhotoMix, slideCount: count, recentSelections: args.recentSelections }).slots.every(s => s.status === "viable");
      } });
    familyElection = result.familyElection;
    recordGenerationEvent({ stage: "family_retrieval", status: "completed", detail: "hybrid_local_v1", data: {
      eligibleFamilies: families.length, recovered: retrieval.initialIds.length, expanded: result.familyElection.retrieval?.expanded,
      evaluatedFamilies: result.familyElection.ranking.length, transport: result.familyElection.retrieval?.transport,
      indexHash: retrieval.indexHash, queryHash: retrieval.queryHash,
    } });
    return result;
  };
  if (eligible.length && deps.preflightSelection && !familyFirst) {
    await deps.preflightSelection({
      request: buildGenerationSelectionRequest({
        ...args,
        intent,
        editorialContext,
        generationConfig: deps.generationConfig,
        signal: deps.signal,
        catalog: buildGenerationSelectionCatalog(
          eligible,
          profiles,
          projections.map(c => ({
            id: c.id,
            hash: c.hash,
            score: 3.9999999999999996,
            confidence: 0.9999999999999999,
          }))
        ),
      }),
      maxCandidates: Math.min(
        eligible.length,
        DESIGN_SHORTLIST_SIZE +
          (args.requestedPhotoMix || imageObligation.required ? 1 : 0)
      ),
    });
  }
  const shortlist = eligible.length || boundedRetrieval
    ? await runShortlist({
        ...(editorialEnabled ? { editorialIntentVersion: 1 as const } : {}),
        cards: projections,
        profiles,
        offers: eligible.map(r => r.defaultOffer),
        rankingPolicy: "suitability_first",
        model: selectionInput.jevModel,
        brief: JSON.stringify({
          editorialContext: compactSelectionContextV1(editorialContext),
          intent,
          ...(editorialEnabled ? { editorialSelectionGuidance } : {}),
          imageObligation,
          visualPreference: args.visualPreference,
          visualReferenceSites: args.visualReferenceSites,
        }),
        slideCount: count,
        deadlineMs,
        signal: deps.signal,
        recentSelections: args.recentSelections,
        operation: deps.operation,
      })
    : {
        cards: [],
        evaluated: [],
        batches: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      };
  const retained = new Set(shortlist.cards.map(c => c.id));
  const offered = eligible.filter(r => retained.has(r.defaultOffer.offerId));
  // Required media can only restore a real assessed candidate; no fabricated capabilities.
  for (const photo of args.requestedPhotoMix
    ? [true, false]
    : imageObligation.required
      ? [true]
      : []) {
    if (offered.some(r => mediaCapable(r) === photo)) continue;
    const candidate = eligible
      .filter(r => mediaCapable(r) === photo && (!boundedRetrieval || shortlist.evaluated.some(e => e.id === r.defaultOffer.offerId && e.score >= 2)))
      .sort((a, b) => {
        const score = (id: string) => {
          const result = shortlist.evaluated.find(e => e.id === id);
          return result ? result.score * (familyFirst ? 0.5 + 0.5 * result.confidence : 1) : 0;
        };
        return score(b.defaultOffer.offerId) - score(a.defaultOffer.offerId);
      })[0];
    if (candidate) {
      if (familyElection) {
        const family = families.find(f => f.family === candidate.family)!;
        offered.push(...family.repertoires.filter(r => !offered.some(o => o.defaultOffer.offerId === r.defaultOffer.offerId)));
        if (!familyElection.shortlistedIds.includes(family.id)) familyElection.shortlistedIds.push(family.id);
      } else offered.push(candidate);
    }
  }
  const selectionRequest = () => buildGenerationSelectionRequest({
    ...args, intent, editorialContext, generationConfig: deps.generationConfig!, signal: deps.signal,
    catalog: buildGenerationSelectionCatalog(offered, profiles, shortlist.evaluated),
  });
  let selection: { version: 1; slots: GenerationSlotPlan[] } = offered.length
    ? deps.useLegacyLlmSelection && !deps.generateSelection
      ? await generate(
            "selection",
            generationPlanResponseSchema,
            selectionRequest()
          )
      : await deps.operation("selection", async () => {
        deps.signal?.throwIfAborted();
        if (deps.generateSelection) {
          return deps.generateSelection({ offered, profiles, shortlist, intent });
        }
        recordGenerationEvent({ stage: "generation_plan", status: "completed", detail: "deterministic_local", data: { paidEffect: false } });
        return buildHeuristicGenerationPlan({
          familyFirst,
          intent,
          eligible: offered,
          shortlist,
          imageObligation,
          requestedPhotoMix: args.requestedPhotoMix,
          slideCount: count,
          recentSelections: args.recentSelections,
        });
      })
    : {
        version: 1 as const,
        slots: [0, 1, 2].map(slot => ({
          slot,
          status: "insufficient_fit" as const,
          reason:
            "O catálogo não possui uma sequência completa com as capacidades e mídia exigidas.",
          unmetRequirementIds: intent.requirements.map(r => r.id),
        })),
      };
  // A resumed paid selector keeps its original identity checks and result. The
  // journal returns that receipt without dispatching another provider call.
  if (selection && "__preparationReceipt" in selection)
    selection = await generate("selection", generationPlanResponseSchema, selectionRequest());
  if (new Set(selection.slots.map(s => s.slot)).size !== 3)
    throw new GenerationFailureError("planning_response_invalid", "selection");
  const slots: GenerationSlotPlan[] = selection.slots
    .slice()
    .sort((a, b) => a.slot - b.slot);
  const offers = slots.map((slot, index) => {
    if (slot.status !== "viable") return null;
    const rejectSlot = (violations: string[]) => {
      slots[index] = {
        slot: index,
        status: "planning_failed",
        reason:
          "O planejamento retornado não respeitou os candidatos, campos, itens ou mídia disponíveis.",
        unmetRequirementIds: intent.requirements.map(r => r.id),
      };
      recordGenerationEvent({
        stage: "generation_plan",
        status: "failed",
        detail: "composition_infeasible",
        data: { slot: index, violations },
      });
      return null;
    };
    const repertoire = offered.find(
      r => r.defaultOffer.offerId === slot.candidateId
    );
    if (!repertoire) return rejectSlot(["candidate_not_offered"]);
    let offer;
    try {
      offer = materializeDesignFamilyOffer(
        repertoire,
        slot.pages.map(p => p.componentId)
      );
    } catch {
      return rejectSlot(["component_not_offered_or_incompatible"]);
    }
    const violations = validateGenerationPlan(slot, offer, intent);
    const mediaCount = offer.slides.reduce(
      (n, s) => n + s.card.mediaSlots.length,
      0
    );
    const hasPhoto =
      mediaCount > 0 ||
      offer.slides.some(s => designHasPhotographicContent(s.card));
    if (
      (imageObligation.required &&
        mediaCount < Math.max(1, imageObligation.slotTargets)) ||
      (imageObligation.policy === "forbidden" && hasPhoto) ||
      (args.requestedPhotoMix && hasPhoto !== index < 2)
    )
      violations.push("media_obligation");
    if (violations.length) return rejectSlot(violations);
    return offer;
  });
  const ids = Array.from(
    new Set(offers.flatMap(o => o?.slides.map(s => s.componentId) ?? []))
  );
  const definitions = ids.length
    ? await deps.operation("definitions", () =>
        deps.hydrate(ids, args.experimental)
      )
    : [];
  const byId = new Map(definitions.map(d => [d.id, d]));
  const selectedDefinitions = offers.map(
    o =>
      o?.slides.map(s => {
        const d = byId.get(s.componentId);
        if (!d || d.hash !== s.componentHash)
          throw new GenerationFailureError(
            "catalog_component_ineligible",
            "catalog"
          );
        return d;
      }) ?? []
  );
  const planning = sealGenerationPlanningReceipt({
    version: 1,
    intent,
    ...(editorialEnabled ? { editorialCatalog } : {}),
    ...(familyElection ? { familyElection } : {}),
    slots,
    offers,
    catalogReceiptHash: args.coverage?.receiptHash ?? null,
    candidates: eligible.map(r => ({
      id: r.defaultOffer.offerId,
      signature: r.signature,
      profileHash: arsenalHash(profiles[r.defaultOffer.offerId]),
    })),
    selectorIds: offered.map(r => r.defaultOffer.offerId),
    ranking: shortlist.evaluated.map(({ id, score, confidence }) => ({
      id,
      score,
      confidence,
    })),
    recoveryRepertoires: slots.map((slot, index) =>
      slot.status !== "viable"
        ? []
        : offered
            .filter(
              r =>
                r.defaultOffer.offerId !== slot.candidateId &&
                (!args.requestedPhotoMix || mediaCapable(r) === index < 2)
            )
            .sort((a, b) => {
              const score = (id: string) =>
                shortlist.evaluated.find(e => e.id === id)?.score ?? 0;
              return (
                score(b.defaultOffer.offerId) - score(a.defaultOffer.offerId) ||
                Number(
                  offers.some(
                    (o, peer) => peer !== index && o?.family === a.family
                  )
                ) -
                  Number(
                    offers.some(
                      (o, peer) => peer !== index && o?.family === b.family
                    )
                  ) ||
                a.defaultOffer.offerId.localeCompare(b.defaultOffer.offerId)
              );
            })
            .slice(0, 2)
    ),
  });
  recordGenerationEvent({
    stage: "generation_plan",
    status: "completed",
    detail: "joint_narrative_visual_v1",
    data: {
      hash: planning.hash,
      slots: slots.map(s => ({ slot: s.slot, status: s.status })),
      candidates: eligible.length,
      selectedFamilies: offers.map(o => o?.family ?? null),
      selectedVariants: offers.map(
        o => o?.slides.map(s => s.componentId) ?? []
      ),
    },
  });
  return {
    preparationVersion: 6,
    ...(selectionInput.editorialAffinity ? { editorialAffinity: selectionInput.editorialAffinity } : {}),
    reviewPolicyVersion: 10,
    reviewExecutionConfig: selectionInput.reviewExecutionConfig,
    editorialContext,
    editorialContextHash: editorialContext.hash,
    planning,
    selectedDefinitions,
    selectionReasons: slots.map(s => s.reason),
    editorialApproaches: slots.map(s =>
      s.status === "viable" ? s.editorialApproach : null
    ),
    contextContent,
    sourceReferences,
    imageSourceReading: args.imageSourceReading,
    visualPreference: args.visualPreference,
    executionBrief,
    imageObligation,
    perProposalImageObligations: args.requestedPhotoMix
      ? slots.map((_, index) => ({
          policy: index < 2 ? "required" : "forbidden",
          required: index < 2,
          purpose: index < 2 ? "editorial-photo" : "none",
          reason: "Distribuição de mídia explicitamente pedida.",
          slotTargets: index < 2 ? 1 : 0,
        }))
      : undefined,
  };
}

/** A new family receives its own page/field plan, journaled before its copy call. */
export async function replanGenerationSlot(
  args: {
    prepared: PreparedGeneration;
    slot: number;
    attempt: number;
    currentFamilies: string[];
    generationConfig: NonNullable<PreparationDeps["generationConfig"]>;
    deadlineMs: number;
    experimental: boolean;
  },
  deps: Pick<PreparationDeps, "generate" | "hydrate" | "operation" | "signal" | "useLegacyLlmSelection">
) {
  const { prepared, slot, attempt } = args;
  const planning = prepared.planning;
  const repertoire = planning?.recoveryRepertoires[slot]?.[attempt - 1];
  if (
    !planning ||
    !repertoire ||
    !prepared.editorialContext ||
    attempt < 1 ||
    attempt > 2
  )
    return null;
  // Native Structured Outputs requires an object at the root, not a union.
  const responseSchema = z
    .object({ slotPlan: generationSlotPlanSchema })
    .strict();
  const schema = z.toJSONSchema(responseSchema);
  delete schema.$schema;
  const result = await deps.operation(
    `template_replan:${slot}:${attempt}`,
    async () => {
      if (!deps.useLegacyLlmSelection) {
        deps.signal?.throwIfAborted();
        const planned = buildHeuristicGenerationPlan({
          intent: planning.intent,
          eligible: [repertoire],
          shortlist: { cards: [], evaluated: [], batches: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
          imageObligation: prepared.perProposalImageObligations?.[slot] ?? prepared.imageObligation,
          slideCount: repertoire.slides.length,
        });
        recordGenerationEvent({ stage: "generation_plan", status: "completed", detail: "deterministic_local", data: { paidEffect: false, slot, attempt } });
        return { slotPlan: planned.slots[slot] };
      }
      const response = await deps.generate({
        traceLabel: "generation_template_replan_v1",
        taskRoute:
          repertoire.slides.length > 1
            ? "carousel_generation"
            : "static_generation",
        deadlineMs: args.deadlineMs,
        signal: deps.signal,
        maxTransportAttempts: 1,
        disableStructuredRepair: true,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "generation_template_replan_v1",
            strict: true,
            schema,
          },
        },
        maxCompletionTokens: 5500,
        ...generationModelCallOptions(args.generationConfig),
        messages: [
          {
            role: "system",
            content: `${referenceContextInstructions} A composição anterior não comportou o conteúdo com legibilidade. Replaneje apenas este slot na nova família, preservando requisitos, fatos e superfície da entrega. Reconsidere abordagem, propósito, ritmo e atribuição de cada campo para as capacidades desta família; não transporte automaticamente a abordagem antiga. Repetir família de outra proposta é permitido, mas procure uma diferença útil sem inventar fatos. Use componentIds/fieldIds documentados; retorne insufficient_fit se o novo plano também não comportar o pedido. Não escreva a copy. ${narrativePlanningGuidance}`,
          },
          {
            role: "user",
            content: JSON.stringify({
              slot,
              intent: planning.intent,
              editorialContext: compactSelectionContextV1(
                prepared.editorialContext!
              ),
              previousPlan: planning.slots[slot],
              candidateId: repertoire.defaultOffer.offerId,
              profileLegend: compactDesignProfileV3Legend,
              profile: describeDesignFamilyRepertoire(repertoire),
              currentFamilies: args.currentFamilies,
              fields: Object.fromEntries(
                Array.from(
                  new Map(
                    repertoire.slides
                      .flatMap(s => s.variants)
                      .map(c => [c.id, c])
                  ).values()
                ).map(c => [c.id, completeDesignFields(c)])
              ),
              imageObligation:
                prepared.perProposalImageObligations?.[slot] ??
                prepared.imageObligation,
            }),
          },
        ],
      });
      return safeJsonParse<unknown>(
        extractTextContent(response.choices?.[0]?.message?.content),
        null
      );
    }
  );
  const parsedPlan = responseSchema.safeParse(result);
  if (!parsedPlan.success)
    throw new GenerationFailureError("planning_response_invalid", "selection");
  const plan = parsedPlan.data.slotPlan;
  if (plan.slot !== slot)
    throw new GenerationFailureError("planning_response_invalid", "selection");
  if (plan.status === "insufficient_fit") return null;
  if (plan.candidateId !== repertoire.defaultOffer.offerId)
    throw new GenerationFailureError("planning_response_invalid", "selection");
  const offer = materializeDesignFamilyOffer(
    repertoire,
    plan.pages.map(p => p.componentId)
  );
  if (validateGenerationPlan(plan, offer, planning.intent).length) return null;
  const obligation =
    prepared.perProposalImageObligations?.[slot] ?? prepared.imageObligation;
  const mediaCount = offer.slides.reduce(
    (n, s) => n + s.card.mediaSlots.length,
    0
  );
  if (
    (obligation.required && mediaCount < Math.max(1, obligation.slotTargets)) ||
    (obligation.policy === "forbidden" &&
      (mediaCount ||
        offer.slides.some(s => designHasPhotographicContent(s.card))))
  )
    return null;
  const definitions = await deps.hydrate(
    Array.from(new Set(offer.slides.map(s => s.componentId))),
    args.experimental
  );
  const byId = new Map(definitions.map(d => [d.id, d]));
  const sequence = offer.slides.map(s => {
    const d = byId.get(s.componentId);
    if (!d || d.hash !== s.componentHash)
      throw new GenerationFailureError(
        "catalog_component_ineligible",
        "catalog"
      );
    return d;
  });
  recordGenerationEvent({
    stage: "generation_plan",
    status: "completed",
    detail: "template_replanned_v1",
    data: {
      slot,
      attempt,
      family: offer.family,
      variants: offer.slides.map(s => ({
        id: s.componentId,
        hash: s.componentHash,
      })),
      planHash: arsenalHash(plan),
      currentFamilies: args.currentFamilies,
    },
  });
  return { definitions: sequence, plan };
}
