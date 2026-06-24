import React, { useMemo, useRef, useState } from "react";
import type { TextPosition, LayoutPosition } from "@/types/editor";
import {
    GRID_SNAP_COORDINATES,
    nearestGridCoordinate,
    type LayoutGeometryTarget,
} from "@/editor/adapters";
import { readLayoutGeometry } from "@/editor/adapters";
import { documentRect, type ElementKind } from "@/editor/geometry";
import { useInteractiveElement } from "@/editor/integration/InteractiveElement";
import type { GeometryMeasurementContext } from "@/editor/integration/ElementRegistry";
import type { InteractionIntent } from "@/editor/interaction";

export const GRID_SNAP_POSITIONS = GRID_SNAP_COORDINATES.flatMap(x =>
    GRID_SNAP_COORDINATES.map(y => ({ cx: x, cy: y })),
);

export function snapToGrid(value: number): number {
    return nearestGridCoordinate(value);
}

export function resolvePosition(
    rawPosition: TextPosition | string,
    padding: number,
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

export function resolveLayoutStyle(lp: LayoutPosition, _padding: number): React.CSSProperties {
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

interface DraggableBlockProps {
    elementId: LayoutGeometryTarget;
    elementKind?: ElementKind;
    layoutPos: LayoutPosition;
    padding: number;
    containerRef: React.RefObject<HTMLElement | null>;
    snapEnabled: boolean;
    children: React.ReactNode;
    accentColor?: string;
    isDraggable?: boolean;
    onSelect?: () => void;
    onDoubleClick?: (event: React.MouseEvent) => void;
    defaultWidth?: string;
}

export function DraggableBlock({
    elementId,
    elementKind = "block",
    layoutPos,
    padding,
    containerRef,
    snapEnabled,
    children,
    accentColor = "rgba(255,255,255,0.8)",
    isDraggable = true,
    onSelect,
    onDoubleClick,
    defaultWidth = "100%",
}: DraggableBlockProps) {
    const [flowFootprint, setFlowFootprint] = useState<{ width: number; height: number } | null>(null);
    const blockRef = useRef<HTMLDivElement>(null);
    const descriptor = useMemo(() => ({
        id: elementId,
        kind: elementKind,
        nodeRef: blockRef,
        getPositioningContainer: (node: HTMLElement) => (node.offsetParent as HTMLElement | null) ?? containerRef.current ?? node,
        resolveInitialGeometry: (context: GeometryMeasurementContext) =>
            readLayoutGeometry(elementId, elementKind, context.measuredDocumentRect),
        resolveConstraints: (context: GeometryMeasurementContext, intent: InteractionIntent) => ({
            bounds: documentRect(0, 0, context.viewport.documentSize.width, context.viewport.documentSize.height),
            ...(intent.type === "resize" ? { minWidth: context.viewport.documentSize.width * 0.2, minHeight: 0 } : {}),
        }),
        handlePolicy: layoutPos.freePosition ? "horizontal" as const : "flow-right" as const,
        snapEligible: snapEnabled,
        accentColor: `${accentColor}90`,
        onSelect,
    }), [accentColor, containerRef, elementId, elementKind, layoutPos.freePosition, onSelect, snapEnabled]);
    const interaction = useInteractiveElement(descriptor);
    const isDragging = interaction.phase === "dragging";
    const isResizing = interaction.phase === "resizing";

    const hasExplicitWidth = layoutPos.width != null;
    const widthStyle = isResizing && interaction.draft
        ? `${interaction.draft.rect.width}px`
        : hasExplicitWidth
            ? `${layoutPos.width}%`
            : defaultWidth;
    const isAbsolute = Boolean(layoutPos.freePosition);
    const usesAbsoluteDraft = Boolean(interaction.draft) && isAbsolute;
    const flowDraftTransform = !isAbsolute && isDragging && interaction.draft && interaction.initial
        ? `translate3d(${interaction.draft.rect.x - interaction.initial.rect.x}px, ${interaction.draft.rect.y - interaction.initial.rect.y}px, 0)`
        : undefined;
    const currentStyle: React.CSSProperties = usesAbsoluteDraft && interaction.draft
        ? {
            position: "absolute",
            left: `${interaction.draft.rect.x}px`,
            top: `${interaction.draft.rect.y}px`,
            transform: "none",
        }
        : isAbsolute
            ? resolveLayoutStyle(layoutPos, padding)
            : { position: "relative", transform: flowDraftTransform };

    const pointerHandlers = {
        ...interaction.bind,
        onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
            const element = blockRef.current;
            if (!isDraggable || !element) return;
            if (!layoutPos.freePosition && !flowFootprint) {
                setFlowFootprint({ width: element.offsetWidth, height: element.offsetHeight });
            }
            interaction.bind.onPointerDown(event);
        },
    };

    const selectBlock = () => {
        if (isDragging || !isDraggable) return;
        onSelect?.();
    };

    const sharedStyle: React.CSSProperties = {
        width: widthStyle,
        cursor: isDragging ? "grabbing" : isDraggable ? "grab" : "default",
        touchAction: "none",
        borderRadius: layoutPos.borderRadius ? `${layoutPos.borderRadius}px` : undefined,
        backgroundColor: layoutPos.backgroundColor ?? "transparent",
        padding: layoutPos.backgroundColor ? "0.5rem 1rem" : undefined,
    };

    return (
        <div
            data-draggable-flow-shell={elementId}
            style={flowFootprint ? {
                position: "relative",
                width: `${flowFootprint.width}px`,
                height: `${flowFootprint.height}px`,
            } : { position: "relative" }}
        >
            <div
                ref={blockRef}
                data-layout-id={elementId}
                onClick={selectBlock}
                onDoubleClick={onDoubleClick}
                className="draggable-block z-20 select-none"
                style={{ ...currentStyle, ...sharedStyle, pointerEvents: isDraggable ? "auto" : "none" }}
                {...pointerHandlers}
            >
                <div style={{ width: "100%" }}>{children}</div>
            </div>
        </div>
    );
}
