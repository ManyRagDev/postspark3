import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV } from "../../_core/env";
import {
  recordLlmTraceCall,
  startGenerationTrace,
} from "../generationTrace";
import { runGenerationShadowGraph } from "./shadow";

const events: unknown[] = [];
const originalShadow = ENV.aiGraphShadowEnabled;

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
  ENV.aiGraphShadowEnabled = originalShadow;
  events.length = 0;
  vi.clearAllMocks();
});

describe("generation shadow graph", () => {
  it("stays disabled until AI_GRAPH_SHADOW is enabled", async () => {
    ENV.aiGraphShadowEnabled = false;

    await expect(
      runGenerationShadowGraph({ variations: [], postMode: "static" }),
    ).resolves.toBeNull();
  });

  it("audits replay metadata and schema without changing output", async () => {
    ENV.aiGraphShadowEnabled = true;
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
      label: "slot_generation",
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

    const variations = [
      {
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
      },
      {
        headline: "Plano de conteudo",
        body: "Organize pautas por objetivo e maturidade da audiencia.",
        caption: "Plano editorial para transformar temas soltos em rotina de publicacao.",
        callToAction: "Planejar",
        imagePrompt: "Calendario editorial em mesa de trabalho",
        template: "simple" as const,
        tone: "pratico",
        layout: "centered",
        backgroundColor: "#F8FAFC",
        textColor: "#111827",
        accentColor: "#F97316",
        copyAngle: {
          type: "planning",
          label: "Planejamento",
          badge: "Plano",
          stickerText: "Agora",
        },
      },
      {
        headline: "Rotina de medicao",
        body: "Compare sinais de alcance, clique e resposta comercial.",
        caption: "Rotina de metricas para decidir o que manter, cortar e testar.",
        callToAction: "Medir",
        imagePrompt: "Dashboard de metricas sociais",
        template: "simple" as const,
        tone: "executivo",
        layout: "minimal",
        backgroundColor: "#111827",
        textColor: "#ECFDF5",
        accentColor: "#10B981",
        copyAngle: {
          type: "metrics",
          label: "Metricas",
          badge: "Dados",
          stickerText: "Evoluir",
        },
      },
    ];

    const state = await runGenerationShadowGraph({
      variations,
      postMode: "static",
    });

    expect(state).toMatchObject({
      status: "completed",
      replayable: true,
      llmCallCount: 1,
      replayableCallCount: 1,
      validationErrors: [],
      copyValidationErrors: [],
      sectionsValidationErrors: [],
      copyGuardsApplied: false,
      copyGuardsChanges: [],
      visualFitIssueCount: 0,
      visualFitErrors: [],
    });
    expect(events).toEqual([
      expect.objectContaining({
        stage: "generation_graph_shadow",
        status: "completed",
        data: expect.objectContaining({
          visited: ["replay_audit", "schema_validation", "copy_validation", "sections_validation", "copy_guards", "visual_fit_validation", "completed"],
        }),
      }),
    ]);
  });

  it("detects copy and sections validation failures", async () => {
    ENV.aiGraphShadowEnabled = true;
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
      label: "slot_generation",
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

    const incompleteVariation = {
      headline: "3 dicas práticas sem body nem caption",
      template: "feature-grid" as const,
      sections: [
        { id: "s1", label: "Section 1", description: "Description 1" },
      ],
    };

    const state = await runGenerationShadowGraph({
      variations: [incompleteVariation],
      postMode: "static",
    });

    expect(state).toMatchObject({
      status: "completed",
      copyValidationErrors: expect.arrayContaining([
        expect.stringContaining("missing required copy fields"),
      ]),
      sectionsValidationErrors: expect.arrayContaining([
        expect.stringContaining("invalid static sections"),
      ]),
      visualFitErrors: [],
    });
  });
});
