import { createPost } from "../server/db";
import { OFFICIAL_FAMILIES_META, type CanvasPostModel, type CarouselSlideItem } from "../client/src/pages/CanvasLab/components/types";
import { applyContrastGuard } from "../client/src/pages/CanvasLab/lib/contrast";
import { normalizeCanvasModel } from "../client/src/pages/CanvasLab/lib/saveAdapter";

const USER_UUID = "25c1b164-6829-4b88-9f34-052ea8f7b13a"; // Emanuel Junior

interface PostDefinition {
  title: string;
  day: string;
  pilar: string;
  familyId: keyof typeof OFFICIAL_FAMILIES_META;
  aspectRatio: "1:1" | "5:6" | "9:16";
  palette: { background: string; accent: string; text: string };
  headlineEffect?: "none" | "shadow" | "outline" | "box-card" | "box-pill" | "box-glass" | "box-accent" | "box-brutal" | "scrim" | "strip-line";
  subtextEffect?: "none" | "shadow" | "outline" | "box-card" | "box-pill" | "box-glass" | "box-accent" | "box-brutal" | "scrim" | "strip-line";
  headline: string;
  subtext: string;
  caption: string;
  hashtags: string[];
  imagePrompt: string;
  slides?: CarouselSlideItem[];
}

const WEEK1_POSTS: PostDefinition[] = [
  // ─── Post 01: Segunda-feira ───────────────────────────────────────────────
  {
    day: "Segunda-feira",
    title: "O Despertar do Padrão",
    pilar: "Diagnóstico do Sintoma Oculto",
    familyId: "brutal-split",
    aspectRatio: "5:6",
    palette: {
      background: "#08080A",
      accent: "#E11D48",
      text: "#FFFFFF",
    },
    headlineEffect: "box-brutal",
    headline: "Seu conteúdo parece de graça porque seu design é genérico",
    subtext: "Não é o algoritmo que ignora o seu perfil. É a ausência de direção de arte que faz o leitor rolar a tela antes de terminar a primeira frase.",
    caption: `Em 2026, quem tem conteúdo bom, mas apresentação amadora, é invisível.\n\nVocê passa dias pesquisando uma tese, destila um conhecimento valioso, mas empacota tudo num modelo batido do Canva com texto cinza sobre fundo branco sem contraste.\n\nO resultado? O cérebro do seguidor classifica sua postagem como ruído antes mesmo de ler o título.\n\nTrês sintomas de que seu design está custando clientes:\n1. A paleta do post não comunica a régua de preço do seu serviço.\n2. A tipografia não tem peso nem hierarquia visual definida.\n3. Cada post parece feito por uma pessoa diferente no improviso.\n\nDesign não é enfeite cosmético; é o filtro de autoridade que define o valor percebido do seu trabalho.\n\nQual padrão o seu perfil tem comunicado hoje? Salve este post para rever o alinhamento visual da sua marca.`,
    hashtags: ["direcaodearte", "postspark", "brandingdigital", "designgrafico"],
    imagePrompt: "brutalist concrete background, split studio lighting, red accent geometric shadow, high contrast editorial aesthetic",
  },

  // ─── Post 02: Terça-feira ─────────────────────────────────────────────────
  {
    day: "Terça-feira",
    title: "Contraintuição Técnica",
    pilar: "Causa-Efeito Contraintuitiva",
    familyId: "editorial-poster",
    aspectRatio: "1:1",
    palette: {
      background: "#0B0F19",
      accent: "#F59E0B",
      text: "#F8FAFC",
    },
    headlineEffect: "box-glass",
    headline: "Consistência sem densidade é apenas ruído diário",
    subtext: "Postar todo dia sem direção estética não constrói comunidade. Constrói fadiga. O mercado respeita quem publica com presença de estúdio.",
    caption: `A pior mentira que contaram aos criadores de conteúdo foi: "apenas poste todo dia que o resultado vem".\n\nEssa regra funcionava em 2020. Em 2026, com o feed entupido de posts pasteurizados de IA, quem publica sem densidade visual é imediatamente ignorado.\n\nAutoridade não é medida pelo volume de publicações no calendário, mas pelo peso que cada card causa quando para na tela de alguém.\n\nQuando você troca 7 posts medíocres por 3 peças editoriais com tipografia monumental, contraste impecável e textura real, o público entende na hora que está lidando com um profissional.\n\nVocê prefere ser lembrado pela quantidade ou pelo padrão do que publica?\n\nConheça o estúdio PostSpark pelo link da bio e sinta a diferença de criar com acabamento de agência.`,
    hashtags: ["designeditorial", "postspark", "posicionamento", "criadoresdeconteudo"],
    imagePrompt: "dark luxury black marble texture, golden subtle reflections, moody studio lighting, 8k editorial photography",
  },

  // ─── Post 03: Quarta-feira ────────────────────────────────────────────────
  {
    day: "Quarta-feira",
    title: "Demonstração de Superpoder",
    pilar: "Engenharia & Brand DNA",
    familyId: "cyber-glitch",
    aspectRatio: "5:6",
    palette: {
      background: "#050505",
      accent: "#10B981",
      text: "#E2E8F0",
    },
    headlineEffect: "box-pill",
    headline: "Do seu site para a prancheta em 3 segundos",
    subtext: "Basta colar a URL da sua landing page. O motor do PostSpark extrai o Brand DNA, as cores dominantes, a tipografia e gera 3 direções de arte prontas.",
    caption: `Quantas horas você ou o seu designer gastam toda semana só para recriar as cores, fontes e estilo da marca do zero antes de escrever a primeira linha?\n\nNo PostSpark, nós eliminamos essa barreira.\n\nCom a tecnologia de Brand DNA:\n• O motor faz a leitura semântica do seu site ou portfólio.\n• Mapeia a paleta exata e as fontes oficiais.\n• Audita o contraste mínimo WCAG (4.5:1) automaticamente para nenhuma letra sumir no fundo.\n• Entrega 3 variações estéticas completas na prancheta Konva 2D prontas para exportar em 4K.\n\nSem formulários de prompt infinitos. Sem comandos complicados de IA.\n\nAbra o PostSpark agora no link da bio e teste colar o link do seu projeto. Veja a mágica acontecer em 3 segundos.`,
    hashtags: ["branddna", "postspark", "designinteligente", "automacaocriativa"],
    imagePrompt: "dark futuristic carbon fiber texture, neon green tactical wireframe lines, subtle high tech grid, sleek minimalist aesthetic",
  },

  // ─── Post 04: Quinta-feira (Carrossel 5 Slides) ───────────────────────────
  {
    day: "Quinta-feira",
    title: "Anatomia do Post Campeão",
    pilar: "Tutorial / Retenção",
    familyId: "mosaic-grid",
    aspectRatio: "5:6",
    palette: {
      background: "#18181B",
      accent: "#8B5CF6",
      text: "#FFFFFF",
    },
    headlineEffect: "strip-line",
    headline: "A anatomia de um post que vende sem parecer anúncio",
    subtext: "Desconstruímos a estrutura de cards de alta conversão para redes sociais em 2026. Arraste para o lado.",
    caption: `Fazer posts que convertem não é questão de sorte de algoritmo; é matemática de retenção visual.\n\nSalvamos a arquitetura completa neste carrossel para você auditar a sua próxima publicação antes de postar.\n\nQual desses 3 erros você mais tem visto nos perfis que acompanha? Salve este carrossel para consultar na sua próxima criação.`,
    hashtags: ["carrosselinstagram", "designgrafico", "postspark", "copywriting"],
    imagePrompt: "dark fine linen fabric texture, modern editorial studio lighting, violet ambient light",
    slides: [
      {
        id: "s-1",
        step: "01 // O GANCHO",
        headline: "A anatomia de um post que vende sem parecer anúncio",
        subtext: "Desconstruímos a estrutura de cards de alta conversão para redes sociais em 2026. Arraste para o lado.",
      },
      {
        id: "s-2",
        step: "02 // CONTRASTE",
        headline: "Regra 1: O choque de primeiro segundo",
        subtext: "Se o seu título colide com a cor do fundo, a batalha acabou. O contraste precisa ser superior a 4.5:1 para leitura imediata em telas OLED.",
      },
      {
        id: "s-3",
        step: "03 // HIERARQUIA",
        headline: "Regra 2: Menos palavras, mais peso",
        subtext: "Limite o título a 65 caracteres e o corpo a 200. Se precisar explicar mais, o lugar correto é a legenda, nunca uma parede de texto no card.",
      },
      {
        id: "s-4",
        step: "04 // ACABAMENTO",
        headline: "Regra 3: Textura nobre mata o aspecto digital frio",
        subtext: "Fundos planos geram tédio. Texturas de linho, concreto ou metal transmitem a sensação tátil de revista física direto no feed.",
      },
      {
        id: "s-5",
        step: "05 // AÇÃO",
        headline: "Seu conteúdo pronto para estúdio",
        subtext: "Todos esses parâmetros já vêm calibrados de fábrica no motor do PostSpark. Crie seu primeiro post gratuito hoje.",
      },
    ],
  },

  // ─── Post 05: Sexta-feira ─────────────────────────────────────────────────
  {
    day: "Sexta-feira",
    title: "O Manifesto da Nova Era",
    pilar: "Comunidade & Filosofia",
    familyId: "minimal-air",
    aspectRatio: "1:1",
    palette: {
      background: "#FAFAFA",
      accent: "#18181B",
      text: "#09090B",
    },
    headlineEffect: "none",
    headline: "Você é um diretor de arte, não um digitador de prompt",
    subtext: "A IA não substitui o seu critério de bom gosto. Ela apenas remove a lentidão técnica entre a sua ideia e a prancheta final.",
    caption: `A inteligência artificial não veio para transformar todo mundo em robô repetidor de clichês.\n\nEla existe para devolver aos fundadores, estrategistas e criadores o poder de materializar o seu padrão de qualidade em segundos.\n\nCriar com o PostSpark não é apertar um botão e aceitar qualquer arte genérica. É ter uma prancheta vetorial 2D nas mãos, selecionar uma família visual que expressa sua identidade e ditar as regras do seu mercado.\n\nNós construímos o PostSpark para quem se recusa a ser medíocre no feed.\n\nBem-vindo à nova era da criação de conteúdo. Teste o estúdio pelo link na nossa bio.`,
    hashtags: ["manifesto", "postspark", "criatividadedigital", "designautoral"],
    imagePrompt: "soft off-white handmade cotton paper texture, subtle natural sunlight from window, clean minimalist architecture",
  },

  // ─── Post 06: Sábado ──────────────────────────────────────────────────────
  {
    day: "Sábado",
    title: "Ficha Técnica & Bastidores",
    pilar: "Conversão Direta Pro",
    familyId: "versus",
    aspectRatio: "5:6",
    palette: {
      background: "#0F172A",
      accent: "#38BDF8",
      text: "#F8FAFC",
    },
    headlineEffect: "box-card",
    headline: "40 minutos no Canva ou 4 segundos no PostSpark?",
    subtext: "Ajustar caixas de texto e caçar contraste na mão é passado. O PostSpark automatiza a direção de arte e entrega exportação nativa em 4K.",
    caption: `Quanto vale a sua hora de trabalho?\n\nSe você gasta 3 a 5 horas por semana apenas arrastando caixas de texto no Canva, procurando banco de imagens e tentando adivinhar se a fonte combina, você está perdendo tempo estratégico do seu negócio.\n\nNo PostSpark Pro:\n• Geração de variações completas em 2 a 4 segundos.\n• 14 Direções de Arte Oficiais calibradas por designers.\n• Exportação de carrosséis inteiros em pacote ZIP em resolução 4K Ultra-HD.\n• Edição com duplo-clique na prancheta interativa.\n\nPare de brigar com ferramentas manuais. Eleve o padrão da sua marca hoje mesmo. Assine o plano Pro pelo link da bio.`,
    hashtags: ["produtividade", "postspark", "marketingdigital", "socialmedia"],
    imagePrompt: "brushed slate blue metallic surface, cool industrial reflections, precision engineered aesthetic",
  },
];

