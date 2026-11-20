import { describe, expect, it } from "vitest";
import { editorialContextV9 } from "./editorialContextV9";
import { mediaPostContext } from "./proposalGraph";
import { resolveReviewExecutionConfigV10, reviewContractHashV10, assertReviewExecutionConfigV10 } from "./reviewExecutionConfigV10";
import { resolveGenerationModelConfig } from "../generationModel";
import { familyVisualQuery } from "../../designCatalog/familyRetrieval";

describe("Phase 1 — art direction is guidance, never factual user content", () => {
  it("excludes project palette hex and font names from user factual sources and covers them in guidanceRanges", () => {
    const ctx = editorialContextV9({
      prompt: "Apresente o Sorteador Relâmpago em 2 minutos.",
      platform: "instagram",
      postMode: "static",
      projectSnapshot: {
        version: 2,
        name: "ReUNE",
        niche: "Eventos",
        structuredData: {},
        visualPreferences: {
          colors: ["#FFFDF5", "#F05728"],
          fonts: ["Space Grotesk", "Space Mono"],
          personality: ["Neubrutalismo"],
          composition: "Editorial",
        },
      },
      sourceReferences: [
        {
          id: "context-main",
          kind: "text",
          purpose: "content",
          origin: "context",
          facts: "Sorteio grátis no navegador em 2 minutos.",
        },
      ],
    });

    const userSources = ctx.sources.filter(s => s.origin === "user");
    expect(userSources.length).toBe(1);
    expect(userSources[0].text).not.toMatch(/#[0-9A-F]{6}/i);
    expect(userSources[0].text).not.toContain("Space Grotesk");

    const guidanceTexts = ctx.guidanceRanges.map(r => {
      const src = ctx.sources.find(s => s.id === r.sourceId);
      return src ? src.text.slice(r.start, r.end) : "";
    });
    expect(guidanceTexts.some(t => t.includes("#FFFDF5") && t.includes("Space Grotesk"))).toBe(true);

    const guidanceSourceIds = new Set(ctx.guidanceRanges.map(r => r.sourceId));
    const factualSources = ctx.sources.filter(s => !guidanceSourceIds.has(s.id));
    expect(factualSources.some(s => /#[0-9A-F]{6}/i.test(s.text))).toBe(false);
  });

  it("keeps mediaPostContext.originalRequest free of palette hex and font names", () => {
    const genCfg = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    const revCfg = resolveReviewExecutionConfigV10(genCfg.model, genCfg.taskRouting?.copy);
    const result = mediaPostContext(
      {
        runId: "11111111-1111-4111-8111-111111111111",
        proposalId: "p-1",
        slot: 0,
        prompt: "Apresente o Sorteador Relâmpago em 2 minutos.",
        platform: "instagram",
        postMode: "static",
        reviewPolicyVersion: 10,
        reviewExecutionConfig: revCfg,
        generationConfig: genCfg,
      } as any,
      { completeDesign: { family: "acervo82-concept-01" } } as any,
      { values: [{ fieldId: "headline", value: "Sorteie em 2 minutos" }], mediaPrompts: [] } as any,
      "Legenda do post",
    );
    expect(result.originalRequest).toBe("Apresente o Sorteador Relâmpago em 2 minutos.");
    expect(result.originalRequest).not.toMatch(/#[0-9A-F]{6}/i);
    expect(result.originalRequest).not.toContain("Space Grotesk");
  });

  it("preserves visual direction for familyVisualQuery when prompt does not embed tasteInstruction", () => {
    const query = familyVisualQuery(
      { enabled: true, language: "editorial" },
      "Apresente o Sorteador Relâmpago.\nEstilo visual: Neubrutalismo",
      true,
    );
    expect(query).toContain("editorial");
    expect(query).toContain("Neubrutalismo");
  });

  it("keeps reviewContractHashV10 and assertReviewExecutionConfigV10 intact", () => {
    const genCfg = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    const revCfg = resolveReviewExecutionConfigV10(genCfg.model, genCfg.taskRouting?.copy);
    expect(assertReviewExecutionConfigV10(revCfg)).toEqual(revCfg);
    expect(reviewContractHashV10(false, true, 1, 4, false)).toBe(
      "2f7c80e7f68f9085025f9a5602c5bf8a8e50be352c8b02e30e2b36b3115e0b98"
    );
  });
});
