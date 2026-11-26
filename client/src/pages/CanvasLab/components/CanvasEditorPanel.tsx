import { useEffect, useState } from "react";
import type { EditorLayer, EditorTarget } from "../lib/editorController";
import { GripVertical } from "lucide-react";
import { useLayerDrag } from "./useLayerDrag";
import { COMPOSITION_LOGO_ID, type LayerDrop } from "../lib/editorElementState";
import type { SelectionModifiers } from "../lib/editorSelection";

const button =
  "min-h-11 rounded-lg border border-white/15 px-2 text-xs text-white/80 hover:bg-white/10 disabled:opacity-40";

type LayerAction =
  | "forward"
  | "backward"
  | "duplicate"
  | "visibility"
  | "lock"
  | "remove";
export interface CanvasEditorLayersProps {
  layers: EditorLayer[];
  selectedId?: string | null;
  selectedIds?: readonly string[];
  selectionActions?: React.ReactNode;
  onSelect: (target: EditorTarget, modifiers?: SelectionModifiers) => void;
  onDropLayer?: (target: EditorTarget, drop: LayerDrop) => void;
  onAdjust?: (target: EditorTarget) => void;
  onAction: (
    target: EditorTarget,
    action: LayerAction,
    layer: EditorLayer
  ) => void;
}

