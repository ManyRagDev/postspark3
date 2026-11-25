import { axesFor, timelineKeys, positionFrame, editPosition, editScale, setValue } from "./layer-transform.js";
import { editLayerFields } from "./editor-commands.js";
import { elements } from "./elements.js";
import { hasCachedModel } from "./model-cache.js";
import {
  assertComposition,
  DEFAULT_BEZIER,
  isBezier,
  evaluateLayer,
  imageLayerFromFile,
  newLayer,
  setKey,
} from "./composition-model.js";
import { planCompositionEdit } from "./composition-ai.js";
import {
  canUseGenerativeModel,
  planGenerativeEdit,
} from "./generative-planner.js";
import { bindLayerOrder } from "./layer-order.js";
import { layerAxes, linkedScale, maxScale, resizeLayer } from "./layer-resize.js";
import { drawFrame } from "./renderer.js";
import { animationTemplateFor, setTemplateControl, templateControls } from "./animation-templates.js";
import { arrangeImages } from "./image-layouts.js";
import { openImageLayoutGallery } from "./image-layout-gallery.js";
import { bezierEditor, paintBezier } from "./bezier-editor.js";
import { curveGraph } from "./curve-graph.js";
import { nearestSnap } from "./timeline-snap.js";

const $ = selector => document.querySelector(selector);
const safeText = value =>
  String(value ?? "").replace(
    /[&<>"']/g,
    c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]
  );
const round = value => Math.round(value * 1000) / 1000;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const timeLabel = value =>
  Number(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }) + " s";
const svg = id =>
  '<svg aria-hidden="true" class="ico"><use href="./icons.svg#' +
  id +
  '"></use></svg>';
const basicShapes = { square: "Quadrado", circle: "Círculo", triangle: "Triângulo" };
const eases = {
  linear: "Linear",
  in: "Acelerar",
  out: "Desacelerar",
  inOut: "Acelerar e desacelerar",
  hold: "Manter até o próximo",
  bezier: "Bézier personalizada",
};
const channels = {
  x: ["Posição X", -2160, 2700, 1],
  y: ["Posição Y", -3840, 4800, 1],
  scaleX: ["Escala X", 0, maxScale, .001],
  scaleY: ["Escala Y", 0, maxScale, .001],
  rotation: ["Rotação (°)", -3600, 3600, 1],
  opacity: ["Opacidade", 0, 100, "any"],
  reveal: ["Revelação (%)", 0, 100, 1],
};
const scaleAxes = ["scaleX", "scaleY"];
const keyChannels = { position: "Posição", scale: "Escala", ...Object.fromEntries(
  Object.entries(channels).map(([name, [label]]) => [name, label])
) };
const aspectLocked = layer => layer.lockAspectRatio !== false;

// Preserve the original time of keys from projects made before frame snapping.
function keyTarget(layer, clip, time, property) {
  if (time < layer.start || time >= layer.end) return null;
  const axes = axesFor(property);
  const near = (a, b) => Math.abs(a - b) <= 0.000001;
  const local = time - layer.start;
  let t;
  for (const axis of axes) {
    const existing = layer.keys[axis]?.find(k => near(k.t, local));
    if (existing) { t = existing.t; break; }
  }
  if (t === undefined) {
    if (property === "position") {
      const at = positionFrame(clip, layer, time);
      if (at === null) return null;
      t = Math.max(0, at - layer.start);
    } else t = round(local);
  }
  const members = axes.map(axis => layer.keys[axis]?.find(k => near(k.t, t)));
  const state = members.every(Boolean) ? "true" : members.some(Boolean) ? "mixed" : "false";
  return { t, state };
}
const percentage = channel => channel === "opacity" || channel === "reveal";
const shownValue = (channel, value) =>
  round(percentage(channel) ? value * 100 : value);
const modelValue = (channel, value) =>
  round(percentage(channel) ? value / 100 : value);
const option = (key, label, selected) =>
  '<option value="' +
  safeText(key) +
  '" ' +
  (selected ? "selected" : "") +
  ">" +
  safeText(label) +
  "</option>";
const glyph = type =>
  '<span class="cp-glyph cp-glyph-' +
  type +
  '" aria-hidden="true">' +
  (Object.hasOwn(elements, type)
    ? '<svg viewBox="0 0 100 100" width="16" height="16" fill="currentColor"><polygon points="' + elements[type].points.map(p => p.join(",")).join(" ") + '"/></svg>'
    : type === "text" ? "T" : type === "image" ? svg("Image") : type === "wave" ? svg("Waves") : "") +
  "</span>";
const numField = (label, attr, value, min, max, step = 0.01) =>
  '<label class="cp-field"><span>' +
  label +
  '</span><input type="number" ' +
  attr +
  ' min="' +
  min +
  '" max="' +
  max +
  '" step="' +
  step +
  '" value="' +
  round(value) +
  '"></label>';

function templateFields(doc) {
  return templateControls(doc).map(field => {
    const label = safeText(field.label);
    const attr = 'data-cp-template-field="' + field.index + '"';
    if (field.type === "number")
      return numField(label, attr, field.value, field.min, field.max, "any");
    if (field.type === "select")
      return '<label class="cp-field"><span>' + label + "</span><select " + attr + ">" +
        Object.entries(field.choices).map(([value, title]) => option(value, title, value === field.value)).join("") +
        "</select></label>";
    if (field.type === "file")
      return '<label class="cp-field"><span>' + label +
        '</span><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" ' + attr + "></label>";
    return '<label class="' + (field.type === "color" ? "cp-color" : "cp-field") + '">' +
      "<span>" + label + '</span><input type="' + field.type + '" maxlength="180" ' + attr +
      ' value="' + safeText(field.value) + '"></label>';
  }).join("");
}
function channelField(axis, props, label = channels[axis][0]) {
  const [, min, max, step] = channels[axis];
  return numField(label, 'data-cp-channel="' + axis + '"', shownValue(axis, props[axis]), min, max, step);
}
function diamond(property) {
  return '<button type="button" class="cp-diamond" data-cp-diamond="' + property +
    '" aria-label="Gravar keyframe de ' + keyChannels[property] + '"><span aria-hidden="true"></span></button>';
}
function transformMarkup(layer, props) {
  const position = '<fieldset class="cp-position"><legend>Posição</legend><div class="cp-transform-row">' +
    '<div class="cp-pair">' + channelField("x", props, "X") + channelField("y", props, "Y") + '</div>' + diamond("position") + '</div></fieldset>';
  const row = axis => '<div class="cp-transform-row">' + channelField(axis, props) + diamond(axis) + '</div>';
  const locked = aspectLocked(layer);
  const textBox = layer.type === "text" && !locked;
  const lock = '<div class="cp-scale-heading"><span>' + (textBox ? 'Caixa de texto' : 'Escala') +
    '</span><button type="button" class="cp-aspect-lock" data-cp-lock aria-pressed="' + locked +
    '" aria-label="Prender proporção" title="' + (locked ? 'Destravar proporção' : 'Prender proporção') + '">' +
    svg(locked ? "LockKeyhole" : "LockKeyholeOpen") + '</button></div>';
  const size = textBox ? '<div class="cp-pair">' +
    numField("Largura da caixa", 'data-cp-text-box="width"', layer.width, 1, 8000, "any") +
    numField("Altura da caixa", 'data-cp-text-box="height"', layer.height, 1, 8000, "any") + '</div>' :
    locked ? '<div class="cp-transform-row"><div class="cp-pair">' +
    scaleAxes.map(axis => channelField(axis, props)).join("") + '</div>' + diamond("scale") + '</div>' :
    scaleAxes.map(row).join("");
  return position + '<div class="cp-scale">' + lock + size + '</div>' + row("rotation") + row("reveal");
}
const sampleRequest =
  "Crie um quadrado coral que gira, se abre e revela o título “Nova coleção”.";
const scopeRequest = "Faça o giro desacelerar antes de abrir.";
const titleRequest = "Faça o título entrar suavemente.";

