import { motion } from 'framer-motion';

const ACTS = [
  {
    number: '1',
    title: 'Escreva a ideia',
    headline: 'Pode ser do jeito que você falaria para alguém da equipe.',
    detail: 'Promoção, vaga, serviço, agenda aberta, lançamento ou conteúdo da semana. O PostSpark entende objetivo, público e contexto.',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    ),
  },
  {
    number: '2',
    title: 'Escolha uma versão',
    headline: 'A IA devolve três caminhos prontos, não uma tela em branco.',
    detail: 'Cada opção combina copy, imagem, hierarquia visual e legenda. Você escolhe a direção mais forte para o momento.',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="6" height="16" rx="2" />
        <rect x="10" y="2" width="6" height="20" rx="2" />
        <rect x="17" y="7" width="4" height="13" rx="2" />
      </svg>
    ),
  },
  {
    number: '3',
    title: 'Edite e publique',
    headline: 'Ajuste texto, cor, fonte, layout e carrossel antes de exportar.',
    detail: 'O Workbench mantém o controle fino para você adaptar a peça à marca, ao cliente ou à campanha sem refazer tudo.',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18 2v6h6" />
        <path d="M18 2 9 11" />
      </svg>
    ),
  },
];

const SPRING_ENTRY = { stiffness: 260, damping: 30 };

export default function HowItWorks() {
  return (
    <section className="relative overflow-hidden border-t border-white/5 py-16 md:py-24">
      <div className="container mx-auto px-4 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-10%' }}
          transition={SPRING_ENTRY}
          className="mx-auto mb-10 max-w-2xl text-center md:mb-14"
        >
          <h2 className="font-display text-3xl font-bold text-white md:text-4xl lg:text-5xl">
            Como funciona
          </h2>
          <p className="mx-auto mt-4 max-w-xl font-sans text-base text-[--text-secondary] md:text-lg">
            Três passos curtos para sair da intenção e chegar em uma peça publicável.
          </p>
        </motion.div>

        <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-3">
          {ACTS.map((act, index) => (
            <motion.article
              key={act.number}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-10%' }}
              transition={{ delay: index * 0.08, ...SPRING_ENTRY }}
              className="relative overflow-hidden rounded-2xl border border-white/8 bg-[--surface-void] p-6 shadow-xl shadow-black/20"
            >
              <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-thermal-orange/10 blur-2xl" />
              <div className="relative mb-6 flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-[--surface-base] text-thermal-orange">
                  {act.icon}
                </div>
                <span className="font-display text-sm font-bold text-white/28">{act.number}</span>
              </div>
              <h3 className="relative font-display text-xl font-bold text-white">{act.title}</h3>
              <p className="relative mt-3 font-sans text-base font-medium leading-relaxed text-white/88">{act.headline}</p>
              <p className="relative mt-3 font-sans text-sm leading-relaxed text-[--text-secondary]">{act.detail}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
