import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { downloadImageFile } from "@/lib/downloadHelper";
import type { CanvasPostModel } from "./types";
import {
  COMPOSITION_BACKGROUND_ID,
  getEditorElementState,
} from "../lib/editorElementState";
import {
  imageDirectionsForPost,
  imageRequestForPost,
  type ImageDirectionId,
} from "../lib/imageGenerationContext";
import {
  BACKGROUND_SLOT,
  imageRequestForTarget,
  mediaTargets,
  targetExists,
  type MediaTarget,
  type MediaUpdate,
} from "../lib/mediaSlots";

const field =
  "w-full rounded-xl border border-white/12 bg-white/5 p-2.5 text-xs text-white outline-none focus:border-[oklch(0.78_0.22_48)] transition-colors mt-1";
const button =
  "min-h-11 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-xs font-semibold text-white/90 hover:bg-white/10 disabled:opacity-50 transition-all cursor-pointer";

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a foto."));
    reader.readAsDataURL(file);
  });
}

/** One media destination control for background and every named slot, on desktop and mobile. */
export default function MediaSlotPanel({
  post,
  onUpdate,
  selectedId,
  retainedPreview,
  onRetainPreview,
  fixedTargetId,
  addImage,
}: {
  post: CanvasPostModel;
  onUpdate: MediaUpdate;
  selectedId?: string | null;
  retainedPreview?: string;
  onRetainPreview?: (url: string | undefined) => void;
  fixedTargetId?: string;
  addImage?: (
    url: string,
    width?: number,
    height?: number,
    slideId?: string
  ) => boolean | void | Promise<boolean | void>;
}) {
  const latest = useRef({ post, onUpdate, onRetainPreview, addImage });
  latest.current = { post, onUpdate, onRetainPreview, addImage };
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [choice, setChoice] = useState(BACKGROUND_SLOT);
  const targets = mediaTargets(post);
  const selected = fixedTargetId
    ? targets.find(t => t.id === fixedTargetId)
    : (targets.find(t => t.id === choice) ?? targets[0]);
  const slideId = post.slides[post.currentSlideIndex]?.id;
  const key = `${slideId}:${selected?.id}`;
  const [draft, setDraft] = useState({
    key,
    prompt: addImage ? "" : (selected?.prompt ?? ""),
  });
  const prompt =
    draft.key === key ? draft.prompt : addImage ? "" : (selected?.prompt ?? "");
  const [busy, setBusy] = useState(false);
  const [useCompositionGuidance, setUseCompositionGuidance] = useState(true);
  const [directionId, setDirectionId] = useState<ImageDirectionId | "custom">(
    "custom"
  );
  const inFlight = useRef(false);
  const [localPreview, setPreview] = useState<string>();
  const preview = onRetainPreview ? retainedPreview : localPreview;
  const generate = trpc.post.generateImage.useMutation();
  const upload = trpc.post.saveMediaAsset.useMutation();
  useEffect(() => {
    if (selectedId === COMPOSITION_BACKGROUND_ID || selectedId === "background")
      setChoice(BACKGROUND_SLOT);
    else if (selectedId && targets.some(t => t.id === selectedId))
      setChoice(selectedId);
  }, [selectedId, slideId]);
  if (!selected || !slideId)
    return (
      <p className="text-sm text-white/70">
        A imagem selecionada não existe mais. Escolha outra imagem em Camadas ou
        use Adicionar imagem.
      </p>
    );
  const capture = (): MediaTarget => ({
    postId: post.id,
    slideId,
    slotId: selected.id,
  });
  const elementId = (document: CanvasPostModel, target: MediaTarget) =>
    target.slotId !== BACKGROUND_SLOT
      ? target.slotId
      : document.slides.find(slide => slide.id === target.slideId)?.composition
        ? COMPOSITION_BACKGROUND_ID
        : "background";
  const locked =
    !addImage &&
    getEditorElementState(post, slideId, elementId(post, capture())).locked;
  const keepOrApply = async (
    url: string,
    target: MediaTarget
  ): Promise<boolean> => {
    const current = latest.current;
    if (
      current.addImage &&
      current.post.id === target.postId &&
      current.post.slides.some(slide => slide.id === target.slideId)
    ) {
      const dimensions = await new Promise<{ width?: number; height?: number }>(
        resolve => {
          const image = new Image();
          const timer = setTimeout(() => resolve({}), 5000);
          image.onload = () => {
            clearTimeout(timer);
            resolve({ width: image.naturalWidth, height: image.naturalHeight });
          };
          image.onerror = () => {
            clearTimeout(timer);
            resolve({});
          };
          image.src = url;
        }
      );
      if (
        latest.current.post.id === target.postId &&
        latest.current.post.slides.some(slide => slide.id === target.slideId)
      ) {
        const added = await latest.current.addImage?.(
          url,
          dimensions.width,
          dimensions.height,
          target.slideId
        );
        if (added !== false) return true;
      }
    }
    if (current.addImage) {
      current.onRetainPreview?.(url);
      if (mounted.current && !current.onRetainPreview) setPreview(url);
      toast.info(
        "O slide foi removido. A imagem está disponível para baixar ou adicionar em outro slide."
      );
      return false;
    }
    if (
      targetExists(current.post, target) &&
      !getEditorElementState(
        current.post,
        target.slideId,
        elementId(current.post, target)
      ).locked
    ) {
      const applied = current.onUpdate(target, { kind: "apply", url });
      if (applied !== false) {
        toast.success("Imagem aplicada no destino escolhido.");
        return true;
      } else if (mounted.current && !current.onRetainPreview) setPreview(url);
      else current.onRetainPreview?.(url);
    } else {
      current.onRetainPreview?.(url);
      if (mounted.current && !current.onRetainPreview) setPreview(url);
      toast.info(
        "O destino foi removido ou bloqueado. Sua imagem está disponível para outro espaço.",
        {
          action: {
            label: "Baixar imagem",
            onClick: () => downloadImageFile(url, "postspark-imagem.png"),
          },
        }
      );
    }
    return false;
  };
  const generateImage = async () => {
    if (locked || inFlight.current || !prompt.trim() || prompt.length > 2000)
      return;
    const target = capture();
    inFlight.current = true;
    setBusy(true);
    try {
      const document = latest.current.post;
      const options = { directionId, useCompositionGuidance };
      const request = addImage
        ? imageRequestForPost(
            {
              ...document,
              currentSlideIndex: document.slides.findIndex(
                slide => slide.id === target.slideId
              ),
            },
            prompt,
            options
          )
        : imageRequestForTarget(document, target, prompt, options);
      if (!addImage)
        latest.current.onUpdate(target, { kind: "prompt", prompt });
      const result = await generate.mutateAsync({
        ...request,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.imageUrl) throw new Error("Nenhuma imagem retornada.");
      await keepOrApply(result.imageUrl, target);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const sendFile = async (file?: File) => {
    if (!file || locked || inFlight.current) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 8 * 1024 * 1024
    ) {
      toast.error("Use uma imagem PNG, JPEG ou WebP de até 8 MB.");
      return;
    }
    const target = capture();
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await upload.mutateAsync({
        imageData: await readImage(file),
      });
      await keepOrApply(result.url, target);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <div
      className="space-y-3 rounded-xl border border-white/10 bg-white/4 p-3.5 text-white"
      data-media-slot-panel
    >
      {locked && (
        <p role="status" className="text-xs text-amber-200">
          Desbloqueie este destino em Camadas para alterar a imagem.
        </p>
      )}
      {!addImage && !fixedTargetId && (
        <label className="block text-[11px] uppercase tracking-wider text-white/50 font-semibold">
          Destino da imagem
          <select
            aria-label="Destino da imagem"
            className={field}
            value={selected.id}
            onChange={e => setChoice(e.target.value)}
          >
            {targets.map(t => (
              <option key={t.id} value={t.id}>
                {t.label}
                {t.id !== BACKGROUND_SLOT && !t.url ? " · imagem pendente" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="text-xs text-white/60 leading-relaxed">
        {addImage
          ? "Crie uma imagem sobre a arte. O fundo e as fotos existentes serão preservados."
          : selected.id === BACKGROUND_SLOT
            ? "Imagem de fundo deste slide."
            : `Substituir ${selected.label.toLowerCase()}. As outras imagens serão preservadas.`}
      </p>
      {!addImage && selected.url && (
        <div className="space-y-2.5 pt-2 border-t border-white/10">
          <img
            src={selected.url}
            alt={selected.label}
            className="max-h-24 w-full rounded-xl object-cover border border-white/10 bg-black/40"
          />
          <details>
            <summary className="min-h-11 cursor-pointer text-xs text-white/80">
              Ajustar imagem atual
            </summary>
            <div className="space-y-2.5">
              <button
                type="button"
                className={`${button} w-full`}
                onClick={() =>
                  downloadImageFile(
                    selected.url!,
                    `postspark-imagem-${slideId}.png`
                  )
                }
              >
                Baixar imagem original
              </button>
              <button
                type="button"
                className={`${button} w-full border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20`}
                disabled={locked}
                onClick={() => onUpdate(capture(), { kind: "remove" })}
              >
                Remover imagem
              </button>
              {(["focalX", "focalY"] as const).map(axis => (
                <label className="block text-xs text-white/70" key={axis}>
                  Ponto focal {axis === "focalX" ? "horizontal" : "vertical"}
                  <input
                    aria-label={`Enquadramento ${axis}`}
                    type="range"
                    disabled={locked}
                    min="0"
                    max="1"
                    step="0.01"
                    value={selected[axis]}
                    className="min-h-11 w-full mt-1 accent-[oklch(0.78_0.22_48)]"
                    onChange={e =>
                      onUpdate(capture(), {
                        kind: "focal",
                        [axis]: Number(e.target.value),
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </details>
        </div>
      )}
      <details className="rounded-xl border border-white/10 p-2">
        <summary className="min-h-11 cursor-pointer text-xs text-white/80">
          Sugestões de direção
        </summary>
        <div className="grid gap-1">
          {imageDirectionsForPost(post).map(direction => (
            <button
              type="button"
              key={direction.id}
              className={`${button} text-left`}
              onClick={() => {
                setDraft({ key, prompt: direction.prompt });
                setDirectionId(direction.id);
              }}
            >
              <span className="block">{direction.label}</span>
              <span className="block text-white/50">
                {direction.description}
              </span>
            </button>
          ))}
        </div>
      </details>
      <label className="block text-[11px] uppercase tracking-wider text-white/50 font-semibold pt-1">
        Gerar ou enviar imagem
        <textarea
          aria-label="Descrição da imagem do destino"
          value={prompt}
          maxLength={2000}
          disabled={locked}
          rows={3}
          placeholder="Descreva a cena ou estilo da imagem para gerar com IA..."
          className={
            field + " resize-none font-normal normal-case tracking-normal"
          }
          onChange={e => {
            setDraft({ key, prompt: e.target.value });
            setDirectionId("custom");
          }}
          onBlur={() => {
            if (!addImage && prompt !== selected.prompt)
              onUpdate(capture(), { kind: "prompt", prompt });
          }}
        />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-xs text-white/80">
        <input
          type="checkbox"
          checked={useCompositionGuidance}
          disabled={busy}
          onChange={event => setUseCompositionGuidance(event.target.checked)}
        />
        Considerar a composição do design
      </label>
      <div className="grid grid-cols-1 gap-2">
        <button
          type="button"
          className="min-h-11 w-full rounded-xl bg-[oklch(0.78_0.22_48)] hover:brightness-110 px-3 py-2.5 text-xs font-bold text-black disabled:opacity-40 transition-all cursor-pointer"
          disabled={locked || busy || !prompt.trim() || prompt.length > 2000}
          onClick={() => void generateImage()}
        >
          {busy ? "Preparando imagem…" : "Gerar imagem com IA"}
        </button>
        <label
          className={`${button} block text-center border-dashed border-white/20`}
        >
          Enviar ou trocar foto do dispositivo
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={locked || busy}
            className="sr-only"
            aria-label="Enviar imagem no destino"
            onChange={e => {
              void sendFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {preview && (
        <div className="space-y-2 rounded-xl border border-amber-300/40 bg-amber-500/10 p-2.5">
          <p className="text-xs text-amber-200">
            Imagem pronta sem destino. Escolha um espaço acima para aplicar.
          </p>
          <img
            src={preview}
            alt="Imagem pronta para aplicação"
            className="max-h-36 w-full object-contain rounded-lg"
          />
          <button
            type="button"
            className={button + " w-full"}
            disabled={locked || busy}
            onClick={() => {
              void keepOrApply(preview, capture()).then(applied => {
                if (applied) {
                  setPreview(undefined);
                  onRetainPreview?.(undefined);
                }
              });
            }}
          >
            {addImage ? "Adicionar neste slide" : "Aplicar no destino atual"}
          </button>
        </div>
      )}
    </div>
  );
}
