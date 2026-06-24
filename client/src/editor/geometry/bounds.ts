import {
  documentPoint,
  documentRect,
  finiteNumber,
  percentagePoint,
  type DocumentDelta,
  type DocumentPoint,
  type DocumentRect,
  type DocumentSize,
  type PercentagePoint,
} from "./types";

export function centerOfRect(rect: DocumentRect): DocumentPoint {
  return documentPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
}

export function rectFromCenter(center: DocumentPoint, size: DocumentSize): DocumentRect {
  return documentRect(
    center.x - size.width / 2,
    center.y - size.height / 2,
    size.width,
    size.height,
  );
}

export function translateRect(rect: DocumentRect, delta: DocumentDelta): DocumentRect {
  return documentRect(rect.x + delta.x, rect.y + delta.y, rect.width, rect.height);
}

export function unionRects(rects: readonly DocumentRect[]): DocumentRect | null {
  if (rects.length === 0) return null;

  let left = rects[0].x;
  let top = rects[0].y;
  let right = rects[0].x + rects[0].width;
  let bottom = rects[0].y + rects[0].height;

  for (const rect of rects.slice(1)) {
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }

  return documentRect(left, top, right - left, bottom - top);
}

export function normalizeRotationDegrees(rotationDeg: number): number {
  const rotation = finiteNumber(rotationDeg, "normalizeRotationDegrees.rotationDeg");
  const normalized = ((rotation % 360) + 360) % 360;
  return Object.is(normalized, -0) ? 0 : normalized;
}

export function rotatedRectBounds(rect: DocumentRect, rotationDeg: number): DocumentRect {
  const rotation = normalizeRotationDegrees(rotationDeg);
  if (rotation === 0) return rect;

  const radians = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const width = rect.width * cos + rect.height * sin;
  const height = rect.width * sin + rect.height * cos;

  return documentRect(
    rect.x + rect.width / 2 - width / 2,
    rect.y + rect.height / 2 - height / 2,
    width,
    height,
  );
}

export function documentRectToPercentageCenter(
  rect: DocumentRect,
  canvas: DocumentSize,
): PercentagePoint {
  const center = centerOfRect(rect);
  return percentagePoint(
    (center.x / canvas.width) * 100,
    (center.y / canvas.height) * 100,
  );
}

export function percentageCenterToDocumentRect(
  center: PercentagePoint,
  size: DocumentSize,
  canvas: DocumentSize,
): DocumentRect {
  return rectFromCenter(
    documentPoint(
      (center.x / 100) * canvas.width,
      (center.y / 100) * canvas.height,
    ),
    size,
  );
}
