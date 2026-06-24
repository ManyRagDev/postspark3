import {
  GeometryError,
  canvasViewport,
  positiveNumber,
  type CanvasViewport,
  type DocumentSize,
  type ScreenRect,
} from "./types";

export const MAX_RELATIVE_SCALE_DIFFERENCE = 0.001;

export function relativeScaleDifference(scaleX: number, scaleY: number): number {
  const x = positiveNumber(scaleX, "relativeScaleDifference.scaleX");
  const y = positiveNumber(scaleY, "relativeScaleDifference.scaleY");
  return Math.abs(x - y) / Math.max(x, y);
}

export function createCanvasViewport(
  screenRect: ScreenRect,
  documentSize: DocumentSize,
  maxRelativeScaleDifference = MAX_RELATIVE_SCALE_DIFFERENCE,
): CanvasViewport {
  const tolerance = positiveNumber(
    maxRelativeScaleDifference,
    "createCanvasViewport.maxRelativeScaleDifference",
  );

  if (screenRect.width <= 0 || screenRect.height <= 0) {
    throw new GeometryError("createCanvasViewport requires a positive screen size");
  }

  const scaleX = screenRect.width / documentSize.width;
  const scaleY = screenRect.height / documentSize.height;

  if (relativeScaleDifference(scaleX, scaleY) > tolerance) {
    throw new GeometryError("createCanvasViewport does not accept a non-uniform canvas scale");
  }

  return canvasViewport(screenRect, documentSize, scaleX, scaleY);
}
