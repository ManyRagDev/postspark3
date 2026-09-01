import { lazy, Suspense, useEffect } from 'react';
import SparkLogo from '@/components/SparkLogo';
import { analytics } from '@/lib/analytics';
import HeroDemo from './HeroDemo';

const ProofSection = lazy(() => import('./ProofSection'));
const HowItWorks = lazy(() => import('./HowItWorks'));
const ShowcaseMarquee = lazy(() => import('./ShowcaseMarquee'));
const Personas = lazy(() => import('./Personas'));
const FinalCta = lazy(() => import('./FinalCta'));

export default function LandingPage() {
  useEffect(() => {
    analytics.trackEvent('landing_view');
  }, []);

  return (
    <div className="min-h-dvh bg-[--background] text-white">
      <HeroDemo />

      <Suspense fallback={<div className="h-96" />}>
        <ProofSection />
      </Suspense>

      <Suspense fallback={<div className="h-96" />}>
        <HowItWorks />
      </Suspense>

      <Suspense fallback={<div className="h-96" />}>
        <ShowcaseMarquee />
      </Suspense>

      <Suspense fallback={<div className="h-96" />}>
        <Personas />
      </Suspense>

      <Suspense fallback={<div className="h-96" />}>
        <FinalCta />
      </Suspense>

      <footer className="border-t border-white/8 py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex h-8 w-8 items-center justify-center">
              <SparkLogo size={32} />
            </div>
            <div className="flex gap-6 text-sm text-[--text-secondary]">
              <a href="/pricing" className="transition-colors hover:text-white">Preços</a>
              <a href="/privacy" className="transition-colors hover:text-white">Privacidade</a>
              <a href="/terms" className="transition-colors hover:text-white">Termos</a>
              <a href="/cookies" className="transition-colors hover:text-white">Cookies</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
