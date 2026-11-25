import assert from "node:assert/strict";
import {test} from "node:test";
import {narrationPlacement} from "../dist/narration.js";
import {validateTracks, voiceKey} from "../dist/montage-model.js";

const clip = {id: "one", start: 4, duration: 2, trim: 0, name: "Voz", assetId: "voice"};
const track = {kind: "audio", id: "a3", clips: [clip]};
const full = {clips: [], extraTracks: [track, {id: "v2", kind: "video", clips: []}]};
test("a fala cabe inteira, inclusive ao substituir a própria tomada", () => {
  assert.equal(narrationPlacement(full, 2, 2), track);
  assert.equal(narrationPlacement(full, 4, 3, track, clip), track);
  assert.throws(() => narrationPlacement(full, 2, 2.1), /intervalo livre/);
  assert.throws(() => narrationPlacement(full, 59, 1.1), /60 s/);
  assert.equal(narrationPlacement({...full, extraTracks: [track]}, 4, 3), null);
  assert.throws(() => narrationPlacement({...full, clips: Array(47)}, 0, 1), /48 clipes/);
});
test("tomadas recortadas da mesma mídia podem ter volumes independentes", () => {
  const take = {...clip, volume: .5, narration: {text: "Olá", model: "m", voice: "v"}};
  const next = {...take, id: "two", start: 6, volume: 0};
  validateTracks({clips: [], extraTracks: [{...track, clips: [take, next]}]});
  assert.notEqual(voiceKey(track, next), voiceKey(track, take));
  assert.throws(() => validateTracks({clips: [], extraTracks: [{...track, clips: [{...take, volume: 2}]}]}));
});
