import type {
  AdvancedLayoutSettings,
  AspectRatio,
  PostVariation,
  PostVisualSnapshot,
} from "@shared/postspark";
import type { EditorState } from "@/store/editorStore";
import {
  normalizeSectionLayouts,
  normalizeSections,
  synchronizeDesignTokenColors,
} from "@shared/variationSnapshot";

export {
  applyAspectRatioToVariation,
  applyDesignTokensToSnapshot,
  createPostVisualSnapshot,
  hasManualSectionLayouts,
  normalizeSectionIcon,
  normalizeSectionLayouts,
  normalizeSections,
  normalizeVariationForEditor,
  projectSnapshotForSlide,
  resolveVariationColorsForAspectRatio,
} from "@shared/variationSnapshot";

export function buildVariationSnapshot(
  editorState: EditorState,
  fallback: PostVariation,
  aspectRatio: AspectRatio,
): PostVisualSnapshot {
  const active = editorState.activeVariation ?? fallback;
  const base = editorState.baseVariation ?? active;
  const canonicalVariation = editorState.postMode === "carousel" ? base : active;
  const sections = normalizeSections(canonicalVariation.sections ?? base.sections);
  const layoutSettings: AdvancedLayoutSettings = {
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
