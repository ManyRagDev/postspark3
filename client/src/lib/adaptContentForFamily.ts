import { DEFAULT_DESIGN_TOKENS, PostVisualSnapshot, PostVariation, TextElement, type DesignTokens } from "@shared/postspark";
import { composeVariation, directCreative, hashString } from "@shared/creative";

/**
 * Adapt a PostVisualSnapshot to a new Creative Family, PRESERVING user's manual edits
 * (drag and drop positions, text changes, explicitly set images).
 */
export function adaptContentForFamily(
  variation: PostVisualSnapshot,
  newFamilyId: string
): PostVisualSnapshot {
  const baseCreativeDir = variation.creativeDirection ?? directCreative(
    variation,
    null,
    hashString(variation.id),
  );
  const newCreativeDir = {
    ...baseCreativeDir,
    familyId: newFamilyId,
  };

  const baseForCompose: PostVariation = {
    ...variation,
    creativeDirection: newCreativeDir as PostVariation["creativeDirection"],
  };
  const brandTokens = {
    ...DEFAULT_DESIGN_TOKENS,
    ...(variation.designTokens ?? {}),
    colors: {
      ...DEFAULT_DESIGN_TOKENS.colors,
      ...(variation.designTokens as DesignTokens | undefined)?.colors,
      background: variation.backgroundColor,
      text: variation.textColor,
      primary: variation.accentColor,
    },
    typography: {
      ...DEFAULT_DESIGN_TOKENS.typography,
      ...(variation.designTokens as DesignTokens | undefined)?.typography,
    },
    structure: {
      ...DEFAULT_DESIGN_TOKENS.structure,
      ...(variation.designTokens as DesignTokens | undefined)?.structure,
    },
  } as DesignTokens;

  // Re-run the pure function with the requested family and real brand tokens.
  const composed = composeVariation(baseForCompose, brandTokens);

  // But wait! composed overwrites textElements, layoutSettings (which has no aspectRatio memory), etc.
  // We MUST MERGE the existing layoutSettingsByAspectRatio and text content to preserve the Workbench state.

  const mergedTextElements: TextElement[] = [];

  if (composed.textElements && variation.textElements) {
    // Para cada elemento gerado pelo novo layout, preservamos o texto (content) do usuário
    composed.textElements.forEach((newEl) => {
      const oldEl = variation.textElements!.find((e) => e.id === newEl.id);
      if (oldEl) {
        mergedTextElements.push({
          ...newEl,
          text: oldEl.text, // KEEP user's text
          // Maintain the manual formatting if desired (like bold tags in content)
          x: oldEl.x,
          y: oldEl.y,
          width: oldEl.width,
          height: oldEl.height,
          rotation: oldEl.rotation,
        });
      } else {
        mergedTextElements.push(newEl);
      }
    });

    // Adiciona elementos que o usuário possa ter criado manualmente e que não existem no preset da família
    variation.textElements.forEach((oldEl) => {
      if (!mergedTextElements.find((e) => e.id === oldEl.id)) {
        mergedTextElements.push(oldEl);
      }
    });
  } else {
    // Se não tiver textElements no novo, mantém os do antigo
    mergedTextElements.push(...(variation.textElements || []));
  }

  // We preserve ALL the layoutSettingsByAspectRatio because it holds the drag-and-drop state (freePosition, width, manual textAlign).
  // However, wait: the new family might change the default position of headline.
  // But if the user has `freePosition`, it overrides everything anyway.
  // We just deep merge: take the new base layoutSettings for this aspect ratio, and override with user's specific tweaks.
  // Actually, since `freePosition` is what matters, we just keep the whole `layoutSettingsByAspectRatio`.

  const newSnapshot: PostVisualSnapshot = {
    ...variation,
    ...composed,
    id: variation.id, // keep the same snapshot ID so React doesn't unmount the whole canvas
    aspectRatioOptimizations: undefined, // Fixes Holodeck -> Workbench color override bug!
    textElements: mergedTextElements,
    imageSettings: composed.imageSettings ? { ...composed.imageSettings } : variation.imageSettings,
    imageUrl: variation.imageUrl || composed.imageUrl, // Keep user image!
    // IMPORTANT: layoutSettingsByAspectRatio is the source of truth for drag positions!
    layoutSettingsByAspectRatio: variation.layoutSettingsByAspectRatio, 
    // And keep the selected background overlay/values if the user tweaked them (or let family dictate?)
    // Let's let the family dictate bgOverlay and bgValue if the user didn't explicitly lock them.
    // In this app, there's no "locked" flag, so we just let composed override base colors, 
    // but the position state (layoutSettingsByAspectRatio) is strictly preserved!
  };

  return newSnapshot as PostVisualSnapshot;
}
