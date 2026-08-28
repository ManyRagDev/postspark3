import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useState } from "react";
import type { StudioFamily } from "./studioModels";

interface StudioStageCardProps {
  family: StudioFamily;
  aspectRatio: "1:1" | "5:6" | "9:16";
  onSelect: () => void;
}

export default function StudioStageCard({ family, aspectRatio, onSelect }: StudioStageCardProps) {
  const [slideIndex, setSlideIndex] = useState(0);

  const isCarousel = family.layout === "carousel" && !!family.slides;
  const currentSlide = isCarousel && family.slides ? family.slides[slideIndex] : null;

  const aspectClass =
    aspectRatio === "1:1"
      ? "h-[360px] sm:h-[420px] aspect-square"
      : aspectRatio === "5:6"
      ? "h-[380px] sm:h-[450px] aspect-[5/6]"
      : "h-[420px] sm:h-[490px] aspect-[9/16]";

  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      {/* O Card do Estúdio com Transição de Mola */}
      <motion.div
        key={family.id}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        onClick={onSelect}
        className={`relative rounded-[26px] overflow-hidden border shadow-[0_24px_60px_rgba(0,0,0,0.85)] p-6 flex flex-col justify-between select-none cursor-pointer transition-all duration-300 hover:scale-[1.02] ${aspectClass}`}
        style={{
          backgroundColor: family.palette.background,
          color: family.palette.text,
          borderColor: `${family.palette.accent}55`,
        }}
      >
        {/* Background Foto / Overlay */}
        {family.bgImage && (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-luminosity"
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
          <div className="absolute inset-x-4 top-14 bottom-14 rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl p-5 shadow-2xl" />
        )}

        {/* Topo do Post */}
        <div className="relative z-10 flex items-center justify-between">
          <span
            className="px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.24em]"
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
              className="text-[9px] font-black uppercase tracking-[0.22em] px-2 py-0.5 rounded text-black"
              style={{ backgroundColor: family.palette.accent }}
            >
              {family.stickerText}
            </span>
          )}
        </div>

        {/* Conteúdo Central/Inferior */}
        <div className="relative z-10 space-y-2.5">
          <div className="text-[10px] uppercase tracking-[0.28em] font-medium text-white/50">
            {family.category}
          </div>

          <h3
            className="text-xl sm:text-2xl font-bold leading-tight"
            style={{
              fontFamily: family.fontFamily,
              textTransform: family.layout === "chromatic" ? "uppercase" : "none",
            }}
          >
            {currentSlide ? currentSlide.headline : family.headline}
          </h3>

          <p className="text-xs sm:text-sm font-light text-white/70 leading-relaxed line-clamp-2">
            {currentSlide ? currentSlide.subtext : family.subtext}
          </p>

          <div
            className="h-1 w-12 rounded-full mt-2"
            style={{ backgroundColor: family.palette.accent }}
          />
        </div>
      </motion.div>

      {/* Controles de Slide do Carrossel */}
      {isCarousel && family.slides && (
        <div className="flex items-center gap-3 text-xs font-mono text-white/60">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSlideIndex((p) => Math.max(0, p - 1));
            }}
            disabled={slideIndex === 0}
            className="p-2 rounded-full border border-white/10 bg-white/5 text-white disabled:opacity-20 cursor-pointer hover:bg-white/10"
          >
            <ChevronLeft size={16} />
          </button>

          <span>Slide {slideIndex + 1} de {family.slides.length}</span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSlideIndex((p) => Math.min(family.slides!.length - 1, p + 1));
            }}
            disabled={slideIndex === family.slides.length - 1}
            className="p-2 rounded-full border border-white/10 bg-white/5 text-white disabled:opacity-20 cursor-pointer hover:bg-white/10"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
