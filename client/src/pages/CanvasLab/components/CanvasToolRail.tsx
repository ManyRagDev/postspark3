import { generationAspectRatios } from "@shared/aspectRatios";
import { Magnet, ZoomIn, ZoomOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ASPECT_RATIO_CAPTIONS, type AspectRatioType } from "./types";

interface CanvasToolRailProps {
  aspectRatio: AspectRatioType;
  onAspectRatioChange: (ratio: AspectRatioType) => void;
  isSnapEnabled: boolean;
  onToggleSnap: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

const toolButton =
  "flex h-11 w-11 items-center justify-center rounded-xl text-white/75 transition-colors hover:bg-white/12 hover:text-white focus-visible:outline-2 focus-visible:outline-orange-400";

export default function CanvasToolRail({
  aspectRatio,
  onAspectRatioChange,
  isSnapEnabled,
  onToggleSnap,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: CanvasToolRailProps) {
  return (
    <nav
      aria-label="Ferramentas da prancheta"
      className="z-20 flex min-h-12 shrink-0 items-center justify-center gap-1 border-b border-white/10 bg-[#10141D] px-2"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-12 w-11 flex-col items-center justify-center gap-0.5 rounded-xl border border-white/10 bg-white/5 text-white/75 transition-colors hover:bg-white/12 hover:text-white focus-visible:outline-2 focus-visible:outline-orange-400"
            aria-label={`Formato: ${aspectRatio}`}
            title={`Formato: ${aspectRatio}`}
          >
            <span className="text-xs font-bold leading-none text-white">
              {aspectRatio}
            </span>
            <span className="text-[10px] font-medium leading-none">
              Formato
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="bottom"
          className="w-56 border-white/15 bg-[#10141D] text-white"
        >
          <DropdownMenuLabel>Formato</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={aspectRatio}
            onValueChange={value =>
              onAspectRatioChange(value as AspectRatioType)
            }
          >
            {generationAspectRatios.map(id => (
              <DropdownMenuRadioItem key={id} value={id}>
                {id} · {ASPECT_RATIO_CAPTIONS[id].caption}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        onClick={onToggleSnap}
        className={`${toolButton} ${isSnapEnabled ? "bg-sky-400/15 text-sky-300" : ""}`}
        aria-label={isSnapEnabled ? "Desativar ímã" : "Ativar ímã"}
        aria-pressed={isSnapEnabled}
        title="Ímã de alinhamento"
      >
        <Magnet size={19} />
      </button>
      <span className="mx-1 h-6 w-px bg-white/10" aria-hidden="true" />
      <button
        type="button"
        onClick={onZoomIn}
        className={toolButton}
        aria-label="Aumentar zoom"
        title="Aumentar zoom"
      >
        <ZoomIn size={19} />
      </button>
      <button
        type="button"
        onClick={onResetZoom}
        className="flex min-h-11 min-w-24 px-2 items-center justify-center rounded-lg text-[11px] font-semibold text-white/65 hover:bg-white/10 hover:text-white"
        aria-label={`Ajustar à tela. Zoom ${Math.round(zoom * 100)}%`}
        title="Ajustar à tela"
      >
        Ajustar · {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        className={toolButton}
        aria-label="Diminuir zoom"
        title="Diminuir zoom"
      >
        <ZoomOut size={19} />
      </button>
    </nav>
  );
}
