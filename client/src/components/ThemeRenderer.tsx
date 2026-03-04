/**
 * ThemeRenderer: Applies theme styles to post cards
 * Handles all visual effects (glitch, glow, noise, grid) AND
 * card-level structural styles via cardStyle (neobrutalist, glass, minimal, editorial, flat).
 */

import React from "react";
import type { ThemeConfig } from "@/lib/themes";
import type { CardStyle } from "@/lib/themes";
import { applyThemeStyles, getThemeDecorativeClass } from "@/lib/themes";
import type { DesignTokens } from "@shared/postspark";
import "@/styles/theme-effects.css";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Get perceived brightness of a hex color (0–255). Used to pick border color. */
function getBrightness(hex: string): number {
  const h = hex.replace("#", "");
  if (h.length < 6) return 128;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/**
 * Returns the structural CSS properties for a given cardStyle.
 * These override the base ThemeRenderer styles and define the card's
 * visual personality (borders, shadows, blur, etc.).
 */
function getCardStyleProps(
  theme: ThemeConfig,
  cardStyle?: CardStyle,
): React.CSSProperties {
  const dark = getBrightness(theme.colors.bg) < 128;
  // Neobrutalism uses a high-contrast border — dark on light, light on dark
  const borderColor = dark ? "rgba(255,255,255,0.82)" : "rgba(0,0,0,0.85)";

  switch (cardStyle) {
    case "neobrutalist":
      return {
        border: `2.5px solid ${borderColor}`,
        // Hard offset shadow is the signature of neobrutalism
        boxShadow: `5px 5px 0px ${borderColor}`,
        // Neobrutalism always uses sharp corners regardless of borderStyle
        borderRadius: "0px",
      };

    case "glass":
      return {
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        // Semi-transparent background — the bg color is used but at 80% opacity
        background: `${theme.colors.bg}cc`,
        border: `1px solid ${theme.colors.accent}38`,
        boxShadow: "0 8px 32px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.12)",
      };

    case "minimal":
      return {
        border: "none",
        boxShadow: "none",
        // Minimal cards use generous padding to let the typography breathe
        padding: "2.5rem",
      };

    case "editorial":
      return {
        // Accent rule on top — the editorial signature
        borderTop: `3px solid ${theme.colors.accent}`,
        borderLeft: "none",
        borderRight: "none",
        borderBottom: "none",
        boxShadow: "none",
        borderRadius: "0px",
      };

    case "flat":
    default:
      // No structural changes — base ThemeRenderer styles apply
      return {};
  }
}

// ─── Design Tokens → CSS ─────────────────────────────────────────────────────

/** Apply DesignTokens directly as CSS — zero abstraction, zero translation */
function applyDesignTokenStyles(tokens: DesignTokens): React.CSSProperties {
  return {
    backgroundColor: tokens.colors.card,
    color: tokens.colors.text,
    fontFamily: `"${tokens.typography.fontFamily}", sans-serif`,
    textAlign: tokens.typography.textAlign as 'left' | 'center',
    textTransform: tokens.typography.textTransform as React.CSSProperties['textTransform'],
    borderRadius: tokens.structure.borderRadius,
    boxShadow: tokens.structure.boxShadow,
    border: tokens.structure.border,
    padding: '0rem', // Removed 1.5rem to prevent double padding with PostCard layouts
    position: 'relative' as const,
  };
}

// ─── ThemeRenderer ───────────────────────────────────────────────────────────

import { DraggableBlock } from "./canvas/DraggableBlock";

interface ThemeRendererProps {
  theme?: ThemeConfig;
  /** Design tokens — CSS-ready values from Chameleon Vision. Takes priority over theme. */
  designTokens?: DesignTokens;
  children: React.ReactNode;
  className?: string;
  /** Ref opcional para o elemento RAIZ (CANVAS) */
  canvasRef?: React.RefObject<HTMLDivElement | null>;
  /** Ref opcional para o elemento CARD (O POST EM SI) — usado pelo sistema de drag externa/internamente */
  cardRef?: React.RefObject<HTMLDivElement | null>;
  /** Configurações de layout avançado (posicionamento do card no canvas) */
  cardLayout?: import("@/types/editor").LayoutPosition;
  /** Callback para drag do card */
  onDragCard?: (x: number, y: number) => void;
  /** Callback para resize do card */
  onResizeCard?: (width: number) => void;
  /** Se o card está em modo de edição (mostra handles) */
  isEditingCard?: boolean;
}

export default function ThemeRenderer({
  theme,
  designTokens,
  children,
  className = "",
  canvasRef,
  cardRef,
  cardLayout,
  onDragCard,
  onResizeCard,
  isEditingCard = false,
}: ThemeRendererProps) {
  const internalCanvasRef = React.useRef<HTMLDivElement>(null);
  const internalCardRef = React.useRef<HTMLDivElement>(null);

  // Sincroniza refs externos
  React.useEffect(() => {
    if (canvasRef) {
      (canvasRef as React.MutableRefObject<HTMLDivElement | null>).current = internalCanvasRef.current;
    }
  }, [canvasRef]);

  React.useEffect(() => {
    if (cardRef) {
      (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = internalCardRef.current;
    }
  }, [cardRef]);

  // DesignTokens path — direct CSS, no translation
  if (designTokens) {
    const isPlayful = designTokens.decorations === 'playful';
    const isBrutalistShadow = designTokens.structure.boxShadow && designTokens.structure.boxShadow.includes('0px 0px') && designTokens.structure.boxShadow !== 'none';

    // Canvas Styles (Outer Layer)
    const canvasStyles: React.CSSProperties = {
      backgroundColor: designTokens.colors.background,
      position: 'relative' as const,
      width: '100%',
      height: '100%',
      overflow: 'hidden',
    };

    // Card Styles (Inner Layer — purely visual, position/width handled by DraggableBlock)
    const cardVisualStyles: React.CSSProperties = {
      backgroundColor: designTokens.colors.card,
      color: designTokens.colors.text,
      fontFamily: `"${designTokens.typography.fontFamily}", sans-serif`,
      textAlign: designTokens.typography.textAlign as 'left' | 'center',
      textTransform: designTokens.typography.textTransform as React.CSSProperties['textTransform'],
      borderRadius: designTokens.structure.borderRadius,
      boxShadow: designTokens.structure.boxShadow,
      border: designTokens.structure.border,
      width: '100%',
      height: '100%',
      overflow: 'hidden',
    };

    return (
      <div
        ref={internalCanvasRef}
        className={`canvas-layer w-full h-full ${className}`}
        style={canvasStyles}
        data-theme-id="chameleon"
        data-decorations={designTokens.decorations}
      >
        {/* Background Patterns (Canvas Layer) */}
        {isPlayful && (
          <div className="absolute inset-0 pointer-events-none opacity-80" aria-hidden="true">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, currentColor 1.5px, transparent 1.5px)', backgroundSize: '24px 24px' }} />
            <div className="absolute top-10 left-8 w-3 h-5 -rotate-12" style={{ backgroundColor: designTokens.colors.secondary, border: designTokens.structure.border }} />
            <div className="absolute bottom-16 right-10 w-5 h-5 rounded-full" style={{ backgroundColor: designTokens.colors.primary, border: designTokens.structure.border }} />
            <div className="absolute top-32 right-6 w-3 h-3 rotate-45" style={{ backgroundColor: designTokens.colors.text, opacity: 0.3 }} />
          </div>
        )}

        {isPlayful && isBrutalistShadow && (
          <div className="absolute inset-0 pointer-events-none z-0 opacity-15" style={{
            backgroundImage: `repeating-linear-gradient(45deg, ${designTokens.colors.text} 0, ${designTokens.colors.text} 1px, transparent 1px, transparent 10px)`
          }} />
        )}

        {/* The Card Layer with Draggability */}
        <DraggableBlock
          layoutPos={cardLayout || { position: 'center', textAlign: 'center', width: 100 }}
          padding={0}
          containerRef={internalCanvasRef}
          onDragEnd={onDragCard || (() => { })}
          onResize={onResizeCard || (() => { })}
          snapEnabled={false}
          isDraggable={isEditingCard}
          accentColor={designTokens.colors.primary}
        >
          <div
            ref={internalCardRef}
            className="inner-card-layer w-full h-full relative"
            style={cardVisualStyles}
          >
            <div className="theme-content relative z-10 w-full h-full">{children}</div>
          </div>
        </DraggableBlock>
      </div>
    );
  }

  // Legacy ThemeConfig path — original behavior preserved
  if (!theme) {
    return <div className={`theme-renderer overflow-hidden ${className}`}>{children}</div>;
  }

  const themeStyles = applyThemeStyles(theme);
  const decorativeClass = getThemeDecorativeClass(theme);
  const cardStyle = theme.layout.cardStyle;
  const cardStyleProps = getCardStyleProps(theme, cardStyle);

  // For neobrutalist, ensure minimum padding so text doesn't hug the border
  const effectivePadding =
    cardStyle === "neobrutalist"
      ? `max(${themeStyles.padding ?? "1.5rem"}, 1.5rem)`
      : themeStyles.padding;

  // DesignTokens-like architecture for legacy themes
  const canvasStyles: React.CSSProperties = {
    backgroundColor: theme.colors.bg,
    position: 'relative' as const,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    ...themeStyles,
    padding: effectivePadding,
    color: theme.colors.text,
  };

  const cardVisualStyles: React.CSSProperties = {
    ...cardStyleProps,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
  };

  return (
    <div
      ref={internalCanvasRef}
      className={`theme-renderer canvas-layer w-full h-full overflow-hidden ${decorativeClass} ${className}`}
      style={canvasStyles}
      data-theme-id={theme.id}
      data-card-style={cardStyle ?? "flat"}
    >
      {/* Glitch effect overlay */}
      {theme.effects?.glitch && (
        <>
          <div className="glitch-overlay glitch-1" aria-hidden="true" />
          <div className="glitch-overlay glitch-2" aria-hidden="true" />
        </>
      )}

      {/* Glow effect */}
      {theme.effects?.glow && <div className="glow-effect" aria-hidden="true" />}

      {/* Grid overlay */}
      {theme.effects?.grid && <div className="grid-overlay" aria-hidden="true" />}

      {/* Noise texture */}
      {theme.effects?.noise && <div className="noise-texture" aria-hidden="true" />}

      <DraggableBlock
        layoutPos={cardLayout || { position: 'center', textAlign: 'center', width: 100 }}
        padding={0}
        containerRef={internalCanvasRef}
        onDragEnd={onDragCard || (() => { })}
        onResize={onResizeCard || (() => { })}
        snapEnabled={false}
        isDraggable={isEditingCard}
        accentColor={theme.colors.accent}
      >
        <div
          ref={internalCardRef}
          className="inner-card-layer w-full h-full relative"
          style={cardVisualStyles}
        >
          <div className="theme-content relative z-10 w-full h-full">{children}</div>
        </div>
      </DraggableBlock>
    </div>
  );
}

// ─── ThemePreview ─────────────────────────────────────────────────────────────

/**
 * ThemePreview: Small preview of a theme
 */
interface ThemePreviewProps {
  theme: ThemeConfig;
  onClick?: () => void;
}

export function ThemePreview({ theme, onClick }: ThemePreviewProps) {
  return (
    <button
      onClick={onClick}
      className="theme-preview rounded-lg overflow-hidden cursor-pointer transition-all hover:scale-105 active:scale-95 w-full"
      style={{
        background: theme.colors.bg,
        border: "1px solid oklch(1 0 0 / 10%)",
        height: "120px",
      }}
    >
      <div className="p-3 h-full flex flex-col justify-between text-left">
        <div
          style={{
            color: theme.colors.text,
            fontFamily: theme.typography.headingFont,
            fontSize: "0.875rem",
            fontWeight: "bold",
          }}
        >
          {theme.label}
        </div>
        <div
          style={{
            color: theme.colors.accent,
            fontSize: "0.75rem",
            fontFamily: theme.typography.bodyFont,
          }}
        >
          {theme.description}
        </div>
      </div>
    </button>
  );
}
