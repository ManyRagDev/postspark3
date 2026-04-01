import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Bookmark, Image as ImageIcon, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useEditorStore } from "@/store/editorStore";
import type { PostVariation, PostMode, Platform, CarouselSlide, AspectRatio } from "@shared/postspark";
import { layoutToAdvanced } from "@/components/views/WorkbenchRefactored";

function formatDate(value: string | null | undefined) {
  if (!value) return "Sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export default function SavedPosts() {
  const [, setLocation] = useLocation();
  const { data: posts, isLoading } = trpc.post.list.useQuery();

  const openSavedPost = (post: any) => {
    const editorStore = useEditorStore.getState();
    const slides = Array.isArray(post.slides) ? post.slides as CarouselSlide[] : [];
    const normalizedVariation: PostVariation = {
      id: `saved-${post.id}`,
      headline: post.headline || "",
      body: post.body || "",
      caption: post.caption || "",
      hashtags: Array.isArray(post.hashtags) ? post.hashtags : [],
      callToAction: post.callToAction || "",
      tone: post.tone || "",
      platform: (post.platform || "instagram") as Platform,
      imagePrompt: post.imagePrompt || "",
      imageUrl: post.imageUrl || undefined,
      backgroundColor: post.backgroundColor || "#0f1117",
      textColor: post.textColor || "#ffffff",
      accentColor: post.accentColor || "#d4af37",
      layout: post.layout || "centered",
      aspectRatio: "1:1" as AspectRatio,
      postMode: (post.postMode || "static") as PostMode,
      slides,
      copyAngle: post.copy_angle || undefined,
      textElements: Array.isArray(post.textElements) ? post.textElements : undefined,
      imageSettings: post.image_settings || undefined,
      layoutSettings: post.layout_settings || layoutToAdvanced(post.layout || "centered"),
      bgValue: post.bg_value || (post.imageUrl
        ? { type: "ai", url: post.imageUrl }
        : { type: "solid", color: post.backgroundColor || "#0f1117" }),
      bgOverlay: post.bg_overlay || undefined,
    };

    editorStore.reset();
    editorStore.setActiveVariation(normalizedVariation);
    editorStore.setPlatform(normalizedVariation.platform);
    editorStore.setAspectRatio(normalizedVariation.aspectRatio || "1:1");
    editorStore.setPostMode(normalizedVariation.postMode || "static");
    editorStore.setSlides(slides);
    editorStore.setBgValue((normalizedVariation as any).bgValue);
    if ((normalizedVariation as any).bgOverlay) {
      editorStore.setBgOverlay((normalizedVariation as any).bgOverlay);
    }
    if ((normalizedVariation as any).layoutSettings) {
      editorStore.updateLayoutSettings((normalizedVariation as any).layoutSettings);
    }

    sessionStorage.setItem("postspark.open_saved_post", JSON.stringify({
      type: post.inputType || "text",
      content: post.inputContent || "",
    }));

    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-soul-deep px-4 py-12 text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
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
              <p className="max-w-2xl text-sm text-muted-foreground">
                Acesse rapidamente os posts que você já consolidou no PostSpark.
              </p>
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4].map((item) => (
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
        ) : posts && posts.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {posts.map((post) => (
              <motion.article
                key={post.id}
                className="overflow-hidden rounded-3xl border"
                style={{
                  background: "oklch(0.08 0.02 280)",
                  borderColor: "oklch(1 0 0 / 8%)",
                }}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div
                  className="relative flex h-40 items-center justify-center overflow-hidden"
                  style={{
                    background: post.imageUrl
                      ? `center / cover no-repeat url(${post.imageUrl})`
                      : post.backgroundColor || "oklch(0.12 0.03 280)",
                  }}
                >
                  {!post.imageUrl && (
                    <div className="flex items-center gap-2 text-sm font-medium text-white/80">
                      <ImageIcon className="h-4 w-4" />
                      Prévia sem imagem
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/10" />
                </div>

                <div className="space-y-4 p-5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-thermal-orange"
                        style={{ borderColor: "oklch(0.7 0.22 40 / 35%)", background: "oklch(0.7 0.22 40 / 10%)" }}>
                        {post.platform}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{formatDate(post.createdAt)}</span>
                    </div>
                    <h2 className="line-clamp-2 text-lg font-semibold tracking-tight text-foreground">
                      {post.headline || "Sem título"}
                    </h2>
                    <p className="line-clamp-3 text-sm text-muted-foreground">
                      {post.body || post.inputContent}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-white/6 pt-4">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
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
              <p className="text-sm text-muted-foreground">
                Quando você consolidar um post no editor, ele vai aparecer aqui.
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
