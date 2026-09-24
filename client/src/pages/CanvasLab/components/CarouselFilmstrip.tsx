import { useState } from "react";
import { Copy, Plus, Trash2, Layers, ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { CarouselSlideItem } from "./types";

interface CarouselFilmstripProps {
  slides: CarouselSlideItem[];
  currentIndex: number;
  onSelectSlide: (index: number) => void;
  onAddSlide: () => void;
  onDuplicateSlide: (index: number) => void;
  onRemoveSlide: (index: number) => void;
  onReorderSlide?: (sourceIndex: number, targetIndex: number) => void;
}

export default function CarouselFilmstrip({
  slides,
  currentIndex,
  onSelectSlide,
  onAddSlide,
  onDuplicateSlide,
  onRemoveSlide,
  onReorderSlide,
}: CarouselFilmstripProps) {
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  return (
    <div className="h-[76px] md:h-20 border-t border-white/10 bg-black/60 backdrop-blur-xl px-3 md:px-4 py-2 flex items-center gap-3 shrink-0 z-20 overflow-x-auto select-none custom-scrollbar">
      <div className="hidden md:flex items-center gap-2 pr-3 border-r border-white/10 shrink-0 text-white/50 text-[11px] font-semibold uppercase tracking-wider">
        <Layers size={14} className="text-[oklch(0.78_0.22_48)]" />
        <span className="hidden sm:inline">{slides.length > 1 ? `Carrossel (${slides.length})` : "Post"}</span>
      </div>

      {/* Miniaturas dos Slides */}
      <div className="flex items-center gap-2.5 flex-1">
        {slides.map((slide, idx) => {
          const isSelected = idx === currentIndex;
          const isDraggingThis = draggedIdx === idx;
          return (
            <div
              key={slide.id || idx}
              onClick={() => onSelectSlide(idx)}
              draggable={Boolean(onReorderSlide && slides.length > 1)}
              onDragStart={(e) => {
                setDraggedIdx(idx);
                e.dataTransfer.setData("text/plain", String(idx));
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => setDraggedIdx(null)}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDraggedIdx(null);
                const from = parseInt(e.dataTransfer.getData("text/plain"), 10);
                if (!isNaN(from) && from !== idx) {
                  onReorderSlide?.(from, idx);
                }
              }}
              className={`group relative h-15 w-24 rounded-xl border p-1 md:p-1.5 flex flex-col justify-between cursor-pointer transition-all shrink-0 ${
                isDraggingThis ? "opacity-40 border-dashed border-[oklch(0.78_0.22_48)]" : ""
              } ${
                isSelected
                  ? "bg-white/15 border-[oklch(0.78_0.22_48)] shadow-md ring-1 ring-[oklch(0.78_0.22_48)]"
                  : "bg-white/4 border-white/10 hover:bg-white/8 text-white/60"
              }`}
            >
              <div className="flex items-center justify-between text-[9px] font-mono font-bold text-white/70">
                <div className="flex items-center gap-1">
                  <span>0{idx + 1}</span>
                  {idx === 0 && (
                    <span className="px-1 py-0.2 rounded bg-[oklch(0.78_0.22_48)]/25 text-[oklch(0.78_0.22_48)] text-[7px] font-bold tracking-wider uppercase">
                      Capa
                    </span>
                  )}
                </div>
                <div className="hidden opacity-0 transition-opacity group-hover:opacity-100 md:flex md:items-center md:gap-1">
                  {idx > 0 && onReorderSlide && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReorderSlide(idx, idx - 1);
                      }}
                      className="hover:text-white"
                      title="Mover slide para a esquerda"
                    >
                      <ChevronLeft size={10} />
                    </button>
                  )}
                  {idx < slides.length - 1 && onReorderSlide && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReorderSlide(idx, idx + 1);
                      }}
                      className="hover:text-white"
                      title="Mover slide para a direita"
                    >
                      <ChevronRight size={10} />
                    </button>
                  )}
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
                <div className="md:hidden" onClick={(event) => event.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><button type="button" className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-white" aria-label={`Ações do slide ${idx + 1}`}><MoreHorizontal size={17} /></button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 border-white/15 bg-[#10141D] text-white">
                      {idx > 0 && onReorderSlide && <DropdownMenuItem onSelect={() => onReorderSlide(idx, idx - 1)}>Mover para a esquerda</DropdownMenuItem>}
                      {idx < slides.length - 1 && onReorderSlide && <DropdownMenuItem onSelect={() => onReorderSlide(idx, idx + 1)}>Mover para a direita</DropdownMenuItem>}
                      <DropdownMenuItem onSelect={() => onDuplicateSlide(idx)}>Duplicar slide</DropdownMenuItem>
                      {slides.length > 1 && <DropdownMenuItem onSelect={() => onRemoveSlide(idx)} variant="destructive">Excluir slide</DropdownMenuItem>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <p className="truncate text-[9.5px] font-medium leading-tight text-white">
                {slide.headline}
              </p>
            </div>
          );
        })}

        {/* Botão de Adicionar Slide */}
        <button
          type="button"
          onClick={onAddSlide}
          className="hidden h-15 w-16 rounded-xl border border-dashed border-white/20 bg-white/3 hover:bg-white/6 flex-col items-center justify-center gap-1 text-[10px] text-white/60 hover:text-white cursor-pointer transition-all shrink-0 font-semibold md:flex"
        >
          <Plus size={14} />
          <span>Slide</span>
        </button>
      </div>
    </div>
  );
}
