import { evaluateLayer, newLayer, setKey } from "./composition-model.js";

const frame = 1 / 30;
const epsilon = 1e-6;
const labels = {
  title: "Começar com um título animado",
  intro: "Quadrado que vira título",
  templates: "Explorar animações prontas",
  rotate: "Girar",
  pulse: "Pulsar",
  unfold: "Abrir em faixa",
  fade: "Aparecer suavemente",
  reveal: "Revelar texto",
  exit: "Desaparecer",
  ease: "Suavizar o fim do giro",
  bandTitle: "Revelar um título quando a faixa abrir",
  sync: "Revelar quando a faixa abrir",
  sequence: "Fazer as fotos entrarem uma por vez",
  copy: "Usar a mesma entrada do título",
  extend: "Manter o título visível por mais 1 s",
};
export const quickLabel = id => labels[id];
const span = l => l.end - l.start;
const fail = message => {
  throw Error(message);
};
const interval = (value, max) => {
  if (
    !Number.isFinite(value) ||
    value < frame - epsilon ||
    value > max + epsilon
  )
    fail("Escolha uma duração que caiba na camada.");
  return Math.min(value, max);
};

function bandEnd(l) {
  const x = l.keys.scaleX,
    y = l.keys.scaleY;
  if (
    l.type !== "square" ||
    x.length !== 2 ||
    y.length !== 2 ||
    x[1].t !== y[1].t ||
    x[1].value <= x[0].value ||
    y[1].value > y[0].value
  )
    return;
  return l.start + x[1].t;
}
function overBand(text, band) {
  const end = bandEnd(band);
  if (end == null || text.end < end + frame || text.start > end + epsilon)
    return false;
  const pos = evaluateLayer(text, end),
    bg = evaluateLayer(band, end);
  return (
    Math.abs(pos.x - bg.x) <= (band.width * bg.scaleX) / 2 &&
    Math.abs(pos.y - bg.y) <= (band.height * bg.scaleY) / 2
  );
}
function entrance(l) {
  if (l?.type !== "text") return;
  for (const axis of ["opacity", "reveal"]) {
    const keys = l.keys[axis];
    const first = keys.findIndex(k => k.value > 0);
    if (
      first > 0 &&
      keys[first - 1].value === 0 &&
      keys[first].t > keys[first - 1].t
    )
      return { axis, keys: keys.slice(first - 1, first + 1) };
  }
}
function sourceFor(doc, layer, recent) {
  const possible = doc.layers.filter(l => l.id !== layer.id && entrance(l));
  return (
    possible.find(l => l.id === recent?.layerId) ??
    (possible.length === 1 ? possible[0] : null)
  );
}
function bandFor(doc, layer, recent) {
  const possible = doc.layers.filter(l => overBand(layer, l));
  return (
    possible.find(l => l.id === recent?.layerId) ??
    (possible.length === 1 ? possible[0] : null)
  );
}
export function quickChoices(doc, layer, limit, recent) {
  const images = doc.layers.filter(
    l => l.type === "image" && !l.keys.opacity.length && l.props.opacity > 0
  );
  if (!layer)
    return {
      actions: doc.layers.length ? [] : ["title", "intro", "templates"],
      next: images.length >= 2 ? "sequence" : null,
    };
  const text = layer.type === "text";
  const actions = text
    ? ["fade", "reveal", "exit"]
    : [
        "rotate",
        "pulse",
        ...(layer.type === "square" ? ["unfold"] : []),
        "fade",
        "exit",
      ];
  let next = null;
  if (text && layer.keys.reveal.length === 0 && bandFor(doc, layer, recent))
    next = "sync";
  else if (text && !entrance(layer) && sourceFor(doc, layer, recent))
    next = "copy";
  else if (
    layer.type === "square" &&
    bandEnd(layer) != null &&
    !doc.layers.some(l => l.type === "text" && overBand(l, layer))
  )
    next = "bandTitle";
  else if (
    layer.keys.rotation.length >= 2 &&
    layer.keys.rotation.at(-1).ease !== "out"
  )
    next = "ease";
  else if (
    layer.type === "image" &&
    images.some(l => l.id === layer.id) &&
    images.length >= 2
  )
    next = "sequence";
  else if (
    text &&
    layer.end + 1 <= limit + epsilon &&
    evaluateLayer(layer, layer.end - frame).opacity > 0
  )
    next = "extend";
  return { actions, next };
}
// Add keys only inside a free interval. A boundary shared by two movements must match.
function put(l, axis, entries) {
  const from = entries[0][0],
    to = entries.at(-1)[0];
  if (
    l.keys[axis].some(
      k =>
        k.t >= from - epsilon &&
        k.t <= to + epsilon &&
        !entries.some(
          ([t, v]) =>
            Math.abs(t - k.t) < epsilon && Math.abs(v - k.value) < epsilon
        )
    )
  )
    fail(
      "Esse movimento se sobrepõe a keyframes existentes. Ajuste-os na timeline."
    );
  for (const [t, v, ease] of entries) {
    if (!l.keys[axis].some(k => Math.abs(k.t - t) < epsilon))
      setKey(l, axis, t, v, ease ?? "linear");
  }
}
function revealAt(l, at) {
  if (l.keys.reveal.length)
    fail("Esse movimento se sobrepõe à revelação existente.");
  if (at < l.start - epsilon || l.end - at < frame)
    fail("O título precisa estar na cena durante a abertura.");
  const delay = Math.max(0, at - l.start);
  const keys = [[0, 0]];
  if (delay > epsilon) keys.push([delay, 0]);
  keys.push([delay + Math.min(0.5, l.end - at), 1, "out"]);
  put(l, "reveal", keys);
}

