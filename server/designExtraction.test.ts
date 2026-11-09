import { describe, expect, it } from "vitest";
import { designExtractionSchema, reconcileDnaWithTokens } from "@shared/designExtraction";
import { dedupeIntentKinds, detectGoogleFonts } from "./designExtraction";
import { REUNE_DNA, REUNE_INTENTS } from "../client/src/pages/TemplateIngestion/intentToCanvasModel.test";

describe("designExtraction (guardas determinísticos)", () => {
  it("detecta as fontes reais declaradas no Google Fonts", () => {
    const html = `<link href="https://fonts.googleapis.com/css2?family=Permanent+Marker&amp;family=Space+Grotesk:wght@300;400;700&amp;family=Space+Mono:ital,wght@0,400;0,700&amp;display=swap" rel="stylesheet">`;
    expect(detectGoogleFonts(html)).toEqual(["Permanent Marker", "Space Grotesk", "Space Mono"]);
  });

  it("não deixa a IA inventar fonte quando a página declara as reais", () => {
    const invented = { ...REUNE_DNA, typography: { ...REUNE_DNA.typography, headingFont: "Poppins", bodyFont: "Inter", labelFont: "Roboto Mono" } };
    const fixed = reconcileDnaWithTokens(invented, { fonts: ["Space Grotesk", "Space Mono"], colors: [] });
    expect(fixed.typography.headingFont).toBe("Space Grotesk");
    expect(fixed.typography.labelFont).toBe("Space Mono");
  });

  it("mantém o DNA quando não há fontes detectadas", () => {
    expect(reconcileDnaWithTokens(REUNE_DNA, { fonts: [], colors: [] })).toEqual(REUNE_DNA);
  });

  it("mantém cada intenção uma única vez", () => {
    const parsed = designExtractionSchema.parse({ dna: REUNE_DNA, intents: [REUNE_INTENTS[0], REUNE_INTENTS[0], REUNE_INTENTS[1]] });
    expect(dedupeIntentKinds(parsed).intents.map(i => i.kind)).toEqual(["value-pillars", "versus"]);
  });
});
