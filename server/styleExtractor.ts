/**
 * StyleExtractor: Extract visual styles from websites
 * Parses HTML/CSS to extract colors, typography, spacing, and effects
 *
 * Pipeline (Pomelli-inspired):
 * 1. Fetch HTML from URL
 * 2. Fetch external CSS stylesheets (linked via <link rel="stylesheet">)
 * 3. Detect Google Fonts from <link> tags
 * 4. Extract colors with CSS context awareness (background vs text vs accent)
 * 5. Extract typography with semantic DOM analysis (H1/H2 vs body/p)
 * 6. Extract spacing, effects, and metadata
 */

import type {
    ExtractedStyleData,
    SpacingDensity,
    BorderRadiusStyle,
    PaddingStyle,
} from "@shared/postspark";
import { captureScreenshot } from "./screenshotService";
import { extractStylesFromScreenshot, mergeExtractionResults, assessExtractionQuality } from "./visionExtractor";

// ─── Color Context Types ────────────────────────────────────────────────────

interface ColorEntry {
    hex: string;
    score: number;
    contexts: Set<"background" | "text" | "border" | "accent" | "meta" | "variable">;
}

// ─── Utility Functions ──────────────────────────────────────────────────────

/** Convert RGB to hex */
function rgbToHex(r: number, g: number, b: number): string {
    return "#" + [r, g, b].map(x => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0")).join("");
}

/** Parse color string to hex format */
function parseColorToHex(colorStr: string): string | null {
    // Already hex
    if (colorStr.startsWith("#")) {
        const hex = colorStr.slice(1);
        if (hex.length === 3) {
            return "#" + hex.split("").map(c => c + c).join("");
        }
        return colorStr.length <= 7 ? colorStr : colorStr.slice(0, 7);
    }

    // RGB format
    const rgbMatch = colorStr.match(/rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/i);
    if (rgbMatch) {
        return rgbToHex(parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3]));
    }

    // RGBA format (ignore alpha)
    const rgbaMatch = colorStr.match(/rgba\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
    if (rgbaMatch) {
        return rgbToHex(parseInt(rgbaMatch[1]), parseInt(rgbaMatch[2]), parseInt(rgbaMatch[3]));
    }

    return null;
}

/** Check if a color is valid (not too close to pure black/white) */
function isValidColor(hex: string): boolean {
    if (hex.length < 7) return false;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 20 && brightness < 235;
}

/** Get brightness of a hex color (0-255) */
function getBrightness(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000;
}

/** Get saturation of a hex color (0-1) */
function getSaturation(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max === 0 ? 0 : (max - min) / max;
}

/** Resolve relative URL to absolute */
function resolveUrl(url: string, baseUrl: string): string {
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
        return url;
    }
    try {
        const base = new URL(baseUrl);
        return new URL(url, base).href;
    } catch {
        return url;
    }
}

/** Extract all CSS content from HTML (inline styles + style tags) */
function getAllStyleContent(html: string): string {
    const styleContent = html.match(/style\s*=\s*["'][^"']*["']/gi) || [];
    const styleTags = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
    return [...styleContent, ...styleTags].join("\n");
}

// ─── External CSS Fetching ──────────────────────────────────────────────────

/** Fetch external stylesheets linked in the HTML */
async function fetchExternalStylesheets(html: string, baseUrl: string): Promise<string> {
    // Match <link rel="stylesheet" href="..."> in both attribute orders
    const linkPatterns = [
        /<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi,
        /<link[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi,
    ];

    const urls = new Set<string>();
    for (const pattern of linkPatterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
            const resolved = resolveUrl(match[1], baseUrl);
            // Only fetch http(s) URLs, skip data: URIs and google fonts CSS (handled separately)
            if (resolved.startsWith("http") && !resolved.includes("fonts.googleapis.com")) {
                urls.add(resolved);
            }
        }
    }

    if (urls.size === 0) return "";

    console.log(`[styleExtractor] Fetching ${urls.size} external stylesheets`);

    // Fetch up to 5 stylesheets in parallel
    const cssPromises = Array.from(urls).slice(0, 5).map(async (cssUrl) => {
        try {
            const res = await fetch(cssUrl, {
                signal: AbortSignal.timeout(5000),
                headers: {
                    "User-Agent": "Mozilla/5.0 (compatible; PostSpark Style Extractor/1.0)",
                    "Accept": "text/css,*/*",
                },
            });
            if (!res.ok) return "";
            const text = await res.text();
            // Cap at 500KB per file to avoid memory issues
            return text.slice(0, 500_000);
        } catch {
            return "";
        }
    });

    const results = await Promise.all(cssPromises);
    const totalCss = results.join("\n");
    console.log(`[styleExtractor] Fetched ${totalCss.length} chars of external CSS`);
    return totalCss;
}

