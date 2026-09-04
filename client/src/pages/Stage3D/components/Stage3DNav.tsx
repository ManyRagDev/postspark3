import { Search, Sparkles } from "lucide-react";
import SparkLogo from "@/components/SparkLogo";

interface Stage3DNavProps {
  onCreateClick?: () => void;
  onExploreClick?: () => void;
}

export default function Stage3DNav({ onCreateClick, onExploreClick }: Stage3DNavProps) {
  return (
    <header className="relative z-30 flex items-center justify-between px-8 py-6 w-full max-w-7xl mx-auto select-none">
      {/* Links à Esquerda (Estilo Referência) */}
      <nav className="flex items-center gap-8 text-sm font-medium text-white/80 tracking-wide">
        <div className="flex items-center gap-2 mr-2 cursor-pointer">
          <SparkLogo size={30} />
          <span className="font-bold tracking-tight text-white text-base">
            Post<span className="text-[#FF5C00]">Spark</span>
          </span>
        </div>
        <a href="#ideas" className="hover:text-white transition-colors cursor-pointer">Ideas</a>
        <a href="#create" onClick={onCreateClick} className="hover:text-white transition-colors cursor-pointer">Create</a>
        <a href="#how-it-works" className="hover:text-white transition-colors cursor-pointer">How it works</a>
        <a href="#support" className="hover:text-white transition-colors cursor-pointer">Support</a>
      </nav>

      {/* Busca & CTA à Direita */}
      <div className="flex items-center gap-3">
        {/* Barra de Busca com Atalho '/' */}
        <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-black/40 border border-white/10 text-xs text-white/60 backdrop-blur-md">
          <Search size={14} className="text-white/40" />
          <input
            type="text"
            placeholder="Search"
            className="bg-transparent text-white placeholder-white/40 outline-none text-xs w-28"
          />
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono text-white/40 border border-white/10">
            /
          </kbd>
        </div>

        {/* Botão de Conectar / Entrar */}
        <button
          type="button"
          onClick={onCreateClick}
          className="flex items-center gap-2 rounded-full py-2 px-5 text-xs font-semibold text-white bg-black/50 border border-white/15 hover:border-white/30 backdrop-blur-md shadow-lg transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          <Sparkles size={13} className="text-[#FF5C00]" />
          <span>Connect App</span>
        </button>
      </div>
    </header>
  );
}
