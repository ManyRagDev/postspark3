import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Globe, Sparkles, Wand2 } from "lucide-react";

interface StudioInputBarProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: (val: string) => void;
  promptType: "url" | "idea" | "framework";
  onModeChange: (mode: "url" | "idea") => void;
  activeMode: "url" | "idea";
}

export default function StudioInputBar({
  value,
  onChange,
  onSubmit,
  promptType,
  onModeChange,
  activeMode,
}: StudioInputBarProps) {
  const isUrl = /^https?:\/\//i.test(value.trim()) || activeMode === "url";

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) {
        onSubmit(value);
      }
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-3 select-none text-left">
      {/* Abas Tácteis de Modo: URL vs Texto */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/4 border border-white/8 backdrop-blur-md">
          <button
            type="button"
            onClick={() => onModeChange("url")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeMode === "url"
                ? "bg-white/15 text-white shadow-sm border border-white/15"
                : "text-white/50 hover:text-white hover:bg-white/5"
            }`}
          >
            <Globe size={13} className={activeMode === "url" ? "text-cyan-400" : "text-white/40"} />
            <span>Por URL (Brand DNA)</span>
          </button>

          <button
            type="button"
            onClick={() => onModeChange("idea")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeMode === "idea"
                ? "bg-white/15 text-white shadow-sm border border-white/15"
                : "text-white/50 hover:text-white hover:bg-white/5"
            }`}
          >
            <Sparkles size={13} className={activeMode === "idea" ? "text-[#FF5C00]" : "text-white/40"} />
            <span>Por Tese / Ideia</span>
          </button>
        </div>

        {/* Indicador de Inteligência */}
        <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          {activeMode === "url" ? "Clonagem de DNA Ativa" : "Direção de Arte Instantânea"}
        </span>
      </div>

      {/* Folha Tonal de Criação (Tonal Canvas Sheet) */}
      <div className="relative rounded-2xl border border-white/10 bg-[#100F0D]/90 backdrop-blur-2xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.7)] transition-all focus-within:border-[#FF5C00]/50 hover:border-white/20">
        <div className="flex items-start gap-3">
          <div className="pt-1 text-white/40 shrink-0">
            {activeMode === "url" ? (
              <Globe size={18} className="text-cyan-400" />
            ) : (
              <Wand2 size={18} className="text-[#FF5C00]" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <textarea
              rows={2}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                activeMode === "url"
                  ? "Cole a URL do seu site (ex: https://nuvemshop.com.br ou minhaconsultoria.com)..."
                  : "Digite sua ideia, gancho ou tese (ex: Por que marcas de luxo não competem por preço)..."
              }
              className="w-full bg-transparent text-sm md:text-base text-white placeholder-white/35 resize-none outline-none font-sans font-normal leading-relaxed"
            />
          </div>

          {/* Botão de Disparo Integrado */}
          <button
            type="button"
            onClick={() => onSubmit(value)}
            className="group flex items-center gap-2 rounded-xl py-2.5 px-4 text-xs md:text-sm font-bold text-white shadow-lg transition-all hover:scale-105 active:scale-95 shrink-0 cursor-pointer self-end"
            style={{
              background: "linear-gradient(135deg, #FF5C00, #E04800)",
              boxShadow: "0 0 20px rgba(255, 92, 0, 0.4)",
            }}
          >
            <Sparkles size={14} className="text-white fill-white" />
            <span>Gerar Artes</span>
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        {/* Rodapé da Folha Tonal com Dica & Feedback */}
        <div className="flex items-center justify-between pt-3 mt-2 border-t border-white/6 text-[11px] text-white/40">
          <span>
            {activeMode === "url"
              ? "⚡ A IA analisa cores, logotipo, tipografia e tom de voz do site."
              : "✦ Pressione Enter para testar ou explore os espécimes abaixo."}
          </span>
          <span className="font-mono text-[10px] text-white/30 hidden sm:inline">
            {value.length > 0 ? `${value.length} caracteres` : "Amostra interativa"}
          </span>
        </div>
      </div>
    </div>
  );
}
