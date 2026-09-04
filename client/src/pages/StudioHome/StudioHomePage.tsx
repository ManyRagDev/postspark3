import { useAuth } from "@/_core/hooks/useAuth";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import StudioNav from "./components/StudioNav";
import StudioInputBar from "./components/StudioInputBar";
import StudioSpecimensShelf from "./components/StudioSpecimensShelf";
import StudioStageCard from "./components/StudioStageCard";
import StudioAuthModal from "./components/StudioAuthModal";
import { STUDIO_FAMILIES } from "./components/studioModels";

export default function StudioHomePage() {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "5:6" | "9:16">("1:1");
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<"url" | "idea">("idea");

  const [inputValue, setInputValue] = useState(STUDIO_FAMILIES[0].rawPrompt);

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );

  const currentFamily = STUDIO_FAMILIES[currentIndex];

  useEffect(() => {
    if (!loading && isAuthenticated) {
      setLocation("/thevoid");
    }
  }, [isAuthenticated, loading, setLocation]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleSelectSpecimen = (index: number) => {
    setCurrentIndex(index);
    const selected = STUDIO_FAMILIES[index];
    setInputValue(selected.rawPrompt);
    if (selected.promptType === "url") {
      setActiveMode("url");
    } else {
      setActiveMode("idea");
    }
  };

  const handleModeChange = (mode: "url" | "idea") => {
    setActiveMode(mode);
    if (mode === "url") {
      setInputValue("https://nuvemshop.com.br");
      // Find glass-veil (URL archetype)
      const urlFamilyIdx = STUDIO_FAMILIES.findIndex((f) => f.promptType === "url");
      if (urlFamilyIdx !== -1) setCurrentIndex(urlFamilyIdx);
    } else {
      setInputValue(STUDIO_FAMILIES[0].rawPrompt);
      setCurrentIndex(0);
    }
  };

  const handleSubmit = (promptText: string) => {
    setInputValue(promptText);
    setIsAuthOpen(true);
  };

  const handleOpenAuth = useCallback(() => {
    setIsAuthOpen(true);
  }, []);

  const handleCloseAuth = useCallback(() => {
    setIsAuthOpen(false);
  }, []);

  return (
    <div className="relative min-h-[100dvh] w-full bg-[#080706] text-white selection:bg-[#FF5C00] selection:text-white flex flex-col justify-between overflow-x-hidden">
      {/* Background Cinematográfico de Estúdio (Sem partículas dispersas) */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[450px] bg-[#FF5C00]/8 blur-[160px] rounded-full" />
        <div className="absolute bottom-10 right-10 w-[500px] h-[500px] bg-cyan-500/5 blur-[150px] rounded-full" />
        {/* Grid Sutil de Prancheta */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col min-h-[100dvh] justify-between">
        {/* 1. Barra de Navegação Oficial */}
        <StudioNav onOpenAuth={handleOpenAuth} />

        {/* 2. Cockpit Central de Alta Fidelidade */}
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-6 md:py-8 max-w-7xl mx-auto w-full text-center space-y-8">
          
          {/* Manifesto & Posicionamento */}
          <div className="space-y-3 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/4 text-[11px] font-mono uppercase tracking-[0.2em] text-[#FF5C00]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF5C00] animate-pulse" />
              Estúdio de Direção de Arte & IA Editorial
            </div>

            <h1
              className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white leading-[1.08]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Direção de arte e texto de elite para marcas que{" "}
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg, #ffffff 40%, #FF5C00 100%)" }}>
                recusam o genérico.
              </span>
            </h1>

            <p className="text-sm sm:text-base text-white/60 font-light max-w-2xl mx-auto leading-relaxed">
              Cole a URL do seu site ou digite sua tese. O PostSpark extrai o Brand DNA e diagramar posts cinematográficos prontos para publicação.
            </p>
          </div>

          {/* Grade do Cockpit: Folha de Criação (Esquerda) + Palco Visual (Direita) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start w-full max-w-6xl mx-auto text-left pt-2">
            
            {/* Coluna 1: Entrada de Criação + Prateleira de Espécimes */}
            <div className="lg:col-span-6 space-y-6">
              <StudioInputBar
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handleSubmit}
                promptType={currentFamily.promptType}
                onModeChange={handleModeChange}
                activeMode={activeMode}
              />

              <StudioSpecimensShelf
                selectedIndex={currentIndex}
                onSelect={handleSelectSpecimen}
              />
            </div>

            {/* Coluna 2: Palco Visual com a Arte Gerada */}
            <div className="lg:col-span-6 flex flex-col items-center justify-center">
              <StudioStageCard
                family={currentFamily}
                aspectRatio={aspectRatio}
                onAspectRatioChange={setAspectRatio}
                onSelect={() => handleSubmit(inputValue)}
              />
            </div>
          </div>
        </main>

        {/* 3. Rodapé Nobre & Minimalista */}
        <footer className="relative z-20 py-5 px-6 border-t border-white/6 text-xs text-white/40 flex items-center justify-between max-w-7xl mx-auto w-full">
          <span>© {new Date().getFullYear()} PostSpark · Todos os direitos reservados</span>
          <span className="text-[11px] font-mono text-white/30 hidden sm:inline">
            Direção Criativa & Inteligência Visual
          </span>
        </footer>
      </div>

      {/* Modal de Autenticação */}
      <StudioAuthModal
        isOpen={isAuthOpen}
        isMobile={isMobile}
        onClose={handleCloseAuth}
        initialPrompt={inputValue}
      />
    </div>
  );
}
