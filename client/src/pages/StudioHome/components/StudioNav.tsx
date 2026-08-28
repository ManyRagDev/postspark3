import SparkLogo from "@/components/SparkLogo";
import { ArrowRight, Sparkles } from "lucide-react";

interface StudioNavProps {
  onOpenAuth: () => void;
}

export default function StudioNav({ onOpenAuth }: StudioNavProps) {
  return (
    <header className="relative z-30 flex items-center justify-between px-6 py-4 md:px-12 w-full max-w-7xl mx-auto">
      {/* Brand */}
      <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
        <SparkLogo size={36} />
        <span className="text-xl md:text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          <span className="text-white">Post</span>
          <span style={{ color: "oklch(0.75 0.22 45)" }}>Spark</span>
        </span>
      </div>

      {/* Ação Única */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={onOpenAuth}
          className="group relative flex items-center gap-2 rounded-xl py-2 px-4 text-xs sm:text-sm font-bold text-black shadow-lg transition-all hover:scale-105 hover:brightness-110 active:scale-95 cursor-pointer"
          style={{
            background: "linear-gradient(135deg, oklch(0.78 0.22 48), oklch(0.65 0.2 28))",
            boxShadow: "0 0 20px oklch(0.7 0.22 40 / 30%)",
          }}
        >
          <span>Entrar</span>
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </header>
  );
}
