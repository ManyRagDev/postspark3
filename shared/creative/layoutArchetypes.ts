import type { LayoutPosition } from "../postspark";

/**
 * Arquétipos de posicionamento (SPEC-001, docs/reforma/SPEC-001).
 *
 * Antes desta entrega, as 12 famílias em `families.ts` declaravam
 * `freePosition` explícito para o headline mas não para o body — o body
 * caia em `DEFAULT_LAYOUT_SETTINGS` (posição simbólica, resolvida por
 * flex/grid no `PostCardV2`) e sua altura só existia na física do cliente.
 * `harness/slots.ts` documentava isso como "orçamento vertical não
 * derivável" para a maioria das famílias.
 *
 * Estes helpers fecham o contrato: todo slot que usa `freePosition` também
 * declara `width` e `height` explícitos (% do canvas), no MESMO sistema de
 * coordenadas que `pxX`/`pxY` já usam em `compose.ts`. `harness/slots.ts` e
 * o resolvedor tipográfico (`shared/typography/`) consomem exatamente este
 * contrato — nenhum dos dois infere altura a partir de posição simbólica.
 *
 * `freePosition.x`/`freePosition.y` são sempre o CENTRO do bloco (contrato
 * do renderer: `translate(-50%, -50%)`).
 *
 * Snapshots v4 não podem depender de grid/flex do cliente para geometria de
 * headline/body — apenas snapshots legados v1-v3 continuam lendo essa
 * física antiga.
 */

export type TextAlign = "left" | "center" | "right";

/** Chave de proporção para mapas por-ratio (CR-003 — calibração por formato). */
export type AspectRatioKey = "1:1" | "5:6" | "9:16";

export function aspectOf(ratio: string): AspectRatioKey {
  return ratio === "5:6" ? "5:6" : ratio === "9:16" ? "9:16" : "1:1";
}

export interface StackSlots {
  headline: LayoutPosition;
  body?: LayoutPosition;
}

/** `freePosition.x` a partir de uma margem esquerda + largura (contrato antigo de `flX`). */
export const flX = (leftPercent: number, widthPercent: number): number =>
  leftPercent + widthPercent / 2;

interface StackParams {
  /** Centro horizontal do bloco, em % do canvas. Default: 50 (centrado). */
  xCenterPercent?: number;
  /** Largura do headline, em % do canvas. */
  headlineWidthPercent: number;
  /** Largura do body. Default: igual à do headline. */
  bodyWidthPercent?: number;
  /** Altura reservada para o headline, em % do canvas. */
  headlineHeightPercent: number;
  /** Altura reservada para o body. Omitir quando a família não usa body livre. */
  bodyHeightPercent?: number;
  /** Espaço vertical entre headline e body, em % do canvas. */
  gapPercent?: number;
  /** Topo do bloco headline (não o centro), em % do canvas. */
  topPercent: number;
  textAlign?: TextAlign;
  position?: LayoutPosition["position"];
}

/**
 * Pilha vertical: headline e (opcionalmente) body empilhados a partir de um
 * topo declarado, com gap explícito entre eles. Serve tanto para blocos
 * centrados no meio do canvas quanto para blocos ancorados perto do topo —
 * quem decide onde o bloco começa é `topPercent`.
 */
export function stack(params: StackParams): StackSlots {
  const {
    xCenterPercent = 50,
    headlineWidthPercent,
    bodyWidthPercent = headlineWidthPercent,
    headlineHeightPercent,
    bodyHeightPercent,
    // Precisa ter folga REAL acima de MIN_TEXT_GAP (shared/visualFit.ts = 4) —
    // não só tecnicamente >=. Um gap exatamente igual ao mínimo fica na borda
    // do que `overlaps()` aceita; qualquer divergência entre a medição
    // (fontkit) e a renderização real do navegador (a mesma razão de
    // RESOLUTION_WIDTH_SAFETY existir para largura) pode empurrar para dentro
    // do overlap. 6 dá 50% de margem sobre o mínimo.
    gapPercent = 6,
    topPercent,
    textAlign = "center",
    position = "top-left",
  } = params;

  const headline: LayoutPosition = {
    position,
    textAlign,
    freePosition: { x: xCenterPercent, y: topPercent + headlineHeightPercent / 2 },
    width: headlineWidthPercent,
    height: headlineHeightPercent,
  };

  if (bodyHeightPercent === undefined) return { headline };

  const bodyTop = topPercent + headlineHeightPercent + gapPercent;
  const body: LayoutPosition = {
    position,
    textAlign,
    freePosition: { x: xCenterPercent, y: bodyTop + bodyHeightPercent / 2 },
    width: bodyWidthPercent,
    height: bodyHeightPercent,
  };

  return { headline, body };
}

interface CenteredStackParams extends Omit<StackParams, "topPercent"> {
  /** Centro vertical do bloco inteiro (headline+gap+body), em % do canvas. Default: 50. */
  yCenterPercent?: number;
}

