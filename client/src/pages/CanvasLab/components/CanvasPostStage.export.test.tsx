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
vi.mock("../lib/arsenalAssets", () => ({ ensureArsenalCompositionFonts: vi.fn(async () => {}), ensureArsenalCompositionAssets: vi.fn(async () => {}) }));
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

it("CP-31: native font pending prevents synchronous export", async () => {
  const ref = createRef<CanvasPostStageRef>();
  const previous = Object.getOwnPropertyDescriptor(document, "fonts");
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: new Promise(() => {}), check: () => false, status: "loading" },
  });
  const p = {
    ...structuredClone(INITIAL_POST),
    bgImage: "",
    logoUrl: "",
    slides: [{ id: "n", step: "", headline: "Pending font", subtext: "" }],
    fontFamily: "AUDIT_PENDING_FONT",
  };
  await render(p, ref);
  try {
    expect(() => ref.current!.exportPng4K()).toThrow();
  } finally {
    if (previous) Object.defineProperty(document, "fonts", previous);
    else delete (document as any).fonts;
  }
});

it("BUG-CL-027: failed body font blocks export even if headline is loaded", async () => {
  const ref = createRef<CanvasPostStageRef>();
  const previous = Object.getOwnPropertyDescriptor(document, "fonts");
  const face = { family: "AuditFailedBody", status: "error" };
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      ready: Promise.resolve(),
      check: (font: string) => !font.includes("AuditFailedBody"),
      forEach: (cb: any) => cb(face),
      [Symbol.iterator]: function* () { yield face; },
      status: "loaded",
    },
  });
  try {
    const post = structuredClone(INITIAL_POST);
    post.fontFamily = "Arial";
    post.subtextFontFamily = "AuditFailedBody";
    post.slides[0].subtext = "Visible body text";
    await render(post, ref);
    expect(() => ref.current!.exportPng4K()).toThrow(/AuditFailedBody/);
  } finally {
    if (previous) Object.defineProperty(document, "fonts", previous);
    else delete (document as any).fonts;
  }
});

it("BUG-CL-033: unrelated loading font in DOM does not block export when used fonts are ready", async () => {
  const ref = createRef<CanvasPostStageRef>();
  const previous = Object.getOwnPropertyDescriptor(document, "fonts");
  const unusedFace = { family: "AuditUnused", status: "loading" };
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      ready: new Promise(() => {}),
      check: (font: string) => font.includes("Arial"),
      forEach: (cb: any) => cb(unusedFace),
      [Symbol.iterator]: function* () { yield unusedFace; },
      status: "loading",
    },
  });
  try {
    const post = structuredClone(INITIAL_POST);
    post.fontFamily = "Arial";
    post.subtextFontFamily = "Arial";
    await render(post, ref);
    expect(() => ref.current!.exportPng4K()).not.toThrow();
  } finally {
    if (previous) Object.defineProperty(document, "fonts", previous);
    else delete (document as any).fonts;
  }
});

it("BUG-CL-033: empty body text allows export even if subtextFontFamily failed to load", async () => {
  const ref = React.createRef<CanvasPostStageRef>();
  const failedBodyFace = {
    family: "FailedBodyFont",
    status: "error",
  };
  const previous = Object.getOwnPropertyDescriptor(document, "fonts");
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      check: (font: string) => !font.includes("FailedBodyFont"),
      [Symbol.iterator]: function* () { yield failedBodyFace; },
      status: "loaded",
      ready: Promise.resolve(),
    },
  });
  try {
    const post = structuredClone(INITIAL_POST);
    post.fontFamily = "Arial";
    post.subtextFontFamily = "FailedBodyFont";
    post.slides[0].subtext = ""; // empty subtext
    await render(post, ref);
    expect(() => ref.current!.exportPng4K()).not.toThrow();
  } finally {
    if (previous) Object.defineProperty(document, "fonts", previous);
    else delete (document as any).fonts;
  }
});

it("reversible visibility excludes pending native images and hidden fonts while locking leaves export visible", async () => {
  const post = structuredClone(INITIAL_POST), ref = createRef<CanvasPostStageRef>();
  post.bgImage = "https://example.com/unavailable.png";
  post.logoUrl = "https://example.com/logo.png";
  post.fontFamily = "HiddenHeadlineFont";
  post.slides = [{ id: "s", step: "", headline: "Hidden heading", subtext: "", elementStates: {
    background: { hidden: true }, logo: { hidden: true }, headline: { hidden: true },
  } }];
  const previous = Object.getOwnPropertyDescriptor(document, "fonts");
  Object.defineProperty(document, "fonts", { configurable: true, value: { check: () => false, forEach: (cb: any) => cb({ family: "HiddenHeadlineFont", status: "error" }) } });
  try {
    await render(post, ref);
    expect(ref.current!.exportPng4K()).toBe(capture.png);
    post.slides[0].elementStates = { background: { locked: true }, logo: { hidden: true }, headline: { hidden: true } };
    await render({...post}, ref);
    expect(() => ref.current!.exportPng4K()).toThrow(/carregamento/);
  } finally {
    if (previous) Object.defineProperty(document, "fonts", previous); else delete (document as any).fonts;
  }
});
