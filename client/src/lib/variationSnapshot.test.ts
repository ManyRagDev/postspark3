import { beforeEach, describe, expect, it } from "vitest";
import { createPostVariation } from "../../../tests/fixtures/postspark";
import { useEditorStore } from "../store/editorStore";
import { buildVariationSnapshot, hasManualSectionLayouts, normalizeSections, normalizeVariationForEditor } from "./variationSnapshot";

describe("variationSnapshot", () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
  });

  it("normalizes structured sections with stable ids and icons", () => {
    const sections = normalizeSections(createPostVariation().sections);

    expect(sections).toEqual([
      expect.objectContaining({ id: "section-1", icon: "Target", number: 1 }),
      expect.objectContaining({
        id: "section-plan",
        icon: "Target",
        number: 2,
      }),
      expect.objectContaining({
        id: "section-3",
        icon: "TrendingUp",
        number: 3,
      }),
    ]);
  });

  it("preserves rich visual fields when normalizing for the editor", () => {
    const variation = createPostVariation();
    const normalized = normalizeVariationForEditor(variation);

    expect(normalized.imageUrl).toBe(variation.imageUrl);
    expect(normalized.designTokens).toEqual(variation.designTokens);
    expect(normalized.textElements).toEqual(variation.textElements);
    expect(normalized.template).toBe("feature-grid");
    expect(normalized.layoutSettingsByAspectRatio).toEqual(variation.layoutSettingsByAspectRatio);
    expect(normalized.layoutSettings?.sectionLayouts).toEqual(variation.layoutSettings?.sectionLayouts);
  });

  it("does not invent absolute section geometry during editor normalization", () => {
    const normalized = normalizeVariationForEditor(
      createPostVariation({
        layoutSettings: undefined,
        layoutSettingsByAspectRatio: undefined,
      })
    );

    expect(normalized.layoutSettings).toBeUndefined();
    expect(normalized.layoutSettingsByAspectRatio).toBeUndefined();
    expect(hasManualSectionLayouts(normalized.layoutSettings)).toBe(false);
  });

  it("builds a complete persistence snapshot from editor state", () => {
    const variation = createPostVariation({
      bgValue: {
        type: "gallery",
        url: "https://fixture.example/background.jpg",
      },
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

    const snapshot = buildVariationSnapshot(useEditorStore.getState(), variation, "5:6");

    expect(snapshot).toMatchObject({
      headline: "Headline editada",
      aspectRatio: "5:6",
      imageUrl: variation.imageUrl,
      template: "feature-grid",
      textElements: variation.textElements,
      designTokens: variation.designTokens,
      bgValue: variation.bgValue,
    });
    expect(snapshot.sections?.every(section => Boolean(section.id))).toBe(true);
    expect(snapshot.layoutSettings.sectionLayouts).toEqual({});
    expect(snapshot.layoutSettings.headline).toMatchObject({
      width: 64,
      freePosition: { x: 50, y: 22 },
    });
  });

  it("persists only section positions explicitly created by the user", () => {
    const variation = createPostVariation();
    const store = useEditorStore.getState();

    store.setActiveVariation(variation);
    store.updateLayoutSettings({
      sectionLayouts: {
        "section-1": {
          position: "center",
          textAlign: "center",
          width: 30,
          freePosition: { x: 22, y: 68 },
        },
      },
    });

    const snapshot = buildVariationSnapshot(useEditorStore.getState(), variation, "1:1");

    expect(snapshot.layoutSettings.sectionLayouts).toEqual({
      "section-1": expect.objectContaining({
        width: 30,
        freePosition: { x: 22, y: 68 },
      }),
    });
  });
});
