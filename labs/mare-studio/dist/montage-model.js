import transitionPack from "./assets/transitions.json" with { type: "json" };
export { transitionPack };
export const defaultTransitionFrames = type => 2 * Math.ceil((transitionPack[type]?.overlay?.frames ?? 16) / 2);
// V1, its linked production audio A1, and the music bed A2 are permanent.
export const TRACK_LIMIT = 5;
export const FPS = 30;
export const isDip = type => type === "dip_to_black" || type === "dip_to_white";
export const needsCompanion = type => !isDip(type) && !transitionPack[type]?.overlay;
export const transitionMediaKey = clip => JSON.stringify(["transition-preview", clip.assetId]);
export const trackCount = p => 3 + (p.extraTracks?.length || 0);
export const voiceKey = (track, clip) => JSON.stringify(clip.narration ? [track.id, clip.assetId, clip.id] : [track.id, clip.assetId]);
export function durationOf(p) {
  let duration = p.clips.reduce((t, c) => t + c.duration, 0);
  for (const track of p.extraTracks || [])
    for (const c of track.clips) duration = Math.max(duration, c.start + c.duration);
  return duration;
}
export function activeOn(track, t) {
  return track.clips.find(c => c.start <= t && t < c.start + c.duration);
}
export function transitionFrames(previous, next) {
  if (!previous || !next || next.transitionIn?.from !== previous.id) return 0;
  // Reserve at most half of either clip for each adjacent transition.
  const half = Math.floor(Math.min(previous.duration, next.duration) * FPS / 2 + 1e-8);
  return 2 * Math.min(half, next.transitionIn.frames / 2);
}

// Retiming preserves the source frame that covers the cut, even for an asymmetric film burn.
export function overlayFrameIndex(overlay, frame, frames) {
  const half = frames / 2;
  const beforeCut = frame < half;
  const start = beforeCut ? 0 : overlay.cut;
  const end = beforeCut ? overlay.cut - 1 : overlay.frames - 1;
  const offset = beforeCut ? frame : frame - half;
  const source = start + Math.round(offset * (end - start) / Math.max(1, half - 1));
  return overlay.mirror ? Math.min(source, overlay.frames - 1 - source) : source;
}
// The secondary picture uses source handles where available. Its audio stays on the original cut.
export function transitionAt(clips, index, elapsed) {
  const clip = clips[index];
  const before = transitionFrames(clips[index - 1], clip) / (2 * FPS);
  const after = transitionFrames(clip, clips[index + 1]) / (2 * FPS);
  let right, half, offset;
  if (before && elapsed < before) {
    right = index; half = before; offset = elapsed;
  } else if (after && elapsed >= clip.duration - after) {
    right = index + 1; half = after; offset = elapsed - clip.duration;
  } else return null;
  const from = clips[right - 1], to = clips[right];
  return { from, to, type: to.transitionIn.type, frames: Math.round(2 * half * FPS), progress: (offset + half) / (2 * half),
    outgoingTime: from.trim + from.duration + offset, incomingTime: to.trim + offset };
}
export function validateTracks(p) {
  const tracks = p.extraTracks === undefined ? [] : p.extraTracks;
  if (!Array.isArray(tracks) || trackCount(p) > TRACK_LIMIT)
    throw Error("A montagem aceita até cinco pistas de vídeo e áudio no total.");
  const ids = new Set();
  for (const track of tracks) {
    if (!track || !["video", "audio"].includes(track.kind) || typeof track.id !== "string" ||
        ids.has(track.id) || !Array.isArray(track.clips)) throw Error("Pista inválida.");
    ids.add(track.id);
    let end = 0;
    const clips = new Set();
    for (const c of [...track.clips].sort((a,b) => a.start - b.start)) {
      if (!c || typeof c.id !== "string" || clips.has(c.id) || typeof c.assetId !== "string" ||
          typeof c.name !== "string" || !Number.isFinite(c.start) || c.start < end - 1e-8 ||
          c.start < 0 || !Number.isFinite(c.duration) || c.duration <= 0 ||
          !Number.isFinite(c.trim) || c.trim < 0) throw Error("Intervalo inválido ou sobreposição na mesma pista.");
      if (c.narration !== undefined && (track.kind !== "audio" || !c.narration ||
          !["text", "model", "voice"].every(key => typeof c.narration[key] === "string" && c.narration[key].trim())))
        throw Error("Dados da narração inválidos.");
      if (c.volume !== undefined && (!Number.isFinite(c.volume) || c.volume < 0 || c.volume > 1))
        throw Error("Volume de clipe inválido.");
      clips.add(c.id);
      end = c.start + c.duration;
    }
  }
  for (const clip of p.clips) {
    const tr = clip.transitionIn;
    if (tr != null && (!Object.hasOwn(transitionPack, tr.type) || typeof tr.from !== "string" ||
        !Number.isInteger(tr.frames) || tr.frames < 2 || tr.frames > 60 || tr.frames % 2))
      throw Error("Transição inválida.");
  }
}
