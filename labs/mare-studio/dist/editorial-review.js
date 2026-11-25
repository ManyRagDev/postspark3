import { FPS } from "./montage-model.js";

const frame = t => Math.round(t * FPS);
const valid = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;

export function reviewInventory(target) {
  const state = target.inspect();
  return {
    fps: FPS,
    duration: state.duration,
    music: { enabled: state.sound.enabled, volume: state.sound.volume },
    clips: state.clips.map(c => {
      const common = {
        id: c.id,
        name: c.name,
        start: c.start,
        frames: frame(c.duration),
        trimFrame: frame(c.trim),
      };
      if (!c.compositionId) return { ...common, sourceFrames: Math.floor(c.sourceDuration * FPS + 1e-5) };
      const comp = target.inspect({ compositionId: c.compositionId });
      return {
        ...common,
        compositionId: c.compositionId,
        sourceFrames: frame(comp.duration),
        uses: comp.uses.length,
        layers: comp.layers.map(l => ({
          id: l.id,
          type: l.type,
          text: l.text,
          startFrame: frame(l.start),
          endFrame: frame(l.end),
          lastKeyFrame: Math.max(
            0,
            ...Object.values(l.keys)
              .flat()
              .map(k => Math.ceil(k.t * FPS - 1e-6))
          ),
          x: l.props.x,
          y: l.props.y,
          width: l.width,
          height: l.height,
          fontSize: l.fontSize,
          color: l.color,
          motion: Object.fromEntries(["x", "y"].filter(k => l.keys[k].length).map(k => [k, l.keys[k]])),
        })),
      };
    }),
  };
}

export function reviewCommands(inventory, review, cta) {
  if (
    typeof review?.assessment !== "string" ||
    !review.assessment.trim() ||
    !Array.isArray(review.corrections) ||
    review.corrections.length > 8
  )
    throw Error("Parecer editorial inválido.");
  const byId = new Map(inventory.clips.map(c => [c.id, c]));
  const lengths = new Map(),
    changes = new Map(),
    commands = [];
  let volume;
  for (const correction of review.corrections) {
    const { at, reason, clipId, layerId, set } = correction;
    if (
      !valid(at, 0, inventory.duration) ||
      typeof reason !== "string" ||
      !reason.trim() ||
      !set ||
      typeof set !== "object" ||
      Array.isArray(set) ||
      !Object.keys(set).length
    )
      throw Error("A correção precisa identificar o instante, o motivo e a mudança.");
    const fields = Object.keys(set),
      clip = byId.get(clipId);
    if (!clipId && !layerId && fields.length === 1 && fields[0] === "volume") {
      if (!inventory.music.enabled || !valid(set.volume, 0, 1) || volume !== undefined)
        throw Error("Ajuste de trilha inválido.");
      volume = set.volume;
      if (volume !== inventory.music.volume) commands.push({ id: "sound.set", volume });
      continue;
    }
    if (
      !clip ||
      (clip.compositionId && (clip.uses !== 1 || clip.trimFrame || clip.sourceFrames !== clip.frames))
    )
      throw Error("A revisão precisa de uma ocorrência de cena inequívoca.");
    if (!layerId && fields.length === 1 && fields[0] === "frames") {
      if (
        lengths.has(clip.id) ||
        !Number.isInteger(set.frames) ||
        !valid(set.frames, 1, 3600) ||
        (!clip.compositionId && set.frames + clip.trimFrame > clip.sourceFrames)
      )
        throw Error("Duração de revisão inválida.");
      lengths.set(clip.id, set.frames);
      continue;
    }
    if (
      !clip.layers?.some(l => l.id === layerId) ||
      fields.some(
        k => !["startFrame", "endFrame", "x", "y", "width", "height", "fontSize", "color"].includes(k)
      )
    )
      throw Error("Alvo ou parâmetro de revisão desconhecido.");
    const key = JSON.stringify([clip.id, layerId]),
      prev = changes.get(key) ?? {};
    if (fields.some(k => Object.hasOwn(prev, k))) throw Error("A revisão repetiu uma propriedade.");
    changes.set(key, { ...prev, ...set });
  }
  const delta = inventory.clips.reduce((n, c) => n + (lengths.get(c.id) ?? c.frames) - c.frames, 0);
  if (delta) throw Error("A revisão altera a duração total do briefing.");
  for (const c of inventory.clips) {
    const frames = lengths.get(c.id) ?? c.frames,
      compositionId = c.compositionId;
    if (frames !== c.frames) {
      if (compositionId) commands.push({ id: "composition.duration", compositionId, duration: frames / FPS });
      commands.push({ id: "clip.set", clipId: c.id, fields: { duration: frames / FPS } });
    }
    for (const layer of c.layers ?? []) {
      const set = changes.get(JSON.stringify([c.id, layer.id])) ?? {};
      const start = set.startFrame ?? layer.startFrame,
        end = set.endFrame ?? (layer.endFrame === c.frames ? frames : layer.endFrame);
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end > frames ||
        end - start <= layer.lastKeyFrame ||
        (cta && layer.text === cta && end !== frames)
      )
        throw Error("O ajuste cortaria uma animação ou a leitura do CTA.");
      const ref = { compositionId, layerId: layer.id },
        fields = {},
        pose = {};
      if (start !== layer.startFrame) fields.start = start / FPS;
      if (end !== layer.endFrame) fields.end = end / FPS;
      if (set.color !== undefined && !/^#[a-f0-9]{6}$/i.test(set.color)) throw Error("Cor inválida.");
      if (set.fontSize !== undefined && (layer.type !== "text" || !valid(set.fontSize, 12, 120)))
        throw Error("Corpo de texto inválido.");
      const x = set.x ?? layer.x,
        y = set.y ?? layer.y,
        w = set.width ?? layer.width,
        h = set.height ?? layer.height;
      if (
        ["x", "y", "width", "height"].some(k => Object.hasOwn(set, k)) &&
        (!valid(w, 1, 540) ||
          !valid(h, 1, 960) ||
          !valid(x, w / 2, 540 - w / 2) ||
          !valid(y, h / 2, 960 - h / 2))
      )
        throw Error("Enquadramento de revisão fora da tela.");
      for (const k of ["width", "height", "fontSize", "color"])
        if (Object.hasOwn(set, k) && set[k] !== layer[k]) fields[k] = set[k];
      for (const k of ["x", "y"])
        if (Object.hasOwn(set, k) && set[k] !== layer[k]) {
          pose[k] = set[k];
          for (const key of layer.motion[k] ?? [])
            commands.push({
              id: "key.set",
              ...ref,
              channel: k,
              time: key.t,
              value: key.value + set[k] - layer[k],
              ease: key.ease,
            });
        }
      if (Object.keys(fields).length) commands.push({ id: "layer.set", ...ref, fields });
      if (Object.keys(pose).length) commands.push({ id: "layer.pose", ...ref, fields: pose });
    }
  }
  return commands;
}

