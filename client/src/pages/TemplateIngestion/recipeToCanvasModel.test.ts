import { describe, expect, it } from "vitest";
import { recipeToCanvasModel, detectAspectRatio } from "./recipeToCanvasModel";
import type { RecreationRecipe } from "@shared/designRecreation";

describe("recipeToCanvasModel", () => {
  it("detects correct aspect ratios", () => {
    expect(detectAspectRatio(1080, 1080)).toBe("1:1");
    expect(detectAspectRatio(1080, 1350)).toBe("4:5");
    expect(detectAspectRatio(1080, 1920)).toBe("9:16");
  });

  it("converts a recreation recipe into an authoritative CanvasPostModel", () => {
    const mockRecipe: RecreationRecipe = {
      format: "postspark.admin2.recipe",
      version: 2,
      id: "test-rec-1",
      title: "Design de Teste Minimalista",
      createdAt: "2026-11-08T00:00:00.000Z",
      model: "gpt-4o",
      provider: "openai",
      usage: { inputTokens: 500, outputTokens: 200 },
      scene: {
        schemaVersion: 2,
        source: {
          widthPx: 1080,
          heightPx: 1350,
          mimeType: "image/png",
          preparedHash: "hash123",
          originalHash: null,
        },
        artboard: { background: "#111827" },
        layers: [
          {
            id: "bg-card",
            role: "surface",
            zIndex: 1,
            x: 54,
            y: 54,
            width: 972,
            height: 1242,
            fill: "#1F2937",
            rotationDeg: 0,
            provenance: "multimodal",
            kind: "rect",
            strokeColor: "#374151",
            strokeWidth: 2,
            opacity: 1,
            support: "verified",
          },
          {
            id: "main-title",
            role: "headline",
            zIndex: 2,
            x: 100,
            y: 120,
            width: 880,
            height: 150,
            fill: "#F9FAFB",
            rotationDeg: 0,
            provenance: "multimodal",
            kind: "text",
            text: "O Futuro do Design de Interfaces",
            fontFamily: "Plus Jakarta Sans",
            fontWeight: 800,
            fontSize: 64,
            align: "center",
            opacity: 1,
            support: "verified",
          },
          {
            id: "sub-body",
            role: "support",
            zIndex: 3,
            x: 100,
            y: 300,
            width: 880,
            height: 80,
            fill: "#9CA3AF",
            rotationDeg: 0,
            provenance: "multimodal",
            kind: "text",
            text: "Como a IA e o design determinístico transformam a criação.",
            fontFamily: "Inter",
            fontWeight: 400,
            fontSize: 28,
            align: "center",
            opacity: 1,
            support: "verified",
          },
          {
            id: "tag-badge",
            role: "badge",
            zIndex: 4,
            x: 100,
            y: 420,
            width: 200,
            height: 40,
            fill: "#FF5C00",
            rotationDeg: 0,
            provenance: "multimodal",
            kind: "text",
            text: "NOVAS TENDÊNCIAS",
            fontFamily: "Space Mono",
            fontWeight: 700,
            fontSize: 16,
            align: "left",
            opacity: 1,
            support: "verified",
          },
        ],
        fonts: [
          { family: "Plus Jakarta Sans", weight: 800, sha256: null, sourceUrl: null, mimeType: "font/woff2", dataUrl: null, license: null },
          { family: "Inter", weight: 400, sha256: null, sourceUrl: null, mimeType: "font/woff2", dataUrl: null, license: null },
        ],
        warnings: [],
        decoderVersion: "admin2-vision-3",
        rendererVersion: "admin2-konva-2",
      },
      missingElements: [
        {
          description: "Foto do palestrante ou mockup",
          reason: "Imagem complexa no terço inferior",
          role: "hero",
          essential: true,
          box: { x: 0.1, y: 0.45, width: 0.8, height: 0.45 },
        },
      ],
      notes: ["Referência bem estruturada"],
    };

    const model = recipeToCanvasModel(mockRecipe, { originalImageUrl: "https://example.com/test.png" });

    expect(model).toBeDefined();
    expect(model.aspectRatio).toBe("4:5");
    expect(model.headline).toBe("O Futuro do Design de Interfaces");
    expect(model.subtext).toBe("Como a IA e o design determinístico transformam a criação.");
    expect(model.fontFamily).toBe("Plus Jakarta Sans");
    expect(model.palette.background).toBe("#111827");
    expect(model.palette.text).toBe("#F9FAFB");
    expect(model.palette.accent).toBe("#1F2937");

    const coverSlide = model.slides[0];
    expect(coverSlide).toBeDefined();
    expect(coverSlide.headline).toBe("O Futuro do Design de Interfaces");
    expect(coverSlide.subtext).toBe("Como a IA e o design determinístico transformam a criação.");

    // extraTexts should contain the tag-badge layer
    expect(coverSlide.extraTexts).toHaveLength(1);
    expect(coverSlide.extraTexts![0].text).toBe("NOVAS TENDÊNCIAS");
    expect(coverSlide.extraTexts![0].fontFamily).toBe("Space Mono");

    // extraShapes should contain bg-card
    expect(coverSlide.extraShapes).toHaveLength(1);
    expect(coverSlide.extraShapes![0].color).toBe("#1F2937");

    // extraImages should contain the missing element media slot
    expect(coverSlide.extraImages).toHaveLength(1);
    expect(coverSlide.extraImages![0].imagePrompt).toBe("Foto do palestrante ou mockup");
  });
});
