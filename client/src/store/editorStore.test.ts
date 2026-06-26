import { beforeEach, describe, expect, it } from 'vitest';
import { CAROUSEL_SLIDES, IMAGE_ELEMENTS, createPostVariation } from '../../../tests/fixtures/postspark';
import { useEditorStore } from './editorStore';
import {
    createCanvasViewport,
    documentRect,
    documentSize,
    elementGeometry,
    screenPoint,
    screenRect,
} from '../editor/geometry';
import { NO_INTERACTION_MODIFIERS, type GeometryCommit } from '../editor/interaction';

const geometryCommit = (
    elementId: string,
    rect = documentRect(90, 72, 180, 72),
    operation: 'drag' | 'resize' = 'drag',
): GeometryCommit => {
    const viewport = createCanvasViewport(screenRect(0, 0, 360, 360), documentSize(360, 360));
    const kind = elementId === 'card' ? 'card' as const : 'block' as const;
    const initial = elementGeometry(elementId, kind, documentRect(40, 50, 100, 60));
    return {
        operation,
        intent: operation === 'drag' ? { type: 'drag' } : { type: 'resize', handle: 'right' },
        elementId,
        kind,
        initial,
        geometry: elementGeometry(elementId, kind, rect),
        viewport,
        startScreenPoint: screenPoint(100, 100),
        finalScreenPoint: screenPoint(150, 130),
        modifiers: NO_INTERACTION_MODIFIERS,
    };
};

