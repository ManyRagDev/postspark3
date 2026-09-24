import { describe, expect, it } from "vitest";
import { INITIAL_POST } from "../components/types";
import { applySlideVisualPatch } from "./slideVisualScope";

const post = {
  ...INITIAL_POST,
  bgImage: "original-global.png",
  currentSlideIndex: 1,
  slides: [
    { id: "a", step: "1", headline: "A", subtext: "A", bgImage: "a.png" },
    { id: "b", step: "2", headline: "B", subtext: "B", bgImage: "b.png" },
  ],
};

describe("applySlideVisualPatch", () => {
  it("altera somente o slide ativo sem tocar no fallback global", () => {
    const patch = applySlideVisualPatch(post, { bgImage: "novo.png" }, false);
    expect(patch.bgImage).toBeUndefined();
    expect(patch.slides?.[0].bgImage).toBe("a.png");
    expect(patch.slides?.[1].bgImage).toBe("novo.png");
    expect(post.slides[1].bgImage).toBe("b.png");
  });

  it("remove o fundo local sem reexibir o fallback global", () => {
    const patch = applySlideVisualPatch(post, { bgImage: undefined }, false);
    expect(patch.slides?.[1].bgImage).toBe("");
    expect(patch.bgImage).toBeUndefined();
  });

  it("propaga apenas o ajuste visual solicitado a todos os slides", () => {
    const patch = applySlideVisualPatch(post, { splitBgPosition: "top" }, true);
    expect(patch.splitBgPosition).toBe("top");
    expect(patch.slides?.map((slide) => slide.splitBgPosition)).toEqual(["top", "top"]);
    expect(patch.slides?.map((slide) => slide.headline)).toEqual(["A", "B"]);
  });
});
