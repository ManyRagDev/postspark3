import { putArsenalComposition, setArsenalCustomBackground } from "./arsenalComposition";
import type { CanvasPostModel, CanvasRichTextChunk } from "../components/types";
import {
  resolveSlideAppearance,
  applyCurrentSlideAppearancePatch,
} from "./slideReplication";
import {
  captureInitialVisuals,
  readableInk,
  type CompositionProposal,
} from "./guidedComposition";
import { contrastRatio } from "@shared/creative/color";

export const GUIDED_PALETTES = [
  { name: "Âmbar", background: "#111820", accent: "#F7B548" },
  { name: "Azul elétrico", background: "#0B101A", accent: "#38BDF8" },
  { name: "Editorial claro", background: "#F4F0E8", accent: "#254D43" },
  { name: "Rosa intenso", background: "#201326", accent: "#F1A0C5" },
] as const;

/** Explicit background action. Keep geometry/family and only affect the active slide. */
export function previewSolidBackground(
  source: CanvasPostModel,
  background: string,
  accent: string
): CanvasPostModel {
  const c = source.slides[source.currentSlideIndex]?.composition;
  if (c) return putArsenalComposition(source, setArsenalCustomBackground(c, {fill: background, imageUrl: undefined, overlayOpacity: 0}));
  const post = captureInitialVisuals(source);
  const view = resolveSlideAppearance(post, post.currentSlideIndex);
  const headline = readableInk(background);
  const body = readableInk(
    view.familyId === "brutal-split" &&
      !post.slides[post.currentSlideIndex]?.guidedComposition
      ? accent
      : background
  );
  const styled = applyCurrentSlideAppearancePatch(post, {
    palette: {
      ...view.palette,
      background,
      accent,
      text: headline,
      headlineColor: headline,
      subtextColor: body,
    },
    manualHeadlineColor: true,
    manualSubtextColor: true,
    overlayOpacity: 0,
    headlineEffect: "none",
    subtextEffect: "none",
  });
  const clearColor = (chunks?: CanvasRichTextChunk[]) =>
    chunks?.map(({ color: _color, ...chunk }) => chunk);
  return {
    ...styled,
    slides: styled.slides.map((s, i) =>
      i !== post.currentSlideIndex
        ? s
        : {
            ...s,
            bgImage: "",
            headlineRich: clearColor(s.headlineRich ?? post.headlineRich) ?? [],
            subtextRich: clearColor(s.subtextRich ?? post.subtextRich) ?? [],
            guidedComposition: s.guidedComposition
              ? {
                  ...s.guidedComposition,
                  readingArea: {
                    ...s.guidedComposition.readingArea,
                    color: background,
                  },
                }
              : undefined,
          }
    ),
  };
}

export function suggestEmphasis(text: string) {
  return (
    text.match(/\d+(?:[.,]\d+)?\s*%?/)?.[0].trim() ||
    text.trim().split(/\s+/).slice(0, 2).join(" ")
  );
}

/** Preserve character styles and geometry; change only color/underline in the chosen phrase. */
export function previewEmphasis(
  source: CanvasPostModel,
  phrase: string,
  treatment: "color" | "underline"
): CompositionProposal {
  const post = captureInitialVisuals(source);
  const index = post.currentSlideIndex;
  const slide = post.slides[index];
  if (!slide) return { error: "Slide indisponível." };
  const needle = phrase.trim();
  const start = slide.headline
    .toLocaleLowerCase("pt-BR")
    .indexOf(needle.toLocaleLowerCase("pt-BR"));
  if (!needle || start < 0)
    return { error: "Escolha um trecho que esteja no título." };
  const end = start + needle.length;
  const view = resolveSlideAppearance(post, index);
  const background =
    slide.guidedComposition?.readingArea.color || view.palette.background;
  // Underline remains a visible emphasis if the accent cannot be read against the background.
  const useAccent =
    treatment === "color" &&
    (!view.headlineEffect || view.headlineEffect === "none") &&
    (Boolean(slide.guidedComposition) || !(slide.bgImage ?? post.bgImage)) &&
    contrastRatio(background, view.palette.accent) >= 4.5;
  const existing = slide.headlineRich ?? post.headlineRich;
  const chunks =
    existing?.map(c => c.text).join("") === slide.headline
      ? existing!
      : [{ text: slide.headline }];
  let offset = 0;
  const rich: CanvasRichTextChunk[] = [];
  for (const chunk of chunks) {
    const from = offset;
    const to = offset + chunk.text.length;
    const boundaries = [
      from,
      Math.max(from, Math.min(to, start)),
      Math.max(from, Math.min(to, end)),
      to,
    ];
    for (let i = 0; i < boundaries.length - 1; i++) {
      const a = boundaries[i],
        b = boundaries[i + 1];
      if (b <= a) continue;
      const selected = a >= start && b <= end;
      rich.push({
        ...chunk,
        text: chunk.text.slice(a - from, b - from),
        color: selected && useAccent ? view.palette.accent : undefined,
        underline: selected ? treatment === "underline" || !useAccent : false,
      });
    }
    offset = to;
  }
  return {
    post: {
      ...post,
      slides: post.slides.map((s, i) =>
        i === index ? { ...s, headlineRich: rich } : s
      ),
    },
  };
}
