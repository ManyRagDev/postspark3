import { speechCommands, interpretSpeechRequest } from "./speech-commands.js";
import { prepareSpeech } from "./speech-plan.js";
import { editPosition, editScale, setValue } from "./layer-transform.js";
import { linkedScale, resizeLayer } from "./layer-resize.js";
import {
  CHANNELS,
  EASINGS,
  assertComposition,
  evaluateLayer,
  newComposition,
  newLayer,
  setKey,
} from "./composition-model.js";
import { canSplitAt, insertCompositionAt, splitClip, validateProject } from "./project-model.js";
import { FPS, defaultTransitionFrames, durationOf, transitionPack } from "./montage-model.js";
import {
  animationTemplates,
  buildAnimationTemplate,
  setTemplateControl,
  templateControls,
} from "./animation-templates.js";
import { narrationPlacement } from "./narration.js";
import { applySpeechEdit, captionCues, rewriteCue } from "./speech-model.js";
import { IMAGE_LAYOUTS, arrangeImages } from "./image-layouts.js";

const error = message => {
  throw Error(message);
};
const one = (items, id) => items?.find(item => item.id === id) ?? error("Alvo ausente: " + id);
const source = (p, a) => one(p.compositions, a.compositionId);
const documentOf = (p, a) => source(p, a).document ?? error("Escolha uma composição de camadas.");
const layerOf = (p, a) => one(documentOf(p, a).layers, a.layerId);
const lane = (p, a) => (a.trackId ? one(p.extraTracks, a.trackId).clips : p.clips);
const clipOf = (p, a) => one(lane(p, a), a.clipId);
const number = (n, min, max = Infinity) => {
  if (!Number.isFinite(n) || n < min || n > max) error("Valor fora do intervalo permitido.");
  return n;
};
const nameOf = n => (typeof n === "string" && n.trim() && n.length <= 256 ? n : error("Nome inválido."));
const unique = (items, id) => {
  if (typeof id !== "string" || !id || items.some(item => item.id === id))
    error("Identificador inválido ou repetido.");
  return id;
};
function move(items, item, index) {
  if (!Number.isInteger(index)) error("O índice precisa ser inteiro.");
  number(index, 0, items.length - 1);
  items.splice(items.indexOf(item), 1);
  items.splice(index, 0, item);
}
function assignFields(target, fields, allowed) {
  if (
    !fields ||
    typeof fields !== "object" ||
    Array.isArray(fields) ||
    !Object.keys(fields).length ||
    Object.keys(fields).some(k => !allowed.includes(k))
  )
    error("Propriedade de edição inválida.");
  Object.assign(target, structuredClone(fields));
}
const layerFields = [
  "name",
  "text",
  "width",
  "height",
  "fontSize","fontFamily","fontWeight","italic","align",
  "color",
  "start",
  "end",
  "wrap",
  "lockAspectRatio",
  "fit",
  "revealFrom",
  "outline",
  "wave",
];
export function editLayerFields(layer, fields) {
  assignFields(layer, fields, layerFields);
  if (Object.hasOwn(fields, "text") && layer.type !== "text") error("Escolha uma camada de texto.");
}
export function setTransition(clips, clipId, fromId, type, frames) {
  const clip = one(clips, clipId),
    previous = clips[clips.indexOf(clip) - 1];
  if (!previous || previous.id !== fromId) error("O corte entre os dois clipes mudou.");
  if (type === null) {
    delete clip.transitionIn;
    return;
  }
  const limit = Math.min(60, 2 * Math.floor((Math.min(clip.duration, previous.duration) * FPS) / 2 + 1e-8));
  if (frames === undefined) frames = Math.min(limit, defaultTransitionFrames(type));
  if (
    !Object.hasOwn(transitionPack, type) ||
    !Number.isInteger(frames) ||
    frames % 2 ||
    frames < 2 ||
    frames > limit
  )
    error("Preset ou duração incompatível com o corte.");
  clip.transitionIn = { from: fromId, type, frames };
}
export function shortenClips(clips, duration) {
  const total = clips.reduce((n, c) => n + c.duration, 0);
  if (clips.length < 2 || !Number.isFinite(duration) || duration <= 0 || duration >= total)
    error("Escolha dois ou mais clipes e uma duração menor que a atual.");
  const lengths = clips.map(c => (c.duration * duration) / total);
  if (lengths.some(n => n < 0.1)) error("Cada clipe precisa manter ao menos 0,1 s.");
  clips.forEach((c, i) => {
    c.duration = lengths[i];
  });
}
function keysOf(p, a) {
  if (!CHANNELS.includes(a.channel)) error("Canal de animação inválido.");
  return layerOf(p, a).keys[a.channel];
}
function keyAt(keys, time) {
  return keys.find(k => Math.abs(k.t - time) <= 1e-6) ?? error("O keyframe mudou.");
}
const comp = { compositionId: "ID da composição" };
const layer = { ...comp, layerId: "ID da camada nessa composição" };
const clip = { clipId: "ID do clipe" };
const track = { trackId: "ID da pista adicional" };
const optionalTrack = { "trackId?": "ID da pista adicional, omitir para a principal" };
const key = { ...layer, channel: CHANNELS.join(" | "), time: "segundos locais da camada" };
const seconds = "segundos";
const ops = new Map();
function define(id, manual, params, apply) {
  ops.set(id, { id, manual, params, apply });
}

