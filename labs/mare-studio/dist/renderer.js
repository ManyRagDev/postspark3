import { paintTransition, paintTransitionOverlay } from "./transitions.js";
import { elements } from "./elements.js";
import { activeOn, durationOf, FPS, isDip, transitionAt, transitionMediaKey, transitionPack, voiceKey } from "./montage-model.js";
import { evaluateLayer } from "./composition-model.js";
import { compositionForClip } from "./project-model.js";
import { drawCover, drawSpeakingVideo } from "./speech-visual.js";

const WIDTH = 540;
const HEIGHT = 960;
const INK = "#100f14";
const PAPER = "#f8ecd9";
const CORAL = "#ff693e";
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ease = value => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

let grain;
function paperGrain(surface) {
  if (grain) return grain;
  const tile = surface.ownerDocument ? surface.ownerDocument.createElement("canvas") : new surface.constructor(96, 96);
  tile.width = tile.height = 96;
  const context = tile.getContext("2d");
  const image = context.createImageData(96, 96);
  let state = 37017;
  for (let i = 0; i < image.data.length; i += 4) {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = state % 2 ? 255 : 0;
    image.data[i + 3] = (state >>> 26) * 0.22;
  }
  context.putImageData(image, 0, 0);
  grain = context.createPattern(tile, "repeat");
  return grain;
}

function tint(accent, lightness) {
  const n = Number.parseInt(accent.slice(1), 16);
  const channels = [n >> 16, (n >> 8) & 255, n & 255];
  return (
    "rgb(" +
    channels
      .map((channel, i) =>
        Math.round([16, 15, 20][i] + (channel - [16, 15, 20][i]) * lightness)
      )
      .join(",") +
    ")"
  );
}

function meshRow(v, phase, amplitude) {
  const points = [];
  const ridge = 0.58 + 0.17 * Math.sin(3.85 * v + phase);
  const shoulder = 0.19 + 0.075 * Math.cos(4.25 * v - phase);
  const envelope = 0.44 + 0.56 * Math.sin(Math.PI * (0.08 + v * 0.84));
  const perspective = 570 + 288 * v;
  for (let column = 0; column <= 72; column++) {
    const u = column / 72;
    const main = 227 * Math.exp(-((u - ridge) ** 2) / 0.019) * envelope;
    const secondary =
      72 * Math.exp(-((u - shoulder) ** 2) / 0.015) * (1 - v * 0.6);
    const swells =
      19 * Math.sin(8.7 * u + 4.6 * v - phase) + 8 * Math.cos(10 * u - 6.7 * v);
    points.push([
      266 + (u - 0.5) * perspective + 93 * (v - 0.42),
      672 + 156 * v - amplitude * (main + secondary + swells) + 12 * (u - 0.5),
    ]);
  }
  return points;
}

function pathRow(context, row, reverse = false, connect = false) {
  for (let i = 0; i < row.length; i++) {
    const point = row[reverse ? row.length - 1 - i : i];
    if (i === 0 && !connect) context.moveTo(...point);
    else context.lineTo(...point);
  }
}

function drawOceanMesh(context, time, scene, accent) {
  const speed = scene.speed ?? 1;
  const amplitude =
    Math.max(0, scene.amplitude ?? 1) * (0.52 + 0.48 * ease(time / 1.45));
  const phase = time * 0.59 * speed - 1.26;
  let back = meshRow(0, phase, amplitude);
  const bands = 26;
  context.lineJoin = "round";
  for (let row = 1; row <= bands; row++) {
    const v = row / bands;
    const front = meshRow(v, phase, amplitude);
    context.beginPath();
    pathRow(context, back);
    pathRow(context, front, true, true);
    context.closePath();
    context.fillStyle = tint(accent, 0.018 + 0.027 * Math.sin(v * 2.5));
    context.fill();
    context.beginPath();
    for (let i = 0; i < front.length; i += 2) {
      context.moveTo(...back[i]);
      context.lineTo(...front[i]);
    }
    context.lineWidth = 1.25;
    context.strokeStyle = tint(accent, 0.48 + v * 0.38);
    context.stroke();
    context.beginPath();
    pathRow(context, front);
    context.lineWidth = row === bands ? 2.3 : 1.72;
    context.strokeStyle = tint(accent, 0.59 + Math.sin(v * 2.6) * 0.41);
    context.stroke();
    back = front;
  }
}

