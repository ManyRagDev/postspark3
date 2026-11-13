import {designLabel} from "@shared/acervo82Identity";
import {toast} from "sonner";
import { aspectRatioHeight } from "@shared/aspectRatios";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Bookmark, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { createPostVisualSnapshot } from "@/lib/variationSnapshot";
import type { PostVariation, PostVisualSnapshot, PostMode, Platform, CarouselSlide, AspectRatio } from "@shared/postspark";
import { layoutToAdvanced } from "@/lib/layoutToAdvanced";
import { savedPostToCanvasModel } from "@/pages/CanvasLab/lib/saveAdapter";
import { CanvasPostStage, type CanvasPostStageRef } from "@/pages/CanvasLab/components/CanvasPostStage";
import PostRenderer from "@/components/PostRenderer";
import UserTopMenu from "@/components/UserTopMenu";
import { TemplateIngestionModal } from "@/pages/TemplateIngestion/TemplateIngestionModal";

function formatDate(value: string | null | undefined) {
  if (!value) return "Sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function savedPostToVariation(post: any): PostVisualSnapshot {
  const snapshot = post.variation_snapshot && typeof post.variation_snapshot === "object" ? post.variation_snapshot : null;
  const canvasModel = post.canvas_model && typeof post.canvas_model === "object" ? post.canvas_model : null;
  const slides = Array.isArray(snapshot?.slides) ? (snapshot.slides as CarouselSlide[]) : Array.isArray(post.slides) ? (post.slides as CarouselSlide[]) : [];

  const bgUrl = snapshot?.imageUrl || canvasModel?.bgImage || post.imageUrl || undefined;
  const bgColor = snapshot?.backgroundColor || canvasModel?.palette?.background || post.backgroundColor || "#0f1117";
  const txtColor = snapshot?.textColor || canvasModel?.palette?.text || post.textColor || "#ffffff";
  const accColor = snapshot?.accentColor || canvasModel?.palette?.accent || post.accentColor || "#d4af37";
  const aspRatio = (snapshot?.aspectRatio || canvasModel?.aspectRatio || "1:1") as AspectRatio;

  return createPostVisualSnapshot({
    id: `saved-${post.id}`,
    ...(snapshot ?? {}),
    headline: snapshot?.headline || canvasModel?.headline || post.headline || "",
    body: snapshot?.body || canvasModel?.subtext || post.body || "",
    caption: snapshot?.caption || canvasModel?.caption || post.caption || "",
    hashtags: Array.isArray(snapshot?.hashtags) ? snapshot.hashtags : Array.isArray(post.hashtags) ? post.hashtags : [],
    callToAction: snapshot?.callToAction || post.callToAction || "",
    tone: snapshot?.tone || post.tone || "",
    platform: (snapshot?.platform || post.platform || "instagram") as Platform,
    imagePrompt: snapshot?.imagePrompt || canvasModel?.imagePrompt || post.imagePrompt || "",
    imageUrl: bgUrl,
    backgroundColor: bgColor,
    textColor: txtColor,
    accentColor: accColor,
    layout: snapshot?.layout || post.layout || "centered",
    aspectRatio: aspRatio,
    postMode: (snapshot?.postMode || post.postMode || "static") as PostMode,
    slides,
    copyAngle: snapshot?.copyAngle || post.copy_angle || undefined,
    textElements: Array.isArray(snapshot?.textElements) ? snapshot.textElements : Array.isArray(post.textElements) ? post.textElements : undefined,
    imageSettings: snapshot?.imageSettings || post.image_settings || undefined,
    layoutSettings: snapshot?.layoutSettings || post.layout_settings || layoutToAdvanced(post.layout || "centered"),
    bgValue: snapshot?.bgValue || post.bg_value || (bgUrl ? { type: "ai", url: bgUrl } : { type: "solid", color: bgColor }),
    bgOverlay: snapshot?.bgOverlay || post.bg_overlay || undefined,
  } as PostVariation);
}

