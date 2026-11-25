import {
  ALL_FORMATS, AudioBufferSink, AudioBufferSource, BlobSource, BufferTarget, CanvasSource, Input,
  Mp4OutputFormat, Output, getFirstEncodableAudioCodec, getFirstEncodableVideoCodec,
} from "./vendor/mediabunny-1.66.4.js";
import {MediaEngine, readVideoBlob} from "./engine.js";
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
    if (clip.kind === "video") place(clip.assetId, {start, trim: clip.trim, duration: clip.duration, volume: 1, video: true});
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

export async function exportPreciseMP4(project, {signal, width, height, onProgress}) {
  if (!globalThis.VideoEncoder) throw Error("A codificação quadro a quadro está indisponível neste navegador. Escolha outra opção de exportação.");
  const bitrate = 8_000_000;
  const codec = await getFirstEncodableVideoCodec(["avc", "vp9"], {width, height, bitrate, frameRate: FPS});
  if (!codec) throw Error("O navegador não oferece um codificador compatível com este tamanho. Escolha outra opção de exportação.");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const engine = new MediaEngine(canvas, drawFrame);
  const target = new BufferTarget();
  const output = new Output({format: new Mp4OutputFormat({fastStart: "in-memory"}), target});
  const video = new CanvasSource(canvas, {codec, bitrate});
  output.addVideoTrack(video, {frameRate: FPS});
  try {
    await engine.prepare(project);
    const duration = durationOf(project);
    const frames = Math.ceil(duration * FPS - 1e-8);
    const mix = await mixAudio(project, duration, signal);
    let audio;
    if (mix) {
      const audioCodec = await getFirstEncodableAudioCodec(["aac", "opus"], {numberOfChannels: 2, sampleRate, bitrate: 128000});
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
      await engine.seekVisuals(project, time);
      drawFrame(canvas, project, time, engine.media);
      await video.add(time, 1 / FPS);
      onProgress?.((frame + 1) / frames);
    }
    signal.throwIfAborted();
    video.close();
    await output.finalize();
    return new Blob([target.buffer], {type: await output.getMimeType()});
  } finally {
    engine.dispose();
    if (output.state === "started") await output.cancel();
  }
}
