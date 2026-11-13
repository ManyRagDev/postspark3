import { arsenalHash } from "@shared/arsenalContent";
import { deliveryRecoveryKey, deliveryRecoveryAttempt, type GenerationPlanningReceipt, type ViableGenerationPlan } from "@shared/generationPlan";
import type { ComponentDefinitionV1 } from "@shared/componentAssembly";
import { compactComponentCard, componentDefinitionV1Schema } from "@shared/componentAssembly";
import { meetsGenerationVisualRequirements } from "@shared/generationVisualRequirements";
import { designHasPhotographicContent } from "@shared/designSelection";
import { GenerationFailureError } from "@shared/generationFailure";
import { fitExistingProposalCopy, readProposalCopy, type CopyResponse, type ProposalExecutionInput, type ProposalGraphDeps } from "./proposalGraph";
import { usesCompactProposalCopy } from "./compactProposalCopy";
import { readJournalResult } from "./generationJournalTrace";

type Decision = {
  plan: ViableGenerationPlan;
  mode: "reuse_text" | "repair_text" | "write_for_design";
  copy?: CopyResponse;
  localPreflightVersion?: 1;
};

/** Rebuild progress from completed decisions after a process restart. */
export function deliveryRecoveryHistory(
  operations: readonly { operationKey: string; state: string; result?: unknown }[],
  proposalId: string,
  recoveryAttempt: number,
) {
  const prefix = `${proposalId}:`;
  const previous = operations.flatMap(operation => {
    if (operation.state !== "completed" || !operation.operationKey.startsWith(prefix)) return [];
    const relative = operation.operationKey.slice(prefix.length);
    const attempt = deliveryRecoveryAttempt(relative);
    const decision = readJournalResult<Decision | undefined>(operation.result);
    return attempt && attempt < recoveryAttempt && decision?.plan
      ? [{ ...decision, attempt, canonical: relative === deliveryRecoveryKey(attempt), attemptId: `${proposalId}-fb${attempt}` }] : [];
  }).sort((a, b) => a.attempt - b.attempt || Number(a.canonical) - Number(b.canonical));
  return { candidateIds: previous.map(decision => decision.plan.candidateId), previous: previous.at(-1) };
}

/** Checks native dependencies, never photographic style or estimated character counts. */
function locallyMaterializable(definitions: ComponentDefinitionV1[], input: ProposalExecutionInput): boolean {
  if (!definitions.length || (input.postMode === "static" && definitions.length !== 1) ||
      (input.postMode === "carousel" && definitions.length < 2)) return false;
  const media = input.imageObligation;
  const mayGenerate = media?.policy !== "forbidden" && media?.purpose !== "none";
  let deferredSlots = 0;
  for (const definition of definitions) {
    if (!componentDefinitionV1Schema.safeParse(definition).success ||
        definition.kind !== "content" || !definition.completeDesign?.baselineVerified) return false;
    for (const instance of definition.fragment.instances) {
      const piece = definition.pieces[instance.pieceHash];
      if (piece.kind !== "media") continue;
      const deferred = definition.fragment.mediaSlots?.some(slot => slot.id === instance.id && slot.deferred);
      if (deferred) deferredSlots++;
      // An authored raster remains usable without buying a new image. A blank
      // native slot requires an actual image task, regardless of its aesthetic.
      if (!piece.imageAssetId && (!deferred || !mayGenerate)) return false;
    }
  }
  return !media?.required || (mayGenerate && deferredSlots >= Math.max(1, media.slotTargets));
}

