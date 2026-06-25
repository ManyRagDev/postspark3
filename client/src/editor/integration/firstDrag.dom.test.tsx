// @vitest-environment happy-dom

import React, { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraggableBlock } from "@/components/canvas/DraggableBlock";
import { useEditorStore } from "@/store/editorStore";
import { createPostVariation } from "../../../../tests/fixtures/postspark";
import { CanvasInteractionProvider } from "./CanvasInteractionProvider";

function dimensions(node: HTMLElement, rect: DOMRect, clientWidth: number, clientHeight: number) {
  Object.defineProperties(node, {
    clientWidth: { configurable: true, value: clientWidth },
    clientHeight: { configurable: true, value: clientHeight },
    offsetWidth: { configurable: true, value: clientWidth },
    offsetHeight: { configurable: true, value: clientHeight },
  });
  node.getBoundingClientRect = () => rect;
}

describe("first drag DOM invariants", () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    useEditorStore.getState().reset();
    useEditorStore.getState().setActiveVariation(createPostVariation());
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      disconnect() {}
    });
  });

  afterEach(() => {
    host.remove();
    vi.unstubAllGlobals();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("keeps the captured HTMLElement stable while a flow block crosses the drag slop", async () => {
    const canvasRef = createRef<HTMLDivElement>();
    const layoutRef = createRef<HTMLDivElement>();
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <div ref={canvasRef}>
          <CanvasInteractionProvider canvasRef={canvasRef}>
            <div ref={layoutRef}>
              <DraggableBlock
                elementId="headline"
                layoutPos={{ position: "top-center", textAlign: "center", width: 80 }}
                padding={24}
                containerRef={layoutRef}
                snapEnabled={false}
              >
                headline
              </DraggableBlock>
            </div>
          </CanvasInteractionProvider>
        </div>,
      );
    });

    const canvas = canvasRef.current!;
    const layout = layoutRef.current!;
    const element = host.querySelector<HTMLElement>("[data-layout-id='headline']")!;
    dimensions(canvas, new DOMRect(20, 30, 720, 720), 360, 360);
    dimensions(layout, new DOMRect(20, 30, 720, 720), 360, 360);
    dimensions(element, new DOMRect(100, 130, 240, 80), 120, 40);

    let captured = false;
    let lostCapture = 0;
    element.setPointerCapture = () => { captured = true; };
    element.releasePointerCapture = () => { captured = false; };
    element.addEventListener("lostpointercapture", () => { lostCapture += 1; });

    await act(async () => {
      element.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 7,
        clientX: 160,
        clientY: 160,
      }));
    });
    const capturedNode = host.querySelector<HTMLElement>("[data-layout-id='headline']");

    await act(async () => {
      element.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 7,
        clientX: 180,
        clientY: 175,
      }));
      await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
    });

    expect(host.querySelector("[data-layout-id='headline']")).toBe(capturedNode);
    expect(captured).toBe(true);
    expect(lostCapture).toBe(0);

    await act(async () => {
      element.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 7,
        clientX: 180,
        clientY: 175,
      }));
    });
    expect(captured).toBe(false);
    const shell = host.querySelector<HTMLElement>("[data-draggable-flow-shell='headline']")!;
    expect(shell.style.display).not.toBe("contents");
    expect(shell.style.width).toBe("120px");
    expect(shell.style.height).toBe("40px");

    await act(async () => root.unmount());
  });
});
