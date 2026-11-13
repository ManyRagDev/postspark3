import { describe, it, expect } from "vitest";
import reference from "../client/src/pages/CanvasLab/arsenal/windowFixture.json";
import { arsenalHash } from "./arsenalContent";
import {
  readArsenalComposition,
  type ArsenalComposition,
  arsenalPieceSchema,
} from "./designArsenal";
import {
  resolveArsenalGeometry,
  arsenalTextLayoutBox,
  type ArsenalTextMeasurer,
} from "./arsenalGeometry";
const measure: ArsenalTextMeasurer = input => {
  const natural = input.text.length * input.fontSize * 0.5;
  const count = Math.max(1, Math.ceil((natural - 1e-8) / input.width));
  return {
    height: count * input.fontSize * (input.lineHeight ?? 1),
    lines: Array.from({ length: count }, (_, i) => ({
      width: Math.min(input.width, Math.max(0, natural - i * input.width)),
    })),
    runs: [],
  };
};
function fixture(
  options: {
    text?: string;
    blocked?: boolean;
    decoration?: boolean;
    linked?: boolean;
    rotation?: number;
    group?: boolean;
  } = {}
): ArsenalComposition {
  const ref = Object.values(reference.pieces).find(p => p.kind === "text")!;
  const title = arsenalPieceSchema.parse({
    ...ref,
    fontSize: 24,
    lineHeight: 1.2,
    fill: "#111111",
  });
  const body = arsenalPieceSchema.parse({
    ...title,
    fontSize: 12,
    fixedText: "Body",
  });
  const paper = arsenalPieceSchema.parse({
    ...title,
    kind: "rect",
    fill: "#FFFFFF",
    fontAssetId: null,
  });
  const pieces = {
    [arsenalHash(title)]: title,
    [arsenalHash(body)]: body,
    [arsenalHash(paper)]: paper,
  };
  const instance = (
    id: string,
    pieceHash: string,
    x: number,
    y: number,
    width: number,
    height: number,
    zIndex = 1
  ) => ({
    id,
    pieceHash,
    x,
    y,
    width,
    height,
    zIndex,
    parentId: options.group ? "group" : null,
    rotation: 0,
    opacity: 1,
  });
  const instances = [
    instance("title", arsenalHash(title), 50, 100, 100, 28.8),
    instance(
      "body",
      arsenalHash(body),
      50,
      options.blocked ? 130 : 200,
      300,
      20
    ),
    instance("footer", arsenalHash(body), 50, 400, 300, 20),
  ];
  instances[0].rotation = options.rotation ?? 0;
  if (options.decoration || options.linked)
    instances.push(
      instance("surface", arsenalHash(paper), 42, 92, 116, 44.8, 0)
    );
  const relations: any[] = [
    {
      id: "fit-title",
      version: 1,
      enabled: true,
      kind: "textFit",
      inputs: [],
      outputs: [
        { targetId: "title", properties: ["x", "width", "height", "fontSize"] },
      ],
      parameters: {
        anchor: "left",
        maxWidth: 100,
        maxHeight: 28.8,
        minFontSize: 20,
      },
    },
  ];
  if (options.linked)
    relations.push({
      id: "fit-surface",
      version: 1,
      enabled: true,
      kind: "surfaceFit",
      inputs: ["title"],
      outputs: [
        { targetId: "surface", properties: ["x", "y", "width", "height"] },
      ],
      parameters: {
        padding: { left: 8, right: 8, top: 8, bottom: 8 },
        minWidth: 116,
        minHeight: 44.8,
      },
    });
  const content = {
    ...reference.content,
    headline: options.text ?? "Read a little every day",
    eyebrow: null,
    sectionLabel: null,
    callToAction: null,
    label: null,
    items: [],
    caption: "",
    hashtags: [],
  };
  const base: any = {
    ...reference.variant,
    artboard: { width: 500, height: 600, background: "#FFFFFF" },
    instances,
    groups: options.group
      ? [
          {
            id: "group",
            label: "Limited",
            x: 0,
            y: 0,
            width: 150,
            height: 600,
            scale: 1,
            rotation: 0,
            zIndex: 0,
            opacity: 1,
            parentId: null,
          },
        ]
      : [],
    bindings: [
      {
        id: "headline",
        label: "Title",
        kind: "text",
        source: "headline",
        required: true,
        targetIds: ["title"],
        cardinality: null,
        prefix: "",
        gap: 0,
      },
    ],
    relations,
    assetIds: [title.fontAssetId],
    intentionalOverlaps: [],
  };
  return {
    version: 2,
    origin: { ...reference.origin, variantHash: arsenalHash(base) },
    base,
    pieces,
    assets: reference.assets as any,
    content: content as any,
    userContentHash: arsenalHash(content),
    generatedContentHash: arsenalHash(content),
    contentRevision: 0,
    elements: [],
    groups: base.groups,
    relations,
    overrides: {},
    richText: {},
    media: {},
    seed: 0,
    state: "needs_adjustment",
    issues: [],
    layoutOrigin: "catalog-variant",
    sourceVariantKey: base.variantKey,
    effectiveAspectRatio: base.aspectRatio,
    projection: { scale: 1, x: 0, y: 0 },
    artboard: base.artboard,
  };
}
const resolve = (source: ArsenalComposition, adaptiveTextFit = true) =>
  resolveArsenalGeometry(source, {
    measureText: measure,
    allowReduction: true,
    elasticReduction: true,
    adaptiveTextFit,
  });
