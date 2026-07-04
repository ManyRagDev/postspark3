/**
 * HeroDemo — o palco vivo da landing.
 *
 * Roteiro scriptado (zero API): o input digita sozinho a ideia,
 * a síntese respira, três posts nascem em leque e o do centro
 * ganha alças de edição por um instante — "alguém acabou de soltar o mouse".
 */

import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
} from "framer-motion";
import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/useMobile";
import { analytics } from "@/lib/analytics";
import CtaButton from "./CtaButton";
import MiniPost from "./MiniPost";
import { demoScenarios, type DemoScenario } from "./demoScenarios";

type Phase = "typing" | "thinking" | "reveal" | "editing" | "done";

const CARDS_VISIBLE: Phase[] = ["reveal", "editing", "done"];

interface FanPosition {
  x: string;
  y: number;
  rotate: number;
  scale: number;
  z: number;
  delay: number;
}

function getFanPositions(isMobile: boolean): FanPosition[] {
  const spread = isMobile ? "52%" : "62%";
  const sideScale = isMobile ? 0.8 : 0.86;
  const sideY = isMobile ? 18 : 26;
  return [
    { x: `-${spread}`, y: sideY, rotate: -9, scale: sideScale, z: 1, delay: 0 },
    { x: "0%", y: 0, rotate: 0, scale: 1, z: 3, delay: 0.14 },
    { x: spread, y: sideY, rotate: 9, scale: sideScale, z: 2, delay: 0.28 },
  ];
}

function EditHandles({ accent }: { accent: string }) {
  const dots = [
    "top-0 left-0 -translate-x-1/2 -translate-y-1/2",
    "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2",
    "top-0 right-0 translate-x-1/2 -translate-y-1/2",
    "top-1/2 left-0 -translate-x-1/2 -translate-y-1/2",
    "top-1/2 right-0 translate-x-1/2 -translate-y-1/2",
    "bottom-0 left-0 -translate-x-1/2 translate-y-1/2",
    "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2",
    "bottom-0 right-0 translate-x-1/2 translate-y-1/2",
  ];
  return (
    <motion.div
      className="pointer-events-none absolute -inset-1.5 z-10"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className="absolute inset-0 rounded-2xl"
        style={{ border: `1.5px solid ${accent}`, boxShadow: `0 0 24px -6px ${accent}` }}
      />
      {dots.map((pos, i) => (
        <span
          key={i}
          className={`absolute ${pos} block h-2 w-2 rounded-[3px] bg-background`}
          style={{ border: `1.5px solid ${accent}` }}
        />
      ))}
      {/* toolbar fake flutuando sobre o card */}
      <motion.div
        className="absolute -top-9 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-[--bg-floating] px-3 py-1.5"
        style={{ background: "rgba(19,20,28,0.92)" }}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ delay: 0.15 }}
      >
        <span className="font-display text-[11px] font-semibold text-white/80">Aa</span>
        <span className="h-3 w-px bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
        <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.75_0.14_200)]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.65_0.2_350)]" />
      </motion.div>
    </motion.div>
  );
}