/** Pilha vertical centrada como bloco no meio do canvas (ou em `yCenterPercent`). */
export function centeredStack(params: CenteredStackParams): StackSlots {
  const { yCenterPercent = 50, gapPercent = 3, headlineHeightPercent, bodyHeightPercent } = params;
  const totalHeight =
    headlineHeightPercent + (bodyHeightPercent !== undefined ? gapPercent + bodyHeightPercent : 0);
  const topPercent = yCenterPercent - totalHeight / 2;
  return stack({ ...params, topPercent });
}

interface PosterBottomParams extends Omit<StackParams, "topPercent"> {
  /** Distância entre a base do bloco (fim do body, ou do headline se não houver body) e a base do canvas. */
  bottomMarginPercent: number;
}

/** Bloco ancorado perto da base do canvas — família "poster". */
export function posterBottom(params: PosterBottomParams): StackSlots {
  const { bottomMarginPercent, gapPercent = 3, headlineHeightPercent, bodyHeightPercent } = params;
  const totalHeight =
    headlineHeightPercent + (bodyHeightPercent !== undefined ? gapPercent + bodyHeightPercent : 0);
  const topPercent = 100 - bottomMarginPercent - totalHeight;
  return stack({ ...params, topPercent });
}

interface SplitParams extends Omit<StackParams, "xCenterPercent" | "headlineWidthPercent" | "bodyWidthPercent" | "textAlign"> {
  /** De que lado do canvas fica o texto — o outro lado é reservado para imagem/decoração. */
  textSide: "left" | "right";
  /** Largura da coluna de texto, em % do canvas. */
  textWidthPercent: number;
  /** Margem entre a coluna de texto e a borda do canvas do mesmo lado. */
  edgeMarginPercent?: number;
  textAlign?: TextAlign;
}

/** Duas colunas: uma reservada para imagem/decoração, outra para o texto. */
export function split(params: SplitParams): StackSlots {
  const { textSide, textWidthPercent, edgeMarginPercent = 6, textAlign, ...rest } = params;
  const xCenterPercent =
    textSide === "left"
      ? textWidthPercent / 2 + edgeMarginPercent
      : 100 - textWidthPercent / 2 - edgeMarginPercent;

  return stack({
    ...rest,
    xCenterPercent,
    headlineWidthPercent: textWidthPercent,
    textAlign: textAlign ?? (textSide === "left" ? "left" : "right"),
  });
}

export interface SectionGridParams {
  /** Topo do bloco de seções (abaixo do headline/body já posicionado), em % do canvas. */
  topPercent: number;
  /** Altura de cada caixa de seção, em % do canvas. */
  rowHeightPercent: number;
  count?: number; // default 3 (STATIC_SECTION_TARGET)
  xLeftPercent?: number; // default 8
  totalWidthPercent?: number; // default 84
  gapPercent?: number; // default 3
  textAlign?: TextAlign; // default "center"
}

/**
 * Grade horizontal de N caixas (feature-grid), com geometria EXPLÍCITA
 * (freePosition+width+height) por caixa — mesmo contrato de `stack`, para
 * que `validateVisualFit` prove não-colisão com o headline. Chaves fixas
 * `section-1..N`: o schema do LLM não produz `id` (server/ai/generationOrchestrator.ts),
 * `normalizeSections` sempre atribui esse formato.
 */
export function sectionGrid(params: SectionGridParams): Record<string, LayoutPosition> {
  const {
    topPercent,
    rowHeightPercent,
    count = 3,
    xLeftPercent = 8,
    totalWidthPercent = 84,
    gapPercent = 3,
    textAlign = "center",
  } = params;
  const colWidth = (totalWidthPercent - gapPercent * (count - 1)) / count;
  const result: Record<string, LayoutPosition> = {};
  for (let i = 0; i < count; i++) {
    const left = xLeftPercent + i * (colWidth + gapPercent);
    result[`section-${i + 1}`] = {
      position: "top-left",
      textAlign,
      freePosition: { x: left + colWidth / 2, y: topPercent + rowHeightPercent / 2 },
      width: colWidth,
      height: rowHeightPercent,
    };
  }
  return result;
}

export interface SafeAreaMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Safe area por proporção (SPEC-002 passo 6, absorvido de
 * `postspark-next/packages/design-system/src/safeArea.ts` — candidato
 * comparado e adaptado, não uma segunda camada: aqui vira % do canvas em vez
 * de px, para casar com o sistema de coordenadas que `freePosition`/`width`/
 * `height` já usam). Em 9:16 o rodapé ganha margem maior — zona de UI do
 * Instagram em Stories/Reels (like/comment/share sobrepõem a base do vídeo).
 */
export function safeAreaMarginsPercent(aspectRatio: "1:1" | "5:6" | "9:16"): SafeAreaMargins {
  if (aspectRatio === "9:16") {
    return { top: 6, bottom: 12, left: 6, right: 6 };
  }
  return { top: 5, bottom: 5, left: 5, right: 5 };
}
