import { describe, expect, expectTypeOf, it } from "vitest";
import {
  GeometryError,
  centerOfRect,
  clamp,
  clampPointToRect,
  clampRectToBounds,
  clampRotatedRectToBounds,
  createCanvasViewport,
  documentDelta,
  documentPoint,
  documentRect,
  documentRectToPercentageCenter,
  documentSize,
  documentToScreenDelta,
  documentToScreenPoint,
  documentToScreenRect,
  elementGeometry,
  normalizeRotationDegrees,
  percentageCenterToDocumentRect,
  percentagePoint,
  rectFromCenter,
  resizeRect,
  resizeRectProportionally,
  rotatedRectBounds,
  screenDelta,
  screenPixelsToDocumentUnits,
  screenPoint,
  screenRect,
  screenToDocumentDelta,
  screenToDocumentPoint,
  screenToDocumentRect,
  translateRect,
  unionRects,
  type DocumentPoint,
  type ResizeHandle,
  type ScreenPoint,
} from "./index";

const CANVAS_SQUARE = documentSize(360, 360);
const CANVAS_PORTRAIT = documentSize(360, 432);
const CANVAS_STORY = documentSize(360, 640);

describe("geometry types and validation", () => {
  it("keeps screen and document points nominally distinct", () => {
    expectTypeOf<ScreenPoint>().not.toMatchTypeOf<DocumentPoint>();
  });

  it("normalizes negative zero at public constructors", () => {
    const screen = screenPoint(-0, -0);
    const document = documentRect(-0, -0, 0, 0);

    expect(Object.is(screen.x, -0)).toBe(false);
    expect(Object.is(screen.y, -0)).toBe(false);
    expect(Object.is(document.x, -0)).toBe(false);
    expect(Object.is(document.width, -0)).toBe(false);
  });

  it("rejects non-finite values and invalid dimensions", () => {
    expect(() => screenPoint(Number.NaN, 0)).toThrow(GeometryError);
    expect(() => documentPoint(0, Number.POSITIVE_INFINITY)).toThrow(GeometryError);
    expect(() => documentRect(0, 0, -1, 10)).toThrow(GeometryError);
    expect(() => documentSize(0, 10)).toThrow(GeometryError);
    expect(() => elementGeometry("", "image", documentRect(0, 0, 10, 10))).toThrow(GeometryError);
  });

  it("allows zero-sized geometric rectangles", () => {
    expect(documentRect(10, 20, 0, 0)).toEqual({ x: 10, y: 20, width: 0, height: 0 });
  });
});

describe("canvas viewport and transforms", () => {
  it.each([0.5, 0.75, 1, 1.5, 2])(
    "round-trips points, deltas and rectangles at scale %s",
    scale => {
      const viewport = createCanvasViewport(
        screenRect(40, 20, CANVAS_STORY.width * scale, CANVAS_STORY.height * scale),
        CANVAS_STORY,
      );
      const point = documentPoint(123.25, 456.75);
      const delta = documentDelta(-17.5, 22.25);
      const rect = documentRect(12.5, 24.25, 98.75, 133.5);

      const pointResult = screenToDocumentPoint(documentToScreenPoint(point, viewport), viewport);
      const deltaResult = screenToDocumentDelta(documentToScreenDelta(delta, viewport), viewport);
      const rectResult = screenToDocumentRect(documentToScreenRect(rect, viewport), viewport);

      expect(pointResult.x).toBeCloseTo(point.x, 8);
      expect(pointResult.y).toBeCloseTo(point.y, 8);
      expect(deltaResult.x).toBeCloseTo(delta.x, 8);
      expect(deltaResult.y).toBeCloseTo(delta.y, 8);
      expect(rectResult.x).toBeCloseTo(rect.x, 8);
      expect(rectResult.y).toBeCloseTo(rect.y, 8);
      expect(rectResult.width).toBeCloseTo(rect.width, 8);
      expect(rectResult.height).toBeCloseTo(rect.height, 8);
    },
  );

  it("accounts for viewport offsets in CSS pixels", () => {
    const viewport = createCanvasViewport(screenRect(120, 80, 720, 720), CANVAS_SQUARE);
    expect(screenToDocumentPoint(screenPoint(480, 440), viewport)).toEqual({ x: 180, y: 180 });
    expect(documentToScreenPoint(documentPoint(0, 0), viewport)).toEqual({ x: 120, y: 80 });
  });

  it("accepts subpixel scale drift up to 0.1% and rejects deformation above it", () => {
    expect(() => createCanvasViewport(screenRect(0, 0, 360, 432.4), CANVAS_PORTRAIT)).not.toThrow();
    expect(() => createCanvasViewport(screenRect(0, 0, 360, 432.5), CANVAS_PORTRAIT)).toThrow(
      /non-uniform/,
    );
    expect(() => createCanvasViewport(screenRect(0, 0, 0, 432), CANVAS_PORTRAIT)).toThrow(
      /positive screen size/,
    );
  });

  it("keeps screen-space tolerance perceptually stable across zoom", () => {
    const values = [0.5, 1, 2].map(scale => {
      const viewport = createCanvasViewport(
        screenRect(0, 0, CANVAS_SQUARE.width * scale, CANVAS_SQUARE.height * scale),
        CANVAS_SQUARE,
      );
      return screenPixelsToDocumentUnits(5, viewport, "x");
    });

    expect(values).toEqual([10, 5, 2.5]);
  });
});

