import SparkLogo from "@/components/SparkLogo";
import { ArrowRight, Sparkles, Wand2, ShieldCheck } from "lucide-react";

interface StudioNavProps {
  onOpenAuth: () => void;
}

export default function StudioNav({ onOpenAuth }: StudioNavProps) {
  return (
    <header className="relative z-30 flex items-center justify-between px-6 py-5 md:px-12 w-full max-w-7xl mx-auto">
      {/* Brand Oficial PostSpark */}
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
        <SparkLogo size={38} />
        <span className="text-xl md:text-2xl font-black tracking-tight select-none" style={{ fontFamily: "var(--font-display)" }}>
          <span className="text-white">Post</span>
          <span className="text-[#FF5C00]">Spark</span>
        </span>
      </div>

      {/* Badges de Autoridade do Estúdio (Desktop) */}
      <div className="hidden md:flex items-center gap-6 text-[11px] font-mono uppercase tracking-[0.2em] text-white/40">
        <span className="flex items-center gap-1.5 hover:text-white/70 transition-colors">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF5C00]" />
          Brand DNA Engine
        </span>
        <span className="text-white/15">/</span>
        <span className="flex items-center gap-1.5 hover:text-white/70 transition-colors">
          <Wand2 size={12} className="text-[#FF5C00]" />
          14 Famílias Visuais
        </span>
        <span className="text-white/15">/</span>
        <span className="flex items-center gap-1.5 hover:text-white/70 transition-colors">
          <ShieldCheck size={12} className="text-emerald-400" />
          Exportação 4K
        </span>
      </div>

      {/* Ações de Entrada */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onOpenAuth}
          className="text-xs font-semibold text-white/70 hover:text-white transition-colors cursor-pointer py-2 px-1"
        >
          Entrar
        </button>

        <button
          type="button"
          onClick={onOpenAuth}
          className="group relative flex items-center gap-2 rounded-xl py-2 px-4.5 text-xs sm:text-sm font-bold text-white shadow-lg transition-all hover:scale-105 hover:brightness-110 active:scale-95 cursor-pointer"
          style={{
            background: "linear-gradient(135deg, #FF5C00, #E04800)",
            boxShadow: "0 0 20px rgba(255, 92, 0, 0.35)",
          }}
        >
          <Sparkles size={14} className="text-white fill-white" />
          <span>Experimentar Grátis</span>
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </header>
  );
}
