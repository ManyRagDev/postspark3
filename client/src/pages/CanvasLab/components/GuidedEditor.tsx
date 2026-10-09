import { applyCompositionBackgroundImage } from "../lib/compositionEditing";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  Type,
  ImagePlus,
  Highlighter,
  Layers3,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import type { CanvasPostModel } from "./types";
import { CanvasPostStage } from "./CanvasPostStage";
import {
  COMPOSITIONS,
  composePost,
  fitAssistedEdit,
  fitAssistedContentEdit,
  guidedContentFields,
  restoreInitialVisual,
  type CompositionProposal,
} from "../lib/guidedComposition";

import GuidedBackgroundPanel from "./GuidedBackgroundPanel";
import { setContentSource } from "@shared/arsenalContent";
import { previewEmphasis, suggestEmphasis } from "../lib/guidedRefinements";

type Action = "text" | "image" | "visual" | "recover";
interface Props {
  post: CanvasPostModel;
  free: boolean;
  onFreeChange: (free: boolean) => void;
  onApply: (post: CanvasPostModel) => void;
  onImageTools: () => void;
  onReplicate?: () => void;
}
const button =
  "rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-xs font-semibold hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300";

export default function GuidedEditor({
  post,
  free,
  onFreeChange,
  onApply,
  onImageTools,
  onReplicate,
}: Props) {
  const [action, setAction] = useState<Action | null>(null);
  return (
    <>
      <nav
        aria-label="Personalizar post"
        className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b border-white/10 bg-[#10141d] px-3 py-2"
      >
        {!free && (
          <>
            <button className={button} onClick={() => setAction("text")}>
              <Type className="mr-1 inline" size={14} />
              Editar texto
            </button>
            <button className={button} onClick={() => setAction("image")}>
              <ImagePlus className="mr-1 inline" size={14} />
              Fundo e imagem
            </button>
            <button className={button} onClick={() => setAction("visual")}>
              <Highlighter className="mr-1 inline" size={14} />
              Destaque
            </button>
            {post.slides.length > 1 && onReplicate && (
              <button className={button} onClick={onReplicate}>
                <Layers3 className="mr-1 inline" size={14} />
                Aplicar estilo a outros slides
              </button>
            )}
          </>
        )}
        <button
          className={`${button} text-orange-200`}
          onClick={() => setAction("recover")}
        >
          <RotateCcw className="mr-1 inline" size={14} />
          Reorganizar visual
        </button>
        <button
          className={button}
          aria-pressed={free}
          onClick={() => onFreeChange(!free)}
        >
          <SlidersHorizontal className="mr-1 inline" size={14} />
          {free ? "Voltar à edição guiada" : "Edição livre"}
        </button>
      </nav>
      {action && (
        <GuidedEditorDialog
          key={`${post.id}-${post.slides[post.currentSlideIndex]?.id}-${action}`}
          post={post}
          action={action}
          onClose={() => setAction(null)}
          onApply={next => {
            onApply(next);
            setAction(null);
          }}
          onImageTools={() => {
            setAction(null);
            onImageTools();
          }}
        />
      )}
    </>
  );
}

export function GuidedEditorDialog({
  post,
  action,
  onClose,
  onApply,
  onImageTools,
}: {
  post: CanvasPostModel;
  action: Action;
  onClose: () => void;
  onApply: (post: CanvasPostModel) => void;
  onImageTools: () => void;
}) {
  const slide = post.slides[post.currentSlideIndex];
  const [contentDraft, setContentDraft] = useState(() =>
    slide?.composition ? structuredClone(slide.composition.content) : null
  );
  const [draft, setDraft] = useState({
    headline: slide?.headline ?? post.headline,
    subtext: slide?.subtext ?? post.subtext,
    caption: post.caption,
  });
  const [proposal, setProposal] = useState<CompositionProposal | null>(null);
  const [before, setBefore] = useState(false);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [mediaDraft, setMediaDraft] = useState(post);
  const [phrase, setPhrase] = useState(
    suggestEmphasis(slide?.headline ?? post.headline)
  );
  const descriptions = {
    text: "Ajuste suas palavras e confira o encaixe antes de aplicar.",
    image:
      "Crie uma imagem com IA, envie a sua ou escolha cores para o fundo. Confira a prévia antes de aplicar.",
    visual:
      "Realce um trecho do título mantendo suas palavras e a composição escolhida. Se a cor não tiver contraste suficiente, usamos sublinhado.",
    recover:
      "Compare antes de aplicar. Textos, imagem e logo são preservados ao reorganizar; posições, fontes, cores e efeitos podem mudar. Você pode desfazer.",
  };
  const titles = {
    text: "Editar texto",
    image: "Fundo e imagem",
    visual: "Destaque",
    recover: "Reorganizar visual",
  };
  const choose = (id: (typeof COMPOSITIONS)[number]["id"]) => {
    setSelected(id);
    setBefore(false);
    const base =
      action === "text"
        ? {
            ...post,
            caption: draft.caption,
            slides: post.slides.map((s, i) =>
              i === post.currentSlideIndex
                ? { ...s, headline: draft.headline, subtext: draft.subtext }
                : s
            ),
          }
        : mediaDraft;
    setProposal(composePost(base, id));
  };
  const previewImage = (url: string) => {
    if (slide?.composition) {
      const next = applyCompositionBackgroundImage(mediaDraft, url);
      setMediaDraft(next); setProposal({post: next}); setSelected(""); setBefore(false);
      return;
    }
    const next = {
      ...post,
      slides: post.slides.map((s, i) =>
        i === post.currentSlideIndex
          ? {
              ...s,
              bgImage: url,
              bgTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
              bgPlacement: {
                fitMode: "cover" as const,
                focalPoint: { x: 0.5, y: 0.5 },
              },
            }
          : s
      ),
    };
    setMediaDraft(next);
    const preferred = slide?.guidedComposition?.id || "image";
    const result = composePost(next, preferred);
    setProposal(result.post ? result : composePost(next, "balanced"));
    setSelected(result.post ? preferred : "balanced");
    setBefore(false);
  };
  const upload = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProposal({ error: "Escolha um arquivo de imagem." });
      return;
    }
    setBusy(true);
    try {
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = reject;
        image.src = url;
      });
      previewImage(url);
    } catch {
      setProposal({
        error: "Não foi possível abrir esta imagem. Tente outro arquivo.",
      });
    } finally {
      setBusy(false);
    }
  };
  const extras =
    (slide?.extraTexts ?? post.extraTexts ?? []).length +
    (slide?.extraImages ?? post.extraImages ?? []).length;
  return (
    <Dialog.Root
      open
      onOpenChange={open => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm" />
        <Dialog.Content
          onEscapeKeyDown={event => {
            if (busy) event.preventDefault();
          }}
          onInteractOutside={event => {
            if (busy) event.preventDefault();
          }}
          onKeyDown={event => {
            if (
              (event.ctrlKey || event.metaKey) &&
              ["z", "y"].includes(event.key.toLowerCase())
            )
              event.stopPropagation();
          }}
          className="fixed inset-x-2 top-[3dvh] z-[91] flex max-h-[94dvh] flex-col rounded-2xl border border-white/15 bg-[#10141d] text-white shadow-2xl sm:left-1/2 sm:w-[min(900px,calc(100vw-32px))] sm:-translate-x-1/2"
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-white/10 p-4">
            <div className="flex-1">
              <Dialog.Title className="font-semibold">
                {titles[action]}
                {post.slides.length > 1
                  ? ` · Slide ${post.currentSlideIndex + 1}`
                  : ""}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-relaxed text-white/65">
                {descriptions[action]}
              </Dialog.Description>
            </div>
            <Dialog.Close
              className={button}
              disabled={busy}
              aria-label="Cancelar personalização"
            >
              <X size={16} />
            </Dialog.Close>
          </header>
          <div className="grid min-h-0 overflow-y-auto p-4 sm:grid-cols-[1fr_1fr] gap-5">
            <div className="space-y-3">
              {action === "text" && (
                <>
                  {contentDraft ? (
                    <>
                      {guidedContentFields(contentDraft).map((field, index) => (
                        <label
                          key={`${field.source}:${field.itemId ?? ""}`}
                          className="block text-xs"
                        >
                          {field.label}
                          <textarea
                            aria-label={`${field.label} · bloco ${index + 1}`}
                            value={field.text}
                            rows={2}
                            className="mt-1 w-full rounded-lg border border-white/20 bg-black/30 p-3 text-sm select-text"
                            onChange={e => {
                              const value = e.target.value;
                              setContentDraft(previous => {
                                if (!previous) return previous;
                                const next = structuredClone(previous);
                                setContentSource(
                                  next,
                                  field.source,
                                  value,
                                  field.itemId
                                );
                                return next;
                              });
                              setProposal(null);
                            }}
                          />
                        </label>
                      ))}
                      <label className="block text-xs">
                        Legenda
                        <textarea
                          aria-label="Legenda"
                          value={contentDraft.caption}
                          rows={3}
                          className="mt-1 w-full rounded-lg border border-white/20 bg-black/30 p-3 text-sm select-text"
                          onChange={e => {
                            const caption = e.target.value;
                            setContentDraft(previous =>
                              previous ? { ...previous, caption } : previous
                            );
                            setProposal(null);
                          }}
                        />
                      </label>
                    </>
                  ) : (
                    (
                      [
                        ["headline", "Título"],
                        ["subtext", "Texto de apoio"],
                        ["caption", "Legenda"],
                      ] as const
                    ).map(([field, label]) => (
                      <label key={field} className="block text-xs">
                        {label}
                        <textarea
                          aria-label={label}
                          value={draft[field]}
                          onChange={e => {
                            setDraft({ ...draft, [field]: e.target.value });
                            setProposal(null);
                          }}
                          rows={field === "caption" ? 3 : 2}
                          className="mt-1 w-full rounded-lg border border-white/20 bg-black/30 p-3 text-sm select-text"
                        />
                      </label>
                    ))
                  )}
                  <button
                    className={button}
                    onClick={() => {
                      setBefore(false);
                      setProposal(
                        contentDraft
                          ? fitAssistedContentEdit(post, contentDraft)
                          : fitAssistedEdit(post, draft)
                      );
                    }}
                  >
                    Prévia com este texto
                  </button>
                  <p className="text-xs text-white/60">
                    O encaixe acontece na prévia, sem alterar suas palavras.
                  </p>
                </>
              )}
              {action === "image" && (
                <GuidedBackgroundPanel
                  post={post}
                  busy={busy}
                  onBusyChange={setBusy}
                  onImage={previewImage}
                  onUpload={upload}
                  onImageTools={onImageTools}
                  onProposal={next => {
                    setMediaDraft(next);
                    setProposal({ post: next });
                    setBefore(false);
                    setSelected("");
                  }}
                />
              )}
              {action === "visual" && (
                <>
                  <label className="block text-xs">
                    Trecho do título
                    <input
                      aria-label="Trecho do título"
                      value={phrase}
                      onChange={e => {
                        setPhrase(e.target.value);
                        setProposal(null);
                      }}
                      className="mt-1 w-full rounded-lg border border-white/20 bg-black/30 p-3 text-sm select-text"
                    />
                  </label>
                  <p className="text-xs text-white/60">
                    Escolha uma palavra, expressão ou número para chamar
                    atenção.
                  </p>
                  <div className="flex gap-2">
                    {(
                      [
                        ["color", "Cor de destaque"],
                        ["underline", "Sublinhado"],
                      ] as const
                    ).map(([treatment, label]) => (
                      <button
                        key={treatment}
                        className={button}
                        onClick={() => {
                          setBefore(false);
                          setProposal(previewEmphasis(post, phrase, treatment));
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {(action === "recover" ||
                (action === "text" && proposal?.error) ||
                (action === "image" &&
                  mediaDraft !== post &&
                  (mediaDraft.slides[post.currentSlideIndex]?.bgImage ??
                    mediaDraft.bgImage))) && (
                <div
                  className="grid grid-cols-3 gap-2 sm:grid-cols-1"
                  aria-label="Composições"
                >
                  {COMPOSITIONS.map(choice => (
                    <button
                      key={choice.id}
                      className={`${button} block w-full text-left ${selected === choice.id ? "border-orange-300 bg-orange-300/10" : ""}`}
                      aria-pressed={selected === choice.id}
                      disabled={busy}
                      onClick={() => choose(choice.id)}
                    >
                      <span className="block">
                        {action === "image"
                          ? {
                              headline: "Texto no topo",
                              image: "Texto na base",
                              balanced: "Texto ao centro",
                            }[choice.id]
                          : choice.label}
                      </span>
                      <span className="mt-1 hidden font-normal text-white/55 sm:block">
                        {choice.detail}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {action === "recover" && (
                <button
                  className={`${button} w-full`}
                  onClick={() => {
                    setSelected("initial");
                    setBefore(false);
                    setProposal(restoreInitialVisual(post));
                  }}
                >
                  Restaurar visual inicial
                </button>
              )}
              {extras > 0 && (
                <p className="text-xs text-amber-200">
                  Seus {extras} elementos livres permanecem nas posições atuais.
                  Confira possíveis sobreposições na prévia; você pode
                  ajustá-los na edição livre.
                </p>
              )}
              {proposal?.error && (
                <p
                  role="alert"
                  className="rounded-lg bg-amber-400/10 p-3 text-sm text-amber-200"
                >
                  {proposal.error} Seu conteúdo continua aqui.
                </p>
              )}
            </div>
            <div className="flex flex-col items-center gap-3">
              <button
                className={button}
                disabled={!proposal?.post}
                aria-pressed={before}
                onClick={() => setBefore(!before)}
              >
                {before ? "Ver proposta" : "Comparar com atual"}
              </button>
              <span className="text-xs text-white/60">
                {before || !proposal?.post ? "Atual" : "Proposta"}
              </span>
              <CanvasPostStage
                post={before || !proposal?.post ? post : proposal.post}
                zoom={0.72}
                isReadOnly
              />
            </div>
          </div>
          <footer className="flex shrink-0 justify-end gap-2 border-t border-white/10 p-4">
            <Dialog.Close disabled={busy} className={button}>
              Cancelar
            </Dialog.Close>
            <button
              disabled={!proposal?.post || busy}
              className="rounded-xl bg-orange-300 px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-35"
              onClick={() => {
                if (proposal?.post) onApply(proposal.post);
              }}
            >
              Aplicar ao slide
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
