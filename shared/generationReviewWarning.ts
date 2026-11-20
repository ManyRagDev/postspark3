import type { ProposalDiagnostic } from "./generationContracts";

export type GenerationReviewWarning = "inconclusive" | "correction_required";
export const LENIENT_REVIEW_DIAGNOSTIC = "review_lenient_delivery";

/** Read the original review outcome before lenient delivery normalizes readiness. */
export function generationReviewWarning(diagnostics: readonly ProposalDiagnostic[]): GenerationReviewWarning | undefined {
  const marker = diagnostics.find(item => item.code === LENIENT_REVIEW_DIAGNOSTIC);
  if (marker?.evidence === "inconclusive" || marker?.evidence === "correction_required") return marker.evidence;
  // Older deliveries recorded inconclusiveness without an explicit lenient marker.
  if (diagnostics.some(item => item.code === "review_inconclusive")) return "inconclusive";
  return undefined;
}
