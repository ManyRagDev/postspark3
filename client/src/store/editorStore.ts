import { create } from 'zustand';
import type { PostVariation, PostVisualSnapshot, AspectRatio, Platform, BackgroundValue, BgOverlaySettings, PostMode, CarouselSlide, CarouselSlideEditorState, ImageElement, TextElement } from '@shared/postspark';
import { DEFAULT_BG_OVERLAY } from '@shared/postspark';
import type { ImageSettings, AdvancedLayoutSettings } from '@/types/editor';
import { DEFAULT_IMAGE_SETTINGS, DEFAULT_LAYOUT_SETTINGS } from '@/types/editor';
import { layoutToAdvanced } from '@/lib/layoutToAdvanced';
import { buildVariationSnapshot, createPostVisualSnapshot } from '@/lib/variationSnapshot';
import {
    isLayoutGeometryTarget,
    isImageGeometryTarget,
    isTextGeometryTarget,
    imageElementFromCommit,
    imageElementsEqual,
    layoutPositionFromCommit,
    layoutPositionsEqual,
    textElementFromCommit,
    textElementsEqual,
    type EditorGeometryCommit,
    type FixedLayoutGeometryTarget,
} from '@/editor/adapters';
import {
    type HistoryStack,
    createHistoryStack,
    pushTransaction,
    undo as historyUndo,
    redo as historyRedo,
    clearHistory as historyClear,
    canUndo,
    canRedo,
} from '@/editor/history';

export type LayoutTarget = 'headline' | 'body' | 'image' | 'global' | 'badge' | 'sticker' | 'accentBar' | 'carouselArrow' | 'card' | `section:${string}` | `textElement:${string}` | `imageElement:${string}`;

export type ApplyScope = 'current' | 'all' | 'selected';

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

