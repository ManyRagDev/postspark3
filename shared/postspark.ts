/** Input type detection */
export type InputType = "text" | "url" | "image";

/** AI Model selection */
export type AiModel = "gemini" | "llama";

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
  model?: AiModel;
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

// ─── Brand DNA System ─────────────────────────────────────────────────────────

/** Musical-metaphor composition rules derived from brand personality */
export interface CompositionRules {
  /** Rhythm → spacing pattern (staccato=tight, legato=flowing, syncopated=varied) */
  rhythm: 'staccato' | 'legato' | 'syncopated';
  /** Harmony → color relationship strategy (consonant=safe analogous, dissonant=complementary tension, resolved=triadic balance) */
  harmony: 'consonant' | 'dissonant' | 'resolved';
  /** Dynamics → visual weight and contrast level (forte=bold/high-contrast, mezzo=balanced, piano=subtle/low-weight) */
  dynamics: 'forte' | 'mezzo' | 'piano';
  /** Tempo → content density and breathing room (allegro=compact, andante=normal, adagio=spacious) */
  tempo: 'allegro' | 'andante' | 'adagio';
}

/** Full brand identity extracted from multi-page analysis */
export interface BrandDNA {
  brandName: string;
  industry: string;

  /** Personality spectrum — each axis 0-100 */
  personality: {
    /** 0 = serious/formal, 100 = playful/fun */
    seriousPlayful: number;
    /** 0 = luxury/exclusive, 100 = accessible/democratic */
    luxuryAccessible: number;
    /** 0 = modern/cutting-edge, 100 = classic/traditional */
    modernClassic: number;
    /** 0 = bold/loud, 100 = subtle/quiet */
    boldSubtle: number;
    /** 0 = warm/organic, 100 = cool/technical */
    warmCool: number;
  };

  colors: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
    accent: string;
    palette: string[];
    colorRelationships: {
      harmony: 'complementary' | 'analogous' | 'triadic' | 'monochromatic' | 'split-complementary';
      contrast: 'high' | 'medium' | 'low';
      temperature: 'warm' | 'cool' | 'neutral';
    };
  };

  typography: {
    headingFont: string;
    bodyFont: string;
    headingWeight: string;
    bodyWeight: string;
    /** How heading and body fonts relate to each other */
    fontPairing: 'matching' | 'contrasting' | 'complementary';
  };

  /** Musical-metaphor layout composition rules (derived deterministically from personality) */
  composition: CompositionRules;

  layout: {
    density: SpacingDensity;
    borderRadius: BorderRadiusStyle;
    padding: PaddingStyle;
    preferredAlignment: 'left' | 'center' | 'right';
  };

  effects: {
    shadows: boolean;
    gradients: boolean;
    animations: boolean;
    glassmorphism: boolean;
    noise: boolean;
  };

  /** Emotional/psychological brand profile */
  emotionalProfile: {
    /** Primary emotional quality: "trust", "energy", "calm", "excitement", "elegance", etc. */
    primary: string;
    /** Secondary emotional quality */
    secondary: string;
    /** 2-3 word mood descriptor, e.g. "confident professional" or "playful and bold" */
    mood: string;
  };

  metadata: {
    sourceUrl: string;
    pagesAnalyzed: number;
    /** 0-1 quality score of the extraction */
    extractionQuality: number;
    visionUsed: boolean;
    favicon?: string;
    logo?: string;
    siteName?: string;
  };
}

/** Result from the extractBrandDNA endpoint */
export interface BrandDNAExtractionResult {
  brandDNA: BrandDNA;
  themes: TemporaryTheme[];   // 3 variations (faithful, remix, disruptive)
  fallbackUsed: boolean;
}

/** LLM-as-Judge evaluation of generated post variations */
export interface PostEvaluation {
  /** 0-100 overall quality score */
  overallScore: number;
  dimensions: {
    /** How closely the post matches the brand's visual identity (0-100) */
    brandAlignment: number;
    /** NIMA-inspired aesthetic appeal score (0-100) */
    aestheticQuality: number;
    /** Text contrast + hierarchy readability (0-100) */
    readability: number;
    /** VQAScore-inspired: does the visual match the intended message? (0-100) */
    messageClarity: number;
    /** Potential to catch attention on social media (0-100) */
    engagement: number;
  };
  /** Up to 3 actionable improvement suggestions */
  suggestions: string[];
  verdict: 'excellent' | 'good' | 'needs-improvement';
}

/** Result from the evaluateQuality endpoint */
export interface PostQualityResult {
  evaluations: PostEvaluation[];  // One per variation
}
