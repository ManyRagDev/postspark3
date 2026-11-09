import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { ENV } from "../../_core/env";
import { invokeLLM } from "../../_core/llm";
import { arsenalHash } from "../../../shared/arsenalContent";
import {
  componentCardV1Schema,
  componentDefinitionV1Schema,
} from "../../../shared/componentAssembly";
import { orchestratedGenerationInputSchema } from "../../../shared/generationRequest";
import { proposalDeliverySchema } from "../../../shared/generationContracts";
import { defaultStudioPreferences } from "../../../shared/studioPreferences";
import { buildImageGenerationPrompt } from "../../../shared/imageGeneration";
import { resolveGenerationModelConfig } from "../../ai/generationModel";
import { resolveReviewExecutionConfigV9 } from "../../ai/workflows/reviewExecutionConfigV9";
import { resolveReviewExecutionConfigV10 } from "../../ai/workflows/reviewExecutionConfigV10";
import {
  runWithGenerationTrace,
  getGenerationTrace,
  type GenerationTrace,
} from "../../ai/generationTrace";
import {
  readCatalogSnapshot,
  readCatalogDefinition,
  validateCatalogSnapshot,
  type CatalogSnapshot,
} from "../../designCatalog/versionedCatalog";
import { reconcileCatalogCoverage } from "../../designCatalog/catalogCoverage";
import {
  prepareOrchestratedGeneration,
  verifyPreparedEligibility,
} from "../../ai/workflows/generationPreparation";
import { replanGenerationSlot } from "../../ai/workflows/generationPlanning";
import { loadGenerationSources } from "../../ai/workflows/generationRuntime";
import { GenerationCoordinator } from "../../ai/workflows/generationCoordinator";
import {
  assertReviewRendererAvailable,
  closeReviewRenderer,
  renderReviewScenes,
} from "../../ai/workflows/proposalRenderer";
import {
  aspectRatioForProposalSlot,
  resolveProposalMediaReferences,
} from "../../ai/workflows/proposalMedia";
import { generateBackgroundImage } from "../../imageGenerateBackground";
import { verifyArsenalAsset } from "../../designCatalog/arsenalAssets";
import { generationMatrixCorpus } from "./corpus";
import {
  matrixPlan,
  blindReport,
  type MatrixOptions,
  type CatalogReference,
  type MatrixEntry,
  type BlindPiece,
} from "./core";
import {
  MatrixBudget,
  installMatrixTransport,
  reserveQuote,
  paidOperationScope,
  type PaidCall,
  type PriceQuote,
} from "./budget";
import { localJournal, writeJson } from "./journal";
import { loadContinuationOrigin } from "./campaignAnalysis";
import { openSharedBudget, readSharedBudget } from "./sharedBudget";
import { loadSelectionContinuation } from "./selectionContinuation";
import {
  createSelectionBudgetPreflight,
  quoteSelectionAdmission,
} from "./selectionAdmission";

const actor = "00000000-0000-4000-8000-000000000001";
async function readOptional<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error: any) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}
export async function loadMatrixCatalog(reference: CatalogReference) {
  const raw =
    "revision" in reference
      ? await readCatalogSnapshot(reference.revision)
      : JSON.parse(await readFile(reference.snapshot, "utf8"));
  const snapshot: CatalogSnapshot = structuredClone(
    Array.isArray(raw) ? { rows: raw } : (raw.snapshot ?? raw)
  );
  validateCatalogSnapshot(snapshot);
  if (raw.hash && raw.hash !== arsenalHash(snapshot))
    throw new Error("comparison_catalog_hash_mismatch");
  const indexHash = arsenalHash(snapshot);
  const revision =
    "revision" in reference
      ? reference.revision
      : raw.revision === undefined
        ? undefined
        : String(raw.revision);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (cursor < snapshot.rows.length) {
        const row = snapshot.rows[cursor++];
        if (row.definition) continue;
        if (!revision)
          throw new Error(
            "comparison_index_snapshot_requires_revision_for_immutable_definitions"
          );
        const definition = componentDefinitionV1Schema.parse(
          await readCatalogDefinition(
            revision,
            row.component_id,
            row.definition_hash
          )
        );
        row.definition = definition;
        row.assets = definition.assets;
      }
    })
  );
  validateCatalogSnapshot(snapshot, true);
  const definitions = snapshot.rows.map(row =>
    componentDefinitionV1Schema.parse(row.definition)
  );
  const byId = new Map(
    definitions.map(definition => [definition.id, definition])
  );
  const hydrate = async (ids: string[], experimental = false) =>
    ids.map(id => {
      const d = byId.get(id),
        status = snapshot.rows.find(row => row.component_id === id)
          ?.design_components.status;
      if (
        !d ||
        (status !== "approved" && !(experimental && status === "draft"))
      )
        throw new Error(
          "comparison_definition_not_eligible_in_pinned_snapshot"
        );
      return d;
    });
  const registered = snapshot.rows.map(row => {
    const card = componentCardV1Schema.parse(row.card);
    return {
      id: row.component_id,
      definition_hash: row.definition_hash,
      status: row.design_components.status,
      aspect_ratios: card.aspectRatios,
      roles: card.roles,
      source: row.design_components.source,
      design: card.completeDesign!,
    };
  });
  return {
    reference,
    snapshot,
    indexHash,
    hash: arsenalHash(snapshot),
    definitions,
    hydrate,
    retrieve: async (input: Parameters<typeof reconcileCatalogCoverage>[0]) =>
      reconcileCatalogCoverage(
        input,
        { registered, indexed: snapshot.rows },
        true
      ),
  };
}
const catalog = loadMatrixCatalog;
/** Opt-in read-only preflight; may download immutable definitions, never calls AI. */
export async function validateMatrixCatalogs(options: MatrixOptions) {
  if (!options.baseline || !options.revised)
    throw new Error("catalog_validation_requires_both_pinned_catalogs");
  const catalogs = await Promise.all([
    catalog(options.baseline),
    catalog(options.revised),
  ]);
  return catalogs.map(c => ({
    reference: c.reference,
    indexHash: c.indexHash,
    hydratedHash: c.hash,
    definitions: c.definitions.length,
  }));
}