export async function recoverGenerationDelivery(args: {
  planning: GenerationPlanningReceipt;
  sourceDefinitions: ComponentDefinitionV1[];
  input: ProposalExecutionInput;
  readOriginalCopy: () => Promise<unknown>;
  reuseOriginal: boolean;
  recoveryAttempt?: number;
  excludedCandidateIds?: readonly string[];
  excludedFamilies?: readonly string[];
  claimFamily?: (family: string) => boolean;
  hydrate: (ids: string[], experimental: boolean) => Promise<ComponentDefinitionV1[]>;
  operation: <T>(key: string, work: () => Promise<T>) => Promise<T>;
  graphDeps: Pick<ProposalGraphDeps, "measureText" | "createTextMeasurer">;
}) {
  const { planning, sourceDefinitions, input } = args;
  // The persisted execution config preserves historical candidate decisions.
  const localPreflight = usesCompactProposalCopy(input) && input.reviewExecutionConfig?.version === 5 &&
    (input.reviewExecutionConfig.automaticReviewVersion === 2 || input.reviewExecutionConfig.automaticReviewVersion === 3 || input.reviewExecutionConfig.automaticReviewVersion === 4);
  const reserves = planning.deliveryReserves?.[input.slot] ?? [];
  const claim = (reserve: (typeof reserves)[number]) => args.claimFamily?.(reserve.family) ?? true;
  const original = planning.slots[input.slot];
  const originalOffer = planning.offers[input.slot];
  const pinned = original.status === "viable" && originalOffer ? {
    family: originalOffer.family,
    plan: original,
    componentHashes: originalOffer.slides.map(slide => slide.componentHash),
  } : undefined;
  const sequence = (plan: ViableGenerationPlan) => JSON.stringify(plan.pages.map(page => page.componentId));
  const excludedSequences = new Set([...(pinned ? [pinned] : []), ...reserves]
    .filter(reserve => args.excludedCandidateIds?.includes(reserve.plan.candidateId)).map(reserve => sequence(reserve.plan)));
  const eligible = (reserve: (typeof reserves)[number]) =>
    !args.excludedCandidateIds?.includes(reserve.plan.candidateId) &&
    !excludedSequences.has(sequence(reserve.plan)) &&
    !args.excludedFamilies?.includes(reserve.family);
  type Reserve = (typeof reserves)[number];
  const loaded = new Map<string, ComponentDefinitionV1[]>();
  const load = async (reserve: Reserve) => {
    const cached = loaded.get(reserve.plan.candidateId);
    if (cached) return cached;
    const ids = reserve.plan.pages.map(page => page.componentId);
    const definitions = await args.hydrate(Array.from(new Set(ids)), input.experimental ?? true);
    const byId = new Map(definitions.map(definition => [definition.id, definition]));
    const ordered = ids.map(id => byId.get(id));
    if (ordered.some((definition, index) => !definition || definition.hash !== reserve.componentHashes[index] || definition.completeDesign?.family !== reserve.family)) return;
    const sequence = ordered as ComponentDefinitionV1[];
    if (localPreflight && (reserve.plan.slot !== input.slot ||
        reserve.componentHashes.length !== sequence.length ||
        reserve.plan.pages.some((page, index) => page.slideIndex !== index) ||
        !locallyMaterializable(sequence, input))) return;
    const cards = sequence.map(compactComponentCard);
    if (!localPreflight && cards.some(card => !meetsGenerationVisualRequirements(card, planning.visualRequirements))) return;
    const media = input.imageObligation;
    if (media?.required && cards.reduce((n, card) => n + card.mediaSlots.length, 0) < Math.max(1, media.slotTargets)) return;
    if (!localPreflight && media?.policy === "forbidden" && cards.some(card => card.mediaSlots.length || designHasPhotographicContent(card))) return;
    loaded.set(reserve.plan.candidateId, sequence);
    return sequence;
  };
  const decisionKey = deliveryRecoveryKey(args.recoveryAttempt ?? 1);
  const decision = await args.operation<Decision | { mode: "unavailable" }>(decisionKey, async () => {
    const evidence = localPreflight ? { localPreflightVersion: 1 as const } : {};
    const copy = args.reuseOriginal ? readProposalCopy(await args.readOriginalCopy(), sourceDefinitions, input.reviewExecutionConfig?.version === 5 ? input.reviewExecutionConfig.nativeGlyphProjection : undefined) : undefined;
    const rewriteReserves: Reserve[] = [];
    // Font measurements can use the remaining request time, leaving room for delivery review.
    const remaining = (input.deadlineMs ?? Date.now() + 60_000) - Date.now();
    const probeDeadline = AbortSignal.timeout(Math.max(1, Math.min(15_000, Math.floor(remaining / 4))));
    const signal = input.signal ? AbortSignal.any([input.signal, probeDeadline]) : probeDeadline;
    for (const reserve of reserves) {
      if (!eligible(reserve)) continue;
      input.signal?.throwIfAborted();
      if (signal.aborted) break;
      try {
        const definitions = await load(reserve);
        if (!definitions) continue;
        rewriteReserves.push(reserve);
        if (!copy) {
          if (claim(reserve)) return { ...evidence, mode: "write_for_design", plan: reserve.plan };
          continue;
        }
        const fitted = await fitExistingProposalCopy({ copy, source: sourceDefinitions, target: definitions, input: { ...input, signal }, deps: args.graphDeps });
        if (fitted && claim(reserve)) return { ...evidence, mode: "reuse_text", plan: reserve.plan, copy: fitted };
      } catch (error) {
        input.signal?.throwIfAborted();
        // An unavailable reserve does not invalidate the rest of the pool.
        if (signal.aborted) break;
        console.warn("[generation] Design de reserva indisponível para prova de encaixe", reserve.family, error instanceof Error ? error.name : "unknown");
      }
    }
    // Failed role-by-role transfer does not mean the reserve cannot express the
    // brief. Adapt the existing message to different native fields, rather than
    // spend the only fallback on the same already exhausted layout.
    const mayRewrite = input.executionBrief?.interventionLevel !== "visual_only";
    if ((localPreflight && mayRewrite) || !copy) {
      const next = rewriteReserves.find(claim);
      if (next) return { ...evidence, mode: "write_for_design", plan: next.plan, ...(copy ? { copy } : {}) };
    }
    if (pinned && eligible(pinned)) {
      try {
        if (await load(pinned) && claim(pinned)) return copy ? { ...evidence, mode: "repair_text", plan: pinned.plan, copy }
          : { ...evidence, mode: "write_for_design", plan: pinned.plan };
      } catch (error) {
        input.signal?.throwIfAborted();
        if (!rewriteReserves.length) throw error;
      }
    }
    const next = mayRewrite ? rewriteReserves.find(claim) : undefined;
    return next ? { ...evidence, mode: "write_for_design", plan: next.plan, ...(copy ? { copy } : {}) } : { ...evidence, mode: "unavailable" };
  });
  if (decision.mode === "unavailable") return null;
  const reserve = [...(pinned ? [pinned] : []), ...reserves].find(item => arsenalHash(item.plan) === arsenalHash(decision.plan));
  if (!reserve) throw new Error("delivery_recovery_pin_mismatch");
  if (args.excludedFamilies?.includes(reserve.family) || !claim(reserve)) return null;
  const definitions = await load(reserve);
  if (!definitions) {
    if (localPreflight) throw new GenerationFailureError("catalog_component_ineligible", "selection");
    return null;
  }
  return {
    definitions,
    plan: decision.plan,
    recoveryCopy: decision.mode === "write_for_design" ? undefined : decision.copy,
    recoverySourceCopy: decision.mode === "write_for_design" ? decision.copy : undefined,
    rewriteForRecovery: decision.mode === "write_for_design",
  };
}
