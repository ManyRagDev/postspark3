/**
 * HowItWorks — os três atos do produto (Void → HoloDeck → Workbench)
 * contados como processo, com mini-encenações em CSS puro.
 */

import { motion } from "framer-motion";

function ActInput() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex w-4/5 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
        <span className="text-xs text-primary">✦</span>
        <span className="text-[11px] text-white/55">promoção de inauguração…</span>
        <motion.span
          className="ml-auto inline-block h-3 w-[2px] bg-accent"
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.9, repeat: Infinity }}
        />
      </div>
    </div>
  );
}

function ActVersions() {
  const tones = ["#B78D4A", "#00E5FF", "#FF8A3D"];
  return (
    <div className="relative flex h-full items-center justify-center">
      {tones.map((tone, i) => (
        <motion.div
          key={tone}
          className="absolute h-16 w-12 rounded-lg border border-white/10"
          style={{
            background: `linear-gradient(160deg, ${tone}26, rgba(10,11,15,0.9))`,
            zIndex: i === 1 ? 2 : 1,
          }}
          initial={false}
          whileInView={{
            x: (i - 1) * 34,
            rotate: (i - 1) * 8,
            y: i === 1 ? -4 : 4,
          }}
          viewport={{ once: true, margin: "-20%" }}
          transition={{ type: "spring", stiffness: 220, damping: 22, delay: 0.15 * i }}
        >
          <div className="mx-2 mt-2 h-1 rounded-full" style={{ background: tone }} />
          <div className="mx-2 mt-1.5 h-0.5 w-2/3 rounded-full bg-white/25" />
          <div className="mx-2 mt-1 h-0.5 w-1/2 rounded-full bg-white/15" />
        </motion.div>
      ))}
    </div>
  );
}

function ActControl() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      {[70, 45].map((w, i) => (
        <div key={i} className="flex w-3/5 items-center gap-2">
          <div className="relative h-1 flex-1 rounded-full bg-white/10">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-accent/70"
              initial={{ width: "20%" }}
              whileInView={{ width: `${w}%` }}
              viewport={{ once: true, margin: "-20%" }}
              transition={{ duration: 0.8, delay: 0.2 + i * 0.15, ease: "easeOut" }}
            />
            <motion.div
              className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-accent bg-background"
              initial={{ left: "20%" }}
              whileInView={{ left: `${w}%` }}
              viewport={{ once: true, margin: "-20%" }}
              transition={{ duration: 0.8, delay: 0.2 + i * 0.15, ease: "easeOut" }}
              style={{ marginLeft: -6 }}
            />
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        {["oklch(0.7 0.22 40)", "oklch(0.75 0.14 200)", "oklch(0.65 0.2 350)", "#C9A96A"].map(
          (c, i) => (
            <motion.span
              key={c}
              className="h-4 w-4 rounded-full"
              style={{ background: c, outline: i === 0 ? `2px solid ${c}` : "none", outlineOffset: 2 }}
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true, margin: "-20%" }}
              transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.5 + i * 0.07 }}
            />
          ),
        )}
      </div>
    </div>
  );
}

const acts = [
  {
    n: "01",
    title: "A Ideia",
    text: "Você escreve como fala. Uma frase basta — sem briefing, sem template.",
    Visual: ActInput,
  },
  {
    n: "02",
    title: "As Três Versões",
    text: "A IA propõe três direções de copy e design. Você escolhe a que parece sua.",
    Visual: ActVersions,
  },
  {
    n: "03",
    title: "O Controle",
    text: "Texto, cor, fonte, layout, carrossel. Tudo editável antes de publicar.",
    Visual: ActControl,
  },
];

export default function HowItWorks() {
  return (
    <section className="relative mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
      <motion.div
        className="mb-14 text-center"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 0.5 }}
      >
        <div className="text-[11px] uppercase tracking-[0.34em] text-accent">
          Como funciona
        </div>
        <h2 className="mx-auto mt-4 max-w-xl font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl">
          Três atos. Nenhum deles é "saber design".
        </h2>
        <p className="mx-auto mt-4 max-w-md text-[15px] text-muted-foreground">
          Você escreve como fala. A gente devolve como designer.
        </p>
      </motion.div>

      <div className="grid gap-5 sm:grid-cols-3">
        {acts.map((act, i) => (
          <motion.div
            key={act.n}
            className="group relative overflow-hidden rounded-3xl border border-white/[0.07] p-6"
            style={{ background: "rgba(19,20,28,0.55)" }}
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.5, delay: i * 0.12 }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -right-3 -top-6 select-none font-display text-[7rem] font-bold leading-none"
              style={{
                WebkitTextStroke: "1px oklch(1 0 0 / 7%)",
                color: "transparent",
              }}
            >
              {act.n}
            </span>
            <div className="relative h-28">
              <act.Visual />
            </div>
            <h3 className="relative mt-4 font-display text-lg font-semibold text-foreground">
              <span className="mr-2 text-primary">{act.n}.</span>
              {act.title}
            </h3>
            <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">
              {act.text}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
