/**
 * CR-002 — Medidor tipográfico do browser (canvas 2D).
 *
 * Política vinculante de edição: a re-resolução de tipografia após edição de
 * headline/body/proporção acontece NO CLIENTE, medida com a fonte REALMENTE
 * carregada no browser, pelo mesmo algoritmo canônico (`shared/typography/`):
 * mesma quebra gulosa (`shared/typography/wrap.ts`), mesma busca de encaixe
 * (`fit.ts`), mesmos pisos/tetos (`constants.ts`). A equivalência com a fonte
 * medida no servidor (fontkit) é provada por teste com canvas nativo
 * (`shared/typography/equivalence.test.ts`), dentro da margem do harness.
 *
 * É registrado no bootstrap do cliente (`client/src/main.tsx`) via
 * `setTypographyMeasurer(browserMeasurer)` — sem ele, a re-resolução de edição
 * falharia estruturalmente (`missing-font`) e o renderer cairia silenciosamente
 * no autofit legado, exatamente o bug que este CR fecha.
 */

import { MissingFontError, type Measurer, type TextStyle, type WrapResult } from "@shared/typography/types";
import { greedyWrap, greedyLinesHeight } from "@shared/typography/wrap";

let sharedContext: CanvasRenderingContext2D | null | undefined;

function context2d(): CanvasRenderingContext2D | null {
  if (sharedContext !== undefined) return sharedContext;
  try {
    sharedContext = document.createElement("canvas").getContext("2d");
  } catch {
    sharedContext = null;
  }
  return sharedContext;
}

function fontOf(style: TextStyle): string {
  // `TextStyle` (contrato do medidor) não carrega peso; o peso entra como
  // parte do texto medido apenas quando o resolvedor o usa — aqui medimos com
  // o peso regular, mesma convenção do harness (`fitText`).
  return `${style.fontSize}px ${style.fontFamily}`;
}

function widthOf(text: string, style: TextStyle): number {
  const ctx = context2d();
  if (!ctx) {
    throw new MissingFontError(style.fontFamily, "canvas 2D indisponível no ambiente");
  }
  ctx.font = fontOf(style);
  return ctx.measureText(text).width;
}

/**
 * `supports(family)` é verdadeiro quando o canvas existe E a família está
 * carregada (`document.fonts.check`). Se a fonte ainda não carregou, a
 * re-resolução falha estruturadamente (missing-font) em vez de medir com a
 * fonte errada — o renderer mantém o último snapshot válido até a fonte
 * existir, sem cortar texto.
 */
function fontIsReady(family: string): boolean {
  try {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts || typeof fonts.check !== "function") return true;
    return fonts.check(`16px ${family}`);
  } catch {
    return true;
  }
}

export const browserMeasurer: Measurer = {
  id: "browser-canvas",

  supports(fontFamily: string): boolean {
    if (typeof document === "undefined" || context2d() === null) return false;
    return fontIsReady(fontFamily);
  },

  measureWidth(text: string, style: TextStyle): number {
    return widthOf(text, style);
  },

  wrapText(text: string, style: TextStyle, maxWidth: number): WrapResult {
    return greedyWrap(text, widthOf, style, maxWidth);
  },

  linesHeight(lineCount: number, style: TextStyle): number {
    return greedyLinesHeight(lineCount, style);
  },
};
