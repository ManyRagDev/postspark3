import { create } from 'zustand';
import type { PostVariation, AspectRatio, Platform, BackgroundValue, BgOverlaySettings, PostMode, CarouselSlide, CarouselSlideEditorState } from '@shared/postspark';
import { DEFAULT_BG_OVERLAY } from '@shared/postspark';
import type { ImageSettings, AdvancedLayoutSettings } from '@/types/editor';
import { DEFAULT_IMAGE_SETTINGS, DEFAULT_LAYOUT_SETTINGS } from '@/types/editor';
import { layoutToAdvanced } from '@/lib/layoutToAdvanced';
import { applyAspectRatioToVariation } from '@/lib/variationSnapshot';

// Tipo extraído para uso no store
type ImageElement = {
  id: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number | "auto";
  rotation: number;
  source?: "upload" | "url";
};

type LayoutTarget = 'headline' | 'body' | 'image' | 'global' | 'badge' | 'sticker' | 'accentBar' | 'carouselArrow' | 'card' | `section:${string}` | `textElement:${string}` | `imageElement:${string}`;

export type ApplyScope = 'current' | 'all';

interface SlideEditorOverrides {
    variation: Partial<PostVariation>;
    imageSettings: Partial<ImageSettings>;
    layoutSettings: Partial<AdvancedLayoutSettings>;
    bgValue?: BackgroundValue;
    bgOverlay: Partial<BgOverlaySettings>;
}

const emptySlideOverrides = (): SlideEditorOverrides => ({
    variation: {},
    imageSettings: {},
    layoutSettings: {},
    bgValue: undefined,
    bgOverlay: {},
});

const cloneBgValue = (bgValue: BackgroundValue): BackgroundValue => {
    console.log('[cloneBgValue] Cloning:', {
        type: bgValue.type,
        hasUrl: Boolean(bgValue.url),
        urlLength: bgValue.url?.length || 0,
        urlPrefix: bgValue.url?.slice(0, 30) || 'none'
    });

    switch (bgValue.type) {
        case 'solid':
            return { type: 'solid', color: bgValue.color };
        case 'ai':
        case 'gallery':
        case 'upload':
            return { type: bgValue.type, url: bgValue.url };
        default:
            return { type: 'none' };
    }
};

const normalizeImageSettings = (settings?: Partial<ImageSettings>): ImageSettings => ({
    ...DEFAULT_IMAGE_SETTINGS,
    ...(settings ?? {}),
});

const normalizeLayoutSettings = (settings?: Partial<AdvancedLayoutSettings>): AdvancedLayoutSettings => ({
    headline: { ...DEFAULT_LAYOUT_SETTINGS.headline, ...settings?.headline },
    body: { ...DEFAULT_LAYOUT_SETTINGS.body, ...settings?.body },
    accentBar: { ...DEFAULT_LAYOUT_SETTINGS.accentBar, ...settings?.accentBar },
    badge: { ...DEFAULT_LAYOUT_SETTINGS.badge, ...settings?.badge },
    sticker: { ...DEFAULT_LAYOUT_SETTINGS.sticker, ...settings?.sticker },
    carouselArrow: {
        ...DEFAULT_LAYOUT_SETTINGS.carouselArrow,
        ...settings?.carouselArrow,
    },
    card: { ...DEFAULT_LAYOUT_SETTINGS.card, ...settings?.card },
    sectionLayouts: settings?.sectionLayouts ?? {},
    padding: settings?.padding ?? DEFAULT_LAYOUT_SETTINGS.padding,
});

const normalizeBgOverlay = (overlay?: Partial<BgOverlaySettings>): BgOverlaySettings => ({
    ...DEFAULT_BG_OVERLAY,
    ...(overlay ?? {}),
});

