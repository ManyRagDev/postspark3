import { describe, expect, it } from "vitest";
import { createPostVariation } from "../tests/fixtures/postspark";
import { postVisualSnapshotSchema, textElementSchema } from "./postsparkSchemas";
import { DEFAULT_BG_OVERLAY, DEFAULT_IMAGE_SETTINGS, DEFAULT_LAYOUT_SETTINGS } from "./postspark";

describe("postspark persistence schemas", () => {
  it("accepts a complete visual snapshot from the canonical contract", () => {
    const variation = createPostVariation();
    const result = postVisualSnapshotSchema.safeParse({
      snapshotVersion: 1,
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
