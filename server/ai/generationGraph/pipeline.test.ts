import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV } from "../../_core/env";
import {
  recordLlmTraceCall,
  startGenerationTrace,
} from "../generationTrace";
import { runGenerationPipeline } from "./pipeline";

const events: unknown[] = [];
const originalPipeline = ENV.aiGraphPipelineEnabled;

vi.mock("../generationTrace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../generationTrace")>();
  return {
    ...actual,
    recordGenerationEvent: vi.fn((event) => {
      events.push(event);
      actual.recordGenerationEvent(event);
    }),
  };
});

afterEach(() => {
  ENV.aiGraphPipelineEnabled = originalPipeline;
  events.length = 0;
  vi.clearAllMocks();
});

function makeValidStaticVariation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    headline: "Diagnostico de funil",
    body: "Mapeie gargalos antes de aumentar investimento.",
    caption: "Diagnostico pratico para encontrar perdas no funil comercial.",
    callToAction: "Diagnosticar",
    imagePrompt: "Analista revisando funil de vendas",
    template: "simple" as const,
    tone: "analitico",
    layout: "split",
    backgroundColor: "#0F172A",
    textColor: "#F8FAFC",
    accentColor: "#38BDF8",
    copyAngle: {
      type: "diagnostic",
      label: "Diagnostico",
      badge: "Mapa",
      stickerText: "Check",
    },
    ...overrides,
  };
}

function startTraceWithSlotCall() {
  startGenerationTrace({
    userUuid: "00000000-0000-0000-0000-000000000001",
    inputType: "text",
    inputContent: "conteudo",
    platform: "instagram",
    postMode: "static",
    creationMode: "ideation",
    requestedModel: "gemini",
  });
  recordLlmTraceCall({
    label: "slot_0",
    requestedModel: "gemini",
    effectiveModel: "gemini-2.5-flash",
    provider: "google",
    promptHash: "hash",
    messages: [{ role: "user", content: "x" }],
    response: { choices: [] },
    promptTokens: 1,
    completionTokens: 1,
    totalTokens: 2,
    latencyMs: 1,
    estimatedCostUsd: 0,
  });
}

describe("generation pipeline graph", () => {
  it("stays disabled until AI_GRAPH_PIPELINE is enabled", async () => {
    ENV.aiGraphPipelineEnabled = false;

    await expect(
      runGenerationPipeline({ variations: [], postMode: "static" }),
    ).resolves.toBeNull();
  });

  it("runs all stages and approves a valid static set", async () => {
    ENV.aiGraphPipelineEnabled = true;
    startTraceWithSlotCall();

    const variations = [
      makeValidStaticVariation(),
      makeValidStaticVariation({
        headline: "Plano de conteudo",
        body: "Organize pautas por objetivo.",
        caption: "Plano editorial para transformar temas.",
        layout: "centered",
        copyAngle: { type: "planning", label: "Plano", badge: "P", stickerText: "A" },
      }),
      makeValidStaticVariation({
        headline: "Rotina de medicao",
        body: "Compare sinais de alcance e resposta.",
        caption: "Rotina de metricas para decidir o que manter.",
        layout: "minimal",
        copyAngle: { type: "metrics", label: "Metricas", badge: "D", stickerText: "E" },
      }),
    ];

    const state = await runGenerationPipeline({
      variations: variations as any,
      postMode: "static",
    });

    expect(state).toMatchObject({
      status: "completed",
      replayable: true,
      replayCallsTotal: 1,
      replayCallsReplayable: 1,
      validationErrors: [],
      copyErrors: [],
      sectionsErrors: [],
    });
    expect(events).toEqual([
      expect.objectContaining({
        stage: "generation_graph_pipeline",
        status: "completed",
        data: expect.objectContaining({
          kpi: expect.objectContaining({
            // visualFitAutoFixRate is unavailable because the pipeline observes
            // only the post-fallback snapshot.
            visualFitAutoFixRate: null,
            // No brand_visual_qa event in the trace -> deterministic guardian path.
            brandGuardianFallbackRate: 1,
          }),
        }),
      }),
    ]);
  });

  it("reports replayable false when trace calls lack response payload", async () => {
    ENV.aiGraphPipelineEnabled = true;
    startGenerationTrace({
      userUuid: "00000000-0000-0000-0000-000000000001",
      inputType: "text",
      inputContent: "conteudo",
      platform: "instagram",
      postMode: "static",
      creationMode: "ideation",
      requestedModel: "gemini",
    });
    recordLlmTraceCall({
      label: "slot_0",
      requestedModel: "gemini",
      effectiveModel: "gemini-2.5-flash",
      provider: "google",
      promptHash: "hash",
      messages: [{ role: "user", content: "x" }],
      response: undefined,
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      latencyMs: 1,
      estimatedCostUsd: 0,
      error: "no response",
    });

    const variations = [
      makeValidStaticVariation(),
      makeValidStaticVariation({ headline: "Plano B", copyAngle: { type: "planning", label: "P", badge: "P", stickerText: "A" } }),
      makeValidStaticVariation({ headline: "Rotina C", copyAngle: { type: "metrics", label: "M", badge: "D", stickerText: "E" } }),
    ];

    const state = await runGenerationPipeline({
      variations: variations as any,
      postMode: "static",
    });

    expect(state).toMatchObject({
      replayable: false,
      replayCallsReplayable: 0,
    });
  });

  it("detects schema, copy and sections failures and records them without throwing", async () => {
    ENV.aiGraphPipelineEnabled = true;
    startTraceWithSlotCall();

    // 1 variation, missing copy, with incoherent structured sections
    // (headline advertises 5 items but the static target is 3).
    const broken = {
      headline: "5 dicas práticas",
      template: "feature-grid" as const,
      sections: [{ id: "s1", label: "Only one", description: "desc" }],
    };

    const state = await runGenerationPipeline({
      variations: [broken] as any,
      postMode: "static",
    });

    expect(state).toMatchObject({
      copyErrors: expect.arrayContaining([
        expect.stringContaining("missing required copy"),
      ]),
      sectionsErrors: expect.arrayContaining([
        expect.stringContaining("invalid static sections"),
        expect.stringContaining("incoherent item count"),
      ]),
    });
    // Failures are recorded in the state fields rather than thrown as exceptions.
    // With a single invalid variation, final_approval rejects the set, so the
    // run ends in "failed" — but the graph completed its traversal and the
    // intermediate nodes captured the divergence.
    expect(state?.events.some((e) => e.node === "copy_validation" && e.status === "error")).toBe(true);
    expect(state?.events.some((e) => e.node === "sections_validation" && e.status === "error")).toBe(true);
  });

  it("ends in failed status when the final approval rejects an invalid set", async () => {
    ENV.aiGraphPipelineEnabled = true;
    startTraceWithSlotCall();

    // final_approval runs assertVariationSet, which requires exactly 3
    // sufficiently distinct variations; 2 partial variations will be rejected.
    const incomplete = [
      makeValidStaticVariation({ headline: "A" }),
      makeValidStaticVariation({ headline: "A" }),
    ];

    const state = await runGenerationPipeline({
      variations: incomplete as any,
      postMode: "static",
    });

    expect(state?.status).toBe("failed");
    expect(state?.events.some((e) => e.node === "final_approval" && e.status === "error")).toBe(true);
  });
});
