import type {
  CanvasViewport,
  DocumentRect,
  ElementGeometry,
  ResizeHandle,
  ScreenPoint,
} from "../geometry";
import type { SnapCandidate, SnapConfig, SnapResult } from "../snap/snapEngine";

export const DEFAULT_INTERACTION_SLOP_PX = 5;

export type InteractionOperation = "drag" | "resize";

export type InteractionIntent =
  | Readonly<{ type: "drag" }>
  | Readonly<{ type: "resize"; handle: ResizeHandle }>;

export type InteractionModifiers = Readonly<{
  shift: boolean;
  alt: boolean;
  meta: boolean;
  control: boolean;
}>;

export const NO_INTERACTION_MODIFIERS: InteractionModifiers = Object.freeze({
  shift: false,
  alt: false,
  meta: false,
  control: false,
});

export type InteractionConstraints = Readonly<{
  bounds?: DocumentRect;
  minWidth?: number;
  minHeight?: number;
  aspectRatio?: number;
}>;

export type InteractionCancelReason =
  | "pointer-cancel"
  | "escape"
  | "viewport-invalidated"
  | "element-unmounted"
  | "disposed";

export type InteractionSession = Readonly<{
  pointerId: number;
  viewport: CanvasViewport;
  startScreenPoint: ScreenPoint;
  initial: ElementGeometry;
  intent: InteractionIntent;
  constraints: InteractionConstraints;
  modifiers: InteractionModifiers;
  candidates?: readonly SnapCandidate[];
  snapConfig?: SnapConfig;
}>;

export type GeometryCommit = Readonly<{
  operation: InteractionOperation;
  intent: InteractionIntent;
  elementId: string;
  kind: ElementGeometry["kind"];
  initial: ElementGeometry;
  geometry: ElementGeometry;
  viewport: CanvasViewport;
  startScreenPoint: ScreenPoint;
  finalScreenPoint: ScreenPoint;
  modifiers: InteractionModifiers;
}>;

type PreviewState = Readonly<{
  pointerId: number;
  viewport: CanvasViewport;
  startScreenPoint: ScreenPoint;
  initial: ElementGeometry;
  intent: InteractionIntent;
  constraints: InteractionConstraints;
  modifiers: InteractionModifiers;
}>;

export type InteractionState =
  | Readonly<{ phase: "idle" }>
  | (PreviewState & Readonly<{ phase: "pressing" }>)
  | (PreviewState & Readonly<{
      phase: "dragging";
      draft: ElementGeometry;
      currentScreenPoint: ScreenPoint;
      snapGuides?: SnapResult;
    }>)
  | (PreviewState & Readonly<{
      phase: "resizing";
      draft: ElementGeometry;
      currentScreenPoint: ScreenPoint;
      snapGuides?: SnapResult;
    }>)
  | Readonly<{ phase: "committing"; commit: GeometryCommit }>
  | Readonly<{
      phase: "cancelling";
      elementId: string;
      initial: ElementGeometry;
      reason: InteractionCancelReason;
    }>;

export type InteractionEvent =
  | Readonly<{ type: "BEGIN"; session: InteractionSession }>
  | Readonly<{
      type: "MOVE";
      pointerId: number;
      point: ScreenPoint;
      modifiers: InteractionModifiers;
      slopPx: number;
    }>
  | Readonly<{ type: "PREPARE_COMMIT"; pointerId: number }>
  | Readonly<{ type: "PREPARE_CANCEL"; reason: InteractionCancelReason }>
  | Readonly<{ type: "COMPLETE" }>;

export interface InteractionCommitPort {
  commit(command: GeometryCommit): void;
}

export interface PointerCapturePort {
  capture(pointerId: number): void;
  release(pointerId: number): void;
}

export type FrameHandle = number;

export interface FrameScheduler {
  request(callback: () => void): FrameHandle;
  cancel(handle: FrameHandle): void;
}

export interface InteractionErrorPort {
  report(error: unknown, context: "capture" | "release" | "schedule" | "commit"): void;
}

export type BeginInteractionInput = Readonly<{
  pointerId: number;
  point: ScreenPoint;
  viewport: CanvasViewport;
  element: ElementGeometry;
  intent: InteractionIntent;
  capture: PointerCapturePort;
  constraints?: InteractionConstraints;
  modifiers?: InteractionModifiers;
  candidates?: readonly SnapCandidate[];
  snapConfig?: SnapConfig;
}>;

export type PreviewInteractionInput = Readonly<{
  pointerId: number;
  point: ScreenPoint;
  modifiers?: InteractionModifiers;
}>;

export type InteractionCompletion = "committed" | "click" | "unchanged" | "ignored";

export type InteractionListener = (state: InteractionState) => void;

export interface InteractionController {
  beginInteraction(input: BeginInteractionInput): boolean;
  previewInteraction(input: PreviewInteractionInput): boolean;
  commitInteraction(input: PreviewInteractionInput): InteractionCompletion;
  cancelInteraction(reason: InteractionCancelReason, pointerId?: number): boolean;
  getState(): InteractionState;
  subscribe(listener: InteractionListener): () => void;
  dispose(): void;
}

export type CreateInteractionControllerOptions = Readonly<{
  commitPort: InteractionCommitPort;
  scheduler: FrameScheduler;
  slopPx?: number;
  errorPort?: InteractionErrorPort;
}>;
