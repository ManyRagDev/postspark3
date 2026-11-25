import { activeOn, durationOf, FPS, needsCompanion, transitionAt, transitionFrames, transitionMediaKey, transitionPack, validateTracks, voiceKey } from "./montage-model.js";
import { compositionImages, normalizeProject, validateProject } from "./project-model.js";
import { loadTransitionOverlay } from "./transitions.js";
import { needsMatte } from "./speech-model.js";
import { decodeMask, MASK_TYPE, MAX_MASK_BYTES } from "./speech-visual.js";

// The editable document stores durable asset IDs. Object URLs live only in this session.
const BUILT_INS = new Map([
  ["coast", "assets/coast.mp4"],
  ["tide", "assets/tide.mp4"],
  ["sound", "assets/sound.wav"],
]);
const PROJECT_HEADER = "MARESTUDIO2\n";
const CURVE_HEADER = "MARESTUDIO3\n";
const LEGACY_HEADER = "MARESTUDIO1\n";
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
function voices(project) {
  const sources = new Map();
  for (const c of project.clips)
    if (c.kind === "video") sources.set(c.assetId, {id:c.assetId, kind:"video", gain:1});
  for (const [i, to] of project.clips.entries()) {
    const from = project.clips[i - 1];
    if (!transitionFrames(from, to) || !needsCompanion(to.transitionIn.type)) continue;
    for (const clip of [from, to]) {
      if (clip.kind === "video") sources.set(transitionMediaKey(clip), {
        id: clip.assetId, kind: "video", pictureOnly: true,
      });
    }
  }
  if (project.sound?.assetId) {
    const {assetId, enabled, volume} = project.sound;
    sources.set(assetId, {id:assetId, kind:"audio", gain:enabled ? volume : 0});
  }
  for (const track of project.extraTracks || [])
    for (const c of track.clips)
      sources.set(voiceKey(track, c), {id:c.assetId, kind:track.kind, gain:track.kind === "audio" ? (c.volume ?? 1) : 0});
  return sources;
}
const mediaIds = project => new Set([...voices(project).values()].map(v => v.id));
const maskIds = project => new Set(project.clips.map(clip => clip.talk?.matte?.id).filter(Boolean));
function* projectImages(project, usedOnly = false) {
  yield* compositionImages(project, usedOnly);
  for (const clip of project.clips) if (clip.talk?.image) yield clip.talk.image;
}
let database;
function openDatabase() {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open("mare-studio-laboratorio", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("projects");
        request.result.createObjectStore("assets");
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          database = undefined;
        };
        resolve(db);
      };
    }).catch(error => {
      database = undefined;
      throw error;
    });
  }
  return database;
}
async function readRecord(store, key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function writeRecords(store, records) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.oncomplete = resolve;
    tx.onabort = () =>
      reject(tx.error || new Error("Não foi possível salvar no dispositivo."));
    for (const [key, value] of records) tx.objectStore(store).put(value, key);
  });
}
export async function readVideoBlob(id, signal) {
  if (!BUILT_INS.has(id)) {
    const blob = await readRecord("assets", id);
    if (blob instanceof Blob) return blob;
    throw Error("O vídeo original está indisponível neste navegador.");
  }
  const response = await fetch(BUILT_INS.get(id), {signal});
  if (!response.ok) throw Error("Não foi possível abrir o vídeo de exemplo.");
  return response.blob();
}

export async function storeMask(blob) {
  if (blob.type !== MASK_TYPE || !blob.size || blob.size > MAX_MASK_BYTES)
    throw Error("A VPS devolveu um recorte inválido.");
  const id = generateId();
  await writeRecords("assets", [[id, blob]]);
  return id;
}
export async function discardMasks(ids) {
  if (!ids.length) return;
  const db = await openDatabase();
  const tx = db.transaction("assets", "readwrite");
  for (const id of ids) tx.objectStore("assets").delete(id);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error);
  });
}
export async function saveProject(project) {
  await writeRecords("projects", [["current", structuredClone(normalizeProject(project))]]);
}
export async function loadProject() {
  const stored = await readRecord("projects", "current");
  return stored == null ? null : normalizeProject(stored);
}
function rasterBlob(src) {
  const binary = atob(src.slice("data:image/png;base64,".length));
  return new Blob([Uint8Array.from(binary, c => c.charCodeAt(0))], {
    type: "image/png",
  });
}
function toImageSource(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () =>
      reject(new Error("Falha ao restaurar a imagem da composição."));
    reader.readAsDataURL(blob);
  });
}

