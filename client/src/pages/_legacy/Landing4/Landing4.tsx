/**
 * Landing4 — fusão Landing2 + Landing3 (rota /crie-posts-incriveis).
 *
 * Sequência:
 * 1. Hero Section ← Landing3
 * 2. ProofSection ← Landing2 (mostrando posts)
 * 3. HowItWorks ← Landing3
 * 4. ShowcaseMarquee ← Landing2 ("Várias saídas...")
 * 5. Personas ← Landing3 (feito para quem não tem uma)
 * 6. FinalCta ← Landing3
 * 7. Footer ← Landing3
 */

import { useEffect } from "react";
import OrganicBackground from "@/components/OrganicBackground";
import SparkLogo from "@/components/SparkLogo";
import SparkParticles from "@/components/SparkParticles";
import { useIsMobile } from "@/hooks/useMobile";
import { analytics } from "@/lib/analytics";

// Componentes da Landing3
import HeroDemo from "../landing3/HeroDemo";
import HowItWorks from "../landing3/HowItWorks";
import { Personas, FinalCta, Footer } from "../landing3/ClosingSections";

// Componentes da Landing2
import ProofSection from "../Landing2/ProofSection";
import ShowcaseMarquee from "../Landing2/ShowcaseMarquee";

export default function Landing4() {
  const isMobile = useIsMobile();

  useEffect(() => {
    analytics.trackPageView("/crie-posts-incriveis", document.referrer || undefined);
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
        <a
          href="https://www.postspark.com.br"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
        >
          Entrar
        </a>
      </header>

      <main className="relative z-10">
        {/* 1. Hero Section ← Landing3 */}
        <HeroDemo />

        {/* 2. ProofSection ← Landing2 (mostrando posts) */}
        <ProofSection />

        {/* 3. HowItWorks ← Landing3 */}
        <HowItWorks />

        {/* 4. ShowcaseMarquee ← Landing2 ("Várias saídas...") */}
        <ShowcaseMarquee />

        {/* 5. Personas ← Landing3 (feito para quem não tem uma) */}
        <Personas />

        {/* 6. FinalCta ← Landing3 */}
        <FinalCta />
      </main>

      {/* 7. Footer ← Landing3 */}
      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
}
