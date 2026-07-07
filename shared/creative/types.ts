import type {
  AdvancedLayoutSettings,
  BgOverlaySettings,
  DesignTokens,
  ImageSettings,
  PostTemplate,
  PostVariation,
  TextElement,
  ImageElement,
  CreativeDirection,
  CreativeAxes,
  CompositionAxis,
  TypographyAxis,
  ColorAxis,
  OrnamentsAxis,
  TextureAxis,
  VibeAxis,
} from "../postspark";

export type {
  CreativeDirection,
  CreativeAxes,
  CompositionAxis,
  TypographyAxis,
  ColorAxis,
  OrnamentsAxis,
  TextureAxis,
  VibeAxis,
};

export type CreativeMood =
  | "urgente" | "sereno" | "premium" | "tech" | "divertido" | "editorial" | "cru";
export type CreativeEnergy = "baixa" | "media" | "alta";
export type CreativeFormality = "formal" | "neutro" | "casual";

export interface CreativeIntent {
  mood: CreativeMood;
  energy: CreativeEnergy;
  formality: CreativeFormality;
}

export interface PaletteDef {
  id: string;
  label: string;
  colorA: string;
  colorB: string;
  temperature: "warm" | "cool" | "neutral";
  vibe: Array<CreativeMood>;
  invertible: boolean;
  bodyNeedsBoost?: boolean;
}

export interface ComposeContext {
  variation: PostVariation;
  tokens: DesignTokens;
  rand: () => number;
  aspectRatio: "1:1" | "5:6" | "9:16";
  doc: { width: number; height: number };
  pxX: (pct: number) => number;
  pxY: (pct: number) => number;
}

export interface FamilyOutput {
  layout?: PostVariation["layout"];
  template?: PostTemplate;
  layoutSettings?: Partial<AdvancedLayoutSettings>;
  textElements?: TextElement[];
  imageElements?: ImageElement[];
  imageSettings?: Partial<ImageSettings>;
  bgOverlay?: Partial<BgOverlaySettings>;
  splitImagePosition?: "top" | "bottom";
  headlineFontFamily?: string;
  bodyFontFamily?: string;
  headlineFontSize?: number;
  bodyFontSize?: number;
  headlineColor?: string;
  bodyColor?: string;
  structure?: Partial<DesignTokens["structure"]>;
  typography?: Partial<Pick<DesignTokens["typography"], "textTransform" | "textAlign">>;
  ornaments?: {
    badge?: "keep" | "hide";
    sticker?: "keep" | "hide";
    accentBar?: "keep" | "hide";
  };
  cardMode?: "card" | "full-bleed";
}

export interface CreativeFamily {
  id: string;
  label: string;
  description: string;
  axes: CreativeAxes;
  moods: CreativeMood[];
  fit: {
    maxHeadlineChars?: number;
    minHeadlineChars?: number;
    needsSections?: boolean;
    needsNumber?: boolean;
    needsImage?: boolean;
  };
  carousel: "uniform" | "title-emphasis";
  compose: (ctx: ComposeContext) => FamilyOutput;
}
