import { useRef } from 'react';
import { motion } from 'framer-motion';
import SparkParticles from '@/components/SparkParticles';
import { handleGoogleOAuthOnly } from '@/components/auth';
import { analytics } from '@/lib/analytics';

const SPRING_ENTRY = { stiffness: 260, damping: 30 };

export default function FinalCta() {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleCta = () => {
    analytics.trackEvent('cta_click_final');
    handleGoogleOAuthOnly().catch(console.error);
  };

  return (
    <section
      ref={containerRef}
      className="relative overflow-hidden border-t border-white/5 py-20 md:py-28"
    >
      <div className="absolute inset-0 opacity-25">
        <SparkParticles />
      </div>

      <div className="container relative z-10 mx-auto px-4 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-10%' }}
          transition={SPRING_ENTRY}
          className="mx-auto max-w-2xl text-center"
        >
          <span className="font-display text-xs font-semibold uppercase tracking-[0.22em] text-thermal-orange">
            Comece com uma ideia simples
          </span>
          <h2 className="mt-4 font-display text-3xl font-bold text-white md:text-4xl lg:text-5xl">
            Seu próximo post já pode sair com cara de campanha.
          </h2>

          <p className="mx-auto mt-5 max-w-lg font-sans text-base text-[--text-secondary] md:text-lg">
            Grátis para começar. Sem cartão. Login com Google em 1 clique.
          </p>

          <button
            onClick={handleCta}
            className="group relative mt-8 w-full rounded-xl bg-thermal-orange px-8 py-4 font-display text-base font-semibold text-white shadow-lg transition-all hover:scale-[1.02] hover:bg-[oklch(0.72_0.22_40)] hover:shadow-[oklch(0.7_0.22_40/25%)] active:scale-[0.97] md:w-auto"
          >
            <span className="relative z-10">Criar meu primeiro post grátis</span>
            <span className="block pt-1 font-sans text-xs font-normal text-white/80">
              Google · sem cartão · em 30 segundos
            </span>
          </button>

          <div className="mx-auto mt-9 max-w-md border-t border-white/[0.06] pt-6">
            <p className="font-sans text-sm text-[--text-secondary]">
              Planos a partir de R$ 97/mês ·{' '}
              <a href="/pricing" className="text-thermal-orange hover:underline">
                ver planos
              </a>
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
