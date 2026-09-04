import { useEffect, useRef, useState, useCallback } from "react";
import gsap from "gsap";
import Stage3DCard, { type Stage3DCardData } from "./Stage3DCard";

interface Stage3DCarouselProps {
  cards: Stage3DCardData[];
  onActiveCardChange?: (card: Stage3DCardData, index: number) => void;
}

export default function Stage3DCarousel({ cards, onActiveCardChange }: Stage3DCarouselProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Estado da posição contínua e alvo
  const stateRef = useRef({
    progress: 2, // Inicia no card central (índice 2)
    targetProgress: 2,
    isDragging: false,
    startX: 0,
    startProgress: 2,
    lastWheelTime: 0,
    velocity: 0,
  });

  const [activeIndex, setActiveIndex] = useState(2);

  const numCards = cards.length;

  // Atualiza as matrizes 3D em arco cilíndrico côncavo autêntico
  const updateCardTransforms = useCallback((currentProgress: number) => {
    const roundedIndex = Math.round(Math.max(0, Math.min(numCards - 1, currentProgress)));
    setActiveIndex(roundedIndex);

    // Parâmetros do Cilindro 3D
    const RADIUS = 1180; // Raio do cilindro em pixels
    const ANGLE_PER_CARD = 26; // Graus de separação angular entre cada card

    cardRefs.current.forEach((el, index) => {
      if (!el) return;

      const offset = index - currentProgress;
      const absOffset = Math.abs(offset);

      // Descartar cards fora do campo de visão útil (além de 3.2 unidades angulares)
      if (absOffset > 3.4) {
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        el.style.visibility = "hidden";
        return;
      }

      el.style.visibility = "visible";

      // Ângulo no cilindro em graus e radianos
      const thetaDeg = offset * ANGLE_PER_CARD;
      const thetaRad = (thetaDeg * Math.PI) / 180;

      // 1. Posição Horizontal X na corda do arco cilíndrico: R * sin(theta)
      const x = RADIUS * Math.sin(thetaRad);

      // 2. Profundidade Z no arco: R * (cos(theta) - 1)
      // O card central fica em Z = 0, e os laterais recuam em profundidade com a curvatura natural
      const z = RADIUS * (Math.cos(thetaRad) - 1);

      // 3. Rotação em torno do Eixo Y: Normal à tangente do cilindro (-thetaDeg)
      // O card à esquerda (offset < 0) tem rotateY > 0 (sua borda direita aproxima-se do centro)
      // O card à direita (offset > 0) tem rotateY < 0 (sua borda esquerda aproxima-se do centro)
      const rotateY = -thetaDeg;

      // 4. Escala Óptica Sutil
      const scale = Math.max(0.78, 1 - absOffset * 0.055);

      // 5. Opacidade & Iluminação Gradual
      const opacity = Math.max(0.12, 1 - absOffset * 0.24);

      // 6. Ordem de Camadas (Z-Index)
      const zIndex = Math.round(100 - absOffset * 10);

      // Aplicação direta via GPU Matrix3D
      el.style.transform = `translate3d(${x}px, 0px, ${z}px) rotateY(${rotateY}deg) scale(${scale})`;
      el.style.opacity = `${opacity}`;
      el.style.zIndex = `${zIndex}`;
      el.style.pointerEvents = absOffset < 1.4 ? "auto" : "none";
    });
  }, [numCards]);

  // Loop de Animação com GSAP Ticker (120 FPS cravados)
  useEffect(() => {
    const tickerCallback = () => {
      const state = stateRef.current;

      // Interpolação suave (lerp) em direção ao alvo
      state.progress += (state.targetProgress - state.progress) * 0.12;

      // Magnetic snap: atrai suavemente para o card mais próximo quando parar de rolar
      const now = Date.now();
      const isIdle = !state.isDragging && now - state.lastWheelTime > 160;
      if (isIdle) {
        const nearest = Math.round(state.targetProgress);
        state.targetProgress += (nearest - state.targetProgress) * 0.09;
      }

      updateCardTransforms(state.progress);
    };

    gsap.ticker.add(tickerCallback);

    return () => {
      gsap.ticker.remove(tickerCallback);
    };
  }, [updateCardTransforms]);

  // Notificar pai da mudança de card ativo
  useEffect(() => {
    if (cards[activeIndex]) {
      onActiveCardChange?.(cards[activeIndex], activeIndex);
    }
  }, [activeIndex, cards, onActiveCardChange]);

  // Interceptação de Scroll Wheel (Mouse e Trackpad)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Bloqueia rolagem vertical da janela
      e.preventDefault();

      const state = stateRef.current;
      state.lastWheelTime = Date.now();

      // Sensibilidade calibrada para wheel de mouse e trackpad
      const delta = (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * 0.0018;

      state.targetProgress = Math.max(0, Math.min(numCards - 1, state.targetProgress + delta));
    };

    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [numCards]);

  // Navegação por Teclado (Setas ← e →)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        stateRef.current.targetProgress = Math.max(0, stateRef.current.targetProgress - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        stateRef.current.targetProgress = Math.min(numCards - 1, stateRef.current.targetProgress + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [numCards]);

  // Suporte a Mouse Drag / Swipe
  const handleMouseDown = (e: React.MouseEvent) => {
    stateRef.current.isDragging = true;
    stateRef.current.startX = e.clientX;
    stateRef.current.startProgress = stateRef.current.targetProgress;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!stateRef.current.isDragging) return;
    const deltaX = e.clientX - stateRef.current.startX;
    stateRef.current.targetProgress = Math.max(
      0,
      Math.min(numCards - 1, stateRef.current.startProgress - deltaX * 0.0028)
    );
  };

  const handleMouseUp = () => {
    stateRef.current.isDragging = false;
  };

  // Clique em qualquer card lateral centraliza ele
  const handleCardClick = (index: number) => {
    stateRef.current.targetProgress = index;
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className="relative w-screen h-[520px] sm:h-[560px] flex items-center justify-center cursor-grab active:cursor-grabbing select-none overflow-visible"
      style={{
        perspective: "880px", // Perspectiva dramática grande-angular (fiel à referência)
        perspectiveOrigin: "50% 50%",
      }}
    >
      {/* Palco Central com Transform Style 3D */}
      <div
        className="relative w-full h-full flex items-center justify-center"
        style={{
          transformStyle: "preserve-3d",
        }}
      >
        {cards.map((card, idx) => {
          const isCenter = idx === activeIndex;
          return (
            <div
              key={card.id}
              ref={(el) => {
                cardRefs.current[idx] = el;
              }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{
                transformStyle: "preserve-3d",
                backfaceVisibility: "hidden",
                willChange: "transform, opacity",
              }}
            >
              <Stage3DCard
                card={card}
                isCenter={isCenter}
                onClick={() => handleCardClick(idx)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
