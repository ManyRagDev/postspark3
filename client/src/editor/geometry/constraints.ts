import {
  GeometryError,
  documentPoint,
  documentRect,
  finiteNumber,
  nonNegativeNumber,
  positiveNumber,
  type DocumentDelta,
  type DocumentPoint,
  type DocumentRect,
  type ResizeHandle,
} from "./types";
import { rotatedRectBounds } from "./bounds";

export interface ResizeOptions {
  minWidth?: number;
  minHeight?: number;
  bounds?: DocumentRect;
}

export interface ProportionalResizeOptions extends ResizeOptions {
  aspectRatio: number;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  const current = finiteNumber(value, "clamp.value");
  const min = finiteNumber(minimum, "clamp.minimum");
  const max = finiteNumber(maximum, "clamp.maximum");
  if (min > max) {
    throw new GeometryError("clamp.minimum must not exceed clamp.maximum");
  }
  return Math.min(max, Math.max(min, current));
}

export function clampPointToRect(point: DocumentPoint, bounds: DocumentRect): DocumentPoint {
  return documentPoint(
    clamp(point.x, bounds.x, bounds.x + bounds.width),
    clamp(point.y, bounds.y, bounds.y + bounds.height),
  );
}

function clampAxisPosition(
  position: number,
  size: number,
  boundsStart: number,
  boundsSize: number,
): number {
  if (size > boundsSize) {
    return boundsStart + (boundsSize - size) / 2;
  }
  return clamp(position, boundsStart, boundsStart + boundsSize - size);
}

export function clampRectToBounds(rect: DocumentRect, bounds: DocumentRect): DocumentRect {
  return documentRect(
    clampAxisPosition(rect.x, rect.width, bounds.x, bounds.width),
    clampAxisPosition(rect.y, rect.height, bounds.y, bounds.height),
    rect.width,
    rect.height,
  );
}

/**
 * Clamps a translated rect without "repairing" overflow that already existed
 * when the gesture began. This makes a zero delta an identity operation and
 * prevents the first pointer frame from producing an unrelated jump.
 */
export function clampDragRectPreservingInitialOverflow(
  initial: DocumentRect,
  translated: DocumentRect,
  bounds: DocumentRect,
): DocumentRect {
  const clampAxis = (
    initialStart: number,
    nextStart: number,
    size: number,
    boundsStart: number,
    boundsSize: number,
  ) => {
    const boundsEnd = boundsStart + boundsSize;
    const initialEnd = initialStart + size;
    const nextEnd = nextStart + size;
    const initialBefore = Math.max(0, boundsStart - initialStart);
    const initialAfter = Math.max(0, initialEnd - boundsEnd);

    // Existing overflow is tolerated, but a gesture may not increase it.
    const minimum = boundsStart - initialBefore;
    const maximum = boundsEnd + initialAfter - size;
    if (minimum > maximum) return initialStart;
    if (nextStart < minimum) return minimum;
    if (nextEnd > boundsEnd + initialAfter) return maximum;
    return nextStart;
  };

  return documentRect(
    clampAxis(initial.x, translated.x, translated.width, bounds.x, bounds.width),
    clampAxis(initial.y, translated.y, translated.height, bounds.y, bounds.height),
    translated.width,
    translated.height,
  );
}

export function clampRotatedRectToBounds(
  rect: DocumentRect,
  rotationDeg: number,
  bounds: DocumentRect,
): DocumentRect {
  const visualBounds = rotatedRectBounds(rect, rotationDeg);
  const clamped = clampRectToBounds(visualBounds, bounds);
  if (
    Math.abs(clamped.x - visualBounds.x) <= Number.EPSILON * 64 &&
    Math.abs(clamped.y - visualBounds.y) <= Number.EPSILON * 64
  ) return rect;
  return documentRect(
    rect.x + clamped.x - visualBounds.x,
    rect.y + clamped.y - visualBounds.y,
    rect.width,
    rect.height,
  );
}

function hasLeft(handle: ResizeHandle): boolean {
  return handle === "left" || handle === "top-left" || handle === "bottom-left";
}

