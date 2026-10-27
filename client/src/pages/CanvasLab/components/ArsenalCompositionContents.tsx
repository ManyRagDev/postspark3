import { useEffect, useState } from "react";
import { displayMediaSlotLabel } from "../lib/mediaPresentation";
import { Group, Rect, Line, Text, Image as KonvaImage } from "react-konva";
import type {
  ArsenalComposition,
  ArsenalElement,
  ArsenalGroup,
  ArsenalCustomBackground,
  ArsenalLogo,
} from "@shared/designArsenal";
import {
  orderedArsenalNodes,
  arsenalTextLayout,
} from "../lib/arsenalComposition";
import {
  getCaretGeometry,
  getSelectionGeometry,
  type RichTextLayout,
} from "../lib/richTextLayout";
import RichTextRenderer from "./RichTextRenderer";
import { loadArsenalImage } from "../lib/arsenalAssets";

type Event = any;
export interface ArsenalTextBridge {
  target: string | null;
  selection: { start: number; end: number };
  click: (event: Event, id: string, layout: RichTextLayout) => void;
  doubleClick: (event: Event, id: string, layout: RichTextLayout) => void;
  down: (event: Event, id: string, layout: RichTextLayout) => void;
  move: (event: Event, id: string, layout: RichTextLayout) => void;
  touchStart: (event: Event, id: string, layout: RichTextLayout) => void;
  touchMove: (event: Event, id: string, layout: RichTextLayout) => void;
  up: () => void;
  selectionHandles?: (id: string, layout: RichTextLayout) => React.ReactNode;
}
function SlotImage({
  e,
  c,
  onSelect,
  interactive,
}: {
  e: ArsenalElement;
  c: ArsenalComposition;
  onSelect: (id: string) => void;
  interactive: boolean;
}) {
  const slot = c.media[e.id];
  const asset = e.imageAssetId ? c.assets.find(a=>a.id===e.imageAssetId) : undefined;
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let active = true;
    setImage(null);
    if (!slot && !asset) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (active) setImage(img);
    };
    if (slot) img.src = slot.url;
    else if (asset) void loadArsenalImage(asset).then(url=>{if(active)img.src=url;}).catch(()=>{if(active)setImage(null);});
    return () => {
      active = false;
    };
  }, [slot?.url, asset?.id, asset?.sha256]);
  const scale = image
    ? Math.max(e.width / image.naturalWidth, e.height / image.naturalHeight)
    : 1;
  const contain = e.mediaSlot?.policy === 'contain';
  const containScale = image ? Math.min(e.width / image.naturalWidth, e.height / image.naturalHeight) : 1;
  const crop = image && !contain
    ? {
        x: (image.naturalWidth - e.width / scale) * (slot?.focalX ?? 0.5),
        y: (image.naturalHeight - e.height / scale) * (slot?.focalY ?? 0.5),
        width: e.width / scale,
        height: e.height / scale,
      }
    : undefined;
  return (
    <Group>
      <Rect
        width={e.width}
        height={e.height}
        fill={e.fill}
        listening={interactive}
        onClick={() => onSelect(e.id)}
        onTap={() => onSelect(e.id)}
      />
      {image && (
        <KonvaImage
          image={image}
          x={contain && image ? (e.width - image.naturalWidth * containScale) / 2 : 0}
          y={contain && image ? (e.height - image.naturalHeight * containScale) / 2 : 0}
          width={contain && image ? image.naturalWidth * containScale : e.width}
          height={contain && image ? image.naturalHeight * containScale : e.height}
          crop={crop}
          listening={interactive}
          onClick={() => onSelect(e.id)}
          onTap={() => onSelect(e.id)}
        />
      )}
      {!slot && e.mediaSlot?.deferred && (
        <Group name="editor-media-guide" listening={false}>
          <Rect x={3} y={3} width={Math.max(1, e.width - 6)} height={Math.max(1, e.height - 6)} stroke="#94a3b8" dash={[8, 6]} strokeWidth={2} />
          <Text x={12} y={Math.max(8, e.height / 2 - 20)} width={Math.max(1, e.width - 24)} text={`${displayMediaSlotLabel(e.mediaSlot.label)}\nInserir imagem na aba Mídia`} fontSize={Math.min(22, e.width / 12)} align="center" fill="#64748b" />
        </Group>
      )}
      {e.stroke && (
        <Rect
          width={e.width}
          height={e.height}
          stroke={e.stroke}
          strokeWidth={e.strokeWidth}
          listening={false}
        />
      )}
    </Group>
  );
}

