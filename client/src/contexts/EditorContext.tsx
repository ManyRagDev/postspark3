/**
 * EditorContext - Estado global do editor PostSpark
 * 
 * Resolve a discrepância de dados entre HoloDeck → Workbench
 * Persiste configurações entre navegações
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import type { PostVariation, AspectRatio, Platform, BackgroundValue, BgOverlaySettings, PostMode } from '@shared/postspark';
import { PLATFORM_SPECS, PLATFORM_DEFAULT_RATIO, DEFAULT_BG_OVERLAY, CAROUSEL_SLIDE_RANGE } from '@shared/postspark';
import type { ImageSettings, AdvancedLayoutSettings, TextPosition, TextAlignment } from '@/types/editor';
import { DEFAULT_IMAGE_SETTINGS, DEFAULT_LAYOUT_SETTINGS } from '@/types/editor';
import type { ThemeConfig } from '@/lib/themes';

// ─── Slide Type (Carrossel) ────────────────────────────────────────────────────

export interface Slide {
  id: string;
  variation: PostVariation;
  imageSettings: ImageSettings;
  layoutSettings: AdvancedLayoutSettings;
  bgValue?: BackgroundValue;
  bgOverlay?: BgOverlaySettings;
}

// ─── Element Position (Drag-and-Drop) ──────────────────────────────────────────

export interface ElementPosition {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
}

export interface DraggableElement {
  id: string;
  type: 'headline' | 'body' | 'caption' | 'icon' | 'image';
  position: ElementPosition;
  width?: number;  // percentage
  height?: number; // percentage
  textAlign?: TextAlignment;
}

// ─── Editor State ──────────────────────────────────────────────────────────────

export interface EditorState {
  // Variação atual (do HoloDeck ou criação nova)
  variation: PostVariation | null;
  
  // Modo de post (estático ou carrossel)
  postMode: PostMode;
  
  // Slides para carrossel
  slides: Slide[];
  activeSlideIndex: number;
  
  // Configurações de imagem
  imageSettings: ImageSettings;
  
  // Configurações de layout
  layoutSettings: AdvancedLayoutSettings;
  
  // Background
  bgValue: BackgroundValue;
  bgOverlay: BgOverlaySettings;
  
  // Aspect Ratio
  aspectRatio: AspectRatio;
  
  // Platform
  platform: Platform;
  
  // Tema visual
  theme: ThemeConfig | null;
  
  // Legenda/Caption
  caption: string;
  showCaptionPreview: boolean;
  
  // Drag-and-Drop
  elements: DraggableElement[];
  snapToGrid: boolean;
  
  // Estado de carregamento
  isLoadingTemplate: boolean;
  hasUnsavedChanges: boolean;
}

// ─── Actions ───────────────────────────────────────────────────────────────────

type EditorAction =
  | { type: 'SET_VARIATION'; payload: PostVariation }
  | { type: 'UPDATE_VARIATION'; payload: Partial<PostVariation> }
  | { type: 'SET_IMAGE_SETTINGS'; payload: Partial<ImageSettings> }
  | { type: 'SET_LAYOUT_SETTINGS'; payload: Partial<AdvancedLayoutSettings> }
  | { type: 'SET_HEADLINE_POSITION'; payload: { position: TextPosition; textAlign?: TextAlignment } }
  | { type: 'SET_BODY_POSITION'; payload: { position: TextPosition; textAlign?: TextAlignment } }
  | { type: 'SET_BG_VALUE'; payload: BackgroundValue }
  | { type: 'SET_BG_OVERLAY'; payload: Partial<BgOverlaySettings> }
  | { type: 'SET_ASPECT_RATIO'; payload: AspectRatio }
  | { type: 'SET_PLATFORM'; payload: Platform }
  | { type: 'SET_THEME'; payload: ThemeConfig | null }
  | { type: 'SET_CAPTION'; payload: string }
  | { type: 'TOGGLE_CAPTION_PREVIEW' }
  | { type: 'ADD_SLIDE' }
  | { type: 'REMOVE_SLIDE'; payload: number }
  | { type: 'SET_ACTIVE_SLIDE'; payload: number }
  | { type: 'REORDER_SLIDES'; payload: { from: number; to: number } }
  | { type: 'UPDATE_SLIDE'; payload: { index: number; slide: Partial<Slide> } }
  | { type: 'SET_ELEMENT_POSITION'; payload: { id: string; position: ElementPosition } }
  | { type: 'TOGGLE_SNAP_TO_GRID' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'MARK_SAVED' }
  | { type: 'LOAD_TEMPLATE'; payload: Partial<EditorState> }
  | { type: 'RESET' };

// ─── Initial State ─────────────────────────────────────────────────────────────

const initialState: EditorState = {
  variation: null,
  postMode: 'static',
  slides: [],
  activeSlideIndex: 0,
  imageSettings: DEFAULT_IMAGE_SETTINGS,
  layoutSettings: DEFAULT_LAYOUT_SETTINGS,
  bgValue: { type: 'none' },
  bgOverlay: DEFAULT_BG_OVERLAY,
  aspectRatio: '1:1',
  platform: 'instagram',
  theme: null,
  caption: '',
  showCaptionPreview: true,
  elements: [],
  snapToGrid: true,
  isLoadingTemplate: false,
  hasUnsavedChanges: false,
};

// ─── Reducer ───────────────────────────────────────────────────────────────────

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_VARIATION':
      return {
        ...state,
        variation: action.payload,
        hasUnsavedChanges: true,
      };
      
    case 'UPDATE_VARIATION':
      if (!state.variation) return state;
      return {
        ...state,
        variation: { ...state.variation, ...action.payload },
        hasUnsavedChanges: true,
      };
      
    case 'SET_IMAGE_SETTINGS':
      return {
        ...state,
        imageSettings: { ...state.imageSettings, ...action.payload },
        hasUnsavedChanges: true,
      };
      
    case 'SET_LAYOUT_SETTINGS':
      return {
        ...state,
        layoutSettings: { ...state.layoutSettings, ...action.payload },
        hasUnsavedChanges: true,
      };
      
    case 'SET_HEADLINE_POSITION':
      return {
        ...state,
        layoutSettings: {
          ...state.layoutSettings,
          headline: {
            position: action.payload.position,
            textAlign: action.payload.textAlign ?? state.layoutSettings.headline.textAlign,
          },
        },
        hasUnsavedChanges: true,
      };
      
    case 'SET_BODY_POSITION':
      return {
        ...state,
        layoutSettings: {
          ...state.layoutSettings,
          body: {
            position: action.payload.position,
            textAlign: action.payload.textAlign ?? state.layoutSettings.body.textAlign,
          },
        },
        hasUnsavedChanges: true,
      };
      
    case 'SET_BG_VALUE':
      return {
        ...state,
        bgValue: action.payload,
        hasUnsavedChanges: true,
      };
      
    case 'SET_BG_OVERLAY':
      return {
        ...state,
        bgOverlay: { ...state.bgOverlay, ...action.payload },
        hasUnsavedChanges: true,
      };
      
    case 'SET_ASPECT_RATIO':
      return {
        ...state,
        aspectRatio: action.payload,
        hasUnsavedChanges: true,
      };
      
    case 'SET_PLATFORM':
      // Auto-adjust aspect ratio based on platform
      const platformDefaults: Record<Platform, AspectRatio> = {
        instagram: '1:1',
        twitter: '1:1',
        linkedin: '1:1',
        facebook: '1:1',
      };
      return {
        ...state,
        platform: action.payload,
        aspectRatio: platformDefaults[action.payload],
        hasUnsavedChanges: true,
      };
      
    case 'SET_THEME':
      return {
        ...state,
        theme: action.payload,
        hasUnsavedChanges: true,
      };
      
    case 'SET_CAPTION':
      const maxChars = state.variation ? PLATFORM_SPECS[state.variation.platform].maxChars : 2200;
      const truncatedCaption = action.payload.slice(0, maxChars);
      return {
        ...state,
        caption: truncatedCaption,
        hasUnsavedChanges: true,
      };
      
    case 'TOGGLE_CAPTION_PREVIEW':
      return {
        ...state,
        showCaptionPreview: !state.showCaptionPreview,
      };
      
    case 'ADD_SLIDE':
      const newSlide: Slide = {
        id: `slide-${Date.now()}`,
        variation: state.variation ? { ...state.variation, id: `var-${Date.now()}` } : {
          id: `var-${Date.now()}`,
          headline: '',
          body: '',
          caption: '',
          hashtags: [],
          callToAction: '',
          tone: 'neutral',
          platform: state.platform,
          imagePrompt: '',
          backgroundColor: '#1a1a2e',
          textColor: '#ffffff',
          accentColor: '#a855f7',
          layout: 'centered',
        },
        imageSettings: DEFAULT_IMAGE_SETTINGS,
        layoutSettings: DEFAULT_LAYOUT_SETTINGS,
      };
      return {
        ...state,
        slides: [...state.slides, newSlide],
        activeSlideIndex: state.slides.length,
        hasUnsavedChanges: true,
      };
      
    case 'REMOVE_SLIDE':
      if (state.slides.length <= 1) return state;
      const newSlides = state.slides.filter((_, i) => i !== action.payload);
      return {
        ...state,
        slides: newSlides,
        activeSlideIndex: Math.min(state.activeSlideIndex, newSlides.length - 1),
        hasUnsavedChanges: true,
      };
      
    case 'SET_ACTIVE_SLIDE':
      return {
        ...state,
        activeSlideIndex: action.payload,
      };
      
    case 'REORDER_SLIDES':
      const { from, to } = action.payload;
      const reordered = [...state.slides];
      const [removed] = reordered.splice(from, 1);
      reordered.splice(to, 0, removed);
      return {
        ...state,
        slides: reordered,
        activeSlideIndex: to,
        hasUnsavedChanges: true,
      };
      
    case 'UPDATE_SLIDE':
      const updatedSlides = [...state.slides];
      updatedSlides[action.payload.index] = {
        ...updatedSlides[action.payload.index],
        ...action.payload.slide,
      };
      return {
        ...state,
        slides: updatedSlides,
        hasUnsavedChanges: true,
      };
      
    case 'SET_ELEMENT_POSITION':
      return {
        ...state,
        elements: state.elements.map((el) =>
          el.id === action.payload.id
            ? { ...el, position: action.payload.position }
            : el
        ),
        hasUnsavedChanges: true,
      };
      
    case 'TOGGLE_SNAP_TO_GRID':
      return {
        ...state,
        snapToGrid: !state.snapToGrid,
      };
      
    case 'SET_LOADING':
      return {
        ...state,
        isLoadingTemplate: action.payload,
      };
      
    case 'MARK_SAVED':
      return {
        ...state,
        hasUnsavedChanges: false,
      };
      
    case 'LOAD_TEMPLATE':
      return {
        ...state,
        ...action.payload,
        isLoadingTemplate: false,
      };
      
    case 'RESET':
      return initialState;
      
    default:
      return state;
  }
}

// ─── Context ───────────────────────────────────────────────────────────────────

interface EditorContextValue {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  
  // Convenience methods
  setVariation: (variation: PostVariation) => void;
  updateVariation: (partial: Partial<PostVariation>) => void;
  setImageSetting: <K extends keyof ImageSettings>(key: K, value: ImageSettings[K]) => void;
  setLayoutSetting: (partial: Partial<AdvancedLayoutSettings>) => void;
  setHeadlinePosition: (position: TextPosition) => void;
  setBodyPosition: (position: TextPosition) => void;
  setAspectRatio: (ratio: AspectRatio) => void;
  setPlatform: (platform: Platform) => void;
  setCaption: (caption: string) => void;
  toggleCaptionPreview: () => void;
  toggleSnapToGrid: () => void;
  addSlide: () => void;
  removeSlide: (index: number) => void;
  setActiveSlide: (index: number) => void;
  
  // Getters
  getCaptionCharCount: () => { current: number; max: number };
  getCurrentSlide: () => Slide | null;
}

const EditorContext = createContext<EditorContextValue | null>(null);

// ─── Provider ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'postspark-editor-state';

interface EditorProviderProps {
  children: React.ReactNode;
  persistToStorage?: boolean;
}

export function EditorProvider({ children, persistToStorage = true }: EditorProviderProps) {
  // Load from localStorage on init
  const getInitialState = useCallback((): EditorState => {
    if (!persistToStorage) return initialState;
    
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Don't restore loading state
        return { ...parsed, isLoadingTemplate: false };
      }
    } catch (e) {
      console.warn('Failed to load editor state from storage:', e);
    }
    return initialState;
  }, [persistToStorage]);
  
  const [state, dispatch] = useReducer(editorReducer, null, getInitialState);
  
  // Persist to localStorage
  useEffect(() => {
    if (persistToStorage && state.hasUnsavedChanges) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        console.warn('Failed to save editor state:', e);
      }
    }
  }, [state, persistToStorage]);
  
  // Convenience methods
  const setVariation = useCallback((variation: PostVariation) => {
    dispatch({ type: 'SET_VARIATION', payload: variation });
  }, []);
  
  const updateVariation = useCallback((partial: Partial<PostVariation>) => {
    dispatch({ type: 'UPDATE_VARIATION', payload: partial });
  }, []);
  
  const setImageSetting = useCallback(<K extends keyof ImageSettings>(key: K, value: ImageSettings[K]) => {
    dispatch({ type: 'SET_IMAGE_SETTINGS', payload: { [key]: value } });
  }, []);
  
  const setLayoutSetting = useCallback((partial: Partial<AdvancedLayoutSettings>) => {
    dispatch({ type: 'SET_LAYOUT_SETTINGS', payload: partial });
  }, []);
  
  const setHeadlinePosition = useCallback((position: TextPosition) => {
    dispatch({ type: 'SET_HEADLINE_POSITION', payload: { position } });
  }, []);
  
  const setBodyPosition = useCallback((position: TextPosition) => {
    dispatch({ type: 'SET_BODY_POSITION', payload: { position } });
  }, []);
  
  const setAspectRatio = useCallback((ratio: AspectRatio) => {
    dispatch({ type: 'SET_ASPECT_RATIO', payload: ratio });
  }, []);
  
  const setPlatform = useCallback((platform: Platform) => {
    dispatch({ type: 'SET_PLATFORM', payload: platform });
  }, []);
  
  const setCaption = useCallback((caption: string) => {
    dispatch({ type: 'SET_CAPTION', payload: caption });
  }, []);
  
  const toggleCaptionPreview = useCallback(() => {
    dispatch({ type: 'TOGGLE_CAPTION_PREVIEW' });
  }, []);
  
  const toggleSnapToGrid = useCallback(() => {
    dispatch({ type: 'TOGGLE_SNAP_TO_GRID' });
  }, []);
  
  const addSlide = useCallback(() => {
    dispatch({ type: 'ADD_SLIDE' });
  }, []);
  
  const removeSlide = useCallback((index: number) => {
    dispatch({ type: 'REMOVE_SLIDE', payload: index });
  }, []);
  
  const setActiveSlide = useCallback((index: number) => {
    dispatch({ type: 'SET_ACTIVE_SLIDE', payload: index });
  }, []);
  
  // Getters
  const getCaptionCharCount = useCallback(() => {
    const max = state.variation ? PLATFORM_SPECS[state.variation.platform].maxChars : 2200;
    return { current: state.caption.length, max };
  }, [state.variation, state.caption]);
  
  const getCurrentSlide = useCallback(() => {
    if (state.slides.length === 0) return null;
    return state.slides[state.activeSlideIndex] || null;
  }, [state.slides, state.activeSlideIndex]);
  
  const value: EditorContextValue = {
    state,
    dispatch,
    setVariation,
    updateVariation,
    setImageSetting,
    setLayoutSetting,
    setHeadlinePosition,
    setBodyPosition,
    setAspectRatio,
    setPlatform,
    setCaption,
    toggleCaptionPreview,
    toggleSnapToGrid,
    addSlide,
    removeSlide,
    setActiveSlide,
    getCaptionCharCount,
    getCurrentSlide,
  };
  
  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditor must be used within an EditorProvider');
  }
  return context;
}

export default EditorContext;