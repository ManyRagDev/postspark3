import { describe, expect, it } from "vitest";
import corpus from "./fixtures/editorial-corpus.json";
import { evaluateEditorialReplay } from "./editorialEvaluation";

describe("offline editorial evaluation", () => {
  it("exposes the historical semantic false approval and separates policies instead of claiming a fix", () => {
    const report = evaluateEditorialReplay(corpus);
    expect(
      report.rows.find(r => r.caseId === "bizuminer-cinematic-omission")?.result
    ).toBe("false_approval");
    expect(
      report.groups["google/gemini-3.8-flash/policy-2"].falseApproval
    ).toBe(1);
    expect(report.groups["google/gemini-3.8-flash/policy-1"].correct).toBe(3);
    expect(report.unmeasured).toBe(29);
    expect(Object.keys(report.groups).some(k => k.endsWith("policy-3"))).toBe(
      false
    );
  });
  it("excludes fixtures and never fills an incomplete new comparison with historical approvals", () => {
    const report = evaluateEditorialReplay(corpus, {
      "bizuminer-cinematic-omission": {
        status: "correction_required",
        policyVersion: 3,
        model: "fixture",
        evidenceKind: "test_fixture",
      },
    });
    expect(report.fixtureOnly).toBe(1);
    expect(report.unmeasured).toBe(32);
    expect(report.groups).toEqual({});
  });
  it("reports inconclusion and false rejection distinctly", () => {
    const report = evaluateEditorialReplay(corpus, {
      "negated-action": {
        status: "inconclusive",
        policyVersion: 3,
        model: "candidate",
        evidenceKind: "provider_record",
      },
      "faithful-paraphrase": {
        status: "correction_required",
        policyVersion: 3,
        model: "candidate",
        evidenceKind: "provider_record",
      },
    });
    expect(report.groups["candidate/policy-3"]).toEqual({
      measured: 2,
      correct: 0,
      falseApproval: 0,
      falseRejection: 1,
      inconclusive: 1,
    });
    expect(() =>
      evaluateEditorialReplay(corpus, { unknown: {} as any })
    ).toThrow("unknown_editorial_case");
  });
});
