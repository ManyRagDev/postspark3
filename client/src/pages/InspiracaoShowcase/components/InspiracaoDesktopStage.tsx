import { useEffect, useRef, useState } from "react";
import { LogIn } from "lucide-react";
import { SHOWCASE_SLIDES } from "../inspiracaoCardsData";
import ShowcaseCardContent from "./ShowcaseCardContent";

interface InspiracaoDesktopStageProps {
  onOpenAuth: () => void;
  cloudsFarRef: React.RefObject<HTMLDivElement | null>;
  cloudsNearRef: React.RefObject<HTMLDivElement | null>;
  onActiveCardChange?: (index: number) => void;
}

export default function InspiracaoDesktopStage({
  onOpenAuth,
  cloudsFarRef,
  cloudsNearRef,
  onActiveCardChange,
}: InspiracaoDesktopStageProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const shadeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [hintVisible, setHintVisible] = useState(true);
  const lastSettledCenterRef = useRef(0);

  // Mantém a referência do callback sempre fresca sem causar desmontagem do useEffect
  const onActiveCardChangeRef = useRef(onActiveCardChange);
  onActiveCardChangeRef.current = onActiveCardChange;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const cards = cardRefs.current.filter(Boolean) as HTMLDivElement[];
    const shades = shadeRefs.current.filter(Boolean) as HTMLDivElement[];
    const N = cards.length;
    if (N === 0) return;

    // Constantes idênticas ao inspiracao.html
    const CONF = {
      angle: 42,
      push: 1,
      lerp: 0.11,
      snap: 0.085,
      wheelSens: 0.0017,
      dragSens: 0.005,
    };

    const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (REDUCED) {
      CONF.lerp = 0.35;
      CONF.snap = 0.3;
      CONF.angle *= 0.35;
    }

    // Começa no primeiro post canônico ("Marcas de luxo...") no índice 0
    let target = 0;
    let current = 0;
    let lastInteract = 0;
    let animationFrameId: number;

    // Cálculo dinâmico de espaçamento e meia-largura dos cards
    let sp = 330;
    let halfW = cards[0] && cards[0].offsetWidth > 0 ? cards[0].offsetWidth / 2 : 175;

    const updateMetrics = () => {
      if (cards[0] && cards[0].offsetWidth > 0) {
        halfW = cards[0].offsetWidth / 2;
      }
      const computedStyle = getComputedStyle(stage);
      const computedSp = parseFloat(
        computedStyle.getPropertyValue("--showcase-card-spacing")
      );
      if (!isNaN(computedSp) && computedSp > 50) {
        sp = computedSp;
      } else if (cards[0] && cards[0].offsetWidth > 50) {
        sp = Math.round(cards[0].offsetWidth * 0.94);
      } else {
        sp = 330;
      }
    };
    updateMetrics();
    requestAnimationFrame(updateMetrics);
    window.addEventListener("resize", updateMetrics);

    function wrapOff(i: number, pos: number) {
      let off = (((i - pos) % N) + N) % N;
      if (off > N / 2) off -= N;
      return off;
    }

    /* ============ PROJEÇÃO COVERFLOW 3D (FIEL AO inspiracao.html) ============ */
    function project(card: HTMLDivElement, i: number, off: number, a: number) {
      const tilt = Math.min(a, 1);
      const rad = (tilt * CONF.angle * Math.PI) / 180;
      const z = Math.sin(rad) * halfW * CONF.push;

      card.style.transform = `translate3d(${off * sp}px, 0, ${z}px) rotateY(${-off * CONF.angle}deg)`;
      card.style.zIndex = String(Math.round(200 - a * 40));
      card.style.opacity = String(Math.max(0, Math.min(1, 1 - Math.max(0, a - 1.6) * 1.4)));
      card.style.visibility = "visible";

      if (shades[i]) {
        shades[i].style.opacity = String(Math.min(0.88, a * 0.52));
      }

      card.style.filter = a > 0.25 ? `blur(${Math.min(2, (a - 0.25) * 1.2)}px)` : "none";

      const t = Math.max(0, 1 - a);
      card.style.boxShadow =
        `0 ${20 + 30 * t}px ${45 + 55 * t}px rgba(0,0,0,${0.65 + 0.25 * t}), ` +
        `inset 0 0 0 1px rgba(255,255,255,${0.08 + 0.08 * t})`;
    }

    function update() {
      const drift = REDUCED ? 0 : 1;
      cards.forEach((card, i) => {
        const off = wrapOff(i, current);
        project(card, i, off, Math.abs(off));
      });

      if (cloudsFarRef.current) {
        cloudsFarRef.current.style.transform = `translateX(${current * -10 * drift}px)`;
      }
      if (cloudsNearRef.current) {
        cloudsNearRef.current.style.transform = `translateX(${current * -26 * drift}px)`;
      }
    }

    const interact = () => {
      lastInteract = performance.now();
      setHintVisible(false);
    };

    /* ---------- SCROLL FLUIDO GLOBAL (IDÊNTICO AO inspiracao.html) ---------- */
    const handleWheel = (e: WheelEvent) => {
      const d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      target += d * CONF.wheelSens;
      interact();
    };
    window.addEventListener("wheel", handleWheel, { passive: true });

    /* ---------- TECLADO (DESKOP) ---------- */
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        target = Math.round(target) + 1;
        interact();
      } else if (e.key === "ArrowLeft") {
        target = Math.round(target) - 1;
        interact();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    /* ---------- DRAG + MOMENTUM + CLIQUE (IDÊNTICO AO inspiracao.html) ---------- */
    let dragging = false;
    let lastX = 0;
    let lastT = 0;
    let vel = 0;
    let downX = 0;
    let downY = 0;
    let downCard: HTMLElement | null = null;

    const handlePointerDown = (e: PointerEvent) => {
      dragging = true;
      lastX = downX = e.clientX;
      downY = e.clientY;
      downCard = (e.target as HTMLElement).closest(".showcase-card");
      lastT = performance.now();
      vel = 0;
      stage.classList.add("dragging");
      stage.setPointerCapture(e.pointerId);
      interact();
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const now = performance.now();
      const dx = e.clientX - lastX;
      target -= dx * CONF.dragSens;
      vel = dx / (now - lastT + 1);
      lastX = e.clientX;
      lastT = now;
      interact();
    };

    const endDrag = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove("dragging");
      if (e.type === "pointerup") {
        if (!REDUCED) target += -vel * 120 * CONF.dragSens;
        if (Math.hypot(e.clientX - downX, e.clientY - downY) < 6 && downCard) {
          const i = cards.indexOf(downCard as HTMLDivElement);
          if (i !== -1) {
            const off = wrapOff(i, target);
            if (Math.abs(off) > 0.35) target = Math.round(target) + Math.round(off);
          }
        }
      }
      interact();
    };

    stage.addEventListener("pointerdown", handlePointerDown);
    stage.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);

    /* ============ LOOP DE ANIMAÇÃO DO inspiracao.html ============ */
    function frame(now: number) {
      if (Math.abs(current) > N * 4) {
        const k = N * Math.round(current / N);
        current -= k;
        target -= k;
      }

      if (!dragging && now - lastInteract > 150) {
        target += (Math.round(target) - target) * CONF.snap;
      }
      current += (target - current) * CONF.lerp;
      if (Math.abs(target - current) < 0.0004) current = target;
      update();

      // Acionamento reverso do Typewriter ao cair num post
      const currentCenter = (((Math.round(current) % N) + N) % N);
      if (currentCenter !== lastSettledCenterRef.current && (Math.abs(target - current) < 0.28 || now - lastInteract > 120)) {
        lastSettledCenterRef.current = currentCenter;
        onActiveCardChangeRef.current?.(currentCenter);
      }

      animationFrameId = requestAnimationFrame(frame);
    }

    update();
    animationFrameId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", updateMetrics);
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
      stage.removeEventListener("pointerdown", handlePointerDown);
      stage.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, []); // Sem dependências para garantir persistência contínua e sem interrupções

  return (
    <>
      {/* Palco 3D Coverflow com Cards Canônicos */}
      <div className="showcase-stage" ref={stageRef}>
        {SHOWCASE_SLIDES.map((slide, index) => (
          <div
            key={slide.card.id}
            ref={(el) => {
              cardRefs.current[index] = el;
            }}
            className="showcase-card cursor-pointer"
            style={{
              borderColor: `${slide.card.palette.accent}33`,
            }}
          >
            <ShowcaseCardContent slide={slide} />
            <div
              ref={(el) => {
                shadeRefs.current[index] = el;
              }}
              className="shade"
            />
          </div>
        ))}
      </div>

      {/* Dock Inferior com Botão Entrar em Evidência */}
      <div className="showcase-dock">
        <button
          type="button"
          onClick={onOpenAuth}
          className="showcase-pill showcase-pill-primary"
        >
          <LogIn size={16} />
          <span>Entrar</span>
        </button>
      </div>

      {/* Dica de Navegação Temporária */}
      <div className={`showcase-hint ${!hintVisible ? "off" : ""}`}>
        <div className="showcase-wheel" />
        <span>Role para percorrer o estúdio</span>
      </div>
    </>
  );
}