function headingState(keys, time) {
  if (!keys?.length) return { y: 0, opacity: 1 };
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  const b = sorted.find(key => key.t >= time);
  if (!b) return sorted[sorted.length - 1];
  const i = sorted.indexOf(b);
  if (i === 0) return b;
  const a = sorted[i - 1];
  const weight = ease((time - a.t) / Math.max(0.0001, b.t - a.t));
  return {
    y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * weight,
    opacity: (a.opacity ?? 1) + ((b.opacity ?? 1) - (a.opacity ?? 1)) * weight,
  };
}

function titleLines(title) {
  const words = (title ?? "Maré alta").trim().replace(/\s+/g, " ").split(" ");
  if (words.length < 2) return words;
  const length = words.join(" ").length;
  let split = 1;
  for (let i = 2; i < words.length; i++) {
    if (
      Math.abs(words.slice(0, i).join(" ").length - length / 2) <
      Math.abs(words.slice(0, split).join(" ").length - length / 2)
    )
      split = i;
  }
  return [words.slice(0, split).join(" "), words.slice(split).join(" ")];
}

function drawTitle(context, scene, time) {
  const state = headingState(scene.keys, time);
  const entrance = ease((time - (scene.entry ?? 0)) / 0.6);
  context.save();
  context.globalAlpha = clamp((state.opacity ?? 1) * entrance, 0, 1);
  context.translate(0, ((state.y ?? 0) * HEIGHT) / 1920 + 19 * (1 - entrance));
  context.fillStyle = PAPER;
  const lines = titleLines(scene.title);
  const family = "Georgia, 'Times New Roman', 'Liberation Serif', serif";
  for (let i = 0; i < lines.length; i++) {
    const x = i ? 112 : 34;
    const maxWidth = WIDTH - x - 22;
    const nominal = i ? 178 : 167;
    const setFont = size => {
      context.font = (i ? "italic " : "") + size + "px " + family;
      if ("letterSpacing" in context)
        context.letterSpacing = -0.052 * size + "px";
    };
    setFont(nominal);
    const measured = context.measureText(lines[i]).width;
    if (measured > maxWidth) setFont((nominal * maxWidth) / measured);
    context.fillText(lines[i], x, 251 + i * 115);
  }
  context.restore();
}

function trackText(context, words, x, y, tracking = 2.9) {
  context.font = "500 12px Arial, sans-serif";
  for (const letter of words) {
    context.fillText(letter, x, y);
    x += context.measureText(letter).width + tracking;
  }
}

function drawScene(context, scene, time) {
  const accent = /^#[\da-f]{6}$/i.test(scene.color) ? scene.color : CORAL;
  context.fillStyle = INK;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = context.createRadialGradient(375, 620, 10, 375, 620, 460);
  glow.addColorStop(0, tint(accent, 0.066));
  glow.addColorStop(1, INK);
  context.fillStyle = glow;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.strokeStyle = "rgba(247,229,215,.33)";
  context.lineWidth = 0.9;
  context.beginPath();
  context.moveTo(37, 77);
  context.lineTo(503, 77);
  context.moveTo(37, 866);
  context.lineTo(503, 866);
  context.stroke();
  context.fillStyle = PAPER;
  trackText(context, "ESTUDOS DO OCEANO", 38, 60);
  context.fillStyle = accent;
  context.fillRect(491, 49, 12, 12);

  const sunX = 423;
  const sunY = 337 - 16 * ease(time / 4);
  const radius = 37;
  context.save();
  context.beginPath();
  context.arc(sunX, sunY, radius, 0, Math.PI * 2);
  context.clip();
  context.strokeStyle = tint(accent, 0.91);
  context.lineWidth = 2.4;
  context.beginPath();
  for (let offset = -2 * radius; offset < 2 * radius; offset += 7) {
    context.moveTo(sunX - radius + offset, sunY + radius);
    context.lineTo(sunX + radius + offset, sunY - radius);
  }
  context.stroke();
  context.restore();

  drawTitle(context, scene, time);
  drawOceanMesh(context, time, scene, accent);
  context.fillStyle = PAPER;
  context.font = "italic 22px Georgia, serif";
  context.fillText("Atlântico", 38, 902);
  context.fillStyle = tint(accent, 0.9);
  context.save();
  context.translate(442, 893);
  context.beginPath();
  for (let i = 0; i < 32; i++) {
    const h = 0.4 + (0.5 + 0.5 * Math.sin(i * 0.48 + time)) * 3.6;
    context.moveTo(i * 1.9, -h);
    context.lineTo(i * 1.9, h);
  }
  context.lineWidth = 1.0;
  context.strokeStyle = accent;
  context.stroke();
  context.restore();
  context.fillStyle = paperGrain(context.canvas);
  context.fillRect(0, 0, WIDTH, HEIGHT);
}

