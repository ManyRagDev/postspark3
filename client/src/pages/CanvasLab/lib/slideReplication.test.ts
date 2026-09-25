import { describe, expect, it } from "vitest";
import { INITIAL_POST, type CanvasPostModel } from "../components/types";
import { applyCurrentSlideAppearancePatch, replicateSlideAppearance, resolveSlideAppearance } from "./slideReplication";
import { canvasModelToSavePayload, savedPostToCanvasModel } from "./saveAdapter";

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
});