/** Reconstructs the current selector from completed source receipts. No provider or user storage effects. */
export async function validateSelectionContinuation(options: MatrixOptions) {
  if (
    !options.selectionReplay ||
    !options.sharedBudget ||
    !options.baseline ||
    !options.revised
  )
    throw new Error("selection_replay_preflight_requires_pinned_shared_inputs");
  const replay = await loadSelectionContinuation(options.selectionReplay);
  const shared = await readSharedBudget(options.sharedBudget);
  if (
    shared.origin.ledgerHash !== replay.receipt.sourceLedger.sha256 ||
    arsenalHash(shared.calls) !== arsenalHash(replay.calls)
  )
    throw new Error("selection_replay_preflight_budget_changed");
  const entries = matrixPlan({
      ...options,
      campaignId: replay.identityCampaignId,
    }),
    entry = entries[0];
  if (entries.length !== 1 || entry.id !== replay.receipt.entryId)
    throw new Error("selection_replay_preflight_scope_changed");
  const item = generationMatrixCorpus.find(c => c.id === entry.caseId)!;
  const input = orchestratedGenerationInputSchema.parse({
    ownerId: actor,
    inputType: "text",
    content: item.content,
    platform: "instagram",
    postMode: item.mode,
    slideCount: "slides" in item ? item.slides : undefined,
    aspectRatio: "4:5",
    formatIntentConfirmed: true,
    includeDraftDesigns: options.includeDrafts,
    creationMode: "ideation",
    generationModel: entry.choice,
    idempotencyKey: entry.runId,
  });
  const previous = ENV.generationStrategyVersion;
  let config;
  try {
    ENV.generationStrategyVersion = 2;
    config = resolveGenerationModelConfig(input);
  } finally {
    ENV.generationStrategyVersion = previous;
  }
  const baseline = await catalog(options.baseline),
    revised = await catalog(options.revised);
  replay.assertBasis({
    entries,
    inputs: [{ id: entry.id, hash: arsenalHash(input) }],
    configs: [config],
    catalogs: { baseline: baseline.hash, revised: revised.hash },
    includeDrafts: options.includeDrafts,
    ancillaryModels: {
      jev: ENV.openRouterDesignSelectionModel,
      review: ENV.openRouterProposalReviewModel,
      vision: ENV.openRouterVisionModel,
      image: ENV.openRouterV5ImageModel,
    },
  });
  let selection: Parameters<typeof invokeLLM>[0] | undefined;
  let prepared:
    | Awaited<ReturnType<typeof prepareOrchestratedGeneration>>
    | undefined;
  let firstCopyRequest: Parameters<typeof invokeLLM>[0] | undefined;
  let coordinatorEntered = false;
  let selectionAdmission:
    | ReturnType<typeof quoteSelectionAdmission>
    | undefined;
  let networkAttempts = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    networkAttempts++;
    throw new Error("selection_preflight_network_forbidden");
  };
  const trace: GenerationTrace = {
    id: entry.runId,
    userUuid: actor,
    inputType: "text",
    inputContent: item.content,
    platform: "instagram",
    postMode: item.mode,
    creationMode: "ideation",
    requestedModel: config.model,
    startedAt: Date.now(),
    calls: [],
    events: [],
  };
  try {
    prepared = await runWithGenerationTrace(trace, () =>
      prepareOrchestratedGeneration(
        input,
        actor,
        options.includeDrafts,
        Date.now() + 600000,
        {
          generationConfig: config,
          generate: async params => {
            if (params.traceLabel === "generation_selection_v1")
              selection = params;
            const reused = replay.generate(params);
            if (reused) return reused;
            if (params.traceLabel !== "generation_selection_v1")
              throw new Error("selection_preflight_unexpected_inference");
            selection = params;
            throw new Error("selection_preflight_captured");
          },
          retrieve: revised.retrieve,
          hydrate: revised.hydrate,
          preferences: async () => defaultStudioPreferences,
          recentSelections: async () => [],
          loadContext: async () => replay.sourceData,
          operation: (key, work) => replay.operation(`prepare:${key}`, work),
          preflightSelection: async request => {
            const quote = shared.quotes.find(
              q => q.id === request.request.pinnedModel
            );
            if (!quote) throw new Error("selection_preflight_price_missing");
            selectionAdmission = quoteSelectionAdmission(request, quote);
            const remaining =
              shared.maxUsd -
              shared.calls.reduce(
                (n, c) => n + (c.actualUsd ?? c.reservedUsd),
                0
              );
            if (selectionAdmission.reservedUsd > remaining)
              throw new Error("selection_preflight_exceeds_remaining_budget");
          },
        }
      )
    );
    if (replay.receipt.completedSelection) {
      await verifyPreparedEligibility(
        prepared,
        options.includeDrafts,
        revised.hydrate
      );
      const controller = new AbortController();
      const coordinator = new GenerationCoordinator(
        {
          ...prepared,
          requestId: entry.runId,
          runId: entry.runId,
          actor,
          prompt: input.content,
          platform: input.platform,
          postMode: input.postMode,
          creationMode: input.creationMode,
          generationConfig: config,
          deadlineMs: Date.now() + 600000,
          signal: controller.signal,
          experimental: options.includeDrafts,
          executionBrief: input.executionBrief,
        },
        {
          actor,
          generateText: async params => {
            firstCopyRequest ??= params;
            controller.abort(new Error("selection_preflight_copy_captured"));
            throw new Error("selection_preflight_copy_captured");
          },
        }
      );
      coordinatorEntered = true;
      await coordinator.start({ maxConcurrency: 1 });
      if (!firstCopyRequest)
        throw new Error("selection_preflight_did_not_reach_copy");
    }
  } catch (error) {
    const expectedStop =
      error instanceof Error &&
      (replay.receipt.completedSelection
        ? Boolean(
            prepared &&
              coordinatorEntered &&
              firstCopyRequest &&
              error.message === "selection_preflight_copy_captured"
          )
        : error.message === "selection_preflight_captured");
    if (!expectedStop) throw error;
  } finally {
    globalThis.fetch = originalFetch;
  }
  if (!selection || networkAttempts)
    throw new Error("selection_preflight_incomplete");
  return {
    paidCalls: 0,
    networkAttempts,
    sourceReceiptHash: replay.receiptHash,
    verification: replay.verification(),
    sourceOutcomePreserved: "interrupted",
    mode: "mixed_functional_continuation",
    remainingCalls: shared.maxCalls - shared.calls.length,
    remainingUsd:
      shared.maxUsd -
      shared.calls.reduce((sum, c) => sum + (c.actualUsd ?? c.reservedUsd), 0),
    selectionParams: selection,
    preparedCompleted: Boolean(prepared),
    preparedDefinitionCounts: prepared?.selectedDefinitions.map(
      definitions => definitions.length
    ),
    coordinatorEntered,
    firstCopyRequest,
    firstCopyCaptured: Boolean(firstCopyRequest),
    selectionMessagesHash: arsenalHash(selection.messages),
    selectionAdmission,
    limitations: replay.receipt.limitations,
  };
}

