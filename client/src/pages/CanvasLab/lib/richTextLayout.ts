import type { CanvasRichTextChunk } from "../components/types";

export interface RichTextStyle {
  color?: string;
  sizeScale?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface RichTextLayoutConfig {
  text: string;
  richText?: CanvasRichTextChunk[];
  width: number;
  fontSize: number;
  fontFamily: string;
  fontStyle?: string;
  fill: string;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
}

export interface RichTextGlyph extends RichTextStyle {
  text: string;
  start: number;
  end: number;
  x: number;
  y: number;
  width: number;
  height: number;
  lineIndex: number;
  fontSize: number;
  fontStyle: string;
  fill: string;
}

export interface RichTextPositionedRun extends RichTextStyle {
  text: string;
  start: number;
  end: number;
  x: number;
  y: number;
  width: number;
  height: number;
  lineIndex: number;
  fontSize: number;
  fontStyle: string;
  fill: string;
}

export interface RichTextLine {
  index: number;
  y: number;
  width: number;
  height: number;
  start: number;
  end: number;
}

export interface RichTextLayout {
  width: number;
  height: number;
  glyphs: RichTextGlyph[];
  runs: RichTextPositionedRun[];
  lines: RichTextLine[];
}

export interface CaretGeometry {
  x: number;
  y: number;
  height: number;
  lineIndex: number;
}

export interface SelectionGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  lineIndex: number;
}

function stylesEqual(a: RichTextStyle, b: RichTextStyle): boolean {
  return a.color === b.color &&
    a.sizeScale === b.sizeScale &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline;
}

function styleAt(index: number, chunks: CanvasRichTextChunk[] | undefined): RichTextStyle {
  if (!chunks?.length) return {};
  let offset = 0;
  for (const chunk of chunks) {
    const nextOffset = offset + chunk.text.length;
    if (index >= offset && index < nextOffset) {
      return {
        color: chunk.color,
        sizeScale: chunk.sizeScale,
        bold: chunk.bold,
        italic: chunk.italic,
        underline: chunk.underline,
      };
    }
    offset = nextOffset;
  }
  return {};
}

function fontString(fontSize: number, fontFamily: string, fontStyle: string): string {
  const family = fontFamily
    .split(",")
    .map(value => {
      const trimmed = value.trim();
      return trimmed.startsWith('"') || trimmed.startsWith("'") ? trimmed : `"${trimmed}"`;
    })
    .join(", ");
  return `${fontStyle} ${fontSize}px ${family}`;
}

function createMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  return document.createElement("canvas").getContext("2d");
}

function splitGraphemes(text: string): Array<{ text: string; start: number; end: number }> {
  const result: Array<{ text: string; start: number; end: number }> = [];
  let offset = 0;
  for (const char of Array.from(text)) {
    result.push({ text: char, start: offset, end: offset + char.length });
    offset += char.length;
  }
  return result;
}

