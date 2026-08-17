/**
 * Métricas que NÃO precisam de medidor de texto — puras sobre a saída de
 * `composeVariation`. Rodam sem fonte, sem browser, sem dependência.
 *
 * Contraste usa `shared/creative/color.ts` deliberadamente: a decisão 3 de
 * `docs/decisoes-pendentes.md` elege essa como a implementação única, entre as
 * quatro que existem hoje. O harness já obedece à decisão para não virar a
 * quinta cópia.
 */

import { contrastRatio, effectiveBackgroundColor } from "@shared/creative/color";
import { safeAreaMarginsPercent } from "@shared/creative/layoutArchetypes";
import type { PostVariation } from "@shared/postspark";
import type { Slot, SlotExtraction } from "./slots";

export interface BoxPx {
  name: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Caixa em px de um slot, dada a altura de texto já medida. */
export function boxOf(slot: Slot, textHeightPx: number): BoxPx | null {
  if (!slot.declared || Number.isNaN(slot.topPx)) return null;
  const centerXPx = (slot.centerXPercent / 100) * 360;
  return {
    name: slot.name,
    left: centerXPx - slot.widthPx / 2,
    top: slot.topPx,
    right: centerXPx + slot.widthPx / 2,
    bottom: slot.topPx + textHeightPx,
  };
}

/**
 * CR-003 — invasão da safe area do rodapé (margem inferior do canvas, que em
 * 9:16 protege a zona de UI do Instagram Stories). Usa as MESMAS margens do
 * contrato (`safeAreaMarginsPercent` em shared/creative/layoutArchetypes.ts).
 */
export function safeAreaViolations(
  boxes: BoxPx[],
  extraction: SlotExtraction,
  aspectRatio: "1:1" | "5:6" | "9:16",
): Array<{ name: string; overflowPx: number }> {
  const margins = safeAreaMarginsPercent(aspectRatio);
  const bottomLimit = extraction.docHeight * (1 - margins.bottom / 100);
  const violations: Array<{ name: string; overflowPx: number }> = [];
  for (const box of boxes) {
    const overflowPx = box.bottom - bottomLimit;
    if (overflowPx > 0.5) violations.push({ name: box.name, overflowPx: Math.round(overflowPx * 10) / 10 });
  }
  return violations;
}

export interface OverlapPair {
  a: string;
  b: string;
  /** Sobreposição vertical em px. Só conta quando há interseção horizontal. */
  verticalPx: number;
}

export function overlaps(boxes: BoxPx[]): OverlapPair[] {
  const found: OverlapPair[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const horizontal = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      if (horizontal <= 0) continue;
      const vertical = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (vertical > 0) found.push({ a: a.name, b: b.name, verticalPx: vertical });
    }
  }
  return found;
}

export interface OutOfCanvas {
  name: string;
  /** Quanto vazou, em px, no pior eixo. */
  overflowPx: number;
  side: "esquerda" | "direita" | "topo" | "base";
}

export function outOfCanvas(
  boxes: BoxPx[],
  extraction: SlotExtraction,
): OutOfCanvas[] {
  const out: OutOfCanvas[] = [];
  for (const box of boxes) {
    const checks: OutOfCanvas[] = [
      { name: box.name, overflowPx: -box.left, side: "esquerda" },
      { name: box.name, overflowPx: box.right - extraction.docWidth, side: "direita" },
      { name: box.name, overflowPx: -box.top, side: "topo" },
      { name: box.name, overflowPx: box.bottom - extraction.docHeight, side: "base" },
    ];
    const worst = checks
      .filter((c) => c.overflowPx > 0.5)
      .sort((a, b) => b.overflowPx - a.overflowPx)[0];
    if (worst) out.push(worst);
  }
  return out;
}

export interface ContrastCheck {
  pair: string;
  ratio: number;
  passesAA: boolean;
  /**
   * CR-003 — pares decorativos (acento) NÃO entram no gate de AA: o produto
   * só garante contraste de TEXTO (`deterministicEvaluation` mede textColor
   * contra o fundo efetivo). Acento vive em selos/barras — cor de marca
   * desbotada sobre o próprio overlay é legítima ali.
   */
  decorative: boolean;
}

export function contrastChecks(variation: PostVariation): ContrastCheck[] {
  // CR-003: fundo EFETIVO — MESMA fonte única do produto
  // (`shared/creative/color.ts`, SPEC-002): fundo sólido com overlay dominante
  // blenda; overlay subdominante mantém a cor crua.
  const effective = effectiveBackgroundColor(
    {
      backgroundType: variation.bgValue?.type ?? "solid",
      solidColor: variation.bgValue?.color ?? variation.backgroundColor,
      overlayColor: variation.bgOverlay?.color,
      overlayOpacity: variation.bgOverlay?.opacity,
    },
    variation.backgroundColor ?? "#171717",
  );
  const bg = effective.color;
  const checks: Array<[string, string | undefined, boolean]> = [
    ["texto/fundo", variation.textColor, false],
    ["titulo/fundo", variation.headlineColor ?? variation.textColor, false],
    ["corpo/fundo", variation.bodyColor ?? variation.textColor, false],
    ["acento/fundo", variation.accentColor, true],
  ];
  const out: ContrastCheck[] = [];
  for (const [pair, fg, decorative] of checks) {
    if (!fg || !bg) continue;
    const ratio = contrastRatio(fg, bg);
    if (!Number.isFinite(ratio)) continue;
    out.push({ pair, ratio: Math.round(ratio * 100) / 100, passesAA: ratio >= 4.5, decorative });
  }
  return out;
}

export interface DiversityCounters {
  familias: number;
  paresTipograficos: number;
  paletas: number;
  layouts: number;
}

/** Diversidade de um CONJUNTO de variações — o que o usuário vê numa geração. */
export function diversity(variations: PostVariation[]): DiversityCounters {
  const uniq = (values: Array<string | undefined>) =>
    new Set(values.filter((v): v is string => Boolean(v))).size;
  return {
    familias: uniq(variations.map((v) => v.creativeDirection?.familyId)),
    paresTipograficos: uniq(
      variations.map((v) => `${v.headlineFontFamily ?? "?"}/${v.bodyFontFamily ?? "?"}`),
    ),
    paletas: uniq(variations.map((v) => v.creativeDirection?.paletteId)),
    layouts: uniq(variations.map((v) => v.layout)),
  };
}
