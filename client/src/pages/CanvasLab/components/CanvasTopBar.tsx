import { ArrowDownToLine, ArrowLeft, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, FileArchive, Layers, Loader2, Magnet, RotateCcw, Smartphone, Square, ZoomIn, ZoomOut } from "lucide-react";
import type { AspectRatioType } from "./types";
import { ASPECT_RATIO_CAPTIONS } from "./types";
import UserTopMenu from "@/components/UserTopMenu";

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
  /** Item 6: recomeçar do zero (com confirmação controlada pelo pai). */
  onRestart?: () => void;
  /** Item 7: abrir o fluxo de salvamento. */
  onSave?: () => void;
  isSaving?: boolean;
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
  onRestart,
  onSave,
  isSaving = false,
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
        {onRestart && (
          <button
            type="button"
            onClick={onRestart}
            className="flex items-center justify-center w-8 h-8 md:w-auto md:h-auto md:gap-1.5 text-xs text-white/70 hover:text-white bg-white/6 hover:bg-white/12 md:px-3 md:py-1.5 rounded-xl border border-white/10 transition-all cursor-pointer active:scale-95"
            title="Recomeçar do zero (novas direções de arte)"
          >
            <RotateCcw size={14} />
            <span className="hidden md:inline font-medium">Recomeçar</span>
          </button>
        )}
        <div className="hidden sm:flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-widest text-white">PostSpark Studio</span>
        </div>
      </div>

      {/* ─── CENTRO: SELETOR DE PROPORÇÃO CLARO & CONTROLES ─── */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Seletor de Formato Desktop (com Ícones e Labels — item 8) */}
        <div className="hidden md:flex items-center bg-white/6 p-1 rounded-xl border border-white/10">
          {(Object.keys(ASPECT_RATIO_CAPTIONS) as AspectRatioType[]).map((id) => {
            const cap = ASPECT_RATIO_CAPTIONS[id];
            const Icon = id === "9:16" ? Smartphone : id === "5:6" ? Layers : Square;
            const isSelected = aspectRatio === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onAspectRatioChange(id)}
                aria-label={`Formato ${cap.short} ${cap.caption}`}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? "bg-white text-black shadow-sm"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon size={13} />
                <span>{cap.short} {cap.caption}</span>
              </button>
            );
          })}
        </div>

        {/* Seletor de Formato Mobile (ratio + legenda, item 8) */}
        <div className="md:hidden flex items-center bg-white/8 p-0.5 rounded-xl border border-white/12">
          {(Object.keys(ASPECT_RATIO_CAPTIONS) as AspectRatioType[]).map((id) => {
            const cap = ASPECT_RATIO_CAPTIONS[id];
            const isSelected = aspectRatio === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onAspectRatioChange(id)}
                aria-label={`Formato ${cap.short} ${cap.caption}`}
                className={`flex flex-col items-center px-2.5 py-1 rounded-lg transition-all ${
                  isSelected ? "bg-white text-black shadow-sm" : "text-white/50 hover:text-white"
                }`}
              >
                <span className="text-xs font-mono font-bold leading-none">{cap.short}</span>
                <span className="text-[7.5px] font-semibold uppercase tracking-wider mt-0.5 opacity-80">
                  {cap.caption}
                </span>
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
        {/* Salvar no banco (item 7) */}
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center justify-center w-8 h-8 md:w-auto md:h-auto md:gap-1.5 text-xs font-bold text-white bg-white/8 hover:bg-white/14 border border-white/12 md:px-3 md:py-2 rounded-xl transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            title="Salvar este post na sua biblioteca"
          >
            {isSaving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <BookmarkCheck size={14} />
            )}
            <span className="hidden md:inline">{isSaving ? "Salvando..." : "Salvar"}</span>
          </button>
        )}

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

        {/* Menu do Usuário (Sparks, Perfil, Salvos, Configurações) */}
        <div className="h-5 w-[1px] bg-white/12 hidden sm:block mx-1" />
        <UserTopMenu variant="inline" />
      </div>
    </header>
  );
}
