import { elementNames } from "./elements.js";

// Coordinates are in 540 × 960 design units. Key times are relative to layer.start.
// Easing on a key shapes the interval leading into that key.
const ranges = {
  x: [-10000, 10000],
  y: [-10000, 10000],
  scaleX: [0, 100],
  scaleY: [0, 100],
  rotation: [-36000, 36000],
  opacity: [0, 1],
  reveal: [0, 1],
};
export const CHANNELS = Object.freeze(Object.keys(ranges));
export const EASINGS = Object.freeze(["linear", "in", "out", "inOut", "hold"]);
const defaults = {
  x: 270,
  y: 480,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
  reveal: 1,
};
const types = {
  ...elementNames,
  square: "Quadrado",
  circle: "Círculo",
  triangle: "Triângulo",
  text: "Título",
  image: "Imagem",
  wave: "Malha da onda",
};
const colorPattern = /^#[a-f\d]{6}$/i;
const maxImageSide = 1600;
const maxImageBytes = 8 * 1024 * 1024;
const maxTime = 86400;
const dataPrefix = "data:image/png;base64,";
const within = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
export const DEFAULT_BEZIER = Object.freeze([0.33, 0, 0.67, 1]);
export function isBezier(ease) {
  return Array.isArray(ease) && ease.length === 4 &&
    within(ease[0], 0, 1) && within(ease[2], 0, 1) &&
    within(ease[1], -3, 4) && within(ease[3], -3, 4);
}

export function newComposition(background = "#14151a") {
  return { version: 1, background, layers: [] };
}

export function newLayer(type, duration, overrides = {}) {
  if (!Object.hasOwn(types, type))
    throw new Error("Tipo de camada desconhecido.");
  const { props, keys, ...fields } = overrides;
  return {
    id: crypto.randomUUID(),
    type,
    name: types[type],
    start: 0,
    end: duration,
    color: type === "text" ? "#f6f0e7" : "#ff693e",
    text: type === "text" ? "Seu título" : "",
    width: type === "text" ? 480 : 132,
    height: type === "text" ? 92 : 132,
    fontSize: 54,
    ...fields,
    props: { ...defaults, ...props },
    keys: Object.fromEntries(
      CHANNELS.map(ch => [ch, keys?.[ch] ? structuredClone(keys[ch]) : []])
    ),
  };
}

function onlyFields(object, keys) {
  return (
    object !== null &&
    typeof object === "object" &&
    !Array.isArray(object) &&
    Object.keys(object).every(key => keys.includes(key))
  );
}

