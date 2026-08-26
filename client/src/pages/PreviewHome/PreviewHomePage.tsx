import { useAuth } from "@/_core/hooks/useAuth";
import SparkParticles from "@/components/SparkParticles";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import PreviewNav from "./components/PreviewNav";
import LiveHeroDemo from "./components/LiveHeroDemo";
import BrandDnaSection from "./components/BrandDnaSection";
import FormatsAndCarousel from "./components/FormatsAndCarousel";
import WorkbenchShowcase from "./components/WorkbenchShowcase";
import FinalCtaSection from "./components/FinalCtaSection";
import PreviewAuthModal from "./components/PreviewAuthModal";

export default function PreviewHomePage() {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();

  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    if (!loading && isAuthenticated) {
      setLocation("/thevoid");
    }
  }, [isAuthenticated, loading, setLocation]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const openAuth = useCallback(() => setIsAuthOpen(true), []);
  const closeAuth = useCallback(() => setIsAuthOpen(false), []);

  return (
    <div className="relative min-h-screen w-full bg-[#050608] text-white selection:bg-[#00f5ff] selection:text-black overflow-x-hidden">
      {/* Background Particles & Glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <SparkParticles count={isMobile ? 14 : 32} performanceMode={isMobile ? "reduced" : "full"} variant="default" />
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-[#00f5ff]/6 blur-[150px] rounded-full" />
        <div className="absolute top-1/2 -right-40 w-[600px] h-[600px] bg-[oklch(0.7_0.22_40)]/6 blur-[160px] rounded-full" />
      </div>

      {/* Conteúdo da Landing */}
      <div className="relative z-10 flex flex-col min-h-screen justify-between">
        {/* Navbar */}
        <PreviewNav onOpenAuth={openAuth} />

        {/* 1. Hero com Demo Interativo */}
        <LiveHeroDemo onOpenAuth={openAuth} />

        {/* 2. Brand DNA */}
        <BrandDnaSection onOpenAuth={openAuth} />

        {/* 3. Formatos & Carrosséis */}
        <FormatsAndCarousel onOpenAuth={openAuth} />

        {/* 4. Estúdio Workbench */}
        <WorkbenchShowcase onOpenAuth={openAuth} />

        {/* 5. CTA Final */}
        <FinalCtaSection onOpenAuth={openAuth} />

        {/* Footer Simples */}
        <footer className="py-8 px-6 text-center text-xs text-white/40 border-t border-white/6">
          <p>© {new Date().getFullYear()} PostSpark. Todos os direitos reservados.</p>
        </footer>
      </div>

      {/* Modal de Autenticação */}
      <PreviewAuthModal isOpen={isAuthOpen} isMobile={isMobile} onClose={closeAuth} />
    </div>
  );
}
