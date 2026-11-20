import {
  COMPOSITION_BACKGROUND_ID,
  COMPOSITION_LOGO_ID,
} from "../lib/editorElementState";
import { BACKGROUND_SLOT } from "../lib/mediaSlots";
import { readTextGradient } from "@shared/textGradient";
import { gradientContrastRatio, contrastRatio } from "../lib/contrast";
import { resolveSlideAppearance } from "../lib/slideReplication";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { CanvasPostModel } from "./types";
import { TEXT_EFFECTS_META } from "./types";
import AdvancedImageEditor from "./AdvancedImageEditor";
import {
  advancedImageTargets,
  currentAdvancedTarget,
  applyAdvancedImageResult,
  restoreAdvancedImage,
  type AdvancedImageTarget,
  type AdvancedImagePreview,
} from "../lib/advancedImageEditing";
import { flattenEditorLayers } from "../lib/editorSelection";
import {
  projectEditorLayers,
  resolveEditorProperties,
  editorTextGradient,
  type EditorCommand,
  type EditorTarget,
} from "../lib/editorController";
import { imageEditorApi } from "@/lib/imageEditorApi";

type View = {
  session: string;
  tab: "image" | "text";
  id: string;
  document: CanvasPostModel;
  image?: AdvancedImageTarget;
};
export type AdvancedTransitionGuard = (proceed: () => void) => void;
const field =
  "min-h-11 w-full rounded-lg border border-white/20 bg-[#171c29] px-2 text-sm";

