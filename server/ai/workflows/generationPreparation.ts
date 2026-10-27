import { compactSelectionContextV1 } from "./editorialContextTransport";
import { resolveGenerationVisualImages,resolveGenerationVisualSites } from "./generationVisualSources";
import { readGenerationImageSources,type ImageSourceReading } from "./generationImageSource";
import { completeSourceContext } from "@shared/sourceContext";
import { resolveReviewExecutionConfigV9 } from "./reviewExecutionConfigV9";
import { editorialContextV9 } from "./editorialContextV9";
import { reviewExecutionConfigV4Schema } from "@shared/proposalReviewV9";
import { resolveReviewExecutionConfigV8 } from "./reviewExecutionConfigV8";
import { assertPinnedReviewConfig } from "./pinnedReviewConfig";
import { editorialContextV8, referenceContextInstructions, resolvedEditorialContext } from "./editorialContextV8";
import { reviewExecutionConfigV3Schema } from "@shared/proposalReviewV8";
import { electionDecisionV2Schema, type AnyElectionDecision } from "@shared/designElection";
import { resolveReviewExecutionConfigV7, assertReviewExecutionConfigV7 } from "./reviewExecutionConfigV7";
import { editorialContextV7 } from "./editorialContextV7";
import { z } from "zod";
import type {
  ComponentCardV1,
  ComponentDefinitionV1,
} from "@shared/componentAssembly";
import {
  defaultStudioPreferences,
  effectiveStudioPreferences,
} from "@shared/studioPreferences";
import {
  normalizeExecutionBrief,
  type OrchestratedGenerationInput,
} from "@shared/generationRequest";
import { buildUserPrompt } from "../generationOrchestrator";
import { extractTextContent, safeJsonParse } from "../llmJson";
import { invokeLLM } from "../../_core/llm";
import { retrieveCompleteDesignCards, hydrateCompleteDesignComponents } from "../../designCatalog/completeDesignStore";
import { retrieveCoveredCatalog, catalogScopeHash, type CoveredCatalog } from "../../designCatalog/catalogCoverage";
import { electionCandidates, electionClassification } from "../../designCatalog/designElection";
import { catalogCoverageSchema, electionCandidatesSchema, electionClassificationSchema, electionDecisionSchema, sealElectionReceipt, electionReceiptIntact, assertCatalogCoverage, assertElectionCoverage, type ElectionDecision } from "@shared/designElection";
import { arsenalHash } from "@shared/arsenalContent";
import { hydrateComponents } from "../../designCatalog/componentStore";
import { readStudioPreferences } from "../../designCatalog/studioPreferences";
import {
  DESIGN_SHORTLIST_SIZE,
  designShortlistBrief,
  shortlistCompleteDesigns,
  type DesignShortlistResult,
} from "../../designCatalog/designShortlist";
import {
  designSelectionCard,
  designMotifs,
  designVisualSimilarity,
  designRecencyPenalty,
  designHasPhotographicContent,
  designTextBudgets,
  type RecentDesignSelection,
} from "@shared/designSelection";

import { type ImageObligation } from "@shared/generationContracts";
import { recordGenerationEvent } from "../generationTrace";
import { carouselNarrativeContract } from "@shared/carouselNarrative";
import { carouselVisualContract } from "@shared/carouselVisual";
import { resolveCompleteDesignOffers, type CompleteDesignOfferV1 } from "@shared/completeDesignOffers";
import { describeCompleteDesign } from "@shared/designSelection";
import { compactDesignProfileLegend, type CompactOfferProfile } from "@shared/compactDesignProfile";
import { GenerationFailureError } from "@shared/generationFailure";
import { ENV } from "../../_core/env";
import { resolveReviewExecutionConfig, assertReviewExecutionConfig } from "./reviewExecutionConfig";
import type { ReviewExecutionConfigV1 } from "@shared/proposalReview";
import { effectiveContentRequirements } from "@shared/contentRequirements";
import { reviewExecutionConfigV2Schema } from "@shared/proposalReviewV7";

export const selectionInputBriefSchema = z.union([
  z.string().min(1),
  z.array(
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("text"), text: z.string().min(1) }),
      z.object({
        type: z.literal("image_url"),
        image_url: z.object({ url: z.string().min(1) }),
      }),
    ])
  ).min(1),
]);

export const selectionInputReceiptSchema = z
  .object({
    brief: selectionInputBriefSchema,
    sourceEvidence: z.string().optional(),
    complementaryInstruction: z.string().optional(),
    requirements: z.array(
      z
        .object({
          id: z.string().min(1),
          kind: z.enum(["literal", "meaning", "forbidden"]),
          value: z.string().min(1),
          scope: z.enum(["art", "caption", "either"]),
          caseSensitive: z.boolean().optional(),
          match: z.enum(["word_or_phrase", "substring"]).optional(),
        })
        .strict()
    ),
    editorialContext: z.custom<import("./editorialContextV8").EditorialContext>(v => !!v && typeof v === "object" && typeof (v as any).hash === "string").optional(),
    reviewExecutionConfig: z.union([reviewExecutionConfigV2Schema, reviewExecutionConfigV3Schema, reviewExecutionConfigV4Schema]),
    jevModel: z.string().min(1),
    shortlistContextEncoding: z.literal(1).optional(),
  })
  .strict();
export type SelectionInputReceipt = z.infer<typeof selectionInputReceiptSchema>;

export interface PreparedGeneration {
  preparationVersion?: 2 | 3 | 4 | 5;
  reviewPolicyVersion?: 5 | 6 | 7 | 8 | 9;
  reviewExecutionConfig?: ReviewExecutionConfigV1 | import("@shared/proposalReviewV7").ReviewExecutionConfigV2 | import("@shared/proposalReviewV8").ReviewExecutionConfigV3 | import("@shared/proposalReviewV9").ReviewExecutionConfigV4;
  editorialContextHash?: string;
  editorialContext?: import("./editorialContextV8").EditorialContext;
  electionReceipt?: AnyElectionDecision;
  selectedOffers?: CompleteDesignOfferV1[];
  selectedDefinitions: ComponentDefinitionV1[][];
  alternativeDefinitions?: ComponentDefinitionV1[][][];
  alternativeOffers?: CompleteDesignOfferV1[][];
  recoveryPlanHash?: string;
  imageSourceReading?: ImageSourceReading|null;
  sourceReferences?: import("./proposalGraph").ProposalSourceReference[];
  selectionReasons: string[];
  editorialApproaches?: Array<string | null>;
  contextContent: string;
  visualPreference: ReturnType<typeof effectiveStudioPreferences>;
  executionBrief: ReturnType<typeof normalizeExecutionBrief> | null;
  imageObligation: ImageObligation;
  perProposalImageObligations?: ImageObligation[];
}
export interface PreparationDeps {
  generate: typeof invokeLLM;
  retrieve: (input: Parameters<typeof retrieveCompleteDesignCards>[0]) => Promise<ComponentCardV1[] | CoveredCatalog>;
  hydrate: typeof hydrateComponents;
  preferences: typeof readStudioPreferences;
  shortlist: typeof shortlistCompleteDesigns;
  signal?: AbortSignal;
  loadContext: (
    input: OrchestratedGenerationInput,
    ownerId: string
  ) => Promise<string|import("@shared/generationSourceBundle").GenerationSourceBundle>;
  operation: <T>(key: string, work: () => Promise<T>) => Promise<T>;
  recentSelections?: () => Promise<RecentDesignSelection[]>;
  resumeReviewPolicyVersion?:5|6|7|8|9;
}

/** Bounded, local diversification among similarly suitable complete sequences.
 * No extra provider call, no new layout and no invalidation of a valid proposal.
 * Historical/unscored selections are left intact because suitability is unknown. */