function SavedPostPreview({ post }: { post: any }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<CanvasPostStageRef>(null);
  const [visible, setVisible] = useState(false);
  const [size, setSize] = useState({ width: 180, height: 200 });
  const [thumbnail, setThumbnail] = useState("");
  const hasCanvasModel = Boolean(post.canvas_model && typeof post.canvas_model === "object" && !Array.isArray(post.canvas_model));
  const canvasModel = useMemo(() => {
    if (!hasCanvasModel) return null;
    return { ...savedPostToCanvasModel(post), currentSlideIndex: 0 };
  }, [hasCanvasModel, post]);
  const legacyPreview = useMemo(() => hasCanvasModel ? null : savedPostToVariation(post), [hasCanvasModel, post]);
  const baseHeight = aspectRatioHeight(canvasModel?.aspectRatio ?? "1:1");
  const zoom = Math.min((size.width - 24) / 360, (size.height - 24) / baseHeight, 1);

  useEffect(() => setThumbnail(""), [post.canvas_model]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    resize?.observe(element);
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer?.disconnect();
      }
    }, { rootMargin: "300px" });
    if (observer) observer.observe(element);
    else setVisible(true);
    return () => {
      resize?.disconnect();
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!visible || !canvasModel || thumbnail) return;
    let cancelled = false;
    stageRef.current?.exportThumbnail()
      .then(dataUrl => {
        if (!cancelled && dataUrl) setThumbnail(dataUrl);
      })
      .catch(() => {
        // Canvas remains visible when a remote asset cannot be captured.
      });
    return () => { cancelled = true; };
  }, [visible, canvasModel, thumbnail]);

  return (
    <div ref={containerRef} className="relative flex h-40 w-28 shrink-0 items-center justify-center overflow-hidden bg-black/25 p-2 sm:h-72 sm:w-auto sm:p-3 lg:h-96">
      {canvasModel && canvasModel.slides.length > 1 && <span className="absolute right-1 top-1 z-10 rounded bg-black/80 px-1.5 py-1 text-[10px] text-white">{canvasModel.slides.length} slides</span>}
      {thumbnail ? (
        <img src={thumbnail} alt={`Prévia da capa: ${post.headline || "Post salvo"}`} className="max-h-full max-w-full object-contain shadow-2xl" />
      ) : visible && canvasModel ? (
        <div className="pointer-events-none" aria-hidden="true">
          <CanvasPostStage ref={stageRef} post={canvasModel} zoom={Math.max(0.1, zoom)} isReadOnly />
        </div>
      ) : visible && legacyPreview ? (
        <PostRenderer mode="preview" snapshot={legacyPreview} aspectRatio={legacyPreview.aspectRatio} className="shrink-0 shadow-2xl" style={{ width: Math.min(size.width - 24, legacyPreview.aspectRatio === "9:16" ? 90 : legacyPreview.aspectRatio === "5:6" ? 150 : 180) }} />
      ) : null}
    </div>
  );
}

function GalleryPreview({post}:{post:{id:number;headline:string;gallery_preview?:string|null}}){
 const container = useRef<HTMLDivElement>(null);
 const [requested,setRequested]=useState(false);
 useEffect(() => {
   if (post.gallery_preview || !container.current) return;
   if (typeof IntersectionObserver === "undefined") { setRequested(true); return; }
   const observer = new IntersectionObserver(([entry]) => {
     if (entry.isIntersecting) { setRequested(true); observer.disconnect(); }
   }, { rootMargin: "100px" });
   observer.observe(container.current);
   return () => observer.disconnect();
 }, [post.id, post.gallery_preview]);
 const preview=trpc.post.get.useQuery({id:post.id},{enabled:requested&&!post.gallery_preview,staleTime:Infinity,retry:false});
 if(post.gallery_preview)return <div className="flex h-40 w-28 shrink-0 justify-center bg-black/25 p-2 sm:h-72 sm:w-auto sm:p-3 lg:h-96"><img src={post.gallery_preview} alt={`Prévia: ${post.headline}`} className="min-h-0 max-h-full max-w-full object-contain" /></div>;
 if(preview.data)return <SavedPostPreview post={preview.data}/>;
 return <div ref={container} className="flex h-40 w-28 shrink-0 overflow-hidden flex-col items-center justify-center gap-2 bg-black/25 p-2 text-xs sm:h-72 sm:w-auto sm:p-4 lg:h-96"><p className="line-clamp-3 text-center">{post.headline}</p>{preview.error ? <button onClick={()=>void preview.refetch()}>Tentar prévia novamente</button> : <p role="status" className="text-xs text-muted-foreground">{requested ? 'Preparando prévia…' : 'Prévia ao aproximar'}</p>}</div>;
}

const LIBRARY_VIEW_KEY = "postspark.saved-posts.view.v1";
type LibraryView = { page: number; search: string; draft: string; scrollY: number };
function readLibraryView(): LibraryView {
  const fallback = { page: 0, search: "", draft: "", scrollY: 0 };
  try {
    const value = JSON.parse(sessionStorage.getItem(LIBRARY_VIEW_KEY) || "null");
    if (!value || !Number.isInteger(value.page) || value.page < 0 || typeof value.search !== "string" || typeof value.draft !== "string") return fallback;
    return { page: value.page, search: value.search.slice(0, 120), draft: value.draft.slice(0, 120), scrollY: Number.isFinite(value.scrollY) ? Math.max(0, value.scrollY) : 0 };
  } catch { return fallback; }
}

