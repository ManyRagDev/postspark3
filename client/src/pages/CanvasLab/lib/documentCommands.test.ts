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
});