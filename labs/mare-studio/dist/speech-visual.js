import { captionCues, needsMatte } from "./speech-model.js";

export const MASK_TYPE = "application/x-mare-mask";
export const MASK_MAGIC = "MAREMASK1\n";
const MASK_HEADER = MASK_MAGIC.length + 2;
export const MASK_WIDTH = 144, MASK_HEIGHT = 256, MASK_RATE = 15;
export const MASK_PLANE = MASK_WIDTH * MASK_HEIGHT;
export const MAX_MASK_FRAMES = 62 * MASK_RATE;
export const MAX_MASK_BYTES = MASK_PLANE * MAX_MASK_FRAMES + 65536;
const WIDTH = 540, HEIGHT = 960;

export function maskLength(header) {
  if (header.byteLength !== MASK_HEADER ||
      String.fromCharCode(...header.subarray(0, MASK_MAGIC.length)) !== MASK_MAGIC)
    throw Error("Arquivo de recorte inválido.");
  const frames = header[MASK_MAGIC.length] * 256 + header[MASK_MAGIC.length + 1];
  if (!frames || frames > MAX_MASK_FRAMES) throw Error("Quantidade de quadros de recorte inválida.");
  return frames;
}

export async function decodeMask(blob) {
  if (blob.size > MAX_MASK_BYTES) throw Error("Arquivo de recorte excede o limite.");
  const frames = maskLength(new Uint8Array(await blob.slice(0, MASK_HEADER).arrayBuffer()));
  const alpha = new Uint8Array(frames * MASK_PLANE);
  const reader = blob.slice(MASK_HEADER).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  let index = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      if (index + value.length > alpha.length) throw Error("Recorte de pessoa inválido.");
      alpha.set(value, index);
      index += value.length;
    }
    if (index !== alpha.length) throw Error("Recorte de pessoa incompleto.");
  } finally {
    await reader.cancel().catch(() => {});
  }
  return {alpha, frames};
}

