import SparkLogo from "@/components/SparkLogo";
import { ArrowRight, Sparkles } from "lucide-react";

interface StudioNavProps {
  onOpenAuth: () => void;
}

export default function StudioNav({ onOpenAuth }: StudioNavProps) {
  return (
    <header className="relative z-30 flex items-center justify-between px-6 py-4 md:px-12 w-full max-w-7xl mx-auto">
      {/* Brand Oficial PostSpark */}
      <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
        <SparkLogo size={38} />
        <span className="text-xl md:text-2xl font-black tracking-tight select-none" style={{ fontFamily: "var(--font-display)" }}>
          <span className="text-white">Post</span>
          <span className="text-[#FF5C00]">Spark</span>
        </span>
      </div>

      {/* Ação Única */}
      <div className="flex items-center gap-3">
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
          <span>Entrar no App</span>
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </header>
  );
}
