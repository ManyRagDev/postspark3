import {
  ensureDistinctFamilies,
  resolveLegibleTextColor,
  OFFICIAL_FAMILIES_META,
  type AspectRatioType,
  type CanvasPostModel,
} from "@/pages/CanvasLab/components/types";

/**
 * Mapeamento e fallbacks do fluxo Studio (create → gallery → editor).
 *
 * Extraído de `StudioAppPage.tsx` sem alteração de comportamento, para ser
 * compartilhado entre a página atual e a rota experimental `/studio-v2`.
 * Qualquer mudança aqui afeta as duas páginas simultaneamente.
 */

export function variationToCanvasModel(v: any, index: number, originalPrompt: string): CanvasPostModel {
  const famMeta = (v.familyId && OFFICIAL_FAMILIES_META[v.familyId as keyof typeof OFFICIAL_FAMILIES_META]) || OFFICIAL_FAMILIES_META["editorial-poster"];
  const familyId = famMeta.id;
  const familyName = famMeta.name;
  const defaultFont = famMeta.defaultFont;
  const pal = famMeta.defaultPalette;

  const bg = v.backgroundColor || pal.background;
  const accent = v.accentColor || pal.accent;
  // CR-CONTRAST: Garantia matemática de legibilidade WCAG
  const text = resolveLegibleTextColor(bg, v.textColor);

  const headline = v.headline || "Título do Post";
  const subtext = v.body || v.subtext || "Conteúdo explicativo e direto.";
  const caption = v.caption || "";
  const imagePrompt = v.imagePrompt || `${originalPrompt}, professional photography, high resolution, minimalist editorial aesthetic`;

  let slides: any[] = [];
  if (v.slides && Array.isArray(v.slides) && v.slides.length > 0) {
    slides = v.slides.map((s: any, sIdx: number) => ({
      id: `s-${sIdx + 1}`,
      step: `SLIDE 0${sIdx + 1} // ${sIdx === 0 ? "O GANCHO" : sIdx === v.slides.length - 1 ? "O CHAMADO" : "CONTEÚDO"}`,
      headline: s.headline || headline,
      subtext: s.body || s.subtext || subtext,
      imagePrompt,
    }));
  } else {
    slides = [
      {
        id: "s-1",
        step: "SLIDE 01 // CAPA",
        headline,
        subtext,
        imagePrompt,
      },
    ];
  }

  return {
    id: `gen-${Date.now()}-${index}`,
    familyId,
    familyName,
    aspectRatio: (v.aspectRatio as AspectRatioType) || "1:1",
    headlineAlign: "left",
    bodyAlign: "left",
    badgeText: v.copyAngle?.badge || `${familyName.toUpperCase()} // 0${index + 1}`,
    headline,
    subtext,
    caption,
    imagePrompt,
    fontFamily: defaultFont,
    overlayOpacity: 0.55,
    logoPosition: "top-right",
    isSnapEnabled: true,
    palette: {
      background: bg,
      text,
      accent,
      surface: pal.surface,
    },
    slides,
    currentSlideIndex: 0,
  };
}

/**
 * Instrução de "direção de gosto" injetada no `content` do `post.generate`
 * (apenas para input de texto). Não altera schema nem o motor: viaja como
 * texto livre dentro do prompt, alinhada à gramática do orquestrador.
 */
export function buildTasteInstruction(familyId: string): string {
  return `\n\n[INSTRUÇÃO DE DIREÇÃO DE ARTE — OBRIGATÓRIA]\nO usuário declarou preferência visual pela família "${familyId}".\nUse essa família em EXATAMENTE UMA das 3 variações. As outras duas variações devem usar famílias diferentes entre si e diferentes da família preferida, conforme a regra de diversidade obrigatória.`;
}

/**
 * Fallback rico com 3 ângulos de copy genuinamente diferentes (geração inicial).
 * Quando `declaredFamilyId` é informado, a primeira variação é remapeada para
 * a família declarada — o fallback também honra o gosto do usuário.
 */
