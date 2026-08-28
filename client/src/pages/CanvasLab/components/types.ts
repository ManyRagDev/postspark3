export type AspectRatioType = "1:1" | "5:6" | "9:16";
export type TextAlignType = "left" | "center" | "right";
export type LogoPositionType = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type VisualFamilyId =
  | "editorial-poster"
  | "glass-veil"
  | "chromatic-block"
  | "brutal-split"
  | "stroke-impact"
  | "cyber-glitch"
  | "cinematic-depth"
  | "duotone-wash"
  | "quote-authority"
  | "minimal-air"
  | "versus"
  | "data-punch"
  | "kinetic-type"
  | "mosaic-grid";

export interface FamilyMetadata {
  id: VisualFamilyId;
  name: string;
  category: "Tendências & Instagram" | "Editorial & Clássico" | "Métricas & Conversão";
  icon: string;
  description: string;
  defaultFont: string;
  defaultPalette: {
    background: string;
    text: string;
    accent: string;
    surface?: string;
  };
}

// ─── Motor de Contraste Inteligente (WCAG) ──────────────────────────────────
export function isDarkColor(hexColor?: string): boolean {
  if (!hexColor) return true;
  const hex = hexColor.replace("#", "");
  if (hex.length === 6) {
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq < 128;
  }
  return true;
}

export function resolveLegibleTextColor(bg: string, requestedText?: string): string {
  const darkBg = isDarkColor(bg);
  if (!requestedText) return darkBg ? "#FFFFFF" : "#121214";
  const darkText = isDarkColor(requestedText);
  // Se o fundo for escuro e o texto pedido for escuro, força branco puro
  if (darkBg && darkText) return "#FFFFFF";
  // Se o fundo for claro e o texto pedido for claro, força grafite escuro
  if (!darkBg && !darkText) return "#121214";
  return requestedText;
}

