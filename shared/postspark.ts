/** Input type detection */
export type InputType = "text" | "url" | "image";

/** Post mode - static single post or carousel */
export type PostMode = "static" | "carousel";

/** Post mode configuration */
export const POST_MODE_CONFIG: Record<PostMode, {
  label: string;
  description: string;
  icon: string;
}> = {
  static: {
    label: "Post Estático",
    description: "Uma única imagem",
    icon: "◻",
  },
  carousel: {
    label: "Carrossel",
    description: "Múltiplos slides",
    icon: "▭",
  },
};

/** Default carousel slide count range */
export const CAROUSEL_SLIDE_RANGE = {
  min: 3,
  max: 10,
  default: 5,
} as const;

/** Social platform targets */
export type Platform = "instagram" | "twitter" | "linkedin" | "facebook";

/** Platform aspect ratio options */
export const PLATFORM_ASPECT_RATIOS: Record<Platform, AspectRatio[]> = {
  instagram: ["1:1", "5:6", "9:16"], // Feed, Portrait, Stories/Reels
  twitter: ["1:1", "5:6"],           // Feed, Portrait
  linkedin: ["1:1", "5:6"],          // Feed, Portrait
  facebook: ["1:1", "5:6"],          // Feed, Portrait
};

/** Platform default aspect ratio */
export const PLATFORM_DEFAULT_RATIO: Record<Platform, AspectRatio> = {
  instagram: "1:1",
  twitter: "1:1",
  linkedin: "1:1",
  facebook: "1:1",
};

/** Platform dimensions and specs */
export const PLATFORM_SPECS: Record<Platform, {
  width: number;
  height: number;
  label: string;
  maxChars: number;
  icon: string;
  description: string;
}> = {
  instagram: {
    width: 1080,
    height: 1080,
    label: "Instagram",
    maxChars: 2200,
    icon: "📷",
    description: "Feed, Stories ou Reels"
  },
  twitter: {
    width: 1200,
    height: 675,
    label: "Twitter/X",
    maxChars: 280,
    icon: "🐦",
    description: "Post com imagem"
  },
  linkedin: {
    width: 1200,
    height: 627,
    label: "LinkedIn",
    maxChars: 3000,
    icon: "💼",
    description: "Post profissional"
  },
  facebook: {
    width: 1200,
    height: 630,
    label: "Facebook",
    maxChars: 63206,
    icon: "👥",
    description: "Post com imagem"
  },
};

/** Post aspect ratio (canvas format) */
export type AspectRatio = "1:1" | "5:6" | "9:16";

/** Aspect ratio CSS values */
export const ASPECT_RATIO_VALUES: Record<AspectRatio, string> = {
  "1:1": "1 / 1",
  "5:6": "5 / 6",
  "9:16": "9 / 16",
};

/** Aspect ratio display labels */
export const ASPECT_RATIO_LABELS: Record<AspectRatio, { label: string }> = {
  "1:1": { label: "1:1" },
  "5:6": { label: "5:6" },
  "9:16": { label: "9:16" },
};

/** Slide content for carousel posts */
export interface CarouselSlide {
  headline: string;
  body: string;
  slideNumber: number;
  isTitleSlide?: boolean;
  isCtaSlide?: boolean;
}

/** Specific design optimizations for an aspect ratio */
export interface FormatOptimization {
  layout: "centered" | "left-aligned" | "split" | "minimal";
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  headlineFontSize?: number;
  bodyFontSize?: number;
}

/** A single generated post variation */
export interface PostVariation {
  id: string;
  headline: string;
  body: string;
  caption: string; // Legenda para o post
  hashtags: string[];
  callToAction: string;
  tone: string;
  platform: Platform;
  imagePrompt: string;
  imageUrl?: string;
  backgroundColor: string;
  textColor: string;
  /** Cor independente do título. Se ausente, herda textColor. */
  headlineColor?: string;
  /** Cor independente do corpo. Se ausente, herda textColor. */
  bodyColor?: string;
  /** Multiplicador de tamanho do título (default: 1) */
  headlineFontSize?: number;
  /** Multiplicador de tamanho do corpo (default: 1) */
  bodyFontSize?: number;
  accentColor: string;
  layout: "centered" | "left-aligned" | "split" | "minimal";
  aspectRatio?: AspectRatio;
  postMode?: PostMode;
  slides?: CarouselSlide[];
  /** Posição da imagem no layout Bipartido. 'top' = imagem em cima (padrão), 'bottom' = imagem embaixo. */
  splitImagePosition?: 'top' | 'bottom';


  /** 
   * Array de elementos de texto avançados (Architect 2.0).
   * Coexiste com headline/body para transição e compatibilidade.
   */
  textElements?: Array<{
    id: string;
    text: string;
    x: number;
    y: number;
    width: number | 'auto';
    height: number | 'auto';
    rotation: number;
    styles: {
      fontSize: string;
      fontFamily: string;
      color: string;
      fontWeight: string;
      fontStyle: string;
      textDecoration: string;
      textAlign: string;
      lineHeight: string;
      opacity: string;
    };
  }>;

  /** 
   * AI-generated optimizations for alternate aspect ratios.
   * Allows the UI to suggest specific layouts/colors when switching formats.
   */
  aspectRatioOptimizations?: Partial<Record<AspectRatio, FormatOptimization>>;
}

