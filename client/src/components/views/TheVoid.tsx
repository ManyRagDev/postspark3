import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
} from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import type { CreationMode, InputType, PostMode } from "@shared/postspark";
import { useAmbientIntelligence } from "@/hooks/useAmbientIntelligence";
import OrganicBackground from "../OrganicBackground";
import SparkLogo from "../SparkLogo";
import SparkParticles from "../SparkParticles";
import SmartInput from "../SmartInput";

interface TheVoidProps {
  onSubmit: (value: string, type: InputType, detectedState?: string) => void;
  isLoading: boolean;
  postMode: PostMode;
  onPostModeChange: (mode: PostMode) => void;
  creationMode: CreationMode;
  onCreationModeChange: (mode: CreationMode) => void;
}

const BACKGROUND_CARDS = [
  {
    id: 1,
    glow: "orange",
    img: "https://images.unsplash.com/photo-1558655146-d09347e92766?w=300&q=80",
    title: "10 Dicas de Design",
    text: "Descubra as tendencias visuais que vao dominar o mercado.",
    stats: "2.5k  120",
    style: { bottom: "10%", left: "5%", rotate: "-18deg", zIndex: 2 },
  },
  {
    id: 2,
    glow: "blue",
    img: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=300&q=80",
    title: "A Nova Era do SEO",
    text: "Como otimizar conteudos na era das IAs.",
    stats: "1.1k  45",
    style: { bottom: "25%", left: "18%", rotate: "12deg", zIndex: 1 },
  },
  {
    id: 3,
    glow: "orange",
    img: "https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=300&q=80",
    title: "Rumo a Criatividade",
    text: "Destaque-se com cores vibrantes.",
    stats: "4.8k  310",
    style: { bottom: "5%", left: "28%", rotate: "-8deg", zIndex: 3 },
  },
  {
    id: 4,
    glow: "blue",
    img: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=300&q=80",
    title: "Cafe e Criatividade",
    text: "Organizando ideias com uma dose de cafeina.",
    stats: "890  12",
    style: { bottom: "-10%", left: "42%", rotate: "5deg", zIndex: 4 },
  },
  {
    id: 5,
    glow: "orange",
    img: "https://images.unsplash.com/photo-1516383740770-fbcc5ccbece0?w=300&q=80",
    title: "Conteudo B2B",
    text: "Estrategias para gerar leads no LinkedIn.",
    stats: "3.2k  150",
    style: { bottom: "20%", left: "50%", rotate: "-12deg", zIndex: 2 },
  },
  {
    id: 6,
    glow: "blue",
    img: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=300&q=80",
    title: "O Futuro das Redes",
    text: "Como a Web3 vai impactar comunidades.",
    stats: "5.6k  420",
    style: { bottom: "15%", right: "28%", rotate: "15deg", zIndex: 3 },
  },
  {
    id: 7,
    glow: "orange",
    img: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&q=80",
    title: "Campanha Lancamento",
    text: "Tenis esportivo edicao limitada.",
    stats: "12k  800",
    style: { bottom: "-5%", right: "15%", rotate: "-22deg", zIndex: 5 },
  },
  {
    id: 8,
    glow: "blue",
    img: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=300&q=80",
    title: "Analise de Dados",
    text: "Metricas que realmente importam no trafego.",
    stats: "2.1k  98",
    style: { bottom: "30%", right: "8%", rotate: "25deg", zIndex: 1 },
  },
  {
    id: 9,
    glow: "orange",
    img: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=300&q=80",
    title: "Setup Gamer 2024",
    text: "Inspiracoes para o ambiente perfeito.",
    stats: "8.5k  500",
    style: { bottom: "45%", left: "-2%", rotate: "35deg", zIndex: 0 },
  },
  {
    id: 10,
    glow: "blue",
    img: "https://images.unsplash.com/photo-1616469829941-c7200edec809?w=300&q=80",
    title: "Minimalismo Digital",
    text: "Reduza ruidos no seu design de interface.",
    stats: "4.3k  215",
    style: { bottom: "40%", right: "-2%", rotate: "-30deg", zIndex: 0 },
  },
] as const;

