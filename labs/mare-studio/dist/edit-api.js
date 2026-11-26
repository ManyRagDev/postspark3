import {validateEditPlan} from "./edit-plan.js";
import { integrated, processorResult, canUsePaid } from "./postspark-session.js";
// A written request proposes ordinary editor commands. Applying them remains a separate user action.
export async function requestEdit(request, state, catalog, options, signal) {
  if (!request.trim()) throw Error("Descreva o que deseja editar.");
  if (!(integrated ? canUsePaid() : document.querySelector('meta[name="mare-director"]')))
    throw Error(
      "A IA está indisponível neste servidor. As ações rápidas continuam disponíveis."
    );
  const contracts = catalog.map(({ id, manual, params }) => ({
    id,
    description: manual,
    required: Object.fromEntries(
      Object.entries(params).filter(([k]) => !k.endsWith("?"))
    ),
    optional: Object.fromEntries(
      Object.entries(params)
        .filter(([k]) => k.endsWith("?"))
        .map(([k, v]) => [k.slice(0, -1), v])
    ),
  }));
  const payload = { stage: "edit", context: { request, state, catalog: contracts, options } };
  const response = integrated
    ? await processorResult("edit", payload, signal)
    : await fetch("/api/director", {method:"POST",signal,headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Error(result.message || "A API não conseguiu preparar a edição.");
  return validateEditPlan(result.output,contracts);
}
export function editState(session, state) {
  const { context, compositions, clips, tracks, sound, duration, fps, assets } =
    state;
  const selected =
    context.compositionId &&
    session.inspect({
      compositionId: context.compositionId,
      time: context.time,
    });
  // Keep binary media and voice analysis on the device.
  const lanes = tracks.map(({ id, kind, clips }) => ({
    id,
    kind,
    clips: clips.map(({ id, name, start, trim, duration }) => ({
      id,
      name,
      start,
      trim,
      duration,
    })),
  }));
  return {
    context,
    compositions,
    clips,
    tracks: lanes,
    sound,
    duration,
    fps,
    assets,
    selected,
  };
}
