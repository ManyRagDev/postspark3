import { describe, expect, it } from "vitest";
import type { PostVariation } from "@shared/postspark";
import { validateVariationSet } from "./generationValidation";

function variation(
  index: number,
  patch: Partial<PostVariation> = {},
): PostVariation {
  return {
    id: `variation-${index}`,
    headline: `Headline distinta ${index}`,
    body: `Mensagem central por uma perspectiva ${index}`,
    caption: `Legenda original para a abordagem ${index}`,
    hashtags: [`tema${index}`],
    callToAction: `Acao ${index}`,
    tone: `Tom ${index}`,
    platform: "instagram",
    imagePrompt: `Visual concept ${index}`,
    backgroundColor: index === 1 ? "#101828" : index === 2 ? "#3B0764" : "#422006",
    textColor: "#FFFFFF",
    accentColor: index === 1 ? "#12B76A" : index === 2 ? "#C084FC" : "#F59E0B",
    layout: index === 2 ? "left-aligned" : index === 3 ? "split" : "centered",
    copyAngle: {
      type: index === 1 ? "autoridade" : index === 2 ? "beneficio" : "storytelling",
      label: `Angulo ${index}`,
      badge: `Badge ${index}`,
      stickerText: `Impacto ${index}`,
    },
    ...patch,
  };
}

describe("validateVariationSet", () => {
  it("accepts exactly three complete and distinct variations", () => {
    expect(
      validateVariationSet([variation(1), variation(2), variation(3)], "static"),
    ).toEqual({ valid: true, errors: [] });
  });

  it("rejects partial sets", () => {
    const result = validateVariationSet([variation(1)], "static");
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("expected 3");
  });

  it("rejects repeated variations", () => {
    const repeated = variation(1);
    const result = validateVariationSet(
      [repeated, { ...repeated, id: "variation-2" }, variation(3)],
      "static",
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("variations are not sufficiently distinct");
  });

  it("rejects carousels without five slides per variation", () => {
    const result = validateVariationSet(
      [variation(1), variation(2), variation(3)],
      "carousel",
    );
    expect(result.valid).toBe(false);
    expect(result.errors.filter((error) => error.includes("5 slides"))).toHaveLength(3);
  });

  it("accepts exactly three concise sections for structured static posts", () => {
    const structured = (index: number) =>
      variation(index, {
        template: "feature-grid",
        sections: [
          { icon: "Star", label: "Rapido", description: "Configuracao simples", number: 1 },
          { icon: "Shield", label: "Seguro", description: "Atualizacoes confiaveis", number: 2 },
          { icon: "Zap", label: "Leve", description: "Bom desempenho diario", number: 3 },
        ],
      });

    expect(
      validateVariationSet([structured(1), structured(2), structured(3)], "static"),
    ).toEqual({ valid: true, errors: [] });
  });

  it("rejects excessive structured content that cannot fit the post", () => {
    const result = validateVariationSet(
      [
        variation(1, {
          template: "numbered-list",
          sections: Array.from({ length: 5 }, (_, index) => ({
            icon: "Star",
            label: `Item ${index + 1}`,
            description: "Descricao longa demais",
            number: index + 1,
          })),
        }),
        variation(2),
        variation(3),
      ],
      "static",
    );

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("exactly 3 short sections");
  });

  it("rejects structured static posts whose headline promises a different item count", () => {
    const result = validateVariationSet(
      [
        variation(1, {
          headline: "Antes de comprar: 7...",
          template: "feature-grid",
          sections: [
            { icon: "Star", label: "Rapido", description: "Configuracao simples", number: 1 },
            { icon: "Shield", label: "Seguro", description: "Atualizacoes confiaveis", number: 2 },
            { icon: "Zap", label: "Leve", description: "Bom desempenho diario", number: 3 },
          ],
        }),
        variation(2),
        variation(3),
      ],
      "static",
    );

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("different item count");
  });
});