define("project.rename", "Renomear projeto", { name: "texto" }, (p, a) => {
  p.name = nameOf(a.name);
});
define(
  "composition.create",
  "Criar composição ou usar modelo",
  {
    ...comp,
    name: "texto",
    duration: seconds,
    "template?": "ID do modelo",
    "images?": "mapa de imagem do modelo para referência disponível",
  },
  (p, a, assets) => {
    const tpl = a.template && one(animationTemplates, a.template);
    const images = new Map(
      (tpl?.sources ?? []).map(file => [file, assets.image(a.images?.[file] ?? "template/" + file).src])
    );
    const doc = tpl ? buildAnimationTemplate(tpl, images) : newComposition();
    p.compositions.push({
      id: unique(p.compositions, a.compositionId),
      name: nameOf(a.name),
      duration: number(a.duration, 1 / FPS, 86400),
      kind: "composition",
      document: doc,
    });
  }
);
define("composition.rename", "Renomear animação", { ...comp, name: "texto" }, (p, a) => {
  source(p, a).name = nameOf(a.name);
});
define("composition.duration", "Duração da composição", { ...comp, duration: seconds }, (p, a) => {
  source(p, a).duration = number(a.duration, 1 / FPS, 86400);
});
define(
  "composition.duplicate",
  "Duplicar composição",
  { ...comp, newId: "ID da cópia", "clipId?": "clipe a revincular" },
  (p, a) => {
    const original = source(p, a),
      id = unique(p.compositions, a.newId);
    const baseName = original.name + " (cópia)";
    let name = baseName;
    for (let i = 2; p.compositions.some(c => c.name === name); i++) name = baseName + " " + i;
    const copy = { ...structuredClone(original), id, name };
    if (a.clipId) {
      const clip = clipOf(p, a);
      if (clip.compositionId !== original.id) error("O clipe usa outra composição.");
      clip.compositionId = id;
    }
    p.compositions.push(copy);
  }
);
define(
  "composition.insert",
  "Adicionar à montagem",
  { ...comp, clipId: "ID do novo clipe", time: "segundos na montagem" },
  (p, a) => {
    unique(p.clips, a.clipId);
    const { clip } = insertCompositionAt(p.clips, source(p, a), number(a.time, 0));
    clip.id = a.clipId;
  }
);
define(
  "composition.apply",
  "Aplicar documento da Animação",
  { ...comp, document: "documento completo da composição de camadas" },
  (p, a) => {
    if (!source(p, a).document) error("Escolha uma composição de camadas.");
    source(p, a).document = assertComposition(a.document);
  }
);
define("composition.background", "Cor de fundo", { ...comp, color: "#RRGGBB ou transparent" }, (p, a) => {
  documentOf(p, a).background = a.color;
});
define(
  "composition.wave",
  "Ajustes e chaves da onda",
  { ...comp, fields: "title, color, speed, amplitude, entry, keys" },
  (p, a) => {
    assignFields(source(p, a).scene ?? error("Escolha uma cena de onda."), a.fields, [
      "title",
      "color",
      "speed",
      "amplitude",
      "entry",
      "keys",
    ]);
  }
);
define(
  "template.set",
  "Controles do modelo",
  { ...comp, index: "índice do controle", value: "valor ou referência de imagem" },
  (p, a, assets) => {
    const doc = documentOf(p, a),
      field = templateControls(doc).find(f => f.index === a.index);
    if (!field) error("Controle de modelo ausente.");
    setTemplateControl(doc, a.index, field.type === "file" ? assets.image(a.value).src : a.value);
  }
);
define(
  "layer.add",
  "Adicionar camada",
  {
    ...layer,
    type: "tipo da biblioteca",
    "fields?": layerFields.join(", "),
    "image?": "referência de imagem disponível",
  },
  (p, a, assets) => {
    const doc = documentOf(p, a);
    const l = newLayer(a.type, source(p, a).duration, { id: unique(doc.layers, a.layerId) });
    if (a.type === "image") Object.assign(l, assets.image(a.image), { id: a.layerId });
    if (a.fields) editLayerFields(l, a.fields);
    doc.layers.push(l);
  }
);
define(
  "layer.image",
  "Substituir imagem",
  { ...layer, image: "referência de imagem disponível" },
  (p, a, assets) => {
    const l = layerOf(p, a);
    if (l.type !== "image") error("Escolha uma camada de imagem.");
    l.src = assets.image(a.image).src;
  }
);
define("layer.set", "Propriedades da camada", { ...layer, fields: layerFields.join(", ") }, (p, a) =>
  editLayerFields(layerOf(p, a), a.fields)
);
define("layer.pose", "Transformação base", { ...layer, fields: CHANNELS.join(", ") }, (p, a) =>
  assignFields(layerOf(p, a).props, a.fields, CHANNELS)
);
define(
  "layer.transform",
  "Transformar no marcador",
  {
    ...layer,
    time: "segundos na composição",
    channel: CHANNELS.join(" | "),
    value: "unidades do documento",
    "paired?": "posição X/Y conjunta ou escala proporcional",
  },
  (p, a) => {
    const c = source(p, a),
      l = layerOf(p, a),
      t = number(a.time, 0, c.duration);
    if (!CHANNELS.includes(a.channel) || !Number.isFinite(a.value)) error("Transformação inválida.");
    if (a.channel === "x" || a.channel === "y")
      editPosition(
        l,
        { [a.channel]: a.value },
        t,
        { trim: 0, duration: c.duration },
        a.paired === false ? a.channel : "position"
      );
    else if (["scaleX", "scaleY"].includes(a.channel) && (a.paired ?? l.lockAspectRatio !== false))
      editScale(l, linkedScale(evaluateLayer(l, t), a.channel, a.value), t, true);
    else setValue(l, a.channel, a.value, t);
  }
);
define(
  "layer.resize",
  "Redimensionar pela alça",
  {
    ...layer,
    time: seconds,
    corner: "{x,y} = -1 ou 1",
    delta: "{x,y} em unidades de desenho",
    "locked?": "preservar proporção",
  },
  (p, a) => {
    const l = layerOf(p, a),
      t = number(a.time, 0, source(p, a).duration),
      locked = a.locked ?? l.lockAspectRatio !== false;
    if (!["x", "y"].every(k => [-1, 1].includes(a.corner?.[k]) && Number.isFinite(a.delta?.[k])))
      error("Alça inválida.");
    const values = resizeLayer(l, evaluateLayer(l, t), a.corner, a.delta, locked);
    if ("width" in values) Object.assign(l, values, { wrap: true });
    else editScale(l, values, t, locked);
  }
);
define("layer.remove", "Excluir camada", layer, (p, a) => {
  const doc = documentOf(p, a);
  doc.layers.splice(doc.layers.indexOf(layerOf(p, a)), 1);
});
define("layer.order", "Ordem das camadas", { ...layer, index: "0 = fundo" }, (p, a) =>
  move(documentOf(p, a).layers, layerOf(p, a), a.index)
);
define(
  "layer.layout",
  "Layout de imagens",
  {
    ...comp,
    layerIds: "IDs na ordem desejada",
    layout: IMAGE_LAYOUTS.map(x => x.id).join(" | "),
    time: seconds,
  },
  (p, a) => {
    const doc = documentOf(p, a),
      layers = a.layerIds.map(id => one(doc.layers, id));
    if (
      new Set(layers).size !== layers.length ||
      layers.length < 2 ||
      layers.some(l => l.type !== "image") ||
      !IMAGE_LAYOUTS.some(x => x.id === a.layout)
    )
      error("Escolha imagens distintas e um layout válido.");
    const changed = arrangeImages(layers, a.layout, number(a.time, 0, source(p, a).duration));
    for (const l of changed) doc.layers[doc.layers.findIndex(item => item.id === l.id)] = l;
  }
);
define(
  "key.set",
  "Criar ou editar keyframe",
  { ...key, value: "valor no canal", ease: EASINGS.join(" | ") + " | [x1,y1,x2,y2]" },
  (p, a) => {
    const l = layerOf(p, a);
    setKey(l, a.channel, number(a.time, 0, l.end - l.start + 1e-7), a.value, a.ease);
  }
);
define("key.remove", "Remover keyframe", key, (p, a) => {
  const keys = keysOf(p, a);
  keys.splice(keys.indexOf(keyAt(keys, a.time)), 1);
});
define(
  "key.shift",
  "Mover keyframes preservando curvas",
  {
    ...layer,
    channel: CHANNELS.join(" | "),
    times: "tempos locais selecionados",
    delta: "deslocamento em segundos",
  },
  (p, a) => {
    const l = layerOf(p, a),
      keys = keysOf(p, a);
    const selected = new Set(a.times.map(t => keyAt(keys, t)));
    if (!selected.size || selected.size !== a.times.length) error("Seleção de keyframes inválida.");
    const times = keys.map(k => (selected.has(k) ? number(k.t + a.delta, 0, l.end - l.start + 1e-7) : k.t));
    if (times.some((t, i) => i && t - times[i - 1] <= 1e-6)) error("O deslocamento cruzaria outro keyframe.");
    keys.forEach((k, i) => {
      k.t = times[i];
    });
  }
);
define(
  "clip.set",
  "Ajustar clipe",
  { ...clip, ...optionalTrack, fields: "name, trim, duration, volume para vídeo/áudio e start nas pistas adicionais" },
  (p, a) => {
    const c = clipOf(p, a);
    assignFields(
      c,
      a.fields,
      a.trackId ? ["name", "trim", "duration", "start", "volume"] : c.kind === "video" ? ["name", "trim", "duration", "volume"] : ["name", "trim", "duration"]
    );
    if (c.narration && c.start + c.duration > 60.000001) error("A narração ultrapassa 60 segundos.");
    if (c.sourceDuration && c.trim + c.duration > c.sourceDuration + 1e-6)
      error("O recorte ultrapassa a mídia de origem.");
  }
);
define(
  "clip.split",
  "Dividir clipe",
  { ...clip, offset: "segundos desde o início do clipe", newId: "ID do trecho direito" },
  (p, a) => {
    const c = clipOf(p, a);
    if (!canSplitAt(c, a.offset)) error("Escolha um ponto no interior do clipe.");
    splitClip(p.clips, p.clips.indexOf(c), a.offset, unique(p.clips, a.newId));
  }
);
define("clip.order", "Mover clipe na montagem", { ...clip, index: "posição a partir de 0" }, (p, a) =>
  move(p.clips, clipOf(p, a), a.index)
);
define("clip.remove", "Excluir clipe", { ...clip, ...optionalTrack }, (p, a) => {
  const clips = lane(p, a);
  clips.splice(clips.indexOf(clipOf(p, a)), 1);
});
define("clip.duplicate", "Duplicar clipe", { ...clip, newId: "ID do novo clipe" }, (p, a) => {
  const c = clipOf(p, a),
    copy = { ...structuredClone(c), id: unique(p.clips, a.newId) };
  delete copy.transitionIn;
  p.clips.splice(p.clips.indexOf(c) + 1, 0, copy);
});
define(
  "clips.shorten",
  "Encurtar seleção",
  { clipIds: "IDs distintos da pista principal", duration: "duração total em segundos" },
  (p, a) => {
    const clips = a.clipIds.map(id => one(p.clips, id));
    if (clips.length !== new Set(clips).size) error("Clipe repetido.");
    shortenClips(clips, a.duration);
  }
);
define(
  "transition.set",
  "Aplicar ou remover transição",
  { ...clip, fromId: "ID do clipe anterior", type: "preset ou null", "frames?": "número par de 2 a 60" },
  (p, a) => setTransition(p.clips, a.clipId, a.fromId, a.type, a.frames)
);
define("track.add", "Adicionar pista", { ...track, kind: "video | audio" }, (p, a) => {
  (p.extraTracks ??= []).push({ id: unique(p.extraTracks, a.trackId), kind: a.kind, clips: [] });
});
define("track.remove", "Excluir pista", track, (p, a) => {
  const t = one(p.extraTracks, a.trackId);
  p.extraTracks.splice(p.extraTracks.indexOf(t), 1);
});
define(
  "media.insert",
  "Inserir mídia",
  { ...clip, ...optionalTrack, asset: "referência disponível", "start?": "posição na pista adicional" },
  (p, a, assets) => {
    const t = a.trackId ? one(p.extraTracks, a.trackId) : null;
    const asset = assets.media(a.asset, t?.kind ?? "video");
    const c = {
      assetId: asset.assetId,
      name: asset.name,
      sourceDuration: asset.duration,
      trim: 0,
      duration: asset.duration,
      id: unique(lane(p, a), a.clipId),
    };
    if (t) {
      c.start = number(a.start, 0);
      const next = t.clips.filter(other => other.start > c.start).sort((x, y) => x.start - y.start)[0];
      if (next) c.duration = Math.min(c.duration, next.start - c.start);
      if (c.duration < 1 / FPS) error("Intervalo insuficiente na pista.");
      t.clips.push(c);
    } else p.clips.push({ ...c, kind: "video" });
  }
);
define(
  "sound.set",
  "Ajustar trilha",
  { "asset?": "referência de áudio", "volume?": "0 a 1", "enabled?": "booleano" },
  (p, a, assets) => {
    if (a.asset) {
      const { assetId, name, duration } = assets.media(a.asset, "audio");
      Object.assign(p.sound, { assetId, name, duration });
    }
    if (a.volume !== undefined) p.sound.volume = number(a.volume, 0, 1);
    if (a.enabled !== undefined) p.sound.enabled = a.enabled;
  }
);
define(
  "narration.place",
  "Inserir ou substituir narração",
  {
    asset: "tomada de áudio importada",
    start: seconds,
    text: "roteiro",
    model: "modelo",
    voice: "voz",
    "trackId?": "pista original",
    "clipId?": "tomada original",
  },
  (p, a, assets) => {
    const media = assets.media(a.asset, "audio");
    const previousTrack = a.trackId ? one(p.extraTracks, a.trackId) : null;
    const previousClip = a.clipId ? one(previousTrack?.clips, a.clipId) : null;
    const target = narrationPlacement(p, a.start, media.duration, previousTrack, previousClip);
    const track = target ?? { kind: "audio", id: crypto.randomUUID(), clips: [] };
    if (!target) (p.extraTracks ??= []).push(track);
    const fields = {
      assetId: media.assetId,
      name: "Narração · " + a.text.slice(0, 48),
      duration: media.duration,
      sourceDuration: media.duration,
      trim: 0,
      start: a.start,
      narration: { text: a.text, model: a.model, voice: a.voice },
    };
    if (previousClip) Object.assign(previousClip, fields);
    else track.clips.push({ ...fields, id: crypto.randomUUID() });
  }
);
define(
  "speech.caption",
  "Corrigir texto da legenda",
  { ...clip, start: "início da legenda no tempo da fonte", text: "texto corrigido" },
  (p, a) => {
    const c = clipOf(p, a);
    if (!c.talk?.speech || typeof a.text !== "string" || !a.text.trim())
      error("Selecione uma legenda existente.");
    const cue = captionCues(c.talk.speech, c.trim, c.duration).find(
      cue => Math.abs(cue.start - a.start) < 1e-6
    );
    if (!cue) error("A legenda mudou.");
    c.talk.speech = rewriteCue(c.talk.speech, cue, a.text);
  }
);
define(
  "speech.apply",
  "Aplicar edição de vídeo falado",
  {
    ...clip,
    talk: "ajustes e análise do clipe",
    cuts: "intervalos revisados na fonte",
    ripple: "deslocar pistas adicionais",
  },
  (p, a) => {
    const c = clipOf(p, a);
    if (
      c.kind !== "video" ||
      typeof a.ripple !== "boolean" ||
      !Array.isArray(a.cuts) ||
      a.cuts.some(
        (pair, i) =>
          !Array.isArray(pair) ||
          pair.length !== 2 ||
          !pair.every(Number.isFinite) ||
          pair[0] < c.trim - 1e-6 ||
          pair[1] > c.trim + c.duration + 1e-6 ||
          pair[1] <= pair[0] ||
          (i > 0 && pair[0] < a.cuts[i - 1][1])
      )
    )
      error("Cortes inválidos para este clipe.");
    Object.assign(p, applySpeechEdit(p, c, a.talk, a.cuts, a.ripple));
  }
);

