import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV } from "../_core/env";
import {
  createGenerationRun,
  createGenerationRunMinimal,
  isSchemaIncompatibilityError,
  getDb,
} from "../db";
import {
  finishGenerationTrace,
  recordGenerationEvent,
  recordLlmTraceCall,
  startGenerationTrace,
  persistGenerationTraceMetrics,
} from "./generationTrace";

vi.mock("../db", () => ({
  createGenerationRun: vi.fn().mockResolvedValue(undefined),
  createGenerationRunMinimal: vi.fn().mockResolvedValue(undefined),
  isSchemaIncompatibilityError: vi.fn().mockReturnValue(false),
  getDb: vi.fn(),
}));

const originalTraceContent = ENV.aiTraceStoreContent;

afterEach(() => {
  ENV.aiTraceStoreContent = originalTraceContent;
  vi.clearAllMocks();
});

describe("generationTrace", () => {
  it("updates only trace columns of the existing owner run, preserving canonical output and state", async () => {
    ENV.aiTraceStoreContent = true;
    const query: any = {
      update: vi.fn(() => query),
      eq: vi.fn(() => query),
      then: (resolve: any) => Promise.resolve({ error: null }).then(resolve),
    };
    vi.mocked(getDb).mockReturnValue({ from: vi.fn(() => query) } as any);
    const trace = startGenerationTrace({
      userUuid: "owner",
      inputType: "text",
      inputContent: "Private brief",
      platform: "instagram",
      postMode: "static",
      creationMode: "execution",
      requestedModel: "requested",
    });
    recordLlmTraceCall({
      label: "copy",
      requestedModel: "requested",
      effectiveModel: "effective",
      provider: "fixture",
      promptHash: "hash",
      messages: [],
      promptTokens: 5,
      completionTokens: 10,
      totalTokens: 15,
      latencyMs: 1,
      estimatedCostUsd: 0.2,
    });
    await persistGenerationTraceMetrics(trace);
    const payload = query.update.mock.calls[0][0];
    expect(payload).toMatchObject({
      effective_models: ["effective"],
      total_tokens: 15,
      estimated_cost_usd: 0.2,
      prompt_snapshot: { replayable: false },
    });
    for (const key of [
      "status",
      "output_snapshot",
      "input_content",
      "graph_state",
      "completed_at",
    ])
      expect(payload).not.toHaveProperty(key);
    expect(query.eq.mock.calls).toEqual([
      ["id", trace.id],
      ["user_uuid", "owner"],
    ]);
    expect(createGenerationRun).not.toHaveBeenCalled();
  });
  it("persists failed calls and redacts content by default", async () => {
    ENV.aiTraceStoreContent = false;
    const trace = startGenerationTrace({
      userUuid: "00000000-0000-0000-0000-000000000001",
      inputType: "text",
      inputContent: "conteudo privado",
      platform: "instagram",
      postMode: "static",
      creationMode: "ideation",
      requestedModel: "gemini",
    });
    recordLlmTraceCall({
      label: "post_generation",
      requestedModel: "gemini",
      effectiveModel: "gemini-2.5-flash",
      provider: "google",
      promptHash: "hash",
      messages: [],
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs: 12,
      estimatedCostUsd: 0,
      error: "upstream unavailable",
    });

    await finishGenerationTrace({
      trace,
      status: "failed",
      error: "generation failed",
    });

    expect(createGenerationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        inputContent: expect.stringMatching(/^\[sha256:[a-f0-9]{64}\]$/),
        promptSnapshot: {
          version: 2,
          replayable: false,
          calls: [
            expect.not.objectContaining({
              messages: expect.anything(),
              response: expect.anything(),
            }),
          ],
        },
        candidateCount: 0,
        acceptedCount: 0,
        errorMessage: "generation failed",
      })
    );
  });

  it("persists the versioned generation event stream", async () => {
    const trace = startGenerationTrace({
      userUuid: "00000000-0000-0000-0000-000000000001",
      inputType: "text",
      inputContent: "baseline",
      platform: "instagram",
      postMode: "static",
      creationMode: "ideation",
      requestedModel: "gemini",
    });
    recordGenerationEvent({
      stage: "generation_graph_shadow",
      status: "completed",
      detail: "shadow parity confirmed",
      data: { validationErrors: [] },
    });

    await finishGenerationTrace({ trace, status: "completed" });

    expect(createGenerationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        eventsVersion: 2,
        events: [
          expect.objectContaining({
            stage: "generation_graph_shadow",
            status: "completed",
            detail: "shadow parity confirmed",
            at: expect.any(String),
          }),
        ],
      })
    );
  });

  it("denormalizes quality and fallback metrics", async () => {
    const trace = startGenerationTrace({
      userUuid: "00000000-0000-0000-0000-000000000001",
      inputType: "url",
      inputContent: "https://example.com",
      platform: "linkedin",
      postMode: "static",
      creationMode: "ideation",
      requestedModel: "gemini",
    });

    await finishGenerationTrace({
      trace,
      status: "completed",
      evaluations: [
        {
          overallScore: 84,
          accepted: true,
          dimensions: {
            brandAlignment: 80,
            objectiveAlignment: 90,
            audienceRelevance: 82,
            factuality: 88,
            originality: 75,
            clarity: 90,
            platformFit: 86,
            visualReadability: 92,
          },
          feedback: [],
        },
        {
          overallScore: 66,
          accepted: false,
          dimensions: {
            brandAlignment: 60,
            objectiveAlignment: 65,
            audienceRelevance: 62,
            factuality: 70,
            originality: 60,
            clarity: 72,
            platformFit: 68,
            visualReadability: 70,
          },
          feedback: ["Ajustar objetivo"],
        },
      ],
      revisionCount: 1,
      strategyFallbackUsed: true,
      originalityFallbackUsed: false,
    });

    expect(createGenerationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateCount: 2,
        acceptedCount: 1,
        averageQualityScore: 75,
        revisionCount: 1,
        strategyFallbackUsed: true,
        originalityFallbackUsed: false,
      })
    );
  });

  it("falls back to a minimal compatible record on schema incompatibility", async () => {
    (createGenerationRun as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("column generation_runs.events does not exist")
    );
    (
      isSchemaIncompatibilityError as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce(true);

    const trace = startGenerationTrace({
      userUuid: "00000000-0000-0000-0000-000000000001",
      inputType: "text",
      inputContent: "baseline",
      platform: "instagram",
      postMode: "static",
      creationMode: "ideation",
      requestedModel: "gemini",
    });

    await finishGenerationTrace({ trace, status: "failed", error: "boom" });

    expect(createGenerationRunMinimal).toHaveBeenCalledWith(
      expect.objectContaining({
        id: trace.id,
        status: "failed",
        errorMessage: "boom",
      })
    );
  });

  it("persists replayable LLM artifacts only when trace content storage is enabled", async () => {
    ENV.aiTraceStoreContent = true;
    const trace = startGenerationTrace({
      userUuid: "00000000-0000-0000-0000-000000000001",
      inputType: "text",
      inputContent: "conteudo autorizado para replay",
      platform: "instagram",
      postMode: "static",
      creationMode: "ideation",
      requestedModel: "gemini",
    });
    const messages = [{ role: "user", content: "gere um post" }];
    const response = { choices: [{ message: { content: '{"ok":true}' } }] };

    recordLlmTraceCall({
      label: "post_generation",
      requestedModel: "gemini",
      effectiveModel: "gemini-2.5-flash",
      provider: "google",
      promptHash: "hash",
      messages,
      response,
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      latencyMs: 12,
      estimatedCostUsd: 0.01,
    });

    await finishGenerationTrace({
      trace,
      status: "completed",
    });

    expect(createGenerationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        inputContent: "conteudo autorizado para replay",
        promptSnapshot: {
          version: 2,
          replayable: true,
          calls: [
            expect.objectContaining({
              label: "post_generation",
              messages,
              response,
            }),
          ],
        },
      })
    );
  });
});
