import { useState, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight, Layers, RefreshCw, Smartphone, Sparkles, Square } from "lucide-react";
import type { AspectRatioType, CanvasPostModel } from "@/pages/CanvasLab/components/types";
import { ASPECT_RATIO_CAPTIONS } from "@/pages/CanvasLab/components/types";
import { CanvasPostStage } from "@/pages/CanvasLab/components/CanvasPostStage";
import UserTopMenu from "@/components/UserTopMenu";

interface StudioMobileFlashcardsProps {
  variations: CanvasPostModel[];
  onSelectVariation: (variation: CanvasPostModel) => void;
  onBackToCreate: () => void;
  onGenerateMore?: () => void;
  isGeneratingMore?: boolean;
  /** Família declarada como gosto na tela de criação (marca "SEU GOSTO"). */
  declaredFamilyId?: string | null;
}

export default function StudioMobileFlashcards({
  variations,
  onSelectVariation,
  onBackToCreate,
  onGenerateMore,
  isGeneratingMore = false,
  declaredFamilyId,
}: StudioMobileFlashcardsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioType>("1:1");
  /** Guarda o estado de drag para não selecionar quando o usuário só navega. */
  const isDraggingCard = useRef(false);

  const total = variations.length;
  const currentPost = variations[currentIndex] || variations[0];

  // Dimensões do Card Mobile
  const cardScale = aspectRatio === "9:16" ? 0.48 : aspectRatio === "5:6" ? 0.58 : 0.65;
  const stageWidth = 360 * cardScale;
  const stageHeight = (aspectRatio === "9:16" ? 640 : aspectRatio === "5:6" ? 432 : 360) * cardScale;

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < total - 1 ? prev + 1 : 0));
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : total - 1));
  };

  return (
    <div className="flex-1 flex flex-col h-[100dvh] w-full overflow-hidden bg-[#07090E] text-white select-none relative">
      {/* ─── 1. TOP HEADER MOBILE ─── */}
      <header className="h-13 px-4 flex items-center justify-between border-b border-white/10 bg-black/50 backdrop-blur-xl shrink-0 z-30">
        <button
          type="button"
          onClick={onBackToCreate}
          className="flex items-center gap-1 text-xs text-white/70 hover:text-white bg-white/6 px-2.5 py-1.5 rounded-xl border border-white/10 active:scale-95 transition-transform"
        >
          <ChevronLeft size={14} />
          <span>Novo Tema</span>
        </button>

        {/* Seletor de Formato Claro (ratio + legenda — item 8) */}
        <div className="flex items-center bg-white/8 p-0.5 rounded-xl border border-white/12">
          {(Object.keys(ASPECT_RATIO_CAPTIONS) as AspectRatioType[]).map((id) => {
            const cap = ASPECT_RATIO_CAPTIONS[id];
            const isSelected = aspectRatio === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setAspectRatio(id)}
                aria-label={`Formato ${cap.short} ${cap.caption}`}
                className={`flex flex-col items-center px-2 py-1 rounded-lg transition-all ${
                  isSelected ? "bg-white text-black shadow-sm" : "text-white/50 hover:text-white"
                }`}
              >
                <span className="text-[11px] font-mono font-bold leading-none">{cap.short}</span>
                <span className="text-[7px] font-semibold uppercase tracking-wider mt-0.5 opacity-80">
                  {cap.caption}
                </span>
              </button>
            );
          })}
        </div>

        {/* Paginação Compacta e Menu do Usuário */}
        <div className="flex items-center gap-1.5">
          <div className="text-xs font-mono font-bold text-white/80 bg-white/6 px-2 py-1 rounded-full border border-white/10">
            {currentIndex + 1} / {total}
          </div>
          <UserTopMenu variant="inline" />
        </div>
      </header>

      {/* ─── 2. ÁREA DOS FLASHCARDS 3D EMPILHADOS ─── */}
      <main className="flex-1 flex flex-col items-center justify-center relative px-4 min-h-0 overflow-hidden">
        {/* Nome da Família Visual & Badge */}
        <div className="flex items-center gap-2 mb-3 z-20">
          <span
            className="w-2.5 h-2.5 rounded-full shadow-sm"
            style={{ backgroundColor: currentPost.palette.accent }}
          />
          <span className="text-xs font-bold uppercase tracking-wider text-white">
            {currentPost.familyName}
          </span>
          {currentPost.familyId === declaredFamilyId ? (
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-black bg-[oklch(0.78_0.22_48)] px-1.5 py-0.5 rounded-full">
              ✓ Seu gosto
            </span>
          ) : null}
        </div>

        {/* Palco dos Cards 3D com Arraste Tátil (Framer Motion) */}
        <div className="relative flex items-center justify-center w-full max-w-sm h-[380px]">
          {variations.map((item, idx) => {
            const offset = idx - currentIndex;
            // Mostra o card atual e até 2 cards atrás/frente
            if (Math.abs(offset) > 1) return null;

            const isCenter = offset === 0;
            const cleanItem: CanvasPostModel = {
              ...item,
              aspectRatio,
              bgImage: undefined,
              slides: item.slides.map((s) => ({ ...s, bgImage: undefined })),
            };

            return (
              <motion.div
                key={item.id || idx}
                className="absolute flex flex-col items-center justify-center touch-none rounded-3xl p-3 bg-[#0d0f18]/90 border border-white/12 shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-xl"
                style={{
                  zIndex: isCenter ? 20 : 10 - Math.abs(offset),
                }}
                animate={{
                  x: offset * 35,
                  scale: isCenter ? 1 : 0.88,
                  opacity: isCenter ? 1 : 0.4,
                  rotateZ: offset * 4,
                }}
                transition={{ type: "spring", stiffness: 350, damping: 28 }}
                drag={isCenter ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.3}
                onDragStart={() => {
                  isDraggingCard.current = true;
                }}
                onDragEnd={(_, info) => {
                  isDraggingCard.current = false;
                  if (info.offset.x < -50 || info.velocity.x < -200) {
                    handleNext();
                  } else if (info.offset.x > 50 || info.velocity.x > 200) {
                    handlePrev();
                  }
                }}
                // Item 10: toque no card central seleciona para edição.
                onTap={() => {
                  if (isCenter && !isDraggingCard.current) onSelectVariation(cleanItem);
                }}
              >
                {/* Prancheta Konva Auto-Fit */}
                <div
                  className="flex items-center justify-center rounded-2xl overflow-hidden shadow-inner pointer-events-none select-none"
                  style={{ width: stageWidth, height: stageHeight }}
                >
                  <CanvasPostStage post={cleanItem} zoom={cardScale} isReadOnly={true} />
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Dots de Paginação e Setas Rápidas */}
        <div className="flex items-center gap-4 mt-4 z-20">
          <button
            type="button"
            onClick={handlePrev}
            className="p-2 rounded-full bg-white/6 hover:bg-white/12 border border-white/10 text-white/80 active:scale-90 transition-transform"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="flex items-center gap-1.5">
            {variations.map((_, i) => (
              <div
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentIndex
                    ? "w-5 bg-[oklch(0.78_0.22_48)] shadow-[0_0_8px_oklch(0.78_0.22_48)]"
                    : "w-1.5 bg-white/20"
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={handleNext}
            className="p-2 rounded-full bg-white/6 hover:bg-white/12 border border-white/10 text-white/80 active:scale-90 transition-transform"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Dica de seleção (item 10) */}
        <p className="text-[10px] font-mono uppercase tracking-wider text-white/40 mt-2 mb-1">
          toque no card para editar
        </p>
      </main>

      {/* ─── 3. BARRA DE AÇÃO INFERIOR FIXA (THUMB ZONE) ─── */}
      <footer className="p-4 border-t border-white/10 bg-black/70 backdrop-blur-xl shrink-0 flex flex-col gap-2 z-30">
        <button
          type="button"
          onClick={() => {
            const cleanPost: CanvasPostModel = {
              ...currentPost,
              aspectRatio,
              bgImage: undefined,
              slides: currentPost.slides.map((s) => ({ ...s, bgImage: undefined })),
            };
            onSelectVariation(cleanPost);
          }}
          className="w-full py-3.5 px-5 rounded-2xl text-sm font-bold text-black shadow-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform cursor-pointer"
          style={{
            background: "linear-gradient(135deg, oklch(0.78 0.22 48), oklch(0.65 0.2 28))",
            boxShadow: "0 0 24px oklch(0.7 0.22 40 / 40%)",
          }}
        >
          <span>Personalizar Esta Variação</span>
          <ArrowRight size={16} />
        </button>

        {onGenerateMore && (
          <button
            type="button"
            onClick={onGenerateMore}
            disabled={isGeneratingMore}
            className="w-full py-2.5 text-xs font-semibold text-white/70 hover:text-white flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
          >
            <RefreshCw size={12} className={isGeneratingMore ? "animate-spin text-[oklch(0.78_0.22_48)]" : ""} />
            <span>{isGeneratingMore ? "Sintetizando novas ideias..." : "Gerar mais 3 variações"}</span>
          </button>
        )}
      </footer>
    </div>
  );
}