async function requestReview(context, movie, signal) {
  const metadata = new TextEncoder().encode(JSON.stringify(context)),
    length = new ArrayBuffer(4);
  new DataView(length).setUint32(0, metadata.length);
  const response = await fetch("/api/director/review", {
    method: "POST",
    body: new Blob([length, metadata, movie], { type: "application/octet-stream" }),
    signal,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(result.message ?? "Falha na revisão audiovisual.");
  return result;
}

export async function reviewEditorialCut({
  target,
  brief,
  cta,
  movie,
  signal,
  check,
  infer = requestReview,
}) {
  const start = performance.now(),
    guard = () => {
      signal.throwIfAborted();
      check();
    };
  guard();
  const inventory = reviewInventory(target);
  const result = await infer({ ...inventory, brief, cta }, movie, signal);
  guard();
  const commands = reviewCommands(inventory, result.output, cta);
  const trace = {
    model: result.model,
    usage: result.usage,
    providerMs: result.providerMs,
    proxyMs: result.proxyMs,
    proxyBytes: result.proxyBytes,
    commands: commands.length,
    renderMs: 0,
    packageMs: 0,
  };
  let output = { changed: false };
  if (commands.length) {
    const proposal = target.refine(commands),
      renderStart = performance.now();
    const revised = await proposal.exportCandidate("video", signal);
    trace.renderMs = Math.round(performance.now() - renderStart);
    guard();
    const packageStart = performance.now(),
      portable = await proposal.exportCandidate("project", signal);
    trace.packageMs = Math.round(performance.now() - packageStart);
    output = { changed: true, movie: revised, portable, proposal };
  }
  guard();
  trace.totalMs = Math.round(performance.now() - start);
  return { ...output, review: result.output, trace };
}
