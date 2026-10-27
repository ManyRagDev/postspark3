/** Exact, typed classification. Unknown failures never authorize a paid repair. */
const factFormal = [
  "incomplete_fact_coverage",
  "incomplete_fact_evidence",
  "invalid_fact_evidence",
  "invalid_missing_fact",
  "missing_fact_target",
  "inconsistent_fact_coverage",
  "unexpected_fact_coverage",
] as const;
const directFormal = [
  "response_truncated",
  "response_invalid",
  "malformed_response",
  "unknown_evidence_reference",
  "duplicate_evidence_reference",
  "divergent_finding_reference",
  "unknown_finding_field",
  "missing_finding_evidence",
  "invalid_source_quote",
  "incomplete_evidence",
  "incomplete_source_coverage",
  "unexpected_source_coverage",
  "source_invalid_editorial_plan",
  "incomplete_narrative_checks",
  "incomplete_narrative_evidence",
  "invalid_narrative_evidence",
  "invalid_narrative_override",
  "invalid_narrative_revision_scope",
  "invalid_narrative_target",
  "unexpected_narrative_checks",
] as const;
export type FormalReviewReason =
  `proposal_review_${(typeof directFormal)[number] | (typeof factFormal)[number] | `source_${(typeof factFormal)[number]}`}`;
const formal = new Set<string>([
  ...directFormal.map(s => `proposal_review_${s}`),
  ...factFormal.flatMap(s => [
    `proposal_review_${s}`,
    `proposal_review_source_${s}`,
  ]),
]);
export function isFormalReviewFailure(
  reason: string
): reason is FormalReviewReason {
  return formal.has(reason);
}
export function reviewFailureCode(status: string, limitation: string) {
  if (status === "correction_required")
    return "review_content_rejected" as const;
  switch (limitation) {
    case "proposal_review_renderer_unavailable":
    case "proposal_review_invalid_render":
      return "review_render_failed" as const;
    case "proposal_review_source_conflict":
      return "source_conflict" as const;
    case "proposal_review_timeout":
      return "review_deadline_exceeded" as const;
    case "proposal_review_provider_timeout":
      return "provider_timeout" as const;
    case "proposal_review_unavailable":
      return "provider_unavailable" as const;
    case "proposal_review_reconciliation_required":
      return "review_reconciliation_required" as const;
    case "proposal_review_response_truncated":
      return "review_response_truncated" as const;
    case "proposal_review_response_invalid":
    case "proposal_review_malformed_response":
      return "review_response_invalid" as const;
    case "proposal_review_evidence_invalid":
    case "proposal_review_evidence_repair_exhausted":
      return "review_evidence_invalid" as const;
    default:
      return isFormalReviewFailure(limitation)
        ? ("review_evidence_invalid" as const)
        : ("review_inconclusive" as const);
  }
}
