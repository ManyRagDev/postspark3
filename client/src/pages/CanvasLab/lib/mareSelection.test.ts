import { arsenalWorldGeometry } from "@shared/arsenalGeometry";
import { createArsenalFixtureComposition } from "./arsenalFixture";
import { putArsenalComposition } from "./arsenalComposition";
import { describe, expect, it } from "vitest";
import { INITIAL_POST } from "../components/types";
import {
  addMareSelection,
  buildMareSelection,
  mareSelectionFingerprint,
  projectMareSelections,
} from "./mareSelection";
import { duplicateSlide } from "./documentCommands";
import { applyMediaOperation } from "./mediaSlots";
import { normalizeCanvasModel } from "./saveAdapter";
import { getEditorElementState } from "./editorElementState";

describe("selection animated in Maré", () => {
  const geometry = () => ({
    x: 20,
    y: 40,
    width: 80,
    height: 20,
    fontSize: 16,
    rotation: 0,
  });
  it("imports the Janelas title group in visual order, with rotated dividers as editable rectangles", () => {
    const c = createArsenalFixtureComposition();
    const doc = putArsenalComposition(
      {
        ...structuredClone(INITIAL_POST),
        modelVersion: 2,
        aspectRatio: c.effectiveAspectRatio,
      },
      c
    );
    const selection = buildMareSelection(doc, ["titulo"], id => {
      const e = c.elements.find(e => e.id === id)!;
      const w = arsenalWorldGeometry(e, c.groups);
      return {
        ...w,
        width: e.width * w.scale,
        height: e.height * w.scale,
        fontSize: e.fontSize * w.scale,
      };
    });
    expect(selection.elementIds).toEqual(
      c.elements
        .filter(e => e.parentId === "titulo")
        .sort((a, b) => a.zIndex - b.zIndex)
        .map(e => e.id)
    );
    expect(selection.sourceComposition.layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "text" }),
        expect.objectContaining({ kind: "rect" }),
      ])
    );
    const seeded = addMareSelection(doc, "group-slot", selection);
    expect(
      normalizeCanvasModel(JSON.parse(JSON.stringify(seeded))).slides[
        doc.currentSlideIndex
      ].mareSelections?.["group-slot"]
    ).toEqual(selection);
  });
  it("previews without mutation, overlays on return, restores originals, and remaps copies", () => {
    const doc = structuredClone(INITIAL_POST),
      slideId = doc.slides[0].id;
    const selection = buildMareSelection(
      doc,
      ["headline", "subtext"],
      geometry
    );
    expect(selection.sourceComposition.layers[0]).toMatchObject({
      kind: "text",
      x: 60,
      y: 50,
      width: 80,
      height: 20,
    });
    const seeded = addMareSelection(doc, "mare-selection-a", selection);
    expect(seeded.slides[0].temporalMedia).toBeUndefined();
    expect(
      getEditorElementState(
        projectMareSelections(seeded, 0),
        slideId,
        "headline"
      ).visible
    ).toBe(true);
    expect(
      getEditorElementState(
        projectMareSelections(seeded, 0),
        slideId,
        "mare-selection-a"
      ).visible
    ).toBe(false);
    const target = { postId: doc.id, slotId: "mare-selection-a", slideId };
    const withAnimation = applyMediaOperation(seeded, target, {
      kind: "temporal",
      source: {
        kind: "video",
        assetId: "d36dc8f5-c720-4a08-a320-44393e3221e0",
      },
    })!;
    const saved = normalizeCanvasModel(
      JSON.parse(JSON.stringify(withAnimation))
    );
    expect(
      getEditorElementState(
        projectMareSelections(saved, 0),
        slideId,
        "headline"
      ).visible
    ).toBe(false);
    expect(saved.slides[0].headline).toBe(doc.slides[0].headline);
    const duplicated = duplicateSlide(saved, 0).slides[1];
    expect(Object.keys(duplicated.mareSelections!)).toEqual(
      Object.keys(duplicated.temporalMedia!)
    );
    expect(Object.keys(duplicated.mareSelections!)).not.toEqual([
      "mare-selection-a",
    ]);
    const restored = applyMediaOperation(saved, target, { kind: "remove" })!;
    expect(
      getEditorElementState(
        projectMareSelections(restored, 0),
        slideId,
        "headline"
      ).visible
    ).toBe(true);
    expect(
      getEditorElementState(
        projectMareSelections(restored, 0),
        slideId,
        "mare-selection-a"
      ).visible
    ).toBe(false);
  });
  it("detects changes to selected objects between send and apply, and preserves independent edits", () => {
    const doc = structuredClone(INITIAL_POST),
      slideId = doc.slides[0].id;
    const seeded = addMareSelection(
      doc,
      "slot",
      buildMareSelection(doc, ["headline"], geometry)
    );
    const expected = mareSelectionFingerprint(seeded, "slot", slideId);
    expect(expected).toBeTruthy();
    expect(
      mareSelectionFingerprint({ ...seeded, caption: "new" }, "slot", slideId)
    ).toBe(expected);
    seeded.slides[0].headline = "edited concurrently";
    expect(mareSelectionFingerprint(seeded, "slot", slideId)).not.toBe(
      expected
    );
  });
});
