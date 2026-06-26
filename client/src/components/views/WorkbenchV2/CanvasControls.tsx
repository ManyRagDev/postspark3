import { motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, Magnet } from "lucide-react";
import type { CarouselSlide } from "@shared/postspark";
import type { ApplyScope } from "@/store/editorStore";

export function MagnetControl({ active, accentColor, isMobile, onChange }: { active: boolean; accentColor: string; isMobile?: boolean; onChange(active: boolean): void }) {
  return (
    <div className={`${isMobile ? "absolute -bottom-12" : "absolute -bottom-8"} left-1/2 z-50 flex -translate-x-1/2 justify-center`}>
      <button
        type="button"
        onClick={event => { event.stopPropagation(); onChange(!active); }}
        className={`group/magnet flex items-center rounded-full border font-black uppercase shadow-xl transition-all duration-500 hover:scale-105 active:scale-95 ${isMobile ? "gap-2 px-5 py-2 text-[10px] tracking-[0.14em]" : "gap-1.5 px-2.5 py-1 text-[8px] tracking-[0.12em]"}`}
        style={{
          background: active ? `${accentColor}15` : "rgba(12,12,20,0.9)",
          borderColor: active ? accentColor : "rgba(255,255,255,0.1)",
          color: active ? accentColor : "rgba(255,255,255,0.4)",
          backdropFilter: "blur(12px)",
          boxShadow: active ? `0 0 18px ${accentColor}35, inset 0 0 8px ${accentColor}18` : "0 6px 18px -8px rgba(0,0,0,0.8)",
        }}
        title="Ativar/desativar ima"
      >
        <div className="relative">
          {active && <motion.div layoutId="magnet-glow" className="absolute inset-0 rounded-full blur-md" style={{ backgroundColor: accentColor }} animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.6, 0.3] }} transition={{ repeat: Infinity, duration: 2 }} />}
          <Magnet size={isMobile ? 20 : 10} className={`relative z-10 transition-all duration-500 ${active ? "rotate-[15deg] scale-110" : "opacity-50"}`} />
        </div>
        <span className="relative z-10">Ima {active ? "ON" : "OFF"}</span>
      </button>
    </div>
  );
}

