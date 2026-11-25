// Every durable command has a manual operation label, discoverable options and
// an observable document-level expectation. Browser journeys cover the UI boundary.
import test from "node:test";
import assert from "node:assert/strict";
import { commandCatalog, prepareBatch } from "../dist/editor-commands.js";
import { newComposition, newLayer, setKey } from "../dist/composition-model.js";
import { animationTemplates, buildAnimationTemplate } from "../dist/animation-templates.js";
import { TALK_DEFAULTS, captionCues } from "../dist/speech-model.js";
import { sourceClip } from "../dist/project-model.js";
import { readFileSync } from "node:fs";

const src = name =>
  "data:image/png;base64," +
  readFileSync(new URL("../dist/assets/" + name, import.meta.url)).toString("base64");
const first = src("catalog-avatar.png"),
  second = src("catalog-product.png");
const assets = {
  image: () => ({ name: "Produto", width: 100, height: 120, src: second }),
  media: () => ({ name: "Tomada", assetId: "som", duration: 2 }),
};
const source = "scene",
  comp = { compositionId: source },
  layer = { ...comp, layerId: "title" },
  clip = { clipId: "video" };
function fixture() {
  const doc = newComposition(),
    title = newLayer("text", 4, { id: "title", text: "Olá" });
  setKey(title, "x", 0, 100);
  setKey(title, "x", 1, 130);
  doc.layers = [title, ...["a", "b"].map(id => newLayer("image", 4, { id, src: first }))];
  const c = { id: source, name: "Fonte", kind: "composition", document: doc, duration: 4 };
  const words = [
    ["Oi", 0.2, 0.6],
    ["ahn", 0.8, 1.3],
    ["mundo.", 1.6, 2],
    ["Descubra", 6, 6.5],
    ["como", 8, 8.5],
    ["agora!", 10, 10.5],
  ].map(([text, start, end]) => ({ text, start, end }));
  const video = {
    ...clip,
    id: "video",
    kind: "video",
    assetId: "v",
    sourceDuration: 12,
    trim: 0,
    duration: 12,
    name: "Fala",
    talk: {
      ...TALK_DEFAULTS,
      speech: {
        start: 0,
        end: 12,
        language: "pt",
        words,
        voices: [
          [0.1, 2.1],
          [5.9, 10.6],
        ],
      },
    },
  };
  return {
    name: "Projeto",
    sound: { enabled: true, volume: 0.5 },
    clips: [video, sourceClip(c, "last")],
    extraTracks: [{ id: "lane", kind: "audio", clips: [] }],
    compositions: [
      c,
      {
        id: "wave",
        name: "Onda",
        kind: "wave",
        duration: 4,
        scene: { title: "Maré", color: "#ffeeaa", speed: 1, amplitude: 1, entry: 0.5, keys: [] },
      },
      {
        id: "model",
        name: "Diálogo",
        kind: "composition",
        duration: 4,
        document: buildAnimationTemplate(animationTemplates.find(t => t.id === "dialogue")),
      },
    ],
  };
}
const l = q => q.compositions[0].document.layers[0];
const v = q => q.clips[0];
const cases = [];
const example = (id, args, read, expected) => cases.push({ id, args, read, expected });
example("project.rename", { name: "Novo" }, q => q.name, "Novo");
example(
  "composition.create",
  { compositionId: "new", name: "Novo", duration: 3 },
  q => q.compositions.at(-1).duration,
  3
);
example("composition.rename", { ...comp, name: "Arte" }, q => q.compositions[0].name, "Arte");
example("composition.duration", { ...comp, duration: 5 }, q => q.compositions[0].duration, 5);
example(
  "composition.duplicate",
  { ...comp, newId: "copy", clipId: "last" },
  q => [q.clips.at(-1).compositionId, q.compositions.at(-1).document.layers.length],
  ["copy", 3]
);
example(
  "composition.insert",
  { ...comp, time: 2, clipId: "part" },
  q => q.clips.map(c => [c.compositionId ?? null, c.trim, c.duration]),
  [
    [null, 0, 2],
    [source, 0, 4],
    [null, 2, 10],
    [source, 0, 4],
  ]
);
example(
  "composition.apply",
  { ...comp, document: newComposition("#aaaaaa") },
  q => q.compositions[0].document,
  newComposition("#aaaaaa")
);
example(
  "composition.background",
  { ...comp, color: "#123456" },
  q => q.compositions[0].document.background,
  "#123456"
);
example(
  "composition.wave",
  { compositionId: "wave", fields: { title: "Oceano", speed: 2 } },
  q => q.compositions[1].scene.title,
  "Oceano"
);
example(
  "template.set",
  { compositionId: "model", index: 0, value: "Exemplo" },
  q => q.compositions[2].document.layers.find(l => l.id === "speech").text,
  "Exemplo"
);
example(
  "layer.add",
  { ...comp, layerId: "n", type: "circle", fields: { color: "#123456" } },
  q => q.compositions[0].document.layers.at(-1).color,
  "#123456"
);
example(
  "layer.image",
  { ...comp, layerId: "a", image: "produto" },
  q => q.compositions[0].document.layers[1].src === second,
  true
);
example(
  "layer.set",
  { ...layer, fields: { text: "Novo", fontSize: 33, wrap: true } },
  q => [l(q).text, l(q).fontSize, l(q).wrap],
  ["Novo", 33, true]
);
example("layer.pose", { ...layer, fields: { opacity: 0.4 } }, q => l(q).props.opacity, 0.4);
example(
  "layer.transform",
  { ...layer, time: 0.5, channel: "y", value: 250 },
  q => [l(q).keys.x[1].t, l(q).keys.y[0].value],
  [0.5, 250]
);
example(
  "layer.resize",
  { ...layer, time: 0.5, corner: { x: 1, y: 1 }, delta: { x: 15, y: 10 }, locked: false },
  q => [l(q).width > 480, l(q).wrap],
  [true, true]
);
example("layer.remove", layer, q => q.compositions[0].document.layers.map(l => l.id), ["a", "b"]);
example("layer.order", { ...layer, index: 2 }, q => q.compositions[0].document.layers.map(l => l.id), [
  "a",
  "b",
  "title",
]);
example(
  "layer.layout",
  { ...comp, layerIds: ["a", "b"], layout: "fan", time: 1 },
  q => q.compositions[0].document.layers.slice(1).map(l => l.props.rotation),
  [-22, 22]
);
example(
  "key.set",
  { ...layer, channel: "x", time: 0.5, value: 120, ease: [0.2, 0.2, 0.8, 0.9] },
  q => l(q).keys.x[1],
  { t: 0.5, value: 120, ease: [0.2, 0.2, 0.8, 0.9] }
);
example("key.remove", { ...layer, channel: "x", time: 1 }, q => l(q).keys.x.map(k => k.t), [0]);
example("key.shift", { ...layer, channel: "x", times: [1], delta: 0.2 }, q => l(q).keys.x[1].t, 1.2);
example("clip.set", { ...clip, fields: { trim: 2, duration: 6 } }, q => [v(q).trim, v(q).duration], [2, 6]);
example("clip.split", { ...clip, offset: 3, newId: "right" }, q => [v(q).duration, q.clips[1].trim], [3, 3]);
example("clip.order", { ...clip, index: 1 }, q => q.clips.map(c => c.id), ["last", "video"]);
example("clip.remove", clip, q => q.clips.map(c => c.id), ["last"]);
example("clip.duplicate", { ...clip, newId: "copy" }, q => q.clips.map(c => c.id), ["video", "copy", "last"]);
example(
  "clips.shorten",
  { clipIds: ["video", "last"], duration: 8 },
  q => q.clips.map(c => c.duration),
  [6, 2]
);
example(
  "transition.set",
  { clipId: "last", fromId: "video", type: "dip_to_black", frames: 12 },
  q => q.clips[1].transitionIn,
  { from: "video", type: "dip_to_black", frames: 12 }
);
example("track.add", { trackId: "overlay", kind: "video" }, q => q.extraTracks.at(-1).kind, "video");
example("track.remove", { trackId: "lane" }, q => q.extraTracks.length, 0);
example(
  "media.insert",
  { trackId: "lane", clipId: "bed", asset: "sound", start: 3 },
  q => q.extraTracks[0].clips[0].start,
  3
);
example("sound.set", { asset: "sound", volume: 0.3, enabled: true }, q => q.sound, {
  assetId: "som",
  name: "Tomada",
  duration: 2,
  enabled: true,
  volume: 0.3,
});
example(
  "narration.place",
  { asset: "sound", start: 0, text: "Narração", model: "m", voice: "v" },
  q => q.extraTracks[0].clips[0].narration,
  { text: "Narração", model: "m", voice: "v" }
);
example(
  "speech.caption",
  { ...clip, start: 0.2, text: "Bem-vindo" },
  q => captionCues(v(q).talk.speech, 0, 12)[0].text,
  "Bem-vindo"
);
example(
  "speech.apply",
  { ...clip, talk: { ...TALK_DEFAULTS }, cuts: [[3, 4]], ripple: false },
  q => q.clips.slice(0, 2).map(c => [c.trim, c.duration]),
  [
    [0, 3],
    [4, 8],
  ]
);
example("speech.edit", { ...clip, request: "Gere legendas simples" }, q => v(q).talk.captions, "classic");
example("montagem.gerarLegendas", { ...clip, style: "highlight" }, q => v(q).talk.captions, "highlight");
example("montagem.encurtarPausas", { ...clip, minimum: 2 }, q => v(q).duration < 3, true);
example(
  "montagem.removerHesitacoes",
  clip,
  q => q.clips.filter(c => c.kind === "video").map(c => c.trim),
  [0, 1.3]
);
example(
  "montagem.cortarFrase",
  { ...clip, phrase: "mundo" },
  q => q.clips.filter(c => c.kind === "video").map(c => c.trim),
  [0, 2]
);
example("montagem.sugerirTrecho", { ...clip, target: 5 }, q => v(q).trim > 0 && v(q).duration < 12, true);
example("montagem.estilizarVideoFalado", { ...clip, accent: "#123456" }, q => v(q).talk.accent, "#123456");

test("o inventário cobre cada comando de edição registrado", () =>
  assert.deepEqual(
    cases.map(c => c.id).sort(),
    commandCatalog()
      .map(c => c.id)
      .sort()
  ));
for (const { id, args, read, expected } of cases) {
  test(commandCatalog().find(c => c.id === id).manual + " · " + id, () => {
    const p = fixture(),
      before = structuredClone(p);
    const result = prepareBatch(p, [{ id, ...args }], assets);
    assert.deepEqual(read(result), expected);
    assert.deepEqual(p, before);
  });
}
