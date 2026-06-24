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
});
