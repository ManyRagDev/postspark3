import { useState, useEffect } from "react";
import { ArrowRight, Layers, Loader2, Sparkles, Type } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
  { text: "Analisando intenção e tom de voz da marca...", percent: 25 },
  { text: "Escrevendo copies e ganchos estratégicos...", percent: 60 },
  { text: "Calibrando tipografia e direções de arte...", percent: 90 },
];

export default function StudioCreateView({ onSubmit, isLoading }: StudioCreateViewProps) {
  const [prompt, setPrompt] = useState("");
  const [postMode, setPostMode] = useState<"static" | "carousel">("static");
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (!isLoading) {
      setStageIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setStageIndex((prev) => (prev < PROGRESS_STAGES.length - 1 ? prev + 1 : prev));
    }, 1200);
    return () => clearInterval(interval);
  }, [isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    onSubmit(prompt.trim(), postMode);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-3xl mx-auto w-full text-center relative select-none">
      {/* Background Glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[140px] pointer-events-none opacity-20"
        style={{ background: "radial-gradient(circle, #E5A93C 0%, #FF4D00 60%, transparent 80%)" }}
      />

      {/* Badge */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="inline-flex items-center gap-2 bg-white/6 px-3.5 py-1.5 rounded-full border border-white/10 text-xs font-mono text-white/80 mb-6 backdrop-blur-md"
      >
        <Sparkles size={13} className="text-[oklch(0.78_0.22_48)]" />
        <span>Estúdio de Criação com IA</span>
      </motion.div>

      {/* Título Principal */}
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl sm:text-5xl font-bold tracking-tight text-white mb-4 leading-tight"
      >
        O que você quer criar <br className="hidden sm:inline" />
        <span className="bg-gradient-to-r from-white via-white/90 to-white/50 bg-clip-text text-transparent">
          para a sua marca hoje?
        </span>
      </motion.h1>

      <p className="text-sm sm:text-base text-white/60 mb-8 max-w-xl">
        Digite um tema ou cole uma ideia. Nossa IA vai orquestrar a copy e as direções de arte oficiais.
      </p>

      {/* Seletor de Modo */}
      <div className="flex items-center gap-2 bg-white/6 p-1.5 rounded-2xl border border-white/10 mb-6">
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

      {/* Caixa de Entrada */}
      <form onSubmit={handleSubmit} className="w-full relative z-10 mb-8">
        <div className="relative rounded-2xl p-1 bg-gradient-to-b from-white/15 to-white/5 border border-white/15 shadow-2xl backdrop-blur-xl transition-all focus-within:border-[oklch(0.78_0.22_48)]">
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ex: 3 sinais de que sua marca parece amadora e como resolver isso..."
            className="w-full bg-transparent p-4 text-sm text-white placeholder-white/30 outline-none resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />

          <div className="flex items-center justify-between px-3 pb-2 pt-1 border-t border-white/8">
            <div className="flex items-center gap-2 text-xs text-white/40">
              <span className="text-[11px] font-mono">Pressione Enter ↵</span>
            </div>

            <button
              type="submit"
              disabled={!prompt.trim() || isLoading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-black shadow-lg transition-all hover:scale-105 hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 cursor-pointer"
              style={{
                background: "linear-gradient(135deg, oklch(0.78 0.22 48), oklch(0.65 0.2 28))",
                boxShadow: "0 0 24px oklch(0.7 0.22 40 / 40%)",
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={15} className="animate-spin text-black" />
                  <span>Sintetizando...</span>
                </>
              ) : (
                <>
                  <span>Gerar Variações</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Barra de Progresso com Etapas Dinâmicas */}
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

      {/* Sugestões Rápidas */}
      {!isLoading && (
        <div className="w-full">
          <span className="text-xs uppercase font-semibold tracking-wider text-white/40 mb-3 block">
            Ou escolha um tema de impacto:
          </span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {QUICK_IDEAS.map((idea, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setPrompt(idea)}
                className="text-xs bg-white/4 hover:bg-white/8 text-white/70 hover:text-white px-3.5 py-1.5 rounded-full border border-white/8 transition-all cursor-pointer"
              >
                {idea}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
