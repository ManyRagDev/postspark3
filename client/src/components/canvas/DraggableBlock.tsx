import React, { useRef, useState, useEffect, useCallback } from "react";
import { useDragElement } from "@/hooks/useDragElement";
import { useResizeElement } from "@/hooks/useResizeElement";
import type { TextPosition, LayoutPosition } from "@/types/editor";

const SNAP_COORDS = [10, 30, 50, 70, 90];
export const GRID_SNAP_POSITIONS = SNAP_COORDS.flatMap(x => SNAP_COORDS.map(y => ({ cx: x, cy: y })));

/** Mapeamento TextPosition → CSSProperties */
export function resolvePosition(
    rawPosition: TextPosition | string,
    padding: number
): React.CSSProperties {
    const p = padding;
    const position = rawPosition === "center-center" ? "center" : (rawPosition as TextPosition);

    switch (position) {
        case "top-left": return { top: p, left: `${p}px` };
        case "top-center": return { top: p, left: "50%", transform: "translateX(-50%)" };
        case "top-right": return { top: p, left: `calc(100% - ${p}px)`, transform: "translateX(-100%)" };
        case "center-left": return { top: "50%", left: `${p}px`, transform: "translateY(-50%)" };
        case "center": return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
        case "center-right": return { top: "50%", left: `calc(100% - ${p}px)`, transform: "translate(-100%, -50%)" };
        case "bottom-left": return { top: `calc(100% - ${p}px)`, left: `${p}px`, transform: "translateY(-100%)" };
        case "bottom-center": return { top: `calc(100% - ${p}px)`, left: "50%", transform: "translate(-50%, -100%)" };
        case "bottom-right": return { top: `calc(100% - ${p}px)`, left: `calc(100% - ${p}px)`, transform: "translate(-100%, -100%)" };
        default: return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    }
}

/** Resolve layout style considerando posicionamento livre - Matemática Pura */
export function resolveLayoutStyle(
    lp: LayoutPosition,
    padding: number,
): React.CSSProperties {
    if (lp.freePosition) {
        return {
            position: "absolute",
            left: `${lp.freePosition.x}%`,
            top: `${lp.freePosition.y}%`,
            transform: "translate(-50%, -50%)",
        };
    }
    return { position: "relative" };
}

const HANDLES = [
    { id: "tl", cx: 0, cy: 0, cursor: "nw-resize", dir: "left" as const },
    { id: "tm", cx: 50, cy: 0, cursor: "n-resize", dir: "right" as const },
    { id: "tr", cx: 100, cy: 0, cursor: "ne-resize", dir: "right" as const },
    { id: "ml", cx: 0, cy: 50, cursor: "ew-resize", dir: "left" as const },
    { id: "mr", cx: 100, cy: 50, cursor: "ew-resize", dir: "right" as const },
    { id: "bl", cx: 0, cy: 100, cursor: "sw-resize", dir: "left" as const },
    { id: "bm", cx: 50, cy: 100, cursor: "s-resize", dir: "right" as const },
    { id: "br", cx: 100, cy: 100, cursor: "se-resize", dir: "right" as const },
] as const;

interface DraggableBlockProps {
    layoutPos: LayoutPosition;
    padding: number;
    containerRef: React.RefObject<HTMLElement | null>;
    onDragEnd: (x: number, y: number) => void;
    onResize: (width: number) => void;
    snapEnabled: boolean;
    children: React.ReactNode;
    accentColor?: string;
    isDraggable?: boolean;
    onSelect?: () => void;
    forceSelected?: boolean;
    onDoubleClick?: (e: React.MouseEvent) => void;
    defaultWidth?: string;
}