export function buildInitialFallbackVariations(promptText: string, declaredFamilyId?: string): CanvasPostModel[] {
  const variations: CanvasPostModel[] = [
    {
      id: "var-1",
      familyId: "editorial-poster",
      familyName: "Editorial de Luxo",
      aspectRatio: "1:1",
      headlineAlign: "left",
      bodyAlign: "left",
      badgeText: "EDITORIAL // CAPA",
      headline: promptText,
      subtext: "A percepção de autoridade nasce quando cada detalhe visual e palavra parecem deliberados.",
      caption: `${promptText}\n\nMarcas de alto padrão constroem consistência estética e autoridade.\n\n#Branding #DesignEstrategico #Marketing`,
      imagePrompt: `editorial dark luxury texture, elegant gold reflections, minimal upscale workspace for ${promptText}`,
      fontFamily: "Playfair Display",
      overlayOpacity: 0.55,
      logoPosition: "top-right",
      isSnapEnabled: true,
      palette: { background: "#120D0A", text: "#F8F4EE", accent: "#E5A93C" },
      currentSlideIndex: 0,
      slides: [
        { id: "s1", step: "SLIDE 01 // CAPA", headline: promptText, subtext: "A percepção de autoridade nasce quando cada detalhe parece deliberado." },
        { id: "s2", step: "SLIDE 02 // O ERRO", headline: "O erro comum é não ter clareza de posicionamento.", subtext: "Quem fala com todo mundo não cria conexão com ninguém." },
        { id: "s3", step: "SLIDE 03 // A SOLUÇÃO", headline: "Defina seu padrão visual e mantenha a consistência.", subtext: "A estética refinada é um multiplicador de valor percebido." },
      ],
    },
    {
      id: "var-2",
      familyId: "glass-veil",
      familyName: "Glass Veil (Vidro)",
      aspectRatio: "1:1",
      headlineAlign: "center",
      bodyAlign: "center",
      badgeText: "INSIGHT // TECH",
      headline: `Por que ${promptText.toLowerCase().replace(/^(3|4|5|como|o)\s*/i, "")} muda seu jogo?`,
      subtext: "Estruturas modernas e clareza de mensagem para posicionar sua marca no topo.",
      caption: `${promptText}\n\nInovação e autoridade visual.\n\n#Inovacao #Tecnologia #Design`,
      imagePrompt: `modern glass architecture, frosted glass texture, ambient soft violet lighting for ${promptText}`,
      fontFamily: "Plus Jakarta Sans",
      overlayOpacity: 0.6,
      logoPosition: "top-right",
      isSnapEnabled: true,
      palette: { background: "#090D18", text: "#FFFFFF", accent: "#8B5CF6" },
      currentSlideIndex: 0,
      slides: [
        { id: "s1", step: "SLIDE 01 // CAPA", headline: promptText, subtext: "Estruturas modernas para posicionar sua marca." },
        { id: "s2", step: "SLIDE 02 // VISÃO", headline: "O design comunica antes de qualquer palavra.", subtext: "A primeira impressão dita o valor da sua oferta." },
      ],
    },
    {
      id: "var-3",
      familyId: "chromatic-block",
      familyName: "Minimalismo Brutal",
      aspectRatio: "1:1",
      headlineAlign: "center",
      bodyAlign: "center",
      badgeText: "DESTAQUE // DIRETO",
      headline: promptText.toUpperCase(),
      subtext: "Impacto visual imediato sem rodeios. A mensagem clara que corta o ruído do feed.",
      caption: `${promptText}\n\nCorte o ruído e posicione sua mensagem com força.\n\n#Posicionamento #Impacto`,
      imagePrompt: `abstract brutalist architectural concrete, bold minimal geometry for ${promptText}`,
      fontFamily: "Anton",
      overlayOpacity: 0,
      logoPosition: "top-right",
      isSnapEnabled: true,
      palette: { background: "#D92E1E", text: "#FFFFFF", accent: "#FFD600" },
      currentSlideIndex: 0,
      slides: [
        { id: "s1", step: "SLIDE 01 // IMPACTO", headline: promptText.toUpperCase(), subtext: "Impacto visual imediato sem rodeios." },
        { id: "s2", step: "SLIDE 02 // O PONTO", headline: "SEJA CLARO E DIRETO.", subtext: "Menos elementos, mais força de comunicação." },
      ],
    },
  ];

  if (declaredFamilyId) {
    const meta = OFFICIAL_FAMILIES_META[declaredFamilyId as keyof typeof OFFICIAL_FAMILIES_META];
    if (meta) {
      variations[0] = {
        ...variations[0],
        familyId: meta.id,
        familyName: meta.name,
        badgeText: `${meta.name.toUpperCase()} // 01`,
        fontFamily: meta.defaultFont,
        palette: {
          background: meta.defaultPalette.background,
          text: meta.defaultPalette.text,
          accent: meta.defaultPalette.accent,
          surface: meta.defaultPalette.surface,
        },
      };
    }
  }

  return variations;
}

