/**
 * Resolvedor tipográfico canônico (SPEC-001, docs/reforma/SPEC-001).
 *
 * Transforma intenção visual (layoutSettings resolvido, ver
 * `shared/creative/layoutArchetypes.ts`) + copy em `ResolvedTypography` —
 * uma decisão medida com a fonte real, pronta para ser persistida no
 * `PostVisualSnapshot` v4 e renderizada verbatim.
 *
 * Nunca corta texto silenciosamente: cada falha vira `TypographyResolutionError`
 * estruturado (ver `TypographyResolutionReason`), nunca um line-clamp.
 *
 * Sistema de coordenadas: documento canônico de 360px de largura, mesmo
 * usado por `shared/visualFit.ts` (`REFERENCE_CANVAS_WIDTH`) e pelo
 * Workbench no cliente (`CanvasWorkspace.tsx`, `POST_BASE_WIDTH`) — os três
 * precisam concordar, ou a caixa resolvida no servidor não bate com o que o
 * cliente desenha.
 */

import type { AdvancedLayoutSettings, AspectRatio, LayoutPosition, ResolvedTextBlock, ResolvedTypography } from "../postspark";
import { fitText } from "./fit";
import { getTypographyMeasurer } from "./measurer";
import { BODY_CEILING_PX, BODY_FLOOR_PX, HEADLINE_CEILING_PX, LEGIBILITY_FLOOR_PX } from "./constants";

export const CANONICAL_CANVAS_WIDTH = 360;
export const ENGINE_VERSION = "spec-001.v1";

export type TypographyResolutionReason =
  | "missing-font"
  | "missing-geometry"
  | "unbreakable-word"
  | "below-floor";

export class TypographyResolutionError extends Error {
  constructor(
    readonly reason: TypographyResolutionReason,
    readonly target: "headline" | "body",
    message: string,
  ) {
    super(message);
    this.name = "TypographyResolutionError";
  }
}

export function canonicalCanvasHeightPx(aspectRatio: AspectRatio): number {
  const [w, h] = aspectRatio.split(":").map(Number);
  if (!w || !h) return CANONICAL_CANVAS_WIDTH;
  return (CANONICAL_CANVAS_WIDTH * h) / w;
}

const DEFAULT_FONT = "Inter";

/**
 * Margem de segurança de largura na MEDIÇÃO do encaixe (CR-008 — correção de
 * overlap real encontrada na matriz manual).
 *
 * O encaixe mede com a fonte do registro; o browser renderiza a fonte
 * CARREGADA (Google Fonts / variação de arquivo) e a prova de equivalência
 * garante divergência <3%. Uma linha medida até ~100% da caixa pode, no
 * browser, exceder o `maxWidth` em ~3% — e com `overflowWrap: break-word` o
 * navegador ADICIONA uma linha, deixando o bloco mais alto que a caixa medida
 * e sobrepondo o elemento seguinte. A resolução, portanto, mede contra 96%
 * da largura declarada (a caixa declarada permanece inteira como `maxWidth`
 * no CSS): nenhuma linha pode estourar nem sob divergência de fonte.
 */
const RESOLUTION_WIDTH_SAFETY = 0.96;

function resolveBlock(
  target: "headline" | "body",
  text: string,
  slot: LayoutPosition | undefined,
  fontFamily: string,
  ceilingPx: number,
  floorPx: number,
  lineHeight: number,
  docHeight: number,
  textTransform: "none" | "uppercase" | "lowercase" | undefined,
): ResolvedTextBlock {
  if (!slot?.freePosition || typeof slot.width !== "number" || typeof slot.height !== "number") {
    throw new TypographyResolutionError(
      "missing-geometry",
      target,
      `${target}: posição simbólica sem geometria explícita (freePosition/width/height) — não é possível resolver deterministicamente.`,
    );
  }
  const measurer = getTypographyMeasurer();
  if (!measurer.supports(fontFamily)) {
    throw new TypographyResolutionError(
      "missing-font",
      target,
      `${target}: fonte "${fontFamily}" ausente do registro (shared/typography/fonts/registry.ts).`,
    );
  }

  const widthPx = (slot.width / 100) * CANONICAL_CANVAS_WIDTH;
  const heightPx = (slot.height / 100) * docHeight;
  const measureTransform = textTransform === "uppercase" ? "uppercase" : "none";

  const fit = fitText(
    {
      text,
      maxWidth: widthPx * RESOLUTION_WIDTH_SAFETY,
      maxHeight: heightPx,
      style: { fontFamily, lineHeight, textTransform: measureTransform },
      ceilingPx,
      floorPx,
    },
    measurer,
  );

  if (fit.overflowingWords.length > 0) {
    throw new TypographyResolutionError(
      "unbreakable-word",
      target,
      `${target}: palavra(s) não cabem na largura mesmo no corpo mínimo: ${fit.overflowingWords.join(", ")}.`,
    );
  }
  if (!fit.fitsAboveFloor) {
    throw new TypographyResolutionError(
      "below-floor",
      target,
      `${target}: texto não cabe nem no piso de legibilidade (${floorPx}px) dentro da caixa disponível (${Math.round(widthPx)}×${Math.round(heightPx)}px).`,
    );
  }

  return {
    text,
    fontFamily,
    fontWeight: 400,
    fontSizePx: fit.fontSizePx,
    lineHeight,
    lines: fit.lines,
    box: {
      x: (slot.freePosition.x / 100) * CANONICAL_CANVAS_WIDTH - widthPx / 2,
      y: (slot.freePosition.y / 100) * docHeight - fit.heightPx / 2,
      width: widthPx,
      height: fit.heightPx,
    },
    textTransform,
  };
}

export interface ResolveTypographyInput {
  headline: string;
  body?: string;
  aspectRatio: AspectRatio;
  layoutSettings: AdvancedLayoutSettings;
  headlineFontFamily?: string;
  bodyFontFamily?: string;
  /** Multiplicador de teto (era o "multiplicador de família" pré-SPEC-001). */
  headlineFontSize?: number;
  bodyFontSize?: number;
  textTransform?: "none" | "uppercase" | "lowercase";
}

/**
 * Resolve headline (e body, quando declarado e com geometria) para um único
 * bloco de tipografia determinística. Lança `TypographyResolutionError`
 * quando não há como resolver sem violar uma invariante de legibilidade —
 * nunca corta ou reescreve texto por conta própria.
 */
export function resolveTypography(input: ResolveTypographyInput): ResolvedTypography {
  const docHeight = canonicalCanvasHeightPx(input.aspectRatio);

  const headline = resolveBlock(
    "headline",
    input.headline,
    input.layoutSettings.headline,
    input.headlineFontFamily ?? DEFAULT_FONT,
    HEADLINE_CEILING_PX * (input.headlineFontSize ?? 1),
    LEGIBILITY_FLOOR_PX,
    1.15,
    docHeight,
    input.textTransform,
  );

  let body: ResolvedTextBlock | undefined;
  const hasBodyText = Boolean(input.body && input.body.trim().length > 0);
  const bodySlot = input.layoutSettings.body;
  if (hasBodyText && bodySlot?.freePosition) {
    body = resolveBlock(
      "body",
      input.body!,
      bodySlot,
      input.bodyFontFamily ?? DEFAULT_FONT,
      BODY_CEILING_PX * (input.bodyFontSize ?? 1),
      BODY_FLOOR_PX,
      1.5,
      docHeight,
      input.textTransform,
    );
  }

  return { engineVersion: ENGINE_VERSION, headline, body };
}