const speechOptions = {
  ...clip,
  "analysisJob?": "ID do trabalho de análise deste clipe",
  "options?": "minimum, margin, fillers, manual, omitted, ripple",
};
function editSpeech(p, a, assets, actions) {
  const c = clipOf(p, a);
  if (c.kind !== "video") error("Escolha um vídeo.");
  const analysis = a.analysisJob ? assets.analysis(a.analysisJob, c) : undefined;
  const { talk, cuts, ripple } = prepareSpeech(c, actions, a.options, analysis);
  Object.assign(p, applySpeechEdit(p, c, talk, cuts, ripple));
}
define(
  "speech.edit",
  "Interpretar pedido de vídeo falado",
  { ...speechOptions, request: "pedido em português" },
  (p, a, assets) => editSpeech(p, a, assets, interpretSpeechRequest(a.request))
);
const speechParams = {
  captions: { label: "Gerar legendas", params: { "style?": "off | classic | highlight" } },
  pauses: { label: "Encurtar pausas", params: { "minimum?": "segundos" } },
  fillers: { label: "Remover hesitações", params: {} },
  phrase: { label: "Cortar frase", params: { phrase: "texto literal" } },
  excerpt: { label: "Sugerir trecho", params: { "target?": "segundos" } },
  look: {
    label: "Estilizar vídeo falado",
    params: {
      "background?": "original | blur | solid | gradient | image",
      "image?": "referência de imagem",
      "color?": "#RRGGBB",
      "title?": "texto",
      "titleY?": "0.12 a 0.8",
      "exposure?": "-1 a 1",
      "accent?": "#RRGGBB",
    },
  },
};
for (const [key, id] of Object.entries(speechCommands)) {
  const { label, params } = speechParams[key];
  define(id, label, { ...speechOptions, ...params }, (p, a, assets) => {
    const { id, clipId, analysisJob, options, ...values } = a;
    if (values.image) {
      const { name, src } = assets.image(values.image);
      values.image = { name, src };
    }
    editSpeech(p, a, assets, [{ id, params: values }]);
  });
}