const title = (c: ArsenalComposition) =>
  c.elements.find(e => e.id === "title")!;
describe("bounded adaptive text geometry", () => {
  function authoredFixture(blocked = false) {
    const source = fixture({ blocked });
    const fit = source.relations[0];
    if (fit.kind !== "textFit") throw Error("expected textFit");
    fit.parameters.maxHeight = 90;
    fit.parameters.flexibility = { version: 1, minFontSize: 20,
      preferredFontSize: 24, maxFontSize: 24 };
    source.base.relations = structuredClone(source.relations);
    source.origin.variantHash = arsenalHash(source.base);
    return source;
  }
  const resolveAuthored = (source: ArsenalComposition) =>
    resolveArsenalGeometry(source, {
      measureText: measure, allowReduction: true, adaptiveTextFit: true,
      textFlexibilityVersion: 1,
    });
  it("uses the declared height and restores preferred type while respecting the declared width", () => {
    const source = authoredFixture(), after = resolveAuthored(source);
    expect(title(after)).toMatchObject({ width: 100, fontSize: 24 });
    expect(title(after).height).toBeCloseTo(86.4);
    expect(after.issues).toEqual([]);
    expect(after.content).toEqual(source.content);
    const saved = readArsenalComposition(JSON.parse(JSON.stringify(after)));
    expect(resolveArsenalGeometry(saved, { measureText: measure }).elements).toEqual(after.elements);
    expect(resolveAuthored(saved).elements).toEqual(after.elements);
  });
  it("retains overflow when declared height or a real neighbor prevents expansion", () => {
    const capped = authoredFixture();
    if (capped.relations[0].kind !== "textFit") throw Error();
    capped.relations[0].parameters.maxHeight = 60;
    capped.base.relations = structuredClone(capped.relations);
    for (const source of [capped, authoredFixture(true)]) {
      const after = resolveAuthored(source);
      expect(after.issues).toContain("overflow:title");
      expect(after.overrides.title?.adaptiveTextFitVersion).toBeUndefined();
    }
  });
  it("treats a fixed full-canvas raster behind content as a backdrop during fitting", () => {
    const source = authoredFixture();
    const text = source.pieces[source.base.instances[0].pieceHash];
    const raster = { ...text, kind: "media" as const, fixedText: null,
      imageAssetId: "synthetic-background", fontAssetId: null };
    const hash = arsenalHash(raster);
    source.pieces[hash] = raster;
    source.base.instances.unshift({ ...source.base.instances[0], id: "arbitrary-surface",
      pieceHash: hash, x: 0, y: 0, width: 500, height: 600, zIndex: -100 });
    const after = resolveAuthored(source);
    expect(title(after)).toMatchObject({ width: 100, fontSize: 24 });
    expect(title(after).height).toBeCloseTo(86.4);
    expect(after.issues.filter(i => i.startsWith("overflow"))).toEqual([]);
  });
  it("uses a nearby authored column, restores font hierarchy, preserves copy and unrelated geometry", () => {
    const source = fixture(),
      before = resolve(source, false),
      after = resolve(source);
    expect(before.issues).toContain("overflow:title");
    expect(after.issues).toEqual([]);
    expect(title(after)).toMatchObject({
      x: 50,
      y: 100,
      width: 300,
      height: 28.8,
      fontSize: 24,
    });
    expect(after.overrides.title.adaptiveTextFitVersion).toBe(2);
    expect(after.content).toEqual(source.content);
    expect(after.base).toEqual(source.base);
    expect(after.pieces).toEqual(source.pieces);
    expect(after.elements.filter(e => e.id !== "title")).toEqual(
      before.elements.filter(e => e.id !== "title")
    );
    expect(source.overrides).toEqual({});
  });
  it("saves, validates and reopens without requiring the generation opt-in or repeating expansion", () => {
    const once = resolve(fixture());
    const saved = readArsenalComposition(JSON.parse(JSON.stringify(once)));
    const reopened = resolveArsenalGeometry(saved, {
      measureText: measure,
      allowReduction: false,
    });
    expect(reopened.elements).toEqual(once.elements);
    expect(reopened.overrides).toEqual(once.overrides);
    expect(resolve(reopened).elements).toEqual(once.elements);
    expect(resolve(reopened).overrides).toEqual(once.overrides);
    expect(arsenalTextLayoutBox(reopened, title(reopened)).width).toBe(300);
    expect(readArsenalComposition(reopened).content).toEqual(once.content);
  });
  it("keeps the adaptive overrides through CanvasPostModel save and reopening", async () => {
    const { INITIAL_POST } = await import(
      "../client/src/pages/CanvasLab/components/types"
    );
    const { putArsenalComposition } = await import(
      "../client/src/pages/CanvasLab/lib/arsenalComposition"
    );
    const { canvasModelToSavePayload, normalizeCanvasModel } = await import(
      "../client/src/pages/CanvasLab/lib/saveAdapter"
    );
    const fitted = resolve(fixture());
    const post = putArsenalComposition(
      { ...structuredClone(INITIAL_POST), currentSlideIndex: 0 },
      fitted
    );
    const payload = canvasModelToSavePayload(post, {
      inputType: "text",
      inputContent: fitted.elements.find(e => e.id === "title")!.text,
    });
    const reopened = normalizeCanvasModel(
      JSON.parse(JSON.stringify(payload.canvasModel))
    );
    const stored = readArsenalComposition(reopened.slides[0].composition);
    expect(stored.overrides).toEqual(fitted.overrides);
    expect(
      resolveArsenalGeometry(stored, {
        measureText: measure,
        allowReduction: false,
      }).elements
    ).toEqual(fitted.elements);
  });
  it("does not enable adaptation for historical resolutions or font-only overrides", () => {
    const source = fixture(),
      before = resolve(source, false);
    expect(before.overrides).toEqual({});
    expect(arsenalTextLayoutBox(before, title(before)).width).toBe(100);
    source.overrides.title = { fontSize: 20 };
    expect(resolve(source).overrides).toEqual(source.overrides);
  });
  it("uses height only when width cannot fit, retaining authored leading before the next block", () => {
    const source = fixture({ text: "a ".repeat(45) }),
      after = resolve(source);
    expect(after.overrides.title.adaptiveTextFitVersion).toBe(2);
    expect(after.issues).toEqual([]);
    expect(title(after).width).toBe(300);
    expect(title(after).height).toBeGreaterThan(28.8);
    expect(title(after).y + title(after).height).toBeLessThanOrEqual(
      200 - 24 * 0.2 + 0.01
    );
  });
  it("refuses growth that would consume a small authored gap or exceed an ancestor bound", () => {
    for (const source of [
      fixture({ text: "a ".repeat(50), blocked: true }),
      fixture({ blocked: true, group: true }),
    ]) {
      expect(resolve(source).overrides).toEqual({});
      expect(resolve(source).issues.length).toBeGreaterThan(0);
    }
  });
  it("refuses rotation and undecorated relationships rather than stretching an isolated highlight", () => {
    for (const source of [
      fixture({ rotation: 15 }),
      fixture({ decoration: true }),
    ])
      expect(resolve(source).overrides).toEqual({});
  });
  it("adapts a surface only through its explicit one-text relation, keeping all four paddings", () => {
    const source = fixture({ linked: true }),
      after = resolve(source),
      text = title(after),
      surface = after.elements.find(e => e.id === "surface")!;
    expect(after.issues).toEqual([]);
    expect(after.overrides.surface.adaptiveTextFitVersion).toBe(2);
    expect(surface.x).toBe(text.x - 8);
    expect(surface.y).toBe(text.y - 8);
    expect(surface.width).toBeCloseTo(text.width + 16);
    expect(surface.height).toBeCloseTo(text.height + 16);
    expect(
      resolveArsenalGeometry(
        readArsenalComposition(JSON.parse(JSON.stringify(after))),
        { measureText: measure }
      ).elements
    ).toEqual(after.elements);
  });
  it("keeps already expanded boxes as obstacles for a second nearby expansion", () => {
    const source = fixture({ text: "Read every day" }),
      base = source.base;
    const original = source.pieces[base.instances[0].pieceHash];
    const second = { ...original, fixedText: "Another notice" };
    const secondHash = arsenalHash(second);
    source.pieces[secondHash] = second;
    base.instances.push({
      ...base.instances[0],
      id: "second",
      pieceHash: secondHash,
      x: 220,
    });
    const relation: any = {
      ...structuredClone(source.relations[0]),
      id: "fit-second",
      outputs: [
        {
          targetId: "second",
          properties: ["x", "width", "height", "fontSize"],
        },
      ],
      parameters: { ...source.relations[0].parameters, anchor: "right" },
    };
    source.relations.push(relation);
    base.relations = source.relations;
    source.origin.variantHash = arsenalHash(base);
    const after = resolve(source),
      first = title(after),
      next = after.elements.find(e => e.id === "second")!;
    expect(after.overrides.title.adaptiveTextFitVersion).toBe(2);
    expect(after.overrides.second.adaptiveTextFitVersion).toBe(2);
    expect(first.width).toBeGreaterThan(100);
    expect(next.height).toBeGreaterThan(28.8);
    expect(next.x - (first.x + first.width)).toBeGreaterThanOrEqual(
      24 * 0.2 - 0.01
    );
    expect(after.issues).toEqual([]);
  });
  it("reserves a manually moved obstacle at its resolved location as well as its authorial slot", () => {
    const source = fixture();
    source.overrides.body = { x: 155, y: 100, width: 100, height: 20 };
    const after = resolve(source);
    expect(after.overrides.title).toBeUndefined();
    expect(after.overrides.body).toEqual(source.overrides.body);
  });
  it("uses the measured internal-space advance when authored line leading is zero", () => {
    const source = fixture({ text: "Read every day" }),
      base = source.base;
    const old = base.instances[0].pieceHash,
      newPiece = { ...source.pieces[old], lineHeight: 1 };
    const hash = arsenalHash(newPiece);
    source.pieces[hash] = newPiece;
    base.instances[0].pieceHash = hash;
    base.instances[0].height = 24;
    base.instances[1].y = 140;
    base.instances[1].width = 100;
    base.instances[2].width = 100;
    if (source.relations[0].kind === "textFit")
      source.relations[0].parameters.maxHeight = 24;
    base.relations = source.relations;
    source.origin.variantHash = arsenalHash(base);
    expect(resolve(source).overrides).toEqual({});
  });
  it("does not expand properties outside the declared textFit outputs", () => {
    const source = fixture();
    source.relations[0].outputs[0].properties = ["fontSize"];
    expect(resolve(source).overrides).toEqual({});
  });
  it("finishes permitted font reduction against the audited box before considering expansion", () => {
    const source = fixture({ text: "Read here", decoration: true });
    if (source.relations[0].kind === "textFit")
      source.relations[0].parameters.maxHeight = 60;
    const historical = resolve(source, false),
      adaptive = resolve(source);
    expect(title(historical).fontSize).toBe(24);
    expect(title(historical).height).toBeGreaterThan(
      arsenalTextLayoutBox(historical, title(historical)).height
    );
    expect(title(adaptive).fontSize).toBe(22);
    expect(title(adaptive).height).toBeLessThanOrEqual(
      arsenalTextLayoutBox(adaptive, title(adaptive)).height
    );
    expect(adaptive.issues).toEqual([]);
    expect(adaptive.overrides).toEqual({});
    expect(adaptive.content).toEqual(source.content);
  });
  it("keeps the authored-box font bound when another field triggers an adaptive resolve", () => {
    const source = fixture(),
      original = source.pieces[source.base.instances[0].pieceHash];
    const second = { ...original, fixedText: "Read here" },
      hash = arsenalHash(second);
    source.pieces[hash] = second;
    source.base.instances.push({
      ...source.base.instances[0],
      id: "second",
      pieceHash: hash,
      y: 300,
    });
    const paper = {
        ...original,
        kind: "rect" as const,
        fill: "#FFFFFF",
        fontAssetId: null,
      },
      paperHash = arsenalHash(paper);
    source.pieces[paperHash] = paper;
    source.base.instances.push({
      ...source.base.instances[0],
      id: "second-paper",
      pieceHash: paperHash,
      x: 42,
      y: 292,
      width: 116,
      height: 44.8,
      zIndex: 0,
    });
    const relation: any = {
      ...structuredClone(source.relations[0]),
      id: "fit-second",
      outputs: [
        {
          targetId: "second",
          properties: ["x", "width", "height", "fontSize"],
        },
      ],
      parameters: { ...source.relations[0].parameters, maxHeight: 60 },
    };
    source.relations.push(relation);
    source.base.relations = source.relations;
    const after = resolve(source),
      secondAfter = after.elements.find(e => e.id === "second")!;
    expect(after.overrides.title.adaptiveTextFitVersion).toBe(2);
    expect(secondAfter.fontSize).toBe(22);
    expect(secondAfter.height).toBeLessThanOrEqual(28.8);
    expect(after.issues).toEqual([]);
  });
  it("rejects unsupported persisted adaptation versions", () => {
    const after = resolve(fixture());
    after.overrides.title.adaptiveTextFitVersion = 3;
    expect(() => readArsenalComposition(after)).toThrow(
      "Override não permitido"
    );
  });
});
