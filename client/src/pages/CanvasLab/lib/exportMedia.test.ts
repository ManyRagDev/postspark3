import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { createArsenalFixtureComposition } from "./arsenalFixture";
import { addArsenalAuthorialLayer, hideArsenalInstance, overrideArsenalElement, resolveArsenalComposition } from "./arsenalComposition";
import { exportImageNodeReady, renderedCompositionImageCount, visibleExportImageNodes } from "./exportMedia";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
beforeAll(() => Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => createCanvas(20, 20) } }));
afterAll(() => { if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else Reflect.deleteProperty(globalThis, "document"); });

describe("rendered export media", () => {
  it("waits for immutable raster layers even when they have no user-media URL", () => {
    const c=createArsenalFixtureComposition();
    const slot=c.elements.find(element=>element.kind==="media")!;
    slot.imageAssetId="image-"+"a".repeat(64);
    delete c.media[slot.id];
    expect(renderedCompositionImageCount(c)).toBe(1);
    slot.opacity=0;
    expect(renderedCompositionImageCount(c)).toBe(0);
  });
  it("does not wait for historical media after the filled catalog slot is hidden", () => {
    let c = createArsenalFixtureComposition();
    const slot = c.elements.find(element => element.kind === "media")!;
    c = resolveArsenalComposition({ ...c, media: { [slot.id]: { kind: "user", url: "/api/post-media/owner/photo", focalX: 0.5, focalY: 0.5 } } });
    expect(renderedCompositionImageCount(c)).toBe(1);
    const hidden = hideArsenalInstance(c, slot.id);
    expect(hidden.media[slot.id]).toEqual(c.media[slot.id]);
    expect(renderedCompositionImageCount(hidden)).toBe(0);
    expect(renderedCompositionImageCount(c)).toBe(1);
  });

  it("includes authorial images, background and visible logo but ignores transparent ancestors", () => {
    let c = createArsenalFixtureComposition();
    const slot = c.elements.find(element => element.kind === "media")!;
    c = resolveArsenalComposition({ ...c, media: { [slot.id]: { kind: "user", url: "https://example.com/photo.png", focalX: 0.5, focalY: 0.5 } } });
    expect(renderedCompositionImageCount(overrideArsenalElement(c, slot.parentId!, { opacity: 0 }))).toBe(0);
    c = addArsenalAuthorialLayer(c, { id: "author-photo", kind: "image", url: "https://example.com/extra.png", x: 20, y: 20, width: 100, height: 100, zIndex: 50 });
    if (c.version !== 3) throw new Error("Authorial layer must upgrade the document");
    c = { ...c, customBackground: { imageUrl: "https://example.com/bg.png" }, logo: { url: "https://example.com/logo.png", opacity: 0 } };
    expect(renderedCompositionImageCount(c)).toBe(3);
    expect(renderedCompositionImageCount(hideArsenalInstance(c, "author-photo"))).toBe(2);
  });

  it("checks only Konva nodes visible through their entire parent hierarchy", () => {
    const loaded = { image: () => ({ complete: true, naturalWidth: 20 }) };
    const hidden = { isVisible: () => false, image: () => undefined };
    const transparent = { getAbsoluteOpacity: () => 0, image: () => undefined };
    const visible = visibleExportImageNodes([loaded, hidden, transparent]);
    expect(visible).toEqual([loaded]);
    expect(visible.every(exportImageNodeReady)).toBe(true);
  });
});
