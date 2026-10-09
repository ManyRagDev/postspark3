import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { CanvasPostModel } from "./types";
import {
  imageCompositionGuidance,
  imageDirectionsForPost,
  type ImageDirectionId,
} from "../lib/imageGenerationContext";
import { downloadImageFile } from "@/lib/downloadHelper";

interface ImageDirectionSuggestionsProps {
  post: CanvasPostModel;
  defaultPrompt?: string;
  busy: boolean;
  buttonLabel: string;
  busyLabel: string;
  onGenerate: (
    prompt: string,
    directionId: ImageDirectionId | "custom",
    useCompositionGuidance: boolean,
  ) => Promise<string | undefined>;
  onGenerated: (imageUrl: string) => void;
}

function targetKey(post: CanvasPostModel) {
  return `${post.id}:${post.slides[post.currentSlideIndex]?.id ?? post.currentSlideIndex}`;
}

/** Three editable image directions, shared by the desktop, mobile and guided editors. */
export default function ImageDirectionSuggestions({
  post,
  defaultPrompt = "",
  busy,
  buttonLabel,
  busyLabel,
  onGenerate,
  onGenerated,
}: ImageDirectionSuggestionsProps) {
  const currentTargetKey = targetKey(post);
  const latestTargetKey = useRef(currentTargetKey);
  latestTargetKey.current = currentTargetKey;
  const mountedRef = useRef(true);
  const onGeneratedRef = useRef(onGenerated);
  onGeneratedRef.current = onGenerated;
  const requestInFlight = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [draft, setDraft] = useState({
    target: currentTargetKey,
    prompt: defaultPrompt,
    directionId: null as ImageDirectionId | null,
    useCompositionGuidance: true,
  });
  const draftIsCurrent = draft.target === currentTargetKey;
  const prompt = draftIsCurrent ? draft.prompt : defaultPrompt;
  const directionId = draftIsCurrent ? draft.directionId : null;
  const useCompositionGuidance = draftIsCurrent
    ? draft.useCompositionGuidance
    : true;
  const directions = imageDirectionsForPost(post);
  const compositionGuidance = imageCompositionGuidance(post);

  useEffect(() => {
    if (draft.target !== currentTargetKey) {
      setDraft({
        target: currentTargetKey,
        prompt: defaultPrompt,
        directionId: null,
        useCompositionGuidance: true,
      });
    }
  }, [currentTargetKey, defaultPrompt, draft.target]);

  const updatePrompt = (value: string) =>
    setDraft({
      target: currentTargetKey,
      prompt: value,
      directionId: value === prompt ? directionId : null,
      useCompositionGuidance,
    });

  const generate = async () => {
    const submittedTarget = currentTargetKey;
    if (!prompt.trim() || prompt.length > 2000 || busy || requestInFlight.current) return;
    requestInFlight.current = true;
    try {
      const imageUrl = await onGenerate(
        prompt,
        directionId ?? "custom",
        useCompositionGuidance,
      );
      if (!imageUrl) return;
      if (!mountedRef.current || latestTargetKey.current !== submittedTarget) {
        toast.info("A imagem ficou pronta depois da troca de slide.", {
          action: {
            label: "Baixar imagem",
            onClick: () => downloadImageFile(imageUrl, "postspark-imagem-ia.png"),
          },
        });
        return;
      }
      onGeneratedRef.current(imageUrl);
    } finally {
      requestInFlight.current = false;
    }
  };

  return (
    <div className="space-y-2.5">
      <div>
        <p className="text-[11px] font-semibold text-white/85">Escolha uma direção</p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-white/50">
          São pontos de partida. Edite a descrição livremente antes de gerar.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
        {directions.map((direction) => {
          const selected = directionId === direction.id;
          return (
            <button
              key={direction.id}
              type="button"
              aria-pressed={selected}
              disabled={busy}
              onClick={() =>
                setDraft({
                  target: currentTargetKey,
                  prompt: direction.prompt,
                  directionId: direction.id,
                  useCompositionGuidance,
                })
              }
              className={`rounded-lg border p-2 text-left transition-colors disabled:opacity-50 ${
                selected
                  ? "border-[oklch(0.78_0.22_48)]/70 bg-[oklch(0.78_0.22_48)]/12"
                  : "border-white/10 bg-white/[0.025] hover:border-white/25 hover:bg-white/[0.06]"
              }`}
            >
              <span className="block text-[11px] font-semibold text-white">{direction.label}</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-white/55">{direction.description}</span>
            </button>
          );
        })}
      </div>
      <label className="block text-[11px] font-medium text-white/70">
        Descrição da imagem
        <textarea
          aria-label="Descrição da imagem"
          rows={3}
          maxLength={2000}
          value={prompt}
          disabled={busy}
          onChange={(event) => updatePrompt(event.target.value)}
          placeholder="Descreva qualquer assunto, produto, cena ou conceito..."
          className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-black/40 p-2.5 text-xs text-white outline-none placeholder:text-white/30 focus:border-[oklch(0.78_0.22_48)]"
        />
        <span className={`mt-1 block text-right text-[9px] ${prompt.length > 2000 ? "text-amber-200" : "text-white/35"}`}>
          {prompt.length}/2000 caracteres
        </span>
        {prompt.length > 2000 && (
          <span role="alert" className="block text-[10px] text-amber-200">
            A descrição precisa ter no máximo 2000 caracteres para gerar a imagem.
          </span>
        )}
      </label>
      <label className="flex cursor-pointer items-start gap-2 text-[10px] leading-relaxed text-white/75">
        <input
          type="checkbox"
          checked={useCompositionGuidance}
          disabled={busy}
          onChange={(event) =>
            setDraft({
              target: currentTargetKey,
              prompt,
              directionId,
              useCompositionGuidance: event.target.checked,
            })
          }
          className="mt-0.5 accent-[oklch(0.78_0.22_48)]"
        />
        <span>
          Considerar a composição do design
          <span className="mt-0.5 line-clamp-2 block text-white/45" title={compositionGuidance}>
            {compositionGuidance}
          </span>
        </span>
      </label>
      <button
        type="button"
        onClick={() => void generate()}
        disabled={busy || !prompt.trim() || prompt.length > 2000}
        className="w-full rounded-lg bg-[oklch(0.78_0.22_48)] px-3 py-2 text-xs font-bold text-black shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="inline-flex items-center justify-center gap-1.5">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {busy ? busyLabel : buttonLabel}
        </span>
      </button>
    </div>
  );
}
