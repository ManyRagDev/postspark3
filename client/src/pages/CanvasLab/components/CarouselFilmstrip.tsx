import { Copy, Plus, Trash2, Layers } from "lucide-react";
import type { CarouselSlideItem } from "./types";

interface CarouselFilmstripProps {
  slides: CarouselSlideItem[];
  currentIndex: number;
  onSelectSlide: (index: number) => void;
  onAddSlide: () => void;
  onDuplicateSlide: (index: number) => void;
  onRemoveSlide: (index: number) => void;
}

export default function CarouselFilmstrip({
  slides,
  currentIndex,
  onSelectSlide,
  onAddSlide,
  onDuplicateSlide,
  onRemoveSlide,
}: CarouselFilmstripProps) {
  return (
    <div className="h-20 border-t border-white/10 bg-black/60 backdrop-blur-xl px-4 py-2 flex items-center gap-3 shrink-0 z-20 overflow-x-auto select-none custom-scrollbar">
      <div className="flex items-center gap-2 pr-3 border-r border-white/10 shrink-0 text-white/50 text-[11px] font-semibold uppercase tracking-wider">
        <Layers size={14} className="text-[oklch(0.78_0.22_48)]" />
        <span>Carrossel ({slides.length})</span>
      </div>

      {/* Miniaturas dos Slides */}
      <div className="flex items-center gap-2.5 flex-1">
        {slides.map((slide, idx) => {
          const isSelected = idx === currentIndex;
          return (
            <div
              key={slide.id || idx}
              onClick={() => onSelectSlide(idx)}
              className={`group relative h-15 w-24 rounded-xl border p-1.5 flex flex-col justify-between cursor-pointer transition-all shrink-0 ${
                isSelected
                  ? "bg-white/15 border-[oklch(0.78_0.22_48)] shadow-md ring-1 ring-[oklch(0.78_0.22_48)]"
                  : "bg-white/4 border-white/10 hover:bg-white/8 text-white/60"
              }`}
            >
              <div className="flex items-center justify-between text-[9px] font-mono font-bold text-white/70">
                <span>0{idx + 1}</span>
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicateSlide(idx);
                    }}
                    className="hover:text-white"
                    title="Duplicar Slide"
                  >
                    <Copy size={10} />
                  </button>
                  {slides.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveSlide(idx);
                      }}
                      className="hover:text-red-400"
                      title="Excluir Slide"
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[9.5px] font-medium text-white truncate leading-tight">
                {slide.headline}
              </p>
            </div>
          );
        })}

        {/* Botão de Adicionar Slide */}
        <button
          type="button"
          onClick={onAddSlide}
          className="h-15 w-16 rounded-xl border border-dashed border-white/20 bg-white/3 hover:bg-white/6 flex flex-col items-center justify-center gap-1 text-[10px] text-white/60 hover:text-white cursor-pointer transition-all shrink-0 font-semibold"
        >
          <Plus size={14} />
          <span>Slide</span>
        </button>
      </div>
    </div>
  );
}
