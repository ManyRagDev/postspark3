import { describe, expect, it } from "vitest";
import {
  buildImageGenerationPrompt,
  imageDimensions,
  openRouterImageRatio,
} from "./imageGeneration";

describe("buildImageGenerationPrompt", () => {
  it("anchors a generated visual scene to the final visible message and palette", () => {
    const prompt = buildImageGenerationPrompt("abstract sale tags", {
      headline: "Desconto de 50% pode esconder aumento anterior",
      body: "Acompanhe o histórico de preços antes de comprar.",
      caption: "Compare o preço de hoje com a linha do tempo do produto.",
      familyName: "Pôster Editorial",
      backgroundColor: "#101828",
      accentColor: "#F59E0B",
    });

    expect(prompt).toContain("User-selected scene and primary visual intent: abstract sale tags");
    expect(prompt).toContain("Desconto de 50% pode esconder aumento anterior");
    expect(prompt).toContain("Acompanhe o histórico de preços");
    expect(prompt).toContain("Pôster Editorial");
    expect(prompt).toContain("#F59E0B");
    expect(prompt).toContain("Avoid unrelated stock imagery");
    expect(prompt).toContain("Post text is supporting context");
    expect(prompt).toContain("Do not invent a specific product category");
  });

  it("keeps a manually supplied prompt free of post context", () => {
    expect(buildImageGenerationPrompt("A quiet mountain lake")).toBe(
      "A quiet mountain lake"
    );
  });
});

describe("imageDimensions", () => {
  it("uses the selected canvas proportion", () => {
    expect(imageDimensions["1:1"]).toEqual({ width: 1080, height: 1080 });
    expect(imageDimensions["4:5"]).toEqual({ width: 1080, height: 1350 });
    expect(imageDimensions["5:6"]).toEqual({ width: 1080, height: 1296 });
    expect(imageDimensions["9:16"]).toEqual({ width: 1080, height: 1920 });
    expect(openRouterImageRatio["5:6"]).toBe("4:5");
    expect(openRouterImageRatio["4:5"]).toBe("4:5");
  });
});
