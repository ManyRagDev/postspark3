import { useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownToLine, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { designLabel, savedDesignIdentity } from "@shared/acervo82Identity";
import { generationAspectRatios, aspectRatioHeight } from "@shared/aspectRatios";
import { fitPostToAspectRatio } from "@/pages/CanvasLab/lib/guidedComposition";
import { resolveSlideAppearance } from "@/pages/CanvasLab/lib/slideReplication";
import PostDownloadDialog from "@/pages/CanvasLab/components/PostDownloadDialog";
import { ASPECT_RATIO_CAPTIONS, type AspectRatioType, type CanvasPostModel } from "@/pages/CanvasLab/components/types";
import { CanvasPostStage } from "@/pages/CanvasLab/components/CanvasPostStage";
import StudioDirectionFeedback from "./StudioDirectionFeedback";
import StudioSlideNavigation, { useStudioSlidePreviews } from "./StudioSlideNavigation";
import StudioGalleryEmptyState from "./StudioGalleryEmptyState";

interface StudioMobileFlashcardsProps {
  variations: CanvasPostModel[];
  initialAspectRatio: AspectRatioType;
  resumePost?: Pick<CanvasPostModel, "id" | "aspectRatio">;
  onSelectVariation: (variation: CanvasPostModel) => void;
  onBackToCreate: () => void;
  onGenerateMore?: () => void;
  fixedDesign?: boolean;
  isGeneratingMore?: boolean;
  declaredFamilyId?: string | null;
}

const proposalNavButton = "grid min-h-11 min-w-11 place-items-center rounded-xl border border-white/15 text-white/80 hover:bg-white/10 disabled:opacity-30";

export default function StudioMobileFlashcards({
  variations,
  initialAspectRatio,
  resumePost,
  onSelectVariation,
  onBackToCreate,
  onGenerateMore,
  fixedDesign = false,
  isGeneratingMore = false,
  declaredFamilyId,
}: StudioMobileFlashcardsProps) {
  const [selectedIndex, setCurrentIndex] = useState(() =>
    resumePost ? Math.max(0, variations.findIndex(post => post.id === resumePost.id)) : 0
  );
  const [chosenRatio, setChosenRatio] = useState(resumePost?.aspectRatio);
  const aspectRatio = chosenRatio ?? initialAspectRatio;
  const [downloadPost, setDownloadPost] = useState<CanvasPostModel | null>(null);
  const [previewWidth, setPreviewWidth] = useState(0);
  const previewRef = useRef<HTMLDivElement>(null);
  const slidePreviews = useStudioSlidePreviews();

  const total = variations.length;
  const hasProposals = total > 0;
  const currentIndex = Math.min(selectedIndex, Math.max(0, total - 1));
  const stageHeight = aspectRatioHeight(aspectRatio);

  useLayoutEffect(() => {
    const frame = previewRef.current;
    if (!frame) return;
    const measure = () => setPreviewWidth(frame.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [hasProposals, aspectRatio]);

  if (!total) {
    return <StudioGalleryEmptyState isGenerating={isGeneratingMore} onBackToCreate={onBackToCreate} aspectRatio={aspectRatio} />;
  }

  const currentPost = slidePreviews.preview(variations[currentIndex], currentIndex);
  const { post: projectedPost, error } = fitPostToAspectRatio(currentPost, aspectRatio);
  const appearance = resolveSlideAppearance(currentPost, currentPost.currentSlideIndex);
  const familyLabel = designLabel(currentPost) || appearance.familyName;
  const matchesTaste = (savedDesignIdentity(currentPost).family ?? appearance.familyId) === declaredFamilyId;

  const goToProposal = (index: number) => setCurrentIndex(Math.max(0, Math.min(index, total - 1)));

  return (
    <div className="flex w-full flex-1 flex-col bg-[#07090E] text-white">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-2 px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h1 className="text-xl font-bold tracking-tight">Propostas</h1>
          <select
            aria-label="Proporção da proposta"
            value={aspectRatio}
            onChange={event => setChosenRatio(event.target.value as AspectRatioType)}
            className="min-h-11 rounded-xl border border-white/15 bg-[#141720] px-2 text-sm"
          >
            {!generationAspectRatios.some(ratio => ratio === aspectRatio) && <option value={aspectRatio}>{aspectRatio}</option>}
            {generationAspectRatios.map(ratio => (
              <option key={ratio} value={ratio}>{ASPECT_RATIO_CAPTIONS[ratio].caption} {ratio}</option>
            ))}
          </select>
        </div>

        <nav aria-label="Trocar proposta" className="flex items-center justify-between gap-2">
          <button type="button" aria-label="Proposta anterior" disabled={currentIndex === 0} onClick={() => goToProposal(currentIndex - 1)} className={proposalNavButton}>
            <ChevronLeft size={20} />
          </button>
          <div aria-live="polite" aria-atomic="true" className="min-w-0 text-center">
            <p className="text-sm font-semibold break-words">{familyLabel}</p>
            <p className="text-xs text-white/60">Proposta {currentIndex + 1} de {total}{matchesTaste ? " · Seu gosto" : ""}</p>
            {currentPost.provenance?.source === "local_fallback" && <p className="mt-0.5 text-xs text-amber-200">Sugestão local · sem IA</p>}
          </div>
          <button type="button" aria-label="Próxima proposta" disabled={currentIndex === total - 1} onClick={() => goToProposal(currentIndex + 1)} className={proposalNavButton}>
            <ChevronRight size={20} />
          </button>
        </nav>

        <motion.div
          ref={previewRef}
          className="mx-auto flex touch-pan-y touch-pinch-zoom items-center justify-center overflow-hidden rounded-xl bg-white/5 shadow-lg"
          style={{ width: `min(100%, 360px, calc(max(240px, 49svh) * ${360 / stageHeight}))`, aspectRatio: 360 / stageHeight }}
          onPanEnd={(_, info) => {
            if (Math.abs(info.offset.x) > 45 && Math.abs(info.offset.x) > Math.abs(info.offset.y)) {
              goToProposal(currentIndex + (info.offset.x < 0 ? 1 : -1));
            }
          }}
        >
          {error ? <p role="alert" className="p-4 text-sm text-amber-200">{error}</p> : projectedPost && previewWidth > 0 && (
            <div role="img" aria-label={projectedPost.slides[projectedPost.currentSlideIndex]?.headline || projectedPost.headline || "Prévia da proposta"} className="pointer-events-none select-none">
              <CanvasPostStage post={projectedPost} zoom={previewWidth / 360} isReadOnly />
            </div>
          )}
        </motion.div>

        <StudioSlideNavigation count={currentPost.slides.length} index={currentPost.currentSlideIndex}
          onChange={index => slidePreviews.navigate(currentPost, currentIndex, index)} />

        <div className="flex gap-2">
          <button type="button" disabled={!projectedPost} onClick={() => projectedPost && onSelectVariation(projectedPost)}
            className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-orange-400 px-3 text-sm font-bold text-black hover:bg-orange-300 disabled:opacity-40">
            Editar proposta
          </button>
          <button type="button" disabled={!projectedPost} onClick={() => setDownloadPost(projectedPost ?? null)}
            className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-white/15 px-3 text-sm hover:bg-white/10 disabled:opacity-40">
            <ArrowDownToLine size={16} aria-hidden="true" /> Baixar
          </button>
        </div>

        <StudioDirectionFeedback key={`${currentPost.completeDesign?.runId ?? currentPost.componentAssembly?.runId}:${currentPost.completeDesign?.slot ?? currentPost.componentAssembly?.slot}`} post={currentPost} />
        {onGenerateMore && (
          <button type="button" onClick={onGenerateMore} disabled={isGeneratingMore}
            className="flex min-h-11 items-center justify-center gap-2 text-sm text-white/75 hover:text-white disabled:opacity-50">
            <RefreshCw size={15} className={isGeneratingMore ? "animate-spin" : undefined} aria-hidden="true" />
            {isGeneratingMore ? "Gerando…" : fixedDesign ? "Gerar outra versão neste design" : "Gerar mais propostas"}
          </button>
        )}
      </main>
      {downloadPost && <PostDownloadDialog post={downloadPost} onClose={() => setDownloadPost(null)} />}
    </div>
  );
}
