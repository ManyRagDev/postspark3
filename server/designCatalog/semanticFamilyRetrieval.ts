import { arsenalHash } from "@shared/arsenalContent";
import type { FamilySelectionCandidate } from "@shared/designFamilySelection";
import type { GenerationIntent } from "@shared/generationPlan";
import type { FrozenEditorialCatalog } from "@shared/editorialIntent";
import { familyTie, type FamilyNeutrality } from "@shared/familyNeutrality";
import { SEMANTIC_FAMILY_RETRIEVAL_POLICY, type FamilyRetrievalReceipt, type SemanticFamilyRetrievalEvidence } from "@shared/familyRetrieval";
import type { EmbeddingEngine } from "../ai/editorialAffinity/embeddingEngine";
import { embedCompactSemanticText, semanticSourceDescriptor, SEMANTIC_PROFILE_VERSION } from "./semanticDesignIndex";
import { searchEngine } from "./familySearchIndex";

export interface SemanticDesignSource {
  familyId: string;
  sourceId: string;
  sourceHash: string;
  sourceTextHash: string;
}
export interface SemanticDesignSearchArguments {
  revision: string;
  editorialHash: string | null;
  fingerprint: string;
  vector: number[];
  sources: SemanticDesignSource[];
  indexHash?: string;
  signal?: AbortSignal;
}
export interface SemanticDesignSearchResult {
  indexHash: string;
  modelFingerprint: string;
  profileVersion: string;
  calibrationHash: string;
  calibrationVersion: string;
  matchedSourceIds: string[];
  ranking: Array<{id: string; sourceId: string; profileHash: string; rowHash: string; similarity: number; meanAffinity: number; genericExcess: number; penalty: number; adjusted: number; rawRank: number; adjustedRank: number}>;
}
export type SemanticDesignSearch = (args: SemanticDesignSearchArguments) => Promise<SemanticDesignSearchResult | null>;
export interface AutomaticSemanticOptions {
  revision: string;
  /** Free-language interpretation from the automatic extractor, never catalogue labels. */
  query?: string;
  engine?: EmbeddingEngine;
  search?: SemanticDesignSearch;
  /** A persisted automatic request can pin an immutable index rather than the latest compatible release. */
  indexHash?: string;
}
/** Advisory language only: no conversion to catalogue IDs or fixed intent labels. */
export function semanticFamilyQuery(intent: GenerationIntent, visualPreference = "", compactQuery?: string) {
  return [...(compactQuery?.trim() ? [compactQuery] : [intent.objective, intent.tone.description, ...intent.content.map(item => item.meaning)]), visualPreference]
    .filter(Boolean).join("\n").normalize("NFC").trim();
}
export function semanticFamilySources(families: FamilySelectionCandidate[], catalog: FrozenEditorialCatalog | null): SemanticDesignSource[] {
  return families.flatMap(family => Array.from(new Map(family.repertoires.map(repertoire => {
    const root = repertoire.slides.flatMap(slide => slide.variants).find(card => card.id === repertoire.sourceId && card.hash === repertoire.sourceHash);
    if (!root) throw new Error("family_selection_source_identity_mismatch");
    const source = {familyId: family.id, ...semanticSourceDescriptor(root, catalog)};
    return [source.sourceId, source] as const;
  })).values()));
}
/** Service-only read. Catalogue vectors and full documents never return to the request. */
export const searchSemanticDesigns: SemanticDesignSearch = async args => {
  const { getDb } = await import("../db");
  let request = getDb().rpc("design_semantic_search_v1", {
    p_catalog_revision: args.revision, p_editorial_hash: args.editorialHash,
    p_model_fingerprint: args.fingerprint, p_profile_version: SEMANTIC_PROFILE_VERSION,
    p_query: JSON.stringify(args.vector), p_sources: args.sources,
    p_alpha: SEMANTIC_FAMILY_RETRIEVAL_POLICY.alpha, p_index_hash: args.indexHash ?? null,
  });
  if (args.signal) request = request.abortSignal(args.signal);
  const { data, error } = await request;
  if (error) throw new Error("semantic_design_store_unavailable");
  return data as SemanticDesignSearchResult | null;
};

function assertSearchResult(result: SemanticDesignSearchResult, sources: SemanticDesignSource[], fingerprint: string, indexHash?: string) {
  const ids = new Set(sources.map(s => s.familyId));
  const sourceIds = new Set(sources.map(s => s.sourceId));
  const hash = /^[a-f0-9]{64}$/;
  if (!hash.test(result.indexHash) || result.modelFingerprint !== fingerprint || (indexHash && result.indexHash !== indexHash) ||
      result.profileVersion !== SEMANTIC_PROFILE_VERSION || !hash.test(result.calibrationHash) || !result.calibrationVersion ||
      !Array.isArray(result.matchedSourceIds) || result.matchedSourceIds.some(id => !sourceIds.has(id)) ||
      new Set(result.ranking.map(r => r.id)).size !== result.ranking.length ||
      result.ranking.some((r, i) => !ids.has(r.id) || !sources.some(s => s.familyId === r.id && s.sourceId === r.sourceId) ||
        !hash.test(r.profileHash) || !hash.test(r.rowHash) || ![r.similarity,r.meanAffinity,r.genericExcess,r.penalty,r.adjusted].every(Number.isFinite) ||
        Math.abs(r.similarity) > 1.00001 || Math.abs(r.meanAffinity) > 1.00001 || r.genericExcess < 0 || r.genericExcess > 2 ||
        Math.abs(r.penalty - SEMANTIC_FAMILY_RETRIEVAL_POLICY.alpha * r.genericExcess) > 1e-7 ||
        Math.abs(r.adjusted - r.similarity + r.penalty) > 1e-7 || r.adjustedRank !== i + 1 ||
        !Number.isInteger(r.rawRank) || r.rawRank < 1 || r.rawRank > result.ranking.length ||
        (i > 0 && r.adjusted > result.ranking[i - 1].adjusted + 1e-7)))
    throw new Error("semantic_design_response_invalid");
}
const terms = (text: string) => new Set(text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2));

