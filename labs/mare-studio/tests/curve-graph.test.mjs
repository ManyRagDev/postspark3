import assert from "node:assert/strict";
import {test} from "node:test";
import {newLayer, setKey, evaluateLayer} from "../dist/composition-model.js";
import {curveGraph} from "../dist/curve-graph.js";
import {nearestSnap} from "../dist/timeline-snap.js";

test("o gráfico usa o tempo da composição e a mesma curva da prévia após um recorte", () => {
  const layer = newLayer("square", 5);
  layer.start = 1;
  layer.props.opacity = 0;
  setKey(layer, "opacity", 2, 1, "in");
  const graph = curveGraph(layer, "opacity", {trim: 1, duration: 4});
  assert.equal(graph.keys[0].x, 50);
  const middle = graph.path.split(" ").find(p => p.startsWith("25.0000,"));
  assert.equal(Number(middle.split(",")[1]), 90 - 80 * evaluateLayer(layer, 2).opacity);
});

test("manter desenha um salto vertical no keyframe e uma curva constante permanece visível", () => {
  const layer = newLayer("square", 2);
  layer.props.opacity = 0;
  setKey(layer, "opacity", 1, 1, "hold");
  const clip = {trim: 0, duration: 2};
  assert.match(curveGraph(layer, "opacity", clip).path, /50.0000,90.0000 50.0000,10.0000/);
  assert.equal(curveGraph(layer, "rotation", clip).min, curveGraph(layer, "rotation", clip).max);
  assert.equal(curveGraph(layer, "opacity", {trim: 3, duration: 1}), null);
});

test("o encaixe respeita a distância na tela e preserva os tempos entre quadros", () => {
  const times = [0, .12345, .3, 2];
  assert.equal(nearestSnap(times, .13, .002), .12345);
  assert.equal(nearestSnap(times, .13, .001), null);
  assert.equal(nearestSnap([], .12, .01), null);
});

test("Bézier usa o tempo invertido da cúbica, permite ultrapassar o destino e respeita o limite do canal", () => {
  const layer = newLayer("square", 3, {props: {x: 0, opacity: 0}});
  // For u = .5, x(u) = .35 and y(u) = 1.25.
  const handles = [.2, 2, .4, 1];
  for (const [axis, end] of [["x", 100], ["opacity", 1]]) setKey(layer, axis, 2, end, handles);
  const pose = evaluateLayer(layer, .7);
  assert.ok(Math.abs(pose.x - 125) < 1e-5);
  assert.equal(pose.opacity, 1);
  assert.equal(evaluateLayer(layer, 2).x, 100);
  assert.ok(curveGraph(layer, "x", {trim: 0, duration: 3}).max > 124);
  for (const invalid of [[0, 0, 1], [-.1, 0, 1, 1], [0, 0, 1, 4.1], [0, NaN, 1, 1]]) {
    assert.throws(() => setKey(layer, "x", 1, 1, invalid), /inválido/);
  }
});
