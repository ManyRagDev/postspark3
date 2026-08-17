import { describe, expect, it } from "vitest";
import { directCreative } from "./directCreative";
import { FAMILIES } from "./families";
import type { PostVariation } from "../postspark";

function withSectionsVariation(): PostVariation {
  return {
    id: "probe-sections",
    headline: "Migrar de Windows para Linux sem perder produtividade",
    body: "Dúvidas comuns e como contorná-las no dia a dia",
    caption: "Legenda longa o bastante para não acionar fallback determinístico nenhum aqui.",
    callToAction: "Saiba mais",
    imagePrompt: "linux desktop",
    platform: "instagram",
    postMode: "static",
    hashtags: [],
    template: "feature-grid",
    sections: [
      { id: "section-1", label: "Drivers", description: "Compatibilidade e alternativas" },
      { id: "section-2", label: "Ferramentas", description: "Substitutos e coexistência" },
      { id: "section-3", label: "Curva de aprendizado", description: "Checklist e treino" },
    ],
    aspectRatio: "1:1",
    layout: "centered",
    backgroundColor: "#111111",
    textColor: "#ffffff",
    accentColor: "#ff5f1f",
    copyAngle: { type: "dor", label: "Dor", badge: "Pergunta", stickerText: "Novo" },
  } as unknown as PostVariation;
}

describe("directCreative — gate simétrico de seções", () => {
  it("nunca escolhe uma família sem fit.needsSections quando a variação tem seções", () => {
    const variation = withSectionsVariation();
    for (let seed = 0; seed < 50; seed += 1) {
      const direction = directCreative(variation, null, seed);
      const family = FAMILIES.find((f) => f.id === direction.familyId)!;
      expect(family.fit.needsSections).toBe(true);
    }
  });

  it("não lança e ainda retorna uma família quando o pool de famílias com seções está esgotado", () => {
    const variation = withSectionsVariation();
    expect(() =>
      directCreative(variation, null, 1, { excludeFamilyIds: ["versus", "mosaic-grid"] }),
    ).not.toThrow();
    const direction = directCreative(variation, null, 1, {
      excludeFamilyIds: ["versus", "mosaic-grid"],
    });
    expect(FAMILIES.some((f) => f.id === direction.familyId)).toBe(true);
  });
});
