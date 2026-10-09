import { describe, expect, it } from "vitest";
import { INITIAL_POST } from "../components/types";
import { imageRequestForPost } from "./imageGenerationContext";

const post = {
  ...INITIAL_POST,
  aspectRatio: "9:16" as const,
  currentSlideIndex: 1,
  slides: [
    { id: "s1", step: "01", headline: "Abertura", subtext: "Introdução" },
    { id: "s2", step: "02", headline: "O preço subiu antes da promoção", subtext: "Compare o histórico de preços." },
  ],
};

describe("imageRequestForPost", () => {
  it("sends the current slide and canvas direction for the generated prompt", () => {
    const request = imageRequestForPost(post, post.imagePrompt!);
    expect(request.aspectRatio).toBe("9:16");
    expect(request.postContext?.headline).toBe("O preço subiu antes da promoção");
    expect(request.postContext?.body).toBe("Compare o histórico de preços.");
    expect(request.postContext?.backgroundColor).toBe(post.palette.background);
  });

  it("respects a prompt edited by the user", () => {
    const request = imageRequestForPost(post, "A quiet mountain lake");
    expect(request.prompt).toBe("A quiet mountain lake");
    expect(request.aspectRatio).toBe("9:16");
    expect(request.postContext?.headline).toBe("O preço subiu antes da promoção");
  });
});

it("passes the actual reading region to image generation without another request", () => {
  const input = { ...post, currentSlideIndex: 0, slides: [{ ...post.slides[0], guidedComposition: { version: 1 as const, id: "headline" as const, readingArea: { y: 64, height: 192, color: "#111111" } } }] };
  const request = imageRequestForPost(input, input.imagePrompt!);
  expect(request.postContext?.compositionGuidance).toBeTruthy();
  expect(request.postContext?.copySpace).toBeUndefined();
});
