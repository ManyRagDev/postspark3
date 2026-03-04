/**
 * Dynamic Font System for PostSpark Chameleon Engine
 *
 * Replaces static Google Fonts <link> in index.html with on-demand loading.
 * Supports: curated dropdown catalog + custom Google Fonts URL input.
 */

// ─── Font Catalog ─────────────────────────────────────────────────────────────

export interface FontEntry {
  name: string;
  label: string;
}

export interface FontCatalog {
  sansSerif: FontEntry[];
  serif: FontEntry[];
  display: FontEntry[];
  mono: FontEntry[];
}

export const FONT_CATALOG: FontCatalog = {
  sansSerif: [
    { name: 'Inter', label: 'Inter' },
    { name: 'Roboto', label: 'Roboto' },
    { name: 'Montserrat', label: 'Montserrat' },
    { name: 'Poppins', label: 'Poppins' },
    { name: 'Lato', label: 'Lato' },
    { name: 'Open Sans', label: 'Open Sans' },
    { name: 'Raleway', label: 'Raleway' },
    { name: 'Work Sans', label: 'Work Sans' },
    { name: 'Quicksand', label: 'Quicksand' },
    { name: 'Space Grotesk', label: 'Space Grotesk' },
    { name: 'Plus Jakarta Sans', label: 'Plus Jakarta Sans' },
    { name: 'Nunito', label: 'Nunito' },
  ],
  serif: [
    { name: 'Playfair Display', label: 'Playfair Display' },
    { name: 'Merriweather', label: 'Merriweather' },
    { name: 'Lora', label: 'Lora' },
    { name: 'PT Serif', label: 'PT Serif' },
    { name: 'Crimson Text', label: 'Crimson Text' },
    { name: 'EB Garamond', label: 'EB Garamond' },
  ],
  display: [
    { name: 'Oswald', label: 'Oswald' },
    { name: 'Bebas Neue', label: 'Bebas Neue' },
    { name: 'Syne', label: 'Syne' },
    { name: 'Anton', label: 'Anton' },
    { name: 'Righteous', label: 'Righteous' },
    { name: 'Abril Fatface', label: 'Abril Fatface' },
  ],
  mono: [
    { name: 'Space Mono', label: 'Space Mono' },
    { name: 'JetBrains Mono', label: 'JetBrains Mono' },
    { name: 'Fira Code', label: 'Fira Code' },
  ],
};

/** Flat list of all available font names */
export const ALL_FONT_NAMES: string[] = [
  ...FONT_CATALOG.sansSerif,
  ...FONT_CATALOG.serif,
  ...FONT_CATALOG.display,
  ...FONT_CATALOG.mono,
].map(f => f.name);

// ─── Dynamic Font Loading ─────────────────────────────────────────────────────

/** Set of loaded font URLs to avoid duplicate <link> tags */
const loadedFontUrls = new Set<string>();

/** Build Google Fonts URL from a font name */
export function buildGoogleFontUrl(fontName: string): string {
  const formatted = fontName.replace(/ /g, '+');
  return `https://fonts.googleapis.com/css2?family=${formatted}:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400&display=swap`;
}

/** Parse font name from a Google Fonts URL */
export function parseFontNameFromUrl(url: string): string | null {
  const match = url.match(/family=([^&:]+)/);
  return match ? match[1].replace(/\+/g, ' ') : null;
}

/**
 * Resolve active font info from design token typography values.
 * Priority: customFontUrl > fontFamily dropdown > fallback "Inter"
 */
export function getActiveFontInfo(tokens: { fontFamily: string; customFontUrl: string }): { name: string; url: string } {
  // 1. Custom URL takes priority
  if (tokens.customFontUrl && tokens.customFontUrl.includes('fonts.googleapis.com')) {
    const name = parseFontNameFromUrl(tokens.customFontUrl) || 'sans-serif';
    return { name, url: tokens.customFontUrl };
  }

  // 2. Dropdown selection
  const family = tokens.fontFamily || 'Inter';
  return {
    name: family,
    url: buildGoogleFontUrl(family),
  };
}

/**
 * Dynamically load a Google Font by appending a <link> to <head>.
 * Deduplicates — safe to call multiple times with the same URL.
 */
export function loadFont(fontUrl: string): void {
  if (!fontUrl || loadedFontUrls.has(fontUrl)) return;

  // Check if already in DOM (e.g., from static index.html)
  const existing = document.querySelector(`link[href="${fontUrl}"]`);
  if (existing) {
    loadedFontUrls.add(fontUrl);
    return;
  }

  const link = document.createElement('link');
  link.href = fontUrl;
  link.rel = 'stylesheet';
  document.head.appendChild(link);
  loadedFontUrls.add(fontUrl);
}

/** Convenience: load a font by name */
export function loadFontByName(name: string): void {
  loadFont(buildGoogleFontUrl(name));
}
