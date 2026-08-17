/**
 * Núcleo canônico de encaixe tipográfico (SPEC-001, docs/reforma/SPEC-001).
 *
 * Contrato: dado um slot (largura × altura) e um texto, devolve o MAIOR corpo
 * de fonte em que o texto quebrado cabe inteiro, medido com a fonte real via
 * `Measurer`. Nunca corta texto.
 *
 * Se nem no piso de legibilidade couber, devolve `fitsAboveFloor: false` — o
 * caso que a política de última instância do produtor do snapshot precisa
 * tratar como falha estruturada, nunca como corte silencioso (line-clamp).
 *
 * Promovido de `harness/fit.ts` para `shared/` porque server, client e
 * harness precisam da mesma decisão determinística — ver comparação com
 * `postspark-next/packages/design-system/src/resolve.ts` no pedido de
 * conferência da SPEC-001: o resolver do Next faz hard-break silencioso de
 * palavra que não cabe, o que contraria a exigência de falha explícita desta
 * spec; por isso este núcleo, não aquele, foi promovido.
 */

import type { Measurer, TextStyle } from "./types";

export interface FitRequest {
  text: string;
  /** Largura do slot em px. */
  maxWidth: number;
  /** Altura do slot em px. */
  maxHeight: number;
  /** Estilo base. `fontSize` é ignorado — é o que a busca resolve. */
  style: Omit<TextStyle, "fontSize">;
  /** Maior corpo aceitável em px. */
  ceilingPx: number;
  /** Piso de legibilidade em px. */
  floorPx: number;
  /** Precisão da busca em px. Abaixo disso não vale iterar. */
  precisionPx?: number;
}

export interface FitResult {
  /** Corpo resolvido em px. É `floorPx` quando nem o piso coube. */
  fontSizePx: number;
  lines: string[];
  lineCount: number;
  /** Altura ocupada em px no corpo resolvido. */
  heightPx: number;
  /** Cabe inteiro em algum corpo ≥ piso? */
  fitsAboveFloor: boolean;
  /** Cabe inteiro no piso, ignorando estética? */
  fitsAtFloor: boolean;
  /** Palavras que não cabem na largura nem no corpo resolvido. */
  overflowingWords: string[];
  /** Iterações da busca binária, para diagnóstico. */
  iterations: number;
}

function heightAt(
  fontSizePx: number,
  request: FitRequest,
  measurer: Measurer,
): { height: number; lines: string[]; overflowingWords: string[] } {
  const style: TextStyle = { ...request.style, fontSize: fontSizePx };
  const wrapped = measurer.wrapText(request.text, style, request.maxWidth);
  return {
    height: measurer.linesHeight(wrapped.lines.length, style),
    lines: wrapped.lines,
    overflowingWords: wrapped.overflowingWords,
  };
}

export function fitText(request: FitRequest, measurer: Measurer): FitResult {
  const precision = request.precisionPx ?? 0.5;

  // Caso trivial: cabe já no teto. Evita a busca inteira.
  const atCeiling = heightAt(request.ceilingPx, request, measurer);
  if (atCeiling.height <= request.maxHeight && atCeiling.overflowingWords.length === 0) {
    return {
      fontSizePx: request.ceilingPx,
      lines: atCeiling.lines,
      lineCount: atCeiling.lines.length,
      heightPx: atCeiling.height,
      fitsAboveFloor: true,
      fitsAtFloor: true,
      overflowingWords: [],
      iterations: 1,
    };
  }

  // Nem no piso cabe: devolve o piso e marca a falha. Não corta texto.
  const atFloor = heightAt(request.floorPx, request, measurer);
  const fitsAtFloor =
    atFloor.height <= request.maxHeight && atFloor.overflowingWords.length === 0;
  if (!fitsAtFloor) {
    return {
      fontSizePx: request.floorPx,
      lines: atFloor.lines,
      lineCount: atFloor.lines.length,
      heightPx: atFloor.height,
      fitsAboveFloor: false,
      fitsAtFloor: false,
      overflowingWords: atFloor.overflowingWords,
      iterations: 2,
    };
  }

  // Busca binária entre piso (cabe) e teto (não cabe).
  let low = request.floorPx;
  let high = request.ceilingPx;
  let best = atFloor;
  let bestSize = request.floorPx;
  let iterations = 2;

  while (high - low > precision) {
    const mid = (low + high) / 2;
    const probe = heightAt(mid, request, measurer);
    iterations += 1;
    if (probe.height <= request.maxHeight && probe.overflowingWords.length === 0) {
      best = probe;
      bestSize = mid;
      low = mid;
    } else {
      high = mid;
    }
  }

  return {
    fontSizePx: bestSize,
    lines: best.lines,
    lineCount: best.lines.length,
    heightPx: best.height,
    fitsAboveFloor: true,
    fitsAtFloor: true,
    overflowingWords: [],
    iterations,
  };
}
