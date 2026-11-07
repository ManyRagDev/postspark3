import { arsenalHash } from "@shared/arsenalContent";
import type { FamilySelectionCandidate } from "@shared/designFamilySelection";
import type { GenerationIntent } from "@shared/generationPlan";
import type { ImageObligation } from "@shared/generationContracts";
import {
  effectiveFamilyScore,
  type FamilyScore,
  type FamilyPlanFit,
} from "@shared/familyRecovery";
import type { RecentDesignSelection } from "@shared/designSelection";
import { buildHeuristicGenerationPlan } from "../ai/workflows/heuristicPlanBuilder";

/** Same strict local planner used for final selection. Text fitting and provider
 * review still run after copy; this receipt is structural feasibility only. */
export function inspectFamilyPlanFit(args: {
  automatic?: boolean;
  neutrality?: import("@shared/familyNeutrality").FamilyNeutrality;
  families: FamilySelectionCandidate[];
  ids: string[];
  scores: FamilyScore[];
  intent: GenerationIntent;
  imageObligation: ImageObligation;
  requestedPhotoMix: boolean;
  slideCount: number;
  recentSelections: RecentDesignSelection[];
}): FamilyPlanFit {
  const selected = new Set(args.ids);
  const photo = (f: FamilySelectionCandidate) =>
    f.repertoires.some(r =>
      r.slides.some(s => s.variants.some(c => c.mediaSlots.length))
    );
  // Preserve the existing, limited restoration of assessed media alternatives.
  for (const required of args.requestedPhotoMix
    ? [true, false]
    : args.imageObligation.required
      ? [true]
      : []) {
    if (args.families.some(f => selected.has(f.id) && photo(f) === required))
      continue;
    const candidate = args.families
      .filter(
        f =>
          photo(f) === required &&
          args.scores.some(s => s.id === f.id && (args.automatic || s.score >= 2))
      )
      .sort(
        (a, b) =>
          effectiveFamilyScore(args.scores.find(s => s.id === b.id)!) -
          effectiveFamilyScore(args.scores.find(s => s.id === a.id)!)
      )[0];
    if (candidate) selected.add(candidate.id);
  }
  const eligible = args.families
    .filter(f => selected.has(f.id))
    .flatMap(f => f.repertoires);
  const evaluated = args.families.flatMap(f => {
    const score = args.scores.find(s => s.id === f.id);
    return score
      ? f.repertoires.map(r => ({
          ...score,
          id: r.defaultOffer.offerId,
          hash: r.defaultOffer.signature,
        }))
      : [];
  });
  const plan = buildHeuristicGenerationPlan({
    familyFirst: true,
    // Proposal diversity is handled by final selection. This inspection asks
    // whether content/media can be implemented at all, not whether three
    // sufficiently different styles exist inside a relative score band.
    neutrality: args.automatic && args.neutrality ? {...args.neutrality, proposalSelectionVersion: undefined} : args.neutrality,
    intent: args.intent,
    eligible,
    shortlist: {
      cards: [],
      evaluated,
      batches: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    },
    imageObligation: args.imageObligation,
    requestedPhotoMix: args.requestedPhotoMix,
    slideCount: args.slideCount,
    recentSelections: args.recentSelections,
  });
  return {
    viableSlots: plan.slots
      .filter(s => s.status === "viable")
      .map(s => s.slot)
      .sort(),
    planHash: arsenalHash(plan),
  };
}
