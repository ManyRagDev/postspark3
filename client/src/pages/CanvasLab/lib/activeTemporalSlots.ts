import type { CanvasPostModel } from "../components/types";
import { BACKGROUND_SLOT, targetExists } from "./mediaSlots";
import {
  COMPOSITION_BACKGROUND_ID,
  getEditorElementState,
} from "./editorElementState";

export function activeTemporalSlots(post: CanvasPostModel, index: number) {
  const slide = post.slides[index];
  if (!slide?.temporalMedia) return [];
  return Object.keys(slide.temporalMedia).filter(slotId => {
    if (!targetExists(post, { postId: post.id, slideId: slide.id, slotId }))
      return false;
    const id =
      slotId === BACKGROUND_SLOT
        ? slide.composition
          ? COMPOSITION_BACKGROUND_ID
          : "background"
        : slotId;
    if (!getEditorElementState(post, slide.id, id).visible) return false;
    const element = slide.composition?.elements.find(e => e.id === id);
    if (
      element?.opacity === 0 ||
      (!slide.composition &&
        (slide.extraImages ?? post.extraImages)?.find(
          image => image.id === slotId
        )?.opacity === 0)
    )
      return false;
    let parentId = element?.parentId;
    const seen = new Set<string>();
    while (parentId) {
      const group = slide.composition?.groups.find(g => g.id === parentId);
      if (
        !group ||
        seen.has(parentId) ||
        group.opacity === 0 ||
        !getEditorElementState(post, slide.id, parentId).visible
      )
        return false;
      seen.add(parentId);
      parentId = group.parentId;
    }
    return true;
  });
}
