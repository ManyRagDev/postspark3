/**
 * ThemeEngine: 8 Visual Presets for PostSpark
 * Each theme defines colors, typography, layout, and visual decorations
 */

export type FontCategory = "serif" | "sans" | "display" | "mono";
export type LayoutAlignment = "left" | "center" | "right";
export type BorderStyle = "square" | "rounded" | "pill";
export type Decoration = "none" | "noise" | "glitch" | "grid";

export interface ThemeConfig {
  id: string;
  label: string;
  description: string;
  category: "brand" | "remix" | "disruptive";
  colors: {
    bg: string;
    text: string;
    accent: string;
    surface: string;
  };
  typography: {
    headingFont: string;
    bodyFont: string;
    headingSize: string;
    bodySize: string;
  };
  layout: {
    alignment: LayoutAlignment;
    borderStyle: BorderStyle;
    decoration: Decoration;
    padding: string;
  };
  effects?: {
    glitch?: boolean;
    glow?: boolean;
    noise?: boolean;
    grid?: boolean;
  };
}

export const THEMES: ThemeConfig[] = [
  // 1. Cyber Core - Neon green on black with glitch effect
  {
    id: "cyber-core",
    label: "Cyber Core",
    description: "Neon green on black with glitch effect",
    category: "disruptive",
    colors: {
      bg: "#000000",
      text: "#00FF41",
      accent: "#00FFFF",
      surface: "#0a0a0a",
    },
    typography: {
      headingFont: "'Space Mono', monospace",
      bodyFont: "'Space Mono', monospace",
      headingSize: "1.35rem",
      bodySize: "0.78rem",
    },
    layout: {
      alignment: "left",
      borderStyle: "square",
      decoration: "glitch",
      padding: "1.5rem",
    },
    effects: {
      noise: true,
    },
  },

  // 2. The Morning Paper - Off-white with serif elegance
  {
    id: "morning-paper",
    label: "The Morning Paper",
    description: "Off-white with serif elegance",
    category: "brand",
    colors: {
      bg: "#FAF8F3",
      text: "#4A4A4A",
      accent: "#8B7355",
      surface: "#F5F3EE",
    },
    typography: {
      headingFont: "'Playfair Display', serif",
      bodyFont: "'Inter', sans-serif",
      headingSize: "2.85rem",
      bodySize: "1.05rem",
    },
    layout: {
      alignment: "left",
      borderStyle: "rounded",
      decoration: "none",
      padding: "2rem",
    },
    effects: {
      glow: false,
    },
  },

  // 3. Swiss Modern - Minimalist white with grid
  {
    id: "swiss-modern",
    label: "Swiss Modern",
    description: "Minimalist white with grid system",
    category: "remix",
    colors: {
      bg: "#FFFFFF",
      text: "#000000",
      accent: "#FF0000",
      surface: "#F5F5F5",
    },
    typography: {
      headingFont: "'Inter', sans-serif",
      bodyFont: "'Inter', sans-serif",
      headingSize: "3.25rem",
      bodySize: "0.88rem",
    },
    layout: {
      alignment: "center",
      borderStyle: "square",
      decoration: "grid",
      padding: "1.5rem",
    },
    effects: {
      grid: true,
    },
  },

  // 4. Bold Hype - Bright yellow with rotated elements
  {
    id: "bold-hype",
    label: "Bold Hype",
    description: "Bright yellow with bold typography",
    category: "disruptive",
    colors: {
      bg: "#FFD700",
      text: "#000000",
      accent: "#FF0000",
      surface: "#FFC700",
    },
    typography: {
      headingFont: "'Anton', sans-serif",
      bodyFont: "'Anton', sans-serif",
      headingSize: "3.75rem",
      bodySize: "1.15rem",
    },
    layout: {
      alignment: "center",
      borderStyle: "square",
      decoration: "none",
      padding: "1.5rem",
    },
    effects: {
      glow: false,
    },
  },

  // 5. Y2K Glitch - Pink/Purple gradient with pixel art
  {
    id: "y2k-glitch",
    label: "Y2K Glitch",
    description: "Pink/Purple gradient with pixel aesthetic",
    category: "disruptive",
    colors: {
      bg: "#FF1493",
      text: "#FFFFFF",
      accent: "#00FFFF",
      surface: "#C71585",
    },
    typography: {
      headingFont: "'Space Mono', monospace",
      bodyFont: "'Space Mono', monospace",
      headingSize: "1.6rem",
      bodySize: "0.78rem",
    },
    layout: {
      alignment: "center",
      borderStyle: "square",
      decoration: "glitch",
      padding: "1.25rem",
    },
    effects: {
      noise: true,
    },
  },

  // 6. Eco Zen - Earth tones with organic shapes
  {
    id: "eco-zen",
    label: "Eco Zen",
    description: "Earth tones with organic design",
    category: "brand",
    colors: {
      bg: "#E8DCC8",
      text: "#3D5941",
      accent: "#9CAF88",
      surface: "#D9CCBC",
    },
    typography: {
      headingFont: "'Quicksand', sans-serif",
      bodyFont: "'Quicksand', sans-serif",
      headingSize: "2.4rem",
      bodySize: "1.1rem",
    },
    layout: {
      alignment: "center",
      borderStyle: "pill",
      decoration: "none",
      padding: "2rem",
    },
    effects: {
      glow: false,
    },
  },

  // 7. Dark Academia - Deep green with gold accents
  {
    id: "dark-academia",
    label: "Dark Academia",
    description: "Deep green with gold accents",
    category: "brand",
    colors: {
      bg: "#1B3A2D",
      text: "#D4AF37",
      accent: "#C9A961",
      surface: "#2D5A47",
    },
    typography: {
      headingFont: "'Garamond', serif",
      bodyFont: "'Garamond', serif",
      headingSize: "2.9rem",
      bodySize: "1.1rem",
    },
    layout: {
      alignment: "left",
      borderStyle: "rounded",
      decoration: "none",
      padding: "2rem",
    },
    effects: {
      glow: false,
    },
  },

  // 8. Velvet Noir - Deep purple with silver glow
  {
    id: "velvet-noir",
    label: "Velvet Noir",
    description: "Deep purple with silver glow",
    category: "brand",
    colors: {
      bg: "#2A1A4D",
      text: "#E8E8E8",
      accent: "#B8B8FF",
      surface: "#3D2A5C",
    },
    typography: {
      headingFont: "'Inter', sans-serif",
      bodyFont: "'Inter', sans-serif",
      headingSize: "2.6rem",
      bodySize: "1rem",
    },
    layout: {
      alignment: "right",
      borderStyle: "rounded",
      decoration: "none",
      padding: "2rem",
    },
    effects: {},
  },
];

