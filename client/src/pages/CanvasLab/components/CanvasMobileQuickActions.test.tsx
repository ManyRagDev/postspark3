// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CanvasMobileQuickActions from "./CanvasMobileQuickActions";

describe("CanvasMobileQuickActions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("adds the second slide to the current post and changes its label for a carousel", () => {
    const onAddSlide = vi.fn();
    const onToggleSnap = vi.fn();
    const onRestart = vi.fn();
    const onExportPng = vi.fn();
    const onExportZip = vi.fn();
    const onZoomChange = vi.fn();
    const onZoomScrubChange = vi.fn();
    const props = {
      aspectRatio: "1:1" as const,
      onAspectRatioChange: vi.fn(),
      onAddSlide,
      zoom: 1,
      onZoomChange,
      onZoomScrubChange,
      onResetZoom: vi.fn(),
      isSnapEnabled: true,
      onToggleSnap,
      onRestart,
      onExportPng,
      onExportZip,
      isExportingZip: false,
    };

    act(() => root.render(<CanvasMobileQuickActions {...props} slideCount={1} />));
    const nav = container.querySelector('nav[aria-label="Ações da prancheta"]');
    expect(nav?.textContent).toContain("+ 2º slide");
    expect(nav?.textContent).toContain("Formato");
    expect(nav?.textContent).toContain("Zoom 100%");
    expect(nav?.textContent).toContain("Recomeçar");
    expect(nav?.textContent).toContain("Baixar");
    expect(nav?.querySelector('button[aria-label="Baixar post"]')).not.toBeNull();

    act(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label^="Adicionar segundo slide"]')?.click();
      container.querySelector<HTMLButtonElement>('button[aria-label="Desativar ímã de alinhamento"]')?.click();
      container.querySelector<HTMLButtonElement>('button[aria-label="Recomeçar do zero"]')?.click();
    });
    expect(onAddSlide).toHaveBeenCalledOnce();
    expect(onToggleSnap).toHaveBeenCalledOnce();
    expect(onRestart).toHaveBeenCalledOnce();

    act(() => root.render(<CanvasMobileQuickActions {...props} slideCount={2} />));
    expect(nav?.textContent).toContain("+ Slide");
    expect(nav?.textContent).not.toContain("+ 2º slide");

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Baixar post"]')?.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })
    ));
    const menuItems = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(menuItems.some(item => item.textContent?.includes("Baixar imagem 4K"))).toBe(true);
    expect(menuItems.some(item => item.textContent?.includes("Baixar carrossel ZIP"))).toBe(true);
    act(() => menuItems.find(item => item.textContent?.includes("Baixar imagem 4K"))?.click());
    expect(onExportPng).toHaveBeenCalledOnce();

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Baixar post"]')?.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })
    ));
    act(() => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find(item => item.textContent?.includes("Baixar carrossel ZIP"))?.click());
    expect(onExportZip).toHaveBeenCalledOnce();

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Zoom: 100%"]')?.click());
    const slider = document.querySelector<HTMLElement>('[role="slider"]');
    expect(slider).not.toBeNull();
    expect(document.body.textContent).toContain("Restaurar 100%");
    act(() => slider?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(onZoomChange).toHaveBeenCalledWith(1.05);
  });
});
