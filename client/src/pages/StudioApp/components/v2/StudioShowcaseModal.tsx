import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Edit3, Maximize2, Sparkles, X } from "lucide-react";
import type { CanvasPostModel } from "@/pages/CanvasLab/components/types";
import {
  openShowcaseDocument,
  SHOWCASE_ITEMS,
  showcasePreviewUrl,
  type ShowcaseItem,
} from "./showcaseData";

interface StudioShowcaseModalProps {
  onClose: () => void;
  currentPrompt?: string;
  onOpenEditor: (model: CanvasPostModel) => void;
  onGenerateFromExample: (item: ShowcaseItem, topic: string) => void;
}

const categories = ["Todos", ...Array.from(new Set(SHOWCASE_ITEMS.map(item => item.category)))];
const secondaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50";
const primaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-orange-500 px-3 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50";

export default function StudioShowcaseModal({
  onClose,
  currentPrompt = "",
  onOpenEditor,
  onGenerateFromExample,
}: StudioShowcaseModalProps) {
  const [category, setCategory] = useState("Todos");
  const [preview, setPreview] = useState<ShowcaseItem | null>(null);
  const [slide, setSlide] = useState(0);
  const [prompting, setPrompting] = useState<ShowcaseItem | null>(null);
  const [topic, setTopic] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState("");
  const openingRequest = useRef<symbol | null>(null);
  const modal = useRef<HTMLDivElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    return () => {
      openingRequest.current = null;
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected)
        previouslyFocused.focus();
    };
  }, []);

  useEffect(() => {
    if (scrollArea.current) scrollArea.current.scrollTop = 0;
  }, [category, preview, prompting]);

  useEffect(() => {
    if (!prompting) modal.current?.focus();
  }, [preview, prompting]);

  const items = category === "Todos"
    ? SHOWCASE_ITEMS
    : SHOWCASE_ITEMS.filter(item => item.category === category);

  const showPreview = (item: ShowcaseItem) => {
    setError("");
    setSlide(0);
    setPreview(item);
  };

  const startPrompt = (item: ShowcaseItem) => {
    setError("");
    setTopic(currentPrompt.trim() || item.suggestedPrompt);
    setPrompting(item);
  };

  const edit = async (item: ShowcaseItem) => {
    if (openingRequest.current) return;
    const request = Symbol();
    openingRequest.current = request;
    setError("");
    setOpening(item.id);
    try {
      const post = await openShowcaseDocument(item);
      if (openingRequest.current !== request) return;
      onOpenEditor(post);
      onClose();
    } catch {
      if (openingRequest.current === request)
        setError("Não foi possível abrir este exemplo. Tente novamente.");
    } finally {
      if (openingRequest.current === request) {
        openingRequest.current = null;
        setOpening(null);
      }
    }
  };

  const back = () => {
    if (prompting) setPrompting(null);
    else if (preview) setPreview(null);
    else onClose();
    setError("");
  };

  const actions = (item: ShowcaseItem) => (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={secondaryButton} disabled={opening !== null} onClick={() => void edit(item)}>
        <Edit3 size={14} aria-hidden />
        {opening === item.id ? "Abrindo…" : "Editar no CanvasLab"}
      </button>
      <button type="button" className={primaryButton} disabled={opening !== null} onClick={() => startPrompt(item)}>
        <Sparkles size={14} aria-hidden />
        Criar com IA neste design
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-xl sm:p-6">
      <div
        ref={modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-showcase-title"
        tabIndex={-1}
        onKeyDown={event => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          back();
        }}
        className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0E1015] shadow-2xl focus:outline-none"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-6">
          <div>
            <h2 id="studio-showcase-title" className="flex items-center gap-2 text-base font-semibold text-white sm:text-lg">
              <Sparkles size={17} className="text-orange-500" aria-hidden />
              O que dá pra fazer com o PostSpark?
            </h2>
            <p className="mt-1 text-xs text-white/60">
              Veja posts e carrosséis editáveis. Abra o design no CanvasLab ou leve a ideia para uma nova criação.
            </p>
          </div>
          <button type="button" aria-label="Fechar vitrine" onClick={onClose} className={secondaryButton}>
            <X size={16} aria-hidden />
          </button>
        </header>

        <div ref={scrollArea} className="overflow-y-auto px-4 py-4 sm:px-6">
          {error && <p role="alert" className="mb-4 rounded-lg bg-red-950 px-3 py-2 text-sm text-red-200">{error}</p>}

          {prompting ? (
            <form
              className="mx-auto max-w-xl space-y-4 py-4"
              onSubmit={event => {
                event.preventDefault();
                if (!topic.trim()) return;
                onGenerateFromExample(prompting, topic.trim());
                onClose();
              }}
            >
              <button type="button" className={secondaryButton} onClick={back}>
                <ChevronLeft size={15} aria-hidden /> Voltar
              </button>
              <h3 className="text-lg font-semibold text-white">Criar a partir de {prompting.title}</h3>
              <p className="text-sm text-white/65">
                A IA adapta o seu tema para os campos deste design e entrega uma proposta editável.
              </p>
              <label htmlFor="showcase-topic" className="block text-sm text-white">Qual é o seu tema?</label>
              <textarea
                id="showcase-topic"
                autoFocus
                value={topic}
                onChange={event => setTopic(event.target.value)}
                rows={4}
                className="w-full rounded-xl border border-white/15 bg-black/50 p-3 text-sm text-white focus:border-orange-500 focus:outline-none"
              />
              <button type="submit" disabled={!topic.trim()} className={primaryButton}>
                {prompting.slideCount > 1 ? "Gerar carrossel" : "Gerar post"}
              </button>
            </form>
          ) : preview ? (
            <div className="grid items-center gap-6 md:grid-cols-2">
              <div className="mx-auto w-full max-w-[360px]">
                <img
                  src={showcasePreviewUrl(preview, slide)}
                  alt={preview.slideCount > 1 ? `${preview.title}, slide ${slide + 1}` : preview.title}
                  width={540}
                  height={675}
                  className="w-full rounded-xl border border-white/10"
                />
                {preview.slideCount > 1 && (
                  <div className="mt-2 flex items-center justify-between text-xs text-white/70">
                    <button type="button" aria-label="Slide anterior" disabled={slide === 0} className={secondaryButton} onClick={() => setSlide(slide - 1)}>
                      <ChevronLeft size={16} aria-hidden />
                    </button>
                    <span aria-live="polite">{slide + 1} de {preview.slideCount}</span>
                    <button type="button" aria-label="Próximo slide" disabled={slide + 1 === preview.slideCount} className={secondaryButton} onClick={() => setSlide(slide + 1)}>
                      <ChevronRight size={16} aria-hidden />
                    </button>
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <button type="button" className={secondaryButton} onClick={back}>
                  <ChevronLeft size={15} aria-hidden /> Todos os exemplos
                </button>
                <h3 className="text-xl font-bold text-white">{preview.title}</h3>
                <p className="text-sm text-white/65">{preview.description}</p>
                {actions(preview)}
              </div>
            </div>
          ) : (
            <>
              <div aria-label="Categorias da vitrine" className="mb-4 flex flex-wrap gap-2">
                {categories.map(value => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={category === value}
                    onClick={() => setCategory(value)}
                    className={category === value ? primaryButton : secondaryButton}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map(item => (
                  <article key={item.id} className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
                    <button type="button" aria-label={`Ver ${item.title}`} onClick={() => showPreview(item)} className="block w-full cursor-zoom-in focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-orange-500">
                      <img src={showcasePreviewUrl(item)} alt="" width={540} height={675} loading="lazy" className="w-full" />
                    </button>
                    <div className="space-y-3 p-3">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                          <button type="button" aria-label={`Ampliar prévia de ${item.title}`} onClick={() => showPreview(item)} className="rounded p-1 text-white/60 hover:text-white">
                            <Maximize2 size={14} aria-hidden />
                          </button>
                        </div>
                        <p className="text-[10px] font-semibold text-orange-300">
                          {item.slideCount > 1 ? `Carrossel · ${item.slideCount} slides` : `${item.category} · 4:5`}
                        </p>
                        <p className="mt-1 text-xs text-white/65">{item.description}</p>
                      </div>
                      {actions(item)}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
