import { beforeEach, describe, expect, it, vi } from "vitest";
import { CREATIVE_DESIGN_EXTRACTION_VERSION, designExtractionSchema, reconcileDnaWithTokens } from "@shared/designExtraction";
import { dedupeIntentKinds, detectGoogleFonts, extractDesignFromScreenshot, extractDesignFromUrl } from "./designExtraction";
import { REUNE_ARTWORKS, REUNE_DNA, REUNE_INTENTS, REUNE_DIRECTION } from "../client/src/pages/TemplateIngestion/intentToCanvasModel.test";
import { invokeLLM } from "./_core/llm";
import { publicHtml } from "./publicUrl";
import { captureScreenshot } from "./screenshotService";

vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("./publicUrl", () => ({ publicHtml: vi.fn() }));
vi.mock("./screenshotService", () => ({ captureScreenshot: vi.fn() }));

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

describe("extractDesignFromUrl", () => {
  const url = "https://example.com/";

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(captureScreenshot).mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    vi.mocked(invokeLLM).mockResolvedValue({
      id: "fixture",
      created: 0,
      model: "fixture",
      choices: [{
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content: JSON.stringify({ dna: { ...REUNE_DNA, composition: REUNE_DIRECTION }, intents: REUNE_INTENTS }) },
      }],
    });
  });

  it("extrai o design pelo print quando a leitura do HTML expira", async () => {
    vi.mocked(publicHtml).mockRejectedValue(new DOMException("HTML request expired", "AbortError"));

    const result = await extractDesignFromUrl(url, "mobile");

    expect(captureScreenshot).toHaveBeenCalledWith(url, "mobile");
    expect(invokeLLM).toHaveBeenCalledOnce();
    expect(vi.mocked(invokeLLM).mock.calls[0][0].pinnedModel).toBeUndefined();
    expect(result).toMatchObject({ sourceUrl: url, evidence: { fonts: [], colors: [] }, previewDataUrl: "data:image/png;base64,AQID" });
    expect(result.extraction).toMatchObject({ intents: REUNE_INTENTS, dna: { composition: REUNE_DIRECTION } });
  });

  it("mantém as evidências e a URL final quando o HTML responde", async () => {
    const finalUrl = "https://example.com/landing";
    vi.mocked(publicHtml).mockResolvedValue({
      url: finalUrl,
      html: '<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk">',
    });

    const result = await extractDesignFromUrl(url, "desktop", "google/gemini-4-neon");

    expect(captureScreenshot).toHaveBeenCalledWith(finalUrl, "desktop");
    expect(invokeLLM).toHaveBeenCalledWith(expect.objectContaining({
      pinnedModel: "google/gemini-4-neon",
      disableFallback: true,
      reasoningEffort: "medium",
    }));
    expect(result.sourceUrl).toBe(finalUrl);
    expect(result.extraction.dna.typography.headingFont).toBe("Space Grotesk");
  });

  it("preserva erros de acesso à página", async () => {
    vi.mocked(publicHtml).mockRejectedValue(new Error("HTTP 403"));

    await expect(extractDesignFromUrl(url)).rejects.toThrow("HTTP 403");
    expect(captureScreenshot).not.toHaveBeenCalled();
    expect(invokeLLM).not.toHaveBeenCalled();
  });

  it("usa a resposta de arte da versão atual com as cinco propostas e preserva o modelo escolhido", async () => {
    const response = { dna: REUNE_DNA, proposals: REUNE_ARTWORKS };
    vi.mocked(invokeLLM).mockResolvedValueOnce({
      id: "fixture", created: 0, model: "google/gemini-4-neon",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(response) } }],
    });
    const result = await extractDesignFromScreenshot({
      imageDataUrl: "data:image/png;base64,AQID", sourceUrl: null, evidence: { fonts: [], colors: [] },
      model: "google/gemini-4-neon", version: CREATIVE_DESIGN_EXTRACTION_VERSION,
    });
    expect(result).toEqual(response);
    expect(invokeLLM).toHaveBeenCalledWith(expect.objectContaining({
      pinnedModel: "google/gemini-4-neon", disableFallback: true, forceTextSchema: true,
      response_format: expect.objectContaining({ json_schema: expect.objectContaining({ name: "artwork_proposals" }) }),
    }));
  });
});
