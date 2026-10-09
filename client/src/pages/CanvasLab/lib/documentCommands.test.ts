import { describe, expect, it } from "vitest";
import type { CanvasPostModel } from "../components/types";
import {
  applyPatchToAllSlides,
  applyPatchToCurrentSlide,
  duplicateSlide,
  removeSlide,
  reorderSlides,
  resolveCoverSlide,
  setCurrentSlideBackground,
} from "./documentCommands";
import { createArsenalFixtureComposition } from "./arsenalFixture";
import { addArsenalAuthorialLayer, overrideArsenalElement } from "./arsenalComposition";

function makePost(overrides: Partial<CanvasPostModel> = {}): CanvasPostModel {
  return {
    id: "test-post",
    familyId: "editorial-poster",
    familyName: "Editorial de Luxo",
    aspectRatio: "1:1",
    headlineAlign: "left",
    bodyAlign: "left",
    badgeText: "",
    headline: "Headline root",
    subtext: "Subtext root",
    caption: "",
    fontFamily: "Playfair Display",
    overlayOpacity: 0.55,
    logoPosition: "top-right",
    palette: { background: "#120D0A", text: "#F8F4EE", accent: "#E5A93C" },
    currentSlideIndex: 0,
    slides: [
      { id: "s1", step: "SLIDE 01", headline: "Slide 1", subtext: "Body 1" },
      { id: "s2", step: "SLIDE 02", headline: "Slide 2", subtext: "Body 2" },
      { id: "s3", step: "SLIDE 03", headline: "Slide 3", subtext: "Body 3" },
    ],
    ...overrides,
  };
}

