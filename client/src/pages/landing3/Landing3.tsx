/**
 * Landing3 — landing "Demo Viva" (rota /landing3).
 *
 * Blueprint: docs/LANDING_BLUEPRINT.md
 * Ritmo: impacto → prova → mecânica → vitrine → identificação → fechamento.
 * Ambiente vivo compartilhado com o produto: OrganicBackground + SparkParticles.
 */

import { useEffect } from "react";
import { Link } from "wouter";
import OrganicBackground from "@/components/OrganicBackground";
import SparkLogo from "@/components/SparkLogo";
import SparkParticles from "@/components/SparkParticles";
import { useIsMobile } from "@/hooks/useMobile";
import { analytics } from "@/lib/analytics";
import { Personas, FinalCta, Footer } from "./ClosingSections";
import HeroDemo from "./HeroDemo";
import HowItWorks from "./HowItWorks";
import ProofSection from "./ProofSection";
import ShowcaseMarquee from "./ShowcaseMarquee";

export default function Landing3() {
  const isMobile = useIsMobile();

  useEffect(() => {
    analytics.trackPageView("/landing3", document.referrer || undefined);
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      {/* camadas de ambiente — a página respira */}
      {/* modo reduzido sempre: tráfego Meta Ads = mobile mediano; o palco da demo
          é quem merece o orçamento de GPU, não o fundo */}
      <OrganicBackground
        accentColor="#5b3fae"
        intensity={0.3}
        performanceMode="reduced"
        className="fixed! inset-0"
      />
      <SparkParticles
        count={isMobile ? 10 : 18}
        variant="subtle"
        performanceMode="reduced"
      />

      {/* topbar mínima */}
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <SparkLogo size={32} />
          <span className="font-display text-lg font-semibold tracking-tight">
            PostSpark
          </span>
        </div>
        <Link
          href="/"
          className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
        >
          Entrar
        </Link>
      </header>

      <main className="relative z-10">
        <HeroDemo />
        <ProofSection />
        <HowItWorks />
        <ShowcaseMarquee />
        <Personas />
        <FinalCta />
      </main>
      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
}