export function layoutRichText(config: RichTextLayoutConfig): RichTextLayout {
  const width = Math.max(20, config.width);
  const lineHeight = config.lineHeight ?? 1.25;
  const letterSpacing = config.letterSpacing ?? 0;
  const baseStyle = config.fontStyle ?? "normal";
  const baseBold = baseStyle.includes("bold");
  const baseItalic = baseStyle.includes("italic");
  const ctx = createMeasureContext();
  const source = splitGraphemes(config.text);
  const glyphs: RichTextGlyph[] = [];
  const lineMeta: Array<{ width: number; height: number; start: number; end: number }> = [];

  const resolved = source.map(item => {
    const style = styleAt(item.start, config.richText);
    const resolvedFontSize = Math.max(1, config.fontSize * (style.sizeScale || 1));
    const bold = style.bold ?? baseBold;
    const italic = style.italic ?? baseItalic;
    const resolvedFontStyle = `${italic ? "italic " : ""}${bold ? "bold" : "normal"}`.trim();
    if (ctx) ctx.font = fontString(resolvedFontSize, config.fontFamily, resolvedFontStyle);
    const measuredWidth = ctx
      ? ctx.measureText(item.text).width + letterSpacing
      : resolvedFontSize * (item.text === " " ? 0.32 : 0.55) + letterSpacing;
    return {
      ...item,
      ...style,
      fontSize: resolvedFontSize,
      fontStyle: resolvedFontStyle,
      fill: style.color || config.fill,
      measuredWidth: Math.max(0, measuredWidth),
      measuredHeight: resolvedFontSize * lineHeight,
    };
  });

  let lineIndex = 0;
  let x = 0;
  let lineStart = 0;
  let lineEnd = 0;
  let lineMaxHeight = config.fontSize * lineHeight;

  const closeLine = () => {
    lineMeta[lineIndex] = {
      width: x,
      height: lineMaxHeight,
      start: lineStart,
      end: lineEnd,
    };
    lineIndex += 1;
    x = 0;
    lineStart = lineEnd;
    lineMaxHeight = config.fontSize * lineHeight;
  };

  for (let index = 0; index < resolved.length; index += 1) {
    const item = resolved[index];
    if (item.text === "\n") {
      lineEnd = item.end;
      closeLine();
      lineStart = item.end;
      continue;
    }

    const beginsWord = !/\s/.test(item.text) && (index === 0 || /\s/.test(resolved[index - 1].text));
    if (beginsWord) {
      let wordWidth = 0;
      for (let cursor = index; cursor < resolved.length && !/\s/.test(resolved[cursor].text); cursor += 1) {
        wordWidth += resolved[cursor].measuredWidth;
      }
      if (x > 0 && x + wordWidth > width) closeLine();
    }

    if (/\s/.test(item.text) && x === 0) {
      lineStart = item.start;
      lineEnd = item.end;
      continue;
    }

    if (x > 0 && x + item.measuredWidth > width) closeLine();

    glyphs.push({
      text: item.text,
      start: item.start,
      end: item.end,
      x,
      y: 0,
      width: item.measuredWidth,
      height: item.measuredHeight,
      lineIndex,
      fontSize: item.fontSize,
      fontStyle: item.fontStyle,
      fill: item.fill,
      color: item.color,
      sizeScale: item.sizeScale,
      bold: item.bold,
      italic: item.italic,
      underline: item.underline,
    });
    x += item.measuredWidth;
    lineEnd = item.end;
    lineMaxHeight = Math.max(lineMaxHeight, item.measuredHeight);
  }

  if (!lineMeta[lineIndex]) closeLine();

  let y = 0;
  const lines = lineMeta.map((line, index) => {
    const offsetX = config.align === "center"
      ? (width - line.width) / 2
      : config.align === "right"
      ? width - line.width
      : 0;
    const currentY = y;
    for (const glyph of glyphs) {
      if (glyph.lineIndex === index) {
        glyph.x += offsetX;
        glyph.y = currentY;
        glyph.height = line.height;
      }
    }
    y += line.height;
    return { index, y: currentY, ...line };
  });

  const runs: RichTextPositionedRun[] = [];
  for (const glyph of glyphs) {
    const previous = runs[runs.length - 1];
    if (previous && previous.lineIndex === glyph.lineIndex && previous.end === glyph.start && stylesEqual(previous, glyph)) {
      previous.text += glyph.text;
      previous.end = glyph.end;
      previous.width += glyph.width;
      previous.height = Math.max(previous.height, glyph.height);
    } else {
      runs.push({ ...glyph });
    }
  }

  return {
    width,
    height: Math.max(config.fontSize * lineHeight, y),
    glyphs,
    runs,
    lines,
  };
}

export function getCaretGeometry(layout: RichTextLayout, requestedIndex: number): CaretGeometry {
  const index = Math.max(0, requestedIndex);
  const exact = layout.glyphs.find(glyph => index >= glyph.start && index < glyph.end);
  if (exact) {
    const after = index > exact.start;
    return {
      x: exact.x + (after ? exact.width : 0),
      y: exact.y,
      height: exact.height,
      lineIndex: exact.lineIndex,
    };
  }

  const previous = [...layout.glyphs].reverse().find(glyph => glyph.end <= index);
  if (previous) {
    return {
      x: previous.x + previous.width,
      y: previous.y,
      height: previous.height,
      lineIndex: previous.lineIndex,
    };
  }

  const firstLine = layout.lines[0];
  return {
    x: 0,
    y: firstLine?.y || 0,
    height: firstLine?.height || layout.height,
    lineIndex: 0,
  };
}

export function getSelectionGeometry(layout: RichTextLayout, start: number, end: number): SelectionGeometry[] {
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  if (from === to) return [];

  const rectangles = new Map<number, SelectionGeometry>();
  for (const glyph of layout.glyphs) {
    if (glyph.end <= from || glyph.start >= to) continue;
    const current = rectangles.get(glyph.lineIndex);
    if (!current) {
      rectangles.set(glyph.lineIndex, {
        x: glyph.x,
        y: glyph.y,
        width: glyph.width,
        height: glyph.height,
        lineIndex: glyph.lineIndex,
      });
    } else {
      const right = Math.max(current.x + current.width, glyph.x + glyph.width);
      current.x = Math.min(current.x, glyph.x);
      current.width = right - current.x;
      current.height = Math.max(current.height, glyph.height);
    }
  }
  return Array.from(rectangles.values());
}

export function hitTestRichText(layout: RichTextLayout, x: number, y: number): number {
  if (!layout.glyphs.length) return 0;
  const line = layout.lines.reduce((best, candidate) => {
    const bestDistance = Math.abs(y - (best.y + best.height / 2));
    const candidateDistance = Math.abs(y - (candidate.y + candidate.height / 2));
    return candidateDistance < bestDistance ? candidate : best;
  }, layout.lines[0]);
  const glyphs = layout.glyphs.filter(glyph => glyph.lineIndex === line.index);
  if (!glyphs.length) return line.end;
  if (x <= glyphs[0].x) return glyphs[0].start;
  for (const glyph of glyphs) {
    if (x <= glyph.x + glyph.width / 2) return glyph.start;
    if (x <= glyph.x + glyph.width) return glyph.end;
  }
  return glyphs[glyphs.length - 1].end;
}
