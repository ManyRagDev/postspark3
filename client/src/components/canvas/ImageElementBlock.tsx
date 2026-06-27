import { useMemo, useRef, useState } from "react";
import type { ImageElement } from "@shared/postspark";
import { readImageGeometry } from "@/editor/adapters";
import { documentRect } from "@/editor/geometry";
import { useCanvasInteraction } from "@/editor/integration/CanvasInteractionProvider";
import { useInteractiveElement } from "@/editor/integration/InteractiveElement";
import type { GeometryMeasurementContext } from "@/editor/integration/ElementRegistry";
import type { InteractionIntent } from "@/editor/interaction";

interface ImageElementBlockProps {
  element: ImageElement;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  containerRef: React.RefObject<HTMLElement>;
  accentColor: string;
  snapEnabled?: boolean;
}

export function ImageElementBlock({
  element,
  isSelected,
  onSelect,
  onDelete,
  containerRef,
  accentColor,
  snapEnabled = false,
}: ImageElementBlockProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  const interaction = useCanvasInteraction();
  const target = `imageElement:${element.id}` as const;
  const descriptor = useMemo(() => ({
    id: target,
    kind: "image" as const,
    nodeRef,
    getPositioningContainer: (node: HTMLElement) => (node.offsetParent as HTMLElement | null) ?? containerRef.current ?? node,
    resolveInitialGeometry: (context: GeometryMeasurementContext) => readImageGeometry(element, context.measuredDocumentSize),
    resolveConstraints: (context: GeometryMeasurementContext, intent: InteractionIntent) => ({
      bounds: documentRect(0, 0, context.viewport.documentSize.width, context.viewport.documentSize.height),
      ...(intent.type === "resize" ? {
        minWidth: 40,
        minHeight: 40,
        aspectRatio: context.measuredDocumentRect.width / Math.max(context.measuredDocumentRect.height, Number.EPSILON),
      } : {}),
    }),
    handlePolicy: element.height === "auto" && !naturalRatio ? "none" as const : "corners" as const,
    snapEligible: snapEnabled,
    accentColor,
    onSelect,
    onDelete,
  }), [accentColor, containerRef, element, naturalRatio, onDelete, onSelect, snapEnabled, target]);
  const transient = useInteractiveElement(descriptor);
  const draft = transient.draft;

  const measuredHeight = typeof element.height === "number"
    ? element.height
    : naturalRatio ? element.width / naturalRatio : element.width;
  const x = draft?.rect.x ?? element.x;
  const y = draft?.rect.y ?? element.y;
  const width = draft?.rect.width ?? element.width;
  const height = draft?.rect.height ?? measuredHeight;

  const handleImageLoad = () => {
    interaction?.cancelTarget(target);
    const image = imageRef.current;
    if (image?.naturalWidth && image.naturalHeight) {
      setNaturalRatio(image.naturalWidth / image.naturalHeight);
    }
  };
  const pointerLifecycle = transient.bind;

  return (
    <div
      ref={nodeRef}
      data-layout-id={target}
      className="absolute select-none"
      style={{
        transform: `translate(${x}px, ${y}px) rotate(${element.rotation}deg)`,
        transformOrigin: "top left",
        left: 0,
        top: 0,
        width: `${width}px`,
        height: `${height}px`,
        zIndex: isSelected ? 100 : 10,
        pointerEvents: "auto",
      }}
      {...pointerLifecycle}
    >
      <div
        className="relative h-full w-full overflow-visible rounded"
      >
        <img
          ref={imageRef}
          src={element.url}
          alt="Elemento de imagem"
          className="pointer-events-none block h-full w-full select-none object-contain"
          draggable={false}
          onLoad={handleImageLoad}
        />
      </div>
    </div>
  );
}
