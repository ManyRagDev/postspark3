import { it, expect } from "vitest";
import { isStandaloneHttpUrl } from "./generationSources";
it("separates a bare URL from a request containing a URL", () => {
  expect(isStandaloneHttpUrl("https://example.com/article")).toBe(true);
  expect(
    isStandaloneHttpUrl("https://example.com/article Explique os critérios")
  ).toBe(false);
  expect(isStandaloneHttpUrl("Compare em https://example.com")).toBe(false);
  expect(isStandaloneHttpUrl("file:///tmp/source")).toBe(false);
});
