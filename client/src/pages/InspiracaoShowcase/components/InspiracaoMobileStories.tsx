import { useEffect, useRef, useState } from "react";
import { SHOWCASE_SLIDES } from "../inspiracaoCardsData";
import ShowcaseCardContent from "./ShowcaseCardContent";
import { LogIn } from "lucide-react";

interface InspiracaoMobileStoriesProps {
  onOpenAuth: () => void;
}

type StoryPhase = "typing" | "synthesizing" | "running";

export default function InspiracaoMobileStories({
  onOpenAuth,
}: InspiracaoMobileStoriesProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [phase, setPhase] = useState<StoryPhase>("typing");
  const [typedText, setTypedText] = useState("");
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const activeSlide = SHOWCASE_SLIDES[activeIndex];
  const targetPrompt = activeSlide.prompt;

  // Refs para controle de timers
  const pointerDownTimeRef = useRef(0);
  const pointerDownXRef = useRef(0);
  const pointerDownYRef = useRef(0);
  const movedRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const STORY_DURATION = 4200; // ms de exibição do card após síntese
  const TYPING_SPEED = 28; // ms por caractere digitado
  const SYNTH_DURATION = 750; // ms de animação de síntese

  // 1. Efeito Typewriter
  useEffect(() => {
    let charIndex = 0;
    setPhase("typing");
    setTypedText("");
    setProgress(0);

    const typeInterval = setInterval(() => {
      charIndex++;
      if (charIndex <= targetPrompt.length) {
        setTypedText(targetPrompt.slice(0, charIndex));
      } else {
        clearInterval(typeInterval);
        // Terminou de digitar -> Inicia animação de síntese
        setPhase("synthesizing");
      }
    }, TYPING_SPEED);

    return () => clearInterval(typeInterval);
  }, [activeIndex, targetPrompt]);

  // 2. Animação de Síntese -> Transição para Story Running
  useEffect(() => {
    if (phase !== "synthesizing") return;

    const synthTimeout = setTimeout(() => {
      setPhase("running");
      setProgress(0);
      lastTimeRef.current = performance.now();
    }, SYNTH_DURATION);

    return () => clearTimeout(synthTimeout);
  }, [phase]);

  // 3. Temporizador contínuo estilo Stories durante a fase "running"
  useEffect(() => {
    if (phase !== "running") return;

    lastTimeRef.current = performance.now();

    const tick = (now: number) => {
      if (!isPaused) {
        const delta = now - lastTimeRef.current;
        setProgress((prev) => {
          const next = prev + delta / STORY_DURATION;
          if (next >= 1) {
            // Avança para o próximo slide
            goToSlide((activeIndex + 1) % SHOWCASE_SLIDES.length);
            return 0;
          }
          return next;
        });
      }
      lastTimeRef.current = now;
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [phase, isPaused, activeIndex]);

  const goToSlide = (index: number) => {
    const nextIdx = (index + SHOWCASE_SLIDES.length) % SHOWCASE_SLIDES.length;
    setActiveIndex(nextIdx);
  };

  // Controles por toque no card (toque esquerdo/direito e segurar para pausar)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerDownTimeRef.current = performance.now();
    pointerDownXRef.current = e.clientX;
    pointerDownYRef.current = e.clientY;
    movedRef.current = 0;
    setIsPaused(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPaused) return;
    movedRef.current = Math.max(
      movedRef.current,
      Math.hypot(e.clientX - pointerDownXRef.current, e.clientY - pointerDownYRef.current)
    );
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const elapsed = performance.now() - pointerDownTimeRef.current;
    setIsPaused(false);
    lastTimeRef.current = performance.now();

    // Se foi um toque rápido sem arrastar (tap e não hold)
    if (elapsed < 280 && movedRef.current < 12) {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      if (clickX > rect.width / 2) {
        goToSlide(activeIndex + 1);
      } else {
        goToSlide(activeIndex - 1);
      }
    }
  };

  return (
    <div className="showcase-mobile-demo">
      {/* 1. Cápsula de Prompt com Typewriter e Animação de Síntese */}
      <div
        className={`showcase-prompt-capsule ${
          phase === "synthesizing" ? "synthesizing" : ""
        }`}
      >
        <span
          className={`showcase-spark ${
            phase === "synthesizing" ? "pulsing" : ""
          }`}
        >
          ✦
        </span>
        <div className="showcase-prompt-text">
          <span>&ldquo;{typedText}</span>
          {phase === "typing" && <span className="showcase-cursor" />}
          <span>&rdquo;</span>
        </div>
      </div>

      {/* 2. Card 4:5 Mobile com Barras de Progresso e Slides */}
      <div
        className="showcase-m-card"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setIsPaused(false)}
      >
        {/* Segmentos de Progresso Estilo Stories */}
        <div className="showcase-segments">
          {SHOWCASE_SLIDES.map((_, i) => {
            let widthPercent = 0;
            if (i < activeIndex) {
              widthPercent = 100;
            } else if (i === activeIndex) {
              widthPercent = phase === "running" ? progress * 100 : 0;
            }
            return (
              <button
                key={i}
                type="button"
                className="showcase-seg"
                onClick={(e) => {
                  e.stopPropagation();
                  goToSlide(i);
                }}
                aria-label={`Ir para a variação ${i + 1}`}
              >
                <i style={{ width: `${widthPercent}%` }} />
              </button>
            );
          })}
        </div>

        {/* Slides Renderizados com a Estética Canônica */}
        {SHOWCASE_SLIDES.map((slide, i) => (
          <div
            key={slide.card.id}
            className={`showcase-slide ${i === activeIndex && phase !== "typing" ? "active" : ""}`}
            style={{
              background: `linear-gradient(180deg, ${slide.card.palette.background}FA 0%, #0d0a08 100%)`,
              border: `1px solid ${slide.card.palette.accent}33`,
            }}
          >
            <ShowcaseCardContent slide={slide} />
          </div>
        ))}
      </div>

      {/* 3. Tag de Tempo e Síntese */}
      <div className="showcase-gen-tag">
        {phase === "synthesizing" ? (
          <span className="text-[#FF5C00] animate-pulse">✦ sintetizando variação...</span>
        ) : (
          <span>⚡ gerado em {activeSlide.generationTime}</span>
        )}
      </div>

      {/* 4. Dock Mobile com Botão Entrar em Evidência */}
      <div className="mt-2 flex justify-center">
        <button
          type="button"
          onClick={onOpenAuth}
          className="showcase-pill showcase-pill-primary"
        >
          <LogIn size={16} />
          <span>Entrar</span>
        </button>
      </div>
    </div>
  );
}
