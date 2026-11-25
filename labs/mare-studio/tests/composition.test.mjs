import test from "node:test";
import assert from "node:assert/strict";
import { newComposition, evaluateLayer } from "../dist/composition-model.js";
import { animationTemplates, buildAnimationTemplate, templateControls } from "../dist/animation-templates.js";
import {
  planCompositionEdit,
  interpretGroupDuration,
} from "../dist/composition-ai.js";
import { applyGeneratedOps } from "../dist/generative-planner.js";
import { linkedScale, resizeLayer } from "../dist/layer-resize.js";

test("escala proporcional mantém a relação entre os eixos mesmo no limite", () => {
  const pose = { scaleX: 2, scaleY: .5, rotation: 0 };
  assert.deepEqual(linkedScale(pose, "scaleX", 3), { scaleX: 3, scaleY: .75 });
  assert.deepEqual(linkedScale(pose, "scaleY", 80), { scaleX: 100, scaleY: 25 });
  assert.deepEqual(linkedScale({ scaleX: 0, scaleY: 0 }, "scaleY", 1), { scaleX: 1, scaleY: 1 });
});

test("alças usam os eixos rotacionados e alteram a caixa do texto destravado", () => {
  const layer = { type: "square", width: 120, height: 80 };
  const pose = { scaleX: 2, scaleY: 1, rotation: 90 };
  const corner = { x: 1, y: 1 };
  assert.deepEqual(resizeLayer(layer, pose, corner, { x: 0, y: 60 }, false), { scaleX: 3, scaleY: 1 });
  assert.deepEqual(resizeLayer(layer, pose, corner, { x: -20, y: 60 }, true), { scaleX: 3, scaleY: 1.5 });
  assert.deepEqual(resizeLayer({ ...layer, type: "text" }, pose, corner, { x: -20, y: 60 }, false), {
    width: 180, height: 120,
  });
});

test("o pedido sobre o giro preserva a entrada manual do título e as demais propriedades", async () => {
  const first = await planCompositionEdit({
    composition: newComposition(),
    duration: 4,
    prompt:
      "Crie um quadrado coral que gira, se abre e revela o título “Nova coleção”.",
  });
  const composition = first.composition;
  const title = composition.layers.find(l => l.type === "text");
  title.start = 2.25;
  const shape = composition.layers.find(l => l.type === "square");
  const baseline = structuredClone(composition);
  const changed = await planCompositionEdit({
    composition,
    selectedId: shape.id,
    duration: 4,
    prompt: "Faz ele desacelerar antes de abrir",
  });
  assert.deepEqual(composition, baseline);
  const expected = structuredClone(baseline);
  expected.layers.find(l => l.id === shape.id).keys.rotation.at(-1).ease =
    "out";
  assert.deepEqual(changed.composition, expected);
  assert.notEqual(
    evaluateLayer(shape, 0.4).rotation,
    evaluateLayer(
      changed.composition.layers.find(l => l.id === shape.id),
      0.4
    ).rotation
  );
});

test("uma proposta generativa fora da camada escolhida não aplica nem sua primeira operação", () => {
  const composition = applyGeneratedOps(
    [
      ["add", "a", "circle", "Círculo", "#228844"],
      ["add", "b", "text", "Título", "#ffffff"],
    ],
    { composition: newComposition(), duration: 4 }
  ).composition;
  const before = structuredClone(composition);
  assert.throws(() =>
    applyGeneratedOps(
      [
        ["set", "0", "color", "#000000"],
        ["set", "1", "text", "Alterado"],
      ],
      { composition, selectedId: composition.layers[0].id, duration: 4 }
    )
  );
  assert.deepEqual(composition, before);
});

test("o encurtamento de uma seleção reconhece uma duração total explícita", () => {
  assert.equal(
    interpretGroupDuration("encurte a seleção para seis segundos"),
    6
  );
  assert.throws(() => interpretGroupDuration("encurte em seis segundos"));
});

test("o briefing da cafeteria cria um triângulo central que surge, gira e revela o título literal", async () => {
  const { composition } = await planCompositionEdit({
    composition: newComposition(),
    duration: 4,
    prompt:
      'Um triângulo que surge no centro, gira e revela o título "Café 360", que é o nome de uma cafeteria',
  });
  const [triangle, title] = composition.layers;
  assert.equal(composition.layers.length, 2);
  assert.equal(triangle.type, "triangle");
  assert.equal(triangle.props.x, 270);
  assert.equal(triangle.props.y, 480);
  assert.equal(evaluateLayer(triangle, 0).opacity, 0);
  assert.equal(triangle.keys.opacity.at(-1).value, 1);
  assert.ok(triangle.keys.rotation[0].t >= triangle.keys.opacity.at(-1).t);
  assert.notEqual(triangle.keys.rotation.at(-1).value, 0);
  assert.ok(title.start >= triangle.keys.rotation.at(-1).t);
  assert.equal(title.text, "Café 360");
  assert.equal(title.keys.reveal.at(-1).value, 1);
});

