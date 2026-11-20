import { useId, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/useMobile";
import { setContentSource } from "@shared/arsenalContent";
import { CanvasPostStage, type CanvasPostStageRef } from "./CanvasPostStage";
import type { CanvasPostModel } from "./types";
import { fitAssistedContentEdit, guidedContentFields } from "../lib/guidedComposition";
import { executeEditorCommand } from "../lib/editorController";
import { syncPostCaptionWithCompositions } from "../lib/arsenalComposition";

interface Props {
  initialPost: CanvasPostModel;
  onSave: (post: CanvasPostModel, finalize: boolean) => Promise<void>;
  onBack?: (post: CanvasPostModel) => void;
}

const field = "mt-1 block w-full resize-y rounded-lg border border-white/20 bg-black/25 p-2.5 text-sm text-white";
const button = "min-h-11 rounded-lg border border-white/20 px-3 text-sm disabled:opacity-50";

export default function StartPieceFinalization({ initialPost, onSave, onBack }: Props) {
  const [post, setPost] = useState(initialPost);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const saving = useRef(false);
  const stage = useRef<CanvasPostStageRef>(null);
  const fieldId = useId();
  const mobile = useIsMobile();
  const slide = post.slides[post.currentSlideIndex];
  const content = slide?.composition?.content;

  const changeCompositionText = (source: string, itemId: string | null, text: string) => {
    if (!content) return;
    setMessage("");
    try {
      const draft = structuredClone(content);
      setContentSource(draft, source, text, itemId);
      const result = fitAssistedContentEdit(post, { ...draft, caption: post.caption });
      if (!result.post) throw new Error(result.error);
      setPost(result.post);
      setError("");
    } catch {
      setError("Não foi possível encaixar esse texto. Tente uma versão mais curta.");
    }
  };

  const changeText = (elementId: "headline" | "subtext", text: string) => {
    if (!slide) return;
    const result = executeEditorCommand(post, { slideId: slide.id, elementId }, { type: "text", text });
    if (result.ok) {
      setPost(result.post);
      setMessage("");
      setError("");
    } else setError(result.reason ?? "Não foi possível ajustar o texto deste slide.");
  };

  const save = async (finalize: boolean) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (finalize && !await stage.current?.exportThumbnail())
        throw new Error("Aguarde as imagens e fontes carregarem para finalizar a peça.");
      await onSave(syncPostCaptionWithCompositions(post), finalize);
      if (!finalize) setMessage("Rascunho salvo.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a peça. Tente novamente.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-5 text-white md:grid-cols-2" aria-labelledby="start-finalization-title">
      <div className="space-y-3">
        <h1 id="start-finalization-title" className="text-xl font-semibold">Finalize sua peça</h1>
        {post.slides.length > 1 && (
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor={`${fieldId}-slide`}>Slide para revisar</label>
            <select id={`${fieldId}-slide`} className="min-h-11 rounded-lg border border-white/20 bg-slate-900 px-2" value={post.currentSlideIndex} disabled={busy}
              onChange={event => {
                setPost({ ...post, currentSlideIndex: Number(event.target.value) });
                setError("");
              }}>
              {post.slides.map((item, index) => <option key={item.id} value={index}>{index + 1} de {post.slides.length}</option>)}
            </select>
          </div>
        )}
        <div className="flex justify-center rounded-xl bg-black/25 p-2" aria-label="Prévia da peça">
          <CanvasPostStage ref={stage} post={post} zoom={mobile ? 0.74 : 0.94} isReadOnly />
        </div>
      </div>
      <div className="space-y-3">
        <p className="text-sm text-white/75">Revise o texto da arte e a legenda antes de baixar em HD, sem marca d’água.</p>
        {content ? guidedContentFields(content).map(({ source, itemId, label, text }, index) => (
          <div className="text-sm" key={JSON.stringify([source, itemId])}>
            <label htmlFor={`${fieldId}-text-${index}`}>{label}</label>
            <textarea id={`${fieldId}-text-${index}`} className={field} rows={2} value={text} disabled={busy}
              onChange={event => changeCompositionText(source, itemId, event.target.value)} />
          </div>
        )) : slide && (
          <>
            <div className="text-sm">
              <label htmlFor={`${fieldId}-headline`}>Título</label>
              <textarea id={`${fieldId}-headline`} className={field} rows={2} value={slide.headline} disabled={busy} onChange={event => changeText("headline", event.target.value)} />
            </div>
            <div className="text-sm">
              <label htmlFor={`${fieldId}-subtext`}>Texto de apoio</label>
              <textarea id={`${fieldId}-subtext`} className={field} rows={2} value={slide.subtext} disabled={busy} onChange={event => changeText("subtext", event.target.value)} />
            </div>
          </>
        )}
        <div className="text-sm">
          <label htmlFor={`${fieldId}-caption`}>Legenda</label>
          <textarea id={`${fieldId}-caption`} className={field} rows={3} value={post.caption} disabled={busy}
            onChange={event => { setPost({ ...post, caption: event.target.value }); setMessage(""); }} />
        </div>
        {message && <p role="status" className="text-sm text-emerald-200">{message}</p>}
        {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${button} bg-orange-300 font-semibold text-black`} disabled={busy || !slide}
            onClick={() => void save(true)}>Finalizar e baixar em HD</button>
          <button type="button" className={button} disabled={busy || !slide} onClick={() => void save(false)}>Salvar rascunho</button>
          {onBack && <button type="button" className={button} disabled={busy} onClick={() => onBack(post)}>Voltar às propostas</button>}
        </div>
      </div>
    </section>
  );
}
