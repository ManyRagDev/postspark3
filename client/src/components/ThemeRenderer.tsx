/**
 * ThemeRenderer: Applies theme styles to post cards
 * Handles all visual effects (glitch, glow, noise, grid)
 */

import React from "react";
import type { ThemeConfig } from "@/lib/themes";
import { applyThemeStyles, getThemeDecorativeClass } from "@/lib/themes";
import "@/styles/theme-effects.css";

interface ThemeRendererProps {
  theme: ThemeConfig;
  children: React.ReactNode;
  className?: string;
  /** Ref opcional para o elemento raiz — usado pelo sistema de drag no PostCard */
  cardRef?: React.RefObject<HTMLElement | null>;
}

export default function ThemeRenderer({
  theme,
  children,
  className = "",
  cardRef,
}: ThemeRendererProps) {
  const themeStyles = applyThemeStyles(theme);
  const decorativeClass = getThemeDecorativeClass(theme);

  return (
    <div
      ref={(el) => {
        if (cardRef) {
          (cardRef as React.MutableRefObject<HTMLElement | null>).current = el;
        }
      }}
      className={`theme-renderer overflow-hidden ${decorativeClass} ${className}`}
      style={{
        ...themeStyles,
        backgroundColor: theme.colors.bg,
        color: theme.colors.text,
      }}
      data-theme-id={theme.id}
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

      {/* Content */}
      <div className="theme-content relative z-10">{children}</div>
    </div>
  );
}

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
