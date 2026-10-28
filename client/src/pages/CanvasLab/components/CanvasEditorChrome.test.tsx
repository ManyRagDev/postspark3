// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CanvasEditorChrome from "./CanvasEditorChrome";
import { CanvasEditorLayers, CanvasSelectedText } from "./CanvasEditorPanel";
import type { EditorLayer } from "../lib/editorController";

describe("editor controls", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT; });
  it("keeps an explicitly opened tool when selection changes on desktop and mobile", () => {
    const change = vi.fn();
    for (const mobile of [false, true]) {
      change.mockClear();
      act(() => root.render(<CanvasEditorChrome mobile={mobile} activeTool="brand" onToolChange={change} selectionLabel="Título" contents={{ brand: <div>Marca aberta</div> }} />));
      expect(container.textContent).toContain("Marca aberta");
      act(() => root.render(<CanvasEditorChrome mobile={mobile} activeTool="brand" onToolChange={change} selectionLabel="Foto" contents={{ brand: <div>Marca aberta</div> }} />));
      expect(container.textContent).toContain("Marca aberta");
      expect(change).not.toHaveBeenCalled();
      const close = container.querySelector<HTMLButtonElement>('[aria-label="Fechar painel"]');
      act(() => close?.click());
      expect(change).toHaveBeenLastCalledWith(null);
    }
  });
  it("keeps the mobile text action portal mounted and leaves space for editing", () => {
    const onHeight = vi.fn();
    act(() => root.render(<CanvasEditorChrome mobile isTextEditing activeTool="selection" onToolChange={vi.fn()} contents={{ selection: <div>Propriedades</div> }} onPanelHeightChange={onHeight} />));
    const portal = container.querySelector<HTMLElement>("#canvas-mobile-text-actions-slot");
    expect(portal).not.toBeNull();
    expect(container.querySelector("#canvas-mobile-text-format-slot")).not.toBeNull();
    expect(portal?.className).not.toContain("hidden");
    expect(container.querySelector('[aria-label="Ferramentas de edição"]')).toBeNull();
    expect(onHeight).toHaveBeenCalled();
  });
  it("selects a collapsed group child and reports distinct visibility and lock actions", () => {
    const capabilities = { editText: true, properties: true, duplicate: true, reorder: true, align: true, remove: true, visibility: true, lock: true };
    const child: EditorLayer = { id: "t", target: { slideId: "s", elementId: "t" }, label: "Título", kind: "text", parentId: "g", children: [], visible: false, locked: true, capabilities };
    const group: EditorLayer = { ...child, id: "g", target: { slideId: "s", elementId: "g" }, label: "Grupo", kind: "group", parentId: null, children: [child] };
    const select = vi.fn(); const action = vi.fn();
    act(() => root.render(<CanvasEditorLayers layers={[group]} selectedId={null} onSelect={select} onAction={action} />));
    expect(container.textContent).not.toContain("Título");
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Expandir Grupo"]')?.click());
    act(() => Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("Título"))?.click());
    expect(select).toHaveBeenCalledWith(child.target);
    act(() => root.render(<CanvasEditorLayers layers={[group]} selectedId="t" onSelect={select} onAction={action} />));
    const buttons = Array.from(container.querySelectorAll("button"));
    act(() => buttons.find(b => b.textContent === "Mostrar")?.click());
    act(() => buttons.find(b => b.textContent === "Desbloquear")?.click());
    expect(action.mock.calls.map(call => call[1])).toEqual(["visibility", "lock"]);
  });
  it("groups decoration without changing targets and reveals a selected decoration", () => {
    const capabilities = { editText: true, properties: true, duplicate: true, reorder: true, align: true, remove: true, visibility: true, lock: true };
    const title: EditorLayer = { id: "title", target: { slideId: "s", elementId: "title" }, label: "Título", kind: "text", role: "headline", parentId: null, children: [], visible: true, locked: false, capabilities };
    const ornament: EditorLayer = { ...title, id: "detail", target: { slideId: "s", elementId: "detail" }, label: "Linha", kind: "shape", role: "decoration" };
    const select = vi.fn();
    act(() => root.render(<CanvasEditorLayers layers={[ornament, title]} onSelect={select} onAction={vi.fn()} />));
    expect(container.textContent).toContain("Título");
    expect(container.textContent).toContain("Decoração (1)");
    expect(container.textContent).not.toContain("Linha");
    act(() => root.render(<CanvasEditorLayers layers={[ornament, title]} selectedId="detail" onSelect={select} onAction={vi.fn()} />));
    expect(container.textContent).toContain("Linha");
    act(() => Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("Linha"))?.click());
    expect(select).toHaveBeenCalledWith(ornament.target);
  });
  it("explains why a child cannot be shown or unlocked while its group is hidden or locked", () => {
    const layer: EditorLayer = { id: "child", target: { slideId: "s", elementId: "child" }, label: "Título", kind: "text", parentId: null, children: [], visible: false, locked: true, visibilityUnavailableReason: "Mostre o grupo Layout primeiro.", lockUnavailableReason: "Desbloqueie o grupo Layout primeiro.", capabilities: { editText: false, properties: false, duplicate: false, reorder: false, align: false, remove: false, visibility: false, lock: false } };
    act(() => root.render(<CanvasEditorLayers layers={[layer]} selectedId="child" onSelect={vi.fn()} onAction={vi.fn()} />));
    const show = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Mostrar')!;
    const unlock = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Desbloquear')!;
    expect(show.disabled).toBe(true); expect(show.title).toBe('Mostre o grupo Layout primeiro.');
    expect(unlock.disabled).toBe(true); expect(unlock.title).toBe('Desbloqueie o grupo Layout primeiro.');
    expect(container.textContent).toContain('Mostre o grupo Layout primeiro.');
  });
  it("offers one accessible field and explicit edit-on-canvas action", () => {
    const edit = vi.fn();
    act(() => root.render(<CanvasSelectedText value="Título" onChange={vi.fn()} onEditOnCanvas={edit} />));
    expect(container.querySelectorAll("textarea")).toHaveLength(1);
    expect(container.querySelector('label[for="canvas-selected-text"]')?.textContent).toBe("Texto selecionado");
    act(() => container.querySelector("button")?.click());
    expect(edit).toHaveBeenCalledOnce();
  });
});
