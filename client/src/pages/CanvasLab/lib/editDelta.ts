import type {
  CanvasCustomImage,
  CanvasCustomShape,
  CanvasCustomText,
  CanvasPostModel,
} from "../components/types";

export interface EditDelta {
  fieldId?: string;
  property?: string;
  changeType?: string;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffExtraTexts(prevTexts: readonly CanvasCustomText[] = [], nextTexts: readonly CanvasCustomText[] = [], scopeId: string): EditDelta | null {
  if (prevTexts.length !== nextTexts.length) {
    return {
      fieldId: scopeId,
      property: "extraTexts",
      changeType: nextTexts.length > prevTexts.length ? "element_add" : "element_remove",
    };
  }
  for (let i = 0; i < nextTexts.length; i++) {
    const nextItem = nextTexts[i];
    const prevItem = prevTexts.find(t => t.id === nextItem.id) ?? prevTexts[i];
    if (!prevItem) return { fieldId: nextItem.id, property: "extraTexts", changeType: "element_add" };
    if (nextItem.text !== prevItem.text || !sameValue(nextItem.textRich, prevItem.textRich)) {
      return { fieldId: nextItem.id, property: "text", changeType: "text" };
    }
    if (nextItem.color !== prevItem.color || nextItem.effect !== prevItem.effect || nextItem.effectColor !== prevItem.effectColor) {
      return { fieldId: nextItem.id, property: "style", changeType: "color" };
    }
    if (
      nextItem.fontFamily !== prevItem.fontFamily ||
      nextItem.fontSize !== prevItem.fontSize ||
      nextItem.fontWeight !== prevItem.fontWeight ||
      nextItem.fontStyle !== prevItem.fontStyle ||
      nextItem.align !== prevItem.align ||
      nextItem.sizeScale !== prevItem.sizeScale
    ) {
      return { fieldId: nextItem.id, property: "font", changeType: "typography" };
    }
    if (
      nextItem.x !== prevItem.x ||
      nextItem.y !== prevItem.y ||
      nextItem.width !== prevItem.width ||
      nextItem.rotation !== prevItem.rotation ||
      nextItem.scaleX !== prevItem.scaleX ||
      nextItem.scaleY !== prevItem.scaleY ||
      nextItem.zIndex !== prevItem.zIndex ||
      nextItem.opacity !== prevItem.opacity
    ) {
      return { fieldId: nextItem.id, property: "layout", changeType: "geometry" };
    }
  }
  return null;
}

function diffExtraImages(prevImages: readonly CanvasCustomImage[] = [], nextImages: readonly CanvasCustomImage[] = [], scopeId: string): EditDelta | null {
  if (prevImages.length !== nextImages.length) {
    return {
      fieldId: scopeId,
      property: "extraImages",
      changeType: nextImages.length > prevImages.length ? "element_add" : "element_remove",
    };
  }
  for (let i = 0; i < nextImages.length; i++) {
    const nextItem = nextImages[i];
    const prevItem = prevImages.find(img => img.id === nextItem.id) ?? prevImages[i];
    if (!prevItem) return { fieldId: nextItem.id, property: "extraImages", changeType: "element_add" };
    if (nextItem.url !== prevItem.url || nextItem.imagePrompt !== prevItem.imagePrompt) {
      return { fieldId: nextItem.id, property: "image", changeType: "image" };
    }
    if (
      nextItem.x !== prevItem.x ||
      nextItem.y !== prevItem.y ||
      nextItem.width !== prevItem.width ||
      nextItem.height !== prevItem.height ||
      nextItem.rotation !== prevItem.rotation ||
      nextItem.scaleX !== prevItem.scaleX ||
      nextItem.scaleY !== prevItem.scaleY ||
      nextItem.cornerRadius !== prevItem.cornerRadius ||
      nextItem.opacity !== prevItem.opacity ||
      nextItem.zIndex !== prevItem.zIndex ||
      nextItem.focalX !== prevItem.focalX ||
      nextItem.focalY !== prevItem.focalY
    ) {
      return { fieldId: nextItem.id, property: "layout", changeType: "geometry" };
    }
  }
  return null;
}

function diffExtraShapes(prevShapes: readonly CanvasCustomShape[] = [], nextShapes: readonly CanvasCustomShape[] = [], scopeId: string): EditDelta | null {
  if (prevShapes.length !== nextShapes.length) {
    return {
      fieldId: scopeId,
      property: "extraShapes",
      changeType: nextShapes.length > prevShapes.length ? "element_add" : "element_remove",
    };
  }
  for (let i = 0; i < nextShapes.length; i++) {
    const nextItem = nextShapes[i];
    const prevItem = prevShapes.find(s => s.id === nextItem.id) ?? prevShapes[i];
    if (!prevItem) return { fieldId: nextItem.id, property: "extraShapes", changeType: "element_add" };
    if (nextItem.color !== prevItem.color) {
      return { fieldId: nextItem.id, property: "color", changeType: "color" };
    }
    if (
      nextItem.x !== prevItem.x ||
      nextItem.y !== prevItem.y ||
      nextItem.width !== prevItem.width ||
      nextItem.height !== prevItem.height
    ) {
      return { fieldId: nextItem.id, property: "layout", changeType: "geometry" };
    }
  }
  return null;
}

export function computePostEditDelta(prev: CanvasPostModel, next: CanvasPostModel): EditDelta {
  if (prev === next) {
    return { property: "none", changeType: "noop" };
  }

  // 1. Mudanças de nível global do post
  if (prev.aspectRatio !== next.aspectRatio) {
    return { property: "aspectRatio", changeType: "resize" };
  }
  if (prev.caption !== next.caption) {
    return { fieldId: "caption", property: "caption", changeType: "text" };
  }
  if (prev.callToAction !== next.callToAction) {
    return { fieldId: "callToAction", property: "callToAction", changeType: "text" };
  }
  if (
    prev.fontFamily !== next.fontFamily ||
    prev.subtextFontFamily !== next.subtextFontFamily ||
    prev.headlineFontWeight !== next.headlineFontWeight ||
    prev.subtextFontWeight !== next.subtextFontWeight ||
    prev.headlineSizeScale !== next.headlineSizeScale ||
    prev.subtextSizeScale !== next.subtextSizeScale ||
    prev.headlineAlign !== next.headlineAlign ||
    prev.bodyAlign !== next.bodyAlign
  ) {
    return { property: "fontFamily", changeType: "typography" };
  }
  if (
    prev.palette?.background !== next.palette?.background ||
    prev.palette?.text !== next.palette?.text ||
    prev.palette?.accent !== next.palette?.accent ||
    prev.palette?.surface !== next.palette?.surface ||
    prev.overlayOpacity !== next.overlayOpacity ||
    prev.overlayColor !== next.overlayColor ||
    prev.overlayMode !== next.overlayMode ||
    prev.headlineEffect !== next.headlineEffect ||
    prev.headlineEffectColor !== next.headlineEffectColor ||
    prev.subtextEffect !== next.subtextEffect ||
    prev.subtextEffectColor !== next.subtextEffectColor
  ) {
    return { property: "palette", changeType: "color" };
  }
  if (prev.showBadge !== next.showBadge || prev.badgeText !== next.badgeText || prev.showStep !== next.showStep) {
    return { property: "badge", changeType: "decoration" };
  }
  const postExtraTextsDelta = diffExtraTexts(prev.extraTexts, next.extraTexts, "post");
  if (postExtraTextsDelta) return postExtraTextsDelta;
  const postExtraImagesDelta = diffExtraImages(prev.extraImages, next.extraImages, "post");
  if (postExtraImagesDelta) return postExtraImagesDelta;
  if (prev.bgImage !== next.bgImage) {
    return { property: "bgImage", changeType: "image" };
  }
  if (!sameValue(prev.bgTransform, next.bgTransform) || !sameValue(prev.bgPlacement, next.bgPlacement)) {
    return { property: "bgTransform", changeType: "geometry" };
  }

  // 2. Mudanças na lista de slides
  const prevSlides = prev.slides || [];
  const nextSlides = next.slides || [];
  if (prevSlides.length !== nextSlides.length) {
    return {
      property: "slides",
      changeType: nextSlides.length > prevSlides.length ? "slide_add" : "slide_remove",
    };
  }

  // 3. Mudanças dentro do slide ativo ou nos slides
  const activeIndex = next.currentSlideIndex ?? 0;
  const slideIndicesToCheck = [
    activeIndex,
    ...Array.from({ length: nextSlides.length }, (_, i) => i).filter(i => i !== activeIndex),
  ];

  for (const idx of slideIndicesToCheck) {
    const prevSlide = prevSlides[idx];
    const nextSlide = nextSlides[idx];
    if (!prevSlide || !nextSlide) continue;

    // Headline / Subtext / Step (including rich chunks)
    if (prevSlide.headline !== nextSlide.headline || !sameValue(prevSlide.headlineRich, nextSlide.headlineRich)) {
      return { fieldId: `${nextSlide.id}:headline`, property: "headline", changeType: "text" };
    }
    if (prevSlide.subtext !== nextSlide.subtext || !sameValue(prevSlide.subtextRich, nextSlide.subtextRich)) {
      return { fieldId: `${nextSlide.id}:subtext`, property: "subtext", changeType: "text" };
    }
    if (prevSlide.step !== nextSlide.step) {
      return { fieldId: `${nextSlide.id}:step`, property: "step", changeType: "text" };
    }

    // Posições / Dimensões de texto
    if (
      prevSlide.headlinePos?.x !== nextSlide.headlinePos?.x ||
      prevSlide.headlinePos?.y !== nextSlide.headlinePos?.y ||
      prevSlide.headlineWidth !== nextSlide.headlineWidth ||
      prevSlide.headlineScale !== nextSlide.headlineScale
    ) {
      return { fieldId: `${nextSlide.id}:headline`, property: "layout", changeType: "geometry" };
    }
    if (
      prevSlide.subtextPos?.x !== nextSlide.subtextPos?.x ||
      prevSlide.subtextPos?.y !== nextSlide.subtextPos?.y ||
      prevSlide.subtextWidth !== nextSlide.subtextWidth ||
      prevSlide.subtextScale !== nextSlide.subtextScale
    ) {
      return { fieldId: `${nextSlide.id}:subtext`, property: "layout", changeType: "geometry" };
    }
    if (
      !sameValue(prevSlide.badgePos, nextSlide.badgePos) ||
      !sameValue(prevSlide.barPos, nextSlide.barPos) ||
      !sameValue(prevSlide.logoPos, nextSlide.logoPos) ||
      !sameValue(prevSlide.nativeDecorationTransforms, nextSlide.nativeDecorationTransforms) ||
      !sameValue(prevSlide.elementOrder, nextSlide.elementOrder) ||
      !sameValue(prevSlide.elementStates, nextSlide.elementStates)
    ) {
      return { fieldId: nextSlide.id, property: "layout", changeType: "geometry" };
    }

    // Imagem de fundo e enquadramento
    if (
      prevSlide.bgImage !== nextSlide.bgImage ||
      prevSlide.splitBgPosition !== nextSlide.splitBgPosition ||
      !sameValue(prevSlide.bgTransform, nextSlide.bgTransform) ||
      !sameValue(prevSlide.bgPlacement, nextSlide.bgPlacement)
    ) {
      return { fieldId: `${nextSlide.id}:bgImage`, property: "bgImage", changeType: "image" };
    }

    if (!sameValue(prevSlide.visualStyle, nextSlide.visualStyle)) {
      return { fieldId: nextSlide.id, property: "visualStyle", changeType: "style" };
    }

    // Elementos da composição
    const prevElements = prevSlide.composition?.elements || [];
    const nextElements = nextSlide.composition?.elements || [];
    if (prevElements.length !== nextElements.length) {
      return {
        fieldId: nextSlide.id,
        property: "elements",
        changeType: nextElements.length > prevElements.length ? "element_add" : "element_remove",
      };
    }

    for (let elIdx = 0; elIdx < nextElements.length; elIdx++) {
      const nextEl = nextElements[elIdx];
      const prevEl = prevElements.find(e => e.id === nextEl.id) || prevElements[elIdx];
      if (!prevEl) {
        return { fieldId: nextEl.id, property: "element", changeType: "element_add" };
      }
      if ("text" in nextEl && "text" in prevEl && nextEl.text !== prevEl.text) {
        return { fieldId: nextEl.id, property: "text", changeType: "text" };
      }
      if ("items" in nextEl && "items" in prevEl && !sameValue(nextEl.items, prevEl.items)) {
        return { fieldId: nextEl.id, property: "items", changeType: "text" };
      }
      if (!sameValue(nextEl.richText, prevEl.richText) || !sameValue(nextEl.textFragments, prevEl.textFragments)) {
        return { fieldId: nextEl.id, property: "richText", changeType: "text" };
      }
      if (!sameValue(nextEl.mediaSlot, prevEl.mediaSlot) || nextEl.imageAssetId !== prevEl.imageAssetId) {
        return { fieldId: nextEl.id, property: "media", changeType: "media" };
      }
      if (
        nextEl.fill !== prevEl.fill ||
        nextEl.stroke !== prevEl.stroke ||
        nextEl.strokeWidth !== prevEl.strokeWidth ||
        nextEl.cornerRadius !== prevEl.cornerRadius ||
        nextEl.fontFamily !== prevEl.fontFamily ||
        nextEl.fontSize !== prevEl.fontSize ||
        nextEl.fontWeight !== prevEl.fontWeight ||
        nextEl.align !== prevEl.align ||
        nextEl.lineHeight !== prevEl.lineHeight ||
        nextEl.letterSpacing !== prevEl.letterSpacing ||
        nextEl.opacity !== prevEl.opacity ||
        !sameValue(nextEl.textGradient, prevEl.textGradient) ||
        !sameValue(nextEl.strokeDash, prevEl.strokeDash) ||
        nextEl.blendMode !== prevEl.blendMode ||
        !sameValue(nextEl.extrusion, prevEl.extrusion)
      ) {
        return { fieldId: nextEl.id, property: "style", changeType: "style" };
      }
      if (
        nextEl.x !== prevEl.x ||
        nextEl.y !== prevEl.y ||
        nextEl.width !== prevEl.width ||
        nextEl.height !== prevEl.height ||
        nextEl.rotation !== prevEl.rotation ||
        nextEl.zIndex !== prevEl.zIndex ||
        !sameValue(nextEl.points, prevEl.points)
      ) {
        return { fieldId: nextEl.id, property: "layout", changeType: "geometry" };
      }
    }

    // Extra texts / Extra images / Extra shapes do slide
    const slideExtraTextsDelta = diffExtraTexts(prevSlide.extraTexts, nextSlide.extraTexts, nextSlide.id);
    if (slideExtraTextsDelta) return slideExtraTextsDelta;
    const slideExtraImagesDelta = diffExtraImages(prevSlide.extraImages, nextSlide.extraImages, nextSlide.id);
    if (slideExtraImagesDelta) return slideExtraImagesDelta;
    const slideExtraShapesDelta = diffExtraShapes(prevSlide.extraShapes, nextSlide.extraShapes, nextSlide.id);
    if (slideExtraShapesDelta) return slideExtraShapesDelta;
  }

  return { property: "post", changeType: "edit" };
}
