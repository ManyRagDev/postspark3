import type { DocumentPoint, DocumentRect } from "../geometry";
import { documentRect } from "../geometry";

export type SnapAnchor = "left" | "center" | "right" | "top" | "middle" | "bottom";

export const HORIZONTAL_ANCHORS: readonly SnapAnchor[] = ["left", "center", "right"];
export const VERTICAL_ANCHORS: readonly SnapAnchor[] = ["top", "middle", "bottom"];

export interface SnapCandidate {
  id: string;
  rect: DocumentRect;
}

export interface SnapResult {
  snapX: number | null;
  snapY: number | null;
  guideX: number | null;
  guideY: number | null;
  candidateIdX: string | null;
  candidateIdY: string | null;
}

export interface SnapConfig {
  toleranceScreenPx: number;
  hysteresisMultiplier: number;
  isSnapEnabled: boolean;
  altSuspended: boolean;
}

export const DEFAULT_SNAP_CONFIG: SnapConfig = {
  toleranceScreenPx: 6,
  hysteresisMultiplier: 2,
  isSnapEnabled: true,
  altSuspended: false,
};

function anchorPosition(rect: DocumentRect, anchor: SnapAnchor): number {
  switch (anchor) {
    case "left": return rect.x;
    case "center": return rect.x + rect.width / 2;
    case "right": return rect.x + rect.width;
    case "top": return rect.y;
    case "middle": return rect.y + rect.height / 2;
    case "bottom": return rect.y + rect.height;
  }
}

export function snapDraft(
  draft: DocumentRect,
  candidates: readonly SnapCandidate[],
  config: SnapConfig,
  viewportScaleX: number,
  viewportScaleY: number,
): { rect: DocumentRect; guides: SnapResult } {
  const result: SnapResult = {
    snapX: null,
    snapY: null,
    guideX: null,
    guideY: null,
    candidateIdX: null,
    candidateIdY: null,
  };

  if (!config.isSnapEnabled || config.altSuspended || candidates.length === 0) {
    return { rect: draft, guides: result };
  }

  const toleranceX = config.toleranceScreenPx / viewportScaleX;
  const toleranceY = config.toleranceScreenPx / viewportScaleY;
  const hysteresisX = toleranceX * config.hysteresisMultiplier;
  const hysteresisY = toleranceY * config.hysteresisMultiplier;

  let bestDeltaX = Infinity;
  let bestDeltaY = Infinity;

  for (const candidate of candidates) {
    for (const dragAnchorX of HORIZONTAL_ANCHORS) {
      const dragPosX = anchorPosition(draft, dragAnchorX);
      for (const candAnchorX of HORIZONTAL_ANCHORS) {
        const candPosX = anchorPosition(candidate.rect, candAnchorX);
        const delta = Math.abs(dragPosX - candPosX);
        if (delta < bestDeltaX && delta <= hysteresisX && delta <= toleranceX) {
          bestDeltaX = delta;
          result.snapX = dragPosX;
          result.guideX = candPosX;
          result.candidateIdX = candidate.id;
        }
      }
    }

    for (const dragAnchorY of VERTICAL_ANCHORS) {
      const dragPosY = anchorPosition(draft, dragAnchorY);
      for (const candAnchorY of VERTICAL_ANCHORS) {
        const candPosY = anchorPosition(candidate.rect, candAnchorY);
        const delta = Math.abs(dragPosY - candPosY);
        if (delta < bestDeltaY && delta <= hysteresisY && delta <= toleranceY) {
          bestDeltaY = delta;
          result.snapY = dragPosY;
          result.guideY = candPosY;
          result.candidateIdY = candidate.id;
        }
      }
    }
  }

  let snappedX = draft.x;
  let snappedY = draft.y;
  if (result.snapX !== null && result.guideX !== null) {
    snappedX = draft.x + (result.guideX - result.snapX);
  }
  if (result.snapY !== null && result.guideY !== null) {
    snappedY = draft.y + (result.guideY - result.snapY);
  }
  const snappedRect = documentRect(snappedX, snappedY, draft.width, draft.height);

  return { rect: snappedRect, guides: result };
}

export function buildCanvasCandidate(id: string, width: number, height: number): SnapCandidate {
  return { id, rect: documentRect(0, 0, width, height) };
}
