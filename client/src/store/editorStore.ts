import { create } from 'zustand';
import type { PostVariation, AspectRatio, Platform, BackgroundValue, BgOverlaySettings, PostMode, CarouselSlide } from '@shared/postspark';
import { DEFAULT_BG_OVERLAY } from '@shared/postspark';
import type { ImageSettings, AdvancedLayoutSettings } from '@/types/editor';
import { DEFAULT_IMAGE_SETTINGS, DEFAULT_LAYOUT_SETTINGS } from '@/types/editor';

export interface EditorState {
    // --- Estado de Origem Mestre ---
    activeVariation: PostVariation | null;
    postMode: PostMode;
    slides: CarouselSlide[];
    currentSlideIndex: number;
    platform: Platform;
    aspectRatio: AspectRatio;

    // --- Estado de Edição Fina ---
    imageSettings: ImageSettings;
    layoutSettings: AdvancedLayoutSettings;
    bgValue: BackgroundValue;
    bgOverlay: BgOverlaySettings;
    layoutTarget: 'headline' | 'body' | 'image' | 'global' | 'badge' | 'sticker' | 'accentBar' | 'carouselArrow' | 'card';
    isMagnetActive: boolean;

    // --- Mutators Core (Actions) ---
    setActiveVariation: (variation: PostVariation | null) => void;
    setSlides: (slides: CarouselSlide[]) => void;
    setCurrentSlideIndex: (index: number) => void;
    updateSlide: (index: number, patch: Partial<CarouselSlide>) => void;
    setPostMode: (mode: PostMode) => void;
    setPlatform: (platform: Platform) => void;
    setAspectRatio: (ratio: AspectRatio) => void;

    // --- Mutators Finais ---
    updateImageSettings: (settings: Partial<ImageSettings>) => void;
    updateLayoutSettings: (settings: Partial<AdvancedLayoutSettings>) => void;
    setBgValue: (bg: BackgroundValue) => void;
    setBgOverlay: (overlay: Partial<BgOverlaySettings>) => void;
    setLayoutTarget: (target: 'headline' | 'body' | 'image' | 'global' | 'badge' | 'sticker' | 'accentBar' | 'carouselArrow' | 'card') => void;
    setMagnetActive: (active: boolean) => void;

    // --- Actions Adicionais Úteis ---
    updateVariation: (variation: Partial<PostVariation>) => void;
    reset: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
    activeVariation: null,
    updateVariation: (newFields) => set((state) => ({
        activeVariation: state.activeVariation ? { ...state.activeVariation, ...newFields } : null
    })),
    postMode: 'static',
    slides: [],
    currentSlideIndex: 0,
    platform: 'instagram',
    aspectRatio: '1:1',

    imageSettings: DEFAULT_IMAGE_SETTINGS,
    layoutSettings: DEFAULT_LAYOUT_SETTINGS,
    bgValue: { type: 'none' },
    bgOverlay: DEFAULT_BG_OVERLAY,
    layoutTarget: 'global',
    isMagnetActive: true,

    setActiveVariation: (variation) => set((state) => {
        if (!variation) return { activeVariation: null };
        return {
            activeVariation: variation,
            // Sniper: Hidratação dos estados finos para sincronizar a UI com os dados da variação carregada
            imageSettings: (variation as any).imageSettings ?? state.imageSettings,
            layoutSettings: (variation as any).layoutSettings ?? state.layoutSettings,
            bgValue: (variation as any).bgValue ?? state.bgValue,
            bgOverlay: (variation as any).bgOverlay ?? state.bgOverlay,
        };
    }),
    setSlides: (slides) => set((state) => ({
        slides,
        currentSlideIndex: 0,
        activeVariation: state.activeVariation
            ? {
                ...state.activeVariation,
                postMode: slides.length > 0 ? 'carousel' : state.activeVariation.postMode,
                slides,
            }
            : null,
    })),
    setCurrentSlideIndex: (currentSlideIndex) => set({ currentSlideIndex }),
    updateSlide: (index, patch) => set((state) => {
        if (index < 0 || index >= state.slides.length) return state;
        const slides = [...state.slides];
        slides[index] = { ...slides[index], ...patch };
        return {
            slides,
            activeVariation: state.activeVariation
                ? { ...state.activeVariation, slides }
                : null,
        };
    }),
    setPostMode: (postMode) => set((state) => ({
        postMode,
        activeVariation: state.activeVariation
            ? { ...state.activeVariation, postMode }
            : null,
    })),
    setPlatform: (platform) => set({ platform }),
    setAspectRatio: (aspectRatio) => set({ aspectRatio }),

    updateImageSettings: (settings) => set((state) => ({
        imageSettings: { ...state.imageSettings, ...settings }
    })),
    updateLayoutSettings: (settings) => set((state) => ({
        layoutSettings: { ...state.layoutSettings, ...settings }
    })),
    setBgValue: (bgValue) => set({ bgValue }),
    setBgOverlay: (overlay) => set((state) => ({
        bgOverlay: { ...state.bgOverlay, ...overlay }
    })),
    setLayoutTarget: (layoutTarget) => set({ layoutTarget }),
    setMagnetActive: (isMagnetActive) => set({ isMagnetActive }),

    reset: () => set({
        activeVariation: null,
        postMode: 'static',
        slides: [],
        currentSlideIndex: 0,
        platform: 'instagram',
        aspectRatio: '1:1',
        imageSettings: DEFAULT_IMAGE_SETTINGS,
        layoutSettings: DEFAULT_LAYOUT_SETTINGS,
        bgValue: { type: 'none' },
        bgOverlay: DEFAULT_BG_OVERLAY,
        layoutTarget: 'global',
        isMagnetActive: true,
    })
}));
