/**
 * HowItWorks.tsx - Seção 3: Como Funciona (3 atos)
 *
 * Três atos com storytelling:
 * 1. A Ideia (campo do Void — escreva como fala)
 * 2. As Três Versões (HoloDeck — IA propõe 3 direções)
 * 3. O Controle (Workbench — tudo editável)
 *
 * Scroll leve com parallax 20-40px — sem pinning.
 */

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

const HOW_IT_WORKS_ACTS = [
  {
    number: "1",
    title: "A Ideia",
    description: "Você escreve como fala. O PostSpark devolve como designer.",
    detail: "Cole um link, solte uma nota ou apenas digite. Sem formatar, sem 'ser criativo'. A IA entende o contexto.",
    icon: "✎",
  },
  {
    number: "2",
    title: "As Três Versões",
    description: "A IA propõe 3 caminhos criativos distintos.",
    detail: "Copy, design e legenda prontos. Cada versão tem um ângulo diferente: dor, benefício, autoridade. Você escolhe.",
    icon: "◇",
  },
  {
    number: "3",
    title: "O Controle",
    description: "Tudo editável: texto, cor, fonte, layout, carrossel.",
    detail: "Workbench é editor visual completo. Ajuste cada pixel, troque cores, reescreva. Exporte PNG ou agende no Haul.",
    icon: "⚙",
  },
];

const SPRING_ENTRY = { stiffness: 260, damping: 30 };

export default function HowItWorks() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  // Parallax leve (20-40px)
  const y1 = useTransform(scrollYProgress, [0, 1], [0, -30]);
  const y2 = useTransform(scrollYProgress, [0, 1], [0, -15]);
  const y3 = useTransform(scrollYProgress, [0, 1], [0, -40]);

  return (
    <section
      ref={containerRef}
      className="relative py-24 md:py-32 border-t border-white/5 overflow-hidden"
    >
      <div className="container mx-auto px-4 md:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={SPRING_ENTRY}
          className="text-center mb-16 md:mb-24"
        >
          <h2 className="font-['Space_Grotesk'] text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4">
            Como funciona
          </h2>
          <p className="font-['Inter'] text-lg text-[--text-secondary] max-w-2xl mx-auto">
            Três passos. Zero curva de aprendizado.
          </p>
        </motion.div>

        {/* 3 Atos com parallax */}
        <div className="relative space-y-24 md:space-y-32">
          {HOW_IT_WORKS_ACTS.map((act, index) => {
            const yTransform = [y1, y2, y3][index] || y1;

            return (
              <motion.div
                key={act.number}
                style={{ y: yTransform }}
                initial={{ opacity: 0, y: 48 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10%" }}
                transition={{ delay: index * 0.15, ...SPRING_ENTRY }}
                className="relative"
              >
                <ActCard act={act} index={index} />
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// Subcomponente: ActCard
function ActCard({ act, index }: { act: typeof HOW_IT_WORKS_ACTS[0]; index: number }) {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="grid md:grid-cols-12 gap-8 items-center">
        {/* Número e ícone */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: index * 0.15 + 0.1 }}
          className="md:col-span-3"
        >
          <div className="relative w-20 h-20 mx-auto">
            <div className="absolute inset-0 bg-[oklch(0.7_0.22_40)] rounded-full opacity-20 blur-xl" />
            <div className="relative w-full h-full bg-[--surface-base] border border-white/10 rounded-full flex items-center justify-center">
              <span className="font-['Space_Grotesk'] text-2xl text-[oklch(0.7_0.22_40)] font-bold">
                {act.icon}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Conteúdo */}
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: index * 0.15 + 0.2 }}
          className="md:col-span-9"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="font-['Space_Grotesk'] text-sm text-[oklch(0.7_0.22_40)] font-bold">
                {act.number}
              </span>
              <h3 className="font-['Space_Grotesk'] text-2xl md:text-3xl font-bold text-white">
                {act.title}
              </h3>
            </div>
            <p className="font-['Inter'] text-lg text-white font-medium">
              {act.description}
            </p>
            <p className="font-['Inter'] text-base text-[--text-secondary] leading-relaxed">
              {act.detail}
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
