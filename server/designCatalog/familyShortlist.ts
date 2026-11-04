import { arsenalHash } from "@shared/arsenalContent";
import type { FamilySelectionCandidate } from "@shared/designFamilySelection";
import type { GenerationPlanningReceipt } from "@shared/generationPlan";
import { DESIGN_SHORTLIST_SIZE, type DesignShortlistInput, type DesignShortlistResult } from "./designShortlist";

/** Family identities are provider questions. Concrete offers remain local and
 * inherit their family's judgment only after the family shortlist is closed. */
export async function shortlistDesignFamilies(
  input: DesignShortlistInput,
  families: FamilySelectionCandidate[],
  shortlist: (input: DesignShortlistInput) => Promise<DesignShortlistResult>
): Promise<DesignShortlistResult & { familyElection: NonNullable<GenerationPlanningReceipt["familyElection"]> }> {
  const byMember = new Map(input.cards.map(card => [card.id, card]));
  const members = families.flatMap(f => f.repertoires.map(r => r.defaultOffer.offerId));
  if (new Set(families.map(f => f.family)).size !== families.length ||
      new Set(members).size !== members.length || members.length !== input.cards.length ||
      members.some(id => !byMember.has(id))) throw new Error("family_shortlist_membership_invalid");
  const familyCards = families.map(f => ({
    ...byMember.get(f.repertoires[0].defaultOffer.offerId)!, id: f.id, hash: f.signature,
  }));
  const result = families.length ? await shortlist({
    ...input,
    cards: familyCards,
    offers: families.map(f => ({ ...f.repertoires[0].defaultOffer, offerId: f.id, signature: f.signature })),
    profiles: Object.fromEntries(families.map(f => [f.id, f.profile])),
  }) : { cards: [], evaluated: [], batches: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  const scores = new Map(result.evaluated.map(e => [e.id, e]));
  const selected = new Set(result.cards.map(c => c.id));
  if (scores.size !== families.length || result.evaluated.length !== families.length ||
      selected.size !== result.cards.length || selected.size !== Math.min(DESIGN_SHORTLIST_SIZE, families.length) ||
      families.some(f => scores.get(f.id)?.hash !== f.signature) ||
      Array.from(selected).some(id => !scores.has(id))) throw new Error("family_shortlist_result_invalid");
  const familyByMember = new Map(families.flatMap(f => f.repertoires.map(r => [r.defaultOffer.offerId, f] as const)));
  return {
    ...result,
    // Do not present family ranking positions as individual composition votes.
    ranking: undefined,
    cards: input.cards.filter(c => selected.has(familyByMember.get(c.id)!.id)),
    evaluated: input.cards.map(c => {
      const score = scores.get(familyByMember.get(c.id)!.id)!;
      return { id: c.id, hash: c.hash, score: score.score, confidence: score.confidence };
    }),
    familyElection: {
      version: 1,
      candidates: families.map(f => ({ id: f.id, family: f.family, signature: f.signature,
        profileHash: arsenalHash(f.profile), memberIds: f.repertoires.map(r => r.defaultOffer.offerId) })),
      ranking: families.map(f => ({ id: f.id, score: scores.get(f.id)!.score, confidence: scores.get(f.id)!.confidence })),
      shortlistedIds: result.cards.map(c => c.id),
    },
  };
}
