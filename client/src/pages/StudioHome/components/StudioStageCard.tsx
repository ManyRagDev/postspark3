import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Layers, Smartphone, Square, Sparkles } from "lucide-react";
import type { StudioFamily } from "./studioModels";

interface StudioStageCardProps {
  family: StudioFamily;
  aspectRatio: "1:1" | "5:6" | "9:16";
  onAspectRatioChange: (ratio: "1:1" | "5:6" | "9:16") => void;
  onSelect: () => void;
}

export default function StudioStageCard({
  family,
  aspectRatio,
  onAspectRatioChange,
  onSelect,
}: StudioStageCardProps) {
  const [slideIndex, setSlideIndex] = useState(0);

  const isCarousel = family.layout === "carousel" && !!family.slides;
  const currentSlide = isCarousel && family.slides ? family.slides[slideIndex] : null;

  const aspectDimensions =
    aspectRatio === "1:1"
      ? "w-[340px] h-[340px] sm:w-[380px] sm:h-[380px]"
      : aspectRatio === "5:6"
      ? "w-[320px] h-[384px] sm:w-[350px] sm:h-[420px]"
      : "w-[260px] h-[460px] sm:w-[280px] sm:h-[500px]";

  return (
    <div className="flex flex-col items-center justify-center space-y-4 w-full">
      {/* Moldura de Estúdio com Iluminação Volumétrica */}
      <div className="relative group">
        {/* Glow de fundo sincronizado com a cor de acento do card */}
        <div
          className="absolute -inset-4 rounded-[32px] opacity-30 blur-2xl transition-all duration-500 group-hover:opacity-50"
          style={{ backgroundColor: family.palette.accent }}
        />

        {/* O Card do Estúdio com Transição de Mola */}
        <motion.div
          key={`${family.id}-${aspectRatio}`}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          onClick={onSelect}
          className={`relative rounded-[24px] overflow-hidden border shadow-[0_25px_60px_rgba(0,0,0,0.85)] p-6 sm:p-7 flex flex-col justify-between select-none cursor-pointer transition-all duration-300 hover:scale-[1.015] ${aspectDimensions}`}
          style={{
            backgroundColor: family.palette.background,
            color: family.palette.text,
            borderColor: `${family.palette.accent}44`,
          }}
        >
          {/* Background Foto / Overlay */}
          {family.bgImage && (
            <>
              <div
                className="absolute inset-0 bg-cover bg-center opacity-30 mix-blend-luminosity"
                style={{ backgroundImage: `url(${family.bgImage})` }}
              />
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(180deg, ${family.palette.background}44 0%, ${family.palette.background}F4 82%)`,
                }}
              />
            </>
          )}

          {/* Efeito Vidro se for Glass Veil */}
          {family.layout === "glass" && (
            <div className="absolute inset-x-4 top-12 bottom-12 rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl p-5 shadow-2xl" />
          )}

          {/* Topo do Post */}
          <div className="relative z-10 flex items-center justify-between">
            <span
              className="px-2.5 py-1 rounded-full text-[9px] font-mono font-bold uppercase tracking-[0.2em]"
              style={{
                backgroundColor: `${family.palette.accent}22`,
                color: family.palette.accent,
                border: `1px solid ${family.palette.accent}44`,
              }}
            >
              {currentSlide ? currentSlide.step : family.badge}
            </span>

            {family.stickerText && (
              <span
                className="text-[9px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded text-black"
                style={{
                  backgroundColor: family.palette.accent,
                  transform: family.layout === "chromatic" ? "rotate(-3deg)" : "none",
                }}
              >
                {family.stickerText}
              </span>
            )}
          </div>

          {/* Conteúdo Central/Inferior com Tipografia de Alta Precisão */}
          <div className="relative z-10 space-y-2.5">
            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/50">
              {family.category}
            </div>

            <h3
              className="text-lg sm:text-xl font-bold leading-tight"
              style={{
                fontFamily: family.fontFamily,
                textTransform: family.layout === "chromatic" ? "uppercase" : "none",
              }}
            >
              {currentSlide ? currentSlide.headline : family.headline}
            </h3>

            <p className="text-xs font-light text-white/70 leading-relaxed line-clamp-2">
              {currentSlide ? currentSlide.subtext : family.subtext}
            </p>

            <div
              className="h-1 w-10 rounded-full mt-2"
              style={{ backgroundColor: family.palette.accent }}
            />
          </div>
        </motion.div>
      </div>

      {/* Controles do Palco: Formatos & Navegação de Carrossel */}
      <div className="flex items-center justify-between gap-4 w-full max-w-sm pt-1">
        {/* Seletor de Proporções */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/4 border border-white/8 backdrop-blur-md">
          {[
            { id: "1:1", label: "1:1", icon: Square },
            { id: "5:6", label: "5:6", icon: Layers },
            { id: "9:16", label: "9:16", icon: Smartphone },
          ].map((f) => {
            const Icon = f.icon;
            const isSelected = aspectRatio === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onAspectRatioChange(f.id as any)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? "bg-white/20 text-white shadow-sm"
                    : "text-white/40 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon size={12} />
                <span>{f.label}</span>
              </button>
            );
          })}
        </div>

        {/* Controles de Slide do Carrossel (Se Aplicável) */}
        {isCarousel && family.slides && (
          <div className="flex items-center gap-2 text-xs font-mono text-white/60">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSlideIndex((p) => Math.max(0, p - 1));
              }}
              disabled={slideIndex === 0}
              className="p-1.5 rounded-lg border border-white/10 bg-white/5 text-white disabled:opacity-20 cursor-pointer hover:bg-white/10"
            >
              <ChevronLeft size={14} />
            </button>

            <span>{slideIndex + 1}/{family.slides.length}</span>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSlideIndex((p) => Math.min(family.slides!.length - 1, p + 1));
              }}
              disabled={slideIndex === family.slides.length - 1}
              className="p-1.5 rounded-lg border border-white/10 bg-white/5 text-white disabled:opacity-20 cursor-pointer hover:bg-white/10"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
