/**
 * BrandVisualGuardian — deterministic WCAG/brand-color enforcement.
 *
 * Replaces the previous LLM-based `brand_visual_qa` step that was failing
 * (3x aborts + Gemini 400 schema-too-complex). This module performs the same
 * job without any LLM call:
 *
 * 1. Force `backgroundColor` and `accentColor` to belong to the brand palette
 *    when a site intelligence snapshot is available.
 * 2. Guarantee WCAG >= 4.5:1 contrast between `backgroundColor` and `textColor`.
 * 3. Guarantee the same for every `aspectRatioOptimizations[*]` entry.
 *
 * The function is pure and synchronous; it mutates a deep clone of the
 * variations array and returns it.
 */
import type { SiteIntelligence, PostVariation } from "@shared/postspark";
import { wcagContrast } from "../siteIntelligence";

type AnyVariation = PostVariation & {
  aspectRatioOptimizations?: Record<
    string,
    {
      layout?: string;
      backgroundColor?: string;
      textColor?: string;
      accentColor?: string;
    }
  >;
};

interface NearestColorResult {
  hex: string;
  distance: number;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let clean = hex.trim().replace(/^#/, "");
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (clean.length !== 6) return null;
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function colorBrightness(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 128;
  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
}

/** Euclidean distance in RGB space (lower = closer). */
function colorDistance(a: string, b: string): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return Number.POSITIVE_INFINITY;
  return Math.sqrt(
    (ra.r - rb.r) ** 2 + (ra.g - rb.g) ** 2 + (ra.b - rb.b) ** 2,
  );
}

/** Find the palette color closest to the candidate. Returns null if palette empty. */
function nearestPaletteColor(
  candidate: string,
  palette: string[],
): NearestColorResult | null {
  const valid = palette.filter((hex) => hexToRgb(hex) !== null);
  if (valid.length === 0) return null;
  let best = valid[0];
  let bestDist = colorDistance(candidate, best);
  for (const hex of valid) {
    const dist = colorDistance(candidate, hex);
    if (dist < bestDist) {
      best = hex;
      bestDist = dist;
    }
  }
  return { hex: best, distance: bestDist };
}

/**
 * Snap an accent color into the brand palette only when it is clearly off-brand.
 * We allow a tolerance of ~60 RGB units so the LLM can still vary hue slightly
 * per aspect ratio while staying inside the brand family.
 */
const ACCENT_SNAP_TOLERANCE = 60;

function snapAccentToPalette(
  candidate: string | undefined,
  palette: string[],
  fallback: string,
): string {
  if (!candidate) return fallback;
  const nearest = nearestPaletteColor(candidate, palette);
  if (!nearest) return fallback;
  return nearest.distance > ACCENT_SNAP_TOLERANCE ? nearest.hex : candidate;
}

/**
 * Ensure readable text color against the given background.
 * If contrast < 4.5:1, flip to the nearest palette color that passes,
 * otherwise fall back to pure white / near-black based on brightness.
 */
function ensureReadableText(
  background: string,
  text: string | undefined,
  palette: string[],
): string {
  const currentText = text ?? "#FFFFFF";
  if (wcagContrast(background, currentText) >= 4.5) return currentText;

  // Try palette candidates (prefer light colors on dark bg, dark on light bg)
  const bgBright = colorBrightness(background);
  const wantLight = bgBright < 128;
  const candidates = palette
    .filter((hex) => hexToRgb(hex) !== null)
    .filter((hex) => {
      const b = colorBrightness(hex);
      return wantLight ? b > 180 : b < 80;
    })
    .sort((a, b) => {
      const ca = wcagContrast(background, a);
      const cb = wcagContrast(background, b);
      return cb - ca;
    });

  for (const candidate of candidates) {
    if (wcagContrast(background, candidate) >= 4.5) return candidate;
  }

  return wantLight ? "#FFFFFF" : "#1A1A1A";
}

export interface BrandGuardianOptions {
  /** When true, accent/background colors are snapped to the brand palette. */
  enforcePalette?: boolean;
  /** Tolerance (RGB units) above which a background is snapped to palette. */
  backgroundSnapTolerance?: number;
}

/**
 * Deterministically enforce brand + WCAG constraints on a set of variations.
 * Returns a NEW array; the input is not mutated.
 */
export function enforceBrandVisualGuardian(
  variations: AnyVariation[],
  siteIntelligence: SiteIntelligence | null,
  options: BrandGuardianOptions = {},
): AnyVariation[] {
  const enforcePalette = options.enforcePalette !== false;
  const bgSnapTol = options.backgroundSnapTolerance ?? 40;

  if (!siteIntelligence) return variations.slice();

  const palette =
    siteIntelligence.brand.colors.palette ??
    [
      siteIntelligence.brand.colors.primary,
      siteIntelligence.brand.colors.secondary,
      siteIntelligence.brand.colors.background,
      siteIntelligence.brand.colors.text,
      siteIntelligence.brand.colors.accent,
    ].filter(Boolean) as string[];

  if (palette.length === 0) return variations.slice();

  return variations.map((variation) => {
    const patched: AnyVariation = { ...variation };

    if (enforcePalette && patched.backgroundColor) {
      const nearest = nearestPaletteColor(patched.backgroundColor, palette);
      if (nearest && nearest.distance > bgSnapTol) {
        patched.backgroundColor = nearest.hex;
      }
    }

    if (enforcePalette && patched.accentColor) {
      patched.accentColor = snapAccentToPalette(
        patched.accentColor,
        palette,
        siteIntelligence.brand.colors.accent ?? patched.accentColor,
      );
    }

    if (patched.backgroundColor && patched.textColor) {
      patched.textColor = ensureReadableText(
        patched.backgroundColor,
        patched.textColor,
        palette,
      );
    }

    // Apply the same rules to each aspect-ratio optimization entry
    if (patched.aspectRatioOptimizations) {
      const arClone: AnyVariation["aspectRatioOptimizations"] = {};
      for (const [ratio, opt] of Object.entries(patched.aspectRatioOptimizations)) {
        const fixedOpt = { ...opt };
        if (enforcePalette && fixedOpt.backgroundColor) {
          const nearest = nearestPaletteColor(fixedOpt.backgroundColor, palette);
          if (nearest && nearest.distance > bgSnapTol) {
            fixedOpt.backgroundColor = nearest.hex;
          }
        }
        if (enforcePalette && fixedOpt.accentColor) {
          fixedOpt.accentColor = snapAccentToPalette(
            fixedOpt.accentColor,
            palette,
            siteIntelligence.brand.colors.accent ?? fixedOpt.accentColor,
          );
        }
        if (fixedOpt.backgroundColor && fixedOpt.textColor) {
          fixedOpt.textColor = ensureReadableText(
            fixedOpt.backgroundColor,
            fixedOpt.textColor,
            palette,
          );
        }
        arClone[ratio] = fixedOpt;
      }
      patched.aspectRatioOptimizations = arClone;
    }

    return patched;
  });
}