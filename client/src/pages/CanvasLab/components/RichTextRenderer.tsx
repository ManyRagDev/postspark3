import React, { useMemo } from "react";
import { Group, Text } from "react-konva";
import type { CanvasRichTextChunk } from "./types";
import { layoutRichText, type RichTextLayout } from "../lib/richTextLayout";

interface RichTextRendererProps {
  text: string;
  x?: number;
  y?: number;
  richText?: CanvasRichTextChunk[];
  width: number;
  fontSize: number;
  fontFamily: string;
  fontStyle?: string;
  fill: string;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  opacity?: number;
  onDblClick?: (event: any) => void;
  onDblTap?: (event: any) => void;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetY?: number;
  shadowOffsetX?: number;
  stroke?: string;
  strokeWidth?: number;
  fillAfterStrokeEnabled?: boolean;
  fillGradient?: { colors: string[]; start: number; end: number };
  wordBreak?: "word" | "grapheme";
}

type LayoutProps = Pick<
  RichTextRendererProps,
  "text" | "richText" | "width" | "fontSize" | "fontFamily" | "fontStyle" | "fill" | "align" | "lineHeight" | "letterSpacing" | "wordBreak"
>;

export function useRichTextLayout({
  text,
  richText,
  width,
  fontSize,
  fontFamily,
  fontStyle = "normal",
  fill,
  align = "left",
  lineHeight = 1.25,
  letterSpacing = 0,
  wordBreak,
}: LayoutProps): RichTextLayout {
  return useMemo(
    () => layoutRichText({
      text,
      richText,
      width,
      fontSize,
      fontFamily,
      fontStyle,
      fill,
      align,
      lineHeight,
      letterSpacing,
      wordBreak,
    }),
    [text, richText, width, fontSize, fontFamily, fontStyle, fill, align, lineHeight, letterSpacing, wordBreak]
  );
}

export default function RichTextRenderer({
  text,
  richText,
  width,
  fontSize,
  fontFamily,
  fontStyle = "normal",
  fill,
  align = "left",
  lineHeight = 1.25,
  letterSpacing = 0,
  wordBreak,
  opacity = 1,
  x = 0,
  y = 0,
  ...effectProps
}: RichTextRendererProps) {
  const layout = useRichTextLayout({
    text,
    richText,
    width,
    fontSize,
    fontFamily,
    fontStyle,
    fill,
    align,
    lineHeight,
    letterSpacing,
    wordBreak,
  });
  const gradient = effectProps.fillGradient;
  const colorStops = gradient?.colors.flatMap((color, index, colors) => [
    index / (colors.length - 1), color,
  ]);

  return (
    <Group
      opacity={opacity}
      x={x}
      y={y}
      onDblClick={effectProps.onDblClick}
      onDblTap={effectProps.onDblTap}
    >
      {layout.runs.map(run => (
        <Text
          key={`${run.start}-${run.end}-${run.lineIndex}`}
          text={run.text}
          x={run.x}
          y={run.y}
          fontSize={run.fontSize}
          fontFamily={fontFamily}
          fontStyle={run.fontStyle}
          textDecoration={run.underline ? "underline" : undefined}
          fill={run.fill}
          fillPriority={gradient ? "linear-gradient" : "color"}
          fillLinearGradientStartPoint={gradient
            ? { x: 0, y: gradient.start * layout.height - run.y }
            : undefined}
          fillLinearGradientEndPoint={gradient
            ? { x: 0, y: gradient.end * layout.height - run.y }
            : undefined}
          fillLinearGradientColorStops={colorStops}
          height={run.height}
          verticalAlign="top"
          letterSpacing={letterSpacing}
          shadowColor={effectProps.shadowColor}
          shadowBlur={effectProps.shadowBlur}
          shadowOffsetX={effectProps.shadowOffsetX}
          shadowOffsetY={effectProps.shadowOffsetY}
          stroke={effectProps.stroke}
          strokeWidth={effectProps.strokeWidth}
          fillAfterStrokeEnabled={effectProps.fillAfterStrokeEnabled}
        />
      ))}
    </Group>
  );
}
