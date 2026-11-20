import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { traceGenerationDecisions } from "../scripts/traceGenerationDecisions";
import { arsenalHash } from "../shared/arsenalContent";
import {
  inspectGenerationDecisionTrace,
  renderDecisionTraceHtml,
  summarizeDecisionVariability,
} from "./generationDecisionTrace";
import { recordDecisionObservation } from "./ai/decisionTrace";
import {
  runWithGenerationTrace,
  type GenerationTrace,
} from "./ai/generationTrace";
import { compactDiagnosticEvents } from "./ai/localDiagnostics";

const requestId = "11111111-1111-4111-8111-111111111111";
const request = {
  id: requestId,
  status: "completed",
  input: { content: "Café", platform: "instagram", postMode: "static" },
  prepared: {},
  proposals: [
    {
      slot: 0,
      proposalId: "p0",
      status: "ready",
      bundle: { family: "family-a" },
      reviews: [],
    },
  ],
};
const originalReview = {
  status: "correction_required",
  round: "initial",
  inputHash: "a".repeat(64),
  findings: [
    {
      category: "unsupported_claim",
      effect: "blocking",
      explanation: "Promessa sem suporte",
      expected: "Remover a garantia",
    },
  ],
};

describe("generation decision observability", () => {
  it("captures a detached verdict before lenient mutation and retains it with content tracing compacted", async () => {
    const trace: GenerationTrace = {
      id: requestId,
      userUuid: "owner",
      inputType: "text",
      inputContent: "Café",
      platform: "instagram",
      postMode: "static",
      creationMode: "free",
      requestedModel: "offline",
      startedAt: 0,
      calls: [],
      events: [],
    };
    const review = structuredClone(originalReview);
    await runWithGenerationTrace(trace, async () => {
      recordDecisionObservation("review_verdict_observed", {
        proposalId: "p0",
        slot: 0,
        review,
      });
      review.status = "passed";
      review.findings[0].effect = "advisory";
    });
    const events = compactDiagnosticEvents(trace.events);
    const snapshot = JSON.parse(
      JSON.stringify({
        request: {
          ...request,
          proposals: [{ ...request.proposals[0], reviews: [review] }],
        },
        operations: [],
        events,
      })
    );
    const report = inspectGenerationDecisionTrace(snapshot);
    expect(report.generatedPosts[0]).toMatchObject({
      reviewerOutcome: "correction_required",
      storedReviewOutcome: "passed",
      reviewEvidence: "captured_before_delivery",
    });
    expect(report.generatedPosts[0].reviews[0].review.findings[0].effect).toBe(
      "blocking"
    );
    expect(report.issues).toContainEqual(
      expect.objectContaining({ code: "review_changed_before_delivery" })
    );
  });

  it("reports an erased verdict, deduplicates event copies and separates previous fallback attempts", () => {
    const event = {
      stage: "review_verdict_observed",
      data: { proposalId: "p0", review: originalReview },
    };
    const previous = {
      stage: "review_verdict_observed",
      data: {
        proposalId: "p0-fb1",
        review: { ...originalReview, inputHash: "b".repeat(64) },
      },
    };
    const report = inspectGenerationDecisionTrace({
      request,
      operations: [],
      events: [event, structuredClone(event), previous],
    });
    expect(report.generatedPosts[0].reviews).toHaveLength(1);
    expect(
      report.issues.filter(
        issue => issue.code === "observed_review_absent_from_delivery"
      )
    ).toHaveLength(1);
  });

  it("keeps unavailable history unknown and exposes raw reviewer details without fabricating an approval", () => {
    const response = {
      status: "reviewed",
      reviewedSlides: [0],
      limitation: null,
      findings: [
        { category: "unsupported_claim", detail: "Promessa sem suporte" },
      ],
    };
    const report = inspectGenerationDecisionTrace({
      request,
      operations: [
        {
          operation_key: `p0:review:initial:${originalReview.inputHash}`,
          state: "completed",
          result: {
            id: "provider-id",
            model: "review-model",
            __proposalReview: {
              requestId,
              proposalId: "p0",
              round: "initial",
              inputHash: originalReview.inputHash,
            },
            choices: [
              {
                message: { content: JSON.stringify(response) },
                finish_reason: "stop",
              },
            ],
          },
        },
      ],
    });
    expect(report.generatedPosts[0].reviewerOutcome).toBeNull();
    expect(report.generatedPosts[0].rawReviews[0]).toMatchObject({
      responseStatus: "reviewed",
      responseHash: arsenalHash(response),
      receiptMatchesRequest: true,
    });
    expect(report.generatedPosts[0].rawReviews[0].findings[0].detail).toBe(
      "Promessa sem suporte"
    );
    expect(report.coverage.electionVerified).toBe(false);
  });

  it("rejects a reviewer observation attached to another request", () => {
    const report = inspectGenerationDecisionTrace({
      request,
      operations: [
        {
          operation_key: `p0:review_observation:initial:${originalReview.inputHash}:candidate`,
          state: "completed",
          result: {
            kind: "review_observation_v1",
            data: {
              requestId: "another-request",
              proposalId: "p0",
              review: originalReview,
            },
          },
        },
      ],
    });
    expect(report.generatedPosts[0].reviewerOutcome).toBeNull();
    expect(report.observationReceipts[0].valid).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({ code: "review_observation_receipt_mismatch" })
    );
  });

  it("exports a reopened snapshot through the CLI entry point without a database reader", async () => {
    const directory = await mkdtemp(join(tmpdir(), "postspark-decision-cli-"));
    try {
      const snapshot = join(directory, "source.json"),
        output = join(directory, "report.html");
      await writeFile(
        snapshot,
        JSON.stringify({
          request,
          operations: [],
          events: [
            {
              stage: "review_verdict_observed",
              data: { proposalId: "p0", review: originalReview },
            },
          ],
        })
      );
      await traceGenerationDecisions(["--from", snapshot, "--output", output]);
      expect(await readFile(output, "utf8")).toContain("correction_required");
      const json = JSON.parse(
        await readFile(join(directory, "report.json"), "utf8")
      );
      expect(json.runs[0].generatedPosts[0].reviewerOutcome).toBe(
        "correction_required"
      );
      expect((await stat(output)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps malformed provider output explicit and escapes diagnostic content in HTML", () => {
    const report = inspectGenerationDecisionTrace({
      request: { ...request, id: "<script>alert(1)</script>" },
      operations: [
        {
          operation_key: "p0:review:initial:hash",
          result: { choices: [{ message: { content: "{truncated" } }] },
        },
      ],
    });
    expect(report.rawReviews[0].available).toBe(false);
    const html = renderDecisionTraceHtml([report]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("counts exposure once per request, splits cohorts and excludes invalid election rates", () => {
    const base = inspectGenerationDecisionTrace({ request, operations: [] });
    const run = {
      ...base,
      coverage: { ...base.coverage, electionVerified: true },
      candidates: [
        { offerId: "a", family: "A", decisions: [], sentToSelector: true },
        { offerId: "b", family: "B", decisions: [], sentToSelector: false },
      ],
      families: [],
      assessments: [],
      variability: {
        ...base.variability,
        selectedCandidates: ["a"],
        deliveredFamilies: ["A"],
      },
    };
    const report = summarizeDecisionVariability([
      run,
      structuredClone(run),
      {
        ...run,
        requestId: "second",
        variability: {
          ...run.variability,
          selectedCandidates: ["b"],
          deliveredFamilies: ["B"],
        },
      },
      {
        ...run,
        requestId: "invalid",
        coverage: { ...run.coverage, electionVerified: false },
      },
      { ...run, requestId: "other-cohort", cohortKey: "other" },
    ]);
    expect(report).toHaveLength(2);
    expect(report[0]).toMatchObject({ sampledRuns: 3, verifiedRuns: 2 });
    expect(report[0].families).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          family: "A",
          eligibleRuns: 2,
          selectedRuns: 1,
          selectionRateGivenEligible: 0.5,
        }),
        expect.objectContaining({
          family: "B",
          eligibleRuns: 2,
          selectedRuns: 1,
          selectionRateGivenEligible: 0.5,
        }),
      ])
    );
  });
});
