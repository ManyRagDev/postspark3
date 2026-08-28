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
    <header className="h-14 border-b border-white/10 bg-black/60 backdrop-blur-xl px-4 md:px-6 flex items-center justify-between z-30 shrink-0 select-none">
      {/* Lado Esquerdo */}
      <div className="flex items-center gap-3">
        {onBackToGallery && (
          <button
            type="button"
            onClick={onBackToGallery}
            className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-xl border border-white/10 transition-colors cursor-pointer mr-1"
          >
            <ArrowLeft size={13} />
            <span className="hidden sm:inline">Galeria</span>
          </button>
        )}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-widest text-white">PostSpark Studio</span>
        </div>
      </div>

      {/* Centro: Formato & Controles */}
      <div className="flex items-center gap-3">
        <div className="flex items-center bg-white/6 p-1 rounded-xl border border-white/10">
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
                <span className="hidden sm:inline-block">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Botão Ímã (Magnet Snap) */}
        {onToggleSnap && (
          <button
            type="button"
            onClick={onToggleSnap}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
              isSnapEnabled
                ? "bg-[#38bdf8]/15 border-[#38bdf8]/40 text-[#38bdf8]"
                : "bg-white/5 border-white/10 text-white/40 hover:text-white"
            }`}
            title={isSnapEnabled ? "Ímã ativado (Segure Alt para suspender)" : "Ímã desativado"}
          >
            <Magnet size={13} />
            <span className="hidden sm:inline">Ímã</span>
          </button>
        )}

        {/* Paginação do Carrossel */}
        {slideCount > 1 && (
          <div className="flex items-center gap-1.5 bg-white/6 px-2 py-1 rounded-xl border border-white/10 text-xs font-mono text-white/80">
            <button
              type="button"
              onClick={onPrevSlide}
              disabled={currentSlide === 0}
              className="p-1 hover:bg-white/10 rounded disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
            <span>{currentSlide + 1}/{slideCount}</span>
            <button
              type="button"
              onClick={onNextSlide}
              disabled={currentSlide === slideCount - 1}
              className="p-1 hover:bg-white/10 rounded disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Lado Direito: Respiro para o menu de usuário / Sparks */}
      <div className="flex items-center gap-2 sm:gap-3 mr-24 sm:mr-32">
        {/* Zoom */}
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

        {/* Baixar ZIP do Carrossel */}
        {slideCount > 1 && (
          <button
            type="button"
            onClick={onExportZip}
            disabled={isExportingZip}
            className="flex items-center gap-1.5 rounded-xl py-2 px-3 text-xs font-semibold bg-white/10 hover:bg-white/15 text-white border border-white/10 cursor-pointer transition-all"
            title="Baixar todos os slides em arquivo .zip"
          >
            <FileArchive size={14} className="text-white/80" />
            <span className="hidden sm:inline-block">{isExportingZip ? "Gerando ZIP..." : "Baixar ZIP"}</span>
          </button>
        )}

        {/* Exportar Slide 4K */}
        <button
          type="button"
          onClick={onExportPng}
          className="group flex items-center gap-2 rounded-xl py-2 px-4 text-xs font-bold text-black shadow-lg transition-all hover:scale-105 hover:brightness-110 active:scale-95 cursor-pointer"
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
