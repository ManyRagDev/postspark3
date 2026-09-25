import { describe, expect, it } from "vitest";
import type { GenerationFailureMetadata } from "@shared/postspark";
import { buildGenerationFailureDiagnostics, formatGenerationFailureError } from "./generationFailureDiagnostics";
import { startGenerationTrace } from "./generationTrace";

describe("generation failure diagnostics", () => {
  it("retains validation causes and stage outcomes without prompt or generated copy", () => {
    const trace = startGenerationTrace({
      userUuid: "user-1",
      inputType: "text",
      inputContent: "briefing privado",
      platform: "instagram",
      postMode: "carousel",
      creationMode: "ideation",
      requestedModel: "llama",
    });
    trace.events.push({
      stage: "repair", status: "rejected", detail: "texto gerado privado",
      at: new Date().toISOString(),
    });
    trace.events.push({
      stage: "final_validation", status: "rejected", detail: "variation 2 must contain 5 slides",
      at: new Date().toISOString(),
    });
    trace.events.push({
      stage: "generation_metrics", status: "completed", detail: "metrics",
      data: { generativeCalls: 2, repairCalls: 1, exceededDeadline: false, fallbacks: ["repair_failed"] },
      at: new Date().toISOString(),
    });
    trace.calls.push({
      label: "post_generation", requestedModel: "llama", effectiveModel: "openai/gpt-5-mini",
      provider: "openrouter", promptHash: "hash", messages: ["briefing privado"],
      response: "texto gerado privado", promptTokens: 1, completionTokens: 1,
      totalTokens: 2, latencyMs: 10, estimatedCostUsd: 0,
    });
    const failure: GenerationFailureMetadata = {
      generationRunId: trace.id, reason: "quality_rejected", retryable: false,
      userMessage: "Falha editorial",
      validationIssues: [{ code: "invalid_set", detail: "variation 2 must contain 5 slides" }],
    };

    const diagnostics = buildGenerationFailureDiagnostics(trace, failure);
    expect(diagnostics.validationIssues).toEqual([
      { code: "invalid_set", detail: "variation 2 must contain 5 slides" },
    ]);
    expect(diagnostics.stages).toEqual([
      { stage: "repair", status: "rejected" },
      { stage: "final_validation", status: "rejected" },
    ]);
    expect(diagnostics.calls[0]).toMatchObject({ label: "post_generation", failed: false });
    expect(diagnostics.metrics).toEqual({
      generativeCalls: 2, repairCalls: 1, exceededDeadline: false, fallbacks: ["repair_failed"],
    });
    const persisted = formatGenerationFailureError(failure.userMessage, diagnostics);
    expect(persisted).toContain(`GENERATION_DIAGNOSTIC_V1={"version":1,"generationRunId":"${trace.id}"`);
    expect(diagnostics.classificationSource).toBe("typed");
    expect(persisted).not.toContain("briefing privado");
    expect(persisted).not.toContain("texto gerado privado");
  });

  it("redacts unknown issue details that may contain user content", () => {
    const trace = startGenerationTrace({
      userUuid: "user-1", inputType: "text", inputContent: "segredo",
      platform: "instagram", postMode: "carousel", creationMode: "ideation", requestedModel: "llama",
    });
    const diagnostics = buildGenerationFailureDiagnostics(trace, {
      generationRunId: trace.id, reason: "quality_rejected", retryable: false,
      userMessage: "Falha editorial",
      validationIssues: [{ code: "invalid_set", detail: "cópia privada: segredo" }],
    });
    expect(JSON.stringify(diagnostics)).not.toContain("segredo");
    expect(diagnostics.validationIssues[0]?.detail).toBe("[detalhe omitido por privacidade]");
  });
});
