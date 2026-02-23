/**
 * WorkbenchRefactored - Workbench com Sidebar Colapsável
 * 
 * Desktop: [Collapsible Sidebar | Canvas | Quick Actions Panel]
 * Mobile: ArcDrawer com bottom sheet
 * 
 * UX Melhorada: Controles expandidos no mesmo lugar, sem ping-pong de navegação
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Download,
  Copy,
  Check,
  Loader2,
  Save,
  Type,
  Palette,
  ImagePlus,
  Layout,
  Sparkles,
  Plus,
  ChevronLeft,
  ChevronRight,
  Magnet,
  Eye,
  EyeOff,
  Grid3X3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trash2,
  Layers,
  RotateCcw,
} from 'lucide-react';
import type { PostVariation, Platform, AspectRatio, PostMode, FormatOptimization } from '@shared/postspark';
import { ASPECT_RATIO_LABELS, PLATFORM_SPECS, PLATFORM_ASPECT_RATIOS, CAROUSEL_SLIDE_RANGE } from '@shared/postspark';
import { useControlMode } from '@/hooks/useControlMode';
import { useArcDrawer, type TabId } from '@/hooks/useArcDrawer';
import type { ImageSettings, AdvancedLayoutSettings, TextPosition, TextAlignment } from '@/types/editor';
import { DEFAULT_IMAGE_SETTINGS } from '@/types/editor';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { AdvancedModeToggle } from '@/components/ui/AdvancedModeToggle';
import { PrecisionSlider } from '@/components/ui/PrecisionSlider';
import { CaptionPreview } from '@/components/ui/CaptionPreview';
import { BackgroundGallery } from '@/components/ui/BackgroundGallery';
import { TextFitIndicator } from '@/components/ui/TextFitIndicator';
import MagnetToggle from '@/components/MagnetToggle';
import DraggableCardOverlay from '@/components/DraggableCardOverlay';
import PostCard from '@/components/PostCard';
import RatioIcon from '@/components/RatioIcon';
import OrganicBackground from '@/components/OrganicBackground';
import MobileEditSheet from '@/components/MobileEditSheet';
import { useIsMobile } from '@/hooks/useMobile';
import { useEditor } from '@/contexts/EditorContext';
import type { ThemeConfig } from '@/lib/themes';
import type { LayoutPosition } from '@/types/editor';

// --- TextCanvas Imports ---
import { AdvancedTextPropertyBar } from '@/components/ui/AdvancedTextPropertyBar';
import { AdvancedTextSidebar } from '@/components/ui/AdvancedTextSidebar';
import type { AdvancedTextElement } from '@/components/canvas/AdvancedTextNode';

// --- Design Rules Imports ---
import { validateDesignChecklist, type DesignCheckItem } from '@/lib/designRules';
const RATIOS: AspectRatio[] = ['1:1', '5:6', '9:16'];
const PLATFORMS: Platform[] = ['instagram', 'twitter', 'linkedin', 'facebook'];

// ─── Design Checklist Panel ───────────────────────────────────────────────────

function DesignChecklistPanel({
  variation,
  aspectRatio,
  accentColor,
}: {
  variation: PostVariation;
  aspectRatio: AspectRatio;
  accentColor: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const items = validateDesignChecklist(variation, aspectRatio);

  const errorCount = items.filter((i: DesignCheckItem) => i.severity === 'error').length;
  const warnCount = items.filter((i: DesignCheckItem) => i.severity === 'warn').length;
  const okCount = items.filter((i: DesignCheckItem) => i.severity === 'ok').length;

  const badgeColor =
    errorCount > 0 ? '#ef4444' : warnCount > 0 ? '#f59e0b' : '#22c55e';
  const badgeLabel =
    errorCount > 0 ? `${errorCount} erro${errorCount > 1 ? 's' : ''}` :
      warnCount > 0 ? `${warnCount} aviso${warnCount > 1 ? 's' : ''}` :
        `${okCount} OK`;

  const severityIcon = (s: DesignCheckItem['severity']) =>
    s === 'ok' ? '✓' : s === 'warn' ? '⚠' : '✗';
  const severityColor = (s: DesignCheckItem['severity']) =>
    s === 'ok' ? '#22c55e' : s === 'warn' ? '#f59e0b' : '#ef4444';

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--bg-void)', border: '1px solid rgba(255, 255, 255, 0.06)' }}
    >
      <button
        onClick={() => setIsOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">
            Checklist de Design
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: `${badgeColor}20`, color: badgeColor }}
          >
            {badgeLabel}
          </span>
          <span className="text-[10px] text-[var(--text-tertiary)]">{isOpen ? '▲' : '▼'}</span>
        </div>
      </button>

      {isOpen && (
        <div className="px-3 pb-3 space-y-2">
          {items.map((item: DesignCheckItem) => (
            <div key={item.id} className="flex items-start gap-2">
              <span
                className="text-[11px] font-bold mt-0.5 shrink-0"
                style={{ color: severityColor(item.severity) }}
              >
                {severityIcon(item.severity)}
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-[var(--text-secondary)] leading-tight">
                  {item.label}
                  {item.value && (
                    <span
                      className="ml-1 font-mono text-[9px] px-1 rounded"
                      style={{ background: `${accentColor}15`, color: accentColor }}
                    >
                      {item.value}
                    </span>
                  )}
                </div>
                <div className="text-[9px] text-[var(--text-tertiary)] leading-tight mt-0.5">
                  {item.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Converte o layout visual de uma variation para AdvancedLayoutSettings equivalente.
 * Usa APENAS `position` (named) + `textAlign` — SEM freePosition nos presets.
 *
 * Regra: cada elemento (accentBar, headline, body) recebe uma posição DISTINTA
 * para evitar sobreposição visual quando renderizados com absolute positioning.
 *
 * freePosition só é definido quando o usuário arrasta no modo Arquiteto.
 */
function layoutToAdvanced(layout: string | undefined): AdvancedLayoutSettings {
  switch (layout) {
    case 'centered':
      return {
        // Barrinha topo | Headline centro | Corpo base
        headline: { position: 'center', textAlign: 'center' },
        body: { position: 'bottom-center', textAlign: 'center' },
        accentBar: { position: 'top-center', textAlign: 'center', width: 10 },
        padding: 24,
      };
    case 'split':
      return {
        // Barrinha topo | Headline meio-esq | Corpo base-esq
        headline: { position: 'center-left', textAlign: 'left' },
        body: { position: 'bottom-left', textAlign: 'left' },
        accentBar: { position: 'top-left', textAlign: 'left', width: 10 },
        padding: 24,
      };
    case 'minimal':
      return {
        // Só headline no centro (sem barrinha por padrão)
        headline: { position: 'center', textAlign: 'center' },
        body: { position: 'bottom-center', textAlign: 'center' },
        accentBar: { position: 'top-center', textAlign: 'center', width: 15 },
        padding: 24,
      };
    case 'left-aligned':
    default:
      return {
        // Barrinha topo | Headline meio-esq | Corpo base-esq
        headline: { position: 'center-left', textAlign: 'left' },
        body: { position: 'bottom-left', textAlign: 'left' },
        accentBar: { position: 'top-left', textAlign: 'left', width: 10 },
        padding: 24,
      };
  }
}



// Grid 3×3 para snap de texto (espelha o DraggableCardOverlay)
const GRID_POSITIONS_WB = [
  { position: 'top-left' as const, cx: 10, cy: 10 },
  { position: 'top-center' as const, cx: 50, cy: 10 },
  { position: 'top-right' as const, cx: 90, cy: 10 },
  { position: 'center-left' as const, cx: 10, cy: 50 },
  { position: 'center' as const, cx: 50, cy: 50 },
  { position: 'center-right' as const, cx: 90, cy: 50 },
  { position: 'bottom-left' as const, cx: 10, cy: 90 },
  { position: 'bottom-center' as const, cx: 50, cy: 90 },
  { position: 'bottom-right' as const, cx: 90, cy: 90 },
] as const;

interface WorkbenchRefactoredProps {
  variation: PostVariation;
  initialTheme?: ThemeConfig;
  initialAspectRatio?: AspectRatio;
  postMode?: PostMode;
  slides?: PostVariation[];
  onBack: () => void;
  onSave: (variation: PostVariation) => void;
  onGenerateImage: (prompt: string, provider: 'pollinations' | 'gemini') => Promise<string>;
  isSaving: boolean;
}

