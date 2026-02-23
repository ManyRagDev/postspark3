/**
 * VisionExtractor: Extract visual styles from website screenshots using Gemini Vision
 *
 * When HTML-based extraction fails (SPAs, CSS-in-JS, dynamic rendering),
 * this module sends a screenshot to Gemini Vision for pixel-accurate style extraction.
 *
 * Inspired by Pomelli's approach of using vision neural networks to identify
 * hierarchy, colors, and typography from rendered interfaces.
 */

import { invokeLLM } from "./_core/llm";
import type { ExtractedStyleData } from "@shared/postspark";

/** Vision-extracted style data (may be partial) */
export interface VisionStyleData {
    colors: {
        primary: string;
        secondary: string;
        background: string;
        text: string;
        accent: string;
    };
    typography: {
        headingFont: string;
        bodyFont: string;
    };
    spacing: {
        density: "compact" | "normal" | "spacious";
        borderRadius: "square" | "rounded" | "pill";
    };
    effects: {
        shadows: boolean;
        gradients: boolean;
        darkMode: boolean;
    };
    aesthetic: string;
}

/** Extract visual styles from a screenshot using Gemini Vision */
export async function extractStylesFromScreenshot(
    screenshotBase64: string,
    url: string
): Promise<VisionStyleData> {
    console.log("[visionExtractor] Analyzing screenshot for:", url);

    const response = await invokeLLM({
        messages: [
            {
                role: "system",
                content: `You are an expert visual design analyst, trained like a Senior Art Director.
Analyze website screenshots and extract precise visual design tokens.

For COLORS: Look at actual pixel colors in the screenshot. Identify:
- The dominant background color of the page
- The main text color
- The primary brand/accent color (buttons, links, highlights)
- A secondary color if visible
Report EXACT hex values from what you see — not generic defaults.

For TYPOGRAPHY: Identify whether fonts appear to be:
- Serif (like Times, Georgia, Playfair Display)
- Sans-serif (like Inter, Roboto, Helvetica)
- Monospace (like Courier, Fira Code)
- Display/decorative
Report the most likely font category, not exact font names.

For SPACING: Assess overall density and border-radius style from the UI.

Be precise and specific. Every website has a unique visual identity — capture it.`,
            },
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: `Analyze this website screenshot (${url}) and extract the visual design system.
Return precise hex color values based on what you actually see in the image.`,
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: screenshotBase64,
                            detail: "high",
                        },
                    },
                ],
            },
        ],
        response_format: {
            type: "json_schema",
            json_schema: {
                name: "vision_style_extraction",
                strict: true,
                schema: {
                    type: "object",
                    properties: {
                        colors: {
                            type: "object",
                            properties: {
                                primary: { type: "string", description: "Primary brand color hex (buttons, links, brand elements)" },
                                secondary: { type: "string", description: "Secondary color hex" },
                                background: { type: "string", description: "Main page background color hex" },
                                text: { type: "string", description: "Main body text color hex" },
                                accent: { type: "string", description: "Accent/highlight color hex (CTAs, hover states)" },
                            },
                            required: ["primary", "secondary", "background", "text", "accent"],
                            additionalProperties: false,
                        },
                        typography: {
                            type: "object",
                            properties: {
                                headingFont: { type: "string", description: "Heading font name or category (e.g. 'Inter, sans-serif' or 'serif')" },
                                bodyFont: { type: "string", description: "Body font name or category" },
                            },
                            required: ["headingFont", "bodyFont"],
                            additionalProperties: false,
                        },
                        spacing: {
                            type: "object",
                            properties: {
                                density: { type: "string", enum: ["compact", "normal", "spacious"] },
                                borderRadius: { type: "string", enum: ["square", "rounded", "pill"] },
                            },
                            required: ["density", "borderRadius"],
                            additionalProperties: false,
                        },
                        effects: {
                            type: "object",
                            properties: {
                                shadows: { type: "boolean", description: "Does the UI use visible box shadows?" },
                                gradients: { type: "boolean", description: "Are gradients visible in the design?" },
                                darkMode: { type: "boolean", description: "Is this a dark-themed website?" },
                            },
                            required: ["shadows", "gradients", "darkMode"],
                            additionalProperties: false,
                        },
                        aesthetic: {
                            type: "string",
                            description: "Overall design aesthetic in 2-3 words (e.g. 'modern minimalist', 'bold corporate', 'playful colorful')",
                        },
                    },
                    required: ["colors", "typography", "spacing", "effects", "aesthetic"],
                    additionalProperties: false,
                },
            },
        },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from Vision LLM");

    const contentStr = typeof content === "string" ? content : JSON.stringify(content);
    const parsed = JSON.parse(contentStr) as VisionStyleData;

    console.log("[visionExtractor] Vision extraction result:", {
        colors: parsed.colors,
        aesthetic: parsed.aesthetic,
        darkMode: parsed.effects.darkMode,
    });

    return parsed;
}

