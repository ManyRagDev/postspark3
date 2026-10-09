// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { arsenalHash } from "@shared/arsenalContent";
import CanvasLabPage from "./CanvasLabPage";
import { INITIAL_POST } from "./components/types";
import { createArsenalFixtureComposition } from "./lib/arsenalFixture";
import { resolveArsenalComposition } from "./lib/arsenalComposition";

const exports = vi.hoisted(() => ({ png: vi.fn(), zip: vi.fn() }));
vi.mock("./components/CanvasPostStage", async () => {
  const React = await import("react");
  return { CanvasPostStage: React.forwardRef((_, ref) => {
    React.useImperativeHandle(ref, () => ({ exportPng4K: exports.png, exportZip4K: exports.zip }));
    return null;
  }) };
});
vi.mock("./components/CanvasTopBar", () => ({ default: (props: { onExportPng: () => void; onExportZip: () => void }) => <><button onClick={props.onExportPng}>PNG</button><button onClick={props.onExportZip}>ZIP</button></> }));
vi.mock("./components/CanvasMobileQuickActions", () => ({ default: () => null }));
vi.mock("./components/CanvasSidebar", () => ({ default: () => null }));
vi.mock("./components/CanvasMobileDrawer", () => ({ default: () => null }));
vi.mock("./components/CanvasToolRail", () => ({ default: () => null }));
vi.mock("./components/CarouselFilmstrip", () => ({ default: () => null }));
vi.mock("./components/GuidedEditor", () => ({ default: () => null }));
vi.mock("./components/ArsenalCompositionInspector", () => ({ default: () => null }));
vi.mock("./components/SlideReplicationDialog", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => createCanvas(20, 20).getContext("2d") as never);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.spyOn(window, "confirm").mockImplementation(() => { throw new Error("Native confirmation must not be called"); });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("URL", { createObjectURL: () => "blob:export", revokeObjectURL: () => {} });
  exports.png.mockReset().mockReturnValue("data:image/png;base64,aW1hZ2U=");
  exports.zip.mockReset().mockResolvedValue(new Blob(["zip"]));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function postWithPendingPhotos() {
  const source = createArsenalFixtureComposition();
  source.base = { ...source.base, mediaSlots: source.elements.filter(e => e.kind === "media").map(e => ({ id: e.id, label: "Fotografia", function: "editorial", prompt: "Imagem editorial", deferred: true, policy: "cover" as const })) };
  source.origin = { ...source.origin, variantHash: arsenalHash(source.base) };
  const composition = resolveArsenalComposition(source);
  const post = structuredClone(INITIAL_POST);
  post.currentSlideIndex = 0;
  post.slides = [0, 1].map(index => ({ ...post.slides[0], id: `slide-${index}`, composition: structuredClone(composition) }));
  return post;
}
async function click(text: string) {
  const button = Array.from(host.querySelectorAll("button")).find(button => button.textContent === text);
  if (!button) throw new Error(`Button missing: ${text}`);
  await act(async () => { button.click(); });
}

it("PNG asks about the current slide and exports only after explicit approval; cancellation exports nothing", async () => {
  await act(async () => { root.render(<CanvasLabPage initialPost={postWithPendingPhotos()} />); });
  await click("PNG");
  const dialog = host.querySelector('[role="dialog"]')!;
  expect(dialog.getAttribute("aria-label")).toBe("Exportar com imagens pendentes?");
  expect(dialog.textContent).toContain("Há 1 espaço de imagem pendente neste slide");
  expect(exports.png).not.toHaveBeenCalled();
  await click("Cancelar");
  expect(exports.png).not.toHaveBeenCalled();
  await click("PNG");
  await click("Exportar mesmo assim");
  expect(exports.png).toHaveBeenCalledTimes(1);
  expect(window.confirm).not.toHaveBeenCalled();
});

it("ZIP counts the entire carousel and never starts rendering before approval", async () => {
  await act(async () => { root.render(<CanvasLabPage initialPost={postWithPendingPhotos()} />); });
  await click("ZIP");
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain("Há 2 espaços de imagem pendentes no carrossel");
  expect(exports.zip).not.toHaveBeenCalled();
  await click("Exportar mesmo assim");
  expect(exports.zip).toHaveBeenCalledTimes(1);
  expect(window.confirm).not.toHaveBeenCalled();
});
