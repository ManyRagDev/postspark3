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
import { Layers, Users, Star, Zap, Heart, Globe, Calendar, Shield, Rocket, Target, Award, MessageCircle, TrendingUp, CheckCircle, Play, Camera, Music, MapPin, Clock, Gift, Sparkles, ArrowRight } from "lucide-react";
import type { PostVariation, AspectRatio, BackgroundValue, BgOverlaySettings, ContentSection, PostTemplate, DesignTokens } from "@shared/postspark";
import { ASPECT_RATIO_VALUES } from "@shared/postspark";
import type { ThemeConfig } from "@/lib/themes";
import type { ImageSettings, AdvancedLayoutSettings, TextPosition } from "@/types/editor";
import ThemeRenderer from "./ThemeRenderer";
import BrandOverlay from "./BrandOverlay";
import { useTextAutoFit } from "@/hooks/useTextAutoFit";
import { useDragElement } from "@/hooks/useDragElement";
import { useResizeElement } from "@/hooks/useResizeElement";
import { useDynamicFont } from "@/hooks/useDynamicFont";
// --- Canvas Components ---
import { AdvancedTextNode } from "@/components/canvas/AdvancedTextNode";
import { DraggableBlock, resolveLayoutStyle, resolvePosition, GRID_SNAP_POSITIONS } from "@/components/canvas/DraggableBlock";

