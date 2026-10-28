import { useEffect, useState } from "react";
import type { EditorLayer, EditorTarget } from "../lib/editorController";

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
  onSelect: (target: EditorTarget) => void;
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
  onSelect,
  onAction,
}: CanvasEditorLayersProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [decorExpanded, setDecorExpanded] = useState<Set<string>>(
    () => new Set()
  );
  const isDecoration = (layer: EditorLayer) => layer.role === "decoration";
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
    const content = items.filter(layer => !isDecoration(layer));
    const decoration = items.filter(isDecoration);
    return (
      <>
        {content.map(layer => renderLayer(layer, depth))}
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
            {decorExpanded.has(parent) && (
              <ul className="space-y-1">
                {decoration.map(layer => renderLayer(layer, depth + 1))}
              </ul>
            )}
          </li>
        )}
      </>
    );
  };
  const renderLayer = (layer: EditorLayer, depth: number): React.ReactNode => {
    const selected = selectedId === layer.id;
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
          className="flex items-center gap-1"
          style={{ paddingLeft: depth * 12 }}
        >
          {layer.children.length > 0 && (
            <button
              type="button"
              className="min-h-11 min-w-8 text-white/70"
              aria-expanded={expanded.has(layer.id)}
              aria-label={`${expanded.has(layer.id) ? "Recolher" : "Expandir"} ${layer.label}`}
              onClick={() => toggle(layer.id)}
            >
              {expanded.has(layer.id) ? "▾" : "▸"}
            </button>
          )}
          <button
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(layer.target)}
            className="min-h-11 min-w-0 flex-1 rounded-lg px-2 text-left text-sm hover:bg-white/10 aria-pressed:bg-white/15"
          >
            <span className="block truncate">{layer.label}</span>
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
              {!layer.visible ? " · Oculto" : ""}
              {layer.locked ? " · Bloqueado" : ""}
            </span>
          </button>
        </div>
        {selected && (
          <div className="flex flex-wrap gap-1 pl-2">
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
      <p className="mb-2 text-xs text-white/50">
        Conteúdo e decoração são agrupados para facilitar o acesso. As ações de
        ordem respeitam a ordem real da arte.
      </p>
      <ul aria-label="Camadas da arte" className="space-y-1">
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
}: {
  value: string;
  onChange: (value: string) => void;
  onEditOnCanvas: () => void;
}) {
  return (
    <div className="space-y-2">
      <label
        className="block text-xs text-white/70"
        htmlFor="canvas-selected-text"
      >
        Texto selecionado
      </label>
      <textarea
        id="canvas-selected-text"
        value={value}
        onChange={event => onChange(event.target.value)}
        rows={4}
        className="w-full rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-white focus:border-orange-400 focus:outline-none"
      />
      <button type="button" onClick={onEditOnCanvas} className={button}>
        Editar na arte
      </button>
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
