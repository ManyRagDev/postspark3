import { ArrowDownToLine, FileArchive, Loader2, Magnet, Plus, Ratio, RotateCcw, ZoomIn } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { ASPECT_RATIO_CAPTIONS, type AspectRatioType } from "./types";

interface CanvasMobileQuickActionsProps {
  aspectRatio: AspectRatioType;
  onAspectRatioChange: (ratio: AspectRatioType) => void;
  slideCount: number;
  onAddSlide: () => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onZoomScrubChange: (scrubbing: boolean) => void;
  onResetZoom: () => void;
  isSnapEnabled: boolean;
  onToggleSnap: () => void;
  onRestart?: () => void;
  onExportPng: () => void;
  onExportZip: () => void;
  isExportingZip: boolean;
}

const actionClass =
  "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white min-[360px]:text-[10px]";

export default function CanvasMobileQuickActions({
  aspectRatio,
  onAspectRatioChange,
  slideCount,
  onAddSlide,
  zoom,
  onZoomChange,
  onZoomScrubChange,
  onResetZoom,
  isSnapEnabled,
  onToggleSnap,
  onRestart,
  onExportPng,
  onExportZip,
  isExportingZip,
}: CanvasMobileQuickActionsProps) {
  return (
    <nav aria-label="Ações da prancheta" className="flex h-16 shrink-0 items-center px-2 md:hidden">
      <div className={`grid h-12 w-full ${onRestart ? "grid-cols-6" : "grid-cols-5"} gap-0.5 rounded-2xl border border-white/12 bg-[#10141D]/95 p-0.5 shadow-[0_10px_25px_rgba(0,0,0,0.25)]`}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={actionClass} aria-label={`Formato: ${aspectRatio}`}>
              <span className="flex items-center gap-0.5"><Ratio size={15} /><span className="text-[9px]">{aspectRatio}</span></span>
              <span>Formato</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52 border-white/15 bg-[#10141D] text-white">
            <DropdownMenuLabel>Formato deste post</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={aspectRatio} onValueChange={value => onAspectRatioChange(value as AspectRatioType)}>
              {(Object.keys(ASPECT_RATIO_CAPTIONS) as AspectRatioType[]).map(id => (
                <DropdownMenuRadioItem key={id} value={id}>{id} · {ASPECT_RATIO_CAPTIONS[id].caption}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          onClick={onAddSlide}
          className={actionClass}
          aria-label={slideCount === 1 ? "Adicionar segundo slide a este post e transformá-lo em carrossel" : "Adicionar slide a este carrossel"}
        >
          <Plus size={16} />
          <span className="whitespace-nowrap">{slideCount === 1 ? "+ 2º slide" : "+ Slide"}</span>
        </button>

        <Popover onOpenChange={open => { if (!open) onZoomScrubChange(false); }}>
          <PopoverTrigger asChild>
            <button type="button" className={actionClass} aria-label={`Zoom: ${Math.round(zoom * 100)}%`} aria-haspopup="dialog">
              <ZoomIn size={16} />
              <span>Zoom<span className="hidden min-[390px]:inline"> {Math.round(zoom * 100)}%</span></span>
            </button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="center" sideOffset={8} collisionPadding={12} className="w-[min(18rem,calc(100vw-24px))] rounded-2xl border-white/15 bg-[#10141D] p-4 text-white shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <span id="canvas-mobile-zoom-label" className="text-xs font-semibold">Zoom da prancheta</span>
              <output className="min-w-12 text-right text-sm font-bold text-orange-300">{Math.round(zoom * 100)}%</output>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-white/50">60%</span>
              <Slider
                aria-labelledby="canvas-mobile-zoom-label"
                min={60}
                max={180}
                step={5}
                value={[Math.round(zoom * 100)]}
                onValueChange={values => onZoomChange(values[0] / 100)}
                onValueCommit={() => onZoomScrubChange(false)}
                onPointerDownCapture={() => onZoomScrubChange(true)}
                onPointerUpCapture={() => onZoomScrubChange(false)}
                onPointerCancelCapture={() => onZoomScrubChange(false)}
                className="h-11 flex-1 [&_[data-slot=slider-track]]:h-2 [&_[data-slot=slider-track]]:bg-white/15 [&_[data-slot=slider-range]]:bg-orange-400 [&_[data-slot=slider-thumb]]:size-6 [&_[data-slot=slider-thumb]]:border-orange-400"
              />
              <span className="text-[10px] text-white/50">180%</span>
            </div>
            <button type="button" onClick={onResetZoom} disabled={zoom === 1} className="mt-3 min-h-10 w-full rounded-xl bg-white/10 text-xs font-semibold text-white disabled:opacity-40">Restaurar 100%</button>
          </PopoverContent>
        </Popover>

        <button
          type="button"
          onClick={onToggleSnap}
          className={`${actionClass} ${isSnapEnabled ? "bg-sky-400/15 text-sky-200" : ""}`}
          aria-label={isSnapEnabled ? "Desativar ímã de alinhamento" : "Ativar ímã de alinhamento"}
          aria-pressed={isSnapEnabled}
        >
          <Magnet size={16} />
          <span>Ímã</span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={`${actionClass} text-orange-200`} aria-label="Baixar post" title="Baixar post">
              <ArrowDownToLine size={16} />
              <span>Baixar</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60 border-white/15 bg-[#10141D] text-white">
            <DropdownMenuLabel>Download do post</DropdownMenuLabel>
            <DropdownMenuItem onSelect={onExportPng}>
              <ArrowDownToLine /> Baixar imagem 4K
            </DropdownMenuItem>
            {slideCount > 1 && (
              <DropdownMenuItem onSelect={onExportZip} disabled={isExportingZip}>
                {isExportingZip ? <Loader2 className="animate-spin" /> : <FileArchive />}
                {isExportingZip ? "Gerando carrossel…" : "Baixar carrossel ZIP"}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {onRestart && (
          <button
            type="button"
            onClick={onRestart}
            className={`${actionClass} text-red-300/80 hover:bg-red-500/10 hover:text-red-200`}
            aria-label="Recomeçar do zero"
          >
            <RotateCcw size={16} />
            <span className="max-w-full truncate">Recomeçar</span>
          </button>
        )}
      </div>
    </nav>
  );
}
