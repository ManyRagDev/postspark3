import { motion } from "framer-motion";
import { useMemo } from "react";

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  color: string;
  driftXMid: number;
  driftXEnd: number;
  driftYMid: number;
}

const COLORS = [
  "oklch(0.7 0.22 40)",
  "oklch(0.75 0.14 200)",
  "oklch(0.45 0.18 290)",
  "oklch(0.65 0.2 350)",
  "oklch(0.6 0.24 25)",
];

export default function SparkParticles({
  count = 40,
  performanceMode = "full",
  variant = "default",
}: {
  count?: number;
  performanceMode?: "full" | "reduced";
  variant?: "default" | "subtle";
}) {
  const isReduced = performanceMode === "reduced";
  const isSubtle = variant === "subtle";

  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 3 + 1,
        duration: Math.random() * 8 + 6,
        delay: Math.random() * 5,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        driftXMid: (Math.random() - 0.5) * 60,
        driftXEnd: (Math.random() - 0.5) * 100,
        driftYMid: -80 - Math.random() * 120,
      })),
    [count]
  );

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: isReduced
              ? `0 0 ${p.size * (isSubtle ? 2.5 : 4)}px ${p.color}`
              : `0 0 ${p.size * (isSubtle ? 3.5 : 6)}px ${p.color}, 0 0 ${p.size * (isSubtle ? 7 : 12)}px ${p.color}`,
            opacity: isSubtle ? (isReduced ? 0.42 : 0.5) : isReduced ? 0.75 : 1,
          }}
          animate={{
            y: [0, p.driftYMid, -200],
            x: [0, p.driftXMid, p.driftXEnd],
            opacity: isSubtle ? [0, 0.66, 0] : [0, 1, 0],
            scale: isSubtle ? [0.5, isReduced ? 0.95 : 1.05, 0.3] : isReduced ? [0.5, 1.15, 0.3] : [0.5, 1.4, 0.3],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}

      <motion.div
        className={`absolute rounded-full ${isReduced ? "w-[320px] h-[320px]" : "w-[500px] h-[500px]"}`}
        style={{
          left: "10%",
          top: "60%",
          background: `radial-gradient(circle, oklch(0.7 0.22 40 / ${isSubtle ? "2.5%" : "6%"}) 0%, transparent 70%)`,
        }}
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.3, 0.6, 0.3],
        }}
        transition={{ duration: isReduced ? 10 : 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className={`absolute rounded-full ${isReduced ? "w-[240px] h-[240px]" : "w-[400px] h-[400px]"}`}
        style={{
          right: "5%",
          top: "20%",
          background: `radial-gradient(circle, oklch(0.75 0.14 200 / ${isSubtle ? "2%" : "5%"}) 0%, transparent 70%)`,
        }}
        animate={{
          scale: [1.2, 1, 1.2],
          opacity: [0.2, 0.5, 0.2],
        }}
        transition={{ duration: isReduced ? 12 : 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className={`absolute rounded-full ${isReduced ? "w-[220px] h-[220px]" : "w-[350px] h-[350px]"}`}
        style={{
          left: "50%",
          top: "10%",
          transform: "translateX(-50%)",
          background: `radial-gradient(circle, oklch(0.45 0.18 290 / ${isSubtle ? "2%" : "5%"}) 0%, transparent 70%)`,
        }}
        animate={{
          scale: [1, 1.4, 1],
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{ duration: isReduced ? 14 : 12, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
