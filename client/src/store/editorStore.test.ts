import { beforeEach, describe, expect, it } from 'vitest';
import { CAROUSEL_SLIDES, createPostVariation } from '../../../tests/fixtures/postspark';
import { useEditorStore } from './editorStore';

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
});