function layerFont(layer,size) {
  return (layer.italic?"italic ":"")+(layer.fontWeight??600)+" "+size+'px "'+(layer.fontFamily||"Arial")+'", sans-serif';
}
function textOrigin(layer) {
  return layer.align==="left"?-layer.width/2:layer.align==="right"?layer.width/2:0;
}
function drawCompositionText(context, layer) {
  context.font=layerFont(layer,layer.fontSize);
  context.textAlign=layer.align||"center";
  context.textBaseline = "middle";
  if (layer.wrap) {
    drawWrappedText(context, layer);
    return;
  }
  const lines = layer.text.split(/\r?\n/);
  const lineHeight = Math.min(
    layer.height / lines.length,
    layer.fontSize * 1.18
  );
  const firstLine = (-lineHeight * (lines.length - 1)) / 2;
  for (let i = 0; i < lines.length; i++) {
    context.fillText(lines[i], textOrigin(layer), firstLine + i * lineHeight, layer.width);
  }
}

function drawWrappedText(context, layer) {
  // Wrap by available width, then fit the whole block uniformly if necessary.
  const paragraphs=layer.text.split(/\r?\n/);
  let size = layer.fontSize;
  let lines;
  while (true) {
    context.font=layerFont(layer,size);
    lines = [];
    for(const paragraph of paragraphs){
      let line="";
      for(const word of paragraph.trim().split(/\s+/)){
        const candidate=line?line+" "+word:word;
        if(line && context.measureText(candidate).width>layer.width){lines.push(line);line=word;}
        else line=candidate;
      }
      lines.push(line);
    }
    if (size <= 1 || (lines.length * size * 1.18 <= layer.height &&
      lines.every(text => context.measureText(text).width <= layer.width))) break;
    size = Math.max(1, Math.floor(size * 0.88));
  }
  const advance = size * 1.18;
  lines.forEach((line, index) => context.fillText(line, textOrigin(layer), (index - (lines.length - 1) / 2) * advance));
}

function drawCompositionImage(context, layer, image) {
  const { width, height, fit } = layer;
  if (!fit) {
    context.drawImage(image, -width / 2, -height / 2, width, height);
    return;
  }
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const ratios = [width / sourceWidth, height / sourceHeight];
  const scale = fit === "contain" ? Math.min(...ratios) : Math.max(...ratios);
  const w = sourceWidth * scale, h = sourceHeight * scale;
  context.drawImage(image, -w / 2, -h / 2, w, h);
}

