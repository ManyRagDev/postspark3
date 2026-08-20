export type ShowcaseCard = {
  id: number;
  slug: string;
  family?: string;
  category: string;
  badge?: string;
  title?: string;
  description?: string;
  headline: string;
  subtext: string;
  layoutType:
    | "editorial-poster"
    | "brutal-split"
    | "glass-veil"
    | "chromatic-block"
    | "glitch-signal"
    | "duotone-wash"
    | "full-image"
    | "split"
    | "minimal"
    | "editorial"
    | "grid"
    | "conversion";
  fontFamily: string;
  titleCase?: "upper" | "normal";
  palette: {
    background: string;
    text: string;
    accent: string;
    surface?: string;
  };
  imagePrompt?: string;
  backgroundImageUrl?: string;
  stickerText?: string;
};

export const showcaseCards: ShowcaseCard[] = [
  {
    id: 1,
    slug: "editorial-poster-posicionamento",
    family: "Editorial Poster",
    category: "Branding & Posicionamento",
    badge: "EDITORIAL // CAPA",
    headline: "Marcas de alto valor não competem por preço. Elas definem o padrão.",
    subtext: "A percepção de autoridade nasce quando cada palavra e detalhe visual parecem deliberados.",
    layoutType: "editorial-poster",
    fontFamily: '"Playfair Display", Georgia, serif',
    palette: {
      background: "#120D0A",
      text: "#F8F4EE",
      accent: "#E5A93C",
      surface: "#221914",
    },
    backgroundImageUrl:
      "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=900&q=80",
    stickerText: "HIGH-TICKET",
  },
  {
    id: 2,
    slug: "brutal-split-diagnostico",
    family: "Brutal Split",
    category: "Diagnóstico & Vendas",
    badge: "FRAMEWORK // 01",
    headline: "Seu produto é incrível. Seu posicionamento ainda parece amador.",
    subtext: "Identifique os 3 gargalos visuais que estão fazendo seus potenciais clientes hesitarem.",
    layoutType: "brutal-split",
    fontFamily: '"Archivo Black", "Arial Black", sans-serif',
    palette: {
      background: "#0C0C0D",
      text: "#FFFFFF",
      accent: "#FF4D00",
      surface: "#1A1A1E",
    },
    backgroundImageUrl:
      "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=900&q=80",
    stickerText: "DIAGNÓSTICO",
  },
  {
    id: 3,
    slug: "glass-veil-autoridade",
    family: "Glass Veil",
    category: "Mentoria & Consultoria",
    badge: "AUTORIDADE ELITE",
    headline: "Quem cobra 10x mais não vende tempo. Vende certeza e velocidade.",
    subtext: "A esteira de produtos de quem domina o mercado é construída sobre clareza estética e narrativa.",
    layoutType: "glass-veil",
    fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
    palette: {
      background: "#080B14",
      text: "#F0F4FC",
      accent: "#8B5CF6",
      surface: "#141B2D",
    },
    backgroundImageUrl:
      "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80",
    stickerText: "EXCLUSIVO",
  },
  {
    id: 4,
    slug: "chromatic-block-narrativa",
    family: "Chromatic Block",
    category: "Estratégia de Conteúdo",
    badge: "RETENÇÃO // HOOK",
    headline: "PARE DE POSTAR DICAS SOLTAS. CRIE NARRATIVAS QUE VENDEM.",
    subtext: "Dicas geram curtidas vazias. Narrativas bem estruturadas constroem clientes fiéis.",
    layoutType: "chromatic-block",
    fontFamily: '"Anton", "Impact", sans-serif',
    palette: {
      background: "#D9381E",
      text: "#FFFFFF",
      accent: "#FFD600",
      surface: "#B82810",
    },
    stickerText: "VIRAL HOOK",
  },
  {
    id: 5,
    slug: "glitch-signal-tech",
    family: "Glitch Signal",
    category: "Inteligência Artificial",
    badge: "//SYS.PROMPT",
    headline: "A velocidade da IA não substitui a profundidade do seu repertório.",
    subtext: "Automatize a execução técnica, mas retenha o controle total da sua visão e identidade.",
    layoutType: "glitch-signal",
    fontFamily: '"Space Mono", monospace',
    palette: {
      background: "#050B14",
      text: "#E6F4FF",
      accent: "#00F0FF",
      surface: "#0B1626",
    },
    backgroundImageUrl:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
    stickerText: "PROMPT_V3",
  },
  {
    id: 6,
    slug: "duotone-wash-storytelling",
    family: "Duotone Wash",
    category: "Storytelling & Virada",
    badge: "NARRATIVA PESSOAL",
    headline: "O mercado não compra o que você faz. Compra quem você é quando faz.",
    subtext: "Como marcas pessoais magnéticas transformam vulnerabilidade em faturamento de 7 dígitos.",
    layoutType: "duotone-wash",
    fontFamily: '"Playfair Display", Georgia, serif',
    palette: {
      background: "#14100E",
      text: "#F7EFE8",
      accent: "#E28743",
      surface: "#251C18",
    },
    backgroundImageUrl:
      "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80",
    stickerText: "REPOSICIONAMENTO",
  },
];

