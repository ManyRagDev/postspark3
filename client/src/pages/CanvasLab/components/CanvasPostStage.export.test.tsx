// @vitest-environment happy-dom
import React, { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { CanvasPostStage, type CanvasPostStageRef } from "./CanvasPostStage";
import { INITIAL_POST, type CanvasPostModel } from "./types";
import { createArsenalFixtureComposition } from "../lib/arsenalFixture";
import { hideArsenalInstance, putArsenalComposition, resolveArsenalComposition } from "../lib/arsenalComposition";

const capture = vi.hoisted(() => ({ images: [] as unknown[], png: "", export: vi.fn() }));
vi.mock("react-konva", async () => {
  const React = await import("react");
  const container = ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, {}, children);
  const stage = { find: (selector: string) => selector === "Image" ? capture.images : [], getLayers: () => [{ draw() {}, batchDraw() {} }], toDataURL: (options: unknown) => { capture.export(options); return capture.png; } };
  return { Stage: React.forwardRef((props: { children?: React.ReactNode }, ref) => { React.useImperativeHandle(ref, () => stage); return container(props); }), Layer: container, Group: container, Transformer: React.forwardRef((_, ref) => { React.useImperativeHandle(ref, () => ({ nodes() {}, getLayer: () => ({ batchDraw() {} }) })); return null; }), Rect: () => null, Text: () => null, Image: () => null, Line: () => null, Circle: () => null };
});
vi.mock("../lib/arsenalAssets", () => ({ ensureArsenalCompositionFonts: vi.fn(async () => {}) }));
vi.mock("@/hooks/useDynamicFont", () => ({ useDynamicFont: () => {} }));
vi.mock("./ArsenalCompositionContents", () => ({ ArsenalCompositionContents: () => null }));

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => createCanvas(20, 20).getContext("2d") as never);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  capture.images = []; capture.png = createCanvas(20, 20).toDataURL("image/png"); capture.export.mockClear();
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });
async function render(post: CanvasPostModel, ref: React.RefObject<CanvasPostStageRef | null>) {
  await act(async () => { root.render(<CanvasPostStage ref={ref} post={post} zoom={1} isReadOnly />); });
}

it("PNG, thumbnail and ZIP export after hiding a filled catalog slot without deleting historical media", async () => {
  let c = createArsenalFixtureComposition();
  const slot = c.elements.find(element => element.kind === "media")!;
  c = resolveArsenalComposition({ ...c, media: { [slot.id]: { kind: "user", url: "https://example.com/photo.png", focalX: 0.5, focalY: 0.5 } } });
  const base = structuredClone(INITIAL_POST);
  base.slides = base.slides.slice(0, 1);
  const post = putArsenalComposition(base, c);
  const ref = createRef<CanvasPostStageRef>();
  await render(post, ref);
  expect(() => ref.current!.exportPng4K()).toThrow(/carregamento/);
  const hidden = hideArsenalInstance(c, slot.id);
  expect(hidden.media[slot.id]).toEqual(c.media[slot.id]);
  await render(putArsenalComposition(post, hidden), ref);
  let png = "", thumbnail = "", zip!: Blob;
  await act(async () => { png = ref.current!.exportPng4K(); thumbnail = await ref.current!.exportThumbnail(); zip = await ref.current!.exportZip4K(); });
  expect(png).toBe(capture.png);
  expect(thumbnail).toBe(capture.png);
  expect(zip.size).toBeGreaterThan(0);
  expect(capture.export).toHaveBeenCalledTimes(3);
});