const serializeSlideEditorState = (overrides: SlideEditorOverrides): CarouselSlideEditorState | undefined => {
    const hasVariation = Object.keys(overrides.variation).length > 0;
    const hasImage = Object.keys(overrides.imageSettings).length > 0;
    const hasLayout = Object.keys(overrides.layoutSettings).length > 0;
    const hasOverlay = Object.keys(overrides.bgOverlay).length > 0;
    const hasBgValue = overrides.bgValue !== undefined;

    if (!hasVariation && !hasImage && !hasLayout && !hasOverlay && !hasBgValue) {
        return undefined;
    }

    return {
        variation: hasVariation ? overrides.variation : undefined,
        imageSettings: hasImage ? overrides.imageSettings : undefined,
        layoutSettings: hasLayout ? overrides.layoutSettings : undefined,
        bgValue: hasBgValue ? cloneBgValue(overrides.bgValue!) : undefined,
        bgOverlay: hasOverlay ? overrides.bgOverlay : undefined,
    };
};

const overridesFromSlide = (slide: CarouselSlide): SlideEditorOverrides => ({
    variation: slide.editorState?.variation ?? {},
    imageSettings: (slide.editorState?.imageSettings as Partial<ImageSettings> | undefined) ?? {},
    layoutSettings: (slide.editorState?.layoutSettings as Partial<AdvancedLayoutSettings> | undefined) ?? {},
    bgValue: slide.editorState?.bgValue ? cloneBgValue(slide.editorState.bgValue) : undefined,
    bgOverlay: slide.editorState?.bgOverlay ?? {},
});

const mergeSlideIntoVariation = (baseVariation: PostVariation | null, slides: CarouselSlide[], slideOverrides: SlideEditorOverrides[], index: number): PostVariation | null => {
    if (!baseVariation) return null;

    const slide = slides[index];
    const overrides = slideOverrides[index] ?? emptySlideOverrides();
    const merged = {
        ...baseVariation,
        ...overrides.variation,
        slides: slides.map((item, itemIndex) => ({
            ...item,
            editorState: serializeSlideEditorState(slideOverrides[itemIndex] ?? emptySlideOverrides()),
        })),
    } as PostVariation;

    if (slide) {
        merged.headline = slide.headline;
        merged.body = slide.body;
    }

    return merged;
};

const mergeBackgroundValue = (baseBgValue: BackgroundValue, override?: BackgroundValue): BackgroundValue => (override ? cloneBgValue(override) : cloneBgValue(baseBgValue));

const serializeSlides = (slides: CarouselSlide[], overrides: SlideEditorOverrides[]): CarouselSlide[] =>
    slides.map((slide, index) => ({
        ...slide,
        editorState: serializeSlideEditorState(overrides[index] ?? emptySlideOverrides()),
    }));

const hydrateCarouselState = (
    state: Pick<EditorState, 'baseVariation' | 'slides' | 'slideOverrides' | 'baseImageSettings' | 'baseLayoutSettings' | 'baseBgValue' | 'baseBgOverlay'>,
    currentSlideIndex: number
) => {
    const overrides = state.slideOverrides[currentSlideIndex] ?? emptySlideOverrides();
    return {
        currentSlideIndex,
        activeVariation: mergeSlideIntoVariation(state.baseVariation, state.slides, state.slideOverrides, currentSlideIndex),
        imageSettings: normalizeImageSettings({
            ...state.baseImageSettings,
            ...overrides.imageSettings,
        }),
        layoutSettings: normalizeLayoutSettings({
            ...state.baseLayoutSettings,
            ...overrides.layoutSettings,
        }),
        bgValue: mergeBackgroundValue(state.baseBgValue, overrides.bgValue),
        bgOverlay: normalizeBgOverlay({
            ...state.baseBgOverlay,
            ...overrides.bgOverlay,
        }),
        slides: serializeSlides(state.slides, state.slideOverrides),
    };
};

export interface EditorState {
    activeVariation: PostVariation | null;
    baseVariation: PostVariation | null;
    postMode: PostMode;
    slides: CarouselSlide[];
    slideOverrides: SlideEditorOverrides[];
    currentSlideIndex: number;
    platform: Platform;
    aspectRatio: AspectRatio;
    applyScope: ApplyScope;