/**
 * Get theme by ID
 */
export function getTheme(id: string): ThemeConfig | undefined {
  return THEMES.find((t) => t.id === id);
}

/**
 * Get all themes by category
 */
export function getThemesByCategory(category: "brand" | "remix" | "disruptive"): ThemeConfig[] {
  return THEMES.filter((t) => t.category === category);
}

/**
 * Create a custom theme based on brand colors
 */
export function createBrandTheme(
  brandColors: { primary: string; secondary: string },
  fontCategory: FontCategory = "sans"
): ThemeConfig {
  const fontMap: Record<FontCategory, { heading: string; body: string }> = {
    serif: { heading: "'Playfair Display', serif", body: "'Inter', sans-serif" },
    sans: { heading: "'Inter', sans-serif", body: "'Inter', sans-serif" },
    display: { heading: "'Anton', sans-serif", body: "'Inter', sans-serif" },
    mono: { heading: "'Space Mono', monospace", body: "'Space Mono', monospace" },
  };

  const fonts = fontMap[fontCategory];

  return {
    id: "brand-custom",
    label: "Brand Match",
    description: "Custom theme matching your brand",
    category: "brand",
    colors: {
      bg: brandColors.secondary,
      text: "#FFFFFF",
      accent: brandColors.primary,
      surface: brandColors.secondary,
    },
    typography: {
      headingFont: fonts.heading,
      bodyFont: fonts.body,
      headingSize: "2rem",
      bodySize: "1rem",
    },
    layout: {
      alignment: "center",
      borderStyle: "rounded",
      decoration: "none",
      padding: "1.5rem",
    },
  };
}

/**
 * Apply theme styles to an element
 */
export function applyThemeStyles(theme: ThemeConfig): React.CSSProperties {
  return {
    backgroundColor: theme.colors.bg,
    color: theme.colors.text,
    fontFamily: theme.typography.bodyFont,
    padding: theme.layout.padding,
    borderRadius:
      theme.layout.borderStyle === "square"
        ? "0"
        : theme.layout.borderStyle === "pill"
          ? "9999px"
          : "0.5rem",
    textAlign: theme.layout.alignment as "left" | "center" | "right",
    position: "relative" as const,
  };
}

/**
 * Get CSS class for theme decoration effects
 */
export function getThemeDecorativeClass(theme: ThemeConfig): string {
  const classes: string[] = [];

  if (theme.effects?.glitch) {
    classes.push("theme-glitch");
  }
  if (theme.effects?.glow) {
    classes.push("theme-glow");
  }
  if (theme.effects?.noise) {
    classes.push("theme-noise");
  }
  if (theme.effects?.grid) {
    classes.push("theme-grid");
  }

  return classes.join(" ");
}
