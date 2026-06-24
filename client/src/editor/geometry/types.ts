declare const geometryType: unique symbol;

type Opaque<T, Name extends string> = T & {
  readonly [geometryType]: Name;
};

export type ScreenPoint = Opaque<Readonly<{ x: number; y: number }>, "ScreenPoint">;
export type ScreenDelta = Opaque<Readonly<{ x: number; y: number }>, "ScreenDelta">;
export type ScreenRect = Opaque<
  Readonly<{ x: number; y: number; width: number; height: number }>,
  "ScreenRect"
>;

export type DocumentPoint = Opaque<Readonly<{ x: number; y: number }>, "DocumentPoint">;
export type DocumentDelta = Opaque<Readonly<{ x: number; y: number }>, "DocumentDelta">;
export type DocumentSize = Opaque<Readonly<{ width: number; height: number }>, "DocumentSize">;
export type DocumentRect = Opaque<
  Readonly<{ x: number; y: number; width: number; height: number }>,
  "DocumentRect"
>;

export type PercentagePoint = Opaque<Readonly<{ x: number; y: number }>, "PercentagePoint">;

export type ElementKind = "block" | "text" | "image" | "card";

export type ElementGeometry = Opaque<
  Readonly<{
    id: string;
    kind: ElementKind;
    rect: DocumentRect;
    rotationDeg: number;
  }>,
  "ElementGeometry"
>;

export type ResizeHandle =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left";

export type CanvasViewport = Opaque<
  Readonly<{
    screenRect: ScreenRect;
    documentSize: DocumentSize;
    scaleX: number;
    scaleY: number;
  }>,
  "CanvasViewport"
>;

export class GeometryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeometryError";
  }
}

export function normalizeNegativeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

export function finiteNumber(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new GeometryError(`${label} must be finite`);
  }
  return normalizeNegativeZero(value);
}

export function nonNegativeNumber(value: number, label: string): number {
  const normalized = finiteNumber(value, label);
  if (normalized < 0) {
    throw new GeometryError(`${label} must be greater than or equal to zero`);
  }
  return normalized;
}

export function positiveNumber(value: number, label: string): number {
  const normalized = finiteNumber(value, label);
  if (normalized <= 0) {
    throw new GeometryError(`${label} must be greater than zero`);
  }
  return normalized;
}

export function screenPoint(x: number, y: number): ScreenPoint {
  return {
    x: finiteNumber(x, "screenPoint.x"),
    y: finiteNumber(y, "screenPoint.y"),
  } as ScreenPoint;
}

export function screenDelta(x: number, y: number): ScreenDelta {
  return {
    x: finiteNumber(x, "screenDelta.x"),
    y: finiteNumber(y, "screenDelta.y"),
  } as ScreenDelta;
}

export function screenRect(x: number, y: number, width: number, height: number): ScreenRect {
  return {
    x: finiteNumber(x, "screenRect.x"),
    y: finiteNumber(y, "screenRect.y"),
    width: nonNegativeNumber(width, "screenRect.width"),
    height: nonNegativeNumber(height, "screenRect.height"),
  } as ScreenRect;
}

export function documentPoint(x: number, y: number): DocumentPoint {
  return {
    x: finiteNumber(x, "documentPoint.x"),
    y: finiteNumber(y, "documentPoint.y"),
  } as DocumentPoint;
}

export function documentDelta(x: number, y: number): DocumentDelta {
  return {
    x: finiteNumber(x, "documentDelta.x"),
    y: finiteNumber(y, "documentDelta.y"),
  } as DocumentDelta;
}

export function documentSize(width: number, height: number): DocumentSize {
  return {
    width: positiveNumber(width, "documentSize.width"),
    height: positiveNumber(height, "documentSize.height"),
  } as DocumentSize;
}

export function documentRect(x: number, y: number, width: number, height: number): DocumentRect {
  return {
    x: finiteNumber(x, "documentRect.x"),
    y: finiteNumber(y, "documentRect.y"),
    width: nonNegativeNumber(width, "documentRect.width"),
    height: nonNegativeNumber(height, "documentRect.height"),
  } as DocumentRect;
}

export function percentagePoint(x: number, y: number): PercentagePoint {
  return {
    x: finiteNumber(x, "percentagePoint.x"),
    y: finiteNumber(y, "percentagePoint.y"),
  } as PercentagePoint;
}

export function elementGeometry(
  id: string,
  kind: ElementKind,
  rect: DocumentRect,
  rotationDeg = 0,
): ElementGeometry {
  if (!id.trim()) {
    throw new GeometryError("elementGeometry.id must not be empty");
  }
  return {
    id,
    kind,
    rect,
    rotationDeg: finiteNumber(rotationDeg, "elementGeometry.rotationDeg"),
  } as ElementGeometry;
}

export function canvasViewport(
  screen: ScreenRect,
  size: DocumentSize,
  scaleX: number,
  scaleY: number,
): CanvasViewport {
  return {
    screenRect: screen,
    documentSize: size,
    scaleX: positiveNumber(scaleX, "canvasViewport.scaleX"),
    scaleY: positiveNumber(scaleY, "canvasViewport.scaleY"),
  } as CanvasViewport;
}
