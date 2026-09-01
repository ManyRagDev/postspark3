import { motion } from 'framer-motion';

const PERSONAS = [
  {
    id: 'small-business',
    letter: 'NB',
    title: 'Negócio local',
    problem: 'Precisa divulgar oferta, horário, agenda e novidade sem depender de designer para cada post.',
    result: 'Sai com uma peça clara, bonita e pronta para colocar no Instagram ou mandar no WhatsApp.',
    color: 'oklch(0.75 0.14 200)',
  },
  {
    id: 'service-provider',
    letter: 'SV',
    title: 'Prestador de serviço',
    problem: 'Quer parecer confiável antes do primeiro contato, mesmo quando o assunto é simples ou urgente.',
    result: 'Transforma serviço comum em comunicação profissional, com CTA e promessa bem definidos.',
    color: 'oklch(0.7 0.22 40)',
  },
  {
    id: 'social-media',
    letter: 'SM',
    title: 'Social media e freelancer',
    problem: 'Tem volume, prazo e cliente pedindo variação sem tempo para começar tudo do zero.',
    result: 'Gera três caminhos para apresentar, escolher, editar e publicar com menos retrabalho.',
    color: 'oklch(0.65 0.2 350)',
  },
];

const SPRING_ENTRY = { stiffness: 260, damping: 30 };

export default function Personas() {
  return (
    <section className="relative border-t border-white/5 py-16 md:py-24">
      <div className="container mx-auto px-4 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-10%' }}
          transition={SPRING_ENTRY}
          className="mx-auto mb-10 max-w-2xl text-center md:mb-14"
        >
          <h2 className="font-display text-3xl font-bold text-white md:text-4xl lg:text-5xl">
            Para quem precisa postar sem travar
          </h2>
          <p className="mx-auto mt-4 max-w-xl font-sans text-base text-[--text-secondary] md:text-lg">
            Não é só para marca premium. É para quem precisa comunicar melhor, com mais velocidade e menos improviso.
          </p>
        </motion.div>

        <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3">
          {PERSONAS.map((persona, index) => (
            <PersonaCard key={persona.id} persona={persona} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PersonaCard({ persona, index }: { persona: typeof PERSONAS[number]; index: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-8%' }}
      transition={{ delay: index * 0.08, ...SPRING_ENTRY }}
      className="group relative h-full overflow-hidden rounded-lg border border-[--glass-border] bg-[--surface-void] p-6 transition-all duration-300 hover:border-white/[0.14] hover:shadow-xl hover:shadow-black/30"
    >
      <div
        className="absolute -right-14 -top-14 h-28 w-28 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-[0.14]"
        style={{ backgroundColor: persona.color }}
      />

      <div className="relative mb-5 flex h-12 w-12 items-center justify-center rounded-lg border border-white/8 bg-[--surface-base]">
        <span className="font-display text-lg font-bold" style={{ color: persona.color }}>
          {persona.letter}
        </span>
      </div>

      <h3 className="relative font-display text-xl font-bold text-white">{persona.title}</h3>

      <div className="relative mt-5 space-y-4">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex-shrink-0 text-sm" style={{ color: persona.color }}>→</span>
          <p className="font-sans text-sm leading-relaxed text-white/85">{persona.problem}</p>
        </div>

        <div className="border-t border-white/[0.06] pt-4">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex-shrink-0 text-sm text-emerald-400">✓</span>
            <p className="font-sans text-sm leading-relaxed text-[--text-secondary]">{persona.result}</p>
          </div>
        </div>
      </div>
    </motion.article>
  );
}