export const OFFICIAL_FAMILIES_META: Record<VisualFamilyId, FamilyMetadata> = {
  // ─── 1. Tendências & Instagram (Novos Arquétipos) ───
  "stroke-impact": {
    id: "stroke-impact",
    name: "Stroke Impact",
    category: "Tendências & Instagram",
    icon: "🔲",
    description: "Texto com contorno vazado (stroke outline) intercalado com sólido.",
    defaultFont: "Bebas Neue",
    defaultPalette: { background: "#0A0A0C", text: "#FFFFFF", accent: "#FF4D30", surface: "#1C1D24" },
  },
  "cinematic-depth": {
    id: "cinematic-depth",
    name: "Pôster de Cinema",
    category: "Tendências & Instagram",
    icon: "🎬",
    description: "Tipografia condensada monumental em camadas com rodapé de cinema.",
    defaultFont: "Bebas Neue",
    defaultPalette: { background: "#08080A", text: "#F3F4F6", accent: "#D4AF37", surface: "#18181F" },
  },
  "brutal-split": {
    id: "brutal-split",
    name: "Brutal Split (@design.deb)",
    category: "Tendências & Instagram",
    icon: "⚡",
    description: "Divisão 50/50 em duas metades com selo circular de interseção central.",
    defaultFont: "Archivo Black",
    defaultPalette: { background: "#171717", text: "#FFFFFF", accent: "#21F1A8", surface: "#0C0C0D" },
  },
  "glass-veil": {
    id: "glass-veil",
    name: "Glass Veil (Vidro)",
    category: "Tendências & Instagram",
    icon: "✨",
    description: "Cartão translúcido flutuante com borda iluminada e badge em pílula.",
    defaultFont: "Plus Jakarta Sans",
    defaultPalette: { background: "#090D18", text: "#FFFFFF", accent: "#8B5CF6", surface: "#151C2E" },
  },
  "cyber-glitch": {
    id: "cyber-glitch",
    name: "Cyber & Glitch",
    category: "Tendências & Instagram",
    icon: "🤖",
    description: "Miras de precisão (+), scanlines vetoriais e tags de terminal neon.",
    defaultFont: "Space Mono",
    defaultPalette: { background: "#040812", text: "#E0F7FA", accent: "#00F0FF", surface: "#0B1528" },
  },

  // ─── 2. Editorial & Clássico ───
  "editorial-poster": {
    id: "editorial-poster",
    name: "Editorial de Luxo",
    category: "Editorial & Clássico",
    icon: "📰",
    description: "Aspas gigantes, Playfair Display e linhas divisórias nobres.",
    defaultFont: "Playfair Display",
    defaultPalette: { background: "#120D0A", text: "#F8F4EE", accent: "#E5A93C", surface: "#221914" },
  },
  "chromatic-block": {
    id: "chromatic-block",
    name: "Minimalismo Brutal",
    category: "Editorial & Clássico",
    icon: "💥",
    description: "Sticker angular rotacionado (-4°), Anton massiva e cores puras.",
    defaultFont: "Anton",
    defaultPalette: { background: "#D92E1E", text: "#FFFFFF", accent: "#FFD600", surface: "#000000" },
  },
  "duotone-wash": {
    id: "duotone-wash",
    name: "Duotone Wash",
    category: "Editorial & Clássico",
    icon: "🎨",
    description: "Gradiente linear diagonal a 135° e composição elegante centralizada.",
    defaultFont: "Inter",
    defaultPalette: { background: "#2A0845", text: "#FFFFFF", accent: "#FF3366", surface: "#3D125F" },
  },
  "quote-authority": {
    id: "quote-authority",
    name: "Citação de Autoridade",
    category: "Editorial & Clássico",
    icon: "💬",
    description: "Layout de citação profunda com tipografia clássica e peso de marca.",
    defaultFont: "Cinzel",
    defaultPalette: { background: "#0F172A", text: "#F8FAFC", accent: "#38BDF8", surface: "#1E293B" },
  },
  "minimal-air": {
    id: "minimal-air",
    name: "Minimalismo Arejado",
    category: "Editorial & Clássico",
    icon: "🍃",
    description: "Espaço em branco generoso, equilíbrio zen e clareza absoluta.",
    defaultFont: "Inter",
    defaultPalette: { background: "#F8F9FA", text: "#1A1A1A", accent: "#2563EB", surface: "#FFFFFF" },
  },

  // ─── 3. Métricas & Conversão ───
  "versus": {
    id: "versus",
    name: "Comparação Versus",
    category: "Métricas & Conversão",
    icon: "⚔️",
    description: "Comparação Antes vs Depois ou Certo vs Errado em duas colunas.",
    defaultFont: "Montserrat",
    defaultPalette: { background: "#0F0F12", text: "#FFFFFF", accent: "#10B981", surface: "#181820" },
  },
  "data-punch": {
    id: "data-punch",
    name: "Data Punch (Métricas)",
    category: "Métricas & Conversão",
    icon: "📊",
    description: "Números grandes e dados em destaque de alto impacto.",
    defaultFont: "Space Grotesk",
    defaultPalette: { background: "#0D1117", text: "#FFFFFF", accent: "#58A6FF", surface: "#161B22" },
  },
  "kinetic-type": {
    id: "kinetic-type",
    name: "Tipografia Cinética",
    category: "Métricas & Conversão",
    icon: "⚡",
    description: "Tipografia ousada com quebras ritmadas e energia visual.",
    defaultFont: "Syne",
    defaultPalette: { background: "#111111", text: "#FFFFFF", accent: "#FF5E00", surface: "#222222" },
  },
  "mosaic-grid": {
    id: "mosaic-grid",
    name: "Mosaico & Grade",
    category: "Métricas & Conversão",
    icon: "🧱",
    description: "Organização estruturada em blocos modulares para listas e passos.",
    defaultFont: "Plus Jakarta Sans",
    defaultPalette: { background: "#0F172A", text: "#FFFFFF", accent: "#6366F1", surface: "#1E293B" },
  },
};

export const ALL_OFFICIAL_FAMILY_IDS: VisualFamilyId[] = Object.keys(OFFICIAL_FAMILIES_META) as VisualFamilyId[];