    imageSettings: ImageSettings;
    baseImageSettings: ImageSettings;
    layoutSettings: AdvancedLayoutSettings;
    baseLayoutSettings: AdvancedLayoutSettings;
    bgValue: BackgroundValue;
    baseBgValue: BackgroundValue;
    bgOverlay: BgOverlaySettings;
    baseBgOverlay: BgOverlaySettings;
    layoutTarget: LayoutTarget;
    isMagnetActive: boolean;

    // Image elements (draggable images on canvas)
    imageElements: ImageElement[];

    setActiveVariation: (variation: PostVariation | null) => void;
    setSlides: (slides: CarouselSlide[]) => void;
    setCurrentSlideIndex: (index: number) => void;
    updateSlide: (index: number, patch: Partial<CarouselSlide>) => void;
    setPostMode: (mode: PostMode) => void;
    setPlatform: (platform: Platform) => void;
    setAspectRatio: (ratio: AspectRatio) => void;
    setApplyScope: (scope: ApplyScope) => void;

    updateImageSettings: (settings: Partial<ImageSettings>) => void;
    updateLayoutSettings: (settings: Partial<AdvancedLayoutSettings>) => void;
    setBgValue: (bg: BackgroundValue) => void;
    setBgOverlay: (overlay: Partial<BgOverlaySettings>) => void;
    setLayoutTarget: (target: LayoutTarget) => void;
    setMagnetActive: (active: boolean) => void;

    updateVariation: (variation: Partial<PostVariation>) => void;
    reset: () => void;

    // Image element actions
    addImageElement: (element: ImageElement) => void;
    removeImageElement: (id: string) => void;
    updateSingleImageElement: (id: string, patch: Partial<ImageElement>) => void;
}

