import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CanvasPostStage, type CanvasPostStageRef } from "./CanvasPostStage";
import type { CanvasPostModel } from "./types";

/** The same renderer exports from the gallery without entering the editor. */
export default function PostDownloadDialog({
  post,
  onClose,
}: {
  post: CanvasPostModel;
  onClose: () => void;
}) {
  const stage = useRef<CanvasPostStageRef>(null);
  const [index, setIndex] = useState(post.currentSlideIndex);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const download = async (zip: boolean) => {
    if (!stage.current || busy) return;
    setBusy(true);
    setError("");
    let objectUrl: string | undefined;
    try {
      if (!(await stage.current.exportThumbnail()))
        throw new Error(
          "A imagem ou fonte ainda não carregou. Aguarde e tente novamente."
        );
      const href = zip
        ? (objectUrl = URL.createObjectURL(await stage.current.exportZip4K()))
        : stage.current.exportPng4K();
      if (!href) throw new Error("Não foi possível preparar o download.");
      const link = document.createElement("a");
      link.href = href;
      link.download = `postspark-${post.aspectRatio.replace(":", "x")}${zip ? ".zip" : `-slide-${index + 1}.png`}`;
      link.click();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível baixar. Tente novamente."
      );
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setBusy(false);
    }
  };
  return (
    <Dialog.Root
      open
      onOpenChange={open => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/75" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[91] max-h-[95dvh] w-[min(440px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/15 bg-[#10141d] p-5 text-white">
          <Dialog.Title className="font-semibold">
            Pronto para publicar
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-white/60">
            Confira sua arte e baixe sem precisar editar.
          </Dialog.Description>
          <div className="my-4 flex justify-center">
            <CanvasPostStage
              ref={stage}
              post={{ ...post, currentSlideIndex: index }}
              zoom={0.75}
              isReadOnly
            />
          </div>
          {post.slides.length > 1 && (
            <label className="mb-4 block text-xs">
              Conferir slide
              <select
                aria-label="Conferir slide"
                disabled={busy}
                value={index}
                onChange={e => setIndex(Number(e.target.value))}
                className="ml-2 rounded bg-slate-800 p-2"
              >
                {post.slides.map((s, i) => (
                  <option key={s.id} value={i}>
                    {i + 1} de {post.slides.length}
                  </option>
                ))}
              </select>
            </label>
          )}
          {error && (
            <p role="alert" className="mb-3 text-sm text-amber-200">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy}
              onClick={() => void download(false)}
              className="rounded-xl bg-orange-300 px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
            >
              {busy ? "Preparando…" : "Baixar imagem"}
            </button>
            {post.slides.length > 1 && (
              <button
                disabled={busy}
                onClick={() => void download(true)}
                className="rounded-xl border border-white/20 px-4 py-3 text-sm"
              >
                Baixar carrossel
              </button>
            )}
            <button
              disabled={busy}
              onClick={onClose}
              className="rounded-xl px-4 py-3 text-sm"
            >
              Fechar
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
