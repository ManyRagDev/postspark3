import { describe, expect, it } from "vitest";
import type { CanvasPostModel } from "../components/types";
import { canvasModelToSavePayload, savedPostToCanvasModel } from "./saveAdapter";

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
    caption: "Caption",
    fontFamily: "Playfair Display",
    overlayOpacity: 0.55,
    logoPosition: "top-right",
    palette: { background: "#120D0A", text: "#F8F4EE", accent: "#E5A93C" },
    currentSlideIndex: 0,
    slides: [
      { id: "s1", step: "SLIDE 01", headline: "Capa", subtext: "Corpo da capa", bgImage: "cover.png" },
      { id: "s2", step: "SLIDE 02", headline: "Slide 2", subtext: "Corpo 2" },
      { id: "s3", step: "SLIDE 03", headline: "Slide 3", subtext: "Corpo 3" },
      { id: "s4", step: "SLIDE 04", headline: "Slide 4", subtext: "Corpo 4" },
    ],
    ...overrides,
  };
}

describe("saveAdapter", () => {
  it("projects legacy fields from the cover (first slide), not the active slide", () => {
    const post = makePost({ currentSlideIndex: 3 });
    const payload = canvasModelToSavePayload(post, { inputType: "text", inputContent: "prompt" });

    expect(payload.headline).toBe("Capa");
    expect(payload.body).toBe("Corpo da capa");
    expect(payload.imageUrl).toBe("cover.png");
  });

  it("preserves all slides in order on the projected payload", () => {
    const post = makePost();
    const payload = canvasModelToSavePayload(post, { inputType: "text", inputContent: "p" });
    expect(payload.slides.map((s) => s.headline)).toEqual(["Capa", "Slide 2", "Slide 3", "Slide 4"]);
    expect(payload.postMode).toBe("carousel");
  });

  it("save → reopen round-trips all slides", () => {
    const post = makePost({ currentSlideIndex: 2 });
    const payload = canvasModelToSavePayload(post, { inputType: "text", inputContent: "p" });
    const reopened = savedPostToCanvasModel({
      id: 1,
      canvas_model: payload.canvasModel,
    });

    expect(reopened.slides).toHaveLength(4);
    expect(reopened.slides.map((s) => s.headline)).toEqual(["Capa", "Slide 2", "Slide 3", "Slide 4"]);
  });

  it("preserves provenance through save → reopen (local fallback never becomes AI)", () => {
    const provenance = {
      source: "local_fallback" as const,
      fallbackReason: "provider_unavailable",
      generatedAt: "2026-09-22T00:00:00.000Z",
    };
    const post = makePost({ provenance });
    const payload = canvasModelToSavePayload(post, { inputType: "text", inputContent: "p" });
    const reopened = savedPostToCanvasModel({
      id: 2,
      canvas_model: payload.canvasModel,
    });

    expect(reopened.provenance).toEqual(provenance);
  });

  it("round-trips enriched generation fields (CTA/hashtags/sections/copyAngle)", () => {
    const post = makePost({
      modelVersion: 2,
      callToAction: "Salve este post agora",
      hashtags: ["#Branding", "#Posicionamento"],
      sections: [
        { id: "sec-1", label: "Conexão", description: "Primeiro passo" },
        { id: "sec-2", label: "Autoridade", description: "Segundo passo" },
      ],
      copyAngle: { type: "autoridade", label: "Autoridade", badge: "AUTORIDADE" },
    });
    const payload = canvasModelToSavePayload(post, { inputType: "text", inputContent: "p" });
    const reopened = savedPostToCanvasModel({ id: 3, canvas_model: payload.canvasModel });

    expect(reopened.modelVersion).toBe(2);
    expect(reopened.callToAction).toBe("Salve este post agora");
    expect(reopened.hashtags).toEqual(["#Branding", "#Posicionamento"]);
    expect(reopened.sections).toHaveLength(2);
    expect(reopened.copyAngle?.type).toBe("autoridade");
  });

  it("applies safe defaults to legacy models without modelVersion or enriched fields", () => {
    const legacy = {
      id: "legacy-1",
      familyId: "editorial-poster",
      headline: "Título legado",
      subtext: "Corpo legado",
      caption: "",
      slides: [{ id: "s1", step: "SLIDE 01", headline: "Título", subtext: "Corpo" }],
    };
    const reopened = savedPostToCanvasModel({ id: 4, canvas_model: legacy });

    // Sem modelVersion: lido como legado, com defaults seguros e campos ausentes.
    expect(reopened.modelVersion).toBeUndefined();
    expect(reopened.callToAction).toBeUndefined();
    expect(reopened.hashtags).toBeUndefined();
    expect(reopened.sections).toBeUndefined();
    expect(reopened.provenance).toBeUndefined();
    expect(reopened.slides).toHaveLength(1);
    expect(reopened.palette.background).toBe("#120D0A");
    expect(reopened.aspectRatio).toBe("1:1");
  });
});
