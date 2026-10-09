import { aspectRatioHeight } from "@shared/aspectRatios";
import {
  projectContentBody,
  projectContentHeadline,
} from "@shared/arsenalContent";
import type { ImageAspectRatio, ImagePostContext } from "@shared/imageGeneration";
import type { ArsenalElement } from "@shared/designArsenal";
import type { CanvasPostModel, CarouselSlideItem } from "../components/types";
import { arsenalWorldGeometry, resolveArsenalComposition } from "./arsenalComposition";

export type ImageDirectionId = "subject" | "context" | "conceptual";
export type ImageDirection = { id: ImageDirectionId; label: string; description: string; prompt: string };

const clean = (value: unknown) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
const short = (value: unknown, limit: number) => clean(value).slice(0, limit);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function activeSlide(post: CanvasPostModel): CarouselSlideItem | undefined {
  return post.slides?.[post.currentSlideIndex];
}

function messageFor(post: CanvasPostModel, slide = activeSlide(post)) {
  const composition = slide?.composition;
  if (composition) {
    try {
      const resolved = resolveArsenalComposition(composition);
      return {
        headline: clean(projectContentHeadline(resolved.content)) || clean(slide?.headline) || clean(post.headline),
        body: clean(projectContentBody(resolved.content)) || clean(slide?.subtext) || clean(post.subtext),
      };
    } catch {
      // Older or partially restored compositions still have visible compatibility projections.
    }
  }
  return {
    headline: clean(slide?.headline) || clean(post.headline),
    body: clean(slide?.subtext) || clean(post.subtext),
  };
}

function directionPrompt(post: CanvasPostModel, id: ImageDirectionId) {
  const { headline, body } = messageFor(post);
  const brief = [
    "[Assunto e copy do post]",
    headline && `Título: “${short(headline, 180)}”`,
    body && `Texto: “${short(body, 500)}”`,
  ].filter(Boolean).join("\n");
  const guidance = id === "subject"
    ? "Crie uma imagem editorial com o assunto concreto em destaque e fácil de reconhecer. Mostre o tema ou a ação que a copy realmente menciona, sem acrescentar uma metáfora genérica."
    : id === "context"
      ? "Mostre esse assunto em uso ou em uma cena cotidiana plausível ligada ao que a copy descreve. Use detalhes naturais de ambiente e apoio, sem atribuir marcas ou identidades reais não informadas."
      : "Crie uma interpretação conceitual e editorial da ideia central da copy. Use símbolos visuais somente quando deixarem o assunto mais claro; mantenha uma ligação reconhecível com o tema.";
  return short(`${brief}\n\n[Direção visual]\n${guidance}`, 1900);
}

export function imageDirectionsForPost(post: CanvasPostModel): ImageDirection[] {
  return [
    {
      id: "subject",
      label: "Assunto em destaque",
      description: "Dá protagonismo ao assunto concreto do post.",
      prompt: directionPrompt(post, "subject"),
    },
    {
      id: "context",
      label: "Em contexto",
      description: "Mostra o assunto acontecendo em uma situação reconhecível.",
      prompt: directionPrompt(post, "context"),
    },
    {
      id: "conceptual",
      label: "Conceitual",
      description: "Traduz a ideia em uma imagem editorial ligada ao tema.",
      prompt: directionPrompt(post, "conceptual"),
    },
  ];
}

type Box = { x: number; y: number; width: number; height: number; rotation?: number };

function isFullBleedPanel(box: Box, width: number, height: number) {
  const bounds = rotatedBounds(box);
  const tolerance = Math.max(width, height) * 0.01;
  return bounds.width >= width * 0.95 && bounds.height >= height * 0.95 &&
    bounds.x <= tolerance && bounds.y <= tolerance &&
    bounds.x + bounds.width >= width - tolerance &&
    bounds.y + bounds.height >= height - tolerance;
}

