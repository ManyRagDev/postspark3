import type { ArsenalComposition, ArsenalElement, ArsenalRelation } from "./designArsenal";

export type PhysicalRect = { x: number; y: number; width: number; height: number };
export type PhysicalWorld = { x: number; y: number; scale: number; rotation: number };
type TextFit = Extract<ArsenalRelation, { kind: "textFit" }>;

/** Native relation limits are the writing/fitting envelope, not a promise that
 * neighboring content leaves all that space free. Resolved geometry is checked. */
export function authoredTextFitLimits(base: { id: string; width: number; height: number }, fit?: TextFit) {
  const outputs = fit?.outputs.find(output => output.targetId === base.id)?.properties;
  return {
    width: outputs?.includes("width") ? fit!.parameters.maxWidth : base.width,
    height: outputs?.includes("height") ? fit!.parameters.maxHeight : base.height,
  };
}

/** Same recursive order as Canvas paint, including groups. */
export function arsenalPaintOrder(c: ArsenalComposition) {
  const order = new Map<string, number>();
  const visit = (parentId: string | null) => {
    for (const node of [...c.elements, ...c.groups].filter(n => n.parentId === parentId)
      .sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id))) {
      order.set(node.id, order.size);
      if (!("kind" in node)) visit(node.id);
    }
  };
  visit(null);
  return order;
}

/** An opaque fixed canvas surface behind content is not a foreground obstacle.
 * Unknown/replaceable photos, rotation and foreground overlays stay obstacles. */
export function isCanvasBackdrop(c: ArsenalComposition, item: ArsenalElement,
  world: (element: ArsenalElement) => PhysicalWorld, order = arsenalPaintOrder(c)) {
  if (item.opacity !== 1 || item.bindingId || item.mediaSlot || item.imageReplacement ||
    !(item.kind === "rect" || item.kind === "media" && item.imageAssetId)) return false;
  for (let parent = item.parentId; parent;) {
    const group = c.groups.find(group => group.id === parent);
    if (!group || group.opacity !== 1) return false;
    parent = group.parentId;
  }
  const w = world(item);
  if (Math.abs(w.rotation) > 0.01 || w.scale <= 0 || w.x > 0.01 || w.y > 0.01 ||
    w.x + item.width * w.scale < c.artboard.width - 0.01 ||
    w.y + item.height * w.scale < c.artboard.height - 0.01) return false;
  const rank = order.get(item.id);
  return rank !== undefined && c.elements.filter(e => e.id !== item.id && e.opacity > 0 &&
    (e.bindingId || e.mediaSlot || e.kind === "text" && e.text.trim())).every(e => (order.get(e.id) ?? -1) > rank);
}

/** Konva Text uses alphabetic metrics of M, a one-font-size internal line and
 * top alignment; RichTextRenderer supplies outer leading in positioned runs. */
export function konvaTextBaseline(fontSize: number, ascent: number, descent: number) {
  return fontSize / 2 + (ascent - descent) / 2;
}
