import { describe, expect, it } from "vitest";
import { FAMILIES } from "./families";
import { composeVariation } from "./compose";
import { createPostVisualSnapshot } from "../variationSnapshot";
import { DEFAULT_DESIGN_TOKENS, type AspectRatio, type PostVariation } from "../postspark";

const RATIOS: AspectRatio[] = ["1:1", "5:6", "9:16"];

// Copy nos limites do contrato de `copyRules` (headline 60, body 100).
const COPY = [
  { headline: "Café Premium", body: "Descubra o melhor café artesanal da cidade" },
  {
    headline: "Pare de perder clientes logo na primeira conversa hoje",
    body: "Um roteiro simples muda a taxa de conversão da sua equipe inteira agora",
  },
];

const SECTIONS = [
  { id: "section-1", label: "Drivers", description: "Compatibilidade e alternativas" },
  { id: "section-2", label: "Ferramentas", description: "Substitutos e coexistência" },
  { id: "section-3", label: "Curva de aprendizado", description: "Checklist e treino progressivo" },
];

function candidate(
  familyId: string,
  ratio: AspectRatio,
  index: number,
  withSections: boolean,
): PostVariation {
  return {
    id: `fam-${familyId}-${ratio}-${index}-${withSections ? "sections" : "plain"}`,
    ...COPY[index],
    caption: "Legenda com tamanho suficiente para não acionar o fallback determinístico.",
    callToAction: "Saiba mais",
    platform: "instagram",
    postMode: "static",
    hashtags: [],
    template: withSections ? "feature-grid" : "simple",
    sections: withSections ? SECTIONS : undefined,
    aspectRatio: ratio,
    layout: "centered",
    backgroundColor: "#111111",
    textColor: "#ffffff",
    accentColor: "#ff5f1f",
    copyAngle: { type: "dor", label: "Dor", badge: "Foco", stickerText: "Novo" },
    creativeDirection: {
      familyId,
      paletteId: "brand",
      paletteInverted: false,
      seed: 1,
      axes: FAMILIES.find((f) => f.id === familyId)!.axes,
      source: "classifier",
    },
  } as unknown as PostVariation;
}

describe("geometria das famílias criativas", () => {
  for (const family of FAMILIES) {
    for (const ratio of RATIOS) {
      for (let index = 0; index < COPY.length; index += 1) {
        for (const withSections of [false, true]) {
          it(`${family.id} @ ${ratio} #${index} ${withSections ? "(com seções)" : "(sem seções)"}: geometria completa e sem sobreposição`, () => {
            const composed = composeVariation(
              candidate(family.id, ratio, index, withSections),
              DEFAULT_DESIGN_TOKENS as never,
            );
            const snapshot = createPostVisualSnapshot(composed, ratio);

            // 1. Nunca misturar headline absoluto com body em fluxo.
            const structured =
              (snapshot.template ?? "simple") !== "simple" && (snapshot.sections?.length ?? 0) > 0;
            if (!structured && snapshot.layoutSettings.headline.freePosition) {
              const hasBodyText = String(snapshot.body ?? "").trim().length > 0;
              if (hasBodyText) {
                expect(snapshot.layoutSettings.body.freePosition).toBeDefined();
              }
            }

            // 2. Nenhuma sobreposição headline/body/seções sobreviveu ao fallback.
            const issueTypes = (snapshot.visualFitIssues ?? []).map((issue) => issue.type);
            expect(issueTypes).not.toContain("headline_body_overlap");
            expect(issueTypes).not.toContain("section_overlap");
            expect(issueTypes).not.toContain("section_missing_geometry");

            // 3. Tipografia resolvida (exige as fontes da Fase 1 no disco).
            expect(snapshot.typographyResolutionError).toBeUndefined();
            expect(snapshot.resolvedTypography).toBeDefined();

            if (withSections) {
              if (family.fit.needsSections) {
                // Famílias desenhadas para seções (versus, mosaic-grid) devem
                // preservar template/sections e declarar geometria completa.
                expect(composed.template).not.toBe("simple");
                expect(composed.sections?.length).toBeGreaterThan(0);
              } else {
                // Rede de segurança (compose.ts): família sem suporte a
                // seções demove para simple em vez de arriscar colisão.
                expect(composed.template).toBe("simple");
                expect(composed.sections ?? []).toHaveLength(0);
              }
            }

            // 4. Preservação: geometria correta nunca é remexida em passadas
            // repetidas do pipeline (pedido explícito do usuário).
            const pass1 = JSON.stringify(snapshot.layoutSettings);
            const snapshot2 = createPostVisualSnapshot(snapshot, ratio);
            const pass2 = JSON.stringify(snapshot2.layoutSettings);
            const snapshot3 = createPostVisualSnapshot(snapshot2, ratio);
            const pass3 = JSON.stringify(snapshot3.layoutSettings);
            expect(pass2).toBe(pass1);
            expect(pass3).toBe(pass2);
          });
        }
      }
    }
  }
});

