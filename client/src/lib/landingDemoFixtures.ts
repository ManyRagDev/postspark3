import type { PostVariation } from "@shared/postspark";
import { createPostVisualSnapshot } from "./variationSnapshot";

/**
 * Fixtures para a demo do hero da landing page.
 * 3 conjuntos derivados dos showcaseCards: #5 (autoridade-premium), #3 (lancamento-high-ticket), #9 (conversao-direta).
 * Cada conjunto tem: prompt digitado + 3 PostVariation completas.
 */
export interface LandingDemoFixture {
  id: string;
  name: string;
  chipLabel: string;
  /** Texto que será digitado automaticamente no input da demo */
  typedPrompt: string;
  /** 3 variações que serão renderizadas pelo PostRenderer */
  variations: PostVariation[];
  /** Snapshots prontos para renderização (chamada createPostVisualSnapshot no mount) */
  snapshots: ReturnType<typeof createPostVisualSnapshot>[];
}

/**
 * Demo #1: Autoridade Premium (showcaseCard #5)
 * Categoria: Consultoria/Expertise
 * Prompt: "abri 3 vagas de consultoria, quero parecer premium sem parecer arrogante"
 */
const authorityDemo: LandingDemoFixture = {
  id: "authority",
  name: "Autoridade Premium",
  chipLabel: "Consultoria",
  typedPrompt: "abri 3 vagas de consultoria, quero parecer premium sem parecer arrogante",
  variations: [
    {
      id: "auth-1",
      headline: "Quem cobra caro, não vende tempo. Vende decisão.",
      body: "Posicionamento visual para experts que precisam parecer raros antes de parecer acessíveis.",
      caption: "Quem cobra caro, não vende tempo. Vende decisão.\n\nPosicionamento visual para experts que precisam parecer raros antes de parecer acessíveis.",
      hashtags: ["#consultoria", "#posicionamento", "#expertise"],
      callToAction: "Aplicar para vaga",
      tone: "autoridade",
      platform: "instagram",
      imagePrompt: "editorial portrait of high-end consultant, luxury dark background, dramatic side lighting, serious confident expression, premium business aesthetic, elegant fashion magazine style",
      imageUrl: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=900&q=80",
      backgroundColor: "#0B0B0C",
      textColor: "#F3F0EA",
      headlineColor: "#F3F0EA",
      bodyColor: "#D0CCC0",
      accentColor: "#B78D4A",
      layout: "split",
      aspectRatio: "1:1",
      postMode: "static",
      designTokens: {
        colors: {
          background: "#0B0B0C",
          primary: "#B78D4A",
          secondary: "#F3F0EA",
          text: "#F3F0EA",
          card: "#171517",
        },
        typography: {
          fontFamily: "Georgia, 'Times New Roman', serif",
          customFontUrl: "",
          originalFont: "Georgia",
          textTransform: "none",
          textAlign: "left" as const,
        },
        structure: {
          borderRadius: "0px",
          boxShadow: "none",
          border: "none",
        },
        decorations: "minimal",
      },
    },
    {
      id: "auth-2",
      headline: "Sua reputação não é bônus. É o produto.",
      body: "A decisão de compra acontece antes da proposta. No momento em que você entra na sala.",
      caption: "Sua reputação não é bônus. É o produto.\n\nA decisão de compra acontece antes da proposta. No momento em que você entra na sala.",
      hashtags: ["#reputacao", "#consultoria", "#premium"],
      callToAction: "Agendar conversa",
      tone: "autoridade",
      platform: "instagram",
      imagePrompt: "luxury workspace, premium coffee cup, elegant desk, warm natural light, cinematic shadows, refined lifestyle, dark brown and gold tones",
      imageUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80",
      backgroundColor: "#1A1410",
      textColor: "#F6F0E8",
      headlineColor: "#F6F0E8",
      bodyColor: "#E0D8CC",
      accentColor: "#D4AF37",
      layout: "centered",
      aspectRatio: "1:1",
      postMode: "static",
      designTokens: {
        colors: {
          background: "#1A1410",
          primary: "#D4AF37",
          secondary: "#F6F0E8",
          text: "#F6F0E8",
          card: "#2B211A",
        },
        typography: {
          fontFamily: "Georgia, 'Times New Roman', serif",
          customFontUrl: "",
          originalFont: "Georgia",
          textTransform: "none",
          textAlign: "center" as const,
        },
        structure: {
          borderRadius: "0px",
          boxShadow: "none",
          border: "none",
        },
        decorations: "minimal",
      },
    },
    {
      id: "auth-3",
      headline: "Expertise não é o que você faz. É como você é percebido.",
      body: "O mercado não paga pelo que você sabe. Paga pelo que ele acredita que você sabe.",
      caption: "Expertise não é o que você faz. É como você é percebido.\n\nO mercado não paga pelo que você sabe. Paga pelo que ele acredita que você sabe.",
      hashtags: ["#expertise", "#posicionamento", "#consultoria"],
      callToAction: "Conhecer método",
      tone: "autoridade",
      platform: "instagram",
      imagePrompt: "luxury abstract texture, subtle paper grain, dark editorial background, refined premium composition, minimal golden highlights",
      imageUrl: "",
      backgroundColor: "#0E0D0B",
      textColor: "#F4F1EA",
      headlineColor: "#F4F1EA",
      bodyColor: "#D8D5CC",
      accentColor: "#C9A96A",
      layout: "minimal",
      aspectRatio: "1:1",
      postMode: "static",
      designTokens: {
        colors: {
          background: "#0E0D0B",
          primary: "#C9A96A",
          secondary: "#F4F1EA",
          text: "#F4F1EA",
          card: "#1A1713",
        },
        typography: {
          fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
          customFontUrl: "",
          originalFont: "Trebuchet MS",
          textTransform: "uppercase",
          textAlign: "left" as const,
        },
        structure: {
          borderRadius: "0px",
          boxShadow: "none",
          border: "1px solid rgba(201, 169, 106, 0.2)",
        },
        decorations: "minimal",
      },
    },
  ],
  snapshots: [], // Preenchido no mount
};

