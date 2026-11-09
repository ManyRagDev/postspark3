import { useEffect, useState, type ReactNode } from "react";
import { Sparkles, Layers } from "lucide-react";
import type { CanvasPostModel } from "./types";
import { BACKGROUND_SLOT, mediaTargets, type MediaUpdate } from "../lib/mediaSlots";
import MediaSlotPanel from "./MediaSlotPanel";
import BackgroundsDrawer from "./BackgroundsDrawer";
import type { SeamlessPanoramaMeta } from "../lib/seamlessCarousel";

const button =
  "min-h-11 rounded-xl border border-white/15 bg-white/5 px-3 text-xs text-white hover:bg-white/10 transition-colors flex items-center justify-center gap-1.5 cursor-pointer";
const label = "block space-y-1 text-xs text-white/70";

export function CanvasMediaPanel({
  post,
  onMediaUpdate,
  onApplySeamlessPanorama,
  onOpenGhostView,
  selectedId,
  mediaPreview,
  onMediaPreview,
  onAddExtraImage,
  mode = "replace",
  backgroundColor,
  onBackgroundColorChange,
  onOpenReplacement,
  children,
}: {
  post: CanvasPostModel;
  onMediaUpdate: MediaUpdate;
  onApplySeamlessPanorama?: (panorama: SeamlessPanoramaMeta) => void;
  onOpenGhostView?: () => void;
  selectedId?: string | null;
  mediaPreview?: string;
  onMediaPreview?: (url: string | undefined) => void;
  mode?: "add" | "background" | "replace";
  backgroundColor?: string;
  onBackgroundColorChange?: (color: string) => void;
  onOpenReplacement?: (id: string) => void;
  children?: ReactNode;
  onAddExtraImage?: (
    url: string,
    width?: number,
    height?: number,
    slideId?: string
  ) => boolean | void | Promise<boolean | void>;
}) {
  const [manifest, setManifest] = useState<unknown>(null);
  const [open, setOpen] = useState(false);
  const [drawerInitialTab, setDrawerInitialTab] = useState<string>("all");

  const isCarousel = Boolean(post.slides && post.slides.length > 1);

  useEffect(() => {
    fetch("/images/backgrounds/manifest.json")
      .then(result => result.json())
      .then(setManifest)
      .catch(() => setManifest(null));
  }, []);

  const slide0 = post.slides[0];
  const slide0Bg = slide0?.composition?.version === 3
    ? slide0.composition.customBackground?.imageUrl
    : slide0?.bgImage;
  const hasSeamlessApplied = Boolean(slide0Bg && slide0Bg.includes("seamless-carousel"));

  return (
    <div className="space-y-4">
      {onOpenReplacement && mediaTargets(post).filter(target => target.replacement).map(target => (
        <button key={target.id} type="button" className={button + " w-full"}
          onClick={() => onOpenReplacement(target.id)}>
          {target.label}
        </button>
      ))}

      {mode === "background" && backgroundColor && onBackgroundColorChange && (
        <label className={label}>
          Cor de fundo
          <input
            type="color"
            aria-label="Cor de fundo"
            value={backgroundColor}
            onChange={event => onBackgroundColorChange(event.target.value)}
            className="block h-11 w-full bg-transparent"
          />
        </label>
      )}

      <MediaSlotPanel
        post={post}
        onUpdate={onMediaUpdate}
        selectedId={selectedId}
        retainedPreview={mediaPreview}
        onRetainPreview={onMediaPreview}
        fixedTargetId={
          mode === "background"
            ? BACKGROUND_SLOT
            : mode === "replace" && selectedId
              ? selectedId
              : undefined
        }
        addImage={mode === "add" ? onAddExtraImage : undefined}
      />

      {mode === "background" && (
        <div className="space-y-2 pt-1">
          {/* BOTÃO ESPECIAL DE SEAMLESS CAROUSEL (Visível exclusivamente para carrosséis) */}
          {isCarousel && (
            <button
              type="button"
              className="w-full min-h-11 rounded-xl bg-gradient-to-r from-[#FF5C00] to-orange-500 hover:brightness-110 text-white font-bold text-xs shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
              onClick={() => {
                setDrawerInitialTab("seamless");
                setOpen(true);
              }}
            >
              <Sparkles size={14} className="text-white animate-pulse" />
              <span>Seamless Carousel (Fundo Contínuo)</span>
            </button>
          )}

          {isCarousel && hasSeamlessApplied && onOpenGhostView && (
            <button
              type="button"
              className="w-full min-h-10 rounded-xl border border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20 text-orange-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              onClick={onOpenGhostView}
            >
              <Layers size={13} className="text-orange-400" />
              <span>Ver Tira Contínua em Fileira (Fantasma)</span>
            </button>
          )}

          <button
            type="button"
            className={button + " w-full"}
            onClick={() => {
              setDrawerInitialTab("all");
              setOpen(true);
            }}
          >
            Explorar biblioteca de texturas
          </button>
        </div>
      )}

      {children && (
        <details>
          <summary className="min-h-11 cursor-pointer text-sm text-white/80">
            Enquadramento e filtro
          </summary>
          <div className="pt-3">{children}</div>
        </details>
      )}

      <BackgroundsDrawer
        isOpen={open}
        onClose={() => setOpen(false)}
        post={post}
        manifestData={manifest}
        initialTab={drawerInitialTab}
        onApplyBackground={url => {
          const slideId = post.slides[post.currentSlideIndex]?.id;
          if (slideId)
            onMediaUpdate(
              { postId: post.id, slideId, slotId: BACKGROUND_SLOT },
              url ? { kind: "apply", url } : { kind: "remove" }
            );
        }}
        onApplySeamlessPanorama={onApplySeamlessPanorama}
      />
    </div>
  );
}