describe('editorStore', () => {
    beforeEach(() => {
        useEditorStore.getState().reset();
    });

    it('keeps static edits in active and base variations', () => {
        const store = useEditorStore.getState();
        store.setActiveVariation(createPostVariation());
        store.updateVariation({ body: 'Corpo editado' });

        const state = useEditorStore.getState();
        expect(state.activeVariation?.body).toBe('Corpo editado');
        expect(state.baseVariation?.body).toBe('Corpo editado');
    });

    it('keeps platform synchronized across the editor state and variations', () => {
        const store = useEditorStore.getState();
        store.setActiveVariation(createPostVariation({ platform: 'instagram' }));

        store.setPlatform('linkedin');

        const state = useEditorStore.getState();
        expect(state.platform).toBe('linkedin');
        expect(state.activeVariation?.platform).toBe('linkedin');
        expect(state.baseVariation?.platform).toBe('linkedin');
    });

    it('keeps aspect ratio and platform synchronized across variations', () => {
        const store = useEditorStore.getState();
        store.setActiveVariation(
            createPostVariation({
                platform: 'instagram',
                aspectRatio: '1:1',
            })
        );
        store.setPlatform('facebook');

        store.setAspectRatio('5:6');

        const state = useEditorStore.getState();
        expect(state.aspectRatio).toBe('5:6');
        expect(state.activeVariation).toMatchObject({
            aspectRatio: '5:6',
            platform: 'facebook',
            layoutSettings: state.baseLayoutSettings,
        });
        expect(state.baseVariation).toMatchObject({
            aspectRatio: '5:6',
            platform: 'facebook',
            layoutSettings: state.baseLayoutSettings,
        });
    });

    it('hydrates the complete visual state atomically from one variation', () => {
        const variation = createPostVariation({
            platform: 'linkedin',
            aspectRatio: '5:6',
            postMode: 'carousel',
            slides: CAROUSEL_SLIDES,
            bgValue: { type: 'solid', color: '#102030' },
            imageSettings: {
                zoom: 1.2,
                brightness: 0.9,
                contrast: 1.1,
                saturation: 0.8,
                blur: 0,
                overlayOpacity: 0.2,
                overlayColor: '#000000',
                blendMode: 'multiply',
                panX: 40,
                panY: 60,
            },
        });

        useEditorStore.getState().setActiveVariation(variation);

        const state = useEditorStore.getState();
        expect(state.platform).toBe('linkedin');
        expect(state.aspectRatio).toBe('5:6');
        expect(state.postMode).toBe('carousel');
        expect(state.slides).toEqual(CAROUSEL_SLIDES);
        expect(state.bgValue).toEqual({ type: 'solid', color: '#102030' });
        expect(state.imageSettings).toEqual(variation.imageSettings);
        expect(state.baseVariation).toMatchObject({
            platform: 'linkedin',
            aspectRatio: '5:6',
            postMode: 'carousel',
        });
    });

    it('isolates current-slide overrides and restores them after navigation', () => {
        const store = useEditorStore.getState();
        store.setActiveVariation(createPostVariation({ slides: CAROUSEL_SLIDES }));
        store.setSlides(CAROUSEL_SLIDES);
        store.updateVariation({ accentColor: '#EE46BC' });
        store.updateImageSettings({ zoom: 1.4 });

        store.setCurrentSlideIndex(1);
        expect(useEditorStore.getState().activeVariation?.accentColor).toBe('#7F56D9');
        expect(useEditorStore.getState().imageSettings.zoom).toBe(1);

        store.setCurrentSlideIndex(0);
        expect(useEditorStore.getState().activeVariation?.accentColor).toBe('#EE46BC');
        expect(useEditorStore.getState().imageSettings.zoom).toBe(1.4);
    });

    it('applies carousel edits to every slide when scope is all', () => {
        const store = useEditorStore.getState();
        store.setActiveVariation(createPostVariation({ slides: CAROUSEL_SLIDES }));
        store.setSlides(CAROUSEL_SLIDES);
        store.setApplyScope('all');
        store.updateVariation({ tone: 'educacional' });
        store.setBgValue({ type: 'solid', color: '#0B1220' });

        for (let index = 0; index < CAROUSEL_SLIDES.length; index++) {
            store.setCurrentSlideIndex(index);
            const state = useEditorStore.getState();
            expect(state.activeVariation?.tone).toBe('educacional');
            expect(state.bgValue).toEqual({ type: 'solid', color: '#0B1220' });
        }
    });

    it('applies carousel edits only to the chosen slides when scope is selected', () => {
        const store = useEditorStore.getState();
        store.setActiveVariation(createPostVariation({ slides: CAROUSEL_SLIDES }));
        store.setSlides(CAROUSEL_SLIDES);
        store.setApplyScope('selected');
        store.setSelectedSlideIndices([0, 2]);
        store.updateVariation({ tone: 'educacional' });
        store.setBgValue({ type: 'solid', color: '#0B1220' });
        store.updateImageSettings({ zoom: 1.6 });

        store.setCurrentSlideIndex(0);
        expect(useEditorStore.getState().activeVariation?.tone).toBe('educacional');
        expect(useEditorStore.getState().bgValue).toEqual({ type: 'solid', color: '#0B1220' });
        expect(useEditorStore.getState().imageSettings.zoom).toBe(1.6);

        store.setCurrentSlideIndex(1);
        expect(useEditorStore.getState().activeVariation?.tone).toBe('profissional');
        expect(useEditorStore.getState().imageSettings.zoom).toBe(1);

        store.setCurrentSlideIndex(2);
        expect(useEditorStore.getState().activeVariation?.tone).toBe('educacional');
        expect(useEditorStore.getState().bgValue).toEqual({ type: 'solid', color: '#0B1220' });
        expect(useEditorStore.getState().imageSettings.zoom).toBe(1.6);

        // O escopo 'selected' não deve contaminar a base usada por slides futuros.
        store.updateLayoutSettings({ padding: 12 });
        expect(useEditorStore.getState().baseLayoutSettings.padding).not.toBe(12);
    });

    it('falls back to the current slide when selected scope has no selection', () => {
        const store = useEditorStore.getState();
        store.setActiveVariation(createPostVariation({ slides: CAROUSEL_SLIDES }));
        store.setSlides(CAROUSEL_SLIDES);
        store.setCurrentSlideIndex(1);
        store.setApplyScope('selected');
        store.updateVariation({ tone: 'educacional' });

        store.setCurrentSlideIndex(0);
        expect(useEditorStore.getState().activeVariation?.tone).toBe('profissional');
        store.setCurrentSlideIndex(1);
        expect(useEditorStore.getState().activeVariation?.tone).toBe('educacional');
    });

    it('persists rich element content and geometry through variation updates', () => {
        const store = useEditorStore.getState();
        const variation = createPostVariation();
        store.setActiveVariation(variation);
        const targetTextElementId = variation.textElements?.[0]?.id;

        const textElements = variation.textElements?.map(element => (element.id === targetTextElementId ? { ...element, text: 'Texto revisado', x: 48, width: 220 } : element));
        const sections = variation.sections?.map((section, index) => (index === 0 ? { ...section, label: 'Bloco revisado' } : section));

        store.updateVariation({ textElements, sections });

        const state = useEditorStore.getState();
        expect(state.activeVariation?.textElements?.find(element => element.id === targetTextElementId)).toMatchObject({
            text: 'Texto revisado',
            x: 48,
            width: 220,
        });
        expect(state.activeVariation?.sections?.[0]?.label).toBe('Bloco revisado');
        expect(state.baseVariation?.textElements).toEqual(textElements);
        expect(state.baseVariation?.sections).toEqual(sections);
    });

    it('adds, updates and removes image elements in static posts without duplicate or missing-id commits', () => {
        const store = useEditorStore.getState();
        const image = IMAGE_ELEMENTS[0];
        store.setActiveVariation(createPostVariation({ imageElements: undefined }));

        store.addImageElement(image);
        expect(useEditorStore.getState().activeVariation?.imageElements).toEqual([image]);
        expect(useEditorStore.getState().baseVariation?.imageElements).toEqual([image]);
        expect(useEditorStore.getState().visualSnapshot?.imageElements).toEqual([image]);

        const afterAdd = useEditorStore.getState().visualSnapshot;
        store.addImageElement(image);
        expect(useEditorStore.getState().visualSnapshot).toBe(afterAdd);

        store.updateSingleImageElement('missing-image', { x: 99 });
        expect(useEditorStore.getState().visualSnapshot).toBe(afterAdd);

        store.removeImageElement('missing-image');
        expect(useEditorStore.getState().visualSnapshot).toBe(afterAdd);

        store.updateSingleImageElement(image.id, { x: 72, rotation: 15 });
        expect(useEditorStore.getState().visualSnapshot?.imageElements?.[0]).toMatchObject({
            id: image.id,
            x: 72,
            rotation: 15,
        });

        store.removeImageElement(image.id);
        expect(useEditorStore.getState().activeVariation?.imageElements).toEqual([]);
        expect(useEditorStore.getState().baseVariation?.imageElements).toEqual([]);
        expect(useEditorStore.getState().visualSnapshot?.imageElements).toEqual([]);
    });

    it('isolates image elements in the current carousel slide and restores them after navigation', () => {
        const store = useEditorStore.getState();
        const image = IMAGE_ELEMENTS[0];
        store.setActiveVariation(createPostVariation({
            postMode: 'carousel',
            slides: CAROUSEL_SLIDES,
            imageElements: undefined,
        }));

        store.addImageElement(image);

        let state = useEditorStore.getState();
        expect(state.baseVariation?.imageElements).toBeUndefined();
        expect(state.visualSnapshot?.imageElements).toBeUndefined();
        expect(state.visualSnapshot?.slides?.[0].editorState?.variation?.imageElements).toEqual([image]);
        expect(state.visualSnapshot?.slides?.[1].editorState?.variation?.imageElements).toBeUndefined();

        store.setCurrentSlideIndex(1);
        expect(useEditorStore.getState().activeVariation?.imageElements).toBeUndefined();

        store.setCurrentSlideIndex(0);
        expect(useEditorStore.getState().activeVariation?.imageElements).toEqual([image]);
    });

    it('uses the effective current image set as authoritative when applying to all carousel slides', () => {
        const store = useEditorStore.getState();
        const first = IMAGE_ELEMENTS[0];
        const second = { ...first, id: 'image-shared', x: 140 };
        store.setActiveVariation(createPostVariation({
            postMode: 'carousel',
            slides: CAROUSEL_SLIDES,
            imageElements: undefined,
        }));

        store.addImageElement(first);
        store.setApplyScope('all');
        store.addImageElement(second);

        const expected = [first, second];
        const state = useEditorStore.getState();
        expect(state.baseVariation?.imageElements).toEqual(expected);
        expect(state.visualSnapshot?.imageElements).toEqual(expected);
        expect(state.visualSnapshot?.slides?.every(slide =>
            JSON.stringify(slide.editorState?.variation?.imageElements) === JSON.stringify(expected)
        )).toBe(true);

        for (let index = 0; index < CAROUSEL_SLIDES.length; index++) {
            store.setCurrentSlideIndex(index);
            expect(useEditorStore.getState().activeVariation?.imageElements).toEqual(expected);
        }
    });

    it('keeps section geometry empty until a section layout is explicitly created', () => {
        const store = useEditorStore.getState();
        const variation = createPostVariation();

        store.setActiveVariation(variation);
        expect(useEditorStore.getState().layoutSettings.sectionLayouts).toEqual({});

        store.updateVariation({
            sections: variation.sections?.map((section, index) =>
                index === 0
                    ? {
                        ...section,
                        label: 'Item editado',
                        description: 'Descricao editada',
                    }
                    : section
            ),
        });

        expect(useEditorStore.getState().activeVariation?.sections?.[0]).toMatchObject({
            label: 'Item editado',
            description: 'Descricao editada',
        });
        expect(useEditorStore.getState().layoutSettings.sectionLayouts).toEqual({});

        store.updateLayoutSettings({
            sectionLayouts: {
                'section-1': {
                    position: 'bottom-left',
                    textAlign: 'left',
                    width: 72,
                    freePosition: { x: 35, y: 64 },
                },
            },
        });

        expect(useEditorStore.getState().layoutSettings.sectionLayouts).toEqual({
            'section-1': expect.objectContaining({
                width: 72,
                freePosition: { x: 35, y: 64 },
            }),
        });
    });

    it.each(['headline', 'body', 'accentBar', 'badge', 'sticker', 'carouselArrow', 'card'] as const)(
        'commits %s geometry atomically in static posts',
        target => {
            const store = useEditorStore.getState();
            store.setActiveVariation(createPostVariation());
            const snapshots: unknown[] = [];
            const unsubscribe = useEditorStore.subscribe((state, previous) => {
                if (state.visualSnapshot !== previous.visualSnapshot) snapshots.push(state.visualSnapshot);
            });

            store.commitGeometry({ interaction: geometryCommit(target), snapEnabled: false });
            unsubscribe();

            const state = useEditorStore.getState();
            expect(state.layoutSettings[target].freePosition).toEqual({ x: 50, y: 30 });
            expect(state.baseLayoutSettings[target].freePosition).toEqual({ x: 50, y: 30 });
            expect(state.visualSnapshot?.layoutSettings[target].freePosition).toEqual({ x: 50, y: 30 });
            expect(snapshots).toHaveLength(1);
        },
    );

    it('commits valid sections and ignores invalid targets without rebuilding the snapshot', () => {
        const store = useEditorStore.getState();
        store.setActiveVariation(createPostVariation());
        store.commitGeometry({ interaction: geometryCommit('section:section-1'), snapEnabled: true });

        expect(useEditorStore.getState().layoutSettings.sectionLayouts?.['section-1']?.freePosition)
            .toEqual({ x: 50, y: 30 });

        const snapshot = useEditorStore.getState().visualSnapshot;
        let changes = 0;
        const unsubscribe = useEditorStore.subscribe((state, previous) => {
            if (state.visualSnapshot !== previous.visualSnapshot) changes += 1;
        });
        store.commitGeometry({ interaction: geometryCommit('section:missing'), snapEnabled: false });
        store.commitGeometry({ interaction: geometryCommit('imageElement:missing'), snapEnabled: false });
        unsubscribe();

        expect(useEditorStore.getState().visualSnapshot).toBe(snapshot);
        expect(changes).toBe(0);
    });

    it('keeps flow resize relative and absolute resize center-aware', () => {
        const store = useEditorStore.getState();
        store.setActiveVariation(createPostVariation());
        store.commitGeometry({
            interaction: geometryCommit('headline', documentRect(0, 40, 216, 60), 'resize'),
            snapEnabled: false,
        });
        expect(useEditorStore.getState().layoutSettings.headline).toMatchObject({ width: 60 });
        expect(useEditorStore.getState().layoutSettings.headline.freePosition).toBeUndefined();

        store.updateLayoutSettings({
            headline: {
                ...useEditorStore.getState().layoutSettings.headline,
                freePosition: { x: 50, y: 50 },
            },
        });
        store.commitGeometry({
            interaction: geometryCommit('headline', documentRect(72, 144, 180, 60), 'resize'),
            snapEnabled: false,
        });
        expect(useEditorStore.getState().layoutSettings.headline).toMatchObject({
            width: 50,
        });
        expect(useEditorStore.getState().layoutSettings.headline.freePosition?.x).toBeCloseTo(45, 8);
        expect(useEditorStore.getState().layoutSettings.headline.freePosition?.y).toBeCloseTo(48.3333333333, 8);
    });

    it('isolates current carousel geometry and restores it after navigation', () => {
        const store = useEditorStore.getState();
        store.setActiveVariation(createPostVariation({ postMode: 'carousel', slides: CAROUSEL_SLIDES }));
        store.setCurrentSlideIndex(1);
        store.setApplyScope('current');
        store.commitGeometry({ interaction: geometryCommit('headline'), snapEnabled: false });

        expect(useEditorStore.getState().layoutSettings.headline.freePosition).toEqual({ x: 50, y: 30 });
        expect(useEditorStore.getState().baseLayoutSettings.headline.freePosition).toBeUndefined();
        store.setCurrentSlideIndex(0);
        expect(useEditorStore.getState().layoutSettings.headline.freePosition).toBeUndefined();
        store.setCurrentSlideIndex(1);
        expect(useEditorStore.getState().layoutSettings.headline.freePosition).toEqual({ x: 50, y: 30 });
    });

    it('applies carousel geometry to the root and every slide when scope is all', () => {
        const store = useEditorStore.getState();
        store.setActiveVariation(createPostVariation({ postMode: 'carousel', slides: CAROUSEL_SLIDES }));
        store.setApplyScope('all');
        store.commitGeometry({ interaction: geometryCommit('body'), snapEnabled: true });

        const state = useEditorStore.getState();
        expect(state.baseLayoutSettings.body.freePosition).toEqual({ x: 50, y: 30 });
        expect(state.visualSnapshot?.slides?.every(slide =>
            slide.editorState?.layoutSettings?.body?.freePosition?.x === 50 &&
            slide.editorState?.layoutSettings?.body?.freePosition?.y === 30
        )).toBe(true);
    });

    it('does not rebuild snapshots for selection, scope or magnet controls', () => {
        const store = useEditorStore.getState();
        store.setActiveVariation(createPostVariation());
        const snapshot = useEditorStore.getState().visualSnapshot;

        store.setLayoutTarget('headline');
        store.setApplyScope('all');
        store.setMagnetActive(false);

        expect(useEditorStore.getState().visualSnapshot).toBe(snapshot);
    });

    it('does not rebuild the snapshot when a geometry commit resolves to the current layout', () => {
        const store = useEditorStore.getState();
        store.setActiveVariation(createPostVariation());
        const command = { interaction: geometryCommit('headline'), snapEnabled: false };
        store.commitGeometry(command);
        const snapshot = useEditorStore.getState().visualSnapshot;

        store.commitGeometry(command);

        expect(useEditorStore.getState().visualSnapshot).toBe(snapshot);
    });

    it('commits text and image geometry once while preserving semantic fields', () => {
        const variation = createPostVariation({ imageElements: IMAGE_ELEMENTS });
        const text = variation.textElements![0];
        const image = variation.imageElements![0];
        const store = useEditorStore.getState();
        store.setActiveVariation(variation);
        let snapshotChanges = 0;
        const unsubscribe = useEditorStore.subscribe((state, previous) => {
            if (state.visualSnapshot !== previous.visualSnapshot) snapshotChanges += 1;
        });

        store.commitGeometry({
            interaction: geometryCommit(`textElement:${text.id}`, documentRect(30, 40, 180, 50), 'resize'),
            snapEnabled: false,
        });
        store.commitGeometry({
            interaction: geometryCommit(`imageElement:${image.id}`, documentRect(50, 60, 160, 120), 'resize'),
            snapEnabled: false,
        });
        unsubscribe();

        expect(useEditorStore.getState().activeVariation?.textElements?.[0]).toEqual({
            ...text, x: 30, y: 40, width: 180, height: 'auto',
        });
        expect(useEditorStore.getState().activeVariation?.imageElements?.[0]).toEqual({
            ...image, x: 50, y: 60, width: 160,
            height: image.height === 'auto' ? 'auto' : 120,
        });
        expect(useEditorStore.getState().baseVariation?.textElements).toEqual(useEditorStore.getState().activeVariation?.textElements);
        expect(useEditorStore.getState().visualSnapshot?.imageElements).toEqual(useEditorStore.getState().activeVariation?.imageElements);
        expect(snapshotChanges).toBe(2);
    });

    it('isolates element geometry in current carousel scope and restores it on navigation', () => {
        const variation = createPostVariation({ postMode: 'carousel', slides: CAROUSEL_SLIDES, imageElements: IMAGE_ELEMENTS });
        const text = variation.textElements![0];
        const store = useEditorStore.getState();
        store.setActiveVariation(variation);
        store.setCurrentSlideIndex(1);
        store.setApplyScope('current');
        store.commitGeometry({
            interaction: geometryCommit(`textElement:${text.id}`, documentRect(88, 99, 120, 40)),
            snapEnabled: false,
        });

        expect(useEditorStore.getState().activeVariation?.textElements?.[0]).toMatchObject({ x: 88, y: 99 });
        expect(useEditorStore.getState().baseVariation?.textElements?.[0]).toMatchObject({ x: text.x, y: text.y });
        store.setCurrentSlideIndex(0);
        expect(useEditorStore.getState().activeVariation?.textElements?.[0]).toMatchObject({ x: text.x, y: text.y });
        store.setCurrentSlideIndex(1);
        expect(useEditorStore.getState().activeVariation?.textElements?.[0]).toMatchObject({ x: 88, y: 99 });
    });

    it('applies effective image geometry to the root and every slide in all scope', () => {
        const variation = createPostVariation({ postMode: 'carousel', slides: CAROUSEL_SLIDES, imageElements: IMAGE_ELEMENTS });
        const image = variation.imageElements![0];
        const store = useEditorStore.getState();
        store.setActiveVariation(variation);
        store.setApplyScope('all');
        store.commitGeometry({
            interaction: geometryCommit(`imageElement:${image.id}`, documentRect(44, 55, image.width, typeof image.height === 'number' ? image.height : image.width)),
            snapEnabled: false,
        });

        const state = useEditorStore.getState();
        expect(state.baseVariation?.imageElements?.[0]).toMatchObject({ x: 44, y: 55 });
        expect(state.visualSnapshot?.slides?.every(slide =>
            slide.editorState?.variation?.imageElements?.[0]?.x === 44 &&
            slide.editorState?.variation?.imageElements?.[0]?.y === 55
        )).toBe(true);
    });

    it('does not rebuild snapshots for unchanged text or image commits', () => {
        const variation = createPostVariation({ imageElements: IMAGE_ELEMENTS });
        const text = variation.textElements![0];
        const image = variation.imageElements![0];
        const store = useEditorStore.getState();
        store.setActiveVariation(variation);
        const snapshot = useEditorStore.getState().visualSnapshot;

        store.commitGeometry({
            interaction: geometryCommit(
                `textElement:${text.id}`,
                documentRect(text.x, text.y, typeof text.width === 'number' ? text.width : 80, typeof text.height === 'number' ? text.height : 36),
                'drag',
            ),
            snapEnabled: false,
        });
        store.commitGeometry({
            interaction: geometryCommit(
                `imageElement:${image.id}`,
                documentRect(image.x, image.y, image.width, typeof image.height === 'number' ? image.height : image.width),
                'drag',
            ),
            snapEnabled: false,
        });

        expect(useEditorStore.getState().visualSnapshot).toBe(snapshot);
    });
});
