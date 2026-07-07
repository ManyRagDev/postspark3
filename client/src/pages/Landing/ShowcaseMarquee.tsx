/**
 * ShowcaseMarquee.tsx - Seção 4: Vitrine Midnight (marquee)
 *
 * Dois marquees horizontais em direções opostas com os 12 showcaseCards
 * renderizados como mini-posts estáticos.
 * Pausa no hover; tap no mobile não faz nada (decorativo).
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { showcaseCards } from "@/lib/showcaseCards";
import { getOptimizedUnsplashUrl } from "@/lib/utils";
import { createPostVisualSnapshot } from "@/lib/variationSnapshot";
import PostRenderer from "@/components/PostRenderer";
import type { PostVisualSnapshot } from "@shared/postspark";

const SPRING_ENTRY = { stiffness: 260, damping: 30 };

export default function ShowcaseMarquee() {
  const [snapshots, setSnapshots] = useState<PostVisualSnapshot[]>([]);
  const [isPaused, setIsPaused] = useState(false);

  // Converter showcaseCards em snapshots
  useEffect(() => {
    const converted = showcaseCards.map((card) => {
      const variation = {
        id: `showcase-${card.id}`,
        headline: card.headline,
        body: card.subtext,
        caption: `${card.headline}\n\n${card.subtext}`,
        hashtags: [],
        callToAction: "",
        tone: "professional",
        platform: "instagram" as const,
        imagePrompt: card.imagePrompt,
        imageUrl: card.backgroundImageUrl || "",
        backgroundColor: card.palette.background,
        textColor: card.palette.text,
        headlineColor: card.palette.text,
        bodyColor: card.palette.surface || card.palette.text,
        accentColor: card.palette.accent,
        layout: card.layoutType === "full-image"
          ? ("minimal" as const)
          : card.layoutType === "split"
            ? ("split" as const)
            : ("minimal" as const),
        aspectRatio: "1:1" as const,
        postMode: "static" as const,
        fontFamily: card.fontFamily,
        designTokens: {
          colors: {
            background: card.palette.background,
            primary: card.palette.accent,
            secondary: card.palette.text,
            text: card.palette.text,
            card: card.palette.surface || card.palette.background,
          },
          typography: {
            fontFamily: card.fontFamily,
            customFontUrl: "",
            originalFont: card.fontFamily,
            textTransform: card.titleCase === "upper" ? ("uppercase" as const) : ("none" as const),
            textAlign: "left" as const,
          },
          structure: {
            borderRadius: "0px",
            boxShadow: "none",
            border: "none",
          },
          decorations: "minimal" as const,
        },
      };

      return createPostVisualSnapshot(variation, "1:1");
    });

    setSnapshots(converted);
  });

  // Duplicar array para loop infinito
  const doubledSnapshots = [...snapshots, ...snapshots];

  return (
    <section className="relative py-16 md:py-24 border-t border-white/5 overflow-hidden">
      <div className="container mx-auto px-4 md:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={SPRING_ENTRY}
          className="text-center mb-12"
        >
          <h2 className="font-['Space_Grotesk'] text-2xl md:text-3xl font-bold text-white mb-2">
            Vitrine Midnight
          </h2>
          <p className="font-['Inter'] text-sm text-[--text-secondary]">
            Design premium para qualquer nicho
          </p>
        </motion.div>

        {/* Marquee 1 - direita */}
        <MarqueeRow
          snapshots={doubledSnapshots}
          direction="right"
          duration={40}
          isPaused={isPaused}
          setIsPaused={setIsPaused}
        />

        {/* Marquee 2 - esquerda (reverso) */}
        <MarqueeRow
          snapshots={[...doubledSnapshots].reverse()}
          direction="left"
          duration={55}
          isPaused={isPaused}
          setIsPaused={setIsPaused}
        />
      </div>
    </section>
  );
}

// Subcomponente: MarqueeRow
function MarqueeRow({
  snapshots,
  direction,
  duration,
  isPaused,
  setIsPaused,
}: {
  snapshots: PostVisualSnapshot[];
  direction: "left" | "right";
  duration: number;
  isPaused: boolean;
  setIsPaused: (paused: boolean) => void;
}) {
  return (
    <div
      className="relative w-full overflow-hidden py-4"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <motion.div
        className="flex gap-4"
        animate={{
          x: direction === "left" ? 0 : "50%",
        }}
        initial={{
          x: direction === "left" ? "-50%" : 0,
        }}
        transition={{
          x: {
            type: "tween",
            ease: "linear",
            duration,
            repeat: Infinity,
            repeatType: "loop",
          },
        }}
        style={{
          animationPlayState: isPaused ? "paused" : "running",
        }}
      >
        {snapshots.map((snapshot, index) => (
          <motion.div
            key={`${snapshot.id}-${index}`}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.05 }}
            className="flex-shrink-0 w-48 md:w-64 aspect-square"
          >
            <div className="relative w-full h-full rounded-lg overflow-hidden shadow-lg border border-white/10">
              <PostRenderer mode="preview" snapshot={snapshot} />
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
