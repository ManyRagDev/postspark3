import {
  DEFAULT_BG_OVERLAY,
  DEFAULT_DESIGN_TOKENS,
  DEFAULT_IMAGE_SETTINGS,
  DEFAULT_LAYOUT_SETTINGS,
  type AdvancedLayoutSettings,
  type AspectRatio,
  type ContentSection,
  type DesignTokens,
  type FormatOptimization,
  type LayoutPosition,
  type PostVariation,
  type PostVisualSnapshot,
  type TextAlignment,
} from "@shared/postspark";
import type { EditorState } from "@/store/editorStore";
import { layoutToAdvanced } from "@/lib/layoutToAdvanced";
import { applyVisualFitFallback } from "@/lib/visualFitValidator";

const ICON_FALLBACKS = ["Zap", "Shield", "Target", "TrendingUp", "CheckCircle"];

export function normalizeSectionIcon(icon: unknown, index = 0): string {
  const raw = typeof icon === "string" ? icon.trim() : "";
  if (!raw) return ICON_FALLBACKS[index % ICON_FALLBACKS.length];

  const aliases: Record<string, string> = {
    automation: "Zap",
    automacao: "Zap",
    performance: "TrendingUp",
    seguranca: "Shield",
    security: "Shield",
    analysis: "Target",
    analise: "Target",
    data: "Target",
    dados: "Target",
    check: "CheckCircle",
  };

  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toLowerCase();

  return aliases[normalized] ?? raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function normalizeSections(sections?: ContentSection[]): ContentSection[] | undefined {
  if (!Array.isArray(sections) || sections.length === 0) return undefined;

  return sections.map((section, index) => ({
    ...section,
    id: section.id || `section-${index + 1}`,
    icon: normalizeSectionIcon(section.icon, index),
    number: section.number ?? index + 1,
  }));
}

export function normalizeVariationForEditor(variation: PostVariation): PostVariation {
  const normalizedSections = normalizeSections(variation.sections);
  return {
    ...variation,
    sections: normalizedSections,
  };
}

function normalizeImageSettings(variation: PostVariation) {
  return {
    ...DEFAULT_IMAGE_SETTINGS,
    ...(variation.imageSettings ?? {}),
  };
}

/**
 * `freePosition` é o CENTRO geométrico do bloco (mesmo contrato do drag manual e
 * do `layoutPositionAdapter`). A IA e o motor criativo podem emitir coordenadas
 * fora do contêiner ou com headline/body colados. Estas constantes definem os
 * limites de saneamento aplicados no boundary — nunca no renderer.
 */
const MIN_CENTER_Y = 8;
const MAX_CENTER_Y = 92;
/** Folga vertical mínima entre as BORDAS estimadas de headline e body, em % da altura. */
const MIN_BLOCK_GAP_Y = 4;
/** Borda inferior máxima (em %) que a caixa estimada do body pode alcançar. */
const MAX_BLOCK_BOTTOM_Y = 98;
/** Card-contêiner mais estreito que isso espreme o conteúdo até estourar o texto. */
const MIN_AI_CARD_WIDTH = 45;
/** Dimensões de referência do canvas (mesma base do motor criativo). */
const REFERENCE_CANVAS_WIDTH = 360;

interface AiLayoutContext {
  headlineText: string;
  bodyText: string;
  hasStructuredSections: boolean;
  aspectRatio: AspectRatio;
}

function referenceCanvasHeight(aspectRatio: AspectRatio): number {
  const [w, h] = aspectRatio.split(":").map(Number);
  if (!w || !h) return REFERENCE_CANVAS_WIDTH;
  return (REFERENCE_CANVAS_WIDTH * h) / w;
}

/**
 * Estimativa conservadora da altura renderizada de um bloco de texto, em % da
 * altura do canvas. A IA não conhece métricas de fonte nem quebra de linha —
 * centros "separados" ainda produzem caixas sobrepostas quando o texto é longo;
 * qualquer decisão de geometria baseada em coordenadas dela precisa passar por
 * esta estimativa antes de ser aceita.
 */
function estimateTextHeightPercent(
  text: string,
  widthPercent: number,
  aspectRatio: AspectRatio,
  kind: "headline" | "body",
): number {
  const fontPx = kind === "headline" ? 26 : 13;
  const lineHeightFactor = kind === "headline" ? 1.15 : 1.5;
  const usableWidthPx =
    (Math.max(10, Math.min(100, widthPercent)) / 100) * REFERENCE_CANVAS_WIDTH;
  const charsPerLine = Math.max(6, usableWidthPx / (fontPx * 0.55));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  const heightPx = lines * fontPx * lineHeightFactor;
  const safetyFactor = 1.15;
  return Math.min(100, (heightPx / referenceCanvasHeight(aspectRatio)) * 100 * safetyFactor);
}

/** Prende o centro de um bloco dentro do canvas considerando sua largura. */
function clampFreePosition(
  free: { x: number; y: number },
  width: number | undefined,
): { x: number; y: number } {
  const halfWidth = typeof width === "number" ? Math.max(0, Math.min(100, width)) / 2 : 0;
  return {
    x: Math.max(halfWidth, Math.min(100 - halfWidth, free.x)),
    y: Math.max(MIN_CENTER_Y, Math.min(MAX_CENTER_Y, free.y)),
  };
}

function formatOptimizationToLayoutSettings(
  fopt: Partial<FormatOptimization>,
  ctx: AiLayoutContext,
): AdvancedLayoutSettings {
  const base = layoutToAdvanced(fopt.layout);

  // Templates estruturados renderizam sections em fluxo; headline/body absolutos
  // por coordenada da IA atravessam esse fluxo (as caixas se cruzam no meio do
  // card). Nesses casos aproveitamos apenas estilo (textAlign/width/cores) e a
  // geometria fica com o layout de fluxo, que empilha sem sobreposição.
  const allowFreePosition = !ctx.hasStructuredSections;

  const toPosition = (
    foptItem: Partial<NonNullable<FormatOptimization["headline"]>> | undefined,
    basePos: LayoutPosition,
  ): LayoutPosition => {
    if (!foptItem) return basePos;
    const hasCoord = allowFreePosition && foptItem.x != null && foptItem.y != null;
    const width = foptItem.width ?? basePos.width;
    return {
      position: hasCoord ? "top-left" : basePos.position,
      textAlign: (foptItem.textAlign as TextAlignment) ?? basePos.textAlign,
      freePosition: hasCoord
        ? clampFreePosition({ x: foptItem.x!, y: foptItem.y! }, width)
        : basePos.freePosition,
      width,
      backgroundColor: foptItem.backgroundColor ?? basePos.backgroundColor,
      borderRadius: foptItem.borderRadius ?? basePos.borderRadius,
    };
  };

  /** Descarta a geometria da IA mantendo o estilo que ela escolheu. */
  const toFlow = (pos: LayoutPosition, basePos: LayoutPosition): LayoutPosition => ({
    ...pos,
    position: basePos.position,
    freePosition: basePos.freePosition,
  });

  let headline = toPosition(fopt.headline, base.headline);
  let body = toPosition(fopt.body, base.body);

  // Anti-colisão por caixa estimada (não por centro): garante folga real entre a
  // borda inferior do headline e a borda superior do body. Se não há espaço no
  // canvas para as duas caixas, as coordenadas da IA são inviáveis e ambos os
  // blocos voltam ao layout de fluxo. É o que impede o "título em cima do corpo".
  if (headline.freePosition && body.freePosition) {
    const headlineHeight = estimateTextHeightPercent(
      ctx.headlineText,
      headline.width ?? 90,
      ctx.aspectRatio,
      "headline",
    );
    const bodyHeight = estimateTextHeightPercent(
      ctx.bodyText,
      body.width ?? 90,
      ctx.aspectRatio,
      "body",
    );
    const minBodyCenterY =
      headline.freePosition.y + headlineHeight / 2 + MIN_BLOCK_GAP_Y + bodyHeight / 2;
    if (body.freePosition.y < minBodyCenterY) {
      if (minBodyCenterY + bodyHeight / 2 <= MAX_BLOCK_BOTTOM_Y) {
        body = { ...body, freePosition: { ...body.freePosition, y: minBodyCenterY } };
      } else {
        headline = toFlow(headline, base.headline);
        body = toFlow(body, base.body);
      }
    }
  }

  // Card é o contêiner do conteúdo inteiro: largura pequena demais vinda da IA
  // espreme headline/body até o texto estourar. Abaixo do mínimo, a geometria do
  // card volta ao fluxo (estilo preservado).
  let card = toPosition(fopt.card, base.card);
  if (typeof card.width === "number" && card.width < MIN_AI_CARD_WIDTH) {
    card = { ...toFlow(card, base.card), width: base.card.width };
  }

  return {
    headline,
    body,
    accentBar: base.accentBar,
    badge: base.badge,
    sticker: base.sticker,
    carouselArrow: base.carouselArrow,
    card,
    sectionLayouts: base.sectionLayouts ?? {},
    padding: fopt.padding ?? base.padding,
  };
}

function normalizeLayoutSettings(
  variation: PostVariation,
  aspectRatio: AspectRatio,
): AdvancedLayoutSettings {
  const arOpt = variation.aspectRatioOptimizations?.[aspectRatio];
  const fromArOpt =
    arOpt && (arOpt.headline || arOpt.body || arOpt.card)
      ? formatOptimizationToLayoutSettings(arOpt, {
          headlineText: variation.headline ?? "",
          bodyText: variation.body ?? "",
          hasStructuredSections:
            (variation.template ?? "simple") !== "simple" &&
            (variation.sections?.length ?? 0) > 0,
          aspectRatio,
        })
      : undefined;

  const selected =
    variation.layoutSettingsByAspectRatio?.[aspectRatio] ??
    fromArOpt ??
    variation.layoutSettings ??
    layoutToAdvanced(variation.layout);

  return {
    headline: { ...DEFAULT_LAYOUT_SETTINGS.headline, ...selected.headline },
    body: { ...DEFAULT_LAYOUT_SETTINGS.body, ...selected.body },
    accentBar: { ...DEFAULT_LAYOUT_SETTINGS.accentBar, ...selected.accentBar },
    badge: { ...DEFAULT_LAYOUT_SETTINGS.badge, ...selected.badge },
    sticker: { ...DEFAULT_LAYOUT_SETTINGS.sticker, ...selected.sticker },
    carouselArrow: {
      ...DEFAULT_LAYOUT_SETTINGS.carouselArrow,
      ...selected.carouselArrow,
    },
    card: { ...DEFAULT_LAYOUT_SETTINGS.card, ...selected.card },
    sectionLayouts: selected.sectionLayouts ?? {},
    padding: selected.padding ?? DEFAULT_LAYOUT_SETTINGS.padding,
  };
}

function synchronizeDesignTokenColors(
  designTokens: Partial<DesignTokens> | undefined,
  colors: { backgroundColor: string; textColor: string; accentColor: string },
): DesignTokens {
  const base = designTokens ?? {};
  return {
    ...DEFAULT_DESIGN_TOKENS,
    ...base,
    colors: {
      ...DEFAULT_DESIGN_TOKENS.colors,
      ...(base as DesignTokens).colors,
      background: colors.backgroundColor,
      text: colors.textColor,
      primary: colors.accentColor,
      secondary: (base as DesignTokens).colors?.secondary ?? colors.accentColor,
      card: (base as DesignTokens).colors?.card ?? colors.backgroundColor,
    },
    typography: {
      ...DEFAULT_DESIGN_TOKENS.typography,
      ...(base as DesignTokens).typography,
    },
    structure: {
      ...DEFAULT_DESIGN_TOKENS.structure,
      ...(base as DesignTokens).structure,
    },
  };
}

/**
 * Canonical boundary for AI output, history restores and legacy saved posts.
 * After this function runs, renderers and editors must consume the resulting
 * snapshot instead of resolving colors, layout or background independently.
 */
export function createPostVisualSnapshot(
  variation: PostVariation,
  requestedAspectRatio: AspectRatio = variation.aspectRatio ?? "1:1",
): PostVisualSnapshot {
  const normalized = normalizeVariationForEditor(variation);
  const adjusted = applyAspectRatioToVariation(normalized, requestedAspectRatio);
  const backgroundColor = adjusted.backgroundColor || "#171717";
  const textColor = adjusted.textColor || "#ffffff";
  const accentColor = adjusted.accentColor || "#a855f7";
  const headlineColor = adjusted.headlineColor || textColor;
  const bodyColor = adjusted.bodyColor || textColor;
  const designTokens = synchronizeDesignTokenColors(adjusted.designTokens, {
    backgroundColor,
    textColor,
    accentColor,
  });
  const imageSettings = normalizeImageSettings(adjusted);
  const layoutSettings = normalizeLayoutSettings(adjusted, requestedAspectRatio);
  const hasFormatOptimization = Boolean(
    adjusted.aspectRatioOptimizations?.[requestedAspectRatio],
  );
  const bgValue = adjusted.bgValue && !(hasFormatOptimization && adjusted.bgValue.type === "solid")
    ? adjusted.bgValue
    : adjusted.imageUrl
      ? { type: "ai" as const, url: adjusted.imageUrl }
      : { type: "solid" as const, color: backgroundColor };

  const snapshot: PostVisualSnapshot = {
    ...adjusted,
    snapshotVersion: 3,
    aspectRatio: requestedAspectRatio,
    postMode: adjusted.postMode ?? (adjusted.slides?.length ? "carousel" : "static"),
    backgroundColor,
    textColor,
    accentColor,
    headlineColor,
    bodyColor,
    designTokens,
    imageSettings,
    layoutSettings,
    bgValue,
    bgOverlay: {
      ...DEFAULT_BG_OVERLAY,
      ...(adjusted.bgOverlay ?? {}),
    },
  };

  return applyVisualFitFallback(snapshot);
}

/** Apply an explicit visual choice (theme/custom tokens) to the snapshot itself. */
export function applyDesignTokensToSnapshot(
  snapshot: PostVisualSnapshot,
  designTokens: DesignTokens,
  brandMeta?: PostVariation["brandMeta"],
): PostVisualSnapshot {
  const backgroundColor = designTokens.colors.background;
  const textColor = designTokens.colors.text;
  const accentColor = designTokens.colors.primary;
  return {
    ...snapshot,
    backgroundColor,
    textColor,
    accentColor,
    designTokens,
    brandMeta: brandMeta ?? snapshot.brandMeta,
    bgValue:
      snapshot.bgValue.type === "solid"
        ? { type: "solid", color: backgroundColor }
        : snapshot.bgValue,
  };
}

/**
 * Read-only projection of a carousel slide. The persisted document remains the
 * base snapshot plus `slides[].editorState`; renderers receive the projection
 * without promoting a current-slide override to the document root.
 */
export function projectSnapshotForSlide(
  snapshot: PostVisualSnapshot,
  slideIndex = 0,
): PostVisualSnapshot {
  if (snapshot.postMode !== "carousel" || !snapshot.slides?.length) return snapshot;
  const slide = snapshot.slides[slideIndex] ?? snapshot.slides[0];
  const editorState = slide.editorState;
  const layoutOverride = editorState?.layoutSettings;

  return {
    ...snapshot,
    ...(editorState?.variation ?? {}),
    headline: slide.headline || snapshot.headline,
    body: slide.body || snapshot.body,
    imageSettings: {
      ...snapshot.imageSettings,
      ...(editorState?.imageSettings ?? {}),
    },
    layoutSettings: layoutOverride
      ? {
          ...snapshot.layoutSettings,
          ...layoutOverride,
          headline: { ...snapshot.layoutSettings.headline, ...layoutOverride.headline },
          body: { ...snapshot.layoutSettings.body, ...layoutOverride.body },
          accentBar: { ...snapshot.layoutSettings.accentBar, ...layoutOverride.accentBar },
          badge: { ...snapshot.layoutSettings.badge, ...layoutOverride.badge },
          sticker: { ...snapshot.layoutSettings.sticker, ...layoutOverride.sticker },
          carouselArrow: { ...snapshot.layoutSettings.carouselArrow, ...layoutOverride.carouselArrow },
          card: { ...snapshot.layoutSettings.card, ...layoutOverride.card },
          sectionLayouts: {
            ...(snapshot.layoutSettings.sectionLayouts ?? {}),
            ...(layoutOverride.sectionLayouts ?? {}),
          },
        }
      : snapshot.layoutSettings,
    bgValue: editorState?.bgValue ?? snapshot.bgValue,
    bgOverlay: {
      ...snapshot.bgOverlay,
      ...(editorState?.bgOverlay ?? {}),
    },
  };
}

/**
 * Resolve as cores efetivas de uma variação para um aspect ratio específico.
 * Prioriza `aspectRatioOptimizations[aspectRatio]` sobre o nível superior,
 * garantindo que HoloDeck e Workbench leiam a mesma fonte de verdade.
 */
export function resolveVariationColorsForAspectRatio(
  variation: PostVariation,
  aspectRatio: AspectRatio,
): { backgroundColor?: string; textColor?: string; accentColor?: string } {
  const arOpt = variation.aspectRatioOptimizations?.[aspectRatio];
  return {
    backgroundColor: arOpt?.backgroundColor ?? variation.backgroundColor,
    textColor: arOpt?.textColor ?? variation.textColor,
    accentColor: arOpt?.accentColor ?? variation.accentColor,
  };
}

/**
 * Aplica `aspectRatioOptimizations[aspectRatio]` sobre a variação, retornando
 * uma nova variação com cores/layout alinhados ao formato solicitado.
 * Esta é a "fonte única da verdade" usada por HoloDeck e Workbench.
 */
export function applyAspectRatioToVariation(
  variation: PostVariation,
  aspectRatio: AspectRatio,
): PostVariation {
  const arOpt = variation.aspectRatioOptimizations?.[aspectRatio];
  if (!arOpt) return { ...variation, aspectRatio };

  return {
    ...variation,
    aspectRatio,
    backgroundColor: arOpt.backgroundColor ?? variation.backgroundColor,
    textColor: arOpt.textColor ?? variation.textColor,
    accentColor: arOpt.accentColor ?? variation.accentColor,
    layout: arOpt.layout ?? variation.layout,
  };
}

export function normalizeSectionLayouts(sections?: ContentSection[], layoutSettings?: AdvancedLayoutSettings): Record<string, LayoutPosition> {
  const existing = layoutSettings?.sectionLayouts ?? {};
  const normalized = normalizeSections(sections) ?? [];

  return normalized.reduce<Record<string, LayoutPosition>>((acc, section) => {
    if (!section.id) return acc;
    if (existing[section.id]) {
      acc[section.id] = existing[section.id];
    }
    return acc;
  }, {});
}

export function hasManualSectionLayouts(layoutSettings?: Partial<AdvancedLayoutSettings>): boolean {
  return Boolean(layoutSettings?.sectionLayouts && Object.keys(layoutSettings.sectionLayouts).length > 0);
}

export function buildVariationSnapshot(editorState: EditorState, fallback: PostVariation, aspectRatio: AspectRatio): PostVisualSnapshot {
  const active = editorState.activeVariation ?? fallback;
  const base = editorState.baseVariation ?? active;
  const canonicalVariation = editorState.postMode === "carousel" ? base : active;
  const sections = normalizeSections(canonicalVariation.sections ?? base.sections);
  const layoutSettings = {
    ...editorState.baseLayoutSettings,
    sectionLayouts: normalizeSectionLayouts(sections, editorState.baseLayoutSettings),
  };

  return {
    snapshotVersion: 3,
    ...base,
    ...canonicalVariation,
    designTokens: synchronizeDesignTokenColors(canonicalVariation.designTokens, {
      backgroundColor: canonicalVariation.backgroundColor,
      textColor: canonicalVariation.textColor,
      accentColor: canonicalVariation.accentColor,
    }),
    aspectRatio,
    postMode: editorState.postMode,
    slides: editorState.slides,
    sections,
    textElements: canonicalVariation.textElements ?? base.textElements,
    imageSettings: editorState.baseImageSettings,
    layoutSettings,
    bgValue: editorState.baseBgValue,
    bgOverlay: editorState.baseBgOverlay,
    layoutSettingsByAspectRatio: editorState.baseVariation?.layoutSettingsByAspectRatio,
  } as PostVisualSnapshot;
}