export function CarouselScopeControl({ slides, index, scope, selectedIndices, accentColor, onScopeChange, onToggleSlideSelection }: {
  slides: CarouselSlide[];
  index: number;
  scope: ApplyScope;
  selectedIndices: number[];
  accentColor: string;
  onScopeChange(scope: ApplyScope): void;
  onToggleSlideSelection(index: number): void;
}) {
  if (slides.length === 0) return null;

  const effectiveSelected = selectedIndices.length > 0 ? selectedIndices : [index];
  const scopeOptions: Array<{ id: ApplyScope; label: string; detail: string }> = [
    { id: "current", label: "Slide atual", detail: `So slide ${index + 1}` },
    { id: "all", label: "Todos", detail: `${slides.length} slides` },
    { id: "selected", label: "Escolher", detail: `${effectiveSelected.length} selecionado${effectiveSelected.length === 1 ? "" : "s"}` },
  ];

  return (
    <div className="pointer-events-auto w-[min(94vw,620px)] rounded-2xl border border-white/10 bg-black/65 p-2.5 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 px-1 pb-2">
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">
          Aplicar alteracoes em
        </span>
        <span className="min-w-0 truncate text-[11px] font-semibold text-white/70">
          Slide {index + 1} de {slides.length}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {scopeOptions.map(option => {
          const selected = scope === option.id;
          return (
            <button
              type="button"
              key={option.id}
              onClick={() => onScopeChange(option.id)}
              className="min-w-0 rounded-xl border px-2 py-2 text-left transition-colors hover:bg-white/5 active:scale-[0.98]"
              style={{
                background: selected ? `${accentColor}1f` : "rgba(255,255,255,0.03)",
                borderColor: selected ? `${accentColor}70` : "rgba(255,255,255,0.08)",
                color: selected ? accentColor : "rgba(255,255,255,0.78)",
              }}
            >
              <span className="block truncate text-[11px] font-black uppercase tracking-[0.08em]">
                {option.label}
              </span>
              <span className="mt-0.5 block truncate text-[10px] font-semibold text-white/45">
                {option.detail}
              </span>
            </button>
          );
        })}
      </div>
      {scope === "selected" && (
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {slides.map((slide, slideIndex) => {
            const checked = effectiveSelected.includes(slideIndex);
            return (
              <button
                type="button"
                key={slideIndex}
                onClick={() => onToggleSlideSelection(slideIndex)}
                className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 py-1.5 text-[11px] font-bold transition-colors hover:bg-white/5 active:scale-[0.98]"
                style={{
                  background: checked ? `${accentColor}1f` : "rgba(255,255,255,0.03)",
                  borderColor: checked ? `${accentColor}70` : "rgba(255,255,255,0.08)",
                  color: checked ? accentColor : "rgba(255,255,255,0.6)",
                }}
                title={slide.headline ? `Slide ${slideIndex + 1}: ${slide.headline}` : `Slide ${slideIndex + 1}`}
              >
                <span
                  className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border"
                  style={{
                    borderColor: checked ? accentColor : "rgba(255,255,255,0.25)",
                    background: checked ? accentColor : "transparent",
                  }}
                >
                  {checked && <Check size={9} className="text-black" strokeWidth={3} />}
                </span>
                <span>S{slideIndex + 1}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CarouselSlideNavigator({ slides, currentIndex, accentColor, onIndexChange }: {
  slides: CarouselSlide[];
  currentIndex: number;
  accentColor: string;
  onIndexChange: (i: number) => void;
}) {
  if (slides.length <= 1) return null;

  const goToPrevious = () => onIndexChange((currentIndex - 1 + slides.length) % slides.length);
  const goToNext = () => onIndexChange((currentIndex + 1) % slides.length);

  return (
    <div className="pointer-events-auto flex max-w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/55 px-3 py-2.5 shadow-2xl backdrop-blur-xl">
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); goToPrevious(); }}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80 transition-all hover:bg-white/10 active:scale-95"
        title="Slide anterior"
      >
        <ChevronLeft size={18} />
      </button>
      <div className="flex min-w-0 items-center justify-center gap-1.5">
        {slides.map((slide, index) => {
          const isActive = index === currentIndex;
          return (
            <button
              key={index}
              type="button"
              onClick={(event) => { event.stopPropagation(); onIndexChange(index); }}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-[12px] font-black transition-all duration-200 active:scale-95 ${isActive ? "shadow-lg" : "opacity-70 hover:opacity-100"}`}
              style={{
                borderColor: isActive ? accentColor : "rgba(255,255,255,0.15)",
                borderWidth: isActive ? 2 : 1,
                borderStyle: "solid",
                background: isActive ? `${accentColor}18` : "rgba(255,255,255,0.05)",
                boxShadow: isActive ? `0 0 0 1px ${accentColor}55, 0 10px 30px rgba(0,0,0,0.35)` : undefined,
                color: isActive ? accentColor : "rgba(255,255,255,0.65)",
              }}
              title={slide.headline ? `Ir para slide ${index + 1}: ${slide.headline}` : `Ir para slide ${index + 1}`}
            >
              {index + 1}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); goToNext(); }}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80 transition-all hover:bg-white/10 active:scale-95"
        title="Proximo slide"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

export function CarouselMobileArrows({ slides, currentIndex, accentColor, onIndexChange }: {
  slides: CarouselSlide[];
  currentIndex: number;
  accentColor: string;
  onIndexChange: (i: number) => void;
}) {
  if (slides.length <= 1) return null;

  const goToPrevious = () => onIndexChange((currentIndex - 1 + slides.length) % slides.length);
  const goToNext = () => onIndexChange((currentIndex + 1) % slides.length);

  return (
    <div className="pointer-events-auto flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-black/55 px-3 py-2.5 shadow-2xl backdrop-blur-xl">
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); goToPrevious(); }}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/85 transition-all active:scale-95"
        title="Slide anterior"
      >
        <ChevronLeft size={20} />
      </button>
      <span
        className="min-w-20 text-center text-[11px] font-black uppercase tracking-[0.12em]"
        style={{ color: accentColor }}
      >
        {currentIndex + 1} / {slides.length}
      </span>
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); goToNext(); }}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/85 transition-all active:scale-95"
        title="Proximo slide"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}
