import { beforeEach, describe, expect, it } from "vitest";
import { createPostVariation } from "../../../tests/fixtures/postspark";
import { useEditorStore } from "../store/editorStore";
import {
  buildVariationSnapshot,
  buildResponsiveSectionLayouts,
  normalizeSections,
  normalizeVariationForEditor,
} from "./variationSnapshot";

describe("variationSnapshot", () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
  });

  it("normalizes structured sections with stable ids and icons", () => {
    const sections = normalizeSections(createPostVariation().sections);

    expect(sections).toEqual([
      expect.objectContaining({ id: "section-1", icon: "Target", number: 1 }),
      expect.objectContaining({ id: "section-plan", icon: "Target", number: 2 }),
      expect.objectContaining({ id: "section-3", icon: "TrendingUp", number: 3 }),
    ]);
  });

  it("preserves rich visual fields when normalizing for the editor", () => {
    const variation = createPostVariation();
    const normalized = normalizeVariationForEditor(variation);

    expect(normalized.imageUrl).toBe(variation.imageUrl);
    expect(normalized.designTokens).toEqual(variation.designTokens);
    expect(normalized.textElements).toEqual(variation.textElements);
    expect(normalized.template).toBe("feature-grid");
    expect(normalized.layoutSettingsByAspectRatio?.["1:1"]).toBeDefined();
    expect(normalized.layoutSettingsByAspectRatio?.["5:6"]).toBeDefined();
    expect(normalized.layoutSettingsByAspectRatio?.["9:16"]).toBeDefined();
  });

  it("distributes feature sections across rows without sharing the same center", () => {
    const sections = Array.from({ length: 5 }, (_, index) => ({
      id: `section-${index + 1}`,
      label: `Item ${index + 1}`,
    }));

    const square = buildResponsiveSectionLayouts(sections, "feature-grid", "1:1");
    const story = buildResponsiveSectionLayouts(sections, "feature-grid", "9:16");

    expect(new Set(Object.values(square).map((layout) => layout.freePosition?.y)).size).toBe(2);
    expect(new Set(Object.values(story).map((layout) => layout.freePosition?.y)).size).toBe(3);
    expect(Object.values(story).every((layout) => (layout.width ?? 100) <= 36)).toBe(true);
  });

  it("builds a complete persistence snapshot from editor state", () => {
    const variation = createPostVariation({
      bgValue: { type: "gallery", url: "https://fixture.example/background.jpg" },
      imageSettings: { zoom: 1.25, brightness: 1.1 },
    });
    const store = useEditorStore.getState();

    store.setActiveVariation(variation);
    store.updateVariation({ headline: "Headline editada" });
    store.updateLayoutSettings({
      headline: {
        position: "center",
        textAlign: "center",
        width: 64,
        freePosition: { x: 50, y: 22 },
      },
    });

    const snapshot = buildVariationSnapshot(
      useEditorStore.getState(),
      variation,
      "5:6",
    );

    expect(snapshot).toMatchObject({
      headline: "Headline editada",
      aspectRatio: "5:6",
      imageUrl: variation.imageUrl,
      template: "feature-grid",
      textElements: variation.textElements,
      designTokens: variation.designTokens,
      bgValue: variation.bgValue,
    });
    expect(snapshot.sections?.every((section) => Boolean(section.id))).toBe(true);
    expect(snapshot.layoutSettings.sectionLayouts).toHaveProperty("section-1");
    expect(snapshot.layoutSettings.headline).toMatchObject({
      width: 64,
      freePosition: { x: 50, y: 22 },
    });
  });
});
