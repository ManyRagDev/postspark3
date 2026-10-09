import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import type { CanvasPostModel } from "./types";
import { imageRequestForPost } from "../lib/imageGenerationContext";
import { composePost } from "../lib/guidedComposition";
import { resolveSlideAppearance } from "../lib/slideReplication";
import {
  GUIDED_PALETTES,
  previewSolidBackground,
} from "../lib/guidedRefinements";
import { downloadImageFile } from "@/lib/downloadHelper";
import ImageDirectionSuggestions from "./ImageDirectionSuggestions";
import type { ImageDirectionId } from "../lib/imageGenerationContext";

const button =
  "rounded-xl border border-white/15 px-3 py-2.5 text-xs font-semibold hover:bg-white/10 disabled:opacity-40";
export default function GuidedBackgroundPanel({
  post,
  busy,
  onBusyChange,
  onImage,
  onProposal,
  onUpload,
  onImageTools,
}: {
  post: CanvasPostModel;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onImage: (url: string) => void;
  onProposal: (post: CanvasPostModel) => void;
  onUpload: (file?: File) => Promise<void>;
  onImageTools: () => void;
}) {
  const [tab, setTab] = useState<"ai" | "upload" | "color">("ai");
  const slide = post.slides[post.currentSlideIndex];
  const initialPrompt =
    slide?.imagePrompt ||
    post.imagePrompt ||
    `Crie uma imagem editorial que represente: ${slide?.headline ?? post.headline}. ${slide?.subtext ?? post.subtext}. Sem texto na imagem.`;
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState("");
  const inFlight = useRef(false);
  const mutation = trpc.post.generateImage.useMutation();
  const utils = trpc.useUtils();
  const generate = async (
    prompt: string,
    directionId: ImageDirectionId | "custom",
    useCompositionGuidance: boolean,
  ) => {
    if (!prompt.trim() || inFlight.current) return;
    inFlight.current = true;
    onBusyChange(true);
    setError("");
    try {
      // Plan the reading zone before generating; apply exactly this composition after the result.
      const planned = slide?.composition ? {post} : composePost(
        post,
        slide?.guidedComposition?.id || "image"
      );
      const fallback = planned.post ? planned : composePost(post, "balanced");
      if (!fallback.post) throw new Error(fallback.error);
      const requestPost = {
        ...resolveSlideAppearance(fallback.post, post.currentSlideIndex),
      };
      const result = await mutation.mutateAsync(
        {...imageRequestForPost(requestPost, prompt, { directionId, useCompositionGuidance }), idempotencyKey: crypto.randomUUID()}
      );
      if (!result.imageUrl)
        throw new Error("A geração não retornou uma imagem. Tente novamente.");
      return result.imageUrl;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível gerar a imagem. Tente novamente."
      );
    } finally {
      inFlight.current = false;
      onBusyChange(false);
      void utils.billing.getProfile.invalidate();
    }
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1" aria-label="Origem do fundo">
        {(
          [
            ["ai", "Criar com IA"],
            ["upload", "Enviar imagem"],
            ["color", "Usar cores"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            disabled={busy}
            aria-pressed={tab === id}
            className={`${button} ${tab === id ? "bg-orange-300/15 text-orange-200" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "ai" && (
        <>
          <ImageDirectionSuggestions
            post={post}
            defaultPrompt={initialPrompt}
            busy={busy}
            buttonLabel={generated ? "Gerar outra imagem com IA" : "Gerar imagem com IA"}
            busyLabel="Criando imagem…"
            onGenerate={generate}
            onGenerated={imageUrl => {
              setGenerated(imageUrl);
              onImage(imageUrl);
            }}
          />
          <p className="text-xs text-white/55">
            Cada geração usa Sparks. A imagem só entra no post quando você
            aplica a prévia.
          </p>
          {generated && (
            <button
              className={button}
              onClick={() =>
                downloadImageFile(generated, "postspark-imagem-ia.png")
              }
            >
              Baixar imagem gerada
            </button>
          )}
          {error && (
            <p role="alert" className="text-sm text-amber-200">
              {error}
            </p>
          )}
        </>
      )}
      {tab === "upload" && (
        <label className={`${button} block`}>
          Escolher imagem do dispositivo
          <input
            aria-label="Enviar imagem do dispositivo"
            type="file"
            accept="image/*"
            disabled={busy}
            className="mt-2 block w-full text-xs"
            onChange={e => void onUpload(e.target.files?.[0])}
          />
        </label>
      )}
      {tab === "color" && (
        <>
          <p className="text-xs text-white/65">
            Use um fundo de cores sem fotografia. A composição e a tipografia
            escolhidas são mantidas.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {GUIDED_PALETTES.map(palette => (
              <button
                key={palette.name}
                className={`${button} text-left`}
                onClick={() =>
                  onProposal(
                    previewSolidBackground(
                      post,
                      palette.background,
                      palette.accent
                    )
                  )
                }
              >
                <span className="mb-2 flex overflow-hidden rounded-md border border-white/15">
                  <span
                    className="h-7 w-1/2"
                    style={{ background: palette.background }}
                  />
                  <span
                    className="h-7 w-1/2"
                    style={{ background: palette.accent }}
                  />
                </span>
                {palette.name}
              </button>
            ))}
          </div>
        </>
      )}
      <button
        className={`${button} w-full`}
        disabled={busy}
        onClick={onImageTools}
      >
        Abrir biblioteca e ajustes avançados
      </button>
    </div>
  );
}
