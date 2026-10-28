import { memo, useEffect, useRef, useState } from "react";
import { Plus, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CanvasPostStage } from "./CanvasPostStage";
import { aspectRatioHeight } from "@shared/aspectRatios";
import type { CanvasPostModel, CarouselSlideItem } from "./types";

interface CarouselFilmstripProps {
  post?: CanvasPostModel;
  slides: CarouselSlideItem[];
  currentIndex: number;
  onSelectSlide: (index: number) => void;
  onAddSlide: () => void;
  onDuplicateSlide: (index: number) => void;
  onRemoveSlide: (index: number) => void;
  onReorderSlide?: (sourceIndex: number, targetIndex: number) => void;
}

const Thumbnail = memo(function Thumbnail({
  post,
  index,
}: {
  post: CanvasPostModel;
  index: number;
}) {
  const node = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === "undefined"
  );
  useEffect(() => {
    if (!node.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(node.current);
    return () => observer.disconnect();
  }, []);
  const scale = 48 / aspectRatioHeight(post.aspectRatio);
  return (
    <div
      ref={node}
      className="pointer-events-none flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded"
      aria-hidden="true"
    >
      {visible && (
        <CanvasPostStage
          post={{ ...post, currentSlideIndex: index }}
          zoom={scale}
          isReadOnly
        />
      )}
    </div>
  );
});

export default function CarouselFilmstrip({
  post,
  slides,
  currentIndex,
  onSelectSlide,
  onAddSlide,
  onDuplicateSlide,
  onRemoveSlide,
  onReorderSlide,
}: CarouselFilmstripProps) {
  const [dragged, setDragged] = useState<number | null>(null);
  return (
    <nav
      aria-label="Slides do post"
      className="z-20 flex h-20 shrink-0 items-center gap-2 overflow-x-auto border-t border-white/10 bg-[#0a0d16] px-2 py-2"
    >
      {slides.map((slide, index) => (
        <div
          key={slide.id}
          className={`relative flex h-16 shrink-0 items-center rounded-xl border ${currentIndex === index ? "border-orange-400 bg-orange-400/10" : "border-white/10"} ${dragged === index ? "opacity-40" : ""}`}
          draggable={Boolean(onReorderSlide && slides.length > 1)}
          onDragStart={event => {
            setDragged(index);
            event.dataTransfer.setData("text/plain", String(index));
          }}
          onDragEnd={() => setDragged(null)}
          onDragOver={event => event.preventDefault()}
          onDrop={event => {
            event.preventDefault();
            const from = Number(event.dataTransfer.getData("text/plain"));
            setDragged(null);
            if (
              Number.isInteger(from) &&
              from >= 0 &&
              from < slides.length &&
              from !== index
            )
              onReorderSlide?.(from, index);
          }}
        >
          <button
            type="button"
            aria-label={`Selecionar slide ${index + 1}: ${slide.headline}`}
            aria-current={currentIndex === index ? "true" : undefined}
            onClick={() => onSelectSlide(index)}
            className="flex h-full min-w-28 items-center gap-1 rounded-l-xl px-2 text-left focus-visible:outline-2 focus-visible:outline-orange-300"
          >
            {post && <Thumbnail post={post} index={index} />}
            <span className="max-w-20">
              <span className="block text-[10px] text-white/50">
                {index + 1}
                {index === 0 ? " · Capa" : ""}
              </span>
              <span className="block truncate text-xs">
                {slide.headline || "Sem título"}
              </span>
            </span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                draggable={false}
                className="grid min-h-11 min-w-11 place-items-center rounded-xl hover:bg-white/10"
                aria-label={`Ações do slide ${index + 1}`}
              >
                <MoreHorizontal size={18} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-52 border-white/15 bg-[#10141D] text-white"
            >
              {index > 0 && onReorderSlide && (
                <DropdownMenuItem
                  onSelect={() => onReorderSlide(index, index - 1)}
                >
                  Mover para a esquerda
                </DropdownMenuItem>
              )}
              {index < slides.length - 1 && onReorderSlide && (
                <DropdownMenuItem
                  onSelect={() => onReorderSlide(index, index + 1)}
                >
                  Mover para a direita
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => onDuplicateSlide(index)}>
                Duplicar slide
              </DropdownMenuItem>
              {slides.length > 1 && (
                <DropdownMenuItem
                  onSelect={() => onRemoveSlide(index)}
                  variant="destructive"
                >
                  Excluir slide
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
      <button
        type="button"
        onClick={onAddSlide}
        aria-label="Adicionar slide"
        className="flex min-h-11 min-w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/20 px-2 py-2 text-xs text-white/70"
      >
        <Plus size={18} />
        Slide
      </button>
    </nav>
  );
}
