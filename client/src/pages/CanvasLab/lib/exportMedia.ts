import type { CarouselSlideItem, CanvasPostModel } from "../components/types";
import { COMPOSITION_BACKGROUND_ID, COMPOSITION_LOGO_ID, getArsenalElementState } from "./editorElementState";
import type { ArsenalComposition } from "@shared/designArsenal";

/** Historical media can outlive its layer; exports wait only for the rendered graph. */
export function renderedCompositionImageCount(composition: ArsenalComposition): number {
  const groups = new Map(composition.groups.map(group => [group.id, group]));
  const images = composition.elements.filter(element => {
    if (!getArsenalElementState(composition, element.id).visible || element.kind !== "media" || !(composition.media[element.id]?.url || element.imageAssetId) || element.opacity <= 0) return false;
    const visited = new Set<string>();
    let parentId = element.parentId;
    while (parentId) {
      if (visited.has(parentId)) return false;
      visited.add(parentId);
      const parent = groups.get(parentId);
      if (!parent || parent.opacity <= 0) return false;
      parentId = parent.parentId;
    }
    return true;
  }).length;
  return images + (composition.version === 3
    ? Number(getArsenalElementState(composition, COMPOSITION_BACKGROUND_ID).visible && Boolean(composition.customBackground?.imageUrl))
      + Number(getArsenalElementState(composition, COMPOSITION_LOGO_ID).visible && Boolean(composition.logo?.url) && (composition.logo?.opacity ?? 1) > 0)
    : 0);
}

type ExportImageNode = {
  isVisible?: () => boolean;
  getAbsoluteOpacity?: () => number;
  image?: () => { complete?: boolean; naturalWidth?: number } | undefined;
};

/** Konva visibility includes parent visibility; absolute opacity includes every ancestor. */
export function visibleExportImageNodes<T extends ExportImageNode>(nodes: readonly T[]): T[] {
  return nodes.filter(node => node.isVisible?.() !== false && (node.getAbsoluteOpacity?.() ?? 1) > 0);
}

export function exportImageNodeReady(node: ExportImageNode): boolean {
  const image = node.image?.();
  return Boolean(image?.complete && image.naturalWidth && image.naturalWidth > 0);
}

/** Native exports and previews share the same visible media graph. */
export function renderedNativeImageCount(slide: CarouselSlideItem, post: CanvasPostModel): number {
  const visible = (id: string) => !slide.elementStates?.[id]?.hidden;
  return Number(visible("background") && Boolean(slide.bgImage ?? post.bgImage))
    + Number(visible("logo") && Boolean(slide.logo ? slide.logo.url : post.logoUrl) && (slide.logo?.opacity ?? 1) > 0)
    + (slide.extraImages ?? post.extraImages ?? []).filter(image => visible(image.id) && Boolean(image.url) && (image.opacity ?? 1) > 0).length;
}

/** Transient loading projection; the authoring document and assets stay intact. */
export function visibleCompositionAssets(composition: ArsenalComposition): ArsenalComposition {
  const groups = new Map(composition.groups.map(group => [group.id, group]));
  return { ...composition, elements: composition.elements.filter(element => {
    if (!getArsenalElementState(composition, element.id).visible || element.opacity <= 0) return false;
    let parent = element.parentId;
    const seen = new Set<string>();
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      const group = groups.get(parent);
      if (!group || group.opacity <= 0) return false;
      parent = group.parentId;
    }
    return !parent;
  }) };
}
