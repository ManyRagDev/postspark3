/**
 * BrandDNA: Unified brand identity extraction pipeline
 *
 * Implements the "Tom & Matiz" synesthetic architecture:
 * 1. Discover — find key internal pages from homepage (Railway /discover)
 * 2. Parallel capture — multi-page screenshots + element screenshots + HTML fetch
 * 3. Vision synthesis — send all screenshots to Gemini Vision for holistic brand analysis
 * 4. LLM synthesis — merge HTML data + Vision into a structured BrandDNA object
 * 5. Composition mapping — deterministic translation of personality into musical metaphors
 *
 * Graceful degradation at every step — if Railway is down or LLM fails,
 * falls back to HTML-only extraction (existing pipeline).
 */

import { invokeLLM } from "./_core/llm";
import type { BrandDNA, CompositionRules, SpacingDensity, BorderRadiusStyle, PaddingStyle } from "@shared/postspark";
import { extractStyleFromUrlWithMeta } from "./styleExtractor";
import {
    discoverPages,
    captureMultipleScreenshots,
    captureElements,
    type DiscoveredPage,
} from "./screenshotService";

// ─── Element selectors to capture for granular brand analysis ─────────────────

const BRAND_ELEMENT_SELECTORS = [
    'header',
    'nav',
    '.hero, [class*="hero"], [class*="Hero"]',
    'footer',
    'button:not([aria-hidden]), .btn, [class*="btn-"], [class*="button-"]',
    'h1',
];

// ─── Composition Mapping (deterministic — no LLM call) ────────────────────────

/**
 * Map personality spectrum + color relationships to musical composition rules.
 * All thresholds derived from the Tom & Matiz synesthetic model:
 *   - Rhythm reflects the energy/pace of the brand (tight = serious/corporate, flowing = relaxed/creative)
 *   - Harmony reflects color strategy (consonant = safe analogous, dissonant = tension, resolved = triadic)
 *   - Dynamics reflects visual weight/contrast preference
 *   - Tempo reflects content density
 */
export function mapPersonalityToComposition(dna: Pick<BrandDNA, 'personality' | 'colors'>): CompositionRules {
    const { seriousPlayful, luxuryAccessible, modernClassic, boldSubtle } = dna.personality;
    const { contrast, harmony } = dna.colors.colorRelationships;

    // Rhythm (spacing): serious+bold → staccato, playful+accessible → syncopated, middle → legato
    let rhythm: CompositionRules['rhythm'];
    if (seriousPlayful < 35 && boldSubtle < 50) {
        rhythm = 'staccato';        // Tight, structured, corporate
    } else if (seriousPlayful > 65 || luxuryAccessible > 70) {
        rhythm = 'syncopated';      // Varied, unexpected, playful
    } else {
        rhythm = 'legato';          // Smooth, flowing, balanced
    }

    // Harmony (color strategy): follows the color extraction
    let harmonyRule: CompositionRules['harmony'];
    if (harmony === 'complementary' || harmony === 'split-complementary') {
        harmonyRule = 'dissonant';   // Tension-based contrast
    } else if (harmony === 'triadic') {
        harmonyRule = 'resolved';    // Balanced 3-point harmony
    } else {
        harmonyRule = 'consonant';   // Safe, analogous or monochromatic
    }

    // Dynamics (contrast/visual weight): bold + high contrast → forte, subtle + low contrast → piano
    let dynamics: CompositionRules['dynamics'];
    if (boldSubtle < 35 && contrast === 'high') {
        dynamics = 'forte';          // Bold, high-impact
    } else if (boldSubtle > 65 || contrast === 'low') {
        dynamics = 'piano';          // Soft, minimal weight
    } else {
        dynamics = 'mezzo';          // Balanced
    }

    // Tempo (density): modern + accessible → allegro (compact), classic + luxury → adagio (spacious)
    let tempo: CompositionRules['tempo'];
    if (modernClassic < 35 && luxuryAccessible > 60) {
        tempo = 'allegro';           // Fast, dense, modern SaaS-like
    } else if (modernClassic > 65 || luxuryAccessible < 35) {
        tempo = 'adagio';            // Slow, spacious, premium
    } else {
        tempo = 'andante';           // Moderate pace
    }

    return { rhythm, harmony: harmonyRule, dynamics, tempo };
}

