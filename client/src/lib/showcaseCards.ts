export type ShowcaseCard = {
  id: number;
  slug: string;
  category: string;
  title: string;
  description: string;
  headline: string;
  subtext: string;
  layoutType: "full-image" | "split" | "minimal" | "editorial" | "grid" | "conversion";
  visualMood:
    | "luxury-dark"
    | "tech-cyan"
    | "gold-black"
    | "clean-editorial"
    | "conversion-bold"
    | "cinematic";
  backgroundKind: "photo" | "pattern" | "mesh" | "glass" | "solid" | "editorial";
  backgroundImageUrl?: string;
  fontFamily: string;
  titleCase?: "upper" | "normal";
  palette: {
    background: string;
    text: string;
    accent: string;
    surface?: string;
  };
  imageType: string;
  imagePrompt: string;
  artDirection: string;
};

export const showcaseCards: ShowcaseCard[] = [
  {
    id: 1,
    slug: "lifestyle-aspiracional",
    category: "Lifestyle",
    title: "Luxo",
    description: "Desejo, controle e percepcao premium.",
    headline: "Luxo visual nao e excesso. E controle.",
    subtext: "A percepcao de valor nasce quando cada elemento parece deliberado.",
    layoutType: "full-image",
    visualMood: "luxury-dark",
    backgroundKind: "photo",
    backgroundImageUrl:
      "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80",
    fontFamily: 'Georgia, "Times New Roman", serif',
    palette: {
      background: "#1A1410",
      text: "#F6F0E8",
      accent: "#D4AF37",
      surface: "#2B211A",
    },
    imageType: "mesa premium com cafe e notebook",
    imagePrompt:
      "luxury workspace, premium coffee cup, elegant desk, warm natural light, cinematic shadows, refined lifestyle, dark brown and gold tones, high-end editorial photography, ultra realistic",
    artDirection:
      "Imagem full bleed com overlay escuro quente, headline grande na base, tipografia elegante e bastante respiro.",
  },
  {
    id: 2,
    slug: "educacional-sofisticado",
    category: "Educacional",
    title: "Diagnostico",
    description: "Framework visual com leitura imediata.",
    headline: "3 sinais de que sua marca ainda parece barata",
    subtext: "Uma peca didatica com estetica premium e leitura imediata.",
    layoutType: "grid",
    visualMood: "gold-black",
    backgroundKind: "pattern",
    fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
    titleCase: "upper",
    palette: {
      background: "#0E0D0B",
      text: "#F4F1EA",
      accent: "#C9A96A",
      surface: "#1A1713",
    },
    imageType: "textura premium abstrata",
    imagePrompt:
      "luxury abstract texture, subtle paper grain, dark editorial background, refined premium composition, minimal golden highlights, elegant design atmosphere",
    artDirection:
      "Estrutura em grid com bloco principal de headline e 3 mini-cards ou topicos internos discretos.",
  },
  {
    id: 3,
    slug: "lancamento-high-ticket",
    category: "Lancamento",
    title: "Lancamento",
    description: "Evento premium com tensao e presenca.",
    headline: "As vagas abriram. O mercado percebeu.",
    subtext: "Uma abertura de turma com presenca, tensao e sensacao de evento premium.",
    layoutType: "split",
    visualMood: "tech-cyan",
    backgroundKind: "photo",
    backgroundImageUrl:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
    fontFamily: '"Arial Black", "Arial", sans-serif',
    titleCase: "upper",
    palette: {
      background: "#05070B",
      text: "#F5FAFF",
      accent: "#00E5FF",
      surface: "#0B1118",
    },
    imageType: "mulher premium em ambiente elegante",
    imagePrompt:
      "premium female entrepreneur, luxury event atmosphere, elegant studio lighting, black and cyan aesthetic, high-ticket business photography, sophisticated and powerful mood",
    artDirection:
      "Tela dividida com imagem em uma metade e bloco tipografico forte na outra, acento ciano e sensacao de lancamento.",
  },
  {
    id: 4,
    slug: "opiniao-forte",
    category: "Engajamento",
    title: "Opiniao",
    description: "Friccao e contraste para capturar atencao.",
    headline: "Conteúdo pensado só na estética não vende sempre.",
    subtext:
      "Nem toda estetica comunica intencao. Algumas so decoram a irrelevancia.",
    layoutType: "minimal",
    visualMood: "clean-editorial",
    backgroundKind: "solid",
    fontFamily: '"Arial Black", "Helvetica Neue", sans-serif',
    titleCase: "upper",
    palette: {
      background: "#F3EEE6",
      text: "#121212",
      accent: "#7E1F1F",
      surface: "#E8DED3",
    },
    imageType: "sem imagem relevante",
    imagePrompt:
      "minimal editorial background, subtle paper texture, clean off-white design surface, brutalist sophistication, no distracting imagery",
    artDirection:
      "Tipografia protagonista, contraste alto, composicao minimalista com uma barra ou detalhe vermelho profundo.",
  },
  {
    id: 5,
    slug: "autoridade-premium",
    category: "Autoridade",
    title: "Decisao",
    description: "Percepcao high-ticket para experts raros.",
    headline: "Quem cobra caro, nao vende tempo. Vende decisao.",
    subtext:
      "Posicionamento visual para experts que precisam parecer raros antes de parecer acessiveis.",
    layoutType: "editorial",
    visualMood: "luxury-dark",
    backgroundKind: "photo",
    backgroundImageUrl:
      "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=900&q=80",
    fontFamily: 'Georgia, "Times New Roman", serif',
    palette: {
      background: "#0B0B0C",
      text: "#F3F0EA",
      accent: "#B78D4A",
      surface: "#171517",
    },
    imageType: "retrato editorial sofisticado",
    imagePrompt:
      "editorial portrait of high-end consultant, luxury dark background, dramatic side lighting, serious confident expression, premium business aesthetic, elegant fashion magazine style",
    artDirection:
      "Retrato forte com headline serifada e estrutura editorial, clima denso, espaco negativo generoso.",
  },
  {
    id: 6,
    slug: "produto-digital-high-end",
    category: "Produto Digital",
    title: "Produto",
    description: "Produto digital com percepcao premium.",
    headline: "Seu conhecimento merece embalagem de elite.",
    subtext:
      "Um infoproduto valioso precisa parecer valioso antes mesmo do primeiro clique.",
    layoutType: "split",
    visualMood: "cinematic",
    backgroundKind: "glass",
    fontFamily: '"Segoe UI", "Helvetica Neue", sans-serif',
    palette: {
      background: "#090B12",
      text: "#F8F9FC",
      accent: "#8C6BFF",
      surface: "#121726",
    },
    imageType: "device mockup premium",
    imagePrompt:
      "premium digital product mockup, elegant smartphone and laptop screens, dark luxury setup, subtle purple glow, high-end educational product advertising, ultra polished",
    artDirection:
      "Imagem do produto em destaque com bloco de texto contido e molduras refinadas.",
  },
  {
    id: 7,
    slug: "b2b-premium",
    category: "B2B",
    title: "B2B",
    description: "LinkedIn sofisticado sem parecer frio.",
    headline: "O post corporativo nao precisa parecer corporativo.",
    subtext:
      "Comunicacao profissional com sofisticacao de marca e leitura executiva.",
    layoutType: "split",
    visualMood: "tech-cyan",
    backgroundKind: "photo",
    backgroundImageUrl:
      "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=900&q=80",
    fontFamily: '"Segoe UI", "Helvetica Neue", sans-serif',
    titleCase: "upper",
    palette: {
      background: "#07131A",
      text: "#EEF7FA",
      accent: "#19D3E6",
      surface: "#10212A",
    },
    imageType: "executivo moderno em escritorio premium",
    imagePrompt:
      "modern executive, premium office, elegant dashboard screens, corporate luxury, cyan highlights, clean professional photography, linkedin premium aesthetic",
    artDirection:
      "Split limpo, imagem corporativa elegante, muito alinhamento e sensacao executiva contemporanea.",
  },
  {
    id: 8,
    slug: "storytelling-de-virada",
    category: "Storytelling",
    title: "Virada",
    description: "Narrativa pessoal com peso de marca.",
    headline: "Eu parei de parecer acessivel. E comecei a parecer necessario.",
    subtext:
      "Narrativa de reposicionamento para marcas pessoais que querem mudar de patamar.",
    layoutType: "editorial",
    visualMood: "cinematic",
    backgroundKind: "editorial",
    backgroundImageUrl:
      "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80",
    fontFamily: '"Times New Roman", Georgia, serif',
    palette: {
      background: "#160F12",
      text: "#F5EDE5",
      accent: "#A97A52",
      surface: "#241A1E",
    },
    imageType: "retrato cinematografico",
    imagePrompt:
      "cinematic portrait, luxury storytelling mood, deep shadows, editorial color grading, premium personal brand aesthetic, intimate and powerful composition",
    artDirection:
      "Composicao vertical, retrato dominante, headline quebrada em linhas longas e elegantes.",
  },
  {
    id: 9,
    slug: "conversao-direta",
    category: "Vendas",
    title: "Conversao",
    description: "Comercial, forte e orientado a intencao.",
    headline: "Seu visual comunica valor ou desconto?",
    subtext:
      "Design comercial para transformar atencao em intencao de compra.",
    layoutType: "full-image",
    visualMood: "conversion-bold",
    backgroundKind: "photo",
    backgroundImageUrl:
      "https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&w=900&q=80",
    fontFamily: '"Arial Black", "Arial", sans-serif',
    titleCase: "upper",
    palette: {
      background: "#0B0A09",
      text: "#FFFFFF",
      accent: "#FF8A3D",
      surface: "#1A1715",
    },
    imageType: "arquitetura premium moderna",
    imagePrompt:
      "modern luxury architecture, premium interior, dramatic perspective, dark upscale environment, commercial sophistication, warm orange highlights, ultra realistic",
    artDirection:
      "Imagem full bleed com overlay escuro, contraste forte, CTA implicito e headline curta.",
  },
  {
    id: 10,
    slug: "quebra-de-objecao",
    category: "Objecao",
    title: "Objecao",
    description: "Tensao clara e linguagem afiada.",
    headline: "Nao e falta de conteudo. E falta de direcao.",
    subtext:
      "Quando a mensagem nao organiza a percepcao, o mercado interpreta como amadorismo.",
    layoutType: "conversion",
    visualMood: "gold-black",
    backgroundKind: "mesh",
    fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
    titleCase: "upper",
    palette: {
      background: "#101012",
      text: "#F4F4F2",
      accent: "#D4A24C",
      surface: "#1A1A1F",
    },
    imageType: "gradiente dramatico abstrato",
    imagePrompt:
      "dramatic abstract gradient, dark charcoal background, premium golden light streaks, intense but elegant business mood, minimalist luxury design backdrop",
    artDirection:
      "Peca textual com barra de acento forte e uma composicao mais tensa, direta, quase manifesto.",
  },
  {
    id: 11,
    slug: "escala-e-performance",
    category: "Performance",
    title: "Escala",
    description: "Energia alta, leitura rapida, intencao comercial.",
    headline: "Design que performa antes mesmo do clique.",
    subtext:
      "A peca certa reduz atrito, organiza atencao e aumenta intencao comercial.",
    layoutType: "conversion",
    visualMood: "conversion-bold",
    backgroundKind: "mesh",
    fontFamily: '"Arial Black", "Arial", sans-serif',
    titleCase: "upper",
    palette: {
      background: "#020406",
      text: "#F5FFFF",
      accent: "#4DFFB2",
      surface: "#0D1316",
    },
    imageType: "cidade noturna, dados e motion",
    imagePrompt:
      "high-performance marketing visual, futuristic city lights, data overlays, speed and scale feeling, dark premium tech aesthetic, green accent glow, commercial impact",
    artDirection:
      "Visual mais energetico, contraste alto, elementos diagonais ou sensacao de movimento.",
  },
  {
    id: 12,
    slug: "marca-pessoal-magnetica",
    category: "Marca Pessoal",
    title: "Presenca",
    description: "Confianca, desejo e autoridade antes da oferta.",
    headline: "Presenca se constroi antes da oferta.",
    subtext:
      "Antes de vender, sua imagem precisa sustentar confianca, desejo e autoridade.",
    layoutType: "editorial",
    visualMood: "luxury-dark",
    backgroundKind: "photo",
    backgroundImageUrl:
      "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=900&q=80",
    fontFamily: 'Georgia, "Times New Roman", serif',
    palette: {
      background: "#0C0B0D",
      text: "#F3EEE8",
      accent: "#C58A92",
      surface: "#19161A",
    },
    imageType: "retrato editorial premium",
    imagePrompt:
      "premium editorial portrait, magnetic personal brand, elegant black background, subtle rose accent lighting, fashion magazine style, luxurious and modern",
    artDirection:
      "Retrato dominante com texto assimetrico e elegancia de marca pessoal premium.",
  },
];
