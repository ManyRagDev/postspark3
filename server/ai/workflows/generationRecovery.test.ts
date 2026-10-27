import { describe, it, expect } from "vitest";
import { recoveryAction } from "./generationRecovery";
const budget = {
  remainingMs: 100000,
  templateAttempts: 1,
  textRecoveries: 0,
  formalRepairs: 0,
};
describe("cause-based recovery", () => {
  it("only technical layout failure authorizes another compatible template", () => {
    expect(
      recoveryAction({
        ...budget,
        failure: { code: "artwork_unusable", stage: "copy", retryable: false },
      })
    ).toBe("next_template");
    expect(
      recoveryAction({
        ...budget,
        failure: {
          code: "review_content_rejected",
          stage: "review",
          retryable: false,
        },
      })
    ).toBe("correct_content");
  });
  it("uncertain effects take precedence over a retry budget", () =>
    expect(
      recoveryAction({
        ...budget,
        uncertain: true,
        failure: { code: "artwork_unusable", stage: "copy", retryable: false },
      })
    ).toBe("await_reconciliation"));
  it("cannot bypass total template/text/formal budgets", () => {
    expect(
      recoveryAction({
        ...budget,
        templateAttempts: 4,
        failure: { code: "artwork_unusable", stage: "copy", retryable: false },
      })
    ).toBe("stop");
    expect(
      recoveryAction({
        ...budget,
        textRecoveries: 1,
        failure: {
          code: "review_content_rejected",
          stage: "review",
          retryable: false,
        },
      })
    ).toBe("stop");
    expect(
      recoveryAction({
        ...budget,
        formalRepairs: 1,
        failure: {
          code: "review_evidence_invalid",
          stage: "review",
          retryable: false,
        },
      })
    ).toBe("stop");
  });
  it("deadline stops even reconciliation", () =>
    expect(recoveryAction({ ...budget, remainingMs: 0, uncertain: true })).toBe(
      "stop"
    ));
});
