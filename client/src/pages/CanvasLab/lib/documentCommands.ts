import type {
  CanvasCustomImage,
  CanvasCustomText,
  CanvasPostModel,
  CarouselSlideItem,
} from "../components/types";

/**
 * Comandos canônicos do documento `CanvasPostModel` (Etapa 2 §7.2).
 *
 * Funções puras e imutáveis. Centralizam as regras de escopo por slide, a
 * duplicação com IDs internos novos e a reordenação. `CanvasSidebar`,
 * `CanvasMobileDrawer`, os nós Konva e o `CarouselFilmstrip` devem emitir
 * comandos — nunca reimplementar regras de escopo nem regras de identidade.
 *
 * Regra mandatória (Etapa 2 §7.1): uma ação "slide atual" NUNCA escreve no
 * root global ao mesmo tempo. O root global guarda apenas defaults de
 * documento; propriedades por slide vivem exclusivamente em `slides[i]`.
 */

export function cloneSlide(slide: CarouselSlideItem): CarouselSlideItem {
  return {
    ...slide,
    id: slide.id ?? freshId("s"),
    extraTexts: Array.isArray(slide.extraTexts)
      ? slide.extraTexts.map((text) => ({ ...text, id: freshId("tx") }))
      : slide.extraTexts,
    extraImages: Array.isArray(slide.extraImages)
      ? slide.extraImages.map((image) => ({ ...image, id: freshId("im") }))
      : slide.extraImages,
  };
}

export function freshUUID(prefix?: string): string {
  let uuid: string;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    uuid = crypto.randomUUID();
  } else {
    // Fallback RFC4122 v4 determinístico e compatível
    uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  return prefix ? `${prefix}-${uuid}` : uuid;
}

export function freshId(prefix: string): string {
  return freshUUID(prefix);
}

/** Gera novos IDs de slide e de elementos aninhados (nunca compartilha refs). */
function withFreshIds(slide: CarouselSlideItem): CarouselSlideItem {
  return {
    ...slide,
    id: freshId("s"),
    extraTexts: Array.isArray(slide.extraTexts)
      ? slide.extraTexts.map((text) => ({ ...text, id: freshId("tx") }))
      : slide.extraTexts,
    extraImages: Array.isArray(slide.extraImages)
      ? slide.extraImages.map((image) => ({ ...image, id: freshId("im") }))
      : slide.extraImages,
  };
}

function clampIndex(post: CanvasPostModel, index: number): number {
  const max = Math.max(0, post.slides.length - 1);
  return Math.min(max, Math.max(0, index));
}

/** Substitui um slide pelo ID (ou pelo índice atual) preservando os demais. */
export function updateSlideById(
  post: CanvasPostModel,
  slideId: string,
  patch: Partial<CarouselSlideItem>,
): CanvasPostModel {
  const index = post.slides.findIndex((slide) => slide.id === slideId);
  if (index < 0) return post;
  const slides = [...post.slides];
  slides[index] = { ...slides[index], ...patch };
  return { ...post, slides };
}

/**
 * Aplica um patch APENAS no slide atual. Não toca o root global nem os
 * outros slides — o default de documento permanece intacto.
 */
export function applyPatchToCurrentSlide(
  post: CanvasPostModel,
  patch: Partial<CarouselSlideItem>,
): CanvasPostModel {
  const index = clampIndex(post, post.currentSlideIndex);
  const slides = [...post.slides];
  slides[index] = { ...slides[index], ...patch };
  return { ...post, slides };
}

/** Aplica um patch a TODOS os slides (operação global explícita). */
export function applyPatchToAllSlides(
  post: CanvasPostModel,
  patch: Partial<CarouselSlideItem>,
): CanvasPostModel {
  return {
    ...post,
    slides: post.slides.map((slide) => ({ ...slide, ...patch })),
  };
}

/** Substitui os campos de fundo (bgImage/bgTransform/bgPlacement) exclusivamente no slide atual. */
export function setCurrentSlideBackground(
  post: CanvasPostModel,
  patch: {
    bgImage?: string;
    bgTransform?: CarouselSlideItem["bgTransform"];
    bgPlacement?: CarouselSlideItem["bgPlacement"];
    splitBgPosition?: CarouselSlideItem["splitBgPosition"];
  },
): CanvasPostModel {
  return applyPatchToCurrentSlide(post, patch);
}

