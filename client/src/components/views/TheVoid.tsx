import { motion, AnimatePresence } from "framer-motion";
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
  selectedModel: AiModel;
  onModelChange: (model: AiModel) => void;
}

export default function TheVoid({ onSubmit, isLoading, postMode, onPostModeChange, selectedModel, onModelChange }: TheVoidProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [inputText, setInputText] = useState("");
  const { state, config, confidence } = useAmbientIntelligence(inputText);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

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

  // ── Badge de estado ambiental ──────────────────────────────────────────────
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

  // ── Input com glow ambiente ────────────────────────────────────────────────
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
        selectedModel={selectedModel}
        onModelChange={onModelChange}
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
    >
      {/* Fundo orgânico — sutil, para não competir com os sparks */}
      <OrganicBackground
        accentColor={isAmbientActive ? config.theme.accent : "#6d28d9"}
        intensity={isAmbientActive ? 0.22 : 0.08}
      />

      <SparkParticles count={isMobile ? 20 : 35} />

      {/* MOBILE LAYOUT — logo e input agrupados no centro vertical */}
      {isMobile && (
        <motion.div
          className="relative z-10 w-full h-full flex flex-col items-center justify-center px-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          {/* Bloco unificado: logo + input lado a lado verticalmente */}
          <motion.div
            className="w-full flex flex-col items-center gap-7"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            {/* Logo + Tagline compactos */}
            <motion.div
              className="flex flex-col items-center gap-2"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
            >
              <SparkLogo size={40} />
              <div className="text-center">
                <h1
                  className="text-2xl font-bold tracking-tight"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  <span className="text-foreground">Post</span>
                  <span style={{ color: "oklch(0.7 0.22 40)" }}>Spark</span>
                </h1>
                <p
                  className="text-xs mt-1"
                  style={{ color: "oklch(0.5 0.03 280)" }}
                >
                  Capture a alma. Crie o novo.
                </p>
              </div>
            </motion.div>

            {/* Input + Badge */}
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

          {/* Hint discreto no fundo */}
          <motion.p
            className="absolute bottom-8 text-[11px] text-center"
            style={{ color: "oklch(0.38 0.03 280)" }}
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
          className="relative z-10 w-full flex flex-col items-center justify-center gap-8 h-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          {/* Logo + Title */}
          <motion.div
            className="flex flex-col items-center gap-4"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <SparkLogo size={56} />
            <div className="text-center">
              <h1
                className="text-4xl font-bold tracking-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                <span className="text-foreground">Post</span>
                <span style={{ color: "oklch(0.7 0.22 40)" }}>Spark</span>
              </h1>
              <motion.p
                className="text-sm mt-2"
                style={{ color: "oklch(0.55 0.03 280)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                Capture a alma. Crie o novo.
              </motion.p>
            </div>
          </motion.div>

          {/* Smart Input + Badge */}
          <motion.div
            className="w-full max-w-2xl flex flex-col items-center gap-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            {smartInputWithGlow}
            {ambientBadge}
          </motion.div>

          {/* Hint teclado — desktop */}
          <motion.p
            className="text-[11px] text-center"
            style={{ color: "oklch(0.35 0.02 280)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4 }}
          >
            Cole uma URL, descreva uma ideia ou envie uma imagem
          </motion.p>
        </motion.div>
      )}
    </motion.div>
  );
}
