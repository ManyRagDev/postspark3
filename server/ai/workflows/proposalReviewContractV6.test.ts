import { describe, it, expect } from "vitest";
import reference from "./fixtures/review-v5-recorded-reference.json";
import {
  buildReviewEvidenceAliases,
  resolveReviewEvidenceV6,
} from "./reviewEvidence";
import {
  proposalReviewResponseV5Schema,
  proposalReviewResponseV6Schema,
} from "@shared/proposalReview";
import {
  isFormalReviewFailure,
  reviewFailureCode,
} from "@shared/proposalReviewFailure";

describe("recorded healthy response representation, not semantic/model homologation", () => {
  it("reduces the audited real response by at least 25% while retaining decisions and canonical references", () => {
    const original = proposalReviewResponseV5Schema(true).parse(
      reference.response
    );
    const { anchorMap, aliasMap } = buildReviewEvidenceAliases(
      reference.anchors
    );
    const compact: any = structuredClone(original);
    for (const row of [
      ...compact.factCoverage,
      ...compact.sourceCoverage,
      ...compact.narrativeChecks,
    ]) {
      row.evidenceIds = row.evidenceIds.map((id: string) => anchorMap[id]);
      if (row.status === "covered" && row.materiality === "essential") {
        delete row.explanation;
        delete row.materialityReason;
        delete row.missingSourceQuote;
      }
      if (row.status === "met") delete row.explanation;
    }
    expect(
      proposalReviewResponseV6Schema(true).safeParse(compact).success
    ).toBe(true);
    expect(JSON.stringify(compact).length).toBeLessThan(
      JSON.stringify(original).length * 0.75
    );
    for (const key of [
      "factCoverage",
      "sourceCoverage",
      "narrativeChecks",
    ] as const) {
      expect(
        compact[key].map((r: any) => ({
          ...r,
          evidenceIds: r.evidenceIds.map((id: string) => aliasMap[id]),
          explanation: undefined,
          materialityReason: undefined,
          missingSourceQuote: undefined,
        }))
      ).toEqual(
        (original[key] ?? []).map((r: any) => ({
          ...r,
          explanation: undefined,
          materialityReason: undefined,
          missingSourceQuote: undefined,
        }))
      );
      for (const row of compact[key])
        expect(
          resolveReviewEvidenceV6(row.evidenceIds, aliasMap, reference.anchors)
            .length
        ).toBe(row.evidenceIds.length);
    }
    expect(compact.findings).toEqual(original.findings);
    expect(compact.reviewedSlides).toEqual(original.reviewedSlides);
  });
  it("requires explanations for supporting coverage even when covered", () => {
    const body: any = structuredClone(reference.response);
    const { anchorMap } = buildReviewEvidenceAliases(reference.anchors);
    for (const row of [
      ...body.factCoverage,
      ...body.sourceCoverage,
      ...body.narrativeChecks,
    ])
      row.evidenceIds = row.evidenceIds.map((id: string) => anchorMap[id]);
    body.factCoverage[0].materiality = "supporting";
    body.factCoverage[0].materialityReason = "Promotional qualifier";
    delete body.factCoverage[0].explanation;
    expect(proposalReviewResponseV6Schema(true).safeParse(body).success).toBe(
      false
    );
  });
  it("separates formal source-plan errors from genuine semantic uncertainty and operational failures", () => {
    for (const r of [
      "proposal_review_invalid_source_quote",
      "proposal_review_incomplete_evidence",
      "proposal_review_source_invalid_editorial_plan",
    ])
      expect(isFormalReviewFailure(r)).toBe(true);
    for (const r of [
      "proposal_review_invalid_editorial_plan",
      "proposal_review_source_uncertain_fact_coverage",
      "proposal_review_uncertain_narrative_checks",
      "proposal_review_unavailable",
      "proposal_review_timeout",
      "a_new_unknown_error",
    ])
      expect(isFormalReviewFailure(r)).toBe(false);
    expect(
      reviewFailureCode("inconclusive", "proposal_review_unavailable")
    ).toBe("provider_unavailable");
    expect(
      reviewFailureCode("inconclusive", "proposal_review_semantic_inconclusive")
    ).toBe("review_inconclusive");
  });
});