export function drawComposition(context, composition, sceneTime, media) {
  if(composition.background!=="transparent"){
    context.fillStyle = composition.background;
    context.fillRect(0, 0, WIDTH, HEIGHT);
  }
  for (const layer of composition.layers) {
    if (sceneTime < layer.start || sceneTime >= layer.end) continue;
    const p = evaluateLayer(layer, sceneTime);
    if (p.opacity <= 0 || p.reveal <= 0 || p.scaleX <= 0 || p.scaleY <= 0)
      continue;
    context.save();
    context.translate(p.x, p.y);
    context.rotate((p.rotation * Math.PI) / 180);
    context.scale(p.scaleX, p.scaleY);
    context.globalAlpha = p.opacity;
    const { width, height } = layer;
    context.beginPath();
    const left = layer.revealFrom === "right" ? width / 2 - width * p.reveal : -width / 2;
    context.rect(left, -height / 2, width * p.reveal, height);
    context.clip();
    context.fillStyle = layer.color;
    const outline = layer.outline ? Math.min(layer.outline, width / 2, height / 2) : 0;
    if (outline) {
      context.lineWidth = outline;
      context.strokeStyle = layer.color;
    }
    switch (layer.type) {
      case "square":
        if (outline)
          context.strokeRect((outline - width) / 2, (outline - height) / 2, width - outline, height - outline);
        else context.fillRect(-width / 2, -height / 2, width, height);
        break;
      case "triangle":
        context.beginPath();
        context.moveTo(0, -height / 2);
        context.lineTo(width / 2, height / 2);
        context.lineTo(-width / 2, height / 2);
        context.closePath();
        context.fill();
        break;
      case "circle":
        context.beginPath();
        context.ellipse(0, 0, (width - outline) / 2, (height - outline) / 2, 0, 0, Math.PI * 2);
        if (outline) context.stroke();
        else context.fill();
        break;
      default: {
        const asset = elements[layer.type];
        if (!asset) break;
        context.beginPath();
        for (const [i, [x, y]] of asset.points.entries()) {
          const px = (x / 100 - 0.5) * width, py = (y / 100 - 0.5) * height;
          if (i === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.closePath();
        context.fill();
        break;
      }
      case "text":
        drawCompositionText(context, layer);
        break;
      case "image": {
        const image = media.get(layer.src);
        if (image) drawCompositionImage(context, layer, image);
        break;
      }
      case "wave": {
        context.translate(-WIDTH / 2, -HEIGHT / 2);
        drawOceanMesh(context, sceneTime - layer.start, layer.wave, layer.color);
        break;
      }
    }
    context.restore();
  }
}

// Playback supplies a video element, precise export supplies a decoded canvas.
function footageDimensions(source) {
  if (!source || source.readyState < 2) return null;
  const width = source.videoWidth ?? source.width;
  const height = source.videoHeight ?? source.height;
  return width && height ? {width, height} : null;
}
function drawFootage(context, video) {
  const size = footageDimensions(video);
  if (size) drawCover(context, video, size.width, size.height);
}

function drawClip(context, clip, sourceTime, project, media, secondary = false) {
  if (clip.kind === "video") {
    const video = media.get(secondary ? transitionMediaKey(clip) : clip.assetId);
    const size = footageDimensions(video);
    if (size) {
      drawSpeakingVideo(context, video, size.width, size.height, clip, sourceTime,
        media.get(clip.talk?.matte?.id), media.get(clip.talk?.image?.src));
    }
    return;
  }
  // On the server each generated scene is a source trimmed to these frames.
  const local = clamp(sourceTime, clip.trim, clip.trim + clip.duration - (secondary ? Math.min(1/FPS, clip.duration) : 1e-7));
  const source = compositionForClip(project, clip);
  const document = source?.document ?? clip.composition;
  if (document) drawComposition(context, document, local, media);
  else drawScene(context, source?.scene ?? clip.scene ?? project.scene, local);
}

const frameBuffers = new WeakMap();
function transitionPictures(canvas) {
  let pair = frameBuffers.get(canvas);
  if (!pair || pair[0].width !== canvas.width || pair[0].height !== canvas.height) {
    pair = Array.from({length: 2}, () => {
      const buffer = canvas.ownerDocument.createElement("canvas");
      buffer.width = canvas.width;
      buffer.height = canvas.height;
      return buffer;
    });
    frameBuffers.set(canvas, pair);
  }
  return pair;
}

export function drawFrame(canvas, project, time, media = new Map(), transparent = false,viewport) {
  const context = canvas.getContext("2d", { alpha: transparent });
  context.save();
  const sx=canvas.width/(viewport?.width??WIDTH),sy=canvas.height/(viewport?.height??HEIGHT);
  context.setTransform(sx,0,0,sy,-(viewport?.left??0)*sx,-(viewport?.top??0)*sy);
  if(transparent)context.clearRect(0,0,WIDTH,HEIGHT);
  else {
    context.fillStyle = "#000";
    context.fillRect(0, 0, WIDTH, HEIGHT);
  }
  time = Math.min(time, Math.max(0, durationOf(project) - 1e-7));
  let start = 0;
  for (let i = 0; i < project.clips.length; i++) {
    const clip = project.clips[i];
    if (time < start + clip.duration) {
      const elapsed = time - start;
      const mix = transitionAt(project.clips, i, elapsed);
      if (!mix || transitionPack[mix.type].overlay) {
        drawClip(context, clip, elapsed + clip.trim, project, media);
        if (mix) paintTransitionOverlay(context, mix.type, mix.progress, mix.frames, WIDTH, HEIGHT);
      } else {
        const pair = transitionPictures(canvas);
        for (const [index, source] of [mix.from, mix.to].entries()) {
          if (isDip(mix.type) && source !== clip) continue;
          const ctx = pair[index].getContext("2d", {alpha:false, willReadFrequently:true});
          ctx.setTransform(canvas.width/WIDTH, 0, 0, canvas.height/HEIGHT, 0, 0);
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, WIDTH, HEIGHT);
          drawClip(ctx, source, index ? mix.incomingTime : mix.outgoingTime, project, media, source !== clip);
        }
        paintTransition(context, pair[0], pair[1], mix.type, mix.progress, WIDTH, HEIGHT);
      }
      break;
    }
    start += clip.duration;
  }
  for (const track of project.extraTracks || []) {
    const clip = track.kind === "video" && activeOn(track, time);
    if (clip) drawFootage(context, media.get(voiceKey(track, clip)));
  }
  context.restore();
}
