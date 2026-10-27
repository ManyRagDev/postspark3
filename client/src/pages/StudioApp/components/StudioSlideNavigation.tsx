import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { CanvasPostModel } from "@/pages/CanvasLab/components/types";

/** Preview navigation is local view state; it never edits the authoritative slides. */
export function useStudioSlidePreviews() {
  const [indices, setIndices] = useState<Record<string, number>>({});
  return {
    preview(post: CanvasPostModel, fallbackKey: number): CanvasPostModel {
      const key = post.id || `slot-${fallbackKey}`;
      const index = Math.max(0, Math.min(indices[key] ?? post.currentSlideIndex, post.slides.length - 1));
      return index === post.currentSlideIndex ? post : { ...post, currentSlideIndex: index };
    },
    navigate(post: CanvasPostModel, fallbackKey: number, index: number) {
      const key = post.id || `slot-${fallbackKey}`;
      setIndices(previous => ({ ...previous, [key]: index }));
    },
  };
}

export default function StudioSlideNavigation({ count, index, onChange }: {
  count: number;
  index: number;
  onChange: (index: number) => void;
}) {
  if (count < 2) return null;
  return (
    <nav aria-label="Páginas do carrossel" className="flex items-center justify-center gap-3 w-full py-2 text-xs text-white/80">
      <button type="button" aria-label="Página anterior do carrossel" disabled={index === 0}
        onClick={event => { event.stopPropagation(); onChange(index - 1); }}
        className="p-2 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-default">
        <ChevronLeft size={16} />
      </button>
      <span aria-live="polite" aria-atomic="true" className="min-w-24 text-center">Página {index + 1} de {count}</span>
      <button type="button" aria-label="Próxima página do carrossel" disabled={index === count - 1}
        onClick={event => { event.stopPropagation(); onChange(index + 1); }}
        className="p-2 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-default">
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}
