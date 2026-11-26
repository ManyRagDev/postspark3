import { assertComposition } from "./composition-model.js";
import { FPS, validateTracks } from "./montage-model.js";
import { validateTalk } from "./speech-model.js";

const positive = n => Number.isFinite(n) && n > 0;
const epsilon = 1e-7;

export function compositionForClip(project, clip) {
  return clip?.compositionId
    ? project.compositions?.find(item => item.id === clip.compositionId)
    : undefined;
}

export function sourceClip(composition, id = crypto.randomUUID()) {
  return {
    id, kind: "scene", compositionId: composition.id, name: composition.name,
    trim: 0, duration: composition.duration,
  };
}

export function requiredCompositionDuration(project, id) {
  return project.clips.reduce((length, clip) =>
    clip.compositionId === id ? Math.max(length, clip.trim + clip.duration) : length, 0);
}

export function validateCompositionSource(entry) {
  if (!entry || typeof entry.id !== "string" || !entry.id ||
      typeof entry.name !== "string" || !positive(entry.duration))
    throw new Error("Dados da composição inválidos.");
  if (entry.kind === "composition" && !Object.hasOwn(entry, "scene")) {
    assertComposition(entry.document);
    return;
  }
  if (entry.kind === "wave" && !Object.hasOwn(entry, "document")) {
    const scene = entry.scene;
    if (scene && typeof scene.title === "string" && typeof scene.color === "string" && /^#[a-f\d]{6}$/i.test(scene.color) &&
        ["speed", "amplitude", "entry"].every(key => Number.isFinite(scene[key])) &&
        Array.isArray(scene.keys) && scene.keys.every(key =>
          key && ["t", "y", "opacity"].every(prop => Number.isFinite(key[prop]))))
      return;
  }
  throw new Error("Conteúdo da composição inválido.");
}

export function validateProject(project) {
  if (!Array.isArray(project?.clips) || !Array.isArray(project.compositions) ||
      !Number.isFinite(project.sound?.volume) || typeof project.sound.enabled !== "boolean" ||
      (project.sound.assetId != null && typeof project.sound.assetId !== "string"))
    throw new Error("O arquivo não contém um projeto Maré Studio válido.");

  const library = new Map();
  for (const composition of project.compositions) {
    validateCompositionSource(composition);
    if (library.has(composition.id)) throw new Error("Composição duplicada no projeto.");
    library.set(composition.id, composition);
  }
  const ids = new Set();
  for (const clip of project.clips) {
    if (!clip || typeof clip.id !== "string" || !clip.id || ids.has(clip.id) ||
        typeof clip.name !== "string" || !positive(clip.duration) ||
        !Number.isFinite(clip.trim) || clip.trim < 0 ||
        (clip.volume!==undefined && (clip.kind!=="video" || !Number.isFinite(clip.volume) || clip.volume<0 || clip.volume>1)) ||
        Object.hasOwn(clip, "composition") || Object.hasOwn(clip, "scene"))
      throw new Error("Clipe inválido na montagem.");
    ids.add(clip.id);
    if (clip.kind === "scene") {
      const source = library.get(clip.compositionId);
      if (!source || clip.talk || clip.trim + clip.duration > source.duration + epsilon)
        throw new Error("O trecho usado pelo clipe precisa estar dentro da composição vinculada.");
    } else if (clip.kind !== "video" || typeof clip.assetId !== "string" ||
        Object.hasOwn(clip, "compositionId")) {
      throw new Error("Fonte de vídeo inválida na montagem.");
    }
    if (clip.talk) validateTalk(clip.talk);
  }
  validateTracks(project);
  return project;
}

export function normalizeProject(project) {
  if (!Array.isArray(project?.clips) || Object.hasOwn(project, "compositions"))
    return validateProject(project);

  const {scene, clips, ...fields} = project;
  const compositions = [];
  let commonWave;
  const migrated = clips.map((clip, index) => {
    if (clip?.kind !== "scene") return clip;
    const {composition, scene: ownWave, assetId, ...fields} = clip;
    const duration = Math.max(1 / FPS, clip.trim + clip.duration);
    let entry;
    if (composition || ownWave || !commonWave) {
      entry = {
        id: "composicao-" + (index + 1),
        name: clip.name,
        duration,
        ...(composition ? {kind: "composition", document: structuredClone(composition)} :
          {kind: "wave", scene: structuredClone(ownWave ?? scene)}),
      };
      compositions.push(entry);
      if (!composition && !ownWave) commonWave = entry;
    } else {
      entry = commonWave;
      entry.duration = Math.max(entry.duration, duration);
    }
    return {...fields, compositionId: entry.id};
  });
  return validateProject({...fields, compositions, clips: migrated});
}

export function* compositionImages(project, usedOnly = false) {
  const documents = usedOnly || !Array.isArray(project.compositions)
    ? new Set(project.clips.map(clip => compositionForClip(project, clip)?.document ?? clip?.composition))
    : project.compositions.map(item => item?.document);
  for (const doc of documents) {
    if (!Array.isArray(doc?.layers)) continue;
    for (const layer of doc.layers)
      if (layer?.type === "image") yield layer;
  }
}

export function canSplitAt(clip, offset) {
  return offset >= 0.1 - epsilon && clip.duration - offset >= 0.1 - epsilon;
}

// Splitting retains the source reference and preserves the transition after the old clip.
export function splitClip(clips, index, offset, rightId = crypto.randomUUID()) {
  const left = clips[index];
  const right = {...left, id: rightId, trim: left.trim + offset, duration: left.duration - offset};
  delete right.transitionIn;
  const following = clips[index + 1];
  if (following?.transitionIn?.from === left.id) following.transitionIn.from = right.id;
  left.duration = offset;
  clips.splice(index + 1, 0, right);
  return right;
}

export function insertCompositionAt(clips, composition, cursor) {
  const inserted = sourceClip(composition);
  let index = 0;
  let start = 0;
  // V1 is contiguous. A cut close to an edge snaps to that edge instead of making a subframe fragment.
  for (; index < clips.length; index++) {
    const end = start + clips[index].duration;
    if (cursor < end) {
      if (cursor - start < 1 / FPS) break;
      if (end - cursor >= 1 / FPS) {
        splitClip(clips, index, cursor - start);
        index++;
        start = cursor;
        break;
      }
    }
    start = end;
  }
  const following = clips[index];
  if (following?.transitionIn && following.transitionIn.from === clips[index - 1]?.id)
    delete following.transitionIn;
  clips.splice(index, 0, inserted);
  return {clip: inserted, time: start};
}

export function timeInComposition(clip, clipStart, cursor) {
  if (cursor < clipStart || cursor >= clipStart + clip.duration) return clip.trim;
  return clip.trim + cursor - clipStart;
}
