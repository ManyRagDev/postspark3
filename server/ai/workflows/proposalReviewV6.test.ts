import { resolveArsenalGeometry } from "@shared/arsenalGeometry";
import { describe, it, expect, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { instantiateCompleteDesign } from "@shared/completeDesignGeneration";
import {
  proposalReviewRecordSchema,
  proposalReviewRecordV6Schema,
} from "@shared/proposalReview";
import { reviewProposal } from "./proposalReview";
import { reviewEvidenceAnchors, buildReviewEvidenceAliases } from "./reviewEvidence";
import { renderReviewFixtureScenes } from "./proposalReview.fixture";
import { resolveReviewExecutionConfig, resolveReviewProfile } from "./proposalReviewV6";

const d = completeDesignTestDefinitions()[0];
const runId = "00000000-0000-4000-8000-000000000001";

const input: any = {
  requestId: runId,
  runId,
  proposalId: "p-test-v6",
  slot: 0,
  prompt:
    "BizuMiner acompanha preços diariamente e verifica promoções para encontrar melhores preços.",
  reviewPolicyVersion: 6,
  postMode: "static",
};

function setup() {
  input.reviewExecutionConfig = resolveReviewExecutionConfig();
  const copy: any = {
    caption: "Legenda preservada",
    hashtags: [],
    editorialPlan: {
      version: 1,
      mode: "compose",
      centralMessage: "Acompanhar preços",
      facts: [
        {
          id: "fact1",
          sourceQuote: input.prompt,
          meaning: "Acompanhamento diário e verificação de promoções",
        },
      ],
      protectedEntities: [{ value: "BizuMiner", sourceQuote: "BizuMiner" }],
      slides: [
        { slideIndex: 0, purpose: "Explicar serviço", factIds: ["fact1"] },
      ],
    },
    slides: [
      {
        values: [
          {
            fieldId: "field-0",
            value: "BizuMiner acompanha preços diariamente",
          },
          {
            fieldId: "field-1",
            value: "Verifica promoções para encontrar bons preços.",
          },
        ],
        mediaPrompts: [],
      },
    ],
  };
  const scene = instantiateCompleteDesign({
    definition: d,
    values: copy.slides[0].values,
    mediaPrompts: [],
    runId,
    slot: 0,
    slide: 0,
    planHash: "a".repeat(64),
    experimental: true,
  });
  const compiled = resolveArsenalGeometry(scene, {
    measureText: () => ({ height: 20, lines: [{ width: 100 }], runs: [] }),
  });
  const anchors = reviewEvidenceAnchors(copy, [compiled]);
  const aliasMap = buildReviewEvidenceAliases(anchors);

  // Return aliases e1, e2 instead of 64-char anchorIds
  const coverage = {
    factId: "fact1",
    status: "covered",
    evidenceIds: aliasMap.inventory.map((i) => i.alias),
    missingSourceQuote: "",
    explanation: "",
    materiality: "essential",
    materialityReason: "",
  };
  const response: any = {
    outcome: "reviewed",
    reviewedSlides: [0],
    findings: [],
    limitation: "",
    factCoverage: [coverage],
    sourceCoverage: [
      {
        ...coverage,
        sourceQuote: input.prompt,
        meaning: "Ação, frequência e verificação",
      },
    ],
  };
  const reply = (r: any) =>
    ({ choices: [{ message: { content: JSON.stringify(r) } }] }) as any;
  const generateText = vi.fn(async () => reply(response));
  const deps: any = {
    actor: runId,
    generateText,
    renderReviewScenes: renderReviewFixtureScenes,
    reviewRepairBudget: new Set<string>(),
  };
  return {
    copy,
    scene: compiled,
    anchors,
    aliasMap,
    response,
    reply,
    generateText,
    deps,
  };
}

describe("policy 6 compact aliases, caller mode and single formal repair", () => {
  it("resolves review execution config and profiles accurately", () => {
    const config = resolveReviewExecutionConfig();
    expect(config.version).toBe(1);
    expect(config.policyVersion).toBe(6);
    expect(config.profiles.standard.maxCompletionTokens).toBe(9216);
    expect(config.profiles.extended.maxCompletionTokens).toBe(12288);

    const standardProfile = resolveReviewProfile({
      slideCount: 1,
      factCount: 1,
      evidenceAnchorCount: 2,
    });
    expect(standardProfile).toBe("standard");

    const extendedProfile = resolveReviewProfile({
      slideCount: 5,
      factCount: 6,
      evidenceAnchorCount: 20,
    });
    expect(extendedProfile).toBe("extended");
  });

  it("uses aliases in response schema, resolves anchors deterministically and validates V6 record", async () => {
    const s = setup();
    const r = await reviewProposal(
      input,
      s.deps,
      [d],
      [s.scene],
      s.copy,
      "initial"
    );

    expect(r.status, r.limitation).toBe("passed");
    expect(r.policyVersion).toBe(6);
    expect(proposalReviewRecordSchema.safeParse(r).success).toBe(true);
    expect(proposalReviewRecordV6Schema.safeParse(r).success).toBe(true);

    // LLM call must use caller mode and standard max_tokens
    const callArgs = s.generateText.mock.calls[0][0];
    expect(callArgs.structuredValidationOwner).toBe("caller");
    expect(callArgs.maxCompletionTokens).toBe(9216);

    // Schema must expect evidenceIds matching ^e\d+$ regex
    const schemaProps =
      callArgs.response_format.json_schema.schema.properties;
    expect(schemaProps.factCoverage.items.properties.evidenceIds.items.pattern).toBe("^e\\d+$");

    // Resolved anchors must match original anchor quotes
    expect(r.factCoverage?.[0].evidence.length).toBeGreaterThan(0);
    expect(r.factCoverage?.[0].evidence[0].quote).toBe(s.anchors[0].quote);
    expect(s.generateText).toHaveBeenCalledTimes(1);
  });

  it("selects extended profile (12288 tokens) when slide/fact count exceeds standard threshold", async () => {
    const s = setup();
    // Simulate carousel with 5 slides
    for (let i = 1; i <= 4; i++) {
      s.copy.slides.push({
        values: [
          { fieldId: "field-0", value: `Slide ${i + 1} texto` },
          { fieldId: "field-1", value: `Slide ${i + 1} detalhe` },
        ],
        mediaPrompts: [],
      });
      s.copy.editorialPlan.slides.push({
        slideIndex: i,
        purpose: `P${i + 1}`,
        factIds: ["fact1"],
      });
    }
    s.response.reviewedSlides = [0, 1, 2, 3, 4];
    s.response.narrativeChecks = [
      { criterion: "cover_hook", status: "met", explanation: "", evidenceIds: ["e1"] },
      { criterion: "progression", status: "met", explanation: "", evidenceIds: ["e1"] },
      { criterion: "cohesion", status: "met", explanation: "", evidenceIds: ["e1"] },
      { criterion: "closing", status: "met", explanation: "", evidenceIds: ["e1"] },
    ];

    const defs = [d, d, d, d, d];
    const scenes = [s.scene, s.scene, s.scene, s.scene, s.scene];

    await reviewProposal(
      { ...input, postMode: "carousel" },
      s.deps,
      defs,
      scenes,
      s.copy,
      "initial"
    );

    const callArgs = s.generateText.mock.calls[0][0];
    expect(callArgs.maxCompletionTokens).toBe(12288);
  });

  it("repairs truncated or invalid initial response via single formal repair pass in caller mode", async () => {
    const s = setup();
    const journal = new Map<string, any>();

    // First call returns truncated receipt
    s.generateText.mockImplementationOnce(async () => ({
      choices: [{
        message: { content: '{"outcome":"reviewed","reviewedSlides":[0],' },
        finish_reason: "length",
      }],
    }));

    // Second call (repair) returns valid completed response
    s.generateText.mockImplementationOnce(async () => s.reply(s.response));

    s.deps.executeOperation = async ({ operationKey }: any, work: any) => {
      if (journal.has(operationKey)) return journal.get(operationKey);
      const value = await work();
      journal.set(operationKey, value);
      return value;
    };
    s.deps.reviewOperations = async () => Array.from(journal, ([operationKey, result]) => ({ operationKey, state: "completed", result }));

    const r = await reviewProposal(
      input,
      s.deps,
      [d],
      [s.scene],
      s.copy,
      "initial"
    );

    expect(r.status, r.limitation).toBe("passed");
    expect(s.generateText).toHaveBeenCalledTimes(2);
    expect(journal.size).toBe(2);
    expect(r.policyVersion === 6 && r.operationKeys).toHaveLength(2);

    // Idempotent re-run returns cached result without extra LLM call
    const again = await reviewProposal(
      input,
      s.deps,
      [d],
      [s.scene],
      s.copy,
      "initial"
    );
    expect(again).toEqual(r);
    expect(s.generateText).toHaveBeenCalledTimes(2);
  });

  it("returns review_response_truncated when initial call is truncated and repair also fails", async () => {
    const s = setup();
    // Both calls return truncated
    s.generateText.mockImplementation(async () => ({
      choices: [{
        message: { content: '{"outcome":"reviewed",' },
        finish_reason: "length",
      }],
    }));

    const r = await reviewProposal(
      input,
      s.deps,
      [d],
      [s.scene],
      s.copy,
      "initial"
    );

    expect(r.status).toBe("inconclusive");
    expect(r.limitation).toBe("proposal_review_response_truncated");
    expect(s.generateText).toHaveBeenCalledTimes(2);
  });

  it("returns review_response_invalid when model produces unfixable invalid JSON", async () => {
    const s = setup();
    // Both calls return completely invalid JSON
    s.generateText.mockImplementation(async () => ({
      choices: [{
        message: { content: "Here is your review: outcome is good!" },
        finish_reason: "stop",
      }],
    }));

    const r = await reviewProposal(
      input,
      s.deps,
      [d],
      [s.scene],
      s.copy,
      "initial"
    );

    expect(r.status).toBe("inconclusive");
    expect(r.limitation).toBe("proposal_review_response_invalid");
    expect(s.generateText).toHaveBeenCalledTimes(2);
  });

  it("does not replay uncertain formal effects and blocks on essential loss", async () => {
    const s = setup();
    s.response.factCoverage[0].status = "uncertain";
    s.response.factCoverage[0].evidenceIds = [];
    s.response.factCoverage[0].explanation = "Sentido não confirmado";

    const r = await reviewProposal(
      input,
      s.deps,
      [d],
      [s.scene],
      s.copy,
      "initial"
    );

    expect(r.status).toBe("inconclusive");
    expect(s.generateText).toHaveBeenCalledTimes(1);

    // Essential loss check
    const t = setup();
    t.response.factCoverage[0].status = "partial";
    t.response.factCoverage[0].missingSourceQuote = "diariamente";
    t.response.factCoverage[0].explanation = "Frequência diária omitida";
    t.response.factCoverage[0].materiality = "essential";
    t.response.factCoverage[0].materialityReason = "Frequência diária é indispensável";
    t.generateText.mockImplementation(async () => t.reply(t.response));

    const blocked = await reviewProposal(
      input,
      t.deps,
      [d],
      [t.scene],
      t.copy,
      "initial"
    );
    expect(blocked.status).not.toBe("passed");
  });
});
