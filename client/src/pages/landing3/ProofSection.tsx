/**
 * ProofSection — "Isto entrou. Isto saiu."
 * Três pares antes/depois: a nota crua de celular vira o post final,
 * ligados por um feixe de luz que se desenha no scroll.
 */

import { motion } from "framer-motion";
import MiniPost from "./MiniPost";
import { demoScenarios } from "./demoScenarios";

const NOTE_TIMES = ["23:47", "12:08", "08:31"];

const cases = demoScenarios.map((s, i) => ({
  id: s.id,
  prompt: s.prompt,
  time: NOTE_TIMES[i % NOTE_TIMES.length],
  post: s.posts[0],
}));

function Beam() {
  return (
    <div className="relative hidden h-px w-20 shrink-0 self-center lg:block xl:w-28">
      <motion.div
        className="absolute inset-y-0 left-0 w-full origin-left rounded-full"
        style={{
          background:
            "linear-gradient(90deg, oklch(0.7 0.22 40 / 80%), oklch(0.75 0.14 200 / 80%))",
          height: 2,
          boxShadow: "0 0 12px oklch(0.7 0.22 40 / 50%)",
        }}
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, margin: "-15%" }}
        transition={{ duration: 0.7, ease: "easeOut", delay: 0.3 }}
      />
      <span className="absolute -right-1.5 top-1/2 -translate-y-1/2 text-accent">
        ›
      </span>
    </div>
  );
}

export default function ProofSection() {
  return (
    <section className="relative mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
      <motion.div
        className="mb-14 text-center sm:mb-20"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 0.5 }}
      >
        <div className="text-[11px] uppercase tracking-[0.34em] text-primary">
          Isto entrou → Isto saiu
        </div>
        <h2 className="mx-auto mt-4 max-w-xl font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl">
          A transformação não é promessa. É mecânica.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-[15px] text-muted-foreground">
          Cada post abaixo nasceu de uma nota escrita às pressas — como as suas.
        </p>
      </motion.div>

      <div className="flex flex-col gap-16 sm:gap-20">
        {cases.map((c, idx) => (
          <div
            key={c.id}
            className="flex flex-col items-center gap-6 lg:flex-row lg:justify-center lg:gap-0"
          >
            {/* a nota crua */}
            <motion.div
              className="w-full max-w-sm shrink-0 lg:w-[360px]"
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-15%" }}
              transition={{ duration: 0.5 }}
            >
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-5">
                <div className="mb-3 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-white/35">
                  <span>anotação</span>
                  <span>{c.time}</span>
                </div>
                <p className="font-mono text-sm leading-relaxed text-white/60">
                  "{c.prompt}"
                </p>
              </div>
            </motion.div>

            <Beam />

            {/* seta vertical no mobile */}
            <motion.span
              className="text-xl text-accent lg:hidden"
              initial={{ opacity: 0, y: -8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.25 }}
            >
              ↓
            </motion.span>

            {/* o post final */}
            <motion.div
              className="w-[62vw] max-w-[250px] shrink-0"
              initial={{ opacity: 0, y: 32, scale: 0.94 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: "-15%" }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 26,
                delay: 0.35,
              }}
              style={{
                rotate: idx % 2 === 0 ? 2 : -2,
                filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.5))",
              }}
            >
              <MiniPost post={c.post} />
            </motion.div>
          </div>
        ))}
      </div>
    </section>
  );
}