export function createCompositionUI({
  getState,
  change,
  seek,
  undo,
  canUndo,
  replay,
  notify,
  setPanel,
  showDialog,
  pausePreview,
  requestProjectEdit,
}) {
  const library = $("#library-items"),
    inspector = $("#inspector"),
    track = $("#motion-track"),
    canvas = $("#screen"),
    stage = $("#stage"),
    resizeOverlay = $("#layer-resize"),
    resizeBox = resizeOverlay.querySelector(".cp-resize-box");
  let activeId = null,
    selectedId = null,
    channel = "position",
    activeKey = null,
    curvesOpen = false,
    snapAnimation = false,
    bezierDrag = null,
    drag = null,
    resizeGesture = null,
    request = null,
    requestProgress = "",
    pending = null,
    downloadOffer = null;
  const supportsQwen = canUseGenerativeModel();
  const preferenceKey = "mare.assistente.modo";
  let preference;
  try {
    preference = localStorage.getItem(preferenceKey);
  } catch {}
  let modelCached = false;
  const automatic = () => supportsQwen && preference === "native";
  if (supportsQwen)
    hasCachedModel().then(cached => {
      modelCached = cached;
      if (cached && activeId && !request && !pending && !inspector.contains(document.activeElement)) render();
    });
  const sessions = new Map();
  function session() {
    if (!sessions.has(activeId))
      sessions.set(activeId, { prompt: "", messages: [], undoAfter: null, feedback: null });
    return sessions.get(activeId);
  }
  function current() {
    const { clip, time, playing } = getState();
    const doc = clip?.composition;
    return {
      clip,
      time,
      playing,
      doc,
      layer: doc?.layers.find(l => l.id === selectedId),
      limit: clip ? clip.trim + clip.duration : 0,
    };
  }
  function invalidateRequest() {
    pending = null;
    downloadOffer = null;
    requestProgress = "";
    if (request) {
      request.abort();
      request = null;
    }
  }
  function apply(edit) {
    const { doc } = current();
    if (!doc) return false;
    const next = structuredClone(doc);
    try {
      edit(next);
      assertComposition(next);
    } catch (err) {
      notify(err.message || "Confira os valores da camada.");
      render();
      return false;
    }
    if (JSON.stringify(next) === JSON.stringify(doc)) return false;
    invalidateRequest();
    change(next);
    return true;
  }
  function selectLayer(id, openInspector = false) {
    if (id !== selectedId) {
      invalidateRequest();
      activeKey = null;
    }
    selectedId = id;
    render();
    if (openInspector) setPanel("props");
  }
  function focusLibrarySelection() {
    library.querySelector('[data-cp-select="' + CSS.escape(selectedId ?? "") + '"]')
      ?.focus({ preventScroll: true });
  }
  function removeLayer(id) {
    return id != null && apply(doc => {
      doc.layers = doc.layers.filter(layer => layer.id !== id);
    });
  }
  function moveLayer(id, index) {
    apply(doc => {
      const from = doc.layers.findIndex(l => l.id === id);
      if (from < 0 || from === index) return;
      const [layer] = doc.layers.splice(from, 1);
      doc.layers.splice(index, 0, layer);
      if (selectedId !== id) activeKey = null;
      selectedId = id;
    });
  }
  function dropLayer(id, visualIndex) {
    moveLayer(id, current().doc.layers.length - 1 - visualIndex);
  }
  const cancelLibrarySort = bindLayerOrder(library, dropLayer);
  const cancelTrackSort = bindLayerOrder(track, dropLayer);
  const grip = '<span class="cp-grip" aria-hidden="true">' + svg("GripVertical") + '</span>';
  function scopeText(layer) {
    return layer ? layer.name : "Composição inteira";
  }
  let category = "Formas";
  function libraryMarkup(doc) {
    const choices = category === "Formas" ? Object.entries(basicShapes) : [];
    for (const [id, asset] of Object.entries(elements))
      if (asset.group === category) choices.push([id, asset.name]);
    const add = ([type, name]) => '<button type="button" data-cp-add="' + type + '">' + glyph(type) + name + '</button>';
    return (
      '<div class="cp-library"><div class="cp-heading">Adicionar camada</div><div class="cp-add-grid">' +
      [["text", "Texto"], ["image", "Importar imagens"]].map(add).join("") +
      '</div><input type="file" multiple accept="image/png,image/jpeg,image/webp,image/svg+xml" data-cp-file hidden>' +
      '<button type="button" class="btn cp-image-layouts" data-cp-layouts aria-haspopup="dialog">' + svg("SquareStack") + 'Organizar imagens</button>' +
      '<div class="cp-categories" role="group" aria-label="Biblioteca de elementos">' +
      ["Formas", "Símbolos"].map(group => '<button type="button" data-cp-category="' + group +
        '" aria-pressed="' + (category === group) + '">' + group + '</button>').join("") +
      '</div><div class="cp-add-grid">' + choices.map(add).join("") +
      '</div><div class="cp-heading cp-layer-heading">Camadas <span>' +
      doc.layers.length +
      "</span></div>" +
      '<button class="cp-layer cp-scene" data-cp-select="" aria-pressed="' +
      !selectedId +
      '">' +
      svg("Layers") +
      '<span>Composição inteira</span></button><div class="cp-stack">' +
      doc.layers
        .slice()
        .reverse()
        .map(
          l =>
            '<div class="cp-layer-row" data-cp-stack-id="' +
            safeText(l.id) +
            '"><button type="button" class="cp-layer" data-cp-sort title="Arrastar para reordenar" data-cp-select="' +
            safeText(l.id) +
            '" aria-pressed="' +
            (l.id === selectedId) +
            '">' +
            grip + glyph(l.type) +
            "<span>" +
            safeText(l.name) +
            "</span><small>" +
            timeLabel(l.start) +
            '</small></button><button type="button" class="cp-layer-delete" data-cp-remove-layer="' +
            safeText(l.id) +
            '" aria-label="Excluir camada ' + safeText(l.name) + '" title="Excluir camada">' +
            svg("Trash2") + '</button></div>'
        )
        .join("") +
      "</div></div>"
    );
  }
  function assistantMarkup(doc, layer) {
    const state = session(),
      example =
        layer?.type === "text"
          ? titleRequest
          : layer?.type === "square" && layer.keys.rotation?.length
          ? scopeRequest
          : !layer && !doc.layers.length
            ? sampleRequest
            : null;
    const feedback = state.feedback;
    return (
      '<section class="cp-assistant"><div class="cp-heading">' +
      svg("Sparkles") +
      ' Assistente de movimento</div>' +
      (doc.layers.length
        ? '<label class="cp-scope"><span>Editar</span><select data-cp-scope aria-label="O que editar">' +
      option("", "Composição inteira", !layer) +
      doc.layers.map(l => option(l.id, l.name, l.id === selectedId)).join("") +
          "</select></label>"
        : "") +
      '<form data-cp-form><textarea rows="2" maxlength="' + (automatic() ? 1800 : 650) +
      '" data-cp-prompt aria-label="Pedido ao assistente" placeholder="' +
      (layer ? "O que você quer mudar nesta camada?" : "Ex.: crie um título “Nova coleção” e faça o título entrar suavemente") +
      '"' + (request ? " disabled" : "") + ">" +
      safeText(state.prompt) +
      '</textarea><div class="cp-assistant-actions"><button class="cp-apply" type="submit" ' +
      (request ? "disabled" : "") +
      ">" +
      svg("Sparkles") +
      (request ? "Interpretando…" : automatic() ? "Preparar edição" : "Aplicar pedido") +
      "</button>" +
      (example
        ? '<button type="button" class="cp-example" ' + (request ? "disabled " : "") + 'data-cp-example="' +
          safeText(example) +
          '">' +
          (layer?.type === "text" ? "Testar entrada suave" : layer ? "Testar giro suave" : "Testar exemplo") +
          "</button>"
        : "") +
      "</div></form>" +
      (feedback
        ? '<p class="cp-result" data-cp-feedback tabindex="-1" role="' + (feedback.error ? "alert" : "status") +
          '">' + safeText(feedback.text) + "</p>"
        : "") +
      (request
        ? '<div role="status" class="cp-progress">' +
          safeText(requestProgress || "Interpretando pedido…") +
          '</div><button type="button" data-cp-cancel>Cancelar pedido</button>'
        : "") +
      (downloadOffer
        ? '<div class="cp-plan" data-cp-download-offer><strong>Preparar com o Qwen</strong><p>A edição rápida não conseguiu interpretar este pedido. Para tentar com o Qwen, baixe 398 MB. O modelo funciona neste navegador.</p>' +
          '<button type="button" data-cp-download>Baixar 398 MB e preparar</button> <button type="button" data-cp-cancel>Cancelar</button></div>'
        : "") +
      (pending
        ? '<div class="cp-plan" data-cp-plan><strong>Revisar edição</strong><p>' +
          safeText(pending.interpreter + " · " + pending.result.summary) +
          '</p><button type="button" data-cp-confirm>Aplicar edição</button> <button type="button" data-cp-cancel>Descartar</button></div>'
        : "") +
      (supportsQwen
        ? '<details class="cp-assistant-options" data-cp-options ' + (state.optionsOpen ? "open" : "") +
          '><summary>Opções do assistente</summary><label class="cp-scope"><span>Modo</span><select data-cp-engine aria-label="Modo do assistente">' +
          option("local", "Edição rápida", !automatic()) +
          option("native", modelCached ? "Com Qwen" : "Com Qwen · 398 MB", automatic()) +
          '</select></label><p data-cp-engine-hint>' +
          (automatic()
            ? "Tenta a edição rápida e recorre ao Qwen quando necessário. Você revisa as mudanças antes de aplicar. " +
              (modelCached ? "O Qwen já está neste navegador." : "O download de 398 MB pede sua confirmação.")
            : "Edite textos, cores e movimentos conhecidos no navegador, sem baixar um modelo.") +
          "</p></details>"
        : "") +
      (state.messages.length
        ? '<details class="cp-log" ' +
          (state.open ? "open" : "") +
          "><summary>Histórico de pedidos (" +
          state.messages.length +
          ")</summary>" +
          state.messages
            .slice(-6)
            .map(
              m =>
                "<div><small>" +
                safeText(m.interpreter + " · " + m.scope) +
                "</small><p>" +
                safeText(m.prompt) +
                "</p><p>" +
                safeText(m.summary) +
                "</p></div>"
            )
            .join("") +
          "</details>"
        : "") +
      (state.messages.some(message => message.applied) && doc.layers.length
        ? '<button type="button" class="cp-command-undo" data-cp-replay>' +
          svg("Play") +
          " Reproduzir composição do início</button>"
        : "") +
      (state.undoAfter === JSON.stringify(doc) && canUndo()
        ? '<button type="button" class="cp-command-undo" data-cp-undo>' +
          svg("Undo2") +
          " Desfazer pedido</button>"
        : "") +
      "</section>"
    );
  }
  function inspectorMarkup(doc, layer, time) {
    const template = animationTemplateFor(doc);
    let controls =
      (template ? '<div class="cp-heading">' + safeText(template.name) +
        '</div><div class="cp-template-controls">' + templateFields(doc) +
        '</div><button type="button" class="btn" data-cp-open-layers>Editar camadas</button>' :
        '<div class="cp-heading">Composição</div>') +
      '<label class="cp-color">Fundo<input type="color" data-cp-background value="' +
      doc.background +
      '"></label>';
    if (layer) {
      const props = evaluateLayer(layer, time);
      controls =
        (template ? '<button type="button" class="btn" data-cp-template-home>Ajustes do modelo</button>' : "") +
        '<div class="cp-prop-head">' +
        glyph(layer.type) +
        "<strong>" +
        safeText(layer.name) +
        '</strong></div><div class="cp-transform-row cp-opacity">' +
        channelField("opacity", props, "Opacidade (alpha) · %") + diamond("opacity") +
        '</div><label class="cp-field"><span>Nome da camada</span><input data-cp-prop="name" maxlength="60" value="' +
        safeText(layer.name) +
        '"></label>' +
        (layer.type === "text"
          ? '<label class="cp-field"><span>Texto da camada</span><input data-cp-prop="text" maxlength="180" value="' +
            safeText(layer.text) +
            '"></label>' +
            numField(
              "Tamanho da fonte",
              'data-cp-prop="fontSize"',
              layer.fontSize,
              8,
              320,
              1
            )
          : "") +
        (layer.type !== "image"
          ? '<label class="cp-color">Cor da camada<input type="color" data-cp-prop="color" value="' +
            safeText(layer.color) +
            '"></label>'
          : "") +
        (layer.type === "wave"
          ? numField("Amplitude", 'data-cp-wave="amplitude"', layer.wave.amplitude, 0, 2, "any") +
            numField("Velocidade", 'data-cp-wave="speed"', layer.wave.speed, .25, 2.5, "any")
          : "") +
        (layer.outline
          ? numField("Espessura do contorno", 'data-cp-prop="outline"', layer.outline, .5, 100, "any")
          : "") +
        (layer.fit || layer.outline
          ? '<div class="cp-pair">' +
            numField("Largura", 'data-cp-prop="width"', layer.width, 1, 8000) +
            numField("Altura", 'data-cp-prop="height"', layer.height, 1, 8000) + "</div>"
          : "") +
        '<div class="cp-pair">' +
        numField("Entrada (s)", 'data-cp-prop="start"', layer.start, 0, 3599) +
        numField(
          "Saída (s)",
          'data-cp-prop="end"',
          layer.end,
          layer.start + 0.01,
          3600
        ) +
        "</div>" +
        '<div class="cp-heading">Transformação</div>' +
        transformMarkup(layer, props) +
        '<div class="cp-layer-tools"><button type="button" data-cp-order="1" ' +
        (doc.layers.at(-1)?.id === selectedId ? "disabled" : "") +
        '>Para frente</button><button type="button" data-cp-order="-1" ' +
        (doc.layers[0]?.id === selectedId ? "disabled" : "") +
        '>Para trás</button><button type="button" aria-label="Excluir camada" title="Excluir camada (Delete)" aria-keyshortcuts="Delete" data-cp-delete>' +
        svg("Trash2") +
        "</button></div>";
    }
    const manual = '<div class="cp-manual">' + controls + "</div>";
    const assistant = assistantMarkup(doc, layer);
    return '<div class="cp-inspector">' + (!doc.layers.length ? assistant + manual : manual + assistant) + "</div>";
  }
  function timingRows(clip, layers) {
    return (
      '<div class="cp-timing-rows">' +
      layers
        .slice()
        .reverse()
        .map(l => {
          const left = clamp((l.start - clip.trim) / clip.duration, 0, 1);
          const right = clamp(
            (clip.trim + clip.duration - l.end) / clip.duration,
            0,
            1
          );
          return (
            '<div class="cp-timing-row" data-cp-stack-id="' + safeText(l.id) +
            '"><button type="button" class="cp-timing-name" data-cp-sort title="Arrastar para reordenar" data-cp-pick="' +
            safeText(l.id) +
            '">' +
            glyph(l.type) +
            safeText(l.name) +
            '</button><div class="cp-duration-rail"><button type="button" data-cp-onset="' +
            safeText(l.id) +
            '" style="left:' +
            left * 100 +
            "%;right:" +
            right * 100 +
            '%" aria-pressed="' +
            (l.id === selectedId) +
            '" aria-label="Mover entrada de ' +
            safeText(l.name) +
            '" title="Arraste para mudar a entrada"><span>' +
            timeLabel(l.start) +
            "</span></button></div></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }
  function curveMarkup(clip, layer) {
    const axis = axesFor(channel)[0];
    const axes = ["x", "y"].includes(axis) ? ["x", "y"] : scaleAxes.includes(axis) ? scaleAxes : [axis];
    const graph = curveGraph(layer, axis, clip);
    const format = value => shownValue(axis, value).toLocaleString("pt-BR", {maximumFractionDigits: 3}) +
      (percentage(axis) ? "%" : axis === "rotation" ? "°" : "");
    const heading = axes.length === 1 ? keyChannels[axis] : axes.map(id =>
      '<button type="button" data-cp-curve-axis="' + id + '" aria-pressed="' + (axis === id) + '">' +
      keyChannels[id] + '</button>').join("");
    if (!graph) return '<p class="cp-rail-empty">Camada fora deste intervalo.</p>';
    const buttons = graph.keys.map(key =>
      '<button type="button" class="cp-curve-point" data-cp-curve-key="' + key.t +
      '" style="left:' + key.x + '%;top:' + key.y + '%" aria-pressed="' + (key.t === activeKey) +
      '" aria-label="' + keyChannels[axis] + ', ' + timeLabel(layer.start + key.t) + ', ' + format(key.value) +
      '" title="' + timeLabel(layer.start + key.t) + ' · ' + format(key.value) + '"></button>').join("");
    return '<div class="cp-curve-heading">' + heading + '<span>' + format(graph.min) +
      (graph.min === graph.max ? "" : ' – ' + format(graph.max)) + '</span></div>' +
      '<div class="cp-curve-plot" role="group" aria-label="Curva de ' + keyChannels[axis] + '">' +
      '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline vector-effect="non-scaling-stroke" points="' +
      graph.path + '"/></svg>' + buttons + '<i data-cp-needle></i></div>';
  }
  function timelineMarkup(clip, doc, layer, time) {
    const min = clip.trim,
      max = min + clip.duration,
      keys = timelineKeys(layer, channel),
      key = keys.find(k => k.t === activeKey);
    const ui =
      '<div class="cp-timeline-head"><h2>' +
      svg("Diamond") +
      ' Linha de animação</h2><span class="cp-time" data-cp-clock>' +
      timeLabel(time) +
      "</span></div>" +
      '<label class="cp-cursor"><span>Tempo da cena</span><input type="range" data-cp-time aria-label="Tempo da composição" min="' +
      min +
      '" max="' +
      max +
      '" step=".01" value="' +
      time +
      '"></label>' +
      timingRows(clip, doc.layers);
    if (!layer)
      return (
        '<div class="cp-timeline">' +
        ui +
        '<div class="cp-rail-empty">' +
        (doc.layers.length
          ? "Selecione uma camada para editar seus keyframes."
          : "Adicione uma camada ou descreva a animação no assistente.") +
        "</div></div>"
      );
    const marks = keys
      .map((k, i) => ({ k, i }))
      .filter(({ k }) => layer.start + k.t >= min && layer.start + k.t <= max);
    const inLayer = time >= layer.start && time < layer.end;
    return (
      '<div class="cp-timeline">' +
      ui +
      '<div class="cp-key-toolbar"><b>' +
      safeText(layer.name) +
      '</b><label><span class="cp-sr">Canal de animação</span><select data-cp-keychannel>' +
      Object.entries(keyChannels).filter(([k]) => k !== "x" && k !== "y")
        .map(([k, label]) => option(k, label, k === channel)).join("") +
      '<optgroup label="Eixos individuais">' +
      ["x", "y"].map(k => option(k, keyChannels[k], k === channel)).join("") +
      '</optgroup></select></label><button type="button" data-cp-keyadd ' +
      (channel === "position" ? "data-cp-keyposition " : "") +
      (!inLayer ? "disabled" : "") + ">" + svg("Diamond") +
      (channel === "position" ? " Gravar posição" : " Gravar keyframe") +
      '</button><button type="button" data-cp-curves aria-expanded="' + curvesOpen +
      '" aria-controls="cp-curves">Curvas</button><button type="button" data-cp-snap aria-pressed="' +
      snapAnimation + '" title="Encaixar no marcador ou nos tempos de outras camadas">Encaixe</button></div>' +
      '<div class="cp-key-rail" aria-label="Keyframes de ' +
      safeText(keyChannels[channel]) +
      '"><div class="cp-life" style="left:' +
      clamp(((layer.start - min) * 100) / clip.duration, 0, 100) +
      "%;right:" +
      clamp(((max - layer.end) * 100) / clip.duration, 0, 100) +
      '%"></div>' +
      marks
        .map(
          ({ k, i }) =>
            '<button type="button" data-cp-key="' +
            i +
            '" aria-pressed="' +
            (activeKey === k.t) +
            '" style="left:' +
            clamp(((layer.start + k.t - min) * 100) / clip.duration, 0, 100) +
            '%" aria-label="Keyframe em ' +
            timeLabel(layer.start + k.t) +
            '">◆</button>'
        )
        .join("") +
      "<span data-cp-needle></span></div>" +
      '<div id="cp-curves"' + (curvesOpen ? '>' + curveMarkup(clip, layer) : ' hidden>') + '</div>' +
      (key
        ? '<div class="cp-key-detail">' +
          numField(
            "Instante do keyframe (s)",
            "data-cp-keytime",
            layer.start + key.t,
            layer.start,
            layer.end,
            "any"
          ) +
          '<label class="cp-field"><span>Curva de chegada · ' + (channel === "position" || channel === "scale" ? keyChannels[channel] + " X e Y" : keyChannels[channel]) + '</span><select data-cp-ease>' +
          (key.ease === "mixed" ? '<option value="mixed" disabled selected>Curvas diferentes</option>' : "") +
          Object.entries(eases)
            .filter(([k]) => k !== "bezier" || key.t > 0 || isBezier(key.ease))
            .map(([k, v]) => option(k, v, (isBezier(key.ease) ? "bezier" : key.ease) === k))
            .join("") +
          '</select></label><button data-cp-keyremove aria-label="Excluir keyframe">' +
          svg("Trash2") +
          "</button></div>" + (isBezier(key.ease) && key.t > 0 ? bezierEditor(key.ease) : "")
        : "") +
      "</div>"
    );
  }
  function render() {
    cancelLibrarySort();
    cancelTrackSort();
    const { clip, doc, time } = current();
    if (!doc) {
      leave();
      return;
    }
    if (activeId !== clip.id) {
      invalidateRequest();
      activeId = clip.id;
      selectedId = null;
      activeKey = null;
      channel = "position";
    }
    const plan = pending ?? downloadOffer;
    if (plan && JSON.stringify(doc) !== plan.before) invalidateRequest();
    if (selectedId && !doc.layers.some(l => l.id === selectedId)) {
      selectedId = null;
      activeKey = null;
    }
    const layer = doc.layers.find(l => l.id === selectedId);
    document.body.classList.add("composition-active");
    library.innerHTML = libraryMarkup(doc);
    inspector.innerHTML = inspectorMarkup(doc, layer, time);
    timingDrag = null;
    bezierDrag = null;
    track.innerHTML = timelineMarkup(clip, doc, layer, time);
    const plot = track.querySelector(".cp-bezier-plot");
    if (plot) paintBezier(plot, timelineKeys(layer, channel).find(key => key.t === activeKey).ease);
    setTime();
  }
  function setTime() {
    if (!activeId) return;
    const { time, clip, layer } = current();
    if (!clip || clip.id !== activeId) return;
    updateResizeOverlay();
    const clock = track.querySelector("[data-cp-clock]");
    if (!clock) return;
    clock.textContent = timeLabel(time);
    track.querySelector("[data-cp-time]").value = time;
    for (const needle of track.querySelectorAll("[data-cp-needle]"))
      needle.style.left =
        clamp((time - clip.trim) / clip.duration, 0, 1) * 100 + "%";
    if (layer) {
      for (const button of track.querySelectorAll("[data-cp-keyadd], [data-cp-keyposition]"))
        button.disabled = time < layer.start || time >= layer.end;
      for (const button of inspector.querySelectorAll("[data-cp-diamond]")) {
        const property = button.dataset.cpDiamond;
        const target = keyTarget(layer, clip, time, property);
        const state = target?.state ?? "false";
        const action = state === "true" ? "Remover" : state === "mixed" ? "Completar" : "Gravar";
        const label = action + " keyframe de " + keyChannels[property] + " neste quadro";
        button.disabled = !target;
        if (button.getAttribute("aria-pressed") !== state) button.setAttribute("aria-pressed", state);
        if (button.title !== label) {
          button.title = label;
          button.setAttribute("aria-label", label);
        }
      }
      syncTransformFields(layer, evaluateLayer(layer, time));
    }
  }
  function syncTransformFields(layer, props) {
    for (const el of inspector.querySelectorAll("[data-cp-channel],[data-cp-text-box]")) {
      if (document.activeElement === el) continue;
      const { cpChannel, cpTextBox } = el.dataset;
      el.value = cpTextBox ? round(layer[cpTextBox]) : shownValue(cpChannel, props[cpChannel]);
    }
  }
  function leave() {
    cancelLibrarySort();
    cancelTrackSort();
    if (!activeId) return;
    invalidateRequest();
    document.body.classList.remove("composition-active");
    activeId = null;
    selectedId = null;
    activeKey = null;
    drag = null;
    timingDrag = null;
    bezierDrag = null;
    endResize();
    resizeOverlay.hidden = true;
  }
  function editLayer(fn) {
    apply(doc => {
      const l = doc.layers.find(l => l.id === selectedId);
      if (l) fn(l, doc);
    });
  }
  function recordKey(property, remove = false) {
    const { clip, layer, time } = current();
    if (!layer) return;
    const target = keyTarget(layer, clip, time, property);
    if (!target) return;
    const { t } = target;
    const at = layer.start + t;
    const pose = evaluateLayer(layer, at);
    channel = property;
    activeKey = remove ? null : t;
    editLayer(l => {
      const axes = axesFor(property);
      const existingEase = property === "scale" ? axes
        .map(axis => l.keys[axis]?.find(k => Math.abs(k.t - t) <= .000001)?.ease)
        .find(Boolean) : null;
      for (const axis of axes) {
        const keys = l.keys[axis] || [];
        const key = keys.find(k => Math.abs(k.t - t) <= 0.000001);
        if (remove && key) keys.splice(keys.indexOf(key), 1);
        else if (!remove && !key) setKey(l, axis, t, pose[axis], existingEase ?? "linear");
      }
    });
    seek(at);
    render();
  }
  function moveKey(layer, from, time, exact = false) {
    const { clip } = current();
    const at = channel === "position" ? positionFrame(clip, layer, time) : time;
    if (at === null) return;
    const local = Math.max(0, at - layer.start);
    const to = channel === "position" || exact ? local : round(local);
    if (timelineKeys(layer, channel).some(k => k.t !== from && Math.abs(k.t - to) < 0.000001)) {
      notify("Já existe um keyframe nesse instante.");
      render();
      return;
    }
    activeKey = to;
    editLayer(l => {
      for (const axis of axesFor(channel)) {
        const keys = l.keys[axis];
        const i = keys?.findIndex(k => k.t === from) ?? -1;
        if (i < 0) continue;
        const [key] = keys.splice(i, 1);
        setKey(l, axis, to, key.value, key.ease);
      }
    });
    seek(layer.start + to);
    render();
  }
  function changeField(el) {
    const { layer, time } = current();
    if (el.hasAttribute("data-cp-template-field")) {
      changeTemplateField(el);
      return;
    }
    if (el.hasAttribute("data-cp-wave")) {
      if (el.value && el.checkValidity())
        editLayer(layer => { layer.wave[el.dataset.cpWave] = el.valueAsNumber; });
      else render();
      return;
    }
    if (el.matches("[data-cp-engine]")) {
      invalidateRequest();
      preference = el.value;
      try {
        localStorage.setItem(preferenceKey, preference);
      } catch {}
      render();
      inspector.querySelector("[data-cp-engine]")?.focus({ preventScroll: true });
      return;
    }
    if (el.matches("[data-cp-background]")) {
      apply(doc => (doc.background = el.value));
      return;
    }
    if (el.matches("[data-cp-scope]")) {
      selectLayer(el.value || null);
      inspector.querySelector("[data-cp-scope]")?.focus({ preventScroll: true });
      return;
    }
    if (!layer) return;
    if (el.matches("[data-cp-keychannel]")) {
      channel = el.value;
      activeKey = null;
      render();
      return;
    }
    if (el.type === "number" && (!el.value || !el.checkValidity())) {
      notify("Digite um valor dentro do intervalo indicado.");
      render();
      return;
    }
    const prop = el.dataset.cpProp,
      key = el.dataset.cpChannel;
    if (el.dataset.cpTextBox) {
      editLayer(l => Object.assign(l, { [el.dataset.cpTextBox]: el.valueAsNumber, wrap: true }));
    } else if (prop) {
      const val = el.type === "number" ? round(Number(el.value)) : el.value;
      editLayer(l => {
        if (prop === "start") {
          l.end = Math.max(l.end, val + 0.01);
          l.start = val;
        } else if (prop === "end") {
          l.end = val;
        } else editLayerFields(l, { [prop]: val });
      });
    } else if (key) {
      const value = modelValue(key, Number(el.value));
      if (key === "x" || key === "y") {
        let at = time;
        editLayer(l => { at = editPosition(l, { [key]: value }, time, current().clip, channel); });
        if (at !== time) seek(at);
      } else if (scaleAxes.includes(key) && aspectLocked(layer)) {
        const values = linkedScale(evaluateLayer(layer, time), key, value);
        editLayer(l => editScale(l, values, time, true));
      } else editLayer(l => setValue(l, key, value, time));
    } else if (el.matches("[data-bezier-value]")) {
      const currentEase = timelineKeys(layer, channel).find(key => key.t === activeKey)?.ease;
      if (!isBezier(currentEase)) return;
      const ease = [...currentEase];
      ease[Number(el.dataset.bezierValue)] = el.valueAsNumber;
      commitBezier(ease);
    } else if (el.matches("[data-cp-keytime]")) {
      moveKey(layer, activeKey, Number(el.value));
    } else if (el.matches("[data-cp-ease]"))
      editLayer(l => {
        for (const axis of axesFor(channel)) {
          const k = l.keys[axis]?.find(k => k.t === activeKey);
          if (k) k.ease = el.value === "bezier" ? [...DEFAULT_BEZIER] : el.value;
        }
      });
  }
  async function changeTemplateField(input) {
    const index = Number(input.dataset.cpTemplateField);
    if (input.type === "number" && (!input.value || !input.checkValidity())) {
      input.reportValidity();
      return;
    }
    let value = input.type === "number" ? input.valueAsNumber : input.value;
    if (input.type === "file") {
      const {clip, doc} = current();
      const control = templateControls(doc).find(field => field.index === index);
      const file = input.files[0];
      if (!file || !control) return;
      input.disabled = true;
      try {
        value = (await imageLayerFromFile(file, clip.duration)).src;
        const live = current();
        if (live.clip?.id !== clip.id ||
            templateControls(live.doc).find(field => field.index === index)?.value !== control.value) return;
      } catch (err) {
        notify(err.message);
        input.value = "";
        return;
      } finally {
        input.disabled = false;
      }
    }
    apply(doc => setTemplateControl(doc, index, value));
  }
  function isCurrentPlan(plan) {
    const { doc, clip } = current();
    return plan && clip?.id === plan.id && selectedId === plan.scope && JSON.stringify(doc) === plan.before;
  }
  async function send(allowDownload = false) {
    if (request) return;
    const { doc, layer, time, limit, clip } = current(),
      state = session(),
      prompt = state.prompt.trim();
    if (!prompt) {
      state.feedback = { text: "Escreva o que você quer mudar ou teste um exemplo.", error: true };
      render();
      inspector.querySelector("[data-cp-prompt]")?.focus();
      return;
    }
    if (!selectedId && requestProjectEdit?.(prompt)) return;
    const review = automatic();
    if (allowDownload && (!review || downloadOffer?.prompt !== prompt || !isCurrentPlan(downloadOffer))) return;
    pending = null;
    downloadOffer = null;
    requestProgress = "";
    state.feedback = null;
    const ctrl = new AbortController(),
      plan = { id: clip.id, scope: selectedId, before: JSON.stringify(doc), prompt };
    request = ctrl;
    render();
    let interpreter = "Edição rápida";
    let focusAfter;
    try {
      const params = {
        prompt,
        composition: structuredClone(doc),
        selectedId: plan.scope,
        duration: limit,
        time,
        signal: ctrl.signal,
        onProgress: text => {
          if (request === ctrl) {
            if (
              text.startsWith("Carregando o modelo") ||
              text.startsWith("Interpretando o pedido")
            )
              modelCached = true;
            requestProgress = text;
            const el = inspector.querySelector(".cp-progress");
            if (el) el.textContent = text;
          }
        },
      };
      let result;
      try {
        result = await planCompositionEdit(params);
      } catch (error) {
        if (!review || ctrl.signal.aborted) throw error;
        if (!isCurrentPlan(plan)) return;
        if (!modelCached && !allowDownload) {
          downloadOffer = plan;
          focusAfter = "[data-cp-download]";
          return;
        }
        interpreter = "Qwen";
        result = await planGenerativeEdit(params);
      }
      if (ctrl.signal.aborted || !isCurrentPlan(plan)) return;
      const changed = JSON.stringify(result.composition) !== plan.before;
      assertComposition(result.composition);
      if (!changed) throw new Error("O pedido não alterou a composição.");
      const ready = { ...plan, result, interpreter };
      if (review) {
        pending = ready;
        focusAfter = "[data-cp-confirm]";
      } else if (commitPlan(ready) === "inline") focusAfter = "[data-cp-feedback]";
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const message = err.message || "Tente descrever uma alteração por vez.";
      state.messages.push({
        prompt,
        interpreter,
        scope: scopeText(layer),
        summary: message,
      });
      state.feedback = { text: message, error: true };
      focusAfter = "[data-cp-feedback]";
    } finally {
      if (request === ctrl) request = null;
      if (activeId === plan.id) {
        render();
        if (focusAfter) inspector.querySelector(focusAfter)?.focus();
      }
    }
  }
  function commitPlan(plan) {
    const { doc, layer, clip } = current();
    const state = session();
    if (!isCurrentPlan(plan)) {
      invalidateRequest();
      state.feedback = { text: "A composição mudou. Envie o pedido novamente.", error: true };
      render();
      return "inline";
    }
    const { prompt, result } = plan;
    const firstAnimation = !doc.layers.length && result.composition.layers.length > 0;
    state.messages.push({
      prompt,
      interpreter: plan.interpreter,
      scope: scopeText(layer),
      summary: result.summary,
      applied: true,
    });
    state.prompt = "";
    state.feedback = { text: result.summary, error: false };
    state.undoAfter = JSON.stringify(result.composition);
    selectedId = result.selectedId || null;
    activeKey = null;
    pending = null;
    request = null;
    change(result.composition);
    if (firstAnimation) {
      setPanel("preview");
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
        seek(clip.trim + clip.duration - Math.min(1 / 30, clip.duration / 2));
      else replay();
      $("#play")?.focus({ preventScroll: true });
      return "preview";
    }
    return "inline";
  }
  function attach(container, event, fn) {
    container.addEventListener(
      event,
      e => {
        if (
          !activeId ||
          !e.target.closest(".cp-inspector,.cp-library,.cp-timeline")
        )
          return;
        e.stopPropagation();
        fn(e);
      },
      true
    );
  }
  attach(inspector, "submit", e => {
    e.preventDefault();
    send();
  });
  attach(inspector, "input", e => {
    if (!e.target.matches("[data-cp-prompt]")) return;
    const state = session();
    state.prompt = e.target.value;
    state.feedback = null;
    invalidateRequest();
    for (const el of inspector.querySelectorAll("[data-cp-feedback], [data-cp-download-offer], [data-cp-plan]"))
      el.remove();
  });
  attach(inspector, "change", e => changeField(e.target));
  attach(inspector, "keydown", e => {
    const { cpChannel, cpTextBox } = e.target.dataset;
    if (e.key === "Enter" && !e.isComposing &&
        (cpChannel === "opacity" || scaleAxes.includes(cpChannel) || cpTextBox)) {
      e.preventDefault();
      if (!e.target.reportValidity()) return;
      e.target.blur();
      const selector = cpTextBox ? '[data-cp-text-box="' + cpTextBox + '"]' : '[data-cp-channel="' + cpChannel + '"]';
      inspector.querySelector(selector)?.focus({ preventScroll: true });
      return;
    }
    if (e.key === "Enter" && e.target.matches("input[data-cp-template-field]") && e.target.type === "text" && !e.isComposing) {
      e.preventDefault();
      const index = e.target.dataset.cpTemplateField;
      e.target.blur();
      inspector.querySelector('input[data-cp-template-field="' + index + '"]')?.focus({ preventScroll: true });
      return;
    }
    if (
      e.target.matches("[data-cp-prompt]") &&
      e.key === "Enter" &&
      (e.ctrlKey || e.metaKey)
    ) {
      e.preventDefault();
      send();
    }
  });
  // Blurring a field rebuilds the inspector. Commit it after the click is captured.
  inspector.addEventListener("pointerdown", e => {
    if (e.target.closest("[data-cp-diamond],[data-cp-lock]") &&
        document.activeElement?.matches("[data-cp-channel],[data-cp-text-box]"))
      e.preventDefault();
  });
  attach(inspector, "click", e => {
    const button = e.target.closest("button,summary");
    if (!button) return;
    if (button.hasAttribute("data-cp-open-layers")) {
      const {doc} = current();
      const focus = animationTemplateFor(doc)?.focus;
      const target = doc.layers.find(layer => layer.id === focus) ||
        doc.layers.find(layer => Object.values(layer.keys).some(keys => keys.length)) || doc.layers[0];
      if (target) selectLayer(target.id, true);
      return;
    }
    if (button.hasAttribute("data-cp-template-home")) {
      selectLayer(null, true);
      return;
    }
    if (button.hasAttribute("data-cp-lock")) {
      const input = document.activeElement;
      if (input?.matches("[data-cp-channel],[data-cp-text-box]")) {
        if (!input.value || !input.reportValidity()) return;
        input.blur();
      }
      editLayer(layer => {
        if (aspectLocked(layer)) layer.lockAspectRatio = false;
        else delete layer.lockAspectRatio;
      });
      inspector.querySelector("[data-cp-lock]")?.focus({ preventScroll: true });
      return;
    }
    const property = button.dataset.cpDiamond;
    if (property) {
      const remove = button.getAttribute("aria-pressed") === "true";
      const input = document.activeElement;
      if (input?.matches("[data-cp-channel]")) {
        if (!input.value || !input.reportValidity()) return;
        input.blur();
      }
      recordKey(property, remove);
      inspector.querySelector('[data-cp-diamond="' + property + '"]')?.focus({ preventScroll: true });
      return;
    }
    if (button.hasAttribute("data-cp-replay")) {
      setPanel("preview");
      replay();
      return;
    }
    if (button.hasAttribute("data-cp-confirm")) {
      if (commitPlan(pending) === "inline") inspector.querySelector("[data-cp-feedback]")?.focus();
      return;
    }
    if (button.hasAttribute("data-cp-download")) {
      send(true);
      return;
    }
    if (button.hasAttribute("data-cp-cancel")) {
      invalidateRequest();
      render();
      inspector.querySelector("[data-cp-prompt]")?.focus();
      return;
    }
    if (button.matches("summary")) {
      const options = button.parentElement.hasAttribute("data-cp-options");
      session()[options ? "optionsOpen" : "open"] = !button.parentElement.open;
    }
    if (button.dataset.cpExample) {
      session().prompt = button.dataset.cpExample;
      send();
      return;
    }
    if (button.hasAttribute("data-cp-undo")) {
      const state = session();
      state.undoAfter = null;
      state.feedback = null;
      undo();
    }
    if (button.hasAttribute("data-cp-delete")) removeLayer(selectedId);
    if (button.dataset.cpOrder) {
      const delta = Number(button.dataset.cpOrder);
      const layers = current().doc.layers;
      const from = layers.findIndex(l => l.id === selectedId);
      moveLayer(selectedId, clamp(from + delta, 0, layers.length - 1));
    }
  });
  // Commit the field on click, after capturing the layer ID. Blurring it on
  // pointerdown would rebuild the list before the trash button receives a click.
  const layerField = "input,textarea,select";
  library.addEventListener("pointerdown", e => {
    if (e.button === 0 && e.target.closest("[data-cp-remove-layer]") &&
        document.activeElement?.matches(layerField)) e.preventDefault();
  });
  attach(library, "click", e => {
    const button = e.target.closest("button");
    if (!button) return;
    if (button.hasAttribute("data-cp-layouts")) {
      const {clip, doc, time, limit} = current();
      pausePreview();
      openImageLayoutGallery({
        dialog: $("#dialog"), showDialog, composition: doc, duration: limit,
        apply(images, layoutId) {
          if (current().clip?.id !== clip.id || current().doc !== doc) return;
          const arranged = arrangeImages(images, layoutId, time);
          const updates = new Map(arranged.map(layer => [layer.id, layer]));
          if (apply(draft => {
            draft.layers = draft.layers.map(layer => {
              const update = updates.get(layer.id);
              updates.delete(layer.id);
              return update ?? layer;
            });
            draft.layers.push(...updates.values());
          })) {
            selectLayer(arranged.at(-1).id);
            setPanel("preview");
          }
        },
      });
      return;
    }
    if (button.hasAttribute("data-cp-remove-layer")) {
      const id = button.dataset.cpRemoveLayer;
      const field = document.activeElement;
      if (field?.matches(layerField)) field.blur();
      if (removeLayer(id)) focusLibrarySelection();
      return;
    }
    if (button.hasAttribute("data-cp-select")) {
      selectLayer(button.dataset.cpSelect || null, true);
      focusLibrarySelection();
      return;
    }
    if (button.dataset.cpCategory) {
      category = button.dataset.cpCategory;
      library.innerHTML = libraryMarkup(current().doc);
      library.querySelector('[data-cp-category="' + category + '"]').focus();
      return;
    }
    const type = button.dataset.cpAdd;
    if (!type) return;
    if (type === "image") {
      library.querySelector("[data-cp-file]").click();
      return;
    }
    const { limit } = current(),
      layer = newLayer(type, limit);
    apply(doc => {
      doc.layers.push(layer);
      selectedId = layer.id;
      activeKey = null;
    });
    setPanel("props");
  });
  attach(library, "change", async e => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = "";
    const { clip, limit, doc } = current();
    if (doc.layers.length + files.length > 64) {
      notify("A composição aceita até 64 camadas. Selecione menos imagens.");
      return;
    }
    try {
      const layers = [];
      for (const file of files) {
        if (activeId !== clip.id) return;
        try {
          layers.push(await imageLayerFromFile(file, limit));
        } catch (err) {
          throw new Error(file.name + " · " + err.message);
        }
      }
      if (activeId !== clip.id) return;
      if (apply(next => {
        next.layers.push(...layers);
        selectedId = layers.at(-1).id;
        activeKey = null;
      })) setPanel("props");
    } catch (err) {
      notify(err.message);
    }
  });
  attach(track, "input", e => {
    if (e.target.matches("[data-cp-time]")) seek(Number(e.target.value));
  });
  attach(track, "change", e => changeField(e.target));
  attach(track, "click", e => {
    const b = e.target.closest("button"),
      { layer } = current();
    if (!b) return;
    if (b.dataset.cpPick || b.dataset.cpOnset) {
      selectLayer(b.dataset.cpPick || b.dataset.cpOnset, true);
      return;
    }
    if (!layer) return;
    if (b.hasAttribute("data-cp-snap")) {
      snapAnimation = !snapAnimation;
      b.setAttribute("aria-pressed", String(snapAnimation));
    } else if (b.hasAttribute("data-cp-curves")) {
      curvesOpen = !curvesOpen;
      render();
      track.querySelector("[data-cp-curves]").focus({preventScroll: true});
    } else if (b.hasAttribute("data-cp-curve-axis")) {
      channel = b.dataset.cpCurveAxis;
      render();
      track.querySelector('[data-cp-curve-axis="' + channel + '"]').focus({preventScroll: true});
    } else if (b.hasAttribute("data-cp-curve-key")) {
      channel = axesFor(channel)[0];
      activeKey = Number(b.dataset.cpCurveKey);
      seek(layer.start + activeKey);
      render();
      track.querySelector('[data-cp-curve-key="' + activeKey + '"]')?.focus({preventScroll: true});
    } else if (b.hasAttribute("data-cp-keyadd")) {
      recordKey(channel);
    } else if (b.hasAttribute("data-cp-key")) {
      const k = timelineKeys(layer, channel)[Number(b.dataset.cpKey)];
      if (k) {
        activeKey = k.t;
        seek(layer.start + k.t);
        render();
      }
    } else if (b.hasAttribute("data-cp-keyremove")) {
      const t = activeKey;
      activeKey = null;
      editLayer(l => {
        for (const axis of axesFor(channel)) {
          if (l.keys[axis]) l.keys[axis] = l.keys[axis].filter(k => k.t !== t);
        }
      });
    }
  });
  let timingDrag = null;
  function writeBezier(layer, ease) {
    for (const axis of axesFor(channel)) {
      const key = layer.keys[axis]?.find(k => k.t === activeKey);
      if (key) key.ease = [...ease];
    }
  }
  function commitBezier(ease) {
    if (isBezier(ease)) editLayer(layer => writeBezier(layer, ease));
  }
  track.addEventListener("pointerdown", e => {
    const handle = e.target.closest("[data-bezier-handle]");
    if (!handle || !e.isPrimary || e.button !== 0 || bezierDrag) return;
    const {layer, clip, doc} = current();
    const axis = axesFor(channel).find(axis => layer.keys[axis]?.some(k => k.t === activeKey));
    if (!axis) return;
    const keys = layer.keys[axis];
    const index = keys.findIndex(k => k.t === activeKey);
    const key = keys[index];
    if (!isBezier(key?.ease)) return;
    pausePreview();
    const plot = handle.parentElement;
    const previewDoc = structuredClone(doc);
    bezierDrag = {
      pointer: e.pointerId, handle: Number(handle.dataset.bezierHandle), rect: plot.getBoundingClientRect(),
      plot, clip, previewDoc, layer: previewDoc.layers.find(l => l.id === layer.id), ease: [...key.ease],
      startX: e.clientX, startY: e.clientY, original: key.ease,
      time: layer.start + ((keys[index - 1]?.t ?? 0) + key.t) / 2,
    };
    e.preventDefault();
    handle.focus({preventScroll: true});
    handle.setPointerCapture(e.pointerId);
  });
  track.addEventListener("pointermove", e => {
    const d = bezierDrag;
    if (!d || d.pointer !== e.pointerId) return;
    const i = d.handle * 2, range = Number(d.plot.dataset.high) - Number(d.plot.dataset.low);
    d.ease[i] = round(clamp(d.original[i] + (e.clientX - d.startX) / d.rect.width, 0, 1));
    d.ease[i + 1] = round(clamp(d.original[i + 1] - (e.clientY - d.startY) * range / d.rect.height, -3, 4));
    if (!d.previewFrame) {
      d.previewFrame = requestAnimationFrame(() => {
        d.previewFrame = 0;
        if (bezierDrag === d) previewBezier(d);
      });
    }
  });
  function previewBezier(d) {
    writeBezier(d.layer, d.ease);
    paintBezier(d.plot, d.ease);
    for (const field of track.querySelectorAll("[data-bezier-value]")) field.value = d.ease[Number(field.dataset.bezierValue)];
    if (curvesOpen) {
      const chart = track.querySelector("#cp-curves");
      chart.innerHTML = curveMarkup(d.clip, d.layer);
      const needle = chart.querySelector("[data-cp-needle]");
      if (needle) needle.style.left = clamp((d.time - d.clip.trim) / d.clip.duration, 0, 1) * 100 + "%";
    }
    drawFrame(canvas, {clips: [{...d.clip, composition: d.previewDoc}]}, d.time - d.clip.trim, getState().media);
  }
  function endBezier(commit) {
    const d = bezierDrag;
    if (!d) return;
    bezierDrag = null;
    if (commit) commitBezier(d.ease);
    render();
    seek(current().time);
    track.querySelector('[data-bezier-handle="' + d.handle + '"]')?.focus({preventScroll: true});
  }
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    track.addEventListener(type, e => {
      if (bezierDrag?.pointer === e.pointerId) endBezier(type === "pointerup");
    });
  }
  track.addEventListener("keydown", e => {
    if (bezierDrag && e.key === "Escape") {
      e.preventDefault();
      endBezier(false);
      return;
    }
    const handle = e.target.closest("[data-bezier-handle]");
    if (!handle || bezierDrag || !["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    const key = timelineKeys(current().layer, channel).find(k => k.t === activeKey);
    if (!isBezier(key?.ease)) return;
    e.preventDefault();
    e.stopPropagation();
    const vertical = e.key === "ArrowDown" || e.key === "ArrowUp";
    const i = Number(handle.dataset.bezierHandle) * 2 + Number(vertical);
    const ease = [...key.ease];
    const step = (e.shiftKey ? 0.1 : 0.01) * (["ArrowLeft", "ArrowDown"].includes(e.key) ? -1 : 1);
    ease[i] = round(clamp(ease[i] + step, vertical ? -3 : 0, vertical ? 4 : 1));
    commitBezier(ease);
    track.querySelector('[data-bezier-handle="' + handle.dataset.bezierHandle + '"]')?.focus({preventScroll: true});
  });
  function animationSnapTimes(doc, movingLayer, clip, onset, initial) {
    const candidates = new Set([current().time]);
    for (const layer of doc.layers) {
      if (onset && layer === movingLayer) continue;
      candidates.add(layer.start);
      for (const keys of Object.values(layer.keys))
        for (const key of keys) candidates.add(layer.start + key.t);
    }
    candidates.delete(initial);
    return [...candidates].filter(at => {
      if (at < clip.trim || at > clip.trim + clip.duration) return false;
      if (onset) return at <= movingLayer.end - 0.01;
      if (at < movingLayer.start || at > movingLayer.end) return false;
      if (channel !== "position") return true;
      const frame = positionFrame(clip, movingLayer, at);
      return frame !== null && Math.abs(frame - at) < 1e-7;
    }).sort((a, b) => a - b);
  }
  track.addEventListener("pointerdown", e => {
    const control = e.target.closest("[data-cp-onset],[data-cp-key]");
    if (!activeId || !control || e.button !== 0 || !e.isPrimary || timingDrag) return;
    const { doc, clip } = current(),
      onset = Boolean(control.dataset.cpOnset);
    const layer = doc.layers.find(
      l => l.id === (onset ? control.dataset.cpOnset : selectedId)
    );
    if (!layer) return;
    const keyTime = onset ? 0 : timelineKeys(layer, channel)[Number(control.dataset.cpKey)].t;
    const initial = layer.start + keyTime;
    timingDrag = {
      pointer: e.pointerId,
      control,
      layerId: layer.id,
      clipId: clip.id,
      origin: e.clientX,
      width: control.parentElement.getBoundingClientRect().width,
      initial,
      snapTimes: snapAnimation ? animationSnapTimes(doc, layer, clip, onset, initial) : [],
      keyTime,
      onset,
      modified: false,
      channel,
    };
    control.setPointerCapture(e.pointerId);
  });
  track.addEventListener("pointermove", e => {
    if (!timingDrag || timingDrag.pointer !== e.pointerId) return;
    const d = timingDrag,
      { clip, doc } = current(),
      layer = doc?.layers.find(l => l.id === d.layerId);
    if (!layer || clip.id !== d.clipId) {
      timingDrag = null;
      return;
    }
    const dx = e.clientX - d.origin;
    if (Math.abs(dx) < 3 && !d.modified) return;
    const width = d.width;
    if (!width) return;
    const min = d.onset ? clip.trim : Math.max(clip.trim, layer.start);
    const max = Math.min(
      clip.trim + clip.duration,
      layer.end - (d.onset ? 0.01 : 0)
    );
    if (max < min) return;
    d.modified = true;
    d.time = clamp(
      Math.round((d.initial + (dx * clip.duration) / width) * 100) / 100,
      min,
      max
    );
    if (!d.onset && d.channel === "position") {
      d.time = positionFrame(clip, layer, d.time) ?? d.initial;
    }
    const snapped = nearestSnap(d.snapTimes, d.initial + dx * clip.duration / width, clip.duration / width);
    d.snapped = snapped !== null;
    if (d.snapped) d.time = snapped;
    d.control.classList.toggle("is-snapped", d.snapped);
    d.control.style.left = ((d.time - clip.trim) / clip.duration) * 100 + "%";
    if (d.onset)
      d.control.querySelector("span").textContent = timeLabel(d.time);
    seek(d.time);
  });
  track.addEventListener("pointerup", e => {
    if (timingDrag?.pointer !== e.pointerId) return;
    const d = timingDrag;
    timingDrag = null;
    d.control.classList.remove("is-snapped");
    if (!d.modified) return;
    if (!d.control.isConnected || current().clip?.id !== d.clipId) {
      render();
      return;
    }
    selectedId = d.layerId;
    if (d.onset) {
      activeKey = null;
      editLayer(l => (l.start = d.time));
    } else {
      moveKey(current().layer, d.keyTime, d.time, d.snapped);
      return;
    }
    render();
    seek(d.time);
  });
  for (const type of ["pointercancel", "lostpointercapture"]) track.addEventListener(type, e => {
    if (timingDrag?.pointer === e.pointerId) {
      timingDrag = null;
      render();
    }
  });
  const designWidth = 540, designHeight = 960;
  function previewRect() {
    const r = canvas.getBoundingClientRect();
    const scale = Math.min(r.width / designWidth, r.height / designHeight);
    return {
      left: r.left + (r.width - designWidth * scale) / 2,
      top: r.top + (r.height - designHeight * scale) / 2,
      scale,
    };
  }
  function canvasPoint(e, r = previewRect()) {
    return {
      x: (e.clientX - r.left) / r.scale,
      y: (e.clientY - r.top) / r.scale,
    };
  }
  function updateResizeOverlay(previewLayer, previewPose) {
    const { layer, time, playing } = current();
    if (!activeId || !layer || playing || time < layer.start || time >= layer.end) {
      resizeOverlay.hidden = true;
      return;
    }
    const r = previewRect();
    if (!r.scale) {
      resizeOverlay.hidden = true;
      return;
    }
    const item = previewLayer ?? layer, pose = previewPose ?? evaluateLayer(item, time);
    const parent = stage.getBoundingClientRect();
    resizeBox.style.left = r.left - parent.left + pose.x * r.scale + "px";
    resizeBox.style.top = r.top - parent.top + pose.y * r.scale + "px";
    resizeBox.style.width = item.width * pose.scaleX * r.scale + "px";
    resizeBox.style.height = item.height * pose.scaleY * r.scale + "px";
    resizeBox.style.transform = "translate(-50%, -50%) rotate(" + pose.rotation + "deg)";
    resizeOverlay.hidden = false;
  }
  const previewObserver = new ResizeObserver(() => updateResizeOverlay());
  previewObserver.observe(canvas);
  previewObserver.observe(stage);

  function endResize() {
    const gesture = resizeGesture;
    if (gesture) {
      resizeGesture = null;
      if (stage.hasPointerCapture(gesture.pointer)) stage.releasePointerCapture(gesture.pointer);
    }
    return gesture;
  }
  function cancelResize() {
    if (endResize()) seek(current().time);
  }
  function stillResizing(gesture) {
    const { layer, clip, time } = current();
    return layer === gesture.layer && clip.id === gesture.clip.id && time === gesture.time;
  }
  stage.addEventListener("pointerdown", e => {
    const handle = e.target.closest("[data-cp-corner]");
    if (!handle || !e.isPrimary || e.button !== 0 || resizeGesture) return;
    e.preventDefault();
    const field = document.activeElement;
    if (field?.matches(layerField)) field.blur();
    const { doc, layer, clip, time } = current();
    if (!layer || time < layer.start || time >= layer.end) return;
    const rect = previewRect();
    const [x, y] = handle.dataset.cpCorner.split(",").map(Number);
    resizeGesture = {
      pointer: e.pointerId, doc, layer, clip, time, rect, corner: {x, y},
      pose: evaluateLayer(layer, time), origin: canvasPoint(e, rect),
      locked: aspectLocked(layer), values: null,
    };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", e => {
    const gesture = resizeGesture;
    if (!gesture || gesture.pointer !== e.pointerId) return;
    if (!stillResizing(gesture)) return cancelResize();
    const { doc, layer, clip, time, rect, pose, origin, corner, locked } = gesture;
    const point = canvasPoint(e, rect);
    const delta = { x: point.x - origin.x, y: point.y - origin.y };
    if (!gesture.values && Math.hypot(delta.x, delta.y) * rect.scale < 2) return;
    const values = resizeLayer(layer, pose, corner, delta, locked);
    gesture.values = values;
    const preview = "width" in values ? { ...layer, ...values, wrap: true } : {
      ...layer, props: { ...layer.props, ...values }, keys: { ...layer.keys, scaleX: [], scaleY: [] },
    };
    drawFrame(canvas, { clips: [{ ...clip, composition: {
      ...doc, layers: doc.layers.map(item => item === layer ? preview : item),
    } }] }, time - clip.trim, getState().media);
    const previewPose = evaluateLayer(preview, time);
    updateResizeOverlay(preview, previewPose);
    syncTransformFields(preview, previewPose);
  });
  stage.addEventListener("pointerup", e => {
    if (resizeGesture?.pointer !== e.pointerId) return;
    const gesture = endResize();
    const { values, locked, layer, pose, time } = gesture;
    if (!values) return;
    const textBox = "width" in values;
    const initial = textBox ? layer : pose;
    if (!stillResizing(gesture) || Object.entries(values).every(([key, v]) => Math.abs(initial[key] - v) < .000001) ||
        !apply(doc => {
          const item = doc.layers.find(item => item.id === layer.id);
          if (textBox) Object.assign(item, values, { wrap: true });
          else editScale(item, values, time, locked);
        })) seek(current().time);
  });
  for (const event of ["pointercancel", "lostpointercapture"])
    stage.addEventListener(event, e => {
      if (resizeGesture?.pointer === e.pointerId) cancelResize();
    });
  document.addEventListener("keydown", e => {
    if (resizeGesture && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelResize();
    }
  }, true);
  canvas.addEventListener("pointerdown", e => {
    if (!activeId || e.button !== 0) return;
    const { doc, clip, time } = current(),
      p = canvasPoint(e);
    const l = doc.layers
      .slice()
      .reverse()
      .find(l => {
        if (time < l.start || time >= l.end) return false;
        const v = evaluateLayer(l, time);
        const local = layerAxes(v, p.x - v.x, p.y - v.y);
        return (
          v.opacity > 0 &&
          Math.abs(local.x) <= l.width * v.scaleX / 2 &&
          Math.abs(local.y) <= l.height * v.scaleY / 2
        );
      });
    if (!l) return;
    seek(time);
    selectLayer(l.id);
    canvas.setPointerCapture(e.pointerId);
    drag = {
      pointer: e.pointerId,
      origin: p,
      base: evaluateLayer(l, time),
      startX: e.clientX,
      startY: e.clientY,
      doc: structuredClone(doc),
      id: l.id,
      clip,
      time,
      delta: null,
    };
  });
  canvas.addEventListener("pointermove", e => {
    if (!drag || drag.pointer !== e.pointerId) return;
    if (
      !drag.delta &&
      Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 3
    )
      return;
    const p = canvasPoint(e),
      l = drag.doc.layers.find(l => l.id === drag.id);
    drag.delta = {
      x: round(clamp(drag.base.x + p.x - drag.origin.x, -2160, 2700)),
      y: round(clamp(drag.base.y + p.y - drag.origin.y, -3840, 4800)),
    };
    const at = editPosition(l, drag.delta, drag.time, drag.clip, channel);
    drawFrame(
      canvas,
      { clips: [{ ...drag.clip, composition: drag.doc }] },
      at - drag.clip.trim,
      getState().media
    );
    updateResizeOverlay(l, evaluateLayer(l, at));
  });
  canvas.addEventListener("pointerup", e => {
    if (!drag || drag.pointer !== e.pointerId) return;
    const { delta, time, clip } = drag;
    drag = null;
    if (delta) {
      let at = time;
      editLayer(l => { at = editPosition(l, delta, time, clip, channel); });
      if (at !== time) seek(at);
    }
  });
  canvas.addEventListener("pointercancel", () => {
    if (drag) {
      drag = null;
      seek(current().time);
    }
  });
  function removeSelectedLayer() {
    if (drag || resizeGesture || timingDrag) return false;
    const focusInLibrary = library.contains(document.activeElement);
    if (!removeLayer(selectedId)) return false;
    if (focusInLibrary) focusLibrarySelection();
    return true;
  }
  function setTimelineView(options) {
    if (options.channel && !Object.hasOwn(keyChannels,options.channel)) throw Error("Canal desconhecido.");
    if (options.keyTime !== undefined) {
      const {layer} = current();
      const key = timelineKeys(layer,options.channel ?? channel).find(k=>Math.abs(k.t-options.keyTime)<1e-6);
      if (!key) throw Error("Keyframe ausente.");
      activeKey=key.t;
      seek(layer.start+key.t);
    } else if (options.channel && options.channel !== channel) activeKey=null;
    if (options.channel) channel=options.channel;
    if (options.snap!==undefined) snapAnimation=options.snap;
    if (options.curves!==undefined) curvesOpen=options.curves;
    render();
  }
  return { render, setTime, leave, updateResizeOverlay, removeSelectedLayer, selectedLayer: () => selectedId, selectLayer,
    timelineView:()=>({channel,snap:snapAnimation,curves:curvesOpen,keyTime:activeKey}),setTimelineView };
}
