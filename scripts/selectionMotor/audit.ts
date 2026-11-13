import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { arsenalHash } from "../../shared/arsenalContent";
import { componentCardV1Schema, type ComponentCardV1 } from "../../shared/componentAssembly";
import { resolveDesignFamilyRepertoires, materializeDesignFamilyOffer } from "../../shared/designRepertoire";
import { buildFamilySelectionCandidates, familyAssessmentProfile } from "../../shared/designFamilySelection";
import { familyAxes, familyDistance } from "../../shared/familyNeutrality";
import { repertoireMeetsMedia, validateGenerationPlan } from "../../shared/generationPlan";
import { buildHeuristicGenerationPlan } from "../../server/ai/workflows/heuristicPlanBuilder";
import { selectionReferenceCorpus } from "./corpus";
import { shortlistDesignFamilies } from "../../server/designCatalog/familyShortlist";
import { shortlistCompleteDesigns } from "../../server/designCatalog/designShortlist";

const args = process.argv.slice(2);
const option = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const snapshotPath = option("--snapshot");
if (!snapshotPath) throw new Error("Use --snapshot <catalog-cache.json> [--out <report.json>]. No database/provider calls are made.");
const bytes = await readFile(snapshotPath);
const snapshot = JSON.parse(bytes.toString());
const cards: ComponentCardV1[] = snapshot.snapshot.rows.map((row: any) => componentCardV1Schema.parse(row.card));
const registryBytes = await readFile("designs/acervo82/authored/registry.json");
const registry = JSON.parse(registryBytes.toString());
const matches = registry.entries.flatMap((entry: any) => entry.definitions.filter((definition: any) => cards.some(card => card.id === definition.id && card.hash === definition.hash)).map((definition: any) => ({entry: entry.id, ...definition})));
const corpus = selectionReferenceCorpus();
const profiles = await Promise.all((["legacy", "capability_v1"] as const).map(async policy => {
  const repertoires = resolveDesignFamilyRepertoires(cards, {slideCount: 1, contentMode: "compose"});
  const candidates = buildFamilySelectionCandidates(repertoires, null, true, true, policy);
  const projected = candidates.map(candidate => familyAssessmentProfile(candidate.profile));
  // IDs/hashes establish provenance, not semantic differentiation.
  const semantic = (value: unknown): unknown => Array.isArray(value) ? value.map(semantic) : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).filter(([key]) => !["family", "sourceId", "sourceHash"].includes(key)).map(([key, child]) => [key, semantic(child)])) : value;
  const signatures = projected.map(profile => arsenalHash(semantic(profile)));
  const requestBytes: number[] = [];
  await shortlistDesignFamilies({
    cards: repertoires.map(repertoire => ({...repertoire.slides[0].variants[0], id: repertoire.defaultOffer.offerId, hash: repertoire.defaultOffer.signature})),
    brief: JSON.stringify({request: corpus[0].brief, requirements: corpus[0].intent.requirements}),
    slideCount: 1, deadlineMs: null, editorialIntentVersion: 1,
    rankingPolicy: policy === "capability_v1" ? "capability_v1" : "suitability_first",
  }, candidates, input => shortlistCompleteDesigns(input, async request => {
    requestBytes.push(Buffer.byteLength(JSON.stringify(request)));
    return {model: request.model, answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, {type: "score" as const, score: 3, confidence: 1}])), usage: {input_tokens: 0, output_tokens: 0, cost: 0}};
  }));
  return {policy, candidates: candidates.length, uniqueProfilesWithoutFamily: new Set(signatures).size,
    repeatedProfiles: signatures.length - new Set(signatures).size,
    profileBytes: Buffer.byteLength(JSON.stringify(projected)),
    profileHash: arsenalHash(projected),
    transport: {batches: requestBytes.length, requestBytes, totalRequestBytes: requestBytes.reduce((sum, bytes) => sum + bytes, 0), criteriaPerQuestion: true, paidCalls: 0},
  };
}));
const results = corpus.map(test => {
  const matching = cards.filter(card => card.aspectRatios.includes(test.aspectRatio as any));
  const repertoires = resolveDesignFamilyRepertoires(matching, {slideCount: test.slideCount, contentMode: "compose", instructions: test.brief});
  const eligible = repertoires.filter(repertoire => repertoireMeetsMedia(repertoire, test.media));
  const runs = (["legacy", "capability_v1"] as const).map(policy => {
    const start = performance.now();
    const plan = buildHeuristicGenerationPlan({familyFirst: true, eligible, intent: test.intent, imageObligation: test.media, slideCount: test.slideCount,
      neutrality: {version: 1, seed: `motor-reference:${test.id}`, planningVersion: 3, proposalSelectionVersion: 1, creativeFlexibility: 1, ...(policy === "capability_v1" ? {selectionPolicy: policy} : {})},
      shortlist: {cards: [], evaluated: eligible.map(repertoire => ({id: repertoire.defaultOffer.offerId, hash: repertoire.signature, score: 3, confidence: 1})), batches: 0, inputTokens: 0, outputTokens: 0, costUsd: 0},
    });
    const durationMs = performance.now() - start;
    const offers = plan.slots.flatMap(slot => slot.status === "viable" ? [materializeDesignFamilyOffer(eligible.find(r => r.defaultOffer.offerId === slot.candidateId)!, slot.pages.map(page => page.componentId))] : []);
    const axes = offers.map(offer => familyAxes(offer.slides[0].card));
    const distances = axes.flatMap((axis, index) => axes.slice(index + 1).map(other => familyDistance(axis, other)));
    const violations = plan.slots.flatMap(slot => slot.status === "viable" ? validateGenerationPlan(slot, offers.find(offer => offer.offerId === slot.candidateId) ?? materializeDesignFamilyOffer(eligible.find(r => r.defaultOffer.offerId === slot.candidateId)!, slot.pages.map(page => page.componentId)), test.intent).map(reason => ({slot: slot.slot, reason})) : []);
    return {policy, durationMs, planHash: arsenalHash(plan), proposals: plan.slots.map(slot => ({slot: slot.slot, status: slot.status, reason: slot.reason, ...(slot.status === "viable" ? {candidateId: slot.candidateId, componentIds: slot.pages.map(page => page.componentId)} : {unmetRequirementIds: slot.unmetRequirementIds})})),
      readyPlans: offers.length, distinctFamilies: new Set(offers.map(offer => offer.family)).size,
      meanPairwiseDiversity: distances.length ? distances.reduce((sum, distance) => sum + distance, 0) / distances.length : null,
      structuralViolations: violations, physicalRenderVerified: false,
    };
  });
  return {id: test.id, briefHash: arsenalHash(test.brief), eligibleFamilies: new Set(eligible.map(r => r.family)).size, runs};
});
const report = {version: 1, generatedAt: new Date().toISOString(),
  source: {path: resolve(snapshotPath), fileSha256: createHash("sha256").update(bytes).digest("hex"), revision: snapshot.revision, declaredSnapshotHash: snapshot.hash, computedSnapshotHash: arsenalHash(snapshot.snapshot), cards: cards.length},
  acervo82: {registrySha256: createHash("sha256").update(registryBytes).digest("hex"), entries: registry.entries.length, matchingDefinitions: matches.length,
    diagnosisReproduced: matches.length >= registry.entries.length,
    limitation: matches.length ? "Only exact ID/hash matches count as evidence for the current registry." : "This historical snapshot has no matching IDs/hashes from the current 82-design registry; its original diagnosis cannot be reproduced from this source."},
  methodology: {corpusHash: arsenalHash(corpus), cases: corpus.length, scoreSource: "constant 3/4, confidence=1 deterministic test fixture; not provider or human evaluation", paidCalls: 0,
    scope: "Real profile projection, eligibility, three-slot planning and structural validation. No generated copy, physical render, blind adequacy comparison, storage, auth or billing are claimed."},
  profiles, results,
  summary: (["legacy", "capability_v1"] as const).map(policy => { const runs = results.flatMap(result => result.runs.filter(run => run.policy === policy)); return {policy, cases: runs.length, threePlans: runs.filter(run => run.readyPlans === 3).length, structuralViolations: runs.reduce((sum, run) => sum + run.structuralViolations.length, 0), meanDurationMs: runs.reduce((sum, run) => sum + run.durationMs, 0) / runs.length}; }),
};
const out = resolve(option("--out") ?? "artifacts/selection-motor/local-replay.json");
await mkdir(dirname(out), {recursive: true});
await writeFile(out, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({out, source: report.source, acervo82: report.acervo82, methodology: report.methodology, profiles, summary: report.summary}, null, 2));
