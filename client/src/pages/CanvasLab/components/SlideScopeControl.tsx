interface SlideScopeControlProps {
  slideCount: number;
  currentSlideIndex: number;
  applyToAllSlides: boolean;
  onToggleApplyToAll: (value: boolean) => void;
}

export default function SlideScopeControl({
  slideCount,
  currentSlideIndex,
  applyToAllSlides,
  onToggleApplyToAll,
}: SlideScopeControlProps) {
  if (slideCount < 2) return null;

  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-orange-400/30 bg-orange-400/10 p-3 text-white">
      <span className="min-w-0">
        <span className="block text-xs font-semibold">Aplicar fundo a todos os slides</span>
        <span className="block text-[11px] text-white/60">
          {applyToAllSlides
            ? "Imagem, enquadramento e divisão em todo o carrossel"
            : `Imagem, enquadramento e divisão só no slide ${currentSlideIndex + 1}`}
        </span>
        <span className="mt-1 block text-[10px] text-white/45">Tipografia, cores e overlay já valem para todos.</span>
      </span>
      <input
        type="checkbox"
        checked={applyToAllSlides}
        onChange={(event) => onToggleApplyToAll(event.target.checked)}
        className="h-5 w-5 shrink-0 accent-orange-400"
      />
    </label>
  );
}
