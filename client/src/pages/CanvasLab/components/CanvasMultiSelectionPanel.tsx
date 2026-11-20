import type { EditorCommand, EditorLayer } from "../lib/editorController";

export function CanvasMultiSelectionPanel({
  layers,
  onCommand,
  onClear,
}: {
  layers: EditorLayer[];
  onCommand: (command: EditorCommand) => void;
  onClear: () => void;
}) {
  const actions: Array<{
    label: string;
    command: EditorCommand;
    enabled: boolean;
  }> = [
    {
      label: "Ocultar seleção",
      command: { type: "visibility", visible: false },
      enabled:
        layers.every(l => l.capabilities.visibility) &&
        layers.some(l => l.visible),
    },
    {
      label: "Mostrar seleção",
      command: { type: "visibility", visible: true },
      enabled:
        layers.every(l => l.capabilities.visibility) &&
        layers.some(l => !l.visible),
    },
    {
      label: "Bloquear seleção",
      command: { type: "lock", locked: true },
      enabled:
        layers.every(l => l.capabilities.lock) && layers.some(l => !l.locked),
    },
    {
      label: "Desbloquear seleção",
      command: { type: "lock", locked: false },
      enabled:
        layers.every(l => l.capabilities.lock) && layers.some(l => l.locked),
    },
    {
      label: "Excluir seleção",
      command: { type: "remove" },
      enabled: layers.every(l => l.capabilities.remove),
    },
  ];
  return (
    <section className="space-y-3" aria-label="Seleção múltipla">
      <h3 className="text-sm font-semibold">
        {layers.length} objetos selecionados
      </h3>
      <p className="text-xs text-white/65">
        Arraste o conjunto na arte ou use os cantos para redimensionar
        proporcionalmente. Ctrl/Cmd ou Shift adicionam e removem objetos.
      </p>
      {layers.some(l => l.locked || !l.visible || l.kind === "background") && (
        <p role="status" className="text-xs text-amber-200">
          Para mover o conjunto, selecione apenas objetos visíveis e
          desbloqueados, sem o fundo.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {actions.map(action => (
          <button
            key={action.label}
            type="button"
            disabled={!action.enabled}
            onClick={() => onCommand(action.command)}
            className="min-h-11 rounded-lg border border-white/15 px-3 text-xs disabled:opacity-40"
          >
            {action.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="min-h-11 rounded-lg border border-white/15 px-3 text-xs"
      >
        Limpar seleção
      </button>
    </section>
  );
}
