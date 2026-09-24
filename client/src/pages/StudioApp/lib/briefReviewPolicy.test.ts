import { describe, expect, it } from "vitest";
import { shouldReviewBriefBeforeGeneration } from "./briefReviewPolicy";

describe("briefReviewPolicy", () => {
  it("sends static posts directly to generation", () => {
    expect(shouldReviewBriefBeforeGeneration("static")).toBe(false);
  });

  it("keeps briefing review for carousels", () => {
    expect(shouldReviewBriefBeforeGeneration("carousel")).toBe(true);
  });
});
