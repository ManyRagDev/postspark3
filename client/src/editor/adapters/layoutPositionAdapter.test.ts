import { describe, expect, it } from "vitest";
import type { LayoutPosition } from "@shared/postspark";
import {
  createCanvasViewport,
  documentRect,
  documentSize,
  elementGeometry,
  percentageCenterToDocumentRect,
  percentagePoint,
  screenPoint,
  screenRect,
} from "../geometry";
import { NO_INTERACTION_MODIFIERS, type GeometryCommit } from "../interaction";
import {
  isLayoutGeometryTarget,
  layoutPositionFromCommit,
  layoutPositionsEqual,
  nearestGridCoordinate,
  readLayoutGeometry,
} from "./layoutPositionAdapter";

const baseLayout: LayoutPosition = {
  position: "bottom-left",
  textAlign: "left",
  width: 64,
  backgroundColor: "#123456",
  borderRadius: 12,
};

function commitFor(
  rect: ReturnType<typeof documentRect>,
  canvas: ReturnType<typeof documentSize>,
  operation: "drag" | "resize" = "drag",
): GeometryCommit {
  const viewport = createCanvasViewport(
    screenRect(25, 40, canvas.width * 1.5, canvas.height * 1.5),
    canvas,
  );
  const geometry = elementGeometry("headline", "block", rect);
  return {
    operation,
    intent: operation === "drag" ? { type: "drag" } : { type: "resize", handle: "right" },
    elementId: "headline",
    kind: "block",
    initial: geometry,
    geometry,
    viewport,
    startScreenPoint: screenPoint(100, 100),
    finalScreenPoint: screenPoint(120, 100),
    modifiers: NO_INTERACTION_MODIFIERS,
  };
}

describe("layoutPositionAdapter", () => {
  it.each([
    documentSize(360, 360),
    documentSize(360, 432),
    documentSize(360, 640),
  ])("round-trips percentage centers on a $width x $height canvas", canvas => {
    const size = documentSize(144, 72);
    const rect = percentageCenterToDocumentRect(percentagePoint(37.5, 68.25), size, canvas);
    const current = { ...baseLayout, freePosition: { x: 37.5, y: 68.25 } };
    const result = layoutPositionFromCommit(current, {
      interaction: commitFor(rect, canvas),
      snapEnabled: false,
    });

    expect(result.freePosition?.x).toBeCloseTo(37.5, 8);
    expect(result.freePosition?.y).toBeCloseTo(68.25, 8);
  });

  it("applies the legacy grid only to drag commits", () => {
    const canvas = documentSize(360, 360);
    const rect = percentageCenterToDocumentRect(
      percentagePoint(34, 76),
      documentSize(90, 40),
      canvas,
    );

    const snapped = layoutPositionFromCommit(baseLayout, {
      interaction: commitFor(rect, canvas),
      snapEnabled: true,
    });
    const free = layoutPositionFromCommit(baseLayout, {
      interaction: commitFor(rect, canvas),
      snapEnabled: false,
    });

    expect(snapped.freePosition).toEqual({ x: 30, y: 80 });
    expect(free.freePosition?.x).toBeCloseTo(34, 8);
    expect(free.freePosition?.y).toBeCloseTo(76, 8);
  });

  it("resizes flow layouts without creating a free position", () => {
    const canvas = documentSize(360, 432);
    const result = layoutPositionFromCommit(baseLayout, {
      interaction: commitFor(documentRect(20, 30, 237.42, 50), canvas, "resize"),
      snapEnabled: true,
    });

    expect(result.width).toBe(66);
    expect(result.freePosition).toBeUndefined();
    expect(result).toMatchObject({
      position: "bottom-left",
      textAlign: "left",
      backgroundColor: "#123456",
      borderRadius: 12,
    });
  });

  it("resizes absolute layouts and persists the shifted center without snap", () => {
    const canvas = documentSize(360, 360);
    const current = { ...baseLayout, freePosition: { x: 50, y: 50 } };
    const result = layoutPositionFromCommit(current, {
      interaction: commitFor(documentRect(60, 120, 180, 60), canvas, "resize"),
      snapEnabled: true,
    });

    expect(result.width).toBe(50);
    expect(result.freePosition?.x).toBeCloseTo(41.6666666667, 8);
    expect(result.freePosition?.y).toBeCloseTo(41.6666666667, 8);
  });

  it("recognizes only supported stable layout targets", () => {
    expect(isLayoutGeometryTarget("headline")).toBe(true);
    expect(isLayoutGeometryTarget("card")).toBe(true);
    expect(isLayoutGeometryTarget("section:benefit-1")).toBe(true);
    expect(isLayoutGeometryTarget("section:")).toBe(false);
    expect(isLayoutGeometryTarget("imageElement:1")).toBe(false);
  });

  it("reads measured document geometry without introducing percentages", () => {
    const rect = documentRect(12, 24, 80, 30);
    expect(readLayoutGeometry("badge", "block", rect)).toEqual({
      id: "badge",
      kind: "block",
      rect,
      rotationDeg: 0,
    });
  });

  it("keeps nearest-grid tie behavior and compares complete layouts", () => {
    expect(nearestGridCoordinate(15)).toBe(10);
    expect(layoutPositionsEqual(baseLayout, { ...baseLayout })).toBe(true);
    expect(layoutPositionsEqual(baseLayout, { ...baseLayout, width: 65 })).toBe(false);
  });
});
