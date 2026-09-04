import { useCallback, useEffect, useRef, useState } from "react";
import SparkLogo from "@/components/SparkLogo";
import StudioAuthModal from "@/pages/StudioHome/components/StudioAuthModal";
import OrganicBackground from "@/components/OrganicBackground";
import SparkParticles from "@/components/SparkParticles";
import InspiracaoDesktopStage from "./components/InspiracaoDesktopStage";
import InspiracaoMobileStories from "./components/InspiracaoMobileStories";
import { SHOWCASE_SLIDES } from "./inspiracaoCardsData";
import "./inspiracaoShowcase.css";

export default function InspiracaoShowcasePage() {
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 900 : false
  );

  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [typedPrompt, setTypedPrompt] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const handleActiveCardChange = useCallback((index: number) => {
    setActiveCardIndex(index);
  }, []);

  const cloudsFarRef = useRef<HTMLDivElement | null>(null);
  const cloudsNearRef = useRef<HTMLDivElement | null>(null);

  // Injeta fontes de forma assíncrona e não-bloqueante
  useEffect(() => {
    const linkId = "ps-inspiracao-fonts";
    if (!document.getElementById(linkId)) {
      const link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Anton&family=Archivo+Black&family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Syne:wght@700;800;900&family=Cinzel:wght@600;700&family=Space+Grotesk:wght@600;700;800&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  // Efeito de digitação da máquina de escrever vinculado ao card ativo
  useEffect(() => {
    const fullText = SHOWCASE_SLIDES[activeCardIndex]?.prompt || "";
    setTypedPrompt("");
    setIsTyping(true);

    let charIndex = 0;
    const interval = setInterval(() => {
      charIndex++;
      setTypedPrompt(fullText.slice(0, charIndex));
      if (charIndex >= fullText.length) {
        clearInterval(interval);
        setIsTyping(false);
      }
    }, 22);

    return () => clearInterval(interval);
  }, [activeCardIndex]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 900);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="showcase-root">
      {/* 1. Fundo Oficial TheVoid: Vazio Cósmico com OrganicBackground & SparkParticles */}
      <OrganicBackground
        accentColor={SHOWCASE_SLIDES[activeCardIndex]?.card.palette.accent || "#7c3aed"}
        intensity={0.25}
        performanceMode={isMobile ? "reduced" : "full"}
      />
      <SparkParticles
        count={isMobile ? 12 : 22}
        performanceMode={isMobile ? "reduced" : "full"}
        variant="subtle"
      />
      <div className="showcase-vignette" />

      {/* 2. Top Bar Oficial PostSpark com Proporções Refinadas & Presença de Marca */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-5 md:px-12 w-full max-w-7xl mx-auto">
        <div
          className="flex items-center gap-3 cursor-pointer select-none group"
          onClick={() => (window.location.href = "/")}
        >
          <SparkLogo size={34} />
          <span className="font-bold text-[19px] tracking-[-0.03em] text-white/95 group-hover:text-white transition-colors">
            PostSpark
          </span>
        </div>

        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setIsAuthOpen(true)}
            className="text-xs font-semibold text-white/85 hover:text-white px-4 py-2 rounded-full border border-white/12 bg-white/6 hover:bg-white/12 backdrop-blur-md transition-all cursor-pointer shadow-sm hover:border-white/24 hover:shadow-[0_0_16px_rgba(255,255,255,0.08)]"
          >
            Entrar
          </button>
        </div>
      </header>

      {/* 3. Headline Hero com Entrada Tipográfica Monumental & Prompt Capsule */}
      <div className="showcase-hero-copy">
        <h1 className="showcase-h1">
          <span className="w" style={{ "--i": 0 } as any}>Descreva</span>{" "}
          <span className="w" style={{ "--i": 1 } as any}>a</span>{" "}
          <span className="w" style={{ "--i": 2 } as any}>ideia</span>
          <span className="showcase-dot">.</span>
        </h1>
        <p className="showcase-sub">
          Receba variações prontas para publicar. Edite quando quiser.
        </p>

        {!isMobile && (
          <div className={`showcase-desktop-prompt-capsule ${isTyping ? "typing" : ""}`}>
            <span className="text-[#FF5C00] text-xs">✦</span>
            <span className="showcase-prompt-prefix">prompt:</span>
            <span className="showcase-prompt-quote-text">&ldquo;{typedPrompt}&rdquo;</span>
            <span className="showcase-desktop-cursor" />
          </div>
        )}
      </div>

      {/* 4. Palco 3D Desktop (Coverflow) */}
      {!isMobile && (
        <InspiracaoDesktopStage
          onOpenAuth={() => setIsAuthOpen(true)}
          cloudsFarRef={cloudsFarRef}
          cloudsNearRef={cloudsNearRef}
          onActiveCardChange={handleActiveCardChange}
        />
      )}

      {/* 5. Composição Mobile (Stories com Typewriter & Síntese) */}
      {isMobile && (
        <InspiracaoMobileStories
          onOpenAuth={() => setIsAuthOpen(true)}
        />
      )}

      {/* Modal de Autenticação */}
      <StudioAuthModal
        isOpen={isAuthOpen}
        isMobile={isMobile}
        onClose={() => setIsAuthOpen(false)}
      />
    </div>
  );
}
