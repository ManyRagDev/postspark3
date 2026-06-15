import type {
  CarouselSlide,
  ContentSection,
  PostVariation,
} from "../../shared/postspark";

export type SiteFixtureKind =
  | "saas"
  | "ecommerce"
  | "professional-services"
  | "institutional"
  | "low-content"
  | "carousel";

export interface SiteAuditFixture {
  kind: SiteFixtureKind;
  url: string;
  title: string;
  description: string;
  content: string;
  expectedTopics: string[];
  expectedObjectives: string[];
}

export const SITE_AUDIT_FIXTURES: SiteAuditFixture[] = [
  {
    kind: "saas",
    url: "https://fixture.example/saas",
    title: "FlowPilot",
    description: "Automacao de operacoes para equipes B2B.",
    content:
      "Centralize processos, reduza tarefas manuais e acompanhe indicadores em tempo real.",
    expectedTopics: ["automacao", "produtividade", "operacoes"],
    expectedObjectives: ["lead", "authority"],
  },
  {
    kind: "ecommerce",
    url: "https://fixture.example/ecommerce",
    title: "Casa Clara",
    description: "Objetos funcionais para uma casa organizada.",
    content:
      "Organizadores, luminarias e acessorios com entrega nacional e troca facilitada.",
    expectedTopics: ["organizacao", "produto", "casa"],
    expectedObjectives: ["sell", "engage"],
  },
  {
    kind: "professional-services",
    url: "https://fixture.example/services",
    title: "Norte Contabil",
    description: "Contabilidade consultiva para pequenas empresas.",
    content:
      "Planejamento tributario, abertura de empresa e acompanhamento financeiro sem jargao.",
    expectedTopics: ["tributos", "gestao", "empreendedorismo"],
    expectedObjectives: ["authority", "lead"],
  },
  {
    kind: "institutional",
    url: "https://fixture.example/institutional",
    title: "Instituto Horizonte",
    description: "Educacao complementar para jovens da rede publica.",
    content:
      "Programas de tecnologia, mentoria e preparacao profissional com impacto mensuravel.",
    expectedTopics: ["educacao", "impacto", "juventude"],
    expectedObjectives: ["authority", "engage"],
  },
  {
    kind: "low-content",
    url: "https://fixture.example/low-content",
    title: "Studio Um",
    description: "Design que aproxima.",
    content: "Projetos selecionados. Contato. Sao Paulo.",
    expectedTopics: ["design"],
    expectedObjectives: ["authority"],
  },
  {
    kind: "carousel",
    url: "https://fixture.example/carousel",
    title: "Clinica Movimento",
    description: "Fisioterapia baseada em evidencia.",
    content:
      "Tratamento individual para dor lombar com avaliacao, plano terapeutico e acompanhamento.",
    expectedTopics: ["fisioterapia", "dor", "tratamento"],
    expectedObjectives: ["educate", "lead"],
  },
];

export const RICH_SECTIONS: ContentSection[] = [
  { label: "Diagnostico", description: "Entenda o ponto de partida.", icon: "analysis" },
  { id: "section-plan", label: "Plano", description: "Defina a proxima acao.", icon: "Target" },
  { label: "Evolucao", description: "Meça o resultado.", icon: "performance" },
];

export const CAROUSEL_SLIDES: CarouselSlide[] = [
  { slideNumber: 1, headline: "O problema", body: "O que impede o resultado.", isTitleSlide: true },
  { slideNumber: 2, headline: "O caminho", body: "Uma abordagem pratica." },
  { slideNumber: 3, headline: "Proximo passo", body: "Comece pela avaliacao.", isCtaSlide: true },
];

export function createPostVariation(
  overrides: Partial<PostVariation> = {},
): PostVariation {
  return {
    id: "fixture-post",
    headline: "Transforme processo em resultado",
    body: "Uma mensagem objetiva, alinhada ao negocio e pronta para edicao.",
    caption: "Conteudo de baseline para auditoria.",
    hashtags: ["estrategia", "conteudo"],
    callToAction: "Saiba mais",
    tone: "profissional",
    platform: "instagram",
    imagePrompt: "Editorial business workspace",
    imageUrl: "https://fixture.example/post.jpg",
    backgroundColor: "#101828",
    textColor: "#FFFFFF",
    headlineColor: "#F9FAFB",
    bodyColor: "#D0D5DD",
    accentColor: "#7F56D9",
    layout: "left-aligned",
    aspectRatio: "1:1",
    template: "feature-grid",
    sections: RICH_SECTIONS,
    textElements: [
      {
        id: "text-proof",
        text: "Resultado comprovado",
        x: 12,
        y: 18,
        width: 40,
        height: "auto",
        rotation: -3,
        styles: {
          fontSize: "24px",
          fontFamily: "Inter",
          color: "#FFFFFF",
          fontWeight: "700",
          fontStyle: "normal",
          textDecoration: "none",
          textAlign: "left",
          lineHeight: "1.2",
          opacity: "1",
        },
      },
    ],
    designTokens: {
      colors: {
        background: "#101828",
        primary: "#7F56D9",
        secondary: "#D0D5DD",
        text: "#FFFFFF",
        card: "#1D2939",
      },
      typography: {
        fontFamily: "Inter",
        customFontUrl: "",
        originalFont: "Inter",
        textTransform: "none",
        textAlign: "left",
      },
      structure: {
        borderRadius: "16px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.18)",
        border: "1px solid rgba(255,255,255,0.08)",
      },
      decorations: "minimal",
    },
    ...overrides,
  };
}
