import { beforeEach, describe, expect, it } from "vitest";
import { createPostVariation } from "../../../../tests/fixtures/postspark";
import {
  createCanvasViewport,
  documentRect,
  documentSize,
  elementGeometry,
  screenPoint,
  screenRect,
} from "../geometry";
import {
  createInteractionController,
  type FrameHandle,
  type FrameScheduler,
} from "../interaction";
import { useEditorStore } from "@/store/editorStore";

class DeferredScheduler implements FrameScheduler {
  private nextHandle = 1;
  private callbacks = new Map<FrameHandle, () => void>();

  request(callback: () => void): FrameHandle {
    const handle = this.nextHandle++;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancel(handle: FrameHandle): void {
    this.callbacks.delete(handle);
  }

  flush(): void {
    const callbacks = Array.from(this.callbacks.values());
    this.callbacks.clear();
    callbacks.forEach(callback => callback());
  }
}

describe("block interaction handoff", () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
    useEditorStore.getState().setActiveVariation(createPostVariation());
  });

  it("keeps preview transient and rebuilds the snapshot once on commit", () => {
    const scheduler = new DeferredScheduler();
    const snapshotBefore = useEditorStore.getState().visualSnapshot;
    let snapshotChanges = 0;
    const unsubscribe = useEditorStore.subscribe((state, previous) => {
      if (state.visualSnapshot !== previous.visualSnapshot) snapshotChanges += 1;
    });
    const controller = createInteractionController({
      scheduler,
      commitPort: {
        commit: interaction => useEditorStore.getState().commitGeometry({
          interaction,
          snapEnabled: false,
        }),
      },
    });
    const viewport = createCanvasViewport(screenRect(20, 30, 720, 720), documentSize(360, 360));

    controller.beginInteraction({
      pointerId: 9,
      point: screenPoint(220, 230),
      viewport,
      element: elementGeometry("headline", "block", documentRect(40, 50, 120, 60)),
      intent: { type: "drag" },
      capture: { capture: () => undefined, release: () => undefined },
    });
    controller.previewInteraction({ pointerId: 9, point: screenPoint(280, 270) });
    scheduler.flush();

    expect(useEditorStore.getState().visualSnapshot).toBe(snapshotBefore);
    expect(snapshotChanges).toBe(0);

    controller.commitInteraction({ pointerId: 9, point: screenPoint(300, 290) });
    unsubscribe();

    expect(snapshotChanges).toBe(1);
    expect(useEditorStore.getState().layoutSettings.headline.freePosition?.x).toBeCloseTo(38.8888888889, 8);
    expect(useEditorStore.getState().layoutSettings.headline.freePosition?.y).toBeCloseTo(30.5555555556, 8);
  });

  it("does not touch the snapshot when the gesture is cancelled", () => {
    const scheduler = new DeferredScheduler();
    const snapshotBefore = useEditorStore.getState().visualSnapshot;
    const controller = createInteractionController({
      scheduler,
      commitPort: {
        commit: interaction => useEditorStore.getState().commitGeometry({
          interaction,
          snapEnabled: false,
        }),
      },
    });

    controller.beginInteraction({
      pointerId: 4,
      point: screenPoint(100, 100),
      viewport: createCanvasViewport(screenRect(0, 0, 360, 432), documentSize(360, 432)),
      element: elementGeometry("body", "block", documentRect(30, 80, 200, 70)),
      intent: { type: "drag" },
      capture: { capture: () => undefined, release: () => undefined },
    });
    controller.previewInteraction({ pointerId: 4, point: screenPoint(180, 150) });
    scheduler.flush();
    controller.cancelInteraction("escape");

    expect(useEditorStore.getState().visualSnapshot).toBe(snapshotBefore);
    expect(useEditorStore.getState().layoutSettings.body.freePosition).toBeUndefined();
  });
});
