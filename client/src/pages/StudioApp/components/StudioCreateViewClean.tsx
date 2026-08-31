import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Layers, Sparkles, Square, Loader2 } from "lucide-react";

interface StudioCreateViewCleanProps {
  onSubmit: (prompt: string, mode: "static" | "carousel") => void;
  isLoading: boolean;
}

export default function StudioCreateViewClean({
  onSubmit,
  isLoading,
}: StudioCreateViewCleanProps) {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"static" | "carousel">("static");
  const [loadingStep, setLoadingStep] = useState(0);

  const steps = [
    "Sintetizando teses e ganchos...",
    "Orquestrando direções de arte...",
    "Materializando pranchetas...",
  ];

  useEffect(() => {
    if (!isLoading) {
      setLoadingStep(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingStep((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 2400);
    return () => clearInterval(interval);
  }, [isLoading, steps.length]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    onSubmit(prompt.trim(), mode);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative flex-1 flex flex-col justify-between items-center h-[100dvh] w-full overflow-hidden bg-[#06080D] text-white select-none px-4 pb-6 pt-12">
      {/* ─── 1. AURA ATMOSFÉRICA SUPERIOR (O VAZIO VIVO) ─── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[45vh] flex items-center justify-center overflow-hidden">
        {/* Nébula de Luz Radial Suave */}
        <motion.div
          className="absolute w-[340px] h-[340px] md:w-[520px] md:h-[520px] rounded-full blur-[90px] opacity-40"
          style={{
            background:
              "radial-gradient(circle, oklch(0.75 0.22 48 / 65%) 0%, oklch(0.55 0.18 30 / 30%) 45%, transparent 70%)",
          }}
          animate={{
            scale: [1, 1.12, 1],
            opacity: [0.35, 0.55, 0.35],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Glow secundário sutil */}
        <div
          className="absolute -top-20 w-[200px] h-[200px] rounded-full blur-[70px] opacity-25"
          style={{
            background: "radial-gradient(circle, #38bdf8 0%, transparent 70%)",
          }}
        />

        {/* Orbe / Selo Etéreo Superior */}
        <motion.div
          className="relative z-10 flex flex-col items-center gap-2 mt-4"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="w-12 h-12 rounded-full bg-white/4 border border-white/12 backdrop-blur-xl flex items-center justify-center shadow-[0_0_24px_rgba(255,255,255,0.08)]">
            <Sparkles size={18} className="text-[oklch(0.78_0.22_48)]" />
          </div>
          <span className="text-[10px] uppercase font-mono tracking-[0.25em] text-white/40">
            The Void
          </span>
        </motion.div>
      </div>

      {/* ─── 2. ESPAÇO CENTRAL LIVRE & ESTADO DE CARREGAMENTO ─── */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 w-full max-w-lg">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              className="flex flex-col items-center gap-4 text-center px-6"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="relative flex items-center justify-center">
                <div className="w-16 h-16 rounded-full border-2 border-[oklch(0.78_0.22_48)]/20 border-t-[oklch(0.78_0.22_48)] animate-spin" />
                <Sparkles size={20} className="absolute text-[oklch(0.78_0.22_48)] animate-pulse" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white tracking-wide">
                  {steps[loadingStep]}
                </p>
                <p className="text-xs text-white/40 font-mono">
                  Etapa {loadingStep + 1} de {steps.length}
                </p>
              </div>
            </motion.div>
          ) : (
            <div className="h-20" /> // Espaço limpo e sem poluição
          )}
        </AnimatePresence>
      </div>

      {/* ─── 3. THE CREATIVE COMMAND DOCK (THUMB ZONE INFERIOR) ─── */}
      <motion.div
        className="w-full max-w-xl relative z-20"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <form
          onSubmit={handleSubmit}
          className="relative rounded-3xl bg-[#0B0E16]/80 backdrop-blur-2xl border border-white/12 shadow-[0_20px_50px_rgba(0,0,0,0.8)] p-3 md:p-4 transition-all focus-within:border-[oklch(0.78_0.22_48)]/50 focus-within:shadow-[0_0_30px_oklch(0.78_0.22_48_/_15%)]"
        >
          {/* Campo de Entrada de Texto */}
          <textarea
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder="O que sua marca quer expressar hoje?"
            className="w-full bg-transparent text-sm md:text-base text-white placeholder-white/35 outline-none resize-none px-2 pt-1 pb-2 leading-relaxed custom-scrollbar font-normal"
          />

          {/* Barra de Ações Interna da Base do Dock */}
          <div className="flex items-center justify-between pt-2 border-t border-white/6 gap-2">
            {/* Seletor de Modo Fluido (Post Único | Carrossel) */}
            <div className="flex items-center bg-white/6 p-0.5 rounded-xl border border-white/8">
              <button
                type="button"
                onClick={() => setMode("static")}
                disabled={isLoading}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  mode === "static"
                    ? "bg-white text-black shadow-sm"
                    : "text-white/50 hover:text-white"
                }`}
              >
                <Square size={12} />
                <span>Post</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("carousel")}
                disabled={isLoading}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  mode === "carousel"
                    ? "bg-white text-black shadow-sm"
                    : "text-white/50 hover:text-white"
                }`}
              >
                <Layers size={12} />
                <span>Carrossel</span>
              </button>
            </div>

            {/* Botão de Envio Circular Luminoso */}
            <button
              type="submit"
              disabled={!prompt.trim() || isLoading}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 ${
                prompt.trim() && !isLoading
                  ? "text-black shadow-lg hover:scale-105"
                  : "bg-white/10 text-white/30 cursor-not-allowed"
              }`}
              style={
                prompt.trim() && !isLoading
                  ? {
                      background: "linear-gradient(135deg, oklch(0.78 0.22 48), oklch(0.65 0.2 28))",
                      boxShadow: "0 0 20px oklch(0.7 0.22 40 / 40%)",
                    }
                  : undefined
              }
              title="Manifestar Variações"
            >
              {isLoading ? (
                <Loader2 size={16} className="animate-spin text-white/50" />
              ) : (
                <ArrowRight size={17} />
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
