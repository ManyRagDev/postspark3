import {
  type AdvancedLayoutSettings,
  type AspectRatio,
  type LayoutPosition,
  type PostVisualSnapshot,
  type TextElement,
} from "@shared/postspark";
import { layoutToAdvanced } from "@/lib/layoutToAdvanced";

const REFERENCE_CANVAS_WIDTH = 360;
const MIN_CARD_WIDTH = 72;
const MIN_STRUCTURED_CARD_WIDTH = 90;
const MIN_TEXT_GAP = 4;

export type VisualFitIssueType =
  | "headline_body_overlap"
  | "structured_absolute_layout"
  | "card_too_narrow"
  | "text_element_outside_canvas"
  | "text_element_overlaps_copy";

export interface VisualFitIssue {
  type: VisualFitIssueType;
  target: string;
  detail: string;
}

export interface VisualFitResult {
  ok: boolean;
  issues: VisualFitIssue[];
  suggestedFallback?: "flow-layout" | "expand-card" | "drop-text-elements";
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function canvasHeight(aspectRatio: AspectRatio): number {
  const [w, h] = aspectRatio.split(":").map(Number);
  if (!w || !h) return REFERENCE_CANVAS_WIDTH;
  return (REFERENCE_CANVAS_WIDTH * h) / w;
}

function textHeightPercent(
  text: string,
  widthPercent: number,
  aspectRatio: AspectRatio,
  kind: "headline" | "body",
): number {
  const fontPx = kind === "headline" ? 26 : 13;
  const lineHeight = kind === "headline" ? 1.15 : 1.55;
  const widthPx = (Math.max(10, Math.min(100, widthPercent)) / 100) * REFERENCE_CANVAS_WIDTH;
  const charsPerLine = Math.max(6, widthPx / (fontPx * 0.55));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  return Math.min(100, ((lines * fontPx * lineHeight) / canvasHeight(aspectRatio)) * 100 * 1.2);
}

function positionCenter(position: LayoutPosition["position"]): { x: number; y: number } {
  switch (position) {
    case "top-left":
      return { x: 25, y: 18 };
    case "top-center":
      return { x: 50, y: 18 };
    case "top-right":
      return { x: 75, y: 18 };
    case "center-left":
      return { x: 25, y: 50 };
    case "center":
      return { x: 50, y: 50 };
    case "center-right":
      return { x: 75, y: 50 };
    case "bottom-left":
      return { x: 25, y: 82 };
    case "bottom-center":
      return { x: 50, y: 82 };
    case "bottom-right":
      return { x: 75, y: 82 };
    default:
      return { x: 50, y: 50 };
  }
}

function layoutRect(
  pos: LayoutPosition,
  text: string,
  aspectRatio: AspectRatio,
  kind: "headline" | "body",
): Rect {
  const width = pos.width ?? 80;
  const center = pos.freePosition ?? positionCenter(pos.position);
  const height = textHeightPercent(text, width, aspectRatio, kind);
  return {
    left: center.x - width / 2,
    right: center.x + width / 2,
    top: center.y - height / 2,
    bottom: center.y + height / 2,
  };
}

function textElementRect(element: TextElement, aspectRatio: AspectRatio): Rect {
  const widthPx = typeof element.width === "number" ? element.width : 120;
  const fontPx = Number.parseFloat(element.styles.fontSize || "16") || 16;
  const lineHeight = Number.parseFloat(element.styles.lineHeight || "1.2") || 1.2;
  const charsPerLine = Math.max(4, widthPx / (fontPx * 0.55));
  const lines = Math.max(1, Math.ceil(element.text.length / charsPerLine));
  const heightPx = typeof element.height === "number"
    ? element.height
    : lines * fontPx * lineHeight + 4;
  const height = canvasHeight(aspectRatio);
  return {
    left: (element.x / REFERENCE_CANVAS_WIDTH) * 100,
    right: ((element.x + widthPx) / REFERENCE_CANVAS_WIDTH) * 100,
    top: (element.y / height) * 100,
    bottom: ((element.y + heightPx) / height) * 100,
  };
}

function overlaps(a: Rect, b: Rect, gap = 0): boolean {
  return a.left < b.right + gap &&
    a.right > b.left - gap &&
    a.top < b.bottom + gap &&
    a.bottom > b.top - gap;
}

function outside(rect: Rect): boolean {
  return rect.left < 0 || rect.top < 0 || rect.right > 100 || rect.bottom > 100;
}

function isGeneratedDecoration(element: TextElement): boolean {
  return element.id.startsWith("cd-");
}

function flowLayout(snapshot: PostVisualSnapshot): AdvancedLayoutSettings {
  return layoutToAdvanced(snapshot.layout);
}

function hasStructuredSections(snapshot: PostVisualSnapshot): boolean {
  return (snapshot.template ?? "simple") !== "simple" && (snapshot.sections?.length ?? 0) > 0;
}

export function validateVisualFit(snapshot: PostVisualSnapshot): VisualFitResult {
  const issues: VisualFitIssue[] = [];
  const structured = hasStructuredSections(snapshot);
  const { layoutSettings } = snapshot;
  const headlineRect = layoutRect(layoutSettings.headline, snapshot.headline ?? "", snapshot.aspectRatio, "headline");
  const bodyRect = snapshot.body
    ? layoutRect(layoutSettings.body, snapshot.body, snapshot.aspectRatio, "body")
    : undefined;

  if (
    structured &&
    (layoutSettings.headline.freePosition ||
      layoutSettings.body.freePosition ||
      layoutSettings.card.freePosition)
  ) {
    issues.push({
      type: "structured_absolute_layout",
      target: "layoutSettings",
      detail: "Structured templates must render headline, body and sections in flow.",
    });
  }

  if (bodyRect && overlaps(headlineRect, bodyRect, MIN_TEXT_GAP)) {
    issues.push({
      type: "headline_body_overlap",
      target: "headline/body",
      detail: "Estimated headline and body boxes overlap.",
    });
  }

  const cardWidth = layoutSettings.card.width ?? 100;
  const requiredCardWidth = structured ? MIN_STRUCTURED_CARD_WIDTH : MIN_CARD_WIDTH;
  if (cardWidth < requiredCardWidth) {
    issues.push({
      type: "card_too_narrow",
      target: "card",
      detail: `Card width ${cardWidth}% is below required ${requiredCardWidth}%.`,
    });
  }

  for (const element of snapshot.textElements ?? []) {
    if (!isGeneratedDecoration(element)) continue;
    const rect = textElementRect(element, snapshot.aspectRatio);
    if (outside(rect)) {
      issues.push({
        type: "text_element_outside_canvas",
        target: element.id,
        detail: "Generated decorative text element is outside the canvas.",
      });
      continue;
    }
    if (overlaps(rect, headlineRect, 2) || (bodyRect && overlaps(rect, bodyRect, 2))) {
      issues.push({
        type: "text_element_overlaps_copy",
        target: element.id,
        detail: "Generated decorative text element overlaps primary copy.",
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    suggestedFallback: issues.some(issue => issue.type.startsWith("text_element"))
      ? "drop-text-elements"
      : issues.some(issue => issue.type === "card_too_narrow")
        ? "expand-card"
        : issues.length > 0
          ? "flow-layout"
          : undefined,
  };
}

export function applyVisualFitFallback(snapshot: PostVisualSnapshot): PostVisualSnapshot {
  const result = validateVisualFit(snapshot);
  if (result.ok) return snapshot;

  const structured = hasStructuredSections(snapshot);
  const flow = flowLayout(snapshot);
  let layoutSettings: AdvancedLayoutSettings = snapshot.layoutSettings;

  if (
    result.issues.some(issue =>
      issue.type === "headline_body_overlap" ||
      issue.type === "structured_absolute_layout",
    )
  ) {
    layoutSettings = {
      ...layoutSettings,
      headline: {
        ...layoutSettings.headline,
        ...flow.headline,
        backgroundColor: layoutSettings.headline.backgroundColor,
        borderRadius: layoutSettings.headline.borderRadius,
      },
      body: {
        ...layoutSettings.body,
        ...flow.body,
        backgroundColor: layoutSettings.body.backgroundColor,
        borderRadius: layoutSettings.body.borderRadius,
      },
      sectionLayouts: {},
    };
  }

  if (result.issues.some(issue => issue.type === "card_too_narrow" || issue.type === "structured_absolute_layout")) {
    layoutSettings = {
      ...layoutSettings,
      card: {
        ...layoutSettings.card,
        ...flow.card,
        width: structured ? 100 : Math.max(layoutSettings.card.width ?? 100, MIN_CARD_WIDTH),
        backgroundColor: layoutSettings.card.backgroundColor,
        borderRadius: layoutSettings.card.borderRadius,
      },
    };
  }

  const blockedGeneratedTextIds = new Set(
    result.issues
      .filter(issue => issue.type === "text_element_outside_canvas" || issue.type === "text_element_overlaps_copy")
      .map(issue => issue.target),
  );
  const textElements = snapshot.textElements?.filter(
    element => !blockedGeneratedTextIds.has(element.id),
  );

  return {
    ...snapshot,
    layoutSettings,
    textElements,
  };
}
