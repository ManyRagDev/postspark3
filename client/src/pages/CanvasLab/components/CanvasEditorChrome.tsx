import { useState, type ReactNode } from "react";
import {
  ImagePlus,
  Image as BackgroundIcon,
  Layers3,
  Palette,
  Plus,
  Sparkles,
  X,
  MessageSquareText,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export type CanvasEditorTool =
  | "add"
  | "background"
  | "insert-image"
  | "appearance"
  | "brand"
  | "layers"
  | "caption"
  | "selection"
  | "media";

const tools = [
  { id: "background", label: "Fundo", icon: BackgroundIcon },
  { id: "add", label: "Adicionar", icon: Plus },
  { id: "appearance", label: "Aparência", icon: Palette },
  { id: "brand", label: "Marca", icon: Sparkles },
  { id: "layers", label: "Camadas", icon: Layers3 },
  { id: "caption", label: "Legenda", icon: MessageSquareText },
] as const;

/** The tool is independent from the selection: only an explicit action opens a panel. */
export interface CanvasEditorChromeProps {
  mobile?: boolean;
  mobileViewportHeight?: number;
  isTextEditing?: boolean;
  activeTool: CanvasEditorTool | null;
  onToolChange: (tool: CanvasEditorTool | null) => void;
  contents: Partial<Record<CanvasEditorTool, ReactNode>>;
  selectionLabel?: string;
  selectionActions?: ReactNode;
}

export default function CanvasEditorChrome({
  mobile = false,
  mobileViewportHeight,
  isTextEditing = false,
  activeTool,
  onToolChange,
  contents,
  selectionLabel,
  selectionActions,
}: CanvasEditorChromeProps) {
  const [panelSize, setPanelSize] = useState<"compact" | "normal" | "expanded">("normal");
  const panelHeight = panelSize === "compact" ? 44 : Math.min(
    (mobileViewportHeight || 667) * (panelSize === "expanded" ? 0.68 : 0.4),
    panelSize === "expanded" ? 640 : 420,
  );
  const title =
    activeTool === "selection"
      ? selectionLabel || "Propriedades"
      : activeTool === "media"
        ? "Trocar imagem"
        : activeTool === "insert-image"
          ? "Adicionar imagem"
          : tools.find(tool => tool.id === activeTool)?.label;
  const toggle = (tool: CanvasEditorTool) =>
    onToolChange(activeTool === tool ? null : tool);

  return (
    <div
      className={
        mobile
          ? "z-40 flex shrink-0 flex-col bg-[#151515] pb-[env(safe-area-inset-bottom)] text-white"
          : "flex h-full min-h-0 bg-[#151515] text-white"
      }
    >
      {mobile && (
        <>
          <div
            id="canvas-mobile-text-format-slot"
            className={
              isTextEditing ? "max-h-[35dvh] overflow-y-auto" : "hidden"
            }
          />
          <div
            id="canvas-mobile-text-actions-slot"
            className={isTextEditing ? "min-h-11" : "hidden"}
          />
        </>
      )}
      {!(mobile && isTextEditing) && (
        <nav
          aria-label="Ferramentas de edição"
          className={
            mobile
              ? "order-last grid grid-cols-6 border-t border-white/10"
              : "flex w-20 shrink-0 flex-col gap-1 border-r border-white/10 py-2"
          }
        >
          {tools.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={activeTool === id}
              onClick={() => toggle(id)}
              className="flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 text-[10px] text-white/75 hover:text-white aria-pressed:text-orange-400 max-md:aria-pressed:bg-orange-400/10 md:px-1"
            >
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
      {!(mobile && isTextEditing) &&
        (activeTool ? (
          <section
            aria-label={title}
            style={
              mobile
                ? { maxHeight: panelHeight }
                : undefined
            }
            className={
              mobile
                ? "flex min-h-0 flex-col border-t border-white/10"
                : "flex min-h-0 w-80 max-w-[calc(100vw-5rem)] flex-col"
            }
          >
            <header className="flex min-h-11 shrink-0 items-center justify-between border-b border-white/10 px-4">
              <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
              {mobile && <>
                <button type="button" aria-label={panelSize === "compact" ? "Mostrar controles" : "Recolher painel"} onClick={() => setPanelSize(panelSize === "compact" ? "normal" : "compact")} className="grid min-h-11 min-w-11 place-items-center text-white/80">
                  {panelSize === "compact" ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                <button type="button" aria-label={panelSize === "expanded" ? "Reduzir painel" : "Ampliar painel"} onClick={() => setPanelSize(panelSize === "expanded" ? "normal" : "expanded")} className="min-h-11 px-2 text-xs text-white/80">
                  {panelSize === "expanded" ? "Reduzir" : "Ampliar"}
                </button>
              </>}
              <button
                type="button"
                aria-label="Fechar painel"
                onClick={() => onToolChange(null)}
                className="grid min-h-11 min-w-11 place-items-center text-white/70 hover:text-white"
              >
                <X size={18} />
              </button>
            </header>
            {selectionLabel && activeTool !== "selection" && (!mobile || panelSize !== "compact") && (
              <div
                role="toolbar"
                aria-label="Ações do objeto selecionado"
                className="flex min-h-11 shrink-0 flex-wrap items-center gap-1 border-b border-white/10 px-3 py-1"
              >
                <span className="min-w-0 flex-1 truncate text-xs text-white/70">
                  Seleção: {selectionLabel}
                </span>
                {selectionActions}
                <button
                  type="button"
                  onClick={() => onToolChange("selection")}
                  className="flex min-h-11 items-center gap-1 px-2 text-xs text-white"
                >
                  <SlidersHorizontal size={16} /> Ajustar
                </button>
              </div>
            )}
            <div
              key={activeTool}
              className={mobile && panelSize === "compact" ? "hidden" : "min-h-0 overflow-y-auto overscroll-contain p-4"}
            >
              {contents[activeTool]}
            </div>
          </section>
        ) : selectionLabel ? (
          <div
            className={
              mobile
                ? "flex min-h-11 items-center justify-between gap-2 border-t border-white/10 px-3"
                : "flex w-56 flex-col gap-2 p-3"
            }
          >
            <span className="truncate text-xs text-white/70">
              {selectionLabel}
            </span>
            <div className="flex items-center gap-1">
              {selectionActions}
              <button
                type="button"
                onClick={() => onToolChange("selection")}
                className="flex min-h-11 items-center gap-1 px-2 text-xs text-white"
              >
                <SlidersHorizontal size={16} /> Ajustar
              </button>
            </div>
          </div>
        ) : null)}
    </div>
  );
}

export function CanvasAddPanel({
  onAddText,
  onAddImage,
}: {
  onAddText: () => void;
  onAddImage: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={onAddText}
        className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border border-white/15 hover:bg-white/10"
      >
        <Plus size={19} /> Texto
      </button>
      <button
        type="button"
        onClick={onAddImage}
        className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border border-white/15 hover:bg-white/10"
      >
        <ImagePlus size={19} /> Imagem
      </button>
    </div>
  );
}
