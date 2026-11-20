import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { CanvasPostModel } from "./types";
import type { EditorTarget } from "../lib/editorController";
import {
  APPEARANCE_PROPERTIES,
  copyableAppearanceProperties,
  findElementCorrespondences,
  type AppearanceProperty,
} from "../lib/elementReplication";

export default function ElementReplicationDialog({
  open,
  post,
  source,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  post: CanvasPostModel;
  source: EditorTarget | null;
  onOpenChange: (value: boolean) => void;
  onApply: (targets: EditorTarget[], properties: AppearanceProperty[]) => void;
}) {
  const [properties, setProperties] = useState<AppearanceProperty[]>([]);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const matches = source ? findElementCorrespondences(post, source) : [];
  const available = source ? copyableAppearanceProperties(post, source) : [];
  useEffect(() => {
    if (!open || !source) return;
    setProperties([]);
    setChoices(
      Object.fromEntries(
        findElementCorrespondences(post, source)
          .filter(m => m.status === "matched")
          .map(m => [m.slideId, m.candidates[0].id])
      )
    );
  }, [open, source?.slideId, source?.elementId]);
  const targets = matches.flatMap(m =>
    choices[m.slideId]
      ? [{ slideId: m.slideId, elementId: choices[m.slideId] }]
      : []
  );
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/65" />
        <Dialog.Content className="fixed inset-x-2 bottom-2 z-[81] max-h-[85dvh] overflow-y-auto rounded-2xl border border-white/15 bg-[#0d111b] p-4 text-white sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[520px] sm:-translate-x-1/2 sm:-translate-y-1/2">
          <Dialog.Title className="text-base font-semibold">
            Aplicar aparência em outros slides
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-white/60">
            Escolha as propriedades e confira os objetos de destino. Textos e
            posições são preservados; tamanhos acompanham a proporção da
            prancheta.
          </Dialog.Description>
          <fieldset className="my-4 grid grid-cols-2 gap-2">
            <legend className="mb-2 text-sm">O que copiar</legend>
            {available.map(key => (
              <label
                key={key}
                className="flex min-h-11 items-center gap-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={properties.includes(key)}
                  onChange={() =>
                    setProperties(previous =>
                      previous.includes(key)
                        ? previous.filter(p => p !== key)
                        : [...previous, key]
                    )
                  }
                />
                {APPEARANCE_PROPERTIES[key]}
              </label>
            ))}
          </fieldset>
          <div className="space-y-3">
            {matches.map(match => (
              <label key={match.slideId} className="block text-xs">
                <span className="mb-1 block">
                  Slide {post.slides.findIndex(s => s.id === match.slideId) + 1}{" "}
                  ·{" "}
                  {match.status === "matched"
                    ? "Correspondência encontrada"
                    : match.status === "ambiguous"
                      ? "Mais de um correspondente: escolha o destino"
                      : "Sem correspondência automática: escolha ou ignore"}
                </span>
                <select
                  aria-label={`Destino do slide ${post.slides.findIndex(s => s.id === match.slideId) + 1}`}
                  value={choices[match.slideId] ?? ""}
                  onChange={event =>
                    setChoices(previous => ({
                      ...previous,
                      [match.slideId]: event.target.value,
                    }))
                  }
                  className="min-h-11 w-full rounded-lg border border-white/15 bg-[#151b28] px-2"
                >
                  <option value="">Não aplicar neste slide</option>
                  {match.options.map(layer => (
                    <option
                      key={layer.id}
                      value={layer.id}
                      disabled={layer.locked}
                    >
                      {layer.text?.trim().slice(0, 45) || layer.label}
                      {layer.locked ? " · Bloqueado" : ""}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Dialog.Close className="min-h-11 flex-1 rounded-lg border border-white/15">
              Cancelar
            </Dialog.Close>
            <button
              type="button"
              disabled={!properties.length || !targets.length}
              onClick={() => onApply(targets, properties)}
              className="min-h-11 flex-1 rounded-lg bg-orange-400 px-3 text-sm font-semibold text-black disabled:opacity-40"
            >
              Aplicar em {targets.length} slide(s)
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
