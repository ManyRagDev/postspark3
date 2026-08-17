import { describe, expect, it } from "vitest";
import { CAROUSEL_SLIDES, IMAGE_ELEMENTS, createPostVariation } from "../tests/fixtures/postspark";
import { postVisualSnapshotSchema, textElementSchema } from "./postsparkSchemas";
import { DEFAULT_BG_OVERLAY, DEFAULT_IMAGE_SETTINGS, DEFAULT_LAYOUT_SETTINGS } from "./postspark";

describe("postspark persistence schemas", () => {
  it("accepts a complete visual snapshot from the canonical contract", () => {
    const variation = createPostVariation({ imageElements: IMAGE_ELEMENTS });
    const result = postVisualSnapshotSchema.safeParse({
      snapshotVersion: 2,
      ...variation,
      aspectRatio: variation.aspectRatio ?? "1:1",
      postMode: variation.postMode ?? "static",
      imageSettings: variation.imageSettings ?? DEFAULT_IMAGE_SETTINGS,
      layoutSettings: variation.layoutSettings ?? DEFAULT_LAYOUT_SETTINGS,
      bgValue: variation.bgValue ?? {
        type: "solid",
        color: variation.backgroundColor,
      },
      bgOverlay: variation.bgOverlay ?? DEFAULT_BG_OVERLAY,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.imageElements).toEqual(IMAGE_ELEMENTS);
    }
  });

  it("preserves image elements inside carousel variation overrides", () => {
    const variation = createPostVariation({
      postMode: "carousel",
      slides: CAROUSEL_SLIDES.map((slide, index) =>
        index === 1
          ? {
              ...slide,
              editorState: { variation: { imageElements: IMAGE_ELEMENTS } },
            }
          : slide,
      ),
    });

    const result = postVisualSnapshotSchema.parse({
      snapshotVersion: 2,
      ...variation,
      aspectRatio: variation.aspectRatio ?? "1:1",
      imageSettings: variation.imageSettings ?? DEFAULT_IMAGE_SETTINGS,
      layoutSettings: variation.layoutSettings ?? DEFAULT_LAYOUT_SETTINGS,
      bgValue: variation.bgValue ?? { type: "solid", color: variation.backgroundColor },
      bgOverlay: variation.bgOverlay ?? DEFAULT_BG_OVERLAY,
    });

    expect(result.slides?.[1].editorState?.variation?.imageElements).toEqual(IMAGE_ELEMENTS);
  });

  it.each([1, 2] as const)("accepts snapshot version %s without image elements", snapshotVersion => {
    const variation = createPostVariation({ imageElements: undefined });
    const result = postVisualSnapshotSchema.safeParse({
      snapshotVersion,
      ...variation,
      aspectRatio: variation.aspectRatio ?? "1:1",
      postMode: variation.postMode ?? "static",
      imageSettings: variation.imageSettings ?? DEFAULT_IMAGE_SETTINGS,
      layoutSettings: variation.layoutSettings ?? DEFAULT_LAYOUT_SETTINGS,
      bgValue: variation.bgValue ?? { type: "solid", color: variation.backgroundColor },
      bgOverlay: variation.bgOverlay ?? DEFAULT_BG_OVERLAY,
    });

    expect(result.success).toBe(true);
  });

  it("rejects unsupported text alignment values", () => {
    const element = createPostVariation().textElements?.[0];
    expect(element).toBeDefined();

    const result = textElementSchema.safeParse({
      ...element,
      styles: {
        ...element?.styles,
        textAlign: "justify",
      },
    });

    expect(result.success).toBe(false);
  });

  // ── Fase A.3: contrato de design tokens ────────────────────────────

  it("Fase A.3: v3 snapshot rejects missing designTokens", () => {
    const variation = createPostVariation();
    const result = postVisualSnapshotSchema.safeParse({
      snapshotVersion: 3,
      ...variation,
      aspectRatio: variation.aspectRatio ?? "1:1",
      postMode: variation.postMode ?? "static",
      designTokens: undefined,
      imageSettings: variation.imageSettings ?? DEFAULT_IMAGE_SETTINGS,
      layoutSettings: variation.layoutSettings ?? DEFAULT_LAYOUT_SETTINGS,
      bgValue: variation.bgValue ?? { type: "solid", color: variation.backgroundColor },
      bgOverlay: variation.bgOverlay ?? DEFAULT_BG_OVERLAY,
    });

    expect(result.success).toBe(false);
  });

  it("Fase A.3: v3 snapshot rejects partial designTokens (missing structure group)", () => {
    const variation = createPostVariation();
    const result = postVisualSnapshotSchema.safeParse({
      snapshotVersion: 3,
      ...variation,
      aspectRatio: variation.aspectRatio ?? "1:1",
      postMode: variation.postMode ?? "static",
      designTokens: {
        colors: { background: "#101828", primary: "#7F56D9", secondary: "#D0D5DD", text: "#FFFFFF", card: "#1D2939" },
        typography: { fontFamily: "Inter", customFontUrl: "", originalFont: "Inter", textTransform: "none", textAlign: "left" },
        // structure group intentionally missing
      },
      imageSettings: variation.imageSettings ?? DEFAULT_IMAGE_SETTINGS,
      layoutSettings: variation.layoutSettings ?? DEFAULT_LAYOUT_SETTINGS,
      bgValue: variation.bgValue ?? { type: "solid", color: variation.backgroundColor },
      bgOverlay: variation.bgOverlay ?? DEFAULT_BG_OVERLAY,
    });

    expect(result.success).toBe(false);
  });

  it("Fase A.3: v3 snapshot with complete designTokens passes", () => {
    const variation = createPostVariation();
    const result = postVisualSnapshotSchema.safeParse({
      snapshotVersion: 3,
      ...variation,
      aspectRatio: variation.aspectRatio ?? "1:1",
      postMode: variation.postMode ?? "static",
      designTokens: {
        colors: { background: "#101828", primary: "#7F56D9", secondary: "#D0D5DD", text: "#FFFFFF", card: "#1D2939" },
        typography: { fontFamily: "Inter", customFontUrl: "", originalFont: "Inter", textTransform: "none", textAlign: "left" },
        structure: { borderRadius: "12px", boxShadow: "none", border: "none" },
        decorations: "minimal",
      },
      imageSettings: variation.imageSettings ?? DEFAULT_IMAGE_SETTINGS,
      layoutSettings: variation.layoutSettings ?? DEFAULT_LAYOUT_SETTINGS,
      bgValue: variation.bgValue ?? { type: "solid", color: variation.backgroundColor },
      bgOverlay: variation.bgOverlay ?? DEFAULT_BG_OVERLAY,
    });

    expect(result.success).toBe(true);
  });

  it("Fase A.3: v2 legacy snapshot accepts partial designTokens (normalized later)", () => {
    const variation = createPostVariation();
    const result = postVisualSnapshotSchema.safeParse({
      snapshotVersion: 2,
      ...variation,
      aspectRatio: variation.aspectRatio ?? "1:1",
      postMode: variation.postMode ?? "static",
      designTokens: { colors: { background: "#101828", primary: "#7F56D9", secondary: "#D0D5DD", text: "#FFFFFF", card: "#1D2939" } },
      imageSettings: variation.imageSettings ?? DEFAULT_IMAGE_SETTINGS,
      layoutSettings: variation.layoutSettings ?? DEFAULT_LAYOUT_SETTINGS,
      bgValue: variation.bgValue ?? { type: "solid", color: variation.backgroundColor },
      bgOverlay: variation.bgOverlay ?? DEFAULT_BG_OVERLAY,
    });

    expect(result.success).toBe(true);
  });
});
