import { describe, expect, it, vi } from "vitest";

vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn().mockRejectedValue(new Error("judge offline")),
}));

import {
  applyOriginalityToEvaluations,
  contrastRatio,
  deterministicEvaluation,
  evaluateCandidates,
} from "./postEvaluation";

function cleanCandidate(overrides: Record<string, unknown> = {}) {
  return {
    headline: "Foco em resultado",
    body: "Mensagem objetiva",
    caption: "Legenda coerente com o post",
    callToAction: "Saiba mais",
    tone: "direto",
    layout: "centered",
    template: "simple",
    aspectRatio: "1:1" as const,
    backgroundColor: "#000000",
    textColor: "#FFFFFF",
    accentColor: "#FFFFFF",
    platform: "instagram" as const,
    ...overrides,
  };
}

describe("postEvaluation (API mantida pós-SPEC-005)", () => {
  it("calculates WCAG contrast for deterministic readability checks", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 1);
  });

  it("rejeita candidato com contraste ruim (visualReadability < 65)", async () => {
    const result = await evaluateCandidates({
      candidates: [
        cleanCandidate({ backgroundColor: "#777777", textColor: "#777777" }),
      ],
      strategies: [],
      platform: "instagram",
    });

    expect(result[0].accepted).toBe(false);
    expect(result[0].dimensions.visualReadability).toBeLessThan(65);
  });

  it("candidato limpo passa com layoutIntegrity 100 e accepted true", async () => {
    const result = await evaluateCandidates({
      candidates: [cleanCandidate()],
      strategies: [],
      platform: "instagram",
    });

    expect(result[0].dimensions.layoutIntegrity).toBe(100);
    expect(result[0].accepted).toBe(true);
  });

  it("dimensões incluem layoutIntegrity numérico", async () => {
    const result = await evaluateCandidates({
      candidates: [cleanCandidate()],
      strategies: [],
      platform: "instagram",
    });

    expect(result[0].dimensions).toHaveProperty("layoutIntegrity");
    expect(typeof result[0].dimensions.layoutIntegrity).toBe("number");
  });

  it("carrossel limpo com 5 slides pontua layoutIntegrity 100", async () => {
    const result = await evaluateCandidates({
      candidates: [
        cleanCandidate({
          postMode: "carousel" as const,
          slides: Array.from({ length: 5 }, (_, i) => ({
            headline: `Slide ${i + 1}`,
            body: "Conteudo curto",
            slideNumber: i + 1,
          })),
        }),
      ],
      strategies: [],
      platform: "instagram",
    });

    expect(result[0].dimensions.layoutIntegrity).toBe(100);
  });

  it("carrossel com slide quebrado (overflow) penaliza layoutIntegrity", async () => {
    const result = await evaluateCandidates({
      candidates: [
        cleanCandidate({
          postMode: "carousel" as const,
          slides: Array.from({ length: 5 }, (_, i) => ({
            headline:
              i === 4
                ? "Titulo extremamente longo que extrapola a caixa de texto do slide final do carrossel"
                : `Slide ${i + 1}`,
            body: i === 4 ? "Body tambem longo para forcar multiple issues no slide problemático" : "Curto",
            slideNumber: i + 1,
            ...(i === 4
              ? {
                  editorState: {
                    layoutSettings: {
                      headline: { position: "top-left" as const, textAlign: "left" as const, freePosition: { x: 50, y: 20 }, width: 22 },
                      body: { position: "top-left" as const, textAlign: "left" as const, freePosition: { x: 50, y: 30 }, width: 22 },
                    },
                  },
                }
              : {}),
          })),
        }),
      ],
      strategies: [],
      platform: "instagram",
    });

    expect(result[0].dimensions.layoutIntegrity).toBeLessThan(100);
  });

  it("applyOriginalityToEvaluations reaplica o score e reduz o overallScore", async () => {
    const base = await evaluateCandidates({
      candidates: [cleanCandidate()],
      strategies: [],
      platform: "instagram",
    });

    const withScore = applyOriginalityToEvaluations(base, [30]);
    expect(withScore[0].dimensions.originality).toBe(30);
    expect(withScore[0].overallScore).toBeLessThan(base[0].overallScore);
    // Originality não é dimensão com limiar (peso 0.09): sozinha não
    // derruba a aceitação — o gate de aceite usa factuality, visualReadability,
    // objectiveAlignment, captionCoherence e layoutIntegrity.
    expect(withScore[0].accepted).toBe(base[0].accepted);
  });

  it("deterministicEvaluation detecta contagem incoerente headline vs sections", () => {
    const candidate = cleanCandidate({
      headline: "Antes de comprar: 7 sinais",
      sections: [
        { label: "Autonomia", description: "Bateria" },
        { label: "Conforto", description: "Leve" },
        { label: "Precisao", description: "GPS" },
      ],
    });

    const evaluation = deterministicEvaluation({
      candidate,
      allCandidates: [candidate],
      platform: "instagram",
    });

    expect(evaluation.dimensions.captionCoherence).toBeLessThan(50);
    expect(evaluation.accepted).toBe(false);
  });
});