describe("document bounds", () => {
  it("round-trips center-based and percentage-based geometry", () => {
    const rect = rectFromCenter(documentPoint(180, 216), documentSize(120, 80));
    expect(centerOfRect(rect)).toEqual({ x: 180, y: 216 });

    const percentage = documentRectToPercentageCenter(rect, CANVAS_PORTRAIT);
    expect(percentage).toEqual({ x: 50, y: 50 });

    const result = percentageCenterToDocumentRect(
      percentagePoint(percentage.x, percentage.y),
      documentSize(rect.width, rect.height),
      CANVAS_PORTRAIT,
    );
    expect(result.x).toBeCloseTo(rect.x, 8);
    expect(result.y).toBeCloseTo(rect.y, 8);
    expect(documentRectToPercentageCenter(result, CANVAS_PORTRAIT).x).toBeCloseTo(50, 8);
  });

  it("translates and unions rectangles without mutating the inputs", () => {
    const first = documentRect(10, 20, 40, 30);
    const second = translateRect(first, documentDelta(80, 50));
    const union = unionRects([first, second]);

    expect(first).toEqual({ x: 10, y: 20, width: 40, height: 30 });
    expect(second).toEqual({ x: 90, y: 70, width: 40, height: 30 });
    expect(union).toEqual({ x: 10, y: 20, width: 120, height: 80 });
    expect(unionRects([])).toBeNull();
  });

  it.each([CANVAS_SQUARE, CANVAS_PORTRAIT, CANVAS_STORY])(
    "clamps partially outside elements inside a %sx%s canvas",
    canvas => {
      const bounds = documentRect(0, 0, canvas.width, canvas.height);
      expect(clampRectToBounds(documentRect(-10, canvas.height - 20, 50, 50), bounds)).toEqual({
        x: 0,
        y: canvas.height - 50,
        width: 50,
        height: 50,
      });
    },
  );

  it("centers oversized elements with symmetric overflow", () => {
    const bounds = documentRect(0, 0, CANVAS_STORY.width, CANVAS_STORY.height);
    expect(clampRectToBounds(documentRect(100, 200, 400, 700), bounds)).toEqual({
      x: -20,
      y: -30,
      width: 400,
      height: 700,
    });
  });

  it("clamps points and rejects inverted numeric ranges", () => {
    const bounds = documentRect(10, 20, 100, 80);
    expect(clampPointToRect(documentPoint(-5, 200), bounds)).toEqual({ x: 10, y: 100 });
    expect(clamp(4, 0, 10)).toBe(4);
    expect(() => clamp(4, 10, 0)).toThrow(GeometryError);
  });
});

describe("rotation bounds", () => {
  const rect = documentRect(10, 20, 100, 50);

  it("normalizes negative and overflowing rotations", () => {
    expect(normalizeRotationDegrees(-90)).toBe(270);
    expect(normalizeRotationDegrees(450)).toBe(90);
    expect(normalizeRotationDegrees(-360)).toBe(0);
  });

  it("preserves bounds at zero degrees", () => {
    expect(rotatedRectBounds(rect, 0)).toBe(rect);
  });

  it("computes axis-aligned bounds at 90 and negative 90 degrees", () => {
    for (const rotation of [90, -90]) {
      const result = rotatedRectBounds(rect, rotation);
      expect(result.x).toBeCloseTo(35, 8);
      expect(result.y).toBeCloseTo(-5, 8);
      expect(result.width).toBeCloseTo(50, 8);
      expect(result.height).toBeCloseTo(100, 8);
    }
  });

  it("computes axis-aligned bounds at 45 degrees", () => {
    const result = rotatedRectBounds(rect, 45);
    const expectedSide = 75 * Math.SQRT2;
    expect(result.width).toBeCloseTo(expectedSide, 8);
    expect(result.height).toBeCloseTo(expectedSide, 8);
    expect(centerOfRect(result)).toEqual(centerOfRect(rect));
  });

  it("keeps rotated visual bounds inside the canvas without changing size", () => {
    const canvas = documentRect(0, 0, 360, 360);
    const result = clampRotatedRectToBounds(documentRect(-20, -10, 100, 50), 45, canvas);
    const visual = rotatedRectBounds(result, 45);
    expect(visual.x).toBeCloseTo(0, 8);
    expect(visual.y).toBeCloseTo(0, 8);
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
  });
});

