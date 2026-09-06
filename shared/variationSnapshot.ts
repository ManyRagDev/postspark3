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
  type ResolvedTypography,
  type TextAlignment,
} from "./postspark";
import { layoutToAdvanced } from "./layoutToAdvanced";
import { applyVisualFitFallback, textHeightPercent } from "./visualFit";
import { resolveTypography, TypographyResolutionError } from "./typography/resolve";

const ICON_FALLBACKS = ["Zap", "Shield", "Target", "TrendingUp", "CheckCircle"];
const MIN_CENTER_Y = 8;
const MAX_CENTER_Y = 92;
const MIN_BLOCK_GAP_Y = 4;
const MAX_BLOCK_BOTTOM_Y = 98;
const MIN_AI_TEXT_WIDTH = 36;
const MIN_AI_CARD_WIDTH = 45;

export interface CreatePostVisualSnapshotOptions {
  /**
   * Used when an already-authoritative snapshot is previewed in another format.
   * Format hints may adapt geometry, but cannot replace the chosen visual
   * identity (palette, background or layout family) or drop visual elements.
   */
  preserveVisualIdentity?: boolean;
}

interface AiLayoutContext {
  headlineText: string;
  bodyText: string;
  hasStructuredSections: boolean;
  aspectRatio: AspectRatio;
}

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

