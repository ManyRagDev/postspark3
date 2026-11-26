import { Check, Palette } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { sameIdentityKit } from "@shared/projectIdentityExtraction";
import type { VisualIdentity } from "@shared/visualIdentity";

export function ExtractProjectIdentity({ projectId, postIds, disabled, onExtracted }: {
  projectId: string;
  postIds: number[];
  disabled?: boolean;
  onExtracted?: (identity: VisualIdentity) => void;
}) {
  const projects = trpc.brandProjects.list.useQuery();
  const utils = trpc.useUtils();
  const mutation = trpc.brandProjects.extractIdentity.useMutation({
    onSuccess(result) {
      utils.brandProjects.list.setData(undefined, rows => rows?.map(project =>
        project.id === result.id ? { ...project, visualIdentity: result.visualIdentity } : project));
      void utils.brandProjects.list.invalidate().catch(() => {});
      onExtracted?.(result.visualIdentity);
    },
  });
  const identity = projects.data?.find(project => project.id === projectId)?.visualIdentity;
  const done = sameIdentityKit(identity, postIds);
  return <div>
    <button type="button" disabled={done || mutation.isPending || disabled || projects.isPending}
      onClick={() => mutation.mutate({ id: projectId, postIds })}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-violet-400/40 px-3 text-sm text-violet-200 disabled:opacity-75">
      {done ? <Check size={16} aria-hidden /> : <Palette size={16} aria-hidden />}
      <span aria-live="polite">{done ? "Identidade visual extraída" : mutation.isPending ? "Extraindo identidade visual…" : "Extrair identidade visual"}</span>
    </button>
    <p className="mt-1 text-xs text-white/60">{done ? "As próximas criações deste projeto usam esta identidade." : "Use a paleta dos modelos nas próximas criações deste projeto."}</p>
    {mutation.error && <p role="alert" className="mt-1 text-xs text-rose-300">{mutation.error.message}</p>}
  </div>;
}
