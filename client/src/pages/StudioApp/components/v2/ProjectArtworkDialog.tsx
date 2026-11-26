import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { CanvasPostStage } from "@/pages/CanvasLab/components/CanvasPostStage";
import { savedPostToCanvasModel, type SavedPostRecordLike } from "@/pages/CanvasLab/lib/saveAdapter";
import { aspectRatioHeight } from "@shared/aspectRatios";
import type { ProjectArtworkSelection } from "../../lib/briefDraftStorage";
import { ExtractProjectIdentity } from "./ExtractProjectIdentity";

export type SavedProjectArtwork = SavedPostRecordLike & { revision?: number };

export function getProjectArtworkIds(composition?: string | null): number[] {
  try {
    const kit = JSON.parse(composition ?? "null");
    if (kit?.source === "design-extraction" && Array.isArray(kit.postIds)) {
      const ids = kit.postIds.filter((id: unknown): id is number =>
        typeof id === "number" && Number.isSafeInteger(id) && id > 0
      );
      return Array.from(new Set<number>(ids)).slice(0, 5);
    }
  } catch {
    // Direções visuais anteriores também podem ser texto livre.
  }
  return [];
}

interface ProjectArtworkDialogProps {
  project: { id: string; name: string };
  postIds: number[];
  onClose: () => void;
  onOpenArtwork?: (post: SavedProjectArtwork) => void;
  onUseArtwork?: (artwork: ProjectArtworkSelection) => void;
}

export function ProjectArtworkDialog({ project, postIds, onClose, onOpenArtwork, onUseArtwork }: ProjectArtworkDialogProps) {
  const queries = trpc.useQueries(query => postIds.map(id => query.post.get({ id }, { retry: false })));
  const loading = queries.some(query => query.isPending);
  const posts = queries.flatMap(query => query.data ? [query.data] : []);

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto border-white/10 bg-[#10141f] text-white sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Modelos de {project.name}</DialogTitle>
          <DialogDescription className="text-white/60">Escolha um modelo para criar uma nova peça a partir do briefing.</DialogDescription>
        </DialogHeader>
        <ExtractProjectIdentity key={project.id} projectId={project.id} postIds={postIds} />
        {posts.length > 0 && (
          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {posts.map(post => {
              const model = savedPostToCanvasModel(post);
              const name = model.familyName || post.headline || "Modelo salvo";
              const zoom = Math.min(0.36, 164 / aspectRatioHeight(model.aspectRatio));
              return (
                <article key={post.id} aria-label={name} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-black/30 focus-within:border-orange-500/50">
                  <div aria-hidden="true" className="pointer-events-none flex h-44 items-center justify-center">
                    <CanvasPostStage post={model} zoom={zoom} isReadOnly />
                  </div>
                  <h3 className="flex-1 px-2 pb-2 text-sm font-medium text-white/90">{name}</h3>
                  <div className="flex flex-col gap-1 px-2 pb-2">
                    {onUseArtwork && (
                      <button
                        type="button"
                        onClick={() => onUseArtwork({
                          projectId: project.id,
                          postId: post.id,
                          name,
                          aspectRatio: model.aspectRatio,
                          slideCount: model.slides.length,
                        })}
                        aria-label={`Usar no briefing · ${name}`}
                        className="min-h-11 rounded-lg bg-orange-500 px-1 text-xs font-semibold text-black hover:bg-orange-400 focus-visible:outline-white md:min-h-9"
                      >
                        Usar no briefing
                      </button>
                    )}
                    {onOpenArtwork && (
                      <button
                        type="button"
                        onClick={() => onOpenArtwork(post)}
                        aria-label={`Editar original · ${name}`}
                        className="min-h-11 rounded-lg px-1 text-xs text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-orange-400 md:min-h-8"
                      >
                        Editar original
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {loading ? <p role="status" className="text-sm text-white/60">Carregando modelos…</p>
          : posts.length === 0 ? <p className="text-sm text-white/60">Os modelos deste projeto estão indisponíveis.</p>
          : posts.length < postIds.length && <p className="text-sm text-white/60">Alguns modelos estão indisponíveis.</p>}
      </DialogContent>
    </Dialog>
  );
}
