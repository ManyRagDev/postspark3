import { performance } from "node:perf_hooks";
import type { OrchestratedGenerationInput } from "@shared/generationRequest";
import type { ComponentCardV1 } from "@shared/componentAssembly";
import { resolveDesignFamilyRepertoires } from "@shared/designRepertoire";
import { repertoireMeetsMedia } from "@shared/generationPlan";
import type { ImageObligation } from "@shared/generationContracts";
import {
  affinityHash,
  editorialAffinityReceiptSchema,
  type EditorialAffinityReceipt,
} from "./contracts";
import {
  findEditorialCatalogProfile,
  type EditorialCatalogIdentity,
} from "./catalogProfiles";
import { loadAffinityBundle, rankEditorialProfiles } from "./bundle";
import { EmbeddingEngineError } from "./embeddingEngine";

type Loaded = Awaited<ReturnType<typeof loadAffinityBundle>>;
export interface AffinityObservationInput {
  input: OrchestratedGenerationInput;
  cards: ComponentCardV1[];
  signal?: AbortSignal;
  deadlineMs?: number;
  imageObligation?: ImageObligation;
  /** Strategy 1 supplies the exact materialized offers (it does not offer V3 alternatives). */
  catalogIdentities?: readonly EditorialCatalogIdentity[];
  /** Strategy 2 supplies the exact text used by its repertoire resolver. */
  repertoireInstructions?: string;
}
export interface AffinityObserverOptions {
  mode: "off" | "shadow";
  directory?: string;
  /** Complete observation budget, including verification and lazy loading. */
  timeoutMs?: number;
  load?: typeof loadAffinityBundle;
}

/** Only user-submitted text/options: no generated interpretation and no raw media.
 * The hash covers exact inputs, including any content that exceeds our budget. */
export function affinityInputText(input: OrchestratedGenerationInput): string {
  const brief = input.executionBrief;
  const submitted = /^(?:https?:\/\/\S+|data:image\/\S+)$/i.test(
    input.content.trim()
  )
    ? ""
    : input.content;
  const values = [
    submitted,
    brief?.rawInput,
    brief?.notes,
    brief?.objective,
    brief?.tone,
    input.tone,
    brief?.audience,
    brief?.callToAction,
    ...(brief?.contentRequirements?.map(r =>
      r.kind === "forbidden" ? `Não incluir: ${r.value}` : r.value
    ) ?? []),
    ...(brief?.mustInclude ?? []),
    ...(brief?.mustKeep ?? []),
    ...(brief?.forbiddenTerms?.map(value => `Não usar: ${value}`) ?? []),
    ...(brief?.slides?.map(slide => slide.rawText) ?? []),
  ];
  return Array.from(
    new Set(
      values.filter(
        (v): v is string => typeof v === "string" && Boolean(v.trim())
      )
    )
  )
    .join("\n")
    .normalize("NFC")
    .trim();
}

