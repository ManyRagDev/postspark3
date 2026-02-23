/**
 * OrganicBackground
 *
 * Fundo vivo com bolhas orgânicas que reagem ao accentColor.
 * Usa CSS keyframes para o morph contínuo e Framer Motion para
 * transições suaves de cor ao mudar de tema/card.
 *
 * Performático: só anima transform + opacity (GPU).
 */

import { motion } from "framer-motion";

interface OrganicBackgroundProps {
  /** Cor base das bolhas (hex ou oklch) — default: roxo void */
  accentColor?: string;
  /** 0–1: intensidade do movimento e opacidade (default: 0.5) */
  intensity?: number;
  className?: string;
}

// Configuração de cada blob: posição, tamanho, delay de animação, border-radius keyframe index
const BLOBS = [
  { x: "15%",  y: "20%",  size: "45vmax", delay: 0,    morphIndex: 0 },
  { x: "70%",  y: "65%",  size: "40vmax", delay: 4,    morphIndex: 1 },
  { x: "50%",  y: "10%",  size: "30vmax", delay: 8,    morphIndex: 2 },
  { x: "5%",   y: "70%",  size: "35vmax", delay: 2,    morphIndex: 3 },
  { x: "85%",  y: "25%",  size: "28vmax", delay: 6,    morphIndex: 4 },
] as const;

// Shapes de border-radius ciclados para cada blob
const MORPH_SHAPES = [
  "60% 40% 30% 70% / 60% 30% 70% 40%",
  "40% 60% 70% 30% / 40% 70% 30% 60%",
  "70% 30% 40% 60% / 30% 60% 40% 70%",
  "30% 70% 60% 40% / 70% 40% 60% 30%",
  "50% 50% 30% 70% / 50% 30% 70% 50%",
] as const;

export default function OrganicBackground({
  accentColor = "#7c3aed",
  intensity = 0.5,
  className = "",
}: OrganicBackgroundProps) {
  // Converter accentColor para usável em rgba
  // Se for oklch, usamos como está; se hex, usamos com alpha
  const isOklch = accentColor.startsWith("oklch");

  // Opacidade base das bolhas: intensity controla a visibilidade
  // Teto em 0.32 para permitir valores mais vivos em telas como HoloDeck
  const blobOpacity = Math.max(0.04, Math.min(0.32, intensity * 0.32));

  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
      aria-hidden="true"
    >
      {BLOBS.map((blob, i) => {
        const morphShape = MORPH_SHAPES[blob.morphIndex];
        const altShape = MORPH_SHAPES[(blob.morphIndex + 2) % MORPH_SHAPES.length];
        const animDuration = 16 + i * 4; // cada blob tem duração diferente

        return (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              left: blob.x,
              top: blob.y,
              width: blob.size,
              height: blob.size,
              transform: "translate(-50%, -50%)",
              filter: `blur(${60 + i * 10}px)`,
              willChange: "transform, opacity",
              // Animação CSS para morph contínuo
              animation: `blobMorph${i % 3} ${animDuration}s ease-in-out ${blob.delay}s infinite alternate`,
            }}
            // Framer Motion para transição suave de cor
            animate={{
              backgroundColor: isOklch
                ? accentColor // oklch passado direto para CSS
                : accentColor,
              opacity: blobOpacity,
            }}
            transition={{
              backgroundColor: { duration: 1.8, ease: "easeInOut" },
              opacity: { duration: 1.2, ease: "easeInOut" },
            }}
          />
        );
      })}

      {/* CSS keyframes para morph de border-radius */}
      <style>{`
        @keyframes blobMorph0 {
          0%   { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: translate(-50%, -50%) scale(1); }
          33%  { border-radius: 40% 60% 70% 30% / 40% 70% 30% 60%; transform: translate(-50%, -50%) scale(1.06); }
          66%  { border-radius: 70% 30% 50% 50% / 30% 50% 50% 70%; transform: translate(-50%, -50%) scale(0.97); }
          100% { border-radius: 50% 50% 30% 70% / 50% 30% 70% 50%; transform: translate(-50%, -50%) scale(1.03); }
        }
        @keyframes blobMorph1 {
          0%   { border-radius: 40% 60% 70% 30% / 40% 70% 30% 60%; transform: translate(-50%, -50%) scale(1.04); }
          33%  { border-radius: 70% 30% 40% 60% / 70% 40% 60% 30%; transform: translate(-50%, -50%) scale(0.96); }
          66%  { border-radius: 30% 70% 60% 40% / 60% 40% 70% 30%; transform: translate(-50%, -50%) scale(1.08); }
          100% { border-radius: 60% 40% 30% 70% / 30% 60% 40% 70%; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes blobMorph2 {
          0%   { border-radius: 50% 50% 40% 60% / 50% 40% 60% 50%; transform: translate(-50%, -50%) scale(0.95); }
          33%  { border-radius: 60% 40% 60% 40% / 40% 60% 40% 60%; transform: translate(-50%, -50%) scale(1.05); }
          66%  { border-radius: 40% 60% 30% 70% / 60% 30% 70% 40%; transform: translate(-50%, -50%) scale(1); }
          100% { border-radius: 70% 30% 50% 50% / 30% 70% 50% 50%; transform: translate(-50%, -50%) scale(1.02); }
        }
      `}</style>
    </div>
  );
}
