import { useEffect, useRef, type ReactNode } from "react";
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
  mobileBottomInset?: number;
  mobileViewportHeight?: number;
  isTextEditing?: boolean;
  activeTool: CanvasEditorTool | null;
  onToolChange: (tool: CanvasEditorTool | null) => void;
  contents: Partial<Record<CanvasEditorTool, ReactNode>>;
  selectionLabel?: string;
  selectionActions?: ReactNode;
  onPanelHeightChange?: (height: number) => void;
}

export default function CanvasEditorChrome({
  mobile = false,
  mobileBottomInset = 0,
  mobileViewportHeight,
  isTextEditing = false,
  activeTool,
  onToolChange,
  contents,
  selectionLabel,
  selectionActions,
  onPanelHeightChange,
}: CanvasEditorChromeProps) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mobile || !onPanelHeightChange) return;
    const node = container.current;
    if (!node) return;
    const measure = () =>
      onPanelHeightChange(node.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined")
      return () => onPanelHeightChange(0);
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      observer.disconnect();
      onPanelHeightChange(0);
    };
  }, [mobile, onPanelHeightChange, activeTool, selectionLabel, isTextEditing]);
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
      ref={container}
      style={mobile ? { bottom: mobileBottomInset } : undefined}
      className={
        mobile
          ? "fixed inset-x-0 bottom-0 z-40 flex flex-col bg-[#151515] text-white shadow-2xl"
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
              ? "order-last flex justify-around border-t border-white/10 pb-[env(safe-area-inset-bottom)]"
              : "flex w-20 shrink-0 flex-col gap-1 border-r border-white/10 py-2"
          }
        >
          {tools.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={activeTool === id}
              onClick={() => toggle(id)}
              className="flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] text-white/70 hover:text-white aria-pressed:text-orange-400 md:flex-none"
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
              mobile && mobileViewportHeight
                ? { maxHeight: Math.min(mobileViewportHeight * 0.48, 420) }
                : undefined
            }
            className={
              mobile
                ? "flex max-h-[min(48dvh,420px)] flex-col border-t border-white/10"
                : "flex min-h-0 w-80 max-w-[calc(100vw-5rem)] flex-col"
            }
          >
            <header className="flex min-h-11 shrink-0 items-center justify-between border-b border-white/10 px-4">
              <h2 className="text-sm font-semibold">{title}</h2>
              <button
                type="button"
                aria-label="Fechar painel"
                onClick={() => onToolChange(null)}
                className="grid min-h-11 min-w-11 place-items-center text-white/70 hover:text-white"
              >
                <X size={18} />
              </button>
            </header>
            {selectionLabel && activeTool !== "selection" && (
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
              className="min-h-0 overflow-y-auto overscroll-contain p-4"
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