/** Merge HTML-based extraction with vision-based extraction.
 * Vision data fills gaps where HTML extraction returned defaults. */
export function mergeExtractionResults(
    html: ExtractedStyleData,
    vision: VisionStyleData
): ExtractedStyleData {
    const isDefaultColor = (hex: string) =>
        ["#6366f1", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"].includes(hex);
    const isDefaultFont = (font: string) =>
        font === "Inter, sans-serif" || font === "Inter";

    return {
        colors: {
            // Vision colors take precedence when HTML returned defaults
            primary: isDefaultColor(html.colors.primary) ? vision.colors.primary : html.colors.primary,
            secondary: isDefaultColor(html.colors.secondary) ? vision.colors.secondary : html.colors.secondary,
            background: html.colors.background === "#ffffff" && vision.effects.darkMode
                ? vision.colors.background
                : (isDefaultColor(html.colors.background) ? vision.colors.background : html.colors.background),
            text: html.colors.text === "#1f2937" && vision.effects.darkMode
                ? vision.colors.text
                : (isDefaultColor(html.colors.text) ? vision.colors.text : html.colors.text),
            accent: isDefaultColor(html.colors.accent) ? vision.colors.accent : html.colors.accent,
            // Build palette from both sources
            palette: buildMergedPalette(html, vision),
        },
        typography: {
            // HTML font names are more precise (actual font names vs vision guesses)
            // But if HTML returned defaults, use vision's font category
            headingFont: isDefaultFont(html.typography.headingFont)
                ? vision.typography.headingFont
                : html.typography.headingFont,
            bodyFont: isDefaultFont(html.typography.bodyFont)
                ? vision.typography.bodyFont
                : html.typography.bodyFont,
            headingWeight: html.typography.headingWeight,
            bodyWeight: html.typography.bodyWeight,
        },
        spacing: {
            // Vision spacing is usually more accurate (sees the actual rendered layout)
            density: html.spacing.density === "normal" ? vision.spacing.density : html.spacing.density,
            borderRadius: html.spacing.borderRadius === "rounded" ? vision.spacing.borderRadius : html.spacing.borderRadius,
            padding: html.spacing.padding,
        },
        effects: {
            shadows: html.effects.shadows || vision.effects.shadows,
            gradients: html.effects.gradients || vision.effects.gradients,
            animations: html.effects.animations,
            glassmorphism: html.effects.glassmorphism,
            noise: html.effects.noise,
        },
        metadata: html.metadata,
    };
}

/** Build a merged palette from HTML and vision sources, deduplicated */
function buildMergedPalette(html: ExtractedStyleData, vision: VisionStyleData): string[] {
    const seen = new Set<string>();
    const palette: string[] = [];

    // Vision colors first (more likely to be accurate for SPAs)
    for (const color of [vision.colors.primary, vision.colors.accent, vision.colors.secondary, vision.colors.background, vision.colors.text]) {
        const lower = color.toLowerCase();
        if (!seen.has(lower)) {
            seen.add(lower);
            palette.push(lower);
        }
    }

    // Then HTML colors that aren't defaults
    const defaults = new Set(["#6366f1", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#ffffff", "#1f2937"]);
    for (const color of html.colors.palette) {
        const lower = color.toLowerCase();
        if (!seen.has(lower) && !defaults.has(lower)) {
            seen.add(lower);
            palette.push(lower);
        }
    }

    return palette.slice(0, 8);
}

/** Assess quality of HTML-based extraction (0-1 score).
 * Used to decide whether to trigger the vision fallback. */
export function assessExtractionQuality(data: ExtractedStyleData): number {
    let score = 0;

    // Check if we got real colors (not defaults)
    const defaultColors = new Set(["#6366f1", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"]);
    const realColors = data.colors.palette.filter(c => !defaultColors.has(c));
    if (realColors.length >= 3) score += 0.3;
    else if (realColors.length >= 1) score += 0.15;

    // Check primary isn't a default
    if (!defaultColors.has(data.colors.primary)) score += 0.2;

    // Check typography isn't default
    if (data.typography.headingFont !== "Inter, sans-serif") score += 0.15;
    if (data.typography.bodyFont !== "Inter, sans-serif") score += 0.1;

    // Check if effects were detected (signals rich CSS content)
    if (data.effects.shadows || data.effects.gradients || data.effects.animations) score += 0.1;

    // Check metadata
    if (data.metadata?.siteName) score += 0.05;
    if (data.metadata?.favicon) score += 0.05;
    if (data.metadata?.logo) score += 0.05;

    return Math.min(1, score);
}