describe("documentCommands", () => {
  it("applies a patch only to the current slide (no root write, no cross-talk)", () => {
    const post = makePost({ currentSlideIndex: 1 });
    const next = applyPatchToCurrentSlide(post, { headline: "NOVO SLIDE 2" });

    expect(next.slides[1].headline).toBe("NOVO SLIDE 2");
    expect(next.slides[0].headline).toBe("Slide 1");
    expect(next.slides[2].headline).toBe("Slide 3");
    // Root global não é alterado
    expect(next.headline).toBe("Headline root");
    // Imutável
    expect(post.slides[1].headline).toBe("Slide 2");
  });

  it("applies a patch to all slides explicitly", () => {
    const post = makePost();
    const next = applyPatchToAllSlides(post, { bgImage: "https://x/y.png" });
    expect(next.slides.every((s) => s.bgImage === "https://x/y.png")).toBe(true);
    // Root global não é alterado
    expect(next.bgImage).toBeUndefined();
  });

  it("isolates background per slide", () => {
    const post = makePost({ currentSlideIndex: 0 });
    const next = setCurrentSlideBackground(post, { bgImage: "bg-1", bgTransform: { x: 1, y: 2, scaleX: 2, scaleY: 2 } });

    expect(next.slides[0].bgImage).toBe("bg-1");
    expect(next.slides[1].bgImage).toBeUndefined();
    expect(next.bgImage).toBeUndefined();
  });

  it("duplicate generates fresh internal IDs and deep-clones nested elements", () => {
    const post = makePost({
      slides: [
        {
          id: "s1",
          step: "SLIDE 01",
          headline: "Original",
          subtext: "Body",
          extraTexts: [{ id: "tx-1", text: "A", fontWeight: "bold" }],
          extraImages: [{ id: "im-1", url: "u", x: 0, y: 0, width: 10, height: 10 }],
        },
      ],
    });

    const next = duplicateSlide(post, 0);
    expect(next.slides).toHaveLength(2);

    const copy = next.slides[1];
    expect(copy.id).not.toBe("s1");
    expect(copy.extraTexts?.[0].id).not.toBe("tx-1");
    expect(copy.extraImages?.[0].id).not.toBe("im-1");

    // Referências aninhadas não são compartilhadas
    expect(copy.extraTexts).not.toBe(post.slides[0].extraTexts);
    expect(copy.extraTexts?.[0]).not.toBe(post.slides[0].extraTexts?.[0]);

    // Nenhum ID duplicado no documento
    const ids = next.slides.flatMap((s) => [
      s.id,
      ...(s.extraTexts?.map((t) => t.id) ?? []),
      ...(s.extraImages?.map((i) => i.id) ?? []),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never removes the last slide", () => {
    const single = makePost({ slides: [makePost().slides[0]] });
    const next = removeSlide(single, 0);
    expect(next.slides).toHaveLength(1);
  });

  it("reorder keeps stable IDs and updates order", () => {
    const post = makePost();
    const next = reorderSlides(post, 2, 0);
    expect(next.slides.map((s) => s.id)).toEqual(["s3", "s1", "s2"]);
    expect(next.slides[0].headline).toBe("Slide 3");
  });

  it("resolveCoverSlide always returns the first slide", () => {
    const post = makePost({ currentSlideIndex: 2 });
    expect(resolveCoverSlide(post).headline).toBe("Slide 1");
  });

  it("duplica slide com composição Arsenal V3 gerando novos IDs para camadas autorais e remapeando overrides", () => {
    let comp = addArsenalAuthorialLayer(createArsenalFixtureComposition(), {
      id: "orig-layer-1",
      kind: "text",
      text: "Camada Original",
      zIndex: 1,
      parentId: null,
      x: 15,
      y: 25,
      width: 120,
      height: 40,
      rotation: 0,
      opacity: 1,
    });
    // Add an override to orig-layer-1
    comp = overrideArsenalElement(comp, "orig-layer-1", { fontSize: 28 });

    const post = makePost({
      slides: [
        {
          id: "s1",
          step: "SLIDE 01",
          headline: "Slide 1",
          subtext: "Corpo 1",
          composition: comp,
        },
      ],
    });

    const next = duplicateSlide(post, 0);
    expect(next.slides).toHaveLength(2);

    const s0Comp = next.slides[0].composition!;
    const s1Comp = next.slides[1].composition!;

    expect(s1Comp).toBeDefined();
    expect(s1Comp).not.toBe(s0Comp); // deep cloned

    if (s1Comp.version === 3 && s0Comp.version === 3) {
      expect(s1Comp.authorialLayers[0].id).not.toBe("orig-layer-1");
      expect(s1Comp.authorialLayers[0].id).toMatch(/^tx-/);
      expect(s1Comp.authorialLayers[0].text).toBe("Camada Original");

      // Verify that the override was remapped to the new layer ID
      const newLayerId = s1Comp.authorialLayers[0].id;
      expect(s1Comp.overrides[newLayerId]).toBeDefined();
      expect(s1Comp.overrides[newLayerId].fontSize).toBe(28);
      expect(s1Comp.overrides["orig-layer-1"]).toBeUndefined();
    }
  });

  it("opera carrossel misto (slides com e sem composição) preservando integridade em reorder e remove", () => {
    const comp = createArsenalFixtureComposition();
    const post = makePost({
      slides: [
        { id: "s1", step: "1", headline: "Arsenal", subtext: "A", composition: comp },
        { id: "s2", step: "2", headline: "Legado 1", subtext: "B" },
        { id: "s3", step: "3", headline: "Legado 2", subtext: "C" },
      ],
    });

    // Reorder: move slide 0 to position 2
    const reordered = reorderSlides(post, 0, 2);
    expect(reordered.slides.map(s => s.id)).toEqual(["s2", "s3", "s1"]);
    expect(reordered.slides[2].composition).toBeDefined();
    expect(reordered.slides[0].composition).toBeUndefined();

    // Remove slide 1 (which is s3)
    const removed = removeSlide(reordered, 1);
    expect(removed.slides.map(s => s.id)).toEqual(["s2", "s1"]);
    expect(removed.slides[1].composition).toBeDefined();
    expect(removed.slides[0].composition).toBeUndefined();
  });
});