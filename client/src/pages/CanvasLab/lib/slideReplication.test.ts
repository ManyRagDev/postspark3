import { describe, expect, it } from "vitest";
import { INITIAL_POST, type CanvasPostModel } from "../components/types";
import { applyCurrentSlideAppearancePatch, replicateSlideAppearance, resolveSlideAppearance, replicateCarouselComposition } from "./slideReplication";
import { canvasModelToSavePayload, savedPostToCanvasModel } from "./saveAdapter";
import { createArsenalFixtureComposition } from "./arsenalFixture";
import { addArsenalAuthorialLayer } from "./arsenalComposition";

const post: CanvasPostModel = {
  ...INITIAL_POST,
  currentSlideIndex: 0,
  slides: [
    { id: "a", step: "1", headline: "Capa", subtext: "Texto A", bgImage: "a.png" },
    { id: "b", step: "2", headline: "Outro", subtext: "Texto B", bgImage: "b.png" },
    { id: "c", step: "3", headline: "Terceiro", subtext: "Texto C", bgImage: "c.png" },
  ],
};

describe("replicação seletiva de slides", () => {
  it("edita fonte e aparência do título só no slide atual", () => {
    const next = applyCurrentSlideAppearancePatch(post, { fontFamily: "Montserrat", headlineSizeScale: 1.3 });
    expect(resolveSlideAppearance(next, 0).fontFamily).toBe("Montserrat");
    expect(resolveSlideAppearance(next, 1).fontFamily).toBe(post.fontFamily);
    expect(resolveSlideAppearance(next, 1).headlineSizeScale).toBe(post.headlineSizeScale);
    expect(next.fontFamily).toBe(post.fontFamily);
  });

  it("copia somente os grupos e destinos escolhidos sem substituir conteúdo", () => {
    const edited = applyCurrentSlideAppearancePatch(post, { fontFamily: "Montserrat", headlineSizeScale: 1.3 });
    const next = replicateSlideAppearance(edited, 0, [2], ["font", "headline"]);
    expect(resolveSlideAppearance(next, 2).fontFamily).toBe("Montserrat");
    expect(resolveSlideAppearance(next, 2).headlineSizeScale).toBe(1.3);
    expect(next.slides[2].headline).toBe("Terceiro");
    expect(next.slides[2].bgImage).toBe("c.png");
    expect(resolveSlideAppearance(next, 1).fontFamily).toBe(post.fontFamily);
    expect(next.slides[1].bgImage).toBe("b.png");
  });

  it("copia o fundo apenas para o slide escolhido", () => {
    const next = replicateSlideAppearance(post, 0, [1], ["background"]);
    expect(next.slides.map(slide => slide.bgImage)).toEqual(["a.png", "a.png", "c.png"]);
    expect(next.slides.map(slide => slide.headline)).toEqual(["Capa", "Outro", "Terceiro"]);
  });

  it("preserva aparência por slide em salvar e reabrir", () => {
    const edited = applyCurrentSlideAppearancePatch(post, { fontFamily: "Montserrat" });
    const payload = canvasModelToSavePayload(edited, { inputType: "text", inputContent: "teste" });
    const reopened = savedPostToCanvasModel({ id: 1, canvas_model: payload.canvasModel });
    expect(resolveSlideAppearance(reopened, 0).fontFamily).toBe("Montserrat");
    expect(resolveSlideAppearance(reopened, 1).fontFamily).toBe(post.fontFamily);
  });

  it("replicateCarouselComposition replica composição adaptando o texto do slide alvo e gerando novos IDs para camadas autorais", () => {
    const comp = addArsenalAuthorialLayer(createArsenalFixtureComposition(), {
      id: "auth-1",
      kind: "text",
      text: "Camada Autoral",
      zIndex: 1,
      parentId: null,
      x: 10,
      y: 20,
      width: 100,
      height: 30,
      rotation: 0,
      opacity: 1,
    });

    const carouselPost: CanvasPostModel = {
      ...post,
      slides: [
        { id: "s1", step: "1", headline: "Título Slide 1", subtext: "Subtexto 1", composition: comp },
        { id: "s2", step: "2", headline: "Título Slide 2", subtext: "Subtexto 2" },
        { id: "s3", step: "3", headline: "Título Slide 3", subtext: "Subtexto 3" },
      ],
    };

    const next = replicateCarouselComposition(carouselPost, 0, [1, 2]);

    // Slide 1 composition must exist
    expect(next.slides[1].composition).toBeDefined();
    expect(next.slides[2].composition).toBeDefined();

    // The text in the target compositions must adapt to the target slide's headline/subtext
    const slide2Comp = next.slides[1].composition!;
    if (slide2Comp.content.schemaVersion === 2) {
      expect(slide2Comp.content.headline).toBe("Título Slide 2");
      expect(slide2Comp.content.body).toBe("Subtexto 2");
    }

    // Authorial layers in the replicated composition must have new distinct IDs
    if (slide2Comp.version === 3) {
      expect(slide2Comp.authorialLayers[0].id).not.toBe("auth-1");
      expect(slide2Comp.authorialLayers[0].id).toMatch(/^tx-/);
      expect(slide2Comp.authorialLayers[0].text).toBe("Camada Autoral");

      const slide3Comp = next.slides[2].composition!;
      if (slide3Comp.version === 3) {
        expect(slide3Comp.authorialLayers[0].id).not.toBe(slide2Comp.authorialLayers[0].id);
      }
    }
  });
});

