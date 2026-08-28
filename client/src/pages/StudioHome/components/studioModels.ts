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
  layout: "editorial" | "split" | "glass" | "chromatic" | "glitch" | "carousel";
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
    id: "editorial-poster",
    name: "Editorial de Luxo",
    badge: "EDITORIAL // CAPA",
    rawPrompt: "Posicionamento de alto valor para marcas de luxo",
    promptType: "idea",
    headline: "Marcas de alto valor não competem por preço. Elas definem o padrão.",
    subtext: "A percepção de autoridade nasce quando cada palavra e detalhe visual parecem deliberados.",
    category: "BRANDING & POSICIONAMENTO",
    fontFamily: '"Playfair Display", Georgia, serif',
    layout: "editorial",
    bgImage: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=800&q=80",
    stickerText: "HIGH-TICKET",
    palette: {
      background: "#120D0A",
      text: "#F8F4EE",
      accent: "#E5A93C",
      surface: "#221914",
    },
  },
  {
    id: "carousel-framework",
    name: "Carrossel Multi-Slide",
    badge: "SLIDE 01 DE 03",
    rawPrompt: "3 gargalos visuais que fazem seus clientes hesitarem antes de comprar",
    promptType: "framework",
    headline: "3 gargalos visuais que fazem seus clientes hesitarem.",
    subtext: "O que acontece nos primeiros 4 segundos da sua oferta determina 80% do faturamento.",
    category: "CONVERSÃO & VENDAS",
    fontFamily: '"Archivo Black", "Arial Black", sans-serif',
    layout: "carousel",
    bgImage: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=800&q=80",
    stickerText: "CARROSSEL",
    palette: {
      background: "#0C0C0D",
      text: "#FFFFFF",
      accent: "#FF4D00",
      surface: "#1A1A1E",
    },
    slides: [
      {
        step: "SLIDE 01 // O GANCHO",
        headline: "3 gargalos visuais que fazem seus clientes hesitarem.",
        subtext: "O que acontece nos primeiros 4 segundos determina se o visitante compra ou fecha a aba.",
      },
      {
        step: "SLIDE 02 // O DIAGNÓSTICO",
        headline: "1. Falta de hierarquia: quando tudo grita, nada é ouvido.",
        subtext: "Sem contraste deliberado entre título e benefício, a leitura se torna cansativa.",
      },
      {
        step: "SLIDE 03 // A VIRADA",
        headline: "2. Estética genérica não sustenta preço de elite.",
        subtext: "Design deliberado é o multiplicador invisível que ancora alto valor percebido.",
      },
    ],
  },
  {
    id: "glass-veil",
    name: "Glass Veil (Vidro)",
    badge: "AUTORIDADE ELITE",
    rawPrompt: "https://minhaconsultoria.com.br/mentoria-high-ticket",
    promptType: "url",
    headline: "Quem cobra 10x mais não vende tempo. Vende certeza e velocidade.",
    subtext: "A esteira de produtos de quem domina o mercado é construída sobre clareza estética e narrativa.",
    category: "MENTORIA & CONSULTORIA",
    fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
    layout: "glass",
    bgImage: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=80",
    stickerText: "EXCLUSIVO",
    palette: {
      background: "#080B14",
      text: "#F0F4FC",
      accent: "#8B5CF6",
      surface: "#141B2D",
    },
  },
  {
    id: "chromatic-block",
    name: "Minimalismo Brutal",
    badge: "RETENÇÃO // HOOK",
    rawPrompt: "Pare de postar dicas soltas. Crie narrativas que vendem.",
    promptType: "idea",
    headline: "PARE DE POSTAR DICAS SOLTAS. CRIE NARRATIVAS QUE VENDEM.",
    subtext: "Dicas geram curtidas vazias. Narrativas bem estruturadas constroem clientes fiéis.",
    category: "ESTRATÉGIA DE CONTEÚDO",
    fontFamily: '"Anton", "Impact", sans-serif',
    layout: "chromatic",
    stickerText: "VIRAL HOOK",
    palette: {
      background: "#D9381E",
      text: "#FFFFFF",
      accent: "#FFD600",
      surface: "#B82810",
    },
  },
  {
    id: "glitch-signal",
    name: "Cyber & Tech",
    badge: "//SYS.PROMPT",
    rawPrompt: "A velocidade da IA não substitui a profundidade do seu repertório",
    promptType: "idea",
    headline: "A velocidade da IA não substitui a profundidade do seu repertório.",
    subtext: "Automatize a execução técnica, mas retenha o controle total da sua visão e identidade.",
    category: "INTELIGÊNCIA ARTIFICIAL",
    fontFamily: '"Space Mono", monospace',
    layout: "glitch",
    bgImage: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80",
    stickerText: "PROMPT_V3",
    palette: {
      background: "#050B14",
      text: "#E6F4FF",
      accent: "#00F0FF",
      surface: "#0B1626",
    },
  },
];
