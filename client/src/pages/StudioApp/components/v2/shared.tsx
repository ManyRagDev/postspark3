import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "framer-motion";
import type { VisualFamilyId } from "@/pages/CanvasLab/components/types";
import LoadingTutorial from "./LoadingTutorial";

export const STUDIO = {
  bg: "#0B0A08",
  ink: "#F2EDE4",
  ink60: "rgba(242,237,228,0.6)",
  ink40: "rgba(242,237,228,0.4)",
  ink25: "rgba(242,237,228,0.25)",
  hairline: "rgba(242,237,228,0.12)",
  accent: "oklch(0.7 0.22 40)",
  urlSignal: "oklch(0.75 0.14 200)",
} as const;

export const MONO: CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  textTransform: "uppercase",
  letterSpacing: "0.18em",
};

export const URL_REGEX = /^(https?:\/\/)[^\s]+\.[^\s]{2,}/i;

export const SPECIMEN_FONTS = ["Playfair Display", "Anton", "Space Mono", "Bebas Neue", "Cinzel", "Syne"];

export function StudioMasthead() {
  const sessionNo = (() => {
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  })();

  return (
    <header
      className="flex items-baseline justify-between border-b px-5 py-3.5"
      style={{ borderColor: STUDIO.hairline }}
    >
      <span style={{ ...MONO, color: STUDIO.ink60, fontSize: 10 }}>PostSpark® — Estúdio de Criação</span>
      <span style={{ ...MONO, color: STUDIO.ink40, fontSize: 10 }}>Nº {sessionNo}</span>
    </header>
  );
}

export function FormatPictogram({ mode, active }: { mode: "static" | "carousel"; active: boolean }) {
  const stroke = active ? STUDIO.accent : STUDIO.ink40;

  if (mode === "static") {
    return (
      <div className="relative h-9 w-9 shrink-0">
        <div className="absolute inset-0 border" style={{ borderColor: stroke }} />
        <div className="absolute left-1.5 top-1.5 h-[3px] w-4" style={{ background: stroke }} />
        <div className="absolute left-1.5 top-[13px] h-px w-5" style={{ background: stroke, opacity: 0.55 }} />
        <div className="absolute left-1.5 top-[18px] h-px w-3" style={{ background: stroke, opacity: 0.55 }} />
      </div>
    );
  }

  return (
    <div className="relative h-9 w-11 shrink-0">
      <div className="absolute right-0 top-1 h-8 w-7 border" style={{ borderColor: stroke, opacity: 0.25 }} />
      <div className="absolute right-1.5 top-0.5 h-8 w-7 border" style={{ borderColor: stroke, opacity: 0.5 }} />
      <div className="absolute left-0 top-0 h-9 w-8 border" style={{ borderColor: stroke, background: STUDIO.bg }}>
        <div className="absolute left-1 top-1.5 h-[2.5px] w-3.5" style={{ background: stroke }} />
        <div className="absolute left-1 top-[11px] h-px w-4" style={{ background: stroke, opacity: 0.55 }} />
      </div>
    </div>
  );
}

