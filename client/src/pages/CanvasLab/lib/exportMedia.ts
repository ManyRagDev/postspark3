import type { ArsenalComposition } from "@shared/designArsenal";

/** Historical media can outlive its layer; exports wait only for the rendered graph. */
export function renderedCompositionImageCount(composition: ArsenalComposition): number {
  const groups = new Map(composition.groups.map(group => [group.id, group]));
  const images = composition.elements.filter(element => {
    if (element.kind !== "media" || !composition.media[element.id]?.url || element.opacity <= 0) return false;
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
    ? Number(Boolean(composition.customBackground?.imageUrl))
      + Number(Boolean(composition.logo?.url) && (composition.logo?.opacity ?? 1) > 0)
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