export default function AdvancedEditorPanel({
  post,
  selectionIds,
  onSelect,
  onCommand,
  onCommit,
  transitionGuard,
  onImagePreview,
  imageEditorClient = imageEditorApi,
}: {
  imageEditorClient?: typeof imageEditorApi;
  onImagePreview?: (preview: AdvancedImagePreview | null) => void;
  post: CanvasPostModel;
  selectionIds: string[];
  onSelect: (target: EditorTarget) => void;
  onCommand: (target: EditorTarget, command: EditorCommand) => void;
  onCommit: (post: CanvasPostModel) => void;
  transitionGuard: MutableRefObject<AdvancedTransitionGuard | null>;
}) {
  const latest = useRef(post);
  latest.current = post;
  const slide = post.slides[post.currentSlideIndex];
  const images = advancedImageTargets(post);
  const texts = flattenEditorLayers(projectEditorLayers(post, slide.id)).filter(
    l => l.kind === "text" && l.visible
  );
  const [view, setView] = useState<View | null>(null);

  const pendingRef = useRef(false);
  const [transition, setTransition] = useState<{ proceed: () => void } | null>(
    null
  );
  const reportPending = useCallback((value: boolean) => {
    pendingRef.current = value;
  }, []);
  const guard = useCallback<AdvancedTransitionGuard>(proceed => {
    if (pendingRef.current) setTransition({ proceed });
    else proceed();
  }, []);
  useEffect(() => {
    transitionGuard.current = guard;
    return () => {
      transitionGuard.current = null;
    };
  }, [guard, transitionGuard]);
  const choose = (tab: View["tab"], id: string, select = false) => {
    const document = latest.current;
    const image =
      tab === "image"
        ? advancedImageTargets(document).find(t => t.slotId === id)
        : undefined;
    setView({ session: crypto.randomUUID(), tab, id, document, image });
    if (select)
      onSelect({
        slideId: slide.id,
        elementId:
          tab === "image"
            ? id === BACKGROUND_SLOT
              ? slide.composition
                ? COMPOSITION_BACKGROUND_ID
                : "background"
              : id === COMPOSITION_LOGO_ID && !slide.composition
                ? "logo"
                : id
            : id,
      });
  };
  const showImagePreview = useCallback(
    (
      preview: {
        result: import("@shared/imageEditor").ImageEditResult;
        operation: import("@shared/imageEditor").ImageEditOperation;
      } | null
    ) => {
      onImagePreview?.(
        preview && view?.image && latest.current === view.document
          ? { document: view.document, target: view.image, ...preview }
          : null
      );
    },
    [view, onImagePreview]
  );
  const selectionKey = `${slide.id}:${selectionIds.join("|")}`;
  useEffect(() => {
    const id = selectionIds.length === 1 ? selectionIds[0] : undefined;
    const image = images.find(
      t =>
        t.slotId === id ||
        (["background", COMPOSITION_BACKGROUND_ID].includes(id ?? "") &&
          t.slotId === BACKGROUND_SLOT) ||
        (id === "logo" && t.label === "Logo")
    );
    const text = texts.find(t => t.id === id);
    const next = image
      ? {
          session: crypto.randomUUID(),
          tab: "image" as const,
          id: image.slotId,
          document: post,
          image,
        }
      : text
        ? {
            session: crypto.randomUUID(),
            tab: "text" as const,
            id: text.id,
            document: post,
          }
        : null;
    guard(() => setView(next));
    // Selection drives context; editing the document must not replace an image's captured revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey, guard]);
  useEffect(() => {
    if (!view && selectionIds.length === 1) {
      const image = images.find(t => t.slotId === selectionIds[0]);
      if (image)
        setView({
          session: crypto.randomUUID(),
          tab: "image",
          id: image.slotId,
          document: post,
          image,
        });
    }
    // Refresh the captured source only after a document commit, never after cancel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post]);
  const target = view
    ? {
        slideId: view.document.slides[view.document.currentSlideIndex].id,
        elementId: view.id,
      }
    : null;
  const text =
    target &&
    texts.find(
      t => t.id === target.elementId && t.target.slideId === target.slideId
    );
  const tab = view?.tab ?? "image";
  const stale = view?.tab === "image" && post !== view.document;
  const current = () =>
    Boolean(
      view?.image &&
        latest.current === view.document &&
        currentAdvancedTarget(latest.current, view.image)?.url ===
          view.image.url
    );
  const list =
    tab === "image"
      ? images.map(t => ({ id: t.slotId, label: t.label, locked: t.locked }))
      : texts;
  return (
    <div className="min-w-0 space-y-4" aria-label="Editor avançado unificado">
      <p className="text-xs text-orange-200">
        Novos recursos são adicionados ao editor avançado.
      </p>
      <div
        role="tablist"
        aria-label="Tipo de elemento"
        className="grid grid-cols-2 gap-2"
      >
        {(
          [
            ["image", "Imagem"],
            ["text", "Texto"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={`${field} aria-selected:border-orange-400`}
            onClick={() =>
              guard(() =>
                choose(
                  value,
                  value === "image"
                    ? (images[0]?.slotId ?? "")
                    : (texts[0]?.id ?? ""),
                  true
                )
              )
            }
          >
            {label}
          </button>
        ))}
      </div>
      {transition && (
        <div
          role="alert"
          className="space-y-2 rounded-lg border border-orange-400 p-3 text-xs"
        >
          <p>
            Há uma prévia pendente. Aplique antes de continuar ou descarte a
            prévia.
          </p>
          <button
            className={field}
            onClick={() => {
              const next = transition.proceed;
              setTransition(null);
              reportPending(false);
              next();
            }}
          >
            Descartar prévia e continuar
          </button>
          <button className={field} onClick={() => setTransition(null)}>
            Continuar editando
          </button>
        </div>
      )}
      {selectionIds.length > 1 ? (
        <p className="text-sm text-white/70">
          Escolha um único elemento para editar. Os tratamentos desta versão são
          individuais.
        </p>
      ) : (
        <>
          <label className="block text-xs">
            Editando
            <select
              aria-label="Editando"
              className={field}
              value={view?.id ?? ""}
              onChange={e => {
                const id = e.target.value;
                guard(() => choose(tab, id, true));
              }}
            >
              <option value="">Selecione um elemento</option>
              {list.map(item => (
                <option key={item.id} value={item.id} disabled={item.locked}>
                  {item.label}
                  {item.locked ? " (bloqueado)" : ""}
                </option>
              ))}
            </select>
          </label>
          {tab === "image" && view?.image && !view.image.locked ? (
            <>
              {stale && (
                <div role="status" className="space-y-2 text-xs text-amber-200">
                  <p>A peça mudou. Esta prévia não pode ser aplicada.</p>
                  <button
                    className={field}
                    onClick={() => guard(() => choose("image", view.id))}
                  >
                    Reabrir imagem atual
                  </button>
                </div>
              )}
              <AdvancedImageEditor
                imageEditorClient={imageEditorClient}
                key={view.session}
                embedded
                open
                target={view.image}
                palette={[post.palette.background, post.palette.accent]}
                originalAvailable={Boolean(
                  post.advancedImageAssets?.[view.image.url]?.originalUrl
                )}
                onPendingChange={reportPending}
                onPreviewChange={showImagePreview}
                onOpenChange={open => {
                  if (!open) {
                    reportPending(false);
                    setTransition(null);
                    setView(null);
                  }
                }}
                isCurrent={current}
                onApply={async (input, result, signal) => {
                  if (!current() || signal.aborted)
                    throw new Error("A peça mudou. Reabra a imagem atual.");
                  const saved = await imageEditorClient.imageEditor.publish.mutate(
                    { ...input, result },
                    { signal }
                  );
                  if (!current() || signal.aborted)
                    throw new Error(
                      "A peça mudou. O resultado não foi aplicado."
                    );
                  const next = applyAdvancedImageResult(
                    latest.current,
                    view.image!,
                    saved,
                    result,
                    input.operation
                  );
                  if (!next)
                    throw new Error(
                      "A imagem mudou ou foi bloqueada. Reabra a edição."
                    );
                  onCommit(next);
                  return true;
                }}
                onRestore={() => {
                  if (!current()) return false;
                  const next = restoreAdvancedImage(
                    latest.current,
                    view.image!
                  );
                  if (!next) return false;
                  onCommit(next);
                  return true;
                }}
              />
            </>
          ) : tab === "text" && text && target ? (
            <AdvancedTextControls
              post={post}
              target={target}
              locked={text.locked}
              onCommand={command => onCommand(target, command)}
            />
          ) : (
            <p className="text-sm text-white/60">
              Selecione{" "}
              {tab === "image" ? "uma imagem, fundo ou logo" : "um texto"} no
              slide ou no seletor acima.
            </p>
          )}
        </>
      )}
      <div className="rounded-lg border border-white/10 p-3 text-xs text-white/60">
        <strong className="block text-white/80">
          Edição direta na prancheta · Em breve
        </strong>
        Novos gestos para máscaras e recortes no canvas. Desfoque com centro
        nítido em estudo. Os recortes e máscaras atuais continuam disponíveis na
        prévia da imagem.
      </div>
    </div>
  );
}

export function AdvancedTextControls({
  post,
  target,
  locked,
  onCommand,
}: {
  post: CanvasPostModel;
  target: EditorTarget;
  locked: boolean;
  onCommand: (command: EditorCommand) => void;
}) {
  const { values, supported } = resolveEditorProperties(post, target);
  const effectiveGradient = editorTextGradient(post, target);
  const gradient = readTextGradient(effectiveGradient);
  const [first, setFirst] = useState("#fff0b3"),
    [second, setSecond] = useState("#ff8a3d");
  const index = post.slides.findIndex(s => s.id === target.slideId);
  const appearance = resolveSlideAppearance(post, index);
  const background =
    target.elementId === "subtext" && appearance.familyId === "brutal-split"
      ? appearance.palette.accent
      : appearance.palette.background;
  const contrast = effectiveGradient
    ? gradientContrastRatio(background, effectiveGradient.colors)
    : contrastRatio(background, String(values.fill ?? ""));
  const set = (patch: Record<string, string | number | boolean | null>) =>
    onCommand({ type: "properties", patch });
  return (
    <fieldset disabled={locked} className="space-y-3 disabled:opacity-50">
      <legend className="text-xs text-white/70">
        Edição direta do texto · use Desfazer para reverter.
      </legend>
      {locked && <p>Desbloqueie o texto em Camadas para editar.</p>}
      {supported.includes("effect") && (
        <label className="block text-xs">
          Acabamento
          <select
            className={field}
            aria-label="Acabamento do texto"
            value={String(values.effect ?? "none")}
            onChange={e => set({ effect: e.target.value })}
          >
            {Object.values(TEXT_EFFECTS_META).map(e => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-xs">
        Cor do acabamento
        <input
          type="color"
          aria-label="Cor do acabamento"
          className="h-11 w-full"
          value={String(values.effectColor ?? "#000000")}
          onChange={e => set({ effectColor: e.target.value })}
        />
      </label>
      <div className="space-y-2 rounded-lg border border-white/10 p-2">
        <p className="text-xs">Preenchimento em gradiente</p>
        <p className="text-xs text-white/60">
          O gradiente cobre o texto inteiro. Cores de trechos continuam salvas e
          reaparecem ao desativá-lo.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">
            Cor inicial
            <input
              className="h-11 w-full"
              type="color"
              aria-label="Cor inicial do texto"
              value={gradient?.colors[0] ?? first}
              onChange={e => {
                setFirst(e.target.value);
                if (gradient)
                  onCommand({
                    type: "text-gradient",
                    gradient: {
                      ...gradient,
                      colors: [e.target.value, gradient.colors[1]],
                    },
                  });
              }}
            />
          </label>
          <label className="text-xs">
            Cor final
            <input
              className="h-11 w-full"
              type="color"
              aria-label="Cor final do texto"
              value={gradient?.colors[1] ?? second}
              onChange={e => {
                setSecond(e.target.value);
                if (gradient)
                  onCommand({
                    type: "text-gradient",
                    gradient: {
                      ...gradient,
                      colors: [gradient.colors[0], e.target.value],
                    },
                  });
              }}
            />
          </label>
        </div>
        <button
          type="button"
          className={field}
          onClick={() =>
            onCommand({
              type: "text-gradient",
              gradient: { colors: [first, second], start: 0, end: 1 },
            })
          }
        >
          Aplicar gradiente
        </button>
        <button
          type="button"
          className={field}
          onClick={() => onCommand({ type: "text-gradient", gradient: null })}
        >
          Usar cor sólida
        </button>
        <button
          type="button"
          className={field}
          onClick={() =>
            onCommand({ type: "text-gradient", gradient: undefined })
          }
        >
          Restaurar preenchimento herdado
        </button>
        {effectiveGradient && !gradient && (
          <p className="text-xs">
            Gradiente do modelo. Aplicar cria um gradiente de duas cores nesta
            instância.
          </p>
        )}
        <p role="status" className="text-xs text-amber-200">
          {Number.isFinite(contrast) && contrast < 4.5
            ? "Contraste baixo em parte do preenchimento. Confira sobre a arte e ajuste as cores ou o acabamento."
            : "Contraste estimado sobre a cor de fundo. Fotos, transparências e sobreposições exigem conferência visual."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["Editorial", "scrim"],
            ["Oferta", "box-pill"],
            ["Impacto", "outline"],
            ["Remover acabamento", "none"],
          ] as const
        ).map(([label, effect]) => (
          <button
            type="button"
            key={label}
            className={field}
            onClick={() => set({ effect, effectColor: "#000000" })}
          >
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
