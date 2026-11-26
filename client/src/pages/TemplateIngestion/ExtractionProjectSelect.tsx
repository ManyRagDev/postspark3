type ProjectOption = { id: string; name: string };

export function ExtractionProjectSelect({ projects, value, onChange, disabled, allowNew, activeId }: {
  projects: ProjectOption[];
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
  allowNew?: boolean;
  activeId?: string | null;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-white/70">
      Projeto de destino
      <select
        aria-label="Projeto de destino"
        className="h-9 min-w-0 max-w-full rounded-lg border border-white/20 bg-[#181a20] px-2 text-sm text-white"
        value={value}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
      >
        {!value && <option value="" disabled>Selecione o projeto</option>}
        {projects.map(project => <option key={project.id} value={project.id}>{project.name}{activeId === project.id ? " (ativo)" : ""}</option>)}
        {allowNew && <option value="new">Criar projeto para esta referência</option>}
      </select>
    </label>
  );
}
