import { beforeEach, describe, expect, it } from "vitest";
import { CAROUSEL_SLIDES, FREE_TEXT_ELEMENTS, IMAGE_ELEMENTS, createCarouselVariation, createPostVariation } from "../../../tests/fixtures/postspark";
import { postVisualSnapshotSchema } from "../../../shared/postsparkSchemas";
import { useEditorStore } from "../store/editorStore";
import { applyDesignTokensToSnapshot, buildVariationSnapshot, createPostVisualSnapshot, hasManualSectionLayouts, normalizeSections, normalizeVariationForEditor, projectSnapshotForSlide } from "./variationSnapshot";

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
    const variation = createPostVariation({ imageElements: IMAGE_ELEMENTS });
    const normalized = normalizeVariationForEditor(variation);

    expect(normalized.imageUrl).toBe(variation.imageUrl);
    expect(normalized.designTokens).toEqual(variation.designTokens);
    expect(normalized.textElements).toEqual(variation.textElements);
    expect(normalized.imageElements).toEqual(IMAGE_ELEMENTS);
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

  it("resolves AI output once into a complete version 3 snapshot", () => {
    const variation = createPostVariation({
      imageUrl: undefined,
      bgValue: undefined,
      aspectRatioOptimizations: {
        "5:6": {
          layout: "centered",
          backgroundColor: "#112233",
          textColor: "#F8FAFC",
          accentColor: "#22C55E",
        },
      },
    });

    const snapshot = createPostVisualSnapshot(variation, "5:6");

    expect(snapshot).toMatchObject({
      snapshotVersion: 3,
      aspectRatio: "5:6",
      layout: "centered",
      backgroundColor: "#112233",
      textColor: "#F8FAFC",
      accentColor: "#22C55E",
      bgValue: { type: "solid", color: "#112233" },
      designTokens: {
        colors: {
          background: "#112233",
          text: "#F8FAFC",
          primary: "#22C55E",
        },
      },
    });
    expect(snapshot.layoutSettings.headline.textAlign).toBe("center");
  });

  it("stores the exact selected snapshot and keeps it current after editing", () => {
    const selected = applyDesignTokensToSnapshot(
      createPostVisualSnapshot(createPostVariation()),
      {
        colors: { background: "#020617", primary: "#F97316", secondary: "#FB923C", text: "#FFF7ED", card: "#111827" },
        typography: { fontFamily: "Inter", customFontUrl: "", originalFont: "Inter", textTransform: "none", textAlign: "left" },
        structure: { borderRadius: "20px", boxShadow: "none", border: "none" },
        decorations: "minimal",
      },
    );

    useEditorStore.getState().loadSnapshot(selected);
    expect(useEditorStore.getState().visualSnapshot).toMatchObject(selected);

    useEditorStore.getState().updateVariation({ headline: "Estado atual persistível" });
    expect(useEditorStore.getState().visualSnapshot?.headline).toBe("Estado atual persistível");

    useEditorStore.getState().updateVariation({
      designTokens: {
        ...selected.designTokens,
        colors: { ...selected.designTokens!.colors!, primary: "#14B8A6" },
      },
    });
    expect(useEditorStore.getState().visualSnapshot?.accentColor).toBe("#14B8A6");
    expect(useEditorStore.getState().visualSnapshot?.designTokens?.colors?.primary).toBe("#14B8A6");
  });

  it("keeps a High Ticket variation identical across HoloDeck selection and Workbench restore", () => {
    const highTicketVariation = createPostVariation({
      headline: "Diagnostico executivo do funil",
      body: "Um roteiro direto para reposicionar a oferta sem perder margem.",
      layout: "split",
      backgroundColor: "#101828",
      textColor: "#F8FAFC",
      accentColor: "#F97316",
      aspectRatioOptimizations: {
        "1:1": {
          layout: "split",
          backgroundColor: "#101828",
          textColor: "#F8FAFC",
          accentColor: "#F97316",
        },
        "4:5": {
          layout: "stacked",
          backgroundColor: "#0F172A",
          textColor: "#F8FAFC",
          accentColor: "#FB923C",
        },
        "9:16": {
          layout: "centered",
          backgroundColor: "#111827",
          textColor: "#FFFFFF",
          accentColor: "#FDBA74",
        },
      },
      layoutSettingsByAspectRatio: {
        "4:5": {
          headline: {
            position: "top",
            textAlign: "left",
            width: 78,
            freePosition: { x: 14, y: 16 },
          },
          body: {
            position: "bottom",
            textAlign: "left",
            width: 72,
            freePosition: { x: 14, y: 64 },
          },
        },
      },
      designTokens: {
        colors: {
          background: "#101828",
          primary: "#F97316",
          secondary: "#FB923C",
          text: "#F8FAFC",
          card: "#1D2939",
        },
        typography: {
          fontFamily: "Inter",
          customFontUrl: "",
          originalFont: "Inter",
          textTransform: "none",
          textAlign: "left",
        },
        structure: {
          borderRadius: "12px",
          boxShadow: "none",
          border: "1px solid #344054",
        },
        decorations: "minimal",
      },
    });

    const holodeckSnapshot = createPostVisualSnapshot(highTicketVariation, "4:5");
    useEditorStore.getState().loadSnapshot(holodeckSnapshot);

    const workbenchSnapshot = useEditorStore.getState().visualSnapshot;

    expect(workbenchSnapshot).toMatchObject(holodeckSnapshot);
    expect(workbenchSnapshot?.snapshotVersion).toBe(3);
    expect(workbenchSnapshot?.layout).toBe("stacked");
    expect(workbenchSnapshot?.backgroundColor).toBe("#0F172A");
    expect(workbenchSnapshot?.accentColor).toBe("#FB923C");
    expect(workbenchSnapshot?.aspectRatioOptimizations).toEqual(
      highTicketVariation.aspectRatioOptimizations,
    );
    expect(workbenchSnapshot?.layoutSettings.headline.freePosition).toEqual({ x: 14, y: 16 });
  });

  it("round-trips image elements through the canonical schema and store restore", () => {
    const selected = createPostVisualSnapshot(
      createPostVariation({ imageElements: IMAGE_ELEMENTS }),
    );
    useEditorStore.getState().loadSnapshot(selected);

    const serialized = JSON.stringify(useEditorStore.getState().visualSnapshot);
    const parsed = postVisualSnapshotSchema.parse(JSON.parse(serialized));

    useEditorStore.getState().reset();
    useEditorStore.getState().loadSnapshot(createPostVisualSnapshot(parsed));

    expect(useEditorStore.getState().activeVariation?.imageElements).toEqual(IMAGE_ELEMENTS);
    expect(useEditorStore.getState().visualSnapshot?.imageElements).toEqual(IMAGE_ELEMENTS);
  });

  it("keeps current-slide overrides inside the slide instead of leaking them to the document base", () => {
    const selected = createPostVisualSnapshot(
      createPostVariation({ postMode: "carousel", slides: CAROUSEL_SLIDES }),
    );
    useEditorStore.getState().loadSnapshot(selected);

    useEditorStore.getState().updateVariation({ accentColor: "#EF4444" });
    useEditorStore.getState().addImageElement(IMAGE_ELEMENTS[0]);

    const snapshot = useEditorStore.getState().visualSnapshot;
    expect(snapshot?.accentColor).toBe(selected.accentColor);
    expect(snapshot?.imageElements).toBeUndefined();
    expect(snapshot?.slides?.[0].editorState?.variation?.accentColor).toBe("#EF4444");
    expect(snapshot?.slides?.[0].editorState?.variation?.imageElements).toEqual(IMAGE_ELEMENTS);

    const projected = projectSnapshotForSlide(snapshot!, 0);
    expect(projected.accentColor).toBe("#EF4444");
    expect(projected.imageElements).toEqual(IMAGE_ELEMENTS);
    expect(snapshot?.accentColor).toBe(selected.accentColor);
  });

  it("P0: textElements edit with scope=current must not leak to root in carousel", () => {
    const selected = createPostVisualSnapshot(
      createCarouselVariation(CAROUSEL_SLIDES, { textElements: FREE_TEXT_ELEMENTS }),
    );
    useEditorStore.getState().loadSnapshot(selected);

    const rootBefore = [...(useEditorStore.getState().visualSnapshot?.textElements ?? [])];
    useEditorStore.getState().setApplyScope("current");
    useEditorStore.getState().updateVariation({
      textElements: [{ ...rootBefore[0], x: 999, y: 999 }],
    });

    const snapshot = useEditorStore.getState().visualSnapshot;
    expect(snapshot?.textElements).toEqual(rootBefore);

    const slideOverride = snapshot?.slides?.[0]?.editorState?.variation?.textElements;
    expect(slideOverride).toBeDefined();
    expect(slideOverride![0].x).toBe(999);
    expect(slideOverride![0].y).toBe(999);

    const projected = projectSnapshotForSlide(snapshot!, 0);
    expect(projected.textElements![0].x).toBe(999);
  });

  it("P0: textElements edit with scope=all must propagate to root and all slides", () => {
    const selected = createPostVisualSnapshot(
      createCarouselVariation(CAROUSEL_SLIDES, { textElements: FREE_TEXT_ELEMENTS }),
    );
    useEditorStore.getState().loadSnapshot(selected);

    useEditorStore.getState().setApplyScope("all");
    useEditorStore.getState().updateVariation({
      textElements: [{ ...FREE_TEXT_ELEMENTS[0], x: 50, y: 60 }],
    });

    const snapshot = useEditorStore.getState().visualSnapshot;
    expect(snapshot?.textElements![0].x).toBe(50);
    expect(snapshot?.textElements![0].y).toBe(60);

    for (let i = 0; i < CAROUSEL_SLIDES.length; i++) {
      const slideElements = snapshot?.slides?.[i]?.editorState?.variation?.textElements;
      expect(slideElements).toBeDefined();
      expect(slideElements![0].x).toBe(50);
    }
  });

  it("P0: navigation between slides preserves textElements per slide", () => {
    const selected = createPostVisualSnapshot(
      createCarouselVariation(CAROUSEL_SLIDES, { textElements: FREE_TEXT_ELEMENTS }),
    );
    useEditorStore.getState().loadSnapshot(selected);

    useEditorStore.getState().setApplyScope("current");
    useEditorStore.getState().updateVariation({
      textElements: [{ ...FREE_TEXT_ELEMENTS[0], x: 10, y: 20 }],
    });

    useEditorStore.getState().setCurrentSlideIndex(1);
    useEditorStore.getState().updateVariation({
      textElements: [{ ...FREE_TEXT_ELEMENTS[0], x: 80, y: 90 }],
    });

    useEditorStore.getState().setCurrentSlideIndex(0);
    const slide0 = useEditorStore.getState().visualSnapshot?.slides?.[0]?.editorState?.variation?.textElements;
    expect(slide0![0].x).toBe(10);

    useEditorStore.getState().setCurrentSlideIndex(1);
    const slide1 = useEditorStore.getState().visualSnapshot?.slides?.[1]?.editorState?.variation?.textElements;
    expect(slide1![0].x).toBe(80);

    const rootTextElements = useEditorStore.getState().visualSnapshot?.textElements;
    expect(rootTextElements).toEqual(FREE_TEXT_ELEMENTS);
  });
});