/** App state machine */
export type AppState = "void" | "holodeck" | "workbench";

/** Generation request */
export interface GenerationRequest {
  inputType: InputType;
  content: string;
  platform: Platform;
  imageUrl?: string;
  postMode?: PostMode;
}

/** URL scrape result */
export interface ScrapeResult {
  title: string;
  description: string;
  imageUrl?: string;
  siteName?: string;
  content: string;
}

// ─── Background System ────────────────────────────────────────────────────────

/** Type of background applied to a post card */
export type BackgroundType = "none" | "gallery" | "upload" | "ai" | "solid";

/** Current background value */
export interface BackgroundValue {
  type: BackgroundType;
  url?: string;    // gallery / upload / ai (data URI or public path)
  color?: string;  // solid color (hex)
}

/** Overlay settings applied on top of the background image */
export interface BgOverlaySettings {
  opacity: number;              // 0–1, default 0.5
  color: string;                // hex, default '#000000'
  position: { x: number; y: number }; // 0–100 %, default { x: 50, y: 50 }
}

export const DEFAULT_BG_OVERLAY: BgOverlaySettings = {
  opacity: 0.5,
  color: "#000000",
  position: { x: 50, y: 50 },
};

// ─── Style Extraction System ─────────────────────────────────────────────────

/** Design pattern categories for website classification */
export type DesignPatternCategory =
  | 'modern'           // Clean, minimal, whitespace
  | 'brutalist'        // Raw, bold, unconventional
  | 'neon'             // Cyberpunk, glowing, dark backgrounds
  | 'classic'          // Traditional, serif, elegant
  | 'playful'          // Colorful, rounded, fun
  | 'corporate'        // Professional, blue tones, structured
  | 'artistic'         // Creative, unique layouts
  | 'minimalist'       // Ultra-simple, essential only
  | 'retro'            // Vintage aesthetics
  | 'futuristic';      // Sci-fi, advanced feel

/** Spacing density detected from website */
export type SpacingDensity = 'compact' | 'normal' | 'spacious';

/** Border radius style detected from website */
export type BorderRadiusStyle = 'square' | 'rounded' | 'pill';

/** Padding style detected from website */
export type PaddingStyle = 'tight' | 'normal' | 'loose';

/** Extracted style data from a website */
export interface ExtractedStyleData {
  // Cores extraídas
  colors: {
    primary: string;       // Cor dominante (hex)
    secondary: string;     // Cor secundária (hex)
    background: string;    // Cor de fundo predominante (hex)
    text: string;          // Cor de texto principal (hex)
    accent: string;        // Cor de destaque (hex)
    palette: string[];     // Paleta completa extraída (máx 8 cores)
  };

  // Tipografia
  typography: {
    headingFont: string;   // Família da fonte de título
    bodyFont: string;      // Família da fonte de corpo
    headingWeight: string; // Peso da fonte de título
    bodyWeight: string;    // Peso da fonte de corpo
  };

  // Espaçamento e Layout
  spacing: {
    density: SpacingDensity;
    borderRadius: BorderRadiusStyle;
    padding: PaddingStyle;
  };

  // Efeitos visuais detectados
  effects: {
    shadows: boolean;       // Presença de sombras
    gradients: boolean;     // Presença de gradientes
    animations: boolean;    // Presença de animações
    glassmorphism: boolean; // Efeito glass/blur
    noise: boolean;         // Textura de ruído
  };

  // Metadados do site
  metadata: {
    favicon?: string;       // URL do favicon
    logo?: string;          // URL do logo detectado
    siteName?: string;      // Nome do site
  };
}

/** Design pattern classified by LLM */
export interface DesignPattern {
  id: string;
  name: string;
  category: DesignPatternCategory;
  confidence: number;
  characteristics: string[];
  description: string;
  /** Suggested colors inferred by LLM when extraction fails (SPA sites) */
  suggestedColors?: {
    bg: string;
    text: string;
    accent: string;
    secondary: string;
  };
}

/** Temporary theme generated from website extraction */
export interface TemporaryTheme {
  id: string;                           // ID único com prefixo 'temp-'
  label: string;                        // Nome exibido ao usuário
  description: string;                  // Descrição do tema
  category: 'brand' | 'remix' | 'disruptive';
  source: 'website-extraction';         // Origem do tema
  sourceUrl: string;                    // URL do site original
  designPattern: DesignPattern;         // Padrão de design detectado
  isTemporary: true;                    // Flag indicando tema temporário
  createdAt: number;                    // Timestamp de criação
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
    alignment: 'left' | 'center' | 'right';
    borderStyle: 'square' | 'rounded' | 'pill';
    decoration: 'none' | 'noise' | 'glitch' | 'grid';
    padding: string;
  };
  effects?: {
    glitch?: boolean;
    glow?: boolean;
    noise?: boolean;
    grid?: boolean;
  };
}

/** Result from style extraction endpoint */
export interface StyleExtractionResult {
  extractedData: ExtractedStyleData;    // Dados brutos extraídos
  designPatterns: DesignPattern[];      // Padrões classificados (1-3)
  themes: TemporaryTheme[];             // Temas gerados (2-3 variações)
  fallbackUsed: boolean;                // Se usou fallback LLM-only
  visionUsed: boolean;                  // Se usou Gemini Vision (screenshot analysis)
}
