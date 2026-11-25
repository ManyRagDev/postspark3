import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { overlayFrameIndex, transitionAt, transitionFrames, transitionPack, validateTracks } from "../dist/montage-model.js";

test("a demonstração cobre todos os efeitos nativos e as duas metades de cada corte", async () => {
  const file = await readFile(new URL("../dist/assets/mare-transicoes.mare", import.meta.url));
  const {project} = JSON.parse(file.subarray(16, 16 + file.readUInt32BE(12)));
  validateTracks(project);
  const {clips} = project;
  const native = Object.keys(transitionPack).filter(type => !transitionPack[type].overlay);
  assert.deepEqual(clips.slice(1).map(c => c.transitionIn.type), native);
  for (let i = 1; i < clips.length; i++) {
    const from = clips[i - 1], to = clips[i];
    const half = transitionFrames(from, to) / 60;
    const entering = transitionAt(clips, i, 0);
    assert.equal(entering.from, from);
    assert.equal(entering.to, to);
    assert.equal(entering.progress, .5);
    assert.equal(entering.incomingTime, to.trim);
    assert.equal(entering.outgoingTime, from.trim + from.duration);
    assert.ok(Math.abs(transitionAt(clips, i-1, from.duration-half/2).progress-.25) < 1e-8);
    assert.ok(Math.abs(transitionAt(clips, i, half/2).progress-.75) < 1e-8);
  }
  assert.equal(transitionAt([clips[0], clips[2]], 1, 0), null);
});

test("a duração de uma sobreposição mantém o clarão ou a cobertura no quadro do corte", () => {
  const film = transitionPack.film_burn_3.overlay;
  assert.deepEqual(Array.from({length: 8}, (_, i) => overlayFrameIndex(film, i, 8)), [0, 2, 4, 6, 7, 8, 10, 11]);
  assert.deepEqual([0, 1].map(i => overlayFrameIndex(film, i, 2)), [0, 7]);
  const paper = transitionPack.torn_paper_5.overlay;
  assert.deepEqual(Array.from({length: 8}, (_, i) => overlayFrameIndex(paper, i, 8)), [0, 4, 9, 13, 13, 9, 4, 0]);
  const clips = [
    { id: "left", duration: .5, trim: 0 },
    { id: "right", duration: 1, trim: 0, transitionIn: {from: "left", type: "torn_paper_5", frames: 60} },
  ];
  const mix = transitionAt(clips, 1, 0);
  assert.equal(mix.frames, 14);
  assert.equal(overlayFrameIndex(paper, mix.progress * mix.frames, mix.frames), 13);
});
