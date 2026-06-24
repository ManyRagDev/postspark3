import {
  documentDelta,
  documentPoint,
  documentRect,
  finiteNumber,
  nonNegativeNumber,
  screenDelta,
  screenPoint,
  screenRect,
  type CanvasViewport,
  type DocumentDelta,
  type DocumentPoint,
  type DocumentRect,
  type ScreenDelta,
  type ScreenPoint,
  type ScreenRect,
} from "./types";

export type Axis = "x" | "y";

export function screenToDocumentPoint(
  point: ScreenPoint,
  viewport: CanvasViewport,
): DocumentPoint {
  return documentPoint(
    (point.x - viewport.screenRect.x) / viewport.scaleX,
    (point.y - viewport.screenRect.y) / viewport.scaleY,
  );
}

export function documentToScreenPoint(
  point: DocumentPoint,
  viewport: CanvasViewport,
): ScreenPoint {
  return screenPoint(
    viewport.screenRect.x + point.x * viewport.scaleX,
    viewport.screenRect.y + point.y * viewport.scaleY,
  );
}

export function screenToDocumentDelta(
  delta: ScreenDelta,
  viewport: CanvasViewport,
): DocumentDelta {
  return documentDelta(delta.x / viewport.scaleX, delta.y / viewport.scaleY);
}

export function documentToScreenDelta(
  delta: DocumentDelta,
  viewport: CanvasViewport,
): ScreenDelta {
  return screenDelta(delta.x * viewport.scaleX, delta.y * viewport.scaleY);
}

export function screenToDocumentRect(
  rect: ScreenRect,
  viewport: CanvasViewport,
): DocumentRect {
  return documentRect(
    (rect.x - viewport.screenRect.x) / viewport.scaleX,
    (rect.y - viewport.screenRect.y) / viewport.scaleY,
    rect.width / viewport.scaleX,
    rect.height / viewport.scaleY,
  );
}

export function documentToScreenRect(
  rect: DocumentRect,
  viewport: CanvasViewport,
): ScreenRect {
  return screenRect(
    viewport.screenRect.x + rect.x * viewport.scaleX,
    viewport.screenRect.y + rect.y * viewport.scaleY,
    rect.width * viewport.scaleX,
    rect.height * viewport.scaleY,
  );
}

export function screenPixelsToDocumentUnits(
  screenPixels: number,
  viewport: CanvasViewport,
  axis: Axis,
): number {
  const pixels = nonNegativeNumber(screenPixels, "screenPixelsToDocumentUnits.screenPixels");
  const result = pixels / (axis === "x" ? viewport.scaleX : viewport.scaleY);
  return finiteNumber(result, "screenPixelsToDocumentUnits.result");
}

export function documentUnitsToScreenPixels(
  documentUnits: number,
  viewport: CanvasViewport,
  axis: Axis,
): number {
  const units = nonNegativeNumber(documentUnits, "documentUnitsToScreenPixels.documentUnits");
  const result = units * (axis === "x" ? viewport.scaleX : viewport.scaleY);
  return finiteNumber(result, "documentUnitsToScreenPixels.result");
}
