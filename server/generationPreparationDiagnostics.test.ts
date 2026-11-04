import { describe, expect, it } from "vitest";
import { ENV } from "./_core/env";
import { resolveGenerationModelConfig } from "./ai/generationModel";
import { inspectGenerationEvidence } from "./generationEvidence";
import { buildGenerationDiagnosticSummary, type GenerationTrace } from "./ai/generationTrace";
import { compactDiagnosticEvents } from "./ai/localDiagnostics";

describe("preparation observability before prepared exists", () => {
  it("identifies strategy 2 after an early failure and preserves uncertainty in its audit", () => {
    const previous = ENV.generationStrategyVersion; ENV.generationStrategyVersion = 2;
    const config = resolveGenerationModelConfig({ generationModel: "gpt", postMode: "carousel", slideCount: 7 });
    ENV.generationStrategyVersion = previous;
    const runId = "00000000-0000-4000-8000-000000000001";
    const request = { id: runId, generation_config: config, prepared: null, status: "awaiting_reconciliation", proposals: [0, 1, 2].map(slot => ({
      contractVersion: 1, runId, slot, proposalId: `p-${runId}-${slot}`, revision: 1, status: "awaiting_reconciliation", findings: [], diagnostics: [],
      failure: { code: "preparation_reconciliation_required", stage: "selection", retryable: false },
    })) };
    const result = inspectGenerationEvidence({ request, operations: [{ operation_key: "prepare:selection", state: "uncertain" }] });
    expect(result.designElection.stage).toBe("selection"); expect(result.designElection.issues).toContain("planning_not_completed");
    expect(result.checks.find(c => c.code === "pending_status_matches_operations")?.passed).toBe(true);
    expect(result.checks.some(c => c.code === "three_ready_slots" || c.code === "terminal_completed")).toBe(false);
    expect(result.passed).toBe(false); expect(result.providerEvidence.complete).toBe(false);
  });

  it("retains operational facts and cost uncertainty without retaining private prompts", () => {
    const trace = { requestedModel: "openai/gpt-6.1-sol", generationStrategyVersion: 2, calls: [{
      label: "generation_selection_v1", operationKey: "prepare:selection", effectiveModel: "openai/gpt-6.1-sol",
      messages: [{ content: "private source content" }], estimatedCostUsd: 0, latencyMs: 180001, error: "internal error",
      failureKind: "transport_timeout", transportTimeoutMs: 180000, costSource: "unknown",
    }], events: [{ stage: "generation_metrics", detail: "journal_summary", data: { unknownCostOperations: ["prepare:selection"] } },
      { stage: "preparation_request", detail: "selection", data: { requestCharacters: 120000, tokenCountIsEstimate: true, privateContent: "private source content" } }],
    } as unknown as GenerationTrace;
    const summary = buildGenerationDiagnosticSummary(trace);
    expect(summary.costComplete).toBe(false); expect(summary.unknownCostOperations).toEqual(["prepare:selection"]);
    expect(summary.failures[0]).toMatchObject({ phase: "selection", kind: "transport_timeout", transportTimeoutMs: 180000, providerId: null });
    expect(JSON.stringify(summary)).not.toContain("private source content");
    expect(summary.preparationRequests[0]).toMatchObject({ requestCharacters: 120000, tokenCountIsEstimate: true });
    const compact = compactDiagnosticEvents(trace.events);
    expect(compact[1].data).toEqual({ requestCharacters: 120000, tokenCountIsEstimate: true });
    expect(JSON.stringify(compact)).not.toContain("private source content");
  });
});
