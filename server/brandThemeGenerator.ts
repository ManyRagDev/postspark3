/**
 * BrandThemeGenerator: Generate TemporaryTheme variations from BrandDNA
 *
 * Implements the Tom & Matiz "musical composition" approach:
 * - Brand Faithful  → direct translation of the brand's visual DNA
 * - Harmonious Remix → same personality, different composition dynamics
 * - Disruptive Contrast → inverts one personality axis for creative tension
 *
 * Replaces the pattern-matching logic of generateThemesFromPatterns()
 * with composition-aware generation grounded in real extracted DNA.
 */

import type { BrandDNA, TemporaryTheme, DesignPattern, CompositionRules } from "@shared/postspark";
import { mapPersonalityToComposition, compositionToLayout } from "./brandDNA";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Get perceived brightness of a hex color (0-255) */
function getBrightness(hex: string): number {
    const h = hex.replace('#', '');
    if (h.length < 6) return 128;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000;
}

function isDark(hex: string): boolean {
    return getBrightness(hex) < 128;
}

/** Invert a hex color (for disruptive contrast variation) */
function invertColor(hex: string): string {
    const h = hex.replace('#', '');
    if (h.length < 6) return '#ffffff';
    const r = 255 - parseInt(h.slice(0, 2), 16);
    const g = 255 - parseInt(h.slice(2, 4), 16);
    const b = 255 - parseInt(h.slice(4, 6), 16);
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Mix two hex colors at a given ratio (0=color1, 1=color2) */
function mixColors(hex1: string, hex2: string, ratio = 0.5): string {
    const h1 = hex1.replace('#', '');
    const h2 = hex2.replace('#', '');
    if (h1.length < 6 || h2.length < 6) return hex1;
    const r = Math.round(parseInt(h1.slice(0, 2), 16) * (1 - ratio) + parseInt(h2.slice(0, 2), 16) * ratio);
    const g = Math.round(parseInt(h1.slice(2, 4), 16) * (1 - ratio) + parseInt(h2.slice(2, 4), 16) * ratio);
    const b = Math.round(parseInt(h1.slice(4, 6), 16) * (1 - ratio) + parseInt(h2.slice(4, 6), 16) * ratio);
    return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

/** Map composition rhythm to decoration style */
function rhythmToDecoration(rhythm: CompositionRules['rhythm']): 'none' | 'noise' | 'glitch' | 'grid' {
    return rhythm === 'staccato' ? 'none'
        : rhythm === 'syncopated' ? 'glitch'
        : 'none';
}

/** Map composition dynamics to heading size class */
function dynamicsToHeadingSize(dynamics: CompositionRules['dynamics']): string {
    return dynamics === 'forte' ? '2.5rem' : dynamics === 'mezzo' ? '2rem' : '1.75rem';
}

/** Determine surface color (card/overlay background) */
function buildSurface(bg: string): string {
    const dark = isDark(bg);
    return dark ? mixColors(bg, '#ffffff', 0.08) : mixColors(bg, '#000000', 0.05);
}

/** Map composition to TemporaryTheme effects */
function buildEffects(dna: BrandDNA, composition: CompositionRules): TemporaryTheme['effects'] {
    const isGlowStyle = dna.emotionalProfile.primary === 'energy' || dna.emotionalProfile.primary === 'excitement';
    return {
        glow: isGlowStyle && composition.dynamics === 'forte',
        noise: dna.effects.noise || composition.rhythm === 'staccato',
        glitch: composition.rhythm === 'syncopated' && composition.dynamics === 'forte',
        grid: dna.industry.toLowerCase().includes('tech') || dna.industry.toLowerCase().includes('saas'),
    };
}

/** Minimal synthetic DesignPattern built from BrandDNA (for TemporaryTheme.designPattern field) */
function buildSyntheticPattern(dna: BrandDNA, variationName: string, confidence: number): DesignPattern {
    const { seriousPlayful, modernClassic, boldSubtle } = dna.personality;
    const category =
        boldSubtle < 30 && modernClassic < 30 ? 'neon'
        : seriousPlayful > 70 ? 'playful'
        : seriousPlayful < 30 && boldSubtle < 50 ? 'corporate'
        : boldSubtle > 70 ? 'minimalist'
        : modernClassic > 70 ? 'classic'
        : 'modern';

    return {
        id: `dna-${variationName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
        name: variationName,
        category,
        confidence,
        characteristics: [
            dna.emotionalProfile.mood,
            dna.industry,
            `${dna.composition.rhythm} rhythm`,
        ],
        description: `${dna.emotionalProfile.mood} — extracted from ${dna.metadata.siteName ?? dna.brandName}`,
        suggestedColors: {
            bg: dna.colors.background,
            text: dna.colors.text,
            accent: dna.colors.accent,
            secondary: dna.colors.secondary,
        },
    };
}

// ─── Three Variation Generators ──────────────────────────────────────────────

/**
 * Variation 1: Brand Faithful
 * Direct translation of the extracted DNA — high fidelity to colors/fonts/composition.
 */
function buildBrandFaithful(dna: BrandDNA, url: string): TemporaryTheme {
    const { composition, layout } = dna;
    const effects = buildEffects(dna, composition);

    return {
        id: `temp-brand-${Date.now()}-0`,
        label: `${dna.brandName} · Original`,
        description: `Fiel ao DNA visual: ${dna.emotionalProfile.mood}`,
        category: 'brand',
        source: 'website-extraction',
        sourceUrl: url,
        designPattern: buildSyntheticPattern(dna, 'Brand Faithful', 92),
        isTemporary: true,
        createdAt: Date.now(),
        colors: {
            bg: dna.colors.background,
            text: dna.colors.text,
            accent: dna.colors.primary,
            surface: buildSurface(dna.colors.background),
        },
        typography: {
            headingFont: dna.typography.headingFont,
            bodyFont: dna.typography.bodyFont,
            headingSize: dynamicsToHeadingSize(composition.dynamics),
            bodySize: '1rem',
        },
        layout: {
            alignment: layout.preferredAlignment,
            borderStyle: layout.borderRadius,
            decoration: rhythmToDecoration(composition.rhythm),
            padding: layout.padding,
        },
        effects,
    };
}

/**
 * Variation 2: Harmonious Remix
 * Same brand personality, but composition is shifted:
 * - Rhythm changed one step (staccato → legato, legato → syncopated, etc.)
 * - Accent color swapped to the secondary color
 * - Alignment shifted to center
 * Goal: fresh feel while staying on-brand
 */
function buildHarmoniousRemix(dna: BrandDNA, url: string): TemporaryTheme {
    // Shift rhythm one step for variety
    const remixRhythm: CompositionRules['rhythm'] =
        dna.composition.rhythm === 'staccato' ? 'legato'
        : dna.composition.rhythm === 'legato' ? 'syncopated'
        : 'staccato';

    const remixComposition: CompositionRules = {
        ...dna.composition,
        rhythm: remixRhythm,
        dynamics: dna.composition.dynamics === 'forte' ? 'mezzo' : 'forte',
    };

    const remixLayout = compositionToLayout(remixComposition);

    // Use accent as the new primary for visual variety
    const bg = isDark(dna.colors.background) ? dna.colors.background : dna.colors.secondary;
    const accent = dna.colors.accent !== dna.colors.primary ? dna.colors.accent : dna.colors.secondary;

    const effects = buildEffects(dna, remixComposition);

    return {
        id: `temp-remix-${Date.now()}-1`,
        label: `${dna.brandName} · Remix`,
        description: `Mesma personalidade, nova composição: ${remixRhythm} rhythm`,
        category: 'remix',
        source: 'website-extraction',
        sourceUrl: url,
        designPattern: buildSyntheticPattern(dna, 'Harmonious Remix', 78),
        isTemporary: true,
        createdAt: Date.now() + 1,
        colors: {
            bg,
            text: isDark(bg) ? '#f5f5f5' : dna.colors.text,
            accent,
            surface: buildSurface(bg),
        },
        typography: {
            headingFont: dna.typography.headingFont,
            bodyFont: dna.typography.bodyFont,
            headingSize: dynamicsToHeadingSize(remixComposition.dynamics),
            bodySize: '1rem',
        },
        layout: {
            alignment: 'center',
            borderStyle: remixLayout.borderRadius,
            decoration: rhythmToDecoration(remixRhythm),
            padding: remixLayout.padding,
        },
        effects,
    };
}

/**
 * Variation 3: Disruptive Contrast
 * Inverts one personality axis to create creative tension.
 * - If brand is serious (seriousPlayful < 40): make it bolder
 * - If brand is subtle (boldSubtle > 60): amplify contrast
 * - Background inverted or high-contrast version
 * Goal: eye-catching alternative that challenges brand conventions
 */
function buildDisruptiveContrast(dna: BrandDNA, url: string): TemporaryTheme {
    // Invert the most dominant personality axis
    const { seriousPlayful, boldSubtle, modernClassic } = dna.personality;

    // Force forte dynamics and staccato rhythm for maximum impact
    const disruptiveComposition: CompositionRules = {
        rhythm: 'staccato',
        harmony: dna.composition.harmony === 'consonant' ? 'dissonant' : 'consonant',
        dynamics: 'forte',
        tempo: 'allegro',
    };

    const disruptiveLayout = compositionToLayout(disruptiveComposition);

    // Disruptive palette: if brand is light → go dark, if dark → go vibrant
    let bg: string;
    let accent: string;
    let text: string;

    if (isDark(dna.colors.background)) {
        // Dark brand → go vibrant/white
        bg = '#f8fafc';
        text = '#0f172a';
        accent = dna.colors.primary;
    } else if (seriousPlayful < 40) {
        // Serious brand → go dark and bold
        bg = '#0a0a0a';
        text = '#ffffff';
        accent = dna.colors.accent !== dna.colors.primary ? dna.colors.accent : dna.colors.primary;
    } else {
        // Playful/modern brand → go monochrome with accent pop
        bg = dna.colors.primary;
        text = isDark(dna.colors.primary) ? '#ffffff' : '#000000';
        accent = isDark(dna.colors.primary) ? '#ffffff' : dna.colors.background;
    }

    const effects: TemporaryTheme['effects'] = {
        glow: boldSubtle < 50,
        noise: modernClassic > 60,
        glitch: seriousPlayful > 60,
        grid: !isDark(bg),
    };

    return {
        id: `temp-disruptive-${Date.now()}-2`,
        label: `${dna.brandName} · Contraste`,
        description: `Ruptura criativa: inversão de ${seriousPlayful < 40 ? 'tom' : boldSubtle > 60 ? 'dinâmica' : 'paleta'}`,
        category: 'disruptive',
        source: 'website-extraction',
        sourceUrl: url,
        designPattern: buildSyntheticPattern(dna, 'Disruptive Contrast', 65),
        isTemporary: true,
        createdAt: Date.now() + 2,
        colors: {
            bg,
            text,
            accent,
            surface: buildSurface(bg),
        },
        typography: {
            headingFont: dna.typography.headingFont,
            bodyFont: dna.typography.bodyFont,
            headingSize: '2.75rem',
            bodySize: '1rem',
        },
        layout: {
            alignment: disruptiveLayout.preferredAlignment,
            borderStyle: 'square',
            decoration: 'none',
            padding: disruptiveLayout.padding,
        },
        effects,
    };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generate 3 TemporaryTheme variations from a BrandDNA object.
 * Always returns [brand-faithful, harmonious-remix, disruptive-contrast]
 */
export function generateThemesFromBrandDNA(dna: BrandDNA, url: string): TemporaryTheme[] {
    console.log('[brandThemeGenerator] Generating 3 variations for:', dna.brandName);

    const themes = [
        buildBrandFaithful(dna, url),
        buildHarmoniousRemix(dna, url),
        buildDisruptiveContrast(dna, url),
    ];

    themes.forEach((t, i) => {
        console.log(`[brandThemeGenerator] Variation ${i + 1}:`, {
            label: t.label,
            category: t.category,
            bg: t.colors.bg,
            accent: t.colors.accent,
            composition: `${t.layout.borderStyle} · ${t.layout.alignment} · ${t.layout.padding}`,
        });
    });

    return themes;
}
