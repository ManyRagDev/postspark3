import type { GenerationFailure } from "@shared/generationFailure";
export type RecoveryAction =
  | "next_template"
  | "correct_content"
  | "repair_review"
  | "await_reconciliation"
  | "stop";
/** A paid effect of unknown outcome never authorizes another inference. */
export function recoveryAction(input: {
  failure?: GenerationFailure;
  uncertain?: boolean;
  cancelled?: boolean;
  remainingMs: number;
  templateAttempts: number;
  textRecoveries: number;
  formalRepairs: number;
}): RecoveryAction {
  if (input.cancelled || input.remainingMs <= 0) return "stop";
  if (
    input.uncertain ||
    input.failure?.code === "review_reconciliation_required"
  )
    return "await_reconciliation";
  if (input.failure?.code === "artwork_unusable" && input.templateAttempts < 4)
    return "next_template";
  if (
    input.failure?.code === "review_content_rejected" &&
    input.textRecoveries < 1
  )
    return "correct_content";
  if (
    [
      "review_response_invalid",
      "review_response_truncated",
      "review_evidence_invalid",
    ].includes(input.failure?.code ?? "") &&
    input.formalRepairs < 1
  )
    return "repair_review";
  return "stop";
}
