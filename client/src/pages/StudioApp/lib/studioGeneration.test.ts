import { describe, expect, it, vi } from "vitest";
import type { PostVariation } from "@shared/postspark";
import type { CanvasPostModel } from "@/pages/CanvasLab/components/types";
import {
  CatalogMaterializationError,
  materializeCatalogVariations,
  materializeCatalogVariationsDetailed,
} from "./studioGeneration";
import {
  buildExtraFallbackVariations,
  buildInitialFallbackVariations,
  variationToCanvasModel,
  aiGenerationProvenance,
} from "./studioGeneration";

const compilerMocks = vi.hoisted(() => ({
  compileCompleteDesign: vi.fn(),
}));

vi.mock("@/pages/CanvasLab/lib/completeDesignCompiler", () => ({
  compileCompleteDesign: compilerMocks.compileCompleteDesign,
}));

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
  it("reports partial materialization failures with their original slot and a same-result recovery action", async () => {
    const firstPost = { id: "post-1" } as CanvasPostModel;
    compilerMocks.compileCompleteDesign
      .mockResolvedValueOnce(firstPost)
      .mockRejectedValueOnce(new Error("fonte indisponível"));

    const result = await materializeCatalogVariationsDetailed(
      [
        { completeDesignV1: { slot: 1 } as any },
        { completeDesignV1: { slot: 2 } as any },
      ],
      "briefing",
    );

    expect(result.posts).toEqual([firstPost]);
    expect(result.requestedCount).toBe(2);
    expect(result.materializedCount).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({
      index: 1,
      slot: 2,
      message: "fonte indisponível",
      recoveryAction: "retry_same_result",
    });
    expect(result.failures[0].variation.completeDesignV1?.slot).toBe(2);

    compilerMocks.compileCompleteDesign
      .mockResolvedValueOnce(firstPost)
      .mockRejectedValueOnce(new Error("fonte indisponível"));
    await expect(materializeCatalogVariations([
      { completeDesignV1: { slot: 1 } as any },
      { completeDesignV1: { slot: 2 } as any },
    ], "briefing")).resolves.toEqual([firstPost]);
  });

  it("throws a structured error for zero materialized results while the detailed API keeps every failure", async () => {
    compilerMocks.compileCompleteDesign
      .mockRejectedValueOnce(new Error("asset timeout"))
      .mockRejectedValueOnce(new Error("schema mismatch"));
    const variations = [
      { completeDesignV1: { slot: 0 } as any },
      { completeDesignV1: { slot: 1 } as any },
    ];

    await expect(materializeCatalogVariationsDetailed(variations, "briefing")).resolves.toMatchObject({
      posts: [],
      requestedCount: 2,
      materializedCount: 0,
      failures: [
        { index: 0, slot: 0, message: "asset timeout" },
        { index: 1, slot: 1, message: "schema mismatch" },
      ],
    });

    compilerMocks.compileCompleteDesign
      .mockRejectedValueOnce(new Error("asset timeout"))
      .mockRejectedValueOnce(new Error("schema mismatch"));
    await expect(materializeCatalogVariations(variations, "briefing")).rejects.toMatchObject({
      name: "CatalogMaterializationError",
      code: "CATALOG_MATERIALIZATION_FAILED",
      result: { posts: [], failures: [{ slot: 0 }, { slot: 1 }] },
    } satisfies Partial<CatalogMaterializationError>);
  });

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
