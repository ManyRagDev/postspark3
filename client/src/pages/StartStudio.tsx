import { useState } from "react";
import { trpc } from "@/lib/trpc";
import StudioAppV2BPage from "./StudioApp/StudioAppV2BPage";
import type { CanvasPostModel } from "./CanvasLab/components/types";
import { normalizeCanvasModel } from "./CanvasLab/lib/saveAdapter";
import PostDownloadDialog from "./CanvasLab/components/PostDownloadDialog";

export default function StartStudio({ archive = false }: { archive?: boolean }) {
  const state = trpc.startPilot.state.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const save = trpc.startPilot.save.useMutation();
  const [showDownload, setShowDownload] = useState(false);
  const [finished, setFinished] = useState<CanvasPostModel>();
  if (state.isPending) return <p role="status" className="p-6">Carregando sua peça…</p>;
  if (state.isError) return (
    <p role="alert" className="p-6">Não foi possível abrir o START.{" "}
      <button onClick={() => void state.refetch()} className="underline">Tentar novamente</button>
    </p>
  );
  const saved = state.data?.finalized ?? (archive ? state.data?.draft : null);
  const finalized = finished ?? (saved ? normalizeCanvasModel(saved as Partial<CanvasPostModel>) : undefined);
  if (finalized || archive) return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-bold">Sua peça START</h1>
      {finalized ? <button onClick={() => setShowDownload(true)} className="w-fit rounded-lg bg-orange-300 px-4 py-3 font-semibold text-black">Baixar em HD</button>
        : <p>Nenhuma peça START foi salva nesta conta.</p>}
      {archive && finalized && (
        <button type="button" className="w-fit underline" onClick={() => {
          sessionStorage.setItem("postspark.open_canvas_post", JSON.stringify({ model: finalized }));
          window.location.assign("/thevoid");
        }}>Continuar no Studio</button>
      )}
      {!archive && <a href="/pricing" className="underline">Escolher um plano para criar outra peça</a>}
      {finalized && showDownload && <PostDownloadDialog post={finalized} exportQuality="hd" onClose={() => setShowDownload(false)} />}
    </main>
  );
  return <StudioAppV2BPage studioPlan="START" startPiece={{
    requestId: state.data?.requestId,
    draft: state.data?.draft ? normalizeCanvasModel(state.data.draft as Partial<CanvasPostModel>) : undefined,
    save: async (post, finalize) => {
      if (!post.provenance?.journey?.requestId || !post.id) throw new Error("Abra uma das propostas do START para salvar.");
      if (finalize && !window.confirm("Finalizar esta peça? Você poderá baixar novamente esta versão em HD.")) return;
      const model = { ...post, id: post.id, slides: post.slides.map(slide => ({ ...slide })),
        provenance: { ...post.provenance, journey: { ...post.provenance.journey } } };
      const result = await save.mutateAsync({ model, finalize });
      if (finalize) {
        setFinished(normalizeCanvasModel(result as unknown as Partial<CanvasPostModel>));
        setShowDownload(true);
      }
    },
  }} />;
}