export function FormatSelector({
  value,
  onChange,
}: {
  value: "static" | "carousel";
  onChange: (mode: "static" | "carousel") => void;
}) {
  const options: Array<{ id: "static" | "carousel"; label: string; hint: string }> = [
    { id: "static", label: "Post Único", hint: "Uma peça, um impacto" },
    { id: "carousel", label: "Carrossel", hint: "Narrativa em slides" },
  ];

  return (
    <div>
      <div style={{ ...MONO, color: STUDIO.ink40, fontSize: 10 }}>Formato</div>
      <div className="mt-2.5 grid grid-cols-2 gap-3">
        {options.map((option) => {
          const active = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.id)}
              className="flex items-center gap-3 rounded-md border p-3 text-left transition-colors duration-200 active:scale-[0.98]"
              style={{
                borderColor: active ? STUDIO.accent : STUDIO.hairline,
                background: active ? "oklch(0.7 0.22 40 / 6%)" : "transparent",
              }}
            >
              <FormatPictogram mode={option.id} active={active} />
              <div className="min-w-0">
                <div
                  style={{
                    ...MONO,
                    fontSize: 10,
                    color: active ? STUDIO.ink : STUDIO.ink60,
                  }}
                >
                  {option.label}
                </div>
                <div className="mt-0.5 text-[11px] leading-tight" style={{ color: STUDIO.ink40 }}>
                  {option.hint}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface Specimen {
  id: VisualFamilyId;
  prompt: string;
  familyLabel: string;
  art: ReactNode;
}

export function buildSpecimens(): Specimen[] {
  return [
    {
      id: "chromatic-block",
      prompt: "3 sinais de que sua marca parece amadora",
      familyLabel: "Minimalismo Brutal",
      art: (
        <div className="absolute inset-0 flex flex-col justify-between p-2" style={{ background: "#D92E1E" }}>
          <div
            className="self-end px-1 py-0.5 text-[6.5px] font-bold leading-none"
            style={{ background: "#FFD600", color: "#0B0A08", transform: "rotate(-4deg)" }}
          >
            ERRO COMUM
          </div>
          <div
            className="uppercase"
            style={{ fontFamily: "'Anton', sans-serif", color: "#FFFFFF", fontSize: 13.5, lineHeight: 1.05 }}
          >
            3 sinais de marca amadora
          </div>
        </div>
      ),
    },
    {
      id: "editorial-poster",
      prompt: "Por que marcas de luxo não competem por preço",
      familyLabel: "Editorial de Luxo",
      art: (
        <div className="absolute inset-0 flex flex-col p-2" style={{ background: "#120D0A" }}>
          <div style={{ fontFamily: "'Playfair Display', serif", color: "#E5A93C", fontSize: 22, lineHeight: 0.55, opacity: 0.55 }}>
            &ldquo;
          </div>
          <div className="mt-auto">
            <div
              style={{
                fontFamily: "'Playfair Display', serif",
                fontStyle: "italic",
                color: "#F8F4EE",
                fontSize: 10.5,
                lineHeight: 1.25,
              }}
            >
              Marcas de luxo não competem por preço
            </div>
            <div className="mt-1.5 h-px w-6" style={{ background: "#E5A93C" }} />
          </div>
        </div>
      ),
    },
    {
      id: "brutal-split",
      prompt: "O abismo entre marcas caras e marcas desejadas",
      familyLabel: "Brutal Split",
      art: (
        <div className="absolute inset-0 flex flex-col overflow-hidden">
          <div className="h-1/2 p-1.5 flex flex-col justify-center" style={{ background: "#0F172A" }}>
            <span className="text-[6px] font-mono text-cyan-400 font-bold uppercase tracking-wider">Metade 01</span>
            <span className="text-[9.5px] font-black uppercase text-white leading-tight" style={{ fontFamily: "'Syne', sans-serif" }}>
              Preço Caro
            </span>
          </div>
          <div className="h-1/2 p-1.5 flex flex-col justify-center" style={{ background: "#E11D48" }}>
            <span className="text-[6px] font-mono text-rose-200 font-bold uppercase tracking-wider">Metade 02</span>
            <span className="text-[9.5px] font-black uppercase text-white leading-tight" style={{ fontFamily: "'Syne', sans-serif" }}>
              Desejo Real
            </span>
          </div>
        </div>
      ),
    },
    {
      id: "glass-veil",
      prompt: "Como criar uma presença digital cinematográfica",
      familyLabel: "Glass Veil",
      art: (
        <div className="absolute inset-0 p-1.5 flex flex-col justify-center items-center" style={{ background: "radial-gradient(circle at center, #1E1B4B 0%, #08071A 100%)" }}>
          <div className="w-full p-1.5 rounded-lg border border-white/20 bg-white/10 backdrop-blur-sm text-center shadow-lg">
            <span className="text-[6px] font-mono uppercase bg-white/15 text-white/90 px-1 py-0.5 rounded-full inline-block mb-0.5">
              ✨ Luxo Fosco
            </span>
            <div className="text-[9px] font-bold text-white leading-tight">
              Presença Cinematográfica
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "quote-authority",
      prompt: "Como precificar seus serviços com autoridade",
      familyLabel: "Citação de Autoridade",
      art: (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center"
          style={{ background: "#0F172A" }}
        >
          <div
            style={{
              fontFamily: "'Cinzel', serif",
              color: "#F8FAFC",
              fontSize: 10,
              lineHeight: 1.35,
              letterSpacing: "0.03em",
            }}
          >
            Preço é o que se paga. Valor é o que se leva.
          </div>
          <div className="mt-2" style={{ width: 14, height: 1, background: "#38BDF8" }} />
        </div>
      ),
    },
    {
      id: "data-punch",
      prompt: "O dado que prova o valor da consistência visual",
      familyLabel: "Data Punch",
      art: (
        <div className="absolute inset-0 flex flex-col justify-between p-2" style={{ background: "#0D1117" }}>
          <div style={{ ...MONO, color: "rgba(255,255,255,0.4)", fontSize: 6.5, letterSpacing: "0.1em" }}>
            métrica // retenção
          </div>
          <div>
            <div
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                color: "#58A6FF",
                fontSize: 26,
                lineHeight: 1,
                letterSpacing: "-0.03em",
              }}
            >
              87%
            </div>
            <div className="mt-1" style={{ color: "rgba(255,255,255,0.7)", fontSize: 7.5, lineHeight: 1.25 }}>
              abandonam marcas sem padrão
            </div>
          </div>
        </div>
      ),
    },
  ];
}

export function SpecimenCard({
  specimen,
  index,
  onPick,
  withDisclaimer,
  widthClass,
  selected,
  onHover,
}: {
  specimen: Specimen;
  index: number;
  onPick: (prompt: string) => void;
  withDisclaimer?: boolean;
  widthClass?: string;
  selected?: boolean;
  onHover?: (index: number | null) => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={() => onPick(specimen.prompt)}
      onMouseEnter={() => onHover?.(index)}
      onMouseLeave={() => onHover?.(null)}
      aria-pressed={selected}
      className={`${widthClass ?? "w-[102px] md:w-auto md:flex-1"} shrink-0 md:shrink snap-start text-left active:scale-[0.97] transition-transform duration-150 cursor-pointer block`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.08 * index, ease: "easeOut" }}
      aria-label={`Usar ideia: ${specimen.prompt}`}
    >
      <div
        className="relative aspect-[4/5] w-full overflow-hidden rounded-md transition-all duration-200 shadow-md"
        style={{
          border: selected ? `1.5px solid ${STUDIO.accent}` : `1px solid ${STUDIO.hairline}`,
          boxShadow: selected ? "0 0 16px oklch(0.7 0.22 40 / 25%)" : "none",
        }}
      >
        {specimen.art}
      </div>
      <div
        className="mt-1.5 truncate"
        style={{
          ...MONO,
          color: selected ? STUDIO.accent : STUDIO.ink40,
          fontSize: 8,
          letterSpacing: "0.1em",
        }}
      >
        {selected ? `✓ ${specimen.familyLabel}` : specimen.familyLabel}
      </div>
      {withDisclaimer && !selected ? (
        <div className="mt-0.5 truncate" style={{ ...MONO, color: STUDIO.ink25, fontSize: 7.5, letterSpacing: "0.1em" }}>
          copy editável
        </div>
      ) : null}
    </motion.button>
  );
}

const PRODUCTION_STAGES = [
  { atSec: 0, text: "Analisando intenção e tom de voz" },
  { atSec: 2.5, text: "Estruturando ganchos e copywriting estratégico" },
  { atSec: 6.0, text: "Mapeando arquétipos visuais e paletas da marca" },
  { atSec: 10.5, text: "Sintetizando direção de arte e imagem de fundo" },
  { atSec: 16.0, text: "Calibrando tipografia e contraste inteligente" },
  { atSec: 23.0, text: "Finalizando composições em alta fidelidade" },
];

export function calculateRealisticProgress(elapsedSeconds: number): number {
  const s = Math.max(0, elapsedSeconds);
  if (s <= 3) {
    // 0s -> 3s: 12% -> 32% (rápido feedback tátil inicial)
    return Math.round(12 + (s / 3) * 20);
  }
  if (s <= 8) {
    // 3s -> 8s: 32% -> 62% (redação das variações e ganchos)
    return Math.round(32 + ((s - 3) / 5) * 30);
  }
  if (s <= 16) {
    // 8s -> 16s: 62% -> 84% (direção de arte e imagem de fundo)
    return Math.round(62 + ((s - 8) / 8) * 22);
  }
  if (s <= 28) {
    // 16s -> 28s: 84% -> 94% (acabamento e tokens de design)
    return Math.round(84 + ((s - 16) / 12) * 10);
  }
  // 28s+: avança assintoticamente até 98%, ganhando ~1% a cada 3s sem nunca congelar
  const extra = Math.min(4, Math.floor((s - 28) / 3));
  return Math.min(98, 94 + extra);
}

export function ProductionOverlay({ prompt }: { prompt: string }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Temporizador contínuo sem travamento artificial em 96%
  useEffect(() => {
    const startTime = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds((Date.now() - startTime) / 1000);
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  const progress = calculateRealisticProgress(elapsedSeconds);
  const visibleStages = PRODUCTION_STAGES.filter((st) => elapsedSeconds >= st.atSec);
  const recentStages = visibleStages.slice(-3);

  const cropMark = "absolute h-5 w-5 border-[rgba(242,237,228,0.4)]";

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: STUDIO.bg }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      role="status"
      aria-live="polite"
      aria-label="Gerando direções de arte"
    >
      <div className={`${cropMark} left-5 top-5 border-l border-t`} />
      <div className={`${cropMark} right-5 top-5 border-r border-t`} />
      <div className={`${cropMark} bottom-5 left-5 border-b border-l`} />
      <div className={`${cropMark} bottom-5 right-5 border-b border-r`} />

      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className="flex items-center gap-2" style={{ ...MONO, color: STUDIO.accent, fontSize: 10 }}>
          <motion.span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: STUDIO.accent }}
            animate={{ opacity: [1, 0.25, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
          Em produção
        </div>

        <p
          className="mt-5 line-clamp-3 max-w-[28ch]"
          style={{
            fontFamily: "'Playfair Display', serif",
            fontStyle: "italic",
            color: STUDIO.ink,
            fontSize: "1.65rem",
            lineHeight: 1.25,
          }}
        >
          {prompt}
        </p>

        {/* Barra de corrida com trilha e preenchimento fluido */}
        <div className="mt-8 w-64 max-w-full">
          <div className="flex justify-between items-center mb-1.5 px-0.5">
            <span style={{ ...MONO, color: STUDIO.ink40, fontSize: 8.5, letterSpacing: "0.14em" }}>
              Progresso
            </span>
            <span style={{ ...MONO, color: STUDIO.accent, fontSize: 9, fontWeight: 700 }}>
              {progress}%
            </span>
          </div>
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10 border border-white/10">
            <motion.div
              className="absolute top-0 bottom-0 left-0 rounded-full"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, oklch(0.7 0.22 40), oklch(0.8 0.24 60))",
                boxShadow: "0 0 12px oklch(0.7 0.22 40 / 60%)",
              }}
              transition={{ ease: "easeOut", duration: 0.1 }}
            />
          </div>
        </div>

        {/* Microetapas sincronizadas */}
        <div className="mt-6 space-y-1.5 min-h-[54px]">
          {recentStages.map((st) => (
            <motion.p
              key={st.text}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              style={{ ...MONO, color: STUDIO.ink40, fontSize: 9.5, letterSpacing: "0.14em" }}
            >
              {st.text}
            </motion.p>
          ))}
        </div>

        {/* Mini-tutorial visual durante a espera (item 11) */}
        <div className="mt-7 w-full max-w-[340px]">
          <LoadingTutorial />
        </div>
      </div>

      <div className="pb-[calc(env(safe-area-inset-bottom,0px)+28px)] text-center">
        <span style={{ ...MONO, color: STUDIO.ink25, fontSize: 9 }}>Inteligência visual em tempo real • Direção de arte personalizada</span>
      </div>
    </motion.div>
  );
}
