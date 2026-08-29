import { ArrowDownToLine, ArrowLeft, ChevronLeft, ChevronRight, FileArchive, Layers, Magnet, Smartphone, Square, ZoomIn, ZoomOut } from "lucide-react";
import type { AspectRatioType } from "./types";

interface CanvasTopBarProps {
  aspectRatio: AspectRatioType;
  onAspectRatioChange: (ratio: AspectRatioType) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onExportPng: () => void;
  onExportZip: () => void;
  onBackToGallery?: () => void;
  isSnapEnabled?: boolean;
  onToggleSnap?: () => void;
  isExportingZip?: boolean;
  slideCount?: number;
  currentSlide?: number;
  onPrevSlide?: () => void;
  onNextSlide?: () => void;
}

export default function CanvasTopBar({
  aspectRatio,
  onAspectRatioChange,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onExportPng,
  onExportZip,
  onBackToGallery,
  isSnapEnabled = true,
  onToggleSnap,
  isExportingZip = false,
  slideCount = 1,
  currentSlide = 0,
  onPrevSlide,
  onNextSlide,
}: CanvasTopBarProps) {
  return (
    <header className="h-14 border-b border-white/10 bg-black/70 backdrop-blur-xl px-3 md:px-6 flex items-center justify-between z-30 shrink-0 select-none">
      {/* ─── LADO ESQUERDO ─── */}
      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        {onBackToGallery && (
          <button
            type="button"
            onClick={onBackToGallery}
            className="flex items-center justify-center w-8 h-8 md:w-auto md:h-auto md:gap-1.5 text-xs text-white/70 hover:text-white bg-white/6 hover:bg-white/12 md:px-3 md:py-1.5 rounded-xl border border-white/10 transition-all cursor-pointer active:scale-95"
            title="Voltar para a Galeria"
          >
            <ArrowLeft size={14} />
            <span className="hidden md:inline font-medium">Galeria</span>
          </button>
        )}
        <div className="hidden sm:flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-widest text-white">PostSpark Studio</span>
        </div>
      </div>

      {/* ─── CENTRO: SELETOR DE PROPORÇÃO CLARO & CONTROLES ─── */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Seletor de Formato Desktop (com Ícones e Labels) */}
        <div className="hidden md:flex items-center bg-white/6 p-1 rounded-xl border border-white/10">
          {[
            { id: "1:1", label: "1:1 Feed", icon: Square },
            { id: "5:6", label: "5:6 Retrato", icon: Layers },
            { id: "9:16", label: "9:16 Stories", icon: Smartphone },
          ].map((item) => {
            const Icon = item.icon;
            const isSelected = aspectRatio === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onAspectRatioChange(item.id as AspectRatioType)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? "bg-white text-black shadow-sm"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon size={13} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Seletor de Formato Mobile (Identificação Clara em Texto: 1:1 | 5:6 | 9:16) */}
        <div className="md:hidden flex items-center bg-white/8 p-0.5 rounded-xl border border-white/12">
          {[
            { id: "1:1", label: "1:1" },
            { id: "5:6", label: "5:6" },
            { id: "9:16", label: "9:16" },
          ].map((item) => {
            const isSelected = aspectRatio === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onAspectRatioChange(item.id as AspectRatioType)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                  isSelected
                    ? "bg-white text-black shadow-sm"
                    : "text-white/50 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Botão Ímã (Magnet Snap) */}
        {onToggleSnap && (
          <button
            type="button"
            onClick={onToggleSnap}
            className={`flex items-center gap-1.5 px-2 py-1.5 md:px-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
              isSnapEnabled
                ? "bg-[#38bdf8]/15 border-[#38bdf8]/40 text-[#38bdf8]"
                : "bg-white/5 border-white/10 text-white/40 hover:text-white"
            }`}
            title={isSnapEnabled ? "Ímã ativado" : "Ímã desativado"}
          >
            <Magnet size={13} />
            <span className="hidden md:inline">Ímã</span>
          </button>
        )}

        {/* Paginação do Carrossel */}
        {slideCount > 1 && (
          <div className="flex items-center gap-1 bg-white/6 px-1.5 py-1 rounded-xl border border-white/10 text-xs font-mono text-white/80">
            <button
              type="button"
              onClick={onPrevSlide}
              disabled={currentSlide === 0}
              className="p-1 hover:bg-white/10 rounded disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-[11px]">{currentSlide + 1}/{slideCount}</span>
            <button
              type="button"
              onClick={onNextSlide}
              disabled={currentSlide === slideCount - 1}
              className="p-1 hover:bg-white/10 rounded disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>

      {/* ─── LADO DIREITO (DESKTOP: BOTÕES COMPLETOS) ─── */}
      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        {/* Zoom (Apenas Desktop) */}
        <div className="hidden md:flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/8 text-xs text-white/60">
          <button
            type="button"
            onClick={onZoomOut}
            className="p-1 hover:bg-white/10 hover:text-white rounded cursor-pointer"
            title="Diminuir Zoom"
          >
            <ZoomOut size={13} />
          </button>
          <button
            type="button"
            onClick={onResetZoom}
            className="px-1.5 font-mono text-[11px] hover:text-white cursor-pointer"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            className="p-1 hover:bg-white/10 hover:text-white rounded cursor-pointer"
            title="Aumentar Zoom"
          >
            <ZoomIn size={13} />
          </button>
        </div>

        {/* Baixar ZIP do Carrossel (Desktop) */}
        {slideCount > 1 && (
          <button
            type="button"
            onClick={onExportZip}
            disabled={isExportingZip}
            className="hidden md:flex items-center gap-1.5 rounded-xl py-2 px-3 text-xs font-semibold bg-white/10 hover:bg-white/15 text-white border border-white/10 cursor-pointer transition-all"
            title="Baixar todos os slides em arquivo .zip"
          >
            <FileArchive size={14} className="text-white/80" />
            <span>{isExportingZip ? "Gerando ZIP..." : "Baixar ZIP"}</span>
          </button>
        )}

        {/* Exportar Slide 4K (Desktop) */}
        <button
          type="button"
          onClick={onExportPng}
          className="hidden md:flex group items-center gap-2 rounded-xl py-2 px-4 text-xs font-bold text-black shadow-lg transition-all hover:scale-105 hover:brightness-110 active:scale-95 cursor-pointer"
          style={{
            background: "linear-gradient(135deg, oklch(0.78 0.22 48), oklch(0.65 0.2 28))",
            boxShadow: "0 0 20px oklch(0.7 0.22 40 / 35%)",
          }}
        >
          <ArrowDownToLine size={14} className="text-black" />
          <span>Exportar 4K</span>
        </button>
      </div>
    </header>
  );
}