/** Translate composition rules to concrete CSS-level layout preferences */
export function compositionToLayout(composition: CompositionRules): {
    density: SpacingDensity;
    borderRadius: BorderRadiusStyle;
    padding: PaddingStyle;
    preferredAlignment: 'left' | 'center' | 'right';
} {
    const densityMap: Record<CompositionRules['tempo'], SpacingDensity> = {
        allegro: 'compact',
        andante: 'normal',
        adagio: 'spacious',
    };

    const radiusMap: Record<CompositionRules['rhythm'], BorderRadiusStyle> = {
        staccato: 'square',
        legato: 'rounded',
        syncopated: 'pill',
    };

    const paddingMap: Record<CompositionRules['tempo'], PaddingStyle> = {
        allegro: 'tight',
        andante: 'normal',
        adagio: 'loose',
    };

    // Forte dynamics → left-aligned (editorial authority), piano → centered (serene)
    const alignmentMap: Record<CompositionRules['dynamics'], 'left' | 'center' | 'right'> = {
        forte: 'left',
        mezzo: 'center',
        piano: 'center',
    };

    return {
        density: densityMap[composition.tempo],
        borderRadius: radiusMap[composition.rhythm],
        padding: paddingMap[composition.tempo],
        preferredAlignment: alignmentMap[composition.dynamics],
    };
}

// ─── Vision Analysis (multi-image) ───────────────────────────────────────────

interface VisionBrandAnalysis {
    brandName: string;
    industry: string;
    personality: BrandDNA['personality'];
    colors: {
        primary: string;
        secondary: string;
        background: string;
        text: string;
        accent: string;
        colorRelationships: BrandDNA['colors']['colorRelationships'];
    };
    typography: Omit<BrandDNA['typography'], 'headingWeight' | 'bodyWeight'>;
    effects: BrandDNA['effects'];
    emotionalProfile: BrandDNA['emotionalProfile'];
}

