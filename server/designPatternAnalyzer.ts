/**
 * DesignPatternAnalyzer: Classify design patterns using LLM
 * Analyzes extracted style data and generates temporary themes
 */

import { invokeLLM } from "./_core/llm";
import type {
    ExtractedStyleData,
    DesignPattern,
    DesignPatternCategory,
    TemporaryTheme,
} from "@shared/postspark";

// ─── Pattern Classification ───────────────────────────────────────────────────

/** Analyze extracted style data and classify design patterns */
export async function analyzeDesignPattern(
    data: ExtractedStyleData,
    url: string
): Promise<DesignPattern[]> {
    try {
        const response = await invokeLLM({
            messages: [
                {
                    role: "system",
                    content: `You are a design pattern analyst. Analyze website style data and classify the design patterns.

Return JSON with up to 3 design patterns that match the website's visual style.
Each pattern should have:
- id: unique identifier (kebab-case)
- name: display name (title case)
- category: one of: modern, brutalist, neon, classic, playful, corporate, artistic, minimalist, retro, futuristic
- confidence: 0-100 (how confident you are this pattern matches)
- characteristics: array of 3-5 characteristic names
- description: brief description (max 100 chars)

Consider:
- Color palette (dark = modern/brutalist/neon, light = classic/minimalist, colorful = playful/artistic)
- Typography (serif = classic/retro, sans = modern/corporate, mono = neon/futuristic)
- Effects (gradients/glow = neon/futuristic, minimal effects = minimalist/modern)
- Spacing (spacious = modern/minimalist, compact = brutalist/corporate)`,
                },
                {
                    role: "user",
                    content: `Analyze this website style data and classify design patterns:

URL: ${url}

IMPORTANT CONTEXT: This website data may be incomplete because many modern websites (Next.js, React SPAs) 
render content dynamically. The HTML we captured may be minimal (just the app shell).
In that case, use the URL domain name, brand name, and any available clues to make smart inferences about the 
website's visual identity and design style. Do NOT default to generic "modern/corporate" patterns unless truly warranted.

Colors extracted (may be defaults if SPA):
- Primary: ${data.colors.primary}
- Secondary: ${data.colors.secondary}
- Background: ${data.colors.background}
- Text: ${data.colors.text}
- Accent: ${data.colors.accent}
- Palette: ${data.colors.palette.length > 0 ? data.colors.palette.join(", ") : "(none found - likely SPA, infer from brand)"}

Typography:
- Heading Font: ${data.typography.headingFont}
- Body Font: ${data.typography.bodyFont}
- Heading Weight: ${data.typography.headingWeight}
- Body Weight: ${data.typography.bodyWeight}

Spacing:
- Density: ${data.spacing.density}
- Border Radius: ${data.spacing.borderRadius}
- Padding: ${data.spacing.padding}

Effects:
- Shadows: ${data.effects.shadows}
- Gradients: ${data.effects.gradients}
- Animations: ${data.effects.animations}
- Glassmorphism: ${data.effects.glassmorphism}
- Noise: ${data.effects.noise}

${data.metadata?.siteName ? `Site Name: ${data.metadata.siteName}` : ""}

CRITICAL: If the palette is empty (SPA), you MUST infer the brand's likely visual identity from:
1. The URL/domain name (what kind of product/service is it?)
2. The brand name (startup, SaaS, agency, etc.)
3. Industry conventions (productivity apps = modern/clean, events/party = playful/colorful, finance = corporate)

For each pattern you return, also specify the ACTUAL HEX COLORS that best represent this brand, not generic defaults.
Add an optional field "suggestedColors" with {bg, text, accent, secondary} hex values.

Return exactly 2-3 patterns that best describe this website's design.`,
                },

            ],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "design_patterns",
                    strict: true,
                    schema: {
                        type: "object",
                        properties: {
                            patterns: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        id: { type: "string" },
                                        name: { type: "string" },
                                        category: {
                                            type: "string",
                                            enum: [
                                                "modern",
                                                "brutalist",
                                                "neon",
                                                "classic",
                                                "playful",
                                                "corporate",
                                                "artistic",
                                                "minimalist",
                                                "retro",
                                                "futuristic",
                                            ],
                                        },
                                        confidence: { type: "number", minimum: 0, maximum: 100 },
                                        characteristics: {
                                            type: "array",
                                            items: { type: "string" },
                                            minItems: 3,
                                            maxItems: 5,
                                        },
                                        description: { type: "string", maxLength: 100 },
                                        suggestedColors: {
                                            type: "object",
                                            properties: {
                                                bg: { type: "string" },
                                                text: { type: "string" },
                                                accent: { type: "string" },
                                                secondary: { type: "string" },
                                            },
                                            required: ["bg", "text", "accent", "secondary"],
                                            additionalProperties: false,
                                        },
                                    },
                                    required: ["id", "name", "category", "confidence", "characteristics", "description", "suggestedColors"],
                                    additionalProperties: false,
                                },
                                minItems: 2,
                                maxItems: 3,
                            },
                        },
                        required: ["patterns"],
                        additionalProperties: false,
                    },
                },
            },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error("No response from LLM");

        const contentStr = typeof content === "string" ? content : JSON.stringify(content);
        const parsed = JSON.parse(contentStr);

        return parsed.patterns.map((p: any, i: number) => ({
            id: p.id || `pattern-${i}`,
            name: p.name,
            category: p.category as DesignPatternCategory,
            confidence: Math.min(100, Math.max(0, p.confidence)),
            characteristics: p.characteristics,
            description: p.description,
            suggestedColors: p.suggestedColors,
        }));
    } catch (error) {
        console.error("Pattern analysis failed:", error);
        // Return fallback patterns based on basic heuristics
        return generateFallbackPatterns(data);
    }
}