function LibraryPagination({ page, total, disabled, onChange, label }: { page: number; total: number; disabled: boolean; onChange: (page: number) => void; label: string }) {
  return <nav aria-label={label} className="flex items-center justify-between gap-2 text-sm">
    <button type="button" disabled={disabled || page === 0} onClick={() => onChange(page - 1)} className="min-h-11 rounded-xl border border-white/15 px-3 disabled:opacity-35">Anterior</button>
    <span className="text-center text-muted-foreground">Página {page + 1} de {Math.max(1, Math.ceil(total / 20))}</span>
    <button type="button" disabled={disabled || (page + 1) * 20 >= total} onClick={() => onChange(page + 1)} className="min-h-11 rounded-xl border border-white/15 px-3 disabled:opacity-35">Próxima</button>
  </nav>;
}

export default function SavedPosts() {
  const [, setLocation] = useLocation();
  const utils=trpc.useUtils();
  const [initialView] = useState(readLibraryView);
  const [page, setPage] = useState(initialView.page);
  const [searchDraft, setSearchDraft] = useState(initialView.draft);
  const [search, setSearch] = useState(initialView.search);
  const restorePending = useRef(true);
  const viewRef = useRef(initialView);
  viewRef.current = { page, search, draft: searchDraft, scrollY: initialView.scrollY };
  const rememberView = () => {
    try { sessionStorage.setItem(LIBRARY_VIEW_KEY, JSON.stringify({ ...viewRef.current, scrollY: window.scrollY })); } catch { /* Navigation also works when storage is unavailable. */ }
  };
  useEffect(() => {
    const save = () => { try { sessionStorage.setItem(LIBRARY_VIEW_KEY, JSON.stringify({ ...viewRef.current, scrollY: window.scrollY })); } catch {} };
    window.addEventListener("pagehide", save);
    return () => { save(); window.removeEventListener("pagehide", save); };
  }, []);
  const [opening,setOpening]=useState<number|null>(null);
  const [isIngestOpen, setIsIngestOpen] = useState(false);
  const { data, isLoading, isFetching, error, refetch } = trpc.post.listSummary.useQuery({limit:20,offset:page*20,...(search?{search}:{})});
  const posts=data?.items;
  useEffect(() => {
    if (isLoading || !data || !restorePending.current) return;
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: initialView.scrollY, behavior: "instant" });
      restorePending.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [isLoading, data, initialView.scrollY]);
  const changePage = (nextPage: number) => {
    restorePending.current = false;
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const submitSearch = (value: string) => {
    restorePending.current = false;
    setSearchDraft(value);
    setSearch(value.trim());
    setPage(0);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const openSavedPost = async (summary: {id:number}) => {
    if(opening!==null)return;
    rememberView();
    setOpening(summary.id);
    try{
    const post=await utils.post.get.fetch({id:summary.id});
    if(!post)throw new Error("Post indisponível");
    // Item 7: reabre o post no editor oficial CanvasLab (rota /thevoid).
    // O modelo completo (canvas_model ou reconstrução heurística) viaja pelo
    // sessionStorage e é lido pelo StudioAppV2BPage no mount.
    const model = savedPostToCanvasModel(post);

    sessionStorage.setItem(
      "postspark.open_canvas_post",
      JSON.stringify({
        postId: post.id,
        revision: post.revision,
        inputType: post.inputType || "text",
        inputContent: post.inputContent || "",
        model,
      })
    );

    setLocation("/thevoid");
    }catch{toast.error("Não foi possível abrir o post. Tente novamente.");}finally{setOpening(null);}
  };

  return (
    <div className="min-h-screen bg-soul-deep px-4 pb-8 pt-3 text-foreground md:py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 sm:gap-6">
        <header className="flex items-center justify-between gap-3">
          <button onClick={() => setLocation("/")} className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />Voltar
          </button>
          <UserTopMenu variant="inline" compactMobile />
        </header>
        <section className="min-w-0 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-thermal-orange"><Bookmark size={16} />Posts salvos</div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Sua biblioteca</h1>
            <button type="button" onClick={() => setIsIngestOpen(true)} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 text-sm text-orange-400"><Sparkles size={16} />Replicar design</button>
          </div>
          <p className="text-sm text-muted-foreground" role="status">{isLoading ? "Carregando posts…" : `${data?.total ?? 0} ${search ? "resultados encontrados" : "posts salvos"}`}</p>
        </section>
        <form onSubmit={event => { event.preventDefault(); submitSearch(searchDraft); }} className="flex gap-2">
          <input aria-label="Buscar posts por título, design ou código" value={searchDraft} onChange={event => setSearchDraft(event.target.value)} maxLength={120} placeholder="Título, design ou código" className="min-h-12 min-w-0 flex-1 rounded-xl border border-white/15 bg-black/20 px-3 text-base" />
          <button type="submit" className="min-h-12 rounded-xl border border-white/15 px-4 text-sm">Buscar</button>
        </form>
        {search && <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><span className="break-all">Busca: {search}</span><button type="button" onClick={() => submitSearch("")} className="min-h-11 px-2 text-orange-400">Limpar busca</button></div>}
        <LibraryPagination page={page} total={data?.total ?? 0} disabled={Boolean(isFetching || isLoading)} onChange={changePage} label="Paginação superior" />
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            {[1, 2, 3, 4].map(item => (
              <div
                key={item}
                className="h-56 animate-pulse rounded-3xl border"
                style={{
                  background: "oklch(0.08 0.02 280)",
                  borderColor: "oklch(1 0 0 / 8%)",
                }}
              />
            ))}
          </div>
        ) : error ? (
          <motion.div
            className="rounded-3xl border px-6 py-16 text-center"
            style={{
              background: "oklch(0.08 0.02 280)",
              borderColor: "oklch(0.7 0.22 40 / 30%)",
            }}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="mx-auto flex max-w-md flex-col items-center gap-3">
              <Bookmark className="h-8 w-8 text-destructive" />
              <h2 className="text-xl font-semibold text-foreground">Erro ao carregar posts salvos</h2>
              <p className="text-sm text-muted-foreground">{error.message || "Não foi possível carregar a lista de posts."}</p>
              <button
                onClick={() => refetch()}
                className="mt-2 rounded-full border border-thermal-orange bg-thermal-orange/10 px-4 py-2 text-xs font-semibold text-thermal-orange hover:bg-thermal-orange/20 transition-colors"
              >
                Tentar novamente
              </button>
            </div>
          </motion.div>
        ) : posts && posts.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            {posts.map(post => (
              <motion.article
                key={post.id}
                className="flex min-w-0 overflow-hidden rounded-2xl border sm:block sm:rounded-3xl"
                style={{
                  background: "oklch(0.08 0.02 280)",
                  borderColor: "oklch(1 0 0 / 8%)",
                }}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <GalleryPreview post={post}/>

                <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-3 sm:gap-4 sm:p-5">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                      <span
                        className="rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-thermal-orange"
                        style={{
                          borderColor: "oklch(0.7 0.22 40 / 35%)",
                          background: "oklch(0.7 0.22 40 / 10%)",
                        }}
                      >
                        {post.platform}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{formatDate(post.createdAt)}</span>
                    </div>
                    <h2 className="line-clamp-2 break-words text-sm font-semibold tracking-tight text-foreground sm:text-lg">{post.headline || "Sem título"}</h2>
                    {post.designFamily && post.designName && <p className="line-clamp-1 text-xs text-muted-foreground">{designLabel({completeDesign:{family:post.designFamily,name:post.designName}})}</p>}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2">
                    <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5 text-thermal-orange" />
                      {post.postMode === "carousel" ? "Carrossel" : "Post único"}
                    </div>
                    <button
                      disabled={opening!==null} onClick={() => void openSavedPost(post)}
                      className="inline-flex min-h-11 items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold text-thermal-orange transition-colors hover:bg-thermal-orange/10 sm:min-h-0 sm:text-[11px]"
                      style={{ borderColor: "oklch(0.7 0.22 40 / 35%)" }}
                    >
                      {opening === post.id ? "Abrindo…" : "Abrir"}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        ) : (
          <motion.div
            className="rounded-3xl border px-6 py-16 text-center"
            style={{
              background: "oklch(0.08 0.02 280)",
              borderColor: "oklch(1 0 0 / 8%)",
            }}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="mx-auto flex max-w-md flex-col items-center gap-3">
              <Bookmark className="h-8 w-8 text-thermal-orange" />
              <h2 className="text-xl font-semibold text-foreground">{search ? "Nenhum resultado para esta busca" : "Nenhum post salvo ainda"}</h2>
              <p className="text-sm text-muted-foreground">{search ? "Experimente outro título, design ou código." : "Quando você salvar um post no editor, ele vai aparecer aqui."}</p>
              {search && <button type="button" onClick={() => submitSearch("")} className="min-h-11 rounded-xl border border-orange-500/30 px-4 text-sm text-orange-400">Mostrar todos os posts</button>}
            </div>
          </motion.div>
        )}
        {!!posts?.length && <LibraryPagination page={page} total={data?.total ?? 0} disabled={Boolean(isFetching || isLoading)} onChange={changePage} label="Paginação inferior" />}
      </div>

      {isIngestOpen && (
        <TemplateIngestionModal
          isOpen={isIngestOpen}
          onClose={() => {
            setIsIngestOpen(false);
            void refetch();
          }}
        />
      )}
    </div>
  );
}
