import { describe, expect, it } from "vitest";
import {
  formatGenerationElapsed,
  getGenerationProgress,
} from "./generationProgress";

describe("generationProgress", () => {
  it("keeps estimated progress below completion while processing", () => {
    expect(getGenerationProgress(0, "generating").percentage).toBe(30);
    expect(getGenerationProgress(300, "generating").percentage).toBeLessThan(100);
  });

  it("represents extraction as its own early phase", () => {
    const state = getGenerationProgress(20, "extracting");
    expect(state.percentage).toBeLessThanOrEqual(28);
    expect(state.label).toContain("site");
  });

  it("formats elapsed time for short and long generations", () => {
    expect(formatGenerationElapsed(9)).toBe("9s");
    expect(formatGenerationElapsed(75)).toBe("1:15");
  });
});
