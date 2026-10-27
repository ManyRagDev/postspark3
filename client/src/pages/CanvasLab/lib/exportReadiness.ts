import type { CarouselSlideItem, CanvasPostModel } from "../components/types";

export function cleanFontFamily(family?: string | null): string | null {
  if (!family) return null;
  const cleaned = family.replace(/['"]/g, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function collectUsedFontsForSlide(slide: CarouselSlideItem, post: CanvasPostModel): Set<string> {
  const used = new Set<string>();

  if (slide.composition) {
    if (Array.isArray(slide.composition.elements)) {
      for (const el of slide.composition.elements) {
        if (
          el.kind === "text" &&
          el.fontFamily &&
          el.text &&
          el.text.trim().length > 0 &&
          el.opacity !== 0 &&
          !(el as any).hidden
        ) {
          const font = cleanFontFamily(el.fontFamily);
          if (font) used.add(font);
        }
      }
    }
    const anyComp = slide.composition as any;
    if (Array.isArray(anyComp.authorialLayers)) {
      for (const layer of anyComp.authorialLayers) {
        if (
          layer.kind === "text" &&
          layer.fontFamily &&
          layer.text &&
          layer.text.trim().length > 0 &&
          layer.opacity !== 0 &&
          !layer.hidden
        ) {
          const font = cleanFontFamily(layer.fontFamily);
          if (font) used.add(font);
        }
      }
    }
    return used;
  }

  // Slide Nativo N:
  const hasHeadline = Boolean(slide.headline && slide.headline.trim().length > 0);
  if (hasHeadline) {
    const headlineFont = cleanFontFamily(slide.visualStyle?.fontFamily || post.fontFamily);
    if (headlineFont) used.add(headlineFont);
  }

  const anySlide = slide as any;
  if (Array.isArray(anySlide.headlineChunks) && hasHeadline) {
    for (const chunk of anySlide.headlineChunks) {
      if (chunk?.text && chunk.text.trim().length > 0) {
        const chunkFont = cleanFontFamily(chunk?.fontFamily);
        if (chunkFont) used.add(chunkFont);
      }
    }
  }

  const hasSubtext = Boolean(slide.subtext && slide.subtext.trim().length > 0);
  if (hasSubtext) {
    const subtextFont = cleanFontFamily(
      slide.visualStyle?.subtextFontFamily ||
      anySlide.subtextFontFamily ||
      post.subtextFontFamily ||
      "Inter"
    );
    if (subtextFont) used.add(subtextFont);
  }

  if (Array.isArray(anySlide.subtextChunks) && hasSubtext) {
    for (const chunk of anySlide.subtextChunks) {
      if (chunk?.text && chunk.text.trim().length > 0) {
        const chunkFont = cleanFontFamily(chunk?.fontFamily);
        if (chunkFont) used.add(chunkFont);
      }
    }
  }

  const extraTexts = slide.extraTexts || post.extraTexts || [];
  for (const et of extraTexts) {
    if (et.text && et.text.trim().length > 0 && et.opacity !== 0 && !(et as any).hidden) {
      const etFont = cleanFontFamily(et.fontFamily);
      if (etFont) used.add(etFont);
    }
  }

  return used;
}

export function collectUsedFontsForDocument(post: CanvasPostModel): Set<string> {
  const allFonts = new Set<string>();
  if (Array.isArray(post.slides)) {
    for (const slide of post.slides) {
      const slideFonts = collectUsedFontsForSlide(slide, post);
      slideFonts.forEach((f) => allFonts.add(f));
    }
  }
  return allFonts;
}

export function assertFontsReady(usedFonts: Set<string>): void {
  if (typeof document === "undefined") return;
  const fonts = (document as any).fonts;
  if (!fonts) return;

  const fontFaces: any[] = [];
  try {
    if (typeof fonts.forEach === "function") {
      fonts.forEach((face: any) => fontFaces.push(face));
    } else if (typeof fonts[Symbol.iterator] === "function") {
      for (const face of fonts) fontFaces.push(face);
    }
  } catch {
    // fallback se fonts não for iterável
  }

  usedFonts.forEach((family) => {
    const normalized = family.toLowerCase();
    const matchingFaces = fontFaces.filter(face => {
      const faceFamily = cleanFontFamily(face.family)?.toLowerCase();
      return faceFamily === normalized;
    });

    for (const face of matchingFaces) {
      if (face.status === "error") {
        throw new Error(`A fonte "${family}" falhou ao carregar.`);
      }
      if (face.status === "loading") {
        throw new Error(`Aguarde o carregamento das fontes antes de exportar.`);
      }
    }

    if (typeof fonts.check === "function") {
      const isReady = fonts.check(`16px "${family}"`);
      if (!isReady) {
        throw new Error(`A fonte "${family}" ainda não foi carregada no documento.`);
      }
    }
  });
}
