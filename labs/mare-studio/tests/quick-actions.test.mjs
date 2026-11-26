import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newComposition,
  newLayer,
  assertComposition,
} from "../dist/composition-model.js";
import { quickChoices, runQuickAction } from "../dist/quick-actions.js";

test("sugestões dependem da geometria e preservam entradas e saídas existentes", () => {
  const doc = newComposition();
  const titleId = runQuickAction(doc, null, "intro", 4, null, {
    text: "Café 360",
  });
  const [band, title] = doc.layers;
  assert.equal(title.id, titleId);
  assert.equal(title.start, band.keys.scaleX.at(-1).t);
  assert.notEqual(quickChoices(doc, band, 4).next, "bandTitle");
  const subtitle = newLayer("text", 4);
  doc.layers.push(subtitle);
  assert.equal(quickChoices(doc, subtitle, 4).next, "sync");
  runQuickAction(doc, subtitle.id, "sync", 4);
  assert.equal(subtitle.keys.reveal.at(-2).t, title.start);
  const independent = newLayer("text", 4);
  independent.props.y = 100;
  doc.layers.push(independent);
  runQuickAction(
    doc,
    independent.id,
    "copy",
    4,
    { layerId: title.id },
    { after: true }
  );
  assert.equal(
    independent.keys.reveal.at(-2).t,
    title.start + title.keys.reveal[1].t
  );
  const before = structuredClone(independent.keys.reveal);
  assert.throws(
    () => runQuickAction(doc, independent.id, "reveal", 4),
    /sobrepõe/
  );
  assert.deepEqual(independent.keys.reveal, before);
  assertComposition(doc);
});