export function normalizeImageSettings(variation: PostVariation) {
  return {
    ...DEFAULT_IMAGE_SETTINGS,
    ...(variation.imageSettings ?? {}),
  };
}

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
  const allowFreePosition = !ctx.hasStructuredSections;

  const toPosition = (
    foptItem: Partial<NonNullable<FormatOptimization["headline"]>> | undefined,
    basePos: LayoutPosition,
  ): LayoutPosition => {
    if (!foptItem) return basePos;
    const hasCoord = allowFreePosition && foptItem.x != null && foptItem.y != null;
    const safeBaseWidth = typeof basePos.width === "number" && basePos.width >= MIN_AI_TEXT_WIDTH
      ? basePos.width
      : 90;
    const requestedWidth = foptItem.width ?? safeBaseWidth;
    const width = requestedWidth < MIN_AI_TEXT_WIDTH
      ? safeBaseWidth
      : Math.min(100, requestedWidth);
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

  const toFlow = (pos: LayoutPosition, basePos: LayoutPosition): LayoutPosition => ({
    ...pos,
    position: basePos.position,
    freePosition: basePos.freePosition,
  });

  let headline = toPosition(fopt.headline, base.headline);
  let body = toPosition(fopt.body, base.body);

  if (headline.freePosition && body.freePosition) {
    const headlineHeight = textHeightPercent(
      ctx.headlineText,
      headline.width ?? 90,
      ctx.aspectRatio,
      "headline",
    );
    const bodyHeight = textHeightPercent(
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
  preserveVisualIdentity = false,
  originalAspectRatio?: AspectRatio,
): AdvancedLayoutSettings {
  const arOpt = variation.aspectRatioOptimizations?.[aspectRatio];
  const geometryOptimization = arOpt && preserveVisualIdentity
    ? { ...arOpt, layout: variation.layout }
    : arOpt;
  const fromArOpt =
    geometryOptimization && (geometryOptimization.headline || geometryOptimization.body || geometryOptimization.card)
      ? formatOptimizationToLayoutSettings(geometryOptimization, {
          headlineText: variation.headline ?? "",
          bodyText: variation.body ?? "",
          hasStructuredSections:
            (variation.template ?? "simple") !== "simple" &&
            (variation.sections?.length ?? 0) > 0,
          aspectRatio,
        })
      : undefined;

  const existingSnapshot = variation as Partial<PostVisualSnapshot>;
  // `originalAspectRatio` é a proporção do objeto ANTES de `applyAspectRatioToVariation`
  // sobrescrever `variation.aspectRatio` para a proporção pedida — sem isso, essa
  // comparação vira tautologia (os dois lados já são o mesmo valor) e este ramo
  // vence mesmo quando a proporção pedida é diferente da nativa do objeto.
  const sameRatioSnapshotLayout =
    (existingSnapshot.snapshotVersion === 3 || existingSnapshot.snapshotVersion === 4) &&
    originalAspectRatio === aspectRatio
      ? variation.layoutSettings
      : undefined;

  // CR-003/CR-008: a FAMÍLIA é a autoridade do layout efetivo (SPEC-002) —
  // sua `layoutSettings` (calibrada por proporção em families.ts) tem
  // precedência sobre as otimizações por-ratio do LLM (`fromArOpt`), que para
  // templates estruturados nem carregam freePosition — o que descartava a
  // geometria calibrada e deixava o snapshot sem resolução tipográfica.
  //
  // `layoutSettingsByAspectRatio[aspectRatio]` vem ANTES de `variation.layoutSettings`
  // simples (que é a geometria congelada na proporção de composição/edição
  // anterior) — só perde para `sameRatioSnapshotLayout`, que protege edição ao
  // vivo na MESMA proporção que o objeto já representa.
  const selected =
    sameRatioSnapshotLayout ??
    variation.layoutSettingsByAspectRatio?.[aspectRatio] ??
    variation.layoutSettings ??
    fromArOpt ??
    layoutToAdvanced(variation.layout);

  const resolved: AdvancedLayoutSettings = {
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

  if (!preserveVisualIdentity) return resolved;

  const safeReflowWidth = (width: number | undefined) =>
    typeof width === "number" && width >= MIN_AI_TEXT_WIDTH
      ? Math.min(100, width)
      : 90;

  return {
    ...resolved,
    headline: {
      ...resolved.headline,
      width: safeReflowWidth(resolved.headline.width),
    },
    body: {
      ...resolved.body,
      width: safeReflowWidth(resolved.body.width),
    },
  };
}

export function synchronizeDesignTokenColors(
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
 * Templates estruturados (`feature-grid`) renderizam headline/body em fluxo
 * por `sectionLayouts`, não em posição livre — `validateVisualFit` já proíbe
 * `freePosition` nesse template. Resolução de texto em seções é escopo
 * futuro; aqui só sinalizamos "não se aplica", nunca um erro.
 */
function isStructuredTemplate(snapshot: Pick<PostVisualSnapshot, "template" | "sections">): boolean {
  return (snapshot.template ?? "simple") !== "simple" && (snapshot.sections?.length ?? 0) > 0;
}

/**
 * Resolve a tipografia de um snapshot já com layoutSettings/geometria
 * fechados (SPEC-001). Nunca lança: falhas viram `typographyResolutionError`
 * estruturado, para que o chamador decida a política (nunca um corte
 * silencioso no renderer).
 */
export function resolveSnapshotTypography(
  snapshot: Pick<
    PostVisualSnapshot,
    "headline" | "body" | "aspectRatio" | "layoutSettings" | "headlineFontFamily" | "bodyFontFamily" | "headlineFontSize" | "bodyFontSize" | "template" | "sections"
  >,
): { resolvedTypography?: ResolvedTypography; typographyResolutionError?: string } {
  // CR-003/CR-008: template estruturado com HEADLINE explícito (freePosition)
  // resolve o título normalmente — as seções fluem abaixo e o body em fluxo
  // não entra na resolução (guard em resolveTypography). Sem geometria
  // declarada, continua "não se aplica", nunca erro.
  const structured = isStructuredTemplate(snapshot);
  const headlineHasGeometry = Boolean(snapshot.layoutSettings?.headline?.freePosition);
  if (structured && !headlineHasGeometry) return {};
  try {
    const resolvedTypography = resolveTypography({
      headline: snapshot.headline,
      body: snapshot.body,
      aspectRatio: snapshot.aspectRatio,
      layoutSettings: snapshot.layoutSettings,
      headlineFontFamily: snapshot.headlineFontFamily,
      bodyFontFamily: snapshot.bodyFontFamily,
      headlineFontSize: snapshot.headlineFontSize,
      bodyFontSize: snapshot.bodyFontSize,
    });
    return { resolvedTypography };
  } catch (error) {
    if (error instanceof TypographyResolutionError) {
      return { typographyResolutionError: error.message };
    }
    throw error;
  }
}

export function createPostVisualSnapshot(
  variation: PostVariation,
  requestedAspectRatio: AspectRatio = variation.aspectRatio ?? "1:1",
  options: CreatePostVisualSnapshotOptions = {},
): PostVisualSnapshot {
  // Capturado ANTES de `applyAspectRatioToVariation` sobrescrever `.aspectRatio`
  // para a proporção pedida — ver comentário em `normalizeLayoutSettings`.
  const originalAspectRatio = variation.aspectRatio;
  const normalized = normalizeVariationForEditor(variation);
  const formatAdjusted = applyAspectRatioToVariation(normalized, requestedAspectRatio);
  const adjusted = options.preserveVisualIdentity
    ? {
        ...formatAdjusted,
        backgroundColor: normalized.backgroundColor,
        textColor: normalized.textColor,
        accentColor: normalized.accentColor,
        headlineColor: normalized.headlineColor,
        bodyColor: normalized.bodyColor,
        layout: normalized.layout,
        bgValue: normalized.bgValue,
        designTokens: normalized.designTokens,
        textElements: normalized.textElements,
        imageElements: normalized.imageElements,
      }
    : formatAdjusted;
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
  const layoutSettings = normalizeLayoutSettings(
    adjusted,
    requestedAspectRatio,
    options.preserveVisualIdentity,
    originalAspectRatio,
  );
  const hasFormatOptimization = Boolean(
    adjusted.aspectRatioOptimizations?.[requestedAspectRatio],
  );
  const bgValue = adjusted.bgValue && (options.preserveVisualIdentity || !(hasFormatOptimization && adjusted.bgValue.type === "solid"))
    ? adjusted.bgValue
    : adjusted.imageUrl
      ? { type: "ai" as const, url: adjusted.imageUrl }
      : { type: "solid" as const, color: backgroundColor };

  const bgOverlayBase = {
    ...DEFAULT_BG_OVERLAY,
    ...(adjusted.bgOverlay ?? {}),
  };
  // CR-003 — proteção visual REAL para fundo de imagem sem overlay dominante:
  // em vez de "cap de score" (política que a conferência rejeitou), o snapshot
  // recebe um scrim escuro explícito quando o texto viveria sobre pixels de
  // imagem não amostráveis. Com overlay ≥ 55%, o fundo efetivo é mensurável
  // (basis overlay-dominant) e o texto tem proteção real em tela.
  const isImageBackground = bgValue.type !== "solid";
  const protectedOverlay =
    isImageBackground && (bgOverlayBase.opacity ?? 0) < 0.55
      ? { ...bgOverlayBase, color: bgOverlayBase.color ?? "#000000", opacity: 0.6 }
      : bgOverlayBase;

  const snapshot: PostVisualSnapshot = {
    ...adjusted,
    snapshotVersion: 4,
    aspectRatio: requestedAspectRatio,
    familyId: adjusted.familyId ?? adjusted.creativeDirection?.familyId,
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
    bgOverlay: protectedOverlay,
  };

  // A resolução canônica decide ANTES: se ela encaixou a geometria, as
  // heurísticas legadas do fallback não podem desfazê-la; se falhou, o
  // snapshot não tem autoridade de encaixe e o fallback volta a valer.
  const preResolution = resolveSnapshotTypography(snapshot);
  const fitted = applyVisualFitFallback(snapshot, {
    geometryResolved: Boolean(preResolution.resolvedTypography),
  });
  const { resolvedTypography, typographyResolutionError } =
    fitted.layoutSettings === snapshot.layoutSettings
      ? preResolution
      : resolveSnapshotTypography(fitted);
  const withTypography: PostVisualSnapshot = {
    ...fitted,
    resolvedTypography,
    typographyResolutionError,
  };

  return options.preserveVisualIdentity
    ? {
        ...withTypography,
        textElements: snapshot.textElements,
        imageElements: snapshot.imageElements,
      }
    : withTypography;
}

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

export function projectSnapshotForSlide(
  snapshot: PostVisualSnapshot,
  slideIndex = 0,
): PostVisualSnapshot {
  if (snapshot.postMode !== "carousel" || !snapshot.slides?.length) return snapshot;
  const slide = snapshot.slides[slideIndex] ?? snapshot.slides[0];
  const editorState = slide.editorState;
  const layoutOverride = editorState?.layoutSettings;

  const projectedHeadline = slide.headline || snapshot.headline;
  const projectedBody = slide.body || snapshot.body;
  const projectedLayoutSettings: AdvancedLayoutSettings = layoutOverride
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
    : snapshot.layoutSettings;

  // Resolução do slide (SPEC-001): a resolução do slide atual NUNCA vaza
  // para `snapshot.slides` base — vive só no objeto retornado aqui. Reusa a
  // do editorState quando já foi calculada e nada relevante mudou; caso
  // contrário recalcula (determinístico — mesmos inputs, mesmo resultado).
  const cached = editorState?.resolvedTypography;
  const needsFreshResolution =
    !cached || cached.headline.text !== projectedHeadline || (projectedBody && cached.body?.text !== projectedBody);
  const { resolvedTypography, typographyResolutionError } = needsFreshResolution
    ? resolveSnapshotTypography({
        headline: projectedHeadline,
        body: projectedBody,
        aspectRatio: snapshot.aspectRatio,
        layoutSettings: projectedLayoutSettings,
        headlineFontFamily: editorState?.variation?.headlineFontFamily ?? snapshot.headlineFontFamily,
        bodyFontFamily: editorState?.variation?.bodyFontFamily ?? snapshot.bodyFontFamily,
        headlineFontSize: editorState?.variation?.headlineFontSize ?? snapshot.headlineFontSize,
        bodyFontSize: editorState?.variation?.bodyFontSize ?? snapshot.bodyFontSize,
        template: snapshot.template,
        sections: snapshot.sections,
      })
    : { resolvedTypography: cached, typographyResolutionError: editorState?.typographyResolutionError };

  return {
    ...snapshot,
    ...(editorState?.variation ?? {}),
    headline: projectedHeadline,
    body: projectedBody,
    imageSettings: {
      ...snapshot.imageSettings,
      ...(editorState?.imageSettings ?? {}),
    },
    layoutSettings: projectedLayoutSettings,
    bgValue: editorState?.bgValue ?? snapshot.bgValue,
    bgOverlay: {
      ...snapshot.bgOverlay,
      ...(editorState?.bgOverlay ?? {}),
    },
    resolvedTypography,
    typographyResolutionError,
  };
}

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

export function normalizeSectionLayouts(
  sections?: ContentSection[],
  layoutSettings?: AdvancedLayoutSettings,
): Record<string, LayoutPosition> {
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
