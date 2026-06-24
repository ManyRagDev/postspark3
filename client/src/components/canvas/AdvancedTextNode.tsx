import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { TextElement } from "@shared/postspark";
import { readTextGeometry } from "@/editor/adapters";
import { documentRect } from "@/editor/geometry";
import { useCanvasInteraction } from "@/editor/integration/CanvasInteractionProvider";
import { useInteractiveElement } from "@/editor/integration/InteractiveElement";
import type { GeometryMeasurementContext } from "@/editor/integration/ElementRegistry";
import type { InteractionIntent } from "@/editor/interaction";

interface AdvancedTextNodeProps {
  element: TextElement;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (id: string, newText: string) => void;
  scale: number;
  editable?: boolean;
}

export function AdvancedTextNode({
  element,
  isSelected,
  onSelect,
  onChange,
  scale,
  editable = true,
}: AdvancedTextNodeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);
  const editableRef = useRef<HTMLDivElement>(null);
  const interaction = useCanvasInteraction();
  const target = `textElement:${element.id}` as const;
  const descriptor = useMemo(() => ({
    id: target,
    kind: "text" as const,
    nodeRef,
    getPositioningContainer: (node: HTMLElement) => (node.offsetParent as HTMLElement | null) ?? node,
    resolveInitialGeometry: (context: GeometryMeasurementContext) => readTextGeometry(element, context.measuredDocumentSize),
    resolveConstraints: (context: GeometryMeasurementContext, intent: InteractionIntent) => ({
      bounds: documentRect(0, 0, context.viewport.documentSize.width, context.viewport.documentSize.height),
      ...(intent.type === "resize" ? { minWidth: 24, minHeight: 1 } : {}),
    }),
    handlePolicy: "horizontal" as const,
    snapEligible: false,
    accentColor: element.styles.color,
    onSelect,
  }), [element, onSelect, target]);
  const transient = useInteractiveElement(descriptor);
  const draft = transient.draft;

  const handleDoubleClick = (event: React.MouseEvent) => {
    if (!editable) return;
    event.stopPropagation();
    interaction?.cancel();
    setIsEditing(true);
    requestAnimationFrame(() => {
      const node = editableRef.current;
      if (!node) return;
      node.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  };

  const finishEditing = () => {
    setIsEditing(false);
    const text = editableRef.current?.innerText || "Texto";
    if (text !== element.text) onChange(element.id, text);
  };

  useEffect(() => {
    if (!isSelected && isEditing) finishEditing();
  // Only selection transitions should finish the active edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelected]);

  useEffect(() => {
    const handleFontsLoaded = () => interaction?.cancelTarget(target);
    document.fonts?.addEventListener("loadingdone", handleFontsLoaded);
    return () => document.fonts?.removeEventListener("loadingdone", handleFontsLoaded);
  }, [interaction, target]);

  const x = draft?.rect.x ?? element.x;
  const y = draft?.rect.y ?? element.y;
  const width = draft?.rect.width ?? element.width;
  const pointerLifecycle = {
    ...transient.bind,
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (!editable || isEditing) return;
      transient.bind.onPointerDown(event);
    },
  };

  return (
    <div
      ref={nodeRef}
      data-layout-id={target}
      className={`absolute select-none ${editable ? "pointer-events-auto cursor-move" : "pointer-events-none"}`}
      style={{
        transform: `translate(${x}px, ${y}px) rotate(${element.rotation}deg)`,
        transformOrigin: "top left",
        width: width === "auto" ? "auto" : `${width}px`,
        height: element.height === "auto" ? "auto" : `${element.height}px`,
        zIndex: isSelected ? 100 : 1,
      }}
      onDoubleClick={handleDoubleClick}
      {...pointerLifecycle}
    >
      <div
        ref={editableRef}
        contentEditable={editable && isEditing}
        suppressContentEditableWarning
        onBlur={finishEditing}
        className={`h-full min-h-[20px] min-w-[20px] w-full outline-none ${isEditing ? "cursor-text" : editable ? "cursor-move" : "cursor-default"}`}
        style={{
          ...element.styles,
          fontSize: `${parseFloat(element.styles.fontSize) * scale}px`,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          padding: "2px",
          border: isEditing ? "1px dashed rgba(255,255,255,0.65)" : "none",
        }}
      >
        {element.text}
      </div>
    </div>
  );
}

export type AdvancedTextElement = TextElement;
