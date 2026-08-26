import SparkLogo from "@/components/SparkLogo";
import { ArrowRight, Sparkles } from "lucide-react";

interface PreviewNavProps {
  onOpenAuth: () => void;
}

export default function PreviewNav({ onOpenAuth }: PreviewNavProps) {
  return (
    <header className="fixed top-0 inset-x-0 z-40 flex items-center justify-between px-6 py-4 md:px-12 backdrop-blur-xl bg-black/40 border-b border-white/8 transition-all">
      {/* Brand */}
      <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
        <SparkLogo size={34} />
        <span className="text-xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          <span className="text-white">Post</span>
          <span style={{ color: "oklch(0.75 0.22 45)" }}>Spark</span>
        </span>
      </div>

      {/* Nav links (Desktop) */}
      <nav className="hidden md:flex items-center gap-8 text-xs font-medium text-white/70 tracking-wide">
        <a href="#transformacao" className="hover:text-white transition-colors">Como Funciona</a>
        <a href="#brand-dna" className="hover:text-white transition-colors">Brand DNA</a>
        <a href="#formatos" className="hover:text-white transition-colors">Formatos & Carrosséis</a>
        <a href="#estudio" className="hover:text-white transition-colors">Estúdio Criativo</a>
      </nav>

      {/* CTA Button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenAuth}
          className="hidden sm:inline-block text-xs font-semibold text-white/80 hover:text-white py-2 px-3 transition-colors cursor-pointer"
        >
          Entrar
        </button>

        <button
          type="button"
          onClick={onOpenAuth}
          className="group relative flex items-center gap-2 rounded-xl py-2 px-4 text-xs md:text-sm font-bold text-black shadow-lg transition-all hover:scale-105 hover:brightness-110 active:scale-95 cursor-pointer"
          style={{
            background: "linear-gradient(135deg, oklch(0.78 0.22 48), oklch(0.65 0.2 28))",
            boxShadow: "0 0 20px oklch(0.7 0.22 40 / 30%)",
          }}
        >
          <Sparkles size={14} className="text-black fill-black" />
          <span>Criar meu post</span>
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </header>
  );
}
