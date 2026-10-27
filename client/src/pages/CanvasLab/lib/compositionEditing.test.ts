// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { INITIAL_POST, type CanvasPostModel } from "../components/types";
import { createArsenalFixtureComposition } from "./arsenalFixture";
import {
  applyCompositionAppearancePatch,
  applyCompositionBackgroundImage,
  reparentArsenalElement,
  shouldDeleteCanvasSelection,
} from "./compositionEditing";
import { addArsenalAuthorialLayer } from "./arsenalComposition";

describe("compositionEditing", () => {
  it("applyCompositionAppearancePatch atualiza texto, fundo e paleta na composição", () => {
    const comp = createArsenalFixtureComposition();
    const post: CanvasPostModel = {
      ...INITIAL_POST,
      currentSlideIndex: 0,
      slides: [{ ...INITIAL_POST.slides[0], composition: comp }],
    };

    const nextComp = applyCompositionAppearancePatch(post, {
      headline: "Novo Título",
      subtext: "Novo Subtexto",
      bgImage: "https://example.com/test.jpg",
      palette: { ...post.palette, background: "#112233" },
      overlayOpacity: 0.7,
      overlayColor: "#000000",
      overlayMode: "solid",
    });

    expect(nextComp).toBeDefined();
    if (nextComp) {
      if (nextComp.content.schemaVersion === 2) {
        expect(nextComp.content.headline).toBe("Novo Título");
        expect(nextComp.content.body).toBe("Novo Subtexto");
      }
      expect(nextComp.customBackground?.imageUrl).toBe("https://example.com/test.jpg");
      expect(nextComp.customBackground?.fill).toBe("#112233");
      expect(nextComp.customBackground?.overlayOpacity).toBe(0.7);
    }
  });

  it("applyCompositionBackgroundImage aplica imagem de fundo na composição do slide ativo", () => {
    const comp = createArsenalFixtureComposition();
    const post: CanvasPostModel = {
      ...INITIAL_POST,
      currentSlideIndex: 0,
      slides: [{ ...INITIAL_POST.slides[0], composition: comp }],
    };

    const updated = applyCompositionBackgroundImage(post, "https://example.com/bg.png");
    const activeSlideComp = updated.slides[0].composition;
    expect(activeSlideComp?.customBackground?.imageUrl).toBe("https://example.com/bg.png");
  });

  it("reparentArsenalElement move uma camada autoral preservando posição de mundo", () => {
    let comp = createArsenalFixtureComposition();
    comp = addArsenalAuthorialLayer(comp, {
      id: "auth-move",
      kind: "text",
      text: "Camada",
      zIndex: 1,
      parentId: null,
      x: 50,
      y: 60,
      width: 100,
      height: 30,
      rotation: 0,
      opacity: 1,
    });

    if (comp.version === 3) {
      const group = comp.groups[0];
      if (group) {
        const reparented = reparentArsenalElement(comp, "auth-move", group.id);
        const layer = reparented.authorialLayers.find(l => l.id === "auth-move");
        expect(layer?.parentId).toBe(group.id);
      }
    }
  });

  it("shouldDeleteCanvasSelection só permite Delete/Backspace fora de campos de input", () => {
    const input = document.createElement("input");
    expect(shouldDeleteCanvasSelection({ key: "Backspace", ctrlKey: false, metaKey: false, altKey: false, isComposing: false }, input)).toBe(false);
    expect(shouldDeleteCanvasSelection({ key: "Delete", ctrlKey: false, metaKey: false, altKey: false, isComposing: false }, null)).toBe(true);
    expect(shouldDeleteCanvasSelection({ key: "a", ctrlKey: false, metaKey: false, altKey: false, isComposing: false }, null)).toBe(false);
  });
});
