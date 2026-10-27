import { z } from "zod";
import { arsenalHash } from "./arsenalContent";
import { GenerationFailureError } from "./generationFailure";
import { compactOfferProfileSchema } from "./compactDesignProfile";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const identity = z.object({ id: z.string().min(1), hash }).strict();
export const catalogCoverageSchema = z.object({
  version: z.literal(1),
  capturedAt: z.string(),
  consistency: z.enum(["stable_double_read", "changed_during_read"]),
  scopeHash: hash,
  inventoryHash: hash,
  entries: z.array(identity.extend({
    label: z.string(), family: z.string(), status: z.string(),
    authorshipRevision: z.number().int().nonnegative(),
    sourceKey: z.string(), isVariant: z.boolean(),
    indexState: z.enum(["present", "missing", "mismatch"]),
    disposition: z.enum(["eligible_card", "excluded", "blocked"]),
    reasons: z.array(z.string().min(1)),
  }).strict()),
  indexed: z.array(identity.extend({ cardHash: hash }).strict()),
  issues: z.array(z.object({ code: z.string().min(1), id: z.string().nullable() }).strict()),
  receiptHash: hash,
}).strict();
export type CatalogCoverage = z.infer<typeof catalogCoverageSchema>;

export const electionCandidatesSchema = z.object({
  version: z.literal(1), catalogReceiptHash: hash,
  offers: z.array(z.object({
    offerId: z.string().min(1), signature: hash, family: z.string(), sourceId: z.string(),
    slides: z.array(identity.extend({ role: z.string(), slideIndex: z.number().int().nonnegative() }).strict()),
  }).strict()),
  cards: z.array(identity.extend({ offerIds: z.array(z.string()), reasons: z.array(z.string()) }).strict()),
  selectionProfiles: z.array(z.object({ offerId: z.string(), hash, profile: compactOfferProfileSchema }).strict()).optional(),
  receiptHash: hash,
}).strict();
export type ElectionCandidates = z.infer<typeof electionCandidatesSchema>;

export const electionClassificationSchema = z.object({
  version: z.literal(1), candidatesReceiptHash: hash,
  method: z.enum(["all_sent_to_selector", "scored_batches"]),
  evaluated: z.array(identity.extend({ score: z.number().min(0).max(4), confidence: z.number().min(0).max(1) }).strict()),
  shortlistIds: z.array(z.string()), selectorIds: z.array(z.string()),
  operationKeys: z.array(z.string()),
  batches: z.number().int().nonnegative(),
  ranking: z.array(z.object({
    id: z.string(), score: z.number().min(0).max(4),
    recencyPenalty: z.number().min(0).max(0.3), similarityPenalty: z.number().min(0).max(0.75),
    adjustedScore: z.number(), shortlistPosition: z.number().int().min(1).max(12).nullable(),
  }).strict()).optional(),
  issues: z.array(z.string()), receiptHash: hash,
}).strict();
export type ElectionClassification = z.infer<typeof electionClassificationSchema>;

export const electionDecisionSchema = z.object({
  version: z.literal(1), classificationReceiptHash: hash,
  choices: z.array(z.object({
    slot: z.number().int().min(0).max(2), originalOfferId: z.string(), chosenOfferId: z.string(),
    reason: z.string(), substitutionReason: z.string().nullable(),
  }).strict()).length(3),
  receiptHash: hash,
}).strict();
export type ElectionDecision = z.infer<typeof electionDecisionSchema>;
export const electionDecisionV2Schema = electionDecisionSchema.extend({version:z.literal(2),choices:z.array(electionDecisionSchema.shape.choices.element.extend({editorialApproach:z.string().min(1).max(600).nullable()})).length(3)});
export type ElectionDecisionV2 = z.infer<typeof electionDecisionV2Schema>;
export type AnyElectionDecision = ElectionDecision | ElectionDecisionV2;

/** No prompt, owner data or pixels: these receipts remain useful with content tracing off. */
export function sealElectionReceipt<T extends object>(data: T): T & { receiptHash: string } {
  return { ...data, receiptHash: arsenalHash(data) };
}
export function electionReceiptIntact(value: { receiptHash: string }) {
  const { receiptHash, ...data } = value;
  return receiptHash === arsenalHash(data);
}
const same = (a: string[], b: string[]) => a.length === new Set(a).size &&
  b.length === new Set(b).size && arsenalHash([...a].sort()) === arsenalHash([...b].sort());

