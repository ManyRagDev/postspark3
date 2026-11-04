import { describe, expect, it, vi } from "vitest";
import {
  encodeGenerationSelectionCatalog,
  type GenerationSelectionCandidate,
} from "../../../shared/generationSelectionTransport";
import { completeDesignTestDefinitions } from "../../../shared/completeDesignGeneration.fixture";
import { compactComponentCard } from "../../../shared/componentAssembly";
import { defaultStudioPreferences } from "../../../shared/studioPreferences";
import { orchestratedGenerationInputSchema } from "../../../shared/generationRequest";
import { prepareOrchestratedGeneration } from "../../ai/workflows/generationPreparation";
import { resolveGenerationModelConfig } from "../../ai/generationModel";
import type { InvokeParams } from "../../_core/llm";
import { MatrixBudget, type PriceQuote } from "./budget";
import {
  createSelectionBudgetPreflight,
  quoteSelectionAdmission,
  selectionAdmissionPayload,
} from "./selectionAdmission";

const quote: PriceQuote = {
  id: "openai/gpt-6.1-sol",
  context_length: 1_050_000,
  pricing: {
    prompt: "0.000002",
    completion: "0.00001",
    input_cache_write: "0.0000025",
  },
};
const repeated =
  "Preserve cada campo, sua posição e seu significado. Esta orientação deve ser resolvida sem alterar a composição nativa.";
const candidates = Array.from({ length: 4 }, (_, index) => ({
  candidateId: `candidate-${index}`,
  profile: {
    version: 3,
    common: {
      summary: repeated,
      detail: "x".repeat(120 + index * 40),
      // Some subsets contain this text only once: the real encoder then emits
      // a literal while the admission bound still carries its global entry.
      crossCandidateOnly: `${index < 2 ? "par-a" : "par-b"}: ${'Texto "entre aspas" e barra \\ preservados. '.repeat(4)}`,
    },
    variants: [{ summary: repeated }],
  },
  suitability: {
    id: `candidate-${index}`,
    hash: "a".repeat(64),
    score: 3.9999999999999996,
    confidence: 0.9999999999999999,
  },
  fields: {
    [`component-${index}`]: [
      {
        id: "field-0",
        source: "block:headline:0:text",
        kind: "text",
        role: "headline",
        required: true,
        cardinality: null,
      },
    ],
  },
})) as unknown as GenerationSelectionCandidate[];
function request(
  catalog: GenerationSelectionCandidate[],
  model = quote.id
): InvokeParams {
  return {
    pinnedModel: model,
    disableFallback: true,
    forceTextSchema: model === quote.id ? false : true,
    reasoningEffort: "medium",
    maxCompletionTokens: 9000,
    messages: [
      {
        role: "system",
        content: "Escolha três planos preservando os contratos.",
      },
      {
        role: "user",
        content: JSON.stringify({
          intent: { objective: "Organizar documentos" },
          catalog: encodeGenerationSelectionCatalog(catalog),
        }),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "plan",
        strict: true,
        schema: {
          type: "object",
          properties: { version: { type: "integer" } },
          required: ["version"],
          additionalProperties: false,
        },
      },
    },
  };
}