/** Generate fallback patterns using heuristics when LLM fails */
function generateFallbackPatterns(data: ExtractedStyleData): DesignPattern[] {
    const patterns: DesignPattern[] = [];

    // Analyze background brightness
    const bgBrightness = getColorBrightness(data.colors.background);
    const isDark = bgBrightness < 128;

    // Check for vibrant colors
    const hasVibrantColors = data.colors.palette.some(c => getColorSaturation(c) > 0.5);

    // Primary pattern based on basic analysis
    if (isDark && hasVibrantColors) {
        patterns.push({
            id: "dark-modern",
            name: "Dark Modern",
            category: "modern",
            confidence: 75,
            characteristics: ["Dark background", "Vibrant accents", "High contrast"],
            description: "Modern dark theme with vibrant color accents",
            suggestedColors: CATEGORY_PALETTES.modern,
        });
    } else if (isDark) {
        patterns.push({
            id: "minimalist-dark",
            name: "Minimalist Dark",
            category: "minimalist",
            confidence: 70,
            characteristics: ["Dark theme", "Minimal colors", "Clean layout"],
            description: "Clean dark minimalist design",
            suggestedColors: CATEGORY_PALETTES.minimalist,
        });
    } else if (hasVibrantColors) {
        patterns.push({
            id: "playful-modern",
            name: "Playful Modern",
            category: "playful",
            confidence: 70,
            characteristics: ["Colorful palette", "Light background", "Vibrant accents"],
            description: "Light modern design with colorful accents",
            suggestedColors: CATEGORY_PALETTES.playful,
        });
    } else {
        patterns.push({
            id: "clean-modern",
            name: "Clean Modern",
            category: "modern",
            confidence: 75,
            characteristics: ["Clean layout", "Balanced colors", "Professional look"],
            description: "Professional modern design",
            suggestedColors: CATEGORY_PALETTES.modern,
        });
    }

    // Secondary pattern based on typography
    const isSerif = data.typography.headingFont.toLowerCase().includes("serif");
    if (isSerif) {
        patterns.push({
            id: "elegant-classic",
            name: "Elegant Classic",
            category: "classic",
            confidence: 65,
            characteristics: ["Serif typography", "Elegant feel", "Traditional style"],
            description: "Classic elegant design with serif typography",
            suggestedColors: CATEGORY_PALETTES.classic,
        });
    }

    // Ensure at least 2 patterns
    if (patterns.length < 2) {
        patterns.push({
            id: "professional-clean",
            name: "Professional Clean",
            category: "corporate",
            confidence: 60,
            characteristics: ["Clean design", "Professional look", "Balanced spacing"],
            description: "Professional clean corporate style",
            suggestedColors: CATEGORY_PALETTES.corporate,
        });
    }

    return patterns;
}

// ─── Theme Generation ────────────────────────────────────────────────────────

