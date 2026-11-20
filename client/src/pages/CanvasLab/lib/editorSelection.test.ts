import { describe, it, expect } from "vitest";
import { INITIAL_POST } from "../components/types";
import {
  projectEditorLayers,
  executeEditorCommand,
  resolveEditorProperties,
} from "./editorController";
import {
  normalizeEditorSelection,
  selectEditorTarget,
  executeEditorSelectionCommand,
  transformEditorSelection,
} from "./editorSelection";
import { createArsenalFixtureComposition } from "./arsenalFixture";
import {
  addArsenalAuthorialLayer,
  arsenalWorldGeometry,
  overrideArsenalElement,
} from "./arsenalComposition";
import {
  createHistory,
  pushHistory,
  undoHistory,
  redoHistory,
} from "./canvasHistory";
import {
  canvasModelToSavePayload,
  savedPostToCanvasModel,
} from "./saveAdapter";

function document() {
  const post = structuredClone(INITIAL_POST);
  post.slides = [
    {
      id: "a",
      step: "",
      headline: "Título",
      subtext: "Corpo",
      extraTexts: [
        { id: "one", text: "A", x: 10.75, y: 20.125, width: 80, fontSize: 20 },
      ],
      extraShapes: [
        {
          id: "two",
          x: 110.75,
          y: 20.125,
          width: 50,
          height: 60,
          color: "#123456",
        },
      ],
    },
    { id: "b", step: "", headline: "Outro", subtext: "Outro corpo" },
  ];
  return post;
}
describe("selection shared by canvas and layer tree", () => {
  it("toggles with modifiers, replaces on plain click, and never carries IDs into another slide", () => {
    const post = document(),
      layers = projectEditorLayers(post, "a");
    let selection = selectEditorTarget(layers, null, {
      slideId: "a",
      elementId: "one",
    });
    selection = selectEditorTarget(
      layers,
      selection,
      { slideId: "a", elementId: "two" },
      { toggle: true }
    );
    expect(selection.ids).toEqual(["one", "two"]);
    expect(
      selectEditorTarget(
        layers,
        selection,
        { slideId: "a", elementId: "one" },
        { toggle: true }
      ).ids
    ).toEqual(["two"]);
    expect(
      selectEditorTarget(layers, selection, {
        slideId: "a",
        elementId: "headline",
      }).ids
    ).toEqual(["headline"]);
    expect(
      selectEditorTarget(
        projectEditorLayers(post, "b"),
        selection,
        { slideId: "b", elementId: "headline" },
        { toggle: true }
      ).ids
    ).toEqual(["headline"]);
  });
  it("uses the visible layer order for Shift ranges and removes deleted objects", () => {
    const layers = projectEditorLayers(document(), "a");
    const selected = selectEditorTarget(
      layers,
      { slideId: "a", ids: ["one"], anchor: "one" },
      { slideId: "a", elementId: "headline" },
      { range: true, order: ["one", "two", "headline"] }
    );
    expect(selected.ids).toEqual(["one", "two", "headline"]);
    expect(normalizeEditorSelection(layers, ["removed", "one"])).toEqual([
      "one",
    ]);
  });
  it("never transforms a parent and its child twice; explicitly choosing a child replaces its ancestor", () => {
    const comp = createArsenalFixtureComposition();
    const child = comp.elements.find(e => e.parentId)!;
    expect(child).toBeDefined();
    const post = document();
    post.slides[0].composition = comp;
    const layers = projectEditorLayers(post, "a");
    expect(
      normalizeEditorSelection(layers, [child.id, child.parentId!])
    ).toEqual([child.parentId]);
    expect(
      selectEditorTarget(
        layers,
        { slideId: "a", ids: [child.parentId!] },
        { slideId: "a", elementId: child.id },
        { toggle: true }
      ).ids
    ).toEqual([child.id]);
  });
  it("rejects the complete batch when a selected object is locked", () => {
    const post = document();
    post.slides[0].elementStates = { two: { locked: true } };
    const result = executeEditorSelectionCommand(
      post,
      { slideId: "a", ids: ["one", "two"] },
      { type: "remove" }
    );
    expect(result.ok).toBe(false);
    expect(result.post).toBe(post);
    expect(post.slides[0].extraTexts).toHaveLength(1);
  });
  it("moves and scales heterogeneous elements in one history operation, preserves siblings and reopens exactly", () => {
    const post = document(),
      selection = { slideId: "a", ids: ["one", "two"] };
    const geometry = {
      one: { x: 10.75, y: 20.125, width: 80, height: 30 },
      two: { x: 110.75, y: 20.125, width: 50, height: 60 },
    };
    const result = transformEditorSelection(
      post,
      selection,
      { x: 10.75, y: 20.125, dx: 2.125, dy: 3.25, scale: 1.25 },
      geometry
    );
    expect(result.ok).toBe(true);
    expect(result.post.slides[0].extraTexts![0]).toMatchObject({
      x: 12.875,
      y: 23.375,
      width: 100,
      fontSize: 25,
    });
    expect(result.post.slides[0].extraShapes![0]).toMatchObject({
      x: 137.875,
      y: 23.375,
      width: 62.5,
      height: 75,
    });
    expect(result.post.slides[1]).toBe(post.slides[1]);
    const history = pushHistory(createHistory(post), result.post);
    expect(undoHistory(history).present).toBe(post);
    expect(redoHistory(undoHistory(history)).present).toBe(result.post);
    const payload = canvasModelToSavePayload(result.post, {
      inputType: "text",
      inputContent: "Teste",
    });
    const reopened = savedPostToCanvasModel({
      id: 1,
      canvas_model: JSON.parse(JSON.stringify(payload.canvasModel)),
    });
    expect(reopened.slides[0].extraTexts).toEqual(
      result.post.slides[0].extraTexts
    );
    expect(reopened.slides[0].extraShapes).toEqual(
      result.post.slides[0].extraShapes
    );
  });
  it("converts world movement into the rotated/scaled parent coordinates", () => {
    const post = document();
    let c = createArsenalFixtureComposition();
    c = overrideArsenalElement(c, c.groups[0].id, { rotation: 30, scale: 1.5 });
    const parent = c.groups[0];
    c = addArsenalAuthorialLayer(c, {
      id: "nested-audit",
      kind: "text",
      text: "X",
      x: 10,
      y: 20,
      width: 80,
      height: 30,
      fontSize: 20,
      fontFamily: "Arial",
      fill: "#111111",
      rotation: 0,
      opacity: 1,
      zIndex: 99,
      parentId: parent.id,
    });
    post.slides[0].composition = c;
    const node = c.elements.find(e => e.id === "nested-audit")!,
      world = arsenalWorldGeometry(node, c.groups);
    const result = transformEditorSelection(
      post,
      { slideId: "a", ids: [node.id] },
      { x: 0, y: 0, dx: 12.5, dy: -3.25, scale: 1 },
      {
        [node.id]: {
          ...world,
          width: 80 * world.scale,
          height: 30 * world.scale,
        },
      }
    );
    expect(result.ok).toBe(true);
    const updated = result.post.slides[0].composition!,
      after = arsenalWorldGeometry(
        updated.elements.find(e => e.id === node.id)!,
        updated.groups
      );
    expect(after.x - world.x).toBeCloseTo(12.5);
    expect(after.y - world.y).toBeCloseTo(-3.25);
    expect(
      executeEditorCommand(
        result.post,
        { slideId: "a", elementId: node.id },
        { type: "remove" }
      ).ok
    ).toBe(true);
  });
  it("reports the rendered font and size of free text, including its existing size multiplier", () => {
    const post = document();
    post.slides[0].extraTexts![0].sizeScale = 2;
    const target = { slideId: "a", elementId: "one" };
    expect(resolveEditorProperties(post, target).values.fontSize).toBe(40);
    const result = executeEditorCommand(post, target, {
      type: "properties",
      patch: { fontSize: 50 },
    });
    expect(result.ok).toBe(true);
    expect(result.post.slides[0].extraTexts![0]).toMatchObject({
      fontSize: 25,
      sizeScale: 2,
    });
    expect(resolveEditorProperties(result.post, target).values.fontSize).toBe(
      50
    );
  });
});
