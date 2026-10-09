import { aspectRatioHeight } from "@shared/aspectRatios";
import {
  type CanvasPostModel,
  type CarouselSlideItem,
  type GuidedCompositionId,
  type InitialVisualReference,
  normalizeHexColor,
} from "../components/types";
import { resolveSlideAppearance } from "./slideReplication";
import { layoutRichText } from "./richTextLayout";
import {
  projectArsenalFormat,
  hasArsenalGeometryOverrides,
  restoreArsenalVariant,
  editArsenalContent,
  putArsenalComposition,
  setArsenalCustomBackground,
} from "./arsenalComposition";
import {
  applyContentText,
  visualSourcesFor,
  readContentSource,
  type DesignContent,
} from "@shared/arsenalContent";

/** One control per canonical text source; compatibility subtext is not editable input. */
export function guidedContentFields(content: DesignContent) {
  const names: Record<string, string> = {
    headline: "Título",
    body: "Texto de apoio",
    eyebrow: "Abertura",
    sectionLabel: "Seção",
    callToAction: "Chamada para ação",
    label: "Rótulo",
    value: "Valor",
    quote: "Citação",
    author: "Autor",
  };
  return visualSourcesFor(content).flatMap<{
    source: string;
    itemId: string | null;
    label: string;
    text: string;
  }>(source => {
    const value = readContentSource(content, source);
    const [, blockId, part] = source.split(":");
    const block =
      content.schemaVersion === 3
        ? content.blocks.find(b => b.id === blockId)
        : undefined;
    const role = block?.type === "text" ? block.role : (part ?? source);
    const label = names[role] ?? "Texto";
    return Array.isArray(value)
      ? value.map((item, i) => ({
          source,
          itemId: item.id,
          label: `Item ${i + 1}`,
          text: item.text,
        }))
      : [{ source, itemId: null, label, text: value }];
  });
}

export function fitAssistedContentEdit(
  post: CanvasPostModel,
  content: DesignContent
): CompositionProposal {
  const c = post.slides[post.currentSlideIndex]?.composition;
  if (!c) return { error: "Composição indisponível." };
  return {
    post: putArsenalComposition(
      { ...post, caption: content.caption },
      editArsenalContent(c, content)
    ),
  };
}

export const COMPOSITIONS = [
  {
    id: "headline",
    label: "Texto em destaque",
    detail: "Mensagem no topo, com espaço para respirar.",
  },
  {
    id: "image",
    label: "Imagem em destaque",
    detail: "Texto compacto na base, imagem em evidência.",
  },
  {
    id: "balanced",
    label: "Equilibrado",
    detail: "Leitura central, hierarquia e margens generosas.",
  },
] as const;
export type CompositionProposal =
  | { post: CanvasPostModel; error?: never }
  | { post?: never; error: string };
export const canvasHeight = (ratio: CanvasPostModel["aspectRatio"]) =>
  aspectRatioHeight(ratio);

const STYLE_KEYS = [
  "familyId",
  "familyName",
  "fontFamily",
  "customFontUrl",
  "palette",
  "overlayOpacity",
  "overlayColor",
  "overlayMode",
  "headlineAlign",
  "bodyAlign",
  "headlineSizeScale",
  "subtextSizeScale",
  "manualHeadlineColor",
  "manualSubtextColor",
  "headlineEffect",
  "headlineEffectColor",
  "subtextEffect",
  "subtextEffectColor",
] as const;

