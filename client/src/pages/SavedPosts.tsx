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
  const baseHeight = canvasModel?.aspectRatio === "9:16" ? 640 : canvasModel?.aspectRatio === "5:6" ? 432 : 360;
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
    <div ref={containerRef} className="relative flex h-52 items-center justify-center overflow-hidden bg-black/25 p-3 sm:h-72 lg:h-96">
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

export default function SavedPosts() {
  const [, setLocation] = useLocation();
  const { data: posts, isLoading, error, refetch } = trpc.post.list.useQuery();

  const openSavedPost = (post: any) => {
    // Item 7: reabre o post no editor oficial CanvasLab (rota /thevoid).
    // O modelo completo (canvas_model ou reconstrução heurística) viaja pelo
    // sessionStorage e é lido pelo StudioAppV2BPage no mount.
    const model = savedPostToCanvasModel(post);

    sessionStorage.setItem(
      "postspark.open_canvas_post",
      JSON.stringify({
        postId: post.id,
        inputType: post.inputType || "text",
        inputContent: post.inputContent || "",
        model,
      })
    );

    setLocation("/thevoid");
  };

  return (
    <div className="min-h-screen bg-soul-deep px-4 py-12 text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <button onClick={() => setLocation("/")} className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>

        <motion.div
          className="rounded-3xl border p-6"
          style={{
            background: "oklch(0.08 0.02 280)",
            borderColor: "oklch(1 0 0 / 8%)",
          }}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-thermal-orange">
                <Bookmark className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-[0.2em]">Posts Salvos</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sua biblioteca</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">Acesse rapidamente os posts que você já consolidou no PostSpark.</p>
            </div>
            <div
              className="rounded-2xl border px-4 py-3 text-right"
              style={{
                background: "oklch(1 0 0 / 4%)",
                borderColor: "oklch(1 0 0 / 8%)",
              }}
            >
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Total</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{posts?.length ?? 0}</p>
            </div>
          </div>
        </motion.div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
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
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {posts.map(post => (
              <motion.article
                key={post.id}
                className="min-w-0 overflow-hidden rounded-3xl border"
                style={{
                  background: "oklch(0.08 0.02 280)",
                  borderColor: "oklch(1 0 0 / 8%)",
                }}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <SavedPostPreview post={post} />

                <div className="space-y-4 p-3 sm:p-5">
                  <div className="space-y-2">
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
                    <h2 className="line-clamp-2 break-words text-base font-semibold tracking-tight text-foreground sm:text-lg">{post.headline || "Sem título"}</h2>
                    <p className="line-clamp-3 break-words text-sm text-muted-foreground">{post.body || post.inputContent}</p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/6 pt-4">
                    <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5 text-thermal-orange" />
                      {post.layout || "layout livre"}
                    </div>
                    <button
                      onClick={() => openSavedPost(post)}
                      className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold text-thermal-orange transition-colors hover:bg-thermal-orange/10"
                      style={{ borderColor: "oklch(0.7 0.22 40 / 35%)" }}
                    >
                      Abrir
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
              <h2 className="text-xl font-semibold text-foreground">Nenhum post salvo ainda</h2>
              <p className="text-sm text-muted-foreground">Quando você consolidar um post no editor, ele vai aparecer aqui.</p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
