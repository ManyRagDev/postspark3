/**
 * BrandOverlay — visual brand identity layer rendered over post cards.
 *
 * Adds logo badge, platform icon, and decorative shapes that adapt
 * to the detected cardStyle of the brand. All elements use position:absolute
 * so they float over the post content without affecting layout.
 *
 * Decorative shapes use fixed positions (not random) to ensure reproducibility
 * when exporting as PNG via html2canvas.
 */

import { Instagram, Linkedin, Twitter, Facebook } from "lucide-react";
import type { Platform, CardStyle } from "@shared/postspark";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrandOverlayProps {
  logoUrl?: string;
  brandName?: string;
  platform?: Platform;
  accentColor: string;
  textColor: string;
  cardStyle?: CardStyle;
}

// ─── Decorative Shape Definitions ─────────────────────────────────────────────

interface ShapeConfig {
  x: string;
  y: string;
  size: number;
  rotation: number;
  shape: "square" | "circle" | "diamond" | "line";
  /** Which color from the palette: 0 = accent, 1 = text (lower opacity) */
  colorIndex: 0 | 1;
}

/** Fixed positions — deterministic for export reproducibility */
const BASE_SHAPES: ShapeConfig[] = [
  { x: "7%", y: "82%", size: 12, rotation: 15, shape: "square", colorIndex: 0 },
  { x: "14%", y: "90%", size: 8, rotation: -20, shape: "circle", colorIndex: 1 },
  { x: "86%", y: "76%", size: 10, rotation: 45, shape: "square", colorIndex: 0 },
  { x: "92%", y: "86%", size: 14, rotation: 0, shape: "circle", colorIndex: 0 },
  { x: "6%", y: "14%", size: 6, rotation: 30, shape: "circle", colorIndex: 1 },
  { x: "90%", y: "10%", size: 8, rotation: -10, shape: "diamond", colorIndex: 0 },
];

/** Get shapes appropriate for each card style */
function getShapesForStyle(cardStyle?: CardStyle): ShapeConfig[] {
  switch (cardStyle) {
    case "neobrutalist":
      // Bold: all shapes visible, solid, with rotation
      return BASE_SHAPES;

    case "glass":
      // Soft: only circles, larger blur handled via CSS
      return BASE_SHAPES.filter((s) => s.shape === "circle").map((s) => ({
        ...s,
        size: s.size + 4,
      }));

    case "minimal":
      // Very sparse: 1-2 tiny dots
      return BASE_SHAPES.slice(0, 2).map((s) => ({
        ...s,
        shape: "circle" as const,
        size: 4,
        rotation: 0,
      }));

    case "editorial":
      // Structured: lines and small squares
      return [
        { x: "8%", y: "88%", size: 20, rotation: 0, shape: "line" as const, colorIndex: 0 as const },
        { x: "88%", y: "88%", size: 20, rotation: 90, shape: "line" as const, colorIndex: 0 as const },
        { x: "8%", y: "12%", size: 5, rotation: 45, shape: "square" as const, colorIndex: 1 as const },
      ];

    case "flat":
    default:
      // Moderate: 3-4 simple shapes
      return BASE_SHAPES.slice(0, 4).map((s) => ({
        ...s,
        size: s.size - 2,
        rotation: 0,
      }));
  }
}

/** Get opacity for decorative shapes based on card style */
function getShapeOpacity(cardStyle?: CardStyle): number {
  switch (cardStyle) {
    case "neobrutalist":
      return 0.6;
    case "glass":
      return 0.25;
    case "minimal":
      return 0.2;
    case "editorial":
      return 0.4;
    case "flat":
    default:
      return 0.35;
  }
}

// ─── Platform Icon Map ────────────────────────────────────────────────────────

const PLATFORM_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  instagram: Instagram,
  twitter: Twitter,
  linkedin: Linkedin,
  facebook: Facebook,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function BrandOverlay({
  logoUrl,
  brandName,
  platform,
  accentColor,
  textColor,
  cardStyle,
}: BrandOverlayProps) {
  const shapes = getShapesForStyle(cardStyle);
  const shapeOpacity = getShapeOpacity(cardStyle);
  const PlatformIcon = platform ? PLATFORM_ICONS[platform] : null;

  // Determine color palette for shapes
  const colors = [accentColor, textColor];

  return (
    <div
      className="brand-overlay absolute inset-0 pointer-events-none z-20"
      aria-hidden="true"
    >
      {/* ─── Logo Badge (top-left) ──────────────────────────────────────── */}
      {logoUrl ? (
        <div
          className="absolute flex items-center"
          style={{ top: "5%", left: "5%" }}
        >
          <img
            src={logoUrl}
            alt=""
            crossOrigin="anonymous"
            style={{
              maxHeight: 28,
              maxWidth: 80,
              objectFit: "contain",
            }}
          />
        </div>
      ) : brandName ? (
        <div
          className="absolute flex items-center"
          style={{ top: "5%", left: "5%" }}
        >
          <span
            style={{
              fontSize: "0.65rem",
              fontWeight: 700,
              color: textColor,
              backgroundColor: `${accentColor}30`,
              padding: "2px 8px",
              borderRadius: cardStyle === "neobrutalist" ? 0 : 4,
              border:
                cardStyle === "neobrutalist"
                  ? `1.5px solid ${textColor}`
                  : "none",
              letterSpacing: "0.02em",
            }}
          >
            {brandName}
          </span>
        </div>
      ) : null}

      {/* ─── Platform Icon (top-right) ──────────────────────────────────── */}
      {PlatformIcon && (
        <div
          className="absolute flex items-center"
          style={{ top: "5%", right: "5%" }}
        >
          <PlatformIcon
            size={16}
            style={{ color: textColor, opacity: 0.45 }}
          />
        </div>
      )}

      {/* ─── Decorative Shapes ──────────────────────────────────────────── */}
      {shapes.map((shape, i) => {
        const color = colors[shape.colorIndex] ?? accentColor;

        const baseStyle: React.CSSProperties = {
          position: "absolute",
          left: shape.x,
          top: shape.y,
          opacity: shapeOpacity,
          transform: `rotate(${shape.rotation}deg)`,
          pointerEvents: "none",
        };

        if (shape.shape === "circle") {
          return (
            <div
              key={i}
              style={{
                ...baseStyle,
                width: `${Math.min(shape.size, 32)}px`,
                height: `${Math.min(shape.size, 32)}px`,
                borderRadius: "9999px", // Trocado de 50% para um valor absoluto para evitar círculo deformante
                backgroundColor: color,
                ...(cardStyle === "glass" ? { filter: "blur(2px)" } : {}),
              }}
            />
          );
        }

        if (shape.shape === "square") {
          return (
            <div
              key={i}
              style={{
                ...baseStyle,
                width: shape.size,
                height: shape.size,
                borderRadius: cardStyle === "neobrutalist" ? 0 : 2,
                backgroundColor: color,
                ...(cardStyle === "neobrutalist"
                  ? { border: `1px solid ${textColor}`, boxShadow: `1px 1px 0 ${textColor}` }
                  : {}),
              }}
            />
          );
        }

        if (shape.shape === "diamond") {
          return (
            <div
              key={i}
              style={{
                ...baseStyle,
                width: shape.size,
                height: shape.size,
                backgroundColor: color,
                transform: `rotate(${shape.rotation + 45}deg)`,
              }}
            />
          );
        }

        if (shape.shape === "line") {
          return (
            <div
              key={i}
              style={{
                ...baseStyle,
                width: shape.size,
                height: 2,
                backgroundColor: color,
              }}
            />
          );
        }

        return null;
      })}
    </div>
  );
}
