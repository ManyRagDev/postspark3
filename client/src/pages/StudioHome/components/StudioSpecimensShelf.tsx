import { useState } from "react";
import { Sparkles, ZoomIn } from "lucide-react";
import { buildSpecimens, SpecimenCard, type Specimen } from "@/pages/StudioApp/components/v2/shared";

interface StudioSpecimensShelfProps {
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export default function StudioSpecimensShelf({
  selectedIndex,
  onSelect,
}: StudioSpecimensShelfProps) {
  const specimens = buildSpecimens();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const activeSpecimen = hoveredIndex !== null ? specimens[hoveredIndex] : null;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-3 relative z-30 select-none">
      {/* Header da Prateleira com Selo de Direção de Arte */}
      <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.2em] text-white/50 px-1">
        <span className="flex items-center gap-1.5 text-white/70">
          <Sparkles size={13} className="text-[#FF5C00]" />
          <span>Catálogo de Espécimes Visuais</span>
        </span>
        <span className="hidden sm:inline text-white/40 text-[10px]">
          Passe o mouse para inspecionar em 2x
        </span>
      </div>

      {/* Container Relativo para Lente Flutuante e Grade */}
      <div className="relative">
        {/* Lente Flutuante de Inspeção Rápida (Desktop Quick Look) */}
        {hoveredIndex !== null && activeSpecimen && (
          <div
            className="hidden md:block absolute bottom-full mb-3 pointer-events-none z-50 transition-all duration-150 ease-out"
            style={{
              left:
                hoveredIndex === 0
                  ? "0%"
                  : hoveredIndex === specimens.length - 1
                  ? "100%"
                  : `${(hoveredIndex / (specimens.length - 1)) * 100}%`,
              transform:
                hoveredIndex === 0
                  ? "translateX(0%)"
                  : hoveredIndex === specimens.length - 1
                  ? "translateX(-100%)"
                  : "translateX(-50%)",
            }}
          >
            <div className="p-2 rounded-2xl border border-white/20 bg-black/90 backdrop-blur-2xl shadow-[0_25px_60px_rgba(0,0,0,0.9)] flex flex-col items-center">
              {/* Moldura do Card Ampliado com Escala Óptica Real de 2x */}
              <div className="relative w-[184px] h-[184px] rounded-xl overflow-hidden border border-white/10 shadow-inner">
                <div
                  className="absolute inset-0 origin-top-left"
                  style={{
                    width: "92px",
                    height: "92px",
                    transform: "scale(2)",
                    transformOrigin: "0 0",
                  }}
                >
                  {activeSpecimen.art}
                </div>
              </div>

              {/* Rótulo da Família na Lente */}
              <div className="mt-2 text-center">
                <span className="text-[11px] font-mono font-bold tracking-wider text-white uppercase">
                  {activeSpecimen.familyLabel}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Grade Responsiva dos 6 Espécimes */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 p-2 rounded-2xl bg-[#100F0D]/80 border border-white/8 backdrop-blur-xl">
          {specimens.map((specimen, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={specimen.id}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                onClick={() => onSelect(idx)}
                className={`relative rounded-xl overflow-hidden border cursor-pointer transition-all duration-200 aspect-square ${
                  isSelected
                    ? "border-[#FF5C00] shadow-[0_0_15px_rgba(255,92,0,0.4)] ring-1 ring-[#FF5C00]"
                    : "border-white/10 hover:border-white/30 hover:scale-[1.03]"
                }`}
              >
                <div className="absolute inset-0 pointer-events-none">
                  {specimen.art}
                </div>

                {/* Badge Inferior Sutil com o Nome da Família */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1 pt-3 text-center">
                  <span className="text-[8px] sm:text-[9px] font-bold text-white/90 truncate block uppercase tracking-tight">
                    {specimen.familyLabel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
