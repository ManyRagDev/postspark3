import { describe, expect, it } from "vitest";
import {
  journalResultWithTrace,
  readJournalResult,
  summarizeGenerationJournal,
} from "./generationJournalTrace";
import type { GenerationTrace, LlmTraceCall } from "../generationTrace";
const call = (cost = 0.1): LlmTraceCall => ({
  label: "actual_call",
  requestedModel: "requested",
  effectiveModel: "effective",
  provider: "openrouter",
  promptHash: "hash",
  messages: ["private prompt"],
  response: { id: "provider-receipt", usage: { cost } },
  promptTokens: 100,
  completionTokens: 20,
  totalTokens: 120,
  latencyMs: 10,
  estimatedCostUsd: cost,
});
const trace = (calls: LlmTraceCall[]): GenerationTrace => ({
  id: "run",
  userUuid: "owner",
  inputType: "text",
  inputContent: "private input",
  platform: "instagram",
  postMode: "static",
  creationMode: "execution",
  requestedModel: "requested",
  startedAt: 0,
  calls,
  events: [],
});
describe("durable operation trace summaries", () => {
  it("preserves a degraded history warning after restart without inventing provider calls", () => {
    const historyTrace = trace([]);
    historyTrace.events.push({
      stage: "recent_selections",
      status: "fallback",
      detail: "history_unavailable",
      data: { code: "22P02", historyAvailable: false },
      at: new Date().toISOString(),
    });
    const result = journalResultWithTrace({ selections: [] }, historyTrace);
    expect(readJournalResult(result)).toEqual({ selections: [] });
    const summary = summarizeGenerationJournal([
      { operationKey: "prepare:recent_selections", state: "completed", result },
    ]);
    expect(summary.events).toEqual(historyTrace.events);
    expect(summary.calls).toEqual([]);
    expect(summary.unknownCostOperations).toEqual([]);
  });
  it("keeps journal result compatibility and privacy while preserving provider identity and usage", () => {
    const raw = {
      id: "raw-provider",
      model: "effective",
      choices: [{ message: { content: "copy" } }],
    };
    const stored = journalResultWithTrace(raw, trace([call()]));
    expect(stored).toMatchObject(raw);
    expect(readJournalResult(stored)).toEqual(raw);
    expect(readJournalResult(raw)).toBe(raw);
    const summary = summarizeGenerationJournal([
      { operationKey: "p:copy", state: "completed", result: stored },
    ]);
    expect(summary.calls[0]).toMatchObject({
      providerId: "provider-receipt",
      effectiveModel: "effective",
      totalTokens: 120,
      costSource: "provider",
      messages: [],
    });
    expect(JSON.stringify(stored)).not.toContain("private prompt");
    expect(summary.unknownCostOperations).toEqual([]);
  });
  it("counts all attempts once per operation and exposes incomplete legacy/uncertain costs instead of claiming zero", () => {
    const result = journalResultWithTrace(
      { options: [] },
      trace([call(0.1), call(0.2)])
    );
    const ops = [
      { operationKey: "prepare:selection", state: "completed", result },
      { operationKey: "prepare:selection", state: "completed", result },
      {
        operationKey: "p:copy",
        state: "completed",
        result: {
          model: "legacy",
          usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.4 },
        },
      },
      { operationKey: "p:image:0:photo", state: "uncertain" },
      {
        operationKey: "prepare:design-shortlist:0:old",
        state: "completed",
        result: {
          model: "jev",
          usage: { input_tokens: 5, output_tokens: 2 },
          answers: {},
        },
      },
    ];
    const summary = summarizeGenerationJournal(ops);
    expect(summary.calls).toHaveLength(4);
    expect(
      summary.calls.reduce((sum, c) => sum + c.estimatedCostUsd, 0)
    ).toBeCloseTo(0.7);
    expect(summary.calls.reduce((sum, c) => sum + c.totalTokens, 0)).toBe(262);
    expect(summary.unknownCostOperations).toEqual([
      "p:image:0:photo",
      "prepare:design-shortlist:0:old",
    ]);
  });
  it("requires receipts for paid editorial corrections and accepts only explicit deterministic-local evidence", () => {
    const local = trace([]);
    local.events.push({
      stage: "review_correction",
      status: "completed",
      detail: "deterministic_local",
      data: { paidEffect: false },
    } as any);
    const summary = summarizeGenerationJournal([
      { operationKey: "p:review_correction:uncertain", state: "uncertain" },
      {
        operationKey: "p:review_correction:legacy",
        state: "completed",
        result: { bundle: {} },
      },
      {
        operationKey: "p:review_correction:paid",
        state: "completed",
        result: journalResultWithTrace({ bundle: {} }, trace([call()])),
      },
      {
        operationKey: "p:review_correction:local",
        state: "completed",
        result: journalResultWithTrace({ bundle: {} }, local),
      },
    ]);
    expect(summary.calls).toHaveLength(1);
    expect(summary.unknownCostOperations).toEqual([
      "p:review_correction:uncertain",
      "p:review_correction:legacy",
    ]);
  });
});

it("counts formal evaluator repair as a separate paid receipt, retaining uncertain cost",()=>{
 const summary=summarizeGenerationJournal([{operationKey:"p:review_evidence_repair:initial:hash",state:"uncertain"}]);
 expect(summary.unknownCostOperations).toEqual(["p:review_evidence_repair:initial:hash"]);
});
