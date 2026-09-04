import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight, Globe, Layers, RefreshCw, Sparkles, Wand2, Zap } from "lucide-react";
import { useState } from "react";

export type DemoScenario = {
  id: string;
  tabLabel: string;
  icon: typeof Globe;
  rawInput: string;
  inputType: "url" | "text" | "carousel";
  extractedDna: {
    brandName: string;
    colors: string[];
    archetype: string;
    vibe: string;
  };
  generatedPost: {
    category: string;
    badge: string;
    headline: string;
    subtext: string;
    layout: "editorial" | "split" | "glass" | "carousel";
    fontFamily: string;
    bgImage: string;
    palette: {
      background: string;
      text: string;
      accent: string;
      surface?: string;
    };
    slides?: Array<{ headline: string; subtext: string; step: string; bgImage?: string }>;
  };
};

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "url-brand",
    tabLabel: "E-commerce & Moda (URL)",
    icon: Globe,
    rawInput: "https://loja-aurora.com.br",
    inputType: "url",
    extractedDna: {
      brandName: "Aurora Alfaiataria",
      colors: ["#120D0A", "#E5A93C", "#F8F4EE"],
      archetype: "Alta Costura & Design Autoral",
      vibe: "Elegância, Discrição & Alto Ticket",
    },
    generatedPost: {
      category: "ALTO VALOR & LUXO",
      badge: "EDITORIAL // CAPA",
      headline: "Marcas de luxo não competem por preço.",
      subtext: "A percepção de prestígio nasce quando cada palavra e detalhe visual parecem intencionais.",
      layout: "editorial",
      fontFamily: '"Playfair Display", Georgia, serif',
      bgImage: "/showcase/backgrounds/bg-editorial.jpg",
      palette: {
        background: "#120D0A",
        text: "#F8F4EE",
        accent: "#E5A93C",
        surface: "#221914",
      },
    },
  },
  {
    id: "authority-editorial",
    tabLabel: "Consultoria High-Ticket (Ideia)",
    icon: Sparkles,
    rawInput: "Quem cobra 10x mais não vende tempo de consultoria. Vende certeza de decisão.",
    inputType: "text",
    extractedDna: {
      brandName: "Mentoria & Advisory Executivo",
      colors: ["#0B0D14", "#38BDF8", "#F8FAFC"],
      archetype: "Autoridade Soberana",
      vibe: "Precisão Cirúrgica & Rigor Intelectual",
    },
    generatedPost: {
      category: "POSICIONAMENTO DE MARCA",
      badge: "DECISÃO // HIGH-END",
      headline: "Quem cobra 10x mais não vende tempo. Vende certeza.",
      subtext: "Clientes de elite não contratam execução operacional. Contratam quem absorve o risco.",
      layout: "editorial",
      fontFamily: '"Cinzel", "Playfair Display", serif',
      bgImage: "/showcase/backgrounds/bg-quote.jpg",
      palette: {
        background: "#080A10",
        text: "#F1F5F9",
        accent: "#38BDF8",
        surface: "#121826",
      },
    },
  },
  {
    id: "carousel-framework",
    tabLabel: "Carrossel Multi-Slide (Framework)",
    icon: Layers,
    rawInput: "3 erros silenciosos que estão matando a conversão do seu infoproduto",
    inputType: "carousel",
    extractedDna: {
      brandName: "Framework de Conversão",
      colors: ["#09090C", "#FF5C00", "#FFFFFF"],
      archetype: "Retenção & Escala Digital",
      vibe: "Urgência, Clareza & Tração",
    },
    generatedPost: {
      category: "CONVERSÃO & CRO",
      badge: "SLIDE 01 DE 03",
      headline: "3 gargalos visuais que fazem seus clientes hesitarem.",
      subtext: "O que acontece nos primeiros 4 segundos da sua oferta determina 80% do faturamento.",
      layout: "carousel",
      fontFamily: '"Archivo Black", sans-serif',
      bgImage: "/showcase/backgrounds/bg-split-desejo.jpg",
      palette: {
        background: "#09090C",
        text: "#FFFFFF",
        accent: "#FF5C00",
        surface: "#181820",
      },
      slides: [
        {
          step: "SLIDE 01 // O GANCHO",
          headline: "3 gargalos visuais que fazem seus clientes hesitarem.",
          subtext: "O que acontece nos primeiros 4 segundos determina se o visitante compra ou fecha a aba.",
          bgImage: "/showcase/backgrounds/bg-split-desejo.jpg",
        },
        {
          step: "SLIDE 02 // O DIAGNÓSTICO",
          headline: "1. Falta de hierarquia: quando tudo grita, nada é ouvido.",
          subtext: "Sem contraste deliberado entre título e benefício, a leitura se torna cansativa.",
          bgImage: "/showcase/backgrounds/bg-data.jpg",
        },
        {
          step: "SLIDE 03 // A VIRADA",
          headline: "2. Estética genérica não sustenta preço de elite.",
          subtext: "Design deliberado é o multiplicador invisível que ancora alto valor percebido.",
          bgImage: "/showcase/backgrounds/bg-glass.jpg",
        },
      ],
    },
  },
  {
    id: "brutal-hook",
    tabLabel: "Gancho Viral (Neobrutal)",
    icon: Zap,
    rawInput: "3 sinais claros de que sua marca ainda parece amadora no feed",
    inputType: "text",
    extractedDna: {
      brandName: "Estratégia de Posicionamento",
      colors: ["#D92E1E", "#FFD600", "#FFFFFF"],
      archetype: "Quebra de Padrão Agressiva",
      vibe: "Impacto Imediato & Retenção Brutal",
    },
    generatedPost: {
      category: "HOOK // POSICIONAMENTO",
      badge: "QUEBRA DE PADRÃO",
      headline: "3 sinais de que sua marca ainda parece amadora.",
      subtext: "Design improvisado é o imposto invisível que você paga toda vez que um cliente pede desconto.",
      layout: "split",
      fontFamily: '"Anton", "Impact", sans-serif',
      bgImage: "/showcase/backgrounds/bg-chromatic.jpg",
      palette: {
        background: "#D92E1E",
        text: "#FFFFFF",
        accent: "#FFD600",
        surface: "#A3200C",
      },
    },
  },
];

