import { describe, expect, it } from "vitest";
import type { AdvancedLayoutSettings } from "../postspark";
import { DEFAULT_LAYOUT_SETTINGS } from "../postspark";
import { resolveTypography, TypographyResolutionError } from "./resolve";
import { fontkitMeasurer } from "./fontkitMeasurer";

function layoutWith(overrides: Partial<AdvancedLayoutSettings>): AdvancedLayoutSettings {
  return { ...DEFAULT_LAYOUT_SETTINGS, ...overrides };
}

describe("resolveTypography", () => {
  it("resolves headline and body with explicit geometry", () => {
    const layoutSettings = layoutWith({
      headline: {
        position: "top-left",
        textAlign: "left",
        freePosition: { x: 50, y: 30 },
        width: 84,
        height: 22,
      },
      body: {
        position: "top-left",
        textAlign: "left",
        freePosition: { x: 50, y: 60 },
        width: 84,
        height: 30,
      },
    });

    const result = resolveTypography({
      headline: "Como reduzir o custo de aquisição em 30 dias",
      body: "Um guia prático para times de marketing que precisam provar resultado rápido.",
      aspectRatio: "1:1",
      layoutSettings,
      headlineFontFamily: "Inter",
      bodyFontFamily: "Inter",
    });

    expect(result.engineVersion).toBeTruthy();
    expect(result.headline.fontSizePx).toBeGreaterThan(0);
    expect(result.headline.lines.length).toBeGreaterThan(0);
    expect(result.headline.box.width).toBeCloseTo((84 / 100) * 360, 5);
    expect(result.body?.fontSizePx).toBeGreaterThan(0);
  });

  it("throws missing-geometry when the slot has no freePosition/height", () => {
    const layoutSettings = layoutWith({}); // headline stays symbolic (bottom-left, no freePosition)

    expect(() =>
      resolveTypography({
        headline: "Título qualquer",
        aspectRatio: "1:1",
        layoutSettings,
        headlineFontFamily: "Inter",
      }),
    ).toThrowError(TypographyResolutionError);
  });

  it("throws missing-font when the family is not registered", () => {
    const layoutSettings = layoutWith({
      headline: {
        position: "top-left",
        textAlign: "left",
        freePosition: { x: 50, y: 30 },
        width: 84,
        height: 22,
      },
    });

    expect(() =>
      resolveTypography({
        headline: "Título qualquer",
        aspectRatio: "1:1",
        layoutSettings,
        headlineFontFamily: "Uma Fonte Que Nao Existe",
      }),
    ).toThrowError(/ausente do registro/);
  });

  it("throws below-floor when copy cannot fit even at the legibility floor", () => {
    const layoutSettings = layoutWith({
      headline: {
        position: "top-left",
        textAlign: "left",
        freePosition: { x: 50, y: 30 },
        width: 60, // largo o bastante para as palavras caberem...
        height: 3, // ...mas raso demais para qualquer linha, mesmo no piso
      },
    });

    let error: unknown;
    try {
      resolveTypography({
        headline:
          "Um título muito longo que certamente não cabe numa caixa rasa mesmo no corpo mínimo de legibilidade",
        aspectRatio: "1:1",
        layoutSettings,
        headlineFontFamily: "Inter",
      });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(TypographyResolutionError);
    expect((error as TypographyResolutionError).reason).toBe("below-floor");
  });

  it("skips body resolution when the family has no body slot declared", () => {
    const layoutSettings = layoutWith({
      headline: {
        position: "top-left",
        textAlign: "left",
        freePosition: { x: 50, y: 45 },
        width: 80,
        height: 20,
      },
    });

    const result = resolveTypography({
      headline: "Título sem corpo",
      body: "Este texto de corpo não deveria ser resolvido — a família não declara slot livre para body.",
      aspectRatio: "1:1",
      layoutSettings,
      headlineFontFamily: "Inter",
    });

    expect(result.body).toBeUndefined();
  });

  // CR-008: o browser renderiza a fonte CARREGADA, com divergência medida de
  // até 3% contra o arquivo do registro. Nenhuma linha resolvida pode exceder
  // o `maxWidth` do CSS mesmo com +3% — senão `overflowWrap: break-word`
  // adiciona linha, o bloco cresce e sobrepõe o elemento seguinte.
  it("CR-008: nenhuma linha resolvida estoura o maxWidth mesmo com +3% de divergência de fonte", () => {
    const samples: Array<{ text: string; width: number; height: number }> = [
      { text: "Como reduzir o custo de aquisição em 30 dias", width: 84, height: 30 },
      { text: "Dicas práticas de organização pessoal para quem trabalha de casa", width: 80, height: 41 },
      { text: "A maioria dos times corrige o sintoma e ignora a causa. Comece pelo diagnóstico.", width: 70, height: 40 },
      { text: "Previsível, consistente, escalável — o diagnóstico silencioso que muda o jogo", width: 90, height: 40 },
    ];

    for (const sample of samples) {
      const layoutSettings = layoutWith({
        headline: {
          position: "top-left",
          textAlign: "left",
          freePosition: { x: 50, y: 30 },
          width: sample.width,
          height: sample.height,
        },
      });
      const result = resolveTypography({
        headline: sample.text,
        aspectRatio: "1:1",
        layoutSettings,
        headlineFontFamily: "Inter",
      });
      const maxWidth = (sample.width / 100) * 360;
      for (const line of result.headline.lines) {
        const measured = fontkitMeasurer.measureWidth(line, {
          fontFamily: "Inter",
          fontSize: result.headline.fontSizePx,
          lineHeight: 1.15,
          textTransform: "none",
        });
        // +3% de divergência de fonte carregada ainda precisa caber.
        expect(measured * 1.03, `linha "${line.slice(0, 28)}…" a ${result.headline.fontSizePx}px`).toBeLessThanOrEqual(maxWidth + 0.5);
      }
    }
  });
});
