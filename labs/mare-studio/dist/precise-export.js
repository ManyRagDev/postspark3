import {
  ALL_FORMATS, AudioBufferSink, AudioBufferSource, BlobSource, BufferTarget, CanvasSink, CanvasSource, Input,
  Mp4OutputFormat, WebMOutputFormat, Output, getFirstEncodableAudioCodec, getFirstEncodableVideoCodec,
} from "./vendor/mediabunny-1.66.4.js";
import { createHdFrameSource, hdAvcProfile } from "./mp4-frames.js";
import { chooseAacEncoder } from "./audio-encoder.js";
import {MediaEngine, readVideoBlob, visualPlacements} from "./engine.js";
import {durationOf, FPS} from "./montage-model.js";
import {drawFrame} from "./renderer.js";

const sampleRate = 48000;

// Keep presentation timestamps when extracting a trimmed window. A video's
// audio can start after its first picture or contain gaps between packets.
async function scheduleAudio(context, sink, endTime, use, signal) {
  const from = use.trim || 0;
  const to = Math.min(endTime, from + use.duration);
  if (to <= from) return;
  let windowBuffer;
  for await (const {buffer, timestamp} of sink.buffers(from, to)) {
    signal.throwIfAborted();
    windowBuffer ??= context.createBuffer(buffer.numberOfChannels,
      Math.max(1, Math.round((to - from) * buffer.sampleRate)), buffer.sampleRate);
    if (buffer.sampleRate !== windowBuffer.sampleRate || buffer.numberOfChannels !== windowBuffer.numberOfChannels)
      throw Error("A mídia muda de formato de áudio durante o clipe. Escolha outra opção de exportação.");
    const offset = Math.round((timestamp - from) * buffer.sampleRate);
    const begin = Math.max(0, -offset);
    const end = Math.min(buffer.length, windowBuffer.length - offset);
    if (end <= begin) continue;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++)
      windowBuffer.copyToChannel(buffer.getChannelData(ch).subarray(begin, end), ch, offset + begin);
  }
  if (!windowBuffer) return;
  const source = context.createBufferSource();
  source.buffer = windowBuffer;
  source.loop = Boolean(use.loop);
  const gain = context.createGain();
  gain.gain.value = use.volume ?? 1;
  source.connect(gain).connect(context.destination);
  source.start(use.start, 0, use.duration);
}

// Source audio follows the cuts on V1. Companion pictures and extra video
// tracks are silent in the preview, including during a visual transition.
async function mixAudio(project, duration, signal) {
  const placements = new Map();
  function place(id, placement) {
    if (!placements.has(id)) placements.set(id, []);
    placements.get(id).push(placement);
  }
  let start = 0;
  for (const clip of project.clips) {
    if (clip.kind === "video" && clip.volume!==0) place(clip.assetId, {start, trim: clip.trim, duration: clip.duration, volume: clip.volume??1, video: true});
    start += clip.duration;
  }
  for (const track of project.extraTracks || []) {
    if (track.kind === "audio") for (const clip of track.clips) place(clip.assetId, clip);
  }
  const sound = project.sound;
  if (sound?.enabled && sound.assetId && sound.volume > 0) {
    place(sound.assetId, {start: 0, trim: 0, duration, volume: Math.min(1, sound.volume), loop: true});
  }
  let context;
  for (const [id, uses] of placements) {
    signal.throwIfAborted();
    const blob = await readVideoBlob(id, signal);
    const input = new Input({source: new BlobSource(blob), formats: ALL_FORMATS});
    try {
      const track = await input.getPrimaryAudioTrack();
      if (!track && uses.every(use => use.video)) continue;
      if (!track) throw Error("Uma mídia da faixa de áudio não contém som.");
      context ??= new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
      if (!(await track.canDecode())) throw Error("O navegador não consegue ler o áudio desta mídia quadro a quadro. Escolha outra opção de exportação.");
      const sink = new AudioBufferSink(track);
      const end = await track.computeDuration();
      for (const use of uses) {
        const endTime = use.loop ? await input.computeDuration() : end;
        await scheduleAudio(context, sink, endTime, use, signal);
      }
    } finally {
      input.dispose();
    }
  }
  signal.throwIfAborted();
  return context ? context.startRendering() : null;
}

