import type { ComponentCardV1 } from "@shared/componentAssembly";
import type { CompleteDesignOfferV1 } from "@shared/completeDesignOffers";
import { narrativeSlideRole } from "@shared/carouselNarrative";
import { carouselVisualContract } from "@shared/carouselVisual";
import { electionCandidatesSchema, electionClassificationSchema, sealElectionReceipt, type CatalogCoverage } from "@shared/designElection";
import type { DesignShortlistResult } from "./designShortlist";
import { describeCompactOffer } from "@shared/compactDesignProfile";
import { arsenalHash } from "@shared/arsenalContent";

export function electionCandidates(catalog: CatalogCoverage, cards: ComponentCardV1[], potential: CompleteDesignOfferV1[], offers: CompleteDesignOfferV1[], request: { slideCount: number; contentMode: "compose" | "literal"; instructions: string }, compactProfiles = false) {
  const roles = Array.from(new Set(Array.from({ length: request.slideCount }, (_, i) => narrativeSlideRole(i, request.slideCount))));
  const variantMode = Boolean(carouselVisualContract(request.slideCount, request.instructions));
  return electionCandidatesSchema.parse(sealElectionReceipt({
    version: 1 as const, catalogReceiptHash: catalog.receiptHash,
    ...(compactProfiles ? { selectionProfiles: offers.map(o => { const profile = describeCompactOffer(o); return { offerId: o.offerId, hash: arsenalHash(profile), profile }; }) } : {}),
    offers: offers.map(o => ({ offerId: o.offerId, signature: o.signature, family: o.family, sourceId: o.sourceId,
      slides: o.slides.map(s => ({ id: s.componentId, hash: s.componentHash, role: s.role, slideIndex: s.slideIndex })) })),
    cards: cards.map(card => {
      const uses = offers.filter(o => o.slides.some(s => s.componentId === card.id));
      const reasons: string[] = [];
      const variant = card.completeDesign?.designGuidance?.carouselVariant;
      if (!uses.length) {
        if (variant) {
          const source = cards.find(c => c.id === variant.sourceId);
          if (!source) reasons.push("variant_source_unavailable");
          else if (source.hash !== variant.sourceHash) reasons.push("variant_source_hash_mismatch");
          if (variant.version !== 2) reasons.push("variant_version_not_supported");
          if (variant.version === 2 && variant.contentMode !== request.contentMode) reasons.push("variant_content_mode_mismatch");
          if (!roles.includes(variant.role)) reasons.push("slide_role_not_requested");
          if (!variantMode) reasons.push("uniform_or_static_uses_source_only");
          if (!reasons.length) reasons.push("source_sequence_unavailable_or_media_incompatible");
        } else if (potential.some(o => o.sourceId === card.id)) reasons.push("media_requirement_not_met");
        else {
          for (const role of roles) {
            const available = !variantMode || role === "cover" || request.slideCount === 1
              ? card.roles.includes(role)
              : cards.some(c => {
                const v = c.completeDesign?.designGuidance?.carouselVariant;
                return v?.version === 2 && v.sourceId === card.id && v.sourceHash === card.hash &&
                  v.role === role && v.contentMode === request.contentMode && c.roles.includes(role) && c.completeDesign?.family === card.completeDesign?.family;
              });
            if (!available) reasons.push(`missing_exact_slide_role:${role}`);
          }
          if (!reasons.length) reasons.push("complete_sequence_unavailable");
        }
      }
      return { id: card.id, hash: card.hash, offerIds: uses.map(o => o.offerId), reasons };
    }),
  }));
}

export function electionClassification(candidates: ReturnType<typeof electionCandidates>, result: DesignShortlistResult, offered: CompleteDesignOfferV1[]) {
  const issues: string[] = [];
  const evaluated = result.evaluated.filter(e => Number.isFinite(e.score) && e.score >= 0 && e.score <= 4 && Number.isFinite(e.confidence) && e.confidence >= 0 && e.confidence <= 1)
    .map(({id,hash,score,confidence}) => ({id,hash,score,confidence}));
  if (evaluated.length !== result.evaluated.length) issues.push("invalid_scoring_answer");
  if (candidates.offers.length > 12) {
    const expected = new Map(candidates.offers.map(o => [o.offerId,o.signature]));
    for (const [id,signature] of Array.from(expected.entries())) {
      const matches = evaluated.filter(e => e.id === id);
      if (matches.length !== 1) issues.push(`scoring_coverage_missing_or_duplicate:${id}`);
      else if (matches[0].hash !== signature) issues.push(`scoring_version_mismatch:${id}`);
    }
    for (const e of evaluated) if (!expected.has(e.id)) issues.push(`unexpected_scoring_identity:${e.id}`);
  }
  return electionClassificationSchema.parse(sealElectionReceipt({
    version: 1 as const, candidatesReceiptHash: candidates.receiptHash,
    method: candidates.offers.length <= 12 ? "all_sent_to_selector" as const : "scored_batches" as const,
    evaluated, shortlistIds: result.cards.map(c => c.id), selectorIds: offered.map(o => o.offerId),
    operationKeys: result.operationKeys ?? [],
    batches: result.batches, issues,
    ...(result.ranking ? { ranking: result.ranking } : {}),
  }));
}
