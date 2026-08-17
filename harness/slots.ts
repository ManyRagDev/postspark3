/**
 * Extração de geometria de slot a partir de uma variação já composta.
 *
 * ACHADO REGISTRADO EM 2026-08-10, CORRIGIDO NA MESMA ENTREGA (SPEC-001): as
 * famílias declaravam `layoutSettings.headline` com `freePosition`, mas a
 * MAIORIA não declarava `layoutSettings.body` — o corpo caía no
 * `DEFAULT_LAYOUT_SETTINGS` (`bottom-left`, sem `freePosition`) e era
 * posicionado pelo renderizador, sem orçamento vertical derivável.
 *
 * A correção: `LayoutPosition.height` (`shared/postspark.ts`) e os
 * arquétipos tipados de `shared/creative/layoutArchetypes.ts` — todas as 12
 * famílias com headline/body livre agora declaram largura E altura
 * explícitas. `verticalBudgetPx` usa `position.height` diretamente quando
 * presente; a inferência por "próximo slot declarado" abaixo permanece só
 * como compatibilidade para posição simbólica sem altura (templates
 * estruturados como `feature-grid`, fora do escopo desta spec).
 */

import type { AdvancedLayoutSettings, LayoutPosition, PostVariation } from "@shared/postspark";
import { DEFAULT_LAYOUT_SETTINGS } from "@shared/postspark";

/** Largura do documento em que as famílias autoram (`CREATIVE_DOC_WIDTH`). */
export const DOC_WIDTH = 360;

export type SlotName = "headline" | "body";

/**
 * Como a família posiciona o slot.
 *  • `free` — `freePosition` com x/y explícitos. Orçamento vertical derivável.
 *  • `grid` — `position` numa das 9 células. O posicionamento real é resolvido
 *    pelo renderizador (`PostCardV2`), que o harness não modela. Orçamento
 *    vertical NÃO derivável — e é por isso que essas famílias não podem ser
 *    provadas pela E2 sem antes migrar para slot explícito.
 */
export type PositionMode = "free" | "grid";

export interface Slot {
  name: SlotName;
  /** Mecanismo de posicionamento declarado pela família. */
  positionMode: PositionMode;
  /** Atalho: `positionMode === "free"`. */
  declared: boolean;
  /** Centro horizontal em % do documento. */
  centerXPercent: number;
  /** Topo em % do documento. */
  topPercent: number;
  /** Largura em % do documento. */
  widthPercent: number;
  /** Largura em px, já resolvida contra `DOC_WIDTH`. */
  widthPx: number;
  /** Topo em px. */
  topPx: number;
  /**
   * Altura disponível em px. Vem de `LayoutPosition.height` quando a família
   * declara (contrato canônico pós-SPEC-001). Cai para inferência pelo
   * próximo slot declarado abaixo (ou base do canvas menos padding) só para
   * posição simbólica legada sem altura explícita. `null` quando nem isso é
   * derivável — slot não declarado (ex.: templates estruturados).
   */
  verticalBudgetPx: number | null;
}

export interface SlotExtraction {
  docWidth: number;
  docHeight: number;
  slots: Slot[];
  /**
   * Slots posicionados por grade. Métrica de primeira classe: a E2 só consegue
   * provar encaixe em slots `free`, então esta lista é a fila de trabalho da E3.
   */
  gridPositioned: SlotName[];
}

function docHeightFor(aspectRatio: string): number {
  const [w, h] = aspectRatio.split(":").map(Number);
  if (!w || !h) return DOC_WIDTH;
  return (DOC_WIDTH * h) / w;
}

function resolveLayoutSettings(variation: PostVariation): AdvancedLayoutSettings {
  const raw = (variation.layoutSettings ?? {}) as Partial<AdvancedLayoutSettings>;
  return { ...DEFAULT_LAYOUT_SETTINGS, ...raw };
}

/**
 * `freePosition.x` E `freePosition.y` são sempre o CENTRO do bloco — contrato
 * do renderer real (`client/src/components/canvas/DraggableBlock.tsx`,
 * `resolveLayoutStyle`: `top: y%` + `transform: translate(-50%,-50%)`).
 *
 * ACHADO CORRIGIDO NESTA ENTREGA (SPEC-001): esta função tratava `free.y`
 * como TOPO do bloco, não como centro — inofensivo enquanto nenhuma família
 * declarava `body` livre (não havia segunda caixa para comparar), mas assim
 * que `shared/creative/layoutArchetypes.ts` passou a declarar headline E
 * body com centro real, a leitura errada deslocava as caixas ~metade da
 * própria altura para baixo, produzindo sobreposição e vazamento de canvas
 * que não existem no renderer real. A conversão centro→topo abaixo usa a
 * altura explícita (`LayoutPosition.height`) quando disponível.
 */
interface RawSlot extends Omit<Slot, "verticalBudgetPx"> {
  /** Altura declarada explicitamente (`LayoutPosition.height`), em px. `null` quando a família não declara. */
  explicitHeightPx: number | null;
}

function readSlot(
  name: SlotName,
  position: LayoutPosition | undefined,
  docHeight: number,
): RawSlot {
  const free = position?.freePosition;
  const widthPercent = typeof position?.width === "number" ? position.width : 84;
  const explicitHeightPx =
    typeof position?.height === "number" ? (position.height / 100) * docHeight : null;
  // Centro em px, convertido para topo quando a altura é conhecida (slot
  // canônico pós-SPEC-001). Sem altura explícita, mantém compatibilidade
  // com a leitura legada (trata y como topo) — só afeta slots sem `height`.
  const centerYPx = free ? (free.y / 100) * docHeight : Number.NaN;
  const topPx = !free
    ? Number.NaN
    : explicitHeightPx !== null
      ? centerYPx - explicitHeightPx / 2
      : centerYPx;
  return {
    name,
    positionMode: free !== undefined ? "free" : "grid",
    declared: free !== undefined,
    centerXPercent: free?.x ?? 50,
    topPercent: free?.y ?? Number.NaN,
    widthPercent,
    widthPx: (widthPercent / 100) * DOC_WIDTH,
    topPx,
    explicitHeightPx,
  };
}

export function extractSlots(variation: PostVariation, aspectRatio: string): SlotExtraction {
  const docHeight = docHeightFor(aspectRatio);
  const settings = resolveLayoutSettings(variation);
  const paddingPx = settings.padding ?? DEFAULT_LAYOUT_SETTINGS.padding;

  const partial = (["headline", "body"] as SlotName[]).map((name) =>
    readSlot(name, settings[name], docHeight),
  );

  // Ordena os declarados por topo para derivar o orçamento vertical de quem
  // não tem altura explícita (compatibilidade legada).
  const declaredSorted = partial
    .filter((s) => s.declared)
    .sort((a, b) => a.topPx - b.topPx);

  const slots: Slot[] = partial.map(({ explicitHeightPx, ...s }) => {
    if (!s.declared) return { ...s, verticalBudgetPx: null };
    if (explicitHeightPx !== null) return { ...s, verticalBudgetPx: explicitHeightPx };
    const index = declaredSorted.findIndex((d) => d.name === s.name);
    const next = declaredSorted[index + 1];
    const bottomLimit = next ? next.topPx : docHeight - paddingPx;
    const budget = bottomLimit - s.topPx;
    return { ...s, verticalBudgetPx: budget > 0 ? budget : null };
  });

  return {
    docWidth: DOC_WIDTH,
    docHeight,
    slots,
    gridPositioned: slots.filter((s) => s.positionMode === "grid").map((s) => s.name),
  };
}
