import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  Input,
  Mp4OutputFormat,
  Output,
} from "../../../../../labs/mare-studio/dist/vendor/mediabunny-1.66.4.js";

import {
  createHdFrameSource,
  hdAvcProfile,
} from "../../../../../labs/mare-studio/dist/mp4-frames.js";
import { chooseAacEncoder } from "../../../../../labs/mare-studio/dist/audio-encoder.js";
import { temporalInterval } from "@shared/canvasTemporalMedia";
import { drawTemporalFrame } from "./temporalPlayback";

function codecUnavailable(message) {
  return Object.assign(new Error(message), {
    code: "TEMPORAL_CODEC_UNAVAILABLE",
  });
}

// A seeked media element may still paint its previous image. The export and
// worker select decoded presentation samples; audio and every slot share the input.
export async function openTemporalFrames(entries) {
  const inputs = new Map();
  const pictures = [];
  async function close() {
    try {
      await Promise.all(pictures.map(picture => picture.iterator?.return()));
    } finally {
      for (const input of inputs.values()) input.dispose();
    }
  }
  try {
    for (const clip of entries) {
      const { source, video, canvas } = clip;
      const key = source.assetId;
      if (!inputs.has(key)) {
        const response = await fetch(video.currentSrc || video.src);
        if (!response.ok)
          throw Error("Não foi possível abrir o vídeo autorizado.");
        inputs.set(
          key,
          new Input({
            source: new BlobSource(await response.blob()),
            formats: ALL_FORMATS,
          })
        );
      }
      const input = inputs.get(key);
      const track = await input.getPrimaryVideoTrack();
      if (!track || !(await track.canDecode()))
        throw codecUnavailable(
          "O navegador não consegue decodificar os quadros desta mídia."
        );
      const timing = temporalInterval(source, video.duration);
      pictures.push({
        ...timing,
        canvas,
        sink: new CanvasSink(track, { alpha: true, poolSize: 1 }),
      });
    }
    let nextFrame = -1;
    async function draw(time) {
      const frame = Math.round(time * 30);
      const onGrid = Math.abs(frame / 30 - time) < 1e-8;
      const restart = frame !== nextFrame || !onGrid;
      for (const picture of pictures) {
        const { start, end, from, canvas, sink } = picture;
        if (restart && picture.iterator) {
          await picture.iterator.return();
          picture.iterator = undefined;
        }
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (time < start || time >= end) continue;
        const timestamp = t =>
          Math.ceil(Math.max(0, from + t - start) * 1e6) / 1e6;
        let sample;
        if (onGrid) {
          if (!picture.iterator) {
            function* timestamps() {
              for (let i = frame; i / 30 < end; i++) yield timestamp(i / 30);
            }
            picture.iterator = sink.canvasesAtTimestamps(timestamps());
          }
          const step = await picture.iterator.next();
          if (step.done)
            throw Error("A faixa terminou antes do quadro solicitado.");
          sample = step.value;
        } else sample = await sink.getCanvas(timestamp(time));
        if (sample)
          ctx.drawImage(sample.canvas, 0, 0, canvas.width, canvas.height);
      }
      nextFrame = onGrid ? frame + 1 : -1;
    }
    return { inputs, draw, close };
  } catch (error) {
    await close();
    throw error;
  }
}

async function mix(entries, duration, inputs) {
  let context;
  for (const { video, source } of entries.filter(
    item => !item.source.muted && item.source.volume !== 0
  )) {
    const { start, from, to } = temporalInterval(source, video.duration);
    const input = inputs.get(source.assetId);
    const track = await input.getPrimaryAudioTrack();
    if (!track) continue;
    if (!(await track.canDecode()))
      throw codecUnavailable("O navegador não consegue decodificar o áudio.");
    context ??= new OfflineAudioContext(2, Math.ceil(duration * 48000), 48000);
    const gain = context.createGain();
    gain.gain.value = source.volume ?? 1;
    gain.connect(context.destination);
    for await (const { buffer, timestamp } of new AudioBufferSink(
      track
    ).buffers(from, to)) {
      const node = context.createBufferSource();
      node.buffer = buffer;
      node.connect(gain);
      const offset = Math.max(0, from - timestamp);
      const len = Math.min(
        buffer.duration - offset,
        to - Math.max(timestamp, from)
      );
      if (len > 0)
        node.start(start + Math.max(0, timestamp - from), offset, len);
    }
  }
  return context?.startRendering();
}

export async function exportTemporalSlide(entries, drawFrame) {
  if (
    !entries.length ||
    entries.some(
      ({ video }) => !Number.isFinite(video.duration) || video.readyState < 2
    )
  )
    throw Error("Aguarde o carregamento do vídeo antes de baixar.");
  const duration = Math.max(
    ...entries.map(
      ({ video, source }) => temporalInterval(source, video.duration).end
    )
  );
  if (!Number.isFinite(duration) || duration <= 0)
    throw Error("O trecho selecionado está fora da duração do vídeo.");

  if (typeof VideoEncoder === "undefined")
    throw codecUnavailable(
      "Codificação de vídeo indisponível neste navegador."
    );
  const first = drawFrame();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(first.width / 2) * 2;
  canvas.height = Math.round(first.height / 2) * 2;
  const graphics = canvas.getContext("2d", { willReadFrequently: true });
  const bitrate = 6_000_000;
  // All HD slide formats fit H.264 level 4.0 at 30 fps.
  const fullCodecString = hdAvcProfile;
  const support = await VideoEncoder.isConfigSupported({
    codec: fullCodecString,
    width: canvas.width,
    height: canvas.height,
    bitrate,
    framerate: 30,
  });
  if (!support.supported)
    throw codecUnavailable(
      "O navegador não oferece H.264 compatível para este slide."
    );
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });
  const { source, add } = createHdFrameSource(canvas, bitrate);
  output.addVideoTrack(source, { frameRate: 30 });
  let frames;
  try {
    entries.forEach(({ video }) => video.pause());
    frames = await openTemporalFrames(entries);
    const audio = await mix(entries, duration, frames.inputs);
    let sound;
    if (audio) {
      const audioCodec = await chooseAacEncoder({
        numberOfChannels: 2,
        sampleRate: 48000,
        bitrate: 128000,
      });
      if (!audioCodec)
        throw codecUnavailable(
          "O navegador não consegue exportar a faixa de áudio."
        );
      sound = new AudioBufferSource({ codec: audioCodec, bitrate: 128000 });
      output.addAudioTrack(sound);
    }
    await output.start();
    if (sound) {
      await sound.add(audio);
      sound.close();
    }
    for (let frame = 0; frame < Math.ceil(duration * 30); frame++) {
      await frames.draw(frame / 30);
      graphics.drawImage(drawFrame(), 0, 0, canvas.width, canvas.height);
      await add(frame / 30, 1 / 30);
    }
    source.close();
    await output.finalize();
    return new Blob([target.buffer], { type: "video/mp4" });
  } finally {
    if (output.state === "started") await output.cancel();
    await frames?.close();
    await drawTemporalFrame(entries, 0);
  }
}
