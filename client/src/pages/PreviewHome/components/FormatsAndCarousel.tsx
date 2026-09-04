import { SHOWCASE_SLIDES } from "@/pages/InspiracaoShowcase/inspiracaoCardsData";
import { ArrowRight, Layers, Smartphone, Square } from "lucide-react";
import { useState } from "react";

interface FormatsAndCarouselProps {
  onAction: () => void;
}

export default function FormatsAndCarousel({ onAction }: FormatsAndCarouselProps) {
  const [activeFormat, setActiveFormat] = useState<"1:1" | "4:5" | "9:16">("4:5");

  return (
    <section id="formatos" className="py-24 md:py-32 px-4 md:px-8 max-w-7xl mx-auto text-center relative">
      {/* Luz ambiente focal */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[650px] h-[350px] bg-[#FF5C00]/[0.04] blur-[170px] pointer-events-none rounded-full" />

      {/* Kicker sutil */}
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] text-[11px] font-medium tracking-[0.2em] uppercase text-[#FF5C00] mb-4">
        <Layers size={13} />
        <span>Formatos Nativos & Inteligência Proporcional</span>
      </div>

      <h2
        className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-[-0.03em] text-white max-w-4xl mx-auto leading-tight"
        style={{ fontFamily: "var(--font-display, 'Space Grotesk', sans-serif)" }}
      >
        Um motor. Todos os formatos que o seu negócio precisa.
      </h2>

      <p className="mt-4 text-sm md:text-base text-[rgba(240,235,225,0.72)] max-w-2xl mx-auto font-light leading-relaxed">
        Gere posts quadrados para o feed, retratos 4:5 de máxima retenção no Instagram ou Stories verticais em 9:16 com um toque. A hierarquia tipográfica se recalibra automaticamente.
      </p>

      {/* Seletor de Formatos Tátil */}
      <div className="flex items-center justify-center gap-2.5 my-10 flex-wrap">
        {[
          { id: "1:1", label: "Quadrado 1:1 (Feed)", icon: Square },
          { id: "4:5", label: "Retrato 4:5 (Instagram Feed)", icon: Layers },
          { id: "9:16", label: "Vertical 9:16 (Stories & Reels)", icon: Smartphone },
        ].map((f) => {
          const Icon = f.icon;
          const isSelected = activeFormat === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setActiveFormat(f.id as any)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full border text-xs md:text-sm font-semibold transition-all cursor-pointer ${
                isSelected
                  ? "bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.25)]"
                  : "bg-white/[0.03] border-white/[0.08] text-white/70 hover:bg-white/[0.07] hover:text-white"
              }`}
            >
              <Icon size={14} />
              <span>{f.label}</span>
            </button>
          );
        })}
      </div>

      {/* Grid de Cards das Famílias Visuais Canônicas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 text-left">
        {SHOWCASE_SLIDES.map(({ card }) => {
          const aspectClass =
            activeFormat === "1:1"
              ? "aspect-square"
              : activeFormat === "4:5"
              ? "aspect-[4/5]"
              : "aspect-[9/16] max-w-[310px] mx-auto";

          return (
            <div
              key={card.id}
              onClick={onAction}
              className={`relative w-full rounded-[24px] overflow-hidden border border-white/[0.1] p-7 flex flex-col justify-between shadow-[0_20px_50px_rgba(0,0,0,0.8)] transition-all duration-500 hover:scale-[1.02] hover:border-[#FF5C00]/60 cursor-pointer group ${aspectClass}`}
              style={{ backgroundColor: card.palette.background, color: card.palette.text }}
            >
              {/* Imagem de Fundo Artística Canônica */}
              {card.bgImage && (
                <>
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 ease-out group-hover:scale-105"
                    style={{ backgroundImage: `url(${card.bgImage})` }}
                  />
                  {/* Overlay Gradiente de Proteção */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(180deg, ${card.palette.background}66 0%, ${card.palette.background}33 30%, ${card.palette.background}F4 82%)`,
                    }}
                  />
                </>
              )}

              {/* Topo do Card */}
              <div className="relative z-10 flex items-center justify-between">
                <span
                  className="px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.22em] backdrop-blur-md"
                  style={{
                    backgroundColor: `${card.palette.accent}22`,
                    color: card.palette.accent,
                    border: `1px solid ${card.palette.accent}44`,
                  }}
                >
                  {card.family || card.badge}
                </span>

                {card.stickerText && (
                  <span
                    className="text-[9px] font-black uppercase tracking-[0.2em] px-2.5 py-0.5 rounded text-black shadow-sm"
                    style={{ backgroundColor: card.palette.accent }}
                  >
                    {card.stickerText}
                  </span>
                )}
              </div>

              {/* Base do Card com Tipografia Autoral */}
              <div className="relative z-10 space-y-2.5">
                <div className="text-[10px] uppercase tracking-[0.28em] font-medium text-white/60">
                  {card.category}
                </div>

                <h3
                  className="text-xl md:text-2xl font-bold leading-[1.18] tracking-tight"
                  style={{
                    fontFamily: card.fontFamily,
                    textShadow: "0 2px 14px rgba(0,0,0,0.9)",
                  }}
                >
                  {card.headline}
                </h3>

                <p className="text-xs sm:text-[13px] text-white/75 font-light leading-relaxed line-clamp-2">
                  {card.subtext}
                </p>

                <div
                  className="h-[3px] w-12 rounded-full mt-2"
                  style={{ backgroundColor: card.palette.accent }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-14">
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-2.5 px-8 py-4 rounded-full text-xs md:text-sm font-bold text-white shadow-xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
          style={{
            background: "linear-gradient(135deg, #FF6B2B 0%, #FF5C00 50%, #E04800 100%)",
            boxShadow: "0 0 30px rgba(255, 92, 0, 0.4)",
          }}
        >
          <span>Criar posts nestes formatos grátis</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}
