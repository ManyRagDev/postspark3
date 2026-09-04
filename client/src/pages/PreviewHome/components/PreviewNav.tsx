import SparkLogo from "@/components/SparkLogo";
import { ArrowRight, Sparkles } from "lucide-react";

interface PreviewNavProps {
  onAction: () => void;
}

export default function PreviewNav({ onAction }: PreviewNavProps) {
  return (
    <header className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 py-3.5 md:px-12 backdrop-blur-2xl bg-[oklch(0.04_0.06_280/82%)] border-b border-white/[0.06] transition-all">
      {/* Brand */}
      <div
        className="flex items-center gap-2.5 cursor-pointer select-none group"
        onClick={() => {
          onAction();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      >
        <SparkLogo size={32} />
        <span
          className="text-[19px] font-bold tracking-[-0.03em] text-white"
          style={{ fontFamily: "var(--font-display, 'Space Grotesk', sans-serif)" }}
        >
          Post<span className="text-[#FF5C00]">Spark</span>
        </span>
      </div>

      {/* Nav links (Desktop) */}
      <nav className="hidden md:flex items-center gap-7 text-xs font-medium text-white/65 tracking-wide">
        <a href="#transformacao" className="hover:text-white transition-colors">Como Funciona</a>
        <a href="#brand-dna" className="hover:text-white transition-colors">Brand DNA</a>
        <a href="#formatos" className="hover:text-white transition-colors">Formatos & Carrosséis</a>
        <a href="#estudio" className="hover:text-white transition-colors">Estúdio de Texturas</a>
      </nav>

      {/* CTA Button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onAction}
          className="text-xs font-semibold text-white/75 hover:text-white py-2 px-3 transition-colors cursor-pointer"
        >
          Entrar
        </button>

        <button
          type="button"
          onClick={onAction}
          className="group relative flex items-center gap-2 rounded-full py-2.5 px-5 text-xs md:text-sm font-bold text-white shadow-lg transition-all hover:scale-[1.03] active:scale-[0.98] cursor-pointer"
          style={{
            background: "linear-gradient(135deg, #FF6B2B 0%, #FF5C00 50%, #E04800 100%)",
            boxShadow: "0 0 24px rgba(255, 92, 0, 0.45)",
          }}
        >
          <Sparkles size={13} className="text-white fill-white" />
          <span>Criar Post Grátis</span>
          <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </header>
  );
}
