/**
 * PostCard — visual de post para redes sociais.
 *
 * Três proporções com diagramações distintas:
 *  • 1:1  — quadrado (Instagram feed): texto na base, fonte compacta
 *  • 5:6  — retrato (feed portrait): texto na base, fonte média
 *  • 9:16 — story/reels: diagramação própria de story, texto centralizado
 *            verticalmente, sem line-clamp, texto completo sempre visível
 *
 * Props extras (editor avançado):
 *  • imageSettings — filtros CSS na imagem (zoom, brilho, contraste, etc.)
 *  • advancedLayout — posicionamento absoluto headline/body no grid 3×3
 *
 * O texto ajusta automaticamente ao mudar de aspect ratio:
 *  - Tamanho da fonte recalculado
 *  - Line-clamp dinâmico para evitar overflow
 *  - Padding otimizado para cada formato
 *
 * ArchitectOverlay:
 *  - Quando `advancedLayout` está presente, TODOS os layouts usam esta camada.
 *  - O overlay é position:absolute e inset:0, garantindo que as 9 posições
 *    sejam relativas ao card inteiro, independente do layout de fundo.
 */

import type React from "react";
import { useRef, useState, useEffect, useCallback } from "react";
import { type LucideIcon, Layers, Users, Star, Zap, Heart, Globe, Calendar, Shield, Rocket, Target, Award, MessageCircle, TrendingUp, CheckCircle, Play, Camera, Music, MapPin, Clock, Gift, Sparkles, ArrowRight } from "lucide-react";
import type { PostVariation, AspectRatio, BackgroundValue, BgOverlaySettings, ContentSection, PostTemplate, DesignTokens } from "@shared/postspark";
import { ASPECT_RATIO_VALUES } from "@shared/postspark";
import type { ThemeConfig } from "@/lib/themes";
import type { ImageSettings, AdvancedLayoutSettings, TextPosition, LayoutPosition } from "@/types/editor";
import ThemeRenderer from "@/components/ThemeRenderer";
import BrandOverlay from "@/components/BrandOverlay";
import type { CopyAngle } from "@shared/postspark";

// --- Hooks & Utilities ---
import { useResizeElement } from "@/hooks/useResizeElement";
import { useDynamicFont } from "@/hooks/useDynamicFont";
import { useTextAutoFit } from "@/hooks/useTextAutoFit";
import { AdvancedTextNode } from "@/components/canvas/AdvancedTextNode";
import { DraggableBlock } from "@/components/canvas/DraggableBlock";
import { useEditorStore } from "@/store/editorStore";

interface PostCardV2Props {
  compact?: boolean;
  /** When true, variation colors take priority over theme colors (used in Workbench editor) */
  forceVariationColors?: boolean;
  /** Brand identity metadata for overlay rendering (logo, platform icon, decorative shapes) */
  brandMeta?: { logoUrl?: string; brandName?: string; favicon?: string };
  /** Se o snap magnético está ativo (usado junto com onDragPosition) */
  snapEnabled?: boolean;
  /** Se o card em si está em modo de edição (exibe borda e alças do card) */
  isEditingCard?: boolean;
}


// ─── AccentBar Component ─────────────────────────────────────────────────────
function AccentBar({ color, width = "3rem", height = "3px", align = "flex-start", style }: {
  color: string;
  width?: string | number;
  height?: string;
  align?: "flex-start" | "center" | "flex-end";
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="rounded-full shrink-0"
      style={{
        width: typeof width === 'number' ? `${width}%` : width,
        height,
        background: color,
        alignSelf: align,
        ...style,
      }}
    />
  );
}

// ─── Lucide Icon Map ─────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  Users, Star, Zap, Heart, Globe, Calendar, Shield, Rocket, Target, Award,
  MessageCircle, TrendingUp, CheckCircle, Play, Camera, Music, MapPin, Clock, Gift, Sparkles,
};

function getLucideIcon(name?: string) {
  if (!name) return null;
  return ICON_MAP[name] ?? null;
}

// ─── Template Section Renderers ──────────────────────────────────────────────

