/**
 * Cenários scriptados da "Demo Viva" — landing /landing3.
 *
 * Nenhuma chamada de API: cada cenário é um roteiro completo
 * (prompt digitado + 3 posts art-dirigidos) que o palco do hero encena.
 * Paletas e vozes derivadas das fixtures curadas de showcaseCards.ts.
 */

export type DemoPostLayout = "editorial" | "split" | "poster";

export interface DemoPalette {
  bg: string;
  text: string;
  accent: string;
  surface: string;
}

export interface DemoPost {
  id: string;
  layout: DemoPostLayout;
  handle: string;
  kicker: string;
  headline: string;
  sub?: string;
  cta?: string;
  palette: DemoPalette;
  /** cor alternativa exibida durante a fase de "edição fake" */
  editAccent: string;
  fontFamily: string;
  uppercase?: boolean;
  carousel?: boolean;
}

export interface DemoScenario {
  id: string;
  chip: string;
  prompt: string;
  statusLines: string[];
  posts: [DemoPost, DemoPost, DemoPost];
}

export const demoScenarios: DemoScenario[] = [
  {
    id: "consultoria",
    chip: "Consultoria",
    prompt:
      "abri 3 vagas na minha consultoria, quero parecer premium sem parecer arrogante",
    statusLines: [
      "Lendo sua ideia…",
      "Definindo a direção de arte…",
      "Escrevendo 3 versões…",
    ],
    posts: [
      {
        id: "consultoria-a",
        layout: "editorial",
        handle: "sua.consultoria",
        kicker: "Agenda de julho",
        headline: "Quem cobra caro não vende tempo. Vende decisão.",
        sub: "3 vagas abertas — processo seletivo simples.",
        palette: {
          bg: "#0B0B0C",
          text: "#F3F0EA",
          accent: "#B78D4A",
          surface: "#171517",
        },
        editAccent: "#00E5FF",
        fontFamily: 'Georgia, "Times New Roman", serif',
      },
      {
        id: "consultoria-b",
        layout: "split",
        handle: "sua.consultoria",
        kicker: "Últimas vagas",
        headline: "As vagas abriram. O mercado percebeu.",
        cta: "Aplicar agora",
        palette: {
          bg: "#05070B",
          text: "#F5FAFF",
          accent: "#00E5FF",
          surface: "#0B1118",
        },
        editAccent: "#FF8A3D",
        fontFamily: '"Arial Black", Arial, sans-serif',
        uppercase: true,
      },
      {
        id: "consultoria-c",
        layout: "poster",
        handle: "sua.consultoria",
        kicker: "Opinião",
        headline: "Consultoria não é custo. É atalho.",
        sub: "O caro é continuar decidindo sozinho.",
        palette: {
          bg: "#F3EEE6",
          text: "#121212",
          accent: "#7E1F1F",
          surface: "#E8DED3",
        },
        editAccent: "#B78D4A",
        fontFamily: '"Arial Black", "Helvetica Neue", sans-serif',
        uppercase: true,
      },
    ],
  },
  {
    id: "lancamento",
    chip: "Lançamento",
    prompt:
      "vou lançar minha mentoria semana que vem e preciso de um carrossel com clima de evento",
    statusLines: [
      "Lendo sua ideia…",
      "Montando a narrativa do carrossel…",
      "Escrevendo 3 versões…",
    ],
    posts: [
      {
        id: "lancamento-a",
        layout: "editorial",
        handle: "sua.mentoria",
        kicker: "Carrossel · 5 slides",
        headline: "Seu conhecimento merece embalagem de elite.",
        sub: "Arraste — a turma abre terça.",
        palette: {
          bg: "#090B12",
          text: "#F8F9FC",
          accent: "#8C6BFF",
          surface: "#121726",
        },
        editAccent: "#4DFFB2",
        fontFamily: '"Segoe UI", "Helvetica Neue", sans-serif',
        carousel: true,
      },
      {
        id: "lancamento-b",
        layout: "poster",
        handle: "sua.mentoria",
        kicker: "Diagnóstico",
        headline: "3 sinais de que é a sua hora.",
        sub: "O terceiro é o que mais dói.",
        palette: {
          bg: "#0E0D0B",
          text: "#F4F1EA",
          accent: "#C9A96A",
          surface: "#1A1713",
        },
        editAccent: "#8C6BFF",
        fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
        uppercase: true,
      },
      {
        id: "lancamento-c",
        layout: "split",
        handle: "sua.mentoria",
        kicker: "Evento",
        headline: "Última turma do ano.",
        cta: "Inscrições terça, 9h",
        palette: {
          bg: "#0B0A09",
          text: "#FFFFFF",
          accent: "#FF8A3D",
          surface: "#1A1715",
        },
        editAccent: "#00E5FF",
        fontFamily: '"Arial Black", Arial, sans-serif',
        uppercase: true,
      },
    ],
  },
  {
    id: "promocao",
    chip: "Promoção",
    prompt:
      "promoção de inauguração do meu estúdio: 20% off pra quem fechar essa semana",
    statusLines: [
      "Lendo sua ideia…",
      "Calibrando urgência sem desespero…",
      "Escrevendo 3 versões…",
    ],
    posts: [
      {
        id: "promocao-a",
        layout: "split",
        handle: "seu.estudio",
        kicker: "Inauguração",
        headline: "20% off. Só essa semana.",
        cta: "Garantir horário",
        palette: {
          bg: "#020406",
          text: "#F5FFFF",
          accent: "#4DFFB2",
          surface: "#0D1316",
        },
        editAccent: "#FF8A3D",
        fontFamily: '"Arial Black", Arial, sans-serif',
        uppercase: true,
      },
      {
        id: "promocao-b",
        layout: "editorial",
        handle: "seu.estudio",
        kicker: "Convite",
        headline: "Inauguração é convite, não desconto.",
        sub: "As primeiras 10 agendas levam bônus.",
        palette: {
          bg: "#0C0B0D",
          text: "#F3EEE8",
          accent: "#C58A92",
          surface: "#19161A",
        },
        editAccent: "#4DFFB2",
        fontFamily: 'Georgia, "Times New Roman", serif',
      },
      {
        id: "promocao-c",
        layout: "poster",
        handle: "seu.estudio",
        kicker: "Agenda aberta",
        headline: "Estúdio novo. Agenda aberta.",
        sub: "Fechou essa semana? 20% é seu.",
        palette: {
          bg: "#07131A",
          text: "#EEF7FA",
          accent: "#19D3E6",
          surface: "#10212A",
        },
        editAccent: "#C9A96A",
        fontFamily: '"Segoe UI", "Helvetica Neue", sans-serif',
        uppercase: true,
      },
    ],
  },
];
