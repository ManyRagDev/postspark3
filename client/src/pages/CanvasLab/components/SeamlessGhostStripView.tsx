import React, { useState } from "react";
import { Check, X, Layers, Sparkles, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { CanvasPostStage } from "./CanvasPostStage";
import type { CanvasPostModel } from "./types";
import type { SeamlessPanoramaMeta } from "../lib/seamlessCarousel";
import { aspectRatioHeight } from "@shared/aspectRatios";

interface SeamlessGhostStripViewProps {
  post: CanvasPostModel;
  panorama: SeamlessPanoramaMeta;
  startOffset: number;
  onOffsetChange: (offset: number) => void;
  onSelectSlide: (index: number) => void;
  onConfirm: () => void;
  onRemovePanorama: () => void;
}

export default function SeamlessGhostStripView({
  post,
  panorama,
  startOffset,
  onOffsetChange,
  onSelectSlide,
  onConfirm,
  onRemovePanorama,
}: SeamlessGhostStripViewProps) {
  // Nível de transparência dos textos no modo fantasma: 0.2 (muito translúcido), 0.55 (padrão fantasma), 0.95 (quase opaco)
  const [ghostOpacity, setGhostOpacity] = useState<number>(0.55);

  const baseWidth = 360;
  const baseHeight = aspectRatioHeight(post.aspectRatio);

  const totalPostSlides = post.slides.length;
  const panoSlideCount = panorama.slideCount;

  // Escala para caber confortavelmente no viewport
  // A fileira tem N slides de 360px de largura
  const totalSlidesToRender = Math.max(totalPostSlides, panoSlideCount);

  // Escala fixa do preview dos cards na fileira
  const cardScale = 0.65;
  const cardWidth = baseWidth * cardScale;
  const cardHeight = baseHeight * cardScale;

  return (
    <div className="absolute inset-0 z-40 bg-[#06080F]/95 backdrop-blur-2xl flex flex-col overflow-hidden select-none animate-in fade-in duration-200">
      {/* ─── BARRA FLUTUANTE SUPERIOR (HUD DE COMANDO) ─── */}
      <header className="shrink-0 border-b border-white/10 bg-white/[0.03] px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#FF5C00] to-orange-400 flex items-center justify-center text-white shadow-md shadow-orange-500/20">
            <Sparkles size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white tracking-wide uppercase">
                Modo Fantasma em Fileira
              </span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30">
                {panorama.name} ({panoSlideCount} slides)
              </span>
            </div>
            <p className="text-[11px] text-white/50">
              Inspecione a continuidade do fundo entre as divisas e o posicionamento dos textos sobre a arte.
            </p>
          </div>
        </div>

        {/* CONTROLES CENTRAIS: OPACIDADE FANTASMA & DESLOCAMENTO DA TIRA */}
        <div className="flex items-center gap-3">
          {/* Opacidade Fantasma dos Textos */}
          <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-xl px-2.5 py-1">
            <Eye size={12} className="text-white/40" />
            <span className="text-[10px] font-semibold text-white/60">Fantasma:</span>
            <div className="flex gap-1">
              {[
                { label: "20%", val: 0.2 },
                { label: "55%", val: 0.55 },
                { label: "90%", val: 0.9 },
              ].map(opt => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setGhostOpacity(opt.val)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                    ghostOpacity === opt.val
                      ? "bg-white text-black shadow-sm"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Deslocamento da tira (se carrossel tiver tamanho diferente do panorama) */}
          {totalPostSlides !== panoSlideCount && (
            <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-xl px-2 py-1">
              <span className="text-[10px] text-white/60 font-semibold mr-1">Deslocar:</span>
              <button
                type="button"
                disabled={startOffset <= -(panoSlideCount - 1)}
                onClick={() => onOffsetChange(startOffset - 1)}
                className="p-1 rounded hover:bg-white/10 disabled:opacity-30 text-white cursor-pointer"
                title="Deslocar panorama para a esquerda"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-[10px] font-mono text-orange-300 px-1 font-bold">
                {startOffset > 0 ? `+${startOffset}` : startOffset}
              </span>
              <button
                type="button"
                disabled={startOffset >= totalPostSlides - 1}
                onClick={() => onOffsetChange(startOffset + 1)}
                className="p-1 rounded hover:bg-white/10 disabled:opacity-30 text-white cursor-pointer"
                title="Deslocar panorama para a direita"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        {/* BOTÕES DE AÇÃO: REMOVER PANORAMA OU CONCLUIR */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRemovePanorama}
            className="px-3 py-1.5 rounded-xl border border-white/12 hover:bg-white/10 text-white/70 hover:text-white text-xs font-semibold transition-all cursor-pointer"
          >
            Remover panorama
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-[#FF5C00] to-orange-400 hover:brightness-110 text-white text-xs font-bold shadow-md shadow-orange-500/25 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Check size={14} strokeWidth={2.5} />
            <span>OK, Voltar para Edição</span>
          </button>
        </div>
      </header>

      {/* ─── CORPO CENTRAL: FILEIRA CONTÍNUA PANORÂMICA (SCROLL HORIZONTAL) ─── */}
      <main className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden flex items-center justify-start p-6 md:p-12 custom-scrollbar">
        <div className="mx-auto flex items-center">
          {post.slides.map((slide, index) => {
            const isSelected = post.currentSlideIndex === index;
            const panoIndex = index - startOffset;
            const isCoveredByPanorama = panoIndex >= 0 && panoIndex < panoSlideCount;

            return (
              <div
                key={slide.id}
                onClick={() => onSelectSlide(index)}
                style={{
                  width: cardWidth,
                  height: cardHeight + 42,
                }}
                className={`relative shrink-0 flex flex-col group transition-all cursor-pointer ${
                  isSelected ? "z-20 scale-[1.02]" : "z-10 opacity-90 hover:opacity-100"
                }`}
              >
                {/* CABEÇALHO DO SLIDE NA FILEIRA */}
                <div className="h-7 mb-2 flex items-center justify-between px-2 text-[10px] font-mono border-b border-white/10">
                  <span className="font-bold text-white">
                    SLIDE {String(index + 1).padStart(2, "0")}
                  </span>
                  {isCoveredByPanorama ? (
                    <span className="text-[9px] text-orange-400 font-semibold">
                      Fatia {panoIndex + 1}/{panoSlideCount}
                    </span>
                  ) : (
                    <span className="text-[9px] text-amber-300 font-semibold">
                      Sem fundo
                    </span>
                  )}
                </div>

                {/* PRANCHETA KONVA COM OPACIDADE FANTASMA */}
                <div
                  style={{
                    width: cardWidth,
                    height: cardHeight,
                  }}
                  className={`relative overflow-hidden transition-all shadow-2xl ${
                    isSelected
                      ? "ring-2 ring-orange-500 shadow-orange-500/20"
                      : "border-y border-white/15"
                  }`}
                >
                  {/* Linha vertical tracejada de divisa do corte no Instagram à direita */}
                  {index < totalPostSlides - 1 && (
                    <div className="absolute right-0 inset-y-0 w-px border-r-2 border-dashed border-white/60 z-30 pointer-events-none drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
                  )}

                  {/* Renderização determinística do slide */}
                  <div
                    style={{
                      width: baseWidth,
                      height: baseHeight,
                      transform: `scale(${cardScale})`,
                      transformOrigin: "top left",
                      opacity: ghostOpacity,
                    }}
                    className="pointer-events-none transition-opacity duration-200"
                  >
                    <CanvasPostStage
                      post={{ ...post, currentSlideIndex: index }}
                      zoom={1}
                      isReadOnly
                    />
                  </div>

                  {/* Fundo da arte em 100% de nitidez por trás para permitir inspecionar o corte */}
                  <div className="absolute inset-0 pointer-events-none border border-white/5" />
                </div>

                {/* Status inferior */}
                <div className="mt-1 text-center text-[9px] font-mono text-white/40">
                  {isSelected ? "● Slide selecionado" : "Clique para focar"}
                </div>
              </div>
            );
          })}

          {/* SE O PANORAMA FOR MAIOR QUE O CARROSSEL (M < N): MOSTRA VISUALMENTE A FATIA CORTADA */}
          {panoSlideCount > totalPostSlides && (
            <div
              style={{
                width: (panoSlideCount - totalPostSlides) * cardWidth,
                height: cardHeight + 42,
              }}
              className="shrink-0 flex flex-col justify-end opacity-40 ml-2"
            >
              <div className="h-7 mb-2 flex items-center justify-between px-2 text-[10px] font-mono border-b border-white/10 text-white/50">
                <span>SOBRA DO PANORAMA</span>
                <span>{panoSlideCount - totalPostSlides} FATIA(S)</span>
              </div>
              <div
                style={{ height: cardHeight }}
                className="w-full border-2 border-dashed border-white/20 rounded-xl flex flex-col items-center justify-center p-4 text-center bg-black/40"
              >
                <Layers size={24} className="text-white/40 mb-2" />
                <span className="text-xs font-bold text-white/70">Área Cortada Naturalmente</span>
                <p className="text-[10px] text-white/40 max-w-[200px] mt-1">
                  O panorama tem {panoSlideCount} slides, mas seu carrossel tem {totalPostSlides}. O excedente é cortado sem problemas.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ─── RODAPÉ DO MODO FANTASMA ─── */}
      <footer className="shrink-0 border-t border-white/10 bg-white/[0.02] px-6 py-2.5 flex items-center justify-between text-xs text-white/60">
        <div>
          <span>Dica: Pressione </span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[10px]">Enter</kbd>
          <span> ou </span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[10px]">Esc</kbd>
          <span> para voltar à edição normal a qualquer momento.</span>
        </div>

        <button
          type="button"
          onClick={onConfirm}
          className="text-orange-400 hover:text-orange-300 font-bold underline cursor-pointer"
        >
          Concluir inspeção e editar slide {post.currentSlideIndex + 1}
        </button>
      </footer>
    </div>
  );
}