interface PostCardProps {
  variation: PostVariation;
  compact?: boolean;
  theme?: ThemeConfig;
  /** CSS-ready design tokens from Chameleon Vision. Priority: designTokens > theme > variation. */
  designTokens?: DesignTokens;
  aspectRatio?: AspectRatio;
  imageSettings?: ImageSettings;
  advancedLayout?: AdvancedLayoutSettings;
  bgValue?: BackgroundValue;
  bgOverlay?: BgOverlaySettings;
  showOverflowWarning?: boolean;
  /** When true, variation colors take priority over theme colors (used in Workbench editor) */
  forceVariationColors?: boolean;
  /** Brand identity metadata for overlay rendering (logo, platform icon, decorative shapes) */
  brandMeta?: { logoUrl?: string; brandName?: string; favicon?: string };
  /** Callback para atualizar posição de texto ou do card via drag direto no canvas */
  onDragPosition?: (target: "headline" | "body" | "accentBar" | "card" | "badge" | "sticker", x: number, y: number) => void;
  /** Callback para atualizar largura do bloco ou do card via resize handles */
  onResizeBlock?: (target: "headline" | "body" | "accentBar" | "card" | "badge" | "sticker", width: number) => void;
  /** Se o snap magnético está ativo (usado junto com onDragPosition) */
  snapEnabled?: boolean;
  /** Se o card em si está em modo de edição (exibe borda e alças do card) */
  isEditingCard?: boolean;
  /** Callback para quando um elemento (headline, body, etc) é selecionado no canvas */
  onSelectElement?: (target: "headline" | "body" | "accentBar" | "card" | "badge" | "sticker") => void;
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
  MessageCircle, TrendingUp, CheckCircle, Play, Camera, Music, Map: MapPin, MapPin, Clock, Gift, Sparkles,
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

// resolvePosition and resolveLayoutStyle are now imported from DraggableBlock.tsx to ensure visual consistency between text elements and the card itself.

// ─── ArchitectOverlay ─────────────────────────────────────────────────────────
// A unified positioned layer that renders headline + body at absolute positions.
// It is always positioned relative to the card root (inset: 0),
// ensuring consistent behavior across ALL layouts and aspect ratios.
// Quando onDragPosition é fornecido, o texto se torna diretamente arrastável (Canva-like).
interface ArchitectOverlayProps {
  al: AdvancedLayoutSettings;
  headline: string;
  body?: string;
  effectiveText: string;       // cor base (fallback)
  headlineTextColor: string;   // cor do título (pode ser igual a effectiveText)
  bodyTextColor: string;       // cor do corpo (pode ser igual a effectiveText)
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  headingSize: string;
  bodySize: string;
  template?: PostTemplate;
  sections?: ContentSection[];
  cardRef: React.RefObject<HTMLDivElement | null>;
  onDragPosition?: (target: "headline" | "body" | "accentBar" | "badge" | "sticker", x: number, y: number) => void;
  onResizeBlock?: (target: "headline" | "body" | "accentBar" | "badge" | "sticker", width: number) => void;
  snapEnabled?: boolean;
  onSelectElement?: (target: "headline" | "body" | "accentBar" | "card" | "badge" | "sticker") => void;
  badgeNode?: React.ReactNode;
  stickerNode?: React.ReactNode;
}

// DraggableTextBlock and resolve helpers removed — now using shared DraggableBlock component.

function ArchitectOverlay({
  al,
  headline,
  body,
  effectiveText,
  headlineTextColor,
  bodyTextColor,
  accentColor,
  headingFont,
  bodyFont,
  headingSize,
  bodySize,
  template,
  sections,
  cardRef,
  onDragPosition,
  onResizeBlock,
  snapEnabled = true,
  onSelectElement,
  badgeNode,
  stickerNode,
}: ArchitectOverlayProps) {
  const headlineStyle = resolveLayoutStyle(al.headline, al.padding);
  const bodyStyle = resolveLayoutStyle(al.body, al.padding);
  const barStyle = al.accentBar ? resolveLayoutStyle(al.accentBar, al.padding) : { display: 'none' };

  // Larguras salvas (ou padrão)
  const headlineWidth = al.headline.width ?? 76;
  const bodyWidth = al.body.width ?? 76;
  const barWidth = al.accentBar?.width ?? 15;

  // Se onDragPosition não está disponível, renderiza texto estático (HoloDeck)
  if (!onDragPosition) {
    return (
      <>
        {al.accentBar && (
          <div className="absolute z-20" style={{ ...barStyle, width: `${barWidth}%` }}>
            <AccentBar color={accentColor} width="100%" />
          </div>
        )}
        <div className="absolute z-20" style={{
          ...headlineStyle,
          width: `${headlineWidth}%`,
          backgroundColor: al.headline.backgroundColor ?? 'transparent',
          borderRadius: al.headline.borderRadius ? `${al.headline.borderRadius}px` : '3px',
          padding: al.headline.backgroundColor ? '0.5rem 1rem' : undefined,
        }}>
          <h2
            className="font-bold"
            style={{
              color: headlineTextColor,
              fontFamily: headingFont,
              fontSize: headingSize,
              lineHeight: 1.22,
              textAlign: al.headline.textAlign,
              whiteSpace: "pre-wrap",
              overflowWrap: "break-word",
            }}
          >
            {headline}
          </h2>
        </div>
        {(body || (sections && sections.length > 0)) && (
          <div className="absolute z-20 flex flex-col gap-3" style={{
            ...bodyStyle,
            width: `${bodyWidth}%`,
            backgroundColor: al.body.backgroundColor ?? 'transparent',
            borderRadius: al.body.borderRadius ? `${al.body.borderRadius}px` : '3px',
            padding: al.body.backgroundColor ? '0.5rem 1rem' : undefined,
          }}>
            {body && (
              <p
                style={{
                  color: bodyTextColor,
                  fontFamily: bodyFont,
                  fontSize: bodySize,
                  lineHeight: 1.65,
                  opacity: 0.85,
                  textAlign: al.body.textAlign,
                  whiteSpace: "pre-wrap",
                  overflowWrap: "break-word",
                }}
              >
                {body}
              </p>
            )}
            <TemplateSections
              template={template}
              sections={sections}
              accentColor={accentColor}
              textColor={bodyTextColor}
              bodyFont={bodyFont}
            />
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {/* Barrinha arrastável */}
      {al.accentBar && (
        <DraggableBlock
          layoutPos={al.accentBar}
          padding={al.padding}
          containerRef={cardRef}
          onDragEnd={(x, y) => onDragPosition("accentBar", x, y)}
          onResize={(w) => onResizeBlock?.("accentBar", w)}
          onSelect={() => onSelectElement?.("accentBar")}
          snapEnabled={snapEnabled}
          accentColor={accentColor}
        >
          <AccentBar color={accentColor} width="100%" />
        </DraggableBlock>
      )}

      {/* Título arrastável + redimensionável */}
      <DraggableBlock
        layoutPos={al.headline}
        padding={al.padding}
        containerRef={cardRef}
        onDragEnd={(x, y) => onDragPosition("headline", x, y)}
        onResize={(w) => onResizeBlock?.("headline", w)}
        onSelect={() => onSelectElement?.("headline")}
        snapEnabled={snapEnabled}
        accentColor={effectiveText}
      >
        <h2
          className="font-bold"
          style={{
            color: headlineTextColor,
            fontFamily: headingFont,
            fontSize: headingSize,
            lineHeight: 1.22,
            textAlign: al.headline.textAlign,
            whiteSpace: "pre-wrap",
            overflowWrap: "break-word",
            width: "100%",
          }}
        >
          {headline}
        </h2>
      </DraggableBlock>

      {/* Corpo arrastável + redimensionável */}
      {(body || (sections && sections.length > 0)) && (
        <DraggableBlock
          layoutPos={al.body}
          padding={al.padding}
          containerRef={cardRef}
          onDragEnd={(x, y) => onDragPosition("body", x, y)}
          onResize={(w) => onResizeBlock?.("body", w)}
          onSelect={() => onSelectElement?.("body")}
          snapEnabled={snapEnabled}
          accentColor={effectiveText}
        >
          <div className="flex flex-col gap-3 w-full">
            {body && (
              <p
                style={{
                  color: bodyTextColor,
                  fontFamily: bodyFont,
                  fontSize: bodySize,
                  lineHeight: 1.65,
                  opacity: 0.85,
                  textAlign: al.body.textAlign,
                  whiteSpace: "pre-wrap",
                  overflowWrap: "break-word",
                  width: "100%",
                }}
              >
                {body}
              </p>
            )}
            <TemplateSections
              template={template}
              sections={sections}
              accentColor={accentColor}
              textColor={bodyTextColor}
              bodyFont={bodyFont}
            />
          </div>
        </DraggableBlock>
      )}

      {/* Badge arrastável + redimensionável */}
      {al.badge && badgeNode && (
        <DraggableBlock
          layoutPos={al.badge}
          padding={al.padding}
          containerRef={cardRef}
          onDragEnd={(x, y) => onDragPosition?.("badge", x, y)}
          onResize={(w) => onResizeBlock?.("badge", w)}
          onSelect={() => onSelectElement?.("badge")}
          snapEnabled={snapEnabled}
          accentColor={accentColor}
        >
          <div className={`w-full flex ${al.badge.textAlign === 'center' ? 'justify-center' : al.badge.textAlign === 'right' ? 'justify-end' : 'justify-start'}`}>
            {badgeNode}
          </div>
        </DraggableBlock>
      )}

      {/* Sticker arrastável + redimensionável */}
      {al.sticker && stickerNode && (
        <DraggableBlock
          layoutPos={al.sticker}
          padding={al.padding}
          containerRef={cardRef}
          onDragEnd={(x, y) => onDragPosition?.("sticker", x, y)}
          onResize={(w) => onResizeBlock?.("sticker", w)}
          onSelect={() => onSelectElement?.("sticker")}
          snapEnabled={snapEnabled}
          accentColor={accentColor}
        >
          <div className={`w-full flex items-center ${al.sticker.textAlign === 'center' ? 'justify-center' : al.sticker.textAlign === 'right' ? 'justify-end' : 'justify-start'}`}>
            {stickerNode}
          </div>
        </DraggableBlock>
      )}
    </>
  );
}

// ─── PostCard ────────────────────────────────────────────────────────────────
export default function PostCard({
  variation,
  compact = false,
  theme,
  designTokens,
  aspectRatio: ratioOverride,
  imageSettings,
  advancedLayout,
  bgValue,
  bgOverlay,
  showOverflowWarning = true,
  forceVariationColors = false,
  brandMeta,
  onSelectElement,
  onDragPosition,
  onResizeBlock,
  snapEnabled = true,
  isEditingCard = false,
}: PostCardProps) {
  // cardRef points to the main card container (inner layer) — managed by ThemeRenderer but referenced here
  // for drag/resize logic in child overlays.
  const cardRef = useRef<HTMLDivElement | null>(null);
  // layoutRef aponta para a div interna com aspectRatio — usada como container de referência pelo drag
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const { headline, body, imageUrl: variationImageUrl, backgroundColor, textColor, headlineColor, bodyColor, accentColor, layout } = variation;

  // Merge: variation-level tokens override prop-level tokens
  const dt = variation.designTokens
    ? { ...designTokens, ...variation.designTokens } as DesignTokens | undefined
    : designTokens;

  // Dynamic font loading from design tokens and variations
  useDynamicFont(dt?.typography?.fontFamily ?? '', dt?.typography?.customFontUrl ?? '');
  useDynamicFont(variation.headlineFontFamily ?? '');
  useDynamicFont(variation.bodyFontFamily ?? '');

  // ── Background resolution (priority: solid > bgValue.url > variation.imageUrl) ──
  const isSolid = bgValue?.type === "solid";
  const resolvedImageUrl = isSolid
    ? undefined
    : (bgValue?.url ?? variationImageUrl);

  const ratio: AspectRatio = ratioOverride ?? variation.aspectRatio ?? "1:1";
  const aspectRatioCSS = ASPECT_RATIO_VALUES[ratio];
  const isStory = ratio === "9:16";

  // ── Cores ──
  // Priority: forceVariationColors > designTokens > theme > variation defaults
  const effectiveBg = isSolid && bgValue?.color
    ? bgValue.color
    : (forceVariationColors && backgroundColor)
      ? backgroundColor
      : dt ? "transparent"
        : theme ? "transparent" : (backgroundColor || "#1a1a2e");
  const effectiveText = (forceVariationColors && textColor)
    ? textColor
    : dt ? dt.colors.text
      : theme ? theme.colors.text : (textColor || "#ffffff");

  // Cores independentes por elemento — fazem fallback para effectiveText quando não definidas
  const effectiveHeadlineText = (forceVariationColors && headlineColor) ? headlineColor : effectiveText;
  const effectiveBodyText = (forceVariationColors && bodyColor) ? bodyColor : effectiveText;
  const effectiveAccent = (forceVariationColors && accentColor)
    ? accentColor
    : dt ? dt.colors.primary
      : theme ? theme.colors.accent : (accentColor || "#a855f7");

  // Cores do card vêm dos tokens/tema quando disponíveis
  const cardBg = dt ? dt.colors.card : theme ? theme.colors.bg : effectiveBg;
  const cardText = dt ? dt.colors.text : theme ? theme.colors.text : effectiveText;
  const cardAccent = dt ? dt.colors.primary : theme ? theme.colors.accent : effectiveAccent;

  // Fonts: variation > designTokens > theme > defaults
  const headingFont = variation.headlineFontFamily
    ? `"${variation.headlineFontFamily}", sans-serif`
    : dt
      ? `"${dt.typography.fontFamily}", sans-serif`
      : theme ? theme.typography.headingFont : "var(--font-display)";
  const bodyFont = variation.bodyFontFamily
    ? `"${variation.bodyFontFamily}", sans-serif`
    : dt
      ? `"${dt.typography.fontFamily}", sans-serif`
      : theme ? theme.typography.bodyFont : "inherit";
  const textAlign = dt
    ? (dt.typography.textAlign as React.CSSProperties["textAlign"])
    : theme ? (theme.layout.alignment as React.CSSProperties["textAlign"]) : undefined;

  // Text transform from design tokens
  const headlineTextTransform = dt?.typography.textTransform ?? 'none';

  // Decorations: sticker + badge from copyAngle
  const copyAngle = variation.copyAngle;
  const isPlayful = dt?.decorations === 'playful';

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
  const isLayoutCentered = layout === "centered";
  const isLayoutLeftAligned = layout === "left-aligned";
  const isLayoutSplit = layout === "split";
  const isLayoutMinimal = layout === "minimal";

  // ── Imagem de fundo com filtros ──────────────────────────────────────────────
  const is = imageSettings;
  const objPos = bgOverlay
    ? `${bgOverlay.position.x}% ${bgOverlay.position.y}%`
    : `${is?.panX ?? 50}% ${is?.panY ?? 50}%`;

  const imgStyle: React.CSSProperties = is
    ? {
      filter: `brightness(${is.brightness}) contrast(${is.contrast}) saturate(${is.saturation}) blur(${is.blur}px)`,
      transform: `scale(${is.zoom})`,
      transformOrigin: "center",
      width: "100%",
      height: "100%",
      objectFit: "cover" as const,
      objectPosition: objPos,
    }
    : { width: "100%", height: "100%", objectFit: "cover" as const, objectPosition: objPos };

  // Overlay: bgOverlay has priority over imageSettings overlay
  const overlayColor = bgOverlay?.color ?? is?.overlayColor ?? "#000000";
  const overlayOpacity = bgOverlay?.opacity ?? is?.overlayOpacity ?? 0;
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

  const renderBgImage = (gradientStyle: string) =>
    resolvedImageUrl ? (
      <div className="absolute inset-0">
        <img src={resolvedImageUrl} alt="" style={imgStyle} />
        {overlayDiv}
        <div
          className="absolute inset-0"
          style={{ background: gradientStyle }}
        />
      </div>
    ) : null;

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

  // ── ArchitectOverlay shared props ──────────────────────────────────────────
  const architectProps: ArchitectOverlayProps | null = advancedLayout ? {
    al: advancedLayout,
    headline,
    body: body || "",
    template: variation.template,
    sections: variation.sections,
    effectiveText,
    headlineTextColor: effectiveHeadlineText,
    bodyTextColor: effectiveBodyText,
    accentColor: effectiveAccent,
    headingFont,
    bodyFont,
    headingSize: isLayoutCentered || isLayoutMinimal ? `calc(${headingSize} * 1.15)` : headingSize,
    bodySize,
    cardRef,
    onDragPosition,
    onResizeBlock,
    snapEnabled,
    onSelectElement,
    // FIX: Renderiza inner content para que o ArchitectOverlay assuma os wrappers flexbox/posições
    badgeNode: (() => {
      if (!copyAngle?.badge || compact) return null;
      const primaryColor = dt?.colors?.primary || effectiveAccent;
      const border = dt?.structure?.border || 'none';
      const boxShadow = dt?.structure?.boxShadow && dt.structure.boxShadow !== 'none' && dt.structure.boxShadow.includes('0px 0px') ? '2px 2px 0px 0px rgba(0,0,0,0.1)' : 'none';
      return (
        <div
          className="px-4 py-1.5 font-bold text-sm bg-white inline-block"
          style={{ borderRadius: dt?.structure?.borderRadius || '999px', border, color: primaryColor, boxShadow }}
        >
          {copyAngle.badge}
        </div>
      );
    })(),
    stickerNode: (() => {
      if (!copyAngle?.stickerText || compact) return null;
      const primaryColor = dt?.colors?.primary || effectiveAccent;
      const border = dt?.structure?.border || 'none';
      if (isPlayful) {
        return (
          <div className="relative group transition-transform inline-block">
            <div className="absolute inset-0 bg-black translate-x-1 translate-y-1 transition-all"></div>
            <div className="relative px-3 py-2 flex items-center justify-center rotate-[-8deg] bg-white transition-all" style={{ border }}>
              <span className="font-bold text-sm tracking-wider uppercase" style={{ color: primaryColor }}>{copyAngle.stickerText}</span>
            </div>
          </div>
        );
      }
      return (
        <div
          className="px-3 py-1 rounded-full font-bold text-[10px] uppercase tracking-widest inline-block transition-all duration-500"
          style={{
            background: `linear-gradient(135deg, ${effectiveAccent}, ${effectiveAccent}dd)`, color: '#fff',
            textShadow: '0 1px 2px rgba(0,0,0,0.2)', boxShadow: `0 4px 15px -3px ${effectiveAccent}40`, border: '1px solid rgba(255,255,255,0.1)'
          }}
        >
          {copyAngle.stickerText}
        </div>
      );
    })(),
  } : null;



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
    const primaryColor = dt?.colors?.primary || effectiveAccent;

    return (
      <div className="relative z-10 flex justify-center items-center w-full mb-auto transition-all duration-500">
        <div
          className="px-4 py-1.5 font-bold text-sm bg-white"
          style={{
            borderRadius: '999px',
            border,
            color: primaryColor,
            boxShadow
          }}
        >
          {copyAngle.badge}
        </div>
      </div>
    );
  };

  const renderBottomBar = () => {
    const isCarousel = variation.postMode === 'carousel' || (variation.slides && variation.slides.length > 1);
    const activeSlide = variation.postMode === 'carousel' && Array.isArray(variation.slides)
      ? variation.slides[0]
      : null;
    const isCtaSlide = Boolean(activeSlide?.isCtaSlide);
    const showCarouselArrow = isCarousel && !isCtaSlide;
    if ((!copyAngle?.stickerText && !showCarouselArrow) || compact) return null;

    const isCenter = dt?.typography?.textAlign === 'center';
    const border = dt?.structure?.border || 'none';
    const primaryColor = dt?.colors?.primary || effectiveAccent;

    return (
      <div
        className={`w-full flex mt-6 transition-all duration-500 font-sans z-10 mt-auto ${isCenter ? 'justify-center gap-6' : 'justify-between items-end'}`}
      >
        {copyAngle?.stickerText && (isPlayful ? (
          <div className="relative group transition-transform">
            <div className="absolute inset-0 bg-black translate-x-1 translate-y-1 transition-all"></div>
            <div
              className="relative px-3 py-2 flex items-center justify-center rotate-[-8deg] bg-white transition-all"
              style={{ border }}
            >
              <span className="font-bold text-sm tracking-wider uppercase" style={{ color: primaryColor }}>
                {copyAngle.stickerText}
              </span>
            </div>
          </div>
        ) : (
          <div
            className="px-3 py-1 rounded-full font-bold text-[10px] uppercase tracking-widest transition-all duration-500"
            style={{
              background: `linear-gradient(135deg, ${effectiveAccent}, ${effectiveAccent}dd)`,
              color: '#fff',
              textShadow: '0 1px 2px rgba(0,0,0,0.2)',
              boxShadow: `0 4px 15px -3px ${effectiveAccent}40`,
              border: '1px solid rgba(255,255,255,0.1)'
            }}
          >
            {copyAngle.stickerText}
          </div>
        ))}
        {showCarouselArrow && (
          <ArrowRight className="w-6 h-6 lg:w-8 lg:h-8 transition-all duration-300 shrink-0" style={{ color: effectiveText }} />
        )}
      </div>
    );
  };

  const renderDecorationsOverlay = () => {
    // Se o Overlay Dinâmico está ativo, o próprio ArchitectOverlay renderiza essas decorações como DraggableBlocks
    if (architectProps) return null;
    return (
      <div className="absolute inset-0 z-30 pointer-events-none flex flex-col justify-between" style={{ padding: compact ? "1rem" : dynamicPadding }}>
        {renderTopBar()}
        {renderBottomBar()}
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
        background: effectiveBg,
        aspectRatio: compact ? undefined : aspectRatioCSS,
        minHeight: compact ? 80 : undefined,
        padding: compact ? "1rem" : dynamicPadding,
      }}
    >
      {renderBgImage(`linear-gradient(to bottom,
        ${effectiveBg}22 0%,
        ${effectiveBg}99 40%,
        ${effectiveBg}ee 100%)`)}

      {architectProps ? (
        <ArchitectOverlay {...architectProps} />
      ) : (
        // ── Default story layout ──
        <div className="relative z-10 flex flex-col justify-center flex-1 gap-4 h-full">
          {renderTopBar()}
          <div className="flex flex-col flex-1 justify-center gap-4">
            {!compact && (
              <AccentBar color={effectiveAccent} width="3rem" height="3px" align="flex-start" />
            )}
            <h2
              className="font-bold"
              style={{
                color: effectiveHeadlineText,
                fontFamily: headingFont,
                fontSize: headingSize,
                lineHeight: 1.25,
                textAlign: textAlign ?? "left",
                wordBreak: "break-word",
                overflowWrap: "break-word",
                whiteSpace: "pre-wrap",
              }}
            >
              {renderHeadline(headline, effectiveAccent, isPlayful)}
            </h2>
            {body && !compact && (
              <div
                className="w-full rounded-full"
                style={{ height: "1px", background: `${effectiveAccent}30` }}
              />
            )}
            {body && (
              <p
                className={compact ? "line-clamp-2" : ""}
                style={{
                  color: effectiveBodyText,
                  fontFamily: bodyFont,
                  fontSize: bodySize,
                  lineHeight: 1.65,
                  opacity: 0.85,
                  textAlign: textAlign ?? "left",
                  whiteSpace: "pre-wrap",
                }}
              >
                {body}
              </p>
            )}
          </div>
          {renderBottomBar()}
        </div>
      )}

      {/* Absolute text elements from Architect 2.0 */}
      {renderAdvancedTextElements()}
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
        background: effectiveBg,
        aspectRatio: compact ? undefined : aspectRatioCSS,
        minHeight: compact ? 80 : undefined,
        padding: compact ? "1rem" : dynamicPadding,
      }}
    >
      {renderBgImage(`linear-gradient(to bottom, ${effectiveBg}22 0%, ${effectiveBg}66 50%, ${effectiveBg}ee 100%)`)}

      {architectProps ? (
        <ArchitectOverlay {...architectProps} />
      ) : (
        // CENTERED: Texto no meio, centralizado
        <div className="relative z-10 flex flex-col justify-center items-center flex-1 text-center gap-3 h-full w-full">
          {renderTopBar()}
          {variation.postMode === 'carousel' && !compact && (
            <div className="absolute top-0 right-0 bg-black/40 backdrop-blur-md px-2 py-1 rounded-full flex items-center gap-1 border border-white/10">
              <Layers size={12} className="text-white" />
              <span className="text-[10px] font-medium text-white">Carrossel</span>
            </div>
          )}
          <div className="flex flex-col flex-1 justify-center items-center gap-3 w-full">
            {!compact && (
              <AccentBar color={effectiveAccent} width="3rem" height="3px" align="center" />
            )}
            <h2
              className={`font-bold leading-tight ${compact ? "line-clamp-2" : ""}`}
              style={{ color: effectiveHeadlineText, fontFamily: headingFont, fontSize: `calc(${headingSize} * 1.15)`, whiteSpace: "pre-wrap" }}
            >
              {renderHeadline(headline, effectiveAccent, isPlayful)}
            </h2>
            {body && (
              <p
                className={`${compact ? "line-clamp-2" : ""} opacity-75 max-w-[90%]`}
                style={{ color: effectiveBodyText, fontFamily: bodyFont, fontSize: bodySize, lineHeight: 1.6, whiteSpace: "pre-wrap" }}
              >
                {body}
              </p>
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
        </div>
      )}

      {/* Absolute text elements from Architect 2.0 */}
      {renderAdvancedTextElements()}
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
        background: effectiveBg,
        aspectRatio: compact ? undefined : aspectRatioCSS,
        minHeight: compact ? 80 : undefined,
        padding: compact ? "1rem" : dynamicPadding,
      }}
    >
      {renderBgImage(`linear-gradient(to bottom, ${effectiveBg}11 0%, ${effectiveBg}88 60%, ${effectiveBg}ee 100%)`)}

      {architectProps ? (
        <ArchitectOverlay {...architectProps} />
      ) : (
        // LEFT-ALIGNED: Texto na base, alinhado à esquerda
        <div className="relative z-10 flex flex-col gap-2 h-full w-full text-left items-start">
          {renderTopBar()}
          {variation.postMode === 'carousel' && !compact && (
            <div className="absolute top-[-30px] right-0 bg-black/40 backdrop-blur-md px-2 py-1 rounded-full flex items-center gap-1 border border-white/10">
              <Layers size={12} className="text-white" />
              <span className="text-[10px] font-medium text-white">Carrossel</span>
            </div>
          )}
          <div className="flex flex-col gap-2 mt-auto w-full">
            {!compact && (
              <AccentBar color={effectiveAccent} width="2.5rem" height="3px" align="flex-start" />
            )}
            <h2
              className={`font-bold leading-tight ${compact ? "line-clamp-2" : ""}`}
              style={{ color: effectiveHeadlineText, fontFamily: headingFont, fontSize: headingSize, whiteSpace: "pre-wrap" }}
            >
              {renderHeadline(headline, effectiveAccent, isPlayful)}
            </h2>
            {body && (
              <p
                className={`${compact ? "line-clamp-2" : ""} opacity-80`}
                style={{ color: effectiveBodyText, fontFamily: bodyFont, fontSize: bodySize, lineHeight: 1.55 }}
              >
                {body}
              </p>
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
        </div>
      )}

      {/* Absolute text elements from Architect 2.0 */}
      {renderAdvancedTextElements()}
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
        className="flex flex-col justify-center items-start gap-2 relative"
        style={{
          flex: '1 1 50%',
          padding: compact ? '0.75rem' : dynamicPadding,
          background: cardBg,
        }}
      >
        {!compact && (
          <AccentBar color={effectiveAccent} width="2rem" height="3px" align="flex-start" />
        )}
        <h2
          className={`font-bold leading-tight ${compact ? 'line-clamp-2' : ''}`}
          style={{
            color: effectiveHeadlineText,
            fontFamily: headingFont,
            fontSize: headingSize,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'break-word',
          }}
        >
          {renderHeadline(headline, effectiveAccent, isPlayful)}
        </h2>
        {body && (
          <p
            className={`${compact ? 'line-clamp-2' : ''} opacity-80`}
            style={{
              color: effectiveBodyText,
              fontFamily: bodyFont,
              fontSize: bodySize,
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'break-word',
            }}
          >
            {body}
          </p>
        )}
      </div>
    );

    return (
      <div
        ref={layoutRef}
        className={`relative flex ${imageOnTop ? 'flex-col' : 'flex-col-reverse'} w-full overflow-hidden`}
        style={{
          background: cardBg,
          aspectRatio: compact ? undefined : aspectRatioCSS,
          minHeight: compact ? 80 : undefined,
        }}
      >
        {ImageHalf}
        {/* No modo não-Arquiteto, mostra o TextHalf; no Arquiteto, o overlay flutua sobre o card inteiro */}
        {!architectProps && TextHalf}

        {/* Architect overlay flutua sobre o card inteiro (imagem + texto) */}
        {architectProps && (
          <ArchitectOverlay {...architectProps} />
        )}

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
        background: effectiveBg,
        aspectRatio: compact ? undefined : aspectRatioCSS,
        minHeight: compact ? 80 : undefined,
        padding: compact ? "1.5rem" : (typeof dynamicPadding === 'number' ? dynamicPadding * 1.5 : dynamicPadding),
      }}
    >
      {renderBgImage(`linear-gradient(to bottom, ${effectiveBg}00 0%, ${effectiveBg}22 100%)`)}

      {architectProps ? (
        <ArchitectOverlay {...architectProps} />
      ) : (
        // MINIMAL: Apenas headline, tipografia grande, muito espaço negativo
        <div className="relative z-10 flex flex-col justify-center items-center flex-1 text-center w-full h-full">
          {renderTopBar()}
          {variation.postMode === 'carousel' && !compact && (
            <div className="absolute top-0 right-0 bg-black/30 backdrop-blur-sm px-2 py-1 rounded-full flex items-center gap-1">
              <Layers size={10} className="text-white/80" />
              <span className="text-[9px] font-medium text-white/80">Carrossel</span>
            </div>
          )}
          <div className="flex flex-col flex-1 justify-center items-center w-full">
            <h2
              className="font-bold leading-[1.1] tracking-tight"
              style={{
                color: effectiveHeadlineText,
                fontFamily: headingFont,
                fontSize: compact ? headingSize : `calc(${headingSize} * 1.4)`,
                maxWidth: "95%",
                whiteSpace: "pre-wrap",
              }}
            >
              {renderHeadline(headline, effectiveAccent, isPlayful)}
            </h2>
            {/* Corpo NÃO aparece no layout minimal - apenas headline */}
          </div>
          {renderBottomBar()}
        </div>
      )}

      {/* Absolute text elements from Architect 2.0 */}
      {renderAdvancedTextElements()}
    </div>
  );

