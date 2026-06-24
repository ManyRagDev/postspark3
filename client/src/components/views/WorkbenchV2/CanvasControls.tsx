import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Magnet } from "lucide-react";
import type { CarouselSlide } from "@shared/postspark";
import type { ApplyScope } from "@/store/editorStore";

export function MagnetControl({ active, accentColor, onChange }: { active: boolean; accentColor: string; onChange(active: boolean): void }) {
  return (
    <div className="absolute -bottom-14 left-1/2 z-50 flex -translate-x-1/2 justify-center">
      <button
        type="button"
        onClick={event => { event.stopPropagation(); onChange(!active); }}
        className="group/magnet flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-[0.15em] shadow-2xl transition-all duration-500 hover:scale-105 active:scale-95"
        style={{
          background: active ? `${accentColor}15` : "rgba(12,12,20,0.9)",
          borderColor: active ? accentColor : "rgba(255,255,255,0.1)",
          color: active ? accentColor : "rgba(255,255,255,0.4)",
          backdropFilter: "blur(12px)",
          boxShadow: active ? `0 0 30px ${accentColor}40, inset 0 0 12px ${accentColor}20` : "0 8px 32px -8px rgba(0,0,0,0.8)",
        }}
        title="Ativar/Desativar Snap-to-Grid"
      >
        <div className="relative">
          {active && <motion.div layoutId="magnet-glow" className="absolute inset-0 rounded-full blur-md" style={{ backgroundColor: accentColor }} animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.6, 0.3] }} transition={{ repeat: Infinity, duration: 2 }} />}
          <Magnet size={14} className={`relative z-10 transition-all duration-500 ${active ? "rotate-[15deg] scale-110" : "opacity-50"}`} />
        </div>
        <span className="relative z-10">Ímã {active ? "ON" : "OFF"}</span>
      </button>
    </div>
  );
}

export function CarouselControls({ slides, index, scope, accentColor, onIndexChange, onScopeChange }: {
  slides: CarouselSlide[];
  index: number;
  scope: ApplyScope;
  accentColor: string;
  onIndexChange(index: number): void;
  onScopeChange(scope: ApplyScope): void;
}) {
  if (slides.length === 0) return null;
  return (
    <div className="absolute left-1/2 top-6 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-black/60 px-3 py-2 shadow-2xl backdrop-blur-md">
      <button type="button" onClick={() => onIndexChange((index - 1 + slides.length) % slides.length)} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/6 text-white/75" title="Slide anterior"><ChevronLeft size={14} /></button>
      <div className="flex items-center gap-1.5">
        {slides.map((_, slideIndex) => <button type="button" key={slideIndex} onClick={() => onIndexChange(slideIndex)} className="rounded-full transition-all" style={{ width: slideIndex === index ? 20 : 6, height: 6, background: slideIndex === index ? accentColor : "rgba(255,255,255,0.22)" }} title={`Slide ${slideIndex + 1}`} />)}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/65">{index + 1}/{slides.length}</span>
      <div className="mx-1 h-5 w-px bg-white/10" />
      <div className="flex items-center gap-1 rounded-full border border-white/8 bg-white/5 p-1">
        {([{ id: "current", label: "Este slide" }, { id: "all", label: "Todos" }] as const).map(option => {
          const selected = scope === option.id;
          return <button type="button" key={option.id} onClick={() => onScopeChange(option.id)} className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ background: selected ? `${accentColor}20` : "transparent", border: `1px solid ${selected ? `${accentColor}66` : "transparent"}`, color: selected ? accentColor : "rgba(255,255,255,0.55)" }}>{option.label}</button>;
        })}
      </div>
      <button type="button" onClick={() => onIndexChange((index + 1) % slides.length)} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/6 text-white/75" title="Próximo slide"><ChevronRight size={14} /></button>
    </div>
  );
}
