import { describe, it, expect } from "vitest";
import { INITIAL_POST, type CanvasPostModel, type CarouselSlideItem } from "../components/types";
import { collectUsedFontsForSlide, collectUsedFontsForDocument, cleanFontFamily } from "./exportReadiness";
import { createArsenalFixtureComposition } from "./arsenalFixture";
import { addArsenalAuthorialLayer } from "./arsenalComposition";

describe("exportReadiness (OS-003-008-C05 / BUG-CL-033)", () => {
  it("cleanFontFamily trims and strips quotes", () => {
    expect(cleanFontFamily('"Arial"')).toBe("Arial");
    expect(cleanFontFamily("'Playfair Display'")).toBe("Playfair Display");
    expect(cleanFontFamily("")).toBeNull();
    expect(cleanFontFamily(undefined)).toBeNull();
  });

  it("empty subtext ignores configured subtextFontFamily (BUG-CL-033 emptyBodyFont)", () => {
    const post: CanvasPostModel = {
      ...structuredClone(INITIAL_POST),
      fontFamily: "Arial",
      subtextFontFamily: "AuditEmptyBody",
      slides: [
        {
          id: "s1",
          step: "",
          headline: "Main Headline",
          subtext: "", // Empty subtext
        },
      ],
    };

    const used = collectUsedFontsForSlide(post.slides[0], post);
    expect(used.has("Arial")).toBe(true);
    expect(used.has("AuditEmptyBody")).toBe(false);
  });

  it("visible subtext requires subtextFontFamily (BUG-CL-033 failedBodyFont)", () => {
    const post: CanvasPostModel = {
      ...structuredClone(INITIAL_POST),
      fontFamily: "Arial",
      subtextFontFamily: "AuditFailedBody",
      slides: [
        {
          id: "s1",
          step: "",
          headline: "Main Headline",
          subtext: "Visible body text here",
        },
      ],
    };

    const used = collectUsedFontsForSlide(post.slides[0], post);
    expect(used.has("Arial")).toBe(true);
    expect(used.has("AuditFailedBody")).toBe(true);
  });

  it("unrelated font not used in slide is not in used fonts (unrelatedFont)", () => {
    const post: CanvasPostModel = {
      ...structuredClone(INITIAL_POST),
      fontFamily: "Arial",
      slides: [
        {
          id: "s1",
          step: "",
          headline: "Main Headline",
          subtext: "Some subtext",
        },
      ],
    };

    const used = collectUsedFontsForSlide(post.slides[0], post);
    expect(used.has("AuditUnused")).toBe(false);
  });

  it("composition collects only visible text element fonts and ignores empty/invisible text", () => {
    const comp = createArsenalFixtureComposition();
    const withAuthorial = addArsenalAuthorialLayer(comp, {
      id: "tx-empty",
      kind: "text",
      text: "", // Empty authorial text
      x: 0,
      y: 0,
      width: 100,
      height: 30,
      rotation: 0,
      opacity: 1,
      parentId: null,
      zIndex: 50,
      fontSize: 16,
      fontFamily: "EmptyAuthorialFont",
      fill: "#000",
    });

    const slide: CarouselSlideItem = {
      id: "c1",
      step: "",
      headline: "Comp Headline",
      subtext: "",
      composition: withAuthorial,
    };

    const post: CanvasPostModel = {
      ...structuredClone(INITIAL_POST),
      slides: [slide],
    };

    const used = collectUsedFontsForSlide(slide, post);
    expect(used.has("EmptyAuthorialFont")).toBe(false);
  });

  it("hidden or opacity-zero extra texts do not require their font", () => {
    const slide: CarouselSlideItem = {
      id: "s1",
      step: "",
      headline: "Headline",
      subtext: "",
      extraTexts: [
        {
          id: "et-hidden",
          text: "Invisible text",
          fontFamily: "HiddenExtraFont",
          opacity: 0,
          x: 0,
          y: 0,
          fontSize: 14,
        },
      ],
    };
    const post: CanvasPostModel = {
      ...structuredClone(INITIAL_POST),
      slides: [slide],
    };

    const used = collectUsedFontsForSlide(slide, post);
    expect(used.has("HiddenExtraFont")).toBe(false);
  });
});