export default function WorkbenchRefactored({
  variation: initialVariation,
  initialTheme,
  initialAspectRatio,
  postMode = 'static',
  slides: initialSlides,
  onBack,
  onSave,
  onGenerateImage,
  isSaving,
}: WorkbenchRefactoredProps) {
  const isMobile = useIsMobile();
  const canvasRef = useRef<HTMLDivElement>(null);

  // Editor Context (estado global)
  const editor = useEditor();

  // Estados
  // Ao inicializar, mesclamos as cores do initialTheme na variation para garantir que:
  // 1. Os inputs do Workbench mostrem as cores corretas do tema selecionado
  // 2. O PostCard reflita as edições do usuário (via forceVariationColors)
  const [variation, setVariation] = useState<PostVariation>(() => {
    if (initialTheme) {
      return {
        ...structuredClone(initialVariation),
        backgroundColor: initialTheme.colors.bg,
        textColor: initialTheme.colors.text,
        accentColor: initialTheme.colors.accent,
      };
    }
    return structuredClone(initialVariation);
  });
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(
    initialAspectRatio ?? initialVariation.aspectRatio ?? '1:1'
  );
  // Tema vindo do HoloDeck (pode ser sobrescrito pelo usuário no workbench)
  const [activeTheme, setActiveTheme] = useState<ThemeConfig | undefined>(initialTheme);
  const [expandedSection, setExpandedSection] = useState<TabId | null>('text');
  const [copied, setCopied] = useState(false);
  const [isGeneratingImg, setIsGeneratingImg] = useState(false);
  const [imageProvider, setImageProvider] = useState<'pollinations' | 'gemini'>('gemini');

  // Estado de legenda
  const [caption, setCaption] = useState(initialVariation.caption || '');
  const [showCaptionPreview, setShowCaptionPreview] = useState(true);

  // Estado de snap-to-grid (ímã)
  const [snapToGrid, setSnapToGrid] = useState(true);

  // --- TextCanvas State ---
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);

  // Escopo de aplicação de background (somente atual ou todos)
  const [bgScope, setBgScope] = useState<'current' | 'all'>('current');

  // Escopo da cor de texto: ambos (textColor), só título (headlineColor) ou só corpo (bodyColor)
  const [textColorScope, setTextColorScope] = useState<'both' | 'headline' | 'body'>('both');

  // Escopo do tamanho de texto: título (headlineFontSize) ou corpo (bodyFontSize)
  const [textSizeScope, setTextSizeScope] = useState<'headline' | 'body'>('headline');

  // Estado de slides (carrossel)
  // Aplicamos as cores do initialTheme em todos os slides para consistência visual
  const [slides, setSlides] = useState<PostVariation[]>(() => {
    const baseSlides = initialSlides && initialSlides.length > 0 ? initialSlides : [structuredClone(initialVariation)];
    if (!initialTheme) return baseSlides.map(s => structuredClone(s));
    return baseSlides.map(slide => ({
      ...structuredClone(slide),
      backgroundColor: initialTheme.colors.bg,
      textColor: initialTheme.colors.text,
      accentColor: initialTheme.colors.accent,
    }));
  });
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);

  // Derivar se é carrossel
  const isCarousel = postMode === 'carousel' || slides.length > 1;

  // ========== CONTROLES DE CARROSSEL ==========

  const goToSlide = useCallback((index: number) => {
    if (index >= 0 && index < slides.length) {
      setActiveSlideIndex(index);
      setVariation(slides[index]);
    }
  }, [slides]);

  const goToPrevSlide = useCallback(() => {
    const newIndex = activeSlideIndex > 0 ? activeSlideIndex - 1 : slides.length - 1;
    goToSlide(newIndex);
  }, [activeSlideIndex, slides.length, goToSlide]);

  const goToNextSlide = useCallback(() => {
    const newIndex = activeSlideIndex < slides.length - 1 ? activeSlideIndex + 1 : 0;
    goToSlide(newIndex);
  }, [activeSlideIndex, slides.length, goToSlide]);

  const addSlide = useCallback(() => {
    if (slides.length >= CAROUSEL_SLIDE_RANGE.max) return;
    const newSlide: PostVariation = {
      ...variation,
      id: `slide-${Date.now()}`,
      headline: '',
      body: '',
    };
    const newSlides = [...slides, newSlide];
    setSlides(newSlides);
    goToSlide(newSlides.length - 1);
  }, [slides, variation, goToSlide]);

  const removeSlide = useCallback((index: number) => {
    if (slides.length <= 1) return;
    const newSlides = slides.filter((_, i) => i !== index);
    setSlides(newSlides);
    if (activeSlideIndex >= newSlides.length) {
      goToSlide(newSlides.length - 1);
    }
  }, [slides, activeSlideIndex, goToSlide]);

  const updateCurrentSlide = useCallback((partial: Partial<PostVariation>) => {
    const newSlides = [...slides];

    // Lista de propriedades que podem ser aplicadas a todos os slides se bgScope for 'all'
    const bgProps: (keyof PostVariation)[] = ['backgroundColor', 'textColor', 'accentColor', 'imageUrl', 'imagePrompt'];
    const hasBgProp = Object.keys(partial).some(k => bgProps.includes(k as keyof PostVariation));

    if (isCarousel && bgScope === 'all' && hasBgProp) {
      // Aplicar a todos os slides
      newSlides.forEach((s, i) => {
        newSlides[i] = { ...s, ...partial };
      });
    } else {
      // Aplicar apenas ao atual
      newSlides[activeSlideIndex] = { ...newSlides[activeSlideIndex], ...partial };
    }

    setSlides(newSlides);
    setVariation(newSlides[activeSlideIndex]);
  }, [slides, activeSlideIndex, bgScope, isCarousel]);

  // Modo Global (Captain/Architect)
  const { mode, setMode, isArchitect } = useControlMode();

  // Image & Layout Settings
  const [imageSettings, setImageSettings] = useState<ImageSettings>(DEFAULT_IMAGE_SETTINGS);
  // FIX: inicializa layoutSettings a partir do layout atual da variation (não dos defaults genéricos)
  const [layoutSettings, setLayoutSettings] = useState<AdvancedLayoutSettings>(() => layoutToAdvanced(initialVariation.layout));
  const [layoutTarget, setLayoutTarget] = useState<'headline' | 'body' | 'accentBar'>('headline');
  const [activeImageSource, setActiveImageSource] = useState<'none' | 'ai' | 'gallery' | 'upload' | 'color'>('ai');

  // Track se o usuário modificou as configurações avançadas de layout
  // Só aplicamos advancedLayout ao PostCard se o usuário tiver feito alterações
  const [hasCustomLayout, setHasCustomLayout] = useState(false);

  // Otimização Multi-Formato (IA)
  const [showOptimizationHint, setShowOptimizationHint] = useState(false);
  const [pendingOptimization, setPendingOptimization] = useState<FormatOptimization | null>(null);

  // Mobile Drawer
  const arcDrawer = useArcDrawer();

  // Efeito para sincronizar com EditorContext
  useEffect(() => {
    editor.setVariation(variation);
  }, [variation]);

  // Ao mudar o layout da variation externamente (ex: otimização de IA), sincronizar layoutSettings
  // mas apenas se o usuário não tiver feito customizações manuais.
  useEffect(() => {
    if (!hasCustomLayout) {
      setLayoutSettings(layoutToAdvanced(variation.layout));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variation.layout]);

  // Efeito para atualizar aspect ratio quando plataforma muda
  useEffect(() => {
    const platformRatios = PLATFORM_ASPECT_RATIOS[variation.platform];
    if (platformRatios && !platformRatios.includes(aspectRatio)) {
      setAspectRatio(platformRatios[0]);
    }
  }, [variation.platform, aspectRatio]);

  /* 
    CRITICAL FIX: 
    updateVariation must sync with updateCurrentSlide to ensure changes persist in the slides array.
    Previously, it only updated the local 'variation' state, which got overwritten when switching slides.
  */
  const updateVariation = useCallback((partial: Partial<PostVariation>) => {
    updateCurrentSlide(partial);
  }, [updateCurrentSlide]);

  // Aplica uma otimização sugerida pela IA para um formato específico
  const applyOptimization = useCallback((opt: FormatOptimization) => {
    updateVariation({
      layout: opt.layout,
      backgroundColor: opt.backgroundColor,
      textColor: opt.textColor,
      accentColor: opt.accentColor,
      headlineFontSize: opt.headlineFontSize,
      bodyFontSize: opt.bodyFontSize,
    });
    setShowOptimizationHint(false);
    setPendingOptimization(null);
  }, [updateVariation]);

  // Handler para atualizar posição de um elemento via drag (DraggableCardOverlay / legacy)
  const handleDragPositionChange = useCallback(
    (target: 'headline' | 'body' | 'accentBar', partial: Partial<LayoutPosition>) => {
      setHasCustomLayout(true);
      setLayoutSettings((prev) => ({
        ...prev,
        [target]: { ...prev[target], ...partial },
      }));
    },
    []
  );

  // Handler para drag direto no texto (PostCard → onDragPosition)
  // Recebe posição em % e atualiza LayoutPosition: em modo snap encaixa na célula mais próxima,
  // em modo livre salva como freePosition.
  const handleDragPositionFromCard = useCallback(
    (target: 'headline' | 'body' | 'accentBar', x: number, y: number) => {
      setHasCustomLayout(true);
      if (snapToGrid) {
        // Encaixar na célula mais próxima
        const best = GRID_POSITIONS_WB.reduce((b, cell) => {
          const d = Math.hypot(x - cell.cx, y - cell.cy);
          const bd = Math.hypot(x - b.cx, y - b.cy);
          return d < bd ? cell : b;
        }, GRID_POSITIONS_WB[0]);
        setLayoutSettings((prev) => ({
          ...prev,
          [target]: { ...prev[target], position: best.position, freePosition: undefined },
        }));
      } else {
        // Posição livre em %
        setLayoutSettings((prev) => ({
          ...prev,
          [target]: { ...prev[target], freePosition: { x, y } },
        }));
      }
    },
    [snapToGrid]
  );

  // Reseta o layout para o padrão equivalente ao layout visual da variation atual
  const handleResetLayout = useCallback(() => {
    setLayoutSettings(layoutToAdvanced(variation.layout));
    // mantém hasCustomLayout = true para que o overlay continue visível no modo Arquiteto
  }, [variation.layout]);

  // Handler para resize das alças de texto (PostCard → onResizeBlock)
  // Salva a nova largura em % no LayoutPosition correspondente
  const handleResizeBlock = useCallback(
    (target: 'headline' | 'body' | 'accentBar', width: number) => {
      setHasCustomLayout(true);
      setLayoutSettings((prev) => ({
        ...prev,
        [target]: { ...prev[target], width },
      }));
    },
    []
  );

  const updateImageSetting = useCallback(<K extends keyof ImageSettings>(
    key: K,
    value: ImageSettings[K]
  ) => {
    setImageSettings((prev) => {
      const newSettings = { ...prev, [key]: value };

      if (isCarousel && bgScope === 'all') {
        // Sincronizar estas configurações com todos os slides mantendo o estado do editor consistente
        // Nota: No WorkbenchRefactored o imageSettings é um estado local que afeta o PostCard.
        // Para carrosséis, idealmente isso deveria refletir no objeto de cada slide se quisermos salvar individualmente.
        // Por enquanto, o editor usa um único imageSettings para a visualização, mas ao salvar, precisaremos garantir
        // que essas definições sejam propagadas ou tratadas globalmente.
      }

      return newSettings;
    });
  }, [isCarousel, bgScope]);

  const handleCopyText = useCallback(() => {
    const text = [
      variation.headline,
      '',
      variation.body,
      '',
      variation.hashtags.map((h) => `#${h.replace('#', '')}`).join(' '),
      variation.callToAction,
    ]
      .filter(Boolean)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [variation]);

  const handleGenerateImage = useCallback(async () => {
    const isBulk = isCarousel && bgScope === 'all';

    if (isBulk) {
      const confirm = window.confirm(
        `Atenção: Você está gerando imagens para TODOS os ${slides.length} slides. Isso consumirá ${slides.length} créditos de geração. Deseja continuar?`
      );
      if (!confirm) return;
    }

    setIsGeneratingImg(true);
    try {
      if (isBulk) {
        // Geração em lote
        const updatedSlides = [...slides];
        for (let i = 0; i < updatedSlides.length; i++) {
          const url = await onGenerateImage(updatedSlides[i].imagePrompt || variation.imagePrompt, imageProvider);
          if (url) {
            updatedSlides[i] = { ...updatedSlides[i], imageUrl: url };
          }
        }
        setSlides(updatedSlides);
        setVariation(updatedSlides[activeSlideIndex]);
      } else {
        // Geração individual
        const url = await onGenerateImage(variation.imagePrompt, imageProvider);
        if (url) updateCurrentSlide({ imageUrl: url });
      }
    } finally {
      setIsGeneratingImg(false);
    }
  }, [variation.imagePrompt, onGenerateImage, updateCurrentSlide, isCarousel, bgScope, slides, activeSlideIndex, imageProvider]);

  const handleExport = useCallback(async () => {
    if (!canvasRef.current) return;
    try {
      const { default: html2canvas } = await import('html2canvas-pro');
      const canvas = await html2canvas(canvasRef.current, {
        scale: 2,
        backgroundColor: null,
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `postspark-${variation.platform}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Export failed:', err);
    }
  }, [variation.platform]);

  const accentColor = variation.accentColor || '#a855f7';

  // Toggle seção expandida - permite recolher ao clicar novamente
  const toggleSection = useCallback((sectionId: TabId) => {
    setExpandedSection((prev) => (prev === sectionId ? null : sectionId));
  }, []);

  // ========== SEÇÕES DE CONTROLE ==========

  const renderTextSection = () => (
    <div className="space-y-3">
      {/* Plataforma */}
      <div>
        <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block">
          Plataforma
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {PLATFORMS.map((p) => {
            const spec = PLATFORM_SPECS[p];
            const isActive = variation.platform === p;
            return (
              <button
                key={p}
                onClick={() => updateVariation({ platform: p })}
                className="flex flex-col items-start px-3 py-2 rounded-lg text-left transition-all"
                style={{
                  background: isActive ? `${accentColor}15` : 'rgba(255, 255, 255, 0.03)',
                  border: `1px solid ${isActive ? `${accentColor}40` : 'rgba(255, 255, 255, 0.06)'}`,
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{spec.icon}</span>
                  <span
                    className="text-[11px] font-medium"
                    style={{ color: isActive ? accentColor : 'var(--text-secondary)' }}
                  >
                    {spec.label}
                  </span>
                </div>
                <span className="text-[9px] text-[var(--text-tertiary)] mt-0.5">
                  {spec.description}
                </span>
                <span className="text-[8px] font-mono text-[var(--text-tertiary)] mt-0.5">
                  {spec.width}×{spec.height} · {spec.maxChars} chars
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Título */}
      <div>
        <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block">
          Título
          {variation.headline && (
            <span className="ml-2 normal-case">{variation.headline.length} caracteres</span>
          )}
        </label>
        <input
          type="text"
          value={variation.headline}
          onChange={(e) => updateVariation({ headline: e.target.value })}
          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all"
          style={{
            background: 'var(--bg-void)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: 'var(--text-primary)',
          }}
          placeholder="Digite o título..."
        />
      </div>

      {/* Corpo */}
      <div>
        <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block">
          Corpo
        </label>
        <textarea
          value={variation.body}
          onChange={(e) => updateVariation({ body: e.target.value })}
          rows={3}
          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none transition-all"
          style={{
            background: 'var(--bg-void)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: 'var(--text-primary)',
          }}
          placeholder="Digite o conteúdo..."
        />
      </div>

      {/* Legenda/Caption */}
      <div>
        <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 flex items-center justify-between">
          <span>Legenda</span>
          <span className="font-mono normal-case">
            {caption.length}/{PLATFORM_SPECS[variation.platform].maxChars}
          </span>
        </label>
        <textarea
          value={caption}
          onChange={(e) => {
            const maxChars = PLATFORM_SPECS[variation.platform].maxChars;
            const newCaption = e.target.value.slice(0, maxChars);
            setCaption(newCaption);
            updateVariation({ caption: newCaption });
          }}
          rows={4}
          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none transition-all"
          style={{
            background: 'var(--bg-void)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: 'var(--text-primary)',
          }}
          placeholder="Digite a legenda para o post..."
        />

        {/* Preview da Legenda */}
        <CaptionPreview
          caption={caption}
          hashtags={variation.hashtags}
          platform={variation.platform}
          showPreview={showCaptionPreview}
          onTogglePreview={() => setShowCaptionPreview(!showCaptionPreview)}
          accentColor={accentColor}
        />
      </div>

      {/* Botão Otimizar com IA */}
      <button
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all"
        style={{
          background: 'rgba(212, 175, 55, 0.1)',
          color: '#d4af37',
          border: '1px solid rgba(212, 175, 55, 0.2)',
        }}
      >
        <Sparkles size={10} />
        Otimizar com IA
      </button>

      {/* Campos Avançados (Architect) */}
      <AnimatePresence>
        {isArchitect && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 overflow-hidden"
          >
            <div>
              <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block">
                Hashtags
              </label>
              <input
                type="text"
                value={variation.hashtags.join(', ')}
                onChange={(e) =>
                  updateVariation({
                    hashtags: e.target.value.split(/[,\s]+/).map((h) => h.trim()).filter(Boolean),
                  })
                }
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{
                  background: 'var(--bg-void)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: 'var(--text-primary)',
                }}
                placeholder="#marketing, #socialmedia"
              />
            </div>

            <div>
              <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block">
                CTA
              </label>
              <input
                type="text"
                value={variation.callToAction}
                onChange={(e) => updateVariation({ callToAction: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{
                  background: 'var(--bg-void)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: 'var(--text-primary)',
                }}
                placeholder="Clique no link da bio..."
              />
            </div>

            <div>
              <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block">
                Tom
              </label>
              <div
                className="px-3 py-2 rounded-xl"
                style={{
                  background: 'var(--bg-void)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <span className="text-xs" style={{ color: accentColor }}>
                  {variation.tone || 'Neutro'}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Architect 2.0 Text Properties */}
      <AnimatePresence>
        {isArchitect && selectedTextId && variation.textElements && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="pt-4 border-t border-white/10"
          >
            <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Sparkles size={12} className="text-[#a855f7]" />
              Edição Livre
            </div>
            {(() => {
              const selectedEl = variation.textElements.find(el => el.id === selectedTextId);
              if (!selectedEl) return null;

              const handlePropertyChange = (prop: string, val: string) => {
                const newElements = variation.textElements!.map(el =>
                  el.id === selectedTextId
                    ? { ...el, styles: { ...el.styles, [prop]: val } }
                    : el
                );
                updateVariation({ textElements: newElements });
              };

              return (
                <AdvancedTextPropertyBar
                  styles={selectedEl.styles}
                  onChange={handlePropertyChange}
                  accentColor={accentColor}
                />
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  // ========== COMPONENTES DE UI AUXILIARES ==========

  const renderBgScopeSelector = () => {
    if (!isCarousel) return null;
    return (
      <div className="flex p-0.5 mb-4 rounded-lg bg-white/5 border border-white/10">
        {[
          { id: 'current', label: 'Slide Atual', icon: <Plus size={12} /> },
          { id: 'all', label: 'Todos os Slides', icon: <Layers size={12} /> },
        ].map((opt) => (
          <button
            key={opt.id}
            onClick={() => setBgScope(opt.id as 'current' | 'all')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-medium transition-all ${bgScope === opt.id
              ? 'bg-white/10 text-white shadow-sm'
              : 'text-white/40 hover:text-white/60'
              }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>
    );
  };

  const renderDesignSection = () => (
    <div className="space-y-3">
      {renderBgScopeSelector()}
      <div>
        <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block">
          Cor de Fundo
        </label>
        <div className="grid grid-cols-4 gap-2">
          {['#0a0a1a', '#1a1a2e', '#16213e', '#0f3460', '#2d132c', '#FF5F1F', '#06B6D4', '#8B5CF6'].map((color) => (
            <button
              key={color}
              onClick={() => updateVariation({ backgroundColor: color })}
              className="w-full aspect-square min-h-[44px] rounded-lg transition-all"
              style={{
                background: color,
                border: variation.backgroundColor === color ? `2px solid ${accentColor}` : '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: variation.backgroundColor === color ? `0 0 8px ${accentColor}40` : 'none',
              }}
            />
          ))}
        </div>
      </div>

      <div>
        <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block">
          Prévia
        </label>
        <div
          className="h-12 rounded-xl flex items-center justify-center gap-3 px-3"
          style={{ background: variation.backgroundColor }}
        >
          <span
            className="text-sm font-bold"
            style={{ color: variation.headlineColor ?? variation.textColor }}
          >
            T
          </span>
          <span
            className="text-xs opacity-80"
            style={{ color: variation.bodyColor ?? variation.textColor }}
          >
            Aa
          </span>
        </div>
      </div>

      {/* Cor do Texto — sempre visível */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">
            Cor do Texto
          </label>
          {/* Seletor de escopo: Título / Corpo / Ambos */}
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            {(['both', 'headline', 'body'] as const).map((scope) => (
              <button
                key={scope}
                onClick={() => setTextColorScope(scope)}
                className="flex-1 py-1.5 min-h-[44px] text-[10px] font-medium transition-colors"
                style={{
                  background: textColorScope === scope ? accentColor : 'transparent',
                  color: textColorScope === scope ? '#fff' : 'var(--text-tertiary)',
                  borderRight: scope !== 'body' ? '1px solid rgba(255,255,255,0.1)' : undefined,
                }}
              >
                {scope === 'both' ? 'Ambos' : scope === 'headline' ? 'Título' : 'Corpo'}
              </button>
            ))}
          </div>
        </div>
        {(() => {
          const colorValue =
            textColorScope === 'headline'
              ? (variation.headlineColor ?? variation.textColor)
              : textColorScope === 'body'
                ? (variation.bodyColor ?? variation.textColor)
                : variation.textColor;

          const handleColorChange = (value: string) => {
            if (textColorScope === 'headline') {
              updateVariation({ headlineColor: value });
            } else if (textColorScope === 'body') {
              updateVariation({ bodyColor: value });
            } else {
              // Ambos: reseta cores independentes e aplica textColor global
              updateVariation({ textColor: value, headlineColor: undefined, bodyColor: undefined });
            }
          };

          return (
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={colorValue}
                onChange={(e) => handleColorChange(e.target.value)}
                className="w-11 h-11 min-w-[44px] rounded-lg cursor-pointer border-0 p-0"
              />
              <input
                type="text"
                value={colorValue}
                onChange={(e) => handleColorChange(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl text-xs font-mono uppercase"
                style={{
                  background: 'var(--bg-void)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          );
        })()}
      </div>

      {/* Cor de Destaque — sempre visível */}
      <div>
        <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block">
          Cor de Destaque
        </label>
        <div className="flex gap-2 items-center">
          <input
            type="color"
            value={variation.accentColor || '#a855f7'}
            onChange={(e) => updateVariation({ accentColor: e.target.value })}
            className="w-11 h-11 min-w-[44px] rounded-lg cursor-pointer border-0 p-0"
          />
          <input
            type="text"
            value={variation.accentColor || '#a855f7'}
            onChange={(e) => updateVariation({ accentColor: e.target.value })}
            className="flex-1 px-3 py-2 rounded-xl text-xs font-mono uppercase"
            style={{
              background: 'var(--bg-void)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      </div>

      {/* Tamanho da Fonte */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">
            Tamanho da Fonte
          </label>
          {/* Seletor de escopo: Título / Corpo */}
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            {(['headline', 'body'] as const).map((scope) => (
              <button
                key={scope}
                onClick={() => setTextSizeScope(scope)}
                className="px-2 py-0.5 text-[9px] font-medium transition-colors"
                style={{
                  background: textSizeScope === scope ? variation.accentColor || '#a855f7' : 'transparent',
                  color: textSizeScope === scope ? '#fff' : 'var(--text-tertiary)',
                  borderRight: scope !== 'body' ? '1px solid rgba(255,255,255,0.1)' : undefined,
                }}
              >
                {scope === 'headline' ? 'Título' : 'Corpo'}
              </button>
            ))}
          </div>
        </div>

        {(() => {
          const currentSize = textSizeScope === 'headline'
            ? (variation.headlineFontSize ?? 1)
            : (variation.bodyFontSize ?? 1);

          const handleSizeChange = (val: number) => {
            if (textSizeScope === 'headline') {
              updateVariation({ headlineFontSize: val });
            } else {
              updateVariation({ bodyFontSize: val });
            }
          };

          return (
            <div className="pt-2" data-tour="wb-font-size">
              <PrecisionSlider
                label={textSizeScope === 'headline' ? 'Tamanho do Título' : 'Tamanho do Corpo'}
                value={currentSize * 100}
                onChange={(val) => handleSizeChange(val / 100)}
                min={50}
                max={200}
                step={1}
                formatValue={(v) => `${(v / 100).toFixed(2)}x`}
              />
            </div>
          );
        })()}
      </div>
    </div>
  );

  const renderImageSection = () => (
    <div className="space-y-3">
      {renderBgScopeSelector()}
      <div>
        <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block">
          Fonte
        </label>
        <div className="flex gap-1">
          {[
            { id: 'none' as const, label: 'Nenhuma' },
            { id: 'ai' as const, label: 'IA' },
            { id: 'gallery' as const, label: 'Galeria' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveImageSource(id)}
              className="flex-1 py-1.5 rounded-lg text-[10px] font-medium transition-all"
              style={{
                background: activeImageSource === id ? `${accentColor}15` : 'transparent',
                border: `1px solid ${activeImageSource === id ? `${accentColor}30` : 'rgba(255, 255, 255, 0.06)'}`,
                color: activeImageSource === id ? accentColor : 'var(--text-tertiary)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeImageSource === 'ai' && (
        <>
          <div>
            <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block">
              Descrição
            </label>
            <textarea
              value={variation.imagePrompt}
              onChange={(e) => updateVariation({ imagePrompt: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-xl text-xs outline-none resize-none"
              style={{
                background: 'var(--bg-void)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'var(--text-primary)',
              }}
              placeholder="Descreva a imagem..."
            />
          </div>
          <button
            onClick={handleGenerateImage}
            disabled={isGeneratingImg}
            data-tour="wb-image"
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #d4af37, #c9a227)',
              color: '#0a0b0f',
            }}
          >
            {isGeneratingImg ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {isGeneratingImg ? 'Sintetizando...' : 'Gerar Imagem'}
          </button>

          <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
            <button
              onClick={() => { }}
              disabled={true}
              className={`flex-1 py-1.5 flex items-center justify-center gap-1 rounded-md text-[10px] font-medium transition-all opacity-40 cursor-not-allowed text-white/40`}
            >
              Pollinations
              <span className="text-[8px] bg-white/10 px-1 py-0.5 rounded uppercase tracking-wider">
                Em breve
              </span>
            </button>
            <button
              onClick={() => setImageProvider('gemini')}
              className={`flex-1 py-1.5 flex items-center justify-center rounded-md text-[10px] font-medium transition-all ${imageProvider === 'gemini'
                ? 'bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-[#ffd700] border border-[#ffd700]/20'
                : 'text-white/40 hover:text-white/60'
                }`}
            >
              Nano Banana Pro
            </button>
          </div>
        </>
      )}

      {/* Galeria de Backgrounds */}
      {activeImageSource === 'gallery' && (
        <BackgroundGallery
          onSelect={(url) => updateVariation({ imageUrl: url })}
          selectedUrl={variation.imageUrl}
          accentColor={accentColor}
        />
      )}

      {variation.imageUrl && (
        <div className="aspect-video rounded-xl overflow-hidden" style={{ background: 'var(--bg-void)' }}>
          <img src={variation.imageUrl} alt="Preview" className="w-full h-full object-cover" />
        </div>
      )}

      <AnimatePresence>
        {isArchitect && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 overflow-hidden"
          >
            {/* Calibração Visual */}
            <div className="pt-2">
              <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block">
                Calibração Visual
              </label>
              <div className="space-y-2">
                <PrecisionSlider
                  label="Zoom"
                  value={imageSettings.zoom}
                  min={0.5}
                  max={3}
                  step={0.05}
                  formatValue={(v) => `${v.toFixed(2)}×`}
                  onChange={(v) => updateImageSetting('zoom', v)}
                />
                <PrecisionSlider
                  label="Brilho"
                  value={imageSettings.brightness}
                  min={0}
                  max={2}
                  step={0.05}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => updateImageSetting('brightness', v)}
                />
                <PrecisionSlider
                  label="Contraste"
                  value={imageSettings.contrast}
                  min={0}
                  max={2}
                  step={0.05}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => updateImageSetting('contrast', v)}
                />
                <PrecisionSlider
                  label="Saturação"
                  value={imageSettings.saturation}
                  min={0}
                  max={2}
                  step={0.05}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => updateImageSetting('saturation', v)}
                />
                <PrecisionSlider
                  label="Blur"
                  value={imageSettings.blur}
                  min={0}
                  max={20}
                  step={0.5}
                  formatValue={(v) => `${v}px`}
                  onChange={(v) => updateImageSetting('blur', v)}
                />
              </div>
            </div>

            {/* Sobreposição */}
            <div className="pt-2">
              <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block">
                Sobreposição
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="color"
                  value={imageSettings.overlayColor}
                  onChange={(e) => updateImageSetting('overlayColor', e.target.value)}
                  className="w-8 h-8 rounded-lg cursor-pointer border-0 p-0"
                />
                <input
                  type="text"
                  value={imageSettings.overlayColor}
                  onChange={(e) => updateImageSetting('overlayColor', e.target.value)}
                  className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-mono uppercase"
                  style={{
                    background: 'var(--bg-void)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              <PrecisionSlider
                label="Opacidade"
                value={imageSettings.overlayOpacity}
                min={0}
                max={1}
                step={0.05}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => updateImageSetting('overlayOpacity', v)}
              />
            </div>

            {/* Blend Modes */}
            <div className="pt-2">
              <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block">
                Blend Mode
              </label>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { value: 'normal', label: 'Normal', icon: '◯' },
                  { value: 'multiply', label: 'Mult', icon: '✕' },
                  { value: 'screen', label: 'Screen', icon: '◻' },
                  { value: 'overlay', label: 'Overlay', icon: '◎' },
                  { value: 'darken', label: 'Dark', icon: '◐' },
                  { value: 'lighten', label: 'Light', icon: '◑' },
                ].map((bm) => (
                  <button
                    key={bm.value}
                    onClick={() => updateImageSetting('blendMode', bm.value as ImageSettings['blendMode'])}
                    className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg text-[9px] transition-all"
                    style={{
                      background: imageSettings.blendMode === bm.value ? `${accentColor}15` : 'var(--bg-void)',
                      color: imageSettings.blendMode === bm.value ? accentColor : 'var(--text-tertiary)',
                      border: `1px solid ${imageSettings.blendMode === bm.value ? `${accentColor}30` : 'rgba(255, 255, 255, 0.06)'}`,
                    }}
                  >
                    <span className="text-sm">{bm.icon}</span>
                    <span>{bm.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const renderCompositionSection = () => (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block">
          Disposição
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            {
              value: 'centered' as const,
              label: 'Centralizado',
              description: 'Texto no centro',
              icon: '◎'
            },
            {
              value: 'left-aligned' as const,
              label: 'Lateral',
              description: 'Texto na base',
              icon: '☰'
            },
            {
              value: 'split' as const,
              label: 'Bipartido',
              description: 'Imagem + texto',
              icon: '⬒'
            },
            {
              value: 'minimal' as const,
              label: 'Minimal',
              description: 'Só headline',
              icon: '○'
            },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                updateVariation({ layout: opt.value });
                // FIX Bug 1: reinicializa layoutSettings para o preset do novo layout
                // Preserva customizações de width que o usuário possa ter feito
                const newSettings = layoutToAdvanced(opt.value);
                setLayoutSettings(newSettings);
                // NÃO marca hasCustomLayout aqui — permitindo que futuras mudanças de layout
                // continuem sincronizando (o usuário ainda não fez customização livre)
                setHasCustomLayout(false);
              }}
              className="flex flex-col items-center justify-center gap-1 min-h-[64px] rounded-lg transition-all group"
              style={{
                background: variation.layout === opt.value ? `${accentColor}10` : 'var(--bg-void)',
                border: `1px solid ${variation.layout === opt.value ? `${accentColor}30` : 'rgba(255, 255, 255, 0.06)'}`,
                color: variation.layout === opt.value ? accentColor : 'var(--text-tertiary)',
              }}
            >
              <span className="text-xl leading-none">{opt.icon}</span>
              <span className="text-[10px] font-medium">{opt.label}</span>
              <span className="text-[8px] opacity-60">{opt.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Seletor de posição da imagem — visível apenas no layout Bipartido */}
      {variation.layout === 'split' && (
        <div className="pt-1">
          <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block">
            Imagem em
          </label>
          <div className="flex gap-1.5">
            {([
              { value: 'top' as const, icon: '⬆', label: 'Cima' },
              { value: 'bottom' as const, icon: '⬇', label: 'Baixo' },
            ]).map((opt) => {
              const isActive = (variation.splitImagePosition ?? 'top') === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => updateVariation({ splitImagePosition: opt.value })}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: isActive ? `${accentColor}15` : 'var(--bg-void)',
                    border: `1px solid ${isActive ? `${accentColor}40` : 'rgba(255,255,255,0.06)'}`,
                    color: isActive ? accentColor : 'var(--text-tertiary)',
                  }}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* FIX Bug 2: Seções de controle sempre visíveis, não só no modo Arquiteto */}

      <div className="space-y-3 pt-1">
        {/* Seletor de Elemento (Título vs Corpo vs Barrinha) */}
        <div>
          <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block">
            Elemento Ativo
          </label>
          <div className="flex bg-white/5 p-1 rounded-xl gap-1">
            {(['headline', 'body', 'accentBar'] as const).map((target) => (
              <button
                key={target}
                onClick={() => setLayoutTarget(target)}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${layoutTarget === target ? 'bg-amber-500 text-black' : 'hover:bg-white/5 text-white/60'
                  }`}
              >
                {target === 'headline' ? 'Título' : target === 'body' ? 'Corpo' : 'Barrinha'}
              </button>
            ))}
          </div>
        </div>

        {/* Grid 3×3 de Posições */}
        <div>
          <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block">
            Posição
          </label>
          <div className="grid grid-cols-3 gap-1 p-1.5 rounded-lg" style={{ background: 'var(--bg-void)' }}>
            {[
              { y: 'top', x: 'left', label: '↖' },
              { y: 'top', x: 'center', label: '↑' },
              { y: 'top', x: 'right', label: '↗' },
              { y: 'center', x: 'left', label: '←' },
              { y: 'center', x: 'center', label: '•' },
              { y: 'center', x: 'right', label: '→' },
              { y: 'bottom', x: 'left', label: '↙' },
              { y: 'bottom', x: 'center', label: '↓' },
              { y: 'bottom', x: 'right', label: '↘' },
            ].map((pos) => {
              const rawValue = `${pos.y}-${pos.x}`;
              const posValue = rawValue === 'center-center' ? 'center' : rawValue;
              const currentElement = layoutSettings[layoutTarget] || layoutSettings.headline;
              // FIX Bug 5: detecta célula ativa considerando freePosition também
              const isActive = !currentElement.freePosition && currentElement.position === posValue;
              return (
                <button
                  key={posValue}
                  onClick={() => {
                    setHasCustomLayout(true);
                    setLayoutSettings({
                      ...layoutSettings,
                      // FIX Bug 5: limpa freePosition ao clicar numa célula — posição nomeada tem prioridade
                      [layoutTarget]: {
                        ...(layoutSettings[layoutTarget] || layoutSettings.headline),
                        position: posValue as import('@/types/editor').TextPosition,
                        freePosition: undefined,
                      },
                    });
                  }}
                  className="w-full aspect-square min-h-[44px] rounded-md text-xs font-medium transition-all flex items-center justify-center touch-manipulation"
                  style={{
                    background: isActive ? `${accentColor}20` : 'transparent',
                    color: isActive ? accentColor : 'var(--text-tertiary)',
                    border: `1px solid ${isActive ? `${accentColor}40` : 'rgba(255, 255, 255, 0.06)'}`,
                  }}
                >
                  {pos.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Alinhamento do Texto */}
        <div>
          <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block">
            Alinhamento
          </label>
          <div className="flex gap-1">
            {[
              { value: 'left', label: '←' },
              { value: 'center', label: '↔' },
              { value: 'right', label: '→' },
            ].map(({ value, label }) => {
              const isActive = (layoutSettings[layoutTarget]?.textAlign || 'left') === value;
              return (
                <button
                  key={value}
                  onClick={() => {
                    setHasCustomLayout(true);
                    setLayoutSettings({
                      ...layoutSettings,
                      [layoutTarget]: { ...(layoutSettings[layoutTarget] || layoutSettings.headline), textAlign: value as 'left' | 'center' | 'right' },
                    });
                  }}
                  className="flex-1 py-1.5 min-h-[44px] rounded-lg text-xs font-medium transition-all flex items-center justify-center touch-manipulation"
                  style={{
                    background: isActive ? `${accentColor}15` : 'var(--bg-void)',
                    color: isActive ? accentColor : 'var(--text-tertiary)',
                    border: `1px solid ${isActive ? `${accentColor}30` : 'rgba(255, 255, 255, 0.06)'}`,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Respiro */}
        <PrecisionSlider
          label="Respiro"
          value={layoutSettings.padding}
          min={0}
          max={80}
          step={4}
          unit="px"
          onChange={(v) => {
            setHasCustomLayout(true);
            setLayoutSettings({ ...layoutSettings, padding: v });
          }}
        />

        {/* Botão Realinhar (anteriormente só no toolbar do canvas) */}
        {hasCustomLayout && (
          <button
            onClick={handleResetLayout}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[10px] font-semibold transition-all"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.5)',
            }}
          >
            <RotateCcw size={11} />
            Realinhar para padrão
          </button>
        )}
      </div>
    </div>
  );

  // ========== LAYOUT PRINCIPAL ==========

  // Sidebar com seções colapsáveis
  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: `${accentColor}20` }}
          >
            <span style={{ color: accentColor, fontSize: '14px' }}>◉</span>
          </div>
          <span className="text-xs font-semibold text-[var(--text-primary)]">PostSpark</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        <CollapsibleSection
          title="Texto"
          icon={<Type size={16} />}
          isExpanded={expandedSection === 'text'}
          onToggle={() => toggleSection('text')}
          statusBadge={`${variation.hashtags.length} tags`}
          accentColor={accentColor}
        >
          {renderTextSection()}
        </CollapsibleSection>

        <CollapsibleSection
          title="Design"
          icon={<Palette size={16} />}
          isExpanded={expandedSection === 'design'}
          onToggle={() => toggleSection('design')}
          accentColor={accentColor}
        >
          {renderDesignSection()}
        </CollapsibleSection>

        <CollapsibleSection
          title="Imagem"
          icon={<ImagePlus size={16} />}
          isExpanded={expandedSection === 'image'}
          onToggle={() => toggleSection('image')}
          statusBadge={variation.imageUrl ? '✓' : undefined}
          accentColor={accentColor}
        >
          {renderImageSection()}
        </CollapsibleSection>

        <CollapsibleSection
          title="Layout"
          icon={<Layout size={16} />}
          isExpanded={expandedSection === 'composition'}
          onToggle={() => toggleSection('composition')}
          accentColor={accentColor}
        >
          {renderCompositionSection()}
        </CollapsibleSection>
      </div>

      <div className="p-3 border-t border-white/[0.06]" data-tour="wb-architect">
        <AdvancedModeToggle mode={mode} onChange={setMode} accentColor={accentColor} />
      </div>
    </div>
  );

  // Canvas Central
  const canvas = (
    <div className={`relative flex flex-col items-center justify-center w-full h-full p-6 ${isArchitect ? 'pb-20' : ''}`}>
      <OrganicBackground accentColor={accentColor} intensity={0.12} />

      <div
        className="absolute pointer-events-none"
        style={{
          inset: 0,
          background: `radial-gradient(ellipse 50% 40% at 50% 50%, ${accentColor}08 0%, transparent 70%)`,
        }}
      />

      {/* Mode Badge - Premium Visual */}
      {isCarousel && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-8 z-30 flex items-center gap-2 px-4 py-2 rounded-full border"
          style={{
            background: 'rgba(10, 10, 15, 0.6)',
            backdropFilter: 'blur(16px)',
            borderColor: `${accentColor}40`,
            boxShadow: `0 8px 32px -8px ${accentColor}30`
          }}
        >
          <Layers size={14} style={{ color: accentColor }} />
          <span className="text-[11px] uppercase tracking-widest font-bold" style={{ color: accentColor }}>
            Modo Carrossel
          </span>
          <div className="w-px h-3 bg-white/10 mx-1" />
          <span className="text-[10px] text-white/60 font-mono">
            SLIDE {activeSlideIndex + 1} / {slides.length}
          </span>
        </motion.div>
      )}

      {/* Main Content Area with Controls */}
      <div className="relative group flex items-center justify-center w-full">

        {/* TextCanvas Sidebar (Left) */}
        <AnimatePresence>
          {isArchitect && expandedSection === 'text' && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              drag
              dragMomentum={false}
              dragElastic={0.1}
              className="absolute left-4 lg:left-8 z-40 flex flex-col justify-center cursor-grab active:cursor-grabbing rounded-2xl shadow-2xl backdrop-blur-xl"
              style={{
                background: 'rgba(10, 10, 15, 0.75)',
                border: '1px solid rgba(255,255,255,0.1)',
                touchAction: 'none'
              }}
            >
              <AdvancedTextSidebar
                onAddText={() => {
                  const newEl: AdvancedTextElement = {
                    id: `text-${Date.now()}`,
                    text: 'Novo Texto',
                    x: 50,
                    y: 50,
                    width: 200,
                    height: 'auto',
                    rotation: 0,
                    styles: {
                      fontSize: '32px',
                      fontFamily: 'Inter, sans-serif',
                      color: '#ffffff',
                      fontWeight: 'bold',
                      fontStyle: 'normal',
                      textDecoration: 'none',
                      textAlign: 'center',
                      lineHeight: '1.2',
                      opacity: '1'
                    }
                  };
                  updateVariation({ textElements: [...(variation.textElements || []), newEl] });
                  setSelectedTextId(newEl.id);
                }}
                onLayerUp={() => {
                  if (!selectedTextId || !variation.textElements) return;
                  const idx = variation.textElements.findIndex(el => el.id === selectedTextId);
                  if (idx < variation.textElements.length - 1) {
                    const newEls = [...variation.textElements];
                    [newEls[idx], newEls[idx + 1]] = [newEls[idx + 1], newEls[idx]];
                    updateVariation({ textElements: newEls });
                  }
                }}
                onLayerDown={() => {
                  if (!selectedTextId || !variation.textElements) return;
                  const idx = variation.textElements.findIndex(el => el.id === selectedTextId);
                  if (idx > 0) {
                    const newEls = [...variation.textElements];
                    [newEls[idx], newEls[idx - 1]] = [newEls[idx - 1], newEls[idx]];
                    updateVariation({ textElements: newEls });
                  }
                }}
                onDelete={() => {
                  if (!selectedTextId || !variation.textElements) return;
                  updateVariation({ textElements: variation.textElements.filter(el => el.id !== selectedTextId) });
                  setSelectedTextId(null);
                }}
                hasSelection={!!selectedTextId}
                accentColor={accentColor}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Carrossel Navigation - Left Arrow */}
        {isCarousel && slides.length > 1 && (
          <button
            onClick={goToPrevSlide}
            className="absolute -left-16 z-20 p-3 rounded-full transition-all hover:scale-110 active:scale-95 group-hover:opacity-100 opacity-0 lg:opacity-100"
            style={{
              background: `${accentColor}15`,
              border: `1px solid ${accentColor}30`,
              color: accentColor,
              backdropFilter: 'blur(4px)',
            }}
          >
            <ChevronLeft size={24} />
          </button>
        )}

        {/* Card column: card + floating toolbar abaixo */}
        <div className="flex flex-col items-center gap-3">
          <motion.div
            ref={canvasRef}
            layout
            initial={false}
            animate={{
              width: '360px',  // largura fixa — 1:1 é o menor, 9:16 é o maior (cresce só em altura)
              height: aspectRatio === '9:16' ? '640px' : aspectRatio === '5:6' ? '432px' : '360px',
            }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 30,
              mass: 1
            }}
            className="relative z-10 transition-shadow duration-500 ease-in-out shadow-2xl overflow-hidden rounded-[1.5rem]"
            style={{
              boxShadow: `0 20px 50px -12px ${accentColor}15`
            }}
          >
            <PostCard
              variation={variation}
              theme={activeTheme}
              aspectRatio={aspectRatio}
              imageSettings={imageSettings}
              advancedLayout={layoutSettings}
              forceVariationColors={true}
              onDragPosition={isArchitect ? handleDragPositionFromCard : undefined}
              onResizeBlock={isArchitect ? handleResizeBlock : undefined}
              snapEnabled={isArchitect ? snapToGrid : undefined}
            />
          </motion.div>

          {/* Floating Architect Toolbar — visível abaixo do card quando modo Arquiteto ativo */}
          <AnimatePresence>
            {isArchitect && (
              <motion.div
                key="architect-toolbar"
                initial={{ opacity: 0, y: -4, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                className="flex items-center gap-2 px-3 py-2 rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md shadow-xl"
                style={{
                  boxShadow: `0 4px 24px -4px ${accentColor}25`,
                }}
              >
                {/* Botão ímã (snap-to-grid) */}
                <button
                  onClick={() => setSnapToGrid((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all"
                  style={{
                    background: snapToGrid ? `${accentColor}20` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${snapToGrid ? `${accentColor}50` : 'rgba(255,255,255,0.08)'}`,
                    color: snapToGrid ? accentColor : 'rgba(255,255,255,0.45)',
                  }}
                  title={snapToGrid ? 'Snap ativo — clique para desativar' : 'Snap desativado — clique para ativar'}
                >
                  <Magnet size={13} />
                  Ímã {snapToGrid ? 'ON' : 'OFF'}
                </button>

                {/* Separador */}
                <div className="w-px h-5 bg-white/10" />

                {/* Botão Realinhar */}
                <button
                  onClick={handleResetLayout}
                  disabled={!hasCustomLayout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    background: hasCustomLayout ? 'rgba(255,255,255,0.06)' : 'transparent',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: hasCustomLayout ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.3)',
                  }}
                  title="Resetar posicionamento para o layout padrão"
                >
                  <RotateCcw size={13} />
                  Realinhar
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Carrossel Navigation - Right Arrow */}
        {isCarousel && slides.length > 1 && (
          <button
            onClick={goToNextSlide}
            className="absolute -right-16 z-20 p-3 rounded-full transition-all hover:scale-110 active:scale-95 group-hover:opacity-100 opacity-0 lg:opacity-100"
            style={{
              background: `${accentColor}15`,
              border: `1px solid ${accentColor}30`,
              color: accentColor,
              backdropFilter: 'blur(4px)',
            }}
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>

      {/* Carrossel Indicators & Controls */}
      {isCarousel && (
        <div className="absolute bottom-8 z-20 flex items-center gap-3 px-4 py-2 rounded-2xl border border-white/5 bg-black/20 backdrop-blur-md">
          {/* Slide Dots */}
          <div className="flex items-center gap-1.5">
            {slides.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className="transition-all rounded-full relative group/dot"
                style={{
                  width: activeSlideIndex === index ? '24px' : '8px',
                  height: '8px',
                  background: activeSlideIndex === index ? accentColor : `rgba(255,255,255,0.2)`,
                }}
              >
                <div className={`absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[9px] px-2 py-0.5 rounded opacity-0 group-hover/dot:opacity-100 transition-opacity pointer-events-none whitespace-nowrap`}>
                  Slide {index + 1}
                </div>
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-white/10 mx-1" />

          {/* Add Slide Button */}
          <button
            onClick={addSlide}
            disabled={slides.length >= CAROUSEL_SLIDE_RANGE.max}
            className="p-1.5 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5"
            style={{ color: slides.length >= CAROUSEL_SLIDE_RANGE.max ? 'var(--text-tertiary)' : accentColor }}
            title="Adicionar slide"
          >
            <Plus size={16} />
          </button>

          {/* Remove Slide Button */}
          <button
            onClick={() => removeSlide(activeSlideIndex)}
            disabled={slides.length <= 1}
            className="p-1.5 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-red-500/10 text-red-400"
            title="Remover slide atual"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </div>
  );

  // Painel de Ações Rápidas (direita)
  const quickActionsPanel = (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <h3 className="text-xs font-semibold text-[var(--text-primary)]">Ações</h3>
      </div>

      <div className="flex-1 p-4 space-y-3">
        {/* Info do Post */}
        <div
          className="p-3 rounded-xl"
          style={{
            background: 'var(--bg-void)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
            Plataforma
          </div>
          <div className="text-sm font-medium" style={{ color: accentColor }}>
            {PLATFORM_SPECS[variation.platform].label}
          </div>
        </div>

        {/* Aspect Ratio */}
        <div>
          <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block">
            Proporção
          </label>
          <div className="flex gap-1">
            {RATIOS.map((ratio) => (
              <button
                key={ratio}
                onClick={() => {
                  setAspectRatio(ratio);
                  // Verifica se existe otimização da IA para este novo formato
                  const opt = variation.aspectRatioOptimizations?.[ratio];
                  if (opt) {
                    setPendingOptimization(opt);
                    setShowOptimizationHint(true);
                  } else {
                    setShowOptimizationHint(false);
                  }
                }}
                className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg transition-all"
                style={{
                  background: aspectRatio === ratio ? `${accentColor}15` : 'transparent',
                  border: `1px solid ${aspectRatio === ratio ? `${accentColor}30` : 'rgba(255, 255, 255, 0.06)'}`,
                }}
              >
                <RatioIcon
                  ratio={ratio}
                  size={16}
                  color={aspectRatio === ratio ? accentColor : 'var(--text-tertiary)'}
                />
                <span
                  className="text-[10px]"
                  style={{ color: aspectRatio === ratio ? accentColor : 'var(--text-tertiary)' }}
                >
                  {ASPECT_RATIO_LABELS[ratio].label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Notificação de Otimização da IA */}
        <AnimatePresence>
          {showOptimizationHint && pendingOptimization && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-2"
            >
              <div className="flex items-center gap-2 text-[10px] text-amber-500 font-bold uppercase tracking-wider">
                <Sparkles size={12} />
                Design Sugerido pela IA
              </div>
              <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
                A IA sugeriu um layout <strong>{pendingOptimization.layout}</strong> e cores otimizadas para este formato.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => applyOptimization(pendingOptimization)}
                  className="flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all bg-amber-500 text-black hover:bg-amber-400"
                >
                  Aplicar Sugestão
                </button>
                <button
                  onClick={() => {
                    setShowOptimizationHint(false);
                    setPendingOptimization(null);
                  }}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all bg-white/5 text-white/60 hover:text-white"
                >
                  Ignorar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Text Fit Indicator */}
        <div
          className="p-3 rounded-xl"
          style={{
            background: 'var(--bg-void)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
            Ajuste de Texto
          </div>
          <TextFitIndicator
            headline={variation.headline}
            body={variation.body || ''}
            aspectRatio={aspectRatio}
            accentColor={accentColor}
            showSuggestions={true}
          />
        </div>

        {/* Stats */}
        <div
          className="p-3 rounded-xl space-y-2"
          style={{
            background: 'var(--bg-void)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <div className="flex justify-between text-[10px]">
            <span className="text-[var(--text-tertiary)]">Título</span>
            <span className="text-[var(--text-secondary)]">{variation.headline.length} chars</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-[var(--text-tertiary)]">Corpo</span>
            <span className="text-[var(--text-secondary)]">{variation.body.length} chars</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-[var(--text-tertiary)]">Hashtags</span>
            <span className="text-[var(--text-secondary)]">{variation.hashtags.length}</span>
          </div>
        </div>

        {/* Checklist de Design */}
        <DesignChecklistPanel
          variation={variation}
          aspectRatio={aspectRatio}
          accentColor={accentColor}
        />
      </div>
    </div>
  );

  // Header
  const header = (
    <header
      className="flex items-center justify-between px-4 py-3 z-50 shrink-0 touch-none"
      style={{
        background: 'var(--bg-base)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
      }}
    >
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors active:scale-95"
        style={{ color: "var(--text-secondary)", background: "rgba(255,255,255,0.03)" }}
      >
        <ArrowLeft size={16} />
        <span className="hidden sm:inline">Retornar</span>
      </button>

      <div className="flex-1 text-center hidden md:block px-4">
        <p className="text-xs text-[var(--text-tertiary)] truncate w-full max-w-xs mx-auto">
          {variation.headline || 'Editor'}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleCopyText}
          className="flex items-center justify-center p-2.5 rounded-xl transition-all active:scale-95 md:px-3 md:py-2 md:gap-1.5"
          style={{ color: "var(--text-secondary)", background: "rgba(255,255,255,0.03)" }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          <span className="hidden md:inline">{copied ? 'Copiado' : 'Copiar'}</span>
        </button>

        <button
          onClick={handleExport}
          className="flex items-center justify-center p-2.5 rounded-xl transition-all active:scale-95 md:px-3 md:py-2 md:gap-1.5"
          style={{ color: "var(--text-secondary)", background: "rgba(255,255,255,0.03)" }}
        >
          <Download size={16} />
          <span className="hidden md:inline">Exportar</span>
        </button>

        <button
          onClick={() => onSave(variation)}
          disabled={isSaving}
          data-tour="wb-save"
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
          style={{
            background: `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)`,
            color: '#0a0b0f',
          }}
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Consolidar
        </button>
      </div>
    </header>
  );

  return (
    <motion.div
      className="fixed inset-0 flex flex-col bg-[var(--bg-void)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {header}

      {isMobile ? (
        // Mobile: Canvas + Drawer
        <div className="flex-1 relative">
          {canvas}

          {/* Mobile Tab Bar */}
          <div
            className="absolute bottom-0 left-0 right-0 flex justify-around px-2 pb-6 pt-2 z-40"
            style={{
              background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.5) 60%, transparent 100%)',
              backdropFilter: 'blur(12px)',
            }}
          >
            {[
              { id: 'text' as TabId, Icon: Type, label: 'Texto' },
              { id: 'design' as TabId, Icon: Palette, label: 'Design' },
              { id: 'image' as TabId, Icon: ImagePlus, label: 'Imagem' },
              { id: 'composition' as TabId, Icon: Layout, label: 'Layout' },
            ].map(({ id, Icon, label }) => (
              <button
                key={id}
                onClick={() => {
                  setExpandedSection(id);
                  arcDrawer.open(id);
                }}
                className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl transition-all active:scale-95 flex-1"
                style={{
                  background: expandedSection === id ? `${accentColor}1A` : 'transparent',
                  color: expandedSection === id ? accentColor : 'var(--text-tertiary)',
                }}
              >
                <Icon size={24} strokeWidth={expandedSection === id ? 2.5 : 2} />
                <span className="text-[10px] font-medium tracking-wide">{label}</span>
              </button>
            ))}
          </div>

          {/* Mobile Drawer via MobileEditSheet */}
          <MobileEditSheet
            isOpen={arcDrawer.state.isOpen}
            onClose={arcDrawer.close}
            activeTabLabel={
              expandedSection === 'text' ? 'Editar Textos' :
                expandedSection === 'design' ? 'Estilo & Cores' :
                  expandedSection === 'image' ? 'Mídia & Fundo' :
                    expandedSection === 'composition' ? 'Composição Vertical' : ''
            }
          >
            <div className="flex flex-col gap-6 pb-12">
              {expandedSection === 'text' && renderTextSection()}
              {expandedSection === 'design' && renderDesignSection()}
              {expandedSection === 'image' && renderImageSection()}
              {expandedSection === 'composition' && renderCompositionSection()}
            </div>
          </MobileEditSheet>
        </div>
      ) : (
        // Desktop: Three Column Layout
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar - 20% */}
          <motion.aside
            className="w-[20%] min-w-[260px] max-w-[320px] h-full flex flex-col"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            style={{
              background: 'var(--bg-base)',
              borderRight: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            {sidebar}
          </motion.aside>

          {/* Canvas - 55% */}
          <motion.main
            className="flex-1 h-full flex flex-col items-center justify-center relative overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            {canvas}
          </motion.main>

          {/* Quick Actions - 25% */}
          <motion.aside
            className="w-[25%] min-w-[240px] max-w-[320px] h-full flex flex-col"
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.2, ease: 'easeOut' }}
            style={{
              background: 'var(--bg-base)',
              borderLeft: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            {quickActionsPanel}
          </motion.aside>
        </div>
      )}
    </motion.div>
  );
}