interface LiveHeroDemoProps {
  onAction: () => void;
}

export default function LiveHeroDemo({ onAction }: LiveHeroDemoProps) {
  const [selectedScenario, setSelectedScenario] = useState<DemoScenario>(DEMO_SCENARIOS[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  const handleSelectScenario = (scenario: DemoScenario) => {
    if (scenario.id === selectedScenario.id) return;
    setIsGenerating(true);
    setCurrentSlide(0);
    setTimeout(() => {
      setSelectedScenario(scenario);
      setIsGenerating(false);
    }, 400);
  };

  const isCarousel = selectedScenario.generatedPost.layout === "carousel" && !!selectedScenario.generatedPost.slides;
  const activeSlideData = isCarousel && selectedScenario.generatedPost.slides
    ? selectedScenario.generatedPost.slides[currentSlide]
    : null;

  const currentBgImage = isCarousel && activeSlideData?.bgImage
    ? activeSlideData.bgImage
    : selectedScenario.generatedPost.bgImage;

  const isBrutal = selectedScenario.id === "brutal-hook";

  return (
    <section id="transformacao" className="relative pt-28 pb-20 md:pt-36 md:pb-28 px-4 md:px-8 max-w-7xl mx-auto text-center overflow-hidden">
      {/* Glow focal de fundo */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[380px] bg-[#FF5C00]/[0.08] blur-[150px] pointer-events-none rounded-full" />
      <div className="absolute top-1/3 left-1/4 w-[450px] h-[320px] bg-[#7c3aed]/[0.06] blur-[140px] pointer-events-none rounded-full" />

      {/* Kicker sutil de estúdio */}
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] backdrop-blur-md mb-5 text-[11px] font-medium tracking-[0.2em] uppercase text-white/70">
        <Sparkles size={12} className="text-[#FF5C00]" />
        <span>Estúdio de Criação & Direção de Arte</span>
      </div>

      {/* Headline Principal com Tipografia Volumétrica */}
      <h1
        className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-[-0.03em] text-white max-w-4xl mx-auto leading-[1.06]"
        style={{
          fontFamily: "var(--font-display, 'Space Grotesk', sans-serif)",
          textShadow: "0 2px 24px rgba(0,0,0,0.85), 0 0 50px rgba(255,255,255,0.05)",
        }}
      >
        Transforme qualquer ideia ou URL em{" "}
        <span className="text-[#FFFFFF]">posts editoriais</span>{" "}
        <span
          className="inline-block"
          style={{
            background: "linear-gradient(135deg, #FF7A3D 0%, #FF5C00 60%, #E04800 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          de elite<span className="text-[#FF5C00] font-sans">.</span>
        </span>
      </h1>

      {/* Subheadline com tom aveludado */}
      <p className="mt-5 text-sm sm:text-base md:text-[17px] text-[rgba(240,235,225,0.72)] max-w-2xl mx-auto font-light leading-relaxed">
        O PostSpark extrai o Brand DNA da sua marca, escreve copies magnéticas e diagrama posts e carrosséis com acabamento cinematográfico em segundos.
      </p>

      {/* ---------------- LIVE INTERACTIVE DEMO SANDBOX ---------------- */}
      <div className="mt-12 max-w-5xl mx-auto rounded-[2.2rem] border border-white/[0.09] bg-[oklch(0.06_0.04_280/70%)] backdrop-blur-2xl p-5 sm:p-8 md:p-10 shadow-[0_30px_100px_rgba(0,0,0,0.8)] text-left relative z-20">
        {/* Topo do Sandbox: Seletor de Insumos */}
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-[11px] uppercase tracking-[0.24em] font-medium text-white/50 flex items-center gap-1.5">
              <Wand2 size={13} className="text-[#FF5C00]" />
              Escolha uma direção criativa abaixo e veja o resultado:
            </span>

            <span className="text-[11px] text-[#FF5C00]/80 font-mono tracking-wider">
              ✦ Motor Canônico // Sem Templates
            </span>
          </div>

          {/* Abas / Pílulas de Seleção Elegantes */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {DEMO_SCENARIOS.map((scenario) => {
              const Icon = scenario.icon;
              const isSelected = scenario.id === selectedScenario.id;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => handleSelectScenario(scenario)}
                  className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? "bg-white/[0.08] border-[#FF5C00]/60 text-white shadow-[0_0_20px_rgba(255,92,0,0.2)]"
                      : "bg-white/[0.02] border-white/[0.06] text-white/60 hover:bg-white/[0.05] hover:text-white"
                  }`}
                >
                  <Icon size={14} className={isSelected ? "text-[#FF5C00]" : "text-white/40"} />
                  <span className="truncate">{scenario.tabLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Palco da Transformação (Insumo ➔ Brand DNA ➔ Post Gerado) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Lado Esquerdo (5 Colunas): Painel de Insumo & Brand DNA Extraído */}
          <div className="lg:col-span-5 space-y-4">
            {/* Folha Tonal de Insumo */}
            <div className="rounded-2xl border border-white/[0.08] bg-black/40 p-4 space-y-2.5">
              <div className="text-[10px] uppercase tracking-[0.24em] text-white/45 font-semibold flex items-center justify-between">
                <span>Insumo Recebido</span>
                <span className="text-[#FF5C00] font-mono text-[9px] uppercase tracking-widest bg-[#FF5C00]/10 px-2 py-0.5 rounded-full border border-[#FF5C00]/20">
                  {selectedScenario.inputType === "url" ? "URL do Site" : "Ideia / Copy"}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs font-mono text-white/90 break-words leading-relaxed">
                {selectedScenario.rawInput}
              </div>
            </div>

            {/* Caixa de Brand DNA */}
            <div className="rounded-2xl border border-white/[0.08] bg-black/40 p-4 space-y-3.5">
              <div className="text-[10px] uppercase tracking-[0.24em] text-white/45 font-semibold flex items-center gap-1.5">
                <Sparkles size={12} className="text-[#FF5C00]" />
                Brand DNA & Direção Extraída
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between text-white/70">
                  <span className="text-white/40">Marca:</span>
                  <span className="font-semibold text-white tracking-wide">{selectedScenario.extractedDna.brandName}</span>
                </div>

                <div className="flex items-center justify-between text-white/70">
                  <span className="text-white/40">Arquétipo:</span>
                  <span className="text-white/90">{selectedScenario.extractedDna.archetype}</span>
                </div>

                <div className="flex items-center justify-between text-white/70">
                  <span className="text-white/40">Paleta Extraída:</span>
                  <div className="flex items-center gap-1.5">
                    {selectedScenario.extractedDna.colors.map((c, i) => (
                      <span
                        key={i}
                        className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between text-white/70 pt-0.5">
                  <span className="text-white/40">Atmosfera:</span>
                  <span className="text-xs text-[#FF5C00]/90 font-medium">{selectedScenario.extractedDna.vibe}</span>
                </div>
              </div>
            </div>

            {/* Botão de Ação do Sandbox */}
            <button
              type="button"
              onClick={onAction}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 px-4 text-xs md:text-sm font-bold text-white shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              style={{
                background: "linear-gradient(135deg, #FF6B2B 0%, #FF5C00 50%, #E04800 100%)",
                boxShadow: "0 0 24px rgba(255, 92, 0, 0.4)",
              }}
            >
              <span>Gerar posts com este Brand DNA</span>
              <ArrowRight size={15} />
            </button>
          </div>

          {/* Lado Direito (7 Colunas): O Post de Elite Renderizado em Tempo Real */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center">
            <div className="relative w-full max-w-[340px] sm:max-w-[390px] aspect-[4/5] rounded-[24px] overflow-hidden border border-white/[0.12] shadow-[0_24px_60px_rgba(0,0,0,0.85)] transition-all duration-300">
              <AnimatePresence mode="wait">
                {isGenerating ? (
                  <motion.div
                    key="generating"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center gap-3 p-6 text-center"
                  >
                    <RefreshCw size={28} className="animate-spin text-[#FF5C00]" />
                    <span className="text-xs font-mono uppercase tracking-[0.24em] text-white/70">
                      Sintetizando Copy & Direção Visual...
                    </span>
                  </motion.div>
                ) : (
                  <motion.div
                    key={selectedScenario.id + (activeSlideData ? activeSlideData.step : "") + currentBgImage}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.35 }}
                    className="relative w-full h-full p-8 flex flex-col justify-between select-none overflow-hidden"
                    style={{
                      backgroundColor: selectedScenario.generatedPost.palette.background,
                      color: selectedScenario.generatedPost.palette.text,
                    }}
                  >
                    {/* Imagem de Fundo Canônica */}
                    {currentBgImage && (
                      <>
                        <div
                          className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 ease-out"
                          style={{ backgroundImage: `url(${currentBgImage})` }}
                        />
                        {/* Overlay Gradiente de Proteção Calibrado */}
                        <div
                          className="absolute inset-0"
                          style={{
                            background: isBrutal
                              ? "linear-gradient(180deg, rgba(217, 46, 30, 0.45) 0%, rgba(184, 36, 21, 0.65) 50%, rgba(15, 6, 5, 0.94) 100%)"
                              : `linear-gradient(180deg, ${selectedScenario.generatedPost.palette.background}88 0%, ${selectedScenario.generatedPost.palette.background}33 30%, ${selectedScenario.generatedPost.palette.background}F4 82%)`,
                          }}
                        />
                      </>
                    )}

                    {/* Topo do Post */}
                    <div className="relative z-10 flex items-center justify-between">
                      <span
                        className="px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.22em] backdrop-blur-md"
                        style={{
                          backgroundColor: `${selectedScenario.generatedPost.palette.accent}22`,
                          color: selectedScenario.generatedPost.palette.accent,
                          border: `1px solid ${selectedScenario.generatedPost.palette.accent}44`,
                        }}
                      >
                        {activeSlideData ? activeSlideData.step : selectedScenario.generatedPost.badge}
                      </span>

                      <span className="text-[10px] uppercase font-mono text-white/40 tracking-wider">
                        PostSpark
                      </span>
                    </div>

                    {/* Conteúdo Inferior Nobre */}
                    <div className="relative z-10 space-y-3">
                      <div className="text-[10px] uppercase tracking-[0.28em] font-medium text-white/60">
                        {selectedScenario.generatedPost.category}
                      </div>

                      <h2
                        className="text-xl sm:text-2xl md:text-[26px] font-bold leading-[1.18] tracking-tight"
                        style={{
                          fontFamily: selectedScenario.generatedPost.fontFamily,
                          textShadow: "0 2px 14px rgba(0,0,0,0.9)",
                        }}
                      >
                        {activeSlideData ? activeSlideData.headline : selectedScenario.generatedPost.headline}
                      </h2>

                      <p className="text-xs sm:text-sm font-light text-white/75 leading-relaxed">
                        {activeSlideData ? activeSlideData.subtext : selectedScenario.generatedPost.subtext}
                      </p>

                      <div
                        className="h-[3px] w-12 rounded-full mt-2"
                        style={{ backgroundColor: selectedScenario.generatedPost.palette.accent }}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Controles de Slide se for Carrossel */}
            {isCarousel && selectedScenario.generatedPost.slides && (
              <div className="flex items-center gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setCurrentSlide((p) => Math.max(0, p - 1))}
                  disabled={currentSlide === 0}
                  className="p-2 rounded-full border border-white/10 bg-white/5 text-white disabled:opacity-30 cursor-pointer hover:bg-white/10 transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>

                <span className="text-xs font-mono text-white/60">
                  Slide {currentSlide + 1} de {selectedScenario.generatedPost.slides.length}
                </span>

                <button
                  type="button"
                  onClick={() => setCurrentSlide((p) => Math.min(selectedScenario.generatedPost.slides!.length - 1, p + 1))}
                  disabled={currentSlide === selectedScenario.generatedPost.slides.length - 1}
                  className="p-2 rounded-full border border-white/10 bg-white/5 text-white disabled:opacity-30 cursor-pointer hover:bg-white/10 transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
