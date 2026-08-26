import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Globe, Layers, RefreshCw, Sparkles, Wand2, Zap } from "lucide-react";
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
    slides?: Array<{ headline: string; subtext: string; step: string }>;
  };
};

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "url-brand",
    tabLabel: "Site / URL (Brand DNA)",
    icon: Globe,
    rawInput: "https://nuvemshop.com.br",
    inputType: "url",
    extractedDna: {
      brandName: "Nuvemshop",
      colors: ["#2B3595", "#00D68F", "#11142D"],
      archetype: "Plataforma de E-commerce Líder",
      vibe: "Tecnologia, Escala & Confiabilidade",
    },
    generatedPost: {
      category: "E-COMMERCE & ESCALA",
      badge: "BRAND DNA // V3",
      headline: "Seu e-commerce não precisa parecer um catálogo genérico.",
      subtext: "Marcas memoráveis constroem experiências visuais que geram recorrência e desejo imediato.",
      layout: "editorial",
      fontFamily: '"Playfair Display", Georgia, serif',
      bgImage: "https://images.unsplash.com/photo-1556742049-0a67c5574f73?auto=format&fit=crop&w=800&q=80",
      palette: {
        background: "#0E1022",
        text: "#FFFFFF",
        accent: "#00E59B",
        surface: "#1A1F3D",
      },
    },
  },
  {
    id: "carousel-framework",
    tabLabel: "Carrossel Multi-Slide",
    icon: Layers,
    rawInput: "3 erros silenciosos que estão matando a conversão do seu produto digital",
    inputType: "carousel",
    extractedDna: {
      brandName: "Infoproduto High-Ticket",
      colors: ["#FF4D00", "#FFFFFF", "#0A0A0C"],
      archetype: "Framework de Vendas & Retenção",
      vibe: "Urgência, Precisão & Autoridade",
    },
    generatedPost: {
      category: "CONVERSÃO & CRO",
      badge: "SLIDE 01 DE 03",
      headline: "3 gargalos visuais que fazem seus clientes hesitarem.",
      subtext: "O que acontece nos primeiros 4 segundos da sua oferta determina 80% do faturamento.",
      layout: "carousel",
      fontFamily: '"Archivo Black", sans-serif',
      bgImage: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=800&q=80",
      palette: {
        background: "#0B0B0E",
        text: "#FFFFFF",
        accent: "#FF4D00",
        surface: "#181820",
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
  },
  {
    id: "authority-editorial",
    tabLabel: "Capa de Revista / Luxo",
    icon: Sparkles,
    rawInput: "Quem cobra caro não vende tempo. Vende decisão.",
    inputType: "text",
    extractedDna: {
      brandName: "Mentoria & Consultoria Elite",
      colors: ["#D4AF37", "#F7EFE8", "#120D0A"],
      archetype: "Posicionamento High-End",
      vibe: "Elegância, Silêncio & Prestígio",
    },
    generatedPost: {
      category: "POSICIONAMENTO DE MARCA",
      badge: "EDITORIAL // CAPA",
      headline: "Quem cobra 10x mais não vende tempo. Vende certeza.",
      subtext: "A percepção de raridade nasce quando cada palavra e detalhe visual parecem intencionais.",
      layout: "editorial",
      fontFamily: '"Playfair Display", Georgia, serif',
      bgImage: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=800&q=80",
      palette: {
        background: "#100B08",
        text: "#F8F3EC",
        accent: "#E2AA3E",
        surface: "#201610",
      },
    },
  },
  {
    id: "brutal-hook",
    tabLabel: "Gancho Viral (Neobrutal)",
    icon: Zap,
    rawInput: "Pare de postar dicas soltas. Crie narrativas que vendem.",
    inputType: "text",
    extractedDna: {
      brandName: "Estratégia de Conteúdo",
      colors: ["#D9381E", "#FFD600", "#000000"],
      archetype: "Quebra de Padrão & Retenção",
      vibe: "Direto, Agressivo & Memorável",
    },
    generatedPost: {
      category: "RETENÇÃO // HOOK",
      badge: "QUEBRA DE PADRÃO",
      headline: "DICAS SOLTAS GERAM CURTIDAS VAZIAS. NARRATIVAS GERAM CLIENTES.",
      subtext: "O feed recompensa quem organiza a atenção do mercado com posicionamento duro.",
      layout: "split",
      fontFamily: '"Anton", sans-serif',
      bgImage: "",
      palette: {
        background: "#D9381E",
        text: "#FFFFFF",
        accent: "#FFD600",
        surface: "#A3200C",
      },
    },
  },
];

interface LiveHeroDemoProps {
  onOpenAuth: () => void;
}

export default function LiveHeroDemo({ onOpenAuth }: LiveHeroDemoProps) {
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
    }, 450);
  };

  const isCarousel = selectedScenario.generatedPost.layout === "carousel" && !!selectedScenario.generatedPost.slides;
  const activeSlideData = isCarousel && selectedScenario.generatedPost.slides
    ? selectedScenario.generatedPost.slides[currentSlide]
    : null;

  return (
    <section className="relative pt-28 pb-20 md:pt-36 md:pb-28 px-4 md:px-8 max-w-7xl mx-auto text-center overflow-hidden">
      {/* Glow de fundo */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-[oklch(0.7_0.22_40)]/12 blur-[140px] pointer-events-none rounded-full" />
      <div className="absolute top-1/3 left-1/4 w-[400px] h-[300px] bg-[#00f5ff]/10 blur-[130px] pointer-events-none rounded-full" />

      {/* Pill Badge */}
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/12 bg-white/6 backdrop-blur-md mb-6 text-xs font-semibold tracking-wider uppercase text-white/90">
        <Sparkles size={13} style={{ color: "oklch(0.78 0.22 48)" }} />
        <span>Direção Criativa & Inteligência Visual</span>
      </div>

      {/* Headline Principal */}
      <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-[1.08]" style={{ fontFamily: "var(--font-display)" }}>
        Transforme qualquer ideia ou URL em{" "}
        <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg, #ffffff 30%, oklch(0.78 0.22 48) 100%)" }}>
          posts editoriais de elite.
        </span>
      </h1>

      {/* Subheadline */}
      <p className="mt-5 text-sm sm:text-base md:text-lg text-white/70 max-w-2xl mx-auto font-light leading-relaxed">
        O PostSpark extrai o Brand DNA da sua marca, escreve copies magnéticas e diagramar posts de alta conversão em segundos.
      </p>

      {/* ---------------- LIVE INTERACTIVE DEMO SANDBOX ---------------- */}
      <div className="mt-12 max-w-5xl mx-auto rounded-[2rem] border border-white/15 bg-black/60 backdrop-blur-2xl p-4 sm:p-8 shadow-[0_30px_90px_rgba(0,0,0,0.85)] text-left relative z-20">
        {/* Topo do Sandbox: Seletor de Insumos */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-[11px] uppercase tracking-[0.26em] font-semibold text-white/50 flex items-center gap-1.5">
              <Wand2 size={13} className="text-[oklch(0.78_0.22_48)]" />
              Experimente um insumo abaixo e veja a mágica:
            </span>

            <span className="text-xs text-white/40 font-mono hidden sm:inline-block">
              Motor v3 // Zero Template de Canva
            </span>
          </div>

          {/* Abas / Pílulas de Seleção */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DEMO_SCENARIOS.map((scenario) => {
              const Icon = scenario.icon;
              const isSelected = scenario.id === selectedScenario.id;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => handleSelectScenario(scenario)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? "bg-white/12 border-[oklch(0.75_0.22_45)] text-white shadow-lg"
                      : "bg-white/4 border-white/8 text-white/60 hover:bg-white/8 hover:text-white"
                  }`}
                >
                  <Icon size={14} className={isSelected ? "text-[oklch(0.78_0.22_48)]" : "text-white/40"} />
                  <span className="truncate">{scenario.tabLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Palco da Transformação (Insumo ➔ Brand DNA ➔ Post Gerado) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Lado Esquerdo (5 Colunas): Painel de Insumo & Brand DNA Extraído */}
          <div className="lg:col-span-5 space-y-4">
            {/* Caixa de Entrada */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
              <div className="text-[10px] uppercase tracking-[0.24em] text-white/40 font-semibold flex items-center justify-between">
                <span>Insumo Recebido</span>
                <span className="text-[oklch(0.78_0.22_48)] font-mono">Pronto</span>
              </div>
              <div className="p-3 rounded-xl bg-black/50 border border-white/8 text-xs font-mono text-white/90 break-words">
                {selectedScenario.rawInput}
              </div>
            </div>

            {/* Caixa de Brand DNA */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="text-[10px] uppercase tracking-[0.24em] text-white/40 font-semibold flex items-center gap-1.5">
                <Sparkles size={12} className="text-[oklch(0.78_0.22_48)]" />
                Brand DNA & Direção Extraída
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-white/70">
                  <span className="text-white/40">Marca:</span>
                  <span className="font-semibold text-white">{selectedScenario.extractedDna.brandName}</span>
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
                        className="w-3.5 h-3.5 rounded-full border border-white/20"
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Botão de Ação do Sandbox */}
            <button
              type="button"
              onClick={onOpenAuth}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-xs md:text-sm font-bold text-black shadow-lg transition-all hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] cursor-pointer"
              style={{
                background: "linear-gradient(135deg, oklch(0.78 0.22 48), oklch(0.65 0.2 28))",
                boxShadow: "0 0 24px oklch(0.7 0.22 40 / 30%)",
              }}
            >
              <span>Gerar posts com meu conteúdo</span>
              <ArrowRight size={15} />
            </button>
          </div>

          {/* Lado Direito (7 Colunas): O Post de Elite Renderizado em Tempo Real */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center">
            <div className="relative w-full max-w-[340px] sm:max-w-[380px] aspect-[4/5] rounded-[24px] overflow-hidden border shadow-2xl transition-all duration-300">
              <AnimatePresence mode="wait">
                {isGenerating ? (
                  <motion.div
                    key="generating"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-3 p-6 text-center"
                  >
                    <RefreshCw size={28} className="animate-spin text-[oklch(0.78_0.22_48)]" />
                    <span className="text-xs font-mono uppercase tracking-[0.24em] text-white/70">
                      Sintetizando Copy & Direção Visual...
                    </span>
                  </motion.div>
                ) : (
                  <motion.div
                    key={selectedScenario.id + (activeSlideData ? activeSlideData.step : "")}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.35 }}
                    className="relative w-full h-full p-6 flex flex-col justify-between select-none"
                    style={{
                      backgroundColor: selectedScenario.generatedPost.palette.background,
                      color: selectedScenario.generatedPost.palette.text,
                      borderColor: `${selectedScenario.generatedPost.palette.accent}55`,
                    }}
                  >
                    {/* Imagem de Fundo (se houver) */}
                    {selectedScenario.generatedPost.bgImage && (
                      <>
                        <div
                          className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-luminosity"
                          style={{ backgroundImage: `url(${selectedScenario.generatedPost.bgImage})` }}
                        />
                        <div
                          className="absolute inset-0"
                          style={{
                            background: `linear-gradient(180deg, ${selectedScenario.generatedPost.palette.background}44 0%, ${selectedScenario.generatedPost.palette.background}F4 80%)`,
                          }}
                        />
                      </>
                    )}

                    {/* Topo do Post */}
                    <div className="relative z-10 flex items-center justify-between">
                      <span
                        className="px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.24em]"
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

                    {/* Conteúdo Central/Inferior */}
                    <div className="relative z-10 space-y-3">
                      <div className="text-[10px] uppercase tracking-[0.3em] font-medium text-white/50">
                        {selectedScenario.generatedPost.category}
                      </div>

                      <h2
                        className="text-xl sm:text-2xl font-bold leading-tight"
                        style={{ fontFamily: selectedScenario.generatedPost.fontFamily }}
                      >
                        {activeSlideData ? activeSlideData.headline : selectedScenario.generatedPost.headline}
                      </h2>

                      <p className="text-xs sm:text-sm font-light text-white/70 leading-relaxed">
                        {activeSlideData ? activeSlideData.subtext : selectedScenario.generatedPost.subtext}
                      </p>

                      <div
                        className="h-1 w-12 rounded-full mt-2"
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
                  className="p-2 rounded-full border border-white/10 bg-white/5 text-white disabled:opacity-30 cursor-pointer hover:bg-white/10"
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
                  className="p-2 rounded-full border border-white/10 bg-white/5 text-white disabled:opacity-30 cursor-pointer hover:bg-white/10"
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
