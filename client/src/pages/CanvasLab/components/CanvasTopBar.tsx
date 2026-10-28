import {
  AlertCircle,
  ArrowDownToLine,
  ArrowLeft,
  BookmarkCheck,
  Check,
  FileArchive,
  Loader2,
  MoreHorizontal,
  Plus,
  Redo2,
  RotateCcw,
  Undo2,
  SlidersHorizontal,
  Copy,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import UserTopMenu from "@/components/UserTopMenu";
import type { AspectRatioType } from "./types";
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
  onReplicate?: () => void;
  onTechnical?: () => void;
  onCanvasTools?: () => void;
  onSaveCopy?: () => void;
}

const iconButton =
  "grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl text-white/80 hover:bg-white/10 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-orange-300";
const menuClass =
  "[&_[role=menuitem]]:min-h-11 [&_[role=menuitemcheckbox]]:min-h-11 w-64 border-white/15 bg-[#10141D] text-white";

export default function CanvasTopBar({
  onExportPng,
  onExportZip,
  onBackToGallery,
  isExportingZip = false,
  slideCount = 1,
  onAddSlide,
  onRestart,
  onSave,
  onSaveCopy,
  isSaving = false,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  autoSaveState = "idle",
  lastSavedAt,
  isAutoSaveEnabled = false,
  onAutoSaveChange,
  onTechnical,
  onCanvasTools,
}: CanvasTopBarProps) {
  const saveStatus =
    autoSaveState === "saving" || isSaving
      ? "Salvando…"
      : autoSaveState === "saved"
        ? "Alterações salvas"
        : autoSaveState === "dirty"
          ? "Alterações não salvas"
          : autoSaveState === "error"
            ? "Não foi possível salvar"
            : "";
  return (
    <header className="z-30 flex h-14 w-full shrink-0 items-center justify-between gap-1 border-b border-white/10 bg-[#0a0d16] px-1 sm:px-3">
      <div className="flex min-w-0 items-center gap-1 sm:gap-3">
        {onBackToGallery && (
          <button
            type="button"
            className={iconButton}
            onClick={onBackToGallery}
            aria-label="Voltar para a galeria"
            title="Voltar para a galeria"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <div
          className="hidden shrink-0 text-sm font-bold sm:block"
          aria-label="PostSpark Studio"
        >
          <span className="mr-2 text-orange-400">✦</span>PostSpark
        </div>
        <div
          className="flex shrink-0 items-center"
          role="group"
          aria-label="Histórico de edição"
        >
          <button
            type="button"
            className={iconButton}
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Desfazer"
            title="Desfazer (Ctrl+Z)"
          >
            <Undo2 size={18} />
          </button>
          <button
            type="button"
            className={iconButton}
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Refazer"
            title="Refazer (Ctrl+Shift+Z)"
          >
            <Redo2 size={18} />
          </button>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {saveStatus && (
          <span
            role="status"
            aria-label={saveStatus}
            title={
              lastSavedAt
                ? `${saveStatus} · ${lastSavedAt.toLocaleTimeString("pt-BR")}`
                : saveStatus
            }
            className="flex items-center gap-1 text-xs text-white/60"
          >
            {autoSaveState === "saving" || isSaving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : autoSaveState === "saved" ? (
              <Check size={14} className="text-emerald-400" />
            ) : autoSaveState === "error" ? (
              <AlertCircle size={16} className="text-red-400" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            )}
            <span className="hidden lg:inline">{saveStatus}</span>
          </span>
        )}
        {onSave && (
          <button
            type="button"
            className={`${iconButton} hidden gap-1 border border-white/15 px-3 md:flex`}
            onClick={onSave}
            disabled={isSaving}
            aria-label={isSaving ? "Salvando post" : "Salvar post"}
          >
            <BookmarkCheck size={16} />
            <span className="text-xs">Salvar</span>
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-h-11 items-center gap-1 rounded-xl bg-orange-400 px-3 text-xs font-bold text-black hover:bg-orange-300"
              aria-label="Baixar post"
            >
              <ArrowDownToLine size={16} />
              Baixar
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={menuClass}>
            <DropdownMenuLabel>Baixar a arte</DropdownMenuLabel>
            <DropdownMenuItem onSelect={onExportPng}>
              <ArrowDownToLine />
              Imagem do slide atual · PNG 4K
            </DropdownMenuItem>
            {slideCount > 1 && (
              <DropdownMenuItem
                onSelect={onExportZip}
                disabled={isExportingZip}
              >
                <FileArchive />
                {isExportingZip
                  ? "Preparando arquivos…"
                  : "Todos os slides · ZIP"}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={iconButton}
              aria-label="Mais ações do editor"
            >
              <MoreHorizontal size={18} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={menuClass}>
            {onSave && (
              <DropdownMenuItem onSelect={onSave}>
                <BookmarkCheck />
                Salvar post
              </DropdownMenuItem>
            )}
            {onSaveCopy && (
              <DropdownMenuItem onSelect={onSaveCopy}>
                <Copy />
                Salvar uma cópia
              </DropdownMenuItem>
            )}
            {onSave && onAutoSaveChange && (
              <DropdownMenuCheckboxItem
                checked={isAutoSaveEnabled}
                onCheckedChange={value => onAutoSaveChange(value === true)}
              >
                Salvamento automático
              </DropdownMenuCheckboxItem>
            )}
            {onAddSlide && (
              <DropdownMenuItem onSelect={onAddSlide}>
                <Plus />
                {slideCount === 1
                  ? "Adicionar slide e criar carrossel"
                  : "Adicionar slide"}
              </DropdownMenuItem>
            )}
            {onCanvasTools && (
              <DropdownMenuItem onSelect={onCanvasTools}>
                <SlidersHorizontal />
                Formato e zoom
              </DropdownMenuItem>
            )}
            {onTechnical && (
              <DropdownMenuItem onSelect={onTechnical}>
                <SlidersHorizontal />
                Ferramentas avançadas
              </DropdownMenuItem>
            )}
            {onRestart && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onRestart} variant="destructive">
                  <RotateCcw />
                  Recomeçar
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <UserTopMenu variant="inline" compactMobile />
      </div>
    </header>
  );
}