/**
 * Bug de proporção (2026-08): geometria calculada para UMA proporção de
 * composição sobrevivia congelada quando o post era visto em outra — headline
 * calibrado para 1:1 sendo reciclado num canvas 9:16. O bloco acima nunca
 * exercitou esse caminho: sempre compõe e visualiza na MESMA proporção.
 * Este bloco prova o caminho que o HoloDeck realmente usa ao trocar de
 * proporção (`createPostVisualSnapshot(variation, outraProporcao, { preserveVisualIdentity: true })`).
 */
describe("geometria entre proporções (compor em X, ver em Y)", () => {
  for (const family of FAMILIES) {
    for (const compRatio of RATIOS) {
      const composed = composeVariation(
        candidate(family.id, compRatio, 0, false),
        DEFAULT_DESIGN_TOKENS as never,
      );
      for (const viewRatio of RATIOS) {
        it(`${family.id}: composto em ${compRatio}, visto em ${viewRatio}`, () => {
          const viewed = createPostVisualSnapshot(composed, viewRatio, { preserveVisualIdentity: true });
          const freshSnapshot = createPostVisualSnapshot(
            composeVariation(candidate(family.id, viewRatio, 0, false), DEFAULT_DESIGN_TOKENS as never),
            viewRatio,
          );

          // A geometria vista em Y tem que bater com uma composição NATIVA em
          // Y — não pode carregar resquício da proporção de composição.
          expect(viewed.layoutSettings.headline.height).toBeCloseTo(
            freshSnapshot.layoutSettings.headline.height!,
            5,
          );
          if (freshSnapshot.layoutSettings.body.freePosition) {
            expect(viewed.layoutSettings.body.height).toBeCloseTo(
              freshSnapshot.layoutSettings.body.height!,
              5,
            );
          }

          const issueTypes = (viewed.visualFitIssues ?? []).map((issue) => issue.type);
          expect(issueTypes).not.toContain("headline_body_overlap");
          expect(issueTypes).not.toContain("section_overlap");
          expect(issueTypes).not.toContain("outside_safe_area");
          expect(viewed.typographyResolutionError).toBeUndefined();
        });
      }
    }
  }
});

describe("geometria de seções entre proporções (versus, mosaic-grid)", () => {
  for (const familyId of ["versus", "mosaic-grid"]) {
    for (const compRatio of RATIOS) {
      const composed = composeVariation(
        candidate(familyId, compRatio, 0, true),
        DEFAULT_DESIGN_TOKENS as never,
      );
      for (const viewRatio of RATIOS) {
        it(`${familyId}: composto em ${compRatio}, visto em ${viewRatio} (com seções)`, () => {
          const viewed = createPostVisualSnapshot(composed, viewRatio, { preserveVisualIdentity: true });
          const freshSnapshot = createPostVisualSnapshot(
            composeVariation(candidate(familyId, viewRatio, 0, true), DEFAULT_DESIGN_TOKENS as never),
            viewRatio,
          );

          expect(viewed.layoutSettings.sectionLayouts?.["section-1"]?.height).toBeCloseTo(
            freshSnapshot.layoutSettings.sectionLayouts!["section-1"]!.height!,
            5,
          );

          const issueTypes = (viewed.visualFitIssues ?? []).map((issue) => issue.type);
          expect(issueTypes).not.toContain("section_overlap");
          expect(issueTypes).not.toContain("section_missing_geometry");
          expect(issueTypes).not.toContain("outside_safe_area");
        });
      }
    }
  }
});