/** Fallback inteligente com 3 famílias complementares e 3 novos ganchos ("Gerar mais"). */
export function buildExtraFallbackVariations(lastPrompt: string): CanvasPostModel[] {
  return [
    {
      id: `var-${Date.now()}-1`,
      familyId: "brutal-split",
      familyName: "Brutal Split",
      aspectRatio: "1:1",
      headlineAlign: "left",
      bodyAlign: "left",
      badgeText: "CORTE // DIRETO",
      headline: `O que ninguém te conta sobre ${lastPrompt.toLowerCase().replace(/^(3|4|5|como|o)\s*/i, "")}`,
      subtext: "Divisão de contraste absoluto para parar o scroll e fixar sua mensagem.",
      caption: `${lastPrompt}\n\nComunicação direta e alto contraste.\n\n#Branding #Design`,
      imagePrompt: `dark split editorial texture, sharp geometric lines, dramatic high contrast background`,
      fontFamily: "Archivo Black",
      overlayOpacity: 0,
      logoPosition: "top-right",
      isSnapEnabled: true,
      palette: { background: "#0C0C0D", text: "#FFFFFF", accent: "#FF4D00" },
      currentSlideIndex: 0,
      slides: [{ id: "s1", step: "SLIDE 01", headline: `O que ninguém te conta sobre ${lastPrompt.toLowerCase()}`, subtext: "Divisão de contraste absoluto." }],
    },
    {
      id: `var-${Date.now()}-2`,
      familyId: "cyber-glitch",
      familyName: "Cyber & Tech",
      aspectRatio: "1:1",
      headlineAlign: "left",
      bodyAlign: "left",
      badgeText: "SYSTEM // TECH",
      headline: `[DIAGNÓSTICO] A falha invisível em ${lastPrompt.toLowerCase().replace(/^(3|4|5|como|o)\s*/i, "")}`,
      subtext: "Estética monospaced e precisão técnica para marcas do futuro.",
      caption: `${lastPrompt}\n\nDesign futurista e precisão técnica.\n\n#Tech #Inovacao`,
      imagePrompt: `cyberpunk grid lines, circuit texture, dark cyan neon backdrop, modern tech aesthetic`,
      fontFamily: "Space Mono",
      overlayOpacity: 0,
      logoPosition: "top-right",
      isSnapEnabled: true,
      palette: { background: "#040812", text: "#E0F7FA", accent: "#00F0FF" },
      currentSlideIndex: 0,
      slides: [{ id: "s1", step: "SLIDE 01", headline: `[DIAGNÓSTICO] A falha invisível em ${lastPrompt.toLowerCase()}`, subtext: "Estética monospaced e precisão técnica." }],
    },
    {
      id: `var-${Date.now()}-3`,
      familyId: "duotone-wash",
      familyName: "Duotone Wash",
      aspectRatio: "1:1",
      headlineAlign: "center",
      bodyAlign: "center",
      badgeText: "ESTILO // LUXO",
      headline: `O novo padrão visual para quem busca autoridade real`,
      subtext: "Gradientes sofisticados e harmonia tonal para elevar o valor percebido da sua oferta.",
      caption: `${lastPrompt}\n\nHarmonia de cores e elegância.\n\n#Estilo #Design`,
      imagePrompt: `smooth magenta and violet duotone wash, luxury silk gradient, soft elegant background`,
      fontFamily: "Inter",
      overlayOpacity: 0,
      logoPosition: "top-right",
      isSnapEnabled: true,
      palette: { background: "#2A0845", text: "#FFFFFF", accent: "#FF3366" },
      currentSlideIndex: 0,
      slides: [{ id: "s1", step: "SLIDE 01", headline: "O novo padrão visual para quem busca autoridade real", subtext: "Gradientes sofisticados e harmonia tonal." }],
    },
  ];
}

export { ensureDistinctFamilies };
