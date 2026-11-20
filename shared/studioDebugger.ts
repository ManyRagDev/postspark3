import type { ArsenalComposition } from "./designArsenal";
export interface StudioDebugStep {
  id: string;
  at: string | null;
  origin: "Servidor" | "CanvasLab";
  title: string;
  status: string;
  detail: unknown;
}

export type AssemblyObserver = (
  title: string,
  status: string,
  detail?: Record<string, unknown>
) => void;

export function describeDebugScene(c: ArsenalComposition) {
  return {
    variant: c.sourceVariantKey,
    artboard: c.artboard,
    groups: c.groups,
    relations: c.relations,
    bindings: c.base.bindings,
    layers: c.elements.map(e => ({
      id: e.id,
      parentId: e.parentId,
      order: e.zIndex,
      kind: e.kind,
      x: e.x,
      y: e.y,
      width: e.width,
      height: e.height,
      text: e.text || undefined,
      binding: e.bindingId,
      font: e.kind === "text" ? e.fontFamily : undefined,
      size: e.kind === "text" ? e.fontSize : undefined,
    })),
    issues: c.issues,
  };
}
