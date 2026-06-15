import { useCallback, useEffect, useRef, useState } from "react";

interface UseDragElementOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  elementRef: React.RefObject<HTMLElement | null>;
  onDragEnd: (x: number, y: number) => void;
}

interface DragPos {
  x: number;
  y: number;
}

const DRAG_THRESHOLD = 5;

export function useDragElement({
  containerRef,
  elementRef,
  onDragEnd,
}: UseDragElementOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState<DragPos | null>(null);

  const clickOffset = useRef({ x: 0, y: 0 });
  const elementSize = useRef({ width: 0, height: 0 });
  const startClient = useRef({ x: 0, y: 0 });
  const activePointerId = useRef<number | null>(null);
  const didExceedThreshold = useRef(false);
  const latestPos = useRef<DragPos | null>(null);

  const toPercent = useCallback(
    (centerClientX: number, centerClientY: number): DragPos => {
      const container = containerRef.current;
      if (!container) return { x: 50, y: 50 };

      const rect = container.getBoundingClientRect();
      const halfWidth = Math.min(elementSize.current.width / 2, rect.width / 2);
      const halfHeight = Math.min(elementSize.current.height / 2, rect.height / 2);
      const boundedX = Math.min(
        rect.right - halfWidth,
        Math.max(rect.left + halfWidth, centerClientX),
      );
      const boundedY = Math.min(
        rect.bottom - halfHeight,
        Math.max(rect.top + halfHeight, centerClientY),
      );

      return {
        x: ((boundedX - rect.left) / rect.width) * 100,
        y: ((boundedY - rect.top) / rect.height) * 100,
      };
    },
    [containerRef],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const targetRect =
        elementRef.current?.getBoundingClientRect() ??
        event.currentTarget.getBoundingClientRect();

      clickOffset.current = {
        x: event.clientX - (targetRect.left + targetRect.width / 2),
        y: event.clientY - (targetRect.top + targetRect.height / 2),
      };
      elementSize.current = {
        width: targetRect.width,
        height: targetRect.height,
      };
      startClient.current = { x: event.clientX, y: event.clientY };
      activePointerId.current = event.pointerId;
      didExceedThreshold.current = false;
      latestPos.current = null;
    },
    [elementRef],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (activePointerId.current !== event.pointerId) return;
      event.preventDefault();

      if (!didExceedThreshold.current) {
        const distance = Math.hypot(
          event.clientX - startClient.current.x,
          event.clientY - startClient.current.y,
        );
        if (distance < DRAG_THRESHOLD) return;
        didExceedThreshold.current = true;
        setIsDragging(true);
      }

      const pos = toPercent(
        event.clientX - clickOffset.current.x,
        event.clientY - clickOffset.current.y,
      );
      latestPos.current = pos;
      setDragPos(pos);
    },
    [toPercent],
  );

  const onPointerUp = useCallback(
    (event: PointerEvent) => {
      if (activePointerId.current !== event.pointerId) return;
      activePointerId.current = null;

      if (!didExceedThreshold.current) return;

      const pos =
        latestPos.current ??
        toPercent(
          event.clientX - clickOffset.current.x,
          event.clientY - clickOffset.current.y,
        );

      didExceedThreshold.current = false;
      latestPos.current = null;
      setIsDragging(false);
      setDragPos(null);
      onDragEnd(pos.x, pos.y);
    },
    [onDragEnd, toPercent],
  );

  useEffect(() => {
    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  return {
    isDragging,
    dragPos,
    handlers: { onPointerDown },
  };
}