const drawing = new WeakMap();
function makeCanvas(origin, width, height) {
  const canvas = origin.ownerDocument?.createElement("canvas") ?? new origin.constructor(width, height);
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function surfaces(canvas) {
  if (!drawing.has(canvas)) {
    const matte = makeCanvas(canvas, MASK_WIDTH, MASK_HEIGHT).getContext("2d");
    const foreground = makeCanvas(canvas, WIDTH, HEIGHT).getContext("2d");
    drawing.set(canvas, {matte, foreground, pixels: matte.createImageData(MASK_WIDTH, MASK_HEIGHT)});
  }
  return drawing.get(canvas);
}

export function drawCover(context, picture, width, height, inset = 0) {
  const factor = Math.max((WIDTH + inset * 2) / width, (HEIGHT + inset * 2) / height);
  const w = width * factor, h = height * factor;
  context.drawImage(picture, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
}

const cueCache = new WeakMap();
export function displayCues(clip) {
  const speech = clip.talk?.speech;
  if (!speech || clip.talk.captions === "off") return [];
  let cached = cueCache.get(clip);
  if (!cached || cached.speech !== speech || cached.trim !== clip.trim || cached.duration !== clip.duration) {
    cached = {speech, trim: clip.trim, duration: clip.duration, cues: captionCues(speech, clip.trim, clip.duration)};
    cueCache.set(clip, cached);
  }
  return cached.cues;
}

function titleBehind(context, title, y) {
  const words = title.trim().split(/\s+/);
  let size = 92;
  let lines = [title];
  while (size >= 32) {
    context.font = `900 ${size}px Arial, sans-serif`;
    lines = [];
    let current = "";
    for (const word of words) {
      const next = current ? current + " " + word : word;
      if (current && context.measureText(next).width > 488) {
        lines.push(current);
        current = word;
      } else current = next;
    }
    lines.push(current);
    if (lines.length <= 2 && lines.every(line => context.measureText(line).width <= 488)) break;
    size -= 4;
  }
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.strokeStyle = "#0c111741";
  context.fillStyle = "#fff8e9";
  context.lineWidth = 4;
  lines.forEach((line, index) => {
    const center = y * HEIGHT + (index - (lines.length - 1) / 2) * size * .94;
    context.strokeText(line, WIDTH / 2, center, 488);
    context.fillText(line, WIDTH / 2, center, 488);
  });
}

function caption(context, cue, time, talk) {
  const style = talk.captions;
  let size = style === "highlight" ? 42 : 38;
  context.font = `700 ${size}px Arial, sans-serif`;
  const width = context.measureText(cue.text).width;
  if (width > 460) {
    size = Math.max(14, Math.floor(size * 460 / width));
    context.font = `700 ${size}px Arial, sans-serif`;
  }
  const space = context.measureText(" ").width;
  const widths = cue.words.map(word => context.measureText(word.text).width);
  const textWidth = widths.reduce((n, w) => n + w, 0) + space * (widths.length - 1);
  const y = 820, h = size + 27;
  let x = (WIDTH - textWidth) * .5;
  context.fillStyle = "#10151be9";
  context.beginPath();
  context.roundRect(x - 13, y - h / 2, textWidth + 26, h, 10);
  context.fill();
  context.textAlign = "left";
  context.textBaseline = "middle";
  const active = style === "highlight" ? cue.words.findIndex(word => time >= word.start && time < word.end) : -1;
  cue.words.forEach((word, i) => {
    context.fillStyle = i === active ? talk.accent : "#fffdf7";
    context.fillText(word.text, x, y + 1);
    x += widths[i] + space;
  });
}

export function drawSpeakingVideo(context, picture, width, height, clip, time, matte, image) {
  const talk = clip.talk;
  if (!talk) return drawCover(context, picture, width, height);
  const frame = matte ? Math.round((time - talk.matte.start) * MASK_RATE) : -1;
  const inMask = matte && frame >= 0 && frame <= matte.frames && needsMatte(talk);
  context.save();
  if (!inMask || talk.background === "original" || (talk.background === "image" && !image)) {
    drawCover(context, picture, width, height);
  } else if (talk.background === "image") {
    drawCover(context, image, image.naturalWidth || image.width, image.naturalHeight || image.height);
  } else if (talk.background === "blur") {
    context.filter = "blur(26px)";
    drawCover(context, picture, width, height, 32);
    context.filter = "none";
  } else {
    if (talk.background === "gradient") {
      const gradient = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
      gradient.addColorStop(0, talk.color);
      gradient.addColorStop(1, "#11151f");
      context.fillStyle = gradient;
    } else context.fillStyle = talk.color;
    context.fillRect(0, 0, WIDTH, HEIGHT);
  }
  if (inMask) {
    if (talk.title.trim()) titleBehind(context, talk.title.trim(), talk.titleY);
    const {foreground, matte: plane, pixels} = surfaces(context.canvas);
    const begin = Math.min(frame, matte.frames - 1) * MASK_PLANE;
    for (let index = 0; index < MASK_PLANE; index++) pixels.data[index * 4 + 3] = matte.alpha[begin + index];
    plane.putImageData(pixels, 0, 0);
    foreground.clearRect(0, 0, WIDTH, HEIGHT);
    foreground.filter = talk.exposure ? `brightness(${2 ** talk.exposure})` : "none";
    drawCover(foreground, picture, width, height);
    foreground.filter = "none";
    foreground.globalCompositeOperation = "destination-in";
    foreground.drawImage(plane.canvas, 0, 0, WIDTH, HEIGHT);
    foreground.globalCompositeOperation = "source-over";
    context.drawImage(foreground.canvas, 0, 0);
  }
  const cue = displayCues(clip).find(item => time >= item.start && time < item.end);
  if (cue) caption(context, cue, time, talk);
  context.restore();
}
