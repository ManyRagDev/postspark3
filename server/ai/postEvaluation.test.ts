import { describe, expect, it, vi } from "vitest";

vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn().mockRejectedValue(new Error("judge offline")),
}));

import {
  contrastRatio,
  evaluateAndReviseCandidates,
} from "./postEvaluation";

describe("postEvaluation", () => {
  it("calculates WCAG contrast for deterministic readability checks", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 1);
  });

  it("revises only rejected candidates once and re-evaluates the set", async () => {
    // Candidates use rich text with good caption-body overlap and no unverified numbers.
    // Candidate index 1 has bad contrast (#777777 / #777777) to trigger rejection.
    const candidates = Array.from({ length: 3 }, (_, index) => ({
      headline: `Produto alpha ${index === 0 ? "essencial" : index === 1 ? "premium" : "inovador"}`,
      body: `Solucao completa para equipes que buscam produtividade e foco real`,
      caption: `Descubra como este produto traz produtividade e foco para sua equipe com solucao completa e pratica`,
      callToAction: "Saiba mais",
      tone: `tom-${index === 0 ? "profissional" : index === 1 ? "direto" : "criativo"}`,
      layout: index === 0 ? "centered" : "left-aligned",
      backgroundColor: index === 1 ? "#777777" : "#000000",
      textColor: index === 1 ? "#777777" : "#FFFFFF",
      accentColor: "#FFFFFF",
      platform: "instagram" as const,
    }));
    const revise = vi.fn(async (
      candidate: typeof candidates[number],
      _evaluation: unknown,
      index: number,
    ) => ({
      ...candidate,
      headline: `Revisado ${index + 1}`,
      backgroundColor: "#000000",
      textColor: "#FFFFFF",
    }));

    const result = await evaluateAndReviseCandidates({
      candidates,
      strategies: [],
      platform: "instagram",
      revise,
    });

    expect(revise).toHaveBeenCalledTimes(1);
    expect(revise.mock.calls[0][2]).toBe(1);
    expect(result.revisionCount).toBe(1);
    expect(result.revisedIndexes).toEqual([1]);
    expect(result.revisionFailedIndexes).toEqual([]);
    expect(result.candidates[1].headline).toBe("Revisado 2");
    expect(result.evaluations.every((item) => item.dimensions.visualReadability === 100)).toBe(true);
  });

  it("preserves rejected candidates when surgical revision fails", async () => {
    const candidates = [
      {
        headline: "Produto essencial",
        body: "Solucao completa para equipes que buscam produtividade e foco real",
        caption: "Descubra como este produto traz produtividade e foco para sua equipe",
        callToAction: "Saiba mais",
        tone: "direto",
        layout: "centered",
        backgroundColor: "#777777",
        textColor: "#777777",
        accentColor: "#777777",
        platform: "instagram" as const,
      },
    ];
    const revise = vi.fn(async () => null);

    const result = await evaluateAndReviseCandidates({
      candidates,
      strategies: [],
      platform: "instagram",
      revise,
    });

    expect(revise).toHaveBeenCalledTimes(1);
    expect(result.candidates[0]).toBe(candidates[0]);
    expect(result.revisionCount).toBe(0);
    expect(result.revisedIndexes).toEqual([]);
    expect(result.revisionFailedIndexes).toEqual([0]);
  });

  it("rejects structured candidates when headline promises a different item count", async () => {
    const candidate = {
      headline: "Antes de comprar: 7...",
      body: "Decida com seguranca",
      caption: "Confira autonomia conforto precisao e escolha melhor com seguranca antes da compra",
      callToAction: "Ver checklist",
      tone: "direto",
      layout: "centered",
      backgroundColor: "#000000",
      textColor: "#FFFFFF",
      accentColor: "#38BDF8",
      platform: "instagram" as const,
      sections: [
        { label: "Autonomia", description: "Bateria para o dia todo" },
        { label: "Conforto", description: "Leve no pulso" },
        { label: "Precisao", description: "GPS confiavel" },
      ],
    };
    const revise = vi.fn(async () => ({
      ...candidate,
      headline: "Antes de comprar: 3 sinais",
    }));

    const result = await evaluateAndReviseCandidates({
      candidates: [candidate],
      strategies: [],
      platform: "instagram",
      revise,
    });

    expect(revise).toHaveBeenCalledTimes(1);
    expect(result.revisedIndexes).toEqual([0]);
  });
});
