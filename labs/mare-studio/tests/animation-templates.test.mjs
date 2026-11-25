import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assertComposition, evaluateLayer } from "../dist/composition-model.js";
import {
  animationTemplates, buildAnimationTemplate, setTemplateControl, templateControls,
} from "../dist/animation-templates.js";

const png = "data:image/png;base64," +
  readFileSync(new URL("../dist/assets/catalog-avatar.png", import.meta.url)).toString("base64");
const build = template => buildAnimationTemplate(template, new Map((template.sources ?? []).map(file => {
  assert.ok(readFileSync(new URL("../dist/assets/" + file, import.meta.url)).length);
  return [file, png];
})));
const layer = (doc, id) => doc.layers.find(item => item.id === id);
const change = (doc, label, value) => {
  const control = templateControls(doc).find(field => field.label === label);
  assert.ok(control, label);
  setTemplateControl(doc, control.index, value);
  assertComposition(doc);
};

test("os vinte modelos criam composições independentes e válidas", () => {
  assert.equal(animationTemplates.length, 20);
  assert.equal(new Set(animationTemplates.map(template => template.id)).size, 20);
  assert.equal(animationTemplates.filter(template => template.collection === 2).length, 10);
  for (const template of animationTemplates) {
    const doc = build(template);
    assert.ok(templateControls(doc).length >= 4);
    assert.deepEqual(assertComposition(JSON.parse(JSON.stringify(doc))), doc);
  }
});

test("a caixa mantém a proporção do texto e as etapas de abertura ao ser ajustada", () => {
  const template = animationTemplates.find(template => template.id === "dialogue");
  const doc = build(template);
  change(doc, "Largura da caixa", 360);
  change(doc, "Abertura (s)", 1.2);
  assert.equal(layer(doc, "box").width, 360);
  assert.equal(layer(doc, "speech").width, 302);
  assert.equal(layer(doc, "speech").wrap, true);
  assert.equal(evaluateLayer(layer(doc, "box"), .25).scaleY, .012);
  assert.equal(evaluateLayer(layer(doc, "box"), 1.2).scaleY, 1);
  assert.ok(layer(doc, "speech").start > 1.2);
  assert.equal(layer(build(template), "box").width, 444);
});

test("a divisória acompanha a revelação da direita depois de mudar o tempo", () => {
  const doc = build(animationTemplates.find(template => template.id === "comparison"));
  change(doc, "Direção da revelação", "right");
  change(doc, "Duração da revelação (s)", 2.1);
  const after = layer(doc, "after");
  const divider = layer(doc, "divider");
  for (const t of [.53, 1.16, 2.1, 2.63]) {
    const progress = evaluateLayer(after, t).reveal;
    assert.ok(Math.abs(evaluateLayer(divider, t).x - 540 * (1 - progress)) < 1e-6);
  }
  assert.equal(after.revealFrom, "right");
});

test("mudar o valor da barra ajusta o rótulo e mantém a base durante a entrada", () => {
  const doc = build(animationTemplates.find(template => template.id === "bar-chart"));
  change(doc, "Valor da barra 2 (%)", 84);
  const bar = layer(doc, "bar-two");
  const label = layer(doc, "bar-two-value");
  assert.equal(label.text, "84%");
  for (const time of [bar.start, bar.start + .53, bar.start + 1.2]) {
    const state = evaluateLayer(bar, time);
    assert.ok(Math.abs(state.y + bar.height * state.scaleY / 2 - 680) < 1e-6);
  }
});

test("o ajuste da órbita muda o ritmo durante toda a composição", () => {
  const doc = build(animationTemplates.find(template => template.id === "orbits"));
  change(doc, "Uma volta (s)", 1.25);
  const satellite = layer(doc, "satellite-1");
  const before = evaluateLayer(satellite, 0);
  const after = evaluateLayer(satellite, 1.25);
  assert.ok(Math.hypot(before.x - after.x, before.y - after.y) < 1e-6);
  assert.ok(satellite.keys.x.at(-1).t >= 4.8);
});