describe("resize constraints", () => {
  const rect = documentRect(100, 100, 80, 60);
  const delta = documentDelta(10, 15);
  const expectations: Record<ResizeHandle, ReturnType<typeof documentRect>> = {
    "top-left": documentRect(110, 115, 70, 45),
    top: documentRect(100, 115, 80, 45),
    "top-right": documentRect(100, 115, 90, 45),
    right: documentRect(100, 100, 90, 60),
    "bottom-right": documentRect(100, 100, 90, 75),
    bottom: documentRect(100, 100, 80, 75),
    "bottom-left": documentRect(110, 100, 70, 75),
    left: documentRect(110, 100, 70, 60),
  };

  it.each(Object.entries(expectations) as [ResizeHandle, ReturnType<typeof documentRect>][]) (
    "resizes from the %s handle while keeping opposite edges fixed",
    (handle, expected) => {
      expect(resizeRect(rect, handle, delta)).toEqual(expected);
    },
  );

  it("enforces minimum dimensions while preserving the opposite edge", () => {
    expect(resizeRect(rect, "left", documentDelta(100, 0), { minWidth: 40 })).toEqual({
      x: 140,
      y: 100,
      width: 40,
      height: 60,
    });
    expect(resizeRect(rect, "top", documentDelta(0, 100), { minHeight: 25 })).toEqual({
      x: 100,
      y: 135,
      width: 80,
      height: 25,
    });
  });

  it("constrains moving resize edges to optional bounds", () => {
    const initial = documentRect(20, 20, 80, 60);
    const bounds = documentRect(0, 0, 150, 150);

    expect(resizeRect(initial, "top-left", documentDelta(-50, -50), { bounds })).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    });
    expect(resizeRect(initial, "bottom-right", documentDelta(500, 500), { bounds })).toEqual({
      x: 20,
      y: 20,
      width: 130,
      height: 130,
    });
  });

  it("rejects minimum sizes that cannot fit inside explicit bounds", () => {
    expect(() =>
      resizeRect(rect, "right", documentDelta(0, 0), {
        minWidth: 200,
        bounds: documentRect(0, 0, 150, 150),
      }),
    ).toThrow(/minimum size/);
  });

  it.each([
    ["top-left", documentDelta(-20, -10), documentRect(80, 90, 100, 70)],
    ["top-right", documentDelta(20, -10), documentRect(100, 90, 100, 70)],
    ["bottom-right", documentDelta(20, 10), documentRect(100, 100, 100, 75)],
    ["bottom-left", documentDelta(-20, 10), documentRect(80, 100, 100, 75)],
  ] as const)("resizes proportionally from %s", (handle, movement, expectedAnchor) => {
    const result = resizeRectProportionally(rect, handle, movement, { aspectRatio: 4 / 3 });
    expect(result.width / result.height).toBeCloseTo(4 / 3, 8);
    if (handle.includes("left")) expect(result.x + result.width).toBeCloseTo(rect.x + rect.width, 8);
    else expect(result.x).toBe(rect.x);
    if (handle.includes("top")) expect(result.y + result.height).toBeCloseTo(rect.y + rect.height, 8);
    else expect(result.y).toBe(rect.y);
    expect(expectedAnchor.width).toBeGreaterThan(0);
  });

  it("enforces proportional minimums and bounds", () => {
    const minimum = resizeRectProportionally(rect, "bottom-right", documentDelta(-200, -200), {
      aspectRatio: 4 / 3,
      minWidth: 40,
      minHeight: 40,
    });
    expect(minimum.x).toBe(100);
    expect(minimum.y).toBe(100);
    expect(minimum.width).toBeCloseTo(160 / 3, 8);
    expect(minimum.height).toBe(40);

    const bounded = resizeRectProportionally(rect, "bottom-right", documentDelta(500, 500), {
      aspectRatio: 4 / 3,
      bounds: documentRect(0, 0, 200, 200),
    });
    expect(bounded).toEqual(documentRect(100, 100, 100, 75));
  });

  it("rejects proportional resize from a side handle", () => {
    expect(() => resizeRectProportionally(rect, "right", documentDelta(10, 0), { aspectRatio: 1 }))
      .toThrow(/corner handle/);
  });
});