export function assertCatalogCoverage(catalog: CatalogCoverage, cards: Array<{ id: string; hash: string }>) {
  if (!electionReceiptIntact(catalog) || catalog.consistency !== "stable_double_read" || catalog.issues.length ||
    !same(catalog.entries.map(e => e.id), Array.from(new Set(catalog.entries.map(e => e.id)))) ||
    !same(catalog.entries.filter(e => e.disposition === "eligible_card").map(e => `${e.id}:${e.hash}`), cards.map(c => `${c.id}:${c.hash}`)) ||
    catalog.entries.some(e => e.disposition === "blocked" || (e.disposition === "excluded" && !e.reasons.length)))
    throw new GenerationFailureError("catalog_coverage_incomplete", "catalog");
}

export function assertElectionCoverage(catalog: CatalogCoverage, candidates: ElectionCandidates, classification: ElectionClassification, decision?: AnyElectionDecision) {
  const fail = () => { throw new GenerationFailureError("catalog_coverage_incomplete", "selection"); };
  if (![catalog, candidates, classification, ...(decision ? [decision] : [])].every(electionReceiptIntact) ||
    candidates.catalogReceiptHash !== catalog.receiptHash || classification.candidatesReceiptHash !== candidates.receiptHash || classification.issues.length) fail();
  const eligible = catalog.entries.filter(e => e.disposition === "eligible_card");
  if (!same(eligible.map(e => `${e.id}:${e.hash}`), candidates.cards.map(c => `${c.id}:${c.hash}`))) fail();
  const offers = new Map(candidates.offers.map(o => [o.offerId, o]));
  if (offers.size !== candidates.offers.length || !offers.size || candidates.cards.some(c =>
    (!c.offerIds.length && !c.reasons.length) || c.offerIds.some(id => !offers.get(id)?.slides.some(s => s.id === c.id && s.hash === c.hash)))) fail();
  if (candidates.offers.some(o => o.slides.some(s => !candidates.cards.some(c => c.id === s.id && c.hash === s.hash && c.offerIds.includes(o.offerId))))) fail();
  const all = Array.from(offers.keys());
  if (candidates.selectionProfiles && (!same(all, candidates.selectionProfiles.map(p => p.offerId)) ||
    candidates.selectionProfiles.some(p => arsenalHash(p.profile) !== p.hash ||
      p.profile.sequence.length !== offers.get(p.offerId)!.slides.length ||
      p.profile.sequence.some((s, i) => s.role !== offers.get(p.offerId)!.slides[i].role)))) fail();
  if (classification.method === "all_sent_to_selector") {
    if (all.length > 12 || classification.batches !== 0 || classification.operationKeys.length || classification.evaluated.length || !same(all, classification.selectorIds) || !same(all, classification.shortlistIds)) fail();
  } else {
    if (all.length <= 12 || classification.batches < 1 || classification.operationKeys.length !== classification.batches || new Set(classification.operationKeys).size !== classification.batches || classification.operationKeys.some(k=>!k.startsWith('design-shortlist:')) || !same(all, classification.evaluated.map(e => e.id)) ||
      classification.evaluated.some(e => offers.get(e.id)?.signature !== e.hash)) fail();
  }
  for (const ids of [classification.shortlistIds, classification.selectorIds])
    if (!ids.length || ids.length > 12 || new Set(ids).size !== ids.length || ids.some(id => !offers.has(id))) fail();
  if (candidates.selectionProfiles && classification.method === "scored_batches") {
    const ranking = classification.ranking ?? [];
    if (!same(all, ranking.map(r => r.id)) || ranking.some(r =>
      classification.evaluated.find(e => e.id === r.id)?.score !== r.score ||
      Math.abs(r.adjustedScore - (r.score - r.recencyPenalty - r.similarityPenalty)) > 1e-9 ||
      r.shortlistPosition !== (classification.shortlistIds.includes(r.id) ? classification.shortlistIds.indexOf(r.id) + 1 : null))) fail();
  }
  if (decision && (decision.classificationReceiptHash !== classification.receiptHash ||
    !same(decision.choices.map(c => String(c.slot)), ["0", "1", "2"]) ||
    decision.choices.some(c => !classification.selectorIds.includes(c.originalOfferId) || !classification.selectorIds.includes(c.chosenOfferId) ||
      (c.originalOfferId !== c.chosenOfferId && !c.substitutionReason)))) fail();
}
