import { describe, expect, it } from "vitest";
import type { ImageElement, TextElement } from "@shared/postspark";
import {
  createCanvasViewport,
  documentRect,
  documentSize,
  elementGeometry,
  screenPoint,
  screenRect,
} from "../geometry";
import { NO_INTERACTION_MODIFIERS, type GeometryCommit } from "../interaction";
import {
  imageElementFromCommit,
  isImageGeometryTarget,
  isTextGeometryTarget,
  readImageGeometry,
  readTextGeometry,
  textElementFromCommit,
} from "./elementGeometryAdapters";

const text: TextElement = {
  id: "t1", text: "Texto", x: 20, y: 30, width: "auto", height: "auto", rotation: -8,
  styles: { fontSize: "24", fontFamily: "Inter", color: "#fff", fontWeight: "700", fontStyle: "normal", textDecoration: "none", textAlign: "left", lineHeight: "1.2", opacity: "1" },
};
const image: ImageElement = { id: "i1", url: "x", x: 12, y: 18, width: 100, height: "auto", rotation: 14 };

function commit(id: string, rect: ReturnType<typeof documentRect>, operation: "drag" | "resize"): GeometryCommit {
  const geometry = elementGeometry(id, id.startsWith("text") ? "text" : "image", rect, id.startsWith("text") ? text.rotation : image.rotation);
  return {
    operation,
    intent: operation === "drag" ? { type: "drag" } : { type: "resize", handle: "right" },
    elementId: id,
    kind: geometry.kind,
    initial: geometry,
    geometry,
    viewport: createCanvasViewport(screenRect(10, 20, 720, 720), documentSize(360, 360)),
    startScreenPoint: screenPoint(10, 20),
    finalScreenPoint: screenPoint(30, 40),
    modifiers: NO_INTERACTION_MODIFIERS,
  };
}

describe("element geometry adapters", () => {
  it.each([documentSize(360, 360), documentSize(360, 432), documentSize(360, 640)])("reads text and image in document space on $width x $height", () => {
    expect(readTextGeometry(text, documentSize(80, 36))).toMatchObject({ id: "textElement:t1", rotationDeg: -8, rect: { x: 20, y: 30, width: 80, height: 36 } });
    expect(readImageGeometry(image, documentSize(100, 50))).toMatchObject({ id: "imageElement:i1", rotationDeg: 14, rect: { x: 12, y: 18, width: 100, height: 50 } });
  });

  it("turns text auto width into numeric width and preserves styles and rotation", () => {
    const next = textElementFromCommit(text, commit("textElement:t1", documentRect(10, 20, 140, 42), "resize"));
    expect(next).toEqual({ ...text, x: 10, y: 20, width: 140, height: "auto" });
  });

  it("preserves auto image height and scales explicit image height", () => {
    expect(imageElementFromCommit(image, commit("imageElement:i1", documentRect(1, 2, 160, 80), "resize")))
      .toEqual({ ...image, x: 1, y: 2, width: 160, height: "auto" });
    const explicit = { ...image, height: 50 };
    expect(imageElementFromCommit(explicit, commit("imageElement:i1", documentRect(1, 2, 160, 80), "resize")))
      .toEqual({ ...explicit, x: 1, y: 2, width: 160, height: 80 });
  });

  it("recognizes only non-empty stable element targets", () => {
    expect(isTextGeometryTarget("textElement:t1")).toBe(true);
    expect(isImageGeometryTarget("imageElement:i1")).toBe(true);
    expect(isTextGeometryTarget("textElement: ")).toBe(false);
    expect(isImageGeometryTarget("imageElement:")).toBe(false);
  });
});
