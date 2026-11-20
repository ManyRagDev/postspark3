import type { CanvasPostModel } from "../components/types";
import {
  executeEditorCommand,
  projectEditorLayers,
  resolveEditorProperties,
  type EditorCommand,
  type EditorCommandResult,
  type EditorGeometry,
  type EditorLayer,
  type EditorTarget,
} from "./editorController";
import { arsenalWorldGeometry } from "./arsenalComposition";

export type SelectionModifiers = {
  toggle?: boolean;
  range?: boolean;
  order?: string[];
};
export type EditorSelection = {
  slideId: string;
  ids: string[];
  anchor?: string;
};

export function flattenEditorLayers(layers: EditorLayer[]): EditorLayer[] {
  return layers.flatMap(layer => [
    layer,
    ...flattenEditorLayers(layer.children),
  ]);
}

/** Parents and children cannot both receive a transform. Selection never enters the document. */
export function normalizeEditorSelection(
  layers: EditorLayer[],
  ids: readonly string[]
): string[] {
  const all = new Map(
    flattenEditorLayers(layers).map(layer => [layer.id, layer])
  );
  const chosen = new Set(ids.filter(id => all.has(id)));
  return Array.from(chosen).filter(id => {
    let parent = all.get(id)?.parentId;
    while (parent) {
      if (chosen.has(parent)) return false;
      parent = all.get(parent)?.parentId;
    }
    return true;
  });
}

export function selectEditorTarget(
  layers: EditorLayer[],
  previous: EditorSelection | null,
  target: EditorTarget,
  modifiers: SelectionModifiers = {}
): EditorSelection {
  const ids = previous?.slideId === target.slideId ? previous.ids : [];
  const anchor =
    previous?.slideId === target.slideId ? previous.anchor : undefined;
  let next: string[];
  if (modifiers.range && anchor && modifiers.order?.includes(anchor)) {
    const from = modifiers.order.indexOf(anchor),
      to = modifiers.order.indexOf(target.elementId);
    next =
      to < 0
        ? [target.elementId]
        : modifiers.order.slice(Math.min(from, to), Math.max(from, to) + 1);
    if (modifiers.toggle) next = [...ids, ...next];
  } else if (modifiers.toggle) {
    next = ids.includes(target.elementId)
      ? ids.filter(id => id !== target.elementId)
      : [...ids, target.elementId];
    // Explicitly choosing a child replaces a previously selected ancestor.
    if (!ids.includes(target.elementId)) {
      const all = new Map(
        flattenEditorLayers(layers).map(layer => [layer.id, layer])
      );
      let parent = all.get(target.elementId)?.parentId;
      while (parent) {
        next = next.filter(id => id !== parent);
        parent = all.get(parent)?.parentId;
      }
    }
  } else next = [target.elementId];
  return {
    slideId: target.slideId,
    ids: normalizeEditorSelection(layers, next),
    anchor: modifiers.range ? (anchor ?? target.elementId) : target.elementId,
  };
}

/** Atomic batch: failure discards every tentative mutation; the page commits once. */
export function executeEditorSelectionCommand(
  post: CanvasPostModel,
  selection: EditorSelection,
  command: EditorCommand,
  geometries: Record<string, EditorGeometry> = {}
): EditorCommandResult {
  const layers = projectEditorLayers(post, selection.slideId);
  const ids = normalizeEditorSelection(layers, selection.ids);
  if (!ids.length || ids.length !== selection.ids.length)
    return {
      ok: false,
      post,
      reason: "A seleção mudou. Selecione novamente os objetos.",
    };
  let next = post;
  for (const elementId of ids) {
    const geometry = geometries[elementId];
    const result = executeEditorCommand(
      next,
      { slideId: selection.slideId, elementId },
      geometry &&
        (command.type === "properties" ||
          command.type === "align" ||
          command.type === "duplicate")
        ? { ...command, geometry }
        : command
    );
    if (!result.ok) return { ...result, post };
    next = result.post;
  }
  return {
    ok: true,
    post: next,
    ...(command.type === "remove" ? { selection: null } : {}),
  };
}

export type SelectionTransform = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  scale: number;
};

/** Uniform scale/translation in artboard coordinates, independent of CSS zoom. */
export function transformEditorSelection(
  post: CanvasPostModel,
  selection: EditorSelection,
  transform: SelectionTransform,
  geometries: Record<string, EditorGeometry>
): EditorCommandResult {
  const { x, y, dx, dy, scale } = transform;
  if (![x, y, dx, dy, scale].every(Number.isFinite) || scale <= 0)
    return { ok: false, post, reason: "Transformação inválida." };
  if (dx === 0 && dy === 0 && scale === 1) return { ok: true, post };
  const layers = projectEditorLayers(post, selection.slideId);
  const ids = normalizeEditorSelection(layers, selection.ids);
  if (!ids.length || ids.length !== selection.ids.length)
    return {
      ok: false,
      post,
      reason: "A seleção mudou. Selecione novamente os objetos.",
    };
  const slide = post.slides.find(s => s.id === selection.slideId)!;
  let next = post;
  for (const id of ids) {
    const layer = flattenEditorLayers(layers).find(l => l.id === id)!;
    const geometry = geometries[id];
    if (
      !geometry ||
      !layer.visible ||
      layer.locked ||
      layer.kind === "background"
    )
      return {
        ok: false,
        post,
        reason:
          "Selecione objetos visíveis e desbloqueados para transformar o conjunto.",
      };
    const { values, supported } = resolveEditorProperties(post, layer.target);
    let moveX = x + (geometry.x - x) * scale + dx - geometry.x;
    let moveY = y + (geometry.y - y) * scale + dy - geometry.y;
    const node =
      slide.composition &&
      [...slide.composition.elements, ...slide.composition.groups].find(
        n => n.id === id
      );
    if (node?.parentId && slide.composition) {
      const parent = slide.composition.groups.find(
        g => g.id === node.parentId
      )!;
      const world = arsenalWorldGeometry(parent, slide.composition.groups);
      const angle = (-world.rotation * Math.PI) / 180,
        factor = world.scale * parent.scale;
      [moveX, moveY] = [
        (moveX * Math.cos(angle) - moveY * Math.sin(angle)) / factor,
        (moveX * Math.sin(angle) + moveY * Math.cos(angle)) / factor,
      ];
    }
    const patch: Record<string, number> = {
      x: (node?.x ?? Number(values.x ?? geometry.x)) + moveX,
      y: (node?.y ?? Number(values.y ?? geometry.y)) + moveY,
    };
    if (scale !== 1) {
      if (layer.kind === "group")
        patch.scale = Number(values.scale ?? 1) * scale;
      else if (supported.includes("scaleX")) {
        patch.scaleX = Number(values.scaleX ?? 1) * scale;
        patch.scaleY = Number(values.scaleY ?? 1) * scale;
      } else {
        if (supported.includes("width"))
          patch.width = Number(values.width ?? geometry.width) * scale;
        if (layer.kind === "text") {
          if (supported.includes("sizeScale"))
            patch.sizeScale = Number(values.sizeScale ?? 1) * scale;
          else
            patch.fontSize =
              Number(values.fontSize ?? geometry.fontSize ?? 24) * scale;
        } else if (supported.includes("height"))
          patch.height = Number(values.height ?? geometry.height) * scale;
      }
    }
    const result = executeEditorCommand(next, layer.target, {
      type: "properties",
      patch,
      geometry,
    });
    if (!result.ok) return { ...result, post };
    next = result.post;
  }
  return { ok: true, post: next };
}
