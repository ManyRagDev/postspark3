import { beforeEach, describe, expect, it } from "vitest";
import {
  CAROUSEL_SLIDES,
  createPostVariation,
} from "../../../tests/fixtures/postspark";
import { useEditorStore } from "./editorStore";

describe("editorStore", () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
  });

  it("keeps static edits in active and base variations", () => {
    const store = useEditorStore.getState();
    store.setActiveVariation(createPostVariation());
    store.updateVariation({ body: "Corpo editado" });

    const state = useEditorStore.getState();
    expect(state.activeVariation?.body).toBe("Corpo editado");
    expect(state.baseVariation?.body).toBe("Corpo editado");
  });

  it("isolates current-slide overrides and restores them after navigation", () => {
    const store = useEditorStore.getState();
    store.setActiveVariation(createPostVariation({ slides: CAROUSEL_SLIDES }));
    store.setSlides(CAROUSEL_SLIDES);
    store.updateVariation({ accentColor: "#EE46BC" });
    store.updateImageSettings({ zoom: 1.4 });

    store.setCurrentSlideIndex(1);
    expect(useEditorStore.getState().activeVariation?.accentColor).toBe("#7F56D9");
    expect(useEditorStore.getState().imageSettings.zoom).toBe(1);

    store.setCurrentSlideIndex(0);
    expect(useEditorStore.getState().activeVariation?.accentColor).toBe("#EE46BC");
    expect(useEditorStore.getState().imageSettings.zoom).toBe(1.4);
  });

  it("applies carousel edits to every slide when scope is all", () => {
    const store = useEditorStore.getState();
    store.setActiveVariation(createPostVariation({ slides: CAROUSEL_SLIDES }));
    store.setSlides(CAROUSEL_SLIDES);
    store.setApplyScope("all");
    store.updateVariation({ tone: "educacional" });
    store.setBgValue({ type: "solid", color: "#0B1220" });

    for (let index = 0; index < CAROUSEL_SLIDES.length; index++) {
      store.setCurrentSlideIndex(index);
      const state = useEditorStore.getState();
      expect(state.activeVariation?.tone).toBe("educacional");
      expect(state.bgValue).toEqual({ type: "solid", color: "#0B1220" });
    }
  });

  it("persists rich element content and geometry through variation updates", () => {
    const store = useEditorStore.getState();
    const variation = createPostVariation();
    store.setActiveVariation(variation);

    const textElements = variation.textElements?.map((element) =>
      element.id === "text-1"
        ? { ...element, text: "Texto revisado", x: 48, width: 220 }
        : element,
    );
    const sections = variation.sections?.map((section, index) =>
      index === 0 ? { ...section, label: "Bloco revisado" } : section,
    );

    store.updateVariation({ textElements, sections });

    const state = useEditorStore.getState();
    expect(state.activeVariation?.textElements?.[0]).toMatchObject({
      text: "Texto revisado",
      x: 48,
      width: 220,
    });
    expect(state.activeVariation?.sections?.[0]?.label).toBe("Bloco revisado");
    expect(state.baseVariation?.textElements).toEqual(textElements);
    expect(state.baseVariation?.sections).toEqual(sections);
  });
});
