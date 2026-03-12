/**
 * OrganicBackground
 *
 * Fundo vivo com bolhas organicas que reagem ao accentColor.
 * Usa CSS keyframes para o morph continuo e Framer Motion para
 * transicoes suaves de cor ao mudar de tema/card.
 *
 * Performatico: anima apenas transform e opacity.
 */

import { motion } from "framer-motion";

interface OrganicBackgroundProps {
  accentColor?: string;
  intensity?: number;
  className?: string;
  performanceMode?: "full" | "reduced";
}

const BLOBS = [
  { x: "15%", y: "20%", size: "45vmax", delay: 0, morphIndex: 0 },
  { x: "70%", y: "65%", size: "40vmax", delay: 4, morphIndex: 1 },
  { x: "50%", y: "10%", size: "30vmax", delay: 8, morphIndex: 2 },
  { x: "5%", y: "70%", size: "35vmax", delay: 2, morphIndex: 3 },
  { x: "85%", y: "25%", size: "28vmax", delay: 6, morphIndex: 4 },
] as const;

export default function OrganicBackground({
  accentColor = "#7c3aed",
  intensity = 0.5,
  className = "",
  performanceMode = "full",
}: OrganicBackgroundProps) {
  const isOklch = accentColor.startsWith("oklch");
  const isReduced = performanceMode === "reduced";
  const blobOpacity = Math.max(0.04, Math.min(0.32, intensity * 0.32));
  const visibleBlobs = isReduced ? BLOBS.slice(0, 3) : BLOBS;

  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
      aria-hidden="true"
    >
      {visibleBlobs.map((blob, i) => {
        const animDuration = (isReduced ? 20 : 16) + i * 4;

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
              filter: `blur(${(isReduced ? 36 : 60) + i * (isReduced ? 6 : 10)}px)`,
              willChange: "transform, opacity",
              animation: `blobMorph${i % 3} ${animDuration}s ease-in-out ${blob.delay}s infinite alternate`,
            }}
            animate={{
              backgroundColor: isOklch ? accentColor : accentColor,
              opacity: isReduced ? blobOpacity * 0.72 : blobOpacity,
            }}
            transition={{
              backgroundColor: { duration: 1.8, ease: "easeInOut" },
              opacity: { duration: 1.2, ease: "easeInOut" },
            }}
          />
        );
      })}

      <style>{`
        @keyframes blobMorph0 {
          0% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: translate(-50%, -50%) scale(1); }
          33% { border-radius: 40% 60% 70% 30% / 40% 70% 30% 60%; transform: translate(-50%, -50%) scale(1.06); }
          66% { border-radius: 70% 30% 50% 50% / 30% 50% 50% 70%; transform: translate(-50%, -50%) scale(0.97); }
          100% { border-radius: 50% 50% 30% 70% / 50% 30% 70% 50%; transform: translate(-50%, -50%) scale(1.03); }
        }
        @keyframes blobMorph1 {
          0% { border-radius: 40% 60% 70% 30% / 40% 70% 30% 60%; transform: translate(-50%, -50%) scale(1.04); }
          33% { border-radius: 70% 30% 40% 60% / 70% 40% 60% 30%; transform: translate(-50%, -50%) scale(0.96); }
          66% { border-radius: 30% 70% 60% 40% / 60% 40% 70% 30%; transform: translate(-50%, -50%) scale(1.08); }
          100% { border-radius: 60% 40% 30% 70% / 30% 60% 40% 70%; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes blobMorph2 {
          0% { border-radius: 50% 50% 40% 60% / 50% 40% 60% 50%; transform: translate(-50%, -50%) scale(0.95); }
          33% { border-radius: 60% 40% 60% 40% / 40% 60% 40% 60%; transform: translate(-50%, -50%) scale(1.05); }
          66% { border-radius: 40% 60% 30% 70% / 60% 30% 70% 40%; transform: translate(-50%, -50%) scale(1); }
          100% { border-radius: 70% 30% 50% 50% / 30% 70% 50% 50%; transform: translate(-50%, -50%) scale(1.02); }
        }
      `}</style>
    </div>
  );
}