function FeatureGrid({ sections, accentColor, textColor, bodyFont }: {
  sections: ContentSection[];
  accentColor: string;
  textColor: string;
  bodyFont: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 w-full mt-3">
      {sections.slice(0, 3).map((section, i) => {
        const Icon = getLucideIcon(section.icon);
        return (
          <div key={i} className="flex flex-col items-center gap-1.5 text-center">
            {Icon && (
              <div
                className="flex items-center justify-center rounded-lg"
                style={{
                  width: 36, height: 36,
                  backgroundColor: `${accentColor}20`,
                }}
              >
                <Icon size={18} style={{ color: accentColor }} />
              </div>
            )}
            <span
              className="font-semibold leading-tight"
              style={{ color: textColor, fontFamily: bodyFont, fontSize: "0.7rem" }}
            >
              {section.label}
            </span>
            {section.description && (
              <span
                className="opacity-60 leading-tight"
                style={{ color: textColor, fontFamily: bodyFont, fontSize: "0.55rem" }}
              >
                {section.description}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NumberedList({ sections, accentColor, textColor, bodyFont }: {
  sections: ContentSection[];
  accentColor: string;
  textColor: string;
  bodyFont: string;
}) {
  return (
    <div className="flex flex-col gap-2 w-full mt-3">
      {sections.slice(0, 5).map((section, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <span
            className="font-bold shrink-0 flex items-center justify-center rounded-full"
            style={{
              width: 22, height: 22,
              fontSize: "0.65rem",
              backgroundColor: accentColor,
              color: textColor,
            }}
          >
            {section.number ?? i + 1}
          </span>
          <div className="flex flex-col">
            <span
              className="font-semibold leading-tight"
              style={{ color: textColor, fontFamily: bodyFont, fontSize: "0.72rem" }}
            >
              {section.label}
            </span>
            {section.description && (
              <span
                className="opacity-60 leading-tight"
                style={{ color: textColor, fontFamily: bodyFont, fontSize: "0.55rem" }}
              >
                {section.description}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function StepByStep({ sections, accentColor, textColor, bodyFont }: {
  sections: ContentSection[];
  accentColor: string;
  textColor: string;
  bodyFont: string;
}) {
  return (
    <div className="flex flex-col gap-3 w-full mt-3">
      {sections.slice(0, 3).map((section, i) => {
        const Icon = getLucideIcon(section.icon);
        return (
          <div key={i} className="flex items-center gap-3">
            <div
              className="flex items-center justify-center shrink-0 rounded-full font-bold"
              style={{
                width: 28, height: 28,
                fontSize: "0.7rem",
                backgroundColor: `${accentColor}25`,
                color: accentColor,
                border: `1.5px solid ${accentColor}40`,
              }}
            >
              {Icon ? <Icon size={14} style={{ color: accentColor }} /> : i + 1}
            </div>
            <div className="flex flex-col">
              <span
                className="font-semibold leading-tight"
                style={{ color: textColor, fontFamily: bodyFont, fontSize: "0.72rem" }}
              >
                {section.label}
              </span>
              {section.description && (
                <span
                  className="opacity-60 leading-tight"
                  style={{ color: textColor, fontFamily: bodyFont, fontSize: "0.55rem" }}
                >
                  {section.description}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Renders structured content sections below headline/body based on template type */
function TemplateSections({ template, sections, accentColor, textColor, bodyFont }: {
  template?: PostTemplate;
  sections?: ContentSection[];
  accentColor: string;
  textColor: string;
  bodyFont: string;
}) {
  if (!template || template === 'simple' || !sections?.length) return null;

  switch (template) {
    case 'feature-grid':
      return <FeatureGrid sections={sections} accentColor={accentColor} textColor={textColor} bodyFont={bodyFont} />;
    case 'numbered-list':
      return <NumberedList sections={sections} accentColor={accentColor} textColor={textColor} bodyFont={bodyFont} />;
    case 'step-by-step':
      return <StepByStep sections={sections} accentColor={accentColor} textColor={textColor} bodyFont={bodyFont} />;
    default:
      return null;
  }
}

// Removed internal ArchitectOverlay. Using ArchitectOverlayV2 instead.

// ─── PostCardV2 ────────────────────────────────────────────────────────────────
export default function PostCardV2({
  compact = false,
  forceVariationColors = false,
  brandMeta,
  snapEnabled = true,
  isEditingCard = false,
}: PostCardV2Props) {
  // Consumindo dados do Zustand (Fase 1 + Fase 3)
  const {
    activeVariation,
    slides,
    currentSlideIndex,
    updateSlide,
    imageSettings,
    layoutSettings,
    updateLayoutSettings,
    layoutTarget,
    setLayoutTarget,
    isMagnetActive,
    bgValue,
    bgOverlay,
    aspectRatio: globalAspectRatio
  } = useEditorStore();

  const [inlineEditTarget, setInlineEditTarget] = useState<'headline' | 'body' | 'badge' | 'sticker' | null>(null);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const layoutRef = useRef<HTMLDivElement | null>(null);

  if (!activeVariation) return null;

  const variation = activeVariation;
  const designTokens = variation.designTokens;
  const theme = undefined as ThemeConfig | undefined; // Eliminamos props theme puras na V2, focando em designTokens
  const resolvedBrandMeta = brandMeta || (variation as any).brandMeta;

  const activeSlide = variation.postMode === 'carousel' && slides.length > 0
    ? slides[currentSlideIndex] || slides[0]
    : null;
  const headline = activeSlide?.headline || variation.headline;
  const body = activeSlide?.body || variation.body;
  const { imageUrl: variationImageUrl, backgroundColor, textColor, headlineColor, bodyColor, accentColor, layout } = variation;

  // Merge: variation-level tokens override prop-level tokens
  const baseTokens = designTokens as any;
  const variationTokens = variation.designTokens as any;
  const dt = (variationTokens
    ? { ...baseTokens, ...variationTokens }
    : baseTokens) as DesignTokens | undefined;

  // Dynamic font loading from design tokens and variations
  useDynamicFont(dt?.typography?.fontFamily ?? '', dt?.typography?.customFontUrl ?? '');
  useDynamicFont(variation.headlineFontFamily ?? '');
  useDynamicFont(variation.bodyFontFamily ?? '');

  // ── Background resolution (priority: solid > bgValue.url > variation.imageUrl) ──
  const isSolid = bgValue?.type === "solid";
  const resolvedImageUrl = isSolid
    ? undefined
    : (bgValue?.url ?? variationImageUrl);

  const ratio = globalAspectRatio ?? "1:1";
  const aspectRatioCSS = ASPECT_RATIO_VALUES[ratio];
  const isStory = ratio === "9:16";

  // ── Cores ──
  const effectiveBg = isSolid && bgValue?.color
    ? bgValue.color
    : backgroundColor
      ? backgroundColor
      : (dt != null || theme != null) ? "transparent" : "#1a1a2e";

  const protectionColor = isSolid && bgValue?.color
    ? bgValue.color
    : backgroundColor || dt?.colors?.background || theme?.colors?.bg || "#1a1a2e";
  const effectiveText = textColor || dt?.colors?.text || theme?.colors?.text || "#ffffff";

  // Cores independentes por elemento — fazem fallback para effectiveText quando não definidas
  const effectiveHeadlineText = headlineColor || effectiveText;
  const effectiveBodyText = bodyColor || effectiveText;
  const effectiveAccent = accentColor || dt?.colors?.primary || theme?.colors?.accent || "#a855f7";

  // Cores do card vêm dos tokens/tema quando disponíveis
  const cardBg = dt?.colors?.card ? dt.colors.card : theme?.colors?.bg ? theme.colors.bg : effectiveBg;
  const cardText = dt?.colors?.text ? dt.colors.text : theme?.colors?.text ? theme.colors.text : effectiveText;
  const cardAccent = dt?.colors?.primary ? dt.colors.primary : theme?.colors?.accent ? theme.colors.accent : effectiveAccent;

  // Fonts: variation > designTokens > theme > defaults
  const headingFont = variation.headlineFontFamily
    ? `"${variation.headlineFontFamily}", sans-serif`
    : dt?.typography?.fontFamily
      ? `"${dt.typography.fontFamily}", sans-serif`
      : theme?.typography?.headingFont ? theme.typography.headingFont : "var(--font-display)";
  const bodyFont = variation.bodyFontFamily
    ? `"${variation.bodyFontFamily}", sans-serif`
    : dt?.typography?.fontFamily
      ? `"${dt.typography.fontFamily}", sans-serif`
      : theme?.typography?.bodyFont ? theme.typography.bodyFont : "inherit";
  const textAlign = dt?.typography?.textAlign
    ? (dt.typography.textAlign as React.CSSProperties["textAlign"])
    : theme?.layout?.alignment ? (theme.layout.alignment as React.CSSProperties["textAlign"]) : undefined;

  // Text transform from design tokens
  const headlineTextTransform = dt?.typography?.textTransform ?? 'none';

  // Decorations: sticker + badge from copyAngle
  const copyAngle = variation.copyAngle;
  const isPlayful = dt?.decorations === 'playful';

  const commitCarouselAwareUpdate = (patch: Partial<{ headline: string; body: string }>) => {
    if (variation.postMode === 'carousel' && activeSlide) {
      updateSlide(currentSlideIndex, patch);
      return;
    }
    useEditorStore.getState().updateVariation(patch);
  };

  // ── Auto-fit: Ajusta texto automaticamente ao mudar aspect ratio ──
  const autoFit = useTextAutoFit({
    headline,
    body: body || "",
    aspectRatio: ratio,
    isCompact: compact,
  });

  // ── Tamanhos adaptativos (sempre usa auto-fit) ──
  // Theme controla apenas fontes. Tamanhos sempre vêm do auto-fit
  // para evitar overflow em cards menores ou aspect ratios diferentes.
  const headingSize = `calc(${autoFit.headlineSize} * ${variation.headlineFontSize ?? 1})`;
  const bodySize = `calc(${autoFit.bodySize} * ${variation.bodyFontSize ?? 1})`;

  // ── Line clamp dinâmico baseado no aspect ratio ──
  const headlineLineClamp = autoFit.headlineLineClamp;
  const bodyLineClamp = autoFit.bodyLineClamp;

  // ── Padding dinâmico baseado no aspect ratio ──
  const dynamicPadding = autoFit.padding;

  // ── Layout patterns distintos ──
  {/*const isLayoutCentered = layout === "centered";
  const isLayoutLeftAligned = layout === "left-aligned";
  const isLayoutSplit = layout === "split";
  const isLayoutMinimal = layout === "minimal";
  const isLayoutModern = (layout as string) === "modern-card" || !!dt;*/}

  // ── Layout patterns distintos ──
  const isLayoutCentered = layout === "centered";
  const isLayoutLeftAligned = layout === "left-aligned";
  const isLayoutSplit = layout === "split";
  const isLayoutMinimal = layout === "minimal";
  const isLayoutModern = (layout as string) === "modern-card"; // Removido o '|| !!dt' que forçava o layout errado

  // ── Imagem de fundo com filtros ──────────────────────────────────────────────
  const is = imageSettings;
  {/*const objPos = bgOverlay
    ? `${bgOverlay.position.x}% ${bgOverlay.position.y}%`
    : `${is?.panX ?? 50}% ${is?.panY ?? 50}%`;

  const imgStyle: React.CSSProperties = {
    filter: `brightness(${is?.brightness ?? 100}%) contrast(${is?.contrast ?? 100}%) saturate(${is?.saturation ?? 100}%) blur(${is?.blur ?? 0}px)`,
    transform: `scale(${is?.zoom ?? 1})`,
    transformOrigin: "center",
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
    objectPosition: objPos,
  };*/}

  // O PAN agora olha exclusivamente para o imageSettings (is), conectado direto aos sliders do Zustand
  const objPos = `${is?.panX ?? 50}% ${is?.panY ?? 50}%`;

  // Multiplicamos os valores por 100 para converter a escala 0-2 em 0%-200%
  const imgStyle: React.CSSProperties = {
    filter: `brightness(${(is?.brightness ?? 1) * 100}%) contrast(${(is?.contrast ?? 1) * 100}%) saturate(${(is?.saturation ?? 1) * 100}%) blur(${is?.blur ?? 0}px)`,
    transform: `scale(${is?.zoom ?? 1})`,
    transformOrigin: "center",
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
    objectPosition: objPos,
  };

  // Overlay: bgOverlay has priority over imageSettings overlay
  const overlayColor = bgOverlay?.color ?? "#000000";
  const overlayOpacity = bgOverlay?.opacity ?? 0;
  const blendMode = is?.blendMode ?? "normal";

  const overlayDiv = overlayOpacity > 0 ? (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: overlayColor,
        opacity: overlayOpacity,
        mixBlendMode: blendMode as React.CSSProperties["mixBlendMode"],
      }}
    />
  ) : null;

  const renderBgImage = (gradientStyle: string) => {
    if (dt || theme) return null; // A imagem agora vai no nível raiz (Canvas)
    return resolvedImageUrl ? (
      <div className="absolute inset-0">
        <img src={resolvedImageUrl} alt="" style={imgStyle} />
        {overlayDiv}
        <div
          className="absolute inset-0"
          style={{ background: gradientStyle }}
        />
      </div>
    ) : null;
  };

  const renderAdvancedTextElements = () => {
    if (!variation.textElements || variation.textElements.length === 0) return null;
    return (
      <div className="absolute inset-0 z-20 pointer-events-none">
        {variation.textElements.map(el => (
          <AdvancedTextNode
            key={el.id}
            element={el}
            isSelected={false}
            onSelect={() => { }}
            onChange={() => { }}
            scale={1}
          />
        ))}
      </div>
    );
  };

  // ── Handlers & Wrappers for Flexbox + Draggable ──
  const handleDragPosition = (target: "headline" | "body" | "accentBar" | "badge" | "sticker", x: number, y: number) => {
    if (!layoutSettings) return;
    let finalX = x;
    let finalY = y;
    if (isMagnetActive) {
      const SNAP_POINTS = [10, 30, 50, 70, 90];
      const snap = (val: number) => SNAP_POINTS.reduce((prev, curr) => Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev);
      finalX = snap(x);
      finalY = snap(y);
    }
    updateLayoutSettings({
      ...layoutSettings,
      [target]: { ...layoutSettings[target], freePosition: { x: finalX, y: finalY } }
    });
  };

  const handleResizeBlock = (target: "headline" | "body" | "accentBar" | "badge" | "sticker", width: number) => {
    if (!layoutSettings) return;
    updateLayoutSettings({
      ...layoutSettings,
      [target]: { ...layoutSettings[target], width }
    });
  };

  const handleSelectElement = (target: "headline" | "body" | "accentBar" | "card" | "badge" | "sticker" | "global") => {
    if (target === 'headline' || target === 'body' || target === 'badge' || target === 'sticker' || target === 'accentBar') {
      setLayoutTarget(target);
    } else {
      setLayoutTarget('global');
    }
  };

  const Draggable = ({ target, children, color }: { target: "headline" | "body" | "accentBar" | "badge" | "sticker", children: React.ReactNode, color?: string }) => {
    if (!layoutSettings || !layoutSettings[target]) return <>{children}</>;
    return (
      <DraggableBlock
        layoutPos={layoutSettings[target] as LayoutPosition}
        padding={compact ? 12 : 24}
        containerRef={layoutRef}
        snapEnabled={isMagnetActive && !compact}
        onDragEnd={(x, y) => handleDragPosition(target, x, y)}
        onResize={(w) => handleResizeBlock(target, w)}
        onSelect={() => handleSelectElement(target)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (!compact && (target === 'headline' || target === 'body' || target === 'badge' || target === 'sticker')) setInlineEditTarget(target as any);
        }}
        accentColor={color || effectiveText}
        isDraggable={!compact && inlineEditTarget !== target}
        forceSelected={layoutTarget === target}
        defaultWidth={target === 'badge' || target === 'sticker' ? 'max-content' : '100%'}
      >
        {children}
      </DraggableBlock>
    );
  };



  // ── Helpers para UI Clone (exemplo.html) ────────────────────────────────────
  const renderHeadline = (text: string, highlightColor: string, isPlayfulTheme: boolean) => {
    if (!text || !isPlayfulTheme || !dt) return <>{text}</>;
    const words = text.split(" ");
    if (words.length <= 1) return <>{text}</>;
    const lastWord = words.pop();
    return (
      <>
        {words.join(" ")}{" "}
        <span style={{ color: highlightColor }}>{lastWord}</span>
      </>
    );
  };

  const renderTopBar = () => {
    if (!copyAngle?.badge || compact) return null;

    const borderRadius = dt?.structure?.borderRadius || '999px';
    const border = dt?.structure?.border || 'none';
    const boxShadow = dt?.structure?.boxShadow && dt.structure.boxShadow !== 'none' && dt.structure.boxShadow.includes('0px 0px') ? '2px 2px 0px 0px rgba(0,0,0,0.1)' : 'none';
    const primaryColor = effectiveAccent;

    return (
      <div className="z-10 flex justify-center items-center w-full mb-auto transition-all duration-500 pointer-events-none">
        <div className="pointer-events-auto">
          <Draggable target="badge" color={primaryColor}>
            <div
              className="px-4 py-1.5 font-bold text-sm bg-white"
              style={{ borderRadius: '999px', border, color: primaryColor, boxShadow, outline: 'none' }}
              contentEditable={inlineEditTarget === 'badge'}
              suppressContentEditableWarning={true}
              onPaste={(e) => {
                e.preventDefault();
                const text = e.clipboardData.getData("text/plain");
                document.execCommand("insertText", false, text);
              }}
              onBlur={(e) => {
                const cleanText = e.currentTarget.innerText.trim();
                useEditorStore.getState().updateVariation({ copyAngle: { ...copyAngle, badge: cleanText } });
                setInlineEditTarget(null);
              }}
            >
              {copyAngle.badge}
            </div>
          </Draggable>
        </div>
      </div>
    );
  };

  const renderBottomBar = () => {
    if (!copyAngle?.stickerText || compact) return null;

    const isCenter = dt?.typography?.textAlign === 'center';
    const border = dt?.structure?.border || 'none';
    const primaryColor = effectiveAccent;
    const isCarousel = variation.postMode === 'carousel' || (variation.slides && variation.slides.length > 1);

    return (
      <div className={`w-full flex mt-6 transition-all duration-500 font-sans z-10 mt-auto pointer-events-none ${isCenter ? 'justify-center gap-6' : 'justify-between items-end'}`}>
        <div className="pointer-events-auto">
          <Draggable target="sticker" color={primaryColor}>
            {isPlayful ? (
              <div className="relative group transition-transform">
                <div className="absolute inset-0 bg-black translate-x-1 translate-y-1 transition-all"></div>
                <div
                  className="relative px-3 py-2 flex items-center justify-center rotate-[-8deg] bg-white transition-all"
                  style={{ border }}
                >
                  <span
                    className="font-bold text-sm tracking-wider uppercase"
                    style={{ color: primaryColor, outline: 'none' }}
                    contentEditable={inlineEditTarget === 'sticker'}
                    suppressContentEditableWarning={true}
                    onPaste={(e) => {
                      e.preventDefault();
                      const text = e.clipboardData.getData("text/plain");
                      document.execCommand("insertText", false, text);
                    }}
                    onBlur={(e) => {
                      const cleanText = e.currentTarget.innerText.trim();
                      useEditorStore.getState().updateVariation({ copyAngle: { ...copyAngle, stickerText: cleanText } });
                      setInlineEditTarget(null);
                    }}
                  >
                    {copyAngle.stickerText}
                  </span>
                </div>
              </div>
            ) : (
              <div
                className="px-3 py-1 rounded-full font-bold text-[10px] uppercase tracking-widest transition-all duration-500"
                style={{
                  background: `linear-gradient(135deg, ${effectiveAccent}, ${effectiveAccent}dd)`,
                  color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.2)', boxShadow: `0 4px 15px -3px ${effectiveAccent}40`, border: '1px solid rgba(255,255,255,0.1)', outline: 'none'
                }}
                contentEditable={inlineEditTarget === 'sticker'}
                suppressContentEditableWarning={true}
                onPaste={(e) => {
                  e.preventDefault();
                  const text = e.clipboardData.getData("text/plain");
                  document.execCommand("insertText", false, text);
                }}
                onBlur={(e) => {
                  const cleanText = e.currentTarget.innerText.trim();
                  useEditorStore.getState().updateVariation({ copyAngle: { ...copyAngle, stickerText: cleanText } });
                  setInlineEditTarget(null);
                }}
              >
                {copyAngle.stickerText}
              </div>
            )}
          </Draggable>
        </div>
        {isCarousel && (
          <div className="pointer-events-auto">
            <ArrowRight className="w-6 h-6 lg:w-8 lg:h-8 transition-all duration-300 shrink-0" style={{ color: effectiveText }} />
          </div>
        )}
      </div>
    );
  };


  // ══════════════════════════════════════════════════════════════════
  // STORY LAYOUT (9:16)
  // ══════════════════════════════════════════════════════════════════
  const storyContent = (
    <div
      ref={layoutRef}
      className="relative flex flex-col w-full overflow-hidden"
      style={{
        background: dt || theme ? 'transparent' : effectiveBg,
        aspectRatio: compact ? undefined : aspectRatioCSS,
        minHeight: compact ? 80 : undefined,
        padding: compact ? "1rem" : dynamicPadding,
      }}
    >
      {renderBgImage(`linear-gradient(to bottom,
        ${effectiveBg}22 0%,
        ${effectiveBg}88 50%,
        ${effectiveBg}cc 100%)`)}

      <div className="z-10 flex flex-col justify-center flex-1 gap-4 h-full">
        {renderTopBar()}
        <div className="flex flex-col flex-1 justify-center gap-4">
          {!compact && (
            <Draggable target="accentBar" color={effectiveAccent}>
              <AccentBar color={effectiveAccent} width="3rem" height="3px" align="flex-start" />
            </Draggable>
          )}
          <Draggable target="headline" color={effectiveHeadlineText}>
            <h2
              className="font-bold"
              contentEditable={inlineEditTarget === 'headline'}
              suppressContentEditableWarning={true}
              onPaste={(e) => {
                e.preventDefault();
                const text = e.clipboardData.getData("text/plain");
                document.execCommand("insertText", false, text);
              }}
              onBlur={(e) => {
                const cleanText = e.currentTarget.innerText.trim();
                commitCarouselAwareUpdate({ headline: cleanText });
                setInlineEditTarget(null);
              }}
              style={{
                color: effectiveHeadlineText,
                fontFamily: headingFont,
                fontSize: headingSize,
                lineHeight: 1.25,
                textAlign: textAlign ?? "left",
                wordBreak: "break-word",
                overflowWrap: "break-word",
                whiteSpace: "pre-wrap",
                outline: "none",
              }}
            >
              {inlineEditTarget === 'headline' ? headline : renderHeadline(headline, effectiveAccent, isPlayful)}
            </h2>
          </Draggable>
          {body && !compact && (
            <div
              className="w-full rounded-full"
              style={{ height: "1px", background: `${effectiveAccent}30` }}
            />
          )}
          {body && (
            <Draggable target="body" color={effectiveBodyText}>
              <p
                className={compact ? "line-clamp-2" : ""}
                contentEditable={inlineEditTarget === 'body'}
                suppressContentEditableWarning={true}
                onPaste={(e) => {
                  e.preventDefault();
                  const text = e.clipboardData.getData("text/plain");
                  document.execCommand("insertText", false, text);
                }}
                onBlur={(e) => {
                  const cleanText = e.currentTarget.innerText.trim();
                  commitCarouselAwareUpdate({ body: cleanText });
                  setInlineEditTarget(null);
                }}
                style={{
                  color: effectiveBodyText,
                  fontFamily: bodyFont,
                  fontSize: bodySize,
                  lineHeight: 1.65,
                  opacity: 0.85,
                  textAlign: textAlign ?? "left",
                  whiteSpace: "pre-wrap",
                  outline: "none",
                }}
              >
                {body}
              </p>
            </Draggable>
          )}
          {!compact && (
            <TemplateSections
              template={variation.template}
              sections={variation.sections}
              accentColor={effectiveAccent}
              textColor={effectiveText}
              bodyFont={bodyFont}
            />
          )}
        </div>
        {renderBottomBar()}


        {/* Absolute text elements from Architect 2.0 */}
        {renderAdvancedTextElements()}
      </div>
    </div>
  );


  // ══════════════════════════════════════════════════════════════════
  // LAYOUT: CENTERED - Texto centralizado verticalmente
  // ══════════════════════════════════════════════════════════════════
  const centeredLayout = (
    <div
      ref={layoutRef}
      className="relative flex flex-col w-full overflow-hidden"
      style={{
        background: dt || theme ? 'transparent' : effectiveBg,
        aspectRatio: compact ? undefined : aspectRatioCSS,
        minHeight: compact ? 80 : undefined,
        padding: compact ? "1rem" : dynamicPadding,
      }}
    >
      {renderBgImage(`linear-gradient(to bottom, ${effectiveBg}22 0%, ${effectiveBg}66 50%, ${effectiveBg}aa 100%)`)}

      <div className="z-10 flex flex-col justify-center items-center flex-1 text-center gap-3 h-full w-full">
        {renderTopBar()}
        {variation.postMode === 'carousel' && !compact && (
          <div className="absolute top-0 right-0 bg-black/40 backdrop-blur-md px-2 py-1 rounded-full flex items-center gap-1 border border-white/10">
            <Layers size={12} className="text-white" />
            <span className="text-[10px] font-medium text-white">Carrossel</span>
          </div>
        )}
        <div className="flex flex-col flex-1 justify-center items-center gap-3 w-full">
          {!compact && (
            <Draggable target="accentBar" color={effectiveAccent}>
              <AccentBar color={effectiveAccent} width="3rem" height="3px" align="center" />
            </Draggable>
          )}
          <Draggable target="headline" color={effectiveHeadlineText}>
            <h2
              className={`font-bold leading-tight ${compact ? "line-clamp-2" : ""}`}
              contentEditable={inlineEditTarget === 'headline'}
              suppressContentEditableWarning={true}
              onPaste={(e) => {
                e.preventDefault();
                const text = e.clipboardData.getData("text/plain");
                document.execCommand("insertText", false, text);
              }}
              onBlur={(e) => {
                const cleanText = e.currentTarget.innerText.trim();
                commitCarouselAwareUpdate({ headline: cleanText });
                setInlineEditTarget(null);
              }}
              style={{
                color: effectiveHeadlineText,
                fontFamily: headingFont,
                fontSize: `calc(${headingSize} * 1.15)`,
                whiteSpace: "pre-wrap",
                outline: "none",
              }}
            >
              {inlineEditTarget === 'headline' ? headline : renderHeadline(headline, effectiveAccent, isPlayful)}
            </h2>
          </Draggable>
          {body && (
            <Draggable target="body" color={effectiveBodyText}>
              <p
                className={`${compact ? "line-clamp-2" : ""} opacity-75 max-w-[90%] mx-auto`}
                contentEditable={inlineEditTarget === 'body'}
                suppressContentEditableWarning={true}
                onPaste={(e) => {
                  e.preventDefault();
                  const text = e.clipboardData.getData("text/plain");
                  document.execCommand("insertText", false, text);
                }}
                onBlur={(e) => {
                  const cleanText = e.currentTarget.innerText.trim();
                  commitCarouselAwareUpdate({ body: cleanText });
                  setInlineEditTarget(null);
                }}
                style={{
                  color: effectiveBodyText,
                  fontFamily: bodyFont,
                  fontSize: bodySize,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  outline: "none",
                }}
              >
                {body}
              </p>
            </Draggable>
          )}
          {!compact && (
            <TemplateSections
              template={variation.template}
              sections={variation.sections}
              accentColor={effectiveAccent}
              textColor={effectiveText}
              bodyFont={bodyFont}
            />
          )}
        </div>
        {renderBottomBar()}


        {/* Absolute text elements from Architect 2.0 */}
        {renderAdvancedTextElements()}
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════
  // LAYOUT: LEFT-ALIGNED - Texto na base, alinhado à esquerda (clássico)
  // ══════════════════════════════════════════════════════════════════
  const leftAlignedLayout = (
    <div
      ref={layoutRef}
      className="relative flex flex-col w-full overflow-hidden"
      style={{
        background: dt || theme ? 'transparent' : effectiveBg,
        aspectRatio: compact ? undefined : aspectRatioCSS,
        minHeight: compact ? 80 : undefined,
        padding: compact ? "1.25rem" : dynamicPadding,
      }}
    >
      {renderBgImage(`linear-gradient(to bottom, ${effectiveBg}11 0%, ${effectiveBg}77 60%, ${effectiveBg}cc 100%)`)}

      <div className="z-10 flex flex-col gap-2 h-full w-full text-left items-start">
        {renderTopBar()}
        {variation.postMode === 'carousel' && !compact && (
          <div className="absolute top-[-30px] right-0 bg-black/40 backdrop-blur-md px-2 py-1 rounded-full flex items-center gap-1 border border-white/10">
            <Layers size={12} className="text-white" />
            <span className="text-[10px] font-medium text-white">Carrossel</span>
          </div>
        )}
        <div className="flex flex-col gap-2 mt-auto w-full">
          {!compact && (
            <Draggable target="accentBar" color={effectiveAccent}>
              <AccentBar color={effectiveAccent} width="2.5rem" height="3px" align="flex-start" />
            </Draggable>
          )}
          <Draggable target="headline" color={effectiveHeadlineText}>
            <h2
              className={`font-bold leading-tight ${compact ? "line-clamp-2" : ""}`}
              contentEditable={inlineEditTarget === 'headline'}
              suppressContentEditableWarning={true}
              onPaste={(e) => {
                e.preventDefault();
                const text = e.clipboardData.getData("text/plain");
                document.execCommand("insertText", false, text);
              }}
              onBlur={(e) => {
                const cleanText = e.currentTarget.innerText.trim();
                commitCarouselAwareUpdate({ headline: cleanText });
                setInlineEditTarget(null);
              }}
              style={{
                color: effectiveHeadlineText,
                fontFamily: headingFont,
                fontSize: headingSize,
                whiteSpace: "pre-wrap",
                outline: "none",
              }}
            >
              {inlineEditTarget === 'headline' ? headline : renderHeadline(headline, effectiveAccent, isPlayful)}
            </h2>
          </Draggable>
          {body && (
            <Draggable target="body" color={effectiveBodyText}>
              <p
                className={`${compact ? "line-clamp-2" : ""} opacity-80`}
                contentEditable={inlineEditTarget === 'body'}
                suppressContentEditableWarning={true}
                onPaste={(e) => {
                  e.preventDefault();
                  const text = e.clipboardData.getData("text/plain");
                  document.execCommand("insertText", false, text);
                }}
                onBlur={(e) => {
                  const cleanText = e.currentTarget.innerText.trim();
                  commitCarouselAwareUpdate({ body: cleanText });
                  setInlineEditTarget(null);
                }}
                style={{
                  color: effectiveBodyText,
                  fontFamily: bodyFont,
                  fontSize: bodySize,
                  lineHeight: 1.55,
                  outline: "none",
                }}
              >
                {body}
              </p>
            </Draggable>
          )}
          {!compact && (
            <TemplateSections
              template={variation.template}
              sections={variation.sections}
              accentColor={effectiveAccent}
              textColor={effectiveText}
              bodyFont={bodyFont}
            />
          )}
        </div>
        {renderBottomBar()}

        {/* Absolute text elements from Architect 2.0 */}
        {renderAdvancedTextElements()}
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════
  // LAYOUT: SPLIT — Bipartido: card dividido em duas metades
  // Metade imagem (sem gradiente, objeto puro) + metade texto (fundo sólido)
  // variation.splitImagePosition controla qual metade tem a imagem ('top' | 'bottom')
  // ══════════════════════════════════════════════════════════════════
  const splitLayout = (() => {
    const imageOnTop = variation.splitImagePosition !== 'bottom';

    const ImageHalf = (
      <div
        className="relative w-full overflow-hidden"
        style={{ flex: '0 0 50%', minHeight: compact ? 60 : undefined }}
      >
        {resolvedImageUrl ? (
          <img
            src={resolvedImageUrl}
            alt=""
            style={{ ...imgStyle, objectFit: 'cover', width: '100%', height: '100%', position: 'absolute', inset: 0 }}
          />
        ) : (
          // Placeholder quando não há imagem
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: `color-mix(in srgb, ${cardBg} 80%, white 20%)`, minHeight: compact ? 60 : 120 }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
              style={{ color: `${cardText}40`, opacity: 0.5 }}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          </div>
        )}
      </div>
    );

    const TextHalf = (
      <div
        className="flex flex-col justify-center items-start gap-2"
        style={{
          flex: '1 1 50%',
          padding: compact ? '0.75rem' : dynamicPadding,
          background: cardBg,
        }}
      >
        {!compact && (
          <Draggable target="accentBar" color={effectiveAccent}>
            <AccentBar color={effectiveAccent} width="2rem" height="3px" align="flex-start" />
          </Draggable>
        )}
        <Draggable target="headline" color={effectiveHeadlineText}>
          <h2
            className={`font-bold leading-tight ${compact ? 'line-clamp-2' : ''}`}
            contentEditable={inlineEditTarget === 'headline'}
            suppressContentEditableWarning={true}
            onPaste={(e) => {
              e.preventDefault();
              const text = e.clipboardData.getData("text/plain");
              document.execCommand("insertText", false, text);
            }}
            onBlur={(e) => {
              const cleanText = e.currentTarget.innerText.trim();
              commitCarouselAwareUpdate({ headline: cleanText });
              setInlineEditTarget(null);
            }}
            style={{
              color: effectiveHeadlineText,
              fontFamily: headingFont,
              fontSize: headingSize,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'break-word',
              outline: 'none',
            }}
          >
            {inlineEditTarget === 'headline' ? headline : renderHeadline(headline, effectiveAccent, isPlayful)}
          </h2>
        </Draggable>
        {body && (
          <Draggable target="body" color={effectiveBodyText}>
            <p
              className={`${compact ? 'line-clamp-2' : ''} opacity-80`}
              contentEditable={inlineEditTarget === 'body'}
              suppressContentEditableWarning={true}
              onPaste={(e) => {
                e.preventDefault();
                const text = e.clipboardData.getData("text/plain");
                document.execCommand("insertText", false, text);
              }}
              onBlur={(e) => {
                const cleanText = e.currentTarget.innerText.trim();
                commitCarouselAwareUpdate({ body: cleanText });
                setInlineEditTarget(null);
              }}
              style={{
                color: effectiveBodyText,
                fontFamily: bodyFont,
                fontSize: bodySize,
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'break-word',
                outline: 'none',
              }}
            >
              {body}
            </p>
          </Draggable>
        )}
      </div>
    );

    return (
      <div
        ref={layoutRef}
        className={`relative flex ${imageOnTop ? 'flex-col' : 'flex-col-reverse'} w-full overflow-hidden`}
        style={{
          background: dt || theme ? 'transparent' : cardBg,
          aspectRatio: compact ? undefined : aspectRatioCSS,
          minHeight: compact ? 80 : undefined,
        }}
      >
        {ImageHalf}
        {TextHalf}


        {/* Absolute text elements from Architect 2.0 */}
        {renderAdvancedTextElements()}
      </div>
    );
  })();



  // ══════════════════════════════════════════════════════════════════
  // LAYOUT: MINIMAL - Apenas headline centralizado, sem corpo, ultra-clean
  // ══════════════════════════════════════════════════════════════════
  const minimalLayout = (
    <div
      ref={layoutRef}
      className="relative flex flex-col w-full overflow-hidden"
      style={{
        background: dt || theme ? 'transparent' : effectiveBg,
        aspectRatio: compact ? undefined : aspectRatioCSS,
        minHeight: compact ? 80 : undefined,
        padding: compact ? "1.5rem" : (typeof dynamicPadding === 'number' ? dynamicPadding * 1.5 : dynamicPadding),
      }}
    >
      {renderBgImage(`linear-gradient(to bottom, ${effectiveBg}00 0%, ${effectiveBg}22 100%)`)}

      {/* MINIMAL: Apenas headline, tipografia grande, muito espaço negativo */}
      <div className="z-10 flex flex-col justify-center items-center flex-1 text-center w-full h-full">
        {renderTopBar()}
        {variation.postMode === 'carousel' && !compact && (
          <div className="absolute top-0 right-0 bg-black/30 backdrop-blur-sm px-2 py-1 rounded-full flex items-center gap-1">
            <Layers size={10} className="text-white/80" />
            <span className="text-[9px] font-medium text-white/80">Carrossel</span>
          </div>
        )}
        <div className="flex flex-col flex-1 justify-center items-center w-full">
          <Draggable target="headline" color={effectiveHeadlineText}>
            <h2
              className="font-bold leading-[1.1] tracking-tight"
              contentEditable={inlineEditTarget === 'headline'}
              suppressContentEditableWarning={true}
              onPaste={(e) => {
                e.preventDefault();
                const text = e.clipboardData.getData("text/plain");
                document.execCommand("insertText", false, text);
              }}
              onBlur={(e) => {
                const cleanText = e.currentTarget.innerText.trim();
                commitCarouselAwareUpdate({ headline: cleanText });
                setInlineEditTarget(null);
              }}
              style={{
                color: effectiveHeadlineText,
                fontFamily: headingFont,
                fontSize: compact ? headingSize : `calc(${headingSize} * 1.4)`,
                maxWidth: "95%",
                whiteSpace: "pre-wrap",
                outline: "none",
              }}
            >
              {inlineEditTarget === 'headline' ? headline : renderHeadline(headline, effectiveAccent, isPlayful)}
            </h2>
          </Draggable>
          {/* Corpo NÃO aparece no layout minimal - apenas headline */}
        </div>
        {renderBottomBar()}
      </div>

      {/* Absolute text elements from Architect 2.0 */}
      {renderAdvancedTextElements()}
    </div>
  );

  // ══════════════════════════════════════════════════════════════════
  // LAYOUT: MODERN CARD - O "Motor Camaleão" do exemplo.html
  // ══════════════════════════════════════════════════════════════════
  const modernCardLayout = (
    <div
      ref={layoutRef}
      className="relative flex flex-col w-full h-full overflow-hidden"
      style={{
        background: dt || theme ? 'transparent' : effectiveBg,
        aspectRatio: compact ? undefined : aspectRatioCSS,
        padding: compact ? "1rem" : dynamicPadding,
      }}
    >
      {renderBgImage(`linear-gradient(to bottom, ${effectiveBg}11 0%, ${effectiveBg}66 100%)`)}
      {/* Elementos Decorativos Playful de Fundo */}
      {isPlayful && (
        <div className="absolute inset-0 pointer-events-none opacity-80 z-0">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, #000 1.5px, transparent 1.5px)', backgroundSize: '24px 24px' }}></div>
          <div className="absolute top-10 left-8 w-3 h-5 -rotate-12 transition-all duration-300" style={{ backgroundColor: effectiveBodyText, border: dt?.structure?.border }}></div>
          <div className="absolute bottom-16 right-10 w-5 h-5 rounded-full transition-all duration-300" style={{ backgroundColor: effectiveAccent, border: dt?.structure?.border }}></div>
          <div className="absolute top-32 right-6 w-3 h-3 rotate-45 transition-all duration-300" style={{ backgroundColor: effectiveHeadlineText, border: dt?.structure?.border }}></div>
          <div className="absolute bottom-10 left-12 w-4 h-2 -rotate-[20deg] transition-all duration-300" style={{ backgroundColor: cardBg, border: dt?.structure?.border }}></div>
        </div>
      )}
      <div className="flex flex-col w-full h-full z-10">
        {renderTopBar()}
        <div className="flex-1 flex items-center justify-center w-full mt-4">
          {/* Sombra Brutalista Hachurada */}
          {isPlayful && dt?.structure?.boxShadow?.includes('0px 0px') && (
            <div
              className="absolute inset-0 bg-black/10 transform translate-x-3 translate-y-3 transition-all duration-500"
              style={{
                backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.1) 5px, rgba(0,0,0,0.1) 10px)',
                borderRadius: dt?.structure?.borderRadius || '16px'
              }}
            />
          )}
          {/* Card Interno (Sem relative para não quebrar a âncora de arraste absoluto) */}
          <div
            className="w-full flex flex-col justify-center transition-all duration-500 ease-in-out min-w-0"
            style={{
              backgroundColor: cardBg,
              boxShadow: dt?.structure?.boxShadow || 'none',
              border: dt?.structure?.border || 'none',
              borderRadius: dt?.structure?.borderRadius || '16px',
              alignItems: textAlign === 'center' ? 'center' : 'flex-start',
              textAlign: textAlign || 'left',
              padding: compact ? "1.5rem" : "2rem",
            }}
          >
            <Draggable target="headline" color={effectiveHeadlineText}>
              <h2
                className={`font-bold leading-tight ${compact ? "line-clamp-2" : ""}`}
                contentEditable={inlineEditTarget === 'headline'}
                suppressContentEditableWarning={true}
                onPaste={(e) => {
                  e.preventDefault();
                  const text = e.clipboardData.getData("text/plain");
                  document.execCommand("insertText", false, text);
                }}
                onBlur={(e) => {
                  const cleanText = e.currentTarget.innerText.trim();
                  commitCarouselAwareUpdate({ headline: cleanText });
                  setInlineEditTarget(null);
                }}
                style={{
                  color: effectiveHeadlineText,
                  fontFamily: headingFont,
                  fontSize: headingSize,
                  whiteSpace: "pre-wrap",
                  outline: "none",
                  width: "100%",
                  textTransform: headlineTextTransform as any,
                }}
              >
                {inlineEditTarget === 'headline' ? headline : renderHeadline(headline, effectiveAccent, isPlayful)}
              </h2>
            </Draggable>
            {body && (
              <div className="mt-4 w-full">
                <Draggable target="body" color={effectiveBodyText}>
                  <p
                    className={`${compact ? "line-clamp-2" : ""} opacity-80`}
                    contentEditable={inlineEditTarget === 'body'}
                    suppressContentEditableWarning={true}
                    onPaste={(e) => {
                      e.preventDefault();
                      const text = e.clipboardData.getData("text/plain");
                      document.execCommand("insertText", false, text);
                    }}
                    onBlur={(e) => {
                      const cleanText = e.currentTarget.innerText.trim();
                      commitCarouselAwareUpdate({ body: cleanText });
                      setInlineEditTarget(null);
                    }}
                    style={{
                      color: effectiveBodyText,
                      fontFamily: bodyFont,
                      fontSize: bodySize,
                      lineHeight: 1.55,
                      outline: "none",
                      width: "100%",
                    }}
                  >
                    {body}
                  </p>
                </Draggable>
              </div>
            )}
            <div className="mt-8 w-full">
              {renderBottomBar()}
            </div>
          </div>
        </div>
      </div>
      {/* Absolute text elements from Architect 2.0 */}
      {renderAdvancedTextElements()}
    </div>
  );

  // ══════════════════════════════════════════════════════════════════
  // Seletor de layout
  // ══════════════════════════════════════════════════════════════════
  const visual = isStory
    ? storyContent
    : isLayoutModern
      ? modernCardLayout
      : isLayoutCentered
        ? centeredLayout
        : isLayoutSplit
          ? splitLayout
          : isLayoutMinimal
            ? minimalLayout
            : leftAlignedLayout; // fallback padrão (clássico)

  // DesignTokens path — ThemeRenderer handles structure, PostCard adds decorations
  if (dt) {
    const canvasBg = resolvedImageUrl ? 'transparent' : (dt.colors.background || effectiveBg);
    return (
      <div style={{ aspectRatio: aspectRatioCSS, position: "relative", width: "100%", overflow: "hidden", backgroundColor: effectiveBg }} className={compact ? "rounded-xl" : "rounded-2xl"}>
        {/* A Imagem de Fundo Raiz (z-0) */}
        {resolvedImageUrl && (
          <div className="absolute inset-0 z-0 pointer-events-none">
            <img src={resolvedImageUrl} alt="" style={imgStyle} />
            {overlayDiv}
            <div className="absolute inset-0" style={{ background: isStory ? `linear-gradient(to bottom, ${protectionColor}22 0%, ${protectionColor}88 50%, ${protectionColor}cc 100%)` : `linear-gradient(to bottom, ${protectionColor}11 0%, ${protectionColor}66 100%)` }} />
          </div>
        )}

        {/* O Card Flutuante (z-10) */}
        <div className="absolute inset-0 z-10 pointer-events-none">
          <ThemeRenderer
            designTokens={{
              ...dt,
              colors: { ...dt.colors, background: canvasBg, card: canvasBg }
            }}
            className="w-full h-full pointer-events-auto"
            cardRef={cardRef}
            cardLayout={layoutSettings?.card}
            onDragCard={async (x, y) => {
              const useEditorStore = (await import("@/store/editorStore")).useEditorStore;
              useEditorStore.getState().updateLayoutSettings({ card: { ...layoutSettings?.card, freePosition: { x, y } } as any });
            }}
            onResizeCard={async (w) => {
              const useEditorStore = (await import("@/store/editorStore")).useEditorStore;
              useEditorStore.getState().updateLayoutSettings({ card: { ...layoutSettings?.card, width: w } as any });
            }}
            isEditingCard={isEditingCard}
          >
            {resolvedBrandMeta && (
              <BrandOverlay
                logoUrl={resolvedBrandMeta.logoUrl}
                brandName={resolvedBrandMeta.brandName}
                platform={variation.platform}
                accentColor={dt.colors.primary}
                textColor={dt.colors.text}
              />
            )}
            {visual}
          </ThemeRenderer>
        </div>
      </div>
    );
  }

  if (theme) {
    const canvasBg = resolvedImageUrl ? 'transparent' : (theme.colors.bg || effectiveBg);
    return (
      <div style={{ aspectRatio: aspectRatioCSS, position: "relative", width: "100%", overflow: "hidden", backgroundColor: effectiveBg }} className={compact ? "rounded-xl" : "rounded-2xl"}>
        {resolvedImageUrl && (
          <div className="absolute inset-0 z-0 pointer-events-none">
            <img src={resolvedImageUrl} alt="" style={imgStyle} />
            {overlayDiv}
            <div className="absolute inset-0" style={{ background: isStory ? `linear-gradient(to bottom, ${protectionColor}22 0%, ${protectionColor}99 40%, ${protectionColor}ee 100%)` : `linear-gradient(to bottom, ${protectionColor}11 0%, ${protectionColor}66 100%)` }} />
          </div>
        )}
        <div className="absolute inset-0 z-10 pointer-events-none">
          <ThemeRenderer
            theme={{
              ...theme,
              colors: { ...theme.colors, bg: canvasBg },
            }}
            className="w-full h-full pointer-events-auto"
            cardRef={cardRef}
            cardLayout={layoutSettings?.card}
            onDragCard={async (x, y) => {
              const useEditorStore = (await import("@/store/editorStore")).useEditorStore;
              useEditorStore.getState().updateLayoutSettings({ card: { ...layoutSettings?.card, freePosition: { x, y } } as any });
            }}
            onResizeCard={async (w) => {
              const useEditorStore = (await import("@/store/editorStore")).useEditorStore;
              useEditorStore.getState().updateLayoutSettings({ card: { ...layoutSettings?.card, width: w } as any });
            }}
            isEditingCard={isEditingCard}
          >
            {resolvedBrandMeta && (
              <BrandOverlay
                logoUrl={resolvedBrandMeta.logoUrl}
                brandName={resolvedBrandMeta.brandName}
                platform={variation.platform}
                accentColor={theme.colors.accent}
                textColor={theme.colors.text}
                cardStyle={theme.layout.cardStyle}
              />
            )}
            {visual}
          </ThemeRenderer>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className={compact ? "rounded-xl overflow-hidden" : "rounded-2xl overflow-hidden"}
      style={{ background: effectiveBg, aspectRatio: aspectRatioCSS, width: "100%", position: "relative" }}
    >
      {visual}
    </div>
  );
}
