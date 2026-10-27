import { it, expect } from "vitest";
import { proposalReviewRecordV7Schema } from "./proposalReviewV7";
const record = {
  policyVersion: 7,
  round: "initial",
  inputHash: "a".repeat(64),
  status: "inconclusive",
  outcome: "inconclusive",
  limitation: "proposal_review_invalid_render",
  reviewedSlides: [],
  checkedTextUnits: [],
  requirementChecks: [],
  messageAssessment: {
    status: "uncertain",
    explanation: "Não houve pixels disponíveis para conferir.",
  },
  findings: [],
  factCoverage: [],
  sourceCoverage: [],
  operationKeys: [],
  discardedFields: [],
};
it("represents a renderer failure only as inconclusive, never as an approval", () => {
  expect(proposalReviewRecordV7Schema.safeParse(record).success).toBe(true);
  expect(
    proposalReviewRecordV7Schema.safeParse({
      ...record,
      status: "passed",
      outcome: "reviewed",
      limitation: "",
      messageAssessment: { status: "preserved", explanation: "" },
    }).success
  ).toBe(false);
});
it("cannot approve an empty set of slides even with a receipt and reviewed outcome", () => {
  expect(
    proposalReviewRecordV7Schema.safeParse({
      ...record,
      status: "passed",
      outcome: "reviewed",
      limitation: "",
      messageAssessment: { status: "preserved", explanation: "" },
      operationKeys: [`p:review:initial:${"a".repeat(64)}`],
    }).success
  ).toBe(false);
});
it("cannot normalize a correction without reviewed slides", () => {
  expect(
    proposalReviewRecordV7Schema.safeParse({
      ...record,
      status: "correction_required",
      outcome: "reviewed",
      limitation: "",
    }).success
  ).toBe(false);
});
it("a provider may report inability to inspect but cannot mark zero slides reviewed", async () => {
  const { proposalReviewResponseV7Schema } = await import("./proposalReviewV7");
  const {
    policyVersion,
    round,
    inputHash,
    status,
    factCoverage,
    sourceCoverage,
    operationKeys,
    discardedFields,
    ...response
  } = record;
  expect(proposalReviewResponseV7Schema.safeParse(response).success).toBe(true);
  expect(
    proposalReviewResponseV7Schema.safeParse({
      ...response,
      outcome: "reviewed",
    }).success
  ).toBe(false);
});

it("accepts editorialGuidanceVersion 5 and preserves earlier pinned versions", async () => {
  const { reviewExecutionConfigV2Schema } = await import("./proposalReviewV7");
  const baseConfig = {
    version: 2,
    policyVersion: 7,
    resolvedModel: "openrouter/mock-model",
    configurationHash: "a".repeat(64),
    contractHash: "b".repeat(64),
    reasoningEffort: "medium",
    temperature: 0.1,
    timeoutMs: 60000,
    profiles: {
      standard: {
        maxCompletionTokens: 9216,
        maxSlides: 4,
        maxRequirements: 8,
        maxTextUnits: 20,
      },
      extended: { maxCompletionTokens: 12288 },
    },
  };

  // Missing guidanceVersion (legacy V7 default) is valid
  expect(reviewExecutionConfigV2Schema.safeParse(baseConfig).success).toBe(true);

  // Versions 2, 3, 4, 5 are all valid
  for (const v of [2, 3, 4, 5, 6]) {
    const res = reviewExecutionConfigV2Schema.safeParse({
      ...baseConfig,
      editorialGuidanceVersion: v,
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.editorialGuidanceVersion).toBe(v);
    }
  }

  // Unknown version 7 is rejected
  expect(
    reviewExecutionConfigV2Schema.safeParse({
      ...baseConfig,
      editorialGuidanceVersion: 7,
    }).success
  ).toBe(false);
});
