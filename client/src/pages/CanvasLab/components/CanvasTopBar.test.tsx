// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CanvasTopBar from "./CanvasTopBar";

vi.mock("@/components/UserTopMenu", () => ({
  default: () => <button type="button">Conta</button>,
}));

describe("CanvasTopBar", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
  });

  it("keeps history and manual save prominent without duplicate insert actions", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const onSave = vi.fn();

    act(() =>
      root.render(
        <CanvasTopBar
          aspectRatio="1:1"
          onAspectRatioChange={vi.fn()}
          zoom={1}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onResetZoom={vi.fn()}
          onExportPng={vi.fn()}
          onExportZip={vi.fn()}
          onSave={onSave}
          onUndo={onUndo}
          onRedo={onRedo}
          canUndo
          canRedo
        />
      )
    );

    const button = (label: string) =>
      container.querySelector(
        `button[aria-label="${label}"]`
      ) as HTMLButtonElement | null;
    expect(container.textContent).toContain("PostSpark");
    expect(button("Desfazer")).not.toBeNull();
    expect(button("Refazer")).not.toBeNull();
    expect(button("Salvar post")).not.toBeNull();
    expect(container.textContent).not.toContain("+ Texto");
    expect(container.textContent).not.toContain("+ Imagem");

    act(() => {
      button("Desfazer")?.click();
      button("Refazer")?.click();
      button("Salvar post")?.click();
    });
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onRedo).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledOnce();
  });
});
