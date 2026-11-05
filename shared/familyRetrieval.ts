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
export interface FamilyRetrievalReceipt {
  version: 1;
  policyHash: string;
  catalogHash: string;
  query: string;
  queryHash: string;
  /** Local semantic index; null only when every eligible family fits the budget. */
  indexHash: string | null;
  modelFingerprint: string | null;
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
export const familyRetrievalPolicyHash = () =>
  arsenalHash(FAMILY_RETRIEVAL_POLICY);