export function observationInputHash(args: AffinityObservationInput) {
  return affinityHash({
    text: affinityInputText(args.input),
    inputType: args.input.inputType,
    postMode: args.input.postMode,
    slideCount: args.input.slideCount,
    contentMode:
      args.input.executionBrief?.interventionLevel === "visual_only"
        ? "literal"
        : "compose",
    imageObligation: args.imageObligation ?? null,
    repertoireInstructions: args.repertoireInstructions ?? null,
    catalogIdentities: args.catalogIdentities ?? null,
    catalog: args.cards
      .map(c => ({ id: c.id, hash: c.hash }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}

export function offeredEditorialProfiles(args: AffinityObservationInput) {
  if (args.catalogIdentities)
    return args.catalogIdentities.flatMap(identity => {
      const match = findEditorialCatalogProfile(identity);
      return match ? [match] : [];
    });
  const { input, cards, imageObligation } = args;
  const repertoires = resolveDesignFamilyRepertoires(cards, {
    slideCount: input.postMode === "static" ? 1 : (input.slideCount ?? 5),
    contentMode:
      input.executionBrief?.interventionLevel === "visual_only"
        ? "literal"
        : "compose",
    instructions: args.repertoireInstructions ?? affinityInputText(input),
  });
  return repertoires
    .filter(r => !imageObligation || repertoireMeetsMedia(r, imageObligation))
    .flatMap(repertoire => {
      const members = Array.from(
        new Map(
          repertoire.slides
            .flatMap(slide => slide.variants)
            .map(card => [card.id, card])
        ).values()
      );
      const match = findEditorialCatalogProfile({
        family: repertoire.family,
        sourceId: repertoire.sourceId,
        sourceHash: repertoire.sourceHash,
        components: members.map(card => ({ id: card.id, hash: card.hash })),
      });
      return match ? [match] : [];
    });
}

export function createAffinityObserver(options: AffinityObserverOptions) {
  let loaded: Promise<Loaded> | undefined;
  let active = false;
  const timeoutMs = Math.max(1, Math.min(5000, options.timeoutMs ?? 1500));
  return async (
    args: AffinityObservationInput
  ): Promise<EditorialAffinityReceipt | undefined> => {
    if (options.mode !== "shadow") return undefined;
    const started = performance.now();
    const text = affinityInputText(args.input);
    const base = {
      version: 1 as const,
      mode: "shadow" as const,
      inputScope: "submitted_text_v1" as const,
      inputHash: observationInputHash(args),
      configurationHash: null as string | null,
      modelId: null as string | null,
      artifactHash: null as string | null,
      profilesHash: null as string | null,
      scoringVersion: 1 as const,
      tokenCount: null as number | null,
      truncated: false as const,
    };
    const finish = (
      status: EditorialAffinityReceipt["status"],
      reason: EditorialAffinityReceipt["reason"],
      scores: EditorialAffinityReceipt["scores"] = []
    ) =>
      editorialAffinityReceiptSchema.parse({
        ...base,
        status,
        reason,
        scores,
        latencyMs: Math.max(0, performance.now() - started),
      });
    if (!text) return finish("insufficient_input", "empty");
    if (text.length > 24000) return finish("insufficient_input", "input_limit");
    if (args.signal?.aborted) return finish("unavailable", "aborted");
    if (!options.directory) return finish("unavailable", "not_configured");
    if (active) return finish("unavailable", "busy");
    const remaining = Math.min(
      timeoutMs,
      (args.deadlineMs ?? Infinity) - Date.now() - 100
    );
    if (remaining <= 0) return finish("unavailable", "timeout");
    const profiles = offeredEditorialProfiles(args);
    if (!profiles.length) return finish("unavailable", "invalid_artifact");
    active = true;
    const controller = new AbortController();
    const signal = args.signal
      ? AbortSignal.any([args.signal, controller.signal])
      : controller.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const work = (async () => {
      loaded ??= (options.load ?? loadAffinityBundle)(options.directory!);
      const { bundle, engine } = await loaded;
      if (signal.aborted) throw new EmbeddingEngineError("aborted");
      base.configurationHash = affinityHash({
        bundle: bundle.hash,
        inputScope: base.inputScope,
        scoringVersion: 1,
      });
      base.modelId = engine.metadata.modelId;
      base.artifactHash = engine.metadata.artifactHash;
      base.profilesHash = bundle.profilesHash;
      const embedding = await engine.embed([text], {
        kind: "query",
        overflow: "reject",
        signal,
      });
      base.tokenCount = embedding.inputs[0].tokenCount;
      return finish(
        "scored",
        null,
        rankEditorialProfiles(embedding.vectors[0], bundle, profiles)
      );
    })().finally(() => {
      active = false;
    });
    // A timed-out native inference retains the active slot until it actually ends.
    // Later observations fail busy instead of starting unbounded background work.
    try {
      return await Promise.race([
        work,
        new Promise<EditorialAffinityReceipt>(resolve => {
          onAbort = () => resolve(finish("unavailable", "aborted"));
          args.signal?.addEventListener("abort", onAbort, { once: true });
          if (args.signal?.aborted) onAbort();
          timer = setTimeout(() => {
            controller.abort();
            resolve(finish("unavailable", "timeout"));
          }, remaining);
        }),
      ]);
    } catch (error) {
      if (error instanceof EmbeddingEngineError) {
        const reason =
          error.code === "token_limit"
            ? "token_limit"
            : error.code === "input_too_long"
              ? "input_limit"
              : error.code === "busy"
                ? "busy"
                : error.code === "aborted"
                  ? "aborted"
                  : error.code === "invalid_output"
                    ? "invalid_output"
                    : "model_unavailable";
        return finish(
          reason === "token_limit" || reason === "input_limit"
            ? "insufficient_input"
            : "unavailable",
          reason
        );
      }
      return finish("unavailable", "invalid_artifact");
    } finally {
      if (timer) clearTimeout(timer);
      if (onAbort) args.signal?.removeEventListener("abort", onAbort);
    }
  };
}

// Configuration is fixed for this process. Changing artifacts requires a restart.
// Unknown modes (including "active") intentionally cannot alter selection.
export const observeEditorialAffinity = createAffinityObserver({
  mode: process.env.EDITORIAL_AFFINITY_MODE === "shadow" ? "shadow" : "off",
  directory: process.env.EDITORIAL_AFFINITY_DIR,
});

/** Last isolation boundary: an observer regression must not break generation. */
export async function safeObserveEditorialAffinity(
  args: AffinityObservationInput,
  observe = observeEditorialAffinity
) {
  try {
    const result = await observe(args);
    return result === undefined
      ? undefined
      : editorialAffinityReceiptSchema.parse(result);
  } catch {
    return editorialAffinityReceiptSchema.parse({
      version: 1,
      mode: "shadow",
      status: "unavailable",
      inputHash: observationInputHash(args),
      inputScope: "submitted_text_v1",
      configurationHash: null,
      modelId: null,
      artifactHash: null,
      profilesHash: null,
      scoringVersion: 1,
      tokenCount: null,
      truncated: false,
      scores: [],
      reason: "invalid_output",
      latencyMs: 0,
    });
  }
}