export function diversifyDesignSelection(
  options: Array<{ designIds: string[]; reason: string }>,
  cards: ComponentCardV1[],
  evaluated: DesignShortlistResult["evaluated"],
  count: number,
  obligation: ImageObligation,
  mixed: boolean,
  recent: RecentDesignSelection[],
  explicitlyNamedFamilies: ReadonlySet<string> = new Set()
) {
  const scores = new Map(evaluated.map(value => [value.id, value.score]));
  const byId = new Map(cards.map(card => [card.id, card]));
  const families = new Map<string, ComponentCardV1[]>();
  for (const card of cards) {
    const family = card.completeDesign?.family;
    if (family) families.set(family, [...(families.get(family) ?? []), card]);
  }
  const candidates = Array.from(families.values()).flatMap(members => {
    const picked = requiredSlideRoles(count).map(
      role =>
        [...members]
          .filter(card => card.roles.includes(role))
          .sort(
            (a, b) =>
              (scores.get(b.id) ?? -1) - (scores.get(a.id) ?? -1) ||
              a.id.localeCompare(b.id)
          )[0]
    );
    return picked.every(Boolean)
      ? [{ designIds: picked.map(card => card.id), reason: "" }]
      : [];
  });
  const chosen: typeof options = [];
  for (const original of options) {
    const originalCards = original.designIds.map(id => byId.get(id)!);
    if (
      originalCards.some(
        card =>
          scores.get(card.id) === undefined ||
          explicitlyNamedFamilies.has(card.completeDesign!.family)
      )
    ) {
      chosen.push(original);
      continue;
    }
    const originalScore = Math.min(
      ...originalCards.map(card => scores.get(card.id)!)
    );
    const supportingBudget = (card: ComponentCardV1) =>
      designTextBudgets(card)
        .filter(value =>
          /body|items|list|comparison|attribution|metric/.test(value.source)
        )
        .reduce((sum, value) => sum + value.estimatedCharacters, 0);
    const photo = originalCards.some(card => card.mediaSlots.length);
    const utility = (option: typeof original) => {
      const members = option.designIds.map(id => byId.get(id)!);
      const previous = chosen.flatMap(choice =>
        choice.designIds.map(id => byId.get(id)!)
      );
      const similarity = previous.length
        ? Math.max(
            ...members.flatMap(card =>
              previous.map(other => designVisualSimilarity(card, other))
            )
          )
        : 0;
      const repeated = previous.some(
        other =>
          other.completeDesign?.family === members[0].completeDesign?.family
      );
      return (
        Math.min(...members.map(card => scores.get(card.id)!)) -
        0.45 * similarity -
        (repeated ? 0.55 : 0) -
        Math.max(...members.map(card => designRecencyPenalty(card, recent))) +
        (option === original ? 0.1 : 0)
      );
    };
    const eligible = candidates.filter(candidate => {
      const members = candidate.designIds.map(id => byId.get(id)!);
      if (
        members.some(card => scores.get(card.id) === undefined) ||
        Math.min(...members.map(card => scores.get(card.id)!)) <
          originalScore - 0.2
      )
        return false;
      // Diversity is optional: never trade the selector's writing room for
      // smaller labels solely because a coarse Jev score is similar. This does
      // not reject either design or impose a new delivery/readiness threshold.
      if (
        members.some(
          (card, index) =>
            supportingBudget(card) < supportingBudget(originalCards[index])
        )
      )
        return false;
      if (mixed && members.some(card => card.mediaSlots.length) !== photo)
        return false;
      try {
        validateDesignSelection(
          [candidate, candidate, candidate],
          cards,
          count,
          obligation
        );
        return true;
      } catch {
        return false;
      }
    });
    const best = [original, ...eligible].sort(
      (a, b) =>
        utility(b) - utility(a) ||
        a.designIds.join().localeCompare(b.designIds.join())
    )[0];
    chosen.push(
      best === original || best.designIds.join() === original.designIds.join()
        ? original
        : {
            ...best,
            reason:
              "Composição com adequação editorial próxima, escolhida para variar os motivos visuais e reduzir repetição recente, preservando os campos e a mídia do pedido.",
          }
    );
  }
  return chosen;
}

/** Determine image contract obligations before design selection (Blueprint §6.1 / §21). */
export function determineImageObligation(
  input: OrchestratedGenerationInput,
  brief: ReturnType<typeof normalizeExecutionBrief> | null,
  _preferences?: ReturnType<typeof effectiveStudioPreferences>
): ImageObligation {
  const combined = requestImageInstructions(input, brief);
  if (requestsPhotoMix(combined)) {
    return {
      policy: "optional",
      required: false,
      purpose: "editorial-photo",
      reason:
        "Pedido misto explícito: duas propostas com foto e uma proposta tipográfica.",
      slotTargets: 0,
    };
  }
  // A reference can guide content/identity without being displayed when the
  // current user explicitly asks for a text-only result. Saved taste is advisory.
  const textOnlyRegex =
    /\b(?:(?:apenas|somente|s[oó])\s+texto|sem\s+(?:fotos?|fotografias?|imagem|imagens)|texto\s+puro|n[aã]o\s+(?:use|utilize|inclua|mostre)\s+(?:fotos?|fotografias?|imagem|imagens))\b/i;
  if (textOnlyRegex.test(combined)) {
    return {
      policy: "forbidden",
      required: false,
      purpose: "none",
      reason: "Pedido atual expressamente sem fotos ou apenas texto.",
      slotTargets: 0,
    };
  }
  const hasUserImage =
    input.inputType === "image" ||
    Boolean(input.imageUrl) ||
    Boolean(brief?.brandInput?.referenceImageUrl);

  if (hasUserImage) {
    return {
      policy: "required",
      required: true,
      purpose:
        brief?.brandInput?.referenceImageUrl || input.imageUrl
          ? "product"
          : "editorial-photo",
      reason: "Referência de imagem fornecida pelo usuário ou marca.",
      slotTargets: 1,
    };
  }

  const photoRequestedRegex =
    /\b(?:com|use|utilize|inclua|incluir|mostre|mostrar|adicione|adicionar|insira|inserir|quero|preciso\s+de)\s+(?:(?:uma?|as?|o|os|esta|essa|este|esse|minha|meu)\s+)?(?:fotos?|imagem|imagens|fotografias?|ilustra[çc][aã]o|ilustra[çc][oõ]es)\b/i;
  if (photoRequestedRegex.test(combined)) {
    return {
      policy: "required",
      required: true,
      purpose: "editorial-photo",
      reason: "Pedido atual solicita explicitamente uma imagem ou fotografia.",
      slotTargets: 1,
    };
  }

  return {
    policy: "optional",
    required: false,
    purpose: "editorial-photo",
    reason:
      "Imagem opcional para preencher slots nativos de mídia quando a composição selecionada os possuir.",
    slotTargets: 0,
  };
}

function requestImageInstructions(
  input: OrchestratedGenerationInput,
  brief: ReturnType<typeof normalizeExecutionBrief> | null
): string {
  return [input.content, brief?.rawInput, brief?.notes]
    .filter(Boolean)
    .join(" ");
}

/** Preserve the explicitly requested photo/typography mix in the unified selector. */
function requestsPhotoMix(text: string): boolean {
  return (
    /\b(?:duas|2)\s+(?:propostas?\s+|varia[cç][oõ]es?\s+)?com\s+(?:espa[cç]o para\s+)?(?:foto|imagem|m[ií]dia)/i.test(
      text
    ) &&
    /\b(?:uma|1)\s+(?:(?:proposta|varia[cç][aã]o)\s+)?(?:(?:apenas|somente|s[oó])\s+)?(?:tipogr[aá]fica|texto|sem\s+(?:foto|imagem))/i.test(
      text
    )
  );
}

