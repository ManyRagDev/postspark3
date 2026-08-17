import type {
  AdvancedLayoutSettings,
  AspectRatio,
  PostVariation,
  PostVisualSnapshot,
} from "@shared/postspark";
import type { EditorState } from "@/store/editorStore";
import {
  createPostVisualSnapshot,
  normalizeSectionLayouts,
  normalizeSections,
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
  synchronizeDesignTokenColors,
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

  // Fase A.1 — o editor é o produtor autoritativo da geometria. Montamos um
  // draft PostVariation que injeta os campos vivos do editor (layout, imagem,
  // bg, overlay) no nível raiz, para que createPostVisualSnapshot os honre e
  // atravesse applyVisualFitFallback (fronteira canônica). Assim geração e
  // edição manual compartilham o mesmo normalizador.
  //
  // layoutSettingsByAspectRatio NÃO é sobrescrito: ele preserva a geometria
  // canônica por ratio que já veio da variação (pré-fallback). Injetar o layout
  // vivo ali poluiria a geometria de outros ratios com o estado pós-fallback
  // do ratio ativo. O layoutSettings raiz (injetado) é a fonte da verdade para
  // o snapshot do ratio corrente.
  const editorLayoutSettings: AdvancedLayoutSettings = {
    ...editorState.baseLayoutSettings,
    sectionLayouts: normalizeSectionLayouts(sections, editorState.baseLayoutSettings),
  };
  const draft: PostVariation = {
    ...base,
    ...canonicalVariation,
    sections,
    layoutSettings: editorLayoutSettings,
    imageSettings: editorState.baseImageSettings,
    bgValue: editorState.baseBgValue,
    bgOverlay: editorState.baseBgOverlay,
  };

  const snapshot = createPostVisualSnapshot(draft, aspectRatio);

  // createPostVisualSnapshot não conhece os overrides de carrossel serializados
  // pelo editor em slides[].editorState. Restauramos slides verbatim sobre o
  // snapshot canonizado. O postMode do editor também prevalece.
  return {
    ...snapshot,
    postMode: editorState.postMode,
    slides: editorState.slides,
  };
}
