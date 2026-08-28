import { motion } from "framer-motion";
import { ArrowRight, Globe, Link2, Sparkles, Wand2 } from "lucide-react";

interface StudioInputBarProps {
  displayText: string;
  isTriggering: boolean;
  promptType: "url" | "idea" | "framework";
  onTriggerAction: () => void;
}

export default function StudioInputBar({
  displayText,
  isTriggering,
  promptType,
  onTriggerAction,
}: StudioInputBarProps) {
  return (
    <div className="w-full max-w-2xl mx-auto space-y-2.5 select-none">
      {/* Barra de Input Simulada com Efeito Typewriter */}
      <div
        onClick={onTriggerAction}
        className="group relative flex items-center rounded-2xl border border-white/15 bg-white/6 backdrop-blur-2xl p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.65)] transition-all cursor-pointer hover:border-white/30"
      >
        <div className="pl-3.5 pr-2 text-white/50 flex items-center shrink-0">
          {promptType === "url" ? (
            <Globe size={18} className="text-[#00f5ff]" />
          ) : (
            <Wand2 size={18} className="text-[oklch(0.78_0.22_48)]" />
          )}
        </div>

        {/* Texto Sendo Digitado com Cursor Piscando */}
        <div className="w-full py-2.5 text-xs sm:text-sm text-white font-mono tracking-tight flex items-center truncate">
          <span className="truncate">{displayText}</span>
          <span className="inline-block w-1.5 h-4 bg-[oklch(0.78_0.22_48)] ml-1 animate-pulse" />
        </div>

        {/* Botão de Disparo com Pulso */}
        <motion.button
          type="button"
          animate={
            isTriggering
              ? { scale: [1, 0.94, 1.04, 1], filter: ["brightness(1)", "brightness(1.35)", "brightness(1)"] }
              : {}
          }
          transition={{ duration: 0.5 }}
          className="group flex items-center gap-2 rounded-xl py-2 px-4 text-xs sm:text-sm font-bold text-black shadow-md transition-all shrink-0 cursor-pointer"
          style={{
            background: "linear-gradient(135deg, oklch(0.78 0.22 48), oklch(0.65 0.2 28))",
            boxShadow: isTriggering
              ? "0 0 28px oklch(0.78 0.22 48 / 90%)"
              : "0 0 16px oklch(0.78 0.22 48 / 30%)",
          }}
        >
          <Sparkles size={14} className="text-black fill-black" />
          <span>{isTriggering ? "Sintetizando..." : "Criar Post"}</span>
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </motion.button>
      </div>

      {/* Indicador Discreto de Demonstração Autônoma */}
      <div className="flex items-center justify-between text-[10px] text-white/40 px-2 font-mono">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          <span>Demonstração ao vivo em tempo real</span>
        </span>
        <span className="hover:text-white/70 transition-colors cursor-pointer" onClick={onTriggerAction}>
          Clique para testar com seu próprio conteúdo →
        </span>
      </div>
    </div>
  );
}
