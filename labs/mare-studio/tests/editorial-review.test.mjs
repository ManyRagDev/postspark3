import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewCommands, reviewEditorialCut } from "../dist/editorial-review.js";

const layer = {
  id: "cta",
  type: "text",
  text: "Visite",
  x: 270,
  y: 400,
  width: 300,
  height: 90,
  fontSize: 36,
  color: "#FFFFFF",
  startFrame: 0,
  endFrame: 60,
  lastKeyFrame: 8,
  motion: {
    y: [
      { t: 0, value: 420, ease: "linear" },
      { t: 8 / 30, value: 400, ease: "out" },
    ],
  },
};
const inv = {
  duration: 4,
  music: { enabled: true, volume: 0.3 },
  clips: [
    { id: "v", frames: 60, sourceFrames: 90, trimFrame: 0 },
    { id: "c", compositionId: "s", sourceFrames: 60, uses: 1, trimFrame: 0, frames: 60, layers: [layer] },
  ],
};
const review = corrections => ({ assessment: "Avaliação do corte.", corrections });
const item = (clipId, set, layerId) => ({
  at: 2.2,
  reason: "Janela de leitura curta.",
  clipId,
  layerId,
  set,
});
test("revisão localizada preserva texto, curva, duração total e último quadro do CTA", () => {
  const commands = reviewCommands(
    inv,
    review([item("c", { frames: 70 }), item("v", { frames: 50 }), item("c", { y: 430 }, "cta")]),
    "Visite"
  );
  assert.deepEqual(
    commands.filter(c => c.id === "key.set").map(c => [c.value, c.ease]),
    [
      [450, "linear"],
      [430, "out"],
    ]
  );
  assert.deepEqual(commands.find(c => c.id === "layer.set").fields, { end: 70 / 30 });
  for (const corrections of [
    [item("v", { frames: 61 })],
    [item("c", { endFrame: 59 }, "cta")],
    [item("c", { startFrame: 55 }, "cta")],
    [item("c", { text: "Mude" }, "cta")],
    [item("inexistente", { frames: 60 })],
  ])
    assert.throws(() => reviewCommands(inv, review(corrections), "Visite"));
});
test("parecer sem correções dispensa segundo render", async () => {
  const target = {
    inspect: () => ({ duration: 2, clips: [], sound: { enabled: false, volume: 0 } }),
    refine: () => assert.fail("Preparou corte redundante"),
  };
  const result = await reviewEditorialCut({
    target,
    brief: "B",
    cta: "",
    movie: new Blob(),
    signal: new AbortController().signal,
    check: () => {},
    infer: async () => ({ output: review([]), model: "teste", usage: { cost: null } }),
  });
  assert.equal(result.changed, false);
  assert.equal(result.trace.renderMs, 0);
});