async function analyzeWithVision(
    screenshots: ArrayBuffer[],
    elementScreenshots: ArrayBuffer[],
    url: string,
): Promise<VisionBrandAnalysis | null> {
    // Prefer page screenshots (more informative), add a couple elements for detail
    // Cap at 3 images total — Gemini INVALID_ARGUMENT with 5+ high-detail images
    const pageImages = screenshots.slice(0, 2);
    const elementImages = elementScreenshots.slice(0, 1);
    const allBuffers = [...pageImages, ...elementImages];
    if (allBuffers.length === 0) return null;

    console.log(`[brandDNA] Sending ${allBuffers.length} image(s) to Gemini Vision for brand analysis`);

    const imageContents = allBuffers.map((buf) => ({
        type: 'image_url' as const,
        image_url: {
            // Use 'low' detail to reduce token usage and avoid INVALID_ARGUMENT on large batches
            url: `data:image/png;base64,${Buffer.from(buf).toString('base64')}`,
            detail: 'low' as const,
        },
    }));

    try {
        const response = await invokeLLM({
            messages: [
                {
                    role: 'system',
                    content: `You are a Senior Brand Strategist and Art Director who analyzes brand identities holistically.
You are looking at multiple screenshots of a website to extract its complete brand DNA.

Your analysis must be PRECISE and based on what you actually SEE in the images:
- Extract EXACT hex colors from the rendered interface (not guesses)
- Assess brand personality on each spectrum based on visual and tonal cues
- Identify emotional qualities that the design evokes
- Classify the industry/sector based on visual language clues

Be specific. Avoid generic defaults. Every brand has a unique identity.`,
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text' as const,
                            text: `Analyze these ${allBuffers.length} screenshot(s) from the website: ${url}

I need a complete brand DNA analysis. Extract:
1. The brand name (from logo, title, or domain)
2. Industry/sector
3. Personality spectrum (score each axis 0-100 based on visual/tonal evidence)
4. Exact colors from the UI (primary CTA, background, text, accents)
5. Color relationship type (analogous/complementary/triadic/monochromatic)
6. Typography style (serif/sans/display — identify actual font names if visible)
7. Visual effects (shadows, gradients, glassmorphism, etc.)
8. Emotional profile (what feeling does this brand evoke?)

Return ONLY valid JSON matching the schema.`,
                        },
                        ...imageContents,
                    ],
                },
            ],
            response_format: {
                type: 'json_schema',
                json_schema: {
                    name: 'vision_brand_analysis',
                    strict: true,
                    schema: {
                        type: 'object',
                        properties: {
                            brandName: { type: 'string' },
                            industry: { type: 'string' },
                            personality: {
                                type: 'object',
                                properties: {
                                    seriousPlayful: { type: 'number', description: '0=serious, 100=playful' },
                                    luxuryAccessible: { type: 'number', description: '0=luxury, 100=accessible' },
                                    modernClassic: { type: 'number', description: '0=modern, 100=classic' },
                                    boldSubtle: { type: 'number', description: '0=bold, 100=subtle' },
                                    warmCool: { type: 'number', description: '0=warm, 100=cool' },
                                },
                                required: ['seriousPlayful', 'luxuryAccessible', 'modernClassic', 'boldSubtle', 'warmCool'],
                                additionalProperties: false,
                            },
                            colors: {
                                type: 'object',
                                properties: {
                                    primary: { type: 'string', description: 'Primary brand/CTA color hex' },
                                    secondary: { type: 'string', description: 'Secondary color hex' },
                                    background: { type: 'string', description: 'Main background color hex' },
                                    text: { type: 'string', description: 'Main body text color hex' },
                                    accent: { type: 'string', description: 'Accent/highlight color hex' },
                                    colorRelationships: {
                                        type: 'object',
                                        properties: {
                                            harmony: { type: 'string', enum: ['complementary', 'analogous', 'triadic', 'monochromatic', 'split-complementary'] },
                                            contrast: { type: 'string', enum: ['high', 'medium', 'low'] },
                                            temperature: { type: 'string', enum: ['warm', 'cool', 'neutral'] },
                                        },
                                        required: ['harmony', 'contrast', 'temperature'],
                                        additionalProperties: false,
                                    },
                                },
                                required: ['primary', 'secondary', 'background', 'text', 'accent', 'colorRelationships'],
                                additionalProperties: false,
                            },
                            typography: {
                                type: 'object',
                                properties: {
                                    headingFont: { type: 'string', description: 'Heading font name or category' },
                                    bodyFont: { type: 'string', description: 'Body font name or category' },
                                    fontPairing: { type: 'string', enum: ['matching', 'contrasting', 'complementary'] },
                                },
                                required: ['headingFont', 'bodyFont', 'fontPairing'],
                                additionalProperties: false,
                            },
                            effects: {
                                type: 'object',
                                properties: {
                                    shadows: { type: 'boolean' },
                                    gradients: { type: 'boolean' },
                                    animations: { type: 'boolean' },
                                    glassmorphism: { type: 'boolean' },
                                    noise: { type: 'boolean' },
                                },
                                required: ['shadows', 'gradients', 'animations', 'glassmorphism', 'noise'],
                                additionalProperties: false,
                            },
                            emotionalProfile: {
                                type: 'object',
                                properties: {
                                    primary: { type: 'string', description: 'Primary emotional quality: trust, energy, calm, excitement, elegance, etc.' },
                                    secondary: { type: 'string', description: 'Secondary emotional quality' },
                                    mood: { type: 'string', description: '2-3 word mood descriptor, e.g. "confident professional"' },
                                },
                                required: ['primary', 'secondary', 'mood'],
                                additionalProperties: false,
                            },
                        },
                        required: ['brandName', 'industry', 'personality', 'colors', 'typography', 'effects', 'emotionalProfile'],
                        additionalProperties: false,
                    },
                },
            },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error('No response from Vision LLM');
        const str = typeof content === 'string' ? content : JSON.stringify(content);
        return JSON.parse(str) as VisionBrandAnalysis;
    } catch (err) {
        console.warn('[brandDNA] Vision analysis failed:', err);
        return null;
    }
}