/** Define o enquadramento (cover, contain, original, custom) exclusivamente no slide atual. */
export function setCurrentSlideBackgroundPlacement(
  post: CanvasPostModel,
  placement: CarouselSlideItem["bgPlacement"],
): CanvasPostModel {
  return applyPatchToCurrentSlide(post, { bgPlacement: placement });
}

/** Duplica um slide gerando IDs internos novos e limpa seleção transitória. */
export function duplicateSlide(post: CanvasPostModel, index: number): CanvasPostModel {
  const target = post.slides[clampIndex(post, index)];
  if (!target) return post;
  const nextSlides = [...post.slides];
  nextSlides.splice(index + 1, 0, withFreshIds(target));
  return {
    ...post,
    slides: nextSlides,
    currentSlideIndex: clampIndex(post, index + 1),
  };
}

/** Remove um slide, nunca permitindo ficar sem nenhum. */
export function removeSlide(post: CanvasPostModel, index: number): CanvasPostModel {
  if (post.slides.length <= 1) return post;
  const nextSlides = post.slides.filter((_, i) => i !== index);
  return {
    ...post,
    slides: nextSlides,
    currentSlideIndex: clampIndex(post, post.currentSlideIndex),
  };
}

/** Reordena slides movendo `sourceIndex` para `targetIndex` (IDs estáveis). */
export function reorderSlides(
  post: CanvasPostModel,
  sourceIndex: number,
  targetIndex: number,
): CanvasPostModel {
  const length = post.slides.length;
  const from = Math.min(length - 1, Math.max(0, sourceIndex));
  const to = Math.min(length - 1, Math.max(0, targetIndex));
  if (from === to) return post;

  const slides = [...post.slides];
  const [moved] = slides.splice(from, 1);
  slides.splice(to, 0, moved);

  // Mantém o acompanhamento do slide ativo pelo ID estável movido.
  const activeId = post.slides[post.currentSlideIndex]?.id;
  const newActiveIndex = activeId
    ? slides.findIndex((slide) => slide.id === activeId)
    : post.currentSlideIndex;

  return {
    ...post,
    slides,
    currentSlideIndex: newActiveIndex >= 0 ? newActiveIndex : to,
  };
}

/** Regenera IDs de um texto extra (isola referências de objeto). */
export function duplicateExtraText(text: CanvasCustomText): CanvasCustomText {
  return { ...text, id: freshId("tx") };
}

/** Regenera IDs de uma imagem extra (isola referências de objeto). */
export function duplicateExtraImage(image: CanvasCustomImage): CanvasCustomImage {
  return { ...image, id: freshId("im") };
}

/**
 * Resolve a capa do documento de forma determinística: primeiro slide.
 * Usado pela projeção de campos legados do post (Etapa 2 §7.4) — nunca o
 * slide aberto no instante do save.
 */
export function resolveCoverSlide(post: CanvasPostModel): CarouselSlideItem {
  return post.slides[0] || ({
    id: "s1",
    step: "",
    headline: post.headline,
    subtext: post.subtext,
  } as CarouselSlideItem);
}

/**
 * Duplica um elemento livre (texto ou imagem) no slide atual gerando um UUID
 * novo e deslocando levemente a posição para feedback visual claro.
 */
export function duplicateExtraElement(
  post: CanvasPostModel,
  elementId: string,
): { post: CanvasPostModel; newElementId?: string } {
  const index = clampIndex(post, post.currentSlideIndex);
  const currentSlide = post.slides[index];
  if (!currentSlide) return { post };

  // Verifica se é texto extra
  const extraTexts = currentSlide.extraTexts || [];
  const textIndex = extraTexts.findIndex((t) => t.id === elementId);
  if (textIndex >= 0) {
    const orig = extraTexts[textIndex];
    const newId = freshId("tx");
    const duplicatedText: CanvasCustomText = {
      ...orig,
      id: newId,
      x: (orig.x ?? 40) + 24,
      y: (orig.y ?? 40) + 24,
    };
    const nextTexts = [...extraTexts];
    nextTexts.splice(textIndex + 1, 0, duplicatedText);
    const updatedPost = applyPatchToCurrentSlide(post, { extraTexts: nextTexts });
    return { post: updatedPost, newElementId: newId };
  }

  // Verifica se é imagem extra
  const extraImages = currentSlide.extraImages || [];
  const imgIndex = extraImages.findIndex((img) => img.id === elementId);
  if (imgIndex >= 0) {
    const orig = extraImages[imgIndex];
    const newId = freshId("im");
    const duplicatedImage: CanvasCustomImage = {
      ...orig,
      id: newId,
      x: orig.x + 24,
      y: orig.y + 24,
    };
    const nextImages = [...extraImages];
    nextImages.splice(imgIndex + 1, 0, duplicatedImage);
    const updatedPost = applyPatchToCurrentSlide(post, { extraImages: nextImages });
    return { post: updatedPost, newElementId: newId };
  }

  return { post };
}

