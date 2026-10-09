import { useEffect, useMemo, useState } from "react";
import { Group, Image as KonvaImage, Line, Rect, Text } from "react-konva";
import type { ReferenceMediaImage } from "../../Admin2/matrixMedia";
import type {
  ReferenceReconstructionSpecV2,
  ReferenceSceneLayer,
} from "@shared/referenceReconstruction";
import type { RecreationLayerStyle } from "@shared/designRecreation";
import { layoutRichText } from "../lib/richTextLayout";
import { loadFont } from "@/lib/fonts";
import {
  ensureReferenceFontsLoaded,
  referenceFontFamily,
} from "../lib/referenceFonts";

function useSceneFonts(scene: ReferenceReconstructionSpecV2): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const pending = [
      ensureReferenceFontsLoaded(scene),
      ...scene.fonts.map(async font => {
        if (
          !font.dataUrl &&
          font.sourceUrl?.startsWith("https://fonts.googleapis.com/")
        ) {
          loadFont(font.sourceUrl);
          await document.fonts.load(
            `${font.weight} 24px "${font.family.replace(/["\\]/g, "")}"`
          );
        }
      }),
    ];
    void Promise.allSettled(pending).then(() => {
      if (active) setRevision(value => value + 1);
    });
    return () => {
      active = false;
    };
  }, [scene.fonts]);
  return revision;
}

function TextLayer({
  layer,
  scene,
  textMode,
  fontRevision,
}: {
  layer: ReferenceSceneLayer;
  scene: ReferenceReconstructionSpecV2;
  textMode?: "wrap" | "fixed-lines";
  fontRevision: number;
}) {
  const fontFamily = referenceFontFamily(
    scene,
    layer.fontFamily,
    layer.fontWeight
  );
  const layout = useMemo(
    () =>
      layoutRichText({
        text: layer.text ?? "",
        width: Math.max(20, layer.width),
        fontSize: layer.fontSize,
        fontFamily,
        fontStyle: String(layer.fontWeight),
        fill: layer.fill,
        align: layer.align,
        lineHeight: layer.lineHeight,
        letterSpacing: layer.letterSpacing,
        wrap: textMode !== "fixed-lines",
      }),
    [
      layer.text,
      layer.width,
      layer.fontSize,
      fontFamily,
      layer.fontWeight,
      layer.fill,
      layer.align,
      layer.lineHeight,
      layer.letterSpacing,
      textMode,
      fontRevision,
    ]
  );

  const offsets = layer.extrusion
    ? Array.from(
        { length: layer.extrusion.steps },
        (_, index) => (index + 1) / layer.extrusion!.steps
      ).reverse()
    : [];

  if (layer.kind === "arcText" && layer.arc) {
    const glyphs = layout.glyphs.filter(glyph => glyph.text !== "\n");
    let travel = 0;
    const direction = layer.arc.clockwise ? 1 : -1;
    return (
      <Group opacity={layer.opacity} listening={false}>
        {glyphs.map((glyph, index) => {
          const centerDistance = travel + glyph.width / 2;
          travel += glyph.width;
          const angle =
            layer.arc!.startAngleDeg +
            (((direction * centerDistance) / layer.arc!.radius) * 180) /
              Math.PI;
          const radians = (angle * Math.PI) / 180;
          const x = layer.arc!.centerX + Math.cos(radians) * layer.arc!.radius;
          const y = layer.arc!.centerY + Math.sin(radians) * layer.arc!.radius;
          return (
            <Text
              key={`${index}-${glyph.start}`}
              text={glyph.text}
              x={x}
              y={y}
              offsetX={glyph.width / 2}
              offsetY={glyph.fontSize / 2}
              rotation={
                angle + (layer.arc!.clockwise ? 90 : -90) + layer.rotationDeg
              }
              fontSize={glyph.fontSize}
              fontFamily={fontFamily}
              fontStyle={glyph.fontStyle}
              fill={layer.fill}
              stroke={layer.strokeColor ?? undefined}
              strokeWidth={layer.strokeWidth}
              fillAfterStrokeEnabled
              letterSpacing={layer.letterSpacing}
              listening={false}
            />
          );
        })}
      </Group>
    );
  }

  const drawRuns = (fill: string, dx: number, dy: number, suffix: string) =>
    layout.runs.map(run => (
      <Text
        key={`${suffix}-${run.start}-${run.end}-${run.lineIndex}`}
        text={run.text}
        x={run.x + dx}
        y={run.y + dy}
        width={Math.max(run.width + 2, layer.width - run.x)}
        height={run.height}
        fontSize={run.fontSize}
        fontFamily={fontFamily}
        fontStyle={run.fontStyle}
        fill={fill}
        stroke={
          suffix === "face" ? (layer.strokeColor ?? undefined) : undefined
        }
        strokeWidth={suffix === "face" ? layer.strokeWidth : 0}
        fillAfterStrokeEnabled
        wrap={textMode === "fixed-lines" ? "none" : "word"}
        letterSpacing={layer.letterSpacing}
        listening={false}
      />
    ));

  return (
    <Group
      x={layer.x}
      y={layer.y}
      rotation={layer.rotationDeg}
      opacity={layer.opacity}
      listening={false}
    >
      {layer.extrusion &&
        offsets.map((fraction, index) => (
          <Group key={`extrusion-${index}`}>
            {drawRuns(
              layer.extrusion!.color,
              layer.extrusion!.offsetX * fraction,
              layer.extrusion!.offsetY * fraction,
              `shadow-${index}`
            )}
          </Group>
        ))}
      {drawRuns(layer.fill, 0, 0, "face")}
    </Group>
  );
}

