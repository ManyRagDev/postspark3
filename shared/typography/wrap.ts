/**
 * Quebra gulosa por palavra — o MESMO algoritmo para todos os medidores
 * (CR-002). Antes, cada medidor reimplementava o wrap; agora fontkit
 * (servidor/harness) e o medidor browser (canvas) delegam para cá, garantindo
 * que "fonte medida" e "fonte carregada" produzam as MESMAS linhas quando as
 * larguras coincidem.
 */

import type { Measurer, TextStyle, WrapResult } from "./types";

export function greedyWrap(
  text: string,
  widthOf: (value: string, style: TextStyle) => number,
  style: TextStyle,
  maxWidth: number,
): WrapResult {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  const overflowingWords: string[] = [];
  let current = "";

  for (const word of words) {
    if (widthOf(word, style) > maxWidth) overflowingWords.push(word);
    const candidate = current ? `${current} ${word}` : word;
    if (current && widthOf(candidate, style) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  const widestLine = lines.reduce((max, line) => Math.max(max, widthOf(line, style)), 0);
  return { lines, widestLine, overflowingWords };
}

export function greedyLinesHeight(lineCount: number, style: TextStyle): number {
  return lineCount * style.fontSize * style.lineHeight;
}

export type WrapMeasurer = Pick<Measurer, "measureWidth" | "wrapText" | "linesHeight">;
