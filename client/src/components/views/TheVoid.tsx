import { motion, AnimatePresence, useMotionValue, useSpring, useMotionTemplate } from "framer-motion";
import { useEffect, useState, useCallback } from "react";
import SparkLogo from "../SparkLogo";
import SmartInput from "../SmartInput";
import SparkParticles from "../SparkParticles";
import OrganicBackground from "../OrganicBackground";
import type { InputType, PostMode, AiModel } from "@shared/postspark";
import { useAmbientIntelligence } from "@/hooks/useAmbientIntelligence";

interface TheVoidProps {
  onSubmit: (value: string, type: InputType, detectedState?: string) => void;
  isLoading: boolean;
  postMode: PostMode;
  onPostModeChange: (mode: PostMode) => void;
}

// ─── Dados Simulados dos Cartões (Background) ─────────────────────────────────
const BACKGROUND_CARDS = [
  { id: 1, glow: 'orange', img: 'https://images.unsplash.com/photo-1558655146-d09347e92766?w=300&q=80', title: '10 Dicas de Design', text: 'Descubra as tendências visuais que vão dominar o mercado.', stats: '❤️ 2.5k  💬 120', style: { bottom: '10%', left: '5%', rotate: '-18deg', zIndex: 2 } },
  { id: 2, glow: 'blue', img: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=300&q=80', title: 'A Nova Era do SEO', text: 'Como otimizar conteúdos na era das IAs.', stats: '❤️ 1.1k  💬 45', style: { bottom: '25%', left: '18%', rotate: '12deg', zIndex: 1 } },
  { id: 3, glow: 'orange', img: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=300&q=80', title: 'Rumo à Criatividade', text: 'Destaque-se com cores vibrantes.', stats: '❤️ 4.8k  💬 310', style: { bottom: '5%', left: '28%', rotate: '-8deg', zIndex: 3 } },
  { id: 4, glow: 'blue', img: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=300&q=80', title: 'Café e Criatividade', text: 'Organizando ideias com uma dose de cafeína.', stats: '❤️ 890  💬 12', style: { bottom: '-10%', left: '42%', rotate: '5deg', zIndex: 4 } },
  { id: 5, glow: 'orange', img: 'https://images.unsplash.com/photo-1516383740770-fbcc5ccbece0?w=300&q=80', title: 'Conteúdo B2B', text: 'Estratégias para gerar leads no LinkedIn.', stats: '❤️ 3.2k  💬 150', style: { bottom: '20%', left: '50%', rotate: '-12deg', zIndex: 2 } },
  { id: 6, glow: 'blue', img: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=300&q=80', title: 'O Futuro das Redes', text: 'Como a Web3 vai impactar comunidades.', stats: '❤️ 5.6k  💬 420', style: { bottom: '15%', right: '28%', rotate: '15deg', zIndex: 3 } },
  { id: 7, glow: 'orange', img: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&q=80', title: 'Campanha Lançamento', text: 'Tênis esportivo edição limitada.', stats: '❤️ 12k  💬 800', style: { bottom: '-5%', right: '15%', rotate: '-22deg', zIndex: 5 } },
  { id: 8, glow: 'blue', img: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=300&q=80', title: 'Análise de Dados', text: 'Métricas que realmente importam no tráfego.', stats: '❤️ 2.1k  💬 98', style: { bottom: '30%', right: '8%', rotate: '25deg', zIndex: 1 } },
  { id: 9, glow: 'orange', img: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=300&q=80', title: 'Setup Gamer 2024', text: 'Inspirações para o ambiente perfeito.', stats: '❤️ 8.5k  💬 500', style: { bottom: '45%', left: '-2%', rotate: '35deg', zIndex: 0 } },
  { id: 10, glow: 'blue', img: 'https://images.unsplash.com/photo-1616469829941-c7200edec809?w=300&q=80', title: 'Minimalismo Digital', text: 'Reduza ruídos no seu design de interface.', stats: '❤️ 4.3k  💬 215', style: { bottom: '40%', right: '-2%', rotate: '-30deg', zIndex: 0 } },
];

export default function TheVoid({ onSubmit, isLoading, postMode, onPostModeChange }: TheVoidProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [inputText, setInputText] = useState("");
  const { state, config, confidence } = useAmbientIntelligence(inputText);

  // ─── Controle de Luz / Spotlight ─────────────────────────────────────────────
  const mouseX = useMotionValue(typeof window !== 'undefined' ? window.innerWidth / 2 : 0);
  const mouseY = useMotionValue(typeof window !== 'undefined' ? window.innerHeight / 2 : 0);

  // Suavização física para o mouse não parecer robótico no desktop
  const smoothX = useSpring(mouseX, { damping: 50, stiffness: 400 });
  const smoothY = useSpring(mouseY, { damping: 50, stiffness: 400 });

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Loop de animação autônoma para Mobile (Curva de Lissajous)
  useEffect(() => {
    if (!isMobile) return;
    let animationFrameId: number;
    let time = 0;

    const animate = () => {
      time += 0.015; // Velocidade da luz errante
      const w = window.innerWidth;
      const h = window.innerHeight;

      // O centro fica levemente deslocado para baixo por causa do layout
      const x = (w / 2) + Math.sin(time) * (w * 0.4);
      const y = (h / 2) + Math.cos(time * 0.7) * (h * 0.35);

      mouseX.set(x);
      mouseY.set(y);
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animationFrameId);
  }, [isMobile, mouseX, mouseY]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isMobile) {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    }
  }, [isMobile, mouseX, mouseY]);

  // Template dinâmico para a máscara de CSS baseada nas coordenadas suaves
  const spotlightMask = useMotionTemplate`radial-gradient(circle 400px at ${smoothX}px ${smoothY}px, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.4) 40%, rgba(0, 0, 0, 0.03) 80%)`;
  const lightBeamTransform = useMotionTemplate`translate(calc(${smoothX}px - 50%), calc(${smoothY}px - 50%))`;


  // ─── Handlers do Input ───────────────────────────────────────────────────────
  const handleTextChange = useCallback((text: string) => {
    setInputText(text);
  }, []);

  const handleSubmit = useCallback(
    (value: string, type: InputType) => {
      const tone = state !== "neutral" && confidence > 40 ? state : undefined;
      onSubmit(value, type, tone);
    },
    [onSubmit, state, confidence]
  );

  const isAmbientActive = state !== "neutral" && confidence > 40;
  const glowColor = isAmbientActive ? config.theme.accent : undefined;

  // ─── Componentes Visuais ─────────────────────────────────────────────────────
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
          isAmbientActive && glowColor
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
      {/* 1. Fundo orgânico profundo */}
      <OrganicBackground
        accentColor={isAmbientActive ? config.theme.accent : "#6d28d9"}
        intensity={isAmbientActive ? 0.22 : 0.08}
      />

      <SparkParticles count={isMobile ? 20 : 35} />

      {/* 2. Camada dos Cartões Revelados pelo Spotlight */}
      <motion.div
        className="absolute inset-0 pointer-events-none z-0"
        style={{ WebkitMaskImage: spotlightMask, maskImage: spotlightMask }}
      >
        {/* Feixe de Luz de Mistura */}
        <motion.div
          className="absolute top-0 left-0 w-[800px] h-[800px] rounded-full pointer-events-none mix-blend-screen"
          style={{
            background: 'radial-gradient(circle, rgba(255, 140, 60, 0.15) 0%, rgba(138, 180, 248, 0.05) 40%, transparent 70%)',
            transform: lightBeamTransform
          }}
        />

        {/* Cartões Espalhados */}
        {BACKGROUND_CARDS.map((card) => {
          const isOrange = card.glow === 'orange';
          const glowColor = isOrange ? 'rgba(255, 107, 43' : 'rgba(138, 180, 248';

          return (
            <div
              key={card.id}
              className="absolute w-[200px] h-[250px] rounded-xl flex flex-col gap-2.5 p-2.5 transition-transform"
              style={{
                ...card.style,
                background: 'rgba(15, 17, 26, 0.85)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(12px)',
                boxShadow: `0 15px 35px rgba(0, 0, 0, 0.9), 0 0 20px ${glowColor}, 0.15), inset 0 0 0 1px ${glowColor}, 0.3)`,
              }}
            >
              <div className="w-full h-[120px] rounded-md relative overflow-hidden bg-[#1a1b26]">
                <img src={card.img} alt="" className="w-full h-full object-cover opacity-80" />
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

      {/* 3. INTERFACE PRINCIPAL (UI LAYER) */}

      {/* MOBILE LAYOUT */}
      {isMobile && (
        <motion.div
          className="relative z-10 w-full h-full flex flex-col items-center justify-center px-5 pointer-events-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          <motion.div
            className="w-full flex flex-col items-center gap-7"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            <motion.div
              className="flex flex-col items-center gap-2 drop-shadow-2xl"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
            >
              <SparkLogo size={40} />
              <div className="text-center">
                <h1
                  className="text-2xl font-bold tracking-tight"
                  style={{ fontFamily: "var(--font-display)", textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}
                >
                  <span className="text-foreground">Post</span>
                  <span style={{ color: "oklch(0.7 0.22 40)" }}>Spark</span>
                </h1>
                <p
                  className="text-xs mt-1"
                  style={{ color: "rgba(255,255,255,0.6)" }}
                >
                  Capture a alma. Crie o novo.
                </p>
              </div>
            </motion.div>

            <motion.div
              className="w-full flex flex-col items-center gap-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              {smartInputWithGlow}
              <div className="flex justify-center">{ambientBadge}</div>
            </motion.div>
          </motion.div>

          <motion.p
            className="absolute bottom-8 text-[11px] text-center"
            style={{ color: "rgba(255,255,255,0.4)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
          >
            Digite uma ideia ou cole uma URL
          </motion.p>
        </motion.div>
      )}

      {/* DESKTOP LAYOUT */}
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
                style={{ fontFamily: "var(--font-display)", textShadow: '0 4px 20px rgba(0,0,0,0.6)' }}
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

          <motion.p
            className="text-[11px] text-center mt-4"
            style={{ color: "rgba(255,255,255,0.4)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4 }}
          >
            Cole uma URL ou descreva uma ideia
          </motion.p>
        </motion.div>
      )}
    </motion.div>
  );
}