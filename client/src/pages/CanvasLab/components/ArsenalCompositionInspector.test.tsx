// @vitest-environment happy-dom
import React, {act} from "react";
import {createRoot, type Root} from "react-dom/client";
import {beforeEach, afterEach, expect, it, vi} from "vitest";
import {createCanvas} from "@napi-rs/canvas";
import {createArsenalFixtureComposition} from "../lib/arsenalFixture";
import {addArsenalAuthorialLayer} from "../lib/arsenalComposition";
import ArsenalCompositionInspector from "./ArsenalCompositionInspector";
vi.mock("./CanvasPostStage", () => ({CanvasPostStage: () => <div />}));
vi.mock("../lib/arsenalAssets", () => ({ensureArsenalFont: async () => {}, ensureArsenalCompositionFonts: async () => {}}));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => createCanvas(20,20).getContext("2d") as never);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => {act(() => root.unmount()); host.remove(); vi.restoreAllMocks();});
function mount(section: "content" | "style" | "design" | "media", photo = false) {
  const c = photo ? addArsenalAuthorialLayer(createArsenalFixtureComposition(), {id:"photo-test", kind:"image", url:"https://example.com/photo.png", x:0,y:0,width:100,height:100,zIndex:99,parentId:null,rotation:0,opacity:1}) : createArsenalFixtureComposition();
  const selectedId = photo ? "photo-test" : c.elements.find(e => e.kind === "text")!.id;
  const onChange = vi.fn();
  act(() => root.render(<ArsenalCompositionInspector section={section} composition={c} selectedId={selectedId} onSelect={vi.fn()} onChange={onChange} />));
  return {c, onChange};
}
it("Text contains content editing without competing typography controls", () => {
  mount("content"); expect(host.textContent).toContain("Conteúdo vinculado");
  expect(host.querySelector('[aria-label="Fonte da peça"]')).toBeNull();
  expect(host.textContent).not.toContain("Relações vinculadas");
});
it("Style exposes working composition typography and all vetted bundled fonts", () => {
  mount("style"); expect(host.querySelector('[aria-label="Fonte da peça"]')?.textContent).toContain("Anton");
  expect(host.querySelector('[aria-label="Fonte da peça"]')?.textContent).toContain("Playfair");
  expect(host.textContent).not.toContain("Conteúdo vinculado");
  expect(host.textContent).not.toContain("Enviar ao fundo");
});
it("Design removes a selected overlay and exposes sibling ordering and group placement", () => {
  const {onChange} = mount("design", true);
  expect(host.querySelector('[aria-label="Grupo da camada"]')).not.toBeNull();
  expect(host.textContent).toContain("Enviar ao fundo");
  act(() => Array.from(host.querySelectorAll('button')).find(b => b.textContent === "Remover elemento")!.click());
  expect(onChange.mock.calls[0][0].authorialLayers).toEqual([]);
  expect(host.querySelector('[aria-label="Fonte da peça"]')).toBeNull();
});
it("Media exposes photo controls without the old family selector", () => {
  mount("media", true); expect(host.querySelector('[aria-label="Foto da composição"]')).not.toBeNull();
  expect(host.textContent).not.toContain("Conteúdo vinculado");
  expect(host.querySelector('[aria-label="Fonte da peça"]')).toBeNull();
});
it("preserves fractional geometry when a field is focused and blurred without editing", () => {
  const c = addArsenalAuthorialLayer(createArsenalFixtureComposition(), {id:"photo-precision", kind:"image", url:"https://example.com/photo.png", x:10.75,y:0,width:100,height:100,zIndex:99,parentId:null,rotation:0,opacity:1});
  const onChange = vi.fn();
  act(() => root.render(<ArsenalCompositionInspector section="design" composition={c} selectedId="photo-precision" onSelect={vi.fn()} onChange={onChange} />));
  const input = host.querySelector<HTMLInputElement>('[aria-label="Peça x"]')!;
  expect(input.value).toBe("10.75");
  act(() => { input.focus(); input.blur(); });
  expect(onChange).not.toHaveBeenCalled();
  act(() => { input.focus(); input.value = "12.125"; input.blur(); });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0][0].elements.find((element: {id: string}) => element.id === "photo-precision").x).toBe(12.125);
  const width = host.querySelector<HTMLInputElement>('[aria-label="Peça width"]')!;
  act(() => { width.focus(); width.value = ""; width.blur(); });
  expect(width.value).toBe("100");
  expect(onChange).toHaveBeenCalledTimes(1);
});
