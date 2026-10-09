import { describe, expect, it } from "vitest";
import { INITIAL_POST } from "../components/types";
import { captureInitialVisuals, composePost } from "./guidedComposition";
import {
  previewEmphasis,
  previewSolidBackground,
  suggestEmphasis,
} from "./guidedRefinements";
import { resolveSlideAppearance } from "./slideReplication";
import { contrastRatio } from "@shared/creative/color";

function fixture() {
  const post = structuredClone(INITIAL_POST);
  post.familyId = "brutal-split";
  post.palette = { background: "#111820", accent: "#F7B548", text: "#ffffff" };
  post.headlineEffect = "none";
  post.slides = [
    {
      id: "a",
      step: "",
      headline: "A armadilha dos 50% de desconto",
      subtext: "Compare os preços.",
      headlinePos: { x: 24, y: 35 },
    },
    { id: "b", step: "", headline: "Outro slide", subtext: "Preservado" },
  ];
  return captureInitialVisuals(post);
}
describe("guided refinements", () => {
  it("highlights only the phrase without moving, rewriting or touching other slides", () => {
    const post = fixture();
    const before = structuredClone(post);
    post.slides[0].headlineRich = [
      { text: post.slides[0].headline, bold: true, sizeScale: 1.1 },
    ];
    const result = previewEmphasis(post, "50%", "color").post!;
    expect(result.slides[0].headlineRich?.map(c => c.text).join("")).toBe(
      post.slides[0].headline
    );
    expect(
      result.slides[0].headlineRich?.find(c => c.text === "50%")?.color
    ).toBe("#F7B548");
    expect(
      result.slides[0].headlineRich?.every(c => c.bold && c.sizeScale === 1.1)
    ).toBe(true);
    expect(result.slides[0].headlinePos).toEqual(before.slides[0].headlinePos);
    expect(result.slides[1]).toEqual(before.slides[1]);
    expect(result.familyId).toBe(post.familyId);
    expect(post.slides[0].headlineRich).toHaveLength(1);
  });
  it("uses underline for low contrast, images and text effects", () => {
    for (const kind of ["contrast", "image", "effect"]) {
      const post = fixture();
      if (kind === "contrast") post.palette.accent = post.palette.background;
      if (kind === "image") post.bgImage = "photo.png";
      if (kind === "effect") post.headlineEffect = "box-accent";
      const chunks = previewEmphasis(post, "50%", "color").post!.slides[0]
        .headlineRich!;
      expect(chunks.find(c => c.text === "50%")).toMatchObject({
        underline: true,
        color: undefined,
      });
    }
  });
  it("rejects missing phrases and suggests a number", () => {
    expect(previewEmphasis(fixture(), "absent", "color").error).toBeTruthy();
    expect(previewEmphasis(fixture(), "", "color").error).toBeTruthy();
    expect(suggestEmphasis(fixture().slides[0].headline)).toBe("50%");
  });
  it("removes inherited photos only on the active slide and keeps split text readable", () => {
    const post = fixture();
    post.bgImage = "inherited.png";
    const result = previewSolidBackground(post, "#111820", "#F7B548");
    const view = resolveSlideAppearance(result, 0);
    expect(result.slides[0].bgImage).toBe("");
    expect(result.bgImage).toBe("inherited.png");
    expect(result.slides[1]).toEqual(post.slides[1]);
    expect(result.slides[0].headlinePos).toEqual(post.slides[0].headlinePos);
    expect(
      contrastRatio(view.palette.background, view.palette.headlineColor!)
    ).toBeGreaterThan(4.5);
    expect(
      contrastRatio(view.palette.accent, view.palette.subtextColor!)
    ).toBeGreaterThan(4.5);
  });
  it("keeps guided reading areas and body color in sync", () => {
    const post = composePost(fixture(), "balanced").post!;
    const result = previewSolidBackground(post, "#F4F0E8", "#254D43");
    const view = resolveSlideAppearance(result, 0);
    expect(result.slides[0].guidedComposition?.readingArea.color).toBe(
      "#F4F0E8"
    );
    expect(
      contrastRatio("#F4F0E8", view.palette.subtextColor!)
    ).toBeGreaterThan(4.5);
  });
});
