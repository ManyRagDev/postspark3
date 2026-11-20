import type {
  CanvasPostModel,
  CarouselSlideItem,
  CanvasCustomText,
} from "../components/types";
import { canvasTypography } from "./catalogTypography";

export function nativeTextAppearance(
  post: CanvasPostModel,
  slide: CarouselSlideItem,
  role: "headline" | "body"
) {
  const title = role === "headline",
    type = canvasTypography(post.familyId);
  const base = title ? type.headlineBase : type.bodyBase;
  const localScale = (title ? slide.headlineScale : slide.subtextScale) ?? 1;
  return {
    fontFamily: title
      ? post.fontFamily
      : (post.subtextFontFamily ??
        (slide.guidedComposition
          ? "Arial, sans-serif"
          : ["cyber-glitch", "glitch-signal"].includes(post.familyId)
            ? "Space Mono, monospace"
            : "Inter, sans-serif")),
    fontSize:
      base *
      localScale *
      ((title ? post.headlineSizeScale : post.subtextSizeScale) ?? 1),
    fontWeight:
      (title ? post.headlineFontWeight : post.subtextFontWeight) ??
      (title ? 700 : 400),
    fill:
      (title ? post.palette.headlineColor : post.palette.subtextColor) ??
      post.palette.text,
    align: (title ? post.headlineAlign : post.bodyAlign) ?? "left",
    lineHeight: title
      ? (post.headlineLineHeight ?? type.headlineLineHeight)
      : (post.subtextLineHeight ?? type.bodyLineHeight),
    letterSpacing: title
      ? (post.headlineLetterSpacing ?? type.headlineLetterSpacing)
      : (post.subtextLetterSpacing ?? 0),
  };
}

export function extraTextAppearance(
  post: CanvasPostModel,
  text: CanvasCustomText
) {
  return {
    fontFamily:
      text.fontFamily ??
      (["cyber-glitch", "glitch-signal"].includes(post.familyId)
        ? "Space Mono, monospace"
        : post.familyId === "editorial-poster"
          ? "Playfair Display, serif"
          : "Inter, sans-serif"),
    fontSize: (text.fontSize ?? 16) * (text.sizeScale ?? 1),
    fontWeight:
      typeof text.fontWeight === "number"
        ? text.fontWeight
        : text.fontWeight === "bold"
          ? 700
          : 400,
    fill: text.color ?? post.palette.text,
    align: text.align ?? "left",
    effect: text.effect ?? "none",
    effectColor: text.effectColor ?? "#000000",
  };
}