export async function packProject(project) {
  const snapshot = structuredClone(normalizeProject(project));
  const assets = [];
  const blobs = [];
  for (const id of new Set([...mediaIds(snapshot), ...maskIds(snapshot)])) {
    if (BUILT_INS.has(id)) continue;
    const blob = await readRecord("assets", id);
    if (!(blob instanceof Blob))
      throw new Error("Uma mídia do projeto não está mais neste dispositivo.");
    assets.push({ id, type: blob.type, size: blob.size });
    blobs.push(blob);
  }
  const imageSizes = [],
    imageIndexes = new Map();
  for (const layer of new Set(projectImages(snapshot))) {
    if (!imageIndexes.has(layer.src)) {
      const blob = rasterBlob(layer.src);
      imageIndexes.set(layer.src, imageSizes.length);
      imageSizes.push(blob.size);
      blobs.push(blob);
    }
    // Keeping pixels after the header also deduplicates copies of the same artwork.
    layer.src = "mare-image:" + imageIndexes.get(layer.src);
  }
  const metadata = new TextEncoder().encode(
    JSON.stringify({ project: snapshot, assets, imageSizes })
  );
  if (metadata.length > 16 * 1024 * 1024)
    throw new Error("O documento excede o limite do arquivo editável.");
  const length = new ArrayBuffer(4);
  new DataView(length).setUint32(0, metadata.length);
  const hasBezier = snapshot.compositions.some(item => item.document?.layers.some(layer =>
    Object.values(layer.keys).some(keys => keys.some(key => Array.isArray(key.ease)))));
  return new Blob([hasBezier ? CURVE_HEADER : PROJECT_HEADER, length, metadata, ...blobs], {
    type: "application/octet-stream",
  });
}
export async function unpackProject(file) {
  const offset = PROJECT_HEADER.length + 4;
  const header = await file.slice(0, PROJECT_HEADER.length).text();
  if (
    file.size < offset ||
    ![PROJECT_HEADER, LEGACY_HEADER, CURVE_HEADER].includes(header)
  ) {
    throw new Error(
      "Escolha um arquivo de projeto exportado pelo Maré Studio."
    );
  }
  const metadataLength = new DataView(
    await file.slice(PROJECT_HEADER.length, offset).arrayBuffer()
  ).getUint32(0);
  if (metadataLength > 16 * 1024 * 1024 || metadataLength > file.size - offset)
    throw new Error("Projeto incompleto.");
  const {
    project,
    assets,
    imageSizes = [],
  } = JSON.parse(await file.slice(offset, offset + metadataLength).text());
  if (!project || !Array.isArray(project.clips) || !Array.isArray(imageSizes))
    throw new Error("Estrutura de projeto inválida.");
  if (!Array.isArray(assets)) throw new Error("Índice de mídias inválido.");
  let pos = offset + metadataLength;
  validateTracks(project);
  const referenced = mediaIds(project);
  const masks = maskIds(project);
  if ([...masks].some(id => referenced.has(id) || BUILT_INS.has(id)))
    throw Error("Referência de recorte inválida.");
  for (const id of masks) referenced.add(id);
  const replacements = new Map();
  const records = [];
  for (const asset of assets) {
    if (
      !asset ||
      !referenced.has(asset.id) ||
      BUILT_INS.has(asset.id) ||
      replacements.has(asset.id) ||
      !Number.isSafeInteger(asset.size) ||
      asset.size <= 0 ||
      pos + asset.size > file.size ||
      typeof asset.type !== "string" ||
      (masks.has(asset.id) ? asset.type !== MASK_TYPE || asset.size > MAX_MASK_BYTES : asset.type === MASK_TYPE)
    )
      throw new Error("Mídia de projeto inválida.");
    const newId = generateId();
    records.push([newId, file.slice(pos, pos + asset.size, asset.type)]);
    replacements.set(asset.id, newId);
    pos += asset.size;
  }
  const linkedLayers = new Map();
  for (const layer of projectImages(project)) {
    if (typeof layer.src !== "string" || !layer.src.startsWith("mare-image:"))
      continue;
    const index = Number(layer.src.slice(11));
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= imageSizes.length ||
      layer.src !== "mare-image:" + index
    )
      throw new Error("Referência de imagem inválida.");
    if (!linkedLayers.has(index)) linkedLayers.set(index, []);
    linkedLayers.get(index).push(layer);
  }
  for (const [index, size] of imageSizes.entries()) {
    if (
      !linkedLayers.has(index) ||
      !Number.isSafeInteger(size) ||
      size < 1 ||
      size > 8 * 1024 * 1024 ||
      pos + size > file.size
    )
      throw new Error("Dados de imagem inválidos.");
    const src = await toImageSource(file.slice(pos, pos + size, "image/png"));
    for (const layer of linkedLayers.get(index)) layer.src = src;
    pos += size;
  }
  const restored = header === LEGACY_HEADER ? normalizeProject(project) : validateProject(project);
  if (
    pos !== file.size ||
    [...referenced].some(id => !BUILT_INS.has(id) && !replacements.has(id))
  ) {
    throw new Error("Faltam mídias no arquivo do projeto.");
  }
  for (const clip of [...restored.clips, ...(restored.extraTracks || []).flatMap(track => track.clips)])
    if (replacements.has(clip.assetId))
      clip.assetId = replacements.get(clip.assetId);
  for (const clip of restored.clips) if (clip.talk?.matte) clip.talk.matte.id = replacements.get(clip.talk.matte.id);
  if (replacements.has(restored.sound.assetId))
    restored.sound.assetId = replacements.get(restored.sound.assetId);
  if (records.length) await writeRecords("assets", records);
  return restored;
}
function generateId() {
  return (
    "media-" +
    Array.from(crypto.getRandomValues(new Uint32Array(4)), n =>
      n.toString(16).padStart(8, "0")
    ).join("")
  );
}
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: filename,
  });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function mediaEvent(el, event, action) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => finish(new Error("A mídia demorou a responder. Tente novamente.")),
      12000
    );
    function finish(error) {
      clearTimeout(timer);
      el.removeEventListener(event, done);
      el.removeEventListener("error", failed);
      if (error) reject(error);
      else resolve();
    }
    const done = () => finish();
    const failed = () =>
      finish(new Error("O navegador não conseguiu ler o formato desta mídia."));
    el.addEventListener(event, done);
    el.addEventListener("error", failed);
    try {
      action();
    } catch (error) {
      finish(error);
    }
  });
}
function locate(project, t) {
  let start = 0;
  for (let i = 0; i < project.clips.length; i++) {
    const clip = project.clips[i];
    if (t < start + clip.duration || (i === project.clips.length - 1 && t === durationOf(project) && t <= start + clip.duration)) {
      return {
        clip,
        index: i,
        start,
        mix: transitionAt(project.clips, i, t - start),
        sourceTime: (clip.trim || 0) + clamp(t - start, 0, clip.duration),
      };
    }
    start += clip.duration;
  }
}
function companion(active) {
  const mix = active?.mix;
  if (!mix || !needsCompanion(mix.type)) return null;
  const beforeCut = active.clip === mix.from;
  const clip = beforeCut ? mix.to : mix.from;
  return clip.kind === "video" ? {key:transitionMediaKey(clip), id:clip.id,
    time:beforeCut ? mix.incomingTime : mix.outgoingTime} : null;
}
function mediaTime(el, time) {
  return clamp(time, 0, Math.max(0, el.duration - 0.001));
}
async function seekMedia(el, time, tolerance = 0.008) {
  // Media elements may truncate fractional microseconds into the previous frame.
  const target = mediaTime(el, Math.ceil(time * 1e6) / 1e6);
  if (!el.seeking && Math.abs(el.currentTime - target) < tolerance) return;
  await mediaEvent(el, "seeked", () => {
    el.currentTime = target;
  });
}
export class MediaEngine {
  constructor(canvas, drawFrame) {
    this.canvas = canvas;
    this.drawFrame = drawFrame;
    this.media = new Map();
    this.pending = new Map();
    this.version = 0;
    this.playing = false;
    this.audioSources = new Map();
    this.imageSources = new Set();
    this.maskCache = new Map();
  }
  async loadAsset(id, kind, blob, key = id) {
    if (this.media.has(key)) return this.media.get(key);
    if (this.pending.has(key)) return this.pending.get(key);
    const loading = (async () => {
      let url = BUILT_INS.get(id);
      if (!url) {
        const stored = blob || (await readRecord("assets", id));
        if (!stored)
          throw new Error(
            "Mídia indisponível. Abra uma cópia completa do projeto."
          );
        url = URL.createObjectURL(stored);
      }
      const el = document.createElement(kind === "audio" ? "audio" : "video");
      el.playsInline = true;
      el.preload = "auto";
      try {
        await mediaEvent(el, "loadeddata", () => {
          el.src = url;
          el.load();
        });
        if (this.disposed) throw new DOMException("Prévia fechada.", "AbortError");
        if (!Number.isFinite(el.duration) || el.duration <= 0)
          throw new Error("A duração desta mídia é inválida.");
        this.media.set(key, el);
        return el;
      } catch (error) {
        if (!BUILT_INS.has(id)) URL.revokeObjectURL(url);
        throw error;
      }
    })();
    this.pending.set(key, loading);
    try {
      return await loading;
    } finally {
      this.pending.delete(key);
    }
  }
  async loadImage(src) {
    if (this.media.has(src)) return;
    if (this.pending.has(src)) return this.pending.get(src);
    const image = new Image();
    if (!src.startsWith("data:image/png;base64,iVBORw0KGgo"))
      throw new Error("Imagem inválida.");
    image.src = src;
    const loading = image
      .decode()
      .then(() => {
        if (this.imageSources.has(src)) this.media.set(src, image);
      })
      .catch(() => {
        throw new Error("A imagem não pôde ser decodificada.");
      });
    this.pending.set(src, loading);
    try {
      await loading;
    } finally {
      this.pending.delete(src);
    }
  }
  async prepare(project) {
    const images = new Set(
      Array.from(projectImages(project, true), layer => layer.src)
    );
    const overlays = new Set();
    for (const [index, clip] of project.clips.entries()) {
      const type = clip.transitionIn?.type;
      if (transitionPack[type]?.overlay && transitionFrames(project.clips[index - 1], clip))
        overlays.add(type);
    }
    for (const old of this.imageSources)
      if (!images.has(old)) this.media.delete(old);
    this.imageSources = images;
    await Promise.all([
      ...Array.from(images, src => this.loadImage(src)),
      ...Array.from(overlays, loadTransitionOverlay),
    ]);
    const sources = voices(project);
    for (const [key, el] of this.media) {
      if (typeof key !== "string" || !key.startsWith('["') || sources.has(key)) continue;
      el.pause();
      const url = el.src;
      el.removeAttribute("src");
      el.load();
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      this.audioSources.get(key)?.disconnect();
      this.audioSources.delete(key);
      this.media.delete(key);
    }
    await Promise.all(
      [...sources].map(([key, source]) =>
        this.loadAsset(source.id, source.kind, undefined, key)
      )
    );
  }
  async prepareMask(clip) {
    const id = needsMatte(clip?.talk) && clip.talk.matte?.id;
    if (!id) return;
    if (this.maskCache.has(id)) {
      const saved = this.maskCache.get(id);
      this.maskCache.delete(id);
      this.maskCache.set(id, saved);
      return saved;
    }
    const loading = (async () => {
      const blob = await readRecord("assets", id);
      if (!(blob instanceof Blob)) throw Error("Recorte de pessoa ausente neste projeto.");
      const matte = await decodeMask(blob);
      if (this.disposed) return;
      this.media.set(id, matte);
      for (const key of this.maskCache.keys()) {
        if (this.maskCache.size <= 3) break;
        if (key !== id && this.media.has(key)) {
          this.maskCache.delete(key);
          this.media.delete(key);
        }
      }
    })().catch(error => { this.maskCache.delete(id); throw error; });
    this.maskCache.set(id, loading);
    return loading;
  }
  dispose() {
    this.disposed = true;
    this.pause();
    this.imageSources.clear();
    this.maskCache.clear();
    for (const el of this.media.values()) {
      if (!(el instanceof HTMLMediaElement)) continue;
      const url = el.src;
      el.removeAttribute("src");
      el.load();
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    }
    this.media.clear();
    this.context?.close().catch(() => {});
  }
  async importMedia(file, kind) {
    if (!file?.size || !["audio", "video"].includes(kind))
      throw new Error("Escolha uma mídia válida.");
    const id = generateId();
    const el = await this.loadAsset(id, kind, file);
    if (kind === "video" && !(el.videoWidth > 0))
      throw new Error("Este arquivo não contém vídeo.");
    await writeRecords("assets", [[id, file]]);
    return { assetId: id, name: file.name, duration: el.duration };
  }
  pause() {
    this.cancelExport?.();
    this.stopPlayback();
  }
  stopPlayback() {
    this.version++;
    this.playing = false;
    cancelAnimationFrame(this.frame);
    for (const el of this.media.values()) el.pause?.();
  }
  async seek(project, time) {
    this.pause();
    const version = this.version;
    await this.prepare(project);
    if (version !== this.version) return;
    await this.seekVisuals(project, time);
    if (version === this.version)
      this.drawFrame(this.canvas, project, time, this.media);
  }
  async seekVisuals(project, time) {
    time = Math.min(time, Math.max(0, durationOf(project) - 1e-7));
    const active = locate(project, time);
    // Issue all seeks before yielding. An older scrub waiting on a matte must
    // never move a companion or overlay back after a newer scrub has finished.
    const pending = [];
    if (active?.clip.kind === "video") {
      pending.push(this.prepareMask(active.clip), seekMedia(this.media.get(active.clip.assetId), active.sourceTime, 1e-6));
    }
    const picture = companion(active);
    if (picture) {
      pending.push(this.prepareMask(active.clip === active.mix.from ? active.mix.to : active.mix.from),
        seekMedia(this.media.get(picture.key), picture.time, 1e-6));
    }
    for (const track of project.extraTracks || []) {
      const c = activeOn(track, time);
      if (c && track.kind === "video") pending.push(seekMedia(this.media.get(voiceKey(track,c)), c.trim + time - c.start, 1e-6));
    }
    await Promise.all(pending);
  }
  async openAudio() {
    if (!this.context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio)
        throw new Error("O navegador não disponibiliza a saída de áudio.");
      this.context = new Audio();
      this.monitor = this.context.createGain();
      this.monitor.connect(this.context.destination);
    }
    await this.context.resume();
  }
  connectSources(project, sink) {
    for (const [id, voice] of voices(project)) {
      if (voice.pictureOnly) { this.media.get(id).muted = true; continue; }
      if (!this.audioSources.has(id)) {
        const source = this.context.createMediaElementSource(
          this.media.get(id)
        );
        const gain = this.context.createGain();
        source.connect(gain);
        this.audioSources.set(id, gain);
      }
      const gain = this.audioSources.get(id);
      gain.disconnect();
      gain.connect(sink);
      gain.gain.value = clamp(voice.gain, 0, 1);
    }
  }
  async run(project, start, output, update, ended, failed, version, captureFrame) {
    const full = durationOf(project);
    const from = clamp(start, 0, full);
    const song = project.sound?.enabled
      ? this.media.get(project.sound.assetId)
      : null;
    if (song) {
      song.loop = true;
      await seekMedia(song, from % song.duration);
    }
    if (version !== this.version) return;
    let prior;
    const activate = async (active, running) => {
      if (prior?.kind === "video") this.media.get(prior.assetId)?.pause();
      prior = active?.clip;
      if (prior?.kind !== "video") return;
      const el = this.media.get(prior.assetId);
      await Promise.all([this.prepareMask(prior), seekMedia(el, active.sourceTime)]);
      if (version === this.version && running) await el.play();
    };
    let previousPicture;
    const syncPicture = async active => {
      const picture = companion(active);
      const changed = previousPicture?.id !== picture?.id;
      if (changed && previousPicture) this.media.get(previousPicture.key).pause();
      previousPicture = picture;
      if (!picture) return;
      const el = this.media.get(picture.key);
      if (changed) await Promise.all([this.prepareMask(active.clip === active.mix.from ? active.mix.to : active.mix.from),
        seekMedia(el, picture.time)]);
      if (version !== this.version) return;
      if (el.paused && picture.time >= 0 && picture.time < el.duration - .008) {
        await seekMedia(el, picture.time);
        if (version === this.version) await el.play();
      }
    };
    const current = new Map();
    const syncTracks = async t => {
      await Promise.all((project.extraTracks || []).map(async track => {
        const c = activeOn(track, t);
        const old = current.get(track.id);
        if (old?.id === c?.id) return;
        if (old) this.media.get(voiceKey(track, old)).pause();
        current.set(track.id, c);
        if (!c) return;
        const el = this.media.get(voiceKey(track, c));
        await seekMedia(el, c.trim + t - c.start);
        if (version === this.version) await el.play();
      }));
    };
    const initial = locate(project, from);
    await Promise.all([activate(initial, false), syncTracks(from), syncPicture(initial)]);
    if (version !== this.version) return;
    captureFrame?.(from);
    this.drawFrame(output, project, from, this.media);
    await Promise.all([
      song?.play(),
      ...(prior?.kind === "video"
        ? [this.media.get(prior.assetId).play()]
        : []),
    ]);
    if (version !== this.version) return;
    this.playing = true;
    const baseline = performance.now();
    const tick = async () => {
      if (version !== this.version) return;
      try {
        const t = Math.min(full, from + (performance.now() - baseline) / 1000);
        const active = locate(project, t);
        const entering = prior?.id !== active?.clip.id;
        const impact = entering && active && transitionPack[active.clip.transitionIn?.type]?.overlay
          && transitionFrames(project.clips[active.index - 1], active.clip);
        await Promise.all([entering && activate(active, true), syncTracks(t), syncPicture(active)]);
        if (version !== this.version) return;
        // A display tick can land past a one-frame flash. Draw the cut once as the clip changes.
        captureFrame?.(t, impact);
        this.drawFrame(output, project, impact ? active.start : t, this.media);
        update?.(t);
        if (t >= full) {
          this.stopPlayback();
          ended?.();
          return;
        }
        this.frame = requestAnimationFrame(tick);
      } catch (error) {
        this.stopPlayback();
        failed(error);
      }
    };
    this.frame = requestAnimationFrame(tick);
  }
  async play(project, start, onTime, onEnd, onError) {
    this.pause();
    const version = this.version;
    await Promise.all([this.openAudio(), this.prepare(project)]);
    if (version !== this.version) return;
    this.connectSources(project, this.monitor);
    await this.run(
      project,
      start,
      this.canvas,
      onTime,
      onEnd,
      error => {
        if (onError) onError(error);
        else onEnd?.(error);
      },
      version
    );
  }
  async exportMP4(
    project,
    { onProgress, signal, width = 1080, height = 1920 } = {}
  ) {
    if (this.exporting) throw new Error("Uma exportação já está em andamento.");
    const hasAudio = [...voices(project).values()].some(voice => !voice.pictureOnly && voice.gain > 0);
    const codecs = hasAudio
      ? ["avc1.42E028,mp4a.40.2", "avc1,mp4a.40.2", "avc1,opus", "vp9,opus"]
      : ["avc1.42E028", "avc1", "vp9"];
    const formats = [...codecs.map(value => "video/mp4;codecs=" + value), "video/mp4"];
    const mimeType = formats.find(type => window.MediaRecorder?.isTypeSupported(type));
    if (!mimeType || !HTMLCanvasElement.prototype.captureStream) {
      throw new Error(
        "Este navegador não consegue preparar o MP4. Tente abrir o Maré em um navegador atualizado."
      );
    }
    const abortError = () =>
      new DOMException("Exportação cancelada.", "AbortError");
    if (signal?.aborted) throw abortError();
    this.exporting = true;
    this.pause();
    const version = this.version;
    let stream, recorder, sink, onAbort, onHidden, stopTimer;
    try {
      await Promise.all([hasAudio && this.openAudio(), this.prepare(project)]);
      if (signal?.aborted || version !== this.version) throw abortError();
      if (hasAudio) {
        sink = this.context.createMediaStreamDestination();
        this.connectSources(project, sink);
      }
      const output = Object.assign(document.createElement("canvas"), {
        width,
        height,
      });
      await this.seekVisuals(project, 0);
      this.drawFrame(output, project, 0, this.media);
      // Request frames at the timeline rate, including still images and the final pose.
      stream = output.captureStream(0);
      const picture = stream.getVideoTracks()[0];
      const manual = typeof picture.requestFrame === "function";
      if (!manual) {
        picture.stop();
        stream = output.captureStream(FPS);
      }
      if (sink) stream.addTrack(sink.stream.getAudioTracks()[0]);
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 8000000,
        audioBitsPerSecond: 128000,
      });
      const parts = [];
      const total = durationOf(project);
      return await new Promise((resolve, reject) => {
        onAbort = () => reject(abortError());
        this.cancelExport = onAbort;
        onHidden = () => {
          if (document.hidden)
            reject(
              new Error("Mantenha a página visível durante a exportação.")
            );
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        document.addEventListener("visibilitychange", onHidden);
        recorder.ondataavailable = event => {
          if (event.data.size) parts.push(event.data);
        };
        recorder.onerror = event =>
          reject(event.error || new Error("Falha ao codificar o vídeo."));
        recorder.onstop = () => {
          const blob = new Blob(parts, { type: recorder.mimeType || mimeType });
          if (blob.size) resolve(blob);
          else reject(new Error("O navegador não gerou o arquivo MP4."));
        };
        if (signal?.aborted || version !== this.version) return onAbort();
        if (document.hidden) return onHidden();
        recorder.start(500);
        let lastFrame = -1;
        this.run(
          project,
          0,
          output,
          t => onProgress?.(t / total),
          // Canvas capture and encoding are asynchronous. Leave the last draw time
          // to reach the recorder before asking it to flush.
          () => { stopTimer = setTimeout(() => recorder.stop(), Math.ceil(1000 / FPS)); },
          reject,
          version,
          (time, impact) => {
            if (!manual) return;
            const frame = Math.floor(time * FPS);
            if (frame === lastFrame && !impact && time < total) return;
            lastFrame = frame;
            picture.requestFrame();
          }
        ).catch(reject);
      });
    } finally {
      this.cancelExport = null;
      this.stopPlayback();
      this.exporting = false;
      clearTimeout(stopTimer);
      if (onAbort) signal?.removeEventListener("abort", onAbort);
      if (onHidden) document.removeEventListener("visibilitychange", onHidden);
      if (recorder && recorder.state !== "inactive") recorder.stop();
      stream?.getTracks().forEach(track => track.stop());
      sink?.disconnect();
      if (sink) {
        for (const gain of this.audioSources.values()) {
          gain.disconnect();
          gain.connect(this.monitor);
        }
      }
    }
  }
}
