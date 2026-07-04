/**
 * HeroDemo.tsx - Seção 1: Hero "Demo Viva"
 *
 * Demo 100% scriptada no client — zero chamada de API.
 * Geração real custa Sparks e exige auth; a demo usa fixtures pré-fabricadas.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SparkLogo from "@/components/SparkLogo";
import OrganicBackground from "@/components/OrganicBackground";
import PostRenderer from "@/components/PostRenderer";
import { handleGoogleOAuthOnly } from "@/components/auth";
import { defaultLandingDemo, initializeLandingDemoSnapshots, type LandingDemoFixture } from "@/lib/landingDemoFixtures";
import { analytics } from "@/lib/analytics";
import type { PostVisualSnapshot } from "@shared/postspark";

type DemoPhase = "idle" | "typing" | "synthesizing" | "rendering" | "complete";

// Spring values consistentes com o motion system
const SPRING_ENTRY = { stiffness: 260, damping: 30 };
const SPRING_MATERIALIZE = { stiffness: 200, damping: 26 };

export default function HeroDemo() {
  const [activeFixture, setActiveFixture] = useState<LandingDemoFixture>(defaultLandingDemo);
  const [fixtures, setFixtures] = useState<LandingDemoFixture[]>([]);
  const [demoPhase, setDemoPhase] = useState<DemoPhase>("idle");
  const [typedText, setTypedText] = useState("");
  const [synthesisLabel, setSynthesisLabel] = useState("Lendo sua ideia…");
  const [showEditHandles, setShowEditHandles] = useState(false);
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const synthesisTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Detect prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setIsReducedMotion(mediaQuery.matches);
    const handler = () => setIsReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Inicializar snapshots das fixtures
  useEffect(() => {
    const initialized = initializeLandingDemoSnapshots();
    setFixtures(initialized);
    setActiveFixture(initialized[0]);
  }, []);

  // Roteiro da demo scriptada
  const runDemoScript = useCallback((fixture: LandingDemoFixture) => {
    if (isReducedMotion) {
      // Fallback: pular direto para o estado final
      setTypedText(fixture.typedPrompt);
      setDemoPhase("complete");
      return;
    }

    // Resetar estado
    setDemoPhase("typing");
    setTypedText("");
    setShowEditHandles(false);

    // Limpar timers anteriores
    if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
    if (synthesisTimeoutRef.current) clearTimeout(synthesisTimeoutRef.current);

    // Fase 1: Digitação automática (~35ms/char)
    let charIndex = 0;
    const text = fixture.typedPrompt;

    typingIntervalRef.current = setInterval(() => {
      if (charIndex < text.length) {
        setTypedText(text.slice(0, charIndex + 1));
        charIndex++;
      } else {
        clearInterval(typingIntervalRef.current!);

        // Fase 2: Síntese (~1.2s)
        setDemoPhase("synthesizing");
        setSynthesisLabel("Lendo sua ideia…");

        synthesisTimeoutRef.current = setTimeout(() => {
          setSynthesisLabel("Desenhando 3 direções…");

          // Fase 3: Materialização dos posts
          setTimeout(() => {
            setDemoPhase("rendering");
          }, 600);
        }, 600);
      }
    }, 35);
  }, [isReducedMotion]);

  // Mostrar handles de edição fake por 1.5s após renderização
  useEffect(() => {
    if (demoPhase === "rendering") {
      const timer = setTimeout(() => {
        setShowEditHandles(true);
        setDemoPhase("complete");

        // Esconder handles após 1.5s
        setTimeout(() => {
          setShowEditHandles(false);
        }, 1500);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [demoPhase]);

  // Executar demo quando a fixture mudar
  useEffect(() => {
    if (fixtures.length > 0 && activeFixture) {
      runDemoScript(activeFixture);
    }
  }, [activeFixture, fixtures, runDemoScript]);

  // Handlers
  const handleCtaClick = () => {
    analytics.trackEvent("cta_click_hero");
    handleGoogleOAuthOnly().catch(console.error);
  };

  const handleChipClick = (fixture: LandingDemoFixture) => {
    analytics.trackEvent("demo_prompt_selected", { demoId: fixture.id });
    setActiveFixture(fixture);
  };

  const handleReplay = () => {
    analytics.trackEvent("demo_replay");
    runDemoScript(activeFixture);
  };

  const handleOpenLoginDrawer = () => {
    analytics.trackEvent("login_link_click_hero");
    // TODO: abrir drawer de login existente (reusar do TheVoid2)
  };

  return (
    <section className="relative min-h-dvh flex items-center justify-center overflow-hidden">
      <OrganicBackground />

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-4 md:px-12">
        <div className="flex items-center justify-center w-8 h-8">
          <SparkLogo size={32} />
        </div>
        <button
          onClick={handleOpenLoginDrawer}
          className="text-sm text-[--text-secondary] hover:text-white transition-colors"
        >
          Entrar
        </button>
      </header>

      <div className="container mx-auto px-4 md:px-8 pt-20 pb-8">
        <div className="grid md:grid-cols-12 gap-8 items-center">
          {/* Coluna esquerda: Copy + CTA (desktop: 45%) */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING_ENTRY}
            className="md:col-span-5 space-y-6"
          >
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 16 },
                visible: { opacity: 1, y: 0 },
              }}
              initial="hidden"
              animate="visible"
              transition={{ staggerChildren: 0.08 }}
            >
              <h1 className="font-['Space_Grotesk'] text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.1] text-white">
                Sua ideia entra cruda.<br />
                Sai um post profissional.
              </h1>

              <p className="font-['Inter'] text-lg md:text-xl text-[--text-secondary] max-w-md">
                Escreva como você fala. O PostSpark transforma em 3 versões de post ou carrossel — design, copy e legenda — prontas para editar e publicar.
              </p>

              <button
                onClick={handleCtaClick}
                className="group relative w-full md:w-auto px-8 py-4 bg-[oklch(0.7_0.22_40)] hover:bg-[oklch(0.72_0.22_40)] text-white font-['Space_Grotesk'] font-semibold text-lg rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg hover:shadow-[oklch(0.7_0.22_40)/25%]"
              >
                <span className="relative z-10">Criar meu primeiro post grátis</span>
                <span className="block mt-1 text-xs font-['Inter'] font-normal text-white/80">
                  Google · sem cartão · em 30 segundos
                </span>
              </button>
            </motion.div>
          </motion.div>

          {/* Coluna direita: Demo palco (desktop: 55%) */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING_ENTRY}
            className="md:col-span-7"
          >
            <DemoStage
              fixture={activeFixture}
              typedText={typedText}
              phase={demoPhase}
              synthesisLabel={synthesisLabel}
              showEditHandles={showEditHandles}
              snapshots={activeFixture.snapshots}
            />
          </motion.div>
        </div>

        {/* Chips de prompt */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, ...SPRING_ENTRY }}
          className="flex flex-wrap gap-3 justify-center mt-8"
        >
          {fixtures.map((fixture) => (
            <button
              key={fixture.id}
              onClick={() => handleChipClick(fixture)}
              className={`px-4 py-2 rounded-full font-['Inter'] text-sm transition-all ${
                activeFixture.id === fixture.id
                  ? "bg-[--color-cyber-cyan] text-black font-semibold"
                  : "bg-white/5 text-[--text-secondary] hover:bg-white/10"
              }`}
            >
              {fixture.chipLabel}
            </button>
          ))}
        </motion.div>

        {/* Botão replay */}
        {demoPhase === "complete" && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={handleReplay}
            className="mt-6 mx-auto block text-sm text-[--text-secondary] hover:text-white transition-colors flex items-center gap-2"
          >
            <span>↻</span> ver de novo
          </motion.button>
        )}
      </div>
    </section>
  );
}

