import { describe, expect, it } from "vitest";
import type { PostVariation } from "@shared/postspark";
import {
  buildExtraFallbackVariations,
  buildInitialFallbackVariations,
  variationToCanvasModel,
  aiGenerationProvenance,
} from "./studioGeneration";

function makeVariation(overrides: Partial<PostVariation> = {}): PostVariation {
  return {
    id: "v-1",
    headline: "O Custo Oculto da Marca Amadora",
    body: "Um corpo completo que não repete o prompt.",
    caption: "Legenda completa",
    hashtags: ["#Branding"],
    callToAction: "Salve este post",
    tone: "autoridade",
    platform: "instagram",
    imagePrompt: "editorial dark texture",
    creativeDirection: { familyId: "editorial-poster" } as PostVariation["creativeDirection"],
    backgroundColor: "#120D0A",
    textColor: "#F8F4EE",
    accentColor: "#E5A93C",
    layout: "left-aligned",
    ...overrides,
  };
}

describe("studioGeneration (Etapa 3 e 5)", () => {
  it("stamps local fallbacks with permanent local_fallback provenance", () => {
    const fallbacks = buildInitialFallbackVariations("branding de luxo", undefined, "provider_unavailable");
    expect(fallbacks).toHaveLength(3);
    for (const f of fallbacks) {
      expect(f.provenance?.source).toBe("local_fallback");
      expect(f.provenance?.fallbackReason).toBe("provider_unavailable");
    }
  });

  it("stamps 'generate more' local fallbacks with provenance on every variation", () => {
    const extra = buildExtraFallbackVariations("branding de luxo", "provider_timeout");
    for (const f of extra) {
      expect(f.provenance?.source).toBe("local_fallback");
      expect(f.provenance?.fallbackReason).toBe("provider_timeout");
    }
  });

  it("carries generationRunId provenance into AI-mapped models", () => {
    const provenance = aiGenerationProvenance("run-123");
    const model = variationToCanvasModel(makeVariation(), 0, "prompt", provenance);
    expect(model.provenance?.source).toBe("ai");
    expect(model.provenance?.generationRunId).toBe("run-123");
  });

  it("preserves CTA, hashtags, sections and copyAngle through PostVariation → CanvasPostModel", () => {
    const variation = makeVariation({
      callToAction: "Compartilhe com seu time",
      hashtags: ["#Branding", "#Posicionamento"],
      sections: [
        { id: "s1", icon: "Star", label: "Conexão", description: "Passo um" },
        { id: "s2", icon: "Zap", label: "Autoridade", description: "Passo dois" },
      ],
      copyAngle: { type: "autoridade", label: "Autoridade", badge: "AUTORIDADE", stickerText: "Referência" },
    });

    const model = variationToCanvasModel(variation, 0, "prompt");
    expect(model.callToAction).toBe("Compartilhe com seu time");
    expect(model.hashtags).toEqual(["#Branding", "#Posicionamento"]);
    expect(model.sections).toHaveLength(2);
    expect(model.copyAngle?.type).toBe("autoridade");
    expect(model.modelVersion).toBe(2);
  });

  it("does not discard sections even when body is also present", () => {
    const variation = makeVariation({
      body: "Um corpo presente",
      sections: [{ id: "s1", label: "Item", description: "Detalhe" }],
    });
    const model = variationToCanvasModel(variation, 0, "prompt");
    expect(model.subtext).toContain("Um corpo presente");
    expect(model.sections).toHaveLength(1);
  });
});