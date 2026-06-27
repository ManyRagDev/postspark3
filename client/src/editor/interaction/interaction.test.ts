import { describe, expect, it, vi } from "vitest";
import {
  createCanvasViewport,
  documentRect,
  documentSize,
  elementGeometry,
  screenPoint,
  screenRect,
  type ResizeHandle,
} from "../geometry";
import {
  createInteractionController,
  createTransientInteractionStore,
  IDLE_INTERACTION_STATE,
  NO_INTERACTION_MODIFIERS,
  reduceInteractionState,
  type FrameHandle,
  type FrameScheduler,
  type GeometryCommit,
  type InteractionCancelReason,
  type InteractionErrorPort,
  type InteractionState,
  type PointerCapturePort,
} from ".";

class FakeScheduler implements FrameScheduler {
  private nextHandle = 1;
  private callbacks = new Map<FrameHandle, () => void>();
  readonly cancelled: FrameHandle[] = [];

  request(callback: () => void): FrameHandle {
    const handle = this.nextHandle++;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancel(handle: FrameHandle): void {
    this.cancelled.push(handle);
    this.callbacks.delete(handle);
  }

  flush(): void {
    const entries = Array.from(this.callbacks.entries());
    this.callbacks.clear();
    entries.forEach(([, callback]) => callback());
  }

  get pendingCount(): number {
    return this.callbacks.size;
  }
}

class FakeCapture implements PointerCapturePort {
  readonly captured: number[] = [];
  readonly released: number[] = [];
  captureError: unknown;
  releaseError: unknown;

  capture(pointerId: number): void {
    this.captured.push(pointerId);
    if (this.captureError) throw this.captureError;
  }

