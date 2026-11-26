import type { DesignDna, IntentItem, PostIntent, ReferenceComposition } from "@shared/designExtraction";
import { layoutRichText } from "@shared/arsenalTextLayout";
import { contrastRatio } from "../CanvasLab/lib/contrast";
import {
  customTextFontStyle,
  type CanvasBackgroundTreatment,
  type CanvasCustomShape,
  type CanvasCustomText,
  type TextAlignType,
} from "../CanvasLab/components/types";

type Block = { width: number; height: number; texts: CanvasCustomText[]; shapes: CanvasCustomShape[] };
type Placement = { block: Block; x: number; y: number };
type Detail = { heading: string; items: IntentItem[]; marker?: string };

function arrange(width: number, placements: Placement[]): Block {
  return {
    width,
    height: Math.max(0, ...placements.map(({ block, y }) => y + block.height)),
    texts: placements.flatMap(({ block, x, y }) =>
      block.texts.map(text => ({ ...text, x: (text.x ?? 0) + x, y: (text.y ?? 0) + y }))
    ),
    shapes: placements.flatMap(({ block, x, y }) =>
      block.shapes.map(shape => ({ ...shape, x: shape.x + x, y: shape.y + y }))
    ),
  };
}

function offset(space: number, align: TextAlignType): number {
  return align === "right" ? space : align === "center" ? space / 2 : 0;
}

function stack(width: number, blocks: Block[], gap: number, align: TextAlignType = "left"): Block {
  let y = 0;
  return arrange(width, blocks.filter(block => block.height > 0).map(block => {
    const placement = { block, x: offset(width - block.width, align), y };
    y += block.height + gap;
    return placement;
  }));
}