function hasRight(handle: ResizeHandle): boolean {
  return handle === "right" || handle === "top-right" || handle === "bottom-right";
}

function hasTop(handle: ResizeHandle): boolean {
  return handle === "top" || handle === "top-left" || handle === "top-right";
}

function hasBottom(handle: ResizeHandle): boolean {
  return handle === "bottom" || handle === "bottom-left" || handle === "bottom-right";
}

export function resizeRect(
  rect: DocumentRect,
  handle: ResizeHandle,
  delta: DocumentDelta,
  options: ResizeOptions = {},
): DocumentRect {
  const minWidth = nonNegativeNumber(options.minWidth ?? 0, "resizeRect.minWidth");
  const minHeight = nonNegativeNumber(options.minHeight ?? 0, "resizeRect.minHeight");
  const bounds = options.bounds;

  if (bounds && (minWidth > bounds.width || minHeight > bounds.height)) {
    throw new GeometryError("resizeRect minimum size must fit inside bounds");
  }

  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;

  if (hasLeft(handle)) {
    const lower = bounds?.x ?? -Number.MAX_VALUE;
    const upper = right - minWidth;
    left = Math.min(upper, Math.max(lower, rect.x + delta.x));
  } else if (hasRight(handle)) {
    const lower = left + minWidth;
    const upper = bounds ? bounds.x + bounds.width : Number.MAX_VALUE;
    right = Math.max(lower, Math.min(upper, right + delta.x));
  }

  if (hasTop(handle)) {
    const lower = bounds?.y ?? -Number.MAX_VALUE;
    const upper = bottom - minHeight;
    top = Math.min(upper, Math.max(lower, rect.y + delta.y));
  } else if (hasBottom(handle)) {
    const lower = top + minHeight;
    const upper = bounds ? bounds.y + bounds.height : Number.MAX_VALUE;
    bottom = Math.max(lower, Math.min(upper, bottom + delta.y));
  }

  return documentRect(left, top, right - left, bottom - top);
}

export function resizeRectProportionally(
  rect: DocumentRect,
  handle: ResizeHandle,
  delta: DocumentDelta,
  options: ProportionalResizeOptions,
): DocumentRect {
  const isLeft = handle === "top-left" || handle === "bottom-left";
  const isRight = handle === "top-right" || handle === "bottom-right";
  const isTop = handle === "top-left" || handle === "top-right";
  const isBottom = handle === "bottom-left" || handle === "bottom-right";
  if ((!isLeft && !isRight) || (!isTop && !isBottom)) {
    throw new GeometryError("resizeRectProportionally requires a corner handle");
  }

  const aspectRatio = positiveNumber(options.aspectRatio, "resizeRectProportionally.aspectRatio");
  const minWidth = nonNegativeNumber(options.minWidth ?? 0, "resizeRectProportionally.minWidth");
  const minHeight = nonNegativeNumber(options.minHeight ?? 0, "resizeRectProportionally.minHeight");
  const horizontalWidth = isLeft ? rect.width - delta.x : rect.width + delta.x;
  const verticalHeight = isTop ? rect.height - delta.y : rect.height + delta.y;
  const scaleX = horizontalWidth / rect.width;
  const scaleY = verticalHeight / rect.height;
  let scale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
  scale = Math.max(scale, minWidth / rect.width, minHeight / rect.height, 0);

  const anchorX = isLeft ? rect.x + rect.width : rect.x;
  const anchorY = isTop ? rect.y + rect.height : rect.y;
  if (options.bounds) {
    const maxWidth = isLeft
      ? anchorX - options.bounds.x
      : options.bounds.x + options.bounds.width - anchorX;
    const maxHeight = isTop
      ? anchorY - options.bounds.y
      : options.bounds.y + options.bounds.height - anchorY;
    scale = Math.min(scale, maxWidth / rect.width, maxHeight / rect.height);
  }

  const width = Math.max(minWidth, rect.width * scale);
  const height = width / aspectRatio;
  return documentRect(
    isLeft ? anchorX - width : anchorX,
    isTop ? anchorY - height : anchorY,
    width,
    height,
  );
}
