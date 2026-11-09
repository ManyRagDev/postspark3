import type { CanvasPostModel } from "@/pages/CanvasLab/components/types";

type ShowcaseCategory = "Tecnologia" | "Editorial" | "Comparativo" | "Arte";

export interface ShowcaseItem {
  id: string;
  code: string;
  title: string;
  category: ShowcaseCategory;
  description: string;
  suggestedPrompt: string;
  slideCount: number;
  loadModel: () => Promise<{ default: unknown }>;
}

export const SHOWCASE_ITEMS: readonly ShowcaseItem[] = [
  {
    id: "linear-bento",
    code: "CON-01",
    title: "Linear Bento",
    category: "Tecnologia",
    description: "Cartões modulares para explicar sistemas, produtos ou dados.",
    suggestedPrompt: "Explique em um post como organizar um sistema de conteúdo que cresce sem perder consistência.",
    slideCount: 1,
    loadModel: () => import("./showcaseModels/linear-bento.json"),
  },
  {
    id: "warm-editorial",
    code: "CON-02",
    title: "Warm Editorial",
    category: "Editorial",
    description: "Um ensaio em três páginas, com ritmo de revista impressa.",
    suggestedPrompt: "Crie um carrossel editorial sobre como fazer uma ideia ser lembrada em um feed cheio de informação.",
    slideCount: 3,
    loadModel: () => import("./showcaseModels/warm-editorial.json"),
  },
  {
    id: "dual-split",
    code: "CON-05",
    title: "Dual Split",
    category: "Comparativo",
    description: "Dois lados bem demarcados para comparar caminhos e resultados.",
    suggestedPrompt: "Compare o que acontece quando um post tenta dizer tudo com o que acontece quando ele foca uma única ideia.",
    slideCount: 1,
    loadModel: () => import("./showcaseModels/dual-split.json"),
  },
  {
    id: "industrial",
    code: "CON-06",
    title: "Industrial Tech-Spec",
    category: "Tecnologia",
    description: "Uma ficha técnica com a presença visual de um manifesto.",
    suggestedPrompt: "Escreva um manifesto curto para o lançamento de um produto robusto, com foco no que ele faz na prática.",
    slideCount: 1,
    loadModel: () => import("./showcaseModels/industrial.json"),
  },
  {
    id: "acid-chrome",
    code: "CON-07",
    title: "Acid Chrome Poster",
    category: "Arte",
    description: "Lettering cromado, grade neon e linguagem de cartaz de evento.",
    suggestedPrompt: "Crie um cartaz para uma noite de música eletrônica independente, com uma chamada curta e enérgica.",
    slideCount: 1,
    loadModel: () => import("./showcaseModels/acid-chrome.json"),
  },
  {
    id: "risograph",
    code: "CON-08",
    title: "Risograph Print Zine",
    category: "Arte",
    description: "Retícula, textura de papel e cores sobrepostas como em um zine.",
    suggestedPrompt: "Anuncie uma feira de publicações independentes e celebre a estética da impressão artesanal.",
    slideCount: 1,
    loadModel: () => import("./showcaseModels/risograph.json"),
  },
];

export function showcasePreviewUrl(item: ShowcaseItem, slide = 0) {
  return `/showcase/curated/${item.id}-${slide + 1}.webp`;
}

export async function openShowcaseDocument(item: ShowcaseItem): Promise<CanvasPostModel> {
  const { default: source } = await item.loadModel();
  const post = structuredClone(source) as CanvasPostModel;
  return { ...post, id: crypto.randomUUID() };
}
