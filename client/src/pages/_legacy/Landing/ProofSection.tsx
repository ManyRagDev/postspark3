/**
 * ProofSection.tsx - Seção 2: Prova da Transformação (antes/depois)
 *
 * 3 pares antes/depois em stack vertical.
 * "Antes" = texto cru estilo nota de celular.
 * "Depois" = post final renderizado via PostRenderer.
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import PostRenderer from "@/components/PostRenderer";
import { showcaseCards } from "@/lib/showcaseCards";
import { createPostVisualSnapshot } from "@/lib/variationSnapshot";
import type { PostVisualSnapshot } from "@shared/postspark";

// Casos escolhidos dos showcaseCards: #5 (autoridade-premium), #3 (lançamento high-ticket), #9 (conversão-direta)
const PROOF_CASES = [
  {
    cardId: 5,
    beforeText: "abri 3 vagas de consultoria, quero parecer premium sem parecer arrogante",
  },
  {
    cardId: 3,
    beforeText: "lancamento de mentoria, preciso de urgencia e presenca premium",
  },
  {
    cardId: 9,
    beforeText: "promocao de servico, preciso chamar atencao sem parecer desesperado",
  },
];

interface ProofCase {
  cardId: number;
  beforeText: string;
  afterSnapshot: PostVisualSnapshot;
  isInView: boolean;
}

const SPRING_ENTRY = { stiffness: 200, damping: 26 };

export default function ProofSection() {
  const [proofCases, setProofCases] = useState<ProofCase[]>([]);

  useEffect(() => {
    // Converter showcaseCards em snapshots
    const cases = PROOF_CASES.map((proof) => {
      const card = showcaseCards.find((c) => c.id === proof.cardId);
      if (!card) return null;

      // Criar uma PostVariation mínima para renderizar
      const variation = {
        id: `proof-${proof.cardId}`,
        headline: card.headline,
        body: card.subtext,
        caption: `${card.headline}\n\n${card.subtext}`,
        hashtags: [],
        callToAction: "",
        tone: "professional",
        platform: "instagram" as const,
        imagePrompt: card.imagePrompt || "",
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

      const snapshot = createPostVisualSnapshot(variation, "1:1");

      return {
        cardId: proof.cardId,
        beforeText: proof.beforeText,
        afterSnapshot: snapshot,
        isInView: false,
      };
    }).filter(Boolean) as ProofCase[];

    setProofCases(cases);
  }, []);

  return (
    <section className="relative py-24 md:py-32 border-t border-white/5">
      <div className="container mx-auto px-4 md:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={SPRING_ENTRY}
          className="text-center mb-16 md:mb-24"
        >
          <h2 className="font-['Space_Grotesk'] text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4">
            Isto entrou. → Isto saiu.
          </h2>
          <p className="font-['Inter'] text-lg text-[--text-secondary] max-w-2xl mx-auto">
            Ideias cruas se transformam em posts profissionais. Veja 3 exemplos reais.
          </p>
        </motion.div>

        {/* Pares antes/depois */}
        <div className="space-y-16 md:space-y-24">
          {proofCases.map((proofCase, index) => (
            <ProofPair
              key={proofCase.cardId}
              proofCase={proofCase}
              index={index}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// Subcomponente: ProofPair
function ProofPair({ proofCase, index }: { proofCase: ProofCase; index: number }) {
  const [isInView, setIsInView] = useState(false);
  const [showAfter, setShowAfter] = useState(false);

  useEffect(() => {
    if (isInView) {
      const timer = setTimeout(() => setShowAfter(true), 300);
      return () => clearTimeout(timer);
    }
  }, [isInView]);

  return (
    <motion.div
      onViewportEnter={() => setIsInView(true)}
      viewport={{ once: true, margin: "-20%" }}
      className="grid md:grid-cols-2 gap-8 md:gap-12 items-center"
    >
      {/* Antes - texto cru */}
      <motion.div
        initial={{ opacity: 0, x: -24 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-20%" }}
        transition={{ delay: index * 0.1, ...SPRING_ENTRY }}
        className="relative"
      >
        <div className="p-6 bg-[--surface-void] border-2 border-dashed border-white/20 rounded-xl">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-2 h-2 rounded-full bg-white/30 mt-2" />
            <div className="font-['Space_Grotesk'] text-xs text-white/40 uppercase tracking-wider">
              Antes
            </div>
          </div>
          <p className="font-['JetBrains_Mono'] text-sm md:text-base text-white/70 leading-relaxed">
            {proofCase.beforeText}
          </p>
        </div>

        {/* Conector visual */}
        {showAfter && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 }}
            className="absolute -right-4 top-1/2 -translate-y-1/2 z-10 hidden md:block"
          >
            <div className="w-8 h-8 rounded-full bg-[oklch(0.7_0.22_40)] flex items-center justify-center shadow-lg">
              <span className="text-white text-lg">→</span>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Depois - post renderizado */}
      <motion.div
        initial={{ opacity: 0, x: 24 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-20%" }}
        transition={{ delay: index * 0.1 + 0.3, ...SPRING_ENTRY }}
        className="relative"
      >
        <div className="relative w-full aspect-square max-w-md mx-auto">
          <PostRenderer
            mode="preview"
            snapshot={proofCase.afterSnapshot}
            className="rounded-xl overflow-hidden shadow-2xl"
          />
        </div>

        <div className="mt-4 text-center">
          <div className="font-['Space_Grotesk'] text-xs text-[oklch(0.7_0.22_40)] uppercase tracking-wider">
            Depois
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
