import {
  clampRectToBounds,
  clampDragRectPreservingInitialOverflow,
  clampRotatedRectToBounds,
  documentDelta,
  documentRect,
  elementGeometry,
  resizeRect,
  resizeRectProportionally,
  screenToDocumentPoint,
  translateRect,
  type DocumentRect,
  type ElementGeometry,
} from "../geometry";
import { IDLE_INTERACTION_STATE } from "./transientStore";
import type {
  GeometryCommit,
  InteractionEvent,
  InteractionOperation,
  InteractionState,
} from "./types";

function canvasBounds(state: Extract<InteractionState, { phase: "pressing" | "dragging" | "resizing" }>): DocumentRect {
  return state.constraints.bounds ?? documentRect(
    0,
    0,
    state.viewport.documentSize.width,
    state.viewport.documentSize.height,
  );
}

function geometryForMove(
  state: Extract<InteractionState, { phase: "pressing" | "dragging" | "resizing" }>,
  point: InteractionEvent & { type: "MOVE" },
): ElementGeometry {
  const start = screenToDocumentPoint(state.startScreenPoint, state.viewport);
  const current = screenToDocumentPoint(point.point, state.viewport);
  const delta = documentDelta(current.x - start.x, current.y - start.y);
  const bounds = canvasBounds(state);

  const rawRect = state.intent.type === "drag"
    ? translateRect(state.initial.rect, delta)
    : state.constraints.aspectRatio
      ? resizeRectProportionally(state.initial.rect, state.intent.handle, delta, {
          minWidth: state.constraints.minWidth,
          minHeight: state.constraints.minHeight,
          bounds,
          aspectRatio: state.constraints.aspectRatio,
        })
      : resizeRect(state.initial.rect, state.intent.handle, delta, {
          minWidth: state.constraints.minWidth,
          minHeight: state.constraints.minHeight,
          bounds,
        });
  const rect = state.initial.rotationDeg === 0
    ? state.intent.type === "drag"
      ? clampDragRectPreservingInitialOverflow(state.initial.rect, rawRect, bounds)
      : rawRect
    : clampRotatedRectToBounds(rawRect, state.initial.rotationDeg, bounds);

  return elementGeometry(
    state.initial.id,
    state.initial.kind,
    rect,
    state.initial.rotationDeg,
  );
}

function pointerMatches(
  state: InteractionState,
  pointerId: number,
): state is Extract<InteractionState, { phase: "pressing" | "dragging" | "resizing" }> {
  return (
    (state.phase === "pressing" || state.phase === "dragging" || state.phase === "resizing") &&
    state.pointerId === pointerId
  );
}

function operationFor(state: Extract<InteractionState, { phase: "dragging" | "resizing" }>): InteractionOperation {
  return state.phase === "dragging" ? "drag" : "resize";
}

function commitFor(state: Extract<InteractionState, { phase: "dragging" | "resizing" }>): GeometryCommit {
  return Object.freeze({
    operation: operationFor(state),
    intent: state.intent,
    elementId: state.initial.id,
    kind: state.initial.kind,
    initial: state.initial,
    geometry: state.draft,
    viewport: state.viewport,
    startScreenPoint: state.startScreenPoint,
    finalScreenPoint: state.currentScreenPoint,
    modifiers: state.modifiers,
  });
}

export function elementGeometriesEqual(left: ElementGeometry, right: ElementGeometry): boolean {
  return (
    left.id === right.id &&
    left.kind === right.kind &&
    left.rotationDeg === right.rotationDeg &&
    left.rect.x === right.rect.x &&
    left.rect.y === right.rect.y &&
    left.rect.width === right.rect.width &&
    left.rect.height === right.rect.height
  );
}

export function reduceInteractionState(
  state: InteractionState,
  event: InteractionEvent,
): InteractionState {
  switch (event.type) {
    case "BEGIN":
      if (state.phase !== "idle") return state;
      return Object.freeze({ phase: "pressing", ...event.session });

    case "MOVE": {
      if (!pointerMatches(state, event.pointerId)) return state;

      const distance = Math.hypot(
        event.point.x - state.startScreenPoint.x,
        event.point.y - state.startScreenPoint.y,
      );

      if (state.phase === "pressing" && distance < event.slopPx) {
        return Object.freeze({ ...state, modifiers: event.modifiers });
      }

      const draft = geometryForMove(state, event);
      return Object.freeze({
        ...state,
        phase: state.intent.type === "drag" ? "dragging" : "resizing",
        draft,
        currentScreenPoint: event.point,
        modifiers: event.modifiers,
      });
    }

    case "PREPARE_COMMIT":
      if (!pointerMatches(state, event.pointerId)) return state;
      if (state.phase === "pressing") return IDLE_INTERACTION_STATE;
      if (elementGeometriesEqual(state.initial, state.draft)) return IDLE_INTERACTION_STATE;
      return Object.freeze({ phase: "committing", commit: commitFor(state) });

    case "PREPARE_CANCEL":
      if (state.phase !== "pressing" && state.phase !== "dragging" && state.phase !== "resizing") {
        return state;
      }
      return Object.freeze({
        phase: "cancelling",
        elementId: state.initial.id,
        initial: state.initial,
        reason: event.reason,
      });

    case "COMPLETE":
      if (state.phase !== "committing" && state.phase !== "cancelling") return state;
      return IDLE_INTERACTION_STATE;
  }
}
