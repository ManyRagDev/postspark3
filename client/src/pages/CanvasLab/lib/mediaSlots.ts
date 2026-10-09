import type { CanvasPostModel } from '../components/types';
import { displayMediaSlotLabel } from './mediaPresentation';
import type { ImageAspectRatio } from '@shared/imageGeneration';
import { imageDimensions } from '@shared/imageGeneration';
import { imageRequestForPost } from './imageGenerationContext';
import { putArsenalComposition, resolveArsenalComposition, setArsenalCustomBackground, removeArsenalAuthorialLayer, updateArsenalAuthorialLayer } from './arsenalComposition';

/** Identity is captured before a network request; never use the selected index at completion. */
export interface MediaTarget { postId: string; slideId: string; slotId: string }
export type MediaOperation =
  | { kind: 'apply'; url: string }
  | { kind: 'remove' }
  | { kind: 'prompt'; prompt: string }
  | { kind: 'focal'; focalX?: number; focalY?: number };
export type MediaUpdate = (target: MediaTarget, operation: MediaOperation) => void;
export const BACKGROUND_SLOT = '__background__';

export function mediaTargets(post: CanvasPostModel) {
  const slide = post.slides[post.currentSlideIndex];
  if (!slide) return [];
  const c = slide.composition;
  return [
    { id: BACKGROUND_SLOT, label: 'Fundo', prompt: slide.imagePrompt ?? post.imagePrompt ?? '', url: c?.version === 3 ? c.customBackground?.imageUrl : slide.bgImage, focalX: c?.version === 3 ? c.customBackground?.focalX ?? 0.5 : 0.5, focalY: c?.version === 3 ? c.customBackground?.focalY ?? 0.5 : 0.5, width: c?.artboard.width ?? 360, height: c?.artboard.height ?? 360 },
    ...(c?.elements.filter(e => e.kind === 'media' && e.opacity > 0).map((e, index) => ({
      id: e.id, label: displayMediaSlotLabel(e.mediaSlot?.label, `Foto ${index + 1}`), prompt: c.mediaSlotPrompts?.[e.id] ?? e.mediaSlot?.prompt ?? slide.imagePrompt ?? '',
      url: c.media[e.id]?.url, focalX: c.media[e.id]?.focalX ?? 0.5, focalY: c.media[e.id]?.focalY ?? 0.5,
      width: e.width, height: e.height,
    })) ?? []),
  ];
}

export function targetExists(post: CanvasPostModel, target: MediaTarget): boolean {
  if (post.id !== target.postId) return false;
  const slide = post.slides.find(s => s.id === target.slideId);
  return !!slide && (target.slotId === BACKGROUND_SLOT || !!slide.composition?.elements.some(e => e.id === target.slotId && e.kind === 'media' && e.opacity > 0));
}

/** Applies against the current document, preserving unrelated edits, selected slide and ordering. */
export function applyMediaOperation(post: CanvasPostModel, target: MediaTarget, operation: MediaOperation): CanvasPostModel | null {
  if (!targetExists(post, target)) return null;
  const index = post.slides.findIndex(s => s.id === target.slideId);
  const slide = post.slides[index];
  const c = slide.composition;
  if (target.slotId === BACKGROUND_SLOT && operation.kind === 'prompt') {
    return { ...post, slides: post.slides.map((s, i) => i === index ? { ...s, imagePrompt: operation.prompt } : s) };
  }
  if (!c) {
    if (target.slotId !== BACKGROUND_SLOT) return null;
    if (operation.kind === 'focal') return post;
    return { ...post, slides: post.slides.map((s, i) => i === index ? { ...s, bgImage: operation.kind === 'apply' ? operation.url : '' } : s) };
  }
  let next = c;
  if (target.slotId === BACKGROUND_SLOT) {
    const bg = c.version === 3 ? c.customBackground : undefined;
    next = setArsenalCustomBackground(c, operation.kind === 'focal' ? { ...bg, ...(operation.focalX === undefined ? {} : { focalX: operation.focalX }), ...(operation.focalY === undefined ? {} : { focalY: operation.focalY }) } : { ...bg, imageUrl: operation.kind === 'apply' ? operation.url : undefined });
  } else if (operation.kind === 'prompt') {
    next = resolveArsenalComposition({ ...c, mediaSlotPrompts: { ...c.mediaSlotPrompts, [target.slotId]: operation.prompt } });
  } else if (c.version === 3 && c.authorialLayers.some(layer => layer.id === target.slotId)) {
    next = operation.kind === 'remove' ? removeArsenalAuthorialLayer(c, target.slotId) : updateArsenalAuthorialLayer(c, target.slotId, operation.kind === 'focal' ? { ...(operation.focalX === undefined ? {} : { focalX: operation.focalX }), ...(operation.focalY === undefined ? {} : { focalY: operation.focalY }) } : { url: operation.url });
  } else {
    const media = { ...c.media };
    if (operation.kind === 'remove') delete media[target.slotId];
    else if (operation.kind === 'apply') media[target.slotId] = { kind: 'user', url: operation.url, focalX: 0.5, focalY: 0.5 };
    else if (media[target.slotId]) media[target.slotId] = { ...media[target.slotId], ...('focalX' in operation ? { focalX: operation.focalX ?? media[target.slotId].focalX } : {}), ...('focalY' in operation ? { focalY: operation.focalY ?? media[target.slotId].focalY } : {}) };
    next = resolveArsenalComposition({ ...c, media });
  }
  const projected = putArsenalComposition({ ...post, currentSlideIndex: index }, next);
  return index === post.currentSlideIndex ? { ...projected, caption: post.caption, hashtags: post.hashtags, callToAction: post.callToAction } : { ...post, slides: projected.slides };
}

export function pendingMediaCount(post: CanvasPostModel, allSlides = true): number {
  return post.slides.reduce((count, slide, index) => {
    if (!allSlides && index !== post.currentSlideIndex) return count;
    return count + (slide.composition?.elements.filter(e => e.kind === 'media' && e.opacity > 0 && e.mediaSlot?.deferred && !slide.composition?.media[e.id]?.url).length ?? 0);
  }, 0);
}

export function imageRequestForTarget(post: CanvasPostModel, target: MediaTarget, prompt: string) {
  const index = post.slides.findIndex(s => s.id === target.slideId);
  if (index < 0) throw new Error('O slide de destino foi removido.');
  const request = imageRequestForPost({ ...post, currentSlideIndex: index }, prompt);
  if (target.slotId === BACKGROUND_SLOT) return request;
  const e = post.slides[index].composition?.elements.find(e => e.id === target.slotId && e.kind === 'media');
  if (!e) throw new Error('O espaço de imagem foi removido.');
  // Providers expose a fixed ratio set. Choose the closest and crop deterministically in the editor.
  const ratio = e.width / e.height;
  const aspectRatio = (Object.entries(imageDimensions) as [ImageAspectRatio, {width:number;height:number}][])
    .sort((a, b) => Math.abs(Math.log(a[1].width / a[1].height / ratio)) - Math.abs(Math.log(b[1].width / b[1].height / ratio)))[0][0];
  return { ...request, aspectRatio, postContext: { ...request.postContext, compositionGuidance: `Imagem para ${e.mediaSlot?.label ?? 'espaço de foto'}; função: ${e.mediaSlot?.function ?? 'ilustração do conteúdo'}. Região ${Math.round(e.width)} × ${Math.round(e.height)}. O editor fará o enquadramento. Não inclua instruções, guias ou textos do post na imagem.` } };
}
