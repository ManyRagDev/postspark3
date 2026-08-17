import { describe, expect, it } from "vitest";
import type { DesignTokens, PostVariation } from "../postspark";
import { composeVisualDiversityPlan, visualDiversityIssues } from "./visualDiversityPlan";

function variation(index: number): PostVariation {
  return {
    id: `visual-${index}`,
    headline: `Perspectiva visual ${index}`,
    body: `Uma mensagem completa para a abordagem numero ${index}.`,
    caption: `Legenda ${index}`,
    hashtags: ["postspark"],
    callToAction: "Conheca agora",
    tone: "direto",
    platform: "instagram",
    imagePrompt: `Concept ${index}`,
    backgroundColor: "#101828",
    textColor: "#FFFFFF",
    accentColor: "#22C55E",
    layout: "split",
    copyAngle: { type: "beneficio", label: `Angulo ${index}` },
  };
}

describe("composeVisualDiversityPlan", () => {
  it("composes a set with distinct effective layouts, families and cells", () => {
    const result = composeVisualDiversityPlan(
      [variation(1), variation(2), variation(3)],
      {} as DesignTokens,
    );

    expect(new Set(result.variations.map((item) => item.layout)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(result.variations.map((item) => item.creativeDirection?.familyId)).size).toBeGreaterThanOrEqual(2);
    expect(result.plan.issues).toEqual([]);
    expect(visualDiversityIssues(result.variations)).toEqual([]);
  });
});