export function commandCatalog() {
  return [...ops.values()].map(({ id, manual, params }) => ({ id, manual, params: { ...params } }));
}
export function prepareBatch(project, commands, assets) {
  if (!Array.isArray(commands) || !commands.length || commands.length > 512)
    error("Use de 1 a 512 comandos por edição.");
  const draft = structuredClone(project);
  for (const command of commands) {
    const def = ops.get(command?.id);
    if (!def) error("Comando desconhecido: " + command?.id);
    const params = Object.keys(def.params);
    for (const k of Object.keys(command)) {
      if (k !== "id" && (k.endsWith("?") || (!params.includes(k) && !params.includes(k + "?"))))
        error("Opção desconhecida em " + def.id + ": " + k);
    }
    for (const k of params)
      if (!k.endsWith("?") && !Object.hasOwn(command, k)) error("Falta " + k + " em " + def.id);
    def.apply(draft, structuredClone(command), assets);
  }
  return validateProject(draft);
}

export function inspectProject(project, { compositionId, layerId, clipId, trackId, time = 0 } = {}) {
  if (clipId) {
    const c = clipOf(project, { clipId, trackId });
    const copy = structuredClone(c);
    if (copy.talk?.image) delete copy.talk.image.src;
    return { clip: copy, cues: c.talk?.speech ? captionCues(c.talk.speech, c.trim, c.duration) : [] };
  }
  if (trackId) return { track: structuredClone(one(project.extraTracks, trackId)) };
  if (compositionId) {
    const c = one(project.compositions, compositionId);
    const layers = layerId ? [one(c.document?.layers, layerId)] : c.document?.layers;
    return {
      id: c.id,
      name: c.name,
      duration: c.duration,
      uses: project.clips.filter(x => x.compositionId === c.id).map(x => x.id),
      scene: structuredClone(c.scene),
      background: c.document?.background,
      layers: layers?.map(({ src, ...l }) => ({
        ...structuredClone(l),
        pose: evaluateLayer(l, time),
        active: l.start <= time && time < l.end,
      })),
    };
  }
  let at = 0;
  return {
    name: project.name,
    duration: durationOf(project),
    fps: FPS,
    clips: project.clips.map(c => {
      const { talk, ...fields } = c,
        start = at;
      at += c.duration;
      return { ...structuredClone(fields), start, hasSpeech: Boolean(talk?.speech) };
    }),
    compositions: project.compositions.map(c => ({
      id: c.id,
      name: c.name,
      duration: c.duration,
      kind: c.kind,
      layers: c.document?.layers.map(({ id, name, type, text }) => ({
        id,
        name,
        type,
        ...(text ? { text } : {}),
      })),
    })),
    tracks: structuredClone(project.extraTracks ?? []),
    sound: { ...project.sound },
  };
}