// A seeked video element can still paint the previous picture. Select the decoded
// presentation sample directly and keep separate streams for simultaneous trims.
async function openPictures(project, frames, signal) {
  const streams = new Map();
  const finished = [];
  const inputs = new Map();
  for (let frame = 0; frame < frames; frame++) {
    for (const {key, clip, time} of visualPlacements(project, frame / FPS)) {
      if (!streams.has(key)) streams.set(key, {assetId: clip.assetId, timestamps: []});
      streams.get(key).timestamps.push(Math.ceil(time * 1e6) / 1e6);
    }
  }
  async function close() {
    try {
      await Promise.all([...streams.values()].map(stream => stream.iterator?.return()));
    } finally {
      for (const input of inputs.values()) input.dispose();
    }
  }
  try {
    for (const stream of streams.values()) {
      signal.throwIfAborted();
      if (!inputs.has(stream.assetId)) {
        const blob = await readVideoBlob(stream.assetId, signal);
        inputs.set(stream.assetId, new Input({source: new BlobSource(blob), formats: ALL_FORMATS}));
      }
      const track = await inputs.get(stream.assetId).getPrimaryVideoTrack();
      if (!track || !(await track.canDecode())) throw Error("Não foi possível decodificar os quadros desta mídia. Escolha outra opção de exportação.");
      // Transition handles can extend beyond a trimmed source. Hold its edge picture, as in preview.
      const lastTime = Math.max(0, await track.computeDuration() - 0.001);
      stream.timestamps = stream.timestamps.map(time => Math.max(0, Math.min(time, lastTime)));
      stream.remaining = stream.timestamps.length;
      stream.iterator = new CanvasSink(track, {alpha: true, poolSize: 1}).canvasesAtTimestamps(stream.timestamps);
    }
    return {close, async read(engine, time) {
      for (const {key, clip} of visualPlacements(project, time)) {
        signal.throwIfAborted();
        await engine.prepareMask(clip);
        const stream = streams.get(key);
        const {value, done} = await stream.iterator.next();
        if (done) throw Error("A sequência de quadros terminou antes da montagem.");
        engine.media.set(key, value?.canvas);
        if (--stream.remaining === 0) finished.push(key);
      }
    }, async releaseFinished(engine) {
      for (const key of finished) {
        const stream = streams.get(key);
        await stream.iterator.return();
        streams.delete(key);
        engine.media.delete(key);
      }
      finished.length = 0;
    }};
  } catch (error) {
    await close();
    throw error;
  }
}

let workerMp4Encoder;
export function setWorkerMp4Encoder(encoder) {
  workerMp4Encoder = encoder;
}
export async function exportPreciseMP4(project, options) {
  if (workerMp4Encoder && !(await VideoEncoder.isConfigSupported({
    codec: hdAvcProfile, width: options.width, height: options.height,
    bitrate: 8_000_000, framerate: FPS,
  })).supported) {
    const intermediate = await encode(project, options, false, true);
    return workerMp4Encoder(intermediate, options.signal);
  }
  return encode(project, options, false);
}
export const exportTransparentWebM=(project,options)=>encode(project,options,true);
async function encode(project, {signal, width, height, onProgress,viewport}, transparent, workerIntermediate = false) {
  if (!globalThis.VideoEncoder) throw Error("A codificação quadro a quadro está indisponível neste navegador. Escolha outra opção de exportação.");
  const bitrate = 8_000_000;
  const webm = transparent || workerIntermediate;
  const fullCodecString = webm ? undefined : hdAvcProfile;
  const codec = webm
    ? await getFirstEncodableVideoCodec(["vp9"], {width, height, bitrate, frameRate: FPS})
    : (await VideoEncoder.isConfigSupported({codec: fullCodecString, width, height, bitrate, framerate: FPS})).supported && "avc";
  if (!codec) throw Error("O navegador não oferece um codificador compatível com este tamanho. Escolha outra opção de exportação.");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const render=(canvas,document,time,media)=>drawFrame(canvas,document,time,media,transparent,viewport);
  const engine = new MediaEngine(canvas, render);
  const target = new BufferTarget();
  const output = new Output({format: webm?new WebMOutputFormat():new Mp4OutputFormat({fastStart: "in-memory"}), target});
  const hdFrames = webm ? null : createHdFrameSource(canvas, bitrate);
  const video = hdFrames?.source ?? new CanvasSource(canvas, {codec, bitrate, alpha:transparent?"keep":"discard"});
  output.addVideoTrack(video, {frameRate: FPS});
  let pictures;
  try {
    await engine.preparePictures(project);
    const duration = durationOf(project);
    const frames = Math.ceil(duration * FPS - 1e-8);
    pictures = await openPictures(project, frames, signal);
    const mix = await mixAudio(project, duration, signal);
    let audio;
    if (mix) {
      const config = {numberOfChannels: 2, sampleRate, bitrate: 128000};
      const audioCodec = webm ? await getFirstEncodableAudioCodec(["opus"], config) : await chooseAacEncoder(config);
      if (!audioCodec) throw Error("O navegador não consegue codificar o áudio do projeto. Escolha outra opção de exportação.");
      audio = new AudioBufferSource({codec: audioCodec, bitrate: 128000});
      output.addAudioTrack(audio);
    }
    signal.throwIfAborted();
    await output.start();
    if (audio) {
      await audio.add(mix);
      audio.close();
    }
    for (let frame = 0; frame < frames; frame++) {
      signal.throwIfAborted();
      const time = frame / FPS;
      await pictures.read(engine, time);
      render(canvas, project, time, engine.media);
      if (hdFrames) await hdFrames.add(time, 1 / FPS);
      else await video.add(time, 1 / FPS);
      await pictures.releaseFinished(engine);
      const progress=onProgress?.((frame + 1) / frames);
      if(progress instanceof Promise)await progress;
    }
    signal.throwIfAborted();
    video.close();
    await output.finalize();
    return new Blob([target.buffer], {type: await output.getMimeType()});
  } finally {
    await pictures?.close();
    engine.dispose();
    if (output.state === "started") await output.cancel();
  }
}