/** Generate temporary themes from classified patterns */
export function generateThemesFromPatterns(
    patterns: DesignPattern[],
    data: ExtractedStyleData,
    url: string
): TemporaryTheme[] {
    return patterns.map((pattern, index) => {
        const themeId = `temp-${Date.now()}-${index}`;

        // Generate category based on pattern confidence
        const category = pattern.confidence > 80 ? "brand" : pattern.confidence > 60 ? "remix" : "disruptive";

        // Map pattern category to theme effects
        const effects = mapPatternToEffects(pattern.category);

        // Map pattern category to decoration
        const decoration = mapPatternToDecoration(pattern.category);

        // Use LLM suggested colors if available and we don't have real extracted colors
        const hasExtractedColors = data.colors.palette.length > 2;
        let themeColors: { bg: string; text: string; accent: string; surface: string };

        if (!hasExtractedColors && pattern.suggestedColors) {
            // Use LLM's brand-inferred colors for SPA sites
            console.log(`[generateThemes] Using LLM suggested colors for ${pattern.name}:`, pattern.suggestedColors);
            themeColors = {
                bg: pattern.suggestedColors.bg,
                text: pattern.suggestedColors.text,
                accent: pattern.suggestedColors.accent,
                surface: pattern.suggestedColors.secondary,
            };
        } else {
            // Use extracted or category palette colors
            const colors = adjustColorsForPattern(data.colors, pattern.category);
            themeColors = {
                bg: colors.background,
                text: colors.text,
                accent: colors.accent,
                surface: colors.secondary,
            };
        }

        return {
            id: themeId,
            label: pattern.name,
            description: pattern.description,
            category,
            source: "website-extraction",
            sourceUrl: url,
            designPattern: pattern,
            isTemporary: true,
            createdAt: Date.now(),
            colors: themeColors,
            typography: {
                headingFont: mapFontForPattern(data.typography.headingFont, pattern.category),
                bodyFont: mapFontForPattern(data.typography.bodyFont, pattern.category),
                headingSize: mapHeadingSizeForPattern(pattern.category),
                bodySize: mapBodySizeForPattern(pattern.category),
            },
            layout: {
                alignment: mapAlignmentForPattern(pattern.category),
                borderStyle: data.spacing.borderRadius,
                decoration,
                padding: mapPaddingForPattern(data.spacing.padding),
            },
            effects,
        };
    });
}

/** Map pattern category to theme effects */
function mapPatternToEffects(category: DesignPatternCategory): TemporaryTheme["effects"] {
    const effectMap: Record<DesignPatternCategory, TemporaryTheme["effects"]> = {
        modern: { glow: false, noise: false },
        brutalist: { noise: true },
        neon: { glow: true, glitch: true },
        classic: {},
        playful: { glow: false },
        corporate: {},
        artistic: { noise: true },
        minimalist: {},
        retro: { noise: true },
        futuristic: { glow: true, grid: true },
    };
    return effectMap[category] || {};
}

/** Map pattern category to decoration style */
function mapPatternToDecoration(category: DesignPatternCategory): "none" | "noise" | "glitch" | "grid" {
    const decorationMap: Record<DesignPatternCategory, "none" | "noise" | "glitch" | "grid"> = {
        modern: "none",
        brutalist: "noise",
        neon: "glitch",
        classic: "none",
        playful: "none",
        corporate: "none",
        artistic: "noise",
        minimalist: "none",
        retro: "noise",
        futuristic: "grid",
    };
    return decorationMap[category] || "none";
}

/** Category-specific color palettes */
const CATEGORY_PALETTES: Record<DesignPatternCategory, { bg: string; text: string; accent: string; secondary: string }> = {
    modern: { bg: "#0f0f0f", text: "#ffffff", accent: "#6366f1", secondary: "#1a1a2e" },
    brutalist: { bg: "#111111", text: "#ffffff", accent: "#ff5277", secondary: "#1a1a1a" },
    neon: { bg: "#0a0a0f", text: "#00ffff", accent: "#ff00ff", secondary: "#151520" },
    classic: { bg: "#faf8f3", text: "#2d2d2d", accent: "#8b4513", secondary: "#f0ebe0" },
    playful: { bg: "#fff5f5", text: "#2d2d2d", accent: "#ff6b6b", secondary: "#ffe4e4" },
    corporate: { bg: "#f8fafc", text: "#1e293b", accent: "#0f172a", secondary: "#e2e8f0" },
    artistic: { bg: "#1a1a1a", text: "#f5f5f5", accent: "#ffd700", secondary: "#2a2a2a" },
    minimalist: { bg: "#ffffff", text: "#1a1a1a", accent: "#6366f1", secondary: "#f5f5f5" },
    retro: { bg: "#f4e4bc", text: "#3d2914", accent: "#d4594a", secondary: "#e8d5a3" },
    futuristic: { bg: "#050510", text: "#00ff88", accent: "#00d4ff", secondary: "#0a0a1a" },
};