// Subcomponente: DemoStage
function DemoStage({
  fixture,
  typedText,
  phase,
  synthesisLabel,
  showEditHandles,
  snapshots,
}: {
  fixture: LandingDemoFixture;
  typedText: string;
  phase: DemoPhase;
  synthesisLabel: string;
  showEditHandles: boolean;
  snapshots: PostVisualSnapshot[];
}) {
  return (
    <div className="relative w-full h-[55svh] md:h-[600px] bg-[--surface-void] rounded-2xl border border-[--glass-border] overflow-hidden shadow-2xl">
      {/* Input simulado */}
      <motion.div
        className="absolute top-8 left-1/2 -translate-x-1/2 w-[90%] max-w-md z-10"
        animate={{
          scale: phase === "synthesizing" ? 1.03 : 1,
          boxShadow:
            phase === "synthesizing"
              ? "0 0 30px oklch(0.75_0.14_200/30%), 0 0 60px oklch(0.75_0.14_200/20%)"
              : "0 4px 20px rgba(0,0,0,0.3)",
        }}
        transition={{ duration: 0.3 }}
      >
        <div className="relative w-full px-4 py-3 bg-[--surface-base] rounded-xl border border-white/10">
          <input
            readOnly
            value={typedText}
            placeholder="Sua ideia..."
            className="w-full bg-transparent font-['Inter'] text-white placeholder:text-white/30 outline-none"
          />
          {phase === "typing" && (
            <motion.span
              className="absolute right-4 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[--color-cyber-cyan]"
              animate={{ opacity: [1, 0] }}
              transition={{ repeat: Infinity, duration: 0.9 }}
            />
          )}
        </div>
      </motion.div>

      {/* Labels de progresso */}
      <AnimatePresence mode="wait">
        {phase === "synthesizing" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute top-24 left-1/2 -translate-x-1/2 text-center z-10"
          >
            <p className="font-['Inter'] text-sm text-[--color-cyber-cyan]">{synthesisLabel}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Posts materializados */}
      <AnimatePresence mode="wait">
        {(phase === "rendering" || phase === "complete") && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center p-8"
          >
            <div className="relative w-full h-full flex items-center justify-center gap-4">
              {/* Leque de posts no desktop, stack peek no mobile */}
              {snapshots.map((snapshot, index) => (
                <PostWithHandles
                  key={snapshot.id}
                  snapshot={snapshot}
                  index={index}
                  total={3}
                  showHandles={showEditHandles && index === 1}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Subcomponente: PostWithHandles
function PostWithHandles({
  snapshot,
  index,
  total,
  showHandles,
}: {
  snapshot: PostVisualSnapshot;
  index: number;
  total: number;
  showHandles: boolean;
}) {
  // Calcular posição e rotação finas (leque no desktop, peek no mobile)
  const isMiddle = index === 1;
  const offsetX = isMiddle ? 0 : index === 0 ? -12 : 12;
  const rotation = isMiddle ? 0 : index === 0 ? -4 : 4;
  const scale = isMiddle ? 1 : 0.92;

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.9, rotate: rotation === 0 ? 0 : rotation * 2 }}
      animate={{ opacity: 1, y: 0, scale, rotate: rotation }}
      transition={{ delay: index * 0.15, ...SPRING_MATERIALIZE }}
      className={`relative ${!isMiddle ? "hidden md:block" : ""}`}
      style={{
        transform: `translateX(${offsetX}px)`,
      }}
    >
      <div className="relative w-full h-full max-w-[280px] aspect-square">
        {/* Post */}
        <div className="relative w-full h-full rounded-xl overflow-hidden shadow-2xl">
          <PostRenderer mode="preview" snapshot={snapshot} compact />
        </div>

        {/* Handles fake */}
        <AnimatePresence>
          {showHandles && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="absolute inset-0 border-2 border-[--color-cyber-cyan] rounded-xl pointer-events-none"
            >
              <div className="absolute -top-2 -left-2 w-4 h-4 bg-[--color-cyber-cyan] rounded-full" />
              <div className="absolute -top-2 -right-2 w-4 h-4 bg-[--color-cyber-cyan] rounded-full" />
              <div className="absolute -bottom-2 -left-2 w-4 h-4 bg-[--color-cyber-cyan] rounded-full" />
              <div className="absolute -bottom-2 -right-2 w-4 h-4 bg-[--color-cyber-cyan] rounded-full" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