// ─── Fallback brand name / personality from HTML data ────────────────────────

function buildFallbackPersonality(): BrandDNA['personality'] {
    return {
        seriousPlayful: 40,
        luxuryAccessible: 50,
        modernClassic: 30,
        boldSubtle: 40,
        warmCool: 50,
    };
}

function buildFallbackEmotional(): BrandDNA['emotionalProfile'] {
    return { primary: 'trust', secondary: 'competence', mood: 'professional and reliable' };
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

/**
 * Extract the complete Brand DNA from a website URL.
 *
 * Pipeline:
 * 1. Discover internal pages (Railway /discover)
 * 2. In parallel: multi-page screenshots + element screenshots + HTML extraction
 * 3. Vision analysis (Gemini multi-image)
 * 4. Merge HTML data + Vision into final BrandDNA
 * 5. Composition mapping (deterministic)
 */
export async function extractBrandDNA(url: string): Promise<BrandDNA> {
    console.log('[brandDNA] ══════════════════════════════════');
    console.log('[brandDNA] Starting extraction for:', url);

    // ── Step 1: Discover pages ────────────────────────────────────────────────
    const discovered: DiscoveredPage[] = await discoverPages(url, 8);
    const highPriority = discovered.filter((p) => p.priority === 'high').slice(0, 3);
    const urlsToCapture = [url, ...highPriority.map((p) => p.url)].slice(0, 5);
    console.log('[brandDNA] Pages to capture:', urlsToCapture);

    // ── Step 2: Parallel capture + HTML extraction ────────────────────────────
    const [multiScreenshots, elementScreenshots, htmlResult] = await Promise.all([
        captureMultipleScreenshots(urlsToCapture),
        captureElements(url, BRAND_ELEMENT_SELECTORS),
        extractStyleFromUrlWithMeta(url),
    ]);

    const screenshotBuffers = Object.values(multiScreenshots);
    const elementBuffers = Object.values(elementScreenshots);
    const htmlData = htmlResult.data;

    console.log('[brandDNA] Screenshots:', screenshotBuffers.length, '| Elements:', elementBuffers.length);

    // ── Step 3: Vision analysis ───────────────────────────────────────────────
    const visionAnalysis = await analyzeWithVision(screenshotBuffers, elementBuffers, url);

    // ── Step 4: Merge HTML + Vision into BrandDNA ─────────────────────────────
    const isDefaultColor = (hex: string) =>
        ['#6366f1', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ffffff', '#1f2937'].includes(hex.toLowerCase());

    // Prefer vision colors (pixel-accurate) over HTML defaults
    const colors: BrandDNA['colors'] = {
        primary: !isDefaultColor(htmlData.colors.primary)
            ? htmlData.colors.primary
            : (visionAnalysis?.colors.primary ?? htmlData.colors.primary),
        secondary: !isDefaultColor(htmlData.colors.secondary)
            ? htmlData.colors.secondary
            : (visionAnalysis?.colors.secondary ?? htmlData.colors.secondary),
        background: !isDefaultColor(htmlData.colors.background)
            ? htmlData.colors.background
            : (visionAnalysis?.colors.background ?? htmlData.colors.background),
        text: !isDefaultColor(htmlData.colors.text)
            ? htmlData.colors.text
            : (visionAnalysis?.colors.text ?? htmlData.colors.text),
        accent: !isDefaultColor(htmlData.colors.accent)
            ? htmlData.colors.accent
            : (visionAnalysis?.colors.accent ?? htmlData.colors.accent),
        palette: htmlData.colors.palette.length >= 4
            ? htmlData.colors.palette
            : [
                visionAnalysis?.colors.primary ?? htmlData.colors.primary,
                visionAnalysis?.colors.secondary ?? htmlData.colors.secondary,
                visionAnalysis?.colors.accent ?? htmlData.colors.accent,
                visionAnalysis?.colors.background ?? htmlData.colors.background,
                visionAnalysis?.colors.text ?? htmlData.colors.text,
                ...htmlData.colors.palette,
              ].filter((c, i, arr) => arr.indexOf(c) === i).slice(0, 8),
        colorRelationships: visionAnalysis?.colors.colorRelationships ?? {
            harmony: 'analogous',
            contrast: 'medium',
            temperature: 'neutral',
        },
    };

    const isDefaultFont = (f: string) => f === 'Inter, sans-serif' || f === 'Inter';
    const typography: BrandDNA['typography'] = {
        headingFont: !isDefaultFont(htmlData.typography.headingFont)
            ? htmlData.typography.headingFont
            : (visionAnalysis?.typography.headingFont ?? htmlData.typography.headingFont),
        bodyFont: !isDefaultFont(htmlData.typography.bodyFont)
            ? htmlData.typography.bodyFont
            : (visionAnalysis?.typography.bodyFont ?? htmlData.typography.bodyFont),
        headingWeight: htmlData.typography.headingWeight,
        bodyWeight: htmlData.typography.bodyWeight,
        fontPairing: visionAnalysis?.typography.fontPairing ?? 'complementary',
    };

    const effects: BrandDNA['effects'] = {
        shadows: htmlData.effects.shadows || (visionAnalysis?.effects.shadows ?? false),
        gradients: htmlData.effects.gradients || (visionAnalysis?.effects.gradients ?? false),
        animations: htmlData.effects.animations || (visionAnalysis?.effects.animations ?? false),
        glassmorphism: htmlData.effects.glassmorphism || (visionAnalysis?.effects.glassmorphism ?? false),
        noise: htmlData.effects.noise || (visionAnalysis?.effects.noise ?? false),
    };

    const personality = visionAnalysis?.personality ?? buildFallbackPersonality();
    const emotionalProfile = visionAnalysis?.emotionalProfile ?? buildFallbackEmotional();

    const brandName = visionAnalysis?.brandName
        ?? htmlData.metadata?.siteName
        ?? (new URL(url).hostname.replace(/^www\./, ''));

    const industry = visionAnalysis?.industry ?? 'Business';

    // ── Step 5: Composition mapping (deterministic) ───────────────────────────
    const composition = mapPersonalityToComposition({ personality, colors });
    const layout = compositionToLayout(composition);

    // ── Extraction quality score ──────────────────────────────────────────────
    const visionUsed = screenshotBuffers.length > 0 && visionAnalysis !== null;
    const realColors = colors.palette.filter((c) => !isDefaultColor(c));
    const extractionQuality = Math.min(1, (
        (realColors.length >= 4 ? 0.4 : realColors.length * 0.1) +
        (visionUsed ? 0.4 : 0) +
        (htmlData.metadata?.siteName ? 0.1 : 0) +
        (typography.headingFont !== 'Inter, sans-serif' ? 0.1 : 0)
    ));

    const brandDNA: BrandDNA = {
        brandName,
        industry,
        personality,
        colors,
        typography,
        composition,
        layout,
        effects,
        emotionalProfile,
        metadata: {
            sourceUrl: url,
            pagesAnalyzed: urlsToCapture.length,
            extractionQuality,
            visionUsed,
            favicon: htmlData.metadata?.favicon,
            logo: htmlData.metadata?.logo,
            siteName: htmlData.metadata?.siteName,
        },
    };

    console.log('[brandDNA] Extraction complete:', {
        brandName: brandDNA.brandName,
        industry: brandDNA.industry,
        mood: brandDNA.emotionalProfile.mood,
        composition: brandDNA.composition,
        quality: brandDNA.metadata.extractionQuality.toFixed(2),
        visionUsed: brandDNA.metadata.visionUsed,
    });
    console.log('[brandDNA] ══════════════════════════════════');

    return brandDNA;
}
