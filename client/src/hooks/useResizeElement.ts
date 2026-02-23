/**
 * useResizeElement — Hook para redimensionar um bloco de texto via alças (resize handles)
 *
 * Calcula a largura do bloco em percentual (0–100) relativo ao bounding rect do container.
 * Suporta apenas redimensionamento horizontal (width), que controla a quebra de linha do texto.
 *
 * As alças de canto e de aresta disparam este hook com diferentes direções:
 *   - "left":  arrastar para esquerda aumenta largura (espelha a posição)
 *   - "right": arrastar para direita aumenta largura
 * No futuro pode-se adicionar resize vertical também.
 *
 * Uso:
 *   const { isResizing, previewWidth, startResize } = useResizeElement({
 *     containerRef,
 *     initialWidth,
 *     onResizeEnd: (newWidth) => { ... },
 *   });
 */

import { useRef, useState, useCallback } from "react";

interface UseResizeElementOptions {
  /** Ref para o container (o card) — usado para converter px → % */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Largura inicial em % */
  initialWidth: number;
  /** Callback chamado quando o resize termina, com nova largura em % */
  onResizeEnd: (width: number) => void;
}

type ResizeDirection = "right" | "left" | "right-only";

export function useResizeElement({
  containerRef,
  initialWidth,
  onResizeEnd,
}: UseResizeElementOptions) {
  const [isResizing, setIsResizing] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<number | null>(null);

  // Referências internas para o closure do pointer move
  const startClientX = useRef(0);
  const startWidth = useRef(initialWidth);
  const direction = useRef<ResizeDirection>("right");
  const activePointerId = useRef<number | null>(null);
  const overlayEl = useRef<HTMLDivElement | null>(null);

  // Converte pixels para % da largura do container
  const pxToPercent = useCallback(
    (px: number): number => {
      if (!containerRef.current) return 0;
      const rect = containerRef.current.getBoundingClientRect();
      return (px / rect.width) * 100;
    },
    [containerRef]
  );

  // Pointer move global (montado no documento durante o resize)
  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (activePointerId.current !== e.pointerId) return;
      const deltaX = e.clientX - startClientX.current;
      const deltaPct = pxToPercent(
        direction.current === "left" ? -deltaX : deltaX
      );
      const newWidth = Math.min(98, Math.max(20, startWidth.current + deltaPct));
      setPreviewWidth(newWidth);
    },
    [pxToPercent]
  );

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      if (activePointerId.current !== e.pointerId) return;

      // Calcula largura final
      const deltaX = e.clientX - startClientX.current;
      const deltaPct = pxToPercent(
        direction.current === "left" ? -deltaX : deltaX
      );
      const newWidth = Math.min(98, Math.max(20, startWidth.current + deltaPct));

      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      overlayEl.current?.remove();
      overlayEl.current = null;
      activePointerId.current = null;

      setIsResizing(false);
      setPreviewWidth(null);
      onResizeEnd(Math.round(newWidth * 10) / 10); // arredonda para 1 decimal
    },
    [pxToPercent, onPointerMove, onResizeEnd]
  );

  /**
   * Inicia o resize. Chame no onPointerDown da alça.
   */
  const startResize = useCallback(
    (e: React.PointerEvent, dir: ResizeDirection) => {
      e.preventDefault();
      e.stopPropagation();

      startClientX.current = e.clientX;
      startWidth.current = initialWidth;
      direction.current = dir;
      activePointerId.current = e.pointerId;

      // Overlay invisível para capturar eventos fora do componente (evita perda de cursor)
      const overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:9999;cursor:ew-resize;";
      document.body.appendChild(overlay);
      overlayEl.current = overlay;

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);

      setIsResizing(true);
      setPreviewWidth(initialWidth);
    },
    [initialWidth, onPointerMove, onPointerUp]
  );

  return { isResizing, previewWidth, startResize };
}