/**
 * Demo #2: Lançamento High-Ticket (showcaseCard #3)
 * Categoria: Lançamento/Infoproduto
 * Prompt: "lancamento de mentoria, preciso de urgencia e presenca premium"
 */
const launchDemo: LandingDemoFixture = {
  id: "launch",
  name: "Lançamento High-Ticket",
  chipLabel: "Lançamento",
  typedPrompt: "lancamento de mentoria, preciso de urgencia e presenca premium",
  variations: [
    {
      id: "launch-1",
      headline: "As vagas abriram. O mercado percebeu.",
      body: "Uma abertura de turma com presença, tensão e sensação de evento premium.",
      caption: "As vagas abriram. O mercado percebeu.\n\nUma abertura de turma com presença, tensão e sensação de evento premium.",
      hashtags: ["#lancamento", "#mentoria", "#vagaslimitadas"],
      callToAction: "Garantir vaga",
      tone: "urgencia",
      platform: "instagram",
      imagePrompt: "premium female entrepreneur, luxury event atmosphere, elegant studio lighting, black and cyan aesthetic, high-ticket business photography",
      imageUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
      backgroundColor: "#05070B",
      textColor: "#F5FAFF",
      headlineColor: "#F5FAFF",
      bodyColor: "#C8D8E8",
      accentColor: "#00E5FF",
      layout: "split",
      aspectRatio: "1:1",
      postMode: "static",
      designTokens: {
        colors: {
          background: "#05070B",
          primary: "#00E5FF",
          secondary: "#F5FAFF",
          text: "#F5FAFF",
          card: "#0B1118",
        },
        typography: {
          fontFamily: "'Arial Black', 'Arial', sans-serif",
          customFontUrl: "",
          originalFont: "Arial Black",
          textTransform: "uppercase",
          textAlign: "left" as const,
        },
        structure: {
          borderRadius: "0px",
          boxShadow: "none",
          border: "none",
        },
        decorations: "minimal",
      },
    },
    {
      id: "launch-2",
      headline: "3 turmas. 0 interesse em popular.",
      body: "Quando o posicionamento é correto, você não precisa vender. Você precisa selecionar.",
      caption: "3 turmas. 0 interesse em popular.\n\nQuando o posicionamento é correto, você não precisa vender. Você precisa selecionar.",
      hashtags: ["#posicionamento", "#mentoria", "#exclusividade"],
      callToAction: "Aplicar agora",
      tone: "escassez",
      platform: "instagram",
      imagePrompt: "modern luxury architecture, premium interior, dramatic perspective, dark upscale environment, commercial sophistication",
      imageUrl: "https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&w=900&q=80",
      backgroundColor: "#0B0A09",
      textColor: "#FFFFFF",
      headlineColor: "#FFFFFF",
      bodyColor: "#E8E8E8",
      accentColor: "#FF8A3D",
      layout: "minimal",
      aspectRatio: "1:1",
      postMode: "static",
      designTokens: {
        colors: {
          background: "#0B0A09",
          primary: "#FF8A3D",
          secondary: "#FFFFFF",
          text: "#FFFFFF",
          card: "#1A1715",
        },
        typography: {
          fontFamily: "'Arial Black', 'Arial', sans-serif",
          customFontUrl: "",
          originalFont: "Arial Black",
          textTransform: "uppercase",
          textAlign: "center" as const,
        },
        structure: {
          borderRadius: "0px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
          border: "none",
        },
        decorations: "minimal",
      },
    },
    {
      id: "launch-3",
      headline: "O mercado não desconta mais. Ele escolhe.",
      body: "Sua oferta não está caro. Está mal posicionada para quem tem dinheiro.",
      caption: "O mercado não desconta mais. Ele escolhe.\n\nSua oferta não está caro. Está mal posicionada para quem tem dinheiro.",
      hashtags: ["#posicionamento", "#highend", "#premium"],
      callToAction: "Ver programa",
      tone: "autoridade",
      platform: "instagram",
      imagePrompt: "dramatic abstract gradient, dark charcoal background, premium golden light streaks, intense but elegant business mood",
      imageUrl: "",
      backgroundColor: "#101012",
      textColor: "#F4F4F2",
      headlineColor: "#F4F4F2",
      bodyColor: "#D0D0CC",
      accentColor: "#D4A24C",
      layout: "minimal",
      aspectRatio: "1:1",
      postMode: "static",
      designTokens: {
        colors: {
          background: "#101012",
          primary: "#D4A24C",
          secondary: "#F4F4F2",
          text: "#F4F4F2",
          card: "#1A1A1F",
        },
        typography: {
          fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
          customFontUrl: "",
          originalFont: "Trebuchet MS",
          textTransform: "uppercase",
          textAlign: "left" as const,
        },
        structure: {
          borderRadius: "0px",
          boxShadow: "none",
          border: "2px solid rgba(212, 162, 76, 0.3)",
        },
        decorations: "minimal",
      },
    },
  ],
  snapshots: [], // Preenchido no mount
};

