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
    const candidates = Array.from({ length: 3 }, (_, index) => ({
      headline: `Tema ${index + 1}`,
      body: `Mensagem especifica ${index + 1}`,
      caption: `Legenda ${index + 1}`,
      callToAction: "Saiba mais",
      tone: `tom-${index + 1}`,
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
        headline: "Tema",
        body: "Mensagem especifica",
        caption: "Legenda",
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
});
