export interface ShowcaseSlideCard {
  id: string;
  slug: string;
  family: string;
  category: string;
  badge: string;
  headline: string;
  subtext: string;
  fontFamily: string;
  palette: {
    background: string;
    text: string;
    accent: string;
    surface?: string;
  };
  stickerText?: string;
  bgImage?: string;
}

export interface ShowcaseSlideItem {
  card: ShowcaseSlideCard;
  emoji: string;
  prompt: string;
  generationTime: string;
}

/**
 * Os 6 espécimes canônicos do estúdio PostSpark (/thevoid) com backgrounds gerados por IA.
 * O primeiro post é o "Marcas de luxo não competem por preço" (editorial-poster).
 */
export const SHOWCASE_SLIDES: ShowcaseSlideItem[] = [
  {
    card: {
      id: "editorial-poster",
      slug: "editorial-poster-marcas-luxo",
      family: "Editorial de Luxo",
      category: "Alto Valor & Luxo",
      badge: "EDITORIAL // CAPA",
      headline: "Marcas de luxo não competem por preço.",
      subtext: "A percepção de prestígio nasce quando cada palavra e detalhe visual parecem deliberados.",
      fontFamily: '"Playfair Display", Georgia, serif',
      palette: {
        background: "#120D0A",
        text: "#F8F4EE",
        accent: "#E5A93C",
        surface: "#221914",
      },
      stickerText: "HIGH-TICKET",
      bgImage: "/showcase/backgrounds/bg-editorial.jpg",
    },
    emoji: "👑",
    prompt: "Por que marcas de luxo não competem por preço",
    generationTime: "3.8s",
  },
  {
    card: {
      id: "chromatic-block",
      slug: "chromatic-block-marca-amadora",
      family: "Minimalismo Brutal",
      category: "Posicionamento & Autoridade",
      badge: "HOOK // IMPACTO",
      headline: "3 sinais de que sua marca ainda parece amadora.",
      subtext: "Design improvisado é o imposto invisível que você paga toda vez que um cliente pede desconto.",
      fontFamily: '"Anton", "Impact", sans-serif',
      palette: {
        background: "#D92E1E",
        text: "#FFFFFF",
        accent: "#FFD600",
        surface: "#B82415",
      },
      stickerText: "ERRO COMUM",
      bgImage: "/showcase/backgrounds/bg-chromatic.jpg",
    },
    emoji: "🔥",
    prompt: "3 sinais de que sua marca parece amadora",
    generationTime: "3.2s",
  },
  {
    card: {
      id: "brutal-split",
      slug: "brutal-split-desejo-real",
      family: "Brutal Split",
      category: "Vendas & Desejo",
      badge: "CONTRASTE // DIAGNÓSTICO",
      headline: "Preço Caro vs. Desejo Real",
      subtext: "Cobrar caro sem construir desejo gera objeções. Construir desejo primeiro torna o preço irrelevante.",
      fontFamily: '"Syne", "Arial Black", sans-serif',
      palette: {
        background: "#0F172A",
        text: "#FFFFFF",
        accent: "#E11D48",
        surface: "#0284C7",
      },
      stickerText: "VIRAL HOOK",
      bgImage: "/showcase/backgrounds/bg-split-desejo.jpg",
    },
    emoji: "⚡",
    prompt: "O abismo entre marcas caras e marcas desejadas",
    generationTime: "3.4s",
  },
  {
    card: {
      id: "glass-veil",
      slug: "glass-veil-presenca-cinematografica",
      family: "Glass Veil",
      category: "Site Intelligence",
      badge: "BRAND DNA // URL",
      headline: "Como criar uma presença digital cinematográfica.",
      subtext: "Extraído automaticamente do site: paleta sofisticada, acabamento fosco e tipografia de autoridade.",
      fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
      palette: {
        background: "#080B14",
        text: "#F0F4FC",
        accent: "#8B5CF6",
        surface: "#141B2D",
      },
      stickerText: "LUXO FOSCO",
      bgImage: "/showcase/backgrounds/bg-glass.jpg",
    },
    emoji: "💎",
    prompt: "Como criar uma presença digital cinematográfica",
    generationTime: "4.1s",
  },
  {
    card: {
      id: "quote-authority",
      slug: "quote-authority-precificacao",
      family: "Citação de Autoridade",
      category: "Manifesto de Marca",
      badge: "MANIFESTO // AUTORIDADE",
      headline: "Preço é o que se paga. Valor é o que se leva.",
      subtext: "Quando você domina a entrega, sua comunicação não precisa pedir permissão para liderar.",
      fontFamily: '"Cinzel", Georgia, serif',
      palette: {
        background: "#0B1120",
        text: "#F8FAFC",
        accent: "#38BDF8",
        surface: "#1E293B",
      },
      stickerText: "AUTORIDADE",
      bgImage: "/showcase/backgrounds/bg-quote.jpg",
    },
    emoji: "✦",
    prompt: "Como precificar seus serviços com autoridade",
    generationTime: "3.5s",
  },
  {
    card: {
      id: "data-punch",
      slug: "data-punch-retencao-consistencia",
      family: "Data Punch",
      category: "Ciência do Design",
      badge: "MÉTRICA // DADO FORTE",
      headline: "87% dos clientes abandonam marcas visualmente inconsistentes.",
      subtext: "O cérebro humano julga a confiabilidade de uma oferta em menos de 50 milissegundos.",
      fontFamily: '"Space Grotesk", sans-serif',
      palette: {
        background: "#0D1117",
        text: "#FFFFFF",
        accent: "#58A6FF",
        surface: "#161B22",
      },
      stickerText: "RETENÇÃO",
      bgImage: "/showcase/backgrounds/bg-data.jpg",
    },
    emoji: "📊",
    prompt: "O dado que prova o valor da consistência visual",
    generationTime: "3.1s",
  },
];
