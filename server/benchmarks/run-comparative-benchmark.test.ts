import { describe, expect, it, vi } from "vitest";
import { executeSingleCall, TEST_CASES, TEST_MODELS } from "./run-comparative-benchmark";

const content = JSON.stringify({
  literalClaim: "Atribuição multi-toque", confirmedFacts: ["margem líquida", "7 dias"],
  unknowns: [], allowedInferences: [], semanticVariationBudget: 1,
  variations: Array.from({ length: 3 }, () => ({ tone: "direto", headline: "Atribuição multi-toque", body: "Observe margem líquida em 7 dias.", cta: "Revise o processo.", assumptions: [] })),
});
function response(usage: Record<string, unknown> = {}) {
  return { id: "fixture", model: "effective/model", choices: [{ index: 0, message: { role: "assistant" as const, content }, finish_reason: "stop" }], usage } as any;
}

describe("comparative model call measurement", () => {
  it("waits for the complete adapter result and prefers the provider's billed cost", async () => {
    let clock = 10;
    const generate = vi.fn(async () => { await Promise.resolve(); clock = 510; return response({ prompt_tokens: 100, completion_tokens: 200, cost: 0.012, completion_tokens_details: { reasoning_tokens: 0 } }); });
    const record = await executeSingleCall(TEST_MODELS[1], TEST_CASES[0], { generate, now: () => clock });
    expect(record).toMatchObject({ status: "success", latencyMs: 500, costUsd: 0.012, costSource: "provider", reasoningTokens: 0, effectiveModel: "effective/model", measurement: "isolated_editorial_call_v2" });
    expect(generate.mock.calls[0][0]).toMatchObject({ reasoningEffort: "none", forceTextSchema: true, disableFallback: true, maxTransportAttempts: 1 });
  });

  it("labels an estimated cost and keeps absent reasoning unknown", async () => {
    const record = await executeSingleCall(TEST_MODELS[1], TEST_CASES[0], { generate: vi.fn(async () => response({ prompt_tokens: 100, completion_tokens: 200 })) });
    expect(record.costSource).toBe("estimate");
    expect(record.costUsd).toBeCloseTo(0.00011);
    expect(record.reasoningTokens).toBeNull();
  });

  it("does not turn missing usage or a failed call into a zero-cost result", async () => {
    const missing = await executeSingleCall(TEST_MODELS[2], TEST_CASES[0], { generate: vi.fn(async () => response()) });
    expect(missing).toMatchObject({ costUsd: null, costSource: "unknown", reasoningTokens: null });
    const failed = await executeSingleCall(TEST_MODELS[2], TEST_CASES[0], { generate: vi.fn(async () => { throw new Error("provider unavailable"); }) });
    expect(failed).toMatchObject({ status: "error", costUsd: null, costSource: "unknown", reasoningTokens: null });
  });
});
