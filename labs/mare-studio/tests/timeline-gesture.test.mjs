import assert from "node:assert/strict";
import {test} from "node:test";
import {Window} from "happy-dom";
import {mountTimeline} from "../dist/timeline.js";

test("soltar outro dedo mantém o arrasto original e soltar o dono termina o gesto", async t => {
  const window = new Window();
  Object.assign(globalThis, {document: window.document, ResizeObserver: window.ResizeObserver});
  t.after(async () => {
    delete globalThis.document;
    delete globalThis.ResizeObserver;
    await window.happyDOM.close();
  });
  const root = window.document.body;
  const times = [];
  const timeline = mountTimeline(root, {onSeek(at) { times.push(at); timeline.setTime(at); }});
  timeline.update({clips: [{id: "v", name: "Vídeo", kind: "video", assetId: "coast", trim: 0, duration: 10}]}, 0, "v");
  const ruler = root.querySelector(".mlt-ruler");
  root.querySelector(".mlt-body").getBoundingClientRect = () => ({left: 0, width: 100});
  ruler.setPointerCapture = () => {};
  function touch(type, pointerId, clientX) {
    ruler.dispatchEvent(new window.PointerEvent(type, {pointerId, clientX, isPrimary: pointerId === 1, button: 0}));
  }
  touch("pointerdown", 1, 20);
  touch("pointerdown", 2, 80);
  touch("lostpointercapture", 2, 80);
  touch("pointermove", 1, 30);
  touch("pointerup", 1, 40);
  touch("pointermove", 1, 50);
  assert.deepEqual(times, [2, 3, 4]);
  timeline.destroy();
});

test("o duplo clique na pista extra consulta o encaixe vigente antes e depois de desligá-lo", async t => {
  const window = new Window();
  Object.assign(globalThis, {document: window.document, ResizeObserver: window.ResizeObserver});
  t.after(async () => {
    delete globalThis.document;
    delete globalThis.ResizeObserver;
    await window.happyDOM.close();
  });
  const root = window.document.body, times = [];
  const timeline = mountTimeline(root, {
    onSeek(at) { times.push(at); timeline.setTime(at); }, onTrackEdit() {},
  });
  const clip = {id: "one", name: "Vídeo", kind: "video", assetId: "coast", trim: 0, duration: 1.12345};
  timeline.update({clips: [clip, {...clip, id: "two", duration: 2 - clip.duration}],
    extraTracks: [{id: "extra", kind: "video", clips: []}]}, 0, "one");
  root.querySelector(".mlt-body").getBoundingClientRect = () => ({left: 0, width: 200});
  const row = root.querySelector('[data-lane="extra"].lane-row');
  const snap = root.querySelector('[aria-label="Encaixar o marcador nas bordas dos clipes"]');
  function seek() { row.dispatchEvent(new window.MouseEvent("dblclick", {clientX: 113})); }
  seek();
  snap.click();
  seek();
  snap.click();
  seek();
  assert.deepEqual(times, [34 / 30, clip.duration, 34 / 30]);
  timeline.destroy();
});
