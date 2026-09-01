/**
 * FinalCta.tsx - Seção 6: Começa Grátis (CTA final)
 *
 * Fundo com SparkParticles sutil.
 * Reafirma: grátis, sem cartão, Google 1-clique.
 * CTA idêntico ao do hero.
 * Abaixo, linha discreta: planos a partir de X — veja /pricing.
 */

import { useRef } from "react";
import { motion } from "framer-motion";
import SparkParticles from "@/components/SparkParticles";
import { handleGoogleOAuthOnly } from "@/components/auth";
import { analytics } from "@/lib/analytics";

const SPRING_ENTRY = { stiffness: 260, damping: 30 };

export default function FinalCta() {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleCtaClick = () => {
    analytics.trackEvent("cta_click_final");
    handleGoogleOAuthOnly().catch(console.error);
  };

  return (
    <section
      ref={containerRef}
      className="relative py-24 md:py-32 border-t border-white/5 overflow-hidden"
    >
      {/* Partículas sutil */}
      <div className="absolute inset-0 opacity-30">
        <SparkParticles />
      </div>

      <div className="container mx-auto px-4 md:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={SPRING_ENTRY}
          className="max-w-3xl mx-auto text-center"
        >
          {/* Headline */}
          <h2 className="font-['Space_Grotesk'] text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6">
            Sua próxima ideia já pode sair assim.
          </h2>

          {/* Subheadline */}
          <p className="font-['Inter'] text-lg md:text-xl text-[--text-secondary] mb-8 max-w-2xl mx-auto">
            Grátis para começar. Sem cartão. Login com Google em 1 clique.
          </p>

          {/* CTA */}
          <button
            onClick={handleCtaClick}
            className="group relative w-full md:w-auto px-8 py-4 bg-[oklch(0.7_0.22_40)] hover:bg-[oklch(0.72_0.22_40)] text-white font-['Space_Grotesk'] font-semibold text-lg rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg hover:shadow-[oklch(0.7_0.22_40)/25%]"
          >
            <span className="relative z-10">Criar meu primeiro post grátis</span>
            <span className="block mt-1 text-xs font-['Inter'] font-normal text-white/80">
              Google · sem cartão · em 30 segundos
            </span>
          </button>

          {/* Pricing link */}
          <div className="mt-8 pt-8 border-t border-white/5">
            <p className="font-['Inter'] text-sm text-[--text-secondary]">
              Planos a partir de R$ 97/mês —{" "}
              <a href="/pricing" className="text-[oklch(0.7_0.22_40)] hover:underline">
                veja /pricing
              </a>
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
