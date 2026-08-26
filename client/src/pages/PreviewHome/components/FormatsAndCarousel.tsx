import { showcaseCards, type ShowcaseCard } from "@/lib/showcaseCards";
import { ArrowRight, Layers, Smartphone, Square, UserCheck } from "lucide-react";
import { useState } from "react";

interface FormatsAndCarouselProps {
  onOpenAuth: () => void;
}

export default function FormatsAndCarousel({ onOpenAuth }: FormatsAndCarouselProps) {
  const [activeFormat, setActiveFormat] = useState<"1:1" | "5:6" | "9:16">("1:1");

  return (
    <section id="formatos" className="py-20 md:py-28 px-4 md:px-8 max-w-7xl mx-auto text-center border-t border-white/8">
      {/* Badge */}
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/12 bg-white/6 text-xs font-semibold uppercase tracking-wider text-[oklch(0.78_0.22_48)] mb-4">
        <Layers size={14} />
        <span>Versatilidade Total</span>
      </div>

      <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white max-w-3xl mx-auto" style={{ fontFamily: "var(--font-display)" }}>
        Um motor. Todos os formatos que o seu negócio precisa.
      </h2>

      <p className="mt-4 text-sm md:text-base text-white/70 max-w-xl mx-auto font-light">
        Gere posts quadrados para o Feed, retratos de alta retenção no Instagram ou Stories cinematográficos em 9:16 com um toque.
      </p>

      {/* Seletor de Formatos */}
      <div className="flex items-center justify-center gap-2 my-8">
        {[
          { id: "1:1", label: "Quadrado 1:1 (Feed)", icon: Square },
          { id: "5:6", label: "Retrato 5:6 (Instagram)", icon: Layers },
          { id: "9:16", label: "Vertical 9:16 (Stories/Reels)", icon: Smartphone },
        ].map((f) => {
          const Icon = f.icon;
          const isSelected = activeFormat === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setActiveFormat(f.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs md:text-sm font-semibold transition-all cursor-pointer ${
                isSelected
                  ? "bg-white text-black border-white shadow-lg"
                  : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon size={15} />
              <span>{f.label}</span>
            </button>
          );
        })}
      </div>

      {/* Grid de Cards das Famílias Visuais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
        {showcaseCards.slice(0, 6).map((card) => {
          const aspectClass =
            activeFormat === "1:1"
              ? "aspect-square"
              : activeFormat === "5:6"
              ? "aspect-[5/6]"
              : "aspect-[9/16] max-w-[280px] mx-auto";

          return (
            <div
              key={card.id}
              onClick={onOpenAuth}
              className={`relative w-full rounded-[24px] overflow-hidden border border-white/12 p-6 flex flex-col justify-between shadow-2xl transition-all duration-300 hover:scale-[1.02] hover:border-[oklch(0.78_0.22_48)] cursor-pointer group ${aspectClass}`}
              style={{ backgroundColor: card.palette.background, color: card.palette.text }}
            >
              {/* Imagem de Fundo */}
              {card.backgroundImageUrl && (
                <>
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                    style={{ backgroundImage: `url(${card.backgroundImageUrl})` }}
                  />
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(180deg, ${card.palette.background}33 0%, ${card.palette.background}F4 85%)`,
                    }}
                  />
                </>
              )}

              {/* Topo do Card */}
              <div className="relative z-10 flex items-center justify-between">
                <span
                  className="px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.22em]"
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
                    className="text-[9px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded text-black"
                    style={{ backgroundColor: card.palette.accent }}
                  >
                    {card.stickerText}
                  </span>
                )}
              </div>

              {/* Base do Card */}
              <div className="relative z-10 space-y-2">
                <div className="text-[10px] uppercase tracking-[0.28em] font-medium text-white/60">
                  {card.category}
                </div>

                <h3
                  className="text-lg md:text-xl font-bold leading-tight"
                  style={{ fontFamily: card.fontFamily }}
                >
                  {card.headline}
                </h3>

                <p className="text-xs text-white/70 font-light line-clamp-2">
                  {card.subtext}
                </p>

                <div
                  className="h-1 w-10 rounded-full mt-2"
                  style={{ backgroundColor: card.palette.accent }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-12">
        <button
          type="button"
          onClick={onOpenAuth}
          className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-bold text-black shadow-xl transition-all hover:scale-105 cursor-pointer"
          style={{
            background: "linear-gradient(135deg, oklch(0.78 0.22 48), oklch(0.65 0.2 28))",
          }}
        >
          <span>Criar posts nestes formatos</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}