describe("selection admission before paid shortlisting", () => {
  it("retains all shared data while bounding any candidate subset, including native and text schemas", () => {
    for (const model of [quote.id, "google/gemini-3.8-flash"]) {
      const bounded = selectionAdmissionPayload({
        request: request(candidates, model),
        maxCandidates: 2,
      });
      const boundBytes = Buffer.byteLength(JSON.stringify(bounded.payload));
      for (let a = 0; a < candidates.length; a++)
        for (let b = a + 1; b < candidates.length; b++) {
          const subset = selectionAdmissionPayload({
            request: request([candidates[a], candidates[b]], model),
            maxCandidates: 2,
          });
          expect(
            Buffer.byteLength(JSON.stringify(subset.payload))
          ).toBeLessThanOrEqual(boundBytes);
        }
      expect(bounded.candidateIds).toHaveLength(2);
      expect(bounded.eligibleCandidates).toBe(4);
    }
  });

  it("does not dispatch, reserve a paid call, release uncertainty or clear an interruption", async () => {
    const inherited = [
      {
        operation: "unknown",
        model: quote.id,
        startedAt: new Date(0).toISOString(),
        reservedUsd: 0.8,
        status: "uncertain" as const,
      },
    ];
    const budget = new MatrixBudget(0.81, 80, inherited, async () => {});
    const before = structuredClone(inherited);
    const record = vi.fn(async () => {});
    const hook = createSelectionBudgetPreflight({
      budget,
      quotes: new Map([[quote.id, quote]]),
      record,
    });
    await expect(
      hook({ request: request(candidates), maxCandidates: 2 })
    ).rejects.toThrow("before_shortlist");
    expect(inherited).toEqual(before);
    expect(budget.interruption?.reason).toBe("budget_exhausted");
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatched: false,
        eligibleCandidates: 4,
        maxCandidates: 2,
      })
    );
    expect(
      quoteSelectionAdmission(
        { request: request(candidates), maxCandidates: 2 },
        quote
      ).reservedUsd
    ).toBeGreaterThan(0.01);
  });

  it("stops the actual preparation path after mock intent and before any JEV or selection call", async () => {
    const owner = "00000000-0000-4000-8000-000000000001";
    const input = orchestratedGenerationInputSchema.parse({
      ownerId: owner,
      inputType: "text",
      content: "Explique como planejar diante de riscos",
      platform: "instagram",
      postMode: "static",
      idempotencyKey: "selection-admission-test",
    });
    const definitions = completeDesignTestDefinitions();
    const intent = {
      version: 1,
      objective: "Apresentar uma ideia útil",
      tone: {
        description: "Cuidadoso",
        origin: "inferred",
        rationale: "O pedido envolve riscos.",
      },
      adaptation: "controlled",
      requirements: [],
      content: [
        {
          id: "idea",
          meaning: "Planejar com antecedência",
          sourceIds: [],
          requirementIds: [],
        },
      ],
    };
    const generate = vi.fn(
      async () =>
        ({ choices: [{ message: { content: JSON.stringify(intent) } }] }) as any
    );
    const shortlist = vi.fn(async () => {
      throw new Error("JEV must not be entered");
    });
    const budget = new MatrixBudget(0.001, 80, [], async () => {});
    const record = vi.fn(async () => {});
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("Network forbidden in offline admission test");
    });
    try {
      await expect(
        prepareOrchestratedGeneration(input, owner, true, Date.now() + 60000, {
          generationConfig: {
            ...resolveGenerationModelConfig({
              generationModel: "gpt",
              postMode: "static",
            }),
            generationStrategyVersion: 2,
            editorialIntentVersion: undefined, preparationBudget: undefined,
          },
          generate,
          shortlist,
          hydrate: async ids => definitions.filter(d => ids.includes(d.id)),
          operation: async (_key, work) => work(),
          loadContext: async () => input.content,
          preferences: async () => defaultStudioPreferences,
          retrieve: async () => definitions.map(compactComponentCard),
          recentSelections: async () => [],
          preflightSelection: createSelectionBudgetPreflight({
            budget,
            quotes: new Map([[quote.id, quote]]),
            record,
          }),
        })
      ).rejects.toThrow(
        "comparison_selection_preflight_budget_exhausted_before_shortlist"
      );
      expect(generate).toHaveBeenCalledTimes(1);
      expect(generate.mock.calls[0][0].traceLabel).toBe("generation_intent_v1");
      expect(shortlist).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expect(budget.calls).toEqual([]);
      expect(record).toHaveBeenCalledTimes(1);
    } finally {
      fetch.mockRestore();
    }
  });
});