function CompositionCustomBackground({
  bg,
  stageWidth,
  stageHeight,
}: {
  bg: ArsenalCustomBackground;
  stageWidth: number;
  stageHeight: number;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let active = true;
    setImage(null);
    if (!bg.imageUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (active) setImage(img);
    };
    img.src = bg.imageUrl;
    return () => {
      active = false;
    };
  }, [bg.imageUrl]);

  if (!image) return null;

  const scale = Math.max(
    stageWidth / image.naturalWidth,
    stageHeight / image.naturalHeight
  );
  const crop = {
    x: (image.naturalWidth - stageWidth / scale) * (bg.focalX ?? 0.5),
    y: (image.naturalHeight - stageHeight / scale) * (bg.focalY ?? 0.5),
    width: stageWidth / scale,
    height: stageHeight / scale,
  };

  const overlayColor = bg.overlayColor ?? "#000000";
  const overlayOpacity = bg.overlayOpacity ?? 0.55;
  const mode = bg.overlayMode ?? "gradient-bottom";

  return (
    <Group listening={false}>
      <KonvaImage
        image={image}
        width={stageWidth}
        height={stageHeight}
        crop={crop}
        listening={false}
      />
      {mode === "solid" && (
        <Rect
          width={stageWidth}
          height={stageHeight}
          fill={overlayColor}
          opacity={overlayOpacity}
          listening={false}
        />
      )}
      {mode === "gradient-bottom" && (
        <Rect
          width={stageWidth}
          height={stageHeight}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: 0, y: stageHeight }}
          fillLinearGradientColorStops={[
            0,
            `${overlayColor}22`,
            0.5,
            `${overlayColor}BB`,
            1,
            overlayColor,
          ]}
          opacity={overlayOpacity}
          listening={false}
        />
      )}
      {mode === "gradient-top" && (
        <Rect
          width={stageWidth}
          height={stageHeight}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: 0, y: stageHeight }}
          fillLinearGradientColorStops={[
            0,
            overlayColor,
            0.5,
            `${overlayColor}BB`,
            1,
            `${overlayColor}22`,
          ]}
          opacity={overlayOpacity}
          listening={false}
        />
      )}
      {mode === "radial" && (
        <Rect
          width={stageWidth}
          height={stageHeight}
          fillRadialGradientStartPoint={{
            x: stageWidth / 2,
            y: stageHeight / 2,
          }}
          fillRadialGradientStartRadius={0}
          fillRadialGradientEndPoint={{
            x: stageWidth / 2,
            y: stageHeight / 2,
          }}
          fillRadialGradientEndRadius={Math.max(stageWidth, stageHeight) * 0.72}
          fillRadialGradientColorStops={[
            0,
            `${overlayColor}00`,
            0.45,
            `${overlayColor}66`,
            1,
            overlayColor,
          ]}
          opacity={overlayOpacity}
          listening={false}
        />
      )}
    </Group>
  );
}

function CompositionLogo({
  logo,
  stageWidth,
  stageHeight,
  interactive,
  onSelect,
}: {
  logo: ArsenalLogo;
  stageWidth: number;
  stageHeight: number;
  interactive: boolean;
  onSelect: () => void;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let active = true;
    setImage(null);
    if (!logo.url) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (active) setImage(img);
    };
    img.src = logo.url;
    return () => {
      active = false;
    };
  }, [logo.url]);

  if (!image) return null;

  const w = logo.width ?? 60;
  const h = logo.height ?? 30;
  let x = logo.x ?? 24;
  let y = logo.y ?? 24;

  if (logo.position === "top-left") {
    x = 24;
    y = 24;
  } else if (logo.position === "top-right") {
    x = stageWidth - w - 24;
    y = 24;
  } else if (logo.position === "bottom-left") {
    x = 24;
    y = stageHeight - h - 24;
  } else if (logo.position === "bottom-right") {
    x = stageWidth - w - 24;
    y = stageHeight - h - 24;
  }

  return (
    <KonvaImage
      image={image}
      x={x}
      y={y}
      width={w}
      height={h}
      opacity={logo.opacity ?? 1}
      listening={interactive}
      onClick={onSelect}
      onTap={onSelect}
    />
  );
}