function DemoStage({ scenario, runId }: { scenario: DemoScenario; runId: number }) {
  const reduced = useReducedMotion();
  const isMobile = useIsMobile();
  const [phase, setPhase] = useState<Phase>("typing");
  const [typed, setTyped] = useState("");
  const [statusIdx, setStatusIdx] = useState(0);

  const positions = useMemo(() => getFanPositions(isMobile), [isMobile]);

  // ato 1 — digitação
  useEffect(() => {
    if (reduced) {
      setTyped(scenario.prompt);
      setPhase("done");
      return;
    }
    setTyped("");
    setStatusIdx(0);
    setPhase("typing");
    let i = 0;
    const timeouts: number[] = [];
    const interval = window.setInterval(() => {
      i += 1;
      setTyped(scenario.prompt.slice(0, i));
      if (i >= scenario.prompt.length) {
        window.clearInterval(interval);
        timeouts.push(window.setTimeout(() => setPhase("thinking"), 420));
      }
    }, 26);
    return () => {
      window.clearInterval(interval);
      timeouts.forEach((t) => window.clearTimeout(t));
    };
  }, [scenario, runId, reduced]);

  // atos 2-4 — síntese, revelação, edição
  useEffect(() => {
    if (phase === "thinking") {
      const cycle = window.setInterval(
        () => setStatusIdx((s) => (s + 1) % scenario.statusLines.length),
        780,
      );
      const next = window.setTimeout(() => setPhase("reveal"), 2050);
      return () => {
        window.clearInterval(cycle);
        window.clearTimeout(next);
      };
    }
    if (phase === "reveal") {
      const next = window.setTimeout(() => setPhase("editing"), 1250);
      return () => window.clearTimeout(next);
    }
    if (phase === "editing") {
      const next = window.setTimeout(() => setPhase("done"), 2000);
      return () => window.clearTimeout(next);
    }
  }, [phase, scenario.statusLines.length]);

  const cardsVisible = CARDS_VISIBLE.includes(phase);
  const centerAccent = scenario.posts[1].palette.accent;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* input simulado */}
      <motion.div
        className="relative rounded-2xl border px-4 py-3.5 sm:px-5"
        animate={{
          borderColor:
            phase === "thinking"
              ? "oklch(0.75 0.14 200 / 55%)"
              : "oklch(1 0 0 / 10%)",
          boxShadow:
            phase === "thinking"
              ? "0 0 36px -8px oklch(0.75 0.14 200 / 45%)"
              : "0 0 0px 0px transparent",
          opacity: cardsVisible ? 0.72 : 1,
          scale: cardsVisible ? 0.985 : 1,
        }}
        transition={{ duration: 0.45 }}
        style={{ background: "rgba(19,20,28,0.75)" }}
      >
        <div className="flex items-start gap-3">
          <motion.span
            className="mt-0.5 shrink-0 text-primary"
            animate={
              phase === "thinking"
                ? { rotate: 360, scale: [1, 1.25, 1] }
                : { rotate: 0, scale: 1 }
            }
            transition={
              phase === "thinking"
                ? { rotate: { duration: 1.4, repeat: Infinity, ease: "linear" }, scale: { duration: 0.7, repeat: Infinity } }
                : { duration: 0.3 }
            }
          >
            ✦
          </motion.span>
          <p className="min-h-[2.6em] text-sm leading-relaxed text-foreground/90 sm:text-[15px]">
            {typed}
            {phase === "typing" && (
              <motion.span
                className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] bg-accent"
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.85, repeat: Infinity }}
              />
            )}
            {cardsVisible && (
              <span className="ml-2 text-xs text-accent">✓</span>
            )}
          </p>
        </div>
        <AnimatePresence>
          {phase === "thinking" && (
            <motion.div
              className="mt-2 flex items-center gap-2 pl-7 text-xs text-accent/90"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <motion.span
                className="h-1.5 w-1.5 rounded-full bg-accent"
                animate={{ scale: [1, 1.6, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 0.9, repeat: Infinity }}
              />
              <AnimatePresence mode="wait">
                <motion.span
                  key={statusIdx}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                >
                  {scenario.statusLines[statusIdx]}
                </motion.span>
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* palco dos posts */}
      <div className="relative min-h-[340px] flex-1 sm:min-h-[400px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${scenario.id}-${runId}`}
            className="absolute inset-0 flex items-center justify-center"
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18 }}
          >
            {scenario.posts.map((post, idx) => {
              const pos = positions[idx];
              const isCenter = idx === 1;
              return (
                <motion.div
                  key={post.id}
                  className="absolute w-[52vw] max-w-[215px] sm:max-w-[235px] lg:max-w-[250px]"
                  style={{ zIndex: pos.z }}
                  initial={{ opacity: 0, y: 64, scale: 0.9, x: "0%", rotate: 0 }}
                  animate={
                    cardsVisible
                      ? {
                          opacity: 1,
                          y: pos.y,
                          x: pos.x,
                          rotate: pos.rotate,
                          scale: pos.scale,
                        }
                      : { opacity: 0, y: 64, scale: 0.9, x: "0%", rotate: 0 }
                  }
                  transition={{
                    type: "spring",
                    stiffness: 210,
                    damping: 26,
                    delay: cardsVisible ? pos.delay : 0,
                  }}
                >
                  {/* flutuação idle — camada separada para não brigar com o spring */}
                  <motion.div
                    className="relative"
                    animate={reduced ? undefined : { y: [0, -5, 0] }}
                    transition={{
                      duration: 4.4 + idx * 0.9,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: 1.4 + idx * 0.5,
                    }}
                    style={{
                      filter: isCenter
                        ? "drop-shadow(0 24px 48px rgba(0,0,0,0.55))"
                        : "drop-shadow(0 16px 32px rgba(0,0,0,0.45))",
                    }}
                  >
                    <MiniPost post={post} editing={isCenter && phase === "editing"} />
                    <AnimatePresence>
                      {isCenter && phase === "editing" && (
                        <EditHandles accent={centerAccent} />
                      )}
                    </AnimatePresence>
                  </motion.div>
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function HeroDemo() {
  const [scenarioId, setScenarioId] = useState(demoScenarios[0].id);
  const [runId, setRunId] = useState(0);
  const scenario =
    demoScenarios.find((s) => s.id === scenarioId) ?? demoScenarios[0];

  // glow que segue o ponteiro no palco (desktop)
  const mx = useMotionValue(-400);
  const my = useMotionValue(-400);
  const glow = useMotionTemplate`radial-gradient(420px circle at ${mx}px ${my}px, oklch(0.7 0.22 40 / 6%), transparent 70%)`;

  return (
    <section className="relative mx-auto flex min-h-[100svh] w-full max-w-7xl flex-col justify-center px-5 pb-16 pt-24 sm:px-8 lg:flex-row lg:items-center lg:gap-12 lg:pt-20">
      {/* coluna de mensagem */}
      <motion.div
        className="relative z-10 flex flex-col items-center text-center lg:w-[44%] lg:items-start lg:text-left"
        initial="hidden"
        animate="shown"
        variants={{ shown: { transition: { staggerChildren: 0.08 } } }}
      >
        {[
          <div
            key="kicker"
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-[11px] uppercase tracking-[0.28em] text-muted-foreground"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Demonstração ao vivo
          </div>,
          <h1
            key="h1"
            className="font-display text-[2.35rem] font-bold leading-[1.06] tracking-tight text-foreground sm:text-5xl lg:text-[3.4rem]"
          >
            Sua ideia entra crua.
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(100deg, oklch(0.72 0.22 40), oklch(0.75 0.14 200))",
              }}
            >
              Sai um post profissional.
            </span>
          </h1>,
          <p
            key="sub"
            className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground sm:text-base"
          >
            Escreva como você fala. O PostSpark transforma em 3 versões de post
            ou carrossel — design, copy e legenda — prontas para editar e
            publicar.
          </p>,
          <CtaButton key="cta" source="hero" className="mt-8" />,
        ].map((node, i) => (
          <motion.div
            key={i}
            variants={{
              hidden: { opacity: 0, y: 16 },
              shown: {
                opacity: 1,
                y: 0,
                transition: { type: "spring", stiffness: 260, damping: 30 },
              },
            }}
          >
            {node}
          </motion.div>
        ))}
      </motion.div>

      {/* palco */}
      <motion.div
        className="relative z-10 mt-10 flex-1 lg:mt-0"
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, type: "spring", stiffness: 200, damping: 28 }}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          mx.set(e.clientX - rect.left);
          my.set(e.clientY - rect.top);
        }}
        onPointerLeave={() => {
          mx.set(-400);
          my.set(-400);
        }}
      >
        <div
          className="relative overflow-hidden rounded-3xl border border-white/[0.07] p-4 sm:p-6"
          style={{
            background:
              "linear-gradient(160deg, rgba(19,20,28,0.6), rgba(10,11,15,0.85))",
          }}
        >
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: glow }}
          />
          <DemoStage scenario={scenario} runId={runId} />

          {/* chips de cenário + replay */}
          <div className="relative mt-4 flex flex-wrap items-center justify-center gap-2">
            {demoScenarios.map((s) => {
              const active = s.id === scenario.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    if (s.id === scenario.id) return;
                    setScenarioId(s.id);
                    analytics.trackEvent("landing3_demo_prompt", { id: s.id });
                  }}
                  className={`rounded-full border px-4 py-1.5 text-xs transition-colors duration-200 ${
                    active
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:text-foreground"
                  }`}
                >
                  {s.chip}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setRunId((r) => r + 1);
                analytics.trackEvent("landing3_demo_replay", { id: scenario.id });
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
              aria-label="Repetir demonstração"
            >
              <RotateCcw size={12} />
              ver de novo
            </button>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
