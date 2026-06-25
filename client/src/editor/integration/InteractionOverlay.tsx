import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { Trash2 } from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import type { ResizeHandle, DocumentRect } from "../geometry";
import { createCanvasViewport, documentSize, screenRect, screenToDocumentRect } from "../geometry";
import { useCanvasInteraction } from "./CanvasInteractionProvider";

const HANDLE_MAP: Record<"flow-right" | "horizontal" | "corners", readonly ResizeHandle[]> = {
  "flow-right": ["right"],
  horizontal: ["left", "right"],
  corners: ["top-left", "top-right", "bottom-right", "bottom-left"],
};

function positionFor(handle: ResizeHandle): React.CSSProperties {
  return {
    left: handle.includes("left") ? 0 : handle.includes("right") || handle === "right" ? "100%" : "50%",
    top: handle.includes("top") ? 0 : handle.includes("bottom") ? "100%" : "50%",
    transform: "translate(-50%, -50%)",
    cursor: handle.includes("left") || handle.includes("right") || handle === "left" || handle === "right"
      ? handle.includes("top") || handle.includes("bottom") ? (handle === "top-left" || handle === "bottom-right" ? "nwse-resize" : "nesw-resize") : "ew-resize"
      : "ns-resize",
  };
}

export function InteractionOverlay() {
  const context = useCanvasInteraction();
  const [idleRect, setIdleRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const selectedId = useEditorStore(state => state.layoutTarget);
  const magnetActive = useEditorStore(state => state.isMagnetActive);
  const registryVersion = useSyncExternalStore(
    context?.registry.subscribe.bind(context.registry) ?? (() => () => undefined),
    context?.registry.getVersion ?? (() => 0),
    () => 0,
  );
  const interactionState = useSyncExternalStore(
    context?.controller.subscribe.bind(context.controller) ?? (() => () => undefined),
    context?.controller.getState.bind(context.controller) ?? (() => ({ phase: "idle" as const })),
    () => ({ phase: "idle" as const }),
  );
  const entry = context?.registry.get(selectedId);
  const node = entry?.nodeRef.current;

  useLayoutEffect(() => {
    if (!context) {
      setIdleRect(null);
      return;
    }
    const canvas = context.getCanvas();
    const currentNode = context.registry.get(selectedId)?.nodeRef.current;
    if (!canvas || !currentNode || canvas.clientWidth <= 0 || canvas.clientHeight <= 0) {
      setIdleRect(null);
      return;
    }
    const rootRect = canvas.getBoundingClientRect();
    const nodeRect = currentNode.getBoundingClientRect();
    try {
      const viewport = createCanvasViewport(
        screenRect(rootRect.left, rootRect.top, rootRect.width, rootRect.height),
        documentSize(canvas.clientWidth, canvas.clientHeight),
      );
      const measured = screenToDocumentRect(
        screenRect(nodeRect.left, nodeRect.top, nodeRect.width, nodeRect.height),
        viewport,
      );
      setIdleRect({ left: measured.x, top: measured.y, width: measured.width, height: measured.height });
    } catch {
      setIdleRect(null);
    }
  }, [context, registryVersion, selectedId]);

  if (!context) return null;
  if (!entry || !node || entry.handlePolicy === "none") return null;
  const handles = HANDLE_MAP[entry.handlePolicy];
  const activeDraft = (interactionState.phase === "dragging" || interactionState.phase === "resizing") &&
    interactionState.initial.id === selectedId
    ? interactionState.draft.rect
    : null;
  const overlayRect = activeDraft
    ? { left: activeDraft.x, top: activeDraft.y, width: activeDraft.width, height: activeDraft.height }
    : idleRect;
  if (!overlayRect) return null;
  const snapGuides = interactionState.phase === "dragging" || interactionState.phase === "resizing"
    ? (interactionState as { snapGuides?: { guideX: number | null; guideY: number | null; candidateIdX: string | null; candidateIdY: string | null } }).snapGuides
    : undefined;
  const showGuideX = magnetActive && snapGuides?.guideX !== null && snapGuides?.guideX !== undefined;
  const showGuideY = magnetActive && snapGuides?.guideY !== null && snapGuides?.guideY !== undefined;

  return (
    <>
    {(showGuideX || showGuideY) && (
      <div className="pointer-events-none absolute inset-0 z-[190]">
        {showGuideX && (
          <div
            className="absolute top-0 bottom-0 border-l border-dashed"
            style={{ left: snapGuides!.guideX!, borderColor: entry.accentColor }}
          />
        )}
        {showGuideY && (
          <div
            className="absolute left-0 right-0 border-t border-dashed"
            style={{ top: snapGuides!.guideY!, borderColor: entry.accentColor }}
          />
        )}
      </div>
    )}
    <div
      data-interaction-overlay
      className="pointer-events-none absolute z-[200]"
      style={{
        left: overlayRect.left,
        top: overlayRect.top,
        width: overlayRect.width,
        height: overlayRect.height,
        border: `1.5px solid ${entry.accentColor}`,
        borderRadius: 3,
      }}
    >
      {handles.map(handle => (
        <div
          key={handle}
          role="presentation"
          data-overlay-resize-handle={handle}
          className="pointer-events-auto absolute h-[10px] w-[10px] rounded-sm border-2 border-white shadow"
          style={{ background: entry.accentColor, touchAction: "none", ...positionFor(handle) }}
          onPointerDown={event => context.beginTarget(entry.id, { type: "resize", handle }, event)}
          onPointerMove={event => context.preview(event)}
          onPointerUp={event => context.commit(event)}
          onPointerCancel={event => context.cancel(event.pointerId)}
          onLostPointerCapture={event => context.cancel(event.pointerId)}
        />
      ))}
      {entry.onDelete && (
        <button
          type="button"
          className="pointer-events-auto absolute -right-3 -top-3 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-red-500 shadow-lg"
          onClick={event => { event.stopPropagation(); entry.onDelete?.(); }}
          title="Remover elemento"
        >
          <Trash2 size={12} color="#fff" />
        </button>
      )}
    </div>
    </>
  );
}
