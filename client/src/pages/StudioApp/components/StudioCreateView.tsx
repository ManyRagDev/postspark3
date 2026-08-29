import { useState, useEffect } from "react";
import { ArrowRight, Layers, Link2, Loader2, Sparkles, Type } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import OrganicBackground from "@/components/OrganicBackground";
import SparkParticles from "@/components/SparkParticles";

interface StudioCreateViewProps {
  onSubmit: (prompt: string, mode: "static" | "carousel") => void;
  isLoading: boolean;
}

const QUICK_IDEAS = [
  "3 sinais de que sua marca parece amadora",
  "Por que marcas de luxo não competem por preço",
  "O erro fatal que destrói o engajamento no Instagram",
  "Como precificar seus serviços com autoridade",
];

const PROGRESS_STAGES = [
  { text: "Sintetizando intenção e psicologia da mensagem...", percent: 30 },
  { text: "Escrevendo copywriting autoral e ganchos...", percent: 65 },
  { text: "Calibrando direções de arte e tipografia...", percent: 90 },
];

const URL_REGEX = /^(https?:\/\/|www\.)[^\s]+\.[^\s]{2,}/i;

export default function StudioCreateView({ onSubmit, isLoading }: StudioCreateViewProps) {
  const [prompt, setPrompt] = useState("");
  const [postMode, setPostMode] = useState<"static" | "carousel">("static");
  const [stageIndex, setStageIndex] = useState(0);

  const isUrl = URL_REGEX.test(prompt.trim());

  useEffect(() => {
    if (!isLoading) {
      setStageIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setStageIndex((prev) => (prev < PROGRESS_STAGES.length - 1 ? prev + 1 : prev));
    }, 1100);
    return () => clearInterval(interval);
  }, [isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    onSubmit(prompt.trim(), postMode);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 max-w-3xl mx-auto w-full text-center relative select-none z-10 my-auto">
      {/* ─── 1. ATMOSFERA MÁGICA DE FUNDO ─── */}
      <OrganicBackground accentColor="#E5A93C" intensity={0.16} />
      <SparkParticles count={14} variant="subtle" />

      {/* ─── 2. HERO BADGE ILUMINADO ─── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="inline-flex items-center gap-2 bg-white/6 px-4 py-1.5 rounded-full border border-white/10 text-xs font-mono text-white/90 mb-5 backdrop-blur-md shadow-lg"
      >
        <Sparkles size={13} className="text-[oklch(0.78_0.22_48)] animate-pulse" />
        <span>Estúdio de Criação • IA Manifest</span>
      </motion.div>

      {/* ─── 3. TÍTULO MONUMENTAL COM GRADIENTE DE LUZ ─── */}
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white mb-3 sm:mb-4 leading-tight"
      >
        O que você quer <br className="hidden sm:inline" />
        <span className="bg-gradient-to-r from-white via-white/90 to-white/60 bg-clip-text text-transparent">
          manifestar hoje?
        </span>
      </motion.h1>

      <p className="text-xs sm:text-sm md:text-base text-white/60 mb-6 sm:mb-8 max-w-lg px-2 leading-relaxed">
        A centelha que transforma ideias, URLs e visões em posts e carrosséis de alto padrão para suas redes.
      </p>

      {/* ─── 4. SELETOR DE FORMATO (ESTÁTICO / CARROSSEL) ─── */}
      <div className="flex items-center gap-2 bg-white/6 p-1.5 rounded-2xl border border-white/10 mb-6 backdrop-blur-md shadow-md">
        <button
          type="button"
          onClick={() => setPostMode("static")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            postMode === "static"
              ? "bg-white text-black shadow-lg"
              : "text-white/60 hover:text-white hover:bg-white/5"
          }`}
        >
          <Type size={14} />
          <span>Post Único (Capa)</span>
        </button>
        <button
          type="button"
          onClick={() => setPostMode("carousel")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            postMode === "carousel"
              ? "bg-white text-black shadow-lg"
              : "text-white/60 hover:text-white hover:bg-white/5"
          }`}
        >
          <Layers size={14} />
          <span>Carrossel Narrativo</span>
        </button>
      </div>

      {/* ─── 5. CAIXA DE TEXTO BRILHANTE (THEVOID GLOW HYBRID) ─── */}
      <form onSubmit={handleSubmit} className="w-full relative z-10 mb-6">
        <div
          className="relative rounded-2xl p-1.5 backdrop-blur-2xl transition-all duration-300 border focus-within:border-[oklch(0.78_0.22_48)]"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)",
            borderColor: isUrl ? "rgba(56, 189, 248, 0.4)" : "rgba(255, 255, 255, 0.12)",
            boxShadow: isUrl
              ? "0 0 35px rgba(56, 189, 248, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.1)"
              : "0 0 35px rgba(229, 169, 60, 0.16), 0 20px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
          }}
        >
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              postMode === "carousel"
                ? "Ex: 4 passos práticos para estruturar uma oferta de consultoria premium..."
                : "Ex: 3 sinais de que sua marca parece amadora e como resolver isso com design..."
            }
            className="w-full bg-transparent p-3 sm:p-4 text-sm sm:text-base text-white placeholder-white/30 outline-none resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />

          <div className="flex items-center justify-between px-3 pb-2 pt-1.5 border-t border-white/8">
            {/* Detecção Inteligente de Modo */}
            <div className="flex items-center gap-2">
              {isUrl ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-500/15 border border-sky-500/30 text-sky-300 text-[11px] font-mono">
                  <Link2 size={12} />
                  <span>Modo Extração de URL</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-white/50 text-[11px] font-mono">
                  <Sparkles size={11} className="text-[oklch(0.78_0.22_48)]" />
                  <span>Modo Criativo</span>
                </div>
              )}
              <span className="hidden sm:inline text-[11px] text-white/30 font-mono">↵ Enter</span>
            </div>

            {/* Botão de Ação com Gradiente Vibrante */}
            <button
              type="submit"
              disabled={!prompt.trim() || isLoading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-black shadow-lg transition-all hover:scale-105 hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 cursor-pointer"
              style={{
                background: "linear-gradient(135deg, oklch(0.78 0.22 48), oklch(0.65 0.2 28))",
                boxShadow: "0 0 24px oklch(0.7 0.22 40 / 45%)",
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={15} className="animate-spin text-black" />
                  <span>Sintetizando...</span>
                </>
              ) : (
                <>
                  <span>Manifestar Posts</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* ─── 6. DOCK DE PROGRESSO EM TEMPO REAL ─── */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-md p-4 rounded-2xl bg-white/6 border border-white/10 backdrop-blur-xl mb-6 space-y-2"
          >
            <div className="flex items-center justify-between text-xs text-white/80 font-medium">
              <span className="animate-pulse">{PROGRESS_STAGES[stageIndex].text}</span>
              <span className="font-mono text-[oklch(0.78_0.22_48)] font-bold">
                {PROGRESS_STAGES[stageIndex].percent}%
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-[oklch(0.78_0.22_48)]"
                initial={{ width: "10%" }}
                animate={{ width: `${PROGRESS_STAGES[stageIndex].percent}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── 7. SUGESTÕES E INSPIRAÇÕES RÁPIDAS ─── */}
      {!isLoading && (
        <div className="w-full space-y-2.5">
          <div className="text-[11px] uppercase tracking-wider text-white/40 font-mono">
            Ideias para começar
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {QUICK_IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => setPrompt(idea)}
                className="text-xs px-3.5 py-1.5 rounded-full bg-white/4 border border-white/8 text-white/70 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all cursor-pointer text-left"
              >
                ✦ {idea}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
