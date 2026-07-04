import { lazy, Suspense, useEffect } from 'react';
import { useAuth } from '../../_core/hooks/useAuth';
import SparkLogo from '../../components/SparkLogo';
import { analytics } from '../../lib/analytics';
import HeroDemo from './HeroDemo';

// Lazy load das seções abaixo da dobra
const ProofSection = lazy(() => import('./ProofSection'));
const HowItWorks = lazy(() => import('./HowItWorks'));
const ShowcaseMarquee = lazy(() => import('./ShowcaseMarquee'));
const Personas = lazy(() => import('./Personas'));
const FinalCta = lazy(() => import('./FinalCta'));

export default function LandingPage() {
  const { loading } = useAuth();

  // A landing page é independente e sempre acessível, mesmo para usuários autenticados
  // Isso permite que campanhas de tráfeco funcionem para qualquer público

  // Toast de auth_error (se presente na URL)
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('auth_error')) {
      // Mostrar toast de erro (implementar com toast library existente)
      console.error('Authentication error');
    }
  }, []);

  // Analytics de view
  useEffect(() => {
    analytics.trackEvent('landing_view');
  }, []);

  if (loading) return null;

  return (
    <div className="min-h-dvh bg-[--background] text-white">
      {/* Hero - eager load */}
      <HeroDemo />

      {/* Seções abaixo da dobra - lazy load */}
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

      {/* Footer */}
      <footer className="py-12 border-t border-white/8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center justify-center w-8 h-8">
              <SparkLogo size={32} />
            </div>
            <div className="flex gap-6 text-sm text-[--text-secondary]">
              <a href="/pricing" className="hover:text-white transition-colors">Preços</a>
              <a href="/privacy" className="hover:text-white transition-colors">Privacidade</a>
              <a href="/terms" className="hover:text-white transition-colors">Termos</a>
              <a href="/cookies" className="hover:text-white transition-colors">Cookies</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
