import { describe, it, expect } from "vitest";
import { INITIAL_POST, type CanvasPostModel } from "../components/types";
import { textGradientSchema } from "@shared/textGradient";
import { executeEditorCommand, editorTextGradient } from "./editorController";
import {
  canvasModelToSavePayload,
  savedPostToCanvasModel,
} from "./saveAdapter";
import { createArsenalFixtureComposition } from "./arsenalFixture";
import { putArsenalComposition } from "./arsenalComposition";
import { gradientContrastRatio } from "./contrast";
import { duplicateSlide } from "./documentCommands";
const gradient = {
  colors: ["#ff9900", "#ee1166"] as [string, string],
  start: 0 as const,
  end: 1 as const,
};
const fixture = (): CanvasPostModel => ({
  ...structuredClone(INITIAL_POST),
  slides: [
    {
      id: "s",
      step: "1",
      headline: "Ação incrível",
      subtext: "Corpo",
      headlineRich: [{ text: "Ação incrível", bold: true, color: "#ff0000" }],
      extraTexts: [{ id: "extra", text: "Extra", x: 10, y: 20, width: 200 }],
    },
    { id: "other", step: "2", headline: "Outro", subtext: "Corpo" },
  ],
});
function apply(
  post: CanvasPostModel,
  elementId: string,
  fill: typeof gradient | null | undefined = gradient
) {
  const result = executeEditorCommand(
    post,
    { slideId: post.slides[post.currentSlideIndex].id, elementId },
    { type: "text-gradient", gradient: fill }
  );
  expect(result.ok, result.reason).toBe(true);
  return result.post;
}
describe("native editable text fills", () => {
  it("strictly validates two colours, preserving inheritance versus explicit solid", () => {
    expect(
      textGradientSchema.safeParse({ ...gradient, script: "x" }).success
    ).toBe(false);
    expect(
      textGradientSchema.safeParse({ ...gradient, colors: ["red", "blue"] })
        .success
    ).toBe(false);
  });
  it("round-trips native and extra text while preserving rich formatting, geometry and other slides", () => {
    const original = fixture();
    let post = apply(original, "headline");
    post = apply(post, "extra");
    const reopened = savedPostToCanvasModel({
      id: 101,
      canvas_model: canvasModelToSavePayload(post, {
        inputType: "text",
        inputContent: "test",
      }).canvasModel,
    });
    expect(
      editorTextGradient(reopened, { slideId: "s", elementId: "headline" })
    ).toEqual(gradient);
    expect(
      editorTextGradient(reopened, { slideId: "s", elementId: "extra" })
    ).toEqual(gradient);
    expect(reopened.slides[0].headlineRich).toEqual(
      original.slides[0].headlineRich
    );
    expect(reopened.slides[1]).toMatchObject(original.slides[1]);
    expect(reopened.slides[0].extraTexts![0]).toMatchObject({
      x: 10,
      y: 20,
      width: 200,
    });
    expect(
      editorTextGradient(apply(post, "headline", null), {
        slideId: "s",
        elementId: "headline",
      })
    ).toBeNull();
    const inherited = executeEditorCommand(
      post,
      { slideId: "s", elementId: "headline" },
      { type: "text-gradient", gradient: undefined }
    );
    expect(
      editorTextGradient(inherited.post, {
        slideId: "s",
        elementId: "headline",
      })
    ).toBeUndefined();
  });
  it("changes only the composition instance and retains its gradient when applying an effect", () => {
    const original = putArsenalComposition(
      fixture(),
      createArsenalFixtureComposition()
    );
    const c = original.slides[0].composition!,
      id = c.elements.find(e => e.kind === "text")!.id;
    let post = apply(original, id);
    const effect = executeEditorCommand(
      post,
      { slideId: post.slides[0].id, elementId: id },
      { type: "properties", patch: { effect: "outline" } }
    );
    expect(effect.ok, effect.reason).toBe(true);
    post = effect.post;
    expect(
      editorTextGradient(post, { slideId: post.slides[0].id, elementId: id })
    ).toEqual(gradient);
    expect(post.slides[0].composition!.pieces).toEqual(c.pieces);
    expect(post.slides[0].composition!.base).toEqual(c.base);
    const reopened = savedPostToCanvasModel({
      id: 102,
      canvas_model: canvasModelToSavePayload(post, {
        inputType: "text",
        inputContent: "test",
      }).canvasModel,
    });
    expect(
      editorTextGradient(reopened, {
        slideId: post.slides[0].id,
        elementId: id,
      })
    ).toEqual(gradient);
  });
  it("samples the interior, not only readable endpoints", () => {
    expect(
      gradientContrastRatio("#777777", ["#000000", "#ffffff"])
    ).toBeLessThan(1.1);
    expect(
      gradientContrastRatio("#000000", ["#ffffff", "#eeeeee"])
    ).toBeGreaterThan(15);
  });
});
