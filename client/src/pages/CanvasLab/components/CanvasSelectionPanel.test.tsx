// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_POST } from "./types";
import { CanvasSelectionPanel } from "./CanvasSelectionPanel";
import type { EditorLayer } from "../lib/editorController";

const properties = vi.hoisted(() => ({
  values: {} as Record<string, string | number>,
  supported: [] as string[],
}));

vi.mock("./FontPickerDropdown", () => ({ default: () => null }));
vi.mock("../lib/editorController", async importOriginal => {
  const original =
    await importOriginal<typeof import("../lib/editorController")>();
  return {
    ...original,
    resolveEditorList: () => ({
      source: "items",
      items: [
        { id: "a", text: "Primeiro" },
        { id: "b", text: "Segundo" },
      ],
    }),
    resolveEditorProperties: () => properties,
  };
});

describe("list selection", () => {
  beforeEach(() => {
    properties.values = {};
    properties.supported = [];
  });
  afterEach(() => {
    document.body.innerHTML = "";
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
  });
  it("offers a single editable field and commands for reordering, removal and addition", () => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const post = {
      ...INITIAL_POST,
      slides: [{ ...INITIAL_POST.slides[0], id: "s" }],
    };
    const layer: EditorLayer = {
      id: "t",
      target: { slideId: "s", elementId: "t" },
      label: "Lista",
      kind: "text",
      parentId: null,
      children: [],
      visible: true,
      locked: false,
      capabilities: {
        editText: true,
        properties: true,
        duplicate: true,
        reorder: true,
        align: false,
        remove: true,
        visibility: true,
        lock: true,
      },
    };
    const command = vi.fn();
    act(() =>
      root.render(
        <CanvasSelectionPanel
          post={post}
          layer={layer}
          onCommand={command}
          onEditOnCanvas={vi.fn()}
        />
      )
    );
    expect(container.querySelectorAll("textarea")).toHaveLength(1);
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Mover item 2 para cima"]'
        )
        ?.click()
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Excluir item 1"]')
        ?.click()
    );
    act(() =>
      Array.from(container.querySelectorAll("button"))
        .find(b => b.textContent === "Adicionar item")
        ?.click()
    );
    expect(command.mock.calls.map(([arg]) => arg)).toEqual([
      { type: "list", action: "move", itemId: "b", destination: 0 },
      { type: "list", action: "remove", itemId: "a" },
      { type: "list", action: "add", text: "Novo item" },
    ]);
    act(() => root.unmount());
  });

  it("shows readable values while keeping normalized opacity and exposing vertical alignment", () => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    properties.values = {
      opacity: 0.456,
      overlayOpacity: 0.55,
      fontSize: 83.599999,
      fontWeight: 700,
    };
    properties.supported = Object.keys(properties.values);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const post = {
      ...INITIAL_POST,
      slides: [{ ...INITIAL_POST.slides[0], id: "s" }],
    };
    const layer: EditorLayer = {
      id: "image",
      target: { slideId: "s", elementId: "image" },
      label: "Imagem",
      kind: "image",
      parentId: null,
      children: [],
      visible: true,
      locked: false,
      capabilities: {
        editText: false,
        properties: true,
        duplicate: true,
        reorder: true,
        align: true,
        remove: true,
        visibility: true,
        lock: true,
      },
    };
    const command = vi.fn();
    act(() =>
      root.render(
        <CanvasSelectionPanel
          post={post}
          layer={layer}
          onCommand={command}
          onEditOnCanvas={vi.fn()}
        />
      )
    );
    const opacity = container.querySelector<HTMLInputElement>(
      '[aria-label="Opacidade"]'
    )!;
    expect(opacity.value).toBe("46");
    expect(opacity.max).toBe("100");
    expect(
      container.querySelector<HTMLInputElement>('input[type="number"]')!.value
    ).toBe("83.6");
    expect(
      container.querySelector("select")?.selectedOptions[0].textContent
    ).toBe("Negrito");
    expect(properties.values.fontSize).toBe(83.599999);
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(opacity, "75");
      opacity.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(command).toHaveBeenCalledWith({
      type: "properties",
      patch: { opacity: 0.75 },
    });
    act(() =>
      Array.from(container.querySelectorAll("button"))
        .find(button => button.textContent === "Centralizar verticalmente")!
        .click()
    );
    expect(command).toHaveBeenLastCalledWith({
      type: "align",
      alignment: "middle",
    });
    act(() => root.unmount());
  });
});
