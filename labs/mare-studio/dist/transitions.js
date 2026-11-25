import { FPS, overlayFrameIndex, transitionPack } from "./montage-model.js";

// FilmCraft composites SDR in linear light. Lookup tables avoid per-pixel powers.
const linear = Float32Array.from({length:256}, (_, i) => {
  const x = i/255;
  return x <= .04045 ? x/12.92 : ((x+.055)/1.055)**2.4;
});
const encoded = Uint8Array.from({length:8193}, (_,i) => {
  const x = i/8192;
  return Math.round(255*(x <= .0031308 ? 12.92*x : 1.055*x**(1/2.4)-.055));
});
const screenChannels = Uint8Array.from({length:256*256}, (_, pair) => {
  const a = linear[pair >> 8], b = linear[pair & 255];
  return encoded[Math.round(8192 * (a + b - a * b))];
});
const mixedFrames = new WeakMap();
const overlayMedia = new Map();
const screenBuffers = new WeakMap();

export function loadTransitionOverlay(type) {
  const overlay = transitionPack[type]?.overlay;
  if (!overlay) return;
  const count = overlay.mirror ? overlay.frames / 2 : overlay.frames;
  return Promise.all(Array.from({length:count}, (_, index) => loadOverlayFrame(type, index)));
}

function loadOverlayFrame(type, index) {
  if (!overlayMedia.has(type)) overlayMedia.set(type, []);
  const images = overlayMedia.get(type);
  if (!images[index]) {
    const image = new Image();
    const name = String(index).padStart(3, "0");
    image.src = new URL(`./transition-media/${type}/frame-${name}.webp`, import.meta.url).href;
    const ready = image.decode().catch(() => {
      delete images[index];
      throw new Error(`A mídia de ${transitionPack[type].name} está indisponível neste laboratório.`);
    });
    images[index] = {image, ready};
  }
  return images[index].ready;
}

function overlayFrameAt(overlay, progress, frames) {
  const frame = Math.max(0, Math.min(frames - 1, Math.floor(progress * frames + 1e-8)));
  return overlayFrameIndex(overlay, frame, frames);
}

export function loadTransitionOverlayPoster(type, progress, frames) {
  const overlay = transitionPack[type]?.overlay;
  if (overlay) return loadOverlayFrame(type, overlayFrameAt(overlay, progress, frames));
}

function screen(ctx, image) {
  const {canvas} = ctx;
  let buffer = screenBuffers.get(ctx);
  if (!buffer) {
    const surface = canvas.ownerDocument.createElement("canvas");
    buffer = surface.getContext("2d", {alpha:false, willReadFrequently:true});
    screenBuffers.set(ctx, buffer);
  }
  if (buffer.canvas.width !== canvas.width || buffer.canvas.height !== canvas.height) {
    buffer.canvas.width = canvas.width;
    buffer.canvas.height = canvas.height;
  }
  buffer.drawImage(image, 0, 0, canvas.width, canvas.height);
  const light = buffer.getImageData(0, 0, canvas.width, canvas.height).data;
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = frame.data;
  for (let i = 0; i < pixels.length; i += 4) {
    for (let channel = i; channel < i + 3; channel++)
      pixels[channel] = screenChannels[(pixels[channel] << 8) + light[channel]];
  }
  ctx.putImageData(frame, 0, 0);
}

export function paintTransitionOverlay(ctx, type, progress, frames, w, h) {
  const overlay = transitionPack[type].overlay;
  const source = overlayFrameAt(overlay, progress, frames);
  const image = overlayMedia.get(type)?.[source]?.image;
  if (!image?.complete || !image.naturalWidth) return;
  if (overlay.blend === "screen") screen(ctx, image);
  else ctx.drawImage(image, 0, 0, w, h);
}

function dissolve(ctx, a, b, weight, solid, w, h) {
  const first = a.getContext("2d").getImageData(0, 0, a.width, a.height);
  const pixels = first.data;
  if (solid === null) {
    const other = b.getContext("2d").getImageData(0, 0, b.width, b.height).data;
    const left = linear.map(v => v*(1-weight)*8192), right = linear.map(v => v*weight*8192);
    for (let i = 0; i < pixels.length; i += 4) {
      for (let c = i; c < i+3; c++) pixels[c] = encoded[Math.round(left[pixels[c]] + right[other[c]])];
    }
  } else {
    const transfer = Uint8Array.from(linear, v => encoded[Math.round(8192*(v*(1-weight) + solid*weight))]);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = transfer[pixels[i]];
      pixels[i+1] = transfer[pixels[i+1]];
      pixels[i+2] = transfer[pixels[i+2]];
    }
  }
  let buffer = mixedFrames.get(ctx);
  if (!buffer || buffer.width !== a.width || buffer.height !== a.height) {
    buffer = document.createElement("canvas");
    buffer.width = a.width; buffer.height = a.height;
    mixedFrames.set(ctx, buffer);
  }
  buffer.getContext("2d").putImageData(first, 0, 0);
  ctx.drawImage(buffer, 0, 0, w, h);
}
// Compose two opaque, equally framed pictures. All geometry is in destination pixels.
export function paintTransition(ctx, a, b, type, progress, w, h) {
  const p = Math.max(0, Math.min(1, progress));
  const draw = (image, dx = 0, dy = 0) => ctx.drawImage(image, dx, dy, w, h);
  ctx.save();
  if (type === "dip_to_black" || type === "dip_to_white") {
    dissolve(ctx, p < .5 ? a : b, null, 1-Math.abs(2*p-1), type === "dip_to_white" ? 1 : 0, w, h);
  } else if (type === "cross_dissolve") {
    dissolve(ctx, a, b, p, null, w, h);
  } else if (type === "push_legacy") {
    draw(a, w * p);
    draw(b, w * (p - 1));
  } else if (type === "split_legacy") {
    draw(b);
    const half = a.width / 2;
    ctx.drawImage(a, 0, 0, half, a.height, -p*w/2, 0, w/2, h);
    ctx.drawImage(a, half, 0, half, a.height, (1+p)*w/2, 0, w/2, h);
  } else {
    draw(a);
    if (type === "band_slide") {
      for (let i = 0; i < 6; i++) {
        const y = Math.round(i*b.height/6), end = Math.round((i+1)*b.height/6);
        ctx.drawImage(b, 0,y,b.width,end-y, (i%2 ? -1 : 1)*w*(1-p), y*h/b.height,w,(end-y)*h/b.height);
      }
    } else {
      ctx.beginPath();
      if (type === "wipe") ctx.rect(0, 0, w*p, h);
      if (type === "venetian_blinds")
        for (let i = 0; i < 10; i++) ctx.rect(0, i*h/10, w, p*h/10);
      if (type === "clock_wipe_legacy") {
        ctx.moveTo(w/2,h/2);
        ctx.arc(w/2,h/2,Math.hypot(w,h)/2, -Math.PI/2, (2*p-.5)*Math.PI);
        ctx.closePath();
      }
      ctx.clip();
      draw(b);
    }
  }
  ctx.restore();
}


