/** Observations only: these records never participate in selection or approval. */
export interface CandidateDecisionObservation {
  candidateId: string;
  family: string;
  considered: boolean;
  reason: string;
  providerScore: number | null;
  confidence: number | null;
  effectiveScore: number;
  scoreOrigin: "assessment" | "default";
  technicalFit: number | null;
  technicalRejections: string[];
  variantEvaluations: Array<{
    slideIndex: number;
    componentId: string;
    scoreKind: "composition_fit";
    score: number;
    contributions: Array<{ criterion: string; points: number }>;
    recencyPenalty: number;
    rank: number;
    selected: boolean;
  }>;
  familyQueuePenalty: number;
  familyQueueScore: number;
  componentRecencyPenalty: number | null;
  componentIds: string[];
  familyRepresentative: boolean;
  diversityDistance: number | null;
  recentFamily: boolean;
  rankingUtility: number | null;
  mediaCoverage: number | null;
  tieBreaker: string | null;
  rank: number | null;
  selected: boolean;
}

export interface SelectionSlotObservation {
  version: 1;
  slot: number;
  policy:
    | "capability_v1"
    | "creative_flexibility"
    | "distinct_families"
    | "family_first";
  seed: string | null;
  requiresPhoto: boolean;
  forbidsPhoto: boolean;
  chosenCandidateId: string | null;
  candidates: CandidateDecisionObservation[];
}

export const DECISION_TRACE_STAGES = [
  "selection_slot_observed",
  "review_verdict_observed",
  "recovery_candidate_observed",
] as const;
/** The database already permits replay-safe local operations ending in :candidate. */
export const REVIEW_OBSERVATION_OPERATION =
  /^review_observation:(initial|recheck):[a-f0-9]{64}:candidate$/;