  // ══════════════════════════════════════════════════════════════════
  // Seletor de layout
  // ══════════════════════════════════════════════════════════════════
  const visual = isStory
    ? storyContent
    : isLayoutCentered
      ? centeredLayout
      : isLayoutSplit
        ? splitLayout
        : isLayoutMinimal
          ? minimalLayout
          : leftAlignedLayout; // fallback padrão (clássico)

  // DesignTokens path — ThemeRenderer handles structure, PostCard adds decorations
  if (dt) {
    return (
      <div style={{ aspectRatio: aspectRatioCSS, position: "relative", width: "100%", overflow: "hidden" }} className={compact ? "rounded-xl" : "rounded-2xl"}>
        <ThemeRenderer
          designTokens={dt}
          className="w-full h-full"
          cardRef={cardRef}
          cardLayout={advancedLayout?.card}
          onDragCard={(x, y) => onDragPosition?.("card", x, y)}
          onResizeCard={(w) => onResizeBlock?.("card", w)}
          isEditingCard={isEditingCard}
        >
          {brandMeta && (
            <BrandOverlay
              logoUrl={brandMeta.logoUrl}
              brandName={brandMeta.brandName}
              platform={variation.platform}
              accentColor={dt.colors.primary}
              textColor={dt.colors.text}
            />
          )}
          {visual}
        </ThemeRenderer>
      </div>
    );
  }

  if (theme) {
    return (
      <div style={{ aspectRatio: aspectRatioCSS, position: "relative", width: "100%", overflow: "hidden" }} className={compact ? "rounded-xl" : "rounded-2xl"}>
        <ThemeRenderer
          theme={theme}
          className="w-full h-full"
          cardRef={cardRef}
          cardLayout={advancedLayout?.card}
          onDragCard={(x, y) => onDragPosition?.("card", x, y)}
          onResizeCard={(w) => onResizeBlock?.("card", w)}
          isEditingCard={isEditingCard}
        >
          {brandMeta && (
            <BrandOverlay
              logoUrl={brandMeta.logoUrl}
              brandName={brandMeta.brandName}
              platform={variation.platform}
              accentColor={theme.colors.accent}
              textColor={theme.colors.text}
              cardStyle={theme.layout.cardStyle}
            />
          )}
          {visual}
        </ThemeRenderer>
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
