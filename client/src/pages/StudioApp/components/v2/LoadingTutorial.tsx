/**
 * LoadingTutorial — mini-tutorial visual exibido durante a geração (item 11).
 *
 * 4 passos ilustrados em SVG inline (zero assets binários, zero peso de rede):
 *   1. Escolha a direção na galeria (clique/toque no card);
 *   2. Edite textos, cores e tamanhos na aba Texto;
 *   3. Arraste elementos e enquadre o fundo (duplo clique);
 *   4. Salve na biblioteca e exporte em 4K.
 *
 * Rotação automática a cada 3.5s com crossfade + dots; swipe no mobile;
 * `prefers-reduced-motion` desativa o autoplay.
 */

import { useEffect, useState, type CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";

const INK = "#F2EDE4";
const ACCENT = "oklch(0.7 0.22 40)";
const FADED = "rgba(242,237,228,0.35)";

const MONO: CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  textTransform: "uppercase",
  letterSpacing: "0.18em",
};

interface TutorialStep {
  title: string;
  caption: string;
  art: React.ReactNode;
}

const steps: TutorialStep[] = [
  {
    title: "Escolha a direção",
    caption: "Clique (ou toque) no card da galeria para editar",
    art: (
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden="true">
        <rect x="6" y="16" width="20" height="26" rx="3" stroke={FADED} strokeWidth="1.5" />
        <rect x="46" y="16" width="20" height="26" rx="3" stroke={FADED} strokeWidth="1.5" />
        <rect x="26" y="12" width="20" height="30" rx="3" stroke={ACCENT} strokeWidth="2" />
        <line x1="30" y1="19" x2="42" y2="19" stroke={ACCENT} strokeWidth="2" />
        <line x1="30" y1="25" x2="38" y2="25" stroke={ACCENT} strokeWidth="1.2" opacity="0.6" />
        <circle cx="36" cy="52" r="8" stroke={ACCENT} strokeWidth="1.2" opacity="0.7" />
        <circle cx="36" cy="52" r="2.4" fill={ACCENT} />
        <line x1="36" y1="44" x2="36" y2="40" stroke={ACCENT} strokeWidth="1.5" opacity="0.7" />
      </svg>
    ),
  },
  {
    title: "Edite textos e cores",
    caption: "Na aba Texto: título, corpo, cores e tamanho da fonte",
    art: (
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden="true">
        <rect x="14" y="10" width="44" height="52" rx="5" stroke={FADED} strokeWidth="1.5" />
        <line x1="22" y1="22" x2="50" y2="22" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="22" y1="29" x2="42" y2="29" stroke={INK} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        <line x1="22" y1="38" x2="50" y2="38" stroke={FADED} strokeWidth="1.5" strokeLinecap="round" />
        <line x1="22" y1="44" x2="44" y2="44" stroke={FADED} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="26" cy="55" r="4" fill={ACCENT} />
        <circle cx="36" cy="55" r="4" stroke={ACCENT} strokeWidth="1.5" />
        <circle cx="46" cy="55" r="4" stroke={FADED} strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    title: "Arraste e enquadre",
    caption: "Arraste textos no palco; duplo clique no fundo ajusta a foto",
    art: (
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden="true">
        <rect x="12" y="14" width="48" height="44" rx="5" stroke={FADED} strokeWidth="1.5" />
        <rect x="22" y="24" width="28" height="10" rx="2" stroke={ACCENT} strokeWidth="1.8" />
        <rect x="22" y="40" width="20" height="7" rx="2" stroke={FADED} strokeWidth="1.2" />
        <circle cx="22" cy="14" r="3" fill={ACCENT} />
        <circle cx="60" cy="58" r="3" fill={ACCENT} />
        <path d="M53 20 l6 -6 m0 0 v4.5 m0 -4.5 h-4.5" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Salve e exporte em 4K",
    caption: "Salvar guarda na biblioteca; Exportar baixa em alta resolução",
    art: (
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden="true">
        <path d="M24 10 h24 v44 l-12 -8 -12 8 z" stroke={ACCENT} strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="52" cy="52" r="12" stroke={FADED} strokeWidth="1.5" />
        <path d="M52 46 v10 m0 0 l-3.5 -3.5 m3.5 3.5 l3.5 -3.5" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const STEP_DURATION_MS = 3500;

export default function LoadingTutorial() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % steps.length);
    }, STEP_DURATION_MS);
    return () => window.clearInterval(timer);
  }, []);

  const step = steps[index];

  return (
    <div
      className="select-none"
      role="region"
      aria-label="Dicas de como usar o PostSpark durante a geração"
    >
      <div className="relative h-[104px] overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            className="absolute inset-0 flex items-center gap-4 px-4"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.12}
            onDragEnd={(_, info) => {
              if (info.offset.x < -56) setIndex((prev) => (prev + 1) % steps.length);
              else if (info.offset.x > 56) setIndex((prev) => (prev - 1 + steps.length) % steps.length);
            }}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.32, ease: "easeOut" }}
          >
            <div className="shrink-0">{step.art}</div>
            <div className="min-w-0 text-left">
              <p
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ ...MONO, color: ACCENT, fontSize: 10 }}
              >
                Passo {index + 1} de {steps.length}
              </p>
              <p className="text-sm font-bold text-white leading-tight mt-1">{step.title}</p>
              <p className="text-[11px] text-white/50 leading-snug mt-1">{step.caption}</p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dots de navegação do tutorial */}
      <div className="flex items-center justify-center gap-1.5 mt-2">
        {steps.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Ver dica ${i + 1}`}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
              i === index ? "w-5 bg-[#FF5C00]" : "w-1.5 bg-white/20 hover:bg-white/35"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
