import {
  AlertCircle,
  ArrowDownToLine,
  ArrowLeft,
  BookmarkCheck,
  Check,
  FileArchive,
  Loader2,
  Magnet,
  MoreHorizontal,
  Plus,
  Redo2,
  RotateCcw,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import UserTopMenu from "@/components/UserTopMenu";
import { ASPECT_RATIO_CAPTIONS, type AspectRatioType } from "./types";
import type { AutoSaveState } from "../lib/autoSaveManager";

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
  onAddSlide?: () => void;
  onRestart?: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  autoSaveState?: AutoSaveState;
  lastSavedAt?: Date | null;
  isAutoSaveEnabled?: boolean;
  onAutoSaveChange?: (enabled: boolean) => void;
}

const iconButton =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/75 transition-colors hover:bg-white/12 hover:text-white disabled:cursor-not-allowed disabled:opacity-35 sm:h-10 sm:w-10";

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
  onAddSlide,
  onRestart,
  onSave,
  isSaving = false,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  autoSaveState = "idle",
  lastSavedAt,
  isAutoSaveEnabled = false,
  onAutoSaveChange,
}: CanvasTopBarProps) {
  const saveStatus =
    autoSaveState === "saving"
      ? "Salvando automaticamente"
      : autoSaveState === "saved"
        ? "Alterações salvas"
        : autoSaveState === "dirty"
          ? "Alterações não salvas"
          : autoSaveState === "error"
            ? "Erro no salvamento automático"
            : "";

  return (
    <header className="relative z-30 flex h-14 w-full shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#0a0d16]/95 px-2 backdrop-blur-xl sm:px-4 xl:px-5">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <div
          className="flex shrink-0 items-center gap-1.5"
          aria-label="PostSpark Studio"
        >
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-orange-400/35 bg-orange-500/10 text-lg text-orange-400 shadow-[0_0_18px_rgba(255,92,0,0.15)]"
            aria-hidden="true"
          >
            ✦
          </span>
          <div className="hidden leading-none sm:block">
            <span className="block bg-gradient-to-r from-white via-white to-orange-300 bg-clip-text text-sm font-black tracking-tight text-transparent">
              PostSpark
            </span>
            <span className="mt-0.5 block text-[9px] font-bold tracking-[0.24em] text-orange-400">
              STUDIO
            </span>
          </div>
          <span className="hidden text-[10px] font-black tracking-[0.12em] text-orange-200 min-[380px]:inline sm:hidden">
            STUDIO
          </span>
        </div>
        {onBackToGallery && (
          <button
            type="button"
            onClick={onBackToGallery}
            className={`${iconButton} sm:hidden`}
            aria-label="Voltar para a galeria"
            title="Voltar para a galeria"
          >
            <ArrowLeft size={17} />
          </button>
        )}
        {onUndo && (
          <div
            className="flex shrink-0 items-center gap-1 rounded-xl border border-orange-400/20 bg-orange-400/[0.06] p-0.5"
            role="group"
            aria-label="Histórico de edição"
          >
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="flex h-8 w-8 items-center justify-center gap-1.5 rounded-lg text-white transition-colors hover:bg-orange-400/15 disabled:text-white/35 sm:h-9 sm:w-9 xl:w-auto xl:px-2.5"
              aria-label="Desfazer"
              title="Desfazer (Ctrl+Z / Cmd+Z)"
            >
              <Undo2 size={17} />
              <span className="hidden text-xs font-semibold xl:inline">
                Desfazer
              </span>
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className="flex h-8 w-8 items-center justify-center gap-1.5 rounded-lg text-white transition-colors hover:bg-orange-400/15 disabled:text-white/35 sm:h-9 sm:w-9 xl:w-auto xl:px-2.5"
              aria-label="Refazer"
              title="Refazer"
            >
              <Redo2 size={17} />
              <span className="hidden text-xs font-semibold xl:inline">
                Refazer
              </span>
            </button>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {onSave && onAutoSaveChange && (
          <label
            className="hidden cursor-pointer items-center gap-1.5 text-[11px] text-white/70 lg:flex"
            title="Salvar automaticamente após alterações"
          >
            <input
              type="checkbox"
              checked={isAutoSaveEnabled}
              onChange={event => onAutoSaveChange(event.target.checked)}
              className="h-4 w-4 cursor-pointer accent-[#FF5C00]"
            />
            <span>Auto-save</span>
          </label>
        )}
        {saveStatus && (
          <span
            className="hidden items-center gap-1.5 text-[11px] text-white/55 xl:flex"
            title={
              lastSavedAt
                ? `Último salvamento: ${lastSavedAt.toLocaleTimeString("pt-BR")}`
                : saveStatus
            }
            role="status"
          >
            {autoSaveState === "saving" ? (
              <Loader2 size={13} className="animate-spin text-sky-400" />
            ) : autoSaveState === "saved" ? (
              <Check size={13} className="text-emerald-400" />
            ) : autoSaveState === "error" ? (
              <AlertCircle size={13} className="text-red-400" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            )}
            <span>{saveStatus}</span>
          </span>
        )}
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="flex h-9 min-w-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-orange-400/35 bg-orange-400/15 px-2 text-orange-100 transition-colors hover:bg-orange-400/25 disabled:opacity-50 sm:h-10 sm:px-3"
            aria-label={isSaving ? "Salvando post" : "Salvar post"}
            title="Salvar este post na sua biblioteca"
          >
            {isSaving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <BookmarkCheck size={16} />
            )}
            <span className="hidden text-xs font-bold sm:inline">
              {isSaving ? "Salvando" : "Salvar"}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={onExportPng}
          className="hidden h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-orange-400 to-orange-600 px-3 text-xs font-bold text-black shadow-[0_0_20px_rgba(255,92,0,0.18)] transition hover:brightness-110 xl:flex"
        >
          <ArrowDownToLine size={15} /> Exportar 4K
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={iconButton}
              aria-label="Mais ações do editor"
              title="Mais ações do editor"
            >
              <MoreHorizontal size={19} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-60 border-white/15 bg-[#10141D] text-white"
          >
            {onBackToGallery && (
              <DropdownMenuItem
                onSelect={onBackToGallery}
                className="hidden sm:flex"
              >
                <ArrowLeft /> Galeria
              </DropdownMenuItem>
            )}
            {onRestart && (
              <DropdownMenuItem onSelect={onRestart} variant="destructive" className="hidden md:flex">
                <RotateCcw /> Recomeçar
              </DropdownMenuItem>
            )}
            {slideCount === 1 && onAddSlide && (
              <DropdownMenuItem onSelect={onAddSlide} className="md:hidden">
                <Plus /> Transformar este post em carrossel
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="bg-white/10" />
            <div className="hidden md:block xl:hidden">
              <DropdownMenuLabel>Formato</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={aspectRatio}
                onValueChange={value =>
                  onAspectRatioChange(value as AspectRatioType)
                }
              >
                {(Object.keys(ASPECT_RATIO_CAPTIONS) as AspectRatioType[]).map(
                  id => (
                    <DropdownMenuRadioItem key={id} value={id}>
                      {id} · {ASPECT_RATIO_CAPTIONS[id].caption}
                    </DropdownMenuRadioItem>
                  )
                )}
              </DropdownMenuRadioGroup>
              {onToggleSnap && (
                <DropdownMenuCheckboxItem
                  checked={isSnapEnabled}
                  onCheckedChange={() => onToggleSnap()}
                >
                  <Magnet /> Ímã de alinhamento
                </DropdownMenuCheckboxItem>
              )}
              <DropdownMenuItem
                onSelect={event => {
                  event.preventDefault();
                  onZoomOut();
                }}
              >
                <ZoomOut /> Diminuir zoom
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onResetZoom}>
                Zoom: {Math.round(zoom * 100)}% · Ajustar para 100%
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={event => {
                  event.preventDefault();
                  onZoomIn();
                }}
              >
                <ZoomIn /> Aumentar zoom
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
            </div>
            {onSave && onAutoSaveChange && (
              <DropdownMenuCheckboxItem
                className="lg:hidden"
                checked={isAutoSaveEnabled}
                onCheckedChange={checked => onAutoSaveChange(checked === true)}
              >
                Salvamento automático
              </DropdownMenuCheckboxItem>
            )}
            <DropdownMenuItem
              onSelect={onExportPng}
              className="hidden md:flex xl:hidden"
            >
              <ArrowDownToLine /> Exportar imagem 4K
            </DropdownMenuItem>
            {slideCount > 1 && (
              <DropdownMenuItem
                onSelect={onExportZip}
                disabled={isExportingZip}
                className="hidden md:flex"
              >
                <FileArchive />{" "}
                {isExportingZip ? "Gerando ZIP" : "Baixar carrossel ZIP"}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <UserTopMenu variant="inline" compactMobile />
      </div>
    </header>
  );
}
