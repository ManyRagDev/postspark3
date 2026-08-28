import { useAuth } from "@/_core/hooks/useAuth";
import SparkParticles from "@/components/SparkParticles";
import { AnimatePresence, motion } from "framer-motion";
import { Layers, Pause, Play, Smartphone, Sparkles, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import StudioNav from "./components/StudioNav";
import StudioInputBar from "./components/StudioInputBar";
import StudioStageCard from "./components/StudioStageCard";
import StudioAuthModal from "./components/StudioAuthModal";
import { STUDIO_FAMILIES, type StudioFamily } from "./components/studioModels";

export default function StudioHomePage() {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "5:6" | "9:16">("1:1");
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Estados da Coreografia Estrita
  const [displayText, setDisplayText] = useState("");
  const [isTriggering, setIsTriggering] = useState(false);
  const [stageVisible, setStageVisible] = useState(false);

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

  // Máquina de estados autônoma:
  // 1. Digita o texto na caixa (palco vazio)
  // 2. Aciona o botão "Criar Post"
  // 3. Revela o card gerado no palco
  // 4. Aguarda 5.5s para degustação
  // 5. Apaga e passa para o próximo tema
  useEffect(() => {
    if (isPaused || isAuthOpen) return;

    let isCancelled = false;
    const targetPrompt = currentFamily.rawPrompt;
    let charIdx = 0;

    // Reset da rodada: começa sem card e sem texto
    setStageVisible(false);
    setDisplayText("");
    setIsTriggering(false);

    // Passo 1: Digitação do texto na caixa
    const typeInterval = setInterval(() => {
      if (isCancelled) return;
      charIdx++;
      setDisplayText(targetPrompt.slice(0, charIdx));

      if (charIdx >= targetPrompt.length) {
        clearInterval(typeInterval);

        // Passo 2: Acionamento luminoso do botão "Criar Post"
        setTimeout(() => {
          if (isCancelled) return;
          setIsTriggering(true);

          // Passo 3: O card e a variação nascem no palco
          setTimeout(() => {
            if (isCancelled) return;
            setIsTriggering(false);
            setStageVisible(true);

            // Passo 4: Degustação por 5.5 segundos
            setTimeout(() => {
              if (isCancelled) return;
              setStageVisible(false);

              // Passo 5: Transição para o próximo tema
              setTimeout(() => {
                if (isCancelled) return;
                setCurrentIndex((prev) => (prev + 1) % STUDIO_FAMILIES.length);
              }, 400);
            }, 5500);
          }, 500);
        }, 300);
      }
    }, 40);

    return () => {
      isCancelled = true;
      clearInterval(typeInterval);
    };
  }, [currentIndex, isPaused, isAuthOpen, currentFamily.rawPrompt]);

  const handleManualSelectFamily = (index: number) => {
    setIsPaused(true);
    setCurrentIndex(index);
    setDisplayText(STUDIO_FAMILIES[index].rawPrompt);
    setIsTriggering(false);
    setStageVisible(true);
  };

  const handleOpenAuth = useCallback(() => {
    setIsPaused(true);
    setIsAuthOpen(true);
  }, []);

  const handleCloseAuth = useCallback(() => {
    setIsAuthOpen(false);
  }, []);

  return (
    <div className="relative min-h-[100dvh] w-full bg-[#050608] text-white selection:bg-[#00f5ff] selection:text-black flex flex-col justify-between overflow-x-hidden">
      {/* Background Glows & Particles */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <SparkParticles count={isMobile ? 12 : 28} performanceMode={isMobile ? "reduced" : "full"} variant="default" />
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[650px] h-[350px] bg-[oklch(0.7_0.22_40)]/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-[#00f5ff]/6 blur-[140px] rounded-full" />
      </div>

      <div className="relative z-10 flex flex-col min-h-[100dvh] justify-between">
        {/* 1. Header Navigation */}
        <StudioNav onOpenAuth={handleOpenAuth} />

        {/* 2. Cockpit Central */}
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-3 md:py-5 max-w-6xl mx-auto w-full text-center space-y-5">
          {/* Título do Estúdio */}
          <div className="space-y-1.5 max-w-2xl">
            <h1
              className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Gere posts com a{" "}
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg, #ffffff 40%, oklch(0.78 0.22 48) 100%)" }}>
                alma da sua marca.
              </span>
            </h1>
            <p className="text-xs sm:text-sm md:text-base text-white/60 font-light">
              Direção de arte editorial e copywriting de elite alimentados por IA.
            </p>
          </div>

          {/* Barra de Criação Simulada com Typewriter */}
          <StudioInputBar
            displayText={displayText}
            isTriggering={isTriggering}
            promptType={currentFamily.promptType}
            onTriggerAction={handleOpenAuth}
          />

          {/* Palco das Variações: Só renderiza e acende após o disparo do botão */}
          <div className="w-full min-h-[440px] sm:min-h-[490px] flex flex-col items-center justify-center">
            <AnimatePresence mode="wait">
              {stageVisible ? (
                <motion.div
                  key={"stage-" + currentFamily.id}
                  initial={{ opacity: 0, y: 16, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 300, damping: 28 }}
                  className="w-full flex flex-col items-center space-y-4"
                >
                  {/* Seletor de Famílias Criativas + Botão de Pause/Play */}
                  <div className="space-y-2.5 w-full max-w-3xl">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-white/40 font-semibold px-2">
                      <span className="flex items-center gap-1.5">
                        <Sparkles size={12} className="text-[oklch(0.78_0.22_48)]" />
                        <span>Estilo Visual Selecionado:</span>
                      </span>

                      {/* Botão de Controle do Teatro */}
                      <button
                        type="button"
                        onClick={() => setIsPaused((p) => !p)}
                        className="flex items-center gap-1 text-[10px] text-white/60 hover:text-white transition-colors cursor-pointer"
                        title={isPaused ? "Retomar demonstração automática" : "Pausar demonstração"}
                      >
                        {isPaused ? <Play size={11} className="text-emerald-400" /> : <Pause size={11} />}
                        <span>{isPaused ? "Pausado (clique para rodar)" : "Auto"}</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-center flex-wrap gap-2">
                      {STUDIO_FAMILIES.map((family, idx) => {
                        const isSelected = idx === currentIndex;
                        return (
                          <button
                            key={family.id}
                            type="button"
                            onClick={() => handleManualSelectFamily(idx)}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                              isSelected
                                ? "bg-white text-black border-white shadow-lg scale-105"
                                : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            {family.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Card Central */}
                  <StudioStageCard
                    family={currentFamily}
                    aspectRatio={aspectRatio}
                    onSelect={handleOpenAuth}
                  />

                  {/* Seletor de Proporções */}
                  <div className="flex items-center justify-center gap-2 pt-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-white/35 mr-1 font-mono">Formato:</span>
                    {[
                      { id: "1:1", label: "1:1 Feed", icon: Square },
                      { id: "5:6", label: "5:6 Retrato", icon: Layers },
                      { id: "9:16", label: "9:16 Stories", icon: Smartphone },
                    ].map((f) => {
                      const Icon = f.icon;
                      const isSelected = aspectRatio === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setAspectRatio(f.id as any)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all cursor-pointer ${
                            isSelected
                              ? "bg-white/20 border-white/40 text-white"
                              : "bg-white/4 border-white/8 text-white/50 hover:bg-white/8 hover:text-white"
                          }`}
                        >
                          <Icon size={12} />
                          <span>{f.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="empty-stage"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center gap-3 p-12 rounded-[28px] border border-white/8 bg-white/2 backdrop-blur-sm max-w-sm mx-auto"
                >
                  <div className="w-10 h-10 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center text-[oklch(0.78_0.22_48)] animate-pulse">
                    <Sparkles size={20} />
                  </div>
                  <span className="text-xs font-mono uppercase tracking-[0.22em] text-white/40">
                    Aguardando insumo criativo...
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        {/* 3. Footer Minimalista & Discreto */}
        <footer className="relative z-20 py-4 px-6 text-center text-xs text-white/35 flex items-center justify-between max-w-7xl mx-auto w-full">
          <span>© {new Date().getFullYear()} PostSpark</span>
          <span className="text-[11px] text-white/25">Direção de Arte & Inteligência Visual</span>
        </footer>
      </div>

      {/* Modal de Autenticação */}
      <StudioAuthModal
        isOpen={isAuthOpen}
        isMobile={isMobile}
        onClose={handleCloseAuth}
        initialPrompt={currentFamily.rawPrompt}
      />
    </div>
  );
}