/** Jev ranks families; hard capabilities must survive its per-role card reduction.
 * Restore only scored native alternatives and, for an explicit mix, replace the
 * lowest-ranked family if a required category was absent from the shortlist. */
function retainImageCapabilities(
  allCards: ComponentCardV1[],
  shortlist: DesignShortlistResult,
  count: number,
  obligation: ImageObligation,
  mixed: boolean
): ComponentCardV1[] {
  if (!obligation.required && !mixed) return shortlist.cards;
  const roles = requiredSlideRoles(count);
  const byFamily = new Map<string, ComponentCardV1[]>();
  for (const card of allCards) {
    if (!card.completeDesign?.baselineVerified) continue;
    const family = card.completeDesign.family;
    byFamily.set(family, [...(byFamily.get(family) ?? []), card]);
  }
  const selected = new Map<string, ComponentCardV1[]>();
  for (const card of shortlist.cards) {
    const family = card.completeDesign!.family;
    selected.set(family, [...(selected.get(family) ?? []), card]);
  }
  if (!selected.size || selected.size > DESIGN_SHORTLIST_SIZE)
    throw new Error("design_shortlist_family_budget_invalid");
  const scores = new Map(
    shortlist.evaluated
      .filter(
        item =>
          allCards.some(
            card => card.id === item.id && card.hash === item.hash
          ) && Number.isFinite(item.score)
      )
      .map(item => [item.id, item.score])
  );
  const score = (card: ComponentCardV1) => scores.get(card.id) ?? -Infinity;
  const originalFamilyScores = new Map(
    Array.from(selected).map(([family, members]) => [
      family,
      Math.min(...members.map(score)),
    ])
  );
  const ordered = (cards: ComponentCardV1[]) =>
    [...cards].sort((a, b) => score(b) - score(a));
  const sequence = (members: ComponentCardV1[], kind: "photo" | "type") => {
    const eligible =
      kind === "type"
        ? members.filter(card => !card.mediaSlots.length)
        : members;
    const picked = roles.map(role =>
      ordered(eligible).find(card => card.roles.includes(role))
    );
    if (picked.some(card => !card)) return null;
    const cards = picked as ComponentCardV1[];
    if (kind === "photo" && !cards.some(card => card.mediaSlots.length)) {
      const photo = ordered(members).find(
        card =>
          card.mediaSlots.length &&
          roles.some(role => card.roles.includes(role))
      );
      if (!photo) return null;
      cards[roles.findIndex(role => photo.roles.includes(role))] = photo;
    }
    return Array.from(new Map(cards.map(card => [card.id, card])).values());
  };
  const addSequence = (family: string, kind: "photo" | "type") => {
    const offered = selected.get(family)!;
    if (sequence(offered, kind)) return;
    const extra = sequence(byFamily.get(family) ?? [], kind);
    if (!extra) return;
    const missing = extra.filter(
      card => !offered.some(candidate => candidate.id === card.id)
    );
    if (missing.some(card => !scores.has(card.id)))
      throw new Error(
        "design_shortlist_missing_scores_for_required_capability"
      );
    selected.set(
      family,
      Array.from(
        new Map([...offered, ...extra].map(card => [card.id, card])).values()
      )
    );
  };
  const kinds: Array<"photo" | "type"> = mixed ? ["photo", "type"] : ["photo"];
  for (const family of Array.from(selected.keys()))
    for (const kind of kinds) addSequence(family, kind);
  const familyScore = (cards: ComponentCardV1[]) =>
    Math.min(...cards.map(score));
  for (const kind of kinds) {
    if (Array.from(selected.values()).some(cards => sequence(cards, kind)))
      continue;
    const ranked = Array.from(byFamily)
      .filter(([family]) => !selected.has(family))
      .map(([family, members]) => ({ family, cards: sequence(members, kind) }))
      .filter(
        (
          candidate
        ): candidate is { family: string; cards: ComponentCardV1[] } =>
          Boolean(candidate.cards)
      )
      .sort((a, b) => familyScore(b.cards) - familyScore(a.cards));
    const candidate = ranked[0];
    if (!candidate)
      throw new Error("design_shortlist_explicit_photo_mix_unavailable");
    if (candidate.cards.some(card => !scores.has(card.id)))
      throw new Error(
        "design_shortlist_missing_scores_for_required_capability"
      );
    if (selected.size >= DESIGN_SHORTLIST_SIZE) {
      const removable = Array.from(selected)
        .filter(([family]) =>
          kinds.every(
            other =>
              other === kind ||
              Array.from(selected).some(
                ([peer, cards]) =>
                  peer !== family && Boolean(sequence(cards, other))
              )
          )
        )
        .sort(
          (a, b) =>
            (originalFamilyScores.get(a[0]) ?? familyScore(a[1])) -
            (originalFamilyScores.get(b[0]) ?? familyScore(b[1]))
        );
      if (!removable.length)
        throw new Error("design_shortlist_explicit_photo_mix_unavailable");
      selected.delete(removable[0][0]);
    }
    selected.set(candidate.family, candidate.cards);
    for (const requiredKind of kinds)
      addSequence(candidate.family, requiredKind);
  }
  const retained = Array.from(selected.values()).flat();
  const originalIds = new Set(shortlist.cards.map(card => card.id));
  const retainedFamilies = new Set(selected.keys());
  const restoredIds = retained
    .filter(card => !originalIds.has(card.id))
    .map(card => card.id);
  if (restoredIds.length)
    recordGenerationEvent({
      stage: "design_shortlist_constraints",
      status: "completed",
      detail: "explicit_media_capability",
      data: {
        restoredIds,
        removedFamilies: Array.from(originalFamilyScores.keys()).filter(
          family => !retainedFamilies.has(family)
        ),
        retainedFamilies: Array.from(retainedFamilies),
        reason: mixed
          ? "explicit_two_photo_one_typographic"
          : "required_native_media",
      },
    });
  return retained;
}

function requiredSlideRoles(count: number): ComponentCardV1["roles"][number][] {
  return Array.from({ length: count }, (_, index) =>
    count === 1
      ? "static"
      : index === 0
        ? "cover"
        : index === count - 1
          ? "closing"
          : "development"
  );
}

/** Keep a complete sequence: a photo obligation belongs to the proposal, not to every slide. */
function filterImageEligibleCards(
  cards: ComponentCardV1[],
  count: number,
  obligation: ImageObligation
): ComponentCardV1[] {
  if (obligation.policy === "optional") return cards;
  const candidates =
    obligation.policy === "forbidden"
      ? cards.filter(
          card => !card.mediaSlots.length && !designHasPhotographicContent(card)
        )
      : cards;
  const roles = requiredSlideRoles(count);
  const families = new Map<string, ComponentCardV1[]>();
  for (const card of candidates) {
    if (!card.completeDesign?.baselineVerified) continue;
    const family = card.completeDesign.family;
    families.set(family, [...(families.get(family) ?? []), card]);
  }
  const eligibleFamilies = new Set(
    Array.from(families)
      .filter(([_family, members]) => {
        if (
          !roles.every(role => members.some(card => card.roles.includes(role)))
        )
          return false;
        if (!obligation.required) return true;
        const maximumSlots = roles.reduce(
          (sum, role) =>
            sum +
            Math.max(
              ...members
                .filter(card => card.roles.includes(role))
                .map(card => card.mediaSlots.length)
            ),
          0
        );
        return maximumSlots >= Math.max(1, obligation.slotTargets);
      })
      .map(([family]) => family)
  );
  return candidates.filter(card =>
    eligibleFamilies.has(card.completeDesign?.family ?? "")
  );
}

