/**
 * Linha de base do harness: reproduz o comportamento ATUAL (pré-SPEC-001)
 * do renderer, para provar a régua de antes/depois.
 *
 * O algoritmo canônico sob teste (busca por corpo medido, D3) foi promovido
 * para `shared/typography/fit.ts` — server, client e harness importam dali.
 * Este arquivo mantém só `baselineHeadline`, que replica a fórmula de
 * `client/src/hooks/useTextAutoFit.ts` (contagem de caracteres + clamp) para
 * comparação lado a lado. Morre junto com aquele hook no passo 9 da SPEC-001.
 */

import type { Measurer, TextStyle } from "../shared/typography/types";

export type { FitRequest, FitResult } from "../shared/typography/fit";
export { fitText } from "../shared/typography/fit";

export interface BaselineRequest {
  text: string;
  maxWidth: number;
  style: Omit<TextStyle, "fontSize">;
  aspectRatio: "1:1" | "5:6" | "9:16";
  /** `headlineFontSize` da família. 1 quando não declarado. */
  familyMultiplier: number;
  /** Comprimento do corpo, que entra na fórmula do body — não usado no título. */
  hasStructuredContent?: boolean;
}

export interface BaselineResult {
  fontSizePx: number;
  lineClamp: number | undefined;
  linesNeeded: number;
  linesVisible: number;
  truncated: number;
}

const REM_PX = 16;

export function baselineHeadline(
  request: BaselineRequest,
  measurer: Measurer,
): BaselineResult {
  const len = request.text.length;
  const structured = request.hasStructuredContent ?? false;

  // Constantes copiadas de useTextAutoFit.ts. Se aquele arquivo mudar antes da
  // remoção (passo 9), esta função mente — por isso ela morre junto com ele.
  let base: number;
  let min: number;
  let threshold: number;
  let clamp: number | undefined;
  const decay = 0.014;

  if (request.aspectRatio === "9:16") {
    base = structured ? 1.3 : 1.45;
    min = 1.0;
    threshold = 30;
    clamp = undefined; // story não trunca
  } else if (request.aspectRatio === "5:6") {
    base = structured ? 1.38 : 1.55;
    min = 1.05;
    threshold = 35;
    clamp = len > 60 ? 3 : 2;
  } else {
    base = structured ? 1.38 : 1.65;
    min = 1.1;
    threshold = 40;
    clamp = len > 60 ? 3 : 2;
  }

  const excess = Math.max(0, len - threshold);
  const rem = Math.max(min, base - excess * decay);
  const fontSizePx = rem * REM_PX * request.familyMultiplier;

  const style: TextStyle = { ...request.style, fontSize: fontSizePx };
  const wrapped = measurer.wrapText(request.text, style, request.maxWidth);
  const linesNeeded = wrapped.lines.length;
  const linesVisible = clamp === undefined ? linesNeeded : Math.min(clamp, linesNeeded);

  return {
    fontSizePx,
    lineClamp: clamp,
    linesNeeded,
    linesVisible,
    truncated: Math.max(0, linesNeeded - linesVisible),
  };
}
