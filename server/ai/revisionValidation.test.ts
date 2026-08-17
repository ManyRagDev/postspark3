import { describe, expect, it } from "vitest";
import { createPostVariation } from "../../tests/fixtures/postspark";
import type { PostVariation, SiteIntelligence } from "@shared/postspark";
import { contrastRatio } from "./postEvaluation";
import { validateRevisedCandidate } from "./revisionValidation";

function candidate(index: number): PostVariation {
  return createPostVariation({
    template: "simple",
    sections: undefined,
    headline: `Headline exclusiva ${index}`,
    body: `Corpo diferente para publico ${index}`,
    caption: `Legenda diferente da variacao ${index} com contexto suficiente`,
    callToAction: `Acao ${index}`,
    tone: `tom-${index}`,
    layout: index === 1 ? "centered" : index === 2 ? "left-aligned" : "minimal",
    backgroundColor: "#000000",
    textColor: "#FFFFFF",
    accentColor: "#38BDF8",
    copyAngle: { type: `angle-${index}`, label: `Angle ${index}` },
  });
}

const siteIntelligence = {
  brand: {
    colors: {
      primary: "#112233",
      secondary: "#445566",
      background: "#112233",
      text: "#FFFFFF",
      accent: "#88CCFF",
      palette: ["#112233", "#445566", "#88CCFF", "#FFFFFF"],
    },
  },
} as unknown as SiteIntelligence;

describe("validateRevisedCandidate", () => {
  it("G7: rejects a revision that reintroduces similarity into the set", () => {
    const candidates = [candidate(1), candidate(2), candidate(3)];
    const duplicate = { ...candidates[0], id: candidates[1].id };
    const result = validateRevisedCandidate({
      candidate: duplicate,
      candidateIndex: 1,
      candidates,
      postMode: "static",
    });

    expect(result.errors).toContain("variations are not sufficiently distinct");
  });

  it("G8: reapplies the Brand Guardian and WCAG contrast after revision", () => {
    const candidates = [candidate(1), candidate(2), candidate(3)];
    const revised = {
      ...candidates[1],
      backgroundColor: "#FF00FF",
      textColor: "#FF00FF",
      accentColor: "#00FF00",
    };
    const result = validateRevisedCandidate({
      candidate: revised,
      candidateIndex: 1,
      candidates,
      postMode: "static",
      siteIntelligence,
    });

    expect(siteIntelligence.brand.colors.palette).toContain(result.candidate.backgroundColor);
    expect(contrastRatio(result.candidate.textColor, result.candidate.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  });

  it("rejects a revised slot whose copy would still be line-clamped", () => {
    const candidates = [candidate(1), candidate(2), candidate(3)];
    const revised = createPostVariation({
      ...candidates[1],
      template: "simple",
      sections: undefined,
      headline: "Faça escolhas corretamente",
      body: "",
      layoutSettings: {
        ...candidates[1].layoutSettings,
        headline: {
          position: "top-left",
          textAlign: "left",
          freePosition: { x: 20, y: 30 },
          width: 28,
        },
      },
    });
    const result = validateRevisedCandidate({
      candidate: revised,
      candidateIndex: 1,
      candidates,
      postMode: "static",
    });

    expect(result.errors.some((error) => error.includes("text_exceeds_visible_area"))).toBe(true);
  });
});
