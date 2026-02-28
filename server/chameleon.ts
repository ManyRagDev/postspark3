/**
 * ChameleonProtocol: Brand analysis adapter (backward compatible)
 *
 * Previously used LLM-only guessing from URL.
 * Now delegates to extractBrandDNA() for real multi-page analysis,
 * then maps the rich BrandDNA back to the BrandAnalysis interface
 * that the rest of the app expects.
 *
 * The LLM-based mock fallback is retained for dev/offline environments.
 */

import type { FontCategory } from "../client/src/lib/themes";
import { extractBrandDNA } from "./brandDNA";
import { generateThemesFromBrandDNA } from "./brandThemeGenerator";
import type { BrandDNA } from "@shared/postspark";

export interface BrandAnalysis {
  brandColors: {
    primary: string;
    secondary: string;
  };
  logoUrl?: string;
  fontCategory: FontCategory;
  summary: string;
  brandName: string;
  /** Full DNA available when extracted via the new pipeline */
  dna?: BrandDNA;
}

/** Map BrandDNA fonts to FontCategory enum */
function mapFontCategory(headingFont: string): FontCategory {
  const lower = headingFont.toLowerCase();
  if (lower.includes('mono') || lower.includes('code') || lower.includes('courier')) return 'mono';
  if (lower.includes('serif') || lower.includes('georgia') || lower.includes('playfair') ||
      lower.includes('merriweather') || lower.includes('lora')) return 'serif';
  if (lower.includes('display') || lower.includes('bebas') || lower.includes('oswald') ||
      lower.includes('impact') || lower.includes('black')) return 'display';
  return 'sans';
}

/**
 * Analyze URL and extract brand information.
 * Uses the full BrandDNA pipeline (multi-page screenshots + Gemini Vision).
 * Falls back to LLM-only analysis if the pipeline fails.
 */
export async function analyzeBrandFromUrl(url: string): Promise<BrandAnalysis> {
  try {
    const dna = await extractBrandDNA(url);

    return {
      brandColors: {
        primary: dna.colors.primary,
        secondary: dna.colors.secondary,
      },
      logoUrl: dna.metadata.logo,
      fontCategory: mapFontCategory(dna.typography.headingFont),
      summary: `${dna.brandName} — ${dna.industry}. ${dna.emotionalProfile.mood}. ${dna.emotionalProfile.primary} brand identity.`,
      brandName: dna.brandName,
      dna,
    };
  } catch (error) {
    console.warn('[chameleon] extractBrandDNA failed, falling back to mock:', error);
    return mockScrapeUrl(url);
  }
}

/**
 * Mock scraper for development / offline fallback
 */
export async function mockScrapeUrl(url: string): Promise<BrandAnalysis> {
  const mocks: Record<string, BrandAnalysis> = {
    apple: {
      brandColors: { primary: "#555555", secondary: "#FFFFFF" },
      logoUrl: "https://www.apple.com/favicon.ico",
      fontCategory: "sans",
      summary: "Apple Inc. - Technology company known for innovative products and sleek design.",
      brandName: "Apple",
    },
    google: {
      brandColors: { primary: "#4285F4", secondary: "#FFFFFF" },
      logoUrl: "https://www.google.com/favicon.ico",
      fontCategory: "sans",
      summary: "Google - Search engine and technology company with a focus on simplicity.",
      brandName: "Google",
    },
    nike: {
      brandColors: { primary: "#111111", secondary: "#FFFFFF" },
      logoUrl: "https://www.nike.com/favicon.ico",
      fontCategory: "sans",
      summary: "Nike - Athletic footwear and apparel company with a sporty aesthetic.",
      brandName: "Nike",
    },
    starbucks: {
      brandColors: { primary: "#00704A", secondary: "#FFFFFF" },
      logoUrl: "https://www.starbucks.com/favicon.ico",
      fontCategory: "sans",
      summary: "Starbucks - Coffee company known for premium beverages and cozy ambiance.",
      brandName: "Starbucks",
    },
  };

  const lowerUrl = url.toLowerCase();
  for (const [key, data] of Object.entries(mocks)) {
    if (lowerUrl.includes(key)) return data;
  }

  return {
    brandColors: { primary: "#FF6B6B", secondary: "#F5F5F5" },
    fontCategory: "sans",
    summary: "Brand website - Modern design with professional aesthetic.",
    brandName: "Brand",
  };
}

/**
 * Generate 3 card variations based on brand analysis.
 * Uses BrandDNA themes when available, falls back to pattern-based generation.
 */
export interface CardVariationTheme {
  themeId: string;
  themeName: string;
  description: string;
  brandColors?: { primary: string; secondary: string };
  type: "brand-match" | "remix-safe" | "remix-disruptive";
}

export function generateCardThemeVariations(
  brandAnalysis: BrandAnalysis,
): CardVariationTheme[] {
  // If we have full BrandDNA, use the richer theme generator
  if (brandAnalysis.dna) {
    const themes = generateThemesFromBrandDNA(brandAnalysis.dna, brandAnalysis.dna.metadata.sourceUrl);
    return themes.map((t, i) => ({
      themeId: t.id,
      themeName: t.label,
      description: t.description,
      brandColors: { primary: t.colors.accent, secondary: t.colors.bg },
      type: (i === 0 ? 'brand-match' : i === 1 ? 'remix-safe' : 'remix-disruptive') as CardVariationTheme['type'],
    }));
  }

  // Fallback: pattern-based 3 variations using extracted primary/secondary
  return [
    {
      themeId: "brand-custom",
      themeName: "Brand Match",
      description: "Clone your brand identity exactly",
      brandColors: brandAnalysis.brandColors,
      type: "brand-match",
    },
    {
      themeId: "swiss-modern",
      themeName: "Remix Seguro",
      description: "Swiss Modern with your brand accent",
      brandColors: { primary: brandAnalysis.brandColors.primary, secondary: "#FFFFFF" },
      type: "remix-safe",
    },
    {
      themeId: "cyber-core",
      themeName: "Remix Disruptivo",
      description: "Bold neon aesthetic for maximum impact",
      type: "remix-disruptive",
    },
  ];
}