/** Official elements inside CanvasPostStage's existing Layer; no diagnostic scene or second renderer. */
export function ArsenalCompositionContents({
  composition: c,
  interactive,
  bridge,
  register,
  onSelect,
  onTransform,
  createSnapBoundFunc,
  onDragMove,
  onDragEnd,
}: {
  composition: ArsenalComposition;
  interactive: boolean;
  bridge: ArsenalTextBridge;
  register: (id: string, node: any, isText: boolean) => void;
  onSelect: (id: string) => void;
  onTransform: (id: string, patch: Record<string, number>) => void;
  createSnapBoundFunc?: (width: number, height: number) => (pos: { x: number; y: number }) => { x: number; y: number };
  onDragMove?: () => void;
  onDragEnd?: () => void;
}) {
  const render = (node: ArsenalElement | ArsenalGroup): React.ReactNode => {
    const isGroup = !("kind" in node),
      e = node as ArsenalElement;
    const layout = !isGroup && e.kind === "text" ? arsenalTextLayout(e) : null;
    const editing = bridge.target === node.id;
    const choose = (event: Event) => {
      event.cancelBubble = true;
      if (event.evt?.shiftKey && node.parentId) onSelect(node.parentId);
      else onSelect(node.id);
    };
    const commit = (event: Event) => {
      if (event.target !== event.currentTarget) return;
      event.cancelBubble = true;
      const target = event.target;
      const patch: Record<string, any> = {
        x: Math.round(target.x()),
        y: Math.round(target.y()),
        rotation: Math.round(target.rotation()),
      };
      if (isGroup) {
        Object.assign(patch, { scale: Number(target.scaleX().toFixed(4)) });
      } else if (target.scaleX() !== 1 || target.scaleY() !== 1) {
        if (e.kind === "text") {
          const scaleX = target.scaleX();
          const scaleY = target.scaleY();
          const isLateral = Math.abs(scaleY - 1) < 0.005;
          const factor = isLateral ? scaleX : (Math.abs(scaleX - 1) > Math.abs(scaleY - 1) ? scaleX : scaleY);
          const newWidth = Math.max(20, Math.round(node.width * (isLateral ? scaleX : factor)));
          patch.width = newWidth;
          if (!isLateral) {
            patch.fontSize = Math.max(8, Math.round(e.fontSize * factor));
          }
        } else {
          Object.assign(patch, {
            width: Math.max(20, Math.round(node.width * target.scaleX())),
            height: Math.max(20, Math.round(node.height * target.scaleY())),
          });
        }
      }
      target.scaleX(
        isGroup ? (patch as typeof patch & { scale: number }).scale : 1
      );
      target.scaleY(
        isGroup ? (patch as typeof patch & { scale: number }).scale : 1
      );
      onTransform(node.id, patch);
    };
    return (
      <Group
        key={node.id}
        name={`arsenal-${node.id}`}
        ref={ref => register(node.id, ref, Boolean(layout))}
        x={node.x}
        y={node.y}
        rotation={node.rotation}
        opacity={node.opacity}
        scaleX={isGroup ? (node as ArsenalGroup).scale : 1}
        scaleY={isGroup ? (node as ArsenalGroup).scale : 1}
        draggable={interactive && !editing}
        dragBoundFunc={
          createSnapBoundFunc
            ? createSnapBoundFunc(
                isGroup ? ((node as ArsenalGroup).width ?? 100) : (e.width ?? 100),
                isGroup ? ((node as ArsenalGroup).height ?? 100) : (e.height ?? 100)
              )
            : undefined
        }
        listening={interactive}
        onDragMove={onDragMove}
        onDragEnd={(event) => {
          onDragEnd?.();
          commit(event);
        }}
        onTransformEnd={commit}
        onClick={event => {
          event.cancelBubble = true;
          if (layout && !event.evt?.shiftKey)
            bridge.click(event, node.id, layout);
          else choose(event);
        }}
        onTap={choose}
        onDblClick={event => {
          event.cancelBubble = true;
          if (layout) bridge.doubleClick(event, node.id, layout);
        }}
        onDblTap={event => {
          event.cancelBubble = true;
          if (layout) bridge.doubleClick(event, node.id, layout);
        }}
        onMouseDown={event => {
          if (layout) bridge.down(event, node.id, layout);
        }}
        onMouseMove={event => {
          if (layout) bridge.move(event, node.id, layout);
        }}
        onMouseUp={bridge.up}
        onTouchStart={event => {
          if (layout) bridge.touchStart(event, node.id, layout);
        }}
        onTouchMove={event => {
          if (layout) bridge.touchMove(event, node.id, layout);
        }}
        onTouchEnd={bridge.up}
        onTouchCancel={bridge.up}
      >
        {isGroup ? (
          orderedArsenalNodes(c, node.id).map(render)
        ) : e.kind === "text" && layout ? (
          <>
            <Rect
              width={e.width}
              height={Math.max(e.height, layout.height)}
              fill="rgba(0,0,0,0.001)"
            />
            {editing &&
              getSelectionGeometry(
                layout,
                bridge.selection.start,
                bridge.selection.end
              ).map(r => (
                <Rect
                  key={r.lineIndex}
                  x={r.x}
                  y={r.y}
                  width={r.width}
                  height={r.height}
                  fill="rgba(56,189,248,.34)"
                  listening={false}
                />
              ))}
            {(() => {
              const effect = c.version === 3 ? c.effects?.[e.id] : undefined;
              if (!effect || effect.effect === "none") return null;
              if (effect.effect.startsWith("box-")) {
                const isAccent = effect.effect === "box-accent";
                const isPill = effect.effect === "box-pill";
                return (
                  <Rect
                    x={-8}
                    y={-4}
                    width={e.width + 16}
                    height={Math.max(e.height, layout.height) + 8}
                    fill={
                      effect.color ||
                      (isAccent ? "#E5A93C" : "rgba(0,0,0,0.65)")
                    }
                    cornerRadius={isPill ? 14 : 4}
                    listening={false}
                  />
                );
              }
              return null;
            })()}
            {e.extrusion && Array.from({ length: e.extrusion.steps }, (_, i) => e.extrusion!.steps - i).map(step => (
              <Group key={`extrusion-${step}`} x={e.extrusion!.offsetX * step / e.extrusion!.steps} y={e.extrusion!.offsetY * step / e.extrusion!.steps} listening={false}>
                <RichTextRenderer text={e.text} richText={e.richText?.map(run => ({ ...run, color: e.extrusion!.color }))}
                  width={e.width} fontSize={e.fontSize} fontFamily={e.fontFamily} fontStyle={String(e.fontWeight)}
                  fill={e.extrusion!.color} align={e.align} lineHeight={e.lineHeight} letterSpacing={e.letterSpacing} wordBreak="word" />
              </Group>
            ))}
            <RichTextRenderer
              text={e.text}
              richText={e.richText}
              width={e.width}
              fontSize={e.fontSize}
              fontFamily={e.fontFamily}
              fontStyle={String(e.fontWeight)}
              fill={e.fill}
              align={e.align}
              lineHeight={e.lineHeight}
              letterSpacing={e.letterSpacing}
              wordBreak="word"
              stroke={
                (c.version === 3 && c.effects?.[e.id]?.effect === "outline"
                  ? c.effects[e.id]?.color || "#000000"
                  : e.stroke) ?? undefined
              }
              strokeWidth={
                c.version === 3 && c.effects?.[e.id]?.effect === "outline"
                  ? 2
                  : e.strokeWidth
              }
              shadowColor={
                c.version === 3 && c.effects?.[e.id]?.effect === "shadow"
                  ? c.effects[e.id]?.color || "#000000"
                  : undefined
              }
              shadowBlur={
                c.version === 3 && c.effects?.[e.id]?.effect === "shadow"
                  ? c.effects[e.id]?.blur || 6
                  : undefined
              }
              shadowOffsetX={
                c.version === 3 && c.effects?.[e.id]?.effect === "shadow"
                  ? c.effects[e.id]?.offset?.x ?? 2
                  : undefined
              }
              shadowOffsetY={
                c.version === 3 && c.effects?.[e.id]?.effect === "shadow"
                  ? c.effects[e.id]?.offset?.y ?? 2
                  : undefined
              }
            />
            {editing &&
              (() => {
                const caret = getCaretGeometry(layout, bridge.selection.end);
                return (
                  <Line
                    points={[caret.x, caret.y, caret.x, caret.y + caret.height]}
                    stroke="#38bdf8"
                    strokeWidth={3}
                    listening={false}
                  />
                );
              })()}
            {editing && bridge.selectionHandles?.(node.id, layout)}
          </>
        ) : e.kind === "media" ? (
          <SlotImage
            e={e}
            c={c}
            onSelect={onSelect}
            interactive={interactive}
          />
        ) : e.kind === "rect" ? (
          <Rect
            width={e.width}
            height={e.height}
            fill={e.fill}
            stroke={e.stroke ?? undefined}
            strokeWidth={e.strokeWidth}
            cornerRadius={e.cornerRadius}
          />
        ) : (
          <Line
            points={e.points}
            closed={e.kind === "polygon"}
            fill={e.kind === "polygon" ? e.fill : undefined}
            stroke={e.stroke ?? e.fill}
            strokeWidth={e.strokeWidth}
          />
        )}
      </Group>
    );
  };
  const scale = 360 / c.artboard.width;
  const stageHeight = c.artboard.height * scale;
  return (
    <>
      <Rect
        name="canvas-bg"
        width={360}
        height={stageHeight}
        fill={c.artboard.background}
        listening={false}
      />
      {c.version === 3 && c.customBackground?.imageUrl && (
        <CompositionCustomBackground
          bg={c.customBackground}
          stageWidth={360}
          stageHeight={stageHeight}
        />
      )}
      <Group
        scaleX={scale * c.projection.scale}
        scaleY={scale * c.projection.scale}
        x={c.projection.x * scale}
        y={c.projection.y * scale}
      >
        {orderedArsenalNodes(c, null).map(render)}
      </Group>
      {c.version === 3 && c.logo?.url && (
        <CompositionLogo
          logo={c.logo}
          stageWidth={360}
          stageHeight={stageHeight}
          interactive={interactive}
          onSelect={() => onSelect("logo")}
        />
      )}
    </>
  );
}