/** Layer actions are derived from the controller's capabilities, not from element names. */
export function CanvasEditorLayers({
  layers,
  selectedId,
  selectedIds,
  selectionActions,
  onSelect,
  onDropLayer,
  onAdjust,
  onAction,
}: CanvasEditorLayersProps) {
  const drag = useLayerDrag(onDropLayer);
  const [multiple, setMultiple] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const groups = (items: EditorLayer[]): string[] =>
      items.flatMap(layer => [
        ...(layer.kind === "group" ? [layer.id] : []),
        ...groups(layer.children),
      ]);
    return new Set(groups(layers));
  });
  const [decorExpanded, setDecorExpanded] = useState<Set<string>>(
    () => new Set()
  );
  const isDecoration = (layer: EditorLayer) => layer.role === "decoration";
  const visibleSiblings = (items: EditorLayer[], parent: string) =>
    [...items].reverse().filter(layer => !isDecoration(layer) || decorExpanded.has(parent));
  const visibleOrder = (items: EditorLayer[], parent: string): string[] => {
    return visibleSiblings(items, parent).flatMap(layer => [layer.id,
      ...(expanded.has(layer.id) ? visibleOrder(layer.children, `group:${layer.id}`) : [])]);
  };
  useEffect(() => {
    if (!selectedId) return;
    const find = (
      items: EditorLayer[],
      parent: string,
      ancestors: string[]
    ): boolean => {
      for (const layer of items) {
        if (layer.id === selectedId) {
          if (ancestors.length)
            setExpanded(
              previous => new Set([...Array.from(previous), ...ancestors])
            );
          if (isDecoration(layer))
            setDecorExpanded(
              previous => new Set([...Array.from(previous), parent])
            );
          return true;
        }
        if (find(layer.children, `group:${layer.id}`, [...ancestors, layer.id]))
          return true;
      }
      return false;
    };
    find(layers, "root:", []);
  }, [selectedId, layers[0]?.target.slideId]);
  const toggle = (id: string) =>
    setExpanded(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleDecor = (id: string) =>
    setDecorExpanded(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const renderLayers = (
    items: EditorLayer[],
    depth: number,
    parent: string
  ): React.ReactNode => {
    const decoration = items.filter(isDecoration);
    return (
      <>
        {decoration.length > 0 && (
          <li className="space-y-1" key={`decoration-${parent}`}>
            <button
              type="button"
              aria-expanded={decorExpanded.has(parent)}
              onClick={() => toggleDecor(parent)}
              style={{ paddingLeft: depth * 12 + 8 }}
              className="min-h-11 w-full rounded-lg text-left text-xs text-white/70 hover:bg-white/10"
            >
              {decorExpanded.has(parent) ? "▾" : "▸"} Decoração (
              {decoration.length})
            </button>
          </li>
        )}
        {visibleSiblings(items, parent).map(layer => renderLayer(layer, depth))}
      </>
    );
  };
  const renderLayer = (layer: EditorLayer, depth: number): React.ReactNode => {
    const selected = selectedIds ? selectedIds.includes(layer.id) : selectedId === layer.id;
    const name = /^Projeção uniforme /i.test(layer.label)
      ? "Layout"
      : layer.kind === "group" && /^field-\d+$/i.test(layer.label)
        ? `Grupo · ${layer.children.map(child => child.role === "headline" ? "Título" : child.role === "body" ? "Texto de apoio" : child.text || child.label).filter(Boolean).join(", ").slice(0, 48) || "Decoração"}`
        : layer.label;
    const excerpt = layer.text?.replace(/\s+/g, " ").trim().slice(0, 52);
    const actions: Array<{
      action: LayerAction;
      label: string;
      enabled: boolean;
      reason?: string;
    }> = [
      {
        action: "forward",
        label: "Trazer para frente",
        enabled: layer.capabilities.reorder,
      },
      {
        action: "backward",
        label: "Enviar para trás",
        enabled: layer.capabilities.reorder,
      },
      {
        action: "duplicate",
        label: "Duplicar",
        enabled: layer.capabilities.duplicate,
      },
      {
        action: "visibility",
        label: layer.visible ? "Ocultar" : "Mostrar",
        enabled: layer.capabilities.visibility,
        reason: layer.visibilityUnavailableReason,
      },
      {
        action: "lock",
        label: layer.locked ? "Desbloquear" : "Bloquear",
        enabled: layer.capabilities.lock,
        reason: layer.lockUnavailableReason,
      },
      {
        action: "remove",
        label: "Excluir",
        enabled: layer.capabilities.remove,
      },
    ];
    return (
      <li key={layer.id} className="space-y-1">
        <div
          data-layer-row={layer.id}
          data-layer-parent={layer.parentId ?? ""}
          data-fixed-edge={layer.kind === "background" || layer.id === COMPOSITION_LOGO_ID}
          className={`relative flex items-center gap-1 rounded-lg ${drag.activeId === layer.id ? "opacity-50" : ""}`}
          style={{ paddingLeft: depth * 12 }}
        >
          {drag.marker?.anchorId === layer.id && (
            <span aria-hidden="true" className={`pointer-events-none absolute inset-x-0 h-0.5 bg-orange-400 ${drag.marker.side === "above" ? "top-0" : "bottom-0"}`} />
          )}
          {onDropLayer && layer.capabilities.reorder && !multiple && (selectedIds?.length ?? 0) <= 1 && (
            <span aria-hidden="true" title="Arrastar camada" className="flex h-11 w-8 shrink-0 touch-none select-none items-center justify-center text-white/50 cursor-grab active:cursor-grabbing" {...drag.gripProps(layer)}>
              <GripVertical size={16} />
            </span>
          )}
          {layer.children.length > 0 && (
            <button
              type="button"
              className="min-h-11 min-w-8 text-white/70"
              aria-expanded={expanded.has(layer.id)}
              aria-label={`${expanded.has(layer.id) ? "Recolher" : "Expandir"} ${name}`}
              onClick={() => toggle(layer.id)}
            >
              {expanded.has(layer.id) ? "▾" : "▸"}
            </button>
          )}
          <button
            type="button"
            aria-pressed={selected}
            onClick={event => onSelect(layer.target, {
              toggle: multiple || event.ctrlKey || event.metaKey,
              range: event.shiftKey,
              order: visibleOrder(layers, "root:"),
            })}
            className="min-h-11 min-w-0 flex-1 rounded-lg px-2 text-left text-sm hover:bg-white/10 aria-pressed:bg-white/15"
          >
            <span className="block truncate">{excerpt || name}</span>
            <span className="block text-[10px] text-white/50">
              {
                {
                  text: "Texto",
                  image: "Imagem",
                  shape: "Forma",
                  group: "Grupo",
                  background: "Fundo",
                  logo: "Logo",
                }[layer.kind]
              }
              {excerpt ? ` · ${name}` : ""}
              {!layer.visible ? " · Oculto" : ""}
              {layer.locked ? " · Bloqueado" : ""}
            </span>
          </button>
        </div>
        {selected && (!selectedIds || selectedIds.length <= 1) && (
          <div className="flex flex-wrap gap-1 pl-2">
            {onAdjust && (
              <button
                type="button"
                className={button + " border-orange-400/40 text-orange-200"}
                onClick={() => onAdjust(layer.target)}
              >
                Ajustar {layer.kind === "background" ? "fundo" : "objeto"}
              </button>
            )}
            {actions.map(({ action, label, enabled, reason }) => (
              <button
                key={action}
                type="button"
                className={button}
                disabled={!enabled}
                title={
                  !enabled
                    ? reason ||
                      layer.unavailableReason ||
                      "Ação indisponível para este elemento"
                    : undefined
                }
                onClick={() => onAction(layer.target, action, layer)}
              >
                {label}
              </button>
            ))}
            {Array.from(
              new Set(
                [
                  layer.unavailableReason,
                  layer.visibilityUnavailableReason,
                  layer.lockUnavailableReason,
                ].filter(Boolean)
              )
            ).map(reason => (
              <p key={reason} className="w-full text-xs text-white/50">
                {reason}
              </p>
            ))}
          </div>
        )}
        {layer.children.length > 0 && expanded.has(layer.id) && (
          <ul className="space-y-1">
            {renderLayers(layer.children, depth + 1, `group:${layer.id}`)}
          </ul>
        )}
      </li>
    );
  };
  return layers.length ? (
    <div>
      {selectionActions}
      <button type="button" aria-pressed={multiple} onClick={() => setMultiple(value => !value)}
        className={button + " mb-2 w-full aria-pressed:bg-white/15"}>Selecionar vários</button>
      <p className="mb-2 text-xs text-white/50">
        As camadas da frente aparecem no topo. Arraste pela alça para reordenar dentro do grupo.
      </p>
      <ul data-layer-stack aria-label="Camadas da arte" className="space-y-1">
        {renderLayers(layers, 0, "root:")}
      </ul>
    </div>
  ) : (
    <p className="text-sm text-white/60">Nenhuma camada neste slide.</p>
  );
}

export function CanvasSelectedText({
  value,
  onChange,
  onEditOnCanvas,
  wholePhrase = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onEditOnCanvas: () => void;
  wholePhrase?: boolean;
}) {
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onEditOnCanvas}
        className={button + " w-full"}
      >
        Editar na arte
      </button>
      <details open={wholePhrase || undefined}>
        <summary className="min-h-11 cursor-pointer text-xs text-white/60">
          {wholePhrase ? "Editar frase completa" : "Editar texto em campo"}
        </summary>
        <label
          className="block text-xs text-white/70"
          htmlFor="canvas-selected-text"
        >
          {wholePhrase ? "Frase completa" : "Texto selecionado"}
        </label>
        <textarea
          id="canvas-selected-text"
          value={value}
          onChange={event => onChange(event.target.value)}
          rows={4}
          className="w-full rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-white focus:border-orange-400 focus:outline-none"
        />
        {wholePhrase && <p className="mt-2 text-xs text-white/60">Escreva a frase inteira aqui. O texto será distribuído entre as partes da arte.</p>}
      </details>
    </div>
  );
}

export function CanvasCaptionPanel({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [status, setStatus] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Legenda copiada.");
    } catch {
      setStatus(
        "Não foi possível copiar. Selecione o texto e copie manualmente."
      );
    }
  };
  return (
    <div className="space-y-2">
      <label htmlFor="canvas-caption" className="block text-xs text-white/70">
        Legenda do post
      </label>
      <textarea
        id="canvas-caption"
        value={value}
        onChange={event => onChange(event.target.value)}
        rows={7}
        className="w-full rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-white focus:border-orange-400 focus:outline-none"
      />
      <button type="button" onClick={copy} className={button}>
        Copiar legenda
      </button>
      <p role="status" className="text-xs text-white/60">
        {status}
      </p>
    </div>
  );
}