function SceneLayer({
  layer,
  scene,
  textMode,
  fontRevision,
  style,
  media,
}: {
  layer: ReferenceSceneLayer;
  scene: ReferenceReconstructionSpecV2;
  textMode?: "wrap" | "fixed-lines";
  fontRevision: number;
  style?: RecreationLayerStyle;
  media?: ReferenceMediaImage;
}) {
  if (layer.kind === "rect" && media) {
    const scale = Math.max(
      layer.width / media.image.naturalWidth,
      layer.height / media.image.naturalHeight
    );
    const width = layer.width / scale,
      height = layer.height / scale;
    return (
      <Group
        x={layer.x}
        y={layer.y}
        rotation={layer.rotationDeg}
        opacity={layer.opacity}
        listening={false}
      >
        <KonvaImage
          image={media.image}
          width={layer.width}
          height={layer.height}
          cornerRadius={Math.min(
            style?.cornerRadiusPx ?? 0,
            layer.width / 2,
            layer.height / 2
          )}
          crop={{
            x: (media.image.naturalWidth - width) * media.positionX,
            y: (media.image.naturalHeight - height) * media.positionY,
            width,
            height,
          }}
          listening={false}
        />
        {layer.strokeWidth > 0 && (
          <Rect
            width={layer.width}
            height={layer.height}
            stroke={layer.strokeColor ?? undefined}
            strokeWidth={layer.strokeWidth}
            cornerRadius={style?.cornerRadiusPx ?? 0}
            listening={false}
          />
        )}
      </Group>
    );
  }
  if (layer.kind === "text" || layer.kind === "arcText")
    return (
      <TextLayer
        layer={layer}
        scene={scene}
        textMode={textMode}
        fontRevision={fontRevision}
      />
    );
  if (layer.kind === "rect")
    return (
      <Rect
        x={layer.x}
        y={layer.y}
        width={layer.width}
        height={layer.height}
        rotation={layer.rotationDeg}
        fill={layer.fill}
        stroke={layer.strokeColor ?? undefined}
        strokeWidth={layer.strokeWidth}
        cornerRadius={Math.min(
          style?.cornerRadiusPx ?? 0,
          layer.width / 2,
          layer.height / 2
        )}
        opacity={layer.opacity}
        listening={false}
      />
    );
  return (
    <Line
      x={layer.x}
      y={layer.y}
      points={layer.points}
      closed={layer.kind === "polygon"}
      fill={layer.kind === "polygon" ? layer.fill : undefined}
      stroke={
        style && layer.strokeWidth === 0
          ? undefined
          : (layer.strokeColor ?? layer.fill)
      }
      strokeWidth={style ? layer.strokeWidth : Math.max(0.5, layer.strokeWidth)}
      rotation={layer.rotationDeg}
      opacity={layer.opacity}
      lineCap="round"
      lineJoin="round"
      listening={false}
    />
  );
}

export function ReferenceSceneContents({
  scene,
  stageWidth,
  textMode,
  layerStyles,
  mediaImages,
}: {
  scene: ReferenceReconstructionSpecV2;
  stageWidth: number;
  textMode?: "wrap" | "fixed-lines";
  layerStyles?: RecreationLayerStyle[];
  mediaImages?: ReferenceMediaImage[];
}) {
  const fontRevision = useSceneFonts(scene);
  const scale = stageWidth / scene.source.widthPx;
  return (
    <Group scaleX={scale} scaleY={scale} listening={false}>
      <Rect
        x={0}
        y={0}
        width={scene.source.widthPx}
        height={scene.source.heightPx}
        fill={scene.artboard.background}
        listening={false}
      />
      {[...scene.layers]
        .sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id))
        .map(layer => (
          <SceneLayer
            key={layer.id}
            layer={layer}
            scene={scene}
            textMode={textMode}
            fontRevision={fontRevision}
            style={layerStyles?.find(style => style.layerId === layer.id)}
            media={mediaImages?.find(m => m.layerId === layer.id)}
          />
        ))}
    </Group>
  );
}
