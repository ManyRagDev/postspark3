import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { EditorLayer, EditorTarget } from "../lib/editorController";
import type { LayerDrop } from "../lib/editorElementState";

type Gesture = {
  pointerId: number;
  source: EditorLayer;
  startY: number;
  startX: number;
  x: number;
  y: number;
  list: HTMLElement;
  scrollPort: HTMLElement | null;
};

function dropAtPointer(gesture: Gesture): LayerDrop | null {
  const { source, list, x, y } = gesture;
  const row = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>("[data-layer-row]");
  if (
    !row ||
    !list.contains(row) ||
    row.dataset.layerParent !== (source.parentId ?? "") ||
    row.dataset.fixedEdge === "true" ||
    row.dataset.layerRow === source.id
  )
    return null;
  const box = row.getBoundingClientRect();
  return {
    anchorId: row.dataset.layerRow!,
    side: y < box.top + box.height / 2 ? "above" : "below",
  };
}

function scrollPortFor(list: HTMLElement) {
  for (let node = list.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
  }
  return null;
}

export function useLayerDrag(
  commit?: (target: EditorTarget, drop: LayerDrop) => void
) {
  const gesture = useRef<Gesture | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [marker, setMarker] = useState<LayerDrop | null>(null);
  const reset = () => {
    gesture.current = null;
    setActiveId(null);
    setMarker(null);
  };

  useEffect(() => {
    if (!activeId) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        reset();
      }
    };
    let frame: number;
    function preview() {
      const drag = gesture.current;
      if (!drag) return;
      const port = drag.scrollPort;
      if (port) {
        const box = port.getBoundingClientRect();
        if (
          drag.x >= box.left &&
          drag.x <= box.right &&
          drag.y >= box.top &&
          drag.y <= box.bottom
        ) {
          if (drag.y < box.top + 32) port.scrollTop -= 8;
          else if (drag.y > box.bottom - 32) port.scrollTop += 8;
        }
      }
      const next = dropAtPointer(drag);
      setMarker(prev =>
        next?.anchorId === prev?.anchorId && next?.side === prev?.side
          ? prev
          : next
      );
      frame = requestAnimationFrame(preview);
    }
    frame = requestAnimationFrame(preview);
    window.addEventListener("keydown", escape, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", escape, true);
    };
  }, [activeId]);

  const gripProps = (layer: EditorLayer) => ({
    onPointerDown(event: PointerEvent<HTMLSpanElement>) {
      if (!event.isPrimary || event.button !== 0 || gesture.current) return;
      const list =
        event.currentTarget.closest<HTMLElement>("[data-layer-stack]")!;
      gesture.current = {
        pointerId: event.pointerId,
        source: layer,
        list,
        scrollPort: scrollPortFor(list),
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event: PointerEvent<HTMLSpanElement>) {
      const drag = gesture.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= 5)
        setActiveId(layer.id);
    },
    onPointerUp(event: PointerEvent<HTMLSpanElement>) {
      const drag = gesture.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const drop =
        activeId &&
        dropAtPointer({ ...drag, x: event.clientX, y: event.clientY });
      reset();
      if (drop) commit?.(drag.source.target, drop);
    },
    onLostPointerCapture(event: PointerEvent<HTMLSpanElement>) {
      if (gesture.current?.pointerId === event.pointerId) reset();
    },
    onPointerCancel(event: PointerEvent<HTMLSpanElement>) {
      if (gesture.current?.pointerId === event.pointerId) reset();
    },
  });
  return { activeId, marker, gripProps };
}
