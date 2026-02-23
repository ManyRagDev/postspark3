/**
 * DraggableCardOverlay
 *
 * Camada invisível sobreposta ao PostCard que permite arrastar o Título
 * e o Corpo diretamente no canvas.
 *
 * - Snap ON  → encaixa na célula 3×3 mais próxima → atualiza `position`
 * - Snap OFF → salva posição livre em `freePosition` (x/y em %)
 *
 * IMPORTANTE: Esta camada NÃO interfere no PostCard em si.
 * Ela só chama `onPositionChange` para atualizar o state no Workbench.
 */

import { useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GripVertical } from "lucide-react";
import type { AdvancedLayoutSettings, LayoutPosition, TextPosition } from "@/types/editor";
import { useDragElement } from "@/hooks/useDragElement";

// ─── Grid Snap Logic ─────────────────────────────────────────────────────────

const GRID_POSITIONS: { position: TextPosition; cx: number; cy: number }[] = [
    { position: "top-left", cx: 10, cy: 10 },
    { position: "top-center", cx: 50, cy: 10 },
    { position: "top-right", cx: 90, cy: 10 },
    { position: "center-left", cx: 10, cy: 50 },
    { position: "center", cx: 50, cy: 50 },
    { position: "center-right", cx: 90, cy: 50 },
    { position: "bottom-left", cx: 10, cy: 90 },
    { position: "bottom-center", cx: 50, cy: 90 },
    { position: "bottom-right", cx: 90, cy: 90 },
];

function snapToGrid(x: number, y: number): TextPosition {
    let best = GRID_POSITIONS[0];
    let bestDist = Infinity;
    for (const cell of GRID_POSITIONS) {
        const dist = Math.hypot(x - cell.cx, y - cell.cy);
        if (dist < bestDist) {
            bestDist = dist;
            best = cell;
        }
    }
    return best.position;
}

// ─── Resolve current handle position (%) from LayoutPosition ─────────────────

function resolveHandlePercent(lp: LayoutPosition): { x: number; y: number } {
    if (lp.freePosition) return lp.freePosition;
    const cell = GRID_POSITIONS.find((c) => c.position === lp.position);
    return cell ? { x: cell.cx, y: cell.cy } : { x: 50, y: 50 };
}

// ─── Single Draggable Handle ──────────────────────────────────────────────────

interface DragHandleProps {
    label: string;
    layoutPos: LayoutPosition;
    containerRef: React.RefObject<HTMLElement | null>;
    snapEnabled: boolean;
    accentColor: string;
    onPositionChange: (partial: Partial<LayoutPosition>) => void;
}

function DragHandle({
    label,
    layoutPos,
    containerRef,
    snapEnabled,
    accentColor,
    onPositionChange,
}: DragHandleProps) {
    const handleDragEnd = useCallback(
        (x: number, y: number) => {
            if (snapEnabled) {
                const position = snapToGrid(x, y);
                // Clear freePosition when snapping
                onPositionChange({ position, freePosition: undefined });
            } else {
                onPositionChange({ freePosition: { x, y } });
            }
        },
        [snapEnabled, onPositionChange]
    );

    const { isDragging, dragPos, handlers } = useDragElement({
        containerRef,
        onDragEnd: handleDragEnd,
    });

    const currentPos = isDragging && dragPos ? dragPos : resolveHandlePercent(layoutPos);

    return (
        <>
            {/* Drag Handle */}
            <motion.div
                {...(handlers as React.ComponentProps<typeof motion.div>)}
                className="absolute z-30 flex items-center gap-1 cursor-grab active:cursor-grabbing select-none"
                style={{
                    left: `${currentPos.x}%`,
                    top: `${currentPos.y}%`,
                    transform: "translate(-50%, -50%)",
                    touchAction: "none",
                }}
                animate={{
                    scale: isDragging ? 1.08 : 1,
                }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
                <div
                    className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider shadow-lg"
                    style={{
                        background: isDragging
                            ? accentColor
                            : `${accentColor}cc`,
                        color: "#000",
                        boxShadow: isDragging
                            ? `0 0 0 2px ${accentColor}, 0 8px 24px ${accentColor}50`
                            : `0 2px 8px rgba(0,0,0,0.4)`,
                        backdropFilter: "blur(4px)",
                        transition: "box-shadow 0.2s, background 0.2s",
                    }}
                >
                    <GripVertical size={10} />
                    {label}
                </div>
            </motion.div>

            {/* Drop ghost: mosta a célula-alvo durante o drag (snap mode) */}
            <AnimatePresence>
                {isDragging && snapEnabled && dragPos && (
                    <motion.div
                        key="snap-ghost"
                        className="absolute z-20 pointer-events-none rounded-lg border-2 border-dashed"
                        style={{
                            borderColor: `${accentColor}80`,
                            background: `${accentColor}15`,
                        }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        {/* Visualizar célula mais próxima */}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

// ─── DraggableCardOverlay ─────────────────────────────────────────────────────

export interface DraggableCardOverlayProps {
    layoutSettings: AdvancedLayoutSettings;
    snapToGrid: boolean;
    accentColor: string;
    hasBody: boolean;
    onPositionChange: (
        target: "headline" | "body",
        partial: Partial<LayoutPosition>
    ) => void;
}

export default function DraggableCardOverlay({
    layoutSettings,
    snapToGrid: snapEnabled,
    accentColor,
    hasBody,
    onPositionChange,
}: DraggableCardOverlayProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Obtém a ref do container pai (o card) atravessando o DOM
    // A div raiz do overlay tem `inset-0` e position absolute dentro do card.
    // Usamos forwardRef no contêiner pai seria ideal, mas aqui usamos parentElement.

    const overlayRef = useCallback((node: HTMLDivElement | null) => {
        if (node && node.parentElement) {
            (containerRef as React.MutableRefObject<HTMLElement | null>).current =
                node.parentElement as HTMLElement;
        }
    }, []);

    return (
        <div
            ref={overlayRef}
            className="absolute inset-0 z-20"
            style={{ pointerEvents: "none" }}
        >
            {/* Headline Handle */}
            <div style={{ pointerEvents: "auto" }}>
                <DragHandle
                    label="Título"
                    layoutPos={layoutSettings.headline}
                    containerRef={containerRef}
                    snapEnabled={snapEnabled}
                    accentColor={accentColor}
                    onPositionChange={(partial) => onPositionChange("headline", partial)}
                />
            </div>

            {/* Body Handle - só exibe se houver corpo */}
            {hasBody && (
                <div style={{ pointerEvents: "auto" }}>
                    <DragHandle
                        label="Corpo"
                        layoutPos={layoutSettings.body}
                        containerRef={containerRef}
                        snapEnabled={snapEnabled}
                        accentColor={accentColor}
                        onPositionChange={(partial) => onPositionChange("body", partial)}
                    />
                </div>
            )}
        </div>
    );
}