/** Índices de slide afetados por uma edição, dado o escopo atual. */
const getTargetIndices = (
    state: Pick<EditorState, 'applyScope' | 'slides' | 'currentSlideIndex' | 'selectedSlideIndices'>,
): number[] => {
    if (state.applyScope === 'all') return state.slides.map((_, index) => index);
    if (state.applyScope === 'selected') {
        return state.selectedSlideIndices.length > 0 ? state.selectedSlideIndices : [state.currentSlideIndex];
    }
    return [state.currentSlideIndex];
};

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
    /** Documento autoritativo usado por renderização, exportação e persistência. */
    visualSnapshot: PostVisualSnapshot | null;
    activeVariation: PostVariation | null;
    baseVariation: PostVariation | null;
    postMode: PostMode;
    slides: CarouselSlide[];
    slideOverrides: SlideEditorOverrides[];
    currentSlideIndex: number;
    platform: Platform;
    aspectRatio: AspectRatio;
    applyScope: ApplyScope;
    /** Índices de slides alvo quando applyScope === 'selected'. */
    selectedSlideIndices: number[];

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
    historyStack: HistoryStack;

    setActiveVariation: (variation: PostVariation | null) => void;
    loadSnapshot: (snapshot: PostVisualSnapshot) => void;
    setSlides: (slides: CarouselSlide[]) => void;
    setCurrentSlideIndex: (index: number) => void;
    updateSlide: (index: number, patch: Partial<CarouselSlide>) => void;
    setPostMode: (mode: PostMode) => void;
    setPlatform: (platform: Platform) => void;
    setAspectRatio: (ratio: AspectRatio) => void;
    setApplyScope: (scope: ApplyScope) => void;
    setSelectedSlideIndices: (indices: number[]) => void;
    toggleSlideSelection: (index: number) => void;

    updateImageSettings: (settings: Partial<ImageSettings>) => void;
    updateLayoutSettings: (settings: Partial<AdvancedLayoutSettings>) => void;
    setBgValue: (bg: BackgroundValue) => void;
    setBgOverlay: (overlay: Partial<BgOverlaySettings>) => void;
    setLayoutTarget: (target: LayoutTarget) => void;
    setMagnetActive: (active: boolean) => void;

    updateVariation: (variation: Partial<PostVariation>) => void;
    commitGeometry: (command: EditorGeometryCommit) => void;
    reset: () => void;

    // Image element actions
    addImageElement: (element: ImageElement) => void;
    removeImageElement: (id: string) => void;
    updateSingleImageElement: (id: string, patch: Partial<ImageElement>) => void;

    // History actions
    undo: () => void;
    redo: () => void;
    clearHistory: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => {
    const setWithSnapshot = (
        update: Partial<EditorState> | ((state: EditorState) => Partial<EditorState> | EditorState),
        historyLabel?: string,
        coalesceKey?: string,
    ) => set(state => {
        const patch = typeof update === 'function' ? update(state) : update;
        const nextState = { ...state, ...patch } as EditorState;
        const fallback = nextState.baseVariation ?? nextState.activeVariation;
        const nextSnapshot = fallback
            ? buildVariationSnapshot(nextState, fallback, nextState.aspectRatio)
            : null;
        if (!nextSnapshot || !state.visualSnapshot) {
            return { ...patch, visualSnapshot: nextSnapshot };
        }
        const result: Partial<EditorState> = { ...patch, visualSnapshot: nextSnapshot };
        if (historyLabel) {
            const nextStack = pushTransaction(
                state.historyStack,
                state.visualSnapshot as unknown as Record<string, unknown>,
                nextSnapshot as unknown as Record<string, unknown>,
                historyLabel,
                coalesceKey,
            );
            result.historyStack = nextStack;
        }
        return result;
    });

    const applyLayoutSettingsUpdate = (
        state: EditorState,
        settings: Partial<AdvancedLayoutSettings>,
    ): Partial<EditorState> => {
        if (state.postMode === 'carousel' && state.slides.length > 0) {
            const indices = new Set(getTargetIndices(state));
            const slideOverrides = state.slideOverrides.map((entry, index) =>
                indices.has(index)
                    ? { ...entry, layoutSettings: { ...entry.layoutSettings, ...settings } }
                    : entry,
            );

            const patch: Partial<EditorState> = {
                slideOverrides,
                slides: serializeSlides(state.slides, slideOverrides),
            };

            if (indices.has(state.currentSlideIndex)) {
                patch.layoutSettings = normalizeLayoutSettings({ ...state.layoutSettings, ...settings });
            }

            if (state.applyScope === 'all') {
                patch.baseLayoutSettings = normalizeLayoutSettings({ ...state.baseLayoutSettings, ...settings });
            }

            return patch;
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
    };

    const normalizeVariationPatch = (newFields: Partial<PostVariation>): Partial<PostVariation> => {
        const tokenColors = newFields.designTokens?.colors;
        const normalizedFields: Partial<PostVariation> = {
            ...newFields,
            backgroundColor: newFields.backgroundColor ?? tokenColors?.background,
            textColor: newFields.textColor ?? tokenColors?.text,
            accentColor: newFields.accentColor ?? tokenColors?.primary,
        };
        if (normalizedFields.backgroundColor === undefined) delete normalizedFields.backgroundColor;
        if (normalizedFields.textColor === undefined) delete normalizedFields.textColor;
        if (normalizedFields.accentColor === undefined) delete normalizedFields.accentColor;
        return normalizedFields;
    };

    const applyVariationUpdate = (
        state: EditorState,
        newFields: Partial<PostVariation>,
    ): Partial<EditorState> | EditorState => {
        if (!state.activeVariation) return state;
        const normalizedFields = normalizeVariationPatch(newFields);

        if (state.postMode === 'carousel' && state.slides.length > 0) {
            const indices = new Set(getTargetIndices(state));
            const slideOverrides = state.slideOverrides.map((entry, index) =>
                indices.has(index)
                    ? { ...entry, variation: { ...entry.variation, ...normalizedFields } }
                    : entry,
            );
            const baseVariation = state.applyScope === 'all'
                ? (state.baseVariation ? { ...state.baseVariation, ...normalizedFields } : null)
                : state.baseVariation;

            return {
                baseVariation,
                slideOverrides,
                ...hydrateCarouselState({
                    baseVariation,
                    slides: state.slides,
                    slideOverrides,
                    baseImageSettings: state.baseImageSettings,
                    baseLayoutSettings: state.baseLayoutSettings,
                    baseBgValue: state.baseBgValue,
                    baseBgOverlay: state.baseBgOverlay,
                }, state.currentSlideIndex),
            };
        }

        return {
            activeVariation: { ...state.activeVariation, ...normalizedFields },
            baseVariation: state.baseVariation ? { ...state.baseVariation, ...normalizedFields } : null,
        };
    };

    const geometryLayoutPatch = (
        state: EditorState,
        command: EditorGeometryCommit,
    ): Partial<AdvancedLayoutSettings> | null => {
        const target = command.interaction.elementId;
        if (!isLayoutGeometryTarget(target)) return null;

        if (target.startsWith('section:')) {
            const sectionId = target.slice('section:'.length);
            const sectionExists = state.activeVariation?.sections?.some(
                (section, index) => (section.id ?? `section-${index + 1}`) === sectionId,
            );
            if (!sectionExists) return null;

            const sectionLayouts = state.layoutSettings.sectionLayouts ?? {};
            const current = sectionLayouts[sectionId] ?? DEFAULT_LAYOUT_SETTINGS.body;
            const next = layoutPositionFromCommit(current, command);
            if (layoutPositionsEqual(current, next)) return null;

            return {
                sectionLayouts: {
                    ...sectionLayouts,
                    [sectionId]: next,
                },
            };
        }

        const fixedTarget = target as FixedLayoutGeometryTarget;
        const current = state.layoutSettings[fixedTarget];
        const next = layoutPositionFromCommit(current, command);
        if (layoutPositionsEqual(current, next)) return null;
        return { [fixedTarget]: next } as Partial<AdvancedLayoutSettings>;
    };

    return ({
    visualSnapshot: null,
    activeVariation: null,
    baseVariation: null,
    postMode: 'static',
    slides: [],
    slideOverrides: [],
    currentSlideIndex: 0,
    platform: 'instagram',
    aspectRatio: '1:1',
    applyScope: 'current',
    selectedSlideIndices: [],

    imageSettings: DEFAULT_IMAGE_SETTINGS,
    baseImageSettings: DEFAULT_IMAGE_SETTINGS,
    layoutSettings: DEFAULT_LAYOUT_SETTINGS,
    baseLayoutSettings: DEFAULT_LAYOUT_SETTINGS,
    bgValue: { type: 'none' },
    baseBgValue: { type: 'none' },
    bgOverlay: DEFAULT_BG_OVERLAY,
    baseBgOverlay: DEFAULT_BG_OVERLAY,
    layoutTarget: 'global',
    isMagnetActive: false,
    historyStack: createHistoryStack(),
    setActiveVariation: variation =>
        setWithSnapshot(state => {
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
            const arAdjustedVariation = createPostVisualSnapshot(variation, aspectRatio);
            const slides = arAdjustedVariation.slides ?? [];
            const postMode = arAdjustedVariation.postMode ?? (slides.length > 0 ? 'carousel' : 'static');
            const responsiveLayouts = arAdjustedVariation.layoutSettingsByAspectRatio ?? {};
            const initialLayout = arAdjustedVariation.snapshotVersion === 3 && arAdjustedVariation.aspectRatio === aspectRatio
                ? arAdjustedVariation.layoutSettings
                : responsiveLayouts[aspectRatio] ?? arAdjustedVariation.layoutSettings ?? layoutToAdvanced(arAdjustedVariation.layout);
            const imageSettings = normalizeImageSettings(arAdjustedVariation.imageSettings);
            const layoutSettings = normalizeLayoutSettings(initialLayout);
            const bgValue = arAdjustedVariation.bgValue
                ? cloneBgValue(arAdjustedVariation.bgValue)
                : arAdjustedVariation.imageUrl
                  ? { type: 'ai' as const, url: arAdjustedVariation.imageUrl }
                  : { type: 'solid' as const, color: arAdjustedVariation.backgroundColor };
            const bgOverlay = normalizeBgOverlay(arAdjustedVariation.bgOverlay);
            const slideOverrides = slides.map(overridesFromSlide);
            const nextVariation = {
                ...arAdjustedVariation,
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
                applyScope: state.applyScope,
                selectedSlideIndices: [],
            };
        }),
    loadSnapshot: snapshot => get().setActiveVariation(snapshot),

    setSlides: slides =>
        setWithSnapshot(state => {
            const boundedIndex = Math.min(state.currentSlideIndex, Math.max(slides.length - 1, 0));
            const nextOverrides = slides.map((slide, index) => {
                const existing = state.slideOverrides[index];
                return existing ?? overridesFromSlide(slide);
            });
            const selectedSlideIndices = state.selectedSlideIndices.filter(index => index < slides.length);
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
                    selectedSlideIndices,
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
                selectedSlideIndices,
            };
        }),

    setCurrentSlideIndex: currentSlideIndex =>
        setWithSnapshot(state => {
            if (currentSlideIndex < 0 || currentSlideIndex >= state.slides.length) return state;
            if (state.postMode !== 'carousel' || state.slides.length === 0) {
                return { currentSlideIndex };
            }

            return hydrateCarouselState(state, currentSlideIndex);
        }),

    updateSlide: (index, patch) =>
        setWithSnapshot(state => {
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
        setWithSnapshot(state => ({
            postMode,
            baseVariation: state.baseVariation ? { ...state.baseVariation, postMode } : null,
            activeVariation: state.activeVariation ? { ...state.activeVariation, postMode } : null,
        })),

    setPlatform: platform =>
        setWithSnapshot(state => {
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
        setWithSnapshot(state => {
            const currentRatio = aspectRatio;

            const storedLayouts = {
                ...(state.baseVariation?.layoutSettingsByAspectRatio ?? {}),
                [state.aspectRatio]: state.baseLayoutSettings,
            };

            const patchVariation = (variation: PostVariation | null) => {
                if (!variation) return null;
                const arPatched = createPostVisualSnapshot(variation, currentRatio);
                const hasExplicitLayout = storedLayouts[currentRatio] != null;
                return {
                    ...arPatched,
                    platform: state.platform,
                    layoutSettings: hasExplicitLayout
                        ? normalizeLayoutSettings(storedLayouts[currentRatio])
                        : arPatched.layoutSettings,
                    layoutSettingsByAspectRatio: storedLayouts,
                };
            };

            const nextActiveVariation = patchVariation(state.activeVariation);
            const nextBaseVariation = patchVariation(state.baseVariation);

            const resolvedLayout = nextBaseVariation?.layoutSettings ?? nextActiveVariation?.layoutSettings ?? normalizeLayoutSettings(layoutToAdvanced('centered'));

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
                layoutSettings: resolvedLayout,
                baseLayoutSettings: resolvedLayout,
                activeVariation: nextActiveVariation,
                baseVariation: nextBaseVariation,
                bgValue: nextBgValue,
                baseBgValue: nextBgValue,
            };
        }, "Mudar formato"),
    setApplyScope: applyScope => set({ applyScope }),
    setSelectedSlideIndices: selectedSlideIndices => set({ selectedSlideIndices }),
    toggleSlideSelection: index =>
        set(state => ({
            selectedSlideIndices: state.selectedSlideIndices.includes(index)
                ? state.selectedSlideIndices.filter(value => value !== index)
                : [...state.selectedSlideIndices, index].sort((a, b) => a - b),
        })),

    updateImageSettings: settings =>
        setWithSnapshot(state => {
            if (state.postMode === 'carousel' && state.slides.length > 0) {
                const indices = new Set(getTargetIndices(state));
                const slideOverrides = state.slideOverrides.map((entry, index) =>
                    indices.has(index)
                        ? { ...entry, imageSettings: { ...entry.imageSettings, ...settings } }
                        : entry,
                );

                const patch: Partial<EditorState> = {
                    slideOverrides,
                    slides: serializeSlides(state.slides, slideOverrides),
                };

                if (indices.has(state.currentSlideIndex)) {
                    patch.imageSettings = normalizeImageSettings({ ...state.imageSettings, ...settings });
                }

                if (state.applyScope === 'all') {
                    patch.baseImageSettings = normalizeImageSettings({ ...state.baseImageSettings, ...settings });
                }

                return patch;
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
        setWithSnapshot(state => applyLayoutSettingsUpdate(state, settings), "Alterar layout"),

    setBgValue: bgValue =>
        setWithSnapshot(state => {
            if (state.postMode === 'carousel' && state.slides.length > 0) {
                const indices = new Set(getTargetIndices(state));
                const slideOverrides = state.slideOverrides.map((entry, index) =>
                    indices.has(index) ? { ...entry, bgValue } : entry,
                );

                const patch: Partial<EditorState> = {
                    slideOverrides,
                    slides: serializeSlides(state.slides, slideOverrides),
                };

                if (indices.has(state.currentSlideIndex)) {
                    patch.bgValue = cloneBgValue(bgValue);
                }

                if (state.applyScope === 'all') {
                    patch.baseBgValue = cloneBgValue(bgValue);
                }

                return patch;
            }

            return {
                bgValue: cloneBgValue(bgValue),
                baseBgValue: cloneBgValue(bgValue),
            };
        }, "Alterar fundo"),

    setBgOverlay: overlay =>
        setWithSnapshot(state => {
            if (state.postMode === 'carousel' && state.slides.length > 0) {
                const indices = new Set(getTargetIndices(state));
                const slideOverrides = state.slideOverrides.map((entry, index) =>
                    indices.has(index)
                        ? { ...entry, bgOverlay: { ...entry.bgOverlay, ...overlay } }
                        : entry,
                );

                const patch: Partial<EditorState> = {
                    slideOverrides,
                    slides: serializeSlides(state.slides, slideOverrides),
                };

                if (indices.has(state.currentSlideIndex)) {
                    patch.bgOverlay = normalizeBgOverlay({ ...state.bgOverlay, ...overlay });
                }

                if (state.applyScope === 'all') {
                    patch.baseBgOverlay = normalizeBgOverlay({ ...state.baseBgOverlay, ...overlay });
                }

                return patch;
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

    updateVariation: newFields => setWithSnapshot(state => applyVariationUpdate(state, newFields), "Editar conteúdo"),

    commitGeometry: command => {
        const target = command.interaction.elementId;
        const currentState = get();
        const initialLayoutPatch = geometryLayoutPatch(currentState, command);
        const textId = isTextGeometryTarget(target) ? target.slice('textElement:'.length) : null;
        const imageId = isImageGeometryTarget(target) ? target.slice('imageElement:'.length) : null;
        const currentText = textId
            ? currentState.activeVariation?.textElements?.find(element => element.id === textId)
            : undefined;
        const currentImage = imageId
            ? currentState.activeVariation?.imageElements?.find(element => element.id === imageId)
            : undefined;
        if (!initialLayoutPatch && !currentText && !currentImage) return;
        if (currentText && textElementsEqual(currentText, textElementFromCommit(currentText, command.interaction))) return;
        if (currentImage && imageElementsEqual(currentImage, imageElementFromCommit(currentImage, command.interaction))) return;

        const label = command.interaction.operation === "resize" ? "Redimensionar elemento" : "Mover elemento";
        setWithSnapshot(state => {
            const patch = geometryLayoutPatch(state, command);
            if (patch) return applyLayoutSettingsUpdate(state, patch);

            if (textId) {
                const elements = state.activeVariation?.textElements;
                const current = elements?.find(element => element.id === textId);
                if (!elements || !current) return state;
                const next = textElementFromCommit(current, command.interaction);
                if (textElementsEqual(current, next)) return state;
                const textElements: TextElement[] = elements.map(element => element.id === textId ? next : element);
                return applyVariationUpdate(state, { textElements });
            }

            if (imageId) {
                const elements = state.activeVariation?.imageElements;
                const current = elements?.find(element => element.id === imageId);
                if (!elements || !current) return state;
                const next = imageElementFromCommit(current, command.interaction);
                if (imageElementsEqual(current, next)) return state;
                const imageElements: ImageElement[] = elements.map(element => element.id === imageId ? next : element);
                return applyVariationUpdate(state, { imageElements });
            }

            return state;
        }, label, command.interaction.elementId);
    },

    // Image element actions delegate to the canonical carousel-aware variation path.
    addImageElement: element => {
        const current = get().activeVariation?.imageElements ?? [];
        if (current.some(item => item.id === element.id)) return;
        get().updateVariation({ imageElements: [...current, element] });
    },

    removeImageElement: id => {
        const current = get().activeVariation?.imageElements ?? [];
        if (!current.some(item => item.id === id)) return;
        get().updateVariation({ imageElements: current.filter(item => item.id !== id) });
    },

    updateSingleImageElement: (id, patch) => {
        const current = get().activeVariation?.imageElements ?? [];
        if (!current.some(item => item.id === id)) return;
        get().updateVariation({
            imageElements: current.map(item => (item.id === id ? { ...item, ...patch } : item)),
        });
    },

    reset: () =>
        setWithSnapshot({
            activeVariation: null,
            baseVariation: null,
            postMode: 'static',
            slides: [],
            slideOverrides: [],
            currentSlideIndex: 0,
            platform: 'instagram',
            aspectRatio: '1:1',
            applyScope: 'current',
            selectedSlideIndices: [],
            imageSettings: DEFAULT_IMAGE_SETTINGS,
            baseImageSettings: DEFAULT_IMAGE_SETTINGS,
            layoutSettings: DEFAULT_LAYOUT_SETTINGS,
            baseLayoutSettings: DEFAULT_LAYOUT_SETTINGS,
            bgValue: { type: 'none' },
            baseBgValue: { type: 'none' },
            bgOverlay: DEFAULT_BG_OVERLAY,
            baseBgOverlay: DEFAULT_BG_OVERLAY,
            layoutTarget: 'global',
            isMagnetActive: false,
            historyStack: createHistoryStack(),
        }),

    undo: () => {
        const state = get();
        const nextStack = historyUndo(state.historyStack);
        if (!nextStack) return;
        const undone = state.historyStack.past[state.historyStack.past.length - 1];
        if (!undone?.beforeSnapshot) return;
        set({ historyStack: nextStack });
        get().loadSnapshot(undone.beforeSnapshot as unknown as PostVisualSnapshot);
    },

    redo: () => {
        const state = get();
        if (state.historyStack.future.length === 0) return;
        const nextStack = historyRedo(state.historyStack);
        if (!nextStack) return;
        const redone = state.historyStack.future[0];
        if (!redone?.afterSnapshot) return;
        set({ historyStack: nextStack });
        get().loadSnapshot(redone.afterSnapshot as unknown as PostVisualSnapshot);
    },

    clearHistory: () => set({ historyStack: createHistoryStack() }),
    });
});