/** Konva rotates a node around its top-left origin; bound its four actual corners. */
function rotatedBounds(box: Box): Box {
  const angle = ((box.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.width * cos, y: box.y + box.width * sin },
    { x: box.x - box.height * sin, y: box.y + box.height * cos },
    { x: box.x + box.width * cos - box.height * sin, y: box.y + box.width * sin + box.height * cos },
  ];
  const xs = corners.map(point => point.x), ys = corners.map(point => point.y);
  const left = Math.min(...xs), top = Math.min(...ys);
  return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

function arsenalBoxes(slide: CarouselSlideItem, width: number, height: number) {
  const composition = slide.composition;
  if (!composition) return null;
  try {
    const c = resolveArsenalComposition(composition);
    const map = (e: ArsenalElement): Box => {
      const world = arsenalWorldGeometry(e, c.groups);
      return {
        x: (world.x * c.projection.scale + c.projection.x) * width / c.artboard.width,
        y: (world.y * c.projection.scale + c.projection.y) * width / c.artboard.width,
        width: (e.width || 0) * world.scale * c.projection.scale * width / c.artboard.width,
        height: (e.height || 0) * world.scale * c.projection.scale * width / c.artboard.width,
        rotation: world.rotation,
      };
    };
    const effectiveOpacity = (e: ArsenalElement) => {
      let opacity = e.opacity, parentId = e.parentId;
      while (parentId) {
        const group = c.groups.find(item => item.id === parentId);
        if (!group) break;
        opacity *= group.opacity;
        parentId = group.parentId;
      }
      return opacity;
    };
    const visible = c.elements.filter(e => effectiveOpacity(e) > 0);
    const panels = visible.filter(e => e.kind === "rect" && effectiveOpacity(e) >= 0.85)
      .map(map).filter(box => !isFullBleedPanel(box, width, height));
    return {
      text: visible.filter(e => e.kind === "text" && Boolean(clean(e.text))).map(map),
      panels,
      media: visible.filter(e => e.kind === "media").map(map),
    };
  } catch {
    return null;
  }
}

function classicBoxes(post: CanvasPostModel, slide: CarouselSlideItem, width: number, height: number) {
  const headlinePos = slide.headlinePos || { x: width * 0.08, y: height * 0.25 };
  const bodyPos = slide.subtextPos || { x: width * 0.08, y: height * 0.57 };
  const texts: Box[] = [
    { x: headlinePos.x || 0, y: headlinePos.y || 0, width: slide.headlineWidth || width * 0.84, height: clamp(72 * (post.headlineSizeScale || 1), 42, height * 0.4), rotation: 0 },
    { x: bodyPos.x || 0, y: bodyPos.y || 0, width: slide.subtextWidth || width * 0.8, height: clamp(56 * (post.subtextSizeScale || 1), 32, height * 0.35), rotation: 0 },
  ];
  const panel = (slide.extraShapes || []).map(shape => ({ x: shape.x || 0, y: shape.y || 0, width: shape.width || 0, height: shape.height || 0 }));
  const userText = (slide.extraTexts || post.extraTexts || []).map(item => ({ x: item.x || 0, y: item.y || 0, width: item.width || 0, height: (item.fontSize || 24) * 2.2, rotation: item.rotation }));
  const images = (slide.extraImages || post.extraImages || []).map(item => ({ x: item.x || 0, y: item.y || 0, width: item.width || 0, height: item.height || 0, rotation: item.rotation }));
  return { text: [...texts, ...userText], panels: panel, media: images };
}

function describeRegion(boxes: Box[], width: number, height: number) {
  const columns = 6, rows = 8;
  const occupied = new Set<string>();
  for (const raw of boxes) {
    if (![raw.x, raw.y, raw.width, raw.height].every(Number.isFinite) || raw.width <= 0 || raw.height <= 0) continue;
    const b = rotatedBounds(raw);
    if (b.x + b.width <= 0 || b.y + b.height <= 0 || b.x >= width || b.y >= height) continue;
    const x0 = clamp(Math.floor(b.x / width * columns), 0, columns - 1);
    const x1 = clamp(Math.floor((b.x + b.width) / width * columns), 0, columns - 1);
    const y0 = clamp(Math.floor(b.y / height * rows), 0, rows - 1);
    const y1 = clamp(Math.floor((b.y + b.height) / height * rows), 0, rows - 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) occupied.add(`${x},${y}`);
  }
  const cells = Array.from({ length: rows }, (_, y) =>
    Array.from({ length: columns }, (_, x) => occupied.has(`${x},${y}`) ? "■" : "·").join("")
  );
  const openColumns = Array.from({ length: columns }, (_, x) => ({
    x,
    free: cells.reduce((sum, row) => sum + (row[x] === "·" ? 1 : 0), 0),
  })).sort((a, b) => b.free - a.free);
  const centerOccupied = occupied.has("2,3") || occupied.has("3,3") || occupied.has("2,4") || occupied.has("3,4");
  const sparse = openColumns.filter(c => c.free >= 5).map(c => c.x + 1);
  const occupancy = Math.round(occupied.size / (columns * rows) * 100);
  const level = occupancy >= 48 ? "mais ocupada" : occupancy <= 17 ? "mais livre" : "moderadamente ocupada";
  const freeHint = sparse.length
    ? `o espaço parece maior perto de ${sparse.map(n => `${Math.round((n - 0.5) / columns * 100)}% da largura`).join(" e ")}`
    : "o espaço livre parece distribuído pela prancheta";
  return `Estimativa visual aproximada: composição ${level} (${occupancy}% da grade); ${centerOccupied ? "o centro também contém elementos" : "o centro parece relativamente livre"}; ${freeHint}. Use isso como orientação leve para o peso e a posição do assunto. Preserve a cena escolhida e permita sobreposição quando fizer sentido; nenhuma área é proibida.`;
}

export function imageCompositionGuidance(post: CanvasPostModel): string {
  const slide = activeSlide(post);
  if (!slide) return "Use o design atual como referência leve; mantenha a cena solicitada compreensível e não trate nenhuma região como proibida.";
  const width = 360, height = aspectRatioHeight(post.aspectRatio);
  const boxes = arsenalBoxes(slide, width, height) || classicBoxes(post, slide, width, height);
  const panels = boxes.panels.filter(box => !isFullBleedPanel(box, width, height));
  const occupied = [
    ...boxes.text,
    ...panels,
    ...boxes.media,
    ...(!slide.composition && slide.guidedComposition ? [{ x: 0, y: slide.guidedComposition.readingArea.y, width, height: slide.guidedComposition.readingArea.height }] : []),
  ];
  return describeRegion(occupied, width, height);
}

/** Keep the scene prompt editable and intact; visual context travels beside it. */
export function imageRequestForPost(
  post: CanvasPostModel,
  draftPrompt: string,
  options: { directionId?: ImageDirectionId | "custom"; useCompositionGuidance?: boolean } = {}
): { prompt: string; aspectRatio: ImageAspectRatio; postContext?: ImagePostContext } {
  const prompt = draftPrompt.trim();
  const slide = activeSlide(post);
  const { headline, body } = messageFor(post, slide);
  const imageDirection = options.directionId;
  const includeDesignGuidance = options.useCompositionGuidance !== false;
  const composition = slide?.composition;
  const compositionBackground = composition
    ? ("customBackground" in composition ? composition.customBackground?.fill : undefined) || composition.artboard.background
    : undefined;
  const context: ImagePostContext = {
    headline: short(headline, 180),
    body: short(body, 500),
    caption: short(post.caption, 1500),
    ...(includeDesignGuidance ? {
      familyName: short(slide?.visualStyle?.familyName || post.familyName, 80),
      backgroundColor: compositionBackground || slide?.visualStyle?.palette?.background || post.palette.background,
      accentColor: slide?.visualStyle?.palette?.accent || post.palette.accent,
      compositionGuidance: imageCompositionGuidance(post),
    } : {}),
    ...(imageDirection ? { imageDirection } : {}),
  };
  return {
    prompt,
    aspectRatio: post.aspectRatio as ImageAspectRatio,
    postContext: context,
  };
}
