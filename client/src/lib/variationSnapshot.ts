import type { AspectRatio, ContentSection, PostVariation } from "@shared/postspark";
import type { AdvancedLayoutSettings } from "@/types/editor";
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

export function normalizeVariationForEditor(variation: PostVariation): PostVariation {
  return {
    ...variation,
    sections: normalizeSections(variation.sections),
  };
}

export function normalizeSectionLayouts(
  sections?: ContentSection[],
  layoutSettings?: AdvancedLayoutSettings,
): Record<string, any> {
  const existing = layoutSettings?.sectionLayouts ?? {};
  const normalized = normalizeSections(sections) ?? [];

  return normalized.reduce<Record<string, any>>((acc, section, index) => {
    if (!section.id) return acc;
    acc[section.id] = existing[section.id] ?? {
      ...DEFAULT_LAYOUT_SETTINGS.body,
      position: "center",
      textAlign: "center",
      width: 28,
      freePosition: {
        x: normalized.length === 1 ? 50 : 20 + index * (60 / Math.max(normalized.length - 1, 1)),
        y: 66,
      },
    };
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

