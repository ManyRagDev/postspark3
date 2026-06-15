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

  it("revises rejected candidates at most once and re-evaluates them", async () => {
    const candidates = Array.from({ length: 3 }, (_, index) => ({
      headline: `Tema ${index + 1}`,
      body: `Mensagem especifica ${index + 1}`,
      caption: `Legenda ${index + 1}`,
      callToAction: "Saiba mais",
      tone: `tom-${index + 1}`,
      layout: index === 0 ? "centered" : "left-aligned",
      backgroundColor: "#777777",
      textColor: "#777777",
      accentColor: "#777777",
      platform: "instagram" as const,
    }));
    const revise = vi.fn(async (items: typeof candidates) =>
      items.map((item) => ({
        ...item,
        backgroundColor: "#000000",
        textColor: "#FFFFFF",
      })),
    );

    const result = await evaluateAndReviseCandidates({
      candidates,
      strategies: [],
      platform: "instagram",
      revise,
    });

    expect(revise).toHaveBeenCalledTimes(1);
    expect(result.revisionCount).toBe(1);
    expect(result.evaluations.every((item) => item.dimensions.visualReadability === 100)).toBe(true);
  });
});