export function DraggableBlock({
    layoutPos,
    padding,
    containerRef,
    onDragEnd,
    onResize,
    snapEnabled,
    children,
    accentColor = "rgba(255,255,255,0.8)",
    isDraggable = true,
    onSelect,
    forceSelected = false,
    onDoubleClick,
    defaultWidth = "100%",
}: DraggableBlockProps) {
    const [isSelected, setIsSelected] = useState(false);
    const blockRef = useRef<HTMLDivElement>(null);

    const currentWidth = layoutPos.width ?? 76;

    const { isDragging, dragPos, handlers } = useDragElement({
        containerRef,
        onDragEnd,
    });

    const { isResizing, previewWidth, startResize } = useResizeElement({
        containerRef,
        initialWidth: currentWidth,
        onResizeEnd: onResize,
    });

    useEffect(() => {
        if (!isSelected) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (blockRef.current && !blockRef.current.contains(e.target as Node)) {
                setIsSelected(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isSelected]);

    const hasExplicitWidth = layoutPos.width != null;
    const getWidthStyle = () => {
        if (isResizing && previewWidth !== null) return `${previewWidth}%`;
        if (hasExplicitWidth) return `${layoutPos.width}%`;
        return defaultWidth;
    };
    const widthStyle = getWidthStyle();

    const isAbsolute = isDragging || !!layoutPos.freePosition;

    // Removemos a função vilã! Agora a matemática é direta.
    const currentStyle: React.CSSProperties = isDragging && dragPos
        ? {
            position: "absolute",
            left: `${dragPos.x}%`,
            top: `${dragPos.y}%`,
            transform: "translate(-50%, -50%)"
        }
        : resolveLayoutStyle(layoutPos, padding);

    const snapTarget = isDragging && dragPos && snapEnabled
        ? GRID_SNAP_POSITIONS.reduce((best, cell) => {
            const d = Math.hypot(dragPos.x - cell.cx, dragPos.y - cell.cy);
            const bd = Math.hypot(dragPos.x - best.cx, dragPos.y - best.cy);
            return d < bd ? cell : best;
        }, GRID_SNAP_POSITIONS[0])
        : null;

    const handleBg = "rgba(255,255,255,1)";
    const boxBorder = `${accentColor}90`;
    const showOutline = isSelected || forceSelected;

    const handlePointerDown = useCallback(
        (e: React.PointerEvent) => {
            if (!isDraggable) return;
            if ((e.target as HTMLElement).dataset.handle) return;
            (handlers as any).onPointerDown(e);
        },
        [handlers, isDraggable]
    );

    // ─── FLOW MODE: Wrapper transparente ───
    if (!isAbsolute) {
        return (
            <div
                ref={blockRef}
                onPointerDown={handlePointerDown}
                onPointerMove={(handlers as any).onPointerMove}
                onPointerUp={(handlers as any).onPointerUp}
                onClick={() => {
                    if (!isDragging && isDraggable) {
                        setIsSelected(true);
                        onSelect?.();
                    }
                }}
                className="draggable-block select-none"
                onDoubleClick={onDoubleClick}
                style={{
                    position: "relative",
                    width: widthStyle,
                    cursor: isDraggable ? "grab" : "default",
                    touchAction: "none",
                    outline: showOutline ? `1.5px solid ${boxBorder}` : "none",
                    outlineOffset: "3px",
                    borderRadius: layoutPos.borderRadius ? `${layoutPos.borderRadius}px` : undefined,
                    backgroundColor: layoutPos.backgroundColor ?? "transparent",
                    padding: layoutPos.backgroundColor ? "0.5rem 1rem" : undefined,
                }}
            >
                {children}
                {showOutline && !isDragging && isDraggable && (
                    <>
                        {HANDLES.map((h) => (
                            <div
                                key={h.id}
                                data-handle={h.id}
                                onPointerDown={(e) => { e.stopPropagation(); startResize(e, h.dir); }}
                                style={{
                                    position: "absolute", left: `${h.cx}%`, top: `${h.cy}%`, transform: "translate(-50%, -50%)",
                                    width: 9, height: 9, borderRadius: 2, background: handleBg, border: `1.5px solid ${boxBorder}`,
                                    cursor: h.cursor, zIndex: 30, boxShadow: "0 1px 4px rgba(0,0,0,0.4)", touchAction: "none",
                                }}
                            />
                        ))}
                    </>
                )}
            </div>
        );
    }

    // ─── ABSOLUTE MODE: O Segredo de Canva ───
    // O Fantasma agora persiste MESMO DEPOIS da edição. Isso "congela" o layout base!
    const needsPlaceholder = isDragging || !!layoutPos.freePosition;

    return (
        <>
            {needsPlaceholder && (
                <div className="draggable-block select-none pointer-events-none" style={{
                    position: "relative", width: widthStyle, visibility: "hidden", outline: "none",
                    borderRadius: layoutPos.borderRadius ? `${layoutPos.borderRadius}px` : undefined,
                    backgroundColor: layoutPos.backgroundColor ?? "transparent",
                    padding: layoutPos.backgroundColor ? "0.5rem 1rem" : undefined,
                }}>
                    {children}
                </div>
            )}

            {isDragging && snapEnabled && (
                <div className="absolute inset-0 z-10 pointer-events-none">
                    {SNAP_COORDS.map((y) => (
                        <div key={`h${y}`} className="absolute left-0 right-0" style={{
                            top: `${y}%`, height: "1px", background: `${accentColor}30`, borderTop: `1px dashed ${accentColor}40`,
                        }} />
                    ))}
                    {SNAP_COORDS.map((x) => (
                        <div key={`v${x}`} className="absolute top-0 bottom-0" style={{
                            left: `${x}%`, width: "1px", background: `${accentColor}30`, borderLeft: `1px dashed ${accentColor}40`,
                        }} />
                    ))}
                    {snapTarget && (
                        <div className="absolute rounded-lg" style={{
                            left: `${snapTarget.cx}%`, top: `${snapTarget.cy}%`, transform: "translate(-50%, -50%)",
                            width: "48px", height: "24px", background: `${accentColor}25`, border: `1.5px dashed ${accentColor}70`,
                        }} />
                    )}
                </div>
            )}

            <div
                ref={blockRef}
                onPointerDown={handlePointerDown}
                onPointerMove={(handlers as any).onPointerMove}
                onPointerUp={(handlers as any).onPointerUp}
                onClick={() => {
                    if (!isDragging && isDraggable) {
                        setIsSelected(true);
                        onSelect?.();
                    }
                }}
                className="draggable-block z-20 select-none"
                onDoubleClick={onDoubleClick}
                style={{
                    ...currentStyle,
                    width: widthStyle,
                    cursor: isDragging ? "grabbing" : isDraggable ? "grab" : "default",
                    touchAction: "none",
                    outline: (showOutline || isDragging || isResizing) ? `1.5px solid ${boxBorder}` : "none",
                    outlineOffset: "3px",
                    borderRadius: layoutPos.borderRadius ? `${layoutPos.borderRadius}px` : "3px",
                    backgroundColor: layoutPos.backgroundColor ?? "transparent",
                    padding: layoutPos.backgroundColor ? "0.5rem 1rem" : undefined,
                }}
            >
                <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
                    {children}
                </div>

                {showOutline && !isDragging && isDraggable && (
                    <>
                        {HANDLES.map((h) => (
                            <div
                                key={h.id}
                                data-handle={h.id}
                                onPointerDown={(e) => { e.stopPropagation(); startResize(e, h.dir); }}
                                style={{
                                    position: "absolute", left: `${h.cx}%`, top: `${h.cy}%`, transform: "translate(-50%, -50%)",
                                    width: 9, height: 9, borderRadius: 2, background: handleBg, border: `1.5px solid ${boxBorder}`,
                                    cursor: h.cursor, zIndex: 30, boxShadow: "0 1px 4px rgba(0,0,0,0.4)", touchAction: "none",
                                }}
                            />
                        ))}
                    </>
                )}
            </div>
        </>
    );
}