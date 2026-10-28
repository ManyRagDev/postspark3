// @vitest-environment happy-dom

import React, { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RichTextFloatingToolbar from "./RichTextFloatingToolbar";

describe("RichTextFloatingToolbar mobile", () => {
  let container: HTMLDivElement;
  let mobileHost: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    mobileHost = document.createElement("div");
    mobileHost.id = "canvas-mobile-text-format-slot";
    document.body.append(container, mobileHost);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    mobileHost.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("fits the commands into two rows and keeps a full-color picker", () => {
    const onApplyFormat = vi.fn();
    act(() => root.render(
      <RichTextFloatingToolbar
        selection={{ start: 0, end: 5 }}
        anchorRef={createRef<HTMLDivElement>()}
        palette={{ background: "#121212", text: "#FFFFFF", accent: "#FF5C00" }}
        baseColor="#FFFFFF"
        onApplyFormat={onApplyFormat}
        onRestoreFocus={vi.fn()}
      />
    ));

    const toolbar = mobileHost.querySelector('[role="toolbar"]');
    expect(toolbar).not.toBeNull();
    expect(toolbar?.className).toContain("overflow-hidden");
    expect(toolbar?.className).not.toContain("overflow-x-auto");
    expect(toolbar?.querySelectorAll(".grid-cols-6")).toHaveLength(2);
    expect(toolbar?.querySelectorAll('input[type="color"]')).toHaveLength(1);
    for (const button of Array.from(toolbar!.querySelectorAll("button"))) expect(button.className).toContain("h-11");

    act(() => toolbar?.querySelector<HTMLButtonElement>('button[aria-label="Aplicar cor #FF5C00"]')?.click());
    expect(onApplyFormat).toHaveBeenCalledWith({ color: "#FF5C00" }, 0, 5);

    const picker = toolbar?.querySelector<HTMLInputElement>('input[type="color"]');
    act(() => {
      if (!picker) return;
      picker.value = "#336699";
      picker.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onApplyFormat).toHaveBeenCalledWith({ color: "#336699" }, 0, 5, false);
  });

  it("shows pressed toggle states and removes the redundant size reset", () => {
    const onApplyFormat = vi.fn();
    act(() => root.render(
      <RichTextFloatingToolbar
        selection={{ start: 0, end: 5 }}
        anchorRef={createRef<HTMLDivElement>()}
        palette={{ background: "#121212", text: "#FFFFFF", accent: "#FF5C00" }}
        baseColor="#FFFFFF"
        baseBold
        richText={[{ text: "texto", italic: true, underline: true }]}
        onApplyFormat={onApplyFormat}
        onRestoreFocus={vi.fn()}
      />
    ));
    const toolbar = mobileHost.querySelector('[role="toolbar"]');
    for (const label of ["Negrito", "Itálico", "Sublinhado"]) {
      const button = toolbar?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      expect(button?.getAttribute("aria-pressed")).toBe("true");
      act(() => button?.click());
    }
    expect(onApplyFormat).toHaveBeenCalledWith({ bold: false }, 0, 5);
    expect(onApplyFormat).toHaveBeenCalledWith({ italic: false }, 0, 5);
    expect(onApplyFormat).toHaveBeenCalledWith({ underline: false }, 0, 5);
    expect(toolbar?.querySelector('button[aria-label="Restaurar tamanho"]')).toBeNull();
    expect(toolbar?.textContent).not.toContain("T=");
  });

  it("keeps completion actions and formatting in separate rows of one positioned desktop surface", () => {
    const conclude = vi.fn();
    const render = (end: number) => act(() => root.render(<RichTextFloatingToolbar
      actions={<button onClick={conclude}>Concluir</button>}
      selection={{start:0,end}}
      anchorRef={createRef<HTMLDivElement>()}
      palette={{background:"#121212",text:"#FFFFFF",accent:"#FF5C00"}}
      baseColor="#FFFFFF" onApplyFormat={vi.fn()} onRestoreFocus={vi.fn()}
    />));
    render(5);
    const actions = document.body.querySelector('[aria-label="Concluir edição do texto"]')!;
    const positionedSurface = actions.parentElement!;
    expect(positionedSurface.className).toContain("fixed");
    expect(positionedSurface.className).toContain("flex-col");
    expect(positionedSurface.children).toHaveLength(2);
    expect(positionedSurface.children[1].getAttribute("aria-label")).toBe("Formatar texto selecionado");
    act(() => actions.querySelector("button")!.click());
    expect(conclude).toHaveBeenCalledTimes(1);
    render(0);
    expect(positionedSurface.querySelector('[aria-label="Concluir edição do texto"]')).not.toBeNull();
    expect(positionedSurface.querySelector('[aria-label="Formatar texto selecionado"]')).toBeNull();
  });

});
