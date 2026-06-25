import { nonNegativeNumber } from "../geometry";
import { reduceInteractionState } from "./interactionReducer";
import {
  createTransientInteractionStore,
  type TransientInteractionStore,
} from "./transientStore";
import {
  DEFAULT_INTERACTION_SLOP_PX,
  NO_INTERACTION_MODIFIERS,
  type BeginInteractionInput,
  type CreateInteractionControllerOptions,
  type FrameHandle,
  type InteractionCancelReason,
  type InteractionCompletion,
  type InteractionController,
  type InteractionState,
  type PointerCapturePort,
  type PreviewInteractionInput,
} from "./types";

function activePointerId(state: InteractionState): number | null {
  if (state.phase === "pressing" || state.phase === "dragging" || state.phase === "resizing") {
    return state.pointerId;
  }
  return null;
}

export function createInteractionController(
  options: CreateInteractionControllerOptions,
  store: TransientInteractionStore = createTransientInteractionStore(),
): InteractionController {
  const slopPx = nonNegativeNumber(
    options.slopPx ?? DEFAULT_INTERACTION_SLOP_PX,
    "createInteractionController.slopPx",
  );
  let disposed = false;
  let queuedMove: PreviewInteractionInput | null = null;
  let frameHandle: FrameHandle | null = null;
  let capturePort: PointerCapturePort | null = null;

  const report = (
    error: unknown,
    context: "capture" | "release" | "schedule" | "commit",
  ) => {
    try {
      options.errorPort?.report(error, context);
    } catch {
      // Error reporting must never corrupt interaction cleanup.
    }
  };

  const publishEvent = (event: Parameters<typeof reduceInteractionState>[1]) => {
    const current = store.getState();
    const next = reduceInteractionState(current, event);
    store.publish(next);
    return next;
  };

  const clearScheduledMove = () => {
    if (frameHandle !== null) {
      options.scheduler.cancel(frameHandle);
      frameHandle = null;
    }
    queuedMove = null;
  };

  const releasePointer = (pointerId: number) => {
    const currentCapture = capturePort;
    capturePort = null;
    if (!currentCapture) return;
    try {
      currentCapture.release(pointerId);
    } catch (error) {
      report(error, "release");
    }
  };

  const processMove = (input: PreviewInteractionInput): boolean => {
    const pointerId = activePointerId(store.getState());
    if (pointerId === null || pointerId !== input.pointerId) return false;
    publishEvent({
      type: "MOVE",
      pointerId: input.pointerId,
      point: input.point,
      modifiers: input.modifiers ?? NO_INTERACTION_MODIFIERS,
      slopPx,
    });
    return true;
  };

  const completeTerminalState = () => {
    publishEvent({ type: "COMPLETE" });
  };

  return {
    beginInteraction: input => {
      if (disposed || store.getState().phase !== "idle") return false;

      try {
        input.capture.capture(input.pointerId);
      } catch (error) {
        report(error, "capture");
        return false;
      }

      capturePort = input.capture;
      publishEvent({
        type: "BEGIN",
        session: Object.freeze({
          pointerId: input.pointerId,
          viewport: input.viewport,
          startScreenPoint: input.point,
          initial: input.element,
          intent: input.intent,
          constraints: Object.freeze({ ...(input.constraints ?? {}) }),
          modifiers: input.modifiers ?? NO_INTERACTION_MODIFIERS,
          candidates: input.candidates,
          snapConfig: input.snapConfig,
        }),
      });
      return true;
    },

    previewInteraction: input => {
      if (disposed) return false;
      const pointerId = activePointerId(store.getState());
      if (pointerId === null || pointerId !== input.pointerId) return false;

      queuedMove = input;
      if (frameHandle !== null) return true;

      try {
        frameHandle = options.scheduler.request(() => {
          frameHandle = null;
          const latest = queuedMove;
          queuedMove = null;
          if (latest && !disposed) processMove(latest);
        });
      } catch (error) {
        const latest = queuedMove;
        queuedMove = null;
        report(error, "schedule");
        if (latest) processMove(latest);
      }
      return true;
    },

    commitInteraction: input => {
      if (disposed) return "ignored";
      const before = store.getState();
      const pointerId = activePointerId(before);
      if (pointerId === null || pointerId !== input.pointerId) return "ignored";

      clearScheduledMove();
      processMove(input);
      const moved = store.getState();
      const wasPressing = moved.phase === "pressing";
      const unchanged =
        (moved.phase === "dragging" || moved.phase === "resizing") &&
        moved.initial.rect.x === moved.draft.rect.x &&
        moved.initial.rect.y === moved.draft.rect.y &&
        moved.initial.rect.width === moved.draft.rect.width &&
        moved.initial.rect.height === moved.draft.rect.height &&
        moved.initial.rotationDeg === moved.draft.rotationDeg;

      const terminal = publishEvent({ type: "PREPARE_COMMIT", pointerId: input.pointerId });
      releasePointer(input.pointerId);

      if (terminal.phase !== "committing") {
        return wasPressing ? "click" : unchanged ? "unchanged" : "ignored";
      }

      try {
        options.commitPort.commit(terminal.commit);
        return "committed";
      } catch (error) {
        report(error, "commit");
        throw error;
      } finally {
        completeTerminalState();
      }
    },

    cancelInteraction: (reason: InteractionCancelReason, pointerId?: number) => {
      if (disposed && reason !== "disposed") return false;
      const currentPointerId = activePointerId(store.getState());
      if (currentPointerId === null || (pointerId !== undefined && pointerId !== currentPointerId)) {
        return false;
      }

      clearScheduledMove();
      const terminal = publishEvent({ type: "PREPARE_CANCEL", reason });
      releasePointer(currentPointerId);
      if (terminal.phase === "cancelling") completeTerminalState();
      return true;
    },

    getState: store.getState,
    subscribe: store.subscribe,

    dispose: () => {
      if (disposed) return;
      const currentPointerId = activePointerId(store.getState());
      if (currentPointerId !== null) {
        clearScheduledMove();
        const terminal = publishEvent({ type: "PREPARE_CANCEL", reason: "disposed" });
        releasePointer(currentPointerId);
        if (terminal.phase === "cancelling") completeTerminalState();
      } else {
        clearScheduledMove();
      }
      disposed = true;
      store.destroy();
    },
  };
}
