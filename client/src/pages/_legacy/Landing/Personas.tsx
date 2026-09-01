/**
 * Personas.tsx - Seção 5: Para Quem É (3 personas)
 *
 * 3 cards glass com dor→resultado:
 * - Social media (gerencia 6 marcas)
 * - Freelancer (entrega design de agência)
 * - Empreendedor (sem tempo, precisa de post hoje)
 *
 * Nada de foto de persona sorrindo — usar ícone/lettering.
 */

import { motion } from "framer-motion";

const PERSONAS = [
  {
    id: "social-media",
    icon: "◉",
    title: "Social Media",
    pain: "Você cuida de 6 marcas. O PostSpark cuida do seu prazo.",
    result: "Entregue premium para múltiplos clientes sem burnout. Template de qualidade vira rotina.",
    color: "oklch(0.75_0.14_200)",
  },
  {
    id: "freelancer",
    icon: "◈",
    title: "Freelancer",
    pain: "Entregue design de agência sem pagar uma agência.",
    result: "Seu portfólio parece sempre high-end. Aumentou valor e reduziu tempo de entrega.",
    color: "oklch(0.7_0.22_40)",
  },
  {
    id: "entrepreneur",
    icon: "◎",
    title: "Empreendedor",
    pain: "Seu negócio precisa de post hoje — não de curso de Canva.",
    result: "Conteúdo pronto em minutos. Você foca no negócio, o PostSpark no design.",
    color: "oklch(0.7_0.15_280)",
  },
];

const SPRING_ENTRY = { stiffness: 260, damping: 30 };

export default function Personas() {
  return (
    <section className="relative py-24 md:py-32 border-t border-white/5">
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
            Para quem é
          </h2>
          <p className="font-['Inter'] text-lg text-[--text-secondary] max-w-2xl mx-auto">
            Você não precisa ser designer. Precisa de design.
          </p>
        </motion.div>

        {/* 3 Cards */}
        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          {PERSONAS.map((persona, index) => (
            <PersonaCard key={persona.id} persona={persona} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

// Subcomponente: PersonaCard
function PersonaCard({ persona, index }: { persona: typeof PERSONAS[0]; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ delay: index * 0.1, ...SPRING_ENTRY }}
      className="group relative"
    >
      <div className="relative h-full p-8 bg-[--surface-void] border border-[--glass-border] rounded-2xl hover:border-white/12 transition-all hover:shadow-2xl hover:shadow-black/40">
        {/* Glow decorativo */}
        <div
          className="absolute -top-20 -right-20 w-40 h-40 rounded-full opacity-0 group-hover:opacity-20 blur-3xl transition-opacity"
          style={{ backgroundColor: persona.color }}
        />

        {/* Ícone */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: index * 0.1 + 0.15 }}
          className="relative mb-6"
        >
          <div className="w-16 h-16 rounded-xl bg-[--surface-base] border border-white/10 flex items-center justify-center">
            <span
              className="font-['Space_Grotesk'] text-3xl"
              style={{ color: persona.color }}
            >
              {persona.icon}
            </span>
          </div>
        </motion.div>

        {/* Título */}
        <h3 className="font-['Space_Grotesk'] text-xl font-bold text-white mb-4">
          {persona.title}
        </h3>

        {/* Dor */}
        <div className="space-y-1 mb-6">
          <div className="flex items-start gap-2">
            <span className="text-red-400 mt-0.5">→</span>
            <p className="font-['Inter'] text-sm text-white/80 leading-relaxed">
              {persona.pain}
            </p>
          </div>
        </div>

        {/* Resultado */}
        <div className="pt-4 border-t border-white/5">
          <div className="flex items-start gap-2">
            <span className="text-green-400 mt-0.5">✓</span>
            <p className="font-['Inter'] text-sm text-white/90 leading-relaxed">
              {persona.result}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