async function seed() {
  console.log(`🚀 Iniciando criação dos 6 posts da Semana 1 para o usuário ${USER_UUID}...\n`);

  for (let i = 0; i < WEEK1_POSTS.length; i++) {
    const p = WEEK1_POSTS[i];
    const famMeta = OFFICIAL_FAMILIES_META[p.familyId];

    const slides: CarouselSlideItem[] = p.slides && p.slides.length > 0
      ? p.slides
      : [
          {
            id: "s-1",
            step: "SLIDE 01 // CAPA",
            headline: p.headline,
            subtext: p.subtext,
          },
        ];

    const rawModel: CanvasPostModel = {
      id: `week1-post-${i + 1}-${Date.now()}`,
      familyId: p.familyId,
      familyName: famMeta.name,
      aspectRatio: p.aspectRatio,
      headlineAlign: "left",
      bodyAlign: "left",
      showBadge: false,
      badgeText: `${famMeta.name.toUpperCase()} // 0${i + 1}`,
      showStep: slides.length > 1,
      headline: p.headline,
      subtext: p.subtext,
      caption: p.caption,
      imagePrompt: p.imagePrompt,
      fontFamily: famMeta.defaultFont,
      overlayOpacity: 0.55,
      logoPosition: "top-right",
      isSnapEnabled: true,
      headlineEffect: p.headlineEffect || "none",
      subtextEffect: p.subtextEffect || "none",
      palette: {
        background: p.palette.background,
        accent: p.palette.accent,
        text: p.palette.text,
        surface: famMeta.defaultPalette.surface || "#1C1D24",
      },
      slides,
      currentSlideIndex: 0,
    };

    // 1. Normalização canônica
    const normalized = normalizeCanvasModel(rawModel);

    // 2. Auditoria e proteção matemática de contraste WCAG
    const guarded = applyContrastGuard(normalized);

    // 3. Persistência direta no Supabase
    const postId = await createPost({
      userUuid: USER_UUID,
      inputType: "text",
      inputContent: `[editorial-postspark] semana-01 :: ${p.day} — ${p.title}`,
      platform: "instagram",
      headline: guarded.headline,
      body: guarded.subtext,
      caption: guarded.caption,
      hashtags: p.hashtags,
      backgroundColor: guarded.palette.background,
      textColor: guarded.palette.text,
      accentColor: guarded.palette.accent,
      layout: "centered",
      postMode: slides.length > 1 ? "carousel" : "static",
      slides: guarded.slides.map((s, idx) => ({
        headline: s.headline,
        body: s.subtext,
        slideNumber: idx + 1,
      })),
      canvasModel: guarded as unknown as Record<string, unknown>,
    });

    console.log(`✅ Post 0${i + 1} criado! ID: #${postId} | ${p.day} — "${p.headline.slice(0, 40)}..."`);
    console.log(`   🎨 Família: ${famMeta.name} (${p.familyId}) | Formato: ${p.aspectRatio} | Slides: ${slides.length}`);
    console.log(`   🔗 Link para editar/ver: http://localhost:3000/thevoid?postId=${postId}\n`);
  }

  console.log("🎉 Todos os 6 posts da Semana 1 foram inseridos com sucesso na sua galeria /saved-posts!");
}

seed().catch((err) => {
  console.error("❌ Erro ao criar posts:", err);
  process.exit(1);
});