test("o primeiro briefing do Instagram cria texto editável com entrada suave no modo rápido", async () => {
  const composition = newComposition();
  for (const [prompt, title] of [
    [
      "Crie uma animação para divulgar uma cafeteria no Instagram com o texto Café da Vila e o título entrando suavemente.",
      "Café da Vila",
    ],
    [
      "Monte um story para anunciar a abertura do café com o título “Café e Arte” e o título entrando aos poucos.",
      "Café e Arte",
    ],
  ]) {
    const result = await planCompositionEdit({ composition, prompt, duration: 4 });
    assert.deepEqual(composition.layers, []);
    assert.equal(result.composition.layers.length, 1);
    const [layer] = result.composition.layers;
    assert.equal(layer.type, "text");
    assert.equal(layer.text, title);
    assert.equal(result.selectedId, layer.id);
    assert.equal(evaluateLayer(layer, 0).opacity, 0);
    assert.ok(evaluateLayer(layer, 0.4).opacity > 0);
    assert.ok(evaluateLayer(layer, 0.4).opacity < 1);
    assert.equal(evaluateLayer(layer, 0.8).opacity, 1);
  }
});

test("um briefing com outras instruções não vira um título literal com o comando omitido", async () => {
  const composition = newComposition();
  await assert.rejects(planCompositionEdit({
    composition,
    prompt: "Crie uma animação para divulgar um café com o texto Café da Vila e um círculo no centro e o título entrando suavemente.",
  }), /A edição rápida reconhece pedidos de texto, cor e movimento/);
  assert.deepEqual(composition.layers, []);
});

test("o pedido da oferta muda o campo do modelo e adianta o selo inteiro", async () => {
  const composition = buildAnimationTemplate(animationTemplates.find(template => template.id === "offer"));
  const before = structuredClone(composition);
  const prompt = "Troque o preço para R$ 17,90 e faça o selo entrar mais cedo.";
  const result = await planCompositionEdit({ composition, prompt, duration: 4 });
  const expected = structuredClone(composition);
  expected.layers.find(layer => layer.id === "price").text = "R$ 17,90";
  for (const layer of expected.layers.filter(layer => ["badge", "tag"].includes(layer.id)))
    layer.start -= .2;
  assert.deepEqual(result.composition, expected);
  assert.deepEqual(composition, before);
  assert.equal(templateControls(result.composition).find(field => field.label === "Preço da oferta").value, "R$ 17,90");
  assert.match(result.summary, /0,2 s mais cedo/);
});

test("uma antecipação impossível ou fora do escopo deixa a oferta intacta", async () => {
  const composition = buildAnimationTemplate(animationTemplates.find(template => template.id === "offer"));
  const before = structuredClone(composition);
  await assert.rejects(planCompositionEdit({
    composition,
    prompt: "Troque o preço da oferta para 12,90 e antecipe a entrada do selo em 1000 ms.",
  }), /duas camadas do selo/);
  await assert.rejects(planCompositionEdit({
    composition,
    selectedId: "price",
    prompt: "Troque o preço para R$ 17,90 e faça o selo entrar mais cedo.",
  }), /Composição inteira/);
  assert.deepEqual(composition, before);
  const price = await planCompositionEdit({ composition, selectedId: "price", prompt: "Troque o preço para 17,90." });
  before.layers.find(layer => layer.id === "price").text = "R$ 17,90";
  assert.deepEqual(price.composition, before);
});

test("seis quadros atrasam apenas o título em 0,2 s na composição de 30 fps", async () => {
  const { composition } = await planCompositionEdit({
    composition: newComposition(),
    duration: 4,
    prompt: 'Um triângulo que surge no centro, gira e revela o título "Café 360"',
  });
  const title = composition.layers.find(layer => layer.type === "text");
  const expected = structuredClone(composition);
  expected.layers.find(layer => layer.id === title.id).start =
    Math.round((title.start + 6 / 30) * 1000) / 1000;
  for (const prompt of ["atrase a entrada em seis quadros", "atrase a entrada em 6 frames"]) {
    const result = await planCompositionEdit({ composition, duration: 4, selectedId: title.id, prompt });
    assert.deepEqual(result.composition, expected);
  }
});

test("o catálogo aceita criação por comando e preserva o tipo e os keyframes", async () => {
  const { elementNames } = await import("../dist/elements.js");
  for (const [id, name] of Object.entries(elementNames)) {
    const { composition } = await planCompositionEdit({
      composition: newComposition(), duration: 3, prompt: "Adicione " + name + " que gira",
    });
    const [layer] = composition.layers;
    assert.equal(layer.type, id);
    assert.ok(layer.keys.rotation.length > 0);
    const generated = applyGeneratedOps([["add", "a", id, name, "#ff693e"]], {
      composition: newComposition(), duration: 3,
    });
    assert.equal(generated.composition.layers[0].type, id);
  }
});
