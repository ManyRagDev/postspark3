import { PostVisualSnapshot, PostVariation, TextElement } from "@shared/postspark";
import { composeVariation } from "@shared/creative/compose";

/**
 * Adapt a PostVisualSnapshot to a new Creative Family, PRESERVING user's manual edits
 * (drag and drop positions, text changes, explicitly set images).
 */
export function adaptContentForFamily(
  variation: PostVisualSnapshot,
  newFamilyId: string
): PostVisualSnapshot {
  const newCreativeDir = {
    ...variation.creativeDirection,
    familyId: newFamilyId,
    // Preserve other traits like palette, ornaments tweaks
  };

  // Re-run the pure function to get the target layout/designTokens for this family
  const composed = composeVariation(variation, newCreativeDir as any);

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