export default function TheVoid({
  onSubmit,
  isLoading,
  postMode,
  onPostModeChange,
  creationMode,
  onCreationModeChange,
}: TheVoidProps) {
  const EXECUTION_ACCENT = "oklch(0.74 0.16 72)";
  const [isMobile, setIsMobile] = useState(false);
  const [inputText, setInputText] = useState("");
  const { state, config, confidence } = useAmbientIntelligence(inputText);

  const mouseX = useMotionValue(typeof window !== "undefined" ? window.innerWidth / 2 : 0);
  const mouseY = useMotionValue(typeof window !== "undefined" ? window.innerHeight / 2 : 0);
  const smoothX = useSpring(mouseX, { damping: 50, stiffness: 400 });
  const smoothY = useSpring(mouseY, { damping: 50, stiffness: 400 });

  useEffect(() => {
    const updateViewportMode = () => {
      const width = window.innerWidth;
      const nav = navigator as Navigator & { deviceMemory?: number };
      const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const lowMemory = typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4;
      const lowCpu = typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4;
      const mobile = width < 768;

      setIsMobile(mobile);
    };

    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);
    return () => window.removeEventListener("resize", updateViewportMode);
  }, []);

  useEffect(() => {
    if (!isMobile) return;

    let animationFrameId = 0;
    let time = 0;

    const animate = () => {
      time += 0.015;
      const w = window.innerWidth;
      const h = window.innerHeight;

      mouseX.set(w / 2 + Math.sin(time) * (w * 0.4));
      mouseY.set(h / 2 + Math.cos(time * 0.7) * (h * 0.35));
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animationFrameId);
  }, [isMobile, mouseX, mouseY]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isMobile) {
        mouseX.set(e.clientX);
        mouseY.set(e.clientY);
      }
    },
    [isMobile, mouseX, mouseY]
  );

  const spotlightMask = useMotionTemplate`radial-gradient(circle 400px at ${smoothX}px ${smoothY}px, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.4) 40%, rgba(0, 0, 0, 0.03) 80%)`;
  const lightBeamTransform = useMotionTemplate`translate(calc(${smoothX}px - 50%), calc(${smoothY}px - 50%))`;

  const handleTextChange = useCallback((text: string) => {
    setInputText(text);
  }, []);

  const handleSubmit = useCallback(
    (value: string, type: InputType) => {
      const tone = state !== "neutral" && confidence > 40 ? state : undefined;
      onSubmit(value, type, tone);
    },
    [confidence, onSubmit, state]
  );

  const isAmbientActive = state !== "neutral" && confidence > 40;
  const glowColor = isAmbientActive ? config.theme.accent : undefined;
  const surfaceAccent = creationMode === "execution"
    ? EXECUTION_ACCENT
    : isAmbientActive
      ? config.theme.accent
      : "#6d28d9";

  const ambientBadge = (
    <AnimatePresence>
      {isAmbientActive && (
        <motion.div
          key={state}
          initial={{ opacity: 0, y: 8, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.85 }}
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          className="flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold backdrop-blur-md border"
          style={{
            backgroundColor: `${config.theme.accent}18`,
            color: config.theme.accent,
            borderColor: `${config.theme.accent}40`,
            boxShadow: `0 4px 20px ${config.theme.accent}20`,
          }}
        >
          <span className="text-base leading-none">{config.emoji}</span>
          <span>{config.label}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const smartInputWithGlow = (
    <motion.div
      className="w-full"
      animate={{
        filter:
          creationMode === "execution"
            ? `drop-shadow(0 0 18px ${EXECUTION_ACCENT}35)`
            : isAmbientActive && glowColor
              ? `drop-shadow(0 0 20px ${glowColor}50)`
            : "drop-shadow(0 0 0px transparent)",
      }}
      transition={{ duration: 0.5 }}
    >
      <SmartInput
        onSubmit={handleSubmit}
        isLoading={isLoading}
        onTextChange={handleTextChange}
        postMode={postMode}
        onPostModeChange={onPostModeChange}
        creationMode={creationMode}
        onCreationModeChange={onCreationModeChange}
      />
    </motion.div>
  );

  return (
    <motion.div
      className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ backgroundColor: "oklch(0.04 0.06 280)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95, filter: "blur(20px)" }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
      onPointerMove={handlePointerMove}
    >
      <OrganicBackground
        accentColor={surfaceAccent}
        intensity={creationMode === "execution" ? 0.14 : isAmbientActive ? 0.22 : 0.08}
        performanceMode={isMobile ? "reduced" : "full"}
      />
      <SparkParticles
        count={isMobile ? 10 : 18}
        performanceMode={isMobile ? "reduced" : "full"}
        variant="subtle"
      />

      {!isMobile && (
        <motion.div
          className="absolute inset-0 pointer-events-none z-0"
          style={{ WebkitMaskImage: spotlightMask, maskImage: spotlightMask }}
        >
          <motion.div
            className="absolute top-0 left-0 w-[800px] h-[800px] rounded-full pointer-events-none mix-blend-screen"
            style={{
              background:
                "radial-gradient(circle, rgba(255, 140, 60, 0.15) 0%, rgba(138, 180, 248, 0.05) 40%, transparent 70%)",
              transform: lightBeamTransform,
            }}
          />

          {BACKGROUND_CARDS.map((card) => {
            const isOrange = card.glow === "orange";
            const glowColor = isOrange
              ? "rgba(255, 107, 43, 0.22)"
              : "rgba(138, 180, 248, 0.22)";
            const glowBorder = isOrange
              ? "rgba(255, 107, 43, 0.3)"
              : "rgba(138, 180, 248, 0.3)";

            return (
              <div
                key={card.id}
                className="absolute w-[200px] h-[250px] rounded-xl flex flex-col gap-2.5 p-2.5 transition-transform"
                style={{
                  ...card.style,
                  background: "rgba(15, 17, 26, 0.85)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  backdropFilter: "blur(12px)",
                  boxShadow: `0 15px 35px rgba(0, 0, 0, 0.9), 0 0 20px ${glowColor}, inset 0 0 0 1px ${glowBorder}`,
                }}
              >
                <div className="w-full h-[120px] rounded-md relative overflow-hidden bg-[#1a1b26]">
                  <img
                    src={card.img}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover opacity-80"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0f111a]/90" />
                </div>
                <div className="flex flex-col gap-1.5 flex-1 z-10">
                  <div className="text-xs font-bold text-[#f1f1f1] leading-tight">{card.title}</div>
                  <div className="text-[9px] text-[#888] leading-relaxed line-clamp-2">{card.text}</div>
                </div>
                <div className="mt-auto pt-1.5 border-t border-white/5 text-[8px] text-[#666] flex justify-between tracking-wide z-10">
                  {card.stats}
                </div>
              </div>
            );
          })}
        </motion.div>
      )}

      {isMobile && (
        <motion.div
          className="relative z-10 w-full h-full overflow-y-auto pointer-events-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          <div className="relative min-h-[100svh] px-5 pb-[calc(env(safe-area-inset-bottom,0px)+36px)] pt-[max(20px,env(safe-area-inset-top,0px)+12px)]">
            <motion.div
              className="mx-auto flex min-h-[calc(100svh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-56px)] w-full max-w-[21.5rem] flex-col items-center justify-center gap-7"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            >
              <motion.div
                className="flex flex-col items-center gap-3 text-center"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.12 }}
              >
                <SparkLogo size={126} />
                <div className="space-y-1.5">
                  <h1
                    className="text-[2rem] font-bold tracking-[-0.045em] leading-none"
                    style={{ fontFamily: "var(--font-display)", textShadow: "0 4px 20px rgba(0,0,0,0.45)" }}
                  >
                    <span className="text-foreground">Post</span>
                    <span style={{ color: "oklch(0.7 0.22 40)" }}>Spark</span>
                  </h1>
                  <p className="mx-auto max-w-[22ch] text-[13px] leading-relaxed text-white/62">
                    Capture a alma. Crie o novo.
                  </p>
                </div>
              </motion.div>

              <motion.div
                className="w-full"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.24 }}
              >
                {smartInputWithGlow}
              </motion.div>

              <motion.div
                className="flex min-h-8 items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.32 }}
              >
                {ambientBadge}
              </motion.div>

            </motion.div>
          </div>
        </motion.div>
      )}

      {!isMobile && (
        <motion.div
          className="relative z-10 w-full flex flex-col items-center justify-center gap-8 h-full pointer-events-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          <motion.div
            className="flex flex-col items-center gap-4 drop-shadow-2xl"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <SparkLogo size={56} />
            <div className="text-center">
              <h1
                className="text-4xl font-bold tracking-tight"
                style={{ fontFamily: "var(--font-display)", textShadow: "0 4px 20px rgba(0,0,0,0.6)" }}
              >
                <span className="text-foreground">Post</span>
                <span style={{ color: "oklch(0.7 0.22 40)" }}>Spark</span>
              </h1>
              <motion.p
                className="text-sm mt-2 font-light"
                style={{ color: "rgba(255,255,255,0.6)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                Capture a alma. Crie o novo.
              </motion.p>
            </div>
          </motion.div>

          <motion.div
            className="w-full max-w-2xl flex flex-col items-center gap-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            {smartInputWithGlow}
            {ambientBadge}
          </motion.div>

        </motion.div>
      )}
    </motion.div>
  );
}
