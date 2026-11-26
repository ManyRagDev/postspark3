import { layoutRichText } from "@shared/arsenalTextLayout";
import type { RichTextLayoutConfig } from "@shared/arsenalTextLayout";
import { aspectRatioHeight } from "@shared/aspectRatios";
import type { ArtworkProposal, ArtworkText, DesignDna } from "@shared/designExtraction";
import {
  INITIAL_POST,
  customTextFontStyle,
  type AspectRatioType,
  type CanvasCustomText,
  type CanvasPostModel,
} from "../CanvasLab/components/types";

const WIDTH = 360;
type MeasureGlyph = RichTextLayoutConfig["measureGlyph"];
type ArtworkStyle = Pick<DesignDna, "palette" | "typography">;

export function artworkTextFont(dna: ArtworkStyle, text: ArtworkText) {
  const headline = text.role === "headline";
  const { headingFont, bodyFont, labelFont, headingWeight } = dna.typography;
  return {
    fontFamily: text.fontFamily ?? (headline ? headingFont : text.role === "support" ? bodyFont : labelFont),
    fontWeight: text.fontWeight ?? (headline ? headingWeight : 400),
    fontStyle: text.italic ? "italic" as const : "normal" as const,
  };
}

function fitArtworkText(text: ArtworkText, dna: ArtworkStyle, height: number, index: number, measureGlyph?: MeasureGlyph): CanvasCustomText {
  const x = Math.min(WIDTH - 20, text.box.x * WIDTH);
  const y = Math.min(height - 10, text.box.y * height);
  const width = Math.max(20, Math.min(WIDTH - x, text.box.width * WIDTH));
  const availableHeight = Math.max(10, Math.min(height - y, text.box.height * height));
  const font = artworkTextFont(dna, text);
  const lineHeight = 1.13;
  const spacing = (size: number) => (text.letterSpacing ?? 0) * size / text.fontSize;
  const fits = (size: number) => {
    const measured = layoutRichText({
      text: text.text,
      width,
      fontSize: size,
      fontFamily: font.fontFamily,
      fontStyle: customTextFontStyle(font),
      fill: text.color,
      lineHeight,
      letterSpacing: spacing(size),
      measureGlyph,
    });
    return measured.height <= availableHeight && measured.lines.every(line => {
      const atWordBoundary = line.end === 0 || line.end === text.text.length ||
        /\s/.test(text.text.slice(line.end - 1, line.end + 1));
      return line.width <= width - 1 && atWordBoundary;
    });
  };

  let fontSize = text.fontSize;
  if (!fits(fontSize)) {
    let low = 1;
    let high = fontSize;
    for (let pass = 0; pass < 8; pass++) {
      const size = (low + high) / 2;
      if (fits(size)) low = size;
      else high = size;
    }
    fontSize = low;
  }

  return {
    id: `art-text-${index + 1}`,
    text: text.text,
    contentRole: text.role,
    x,
    y,
    width,
    ...font,
    fontSize,
    align: text.align,
    color: text.color,
    lineHeight,
    letterSpacing: spacing(fontSize),
  };
}

export function artworkToCanvasModel(
  dna: ArtworkStyle,
  proposal: ArtworkProposal,
  aspectRatio: AspectRatioType,
  measureGlyph?: MeasureGlyph
): CanvasPostModel {
  const height = aspectRatioHeight(aspectRatio);
  const extraTexts = proposal.texts.map((text, index) => fitArtworkText(text, dna, height, index, measureGlyph));
  const extraShapes = proposal.shapes.map((shape, index) => {
    const width = shape.box.width * WIDTH;
    const shapeHeight = shape.box.height * height;
    return {
      id: `art-shape-${index + 1}`,
      x: shape.box.x * WIDTH,
      y: shape.box.y * height,
      width,
      height: shapeHeight,
      color: shape.fill ?? "transparent",
      cornerRadius: Math.min(shape.cornerRadius ?? 0, width / 2, shapeHeight / 2),
      strokeColor: shape.stroke,
      strokeWidth: shape.stroke ? shape.strokeWidth ?? 1 : undefined,
      shadowOffset: shape.shadowOffset,
    };
  });
  const headline = extraTexts.find(text => text.contentRole === "headline");
  const body = extraTexts.find(text => text.contentRole === "support");
  const { background } = proposal;
  return {
    ...structuredClone(INITIAL_POST),
    id: `extracted-art-${crypto.randomUUID()}`,
    aspectRatio,
    familyId: "minimal-air",
    familyName: proposal.name,
    fontFamily: headline?.fontFamily ?? dna.typography.headingFont,
    subtextFontFamily: body?.fontFamily ?? dna.typography.bodyFont,
    headline: "",
    subtext: "",
    caption: proposal.caption,
    imagePrompt: "",
    palette: {
      ...dna.palette,
      background: background.color,
      headlineColor: headline?.color ?? dna.palette.text,
      subtextColor: body?.color ?? dna.palette.text,
    },
    overlayOpacity: 0,
    showBadge: false,
    showStep: false,
    isSnapEnabled: true,
    currentSlideIndex: 0,
    slides: [{
      id: "slide-1",
      step: "",
      headline: "",
      subtext: "",
      suppressFamilyDecorations: true,
      backgroundTreatment: {
        kind: background.kind,
        tint: background.tint ?? background.color,
        x: background.x ?? 0.5,
        y: background.y ?? 0.5,
        texture: background.texture ?? "none",
      },
      extraTexts,
      extraShapes,
    }],
  };
}