  release(pointerId: number): void {
    this.released.push(pointerId);
    if (this.releaseError) throw this.releaseError;
  }
}

const viewportAt = (scale = 1, left = 0, top = 0) =>
  createCanvasViewport(
    screenRect(left, top, 360 * scale, 360 * scale),
    documentSize(360, 360),
  );

const fixtureElement = () =>
  elementGeometry("headline", "block", documentRect(40, 50, 100, 60), -15);

function createHarness(options: {
  scheduler?: FrameScheduler;
  capture?: FakeCapture;
  commit?: (command: GeometryCommit) => void;
  report?: InteractionErrorPort["report"];
  slopPx?: number;
} = {}) {
  const scheduler = options.scheduler ?? new FakeScheduler();
  const capture = options.capture ?? new FakeCapture();
  const commits: GeometryCommit[] = [];
  const errors: Array<{ error: unknown; context: string }> = [];
  const controller = createInteractionController({
    scheduler,
    slopPx: options.slopPx,
    commitPort: {
      commit: command => {
        commits.push(command);
        options.commit?.(command);
      },
    },
    errorPort: {
      report: (error, context) => {
        errors.push({ error, context });
        options.report?.(error, context);
      },
    },
  });

  const begin = (overrides: Partial<Parameters<typeof controller.beginInteraction>[0]> = {}) =>
    controller.beginInteraction({
      pointerId: 7,
      point: screenPoint(100, 100),
      viewport: viewportAt(),
      element: fixtureElement(),
      intent: { type: "drag" },
      capture,
      ...overrides,
    });

  return { controller, scheduler, capture, commits, errors, begin };
}

describe("transient interaction store", () => {
  it("publishes immutable states and supports unsubscribe", () => {
    const store = createTransientInteractionStore();
    const received: InteractionState[] = [];
    const unsubscribe = store.subscribe(state => received.push(state));
    const pressing = Object.freeze({
      phase: "pressing" as const,
      pointerId: 1,
      viewport: viewportAt(),
      startScreenPoint: screenPoint(0, 0),
      initial: fixtureElement(),
      intent: { type: "drag" as const },
      constraints: {},
      modifiers: NO_INTERACTION_MODIFIERS,
    });

    store.publish(pressing);
    expect(store.getState()).toBe(pressing);
    expect(Object.isFrozen(store.getState())).toBe(true);
    expect(received).toEqual([pressing]);

    unsubscribe();
    store.publish(IDLE_INTERACTION_STATE);
    expect(received).toHaveLength(1);
  });

  it("resets state and subscribers on destroy", () => {
    const store = createTransientInteractionStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.destroy();
    store.publish(IDLE_INTERACTION_STATE);
    expect(store.getState()).toBe(IDLE_INTERACTION_STATE);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("interaction reducer", () => {
  it("ignores invalid events while idle", () => {
    expect(reduceInteractionState(IDLE_INTERACTION_STATE, {
      type: "MOVE",
      pointerId: 1,
      point: screenPoint(10, 10),
      modifiers: NO_INTERACTION_MODIFIERS,
      slopPx: 5,
    })).toBe(IDLE_INTERACTION_STATE);
    expect(reduceInteractionState(IDLE_INTERACTION_STATE, { type: "COMPLETE" }))
      .toBe(IDLE_INTERACTION_STATE);
  });

  it("transitions pressing to dragging only after the screen-space slop", () => {
    const pressing = reduceInteractionState(IDLE_INTERACTION_STATE, {
      type: "BEGIN",
      session: {
        pointerId: 1,
        viewport: viewportAt(2, 30, 40),
        startScreenPoint: screenPoint(100, 100),
        initial: fixtureElement(),
        intent: { type: "drag" },
        constraints: {},
        modifiers: NO_INTERACTION_MODIFIERS,
      },
    });
    const below = reduceInteractionState(pressing, {
      type: "MOVE",
      pointerId: 1,
      point: screenPoint(104.99, 100),
      modifiers: NO_INTERACTION_MODIFIERS,
      slopPx: 5,
    });
    const atThreshold = reduceInteractionState(below, {
      type: "MOVE",
      pointerId: 1,
      point: screenPoint(105, 100),
      modifiers: NO_INTERACTION_MODIFIERS,
      slopPx: 5,
    });

    expect(below.phase).toBe("pressing");
    expect(atThreshold.phase).toBe("dragging");
  });

  it("rejects a second BEGIN and foreign pointer events", () => {
    const beginEvent = {
      type: "BEGIN" as const,
      session: {
        pointerId: 1,
        viewport: viewportAt(),
        startScreenPoint: screenPoint(0, 0),
        initial: fixtureElement(),
        intent: { type: "drag" as const },
        constraints: {},
        modifiers: NO_INTERACTION_MODIFIERS,
      },
    };
    const pressing = reduceInteractionState(IDLE_INTERACTION_STATE, beginEvent);
    expect(reduceInteractionState(pressing, beginEvent)).toBe(pressing);
    expect(reduceInteractionState(pressing, {
      type: "PREPARE_COMMIT",
      pointerId: 2,
    })).toBe(pressing);
  });
});

describe("interaction controller", () => {
  it.each([0.5, 0.75, 1, 1.5, 2])(
    "keeps the 5 CSS px slop independent of zoom %s",
    scale => {
      const harness = createHarness();
      harness.begin({ viewport: viewportAt(scale, 25, 40) });
      harness.controller.previewInteraction({ pointerId: 7, point: screenPoint(104.9, 100) });
      (harness.scheduler as FakeScheduler).flush();
      expect(harness.controller.getState().phase).toBe("pressing");

      harness.controller.previewInteraction({ pointerId: 7, point: screenPoint(105, 100) });
      (harness.scheduler as FakeScheduler).flush();
      const state = harness.controller.getState();
      expect(state.phase).toBe("dragging");
      if (state.phase === "dragging") {
        expect(state.draft.rect.x).toBeCloseTo(40 + 5 / scale, 8);
      }
    },
  );

  it("coalesces moves and previews only the latest event in a frame", () => {
    const harness = createHarness();
    harness.begin();
    harness.controller.previewInteraction({ pointerId: 7, point: screenPoint(110, 100) });
    harness.controller.previewInteraction({ pointerId: 7, point: screenPoint(120, 100) });
    harness.controller.previewInteraction({ pointerId: 7, point: screenPoint(130, 100) });

    expect((harness.scheduler as FakeScheduler).pendingCount).toBe(1);
    expect(harness.controller.getState().phase).toBe("pressing");
    (harness.scheduler as FakeScheduler).flush();

    const state = harness.controller.getState();
    expect(state.phase).toBe("dragging");
    if (state.phase === "dragging") expect(state.draft.rect.x).toBe(70);
  });

  it("snaps a drag draft and exposes guide data when snapConfig is enabled", () => {
    const harness = createHarness();
    harness.begin({
      candidates: [{ id: "peer", rect: documentRect(70, 260, 80, 60) }],
      snapConfig: {
        toleranceScreenPx: 6,
        hysteresisMultiplier: 2,
        isSnapEnabled: true,
        altSuspended: false,
      },
    });

    harness.controller.previewInteraction({ pointerId: 7, point: screenPoint(128, 100) });
    (harness.scheduler as FakeScheduler).flush();

    const state = harness.controller.getState();
    expect(state.phase).toBe("dragging");
    if (state.phase === "dragging") {
      expect(state.draft.rect.x).toBe(70);
      expect(state.snapGuides).toMatchObject({
        guideX: 70,
        candidateIdX: "peer",
      });
    }
  });

  it("keeps the drag free when snapConfig is disabled or Alt is held", () => {
    const beginWithSnap = () => createHarness();
    const disabled = beginWithSnap();
    disabled.begin({
      candidates: [{ id: "peer", rect: documentRect(70, 260, 80, 60) }],
      snapConfig: {
        toleranceScreenPx: 6,
        hysteresisMultiplier: 2,
        isSnapEnabled: false,
        altSuspended: false,
      },
    });
    disabled.controller.previewInteraction({ pointerId: 7, point: screenPoint(128, 100) });
    (disabled.scheduler as FakeScheduler).flush();
    const disabledState = disabled.controller.getState();
    expect(disabledState.phase).toBe("dragging");
    if (disabledState.phase === "dragging") {
      expect(disabledState.draft.rect.x).toBe(68);
      expect(disabledState.snapGuides).toBeUndefined();
    }

    const alt = beginWithSnap();
    alt.begin({
      candidates: [{ id: "peer", rect: documentRect(70, 260, 80, 60) }],
      snapConfig: {
        toleranceScreenPx: 6,
        hysteresisMultiplier: 2,
        isSnapEnabled: true,
        altSuspended: false,
      },
    });
    alt.controller.previewInteraction({
      pointerId: 7,
      point: screenPoint(128, 100),
      modifiers: { ...NO_INTERACTION_MODIFIERS, alt: true },
    });
    (alt.scheduler as FakeScheduler).flush();
    const altState = alt.controller.getState();
    expect(altState.phase).toBe("dragging");
    if (altState.phase === "dragging") {
      expect(altState.draft.rect.x).toBe(68);
      expect(altState.snapGuides).toBeUndefined();
    }
  });

  it("drains the pointerup position and emits exactly one commit", () => {
    const harness = createHarness();
    harness.begin();
    harness.controller.previewInteraction({ pointerId: 7, point: screenPoint(115, 100) });

    expect(harness.controller.commitInteraction({
      pointerId: 7,
      point: screenPoint(130, 125),
      modifiers: { ...NO_INTERACTION_MODIFIERS, shift: true },
    })).toBe("committed");

    expect(harness.commits).toHaveLength(1);
    expect(harness.commits[0].geometry.rect).toMatchObject({ x: 70, y: 75 });
    expect(harness.commits[0].geometry.rotationDeg).toBe(-15);
    expect(harness.commits[0].modifiers.shift).toBe(true);
    expect(harness.capture.released).toEqual([7]);
    expect(harness.controller.getState()).toBe(IDLE_INTERACTION_STATE);
    expect(harness.controller.commitInteraction({ pointerId: 7, point: screenPoint(130, 125) }))
      .toBe("ignored");
    expect(harness.commits).toHaveLength(1);
  });

  it("treats movement below slop as a click without commit", () => {
    const harness = createHarness();
    harness.begin();
    expect(harness.controller.commitInteraction({ pointerId: 7, point: screenPoint(104, 102) }))
      .toBe("click");
    expect(harness.commits).toHaveLength(0);
    expect(harness.capture.released).toEqual([7]);
  });

  it("does not commit a clamped gesture whose geometry did not change", () => {
    const harness = createHarness();
    harness.begin({
      element: elementGeometry("edge", "block", documentRect(0, 0, 100, 60)),
      point: screenPoint(0, 0),
    });
    expect(harness.controller.commitInteraction({ pointerId: 7, point: screenPoint(-20, -20) }))
      .toBe("unchanged");
    expect(harness.commits).toHaveLength(0);
  });

  it("preserves pre-existing overflow instead of jumping on the first move", () => {
    const harness = createHarness();
    harness.begin({
      element: elementGeometry("large", "block", documentRect(-20, 20, 500, 500)),
    });
    expect(harness.controller.commitInteraction({ pointerId: 7, point: screenPoint(120, 120) }))
      .toBe("unchanged");
    expect(harness.commits).toHaveLength(0);
  });

  it("blocks movement that increases an existing overflow", () => {
    const harness = createHarness();
    harness.begin({
      element: elementGeometry("large", "block", documentRect(-20, -15, 500, 500)),
      point: screenPoint(100, 100),
    });
    expect(harness.controller.commitInteraction({ pointerId: 7, point: screenPoint(80, 80) }))
      .toBe("unchanged");
    expect(harness.commits).toHaveLength(0);
  });

  it.each<ResizeHandle>([
    "top-left",
    "top",
    "top-right",
    "right",
    "bottom-right",
    "bottom",
    "bottom-left",
    "left",
  ])("previews and commits resize from the %s handle", handle => {
    const harness = createHarness();
    harness.begin({
      intent: { type: "resize", handle },
      constraints: { minWidth: 20, minHeight: 20 },
    });
    expect(harness.controller.commitInteraction({ pointerId: 7, point: screenPoint(120, 115) }))
      .toBe("committed");
    expect(harness.commits).toHaveLength(1);
    expect(harness.commits[0].operation).toBe("resize");
    expect(harness.commits[0].geometry.rotationDeg).toBe(-15);
  });

  it("enforces resize minimums and canvas bounds", () => {
    const harness = createHarness();
    harness.begin({
      intent: { type: "resize", handle: "top-left" },
      constraints: { minWidth: 80, minHeight: 40 },
    });
    harness.controller.commitInteraction({ pointerId: 7, point: screenPoint(500, 500) });
    expect(harness.commits[0].geometry.rect).toMatchObject({
      x: 60,
      y: 70,
      width: 80,
      height: 40,
    });
  });

  it("keeps image aspect ratio during corner resize", () => {
    const harness = createHarness();
    harness.begin({
      element: elementGeometry("imageElement:i1", "image", documentRect(40, 50, 120, 80)),
      intent: { type: "resize", handle: "bottom-right" },
      constraints: { minWidth: 40, minHeight: 40, aspectRatio: 1.5 },
    });
    harness.controller.commitInteraction({ pointerId: 7, point: screenPoint(180, 140) });
    expect(harness.commits).toHaveLength(1);
    expect(harness.commits[0].geometry.rect.width / harness.commits[0].geometry.rect.height)
      .toBeCloseTo(1.5, 8);
  });

  it.each<InteractionCancelReason>([
    "pointer-cancel",
    "escape",
    "viewport-invalidated",
    "element-unmounted",
  ])("cancels %s without commit and exposes the terminal reason", reason => {
    const harness = createHarness();
    const phases: InteractionState[] = [];
    harness.controller.subscribe(state => phases.push(state));
    harness.begin();
    harness.controller.previewInteraction({ pointerId: 7, point: screenPoint(120, 100) });
    (harness.scheduler as FakeScheduler).flush();

    expect(harness.controller.cancelInteraction(reason)).toBe(true);
    expect(phases.some(state => state.phase === "cancelling" && state.reason === reason)).toBe(true);
    expect(harness.commits).toHaveLength(0);
    expect(harness.capture.released).toEqual([7]);
    expect(harness.controller.getState()).toBe(IDLE_INTERACTION_STATE);
  });

  it("dispose cancels an active gesture and permanently rejects new work", () => {
    const harness = createHarness();
    harness.begin();
    harness.controller.previewInteraction({ pointerId: 7, point: screenPoint(130, 100) });
    harness.controller.dispose();

    expect(harness.commits).toHaveLength(0);
    expect(harness.capture.released).toEqual([7]);
    expect(harness.controller.getState()).toBe(IDLE_INTERACTION_STATE);
    expect(harness.begin()).toBe(false);
    expect(harness.controller.previewInteraction({ pointerId: 7, point: screenPoint(140, 100) }))
      .toBe(false);
  });

  it("ignores foreign pointers and rejects a second interaction", () => {
    const harness = createHarness();
    const secondCapture = new FakeCapture();
    expect(harness.begin()).toBe(true);
    expect(harness.begin({ pointerId: 8, capture: secondCapture })).toBe(false);
    expect(harness.controller.previewInteraction({ pointerId: 8, point: screenPoint(130, 100) }))
      .toBe(false);
    expect(harness.controller.commitInteraction({ pointerId: 8, point: screenPoint(130, 100) }))
      .toBe("ignored");
    expect(harness.controller.cancelInteraction("pointer-cancel", 8)).toBe(false);
    expect(secondCapture.captured).toHaveLength(0);
    expect(harness.controller.getState().phase).toBe("pressing");
  });

  it("rejects capture failure and reports it", () => {
    const capture = new FakeCapture();
    const failure = new Error("capture failed");
    capture.captureError = failure;
    const harness = createHarness({ capture });

    expect(harness.begin()).toBe(false);
    expect(harness.controller.getState()).toBe(IDLE_INTERACTION_STATE);
    expect(harness.errors).toEqual([{ error: failure, context: "capture" }]);
  });

  it("reports release failure but still commits and cleans up", () => {
    const capture = new FakeCapture();
    const failure = new Error("release failed");
    capture.releaseError = failure;
    const harness = createHarness({ capture });
    harness.begin();

    expect(harness.controller.commitInteraction({ pointerId: 7, point: screenPoint(120, 100) }))
      .toBe("committed");
    expect(harness.commits).toHaveLength(1);
    expect(harness.errors).toContainEqual({ error: failure, context: "release" });
    expect(harness.controller.getState()).toBe(IDLE_INTERACTION_STATE);
  });

  it("cleans up and rethrows a commit failure", () => {
    const failure = new Error("commit failed");
    const harness = createHarness({ commit: () => { throw failure; } });
    harness.begin();

    expect(() => harness.controller.commitInteraction({
      pointerId: 7,
      point: screenPoint(120, 100),
    })).toThrow(failure);
    expect(harness.commits).toHaveLength(1);
    expect(harness.errors).toContainEqual({ error: failure, context: "commit" });
    expect(harness.capture.released).toEqual([7]);
    expect(harness.controller.getState()).toBe(IDLE_INTERACTION_STATE);
  });

  it("falls back to synchronous preview when frame scheduling fails", () => {
    const failure = new Error("schedule failed");
    const scheduler: FrameScheduler = {
      request: () => { throw failure; },
      cancel: vi.fn(),
    };
    const harness = createHarness({ scheduler });
    harness.begin();

    expect(harness.controller.previewInteraction({ pointerId: 7, point: screenPoint(120, 100) }))
      .toBe(true);
    expect(harness.controller.getState().phase).toBe("dragging");
    expect(harness.errors).toContainEqual({ error: failure, context: "schedule" });
  });

  it("keeps the latest modifiers in the commit", () => {
    const harness = createHarness();
    harness.begin({ modifiers: { ...NO_INTERACTION_MODIFIERS, alt: true } });
    harness.controller.previewInteraction({
      pointerId: 7,
      point: screenPoint(120, 100),
      modifiers: { ...NO_INTERACTION_MODIFIERS, control: true },
    });
    (harness.scheduler as FakeScheduler).flush();
    harness.controller.commitInteraction({
      pointerId: 7,
      point: screenPoint(125, 100),
      modifiers: { ...NO_INTERACTION_MODIFIERS, meta: true },
    });

    expect(harness.commits[0].modifiers).toEqual({
      shift: false,
      alt: false,
      meta: true,
      control: false,
    });
  });
});
