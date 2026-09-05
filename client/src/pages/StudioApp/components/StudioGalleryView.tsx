import StudioMobileFlashcards from "./StudioMobileFlashcards";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Layers, RefreshCw, Smartphone, Square } from "lucide-react";
import type { AspectRatioType, CanvasPostModel } from "@/pages/CanvasLab/components/types";
import { ASPECT_RATIO_CAPTIONS } from "@/pages/CanvasLab/components/types";
import { CanvasPostStage } from "@/pages/CanvasLab/components/CanvasPostStage";

interface StudioGalleryViewProps {
  variations: CanvasPostModel[];
  onSelectVariation: (variation: CanvasPostModel) => void;
  onBackToCreate: () => void;
  onGenerateMore?: () => void;
  isGeneratingMore?: boolean;
  /** Família declarada como gosto na tela de criação (marca "SEU GOSTO"). */
  declaredFamilyId?: string | null;
}

export default function StudioGalleryView({
  variations,
  onSelectVariation,
  onBackToCreate,
  onGenerateMore,
  isGeneratingMore = false,
  declaredFamilyId,
}: StudioGalleryViewProps) {
  const [aspectRatio, setAspectRatio] = useState<AspectRatioType>("1:1");

  // Dimensões do Card na Galeria para manter proporção 1:1, 5:6 e 9:16 rigorosamente exatas
  const cardScale = 0.72;
  const stageWidth = 360 * cardScale; // ~259.2px
  const stageHeight =
    (aspectRatio === "9:16" ? 640 : aspectRatio === "5:6" ? 432 : 360) * cardScale;

  return (
    <>
      {/* ─── EXPERIÊNCIA MOBILE (FLASHCARDS 3D EMPILHADOS) ─── */}
      <div className="md:hidden flex-1 flex flex-col h-full w-full">
        <StudioMobileFlashcards
          variations={variations}
          onSelectVariation={onSelectVariation}
          onBackToCreate={onBackToCreate}
          onGenerateMore={onGenerateMore}
          isGeneratingMore={isGeneratingMore}
          declaredFamilyId={declaredFamilyId}
        />
      </div>

      {/* ─── EXPERIÊNCIA DESKTOP (GRADE 3 COLUNAS ORIGINAL INTACTA) ─── */}
      <div className="hidden md:flex flex-1 flex flex-col h-full overflow-hidden select-none">
      {/* Barra Superior da Galeria */}
      <header className="h-14 border-b border-white/10 bg-black/60 backdrop-blur-xl px-6 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToCreate}
            className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white transition-colors cursor-pointer bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-xl border border-white/10"
          >
            <ArrowLeft size={13} />
            <span>Novo Tema</span>
          </button>
          <div className="h-4 w-[1px] bg-white/10" />
          <span className="text-xs font-bold uppercase tracking-widest text-white">
            Direções de Arte ({variations.length})
          </span>
        </div>

        {/* Seletor de Formato (legendas oficiais — item 8) */}
        <div className="flex items-center bg-white/6 p-1 rounded-xl border border-white/10">
          {(Object.keys(ASPECT_RATIO_CAPTIONS) as AspectRatioType[]).map((id) => {
            const cap = ASPECT_RATIO_CAPTIONS[id];
            const Icon = id === "9:16" ? Smartphone : id === "5:6" ? Layers : Square;
            const isSelected = aspectRatio === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setAspectRatio(id)}
                aria-label={`Formato ${cap.short} ${cap.caption}`}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? "bg-white text-black shadow-sm"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon size={13} />
                <span className="hidden sm:inline-block">{cap.short} {cap.caption}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Grid de Cards com Proporção Geométrica Perfeita */}
      <main className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar flex flex-col items-center justify-start">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 max-w-6xl mx-auto w-full items-start justify-center">
          {variations.map((item, idx) => {
            // Garante que o HoloDeck seja 100% LIMPO de fotos e aplique o aspectRatio selecionado
            const cleanItem: CanvasPostModel = {
              ...item,
              aspectRatio,
              bgImage: undefined,
              slides: item.slides.map((s) => ({ ...s, bgImage: undefined })),
            };

            return (
              <div
                key={item.id || idx}
                role="button"
                tabIndex={0}
                aria-label={`Editar direção ${idx + 1}: ${item.familyName}`}
                onClick={() => onSelectVariation(cleanItem)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onSelectVariation(cleanItem);
                }}
                className="group relative flex flex-col items-center bg-white/3 hover:bg-white/6 border border-white/10 hover:border-[oklch(0.78_0.22_48)] rounded-3xl p-5 transition-all duration-300 shadow-2xl hover:shadow-[0_20px_60px_rgba(0,0,0,0.8)] cursor-pointer"
              >
                {/* Header do Card */}
                <div className="w-full flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full border border-white/20"
                      style={{ backgroundColor: item.palette.accent }}
                    />
                    <span className="text-xs font-bold text-white tracking-wide">
                      {item.familyName}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-white/40 uppercase">
                    {item.familyId === declaredFamilyId ? (
                      <span className="text-[oklch(0.78_0.22_48)]">✓ Seu gosto · Opção 0{idx + 1}</span>
                    ) : (
                      <>Opção 0{idx + 1}</>
                    )}
                  </span>
                </div>

                {/* Prancheta em Canvas 2D com Proporção 1:1 rigorosa */}
                <div
                  className="flex items-center justify-center my-2 transition-all duration-200 pointer-events-none select-none"
                  style={{ width: stageWidth, height: stageHeight }}
                >
                  <CanvasPostStage post={cleanItem} zoom={cardScale} isReadOnly={true} />
                </div>

                {/* Botão de Ação: Personalizar Post (mantido para a11y — o card inteiro também clica) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectVariation(cleanItem);
                  }}
                  className="w-full mt-4 py-2.5 px-4 rounded-xl text-xs font-bold text-black bg-white hover:bg-[oklch(0.78_0.22_48)] transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer group-hover:scale-[1.02]"
                >
                  <span>Personalizar Post</span>
                  <ArrowRight size={14} />
                </button>
                <span className="mt-1.5 text-[9px] font-mono uppercase tracking-wider text-white/30">
                  clique no card para editar
                </span>
              </div>
            );
          })}
        </div>

        {/* Botão para Gerar Mais 3 Opções */}
        {onGenerateMore && (
          <div className="mt-10 mb-6">
            <button
              type="button"
              onClick={onGenerateMore}
              disabled={isGeneratingMore}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white/6 hover:bg-white/10 text-xs font-semibold text-white border border-white/10 transition-all cursor-pointer hover:border-white/20"
            >
              <RefreshCw size={13} className={isGeneratingMore ? "animate-spin text-[oklch(0.78_0.22_48)]" : ""} />
              <span>{isGeneratingMore ? "Sintetizando novas ideias..." : "Gerar mais 3 Direções de Arte"}</span>
            </button>
          </div>
        )}
      </main>
    </div>
    </>
  );
}
