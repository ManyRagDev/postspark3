import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "framer-motion";
import type { VisualFamilyId } from "@/pages/CanvasLab/components/types";

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

export const SPECIMEN_FONTS = ["Playfair Display", "Anton", "Space Mono", "Bebas Neue", "Cinzel"];

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
        <div className="absolute inset-0 flex flex-col justify-between p-2.5" style={{ background: "#D92E1E" }}>
          <div
            className="self-end px-1.5 py-0.5 text-[7px] font-bold leading-none"
            style={{ background: "#FFD600", color: "#0B0A08", transform: "rotate(-4deg)" }}
          >
            ERRO COMUM
          </div>
          <div
            className="uppercase"
            style={{ fontFamily: "'Anton', sans-serif", color: "#FFFFFF", fontSize: 17, lineHeight: 1.05 }}
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
        <div className="absolute inset-0 flex flex-col p-2.5" style={{ background: "#120D0A" }}>
          <div style={{ fontFamily: "'Playfair Display', serif", color: "#E5A93C", fontSize: 30, lineHeight: 0.55, opacity: 0.55 }}>
            &ldquo;
          </div>
          <div className="mt-auto">
            <div
              style={{
                fontFamily: "'Playfair Display', serif",
                fontStyle: "italic",
                color: "#F8F4EE",
                fontSize: 12.5,
                lineHeight: 1.3,
              }}
            >
              Marcas de luxo não competem por preço
            </div>
            <div className="mt-2 h-px w-8" style={{ background: "#E5A93C" }} />
          </div>
        </div>
      ),
    },
    {
      id: "cyber-glitch",
      prompt: "O erro fatal que destrói o engajamento no Instagram",
      familyLabel: "Cyber & Glitch",
      art: (
        <div className="absolute inset-0 p-2.5" style={{ background: "#040812" }}>
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,240,255,0.05) 2px, rgba(0,240,255,0.05) 3px)",
            }}
          />
          <div style={{ ...MONO, color: "#00F0FF", fontSize: 7, letterSpacing: "0.12em" }}>sys://diagnóstico</div>
          <div
            className="mt-2"
            style={{ fontFamily: "'Space Mono', monospace", color: "#E0F7FA", fontSize: 10.5, lineHeight: 1.45 }}
          >
            [erro_fatal]
            <br />
            no engajamento
          </div>
          <div className="absolute bottom-2 left-2.5" style={{ ...MONO, color: "rgba(0,240,255,0.5)", fontSize: 7 }}>
            + &nbsp;+ &nbsp;+
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
          className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center"
          style={{ background: "#0F172A" }}
        >
          <div
            style={{
              fontFamily: "'Cinzel', serif",
              color: "#F8FAFC",
              fontSize: 11.5,
              lineHeight: 1.45,
              letterSpacing: "0.05em",
            }}
          >
            Preço é o que se paga. Valor é o que se leva.
          </div>
          <div className="mt-2.5" style={{ width: 16, height: 1, background: "#38BDF8" }} />
        </div>
      ),
    },
    {
      id: "data-punch",
      prompt: "O dado que prova o valor da consistência visual",
      familyLabel: "Data Punch",
      art: (
        <div className="absolute inset-0 flex flex-col justify-between p-2.5" style={{ background: "#0D1117" }}>
          <div style={{ ...MONO, color: "rgba(255,255,255,0.4)", fontSize: 7, letterSpacing: "0.12em" }}>
            métrica // retenção
          </div>
          <div>
            <div
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                color: "#58A6FF",
                fontSize: 32,
                lineHeight: 1,
                letterSpacing: "-0.03em",
              }}
            >
              87%
            </div>
            <div className="mt-1.5" style={{ color: "rgba(255,255,255,0.7)", fontSize: 8.5, lineHeight: 1.35 }}>
              abandonam marcas visualmente inconsistentes
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "stroke-impact",
      prompt: "Pare de parecer amadora: o padrão visual das marcas premium",
      familyLabel: "Stroke Impact",
      art: (
        <div className="absolute inset-0 flex flex-col justify-center p-2.5" style={{ background: "#0A0A0C" }}>
          <div
            className="uppercase"
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 23,
              lineHeight: 0.95,
              color: "transparent",
              WebkitTextStrokeWidth: "1.2px",
              WebkitTextStrokeColor: "#FFFFFF",
            }}
          >
            Pare de
          </div>
          <div
            className="uppercase"
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 23, lineHeight: 0.95, color: "#FF4D30" }}
          >
            parecer amadora
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
}: {
  specimen: Specimen;
  index: number;
  onPick: (prompt: string) => void;
  withDisclaimer?: boolean;
  widthClass?: string;
  selected?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={() => onPick(specimen.prompt)}
      aria-pressed={selected}
      className={`${widthClass ?? "w-[118px]"} shrink-0 snap-start text-left active:scale-[0.97] transition-transform duration-150`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.08 * index, ease: "easeOut" }}
      aria-label={`Usar ideia: ${specimen.prompt}`}
    >
      <div
        className="relative aspect-[4/5] w-full overflow-hidden rounded-sm transition-all duration-200"
        style={{
          border: selected ? `1.5px solid ${STUDIO.accent}` : `1px solid ${STUDIO.hairline}`,
          boxShadow: selected ? "0 0 16px oklch(0.7 0.22 40 / 20%)" : "none",
        }}
      >
        {specimen.art}
      </div>
      <div
        className="mt-1.5"
        style={{
          ...MONO,
          color: selected ? STUDIO.accent : STUDIO.ink40,
          fontSize: 8.5,
          letterSpacing: "0.12em",
        }}
      >
        {selected ? `✓ Gosto — ${specimen.familyLabel}` : specimen.familyLabel}
      </div>
      {withDisclaimer && !selected ? (
        <div className="mt-0.5" style={{ ...MONO, color: STUDIO.ink25, fontSize: 8, letterSpacing: "0.14em" }}>
          copy editável · gosto opcional
        </div>
      ) : null}
    </motion.button>
  );
}

const PRODUCTION_LOG = [
  "Analisando intenção e tom de voz",
  "Escrevendo copies e ganchos estratégicos",
  "Calibrando tipografia e direções de arte",
];

export function ProductionOverlay({ prompt }: { prompt: string }) {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setStageIndex((prev) => (prev < PRODUCTION_LOG.length - 1 ? prev + 1 : prev));
    }, 1400);
    return () => window.clearInterval(interval);
  }, []);

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
          className="mt-5 line-clamp-4 max-w-[26ch]"
          style={{
            fontFamily: "'Playfair Display', serif",
            fontStyle: "italic",
            color: STUDIO.ink,
            fontSize: "1.7rem",
            lineHeight: 1.22,
          }}
        >
          {prompt}
        </p>

        <div className="relative mt-9 h-px w-44 overflow-hidden" style={{ background: STUDIO.hairline }}>
          <motion.div
            className="absolute top-0 h-px w-16"
            style={{ background: STUDIO.accent }}
            animate={{ x: [-64, 176] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <div className="mt-9 space-y-1.5">
          {PRODUCTION_LOG.slice(0, stageIndex + 1).map((line) => (
            <motion.p
              key={line}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              style={{ ...MONO, color: STUDIO.ink40, fontSize: 9.5, letterSpacing: "0.14em" }}
            >
              {line}
            </motion.p>
          ))}
        </div>
      </div>

      <div className="pb-[calc(env(safe-area-inset-bottom,0px)+28px)] text-center">
        <span style={{ ...MONO, color: STUDIO.ink25, fontSize: 9 }}>Geração única — 2 a 4 segundos</span>
      </div>
    </motion.div>
  );
}
