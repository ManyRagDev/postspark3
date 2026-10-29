import type {
  ArsenalComposition,
  CanvasElementStates,
} from "@shared/designArsenal";
import type { CanvasPostModel } from "../components/types";

export type EditorElementState = { visible: boolean; locked: boolean };
export const COMPOSITION_BACKGROUND_ID = "__canvas_background__";
export const COMPOSITION_LOGO_ID = "__canvas_logo__";

/** Ancestor restrictions are reported separately from an object's own state. */
export function getArsenalElementStateInheritance(
  c: ArsenalComposition,
  id: string
): {
  hiddenByAncestor?: { id: string; label: string };
  lockedByAncestor?: { id: string; label: string };
} {
  const nodes = [...c.elements, ...c.groups];
  const inherited: ReturnType<typeof getArsenalElementStateInheritance> = {};
  let parentId = nodes.find(node => node.id === id)?.parentId;
  const seen = new Set([id]);
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const group = c.groups.find(group => group.id === parentId);
    if (!group) break;
    const state = c.elementStates?.[group.id];
    const ancestor = { id: group.id, label: group.label || "Grupo" };
    if (state?.hidden && !inherited.hiddenByAncestor)
      inherited.hiddenByAncestor = ancestor;
    if (state?.locked && !inherited.lockedByAncestor)
      inherited.lockedByAncestor = ancestor;
    parentId = group.parentId;
  }
  return inherited;
}

export function getArsenalElementState(
  c: ArsenalComposition,
  id: string
): EditorElementState {
  const nodes = [...c.elements, ...c.groups];
  let current: string | null = id;
  const seen = new Set<string>();
  let visible = true,
    locked = false;
  while (current && !seen.has(current)) {
    seen.add(current);
    const state = c.elementStates?.[current];
    visible &&= !state?.hidden;
    locked ||= state?.locked === true;
    current = nodes.find(n => n.id === current)?.parentId ?? null;
  }
  return { visible, locked };
}

export function getEditorElementState(
  post: CanvasPostModel,
  slideId: string,
  id: string
): EditorElementState {
  const slide = post.slides.find(s => s.id === slideId);
  if (!slide) return { visible: false, locked: true };
  if (slide.composition) return getArsenalElementState(slide.composition, id);
  const state = slide.elementStates?.[id];
  return { visible: !state?.hidden, locked: state?.locked === true };
}

export function patchEditorElementState(
  states: CanvasElementStates | undefined,
  id: string,
  patch: { hidden?: boolean; locked?: boolean }
): CanvasElementStates {
  return { ...states, [id]: { ...states?.[id], ...patch } };
}

/** Canonical back-to-front order, including new objects absent from older metadata. */
export function resolveEditorElementOrder(
  naturalOrder: readonly string[],
  storedOrder?: readonly string[]
): string[] {
  const existing = new Set(naturalOrder);
  return Array.from(
    new Set([
      ...(existing.has("background") ? ["background"] : []),
      ...(storedOrder ?? []).filter(id => existing.has(id)),
      ...naturalOrder,
    ])
  );
}