function validImageSrc(src) {
  if (
    typeof src !== "string" ||
    !src.startsWith(dataPrefix) ||
    src.length > dataPrefix.length + Math.ceil(maxImageBytes / 3) * 4
  )
    return false;
  const head = src.slice(dataPrefix.length, dataPrefix.length + 44);
  if (
    head.length !== 44 ||
    !/^[A-Za-z0-9+/]+$/.test(head) ||
    !src.startsWith(dataPrefix + "iVBORw0KGgo")
  )
    return false;
  const bytes = Uint8Array.from(atob(head), c => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  return (
    view.getUint32(8) === 13 &&
    view.getUint32(12) === 0x49484452 &&
    within(view.getUint32(16), 1, maxImageSide) &&
    within(view.getUint32(20), 1, maxImageSide) &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(src.slice(dataPrefix.length))
  );
}
function validKey(key, channel) {
  return (
    onlyFields(key, ["t", "value", "ease"]) &&
    within(key.t, 0, maxTime) &&
    within(key.value, ...ranges[channel]) &&
    (EASINGS.includes(key.ease) || isBezier(key.ease))
  );
}
function validLayer(layer) {
  return (
    onlyFields(layer, [
      "id",
      "type",
      "name",
      "start",
      "end",
      "color",
      "text",
      "src",
      "width",
      "height",
      "fontSize",
      "wrap",
      "lockAspectRatio",
      "fit",
      "revealFrom",
      "outline",
      "wave",
      "props",
      "keys",
    ]) &&
    typeof layer.id === "string" &&
    /^[\w-]{1,128}$/.test(layer.id) &&
    Object.hasOwn(types, layer.type) &&
    typeof layer.name === "string" &&
    layer.name.length <= 256 &&
    within(layer.start, 0, maxTime) &&
    within(layer.end, 0, maxTime) &&
    layer.end > layer.start &&
    typeof layer.color === "string" &&
    colorPattern.test(layer.color) &&
    typeof layer.text === "string" &&
    layer.text.length <= 2000 &&
    within(layer.width, 1, 8000) &&
    within(layer.height, 1, 8000) &&
    within(layer.fontSize, 1, 960) &&
    (layer.wrap === undefined || (layer.type === "text" && typeof layer.wrap === "boolean")) &&
    (layer.lockAspectRatio === undefined || typeof layer.lockAspectRatio === "boolean") &&
    (layer.fit === undefined || (layer.type === "image" && ["cover", "contain"].includes(layer.fit))) &&
    (layer.revealFrom === undefined || ["left", "right"].includes(layer.revealFrom)) &&
    (layer.outline === undefined || (["square", "circle"].includes(layer.type) && within(layer.outline, .5, 100))) &&
    (layer.type === "wave"
      ? onlyFields(layer.wave, ["amplitude", "speed"]) &&
        within(layer.wave.amplitude, 0, 2) && within(layer.wave.speed, 0.25, 2.5)
      : layer.wave === undefined) &&
    (layer.type === "image"
      ? validImageSrc(layer.src)
      : layer.src === undefined) &&
    onlyFields(layer.props, CHANNELS) &&
    CHANNELS.every(ch => within(layer.props[ch], ...ranges[ch])) &&
    onlyFields(layer.keys, CHANNELS) &&
    Object.entries(layer.keys).every(
      ([ch, keys]) =>
        Array.isArray(keys) &&
        keys.length <= 512 &&
        keys.every((k, i) => validKey(k, ch) && (!i || k.t > keys[i - 1].t))
    )
  );
}
export function assertComposition(composition) {
  if (
    !onlyFields(composition, ["version", "background", "layers", "template"]) ||
    composition.version !== 1 ||
    typeof composition.background !== "string" ||
    !colorPattern.test(composition.background) ||
    (composition.template !== undefined &&
      (typeof composition.template !== "string" || !/^[a-z-]{1,40}$/.test(composition.template))) ||
    !Array.isArray(composition.layers) ||
    composition.layers.length > 64 ||
    !composition.layers.every(validLayer) ||
    new Set(composition.layers.map(l => l.id)).size !==
      composition.layers.length
  )
    throw new Error(
      "A composição contém camadas, imagens ou keyframes inválidos."
    );
  return composition;
}
export function setKey(layer, channel, t, value, ease = "linear") {
  if (!CHANNELS.includes(channel)) throw new Error("Propriedade desconhecida.");
  const key = { t, value, ease };
  if (!validKey(key, channel))
    throw new Error("Valor ou tempo de keyframe inválido.");
  const keys = (layer.keys[channel] ??= []);
  const index = keys.findIndex(k => Math.abs(k.t - t) <= 0.000001);
  if (index === -1) {
    if (keys.length >= 512)
      throw new Error("Esta propriedade já tem 512 keyframes.");
    keys.push(key);
  } else keys[index] = key;
  keys.sort((a, b) => a.t - b.t);
  return key;
}
function weight(t, ease) {
  if (Array.isArray(ease)) {
    if (t <= 0 || t >= 1) return t;
    const cubic = (u, a, b) => 3 * (1 - u) * u * ((1 - u) * a + u * b) + u ** 3;
    let lo = 0, hi = 1;
    for (let i = 0; i < 26; i++) {
      const u = (lo + hi) / 2;
      if (cubic(u, ease[0], ease[2]) < t) lo = u;
      else hi = u;
    }
    return cubic((lo + hi) / 2, ease[1], ease[3]);
  }
  switch (ease) {
    case "in":
      return t * t;
    case "out":
      return 1 - (1 - t) * (1 - t);
    case "inOut":
      return t * t * (3 - 2 * t);
    case "hold":
      return 0;
    default:
      return t;
  }
}
export function evaluateChannel(base, keys, t, channel) {
  if (!keys?.length) return base;
  // A lone key at a later instant animates from the base value at zero.
  let fromT = 0,
    fromVal = base;
  for (const key of keys) {
    if (t === key.t) return key.value;
    if (t < key.t) {
      const f = weight(Math.max(0, (t - fromT) / (key.t - fromT)), key.ease);
      const value = fromVal + (key.value - fromVal) * f;
      const limits = ranges[channel];
      return limits ? Math.max(limits[0], Math.min(limits[1], value)) : value;
    }
    fromT = key.t;
    fromVal = key.value;
  }
  return fromVal;
}
export function evaluateLayer(layer, sceneTime) {
  const t = Math.max(0, sceneTime - layer.start);
  return Object.fromEntries(
    CHANNELS.map(ch => [
      ch,
      evaluateChannel(layer.props[ch], layer.keys[ch], t, ch),
    ])
  );
}
function readDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Falha ao ler a imagem."));
    reader.readAsDataURL(file);
  });
}
export async function imageLayerFromFile(file, duration) {
  if (
    !file ||
    !["image/jpeg", "image/png", "image/webp", "image/svg+xml"].includes(file.type) ||
    file.size === 0 ||
    file.size > 20 * 1024 * 1024
  )
    throw new Error("Escolha uma imagem PNG, JPEG, WebP ou SVG de até 20 MiB.");
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    const scale = Math.min(
      1,
      maxImageSide / Math.max(image.naturalWidth, image.naturalHeight)
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!blob || blob.size > maxImageBytes)
      throw new Error("A imagem excede o tamanho de importação.");
    const fit = Math.min(1, 400 / canvas.width, 600 / canvas.height);
    return newLayer("image", duration, {
      name: file.name.slice(0, 256),
      src: await readDataURL(blob),
      width: Math.max(1, Math.round(canvas.width * fit)),
      height: Math.max(1, Math.round(canvas.height * fit)),
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
