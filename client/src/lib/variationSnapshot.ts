import type { AdvancedLayoutSettings, AspectRatio, ContentSection, LayoutPosition, PostVariation, PostVisualSnapshot } from "@shared/postspark";
import type { EditorState } from "@/store/editorStore";

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
  const sections = normalizeSections(active.sections ?? base.sections);
  const layoutSettings = {
    ...editorState.baseLayoutSettings,
    sectionLayouts: normalizeSectionLayouts(sections, editorState.baseLayoutSettings),
  };

  return {
    snapshotVersion: 1,
    ...base,
    ...active,
    aspectRatio,
    postMode: editorState.postMode,
    slides: editorState.slides,
    sections,
    textElements: active.textElements ?? base.textElements,
    imageSettings: editorState.baseImageSettings,
    layoutSettings,
    bgValue: editorState.baseBgValue,
    bgOverlay: editorState.baseBgOverlay,
  } as PostVisualSnapshot;
}
