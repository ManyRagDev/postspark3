import type { CanvasPostModel } from "../../../client/src/pages/CanvasLab/components/types";
import type { VisualIdentityRules } from "@shared/visualIdentity";
import { projectColorMap, colorProjectFragment } from "@shared/projectPalette";
import { arsenalHash } from "@shared/arsenalContent";

/** Adapt the new post's private copy before pinning it for copy generation. */
export function applyProjectArtColors(source: CanvasPostModel, rules: VisualIdentityRules) {
  const post = structuredClone(source);
  for (const slide of post.slides) {
    const composition = slide.composition;
    const previous = slide.visualStyle?.palette ?? source.palette;
    const map = projectColorMap(rules, composition?.artboard.background ?? previous.background);
    if (!map) continue;
    const palette = { ...previous, background: map.background, text: map.text, accent: map.accent,
      surface: rules.colors[1] ?? map.background, headlineColor: map.text, subtextColor: map.text };
    slide.visualStyle = { ...slide.visualStyle, palette };
    if (slide === post.slides[0]) post.palette = palette;
    if (slide.backgroundTreatment) slide.backgroundTreatment.tint = map.color(slide.backgroundTreatment.tint);
    for (const shape of slide.extraShapes ?? []) {
      shape.color = map.color(shape.color);
      if (shape.strokeColor) shape.strokeColor = map.color(shape.strokeColor);
    }
    for (const text of slide.extraTexts ?? []) {
      if (text.color) text.color = map.color(text.color);
      for (const chunk of text.textRich ?? []) if (chunk.color) chunk.color = map.color(chunk.color);
    }
    if (!composition) continue;
    composition.pieces = colorProjectFragment(composition.base, composition.pieces, map);
    composition.artboard.background = map.background;
    composition.origin.variantHash = arsenalHash(composition.base);
    if (composition.version === 3 && composition.customBackground?.fill) composition.customBackground.fill = map.background;
    for (const e of composition.elements) {
      if (e.kind === "media" || e.imageAssetId) continue;
      e.fill = map.color(e.fill);
      if (e.stroke) e.stroke = map.color(e.stroke);
      const override = composition.overrides[e.id];
      if (typeof override?.fill === "string") override.fill = map.color(override.fill);
      if (typeof override?.stroke === "string") override.stroke = map.color(override.stroke);
      for (const chunk of composition.richText[e.id] ?? []) if (chunk.color) chunk.color = map.color(chunk.color);
    }
  }
  return post;
}
