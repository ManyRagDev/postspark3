import { useAuth } from "@/_core/hooks/useAuth";
import OrganicBackground from "@/components/OrganicBackground";
import SparkParticles from "@/components/SparkParticles";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import PreviewNav from "./components/PreviewNav";
import LiveHeroDemo from "./components/LiveHeroDemo";
import BrandDnaSection from "./components/BrandDnaSection";
import FormatsAndCarousel from "./components/FormatsAndCarousel";
import WorkbenchShowcase from "./components/WorkbenchShowcase";
import FinalCtaSection from "./components/FinalCtaSection";

export default function PreviewHomePage() {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );

  // Injeta matriz de fontes tipográficas de alta definição
  useEffect(() => {
    const linkId = "ps-preview-fonts";
    if (!document.getElementById(linkId)) {
      const link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Anton&family=Archivo+Black&family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Syne:wght@700;800;900&family=Cinzel:wght@600;700&family=Space+Grotesk:wght@600;700;800&display=swap";
      document.head.appendChild(link);
    }
  }, []);

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

  // Redireciona o visitante diretamente para a rota oficial / (captura de insumo e conversão)
  const handleNavigateHome = useCallback(() => {
    setLocation("/");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [setLocation]);

  return (
    <div
      className="relative min-h-screen w-full text-white selection:bg-[#FF5C00] selection:text-white overflow-x-hidden"
      style={{ backgroundColor: "oklch(0.04 0.06 280)" }}
    >
      {/* 1. Camada Cósmica Oficial: OrganicBackground Vivo + Partículas Magnéticas */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <OrganicBackground
          accentColor="#FF5C00"
          intensity={0.2}
          performanceMode={isMobile ? "reduced" : "full"}
        />
        <SparkParticles
          count={isMobile ? 12 : 24}
          performanceMode={isMobile ? "reduced" : "full"}
          variant="subtle"
        />
        {/* Glows ambientais volumétricos sutis */}
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[450px] bg-[#FF5C00]/[0.08] blur-[170px] rounded-full" />
        <div className="absolute top-[45%] -right-40 w-[600px] h-[600px] bg-[oklch(0.65_0.22_40)]/[0.06] blur-[180px] rounded-full" />
        <div className="absolute top-[75%] -left-40 w-[550px] h-[550px] bg-[#7c3aed]/[0.05] blur-[180px] rounded-full" />
      </div>

      {/* 2. Conteúdo Fluido da Landing (Sem divisórias mecânicas) */}
      <div className="relative z-10 flex flex-col min-h-screen justify-between">
        {/* Navbar Frosted Glass */}
        <PreviewNav onAction={handleNavigateHome} />

        {/* 1. Hero com Demo Interativo */}
        <LiveHeroDemo onAction={handleNavigateHome} />

        {/* 2. Brand DNA */}
        <BrandDnaSection onAction={handleNavigateHome} />

        {/* 3. Formatos & Carrosséis */}
        <FormatsAndCarousel onAction={handleNavigateHome} />

        {/* 4. Estúdio Workbench */}
        <WorkbenchShowcase onAction={handleNavigateHome} />

        {/* 5. CTA Final */}
        <FinalCtaSection onAction={handleNavigateHome} />

        {/* Footer Editorial Limpo */}
        <footer className="py-10 px-6 text-center text-xs text-white/40 border-t border-white/[0.05]">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white/80">Post<span className="text-[#FF5C00]">Spark</span></span>
              <span className="text-white/30">·</span>
              <span>Motor Criativo de Posts & Carrosséis</span>
            </div>
            <p className="text-white/35">© {new Date().getFullYear()} PostSpark. Todos os direitos reservados.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
