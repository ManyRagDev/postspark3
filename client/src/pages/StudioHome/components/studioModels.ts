export type StudioFamily = {
  id: string;
  name: string;
  badge: string;
  rawPrompt: string;
  promptType: "url" | "idea" | "framework";
  headline: string;
  subtext: string;
  category: string;
  fontFamily: string;
  layout: "editorial" | "split" | "glass" | "chromatic" | "quote" | "data" | "carousel";
  bgImage?: string;
  stickerText?: string;
  palette: {
    background: string;
    text: string;
    accent: string;
    surface?: string;
  };
  slides?: Array<{ headline: string; subtext: string; step: string }>;
};

export const STUDIO_FAMILIES: StudioFamily[] = [
  {
    id: "chromatic-block",
    name: "Minimalismo Brutal",
    badge: "HOOK // IMPACTO",
    rawPrompt: "3 sinais de que sua marca parece amadora",
    promptType: "idea",
    headline: "3 SINAIS DE QUE SUA MARCA PARECE AMADORA",
    subtext: "Design improvisado é o imposto invisível que você paga toda vez que um cliente pede desconto.",
    category: "POSICIONAMENTO & AUTORIDADE",
    fontFamily: '"Anton", "Impact", sans-serif',
    layout: "chromatic",
    stickerText: "ERRO COMUM",
    palette: {
      background: "#D92E1E",
      text: "#FFFFFF",
      accent: "#FFD600",
      surface: "#B82415",
    },
  },
  {
    id: "editorial-poster",
    name: "Editorial de Luxo",
    badge: "EDITORIAL // CAPA",
    rawPrompt: "Por que marcas de luxo não competem por preço",
    promptType: "idea",
    headline: "Marcas de luxo não competem por preço.",
    subtext: "A percepção de prestígio nasce quando cada palavra e detalhe visual parecem deliberados.",
    category: "ALTO VALOR & LUXO",
    fontFamily: '"Playfair Display", Georgia, serif',
    layout: "editorial",
    stickerText: "HIGH-TICKET",
    palette: {
      background: "#120D0A",
      text: "#F8F4EE",
      accent: "#E5A93C",
      surface: "#221914",
    },
  },
  {
    id: "brutal-split",
    name: "Brutal Split",
    badge: "CONTRASTE // DIAGNÓSTICO",
    rawPrompt: "O abismo entre marcas caras e marcas desejadas",
    promptType: "idea",
    headline: "Preço Caro vs. Desejo Real: O que faz seu cliente escolher você.",
    subtext: "Cobrar caro sem construir desejo gera objeções. Construir desejo primeiro torna o preço irrelevante.",
    category: "VENDAS & DESEJO",
    fontFamily: '"Syne", "Arial Black", sans-serif',
    layout: "split",
    stickerText: "VIRAL HOOK",
    palette: {
      background: "#0F172A",
      text: "#FFFFFF",
      accent: "#E11D48",
      surface: "#0284C7",
    },
  },
  {
    id: "glass-veil",
    name: "Glass Veil",
    badge: "BRAND DNA // URL",
    rawPrompt: "https://minhaconsultoria.com.br/mentoria-elite",
    promptType: "url",
    headline: "Como criar uma presença digital cinematográfica.",
    subtext: "Extraído automaticamente do site: paleta sofisticada, acabamento fosco e tipografia de autoridade.",
    category: "SITE INTELLIGENCE",
    fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
    layout: "glass",
    stickerText: "LUXO FOSCO",
    palette: {
      background: "#080B14",
      text: "#F0F4FC",
      accent: "#8B5CF6",
      surface: "#141B2D",
    },
  },
  {
    id: "quote-authority",
    name: "Citação de Autoridade",
    badge: "MANIFESTO // AUTORIDADE",
    rawPrompt: "Como precificar seus serviços com autoridade",
    promptType: "idea",
    headline: "Preço é o que se paga. Valor é o que se leva.",
    subtext: "Quando você domina a entrega, sua comunicação não precisa pedir permissão para liderar.",
    category: "MANIFESTO DE MARCA",
    fontFamily: '"Cinzel", Georgia, serif',
    layout: "quote",
    stickerText: "AUTORIDADE",
    palette: {
      background: "#0F172A",
      text: "#F8FAFC",
      accent: "#38BDF8",
      surface: "#1E293B",
    },
  },
  {
    id: "data-punch",
    name: "Data Punch",
    badge: "MÉTRICA // DADO FORTE",
    rawPrompt: "O dado que prova o valor da consistência visual",
    promptType: "idea",
    headline: "87% dos clientes abandonam marcas visualmente inconsistentes.",
    subtext: "O cérebro humano julga a confiabilidade de uma oferta em menos de 50 milissegundos.",
    category: "CIÊNCIA DO DESIGN",
    fontFamily: '"Space Grotesk", sans-serif',
    layout: "data",
    stickerText: "RETENÇÃO",
    palette: {
      background: "#0D1117",
      text: "#FFFFFF",
      accent: "#58A6FF",
      surface: "#161B22",
    },
  },
];