/**
 * Demo #3: Conversão Direta (showcaseCard #9)
 * Categoria: Vendas/Promoção
 * Prompt: "promocao de servico, preciso chamar atencao sem parecer desesperado"
 */
const conversionDemo: LandingDemoFixture = {
  id: "conversion",
  name: "Conversão Direta",
  chipLabel: "Promoção",
  typedPrompt: "promocao de servico, preciso chamar atencao sem parecer desesperado",
  variations: [
    {
      id: "conv-1",
      headline: "Seu visual comunica valor ou desconto?",
      body: "Design comercial para transformar atenção em intenção de compra.",
      caption: "Seu visual comunica valor ou desconto?\n\nDesign comercial para transformar atenção em intenção de compra.",
      hashtags: ["#vendas", "#comercial", "#conversao"],
      callToAction: "Saiba mais",
      tone: "comercial",
      platform: "instagram",
      imagePrompt: "modern luxury architecture, premium interior, dramatic perspective, dark upscale environment, warm orange highlights",
      imageUrl: "https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&w=900&q=80",
      backgroundColor: "#0B0A09",
      textColor: "#FFFFFF",
      headlineColor: "#FFFFFF",
      bodyColor: "#E8E8E8",
      accentColor: "#FF8A3D",
      layout: "minimal",
      aspectRatio: "1:1",
      postMode: "static",
      designTokens: {
        colors: {
          background: "#0B0A09",
          primary: "#FF8A3D",
          secondary: "#FFFFFF",
          text: "#FFFFFF",
          card: "#1A1715",
        },
        typography: {
          fontFamily: "'Arial Black', 'Arial', sans-serif",
          customFontUrl: "",
          originalFont: "Arial Black",
          textTransform: "uppercase",
          textAlign: "center" as const,
        },
        structure: {
          borderRadius: "0px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
          border: "none",
        },
        decorations: "minimal",
      },
    },
    {
      id: "conv-2",
      headline: "Não é falta de conteúdo. É falta de direção.",
      body: "Quando a mensagem não organiza a percepção, o mercado interpreta como amadorismo.",
      caption: "Não é falta de conteúdo. É falta de direção.\n\nQuando a mensagem não organiza a percepção, o mercado interpreta como amadorismo.",
      hashtags: ["#estrategia", "#comunicacao", "#marketing"],
      callToAction: "Conhecer método",
      tone: "objecao",
      platform: "instagram",
      imagePrompt: "dramatic abstract gradient, dark charcoal background, premium golden light streaks, intense but elegant business mood",
      imageUrl: "",
      backgroundColor: "#101012",
      textColor: "#F4F4F2",
      headlineColor: "#F4F4F2",
      bodyColor: "#D0D0CC",
      accentColor: "#D4A24C",
      layout: "minimal",
      aspectRatio: "1:1",
      postMode: "static",
      designTokens: {
        colors: {
          background: "#101012",
          primary: "#D4A24C",
          secondary: "#F4F4F2",
          text: "#F4F4F2",
          card: "#1A1A1F",
        },
        typography: {
          fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
          customFontUrl: "",
          originalFont: "Trebuchet MS",
          textTransform: "uppercase",
          textAlign: "left" as const,
        },
        structure: {
          borderRadius: "0px",
          boxShadow: "none",
          border: "2px solid rgba(212, 162, 76, 0.3)",
        },
        decorations: "minimal",
      },
    },
    {
      id: "conv-3",
      headline: "Design que performa antes mesmo do clique.",
      body: "A peça certa reduz atrito, organiza atenção e aumenta intenção comercial.",
      caption: "Design que performa antes mesmo do clique.\n\nA peça certa reduz atrito, organiza atenção e aumenta intenção comercial.",
      hashtags: ["#performance", "#comercial", "#conversao"],
      callToAction: "Aplicar agora",
      tone: "beneficio",
      platform: "instagram",
      imagePrompt: "high-performance marketing visual, futuristic city lights, data overlays, speed and scale feeling, dark premium tech aesthetic",
      imageUrl: "",
      backgroundColor: "#020406",
      textColor: "#F5FFFF",
      headlineColor: "#F5FFFF",
      bodyColor: "#D8F0F0",
      accentColor: "#4DFFB2",
      layout: "minimal",
      aspectRatio: "1:1",
      postMode: "static",
      designTokens: {
        colors: {
          background: "#020406",
          primary: "#4DFFB2",
          secondary: "#F5FFFF",
          text: "#F5FFFF",
          card: "#0D1316",
        },
        typography: {
          fontFamily: "'Arial Black', 'Arial', sans-serif",
          customFontUrl: "",
          originalFont: "Arial Black",
          textTransform: "uppercase",
          textAlign: "left" as const,
        },
        structure: {
          borderRadius: "0px",
          boxShadow: "0 0 30px rgba(77, 255, 178, 0.2)",
          border: "1px solid rgba(77, 255, 178, 0.3)",
        },
        decorations: "minimal",
      },
    },
  ],
  snapshots: [], // Preenchido no mount
};

/** Todas as demos da landing page */
export const landingDemoFixtures: LandingDemoFixture[] = [
  authorityDemo,
  launchDemo,
  conversionDemo,
];

/** Demo padrão (primeira da lista) */
export const defaultLandingDemo = landingDemoFixtures[0];

/**
 * Inicializa os snapshots de todas as variações de todas as demos.
 * Deve ser chamado no mount do componente que usa as fixtures.
 */
export function initializeLandingDemoSnapshots(): LandingDemoFixture[] {
  return landingDemoFixtures.map((fixture) => ({
    ...fixture,
    snapshots: fixture.variations.map((variation) =>
      createPostVisualSnapshot(variation, "1:1")
    ),
  }));
}