export function runQuickAction(doc, layerId, id, limit, recent, options = {}) {
  let l = doc.layers.find(item => item.id === layerId);
  const choices = quickChoices(doc, l, limit, recent);
  if ((layerId && !l) || (!choices.actions.includes(id) && choices.next !== id))
    fail("A seleção mudou. Escolha uma ação disponível.");
  if (id === "templates") fail("Abra a biblioteca de animações.");
  if (id === "intro") {
    const box = newLayer("square", limit);
    doc.layers.push(box);
    const turn = limit * 0.24,
      open = limit * 0.44;
    put(box, "rotation", [
      [0, 0],
      [turn, 180, "out"],
    ]);
    for (const axis of ["scaleX", "scaleY"])
      put(box, axis, [
        [turn, 1],
        [open, axis === "scaleX" ? 2.8 : 0.7, "out"],
      ]);
    return runQuickAction(doc, box.id, "bandTitle", limit, null, options);
  }
  if (id === "title" || id === "bandTitle") {
    const band = l;
    l = newLayer("text", limit);
    l.text =
      String(options.text || "Seu título")
        .trim()
        .slice(0, 180) || "Seu título";
    if (band) {
      const at = bandEnd(band);
      Object.assign(l.props, {
        x: evaluateLayer(band, at).x,
        y: evaluateLayer(band, at).y,
      });
      l.start = at;
      l.end = Math.min(band.end, limit);
    }
    doc.layers.push(l);
    revealAt(l, l.start);
  } else if (id === "sequence") {
    if (
      !Array.isArray(options.ids) ||
      new Set(options.ids).size !== options.ids.length ||
      options.ids.length < 2
    )
      fail("Selecione pelo menos duas fotos.");
    const gap = interval(options.gap ?? 0.2, 10);
    const layers = options.ids.map(key =>
      doc.layers.find(item => item.id === key)
    );
    if (
      layers.some(
        item =>
          item?.type !== "image" ||
          item.keys.opacity.length ||
          item.props.opacity <= 0
      )
    )
      fail("Escolha fotos com a opacidade livre.");
    const at = Math.max(...layers.map(item => item.start));
    const position = item => evaluateLayer(item, at);
    layers.sort(
      (a, b) =>
        position(a).x - position(b).x ||
        position(a).y - position(b).y ||
        doc.layers.indexOf(a) - doc.layers.indexOf(b)
    );
    if (options.reverse) layers.reverse();
    layers.forEach((item, i) => {
      const begin = at + i * gap - item.start;
      const d = interval(Math.min(0.22, span(item) - begin), span(item));
      const entries = [[0, 0]];
      if (begin > epsilon) entries.push([begin, 0]);
      entries.push([begin + d, item.props.opacity, "out"]);
      put(item, "opacity", entries);
    });
  } else if (id === "ease") l.keys.rotation.at(-1).ease = "out";
  else if (id === "extend") l.end += 1;
  else if (id === "sync") revealAt(l, bandEnd(bandFor(doc, l, recent)));
  else if (id === "copy") {
    const source = sourceFor(doc, l, recent);
    const { axis, keys } = entrance(source);
    const start = source.start + keys[options.after ? 1 : 0].t;
    const end = start + keys[1].t - keys[0].t;
    if (start < l.start - epsilon || end > l.end + epsilon)
      fail("A entrada copiada precisa caber na duração do subtítulo.");
    const offset = Math.max(0, start - l.start);
    const entries = [[0, 0]];
    if (offset > epsilon) entries.push([offset, 0]);
    entries.push([end - l.start, keys[1].value, structuredClone(keys[1].ease)]);
    put(l, axis, entries);
  } else if (id === "rotate") {
    const start = l.keys.rotation.at(-1)?.t ?? 0;
    const angle = options.angle ?? 90;
    if (!Number.isFinite(angle) || angle === 0 || Math.abs(angle) > 3600)
      fail("Informe um giro de até dez voltas.");
    const d = interval(
      options.duration ?? Math.min(0.8, span(l) - start),
      span(l) - start
    );
    const v = l.keys.rotation.at(-1)?.value ?? l.props.rotation;
    if (!l.keys.rotation.length) setKey(l, "rotation", 0, v);
    setKey(l, "rotation", start + d, v + angle, "inOut");
  } else if (id === "pulse" || id === "unfold") {
    const d = Math.min(span(l), 0.72);
    for (const axis of ["scaleX", "scaleY"]) {
      const v = l.props[axis];
      const entries =
        id === "pulse"
          ? [
              [0, v],
              [d / 2, v * 1.2, "out"],
              [d, v, "inOut"],
            ]
          : [
              [0, v],
              [d, axis === "scaleX" ? v * 2.8 : v * 0.7, "out"],
            ];
      put(l, axis, entries);
    }
  } else if (id === "reveal") revealAt(l, l.start);
  else {
    const d = Math.min(span(l) / 2, 0.5);
    const axis = "opacity",
      exit = id === "exit";
    const start = exit ? span(l) - d : 0;
    const v = exit
      ? evaluateLayer(l, l.start + start).opacity
      : l.props.opacity;
    put(l, axis, [
      [start, exit ? v : 0],
      [start + d, exit ? 0 : v, "out"],
    ]);
  }
  return l?.id ?? null;
}
