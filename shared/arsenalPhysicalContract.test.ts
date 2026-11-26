import { describe, expect, it } from "vitest";
import { completeDesignTestDefinitions } from "./completeDesignGeneration.fixture";
import { instantiateCompleteDesign } from "./completeDesignGeneration";
import { arsenalHash, setContentSource } from "./arsenalContent";
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
  it("detects and repairs ink touching the next fragment, retaining the source and the authored minimum", () => {
    const source = scene(104);
    const targets = source.base.instances;
    setContentSource(source.content, source.base.bindings[0].source, "gj É");
    source.base.bindings[0].targetIds = targets.map(target => target.id);
    source.base.bindings.splice(1);
    targets.forEach((instance, index) => {
      instance.height = 32;
      const piece = {
        ...source.pieces[instance.pieceHash], lineHeight: 1,
        contentFragment: { index, count: 2, unit: "words" as const },
      };
      instance.pieceHash = arsenalHash(piece);
      source.pieces[instance.pieceHash] = piece;
    });
    const accents: ArsenalTextMeasurer = input => layoutRichText({
      ...input, measureGlyph: (text, _family, size) => text.length * size * .55,
      measureInk: (text, _family, size) => ({
        x: 0, y: text.includes("É") ? -.04 * size : .03 * size,
        width: text.trim().length * size * .55, height: size * .99,
      }),
    });
    const issues = (c: typeof source) => c.issues.filter(issue => issue.startsWith("vertical_collision:"));
    expect(issues(resolveArsenalGeometry(source, { measureText: accents }))).toEqual([]);
    expect(issues(resolveArsenalGeometry(source, { measureText: accents, guardTextSpacing: true })))
      .toEqual(["vertical_collision:titulo-principal/support"]);
    source.relations = targets.map(instance => ({
      id: "fit-" + instance.id, enabled: true, kind: "textFit", inputs: [],
      outputs: [{ targetId: instance.id, properties: ["fontSize", "height"] }],
      parameters: { minFontSize: 22, maxWidth: instance.width, maxHeight: instance.height, anchor: "left" },
    }));
    const fixed = resolveArsenalGeometry(source, { measureText: accents, guardTextSpacing: true, allowReduction: true });
    expect(issues(fixed)).toEqual([]);
    expect(fixed.content).toEqual(source.content);
    expect(fixed.elements.map(element => element.text).join("")).toBe("gj É");
    expect(fixed.elements.every(element => element.fontSize >= 22 && element.fontSize < 32)).toBe(true);
    expect(fixed.elements.map(element => element.lineHeight)).toEqual([1.15, 1.15]);
    const reopened = resolveArsenalGeometry(JSON.parse(JSON.stringify(fixed)), { measureText: accents });
    expect(reopened.elements).toEqual(fixed.elements);
  });
  it.each(["line", "rect"] as const)("detects an authored %s crossing visible letters", kind => {
    const source = scene(164);
    const title = source.base.instances[0];
    const piece = {
      ...source.pieces[title.pieceHash], kind,
      points: [0, 0, title.width, 0], stroke: "#111111", strokeWidth: 8,
    };
    const pieceHash = arsenalHash(piece);
    source.pieces[pieceHash] = piece;
    source.base.instances.push({ ...title, id: "border", y: title.y + 18,
      height: kind === "rect" ? 6 : title.height, zIndex: title.zIndex + 3, pieceHash });
    expect(resolveArsenalGeometry(source, { measureText: measure, guardTextSpacing: true }).issues)
      .toContain("vertical_collision:titulo-principal/border");
  });
  it("uses the fitted size for fragments with a common authored size and retains authored hierarchy", () => {
    const source = scene(220);
    const binding = source.base.bindings[0];
    setContentSource(source.content, binding.source, "Guia prático");
    binding.targetIds = source.base.instances.map(instance => instance.id);
    source.base.bindings.splice(1);
    source.relations = [];
    source.base.instances.forEach((instance, index) => {
      const piece = { ...source.pieces[instance.pieceHash], contentFragment: { index, count: 2, unit: "words" as const } };
      instance.pieceHash = arsenalHash(piece);
      source.pieces[instance.pieceHash] = piece;
    });
    source.overrides.support = { fontSize: 24 };
    const fit = () => resolveArsenalGeometry(source, { measureText: measure, guardTextSpacing: true, allowReduction: true });
    const synchronized = fit();
    expect(synchronized.elements.map(element => element.fontSize)).toEqual([24, 24]);
    expect(synchronized.overrides["titulo-principal"].fontSize).toBe(24);
    expect(resolveArsenalGeometry(synchronized, { measureText: measure }).elements).toEqual(synchronized.elements);

    const support = source.base.instances[1];
    const smaller = { ...source.pieces[support.pieceHash], fontSize: 28 };
    support.pieceHash = arsenalHash(smaller);
    source.pieces[support.pieceHash] = smaller;
    expect(fit().elements.map(element => element.fontSize)).toEqual([32, 24]);
  });
  it("detects a conservative wrap beyond an authored background and refits inside it", () => {
    const source = scene(220);
    const title = source.base.instances[0];
    title.width = 104;
    title.height = 38.4;
    setContentSource(source.content, source.base.bindings[0].source, "Salve este guia");
    const surface = { ...source.pieces[title.pieceHash], kind: "rect" as const, fill: "#ffffff" };
    const pieceHash = arsenalHash(surface);
    source.pieces[pieceHash] = surface;
    source.base.instances.push({ ...title, id: "label-surface", x: title.x - 10, y: title.y - 5,
      width: 124, height: 48, zIndex: title.zIndex - 1, pieceHash });
    source.relations = [{
      id: "label-fit", enabled: true, kind: "textFit", inputs: [],
      outputs: [{ targetId: title.id, properties: ["fontSize", "height"] }],
      parameters: { minFontSize: 22, maxWidth: title.width, maxHeight: title.height, anchor: "left" },
    }];
    const metric: ArsenalTextMeasurer = input => layoutRichText({
      ...input,
      measureGlyph: (text, _family, size) => text.length * (input.roundGlyphAdvances ? Math.ceil(size * .21) : size * .21),
      measureInk: (text, _family, size) => ({ x: 0, y: 4, width: text.trim().length * size * .21, height: size * .8 }),
    });
    const options = { measureText: metric, guardTextSpacing: true };
    expect(resolveArsenalGeometry(source, options).issues).toContain("overflow:surface:titulo-principal/label-surface");
    const repaired = resolveArsenalGeometry(source, { ...options, allowReduction: true });
    expect(repaired.issues).not.toContain("overflow:surface:titulo-principal/label-surface");
    expect(repaired.elements.find(element => element.id === title.id)?.fontSize).toBeLessThan(32);
    expect(repaired.content).toEqual(source.content);
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