export async function retrieveSemanticFamilyCandidates(args: {
  families: FamilySelectionCandidate[];
  intent: GenerationIntent;
  catalog: FrozenEditorialCatalog | null;
  visualPreference?: string;
  neutrality?: FamilyNeutrality;
  automaticSemantic: AutomaticSemanticOptions;
  signal?: AbortSignal;
  catalogHash: string;
}): Promise<FamilyRetrievalReceipt> {
  const query = semanticFamilyQuery(args.intent, args.visualPreference, args.automaticSemantic.query);
  const sources = semanticFamilySources(args.families, args.catalog);
  const options = args.automaticSemantic;
  let result: SemanticDesignSearchResult | null = null;
  let fallbackReason: SemanticFamilyRetrievalEvidence["fallbackReason"];
  let fingerprint: string | null = null;
  try {
    const engine = options.engine ?? await searchEngine();
    fingerprint = engine.metadata.fingerprint;
    const vector = await embedCompactSemanticText(engine, query, "query", args.signal);
    result = await (options.search ?? searchSemanticDesigns)({revision: options.revision, editorialHash: args.catalog?.hash ?? null,
      fingerprint, vector, sources, indexHash: options.indexHash, signal: args.signal});
    if (result) assertSearchResult(result, sources, fingerprint, options.indexHash);
    else fallbackReason = "compatible_index_missing";
  } catch (error) {
    if (args.signal?.aborted) throw error;
    const code = error instanceof Error ? error.message : "";
    fallbackReason = code === "semantic_design_response_invalid" ? "index_invalid" :
      code === "semantic_design_model_mismatch" ? "model_mismatch" : "semantic_unavailable";
    result = null;
  }
  const matched = new Set(result?.matchedSourceIds ?? []);
  const missingSourceIds = Array.from(new Set(sources.filter(s => !matched.has(s.sourceId)).map(s => s.sourceId))).sort();
  // An incomplete release must not quietly bias against unindexed designs. Use
  // the same bounded fallback for the entire eligible set and expose the reason.
  if (result && missingSourceIds.length) fallbackReason = "sources_missing_or_stale";
  const semanticReady = result !== null && !fallbackReason && result.ranking.length === args.families.length;
  if (result && !semanticReady && !fallbackReason) fallbackReason = "index_invalid";
  const queryTerms = terms(query);
  const fallback = args.families.map(f => {
    const text = [f.profile.description ?? "", ...f.profile.aesthetic.languages, ...f.profile.aesthetic.treatments].join(" ");
    const words = terms(text);
    const lexical = Array.from(queryTerms).filter(t => words.has(t)).length / Math.max(1, queryTerms.size);
    return {id: f.id, lexical, tie: familyTie(args.neutrality?.seed ?? arsenalHash(query), f.family)};
  }).sort((a,b) => b.lexical - a.lexical || a.tie.localeCompare(b.tie));
  const order = semanticReady ? result!.ranking.map(r => r.id) : fallback.map(r => r.id);
  const initialIds = order.slice(0, SEMANTIC_FAMILY_RETRIEVAL_POLICY.initialFamilies);
  const additionalIds = order.slice(initialIds.length, initialIds.length + SEMANTIC_FAMILY_RETRIEVAL_POLICY.additionalFamilies);
  const rankingById = new Map(semanticReady ? result!.ranking.map(r => [r.id, r]) : []);
  const lexicalById = new Map(fallback.map(r => [r.id, r.lexical]));
  return {
    version: 1, policyHash: arsenalHash(SEMANTIC_FAMILY_RETRIEVAL_POLICY),
    ...(args.neutrality ? {neutrality: args.neutrality} : {}),
    catalogHash: args.catalogHash, query, queryHash: arsenalHash(query),
    indexHash: result?.indexHash ?? null, modelFingerprint: fingerprint,
    eligibleFamilies: args.families.length, initialIds, additionalIds, expanded: false,
    recovered: [...initialIds, ...additionalIds].map(id => ({id, lexical: semanticReady ? 0 : lexicalById.get(id) ?? 0,
      semantic: rankingById.get(id)?.similarity ?? null, editorial: 0, structural: 0, reason: semanticReady ? "semantic_adjusted" : "compact_fallback"})),
    semanticRetrieval: {
      version: 1, strategy: "pgvector_compact_e5_v1", status: semanticReady ? "ready" : "fallback",
      catalogRevision: options.revision, profileVersion: SEMANTIC_PROFILE_VERSION,
      calibrationHash: result?.calibrationHash ?? null, calibrationVersion: result?.calibrationVersion ?? null,
      alpha: SEMANTIC_FAMILY_RETRIEVAL_POLICY.alpha, missingSourceIds, ...(fallbackReason ? {fallbackReason} : {}),
      rankings: result?.ranking ?? [], top20Ids: initialIds,
    },
    transport: {batches: 0, bytes: 0, largestRequestBytes: 0},
  };
}