// Guardrail puro de garantia de famílias distintas
export function ensureDistinctFamilies<T extends { familyId?: string }>(variations: T[]): T[] {
  const used = new Set<string>();
  const available = [...ALL_OFFICIAL_FAMILY_IDS];

  return variations.map((v, index) => {
    let rawFamily = v.familyId;
    if (rawFamily === "glitch-signal") rawFamily = "cyber-glitch";

    let family: VisualFamilyId;
    if (rawFamily && ALL_OFFICIAL_FAMILY_IDS.includes(rawFamily as VisualFamilyId) && !used.has(rawFamily)) {
      family = rawFamily as VisualFamilyId;
    } else {
      const nextUnused = available.find((f) => !used.has(f)) || ALL_OFFICIAL_FAMILY_IDS[index % ALL_OFFICIAL_FAMILY_IDS.length];
      family = nextUnused;
    }

    used.add(family);
    return {
      ...v,
      familyId: family,
    };
  });
}

export interface ElementPosition {
  x: number;
  y: number;
}

export interface CarouselSlideItem {
  id: string;
  step: string;
  headline: string;
  subtext: string;
  bgImage?: string;
  imagePrompt?: string;
  headlinePos?: ElementPosition;
  subtextPos?: ElementPosition;
  badgePos?: ElementPosition;
  barPos?: ElementPosition;
  logoPos?: ElementPosition;
}

export interface CanvasPostModel {
  id: string;
  familyId: VisualFamilyId;
  familyName: string;
  aspectRatio: AspectRatioType;
  headlineAlign: TextAlignType;
  bodyAlign: TextAlignType;
  badgeText: string;
  headline: string;
  subtext: string;
  caption: string;
  imagePrompt?: string;
  fontFamily: string;
  customFontUrl?: string;
  bgImage?: string;
  overlayOpacity: number;
  logoUrl?: string;
  logoPosition: LogoPositionType;
  isSnapEnabled?: boolean;
  palette: {
    background: string;
    text: string;
    accent: string;
    surface?: string;
  };
  slides: CarouselSlideItem[];
  currentSlideIndex: number;
}

export const INITIAL_POST: CanvasPostModel = {
  id: "lab-post-1",
  familyId: "editorial-poster",
  familyName: "Editorial de Luxo",
  aspectRatio: "1:1",
  headlineAlign: "left",
  bodyAlign: "left",
  badgeText: "EDITORIAL // CAPA",
  headline: "Marcas de alto valor não competem por preço. Elas definem o padrão.",
  subtext: "A percepção de autoridade nasce quando cada palavra e detalhe visual parecem deliberados.",
  caption: "Marcas de alto padrão não disputam a atenção pelo desconto mais agressivo.\n\nElas constroem um ecossistema onde:\n• A estética é impecável;\n• A mensagem tem clareza absoluta;\n• O valor percebido torna o preço secundário.\n\nQual é o padrão que a sua marca está definindo hoje?\n\n#Branding #Posicionamento #DesignEstrategico #Autoridade",
  imagePrompt: "editorial dark luxury texture, elegant gold reflections, minimal upscale workspace background, cinematic lighting",
  fontFamily: "Playfair Display",
  overlayOpacity: 0.55,
  logoPosition: "top-right",
  isSnapEnabled: true,
  palette: {
    background: "#120D0A",
    text: "#F8F4EE",
    accent: "#E5A93C",
    surface: "#221914",
  },
  currentSlideIndex: 0,
  slides: [
    {
      id: "s1",
      step: "SLIDE 01 // O GANCHO",
      headline: "Marcas de alto valor não competem por preço. Elas definem o padrão.",
      subtext: "A percepção de autoridade nasce quando cada palavra e detalhe visual parecem deliberados.",
      imagePrompt: "editorial dark luxury texture, elegant gold reflections, minimal upscale workspace background",
    },
    {
      id: "s2",
      step: "SLIDE 02 // O DIAGNÓSTICO",
      headline: "O erro mais comum é tentar agradar a todos no mesmo post.",
      subtext: "Quem fala com todo mundo não constrói autoridade com ninguém. Foque no seu cliente ideal.",
    },
    {
      id: "s3",
      step: "SLIDE 03 // A VIRADA",
      headline: "Posicione sua oferta com clareza estética e convicção.",
      subtext: "Design editorial e copywriting afiado são os maiores multiplicadores de valor percebido.",
    },
    {
      id: "s4",
      step: "SLIDE 04 // O CHAMADO",
      headline: "Pronto para elevar o nível da sua comunicação visual?",
      subtext: "Salve este post para consultar depois e compartilhe com seu time de marketing.",
    },
  ],
};