export function captureInitialVisuals(post: CanvasPostModel): CanvasPostModel {
  let changed = false;
  const slides = post.slides.map((slide, index) => {
    if (slide.composition) {
      const c = slide.composition;
      // Recover backgrounds stored only in the compatibility field by the former editor.
      if (slide.bgImage && (c.version !== 3 || !c.customBackground)) {
        changed = true;
        return {...slide, composition: setArsenalCustomBackground(c, {imageUrl: slide.bgImage, overlayOpacity: 0})};
      }
      return slide;
    }
    if (slide.initialVisual?.version === 1) return slide;
    changed = true;
    const view = resolveSlideAppearance(post, index);
    const visualStyle = Object.fromEntries(
      STYLE_KEYS.map(key => [key, view[key]])
    ) as InitialVisualReference["visualStyle"];
    const {
      headlinePos,
      subtextPos,
      headlineWidth,
      subtextWidth,
      headlineScale,
      subtextScale,
      barPos,
      splitBgPosition,
      guidedComposition,
    } = slide;
    return {
      ...slide,
      initialVisual: structuredClone({
        version: 1 as const,
        aspectRatio: post.aspectRatio,
        visualStyle,
        geometry: {
          headlinePos,
          subtextPos,
          headlineWidth,
          subtextWidth,
          headlineScale,
          subtextScale,
          barPos,
          splitBgPosition,
          guidedComposition,
        },
      }),
    };
  });
  return changed ? { ...post, slides } : post;
}

