import { describe, expect, it } from "vitest";
import {
  componentAssemblyFixture,
  componentAssemblyPlanFixture,
} from "./componentAssembly.fixture";
import {
  createComponentDefinition,
  materializeAssemblyPlan,
  compositionFromAssemblyBundle,
} from "./componentAssembly";
import { arsenalHash } from "./arsenalContent";
import {
  arsenalEffectivePoints,
  readArsenalComposition,
  type ArsenalComposition,
} from "./designArsenal";
import {
  resolveArsenalGeometry,
  type ArsenalTextMeasurer,
} from "./arsenalGeometry";
const measure: ArsenalTextMeasurer = input => ({
  height: 40,
  lines: [{ width: 70 }],
  runs: [
    { fill: input.fill, fontSize: input.fontSize, fontStyle: input.fontStyle },
  ],
});
function fixture() {
  const reference = componentAssemblyFixture()[0],
    original = Object.values(reference.pieces).find(
      p => p.kind === "text" && p.fontAssetId
    )!,
    text = {
      ...original,
      fontSize: 40,
      fill: "#111111",
      stroke: null,
      strokeWidth: 0,
    };
  const paper = {
      ...text,
      kind: "polygon" as const,
      fontAssetId: null,
      fill: "#FFFFFF",
      points: [0, 0, 240, 0, 240, 120, 0, 120],
    },
    line = { ...paper, kind: "line" as const, points: [0, 0, 120, 20] };
  const textHash = arsenalHash(text),
    paperHash = arsenalHash(paper),
    lineHash = arsenalHash(line);
  const instance = (
    id: string,
    pieceHash: string,
    zIndex: number,
    x: number,
    y: number,
    width: number,
    height: number
  ) => ({
    id,
    pieceHash,
    zIndex,
    parentId: null,
    rotation: 0,
    opacity: 1,
    x,
    y,
    width,
    height,
  });
  const component = createComponentDefinition({
    ...reference,
    colorRoles: { paper: "preserve", title: "preserve", line: "preserve" },
    fragment: {
      ...reference.fragment,
      artboard: { width: 1080, height: 1296, background: "#111111" },
      instances: [
        instance("paper", paperHash, 0, 0, 0, 240, 120),
        instance("title", textHash, 1, 260, 72, 80, 60),
        instance("line", lineHash, 2, 700, 700, 120, 20),
      ],
      groups: [],
      bindings: [
        {
          id: "title",
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
      relations: [],
      mediaSlots: [],
      intentionalOverlaps: [],
      assetIds: [text.fontAssetId!],
    },
    pieces: { [textHash]: text, [paperHash]: paper, [lineHash]: line },
    assets: reference.assets.filter(a => a.id === text.fontAssetId),
  });
  const plan = componentAssemblyPlanFixture();
  for (const v of plan.variations) {
    v.direction.palette.background = "#111111";
    v.slides[0].components = [{ id: component.id, hash: component.hash }];
    v.slides[0].mediaPrompts = [];
    v.slides[0].content = {
      schemaVersion: 3,
      blocks: [{ id: "title", type: "text", role: "headline", text: "Copy" }],
      caption: "",
      hashtags: [],
    };
  }
  const run = {
    traceId: "a20b3bc0-2c41-4080-8b29-fb257b61b7a0",
    runId: "a20b3bc0-2c41-4080-8b29-fb257b61b7a0",
  };
  const c = compositionFromAssemblyBundle(
      materializeAssemblyPlan(plan, [component], run).variations[0].slides[0]
        .bundle
    ),
    ids = Object.fromEntries(
      c.base.instances.map(i => [
        i.x === 260 ? "title" : i.x === 700 ? "line" : "paper",
        i.id,
      ])
    );
  return { c, ids, component, plan, run };
}
function resolved(c: ArsenalComposition) {
  return readArsenalComposition(
    resolveArsenalGeometry(c, { measureText: measure })
  );
}
describe("canonical polygon and line resize geometry", () => {
  it("derives points from immutable source boxes and never compounds a previous resize", () => {
    expect(
      arsenalEffectivePoints(
        [0, 0, 100, 40],
        { width: 100, height: 40 },
        { width: 300, height: 80 }
      )
    ).toEqual([0, 0, 300, 80]);
    const { c, ids } = fixture(),
      originalBase = arsenalHash(c.base),
      originalPieces = arsenalHash(c.pieces);
    c.overrides[ids.paper] = { width: 480, height: 240 };
    c.overrides[ids.line] = { width: 240, height: 80 };
    const resized = resolved(c);
    expect(resized.elements.find(e => e.id === ids.paper)?.points).toEqual([
      0, 0, 480, 0, 480, 240, 0, 240,
    ]);
    expect(resized.elements.find(e => e.id === ids.line)?.points).toEqual([
      0, 0, 240, 80,
    ]);
    resized.overrides[ids.paper] = { width: 720, height: 360 };
    expect(
      resolved(resized).elements.find(e => e.id === ids.paper)?.points
    ).toEqual([0, 0, 720, 0, 720, 360, 0, 360]);
    expect(arsenalHash(resized.base)).toBe(originalBase);
    expect(arsenalHash(resized.pieces)).toBe(originalPieces);
    expect(resized.userContentHash).toBe(c.userContentHash);
  });
  it("reopens both fresh and previously stale saved frames with matching effective points and contrast", () => {
    const { c, ids } = fixture();
    expect(resolved(c).issues.some(i => i.startsWith("contrast:low:"))).toBe(
      true
    );
    c.overrides[ids.paper] = { width: 480, height: 240 };
    const resized = resolved(c);
    expect(resized.issues.some(i => i.startsWith("contrast:low:"))).toBe(false);
    const saved = JSON.parse(JSON.stringify(resized));
    expect(readArsenalComposition(saved)).toEqual(resized);
    saved.elements.find((e: { id: string }) => e.id === ids.paper).points = [
      0, 0, 240, 0, 240, 120, 0, 120,
    ];
    const reopened = readArsenalComposition(saved);
    expect(reopened.elements.find(e => e.id === ids.paper)?.points).toEqual([
      0, 0, 480, 0, 480, 240, 0, 240,
    ]);
    expect(
      resolved(reopened).issues.some(i => i.startsWith("contrast:low:"))
    ).toBe(false);
  });
  it("applies surfaceFit to polygons using the final relation box", () => {
    const { component, plan, run } = fixture();
    const fitted = createComponentDefinition({
      ...component,
      fragment: {
        ...component.fragment,
        relations: [
          {
            id: "fit-paper",
            version: 1,
            enabled: true,
            kind: "surfaceFit",
            inputs: ["title"],
            outputs: [
              { targetId: "paper", properties: ["x", "y", "width", "height"] },
            ],
            parameters: {
              padding: { left: 10, right: 10, top: 10, bottom: 10 },
              minWidth: 1,
              minHeight: 1,
            },
          },
        ],
      },
    });
    for (const v of plan.variations)
      v.slides[0].components = [{ id: fitted.id, hash: fitted.hash }];
    const c = resolved(
        compositionFromAssemblyBundle(
          materializeAssemblyPlan(plan, [fitted], run).variations[0].slides[0]
            .bundle
        )
      ),
      paper = c.elements.find(e => e.kind === "polygon")!;
    expect([paper.x, paper.y, paper.width, paper.height]).toEqual([
      250, 62, 100, 80,
    ]);
    expect(paper.points).toEqual([0, 0, 100, 0, 100, 80, 0, 80]);
    expect(c.issues.some(i => i.startsWith("contrast:low:"))).toBe(false);
  });
});
