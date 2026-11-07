import { FAMILY_NEUTRALITY_POLICY } from "./familyNeutrality";
import { arsenalHash } from "./arsenalContent";

/** Pinned in selection_input. Historical requests keep their original election. */
export const FAMILY_RETRIEVAL_POLICY = Object.freeze({
  version: 1 as const,
  initialFamilies: 24,
  additionalFamilies: 12,
  maxFamilies: 36,
  maxRequestBytes: 48_000,
  maxTotalRequestBytes: 128_000,
  maxBatches: 4,
});
/** Automatic policy is explicitly pinned; old receipts retain hybrid v1. */
export const SEMANTIC_FAMILY_RETRIEVAL_POLICY = Object.freeze({
  version: "pgvector_compact_e5_v1",
  initialFamilies: 20,
  additionalFamilies: 12,
  maxFamilies: 32,
  alpha: 0.25,
});
export interface SemanticFamilyRetrievalEvidence {
  version: 1;
  strategy: "pgvector_compact_e5_v1";
  status: "ready" | "fallback";
  catalogRevision: string;
  profileVersion: string;
  calibrationHash: string | null;
  calibrationVersion: string | null;
  alpha: number;
  missingSourceIds: string[];
  fallbackReason?: "compatible_index_missing" | "sources_missing_or_stale" | "index_invalid" | "model_mismatch" | "semantic_unavailable";
  rankings: Array<{
    id: string; sourceId: string; profileHash: string; rowHash: string;
    similarity: number; meanAffinity: number; genericExcess: number;
    penalty: number; adjusted: number; rawRank: number; adjustedRank: number;
  }>;
  top20Ids: string[];
  technicalFit?: {checkedFamilyIds: string[]; viableSlots: number[]; planHash: string};
}
export interface FamilyRetrievalReceipt {
  version: 1;
  policyHash: string;
  neutrality?: import("./familyNeutrality").FamilyNeutrality;
  catalogHash: string;
  query: string;
  queryHash: string;
  /** Local semantic index; null only when every eligible family fits the budget. */
  indexHash: string | null;
  modelFingerprint: string | null;
  semanticRetrieval?: SemanticFamilyRetrievalEvidence;
  eligibleFamilies: number;
  initialIds: string[];
  additionalIds: string[];
  expanded: boolean;
  recovered: Array<{
    id: string;
    lexical: number;
    semantic: number | null;
    editorial: number;
    structural: number;
    reason: string;
  }>;
  transport: { batches: number; bytes: number; largestRequestBytes: number };
}
export const familyRetrievalPolicyHash = (neutral = false) =>
  arsenalHash(neutral ? {retrieval:FAMILY_RETRIEVAL_POLICY,neutrality:FAMILY_NEUTRALITY_POLICY} : FAMILY_RETRIEVAL_POLICY);