function luminance(hex: string) {
  const normalized = normalizeHexColor(hex);
  const channels = [1, 3, 5]
    .map(i => parseInt(normalized.slice(i, i + 2), 16) / 255)
    .map(n => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
export function readableInk(background: string) {
  const l = luminance(background);
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#000000" : "#FFFFFF";
}

function metrics(
  text: string,
  width: number,
  size: number,
  font: string,
  headline: boolean,
  family = "editorial-poster"
) {
  if (!text) return { height: 0 };
  return layoutRichText({
    text,
    width,
    fontSize: size,
    fontFamily: font,
    fontStyle: headline ? "bold" : "normal",
    fill: "#FFFFFF",
    lineHeight: headline ? (family === "chromatic-block" ? 1.1 : 1.25) : 1.45,
    letterSpacing: headline
      ? family === "chromatic-block"
        ? 0.5
        : family === "editorial-poster"
          ? -0.2
          : -0.4
      : 0,
  });
}
function baseSize(family: string) {
  if (["chromatic-block", "stroke-impact"].includes(family)) return 32;
  if (family === "cinematic-depth") return 34;
  if (family === "kinetic-type") return 30;
  if (["brutal-split", "data-punch"].includes(family)) return 28;
  if (family === "quote-authority") return 26;
  if (family === "cyber-glitch") return 18;
  return family === "editorial-poster" ? 23 : 22;
}
function updateSlide(
  post: CanvasPostModel,
  slide: CarouselSlideItem
): CanvasPostModel {
  const slides = post.slides.map((s, i) =>
    i === post.currentSlideIndex ? slide : s
  );
  return { ...post, slides };
}

/** Pure proposal: caller owns preview, commit, history and autosave. */
export function composePost(
  source: CanvasPostModel,
  id: GuidedCompositionId
): CompositionProposal {
  const post = captureInitialVisuals(source);
  const slide = post.slides[post.currentSlideIndex];
  if (!slide) return { error: "Este post não possui um slide para organizar." };
  const view = resolveSlideAppearance(post, post.currentSlideIndex);
  const height = canvasHeight(post.aspectRatio);
  const width = id === "balanced" ? 288 : 304;
  const x = (360 - width) / 2;
  const maxHeight =
    height * (id === "image" ? 0.38 : id === "headline" ? 0.66 : 0.76) - 24;
  let headlineSize = id === "headline" ? 38 : id === "image" ? 25 : 31;
  let bodySize = id === "image" ? 13 : 15;
  let head = metrics(slide.headline, width, headlineSize, "Arial", true);
  let body = metrics(
    slide.subtext,
    width,
    bodySize,
    "Arial, sans-serif",
    false
  );
  const gap = slide.headline && slide.subtext ? 14 : 0;
  while (
    head.height + body.height + gap > maxHeight &&
    (headlineSize > 22 || bodySize > 12)
  ) {
    headlineSize = Math.max(22, headlineSize - 1);
    bodySize = Math.max(12, bodySize - 0.25);
    head = metrics(slide.headline, width, headlineSize, "Arial", true);
    body = metrics(slide.subtext, width, bodySize, "Arial, sans-serif", false);
  }
  const total = head.height + body.height + gap;
  if (total > maxHeight)
    return {
      error:
        "Este texto precisa de mais espaço. Experimente outra composição ou um formato mais alto.",
    };
  const y =
    id === "headline"
      ? 64
      : id === "image"
        ? height - 54 - total
        : Math.max(64, (height - total) / 2);
  if (y + total > height - 42)
    return {
      error: "O conteúdo não cabe com leitura confortável neste formato.",
    };
  const background = normalizeHexColor(view.palette.background, "#171717");
  const ink = readableInk(background);
  const next: CarouselSlideItem = {
    ...slide,
    headlineRich: [],
    subtextRich: [],
    headlinePos: { x, y },
    subtextPos: { x, y: y + head.height + gap },
    headlineWidth: width,
    subtextWidth: width,
    headlineScale: headlineSize / 23,
    subtextScale: bodySize / 12,
    barPos: { x, y: y + total + 14 },
    splitBgPosition: "full",
    guidedComposition: {
      version: 1,
      id,
      readingArea: { y: y - 18, height: total + 48, color: background },
    },
    visualStyle: {
      ...slide.visualStyle,
      familyId: "editorial-poster",
      familyName: COMPOSITIONS.find(c => c.id === id)!.label,
      fontFamily: "Arial",
      customFontUrl: "",
      headlineAlign: id === "balanced" ? "center" : "left",
      bodyAlign: id === "balanced" ? "center" : "left",
      headlineSizeScale: 1,
      subtextSizeScale: 1,
      headlineEffect: "none",
      subtextEffect: "none",
      headlineEffectColor: undefined,
      subtextEffectColor: undefined,
      manualHeadlineColor: true,
      manualSubtextColor: true,
      palette: {
        ...view.palette,
        background,
        text: ink,
        headlineColor: ink,
        subtextColor: ink,
      },
      overlayOpacity: 0.12,
      overlayMode: "solid",
      overlayColor: background,
    },
  };
  return { post: updateSlide(post, next) };
}

/** Restore initial visual language, fitting today's words; never restore old copy/assets. */
export function restoreInitialVisual(
  source: CanvasPostModel
): CompositionProposal {
  const post = captureInitialVisuals(source);
  const slide = post.slides[post.currentSlideIndex];
  if (slide?.composition) {
    const restored = restoreArsenalVariant(slide.composition);
    return { post: putArsenalComposition(post, restored) };
  }
  if (!slide?.initialVisual)
    return { error: "Não há referência visual para este slide." };
  const reference = slide.initialVisual;
  if (reference.geometry.guidedComposition) {
    const restored = composePost(
      updateSlide(post, { ...slide, visualStyle: reference.visualStyle }),
      reference.geometry.guidedComposition.id
    );
    return restored;
  }
  const style = reference.visualStyle;
  const family = style.familyId || post.familyId;
  const height = canvasHeight(post.aspectRatio);
  const ratio = height / canvasHeight(reference.aspectRatio);
  const hw = Math.min(304, reference.geometry.headlineWidth || 304);
  const bw = Math.min(304, reference.geometry.subtextWidth || 304);
  let hs = Math.max(
    22,
    baseSize(family) *
      (style.headlineSizeScale ?? 1) *
      (reference.geometry.headlineScale ?? 1)
  );
  let bs = Math.max(
    12,
    (family === "cyber-glitch" || family === "chromatic-block" ? 11 : 12) *
      (style.subtextSizeScale ?? 1) *
      (reference.geometry.subtextScale ?? 1)
  );
  let h = metrics(
    slide.headline,
    hw,
    hs,
    style.fontFamily || post.fontFamily,
    true,
    family
  ).height;
  let b = metrics(
    slide.subtext,
    bw,
    bs,
    family === "cyber-glitch" ? "Space Mono, monospace" : "Inter, sans-serif",
    false
  ).height;
  while (h + b + 18 > height - 128 && (hs > 22 || bs > 12)) {
    hs = Math.max(22, hs - 1);
    bs = Math.max(12, bs - 0.25);
    h = metrics(
      slide.headline,
      hw,
      hs,
      style.fontFamily || post.fontFamily,
      true,
      family
    ).height;
    b = metrics(
      slide.subtext,
      bw,
      bs,
      family === "cyber-glitch" ? "Space Mono, monospace" : "Inter, sans-serif",
      false
    ).height;
  }
  const y = Math.max(
    64,
    Math.min(
      (reference.geometry.headlinePos?.y ?? 64) * ratio,
      height - 64 - h - b - 18
    )
  );
  const by = Math.max(
    y + h + 18,
    family === "brutal-split" ? height / 2 + 16 : 0
  );
  if (by + b > height - 42)
    return {
      error:
        "O texto atual não cabe no visual inicial. Escolha outra composição ou um formato mais alto.",
    };
  return {
    post: updateSlide(post, {
      ...slide,
      ...reference.geometry,
      guidedComposition: undefined,
      visualStyle: { ...style, headlineSizeScale: 1, subtextSizeScale: 1 },
      headlineRich: [],
      subtextRich: [],
      headlineWidth: hw,
      subtextWidth: bw,
      headlineScale: hs / baseSize(family),
      subtextScale:
        bs /
        (family === "cyber-glitch" || family === "chromatic-block" ? 11 : 12),
      headlinePos: { x: 28, y },
      subtextPos: { x: 28, y: by },
      barPos: { x: 28, y: by + b + 14 },
    }),
  };
}

/** Assisted edits commit only after fitting; failed edits remain in the form draft. */
export function fitAssistedEdit(
  post: CanvasPostModel,
  values: { headline: string; subtext: string; caption: string }
): CompositionProposal {
  const slide = post.slides[post.currentSlideIndex];
  if (!slide) return { error: "Slide indisponível." };
  if (values.headline === slide.headline && values.subtext === slide.subtext)
    return { post: { ...post, caption: values.caption } };
  if (slide.composition) {
    const updatedComp = editArsenalContent(
      slide.composition,
      applyContentText(slide.composition.content, {
        ...(values.headline !== slide.headline
          ? { headline: values.headline }
          : {}),
        ...(values.subtext !== slide.subtext
          ? { subtext: values.subtext }
          : {}),
        caption: values.caption,
      })
    );
    return {
      post: putArsenalComposition(
        { ...post, caption: values.caption },
        updatedComp
      ),
    };
  }
  const draft = updateSlide(
    { ...post, caption: values.caption },
    { ...slide, headline: values.headline, subtext: values.subtext }
  );
  const preferred = slide.guidedComposition?.id || "balanced";
  const first = composePost(draft, preferred);
  if (first.post) return first;
  for (const choice of COMPOSITIONS) {
    if (choice.id === preferred) continue;
    const proposal = composePost(draft, choice.id);
    if (proposal.post) return proposal;
  }
  return first;
}

/** Format projection is atomic across the carousel and never mutates a preview source. */
export function fitPostToAspectRatio(
  source: CanvasPostModel,
  aspectRatio: CanvasPostModel["aspectRatio"]
): CompositionProposal {
  if (source.aspectRatio === aspectRatio) return { post: source };
  let next = { ...source, aspectRatio };
  next = {
    ...next,
    slides: next.slides.map(slide =>
      slide.composition
        ? {
            ...slide,
            composition:
              aspectRatio === slide.composition.base.aspectRatio &&
              !hasArsenalGeometryOverrides(slide.composition)
                ? restoreArsenalVariant(slide.composition)
                : projectArsenalFormat(slide.composition, aspectRatio),
          }
        : slide
    ),
  };
  for (let index = 0; index < next.slides.length; index++) {
    const composition = next.slides[index].guidedComposition;
    if (!composition) continue;
    const proposal = composePost(
      { ...next, currentSlideIndex: index },
      composition.id
    );
    if (!proposal.post)
      return { error: `Slide ${index + 1}: ${proposal.error}` };
    next = { ...proposal.post, currentSlideIndex: source.currentSlideIndex };
  }
  return { post: next };
}