function mix(a: string, b: string, amount: number): string {
  const channels = [1, 3, 5].map(i => {
    const from = parseInt(a.slice(i, i + 2), 16);
    const to = parseInt(b.slice(i, i + 2), 16);
    return Math.round(from + (to - from) * amount).toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

function foreground(background: string, preferred: string): string {
  if (contrastRatio(background, preferred) >= 4.5) return preferred;
  return contrastRatio(background, "#FFFFFF") >= 4.5 ? "#FFFFFF" : "#000000";
}

function detailsFor(intent: PostIntent): Detail[] {
  const items = intent.items.filter(item => item.title.trim() || item.text.trim());
  if (intent.kind === "versus") {
    return (["left", "right"] as const).map(side => ({
      heading: (side === "left" ? intent.leftLabel : intent.rightLabel) ?? "",
      items: items.filter(item => item.side === side),
    })).filter(detail => detail.heading || detail.items.length);
  }
  return items.map((item, index) => ({
    heading: "",
    items: [item],
    marker: intent.kind === "steps" ? String(index + 1).padStart(2, "0") : undefined,
  }));
}

function textBlock(value: string, width: number, options: Omit<CanvasCustomText, "id" | "text" | "x" | "y" | "width"> & {
  fontSize: number; fontFamily: string; color: string;
}): Block {
  if (!value.trim()) return { width, height: 0, texts: [], shapes: [] };
  const config = {
    text: value,
    fontSize: options.fontSize,
    fontFamily: options.fontFamily,
    fontStyle: customTextFontStyle(options),
    fill: options.color,
    lineHeight: options.lineHeight,
    letterSpacing: options.letterSpacing,
    richText: options.textRich,
  };
  const unwrapped = layoutRichText({ ...config, width: 100_000 });
  let longestWord = 0;
  let wordWidth = 0;
  let lineIndex = 0;
  for (const glyph of unwrapped.glyphs) {
    if (glyph.lineIndex !== lineIndex || /\s/.test(glyph.text)) wordWidth = 0;
    if (!/\s/.test(glyph.text)) wordWidth += glyph.width;
    longestWord = Math.max(longestWord, wordWidth);
    lineIndex = glyph.lineIndex;
  }
  const scale = longestWord > 0 ? Math.min(1, (width - 1.5) / longestWord) : 1;
  const fontSize = config.fontSize * scale;
  const letterSpacing = config.letterSpacing === undefined ? undefined : config.letterSpacing * scale;
  const layout = layoutRichText({ ...config, width, fontSize, letterSpacing });
  return {
    width,
    height: Math.ceil(layout.height),
    texts: [{ id: "", text: value, x: 0, y: 0, width, ...options, fontSize, letterSpacing }],
    shapes: [],
  };
}

export function composeReferenceIntent(
  dna: DesignDna,
  direction: ReferenceComposition,
  intent: PostIntent,
  width: number,
  height: number
): Pick<Block, "texts" | "shapes"> & { backgroundTreatment: CanvasBackgroundTreatment } {
  const { palette, surfaces, typography } = dna;
  const margin = Math.round(direction.margin * width);
  const gap = Math.round(direction.spacing * width);
  const contentWidth = width - 2 * margin;
  const contentHeight = height - 2 * margin;
  const mainInk = foreground(palette.background, palette.text);
  const label = (value: string) => typography.uppercaseLabels ? value.toLocaleUpperCase() : value;
  const tracking = typography.tracking === "wide" ? 0.045 : typography.tracking === "tight" ? -0.028 : 0;
  const radius = (h: number) => surfaces.corners === "pill" ? h / 2 : surfaces.corners === "rounded" ? Math.min(h / 2, 12) : 0;
  const details = detailsFor(intent);
  const background = direction.background;
  let tint = palette.background;
  if (background.kind !== "solid") {
    for (let strength = background.strength; strength > 0; strength -= 0.05) {
      const candidate = mix(palette.background, palette[background.tint], strength);
      if (contrastRatio(candidate, mainInk) >= 4.5) {
        tint = candidate;
        break;
      }
    }
  }
  const backgroundTreatment = { kind: background.kind, tint, x: background.x, y: background.y, texture: surfaces.texture };

  function box(w: number, h: number, color: string, outlined = false): CanvasCustomShape {
    return {
      id: "", x: 0, y: 0, width: w, height: h, color,
      cornerRadius: radius(h),
      strokeColor: surfaces.borderColor,
      strokeWidth: outlined ? Math.max(1, surfaces.borderWidth / 3) : surfaces.borderWidth / 3,
      shadowOffset: surfaces.hardShadow ? Math.max(2, surfaces.shadowOffset / 3) : undefined,
    };
  }

  function action(w: number, scale: number): Block {
    const value = label(intent.ctaLabel);
    const size = 12 * scale;
    const button = direction.actionStyle !== "text";
    const padding = button ? 9 : 0;
    const fill = direction.actionStyle === "filled" ? palette.accent : palette.background;
    const buttonWidth = Math.min(w, Math.max(68, Math.ceil(value.length * size * 0.62 + padding * 2)));
    const text = textBlock(value, buttonWidth - 2 * padding, {
      fontFamily: typography.labelFont, fontSize: size, fontWeight: 700,
      color: button ? foreground(fill, palette.text) : foreground(palette.background, palette.accent),
      lineHeight: 1.2, align: button ? "center" : direction.alignment, contentRole: "callToAction",
    });
    const control = arrange(buttonWidth, [{ block: text, x: padding, y: padding }]);
    control.height += padding;
    if (button) control.shapes.push(box(buttonWidth, control.height, fill, direction.actionStyle === "outline"));
    const footer = textBlock(intent.footerNote, w, {
      fontFamily: typography.bodyFont, fontSize: 9 * scale, color: mainInk,
      lineHeight: 1.23, align: direction.alignment, contentRole: "footer",
    });
    return stack(w, [control, footer], 6, direction.alignment);
  }

  function lead(w: number, scale: number): Block {
    const titleSize = direction.headingSize * scale;
    const common = { align: direction.alignment, color: mainInk, lineHeight: 1.15 };
    const mark = intent.highlight?.trim();
    const start = mark ? intent.headline.toLowerCase().indexOf(mark.toLowerCase()) : -1;
    const highlightInk = foreground(palette.background, palette.accent);
    const richText = start >= 0 && mark && contrastRatio(tint, highlightInk) >= 4.5 && highlightInk !== mainInk
      ? [
          { text: intent.headline.slice(0, start) },
          { text: intent.headline.slice(start, start + mark.length), color: highlightInk },
          { text: intent.headline.slice(start + mark.length) },
        ].filter(chunk => chunk.text.length > 0)
      : undefined;
    const title = textBlock(intent.headline, w, {
      ...common, fontFamily: typography.headingFont, fontSize: titleSize, fontWeight: typography.headingWeight,
      fontStyle: direction.headingStyle, lineHeight: 1.08, letterSpacing: titleSize * tracking,
      contentRole: "headline", textRich: richText,
    });
    const brand = textBlock(dna.brandName ?? "", w, {
      ...common, fontFamily: typography.headingFont, fontSize: 12 * scale, fontWeight: 700, contentRole: "brand",
    });
    const kicker = textBlock(label(intent.eyebrow), w, {
      ...common, fontFamily: typography.labelFont, fontSize: 10 * scale, fontWeight: 650,
      letterSpacing: (tracking + (typography.uppercaseLabels ? 0.07 : 0.02)) * 10 * scale, contentRole: "support",
    });
    return stack(w, [brand, kicker, title, ...(direction.actionPosition === "lead" ? [action(w, scale)] : [])], gap * .48);
  }

  function detailBlock(detail: Detail, w: number, scale: number, prominent: boolean): Block {
    const panel = direction.detailStyle === "panel";
    const rule = direction.detailStyle === "rule";
    const fill = prominent ? mix(palette.surface, palette.accent, 0.18) : palette.surface;
    const ink = panel ? foreground(fill, palette.text) : mainInk;
    const pad = panel ? 10 : rule ? 6 : 1;
    const markerWidth = detail.marker ? 22 * scale : 0;
    const textWidth = w - 2 * pad - markerWidth;
    const title = (value: string) => textBlock(value, textWidth, {
      fontFamily: typography.headingFont, fontSize: (prominent ? 15 : 12.5) * scale,
      fontWeight: 700, color: ink, lineHeight: 1.16, contentRole: "support",
    });
    const content = stack(textWidth, [
      title(detail.heading),
      ...detail.items.map(item => stack(textWidth, [
        title(item.title),
        textBlock(item.text, textWidth, {
          fontFamily: typography.bodyFont, fontSize: 11 * scale, fontWeight: 400, color: ink, lineHeight: 1.21,
          contentRole: "support",
        }),
      ], 3)),
    ], 7);
    const markerInk = panel ? foreground(fill, palette.accent) : foreground(palette.background, palette.accent);
    const marker = textBlock(detail.marker ?? "", markerWidth, {
      fontFamily: typography.labelFont, fontSize: 10 * scale, fontWeight: 700, color: markerInk, lineHeight: 1.2,
      contentRole: "marker",
    });
    const block = arrange(w, [{ block: content, x: pad + markerWidth, y: pad }, { block: marker, x: pad, y: pad }]);
    block.height += pad;
    if (panel) block.shapes.push(box(w, block.height, fill));
    if (rule) block.shapes.push({ id: "", x: 0, y: 0, width: w, height: 1, color: palette.accent });
    return block;
  }

  function supporting(w: number, scale: number, flow: ReferenceComposition["details"]): Block {
    const columnGap = Math.min(gap, 12);
    const featured = flow === "featured" && details.length > 1;
    const cells = featured ? details.slice(1) : details;
    const maxColumns = flow === "list" ? 1 : Math.min(3, Math.max(1, Math.floor((w + columnGap) / (95 + columnGap))));
    const columns = Math.min(maxColumns, Math.max(1, cells.length), cells.length > 3 ? 2 : 3);
    const cellWidth = (w - (columns - 1) * columnGap) / columns;
    const rows = Array.from({ length: Math.ceil(cells.length / columns) }, (_, row) => {
      const placements = cells.slice(row * columns, (row + 1) * columns).map((detail, i) => ({
        block: detailBlock(detail, cellWidth, scale, false), x: i * (cellWidth + columnGap), y: 0,
      }));
      return arrange(w, placements);
    });
    return stack(w, featured ? [detailBlock(details[0], w, scale, true), ...rows] : rows, columnGap);
  }

  function layout(orientation: ReferenceComposition["orientation"], scale: number, flow = direction.details): Block {
    const first = direction.primaryPosition === "first";
    if (orientation === "split" && details.length) {
      const leadWidth = (contentWidth - gap) * direction.splitShare;
      const detailsWidth = contentWidth - gap - leadWidth;
      const primary = lead(leadWidth, scale);
      const secondary = supporting(detailsWidth, scale, flow);
      const main = arrange(contentWidth, [
        { block: primary, x: first ? 0 : detailsWidth + gap, y: 0 },
        { block: secondary, x: first ? leadWidth + gap : 0, y: 0 },
      ]);
      return stack(contentWidth, [main, ...(direction.actionPosition === "end" ? [action(leadWidth, scale)] : [])], gap,
        direction.actionPosition === "end" ? (first ? "left" : "right") : "left");
    }
    const primary = lead(contentWidth * direction.leadWidth, scale);
    const secondary = supporting(contentWidth, scale, flow);
    return stack(contentWidth, [
      ...(first ? [primary, secondary] : [secondary, primary]),
      ...(direction.actionPosition === "end" ? [action(contentWidth, scale)] : []),
    ], gap, direction.alignment);
  }

  let composed = layout(direction.orientation, 1);
  if (composed.height > contentHeight) composed = layout(direction.orientation, .86);
  if (composed.height > contentHeight) composed = layout("stacked", .8, direction.details === "list" ? "grid" : direction.details);
  const scale = Math.min(1, contentHeight / composed.height);
  const x = margin + offset(contentWidth * (1 - scale), direction.alignment);
  const freeY = Math.max(0, contentHeight - composed.height * scale);
  const y = margin + freeY * (direction.verticalAlignment === "center" ? .5 : direction.verticalAlignment === "bottom" ? 1 : 0);
  return {
    backgroundTreatment,
    shapes: composed.shapes.map((shape, i) => ({
      ...shape, id: `shape-${i}`, x: x + shape.x * scale, y: y + shape.y * scale,
      width: shape.width * scale, height: shape.height * scale,
      cornerRadius: shape.cornerRadius === undefined ? undefined : shape.cornerRadius * scale,
    })),
    texts: composed.texts.map((text, i) => ({
      ...text, id: `text-${i}`, x: x + (text.x ?? 0) * scale, y: y + (text.y ?? 0) * scale,
      width: text.width! * scale, fontSize: text.fontSize! * scale,
      letterSpacing: text.letterSpacing === undefined ? undefined : text.letterSpacing * scale,
    })),
  };
}