/** Real preparation, coordinator, copy, image provider, measurements, renderer and reviewer.
 * Only operational storage is local: this harness does not reserve Sparks or create user posts. */
export async function runLiveMatrix(options: MatrixOptions) {
  await mkdir(join(options.output, "operator"), {
    recursive: true,
    mode: 0o700,
  });
  const lockPath = join(options.output, "operator", "RUNNING.lock");
  let lock;
  try {
    lock = await open(lockPath, "wx", 0o600);
  } catch {
    throw new Error(
      `comparison_output_locked: check ${lockPath} before resuming`
    );
  }
  try {
    await lock.writeFile(
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })
    );
    return await runLockedMatrix(options);
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
async function runLockedMatrix(options: MatrixOptions) {
  if (
    !options.live ||
    !options.maxCalls ||
    !options.maxUsd ||
    !options.baseline ||
    !options.revised
  )
    throw new Error("live_opt_in_and_budget_required");
  if (!ENV.openRouterApiKey)
    throw new Error("OpenRouter credential is required for live execution");
  const operator = join(options.output, "operator");
  await mkdir(operator, { recursive: true, mode: 0o700 });
  const selectionReplay = options.selectionReplay
    ? await loadSelectionContinuation(options.selectionReplay)
    : undefined;
  const entries = matrixPlan(
    selectionReplay
      ? { ...options, campaignId: selectionReplay.identityCampaignId }
      : options
  );
  const shared = options.sharedBudget
    ? await readSharedBudget(options.sharedBudget)
    : undefined;
  if (
    selectionReplay &&
    (!shared ||
      shared.origin.directory !== selectionReplay.receipt.sourceDirectory ||
      shared.origin.ledgerHash !==
        selectionReplay.receipt.sourceLedger.sha256 ||
      shared.origin.inheritedCount !== selectionReplay.receipt.inheritedCalls ||
      arsenalHash(shared.calls.slice(0, selectionReplay.calls.length)) !==
        arsenalHash(selectionReplay.calls))
  )
    throw new Error("selection_replay_budget_inheritance_changed");
  if (shared && (options.imageFile || options.sourceUrl))
    throw new Error("shared_campaign_allows_only_planned_synthetic_texts");
  if (
    shared &&
    (shared.campaigns[options.campaignId!]?.kind !== "matrix" ||
      shared.campaigns[options.campaignId!].maxExecutions !== entries.length)
  )
    throw new Error("shared_campaign_matrix_size_mismatch");
  if (
    shared &&
    arsenalHash(
      shared.campaigns[options.campaignId!].permittedRunIds?.slice().sort()
    ) !== arsenalHash(entries.map(e => e.runId).sort())
  )
    throw new Error("shared_campaign_matrix_identity_mismatch");
  if (shared)
    for (const name of ["baseline", "revised"] as const) {
      const ref = options[name]!,
        pinned = shared.catalogSnapshots?.[name];
      if (
        !("snapshot" in ref) ||
        !pinned ||
        ref.snapshot !== pinned.path ||
        createHash("sha256")
          .update(await readFile(ref.snapshot))
          .digest("hex") !== pinned.sha256
      )
        throw new Error("shared_campaign_catalog_snapshot_changed");
    }
  const origin = options.continueFrom
    ? await loadContinuationOrigin(options.continueFrom)
    : undefined;
  if (
    origin &&
    (origin.analysis.limits.usd !== options.maxUsd ||
      origin.analysis.limits.calls !== options.maxCalls ||
      arsenalHash(origin.manifest.entries) !== arsenalHash(entries))
  )
    throw new Error(
      "continuation_must_preserve_original_matrix_and_total_limits"
    );
  const inheritedIds = new Set(
    origin?.analysis.units
      .filter(u => u.exercised || u.operations.length)
      .map(u => u.id) ?? []
  );
  const catalogs = {
    1: await catalog(options.baseline),
    2: await catalog(options.revised),
  };
  let sourceImage: string | undefined;
  if (options.imageFile) {
    const bytes = await readFile(options.imageFile),
      checked = await verifyArsenalAsset(bytes, {});
    if (
      !/^image\/(png|jpeg|webp)$/.test(checked.manifest.mimeType) ||
      bytes.length > 8_000_000
    )
      throw new Error("comparison_image_must_be_png_jpeg_webp_under_8MB");
    sourceImage = `data:${checked.manifest.mimeType};base64,${bytes.toString("base64")}`;
  }
  const inputs = new Map(
    entries.map(entry => {
      const item = generationMatrixCorpus.find(c => c.id === entry.caseId)!;
      return [
        entry.id,
        orchestratedGenerationInputSchema.parse({
          ownerId: actor,
          inputType: "imageRequired" in item ? "image" : "text",
          content:
            entry.caseId === "condition" && options.sourceUrl
              ? "Crie um post com base na página fornecida. Preserve as condições materiais de prazos e gratuidade quando usadas. Não amplie a oferta."
              : item.content,
          sources:
            "imageRequired" in item
              ? [
                  {
                    id: "image-source",
                    kind: "image",
                    purpose: "content",
                    value: sourceImage,
                  },
                ]
              : entry.caseId === "condition" && options.sourceUrl
                ? [
                    {
                      id: "url-source",
                      kind: "url",
                      purpose: "content",
                      value: options.sourceUrl,
                    },
                  ]
                : undefined,
          platform: "instagram",
          postMode: item.mode,
          slideCount: "slides" in item ? item.slides : undefined,
          aspectRatio: "4:5",
          formatIntentConfirmed: true,
          includeDraftDesigns: options.includeDrafts,
          creationMode: "ideation",
          generationModel: entry.choice,
          idempotencyKey: entry.runId,
        }),
      ];
    })
  );
  const configs = entries.map(entry => {
    const previous = ENV.generationStrategyVersion;
    try {
      ENV.generationStrategyVersion = entry.strategy;
      return resolveGenerationModelConfig(inputs.get(entry.id)!);
    } finally {
      ENV.generationStrategyVersion = previous;
    }
  });
  if (
    shared &&
    Array.from(inputs.values()).some(
      input =>
        !shared.journeys.some(
          j =>
            j.postMode === input.postMode &&
            j.contentHash ===
              createHash("sha256").update(input.content.trim()).digest("hex")
        )
    )
  )
    throw new Error("shared_campaign_brief_changed");
  const criticalFiles = [
    "generationPreparation.ts",
    "generationPlanning.ts",
    "generationCoordinator.ts",
    "proposalGraph.ts",
    "proposalReview.ts",
    "proposalReviewV9.ts",
    "proposalReviewV10.ts",
    "reviewExecutionConfigV9.ts",
    "reviewExecutionConfigV10.ts",
  ];
  const paths = [
    ...criticalFiles.map(file => `../../ai/workflows/${file}`),
    "./live.ts",
    "./core.ts",
    "./budget.ts",
    "./journal.ts",
    "./corpus.ts",
    "./run.ts",
    "./campaignAnalysis.ts",
    "./sharedBudget.ts",
    "./receiptReconciliation.ts",
    "./selectionContinuation.ts",
    "./selectionAdmission.ts",
    "../../ai/generationModel.ts",
    "../../ai/providers/modelAdapters.ts",
    "../../ai/modelRouter.ts",
    "../../_core/llm.ts",
    "../../../shared/generationPlan.ts",
    "../../../shared/designRepertoire.ts",
    "../../../shared/compactDesignProfile.ts",
    "../../../shared/generationSelectionTransport.ts",
  ];
  const codeHash = arsenalHash(
    await Promise.all(
      paths.map(async path => [
        path,
        await readFile(new URL(path, import.meta.url), "utf8"),
      ])
    )
  );
  const basis = {
    version: 3,
    campaignId: options.campaignId,
    budgetInheritance: shared
      ? {
          file: options.sharedBudget,
          origin: shared.origin,
          quotesHash: shared.quotesHash,
          resultsInherited: false,
        }
      : undefined,
    seed: options.seed,
    proposalConcurrency: options.proposalConcurrency ?? 3,
    selectionContinuation: selectionReplay
      ? {
          receiptFile: options.selectionReplay,
          receiptHash: selectionReplay.receiptHash,
          sourceDirectory: selectionReplay.receipt.sourceDirectory,
          sourceFingerprint: selectionReplay.manifest.fingerprint,
          mode: "mixed_functional_phase_reuses_completed_preparation",
          newDeadline: true,
          limitations: selectionReplay.receipt.limitations,
        }
      : undefined,
    includeDrafts: options.includeDrafts,
    entries,
    configs,
    inputs: Array.from(inputs, ([id, input]) => ({
      id,
      hash: arsenalHash(input),
    })),
    catalogs: { baseline: catalogs[1].hash, revised: catalogs[2].hash },
    ...(origin
      ? {
          continuation: {
            sourceDirectory: origin.analysis.sourceDirectory,
            sourceManifestHash: origin.analysis.sourceManifestHash,
            sourceLedgerHash: origin.analysis.sourceLedgerHash,
            sourceFingerprint: origin.analysis.sourceFingerprint,
            inheritedExecutions: Array.from(inheritedIds),
          },
        }
      : {}),
    codeHash,
    rendererHash: arsenalHash(
      (await readFile(ENV.reviewRendererBundle)).toString("base64")
    ),
    ancillaryModels: {
      jev: ENV.openRouterDesignSelectionModel,
      review: ENV.openRouterProposalReviewModel,
      vision: ENV.openRouterVisionModel,
      image: ENV.openRouterV5ImageModel,
    },
    maxUsd: options.maxUsd,
    maxCalls: options.maxCalls,
    preferences: defaultStudioPreferences,
    recentSelections: [],
  };
  if (
    origin &&
    ((origin.manifest.includeDrafts !== undefined &&
      origin.manifest.includeDrafts !== options.includeDrafts) ||
      arsenalHash(origin.manifest.inputs) !== arsenalHash(basis.inputs) ||
      arsenalHash(origin.manifest.configs) !== arsenalHash(configs) ||
      arsenalHash(origin.manifest.catalogs) !== arsenalHash(basis.catalogs) ||
      arsenalHash(origin.manifest.ancillaryModels) !==
        arsenalHash(basis.ancillaryModels))
  )
    throw new Error("continuation_inputs_configs_or_catalogs_changed");
  const manifest = { ...basis, fingerprint: arsenalHash(basis) };
  selectionReplay?.assertBasis(basis);
  const existing = await readOptional<typeof manifest>(
    join(operator, "manifest.json")
  );
  if (
    shared &&
    !existing &&
    shared.calls.some(c => c.metadata?.campaignId === options.campaignId)
  )
    throw new Error("shared_campaign_effects_exist_without_local_receipts");
  if (
    existing &&
    (!options.resume || existing.fingerprint !== manifest.fingerprint)
  )
    throw new Error(
      "Existing run requires --resume with identical sources, code, configs, catalogs and limits"
    );
  await writeJson(join(operator, "manifest.json"), manifest);
  await writeJson(
    join(operator, "catalog-baseline.json"),
    catalogs[1].snapshot
  );
  await writeJson(join(operator, "catalog-revised.json"), catalogs[2].snapshot);
  if (origin)
    await writeJson(join(operator, "origin-analysis.json"), origin.analysis);
  let prices =
    shared?.quotes ??
    (await readOptional<PriceQuote[]>(join(operator, "prices.json"))) ??
    (origin
      ? await readOptional<PriceQuote[]>(
          join(origin.analysis.sourceDirectory, "operator", "prices.json")
        )
      : undefined);
  if (!prices) {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error("comparison_price_catalog_unavailable");
    const result = (await response.json()) as { data: PriceQuote[] };
    prices = result.data;
    for (const model of Array.from(
      new Set([
        ...configs.map(c => c.model),
        ...Object.values(basis.ancillaryModels),
      ])
    )) {
      if (prices.some(p => p.id === model && p.context_length > 0)) continue;
      // Specialized models (e.g. System One) can be omitted from the main list.
      const response = await fetch(
        `https://openrouter.ai/api/v1/models/${model.split("/").map(encodeURIComponent).join("/")}/endpoints`,
        { signal: AbortSignal.timeout(20_000) }
      );
      if (!response.ok)
        throw new Error(`comparison_price_quote_missing:${model}`);
      const data = ((await response.json()) as any).data;
      const endpoints = data?.endpoints;
      if (!Array.isArray(endpoints) || !endpoints.length)
        throw new Error(`comparison_price_quote_missing:${model}`);
      const pricing = Object.fromEntries(
        Array.from(
          new Set<string>(endpoints.flatMap((e: any) => Object.keys(e.pricing)))
        ).map(key => [
          key,
          String(
            Math.max(...endpoints.map((e: any) => Number(e.pricing[key] ?? 0)))
          ),
        ])
      );
      prices = prices.filter(p => p.id !== model);
      prices.push({
        id: model,
        context_length: Math.max(
          ...endpoints.map((e: any) => e.context_length)
        ),
        pricing,
        top_provider: {
          max_completion_tokens: Math.max(
            ...endpoints.map(
              (e: any) => e.max_completion_tokens ?? e.context_length
            )
          ),
        },
      });
    }
    await writeJson(join(operator, "prices.json"), prices);
  }
  await writeJson(join(operator, "prices.json"), prices);
  const ledger =
    (await readOptional<PaidCall[]>(join(operator, "paid-calls.json"))) ??
    structuredClone(origin?.calls ?? []);
  if (
    origin &&
    arsenalHash(ledger.slice(0, origin.calls.length)) !==
      arsenalHash(origin.calls)
  )
    throw new Error("continuation_inherited_ledger_changed");
  await writeJson(join(operator, "paid-calls.json"), ledger);
  for (const model of Array.from(
    new Set([
      ...configs.map(c => c.model),
      ...Object.values(basis.ancillaryModels),
    ])
  ))
    if (!prices.some(q => q.id === model))
      throw new Error(`comparison_price_quote_missing:${model}`);
  const budget = options.sharedBudget
    ? (
        await openSharedBudget({
          file: options.sharedBudget,
          campaignId: options.campaignId!,
          maxUsd: options.maxUsd,
          maxCalls: options.maxCalls,
          live: options.live,
          pipelineHash: manifest.fingerprint,
          executionDirectory: options.output,
        })
      ).budget
    : new MatrixBudget(options.maxUsd, options.maxCalls, ledger, calls =>
        writeJson(join(operator, "paid-calls.json"), calls)
      );
  await writeJson(join(operator, "paid-calls.json"), budget.calls);
  const restoreTransport = installMatrixTransport(
    budget,
    new Map(prices.map(quote => [quote.id, quote])),
    options.campaignId
      ? {
          context: async () => {
            const id = getGenerationTrace()?.id,
              operation = paidOperationScope.getStore(),
              index = entries.findIndex(e => e.runId === id);
            if (!operation || index < 0)
              throw new Error("matrix_paid_call_outside_journal");
            return {
              operation,
              metadata: {
                campaignId: options.campaignId!,
                phase: "matrix",
                protocolVersion: 3,
                pipelineHash: codeHash,
                generationRequestId: id!,
                generationConfigHash: configs[index].configurationHash,
                strategyVersion: entries[index].strategy,
                reviewPolicyVersion: entries[index].strategy === 2 ? 10 : 9,
                operationSource: "local_journal",
              },
            };
          },
        }
      : {}
  );
  const onInterrupt = () => budget.stop("operator_interrupt");
  process.once("SIGINT", onInterrupt);
  const results: any[] = [],
    blind: BlindPiece[] = [];
  try {
    await assertReviewRendererAvailable();
    const frozenSources = new Map<
      string,
      Awaited<ReturnType<typeof loadGenerationSources>>
    >();
    for (const entry of entries) {
      if (frozenSources.has(entry.caseId)) continue;
      const file = join(operator, `sources-${entry.caseId}.json`);
      const source =
        selectionReplay?.sourceData ??
        (await readOptional<Awaited<ReturnType<typeof loadGenerationSources>>>(
          file
        )) ??
        (origin
          ? await readOptional<
              Awaited<ReturnType<typeof loadGenerationSources>>
            >(
              join(
                origin.analysis.sourceDirectory,
                "operator",
                `sources-${entry.caseId}.json`
              )
            )
          : undefined) ??
        (await loadGenerationSources(inputs.get(entry.id)!, actor));
      frozenSources.set(entry.caseId, source);
      await writeJson(file, source);
    }
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index],
        input = inputs.get(entry.id)!,
        generationConfig = configs[index],
        selectedCatalog = catalogs[entry.strategy];
      const scopeUnit = options.campaignId
        ? `${options.campaignId}:${entry.id}`
        : entry.id;
      if (inheritedIds.has(entry.id)) continue; // Old effects/results remain exclusively in their original phase.
      const directory = join(operator, entry.id);
      const completed = await readOptional<any>(join(directory, "result.json"));
      if (completed?.complete) {
        results.push(completed.metrics);
        blind.push(...completed.blind);
        continue;
      }
      if (budget.interruption) break;
      // Do not buy another preparation when even one mandatory review cannot
      // be reserved under the remaining total. Never release uncertain spend.
      const reviewConfig = (
        entry.strategy === 2
          ? resolveReviewExecutionConfigV10
          : resolveReviewExecutionConfigV9
      )(generationConfig.model);
      const reviewQuote = prices.find(q => q.id === reviewConfig.resolvedModel);
      if (!reviewQuote)
        throw new Error(
          `comparison_price_quote_missing:${reviewConfig.resolvedModel}`
        );
      const minReviewReserve = reserveQuote(
        {
          model: reviewConfig.resolvedModel,
          messages: [{ image_url: "review-pixels-budget-bound" }],
          max_tokens:
            reviewConfig.profiles[
              input.postMode === "carousel" && (input.slideCount ?? 5) > 4
                ? "extended"
                : "standard"
            ].maxCompletionTokens,
        },
        reviewQuote
      ).usd;
      if (!(await budget.canPrepare(minReviewReserve))) break;
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const journal = await localJournal(
        join(directory, "operations"),
        scopeUnit,
        budget
      );
      const admissionFile = join(directory, "admission.json");
      const admission = (await readOptional<{
        startedAt: number;
        deadlineMs: number;
      }>(admissionFile)) ?? {
        startedAt: Date.now(),
        deadlineMs: Date.now() + 600_000,
      };
      await writeJson(admissionFile, admission);
      const trace: GenerationTrace = {
        id: entry.runId,
        userUuid: actor,
        inputType: input.inputType,
        inputContent: input.content,
        platform: input.platform,
        postMode: input.postMode,
        creationMode: input.creationMode,
        requestedModel: generationConfig.model,
        startedAt: admission.startedAt,
        calls: [],
        events: [],
      };
      const deadlineMs = admission.deadlineMs;
      const signal = AbortSignal.timeout(Math.max(1, deadlineMs - Date.now()));
      const generate: typeof invokeLLM = async params => {
        const reused = selectionReplay?.generate(params);
        if (reused) return reused;
        return invokeLLM({
          ...params,
          signal: params.signal
            ? AbortSignal.any([params.signal, signal])
            : signal,
          disableFallback: true,
          maxTransportAttempts: 1,
          disableStructuredRepair: true,
        });
      };
      const operation = <T>(key: string, work: () => Promise<T>) =>
        journal.execute(
          `prepare:${key}`,
          selectionReplay
            ? () => selectionReplay.operation(`prepare:${key}`, work)
            : work
        );
      const unitBlind: BlindPiece[] = [];
      let prepared:
        | Awaited<ReturnType<typeof prepareOrchestratedGeneration>>
        | undefined;
      let snapshot:
          | ReturnType<GenerationCoordinator["getSnapshot"]>
          | undefined,
        failure: string | undefined;
      try {
        snapshot = await runWithGenerationTrace(trace, async () => {
          prepared = await prepareOrchestratedGeneration(
            input,
            actor,
            options.includeDrafts,
            deadlineMs,
            {
              generationConfig,
              generate,
              retrieve: selectedCatalog.retrieve,
              hydrate: selectedCatalog.hydrate,
              preferences: async () => defaultStudioPreferences,
              recentSelections: async () => [],
              loadContext: async () => frozenSources.get(entry.caseId)!,
              operation,
              preflightSelection: createSelectionBudgetPreflight({
                budget,
                quotes: new Map(prices.map(q => [q.id, q])),
                record: record =>
                  writeJson(
                    join(directory, "selection-preflight.json"),
                    record
                  ),
              }),
              signal,
            }
          );
          await writeJson(join(directory, "prepared.json"), prepared);
          if (selectionReplay)
            await writeJson(
              join(directory, "preparation-replay.json"),
              selectionReplay.verification()
            );
          await verifyPreparedEligibility(
            prepared,
            options.includeDrafts,
            selectedCatalog.hydrate
          );
          const savedProposals = (
            await Promise.all(
              [0, 1, 2].map(slot =>
                readOptional(join(directory, `slot-${slot}.json`))
              )
            )
          )
            .filter(value => value !== undefined)
            .map(value => proposalDeliverySchema.parse(value));
          const coordinator = new GenerationCoordinator(
            {
              requestId: entry.runId,
              runId: entry.runId,
              actor,
              prompt: input.content,
              platform: input.platform,
              postMode: input.postMode,
              creationMode: input.creationMode,
              generationConfig,
              deadlineMs,
              signal,
              savedProposals,
              ...prepared,
              executionBrief: input.executionBrief,
              sourceImages: prepared.imageSourceReading?.images,
              referenceImages:
                sourceImage && entry.caseId === "image-highlight"
                  ? [sourceImage]
                  : [],
              experimental: options.includeDrafts,
            },
            {
              actor,
              generateText: generate,
              replan: (slot, attempt, currentFamilies) =>
                replanGenerationSlot(
                  {
                    prepared: prepared!,
                    slot,
                    attempt,
                    currentFamilies,
                    generationConfig,
                    deadlineMs,
                    experimental: options.includeDrafts,
                  },
                  {
                    generate,
                    hydrate: selectedCatalog.hydrate,
                    operation: (key, work) =>
                      journal.execute(`p-${entry.runId}-${slot}:${key}`, work),
                    signal,
                  }
                ),
              operationForProposal: id => (o, work) =>
                journal.execute(`${id}:${o.operationKey}`, work),
              reviewOperations: async id =>
                Array.from(journal.rows.values())
                  .filter(row => row.operationKey.startsWith(`${id}:`))
                  .map(row => ({
                    ...row,
                    operationKey: row.operationKey.slice(id.length + 1),
                  })),
              expectationForProposal: (id, key, expectation) =>
                journal.expectation(`${id}:${key}`, expectation),
              recoveryOperationKeys: async (id, attempt = id) =>
                Array.from(journal.rows.values())
                  .filter(
                    row =>
                      row.state !== "blocked" &&
                      (row.operationKey.startsWith(`${id}:`) ||
                        row.operationKey.startsWith(`${id}-fb`))
                  )
                  .flatMap(row => {
                    const key = row.operationKey.replace(
                      new RegExp(`^${id}(?:-fb[1-3])?:`),
                      ""
                    );
                    return key === "copy_recovery" ||
                      key.startsWith("review_correction:")
                      ? [
                          row.operationKey.startsWith(`${attempt}:`)
                            ? key
                            : `previous_attempt:${key}`,
                        ]
                      : [];
                  }),
              reviewRepairOperationKeys: async id =>
                Array.from(journal.rows.keys())
                  .filter(
                    key =>
                      (key.startsWith(`${id}:`) ||
                        key.startsWith(`${id}-fb`)) &&
                      key.includes(":review_evidence_repair:")
                  )
                  .map(key => key.slice(id.length + 1)),
              persistUpdate: delivery =>
                writeJson(
                  join(directory, `slot-${delivery.slot}.json`),
                  delivery
                ),
              renderReviewScenes,
              mediaAdapter: {
                generate: async request => ({
                  url: await generateBackgroundImage(
                    buildImageGenerationPrompt(
                      request.prompt,
                      request.postContext
                    ),
                    "pollinations_hd",
                    aspectRatioForProposalSlot(
                      request.slot.width,
                      request.slot.height
                    ),
                    {
                      routePolicy: "strict",
                      purpose: request.purpose,
                      originalImages: await resolveProposalMediaReferences(
                        request.references,
                        actor,
                        request.operationId,
                        {},
                        request.signal
                      ),
                      signal: request.signal,
                    }
                  ),
                }),
              },
            }
          );
          return coordinator.start({
            maxConcurrency: options.proposalConcurrency,
          });
        });
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      }
      for (let slot = 0; slot < 3; slot++) {
        const proposal = snapshot?.proposals.find(p => p.slot === slot);
        const piece: BlindPiece = {
          id: `${entry.blindId}-${slot + 1}`,
          caseId: entry.caseId,
          prompt: input.content,
          caption: "",
          images: [],
          ready: proposal?.status === "ready",
        };
        if (proposal?.status === "ready" && proposal.bundle) {
          piece.caption = proposal.bundle.caption;
          try {
            const scenes = await renderReviewScenes({
              actor,
              definitions: [],
              compositions: proposal.bundle.slides.map(s => s.composition),
              deadlineMs: Date.now() + 60_000,
            });
            await mkdir(join(options.output, "art"), { recursive: true });
            for (const scene of scenes) {
              const relative = `art/${piece.id}-${scene.slideIndex + 1}.png`;
              await writeFile(
                join(options.output, relative),
                Buffer.from(scene.dataUri.split(",")[1], "base64")
              );
              piece.images.push(relative);
            }
          } catch (error) {
            failure = `final_render:${error instanceof Error ? error.message : String(error)}`;
            piece.ready = false;
          }
        }
        unitBlind.push(piece);
      }
      const metrics = {
        ...entry,
        generationConfig,
        catalogHash: selectedCatalog.hash,
        sourceHash: arsenalHash(frozenSources.get(entry.caseId)),
        protocolVersion: 3,
        proposalConcurrency: options.proposalConcurrency ?? 3,
        selectionContinuation: basis.selectionContinuation,
        campaignId: options.campaignId,
        campaignInterruption: budget.interruption,
        failureOrigin: /^selection_replay_|^selection_preflight_/.test(
          failure ?? ""
        )
          ? "harness"
          : undefined,
        modelOutcome: budget.interruption
          ? "not_assessable_campaign_interrupted"
          : /^selection_replay_|^selection_preflight_/.test(failure ?? "")
            ? "not_assessable_harness_failure"
            : (snapshot?.overallStatus ?? "failed"),
        reviewPolicyVersion: prepared?.reviewPolicyVersion,
        reviewExecutionConfig: prepared?.reviewExecutionConfig,
        latencyMs: Date.now() - trace.startedAt,
        overallStatus: snapshot?.overallStatus ?? "failed",
        failure,
        ready:
          snapshot?.proposals.filter(p => p.status === "ready").length ?? 0,
        renderedReady: unitBlind.filter(p => p.ready).length,
        slots: snapshot?.proposals.map(p => ({
          slot: p.slot,
          status: p.status,
          failure: p.failure,
          errorReason: p.errorReason,
          diagnostics: p.diagnostics,
          reviews: p.reviews,
          attempt: p.attempt,
        })),
        calls: trace.calls.map(
          ({ messages: _messages, response: _response, ...call }) => call
        ),
        providerKnownUsd: budget.calls
          .filter(c => c.operation.startsWith(`${scopeUnit}:`))
          .reduce((sum, c) => sum + (c.actualUsd ?? 0), 0),
        reservedUnknownUsd: budget.calls
          .filter(
            c =>
              c.operation.startsWith(`${scopeUnit}:`) &&
              c.actualUsd === undefined
          )
          .reduce((sum, c) => sum + c.reservedUsd, 0),
        recoveries: Array.from(journal.rows.values())
          .filter(o =>
            /copy_recovery|review_correction|review_evidence_repair|template_replan/.test(
              o.operationKey
            )
          )
          .map(({ operationKey, state }) => ({ operationKey, state })),
      };
      await writeJson(join(directory, "trace.json"), trace);
      await writeJson(join(directory, "result.json"), {
        complete: true,
        metrics,
        snapshot,
        blind: unitBlind,
      });
      results.push(metrics);
      blind.push(...unitBlind);
      await writeJson(join(operator, "results.json"), results);
      await writeFile(join(options.output, "blind.html"), blindReport(blind));
      if (budget.interruption) break;
    }
    await budget.refresh();
    await writeJson(join(operator, "paid-calls.json"), budget.calls);
    await writeJson(join(operator, "results.json"), results);
    await writeFile(join(options.output, "blind.html"), blindReport(blind));
    await writeJson(join(operator, "summary.json"), {
      live: true,
      simulated: false,
      protocolVersion: 3,
      campaignId: options.campaignId,
      budgetInheritance: basis.budgetInheritance,
      selectionContinuation: basis.selectionContinuation,
      campaignStatus: results.some(result => result.failureOrigin === "harness")
        ? "operational_harness_failure"
        : budget.interruption
          ? "interrupted"
          : origin || selectionReplay
            ? "continuation_phase_completed"
            : "completed",
      comparisonStatus:
        origin || selectionReplay || budget.interruption
          ? "interrupted_or_mixed_protocol_not_clean_comparison"
          : "current_protocol",
      plannedExecutions: entries.length,
      interruption: budget.interruption,
      knownUsd: budget.knownUsd,
      conservativeCommittedUsd: budget.committedUsd,
      calls: budget.calls.length,
      limits: { usd: budget.maxUsd, calls: budget.maxCalls },
      results,
      inheritedExecutions: Array.from(inheritedIds),
      notExercised: entries
        .filter(
          e => !inheritedIds.has(e.id) && !results.some(r => r.id === e.id)
        )
        .map(e => ({
          id: e.id,
          reason: budget.interruption?.reason ?? "not_started",
        })),
      limitations: [
        "Esta execução local não verifica cobrança Sparks, autorização de assets salvos, CanvasPostModel persistido/reaberto nem exportação via UI.",
        "Preferências padrão, histórico vazio e fontes congeladas. Catálogo e revisão variam entre estratégias e permanecem iguais dentro do par Gemini/GPT.",
        "Custo sem recibo permanece reservado; preços/limites do provedor são externos. Uma violação do teto estimado interrompe novas chamadas e permanece registrada.",
      ],
    });
    return {
      results,
      knownUsd: budget.knownUsd,
      calls: budget.calls.length,
      interruption: budget.interruption,
      operationalFailures: results.filter(
        result => result.failureOrigin === "harness"
      ).length,
      renderedReady: results.reduce(
        (total, result) => total + result.renderedReady,
        0
      ),
    };
  } finally {
    await budget.flush();
    process.removeListener("SIGINT", onInterrupt);
    restoreTransport();
    await closeReviewRenderer();
  }
}
