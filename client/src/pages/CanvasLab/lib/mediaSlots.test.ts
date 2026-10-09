import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { arsenalHash } from '@shared/arsenalContent';
import { readArsenalComposition } from '@shared/designArsenal';
import { INITIAL_POST } from '../components/types';
import { createArsenalFixtureComposition } from './arsenalFixture';
import { putArsenalComposition, resolveArsenalComposition } from './arsenalComposition';
import { normalizeCanvasModel } from './saveAdapter';
import { duplicateSlide, reorderSlides } from './documentCommands';
import { applyMediaOperation, BACKGROUND_SLOT, imageRequestForTarget, mediaTargets, pendingMediaCount, targetExists } from './mediaSlots';

const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
beforeAll(() => Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => createCanvas(20,20) } }));
afterAll(() => { if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else Reflect.deleteProperty(globalThis, 'document'); });
function fixture() {
  const c = createArsenalFixtureComposition();
  const slotId = c.elements.find(e => e.kind === 'media')!.id;
  c.base = { ...c.base, mediaSlots: [{ id: slotId, label: 'Foto principal', function: 'produto', prompt: 'Produto em mesa clara', deferred: true, policy: 'cover' }] };
  c.origin = { ...c.origin, variantHash: arsenalHash(c.base) };
  const post = putArsenalComposition(structuredClone(INITIAL_POST), resolveArsenalComposition(c));
  return { post, slotId, target: { postId: post.id, slideId: post.slides[0].id, slotId } };
}
describe('deferred media document operations', () => {
  it('pending slots are editorial and can be exported without geometry errors', () => {
    const {post, slotId} = fixture();
    expect(pendingMediaCount(post)).toBe(1);
    expect(post.slides[0].composition!.issues).not.toContain(`missing_media:${slotId}`);
    expect(mediaTargets(post).map(t => t.label)).toEqual(['Fundo', 'Foto principal']);
  });
  it('applies to captured slide after reorder and selection change, preserving newer edits', () => {
    const {post, target} = fixture();
    const duplicated = duplicateSlide(post, 0);
    const later = reorderSlides(duplicated, 0, 1);
    later.caption = 'Legenda editada durante upload';
    const result = applyMediaOperation(later, target, { kind: 'apply', url: 'https://example.com/photo.png' })!;
    expect(result.caption).toBe(later.caption);
    expect(result.currentSlideIndex).toBe(later.currentSlideIndex);
    expect(result.slides.find(s => s.id === target.slideId)!.composition!.media[target.slotId].url).toBe('https://example.com/photo.png');
    expect(result.slides.find(s => s.id !== target.slideId)!.composition!.media[target.slotId]).toBeUndefined();
  });
  it('never redirects a deleted slot, deleted slide, or replaced post', () => {
    const {post, target} = fixture();
    expect(applyMediaOperation({...post, slides: []}, target, {kind:'apply', url:'https://example.com/photo.png'})).toBeNull();
    expect(targetExists({...post, id:'another-document'}, target)).toBe(false);
    expect(targetExists(post, {...target, slotId:'removed-slot'})).toBe(false);
  });
  it('prompt and focal edits survive save, replay, duplication and image removal without changing pinned hashes', () => {
    const {post, target} = fixture();
    const originalHash = post.slides[0].composition!.origin.variantHash;
    const promptEdited = applyMediaOperation(post, target, {kind:'prompt', prompt:'Produto visto de cima'})!;
    const withPhoto = applyMediaOperation(promptEdited, target, {kind:'apply', url:'https://example.com/photo.png'})!;
    const framed = applyMediaOperation(withPhoto, target, {kind:'focal', focalX:0.2, focalY:0.8})!;
    const reopened = normalizeCanvasModel(JSON.parse(JSON.stringify(framed)));
    const c = readArsenalComposition(reopened.slides[0].composition);
    expect(c.origin.variantHash).toBe(originalHash);
    expect(c.mediaSlotPrompts?.[target.slotId]).toBe('Produto visto de cima');
    expect(c.media[target.slotId]).toMatchObject({focalX:0.2, focalY:0.8});
    const duplicate = duplicateSlide(reopened, 0);
    expect(duplicate.slides[1].composition!.mediaSlotPrompts).toEqual(c.mediaSlotPrompts);
    const removed = applyMediaOperation(reopened, target, {kind:'remove'})!;
    expect(pendingMediaCount(removed)).toBe(1);
    expect(removed.slides[0].composition!.mediaSlotPrompts?.[target.slotId]).toBe('Produto visto de cima');
  });
  it('generates for slot geometry and content of captured slide rather than selected slide', () => {
    const {post, target} = fixture();
    const request = imageRequestForTarget(post, target, 'Objeto com luz lateral');
    expect(request.prompt).toBe('Objeto com luz lateral');
    expect(request.postContext?.compositionGuidance).toContain('Foto principal');
    expect(request.postContext?.compositionGuidance).toContain('produto');
    const bg = applyMediaOperation(post, {...target, slotId:BACKGROUND_SLOT}, {kind:'apply', url:'https://example.com/bg.png'})!;
    expect(bg.slides[0].composition!.version).toBe(3);
    expect(mediaTargets(bg)[0].url).toBe('https://example.com/bg.png');
    const removed = applyMediaOperation(bg, {...target, slotId:BACKGROUND_SLOT}, {kind:'remove'})!;
    expect(mediaTargets(removed)[0].url).toBeUndefined();
  });
});