/** Remove um elemento livre (texto ou imagem) do slide atual. */
export function removeExtraElement(
  post: CanvasPostModel,
  elementId: string,
): CanvasPostModel {
  const index = clampIndex(post, post.currentSlideIndex);
  const currentSlide = post.slides[index];
  if (!currentSlide) return post;

  const extraTexts = (currentSlide.extraTexts || []).filter((t) => t.id !== elementId);
  const extraImages = (currentSlide.extraImages || []).filter((img) => img.id !== elementId);

  return applyPatchToCurrentSlide(post, { extraTexts, extraImages });
}

/**
 * Reordena um elemento livre no empilhamento (z-index / visual Konva).
 * Konva renderiza do primeiro ao último (o último é exibido na frente de todos).
 */
export function reorderExtraElement(
  post: CanvasPostModel,
  elementId: string,
  direction: "front" | "back" | "forward" | "backward",
): CanvasPostModel {
  const index = clampIndex(post, post.currentSlideIndex);
  const currentSlide = post.slides[index];
  if (!currentSlide) return post;

  const extraTexts = [...(currentSlide.extraTexts || [])];
  const textIdx = extraTexts.findIndex((t) => t.id === elementId);
  if (textIdx >= 0) {
    const [item] = extraTexts.splice(textIdx, 1);
    if (direction === "front") {
      extraTexts.push(item);
    } else if (direction === "back") {
      extraTexts.unshift(item);
    } else if (direction === "forward") {
      const target = Math.min(extraTexts.length, textIdx + 1);
      extraTexts.splice(target, 0, item);
    } else if (direction === "backward") {
      const target = Math.max(0, textIdx - 1);
      extraTexts.splice(target, 0, item);
    }
    return applyPatchToCurrentSlide(post, { extraTexts });
  }

  const extraImages = [...(currentSlide.extraImages || [])];
  const imgIdx = extraImages.findIndex((img) => img.id === elementId);
  if (imgIdx >= 0) {
    const [item] = extraImages.splice(imgIdx, 1);
    if (direction === "front") {
      extraImages.push(item);
    } else if (direction === "back") {
      extraImages.unshift(item);
    } else if (direction === "forward") {
      const target = Math.min(extraImages.length, imgIdx + 1);
      extraImages.splice(target, 0, item);
    } else if (direction === "backward") {
      const target = Math.max(0, imgIdx - 1);
      extraImages.splice(target, 0, item);
    }
    return applyPatchToCurrentSlide(post, { extraImages });
  }

  return post;
}

/** Atualiza propriedades de um elemento livre (texto ou imagem) no slide atual. */
export function updateExtraElement(
  post: CanvasPostModel,
  elementId: string,
  patch: Partial<CanvasCustomText> & Partial<CanvasCustomImage>,
): CanvasPostModel {
  const index = clampIndex(post, post.currentSlideIndex);
  const currentSlide = post.slides[index];
  if (!currentSlide) return post;

  let hasText = false;
  const extraTexts = (currentSlide.extraTexts || []).map((t) => {
    if (t.id === elementId) {
      hasText = true;
      return { ...t, ...patch };
    }
    return t;
  });

  if (hasText) {
    return applyPatchToCurrentSlide(post, { extraTexts });
  }

  const extraImages = (currentSlide.extraImages || []).map((img) => {
    if (img.id === elementId) {
      return { ...img, ...patch };
    }
    return img;
  });

  return applyPatchToCurrentSlide(post, { extraImages });
}

/** Aplica opacidade a um elemento livre (entre 0.05 e 1.0). */
export function setExtraElementOpacity(
  post: CanvasPostModel,
  elementId: string,
  opacity: number,
): CanvasPostModel {
  const clamped = Math.max(0.05, Math.min(1, opacity));
  return updateExtraElement(post, elementId, { opacity: clamped });
}

/** Aplica rotação a um elemento livre normalizada em graus (-180..360). */
export function setExtraElementRotation(
  post: CanvasPostModel,
  elementId: string,
  rotation: number,
): CanvasPostModel {
  return updateExtraElement(post, elementId, { rotation: Math.round(rotation) });
}