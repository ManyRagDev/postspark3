import { useState } from "react";
import { retargetMareReturn, type MareAnchor } from "@/lib/mareIntegration";
import type { CanvasPostModel } from "@/pages/CanvasLab/components/types";
import { mediaTargets } from "@/pages/CanvasLab/lib/mediaSlots";
import {
  COMPOSITION_BACKGROUND_ID,
  getEditorElementState,
} from "@/pages/CanvasLab/lib/editorElementState";

export interface MareRetargetState {
  anchor: MareAnchor;
  model: CanvasPostModel;
  revision: number;
}
export function MareRetargetDialog({
  state,
  onCancel,
}: {
  state: MareRetargetState;
  onCancel: () => void;
}) {
  const { model, anchor, revision } = state;
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const slots = model.slides.flatMap((slide, index) =>
    mediaTargets({ ...model, currentSlideIndex: index })
      .filter(
        slot =>
          !getEditorElementState(
            model,
            slide.id,
            slot.id === "__background__"
              ? slide.composition
                ? COMPOSITION_BACKGROUND_ID
                : "background"
              : slot.id
          ).locked
      )
      .map(slot => ({
        slideId: slide.id,
        slotId: slot.id,
        label: "Slide " + (index + 1) + " · " + slot.label,
      }))
  );
  async function apply() {
    if (!choice || busy) return;
    const slot = slots[Number(choice) - 1];
    setBusy(true);
    try {
      await retargetMareReturn(anchor, slot.slideId, slot.slotId, revision);
      window.location.reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao atualizar o design."
      );
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-xl space-y-4 p-8 pt-24">
      <h1 className="text-xl font-semibold">
        Escolha onde aplicar a edição do Maré
      </h1>
      <p>
        {anchor.conflict} Sua edição continua salva. Selecione a área cuja mídia
        deseja substituir.
      </p>
      <label className="block">
        Destino no design
        <select
          autoFocus
          className="mt-2 block w-full rounded bg-zinc-800 p-3"
          value={choice}
          disabled={busy}
          onChange={e => setChoice(e.target.value)}
        >
          <option value="">Selecione uma área</option>
          {slots.map((s, i) => (
            <option value={i + 1} key={JSON.stringify([s.slideId, s.slotId])}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-3">
        <button
          className="rounded border px-3 py-2"
          disabled={busy}
          onClick={onCancel}
        >
          Manter o design atual
        </button>
        <button
          className="rounded bg-orange-300 px-3 py-2 text-black disabled:opacity-50"
          disabled={!choice || busy}
          onClick={apply}
        >
          Aplicar edição
        </button>
      </div>
    </main>
  );
}
