import { describe, expect, it } from "vitest";
import { completeDesignTestDefinitions } from "./completeDesignGeneration.fixture";
import { instantiateCompleteDesign } from "./completeDesignGeneration";
import { arsenalHash } from "./arsenalContent";
import { resolveArsenalGeometry, arsenalWorldGeometry, type ArsenalTextMeasurer } from "./arsenalGeometry";
import { layoutRichText } from "./arsenalTextLayout";
import { isCanvasBackdrop } from "./arsenalPhysicalContract";

// Synthetic metrics deliberately leave leading around the ink. Real font bytes
// are independently covered by componentTextMeasurer.test and the private replay.
const measure: ArsenalTextMeasurer = input => layoutRichText({
  ...input, measureGlyph: text => text.length * 10,
  measureInk: text => ({ x: 0, y: 10, width: text.trim().length * 10, height: 18 }),
});
function scene(supportY = 145) {
  const definition = completeDesignTestDefinitions()[0];
  for (const instance of definition.fragment.instances) {
    const piece = { ...definition.pieces[instance.pieceHash], fontSize: 32,
      lineHeight: 1.2, letterSpacing: 0, strokeWidth: 0, extrusion: undefined };
    const hash = arsenalHash(piece);
    definition.pieces[hash] = piece;
    instance.pieceHash = hash;
    instance.width = 400;
    instance.height = instance.id === "support" ? 38.4 : 76.8;
    if (instance.id === "support") instance.y = supportY;
  }
  return instantiateCompleteDesign({ definition,
    values: [{ fieldId: "field-0", value: "Synthetic title\nSecond line" },
      { fieldId: "field-1", value: "Synthetic support" }],
    mediaPrompts: [], runId: "11111111-1111-4111-8111-111111111111",
    slot: 0, slide: 0, planHash: "a".repeat(64), experimental: true,
  });
}
const collisions = (source: ReturnType<typeof scene>, measurer = measure) =>
  resolveArsenalGeometry(source, { measureText: measurer }).issues.filter(i => i.startsWith("collision:"));

describe("shared physical text contract", () => {
  it("accepts multiline boxes that overlap only in unused typographic leading", () => {
    expect(collisions(scene())).toEqual([]);
  });
  it("rejects real ink contact, including multiline text", () => {
    expect(collisions(scene(120))).toHaveLength(1);
  });
  it("keeps missing metrics and unmeasured strokes conservative", () => {
    const fallback: ArsenalTextMeasurer = input => {
      const { inkBoxes: _ink, ...layout } = measure(input);
      return layout;
    };
    expect(collisions(scene(), fallback)).toHaveLength(1);
    const source = scene();
    source.overrides.support = { strokeWidth: 2 };
    expect(collisions(source)).toHaveLength(1);
  });
  it("transforms ink with nested group rotation and scale", () => {
    for (const [y, count] of [[145, 0], [120, 1]]) {
      const source = scene(y);
      const group = { id: "rotated", label: "Synthetic", x: 400, y: 50,
        width: 700, height: 700, rotation: 90, scale: .5, opacity: 1,
        zIndex: 0, parentId: null };
      source.base.groups = [group]; source.groups = [group];
      source.base.instances.forEach(i => { i.parentId = group.id; });
      expect(collisions(source)).toHaveLength(count);
    }
  });
  it("recognizes background semantics without relying on an id", () => {
    const source = resolveArsenalGeometry(scene(), { measureText: measure });
    const base = source.elements[0];
    const backdrop = { ...base, id: "any-id", kind: "media" as const,
      text: "", bindingId: null, imageAssetId: "immutable-asset", x: 0, y: 0,
      width: source.artboard.width, height: source.artboard.height, zIndex: -100,
      opacity: 1, parentId: null, rotation: 0 };
    source.elements.push(backdrop);
    const world = (e: typeof base) => arsenalWorldGeometry(e, source.groups);
    expect(isCanvasBackdrop(source, backdrop, world)).toBe(true);
    for (const patch of [{ zIndex: 100 }, { rotation: 1 }, { opacity: .5 },
      { width: backdrop.width - 1 }, { imageAssetId: undefined }, { bindingId: "photo" }]) {
      Object.assign(backdrop, patch);
      expect(isCanvasBackdrop(source, backdrop, world)).toBe(false);
      Object.assign(backdrop, { zIndex: -100, rotation: 0, opacity: 1,
        width: source.artboard.width, imageAssetId: "immutable-asset", bindingId: null });
    }
  });
  it("falls back when run effects or absent metrics cannot describe ink safely", () => {
    const input = { text: "Synthetic", width: 200, fontSize: 32, fontFamily: "fixture",
      fill: "#111111", measureGlyph: (s: string) => s.length * 10 };
    expect(layoutRichText(input).inkBoxes).toBeUndefined();
    expect(layoutRichText({ ...input, measureInk: () => undefined }).inkBoxes).toBeUndefined();
    expect(layoutRichText({ ...input, letterSpacing: 1,
      measureInk: () => ({ x: 0, y: 10, width: 90, height: 18 }) }).inkBoxes).toBeUndefined();
  });
});
