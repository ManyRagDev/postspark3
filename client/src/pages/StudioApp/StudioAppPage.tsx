import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import StudioCreateView from "./components/StudioCreateView";
import OrganicBackground from "@/components/OrganicBackground";
import SparkParticles from "@/components/SparkParticles";
import SmartInput from "@/components/SmartInput";
import type { InputType, PostMode } from "@shared/postspark";
import StudioGalleryView from "./components/StudioGalleryView";
import CanvasLabPage from "@/pages/CanvasLab/CanvasLabPage";
import { INITIAL_POST, ensureDistinctFamilies, resolveLegibleTextColor, OFFICIAL_FAMILIES_META, type AspectRatioType, type CanvasPostModel } from "@/pages/CanvasLab/components/types";

type ScreenStage = "create" | "gallery" | "editor";

function variationToCanvasModel(v: any, index: number, originalPrompt: string): CanvasPostModel {
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



export default function StudioAppPage() {
  const [stage, setStage] = useState<ScreenStage>("create");
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingMore, setIsGeneratingMore] = useState(false);
  const [lastPrompt, setLastPrompt] = useState("");
  const [lastMode, setLastMode] = useState<"static" | "carousel">("static");
  const [generatedVariations, setGeneratedVariations] = useState<CanvasPostModel[]>([]);
  const [selectedPost, setSelectedPost] = useState<CanvasPostModel>(INITIAL_POST);

  const generateMutation = trpc.post.generate.useMutation();

  const handleCreateSubmit = async (promptText: string, mode: "static" | "carousel") => {
    setIsLoading(true);
    setLastPrompt(promptText);
    setLastMode(mode);
    toast.info("A IA está sintetizando copies e direções de arte oficiais...");

    try {
      const isUrl = promptText.startsWith("http://") || promptText.startsWith("https://");
      const result = await generateMutation.mutateAsync({
        inputType: isUrl ? "url" : "text",
        content: promptText,
        platform: "instagram",
        postMode: mode,
        model: "llama",
      });

      if (result?.variations && result.variations.length > 0) {
        const distinctVars = ensureDistinctFamilies(result.variations as any[]);
        const mapped = distinctVars.map((v: any, i: number) => variationToCanvasModel(v, i, promptText));
        setGeneratedVariations(mapped);
        setStage("gallery");
        toast.success(`${mapped.length} direções de arte criadas com IA!`);
      } else {
        throw new Error("Nenhuma variação gerada.");
      }
    } catch (err: any) {
      console.warn("[StudioApp] Fallback acionado:", err);
      // Fallback rico com 3 ângulos de copy genuinamente diferentes
      const fallbackVars: CanvasPostModel[] = [
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
      setGeneratedVariations(fallbackVars);
      setStage("gallery");
      toast.success("Direções de arte geradas!");
    } finally {
      setIsLoading(false);
    }
  };

  // Gerar mais 3 variações com IA e novas famílias oficiais
  const handleGenerateMore = async () => {
    setIsGeneratingMore(true);
    toast.info("A IA está criando 3 novos ângulos criativos...");

    try {
      // Chama a IA solicitando novas variações baseadas no tema
      const isUrl = lastPrompt.startsWith("http://") || lastPrompt.startsWith("https://");
      const result = await generateMutation.mutateAsync({
        inputType: isUrl ? "url" : "text",
        content: `Crie 3 novos ganchos criativos e direções de arte alternativas sobre: ${lastPrompt}`,
        platform: "instagram",
        postMode: lastMode,
        model: "llama",
      });

      if (result?.variations && result.variations.length > 0) {
        const offset = generatedVariations.length;
        const newMapped = result.variations.map((v, i) => variationToCanvasModel(v, offset + i, lastPrompt));
        setGeneratedVariations((prev) => [...prev, ...newMapped]);
        toast.success("3 novas direções de arte criadas com IA!");
      } else {
        throw new Error("Sem resposta da IA");
      }
    } catch (err: any) {
      console.warn("[StudioApp] Fallback inteligente de novas variações acionado:", err);
      // Fallback inteligente com 3 famílias complementares e 3 novos ganchos criativos
      const extraVars: CanvasPostModel[] = [
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
      setGeneratedVariations((prev) => [...prev, ...extraVars]);
      toast.success("3 novas direções de arte adicionadas à galeria!");
    } finally {
      setIsGeneratingMore(false);
    }
  };

  const handleSelectVariation = (post: CanvasPostModel) => {
    setSelectedPost(post);
    setStage("editor");
  };

  return (
    <div className="min-h-screen w-full bg-[#07090E] text-white flex flex-col overflow-hidden font-sans">
      {stage === "create" && (
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 max-w-4xl mx-auto w-full text-center relative select-none z-10 my-auto">
          <OrganicBackground accentColor="#E5A93C" intensity={0.18} />
          <SparkParticles count={14} variant="subtle" />

          {/* Badge Mágico */}
          <div className="inline-flex items-center gap-2 bg-white/6 px-4 py-1.5 rounded-full border border-white/10 text-xs font-mono text-white/90 mb-5 backdrop-blur-md shadow-lg">
            <span className="text-[oklch(0.78_0.22_48)] text-sm">✦</span>
            <span>Estúdio de Criação com IA</span>
          </div>

          {/* Título Monumental Mágico */}
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white mb-3 sm:mb-4 leading-tight">
            O que você quer <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-white via-white/90 to-white/60 bg-clip-text text-transparent">
              manifestar hoje?
            </span>
          </h1>

          <p className="text-xs sm:text-sm md:text-base text-white/60 mb-6 sm:mb-8 max-w-lg px-2">
            A centelha que transforma ideias, URLs e visões em posts de alto padrão para suas redes.
          </p>

          {/* SmartInput Mágico com Glow Vibrante */}
          <div className="w-full max-w-2xl px-2">
            <SmartInput
              onSubmit={(val, type) => handleCreateSubmit(val, lastMode)}
              isLoading={isLoading}
              postMode={lastMode}
              onPostModeChange={(mode) => setLastMode(mode)}
            />
          </div>

          {/* Sugestões Rápidas de Prompt para Clicar */}
          {!isLoading && (
            <div className="w-full max-w-2xl mt-5 px-2 space-y-2">
              <div className="text-[11px] uppercase tracking-wider text-white/40 font-mono">
                Ideias para começar
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {[
                  "3 sinais de que sua marca parece amadora",
                  "Por que marcas de luxo não competem por preço",
                  "O erro fatal que destrói o engajamento",
                  "Como precificar com autoridade",
                ].map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => handleCreateSubmit(idea, lastMode)}
                    className="text-xs px-3.5 py-1.5 rounded-full bg-white/6 border border-white/10 text-white/75 hover:bg-white/15 hover:text-white hover:border-white/25 transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95 text-left"
                  >
                    ✦ {idea}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {stage === "gallery" && (
        <StudioGalleryView
          variations={generatedVariations}
          onSelectVariation={handleSelectVariation}
          onBackToCreate={() => setStage("create")}
          onGenerateMore={handleGenerateMore}
          isGeneratingMore={isGeneratingMore}
        />
      )}

      {stage === "editor" && (
        <CanvasLabPage
          initialPost={selectedPost}
          onBackToGallery={() => setStage("gallery")}
        />
      )}
    </div>
  );
}
