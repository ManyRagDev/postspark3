import { useState, useRef, useEffect, useMemo } from "react";
import { Building2, ChevronDown, Plus, Check, Edit2, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  getLocalProjects,
  deleteLocalProject,
  type LocalBrandProject,
} from "../../lib/projectStorage";

interface ProjectSelectorDropdownProps {
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  onOpenNewProjectModal: () => void;
  onEditProjectModal: (project: any) => void;
  disabled?: boolean;
}

export default function ProjectSelectorDropdown({
  selectedProjectId,
  onSelectProject,
  onOpenNewProjectModal,
  onEditProjectModal,
  disabled = false,
}: ProjectSelectorDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();
  const brandProjectsList = (trpc as any).brandProjects?.list;
  const { data: remoteProjects = [], isLoading } = brandProjectsList?.useQuery
    ? brandProjectsList.useQuery(undefined, { retry: false })
    : { data: [], isLoading: false };
  const deleteMutation = (trpc as any).brandProjects?.delete?.useMutation
    ? (trpc as any).brandProjects.delete.useMutation()
    : { mutateAsync: async () => {} };

  const [localProjects, setLocalProjects] = useState<LocalBrandProject[]>(() => getLocalProjects());

  // Atualiza lista local ao abrir o menu
  useEffect(() => {
    if (isOpen) {
      setLocalProjects(getLocalProjects());
    }
  }, [isOpen]);

  // Combina lista remota e lista local sem duplicar IDs
  const projects = useMemo(() => {
    const combined: Array<any> = [...remoteProjects];
    const remoteIds = new Set((remoteProjects as any[]).map((p: any) => p.id));
    for (const lp of localProjects) {
      if (!remoteIds.has(lp.id)) {
        combined.push(lp);
      }
    }
    return combined;
  }, [remoteProjects, localProjects]);

  const activeProject = projects.find((p) => p.id === selectedProjectId) || null;

  // Auto-seleciona o default se o usuário ainda não escolheu nenhum
  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      const defaultProj = projects.find((p) => p.isDefault) || projects[0];
      if (defaultProj) {
        onSelectProject(defaultProj.id);
      }
    }
  }, [projects, selectedProjectId]);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: string, name: string, isLocalOnly?: boolean) => {
    e.stopPropagation();
    if (!window.confirm(`Tem certeza que deseja excluir o projeto "${name}"?`)) return;
    try {
      if (!isLocalOnly) {
        await deleteMutation.mutateAsync({ id }).catch(() => {});
      }
      deleteLocalProject(id);
      setLocalProjects(getLocalProjects());
      if (selectedProjectId === id) {
        onSelectProject(null);
      }
      await utils.brandProjects.list.invalidate();
      toast.success("Projeto excluído.");
    } catch {
      toast.error("Erro ao excluir projeto.");
    }
  };

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all select-none border ${
          activeProject
            ? "bg-[#FF5C00]/15 border-[#FF5C00]/40 text-orange-200 hover:bg-[#FF5C00]/25"
            : "bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/[0.08]"
        } disabled:opacity-40 disabled:pointer-events-none`}
        title={activeProject ? `Projeto ativo: ${activeProject.name} (${activeProject.niche})` : "Escolha ou crie um projeto de marca"}
      >
        <Building2 size={13} className={activeProject ? "text-[#FF5C00]" : "text-white/40"} />
        <span className="max-w-[140px] truncate">
          {activeProject ? activeProject.name : "Escolher Projeto"}
        </span>
        <ChevronDown size={12} className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-72 origin-top-left rounded-xl bg-[#18181F] border border-white/10 shadow-2xl z-50 overflow-hidden text-xs text-white divide-y divide-white/5 animate-in fade-in zoom-in-95 duration-100">
          <div className="p-2 space-y-1">
            <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-white/40">
              Projetos de Marca
            </div>

            {/* Opção Sem Projeto (Livre) */}
            <button
              type="button"
              onClick={() => {
                onSelectProject(null);
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors ${
                !selectedProjectId
                  ? "bg-white/10 text-white font-medium"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span>Sem projeto (Post livre)</span>
              {!selectedProjectId && <Check size={14} className="text-[#FF5C00]" />}
            </button>

            {/* Lista dos projetos do usuário */}
            {isLoading ? (
              <div className="px-2.5 py-3 text-center text-white/40 text-[11px]">
                Carregando projetos...
              </div>
            ) : projects.length === 0 ? (
              <div className="px-2.5 py-2 text-white/40 text-[11px]">
                Nenhum projeto cadastrado ainda.
              </div>
            ) : (
              projects.map((proj) => {
                const isSelected = proj.id === selectedProjectId;
                return (
                  <div
                    key={proj.id}
                    onClick={() => {
                      onSelectProject(proj.id);
                      setIsOpen(false);
                    }}
                    className={`group flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-[#FF5C00]/15 text-orange-100 font-medium"
                        : "text-white/80 hover:bg-white/5"
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="truncate flex items-center gap-1.5">
                        <span>{proj.name}</span>
                        {proj.isDefault && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-white/10 text-white/60">
                            padrão
                          </span>
                        )}
                        {proj.isLocalOnly && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20" title="Salvo localmente no navegador">
                            local
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-white/40 truncate">{proj.niche}</div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsOpen(false);
                          onEditProjectModal(proj);
                        }}
                        className="p-1 text-white/40 hover:text-white hover:bg-white/10 rounded transition-colors"
                        title="Editar calibração do projeto"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, proj.id, proj.name, proj.isLocalOnly)}
                        className="p-1 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title="Excluir projeto"
                      >
                        <Trash2 size={12} />
                      </button>
                      {isSelected && <Check size={14} className="text-[#FF5C00] ml-1" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Botão Novo Projeto */}
          <div className="p-1.5 bg-black/20">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenNewProjectModal();
              }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/90 font-medium transition-colors"
            >
              <Plus size={13} className="text-[#FF5C00]" />
              <span>Novo Projeto de Marca</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
