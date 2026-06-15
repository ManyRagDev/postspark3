import type { AspectRatio, ContentSection, PostTemplate, PostVariation } from "@shared/postspark";
import type { AdvancedLayoutSettings, LayoutPosition } from "@/types/editor";
import { DEFAULT_LAYOUT_SETTINGS } from "@/types/editor";
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

const RATIO_LAYOUT_CONFIG: Record<
  AspectRatio,
  { gridColumns: number; top: number; bottom: number }
> = {
  "1:1": { gridColumns: 3, top: 61, bottom: 79 },
  "5:6": { gridColumns: 2, top: 59, bottom: 82 },
  "9:16": { gridColumns: 2, top: 56, bottom: 78 },
};

export function buildResponsiveSectionLayouts(
  sections: ContentSection[] | undefined,
  template: PostTemplate | undefined,
  aspectRatio: AspectRatio,
): Record<string, LayoutPosition> {
  const normalized = normalizeSections(sections) ?? [];
  if (!normalized.length || !template || template === "simple") return {};

  const config = RATIO_LAYOUT_CONFIG[aspectRatio];
  const isList = template === "numbered-list" || template === "step-by-step";
  const columns = isList ? 1 : Math.min(config.gridColumns, normalized.length);
  const rows = Math.ceil(normalized.length / columns);
  const rowGap = rows > 1 ? (config.bottom - config.top) / (rows - 1) : 0;

  return normalized.reduce<Record<string, LayoutPosition>>((layouts, section, index) => {
    if (!section.id) return layouts;

    const row = Math.floor(index / columns);
    const itemsInRow = Math.min(columns, normalized.length - row * columns);
    const column = index - row * columns;
    const horizontalGap = itemsInRow > 1 ? 64 / (itemsInRow - 1) : 0;
    const x = itemsInRow === 1 ? 50 : 18 + column * horizontalGap;
    const width = isList ? (aspectRatio === "9:16" ? 78 : 74) : columns === 3 ? 27 : 36;

    layouts[section.id] = {
      position: "center",
      textAlign: isList ? "left" : "center",
      width,
      freePosition: {
        x,
        y: config.top + row * rowGap,
      },
    };
    return layouts;
  }, {});
}

export function buildResponsiveLayoutSettings(
  variation: PostVariation,
): Partial<Record<AspectRatio, AdvancedLayoutSettings>> {
  const ratios: AspectRatio[] = ["1:1", "5:6", "9:16"];
  const base = {
    ...DEFAULT_LAYOUT_SETTINGS,
    ...((variation.layoutSettings as Partial<AdvancedLayoutSettings> | undefined) ?? {}),
  };
  const existing = variation.layoutSettingsByAspectRatio ?? {};

  return Object.fromEntries(
    ratios.map((ratio) => {
      const saved = existing[ratio] as Partial<AdvancedLayoutSettings> | undefined;
      return [
        ratio,
        {
          ...base,
          ...(saved ?? {}),
          sectionLayouts:
            saved?.sectionLayouts ??
            buildResponsiveSectionLayouts(variation.sections, variation.template, ratio),
        },
      ];
    }),
  ) as Partial<Record<AspectRatio, AdvancedLayoutSettings>>;
}

export function normalizeVariationForEditor(variation: PostVariation): PostVariation {
  const normalizedSections = normalizeSections(variation.sections);
  const normalizedVariation = {
    ...variation,
    sections: normalizedSections,
  };
  return {
    ...normalizedVariation,
    layoutSettingsByAspectRatio: buildResponsiveLayoutSettings(normalizedVariation),
  };
}

export function normalizeSectionLayouts(
  sections?: ContentSection[],
  layoutSettings?: AdvancedLayoutSettings,
): Record<string, any> {
  const existing = layoutSettings?.sectionLayouts ?? {};
  const normalized = normalizeSections(sections) ?? [];
  const fallback = buildResponsiveSectionLayouts(normalized, "feature-grid", "1:1");

  return normalized.reduce<Record<string, any>>((acc, section) => {
    if (!section.id) return acc;
    acc[section.id] = existing[section.id] ?? fallback[section.id];
    return acc;
  }, {});
}

export function buildVariationSnapshot(editorState: EditorState, fallback: PostVariation, aspectRatio: AspectRatio) {
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
  };
}
