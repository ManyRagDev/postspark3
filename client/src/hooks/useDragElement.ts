/**
 * useDragElement — Hook de drag-and-drop via Pointer Events
 *
 * Calcula a posição do elemento arrastado em percentual (0–100)
 * relativo ao bounding rect de um container pai.
 *
 * Uso:
 *   const { isDragging, dragPos, handlers } = useDragElement({
 *     containerRef,
 *     elementOffset: { x: 10, y: 5 }, // offset inicial em % dentro do container
 *     onDragEnd: (x, y) => { ... },
 *   });
 */

import { useRef, useState, useCallback } from "react";

interface UseDragElementOptions {
    /** Ref para o elemento container (o card) usado para calcular % */
    containerRef: React.RefObject<HTMLElement | null>;
    /** Callback chamado quando o drag termina, com posição em % */
    onDragEnd: (x: number, y: number) => void;
}

interface DragPos {
    x: number; // 0–100%
    y: number; // 0–100%
}

export function useDragElement({ containerRef, onDragEnd }: UseDragElementOptions) {
    const [isDragging, setIsDragging] = useState(false);
    const [dragPos, setDragPos] = useState<DragPos | null>(null);

    // Offset do ponto de clique dentro do handle (para evitar salto no início do drag)
    const clickOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    const toPercent = useCallback(
        (clientX: number, clientY: number): DragPos => {
            if (!containerRef.current) return { x: 50, y: 50 };
            const rect = containerRef.current.getBoundingClientRect();
            const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
            const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
            return { x, y };
        },
        [containerRef]
    );

    const onPointerDown = useCallback(
        (e: React.PointerEvent<HTMLElement>) => {
            e.preventDefault();
            e.stopPropagation();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

            // Calcula o offset de clique do mouse em relação ao CENTRO ATUAL do elemento.
            // Quando a div mudar pra `transform: translate(-50%, -50%)`, seu centro será
            // ancorado na posição do drag, portanto precisamos subtrair este offset.
            let offsetX = 0;
            let offsetY = 0;

            if (containerRef.current) {
                const targetRect = e.currentTarget.getBoundingClientRect();
                const centerX = targetRect.left + (targetRect.width / 2);
                const centerY = targetRect.top + (targetRect.height / 2);

                offsetX = e.clientX - centerX;
                offsetY = e.clientY - centerY;
            }

            clickOffset.current = { x: offsetX, y: offsetY };

            setIsDragging(true);
            setDragPos(toPercent(e.clientX - offsetX, e.clientY - offsetY));
        },
        [containerRef, toPercent]
    );

    const onPointerMove = useCallback(
        (e: React.PointerEvent<HTMLElement>) => {
            if (!isDragging) return;
            e.preventDefault();
            setDragPos(toPercent(e.clientX - clickOffset.current.x, e.clientY - clickOffset.current.y));
        },
        [isDragging, toPercent]
    );

    const onPointerUp = useCallback(
        (e: React.PointerEvent<HTMLElement>) => {
            if (!isDragging) return;
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            const pos = toPercent(e.clientX - clickOffset.current.x, e.clientY - clickOffset.current.y);
            setIsDragging(false);
            setDragPos(null);
            onDragEnd(pos.x, pos.y);
        },
        [isDragging, toPercent, onDragEnd]
    );

    return {
        isDragging,
        dragPos,
        handlers: {
            onPointerDown,
            onPointerMove,
            onPointerUp,
        },
    };
}