// ─── Google Fonts Detection ─────────────────────────────────────────────────

/** Extract Google Font family names from HTML link tags */
function extractGoogleFonts(html: string): string[] {
    const fonts: string[] = [];

    // Match Google Fonts v2: fonts.googleapis.com/css2?family=Roboto:wght@400;700&family=Open+Sans
    // Match Google Fonts v1: fonts.googleapis.com/css?family=Roboto|Open+Sans
    const googleFontsPattern = /fonts\.googleapis\.com\/css2?\?[^"'<>]*family=([^"'<>]+)/gi;
    let match;
    while ((match = googleFontsPattern.exec(html)) !== null) {
        const familyStr = match[1];

        // v2 format: family=Roboto:wght@400;700&family=Open+Sans:ital,wght@0,400
        // v1 format: family=Roboto|Open+Sans:400,700
        const familyParts = familyStr.split(/&(?:family=)?|\|/);
        for (const part of familyParts) {
            // Extract font name before any : or @ modifiers
            const fontName = decodeURIComponent(part.split(":")[0].replace(/\+/g, " ")).trim();
            if (fontName && !fontName.includes("=") && fontName.length > 1) {
                fonts.push(fontName);
            }
        }
    }

    // Deduplicate while preserving order
    return Array.from(new Set(fonts));
}

// ─── Context-Aware Color Extraction ─────────────────────────────────────────

/** Extract colors with CSS context awareness (Pomelli-inspired "Business DNA" extraction) */
export function extractColorsFromHTML(html: string): string[] {
    const colors = new Map<string, ColorEntry>();

    function addColor(hex: string | null, score: number, context: ColorEntry["contexts"] extends Set<infer T> ? T : never) {
        if (!hex) return;
        hex = hex.toLowerCase();
        if (!isValidColor(hex)) return;
        const existing = colors.get(hex);
        if (existing) {
            existing.score += score;
            existing.contexts.add(context);
        } else {
            colors.set(hex, { hex, score, contexts: new Set([context]) });
        }
    }

    // ── Meta tags (highest priority — explicit brand color declarations) ──
    const metaThemeColor = html.match(/<meta[^>]*name\s*=\s*["']theme-color["'][^>]*content\s*=\s*["']([^"']+)["']/i);
    if (metaThemeColor) addColor(parseColorToHex(metaThemeColor[1]), 30, "meta");

    const metaTileColor = html.match(/<meta[^>]*name\s*=\s*["']msapplication-TileColor["'][^>]*content\s*=\s*["']([^"']+)["']/i);
    if (metaTileColor) addColor(parseColorToHex(metaTileColor[1]), 30, "meta");

    // ── CSS variables with brand-semantic names (very high signal) ──
    const allStyles = getAllStyleContent(html);
    const brandVarPatterns = [
        { pattern: /--(?:primary|brand|main)[-\w]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi, score: 25, ctx: "accent" as const },
        { pattern: /--(?:accent|highlight|cta|action)[-\w]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi, score: 25, ctx: "accent" as const },
        { pattern: /--(?:bg|background|surface)[-\w]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi, score: 20, ctx: "background" as const },
        { pattern: /--(?:text|foreground|body)[-\w]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi, score: 20, ctx: "text" as const },
        { pattern: /--(?:color|secondary)[-\w]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi, score: 15, ctx: "variable" as const },
    ];
    for (const { pattern, score, ctx } of brandVarPatterns) {
        let m;
        while ((m = pattern.exec(allStyles)) !== null) {
            addColor(parseColorToHex(m[1]), score, ctx);
        }
    }

    // ── Context-aware CSS property extraction ──
    // background-color on body/html/root = page background
    const bodyBgPattern = /(?:body|html|:root)\s*\{[^}]*background(?:-color)?\s*:\s*([^;}\s]+)/gi;
    let m;
    while ((m = bodyBgPattern.exec(allStyles)) !== null) {
        addColor(parseColorToHex(m[1]), 20, "background");
    }

    // color on body/html = main text color
    const bodyTextPattern = /(?:body|html)\s*\{[^}]*(?<![a-z-])color\s*:\s*([^;}\s]+)/gi;
    while ((m = bodyTextPattern.exec(allStyles)) !== null) {
        addColor(parseColorToHex(m[1]), 20, "text");
    }

    // Button/CTA colors = accent
    const btnPattern = /(?:button|\.btn|\.cta|a\.btn|input\[type=['"]submit['"]\]|\.button)\s*\{[^}]*(?:background(?:-color)?|color)\s*:\s*([^;}\s]+)/gi;
    while ((m = btnPattern.exec(allStyles)) !== null) {
        addColor(parseColorToHex(m[1]), 15, "accent");
    }

    // General background-color declarations
    const bgColorPattern = /background-color\s*:\s*([^;}"'\s]+)/gi;
    while ((m = bgColorPattern.exec(allStyles)) !== null) {
        addColor(parseColorToHex(m[1]), 5, "background");
    }

    // General background shorthand (only hex/rgb, skip url() and gradients)
    const bgShortPattern = /background\s*:\s*(#[0-9a-fA-F]{3,8}|rgb\([^)]+\))/gi;
    while ((m = bgShortPattern.exec(allStyles)) !== null) {
        addColor(parseColorToHex(m[1]), 5, "background");
    }

    // General color declarations (text context)
    const textColorPattern = /(?<![a-z-])color\s*:\s*([^;}"'\s]+)/gi;
    while ((m = textColorPattern.exec(allStyles)) !== null) {
        addColor(parseColorToHex(m[1]), 3, "text");
    }

    // Border colors
    const borderColorPattern = /border(?:-color)?\s*:\s*(?:\d+px\s+\w+\s+)?(#[0-9a-fA-F]{3,8}|rgb[a]?\([^)]+\))/gi;
    while ((m = borderColorPattern.exec(allStyles)) !== null) {
        addColor(parseColorToHex(m[1]), 2, "border");
    }

    // ── Legacy inline attributes ──
    const bgColor = html.match(/bgcolor\s*=\s*["']([^"']+)["']/i);
    if (bgColor) addColor(parseColorToHex(bgColor[1]), 5, "background");

    const dataColors = html.match(/data-(?:color|bg|background|accent)\s*=\s*["']([^"']+)["']/gi) || [];
    for (const dc of dataColors) {
        const colorMatch = dc.match(/["']([^"']+)["']/);
        if (colorMatch) addColor(parseColorToHex(colorMatch[1]), 5, "variable");
    }

    // ── Bulk hex/rgb scan (low priority, catches remaining colors) ──
    const hexPattern = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
    while ((m = hexPattern.exec(allStyles)) !== null) {
        let hex = "#" + m[1];
        if (hex.length === 4) hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
        hex = hex.slice(0, 7).toLowerCase();
        addColor(hex, 1, "variable");
    }

    const rgbPattern = /rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/g;
    while ((m = rgbPattern.exec(allStyles)) !== null) {
        addColor(rgbToHex(parseInt(m[1]), parseInt(m[2]), parseInt(m[3])), 1, "variable");
    }

    const rgbaPattern = /rgba\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([\d.]+)\s*\)/g;
    while ((m = rgbaPattern.exec(allStyles)) !== null) {
        addColor(rgbToHex(parseInt(m[1]), parseInt(m[2]), parseInt(m[3])), 1, "variable");
    }

    // Sort by score and return top 8
    return Array.from(colors.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(c => c.hex);
}

/** Classify a color's role using context data from extraction, with brightness as fallback */
function classifyColor(hex: string, contextMap?: Map<string, ColorEntry>): { type: "bg" | "text" | "accent"; brightness: number } {
    const brightness = getBrightness(hex);

    // If we have context data, use it
    if (contextMap) {
        const entry = contextMap.get(hex.toLowerCase());
        if (entry) {
            if (entry.contexts.has("background")) return { type: "bg", brightness };
            if (entry.contexts.has("text")) return { type: "text", brightness };
            if (entry.contexts.has("accent") || entry.contexts.has("meta")) return { type: "accent", brightness };
        }
    }

    // Fallback to brightness + saturation based classification
    const saturation = getSaturation(hex);
    if (brightness < 50) return { type: "text", brightness };
    if (brightness > 200) return { type: "bg", brightness };
    if (saturation > 0.3) return { type: "accent", brightness };
    return { type: "bg", brightness };
}

/** Extract colors with context tracking (used internally for classification) */
function extractColorsWithContext(html: string): { colors: string[]; contextMap: Map<string, ColorEntry> } {
    const colorMap = new Map<string, ColorEntry>();

    function addColor(hex: string | null, score: number, context: ColorEntry["contexts"] extends Set<infer T> ? T : never) {
        if (!hex) return;
        hex = hex.toLowerCase();
        if (!isValidColor(hex)) return;
        const existing = colorMap.get(hex);
        if (existing) {
            existing.score += score;
            existing.contexts.add(context);
        } else {
            colorMap.set(hex, { hex, score, contexts: new Set([context]) });
        }
    }

    // Same extraction logic as extractColorsFromHTML but we keep the map
    const allStyles = getAllStyleContent(html);

    // Meta tags
    const metaThemeColor = html.match(/<meta[^>]*name\s*=\s*["']theme-color["'][^>]*content\s*=\s*["']([^"']+)["']/i);
    if (metaThemeColor) addColor(parseColorToHex(metaThemeColor[1]), 30, "meta");

    const metaTileColor = html.match(/<meta[^>]*name\s*=\s*["']msapplication-TileColor["'][^>]*content\s*=\s*["']([^"']+)["']/i);
    if (metaTileColor) addColor(parseColorToHex(metaTileColor[1]), 30, "meta");

    // CSS variables with brand-semantic names
    const brandVarPatterns = [
        { pattern: /--(?:primary|brand|main)[-\w]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi, score: 25, ctx: "accent" as const },
        { pattern: /--(?:accent|highlight|cta|action)[-\w]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi, score: 25, ctx: "accent" as const },
        { pattern: /--(?:bg|background|surface)[-\w]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi, score: 20, ctx: "background" as const },
        { pattern: /--(?:text|foreground|body)[-\w]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi, score: 20, ctx: "text" as const },
        { pattern: /--(?:color|secondary)[-\w]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi, score: 15, ctx: "variable" as const },
    ];
    for (const { pattern, score, ctx } of brandVarPatterns) {
        let m;
        while ((m = pattern.exec(allStyles)) !== null) {
            addColor(parseColorToHex(m[1]), score, ctx);
        }
    }

    // Context-aware CSS property extraction
    let m;
    const bodyBgPattern = /(?:body|html|:root)\s*\{[^}]*background(?:-color)?\s*:\s*([^;}\s]+)/gi;
    while ((m = bodyBgPattern.exec(allStyles)) !== null) addColor(parseColorToHex(m[1]), 20, "background");

    const bodyTextPattern = /(?:body|html)\s*\{[^}]*(?<![a-z-])color\s*:\s*([^;}\s]+)/gi;
    while ((m = bodyTextPattern.exec(allStyles)) !== null) addColor(parseColorToHex(m[1]), 20, "text");

    const btnPattern = /(?:button|\.btn|\.cta|a\.btn|input\[type=['"]submit['"]\]|\.button)\s*\{[^}]*(?:background(?:-color)?|color)\s*:\s*([^;}\s]+)/gi;
    while ((m = btnPattern.exec(allStyles)) !== null) addColor(parseColorToHex(m[1]), 15, "accent");

    const bgColorPattern = /background-color\s*:\s*([^;}"'\s]+)/gi;
    while ((m = bgColorPattern.exec(allStyles)) !== null) addColor(parseColorToHex(m[1]), 5, "background");

    const bgShortPattern = /background\s*:\s*(#[0-9a-fA-F]{3,8}|rgb\([^)]+\))/gi;
    while ((m = bgShortPattern.exec(allStyles)) !== null) addColor(parseColorToHex(m[1]), 5, "background");

    const textColorPattern = /(?<![a-z-])color\s*:\s*([^;}"'\s]+)/gi;
    while ((m = textColorPattern.exec(allStyles)) !== null) addColor(parseColorToHex(m[1]), 3, "text");

    const borderColorPattern = /border(?:-color)?\s*:\s*(?:\d+px\s+\w+\s+)?(#[0-9a-fA-F]{3,8}|rgb[a]?\([^)]+\))/gi;
    while ((m = borderColorPattern.exec(allStyles)) !== null) addColor(parseColorToHex(m[1]), 2, "border");

    // Legacy inline attributes
    const bgColor = html.match(/bgcolor\s*=\s*["']([^"']+)["']/i);
    if (bgColor) addColor(parseColorToHex(bgColor[1]), 5, "background");

    // Bulk scan
    const hexPattern = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
    while ((m = hexPattern.exec(allStyles)) !== null) {
        let hex = "#" + m[1];
        if (hex.length === 4) hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
        hex = hex.slice(0, 7).toLowerCase();
        addColor(hex, 1, "variable");
    }

    const rgbPattern = /rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/g;
    while ((m = rgbPattern.exec(allStyles)) !== null) {
        addColor(rgbToHex(parseInt(m[1]), parseInt(m[2]), parseInt(m[3])), 1, "variable");
    }

    const colors = Array.from(colorMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(c => c.hex);

    return { colors, contextMap: colorMap };
}

// ─── Typography Extraction ──────────────────────────────────────────────────

/** Extract font families from HTML/CSS with semantic awareness and Google Fonts detection */
export function extractTypographyFromHTML(html: string, googleFonts?: string[]): {
    headingFont: string;
    bodyFont: string;
    headingWeight: string;
    bodyWeight: string;
} {
    const allStyles = getAllStyleContent(html);

    // ── Layer 1: Semantic DOM analysis (highest priority) ──
    let semanticHeadingFont: string | null = null;
    let semanticBodyFont: string | null = null;

    // Find font-family in CSS rules targeting heading selectors
    const headingCssPattern = /(?:^|\}|\s)(h[1-3])(?:\s*,\s*h[1-3])*\s*\{[^}]*font-family\s*:\s*([^;}"']+)/gi;
    let m;
    while ((m = headingCssPattern.exec(allStyles)) !== null) {
        const font = m[2].split(",")[0].replace(/["']/g, "").trim();
        if (font && font !== "inherit" && font !== "initial") {
            semanticHeadingFont = font;
            break;
        }
    }

    // Find font-family in CSS rules targeting body/paragraph selectors
    const bodyCssPattern = /(?:^|\}|\s)(?:body|p|\.text|\.content|\.body-text|main)\s*\{[^}]*font-family\s*:\s*([^;}"']+)/gi;
    while ((m = bodyCssPattern.exec(allStyles)) !== null) {
        const font = m[1].split(",")[0].replace(/["']/g, "").trim();
        if (font && font !== "inherit" && font !== "initial") {
            semanticBodyFont = font;
            break;
        }
    }

    // Also check inline styles on heading tags in the HTML
    if (!semanticHeadingFont) {
        const h1InlinePattern = /<h[1-3][^>]*style\s*=\s*["'][^"']*font-family\s*:\s*([^;}"']+)/gi;
        while ((m = h1InlinePattern.exec(html)) !== null) {
            const font = m[1].split(",")[0].replace(/["']/g, "").trim();
            if (font && font !== "inherit" && font !== "initial") {
                semanticHeadingFont = font;
                break;
            }
        }
    }

    // ── Layer 2: Google Fonts (second priority) ──
    const detectedGoogleFonts = googleFonts ?? extractGoogleFonts(html);

    // If we have Google Fonts and no semantic result, use them
    if (!semanticHeadingFont && detectedGoogleFonts.length >= 1) {
        // First Google Font is often the display/heading font
        semanticHeadingFont = detectedGoogleFonts[0];
    }
    if (!semanticBodyFont && detectedGoogleFonts.length >= 2) {
        semanticBodyFont = detectedGoogleFonts[1];
    } else if (!semanticBodyFont && detectedGoogleFonts.length === 1) {
        semanticBodyFont = detectedGoogleFonts[0];
    }

    // ── Layer 3: Frequency analysis (fallback) ──
    const fonts: Map<string, number> = new Map();
    const weights: Map<string, number> = new Map();

    // Find all font-family declarations
    const fontMatches = allStyles.match(/font-family\s*:\s*([^;}"']+)/gi) || [];
    for (const match of fontMatches) {
        const fontValue = match.replace(/font-family\s*:\s*/i, "").trim();
        const primaryFont = fontValue.split(",")[0].replace(/["']/g, "").trim();
        if (primaryFont && primaryFont !== "inherit" && primaryFont !== "initial") {
            fonts.set(primaryFont, (fonts.get(primaryFont) || 0) + 1);
        }
    }

    // Google Fonts get a boost in frequency analysis
    for (const gf of detectedGoogleFonts) {
        fonts.set(gf, (fonts.get(gf) || 0) + 50);
    }

    // Find font-weight declarations
    const weightMatches = allStyles.match(/font-weight\s*:\s*(\d+|normal|bold|lighter|bolder)/gi) || [];
    for (const match of weightMatches) {
        const weight = match.replace(/font-weight\s*:\s*/i, "").trim();
        weights.set(weight, (weights.get(weight) || 0) + 1);
    }

    const sortedFonts = Array.from(fonts.entries()).sort((a, b) => b[1] - a[1]);
    const sortedWeights = Array.from(weights.entries()).sort((a, b) => b[1] - a[1]);

    // ── Combine layers ──
    const bodyFont = semanticBodyFont || sortedFonts[0]?.[0] || "Inter, sans-serif";
    const headingFont = semanticHeadingFont || sortedFonts[1]?.[0] || bodyFont;

    // Weights
    const bodyWeight = sortedWeights.find(([w]) => w === "normal" || w === "400")?.[0] || "400";
    const headingWeight = sortedWeights.find(([w]) => w === "bold" || w === "600" || w === "700")?.[0] || "700";

    return {
        headingFont,
        bodyFont,
        headingWeight,
        bodyWeight,
    };
}

// ─── Spacing & Layout Extraction ────────────────────────────────────────────

/** Extract spacing characteristics from HTML */
export function extractSpacingFromHTML(html: string): {
    density: SpacingDensity;
    borderRadius: BorderRadiusStyle;
    padding: PaddingStyle;
} {
    const allStyles = getAllStyleContent(html);

    // Count padding/margin usage
    const paddingMatches = allStyles.match(/padding\s*:\s*(\d+)/gi) || [];
    const paddingValues = paddingMatches.map(m => parseInt(m.match(/\d+/)?.[0] || "0"));

    // Calculate average padding
    const avgPadding = paddingValues.length > 0
        ? paddingValues.reduce((a, b) => a + b, 0) / paddingValues.length
        : 16;

    let density: SpacingDensity = "normal";
    if (avgPadding < 10) density = "compact";
    else if (avgPadding > 24) density = "spacious";

    let padding: PaddingStyle = "normal";
    if (avgPadding < 12) padding = "tight";
    else if (avgPadding > 20) padding = "loose";

    // Analyze border-radius
    const radiusMatches = allStyles.match(/border-radius\s*:\s*(\d+)(px|rem|em|%)/gi) || [];
    const radiusValues = radiusMatches.map(m => parseInt(m.match(/\d+/)?.[0] || "0"));
    const avgRadius = radiusValues.length > 0
        ? radiusValues.reduce((a, b) => a + b, 0) / radiusValues.length
        : 4;

    let borderRadius: BorderRadiusStyle = "rounded";
    if (avgRadius === 0 || avgRadius < 2) borderRadius = "square";
    else if (avgRadius > 20) borderRadius = "pill";

    return { density, borderRadius, padding };
}

// ─── Effects Detection ──────────────────────────────────────────────────────

/** Detect visual effects from HTML/CSS */
export function detectEffectsFromHTML(html: string): {
    shadows: boolean;
    gradients: boolean;
    animations: boolean;
    glassmorphism: boolean;
    noise: boolean;
} {
    const allStyles = getAllStyleContent(html).toLowerCase();

    return {
        shadows: /box-shadow\s*:|text-shadow\s*:/.test(allStyles),
        gradients: /linear-gradient|radial-gradient|gradient\s*\(/.test(allStyles),
        animations: /animation\s*:|@keyframes|transition\s*:/.test(allStyles),
        glassmorphism: /backdrop-filter\s*:\s*blur|backdrop-filter\s*:\s*saturate/.test(allStyles),
        noise: /noise|grain|texture/.test(html.toLowerCase()) || /url\s*\([^)]*noise/.test(allStyles),
    };
}

// ─── Metadata Extraction ────────────────────────────────────────────────────

/** Extract site metadata from HTML */
function extractMetadata(html: string, baseUrl: string): {
    favicon?: string;
    logo?: string;
    siteName?: string;
} {
    const metadata: { favicon?: string; logo?: string; siteName?: string } = {};

    // Favicon
    const faviconMatch = html.match(/<link[^>]*rel\s*=\s*["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*href\s*=\s*["']([^"']+)["']/i);
    if (faviconMatch) {
        metadata.favicon = resolveUrl(faviconMatch[1], baseUrl);
    }

    // Logo (from og:image)
    const ogImageMatch = html.match(/<meta[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i);
    if (ogImageMatch) {
        metadata.logo = resolveUrl(ogImageMatch[1], baseUrl);
    }

    // Site name
    const siteNameMatch = html.match(/<meta[^>]*property\s*=\s*["']og:site_name["'][^>]*content\s*=\s*["']([^"']+)["']/i);
    if (siteNameMatch) {
        metadata.siteName = siteNameMatch[1];
    }

    return metadata;
}

// ─── Main Extraction Function ───────────────────────────────────────────────

/** Result includes visionUsed flag for the router to report */
export interface ExtractionResultInternal {
    data: ExtractedStyleData;
    visionUsed: boolean;
}

/** Extract all style data from a URL (enhanced Pomelli-inspired hybrid pipeline) */
export async function extractStyleFromUrl(url: string): Promise<ExtractedStyleData> {
    const result = await extractStyleFromUrlWithMeta(url);
    return result.data;
}

/** Extract style data with metadata about extraction method */
export async function extractStyleFromUrlWithMeta(url: string): Promise<ExtractionResultInternal> {
    console.log("[styleExtractor] ── Hybrid Pipeline Start ──");
    console.log("[styleExtractor] URL:", url);

    // ── Pass 1: HTML-based extraction (fast, free) ──
    const htmlResult = await extractFromHTML(url);
    const quality = assessExtractionQuality(htmlResult);
    console.log("[styleExtractor] HTML extraction quality score:", quality.toFixed(2));

    if (quality >= 0.6) {
        console.log("[styleExtractor] HTML extraction sufficient, skipping vision");
        console.log("[styleExtractor] ── Hybrid Pipeline End (HTML only) ──");
        return { data: htmlResult, visionUsed: false };
    }

    // ── Pass 2: Vision-based extraction (handles SPAs) ──
    console.log("[styleExtractor] Low quality HTML extraction, attempting vision fallback...");
    try {
        const screenshotBuffer = await captureScreenshot(url);
        if (!screenshotBuffer) {
            console.log("[styleExtractor] Screenshot capture failed, using HTML result as-is");
            return { data: htmlResult, visionUsed: false };
        }

        const screenshotBase64 = `data:image/png;base64,${Buffer.from(screenshotBuffer).toString("base64")}`;
        const visionResult = await extractStylesFromScreenshot(screenshotBase64, url);
        const merged = mergeExtractionResults(htmlResult, visionResult);
        console.log("[styleExtractor] ── Hybrid Pipeline End (HTML + Vision merged) ──");
        return { data: merged, visionUsed: true };
    } catch (error) {
        console.warn("[styleExtractor] Vision extraction failed:", error);
        console.log("[styleExtractor] ── Hybrid Pipeline End (HTML fallback) ──");
        return { data: htmlResult, visionUsed: false };
    }
}

/** HTML-only extraction pass (Phase 1 improvements) */
async function extractFromHTML(url: string): Promise<ExtractedStyleData> {
    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
            },
            signal: AbortSignal.timeout(15000),
        });

        console.log("[styleExtractor] Response status:", response.status);
        const html = await response.text();
        console.log("[styleExtractor] HTML length:", html.length, "characters");

        // Step 1: Fetch external CSS stylesheets
        const externalCss = await fetchExternalStylesheets(html, url);

        // Enrich HTML with external CSS for unified parsing
        const enrichedHtml = externalCss
            ? html + `\n<style>${externalCss}</style>`
            : html;

        console.log("[styleExtractor] Enriched HTML length:", enrichedHtml.length, "characters");

        // Step 2: Detect Google Fonts
        const googleFonts = extractGoogleFonts(html);
        if (googleFonts.length > 0) {
            console.log("[styleExtractor] Google Fonts detected:", googleFonts.join(", "));
        }

        // Step 3: Extract all components from enriched HTML
        const { colors, contextMap } = extractColorsWithContext(enrichedHtml);
        const typography = extractTypographyFromHTML(enrichedHtml, googleFonts);
        const spacing = extractSpacingFromHTML(enrichedHtml);
        const effects = detectEffectsFromHTML(enrichedHtml);
        const metadata = extractMetadata(html, url);

        // Step 4: Classify colors using context data
        const classifiedColors = colors.map(c => ({ hex: c, ...classifyColor(c, contextMap) }));

        const bgColors = classifiedColors.filter(c => c.type === "bg").map(c => c.hex);
        const textColors = classifiedColors.filter(c => c.type === "text").map(c => c.hex);
        const accentColors = classifiedColors.filter(c => c.type === "accent").map(c => c.hex);

        console.log("[styleExtractor] Classification:", {
            bg: bgColors.slice(0, 2),
            text: textColors.slice(0, 2),
            accent: accentColors.slice(0, 2),
            totalPalette: colors.length,
        });

        return {
            colors: {
                primary: accentColors[0] || colors[0] || "#6366f1",
                secondary: accentColors[1] || colors[1] || colors[0] || "#8b5cf6",
                background: bgColors[0] || "#ffffff",
                text: textColors[0] || "#1f2937",
                accent: accentColors[0] || colors[2] || "#f59e0b",
                palette: colors.slice(0, 8),
            },
            typography,
            spacing,
            effects,
            metadata,
        };
    } catch (error) {
        console.error("HTML extraction failed:", error);
        return getDefaultStyleData();
    }
}

/** Default style data for fallback */
function getDefaultStyleData(): ExtractedStyleData {
    return {
        colors: {
            primary: "#6366f1",
            secondary: "#8b5cf6",
            background: "#ffffff",
            text: "#1f2937",
            accent: "#f59e0b",
            palette: ["#6366f1", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"],
        },
        typography: {
            headingFont: "Inter, sans-serif",
            bodyFont: "Inter, sans-serif",
            headingWeight: "700",
            bodyWeight: "400",
        },
        spacing: {
            density: "normal",
            borderRadius: "rounded",
            padding: "normal",
        },
        effects: {
            shadows: false,
            gradients: false,
            animations: false,
            glassmorphism: false,
            noise: false,
        },
        metadata: {},
    };
}

/** Extract style data from HTML string (for testing) */
export function extractStyleFromHTML(html: string, baseUrl: string = "https://example.com"): ExtractedStyleData {
    const { colors, contextMap } = extractColorsWithContext(html);
    const typography = extractTypographyFromHTML(html);
    const spacing = extractSpacingFromHTML(html);
    const effects = detectEffectsFromHTML(html);
    const metadata = extractMetadata(html, baseUrl);

    const classifiedColors = colors.map(c => ({ hex: c, ...classifyColor(c, contextMap) }));
    const bgColors = classifiedColors.filter(c => c.type === "bg").map(c => c.hex);
    const textColors = classifiedColors.filter(c => c.type === "text").map(c => c.hex);
    const accentColors = classifiedColors.filter(c => c.type === "accent").map(c => c.hex);

    return {
        colors: {
            primary: accentColors[0] || colors[0] || "#6366f1",
            secondary: accentColors[1] || colors[1] || colors[0] || "#8b5cf6",
            background: bgColors[0] || "#ffffff",
            text: textColors[0] || "#1f2937",
            accent: accentColors[0] || colors[2] || "#f59e0b",
            palette: colors.slice(0, 8),
        },
        typography,
        spacing,
        effects,
        metadata,
    };
}