export const useEditorStore = create<EditorState>(set => ({
    activeVariation: null,
    baseVariation: null,
    postMode: 'static',
    slides: [],
    slideOverrides: [],
    currentSlideIndex: 0,
    platform: 'instagram',
    aspectRatio: '1:1',
    applyScope: 'current',

    imageSettings: DEFAULT_IMAGE_SETTINGS,
    baseImageSettings: DEFAULT_IMAGE_SETTINGS,
    layoutSettings: DEFAULT_LAYOUT_SETTINGS,
    baseLayoutSettings: DEFAULT_LAYOUT_SETTINGS,
    bgValue: { type: 'none' },
    baseBgValue: { type: 'none' },
    bgOverlay: DEFAULT_BG_OVERLAY,
    baseBgOverlay: DEFAULT_BG_OVERLAY,
    layoutTarget: 'global',
    isMagnetActive: true,
    imageElements: [],

    setActiveVariation: variation =>
        set(state => {
            if (!variation) {
                return {
                    activeVariation: null,
                    baseVariation: null,
                };
            }

            const aspectRatio = variation.aspectRatio ?? state.aspectRatio;
            const platform = variation.platform ?? state.platform;
            // "Fonte única da verdade": aplica aspectRatioOptimizations[aspectRatio]
            // sobre a variação ANTES de derivar cores e bgValue. Isso garante que
            // HoloDeck e Workbench leiam a mesma fonte para cores/layout por formato.
            const arAdjustedVariation = applyAspectRatioToVariation(variation, aspectRatio);
            const slides = arAdjustedVariation.slides ?? [];
            const postMode = arAdjustedVariation.postMode ?? (slides.length > 0 ? 'carousel' : 'static');
            const responsiveLayouts = arAdjustedVariation.layoutSettingsByAspectRatio ?? {};
            const initialLayout = responsiveLayouts[aspectRatio] ?? arAdjustedVariation.layoutSettings ?? layoutToAdvanced(arAdjustedVariation.layout);
            const imageSettings = normalizeImageSettings(arAdjustedVariation.imageSettings);
            const layoutSettings = normalizeLayoutSettings(initialLayout);
            const bgValue = arAdjustedVariation.bgValue
                ? cloneBgValue(arAdjustedVariation.bgValue)
                : arAdjustedVariation.imageUrl
                  ? { type: 'ai' as const, url: arAdjustedVariation.imageUrl }
                  : { type: 'solid' as const, color: arAdjustedVariation.backgroundColor };
            const bgOverlay = normalizeBgOverlay(variation.bgOverlay);
            const slideOverrides = slides.map(overridesFromSlide);
            const nextVariation = {
                ...variation,
                aspectRatio,
                platform,
                postMode,
                slides,
                imageSettings,
                layoutSettings,
                bgValue,
                bgOverlay,
            };
            const activeVariation = postMode === 'carousel' && slides.length > 0 ? mergeSlideIntoVariation(nextVariation, slides, slideOverrides, 0) : nextVariation;
            const imageElements = activeVariation?.imageElements ?? [];

            return {
                activeVariation,
                baseVariation: nextVariation,
                postMode,
                slides,
                slideOverrides,
                currentSlideIndex: 0,
                platform,
                aspectRatio,
                imageSettings,
                baseImageSettings: imageSettings,
                layoutSettings,
                baseLayoutSettings: layoutSettings,
                bgValue,
                baseBgValue: bgValue,
                bgOverlay,
                baseBgOverlay: bgOverlay,
                imageElements,
                applyScope: state.applyScope,
            };
        }),

    setSlides: slides =>
        set(state => {
            const boundedIndex = Math.min(state.currentSlideIndex, Math.max(slides.length - 1, 0));
            const nextOverrides = slides.map((slide, index) => {
                const existing = state.slideOverrides[index];
                return existing ?? overridesFromSlide(slide);
            });
            const nextBaseVariation: PostVariation | null = state.baseVariation
                ? {
                      ...state.baseVariation,
                      postMode: (slides.length > 0 ? 'carousel' : 'static') as PostMode,
                  }
                : null;

            if (slides.length === 0) {
                return {
                    postMode: 'static',
                    slides: [],
                    slideOverrides: [],
                    currentSlideIndex: 0,
                    activeVariation: nextBaseVariation,
                    baseVariation: nextBaseVariation,
                };
            }

            return {
                postMode: 'carousel',
                ...hydrateCarouselState(
                    {
                        baseVariation: nextBaseVariation,
                        slides,
                        slideOverrides: nextOverrides,
                        baseImageSettings: state.baseImageSettings,
                        baseLayoutSettings: state.baseLayoutSettings,
                        baseBgValue: state.baseBgValue,
                        baseBgOverlay: state.baseBgOverlay,
                    },
                    boundedIndex
                ),
                slideOverrides: nextOverrides,
                baseVariation: nextBaseVariation,
            };
        }),

    setCurrentSlideIndex: currentSlideIndex =>
        set(state => {
            if (currentSlideIndex < 0 || currentSlideIndex >= state.slides.length) return state;
            if (state.postMode !== 'carousel' || state.slides.length === 0) {
                return { currentSlideIndex };
            }

            return hydrateCarouselState(state, currentSlideIndex);
        }),

    updateSlide: (index, patch) =>
        set(state => {
            if (index < 0 || index >= state.slides.length) return state;

            const slides = [...state.slides];
            slides[index] = {
                ...slides[index],
                ...patch,
            };

            if (state.postMode !== 'carousel') {
                return {
                    slides,
                    activeVariation: state.activeVariation ? { ...state.activeVariation, slides } : null,
                    baseVariation: state.baseVariation ? { ...state.baseVariation, slides } : null,
                };
            }

            const hydrated = hydrateCarouselState(
                {
                    baseVariation: state.baseVariation ? { ...state.baseVariation, slides } : null,
                    slides,
                    slideOverrides: state.slideOverrides,
                    baseImageSettings: state.baseImageSettings,
                    baseLayoutSettings: state.baseLayoutSettings,
                    baseBgValue: state.baseBgValue,
                    baseBgOverlay: state.baseBgOverlay,
                },
                state.currentSlideIndex
            );

            return {
                ...hydrated,
                baseVariation: state.baseVariation ? { ...state.baseVariation, slides } : null,
            };
        }),

    setPostMode: postMode =>
        set(state => ({
            postMode,
            baseVariation: state.baseVariation ? { ...state.baseVariation, postMode } : null,
            activeVariation: state.activeVariation ? { ...state.activeVariation, postMode } : null,
        })),

    setPlatform: platform =>
        set(state => {
            if (!state.activeVariation) return { platform };

            return {
                platform,
                activeVariation: {
                    ...state.activeVariation,
                    platform,
                },
                baseVariation: state.baseVariation
                    ? {
                          ...state.baseVariation,
                          platform,
                      }
                    : null,
            };
        }),
    setAspectRatio: aspectRatio =>
        set(state => {
            const currentRatio = aspectRatio;

            const storedLayouts = {
                ...(state.baseVariation?.layoutSettingsByAspectRatio ?? {}),
                [state.aspectRatio]: state.baseLayoutSettings,
            };

            const nextLayout = normalizeLayoutSettings(storedLayouts[currentRatio] ?? layoutToAdvanced(state.baseVariation?.layout ?? 'centered'));

            // "Fonte única da verdade": ao trocar de aspect ratio, aplica
            // aspectRatioOptimizations[currentRatio] sobre a variação para
            // refletir cores/layout específicos daquele formato.
            const patchVariation = (variation: PostVariation | null) => {
                if (!variation) return null;
                const arPatched = applyAspectRatioToVariation(variation, currentRatio);
                return {
                    ...arPatched,
                    platform: state.platform,
                    layoutSettings: nextLayout,
                    layoutSettingsByAspectRatio: storedLayouts,
                };
            };

            const nextActiveVariation = patchVariation(state.activeVariation);
            const nextBaseVariation = patchVariation(state.baseVariation);

            // Recria bgValue a partir da cor efetiva do novo aspect ratio
            const effectiveBgColor = nextActiveVariation?.backgroundColor;
            const nextBgValue =
                state.baseBgValue.type === 'ai' || state.baseBgValue.type === 'gallery' || state.baseBgValue.type === 'upload'
                    ? state.baseBgValue
                    : effectiveBgColor
                      ? { type: 'solid' as const, color: effectiveBgColor }
                      : state.baseBgValue;

            return {
                aspectRatio: currentRatio,
                layoutSettings: nextLayout,
                baseLayoutSettings: nextLayout,
                activeVariation: nextActiveVariation,
                baseVariation: nextBaseVariation,
                bgValue: nextBgValue,
                baseBgValue: nextBgValue,
            };
        }),
    setApplyScope: applyScope => set({ applyScope }),

    updateImageSettings: settings =>
        set(state => {
            if (state.postMode === 'carousel' && state.slides.length > 0) {
                if (state.applyScope === 'all') {
                    const slideOverrides = state.slideOverrides.map(entry => ({
                        ...entry,
                        imageSettings: { ...entry.imageSettings, ...settings },
                    }));

                    return {
                        slideOverrides,
                        slides: serializeSlides(state.slides, slideOverrides),
                        baseImageSettings: normalizeImageSettings({
                            ...state.baseImageSettings,
                            ...settings,
                        }),
                        imageSettings: normalizeImageSettings({
                            ...state.imageSettings,
                            ...settings,
                        }),
                    };
                }

                const slideOverrides = [...state.slideOverrides];
                slideOverrides[state.currentSlideIndex] = {
                    ...slideOverrides[state.currentSlideIndex],
                    imageSettings: {
                        ...(slideOverrides[state.currentSlideIndex]?.imageSettings ?? {}),
                        ...settings,
                    },
                };

                return {
                    slideOverrides,
                    slides: serializeSlides(state.slides, slideOverrides),
                    imageSettings: normalizeImageSettings({
                        ...state.imageSettings,
                        ...settings,
                    }),
                };
            }

            return {
                imageSettings: normalizeImageSettings({
                    ...state.imageSettings,
                    ...settings,
                }),
                baseImageSettings: normalizeImageSettings({
                    ...state.baseImageSettings,
                    ...settings,
                }),
            };
        }),

    updateLayoutSettings: settings =>
        set(state => {
            if (state.postMode === 'carousel' && state.slides.length > 0) {
                if (state.applyScope === 'all') {
                    const slideOverrides = state.slideOverrides.map(entry => ({
                        ...entry,
                        layoutSettings: { ...entry.layoutSettings, ...settings },
                    }));

                    return {
                        slideOverrides,
                        slides: serializeSlides(state.slides, slideOverrides),
                        baseLayoutSettings: normalizeLayoutSettings({
                            ...state.baseLayoutSettings,
                            ...settings,
                        }),
                        layoutSettings: normalizeLayoutSettings({
                            ...state.layoutSettings,
                            ...settings,
                        }),
                    };
                }

                const slideOverrides = [...state.slideOverrides];
                slideOverrides[state.currentSlideIndex] = {
                    ...slideOverrides[state.currentSlideIndex],
                    layoutSettings: {
                        ...(slideOverrides[state.currentSlideIndex]?.layoutSettings ?? {}),
                        ...settings,
                    },
                };

                return {
                    slideOverrides,
                    slides: serializeSlides(state.slides, slideOverrides),
                    layoutSettings: normalizeLayoutSettings({
                        ...state.layoutSettings,
                        ...settings,
                    }),
                };
            }

            return {
                layoutSettings: normalizeLayoutSettings({
                    ...state.layoutSettings,
                    ...settings,
                }),
                baseLayoutSettings: normalizeLayoutSettings({
                    ...state.baseLayoutSettings,
                    ...settings,
                }),
            };
        }),

    setBgValue: bgValue =>
        set(state => {
            console.log('[editorStore.setBgValue] Setting bgValue:', {
                type: bgValue.type,
                hasUrl: Boolean(bgValue.url),
                urlLength: bgValue.url?.length || 0,
                urlPrefix: bgValue.url?.slice(0, 30) || 'none',
                color: bgValue.color || 'none'
            });

            if (state.postMode === 'carousel' && state.slides.length > 0) {
                if (state.applyScope === 'all') {
                    const slideOverrides = state.slideOverrides.map(entry => ({
                        ...entry,
                        bgValue,
                    }));

                    return {
                        slideOverrides,
                        slides: serializeSlides(state.slides, slideOverrides),
                        baseBgValue: cloneBgValue(bgValue),
                        bgValue: cloneBgValue(bgValue),
                    };
                }

                const slideOverrides = [...state.slideOverrides];
                slideOverrides[state.currentSlideIndex] = {
                    ...slideOverrides[state.currentSlideIndex],
                    bgValue,
                };

                return {
                    slideOverrides,
                    slides: serializeSlides(state.slides, slideOverrides),
                    bgValue: cloneBgValue(bgValue),
                };
            }

            return {
                bgValue: cloneBgValue(bgValue),
                baseBgValue: cloneBgValue(bgValue),
            };
        }),

    setBgOverlay: overlay =>
        set(state => {
            if (state.postMode === 'carousel' && state.slides.length > 0) {
                if (state.applyScope === 'all') {
                    const slideOverrides = state.slideOverrides.map(entry => ({
                        ...entry,
                        bgOverlay: { ...entry.bgOverlay, ...overlay },
                    }));

                    return {
                        slideOverrides,
                        slides: serializeSlides(state.slides, slideOverrides),
                        baseBgOverlay: normalizeBgOverlay({
                            ...state.baseBgOverlay,
                            ...overlay,
                        }),
                        bgOverlay: normalizeBgOverlay({ ...state.bgOverlay, ...overlay }),
                    };
                }

                const slideOverrides = [...state.slideOverrides];
                slideOverrides[state.currentSlideIndex] = {
                    ...slideOverrides[state.currentSlideIndex],
                    bgOverlay: {
                        ...(slideOverrides[state.currentSlideIndex]?.bgOverlay ?? {}),
                        ...overlay,
                    },
                };

                return {
                    slideOverrides,
                    slides: serializeSlides(state.slides, slideOverrides),
                    bgOverlay: normalizeBgOverlay({ ...state.bgOverlay, ...overlay }),
                };
            }

            return {
                bgOverlay: normalizeBgOverlay({ ...state.bgOverlay, ...overlay }),
                baseBgOverlay: normalizeBgOverlay({
                    ...state.baseBgOverlay,
                    ...overlay,
                }),
            };
        }),

    setLayoutTarget: layoutTarget => set({ layoutTarget }),
    setMagnetActive: isMagnetActive => set({ isMagnetActive }),

    updateVariation: newFields =>
        set(state => {
            if (!state.activeVariation) return state;

            if (state.postMode === 'carousel' && state.slides.length > 0) {
                if (state.applyScope === 'all') {
                    const baseVariation = state.baseVariation ? { ...state.baseVariation, ...newFields } : null;
                    const slideOverrides = state.slideOverrides.map(entry => ({
                        ...entry,
                        variation: { ...entry.variation, ...newFields },
                    }));

                    return {
                        baseVariation,
                        slideOverrides,
                        ...hydrateCarouselState(
                            {
                                baseVariation,
                                slides: state.slides,
                                slideOverrides,
                                baseImageSettings: state.baseImageSettings,
                                baseLayoutSettings: state.baseLayoutSettings,
                                baseBgValue: state.baseBgValue,
                                baseBgOverlay: state.baseBgOverlay,
                            },
                            state.currentSlideIndex
                        ),
                    };
                }

                const slideOverrides = [...state.slideOverrides];
                slideOverrides[state.currentSlideIndex] = {
                    ...slideOverrides[state.currentSlideIndex],
                    variation: {
                        ...(slideOverrides[state.currentSlideIndex]?.variation ?? {}),
                        ...newFields,
                    },
                };

                return {
                    slideOverrides,
                    ...hydrateCarouselState(
                        {
                            baseVariation: state.baseVariation,
                            slides: state.slides,
                            slideOverrides,
                            baseImageSettings: state.baseImageSettings,
                            baseLayoutSettings: state.baseLayoutSettings,
                            baseBgValue: state.baseBgValue,
                            baseBgOverlay: state.baseBgOverlay,
                        },
                        state.currentSlideIndex
                    ),
                };
            }

            return {
                activeVariation: state.activeVariation ? { ...state.activeVariation, ...newFields } : null,
                baseVariation: state.baseVariation ? { ...state.baseVariation, ...newFields } : null,
            };
        }),

    // Image element actions
    addImageElement: (element) =>
        set(state => {
            const next = [...state.imageElements, element];
            return {
                imageElements: next,
                activeVariation: state.activeVariation ? { ...state.activeVariation, imageElements: next } : null,
                baseVariation: state.baseVariation ? { ...state.baseVariation, imageElements: next } : null,
            };
        }),

    removeImageElement: (id) =>
        set(state => {
            const next = state.imageElements.filter(e => e.id !== id);
            return {
                imageElements: next,
                activeVariation: state.activeVariation ? { ...state.activeVariation, imageElements: next } : null,
                baseVariation: state.baseVariation ? { ...state.baseVariation, imageElements: next } : null,
            };
        }),

    updateSingleImageElement: (id, patch) =>
        set(state => {
            const next = state.imageElements.map(e =>
                e.id === id ? { ...e, ...patch } : e
            );
            return {
                imageElements: next,
                activeVariation: state.activeVariation ? { ...state.activeVariation, imageElements: next } : null,
                baseVariation: state.baseVariation ? { ...state.baseVariation, imageElements: next } : null,
            };
        }),

    reset: () =>
        set({
            activeVariation: null,
            baseVariation: null,
            postMode: 'static',
            slides: [],
            slideOverrides: [],
            currentSlideIndex: 0,
            platform: 'instagram',
            aspectRatio: '1:1',
            applyScope: 'current',
            imageSettings: DEFAULT_IMAGE_SETTINGS,
            baseImageSettings: DEFAULT_IMAGE_SETTINGS,
            layoutSettings: DEFAULT_LAYOUT_SETTINGS,
            baseLayoutSettings: DEFAULT_LAYOUT_SETTINGS,
            bgValue: { type: 'none' },
            baseBgValue: { type: 'none' },
            bgOverlay: DEFAULT_BG_OVERLAY,
            baseBgOverlay: DEFAULT_BG_OVERLAY,
            layoutTarget: 'global',
            isMagnetActive: true,
            imageElements: [],
        }),
}));