/** Adjust colors based on pattern category */
function adjustColorsForPattern(
    colors: ExtractedStyleData["colors"],
    category: DesignPatternCategory
): ExtractedStyleData["colors"] {
    const palette = CATEGORY_PALETTES[category] || CATEGORY_PALETTES.modern;

    // Check if we have real extracted colors (palette.length > 0 means we found something)
    const hasExtractedColors = colors.palette.length > 2;

    if (hasExtractedColors) {
        // Use extracted colors, just adjust for category style
        const bgBrightness = getColorBrightness(colors.background);

        // For dark patterns, ensure dark background
        if (["neon", "brutalist", "futuristic"].includes(category)) {
            if (bgBrightness > 128) {
                return {
                    ...colors,
                    background: palette.bg,
                    text: palette.text,
                };
            }
        }

        // For classic patterns, ensure readable colors
        if (category === "classic" && bgBrightness < 200) {
            return {
                ...colors,
                background: palette.bg,
                text: palette.text,
            };
        }

        return colors;
    }

    // No extracted colors - use category palette
    return {
        primary: palette.accent,
        secondary: palette.secondary,
        background: palette.bg,
        text: palette.text,
        accent: palette.accent,
        palette: [palette.accent, palette.secondary, palette.text, palette.bg],
    };
}

/** Map font for pattern category */
function mapFontForPattern(originalFont: string, category: DesignPatternCategory): string {
    const fontMap: Record<DesignPatternCategory, string> = {
        modern: "'Inter', sans-serif",
        brutalist: "'Space Mono', monospace",
        neon: "'Space Mono', monospace",
        classic: "'Playfair Display', serif",
        playful: "'Quicksand', sans-serif",
        corporate: "'Inter', sans-serif",
        artistic: originalFont.includes("serif") ? "'Playfair Display', serif" : "'Inter', sans-serif",
        minimalist: "'Inter', sans-serif",
        retro: "'Garamond', serif",
        futuristic: "'Space Mono', monospace",
    };
    return fontMap[category] || originalFont;
}

/** Map heading size for pattern category */
function mapHeadingSizeForPattern(category: DesignPatternCategory): string {
    const sizeMap: Record<DesignPatternCategory, string> = {
        modern: "2.5rem",
        brutalist: "3rem",
        neon: "1.8rem",
        classic: "2.8rem",
        playful: "2.2rem",
        corporate: "2rem",
        artistic: "2.6rem",
        minimalist: "2.2rem",
        retro: "2.8rem",
        futuristic: "1.6rem",
    };
    return sizeMap[category] || "2rem";
}

/** Map body size for pattern category */
function mapBodySizeForPattern(category: DesignPatternCategory): string {
    const sizeMap: Record<DesignPatternCategory, string> = {
        modern: "1rem",
        brutalist: "0.9rem",
        neon: "0.85rem",
        classic: "1.1rem",
        playful: "1rem",
        corporate: "0.9rem",
        artistic: "1rem",
        minimalist: "0.9rem",
        retro: "1.1rem",
        futuristic: "0.8rem",
    };
    return sizeMap[category] || "1rem";
}

/** Map alignment for pattern category */
function mapAlignmentForPattern(category: DesignPatternCategory): "left" | "center" | "right" {
    const alignmentMap: Record<DesignPatternCategory, "left" | "center" | "right"> = {
        modern: "center",
        brutalist: "left",
        neon: "left",
        classic: "left",
        playful: "center",
        corporate: "left",
        artistic: "center",
        minimalist: "center",
        retro: "left",
        futuristic: "left",
    };
    return alignmentMap[category] || "center";
}

/** Map padding style to CSS value */
function mapPaddingForPattern(padding: string): string {
    const paddingMap: Record<string, string> = {
        tight: "1rem",
        normal: "1.5rem",
        loose: "2rem",
    };
    return paddingMap[padding] || "1.5rem";
}

// ─── Utility Functions ───────────────────────────────────────────────────────

/** Get brightness of a color (0-255) */
function getColorBrightness(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000;
}

/** Get saturation of a color (0-1) */
function getColorSaturation(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    if (max === min) return 0;
    return (max - min) / (1 - Math.abs(2 * l - 1));
}