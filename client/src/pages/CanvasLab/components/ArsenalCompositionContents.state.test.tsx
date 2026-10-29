// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createCanvas } from "@napi-rs/canvas";
import { expect, it, vi } from "vitest";
import { ArsenalCompositionContents, type ArsenalTextBridge } from "./ArsenalCompositionContents";
import { addArsenalAuthorialLayer } from "../lib/arsenalComposition";
import { createArsenalFixtureComposition } from "../lib/arsenalFixture";

vi.mock("react-konva", async () => {
  const React = await import("react");
  return {
    Group: React.forwardRef((props: any, ref) => React.createElement("div", { "data-node": props.name, "data-listening": String(props.listening !== false), "data-draggable": String(Boolean(props.draggable)) }, props.children)),
    Rect: () => null, Line: () => null, Text: () => null,
    Image: (props: any) => React.createElement("i", { "data-image": "true", "data-x": props.x, "data-y": props.y, "data-width": props.width, "data-height": props.height }),
  };
});
vi.mock("./RichTextRenderer", () => ({ default: () => null }));

it("hidden groups omit their descendants and locking prevents interactions without removing the rendered group", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const canvas = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => createCanvas(20,20).getContext("2d") as never);
  const c = createArsenalFixtureComposition();
  const group = c.groups.find(group => c.elements.some(element => element.parentId === group.id))!;
  const child = c.elements.find(element => element.parentId === group.id)!;
  const host = document.createElement("div"), root = createRoot(host);
  const bridge: ArsenalTextBridge = { target: null, selection: {start:0,end:0}, click: vi.fn(), doubleClick: vi.fn(), down: vi.fn(), move: vi.fn(), touchStart: vi.fn(), touchMove: vi.fn(), up: vi.fn() };
  const render = async () => { await act(async () => root.render(<ArsenalCompositionContents composition={{...c}} interactive bridge={bridge} register={vi.fn()} onSelect={vi.fn()} onTransform={vi.fn()} />)); };
  try {
    c.elementStates = { [group.id]: { locked: true } };
    await render();
    for (const id of [group.id, child.id]) {
      const node = host.querySelector(`[data-node="arsenal-${id}"]`);
      expect(node).not.toBeNull();
      expect(node?.getAttribute("data-listening")).toBe("false");
      expect(node?.getAttribute("data-draggable")).toBe("false");
    }
    c.elementStates = { [group.id]: { hidden: true } };
    await render();
    expect(host.querySelector(`[data-node="arsenal-${child.id}"]`)).toBeNull();
    expect(c.elements.some(element => element.id === child.id)).toBe(true);
    c.elementStates = {};
    await render();
    expect(host.querySelector(`[data-node="arsenal-${child.id}"]`)?.getAttribute("data-listening")).toBe("true");
  } finally { act(() => root.unmount()); canvas.mockRestore(); }
});


it("fits the composition logo to its box while preserving the source aspect ratio", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const canvas = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => createCanvas(20,20).getContext("2d") as never);
  const images: any[] = [];
  const imageSpy = vi.spyOn(window, "Image").mockImplementation(function() {
    const image = { onload: null, src: "", naturalWidth: 160, naturalHeight: 160 };
    images.push(image); return image as unknown as HTMLImageElement;
  });
  let c = addArsenalAuthorialLayer(createArsenalFixtureComposition(), { id: "text", kind: "text", text: "Logo test", x: 0, y: 0, width: 100, height: 30, parentId: null, rotation: 0, opacity: 1, fontSize: 16, fontFamily: "Arial", fill: "#000", zIndex: 1 });
  if (c.version !== 3) throw new Error("Expected V3");
  c = { ...c, elements: [], groups: [], logo: { url: "square.svg", position: "custom" } };
  const before = structuredClone(c), host = document.createElement("div"), root = createRoot(host);
  const bridge: ArsenalTextBridge = { target: null, selection: {start:0,end:0}, click: vi.fn(), doubleClick: vi.fn(), down: vi.fn(), move: vi.fn(), touchStart: vi.fn(), touchMove: vi.fn(), up: vi.fn() };
  try {
    await act(async () => root.render(<ArsenalCompositionContents composition={c} interactive bridge={bridge} register={vi.fn()} onSelect={vi.fn()} onTransform={vi.fn()} />));
    await act(async () => images[0].onload());
    const logo = host.querySelector("i")!;
    expect(logo.getAttribute("data-width")).toBe("30");
    expect(logo.getAttribute("data-height")).toBe("30");
    expect(logo.getAttribute("data-x")).toBe("15");
    expect(logo.getAttribute("data-y")).toBe("0");
    expect(c).toEqual(before);
  } finally { act(() => root.unmount()); imageSpy.mockRestore(); canvas.mockRestore(); }
});
