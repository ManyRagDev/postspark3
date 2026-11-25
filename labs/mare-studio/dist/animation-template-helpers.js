import { assertComposition, newComposition, newLayer } from "./composition-model.js";

const shot = (from, to, end, start = 0) => [
  {t: start, value: from, ease: "linear"},
  {t: end, value: to, ease: "inOut"},
];
const fade = (end = .45) => ({opacity: shot(0, 1, end)});
const pulse = (peak = 1.2) => [
  {t: .35, value: 1, ease: "linear"},
  {t: .7, value: peak, ease: "out"},
  {t: 1.04, value: 1, ease: "inOut"},
  {t: 1.7, value: 1, ease: "linear"},
  {t: 2.05, value: peak, ease: "out"},
  {t: 2.39, value: 1, ease: "inOut"},
];

function composition(template, duration, background, images, build) {
  const doc = { ...newComposition(background), template };
  const add = (type, id, name, x, y, width, height, color, options = {}) => {
    const { props, ...fields } = options;
    doc.layers.push(newLayer(type, duration + 1 / 30, {
      id, name, color, width, height, props: {x, y, ...props}, ...fields,
    }));
  };
  build({
    box: (...args) => add("square", ...args),
    circle: (...args) => add("circle", ...args),
    shape: add,
    text: (id, name, value, x, y, w, h, fontSize, color, options) =>
      add("text", id, name, x, y, w, h, color, {text: value, fontSize, wrap: true, ...options}),
    image: (id, name, source, x, y, w, h, options) =>
      add("image", id, name, x, y, w, h, "#ffffff",
        {src: images.get(source), fit: "cover", ...options}),
  });
  return assertComposition(doc);
}

function property(label, id, key, type, options = {}) {
  return { label, id, type, ...options, get: ([layer]) => layer[key],
    set: ([layer], value) => { layer[key] = value; } };
}
const text = (label, id) => property(label, id, "text", "text");
const color = (label, id) => property(label, id, "color", "color");
const image = (label, id) => property(label, id, "src", "file");
function field(label, id, type, get, set, options = {}) {
  return {label, id, type, get, set, ...options};
}
const number = (label, id, get, set, min, max, step) =>
  field(label, id, "number", get, set, {min, max, step});
const select = (label, id, get, set, choices) =>
  field(label, id, "select", get, set, {choices});
const lastTime = (layer, key) => layer.keys[key].at(-1)?.t;
function changeTiming(layer, channels, ratio) {
  for (const channel of channels)
    for (const key of layer.keys[channel])
      key.t *= ratio;
}
function timing(label, ids, key, channels, min, max) {
  return number(label, ids, ([leader]) => lastTime(leader, key),
    (layers, value) => {
      const ratio = value / lastTime(layers[0], key);
      for (const layer of layers) changeTiming(layer, channels, ratio);
    }, min, max, .05);
}
const initialX = layer => layer.keys.x[0]?.value ?? layer.props.x;
function changeX(layer, value) {
  const delta = value - initialX(layer);
  layer.props.x += delta;
  for (const key of layer.keys.x) key.value += delta;
}

export { composition, shot, fade, pulse, field, text, color, image, number, select,
  lastTime, changeTiming, timing, initialX, changeX };