/** Validate the selector output against pinned cards before any native scene is instantiated. */
export function validateDesignSelection(
  options: Array<{ designIds: string[]; reason: string }>,
  cards: ComponentCardV1[],
  count: number,
  imageObligation?: ImageObligation,
  requestedPhotoMix = false
) {
  if (options.length !== 3) throw new Error("Três propostas são obrigatórias");
  const byId = new Map(cards.map(c => [c.id, c]));
  for (const option of options) {
    if (option.designIds.length !== count)
      throw new Error("Quantidade de slides divergente");
    const selected = option.designIds.map((id, i) => {
      const card = byId.get(id),
        role =
          count === 1
            ? "static"
            : i === 0
              ? "cover"
              : i === count - 1
                ? "closing"
                : "development";
      if (!card?.completeDesign?.baselineVerified || !card.roles.includes(role))
        throw new Error("Design ou função de slide não elegível");
      return card;
    });
    if (new Set(selected.map(c => c.completeDesign!.family)).size !== 1)
      throw new Error("Carrossel mistura famílias");

    const totalSlots = selected.reduce(
      (sum, card) => sum + (card.mediaSlots?.length ?? 0),
      0
    );
    if (
      imageObligation?.policy === "forbidden" &&
      (totalSlots > 0 || selected.some(designHasPhotographicContent))
    )
      throw new Error("Pedido sem fotos não permite slots de mídia nativos");
    if (imageObligation?.required) {
      if (totalSlots < Math.max(1, imageObligation.slotTargets || 1)) {
        throw new Error(
          `Composição selecionada (${selected[0]?.completeDesign?.family}) não possui slots de mídia nativos para cumprir a obrigação contratada (${imageObligation.purpose})`
        );
      }
    }
  }
  if (
    requestedPhotoMix &&
    options.filter(option =>
      option.designIds.some(id => Boolean(byId.get(id)?.mediaSlots.length))
    ).length !== 2
  )
    throw new Error(
      "two_options_with_native_photo_slots_and_one_typographic_required"
    );
  // Diversity guides selection, but repeated families are not a technical defect.
  // Do not veto otherwise valid proposals because of their siblings' appearance.
}

/** Same hard media/sequence requirements before admission and inside durable preparation. */
export function eligibleCompleteDesignCardsForRequest(
  cards: ComponentCardV1[],
  input: OrchestratedGenerationInput
): ComponentCardV1[] {
  const offers = eligibleCompleteDesignOffersForRequest(cards, input);
  return Array.from(new Map(offers.flatMap(o => o.slides.map(s => [s.componentId, s.card] as const))).values());
}

export function eligibleCompleteDesignOffersForRequest(cards: ComponentCardV1[], input: OrchestratedGenerationInput) {
  const brief = input.executionBrief ? normalizeExecutionBrief(input.executionBrief) : null;
  const obligation = determineImageObligation(input, brief);
  const offers = resolveCompleteDesignOffers(cards, {
    slideCount: input.postMode === "static" ? 1 : input.slideCount ?? 5,
    contentMode: brief?.interventionLevel === "visual_only" ? "literal" : "compose",
    instructions: [input.content, brief?.rawInput, brief?.notes].filter(Boolean).join("\n"),
  }).filter(o => {
    const slots = o.slides.reduce((n, s) => n + s.card.mediaSlots.length, 0);
    return obligation.required ? slots >= Math.max(1, obligation.slotTargets) : obligation.policy !== "forbidden" || (!slots && !o.slides.some(s => designHasPhotographicContent(s.card)));
  });
  if (!offers.length) throw new GenerationFailureError("catalog_variant_unavailable", "catalog", false);
  const mix = requestsPhotoMix(requestImageInstructions(input, brief));
  if (mix && (!offers.some(o => o.slides.some(s => s.card.mediaSlots.length)) || !offers.some(o => o.slides.every(s => !s.card.mediaSlots.length && !designHasPhotographicContent(s.card)))))
    throw new GenerationFailureError("catalog_variant_unavailable", "catalog", false);
  return offers;
}

/** Recheck pinned catalog identities on every worker entry, before any new paid effect. */
export async function verifyPreparedEligibility(prepared: PreparedGeneration, experimental: boolean, hydrate = hydrateCompleteDesignComponents, slots = [0,1,2]) {
  if (
    !((prepared.preparationVersion === 2 && (prepared.reviewPolicyVersion === 5 || prepared.reviewPolicyVersion === 6)) || (prepared.preparationVersion === 3 && prepared.reviewPolicyVersion === 7) || (prepared.preparationVersion === 4 && prepared.reviewPolicyVersion === 8) || (prepared.preparationVersion === 5 && prepared.reviewPolicyVersion === 9)) ||
    prepared.selectedOffers?.length !== 3
  )
    throw new GenerationFailureError("preparation_contract_incompatible", "catalog", false);

  if (prepared.reviewPolicyVersion === 6) assertReviewExecutionConfig(prepared.reviewExecutionConfig);
  if (prepared.reviewPolicyVersion === 7 || prepared.reviewPolicyVersion === 8 || prepared.reviewPolicyVersion === 9) {
    const config = assertPinnedReviewConfig(prepared.reviewExecutionConfig);
    if(config.policyVersion!==prepared.reviewPolicyVersion) throw new GenerationFailureError("preparation_contract_incompatible","catalog");
    if(prepared.reviewPolicyVersion===8 && (prepared.editorialContext?.version!==2 || !prepared.editorialApproaches || prepared.editorialApproaches.length!==3 || (prepared.electionReceipt?.version===2 && prepared.electionReceipt.choices.some(c=>c.editorialApproach!==prepared.editorialApproaches![c.slot])))) throw new GenerationFailureError("preparation_contract_incompatible","catalog");
    if(prepared.reviewPolicyVersion===8 && prepared.editorialApproaches?.some(a=>prepared.executionBrief?.interventionLevel==="visual_only" ? a!==null : !a?.trim())) throw new GenerationFailureError("preparation_contract_incompatible","catalog");
    if(!prepared.editorialContextHash) throw new GenerationFailureError("preparation_contract_incompatible","catalog");
  }
  if (prepared.electionReceipt && (!electionReceiptIntact(prepared.electionReceipt) ||
    prepared.electionReceipt.choices.some(c => prepared.selectedOffers?.[c.slot]?.offerId !== c.chosenOfferId)))
    throw new GenerationFailureError("catalog_coverage_incomplete", "catalog");
  if(prepared.reviewPolicyVersion===9){
    if(prepared.editorialContext?.version!==3 || !prepared.alternativeOffers || !prepared.alternativeDefinitions || prepared.alternativeOffers.length!==3 || prepared.alternativeDefinitions.length!==3) throw new GenerationFailureError("preparation_contract_incompatible","catalog");
    const hash=arsenalHash({alternatives:prepared.alternativeOffers.map(g=>g.map(o=>({offerId:o.offerId,signature:o.signature,slides:o.slides.map(s=>({id:s.componentId,hash:s.componentHash}))}))),reason:"evaluated_compatible_offers_in_suitability_order"});
    if(hash!==prepared.recoveryPlanHash || prepared.alternativeOffers.some((g,slot)=>g.length>3 || g.length!==prepared.alternativeDefinitions![slot].length || g.some((o,a)=>o.slides.some((s,i)=>prepared.alternativeDefinitions![slot][a][i]?.id!==s.componentId||prepared.alternativeDefinitions![slot][a][i]?.hash!==s.componentHash))))throw new GenerationFailureError("preparation_contract_incompatible","catalog");
    const alt=prepared.alternativeOffers.filter((_,slot)=>slots.includes(slot)).flat(2).flatMap(o=>o.slides);
    const current=await hydrate(Array.from(new Set(alt.map(s=>s.componentId))),experimental);const map=new Map(current.map(d=>[d.id,d.hash]));
    if(alt.some(s=>map.get(s.componentId)!==s.componentHash))throw new GenerationFailureError("catalog_component_ineligible","catalog");
  }
  const pinned = prepared.selectedOffers.filter((_,slot)=>slots.includes(slot)).flatMap(o => o.slides);
  const definitions = await hydrate(Array.from(new Set(pinned.map(s => s.componentId))), experimental);
  const byId = new Map(definitions.map(d => [d.id, d]));
  if (pinned.some(s => byId.get(s.componentId)?.hash !== s.componentHash) ||
      prepared.selectedDefinitions.some((sequence, slot) => sequence.length !== prepared.selectedOffers![slot].slides.length || sequence.some((d, i) => d.id !== prepared.selectedOffers![slot].slides[i].componentId || d.hash !== prepared.selectedOffers![slot].slides[i].componentHash)))
    throw new GenerationFailureError("catalog_component_ineligible", "catalog", false);
}

