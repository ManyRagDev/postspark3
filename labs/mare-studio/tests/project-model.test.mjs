import assert from "node:assert/strict";
import { test } from "node:test";
import { newComposition, newLayer } from "../dist/composition-model.js";
import {
  compositionForClip, compositionImages, insertCompositionAt, normalizeProject,
  requiredCompositionDuration, sourceClip, splitClip, timeInComposition, validateProject,
} from "../dist/project-model.js";

const sound = {enabled: false, assetId: null, volume: 0};
const video = (id, duration = 4) => ({id, name: id, kind: "video", assetId: "coast", duration, trim: 0});
const entry = {id: "abertura", name: "Abertura", kind: "composition", document: newComposition(), duration: 4};

test("a migração preserva cópias embutidas e a onda que já era compartilhada", () => {
  const scene = {title: "Maré alta", color: "#ff693e", speed: 1, amplitude: 1, entry: .65, keys: []};
  const clip = {kind: "scene", name: "Abertura", duration: 3, trim: .5};
  const legacy = {sound, scene, clips: [
    {...clip, id: "wave-1"}, {...clip, id: "wave-2", duration: 4},
    {...clip, id: "a", composition: entry.document}, {...clip, id: "b", composition: entry.document},
  ]};
  const project = normalizeProject(legacy);
  assert.equal(project.compositions.length, 3);
  const [wave1, wave2, a, b] = project.clips;
  assert.equal(compositionForClip(project, wave1), compositionForClip(project, wave2));
  assert.equal(compositionForClip(project, wave1).duration, 4.5);
  assert.notEqual(compositionForClip(project, a), compositionForClip(project, b));
  compositionForClip(project, a).document.background = "#ffffff";
  assert.equal(compositionForClip(project, b).document.background, "#14151a");
  assert.equal(legacy.clips[2].composition.background, "#14151a");
  assert.deepEqual(project.clips.map(c => [c.id, c.trim, c.duration]), legacy.clips.map(c => [c.id, c.trim, c.duration]));
});

test("compartilhar a composição preserva os recortes e protege o trecho usado", () => {
  const project = {
    sound, compositions: [structuredClone(entry)],
    clips: [video("intro"), {...sourceClip(entry, "a"), duration: 2.4, trim: .5}, sourceClip(entry, "b")],
  };
  assert.equal(timeInComposition(project.clips[1], 4, 5), 1.5);
  assert.equal(timeInComposition(project.clips[1], 4, 8.1), .5);
  const right = splitClip(project.clips, 1, 1.4, "right");
  assert.equal(right.compositionId, "abertura");
  assert.equal(requiredCompositionDuration(project, "abertura"), 4);
  compositionForClip(project, right).document.background = "#ffffff";
  assert.equal(compositionForClip(project, project.clips.at(-1)).document.background, "#ffffff");
  assert.equal(validateProject(project), project);
  project.compositions[0].duration = 3;
  assert.throws(() => validateProject(project), /trecho usado/);
});

test("inserir no marcador divide a mídia e retém a transição depois do trecho original", () => {
  const next = {...video("desfecho"), transitionIn: {from: "intro", type: "dip_to_white", frames: 8}};
  const clips = [video("intro"), next];
  const {clip, time} = insertCompositionAt(clips, entry, 2);
  assert.equal(time, 2);
  assert.equal(clips[1], clip);
  assert.equal(clips[2].trim, 2);
  assert.equal(next.transitionIn.from, clips[2].id);
  assert.deepEqual(clips.map(c => c.duration), [2, 4, 2, 4]);
});

test("é possível guardar uma composição com imagem antes de criar uma montagem", () => {
  const still = newLayer("image", 4, {
    src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAA==",
  });
  const project = {sound, clips: [], compositions: [{...entry, document: {...newComposition(), layers: [still]}}]};
  assert.equal(validateProject(project), project);
  assert.deepEqual([...compositionImages(project)], [still]);
  assert.deepEqual([...compositionImages(project, true)], []);
});

test("uma Bézier na biblioteca escolhe o formato 3 mesmo fora da montagem", async () => {
  const {packProject, unpackProject} = await import("../dist/engine.js");
  const project = {sound, clips: [], compositions: [structuredClone(entry)]};
  const square = newLayer("square", 4);
  project.compositions[0].document.layers.push(square);
  const key = {t: 1.3, value: 800, ease: "inOut"};
  square.keys.y.push(key);
  for (const [version, ease] of [[2, "inOut"], [3, [.18, -.3, .89, 1.6]]]) {
    key.ease = ease;
    const portable = await packProject(project);
    assert.equal(await portable.slice(0, 12).text(), "MARESTUDIO" + version + "\n");
    const restored = await unpackProject(portable);
    assert.deepEqual(restored.compositions, project.compositions);
    assert.deepEqual(restored.clips, []);
  }
});
