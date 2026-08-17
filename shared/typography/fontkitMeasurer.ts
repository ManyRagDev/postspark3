/**
 * Implementação de referência do `Measurer`, sobre fontkit.
 *
 * Determinística e sem browser: roda no servidor, em vitest e em CI. É o
 * núcleo canônico promovido pela SPEC-001 (docs/reforma/SPEC-001) — server,
 * client (via snapshot já resolvido) e harness consomem esta mesma medição.
 * A implementação de DOM (quando existir) precisa concordar com esta dentro
 * da margem declarada em `harness/thresholds.ts`.
 */

import * as fontkit from "fontkit";
import { pathFor } from "./fonts/registry";
import { MissingFontError, type Measurer, type TextStyle, type WrapResult } from "./types";
import { greedyWrap, greedyLinesHeight } from "./wrap";

type AnyFont = {
  unitsPerEm: number;
  layout: (text: string) => { advanceWidth: number };
  getVariation?: (axes: Record<string, number>) => AnyFont;
  variationAxes?: Record<string, unknown>;
};

const cache = new Map<string, AnyFont>();

function loadFont(style: TextStyle): AnyFont {
  const axisKey = style.axes
    ? Object.entries(style.axes)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join(",")
    : "";
  const key = `${style.fontFamily}|${axisKey}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const file = pathFor(style.fontFamily);
  if (!file) {
    throw new MissingFontError(
      style.fontFamily,
      `Coloque o .ttf variável em harness/fonts/files/ e registre em harness/fonts/registry.ts.`,
    );
  }

  let font = fontkit.openSync(file) as unknown as AnyFont;
  // Coleções (.ttc) devolvem um objeto com `fonts`; não usamos, mas falhar aqui
  // é melhor que medir a fonte errada silenciosamente.
  if (typeof font.layout !== "function") {
    throw new MissingFontError(
      style.fontFamily,
      `O arquivo em ${file} não é uma fonte simples utilizável (talvez seja uma coleção .ttc).`,
    );
  }

  if (style.axes && font.getVariation && font.variationAxes) {
    const known = Object.keys(font.variationAxes);
    const applicable: Record<string, number> = {};
    for (const [axis, value] of Object.entries(style.axes)) {
      if (known.includes(axis)) applicable[axis] = value;
    }
    if (Object.keys(applicable).length > 0) {
      font = font.getVariation(applicable);
    }
  }

  cache.set(key, font);
  return font;
}

function applyTransform(text: string, style: TextStyle): string {
  return style.textTransform === "uppercase" ? text.toLocaleUpperCase("pt-BR") : text;
}

function widthOf(text: string, style: TextStyle): number {
  if (text.length === 0) return 0;
  const font = loadFont(style);
  const run = font.layout(applyTransform(text, style));
  return (run.advanceWidth / font.unitsPerEm) * style.fontSize;
}

export const fontkitMeasurer: Measurer = {
  id: "fontkit",

  supports(fontFamily: string): boolean {
    return pathFor(fontFamily) !== undefined;
  },

  measureWidth(text: string, style: TextStyle): number {
    return widthOf(text, style);
  },

  /**
   * Quebra gulosa por palavra — delegada a `shared/typography/wrap.ts` para
   * que o medidor browser (canvas) produza as MESMAS linhas (CR-002). Não
   * implementa hifenização nem quebra dentro de palavra: uma palavra que não
   * cabe é reportada em `overflowingWords`.
   */
  wrapText(text: string, style: TextStyle, maxWidth: number): WrapResult {
    return greedyWrap(text, widthOf, style, maxWidth);
  },

  linesHeight(lineCount: number, style: TextStyle): number {
    return greedyLinesHeight(lineCount, style);
  },
};