export async function prepareOrchestratedGeneration(
  input: OrchestratedGenerationInput,
  ownerId: string,
  experimental: boolean,
  deadlineMs: number,
  overrides: Partial<PreparationDeps>
): Promise<PreparedGeneration> {
  if (!overrides.loadContext || !overrides.operation)
    throw new Error("Dependências duráveis de preparação ausentes");
  const deps: PreparationDeps = {
    generate: invokeLLM,
    retrieve: retrieveCoveredCatalog,
    hydrate: hydrateCompleteDesignComponents,
    preferences: readStudioPreferences,
    shortlist: shortlistCompleteDesigns,
    ...overrides,
  } as PreparationDeps;
  const checkBudget = () => {
    deps.signal?.throwIfAborted();
    if (Date.now() >= deadlineMs)
      throw new Error("generation_deadline_exceeded");
  };
  checkBudget();
  const executionBrief = input.executionBrief
    ? normalizeExecutionBrief(input.executionBrief)
    : null;
  const contextResult = await deps.operation("context", () =>
    deps.loadContext(input, ownerId)
  );
  const baseContextContent=typeof contextResult==="string"?contextResult:contextResult.text;
  const sourceReferences:import("./proposalGraph").ProposalSourceReference[]|undefined=typeof contextResult==="string"?undefined:contextResult.sources.map(s=>({id:s.id,kind:s.kind,purpose:s.purpose,origin:s.origin,url:s.url,facts:s.text}));
  const readSources=!deps.resumeReviewPolicyVersion||deps.resumeReviewPolicyVersion===9;
  const imageSourceReading = readSources && (input.inputType==="image"&&input.imageUrl || input.sources?.some(s=>s.kind==="image"&&s.purpose==="content")) ? await deps.operation("image_source_reading",()=>readGenerationImageSources(input,ownerId,deadlineMs,deps.signal,deps.generate)) : null;
  const visualReferenceImages=readSources && (input.sources?.some(s=>s.kind==="image"&&s.purpose==="visual_reference")||input.executionBrief?.brandInput?.referenceImageUrl)?await deps.operation("visual_reference_images",()=>resolveGenerationVisualImages(input,ownerId,deps.signal)):{images:[]};
  const visualReferenceSites=readSources && input.sources?.some(s=>s.kind==="url"&&s.purpose==="visual_reference")?await deps.operation("visual_reference_sites",()=>resolveGenerationVisualSites(input)):{sites:[]};
  if(imageSourceReading&&sourceReferences)sourceReferences.push({id:"source-image",kind:"image",purpose:"content",origin:"image_reading",facts:[imageSourceReading.reading.extractedText,...imageSourceReading.reading.facts].join("\n")});
  if(imageSourceReading?.reading.uncertainties.length&&sourceReferences)sourceReferences.push({id:"source-image-uncertainties",kind:"image",purpose:"guidance",origin:"image_reading_uncertainties",facts:JSON.stringify(imageSourceReading.reading.uncertainties)});
  const contextContent=completeSourceContext([baseContextContent,imageSourceReading?`ORIGEM: leitura de imagem (consulte também os pixels originais)\n${JSON.stringify(imageSourceReading.reading)}`:""].filter(Boolean).join("\n\n"));
  console.info(
    `[prep] 📄 Contexto carregado (${contextContent.length} caracteres)`
  );
  const preferences = await deps.operation("preferences", () =>
    deps.preferences(ownerId)
  );
  console.info(`[prep] 🎨 Preferências visuais carregadas`);
  // An object preserves trace metadata in the operation journal. Accept historical
  // array results on resume so already completed reads remain immutable.
  const recentHistory = await deps.operation<
    { selections: RecentDesignSelection[] } | RecentDesignSelection[]
  >("recent_selections", async () => ({
    selections: await (deps.recentSelections?.() ?? Promise.resolve([])),
  }));
  const recentSelections = Array.isArray(recentHistory)
    ? recentHistory
    : recentHistory.selections;
  console.info(
    `[prep] 🕒 ${recentSelections.length} seleções recentes recuperadas`
  );
  const visualPreference = effectiveStudioPreferences(
    preferences ?? defaultStudioPreferences,
    [input.content, executionBrief?.rawInput, executionBrief?.notes]
      .filter(Boolean)
      .join("\n")
  );
  const count = input.postMode === "static" ? 1 : (input.slideCount ?? 5);
  const catalogResult = await deps.operation("catalog", async () => {
    const catalog = await deps.retrieve({
      aspectRatio: input.aspectRatio,
      postMode: input.postMode,
      text: contextContent,
      styleText: input.content,
      slideCount: count,
      experimental,
      brandColors: executionBrief?.brandInput?.brandColors,
      brandFonts: executionBrief?.brandInput?.fontHint
        ? [executionBrief.brandInput.fontHint]
        : [],
    });
    // Pin before any paid assessment. Previously persisted catalogs keep their old prompts and keys.
    return Array.isArray(catalog) ? catalog : { ...catalog, selectionProfileVersion: 2 as const };
  });
  const compactProfiles = !Array.isArray(catalogResult) && catalogResult.selectionProfileVersion === 2;
  // Historical array receipts remain immutable and explicitly unaudited.
  const cards = Array.isArray(catalogResult) ? catalogResult : catalogResult.cards;
  const coverage = Array.isArray(catalogResult) ? null : catalogCoverageSchema.parse(catalogResult.coverage);
  if (coverage) {
    recordGenerationEvent({ stage: "catalog_coverage", status: coverage.issues.length ? "failed" : "completed", detail: "registered_and_indexed", data: { receiptHash: coverage.receiptHash, registered: coverage.entries.length, indexed: coverage.indexed.length, issues: coverage.issues } });
    assertCatalogCoverage(coverage, cards);
    if (coverage.scopeHash !== catalogScopeHash({ aspectRatio: input.aspectRatio, postMode: input.postMode, slideCount: count, text: contextContent, experimental, brandColors: executionBrief?.brandInput?.brandColors, brandFonts: executionBrief?.brandInput?.fontHint ? [executionBrief.brandInput.fontHint] : [] })) throw new GenerationFailureError("catalog_coverage_incomplete", "catalog");
  }
  console.info(
    `[prep] 📚 ${cards.length} designs compatíveis recuperados do catálogo`
  );
  if (!cards.length)
    throw new Error(
      "Não há composições completas compatíveis com este pedido e formato."
    );
  const imageObligation = determineImageObligation(input, executionBrief, visualPreference);
  const requestedPhotoMix = requestsPhotoMix(requestImageInstructions(input, executionBrief));
  const offerRequest = { slideCount: count, contentMode: executionBrief?.interventionLevel === "visual_only" ? "literal" as const : "compose" as const, instructions: [input.content, executionBrief?.rawInput, executionBrief?.notes].filter(Boolean).join("\n") };
  const potential = resolveCompleteDesignOffers(cards, offerRequest);
  const offers = potential.filter(o => {
    const slots = o.slides.reduce((n,s) => n+s.card.mediaSlots.length,0);
    return imageObligation.required ? slots >= Math.max(1,imageObligation.slotTargets) : imageObligation.policy !== "forbidden" || (!slots && !o.slides.some(s => designHasPhotographicContent(s.card)));
  });
  const expectedCandidates = coverage ? electionCandidates(coverage, cards, potential, offers, offerRequest, compactProfiles) : null;
  const candidates = expectedCandidates ? electionCandidatesSchema.parse(await deps.operation("election_candidates", async () => expectedCandidates)) : null;
  if (candidates && arsenalHash(candidates) !== arsenalHash(expectedCandidates)) throw new GenerationFailureError("catalog_coverage_incomplete", "catalog");
  if (!offers.length || (requestedPhotoMix && (!offers.some(o => o.slides.some(s => s.card.mediaSlots.length)) || !offers.some(o => o.slides.every(s => !s.card.mediaSlots.length && !designHasPhotographicContent(s.card)))))) throw new GenerationFailureError("catalog_variant_unavailable", "catalog", false);
  const brief = buildUserPrompt({ request: input, executionBrief, contextContent }).content;
  const profiles = compactProfiles ? Object.fromEntries(candidates!.selectionProfiles!.map(p => [p.offerId, p.profile])) : Object.fromEntries(offers.map(offer => {
    const members = Array.from(new Map(offer.slides.map(s => [s.componentId, s])).values());
    const base = describeCompleteDesign(offer.slides[0].card);
    return [offer.offerId, Object.fromEntries(Object.entries(base).map(([key, value]) => [key, Array.isArray(value) ? members.flatMap(s => (describeCompleteDesign(s.card)[key as keyof typeof base] as string[]).map(v => `${s.role}: ${v}`)) : value])) as typeof base];
  }));
  // One projection per exact offer. Native member profiles remain the evidence;
  // children are never evaluated as separate design directions.
  const projections = offers.map(o => ({ ...o.slides[0].card, id: o.offerId, hash: o.signature, roles: Array.from(new Set(o.slides.map(s => s.role))), completeDesign: { ...o.slides[0].card.completeDesign!, family: compactProfiles ? o.family : o.offerId } }));
  const briefText = extractTextContent(brief);
  const sourceAlreadyInBrief = briefText.includes(contextContent) || executionBrief?.rawInput === contextContent || executionBrief?.notes === contextContent;
  const sourceEvidence = sourceAlreadyInBrief ? undefined : contextContent;
  const isComplementaryContent = Boolean(executionBrief) && Boolean(input.content) && input.content !== executionBrief?.rawInput && input.content !== executionBrief?.notes;
  const complementaryInstruction = isComplementaryContent ? input.content : undefined;
  const requirements = effectiveContentRequirements(executionBrief);
  const jevModel = ENV.openRouterDesignSelectionModel;
  const textModel = input.postMode === "carousel" ? ENV.openRouterCarouselModel : ENV.openRouterStaticModel;
  const resolvedReviewConfig = resolveReviewExecutionConfigV9(textModel) as SelectionInputReceipt["reviewExecutionConfig"];
  const contextFor = (config: SelectionInputReceipt["reviewExecutionConfig"]) => {
    const source = {prompt:input.content, executionBrief:executionBrief ?? undefined, contextContent, projectSnapshot:input.projectSnapshot, projectDossier:input.projectDossier ?? (input.projectId ? contextContent : undefined), platform:input.platform, postMode:input.postMode, tone:input.tone};
    return config.policyVersion === 9 ? editorialContextV9({...source,sourceReferences}) : config.policyVersion === 8 ? editorialContextV8(source) : editorialContextV7(source, config.editorialGuidanceVersion);
  };
  const freshContext = contextFor(resolvedReviewConfig);

  let selectionInput: SelectionInputReceipt;
  try {
    selectionInput = selectionInputReceiptSchema.parse(
      await deps.operation("selection_input", async () => ({
        brief: (resolvedReviewConfig.policyVersion === 8 || resolvedReviewConfig.policyVersion === 9) ? (Array.isArray(brief) ? brief.map(part => typeof part === "object" && part.type === "text" ? {...part,text:"Pedido em editorialContext.request.prompt"} : part) : "Pedido em editorialContext.request.prompt") : resolvedReviewConfig.editorialGuidanceVersion === 6
          ? (Array.isArray(brief) ? brief.map(part => typeof part === "object" && part.type === "text" ? {...part, text:input.content} : part) : input.content)
          : brief,
        ...((resolvedReviewConfig.policyVersion !== 8 && resolvedReviewConfig.policyVersion !== 9) && resolvedReviewConfig.editorialGuidanceVersion !== 6 && sourceEvidence !== undefined ? { sourceEvidence } : {}),
        ...((resolvedReviewConfig.policyVersion !== 8 && resolvedReviewConfig.policyVersion !== 9) && complementaryInstruction !== undefined ? { complementaryInstruction } : {}),
        requirements: (resolvedReviewConfig.policyVersion === 8 || resolvedReviewConfig.policyVersion === 9) ? resolvedEditorialContext(freshContext).requirements : resolvedReviewConfig.editorialGuidanceVersion === 6 ? freshContext.requirements : requirements,
        ...(((resolvedReviewConfig.policyVersion === 8 || resolvedReviewConfig.policyVersion === 9) || resolvedReviewConfig.editorialGuidanceVersion === 6) ? {editorialContext:freshContext} : {}),
        reviewExecutionConfig: resolvedReviewConfig,
        jevModel,
        ...(resolvedReviewConfig.policyVersion === 9 ? {shortlistContextEncoding: 1 as const} : {}),
      }))
    );
  } catch (err) {
    if (err instanceof GenerationFailureError) throw err;
    throw new GenerationFailureError("preparation_contract_incompatible", "selection", false);
  }

  try {
    assertPinnedReviewConfig(selectionInput.reviewExecutionConfig);
  } catch {
    throw new GenerationFailureError("preparation_contract_incompatible", "selection", false);
  }

  // The journal pins its validated revision; upgrades do not repurchase selection.
  const frozenEditorialContext = contextFor(selectionInput.reviewExecutionConfig);
  if ((((selectionInput.reviewExecutionConfig.policyVersion === 8 || selectionInput.reviewExecutionConfig.policyVersion === 9) || selectionInput.reviewExecutionConfig.editorialGuidanceVersion === 6) &&
      arsenalHash(selectionInput.editorialContext) !== arsenalHash(frozenEditorialContext)))
    throw new GenerationFailureError("preparation_contract_incompatible", "selection", false);

  // JSONB may reorder custom context keys. Rebuild the validated version's
  // original serialization before hashing JEV requests; never change the pin or
  // purchase a new assessment merely because its stored object order changed.
  if (selectionInput.editorialContext) selectionInput = {...selectionInput,editorialContext:frozenEditorialContext};

  const shortlist = await deps.shortlist({
    cards: projections,
    model: selectionInput.jevModel,
    profiles,
    ...(compactProfiles ? { offers } : {}),
    recentSelections,
    brief: designShortlistBrief(selectionInput.brief as any, {
      visualPreference,
      capturedVisualPreferences:input.projectSnapshot?.version===2?input.projectSnapshot.visualPreferences:undefined,
      visualReferenceSites,
      imageObligation,
      ...(selectionInput.editorialContext ? {editorialContext:selectionInput.shortlistContextEncoding === 1 ? compactSelectionContextV1(selectionInput.editorialContext) : selectionInput.editorialContext} : {}),
      ...(selectionInput.complementaryInstruction ? { complementaryInstruction: selectionInput.complementaryInstruction } : {}),
      ...(selectionInput.sourceEvidence === undefined ? {} : { sourceEvidence: selectionInput.sourceEvidence }),
      ...((selectionInput.reviewExecutionConfig.policyVersion !== 8 && selectionInput.reviewExecutionConfig.policyVersion !== 9) && selectionInput.requirements?.length ? { requirements: selectionInput.requirements } : {}),
    }),
    slideCount: count,
    deadlineMs,
    signal: deps.signal,
    operation: deps.operation,
  });
  const retained = new Set(shortlist.cards.map(c => c.id));
  let offered = offers.filter(o => retained.has(o.offerId));
  const score = (o: CompleteDesignOfferV1) => shortlist.evaluated.find(e => e.id === o.offerId)?.score ?? -Infinity;
  // Explicit image obligations survive the advisory shortlist, at the same offer budget.
  for (const photo of requestedPhotoMix ? [true, false] : imageObligation.required ? [true] : []) {
    if (offered.some(o => o.slides.some(s => s.card.mediaSlots.length) === photo)) continue;
    const candidate = offers.filter(o => o.slides.some(s => s.card.mediaSlots.length) === photo).sort((a,b) => score(b)-score(a))[0];
    if (!candidate) throw new GenerationFailureError("catalog_variant_unavailable", "catalog", false);
    if (offered.length >= DESIGN_SHORTLIST_SIZE) offered = [...offered].sort((a,b) => score(a)-score(b)).slice(1);
    offered.push(candidate);
  }
  const expectedClassification = candidates ? electionClassification(candidates, shortlist, offered) : null;
  const classification = expectedClassification ? electionClassificationSchema.parse(await deps.operation("election_classification", async () => expectedClassification)) : null;
  if (coverage && candidates && classification) {
    if (arsenalHash(classification) !== arsenalHash(expectedClassification)) throw new GenerationFailureError("catalog_coverage_incomplete", "selection");
    assertElectionCoverage(coverage, candidates, classification);
    recordGenerationEvent({ stage: "election_classification", status: "completed", detail: classification.method, data: { receiptHash: classification.receiptHash, eligibleOffers: offers.length, evaluated: classification.evaluated.length, selectorIds: classification.selectorIds } });
  }
  if (!offered.length) throw new GenerationFailureError("catalog_variant_unavailable", "catalog", false);
  const modern = (selectionInput.reviewExecutionConfig.policyVersion === 8 || selectionInput.reviewExecutionConfig.policyVersion === 9);
  const literal = executionBrief?.interventionLevel === "visual_only";
  const schema = z.object({ version: z.literal(modern ? 3 : 2), options: z.array(z.object({ offerId: z.enum(offered.map(o => o.offerId) as [string, ...string[]]), reason: z.string().min(1).max(600), ...(modern && !literal ? {editorialApproach:z.string().min(1).max(600)} : {}) }).strict()).length(3) }).strict();
  const json = z.toJSONSchema(schema); delete json.$schema;
  const profileContext = compactProfiles ? { version: 2, profileHashes: Object.fromEntries(offered.map(o => [o.offerId, arsenalHash(profiles[o.offerId])])) } : undefined;
  const raw = await deps.operation("selection", async () => {
    checkBudget();
    const selectionParams:Parameters<typeof deps.generate>[0]={
      pinnedModel: selectionInput.reviewExecutionConfig.textModel, traceLabel: modern ? "generation_selection_v3" : "generation_selection_v2", taskRoute: input.postMode === "carousel" ? "carousel_generation" : "static_generation", model: input.model, deadlineMs, signal: deps.signal,
      disableFallback: true, maxTransportAttempts: 1, disableStructuredRepair: true, forceTextSchema: true,
      messages: [
        { role: "system", content: modern ? `${referenceContextInstructions} Escolha exatamente três offerId do catálogo finito e preserve capacidades, mídia, textos literais e requisitos expressos. reason justifica exclusivamente adequação visual; ${literal ? "Preserve a composição literal, sem editorialApproach." : "editorialApproach descreve um recorte editorial próprio e distinto para cada proposta, com utilidade para o público, sem inventar fatos ou uma fórmula obrigatória. Em light_optimize mantenha estrutura e intervenções leves."} A justificativa visual não substitui o recorte editorial. Retorne version=3 e options com offerId, reason${literal ? "" : " e editorialApproach"}. ${requestedPhotoMix ? "Exatamente duas propostas com slots de foto e uma sem slots nem fotografia." : ""}` : `Contrato postspark.selection.v2. Escolha exatamente três offerId do catálogo finito. Cada oferta contém uma sequência completa e imutável de capa/leitura/fechamento; não escolha componentes individuais. Compare o núcleo pedido, requisitos explícitos e condições das promessas usadas com as capacidades reais por papel. Detalhes periféricos podem ficar fora do recorte; nunca apague condição necessária para tornar uma promessa verdadeira. Justifique a adequação. Proponha três abordagens editoriais distintas quando permitido, sem inventar fatos para variar. Lista/comparação e estrutura pedida prevalecem; a razão não é fonte factual. Preserve requisitos explícitos, textos literais, cores, fontes e mídia. Prefira famílias distintas com adequação próxima; repetição é permitida quando necessária. Nunca invente IDs, layouts ou capacidades. ${requestedPhotoMix ? "Exatamente duas propostas com slots de foto e uma sem slots nem fotografia." : ""} Retorne version=2 e options com offerId e reason.` },
        { role: "user", content: JSON.stringify({ brief: selectionInput.reviewExecutionConfig.policyVersion===9 ? extractTextContent(selectionInput.brief as any) : selectionInput.brief, ...(selectionInput.editorialContext ? {editorialContext:selectionInput.editorialContext} : {}), ...(selectionInput.complementaryInstruction ? { complementaryInstruction: selectionInput.complementaryInstruction } : {}), ...(selectionInput.sourceEvidence ? { sourceEvidence: selectionInput.sourceEvidence } : {}), ...((selectionInput.reviewExecutionConfig.policyVersion !== 8 && selectionInput.reviewExecutionConfig.policyVersion !== 9) && selectionInput.requirements?.length ? { requirements: selectionInput.requirements } : {}), narrativeContract: null, visualContract: carouselVisualContract(count, input.content), imageObligation, visualPreference, capturedVisualPreferences:input.projectSnapshot?.version === 2 ? input.projectSnapshot.visualPreferences : undefined, visualReferenceSites, recentSelections,
          ...(compactProfiles ? { profileLegend: compactDesignProfileLegend } : {}),
          catalog: offered.map(o => compactProfiles ? {
            offerId: o.offerId, family: o.family, profile: profiles[o.offerId] as CompactOfferProfile,
            suitability: shortlist.evaluated.find(e => e.id === o.offerId) ? { score: score(o), confidence: shortlist.evaluated.find(e => e.id === o.offerId)!.confidence } : null,
          } : ({ offerId: o.offerId, family: o.family, contentMode: o.contentMode, visualMode: o.visualMode, slides: o.slides.map(s => ({ role: s.role, ...designSelectionCard(s.card) })), suitability: shortlist.evaluated.find(e => e.id === o.offerId) ?? null })) }) },
      ], response_format: { type: "json_schema", json_schema: { name: modern ? "selection_v3" : "selection_v2", strict: true, schema: json } }, maxCompletionTokens: 2000,
    };
    if(selectionInput.reviewExecutionConfig.policyVersion===9&&visualReferenceImages.images.length){const user=selectionParams.messages.find(m=>m.role==="user")!;user.content=[{type:"text",text:extractTextContent(user.content)},...visualReferenceImages.images.map(url=>({type:"image_url" as const,image_url:{url,detail:"high" as const}}))];}
    const response=await deps.generate(selectionParams);
    const decoded = safeJsonParse<unknown>(extractTextContent(response.choices?.[0]?.message?.content), null);
    // Local evidence of the profiles actually supplied, never accepted from model output.
    return compactProfiles && decoded && typeof decoded === "object" && !Array.isArray(decoded)
      ? { ...decoded, profileContext } : decoded;
  });
  if (!raw || (raw as {version?:number}).version !== (modern ? 3 : 2)) throw new GenerationFailureError("preparation_contract_incompatible", "selection", false);
  if (compactProfiles && arsenalHash((raw as Record<string, unknown>).profileContext) !== arsenalHash(profileContext))
    throw new GenerationFailureError("catalog_coverage_incomplete", "selection");
  const { profileContext: _profileContext, ...selectionData } = raw as Record<string, unknown>;
  const selected = schema.parse(compactProfiles ? selectionData : raw);
  const original = selected.options.map(option => offered.find(o => o.offerId === option.offerId)!);
  if (requestedPhotoMix && original.filter(o => o.slides.some(s => s.card.mediaSlots.length)).length !== 2) throw new GenerationFailureError("catalog_variant_unavailable", "selection", false);
  // Replace only a repeated family with an unused, similarly suitable family.
  // A replacement must improve total variety and retain media and writing room.
  const chosen = [...original];
  for (let i = 1; i < chosen.length; i++) {
    const o = chosen[i];
    if (!chosen.slice(0,i).some(p => p.family === o.family) || !Number.isFinite(score(o))) continue;
    const candidate = offered.filter(c => !chosen.some(p => p.family === c.family) && score(c) >= score(o)-0.2 && c.slides.some(s => s.card.mediaSlots.length) === o.slides.some(s => s.card.mediaSlots.length) && c.slides.every((s,j) => designTextBudgets(s.card).filter(b => /body|items|list|comparison|metric/.test(b.source)).reduce((n,b) => n+b.estimatedCharacters,0) >= designTextBudgets(o.slides[j].card).filter(b => /body|items|list|comparison|metric/.test(b.source)).reduce((n,b) => n+b.estimatedCharacters,0))).sort((a,b) => score(b)-score(a))[0];
    if (candidate && ![input.content, executionBrief?.rawInput, executionBrief?.notes].join(" ").toLowerCase().includes(o.slides[0].card.label.toLowerCase())) chosen[i] = candidate;
  }
  const approaches = modern ? selected.options.map(o=>typeof o.editorialApproach === "string" ? o.editorialApproach : null) : undefined;
  const decisionSchema = modern ? electionDecisionV2Schema : electionDecisionSchema;
  const expectedDecision = classification ? decisionSchema.parse(sealElectionReceipt({ version: modern ? 2 : 1, classificationReceiptHash: classification.receiptHash, choices: chosen.map((o,i) => ({ slot:i, originalOfferId:original[i].offerId, chosenOfferId:o.offerId, reason:selected.options[i].reason, ...(modern ? {editorialApproach:approaches![i]} : {}), substitutionReason:o.offerId === original[i].offerId ? null : "similar_suitability_more_distinct_families_preserved_media_and_capacity" })) })) : null;
  const electionReceipt = expectedDecision ? decisionSchema.parse(await deps.operation("election_decision", async () => expectedDecision)) : undefined;
  if (coverage && candidates && classification && electionReceipt) {
    if (arsenalHash(electionReceipt) !== arsenalHash(expectedDecision)) throw new GenerationFailureError("catalog_coverage_incomplete", "selection");
    assertElectionCoverage(coverage, candidates, classification, electionReceipt);
    recordGenerationEvent({ stage:"election_decision",status:"completed",detail:"coverage_verified",data:{receiptHash:electionReceipt.receiptHash,choices:electionReceipt.choices} });
  }
  const alternatives = selectionInput.reviewExecutionConfig.policyVersion === 9 ? chosen.map(initial => offered
    .filter(o=>o.offerId!==initial.offerId && Number.isFinite(score(o)) && o.slides.length===initial.slides.length && o.slides.some(s=>s.card.mediaSlots.length)===initial.slides.some(s=>s.card.mediaSlots.length))
    .sort((a,b)=>score(b)-score(a)||a.offerId.localeCompare(b.offerId)).slice(0,3)) : undefined;
  const ids = Array.from(new Set([...chosen,...(alternatives?.flat() ?? [])].flatMap(o => o.slides.map(s => s.componentId))));
  const definitions = await deps.operation("definitions", () => deps.hydrate(ids, experimental));
  const byId = new Map(definitions.map(d => [d.id,d]));
  const selectedDefinitions = chosen.map(o => o.slides.map(s => {
    const d = byId.get(s.componentId);
    if (!d || d.hash !== s.componentHash) throw new GenerationFailureError("catalog_component_ineligible", "catalog", false);
    return d;
  }));
  const alternativeDefinitions = alternatives?.map(group=>group.map(o=>o.slides.map(slide=>{const d=byId.get(slide.componentId);if(!d||d.hash!==slide.componentHash)throw new GenerationFailureError("catalog_component_ineligible","catalog");return d;})));
  const recoveryPlanHash = alternatives ? arsenalHash({alternatives:alternatives.map(g=>g.map(o=>({offerId:o.offerId,signature:o.signature,slides:o.slides.map(s=>({id:s.componentId,hash:s.componentHash}))}))),reason:"evaluated_compatible_offers_in_suitability_order"}) : undefined;
  recordGenerationEvent({ stage: "design_selection", status: "completed", detail: "curated_offers_v2", data: { offerIds: chosen.map(o => o.offerId), signatures: chosen.map(o => o.signature), selectedIds: chosen.map(o => o.slides.map(s => s.componentId)), hashes: chosen.map(o => o.slides.map(s => s.componentHash)), modes: chosen.map(o => o.visualMode), families: chosen.map(o => o.family), originalOfferIds: original.map(o => o.offerId), substitutions: chosen.map((o,i) => o.offerId !== original[i].offerId), distinctFamilies: new Set(chosen.map(o => o.family)).size } });
  const reviewExecutionConfig = selectionInput.reviewExecutionConfig;
  const editorialContextHash = frozenEditorialContext.hash;
  return { preparationVersion: reviewExecutionConfig.policyVersion === 9 ? 5 : modern ? 4 : 3, reviewPolicyVersion: reviewExecutionConfig.policyVersion, ...(alternatives ? {alternativeOffers:alternatives,alternativeDefinitions,recoveryPlanHash} : {}), ...(modern ? {editorialApproaches:approaches} : {}), reviewExecutionConfig, editorialContextHash, ...(selectionInput.editorialContext ? {editorialContext:selectionInput.editorialContext} : {}), ...(electionReceipt ? {electionReceipt} : {}), selectedOffers: chosen, selectedDefinitions, selectionReasons: selected.options.map((o,i) => chosen[i] === original[i] ? o.reason : "Adequação próxima com maior variedade de famílias e capacidades preservadas."), contextContent, sourceReferences, imageSourceReading, visualPreference, executionBrief, imageObligation,
    perProposalImageObligations: requestedPhotoMix ? chosen.map(o => { const photo = o.slides.some(s => s.card.mediaSlots.length); return { policy: photo ? "required" as const : "forbidden" as const, required: photo, purpose: photo ? "editorial-photo" as const : "none" as const, reason: "Mídia do pedido misto explícito.", slotTargets: photo ? 1 : 0 }; }) : undefined };
}
