import { expect, it } from "vitest";
import { arsenalHash } from "@shared/arsenalContent";
import { instantiateCompleteDesign } from "@shared/completeDesignGeneration";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import {
  resolveArsenalGeometry,
  type ArsenalTextMeasurer,
} from "@shared/arsenalGeometry";
import { fitEditorialParagraphs } from "./editorialTextLayout";

it("aligns separate rows on their authored center and reproduces the exact copy after reopening", () => {
  const d = completeDesignTestDefinitions()[0];
  const first = d.fragment.instances[0];
  const second = { ...first, id: "row-2" };
  const text = "Uma pausa que cabe no seu dia";
  const scene = instantiateCompleteDesign({
    definition: d,
    values: [
      { fieldId: "field-0", value: text },
      { fieldId: "field-1", value: "Apoio" },
    ],
    mediaPrompts: [],
    runId: d.id,
    slot: 0,
    slide: 0,
    planHash: "a".repeat(64),
    experimental: true,
  });
  const template = d.pieces[first.pieceHash];
  for (const [index, row] of Array.from([first, second].entries())) {
    const piece = {
      ...template,
      fontSize: 32,
      lineHeight: 1.25,
      align: "left" as const,
      contentFragment: { index, count: 2, unit: "words" as const },
    };
    row.pieceHash = arsenalHash(piece);
    row.width = index ? 240 : 320;
    row.x = 540 - row.width / 2;
    row.y = 120 + index * 40;
    row.height = 40;
    d.pieces[row.pieceHash] = piece;
  }
  d.fragment.instances.push(second);
  d.fragment.bindings[0].targetIds.push(second.id);
  Object.assign(scene.base, {
    instances: d.fragment.instances,
    bindings: d.fragment.bindings,
  });
  scene.pieces = d.pieces;
  const measure: ArsenalTextMeasurer = ({ text, fontSize }) => ({
    height: fontSize * 1.25,
    lines: [{ width: text.trim().length * fontSize * 0.5 }],
    runs: [],
  });
  const fitted = fitEditorialParagraphs(scene, d, measure);
  expect(fitted).not.toBe(scene);
  const reopened = resolveArsenalGeometry(JSON.parse(JSON.stringify(fitted)), {
    measureText: measure,
  });
  const rows = [first, second].map(
    row => reopened.elements.find(e => e.id === row.id)!
  );
  expect(rows.map(e => e.text).join("")).toBe(text);
  expect(rows.map(e => [e.align, e.x + e.width / 2, e.fontSize])).toEqual([
    ["center", 540, 32],
    ["center", 540, 32],
  ]);
  expect(rows[1].y - rows[0].y).toBe(40);
  expect(
    fitEditorialParagraphs(
      { ...scene, overrides: { [first.id]: { x: 90 } } },
      d,
      measure
    ).measuredSplits
  ).toBeUndefined();
});
