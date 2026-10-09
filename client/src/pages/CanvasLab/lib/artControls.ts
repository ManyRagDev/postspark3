import type { ArsenalComposition, ArsenalElement, ArsenalGroup } from "@shared/designArsenal";
import { arsenalWorldGeometry } from "@shared/arsenalGeometry";
import { overrideArsenalElement } from "./arsenalComposition";

type Node = ArsenalElement | ArsenalGroup;
type Bounds = { x: number; y: number; width: number; height: number };
const isElement = (node: Node): node is ArsenalElement => "kind" in node;

function localPointFromWorld(c: ArsenalComposition, parentId: string | null, x: number, y: number) {
  const ancestors: ArsenalGroup[] = [];
  let id = parentId;
  while (id) {
    const parent = c.groups.find(group => group.id === id);
    if (!parent) throw new Error("Grupo ausente");
    ancestors.push(parent);
    id = parent.parentId;
  }
  for (const group of ancestors.reverse()) {
    const dx = (x - group.x) / group.scale;
    const dy = (y - group.y) / group.scale;
    const angle = (-group.rotation * Math.PI) / 180;
    x = dx * Math.cos(angle) - dy * Math.sin(angle);
    y = dx * Math.sin(angle) + dy * Math.cos(angle);
  }
  return { x, y };
}

function descendants(c: ArsenalComposition, groupId: string): ArsenalElement[] {
  const groupIds = new Set([groupId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of c.groups) {
      if (group.parentId && groupIds.has(group.parentId) && !groupIds.has(group.id)) {
        groupIds.add(group.id);
        changed = true;
      }
    }
  }
  return c.elements.filter(element => element.parentId !== null && groupIds.has(element.parentId));
}

/** Axis-aligned bounds of the selected visible element, or of a group's visual descendants. */
export function artSelectionBounds(c: ArsenalComposition, id: string): Bounds | null {
  const selected = c.elements.find(element => element.id === id) ?? c.groups.find(group => group.id === id);
  if (!selected) return null;
  const visualElements = isElement(selected) ? [selected] : descendants(c, id);
  if (!visualElements.length) return null;
  const points = visualElements.flatMap(element => {
    const world = arsenalWorldGeometry(element, c.groups);
    const angle = (world.rotation * Math.PI) / 180;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return [
      [0, 0], [element.width, 0], [0, element.height], [element.width, element.height],
    ].map(([x, y]) => ({
      x: world.x + world.scale * (x * cos - y * sin),
      y: world.y + world.scale * (x * sin + y * cos),
    }));
  });
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  const left = Math.min(...xs), top = Math.min(...ys), right = Math.max(...xs), bottom = Math.max(...ys);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Centers the selected visual bounds on one artboard axis, preserving the parent transform. */
export function centerArtSelection(c: ArsenalComposition, id: string, axis: "horizontal" | "vertical"): ArsenalComposition {
  const node = c.elements.find(element => element.id === id) ?? c.groups.find(group => group.id === id);
  const bounds = artSelectionBounds(c, id);
  if (!node || !bounds) return c;
  const world = arsenalWorldGeometry(node, c.groups);
  const delta = axis === "horizontal"
    ? c.artboard.width / 2 - (bounds.x + bounds.width / 2)
    : c.artboard.height / 2 - (bounds.y + bounds.height / 2);
  const local = localPointFromWorld(c, node.parentId, world.x + (axis === "horizontal" ? delta : 0), world.y + (axis === "vertical" ? delta : 0));
  return overrideArsenalElement(c, id, local);
}

export function rotateArtSelection(c: ArsenalComposition, id: string, degrees: -3 | 3): ArsenalComposition {
  const node = c.elements.find(element => element.id === id) ?? c.groups.find(group => group.id === id);
  return node ? overrideArsenalElement(c, id, { rotation: node.rotation + degrees }) : c;
}

/** Applies a restrained group scale step around the visual center; empty groups stay untouched. */
export function emphasizeArtGroup(c: ArsenalComposition, id: string, direction: "increase" | "decrease"): ArsenalComposition {
  const group = c.groups.find(candidate => candidate.id === id);
  const bounds = group && artSelectionBounds(c, id);
  if (!group || !bounds) return c;
  const multiplier = direction === "increase" ? 1.1 : 0.9;
  const nextScale = Math.min(4, Math.max(0.1, group.scale * multiplier));
  if (nextScale === group.scale) return c;
  const factor = nextScale / group.scale;
  const world = arsenalWorldGeometry(group, c.groups);
  const centerX = bounds.x + bounds.width / 2, centerY = bounds.y + bounds.height / 2;
  const nextOriginX = world.x + (1 - factor) * (centerX - world.x);
  const nextOriginY = world.y + (1 - factor) * (centerY - world.y);
  const local = localPointFromWorld(c, group.parentId, nextOriginX, nextOriginY);
  return overrideArsenalElement(c, id, { ...local, scale: nextScale });
}
