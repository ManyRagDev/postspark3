import assert from "node:assert/strict";
import { test } from "node:test";
import { compileDirection, restoreLiteralCta, validateScript } from "../dist/editorial-plan.js";

const assets = [
  { id: "img", kind: "image", name: "Cartão" },
  { id: "v", kind: "video", duration: 2 },
];
const shot = {
  name: "Demonstração",
  images: ["img"],
  copy: [],
  video: "v",
  frames: 60,
  evidence: "Gravação do editor.",
};
const final = { name: "Encerramento", images: [], copy: ["Crie agora"], frames: 30, evidence: "Chamada." };
const script = { title: "Teste", shots: [shot, final] };
const context = { assets, cta: "Crie agora", targetFrames: 90 };
const picture = {
  kind: "image",
  index: 0,
  x: 270,
  y: 240,
  width: 560,
  height: 500,
  enterFrame: 0,
  animation: "fade",
};
const title = {
  kind: "text",
  index: 0,
  x: 270,
  y: 420,
  width: 420,
  height: 64,
  size: 32,
  color: "#ffffff",
  enterFrame: 2,
  animation: "rise",
};
const layout = {
  shots: [
    { graphicFrames: 30, trimFrame: 8, background: "#000000", layers: [picture] },
    { background: "#14151a", layers: [title] },
  ],
};

test("cena mista conserva frames, fontes e corte escolhido pelo diretor", () => {
  validateScript(script, context);
  const adjustments = [];
  const commands = compileDirection(script, layout, { assets }, adjustments);
  assert.equal(commands.find(c => c.id === "media.insert").asset, "v");
  assert.deepEqual(commands.find(c => c.id === "clip.set").fields, {
    name: "Demonstração · gravação",
    trim: 8 / 30,
    duration: 1,
  });
  assert.equal(commands.find(c => c.id === "layer.add").fields.width, 540);
  assert.equal(adjustments.length, 1);
  assert.equal(commands.filter(c => c.id === "composition.insert").at(-1).time, 2);
});
test("inconsistência no material, no CTA ou na duração invalida o roteiro", () => {
  for (const broken of [
    { ...shot, video: "img" },
    { ...shot, images: ["inventada"] },
    { ...shot, frames: 59 },
    { ...shot, copy: ["Crie agora"] },
  ])
    assert.throws(() => validateScript({ ...script, shots: [broken, final] }, context));
  assert.throws(() => validateScript(script, { ...context, cta: "Outro CTA" }));
});
test("a direção não pode recortar fora da fonte nem inventar ou duplicar índices", () => {
  for (const override of [
    { trimFrame: 31 },
    { graphicFrames: 60 },
    { layers: [] },
    { layers: [{ ...picture, index: 1 }] },
  ])
    assert.throws(() =>
      compileDirection(script, { shots: [{ ...layout.shots[0], ...override }, layout.shots[1]] }, { assets })
    );
  const duplicate = { ...final, copy: ["a", "b"] };
  assert.throws(() =>
    compileDirection(
      { title: "Teste", shots: [duplicate] },
      { shots: [{ ...layout.shots[1], layers: [title, title] }] },
      { assets }
    )
  );
});

test("a direção delimita a leitura de cada camada em quadros e conserva a curva de entrada", () => {
  const s = { ...final, copy: ["Primeiro card", "Segundo card"] };
  const first = { ...title, enterFrame: 0, entranceFrames: 3, endFrame: 15 };
  const second = { ...title, index: 1, enterFrame: 15, entranceFrames: 4 };
  const plan = compileDirection(
    { title: "Cards", shots: [s] },
    { shots: [{ background: "#000000", layers: [first, second] }] },
    { assets }
  );
  const layers = plan.filter(c => c.id === "layer.add").map(c => c.fields);
  assert.equal(layers[0].end, layers[1].start);
  assert.equal(layers[1].end, 1);
  assert.deepEqual(
    plan
      .filter(c => c.id === "key.set" && c.channel === "opacity" && c.value === 1)
      .map(c => [c.time, c.ease]),
    [
      [3 / 30, "out"],
      [4 / 30, "out"],
    ]
  );
});

test("limites de leitura rejeitam chaves após o fim, cortes inválidos e saída precoce do CTA", () => {
  for (const limits of [
    { endFrame: 2 },
    { endFrame: 31 },
    { endFrame: 10, entranceFrames: 8 },
    { entranceFrames: -1 },
    { entranceFrames: 2.5 },
    { animation: "none", entranceFrames: 1 },
    { endFrame: 29 },
  ]) {
    assert.throws(() =>
      compileDirection(
        { title: "Teste", shots: [final] },
        { shots: [{ background: "#000000", layers: [{ ...title, ...limits }] }] },
        { assets, cta: "Crie agora" }
      )
    );
  }
});

test("recupera o CTA literal só no encerramento, mantendo a resposta original", () => {
  const written = {
    ...script,
    shots: [
      { ...shot, copy: ["Crie agora."] },
      { ...final, copy: ["Crie agora."] },
    ],
  };
  const restored = restoreLiteralCta(written, "Crie agora");
  validateScript(restored, context);
  assert.deepEqual(
    restored.shots.map(s => s.copy),
    [["Crie agora."], ["Crie agora"]]
  );
  assert.deepEqual(written.shots.at(-1).copy, ["Crie agora."]);
  assert.equal(restoreLiteralCta(written, "Conheça"), written);
});
