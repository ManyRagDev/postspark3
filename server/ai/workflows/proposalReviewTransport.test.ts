/**
 * Baseline and causal regression suite: real transport (invokeLLM) and review policy boundary.
 * Offline test with simulated HTTP responses; no live external network, storage or database.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "../../_core/env";
import { invokeLLM } from "../../_core/llm";
import { reviewProposal } from "./proposalReview";
import { renderReviewFixtureScenes } from "./proposalReview.fixture";
import { reviewEvidenceAnchors } from "./reviewEvidence";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { instantiateCompleteDesign } from "@shared/completeDesignGeneration";
import { resolveArsenalGeometry } from "@shared/arsenalGeometry";

vi.mock("../../_core/operationalLog", () => ({ appendOperationalLog: vi.fn(async () => {}) }));

const originalEnv = { ...ENV };
const runId = "00000000-0000-4000-8000-000000000001";
const source = "Café Horizonte funciona de segunda a sexta.";
const definition = completeDesignTestDefinitions()[0];

beforeEach(() => {
  ENV.openRouterApiKey = "audit-dummy-never-sent";
  ENV.openRouterProposalReviewModel = "google/gemini-3.8-flash";
  ENV.aiModelFallbackEnabled = false;
  ENV.llmTransientRetries = 0;
});

afterEach(() => {
  Object.assign(ENV, originalEnv);
  vi.unstubAllGlobals();
});

function setup(body = source, policyVersion = 5) {
  const copy: any = {
    caption: "",
    hashtags: [],
    editorialPlan: {
      version: 1,
      mode: "compose",
      centralMessage: source,
      facts: [{ id: "fact-1", sourceQuote: source, meaning: "Funcionamento de segunda a sexta" }],
      protectedEntities: [],
      slides: [{ slideIndex: 0, purpose: "Informar funcionamento", factIds: ["fact-1"] }],
    },
    slides: [
      {
        values: [
          { fieldId: "field-0", value: "Café Horizonte" },
          { fieldId: "field-1", value: body },
        ],
        mediaPrompts: [],
      },
    ],
  };

  const scene = resolveArsenalGeometry(
    instantiateCompleteDesign({
      definition,
      values: copy.slides[0].values,
      mediaPrompts: [],
      runId,
      slot: 0,
      slide: 0,
      planHash: "a".repeat(64),
      experimental: true,
    }),
    { measureText: () => ({ height: 20, lines: [{ width: 100 }], runs: [] }) }
  );

  const anchors = reviewEvidenceAnchors(copy, [scene]);
  const coverage = {
    factId: "fact-1",
    status: "covered",
    evidenceIds: anchors.map((a) => a.anchorId),
    missingSourceQuote: "",
    explanation: "Informação coberta na arte",
    materiality: "essential",
    materialityReason: "Condição de funcionamento",
  };
  const valid: any = {
    outcome: "reviewed",
    reviewedSlides: [0],
    findings: [],
    limitation: "",
    factCoverage: [coverage],
    sourceCoverage: [{ ...coverage, sourceQuote: source, meaning: "Funcionamento em dias úteis" }],
  };

  const operations: Array<{ key: string; state: string }> = [];
  const deps: any = {
    actor: runId,
    generateText: invokeLLM,
    renderReviewScenes: renderReviewFixtureScenes,
    reviewRepairBudget: new Set(),
    executeOperation: async ({ operationKey }: any, work: any) => {
      const op = { key: operationKey, state: "running" };
      operations.push(op);
      try {
        const result = await work();
        op.state = "completed";
        return result;
      } catch (error) {
        op.state = "uncertain";
        throw error;
      }
    },
  };

  const input: any = {
    requestId: runId,
    runId,
    proposalId: "audit-proposal",
    slot: 0,
    prompt: source,
    reviewPolicyVersion: policyVersion,
    postMode: "static",
  };

  const run = () => reviewProposal(input, deps, [definition], [scene], copy, "initial");
  return { copy, definition, scene, valid, anchors, operations, run };
}

function simulatedResponse(content: string, finish = "stop") {
  return new Response(
    JSON.stringify({
      id: "simulated-transport-response",
      model: "google/gemini-3.8-flash",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: finish,
          native_finish_reason: finish === "length" ? "MAX_TOKENS" : "STOP",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function simulateFetch(responses: Response[]) {
  const mock = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("Unexpected transport call without simulated response");
    return next;
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("baseline review transport and causal regressions", () => {
  describe("Policy V5 transport boundary (reproduces current audit baseline)", () => {
    it.each([
      ["truncated JSON", '{"outcome":"reviewed",', "length"],
      ["invalid JSON with stop", "invalid-json", "stop"],
      ["incomplete schema with stop", '{"outcome":"reviewed"}', "stop"],
    ])("%s never reaches owner formal repair under V5", async (_name, content, finish) => {
      const s = setup();
      const fetch = simulateFetch([
        simulatedResponse(content, finish),
        simulatedResponse(JSON.stringify(s.valid)),
      ]);
      const result = await s.run();

      expect(result.status).toBe("inconclusive");
      expect(result.limitation).toBe("proposal_review_unavailable");
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(s.operations).toEqual([
        { key: expect.stringContaining("review:initial:"), state: "uncertain" },
      ]);
    });

    it("an unknown reference with a valid transport schema reaches one owner repair under V5", async () => {
      const s = setup();
      const invalid = structuredClone(s.valid);
      invalid.factCoverage[0].evidenceIds = ["f".repeat(64)];
      const fetch = simulateFetch([
        simulatedResponse(JSON.stringify(invalid)),
        simulatedResponse(JSON.stringify(s.valid)),
      ]);
      const result = await s.run();

      expect(result.status).toBe("passed");
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(s.operations.map((o) => o.state)).toEqual(["completed", "completed"]);
      expect(s.operations[1].key).toContain("review_evidence_repair:initial:");
    });

    it("a complete valid response passes with one call under V5", async () => {
      const s = setup();
      const fetch = simulateFetch([simulatedResponse(JSON.stringify(s.valid))]);
      const result = await s.run();

      expect(result.status).toBe("passed");
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("a subjective style finding stays advisory under V5", async () => {
      const s = setup();
      s.valid.findings = [
        {
          category: "aesthetic",
          slideIndex: 0,
          fieldId: "field-0",
          expected: "",
          sourceQuote: "",
          explanation: "Preferência por outro ritmo do título",
          action: "none",
          effect: "advisory",
          evidenceIds: [s.anchors[0].anchorId],
        },
      ];
      const fetch = simulateFetch([simulatedResponse(JSON.stringify(s.valid))]);
      const result = await s.run();

      expect(result.status).toBe("passed");
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("an omitted essential fact requires correction under V5", async () => {
      const s = setup("Conheça a cafeteria.");
      for (const row of [...s.valid.factCoverage, ...s.valid.sourceCoverage]) {
        row.status = "missing";
        row.evidenceIds = [];
        row.missingSourceQuote = source;
        row.explanation = "Os dias de funcionamento estão ausentes da arte";
      }
      const fetch = simulateFetch([simulatedResponse(JSON.stringify(s.valid))]);
      const result = await s.run();

      expect(result.status).toBe("correction_required");
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result.findings.some((f) => "effect" in f && f.effect === "blocking")).toBe(true);
    });

    it("genuine semantic uncertainty is not retried into approval under V5", async () => {
      const s = setup();
      s.valid.outcome = "inconclusive";
      s.valid.limitation = "Julgamento semântico inconclusivo";
      const fetch = simulateFetch([
        simulatedResponse(JSON.stringify(s.valid)),
        simulatedResponse(JSON.stringify({ ...s.valid, outcome: "reviewed", limitation: "" })),
      ]);
      const result = await s.run();

      expect(result.status).toBe("inconclusive");
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
});
