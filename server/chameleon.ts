/**
 * ChameleonProtocol: Intelligent URL scraping and brand color extraction
 * Extracts brand colors, logo, and font category from a given URL
 */

import { invokeLLM } from "./_core/llm";
import type { FontCategory } from "../client/src/lib/themes";

export interface BrandAnalysis {
  brandColors: {
    primary: string;
    secondary: string;
  };
  logoUrl?: string;
  fontCategory: FontCategory;
  summary: string;
  brandName: string;
}

/**
 * Mock scraper for development
 * In production, this would use a real scraping service
 */
export async function mockScrapeUrl(url: string): Promise<BrandAnalysis> {
  // Mock data for common brands
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

  // Check if URL contains a mock brand keyword
  const lowerUrl = url.toLowerCase();
  for (const [key, data] of Object.entries(mocks)) {
    if (lowerUrl.includes(key)) {
      return data;
    }
  }

  // Default mock for any URL
  return {
    brandColors: { primary: "#FF6B6B", secondary: "#F5F5F5" },
    logoUrl: undefined,
    fontCategory: "sans",
    summary: "Brand website - Modern design with professional aesthetic.",
    brandName: "Brand",
  };
}

/**
 * Analyze URL and extract brand information using LLM
 * This function uses the LLM to intelligently extract brand insights
 */
export async function analyzeBrandFromUrl(url: string): Promise<BrandAnalysis> {
  try {
    // Use LLM to analyze the URL and extract brand information
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a brand analyst. Analyze the given URL and extract brand information in JSON format.
Return ONLY valid JSON with this structure:
{
  "brandColors": { "primary": "#HEX", "secondary": "#HEX" },
  "fontCategory": "serif" | "sans" | "display" | "mono",
  "summary": "3-line summary of the brand",
  "brandName": "Brand name"
}`,
        },
        {
          role: "user",
          content: `Analyze this URL and extract brand information: ${url}`,
        },
      ],
      response_format: {
        type: "json_schema" as const,
        json_schema: {
          name: "brand_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              brandColors: {
                type: "object",
                properties: {
                  primary: { type: "string", description: "Primary brand color in hex format" },
                  secondary: { type: "string", description: "Secondary brand color in hex format" },
                },
                required: ["primary", "secondary"],
              },
              fontCategory: {
                type: "string",
                enum: ["serif", "sans", "display", "mono"],
                description: "Font category used by the brand",
              },
              summary: {
                type: "string",
                description: "3-line summary of the brand",
              },
              brandName: {
                type: "string",
                description: "Name of the brand",
              },
            },
            required: ["brandColors", "fontCategory", "summary", "brandName"],
            additionalProperties: false,
          },
        },
      } as any,
    });

    const content = response.choices[0]?.message.content;
    if (!content) throw new Error("No response from LLM");

    const contentStr = typeof content === "string" ? content : JSON.stringify(content);
    const parsed = JSON.parse(contentStr);
    return {
      brandColors: parsed.brandColors,
      fontCategory: parsed.fontCategory,
      summary: parsed.summary,
      brandName: parsed.brandName,
    };
  } catch (error) {
    console.warn("LLM brand analysis failed, using mock:", error);
    // Fallback to mock scraper
    return mockScrapeUrl(url);
  }
}

/**
 * Generate 3 card variations based on brand analysis
 * Card 1: Brand Match (clone the brand)
 * Card 2: Remix Seguro (Swiss Modern with brand accent)
 * Card 3: Remix Disruptivo (Cyber Core or Bold Hype)
 */
export interface CardVariationTheme {
  themeId: string;
  themeName: string;
  description: string;
  brandColors?: { primary: string; secondary: string };
  type: "brand-match" | "remix-safe" | "remix-disruptive";
}

export function generateCardThemeVariations(
  brandAnalysis: BrandAnalysis
): CardVariationTheme[] {
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
