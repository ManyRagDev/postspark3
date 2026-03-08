/**
 * useDragElement — Hook de drag-and-drop via Pointer Events
 *
 * Calcula a posição do elemento arrastado em percentual (0–100)
 * relativo ao bounding rect de um container pai.
 *
 * Inclui threshold de distância mínima (5px) para distinguir
 * click de drag — um simples click NÃO dispara onDragEnd.
 *
 * Uso:
 *   const { isDragging, dragPos, handlers } = useDragElement({
 *     containerRef,
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

/** Distância mínima em px antes de considerar como drag real */
const DRAG_THRESHOLD = 5;

export function useDragElement({ containerRef, onDragEnd }: UseDragElementOptions) {
    const [isDragging, setIsDragging] = useState(false);
    const [dragPos, setDragPos] = useState<DragPos | null>(null);

    // Offset do ponto de clique dentro do handle (para evitar salto no início do drag)
    const clickOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    // Ponto de pointerDown original para calcular threshold
    const startClient = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    // Se o pointer está pressionado (antes de atingir threshold)
    const isPending = useRef(false);
    // Se já ultrapassou o threshold neste gesto
    const didExceedThreshold = useRef(false);

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
            startClient.current = { x: e.clientX, y: e.clientY };
            isPending.current = true;
            didExceedThreshold.current = false;
        },
        [containerRef]
    );

    const onPointerMove = useCallback(
        (e: React.PointerEvent<HTMLElement>) => {
            if (!isPending.current && !isDragging) return;
            e.preventDefault();

            if (isPending.current && !didExceedThreshold.current) {
                const dx = e.clientX - startClient.current.x;
                const dy = e.clientY - startClient.current.y;
                if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

                // Threshold ultrapassado — inicia drag real
                didExceedThreshold.current = true;
                isPending.current = false;

                // Recalcular no exato momento em que o drag "destrava"
                // para garantir que qualquer mudança de layout seja capturada
                setIsDragging(true);
                const pos = toPercent(e.clientX - clickOffset.current.x, e.clientY - clickOffset.current.y);
                setDragPos(pos);
                return;
            }

            if (isDragging) {
                setDragPos(toPercent(e.clientX - clickOffset.current.x, e.clientY - clickOffset.current.y));
            }
        },
        [isDragging, toPercent]
    );

    const onPointerUp = useCallback(
        (e: React.PointerEvent<HTMLElement>) => {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            isPending.current = false;

            if (!isDragging) {
                // Não ultrapassou threshold → foi apenas um click, não dispara onDragEnd
                return;
            }

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
