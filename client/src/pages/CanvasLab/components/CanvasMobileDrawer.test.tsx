// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_POST } from "./types";
import CanvasMobileDrawer from "./CanvasMobileDrawer";

vi.mock("@/lib/trpc", () => ({
  trpc: { post: { generateImage: { useMutation: () => ({ mutateAsync: vi.fn() }) } } },
}));
vi.mock("./BackgroundsDrawer", () => ({ default: () => null }));
vi.mock("./RadialTextureSelector", () => ({ default: () => null }));

describe("CanvasMobileDrawer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("keeps all four editing tools available while the panel is closed", () => {
    const onToggleOpen = vi.fn();
    act(() => root.render(
      <CanvasMobileDrawer
        post={INITIAL_POST}
        onUpdatePost={vi.fn()}
        isOpen={false}
        onToggleOpen={onToggleOpen}
      />
    ));

    const toolbar = container.querySelector('[role="toolbar"][aria-label="Ferramentas de edição"]');
    expect(toolbar).not.toBeNull();
    expect(toolbar?.querySelectorAll("button")).toHaveLength(4);
    expect(toolbar?.textContent).toContain("Texto");
    expect(toolbar?.textContent).toContain("Estilo");
    expect(toolbar?.textContent).toContain("Mídia");
    expect(toolbar?.textContent).toContain("Logo");

    const mediaButton = Array.from(toolbar?.querySelectorAll("button") ?? []).find(button => button.textContent?.includes("Mídia"));
    act(() => mediaButton?.click());
    expect(onToggleOpen).toHaveBeenCalledWith(true);
  });

  it("closes with a downward swipe from the header without scrolling the page", () => {
    const onToggleOpen = vi.fn();
    act(() => root.render(
      <CanvasMobileDrawer post={INITIAL_POST} onUpdatePost={vi.fn()} isOpen onToggleOpen={onToggleOpen} />
    ));
    const header = container.querySelector("#canvas-mobile-editor-panel > div") as HTMLElement;
    const sendTouch = (type: string, x: number, y: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", { value: [{ clientX: x, clientY: y }] });
      header.dispatchEvent(event);
      return event;
    };
    act(() => {
      sendTouch("touchstart", 100, 100);
      expect(sendTouch("touchmove", 100, 180).defaultPrevented).toBe(true);
      sendTouch("touchend", 100, 180);
    });
    expect(onToggleOpen).toHaveBeenCalledWith(false);
    expect(container.textContent).not.toContain("Baixar Imagem (HD)");
    expect(container.textContent).not.toContain("Aplicar fundo a todos os slides");
  });
});
