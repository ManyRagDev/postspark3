import { describe, it, expect } from "vitest";
import { completeDesignTestDefinitions } from "../../shared/completeDesignGeneration.fixture";
import { arsenalHash } from "../../shared/arsenalContent";
import { authorCarouselSet } from "./carouselSets";
describe("carousel curatorial packages", () => {
  it("preserves the source and creates four immutable children with unique role/mode identities, without inherited approval", () => {
    const source = completeDesignTestDefinitions()[0],
      before = arsenalHash(source),
      set = authorCarouselSet(source);
    expect(set.source).toBe(source);
    expect(arsenalHash(source)).toBe(before);
    expect(set.children).toHaveLength(4);
    expect(new Set(set.children.map(d => d.id)).size).toBe(4);
    expect(new Set(set.children.map(d => d.source.variantKey)).size).toBe(4);
    expect(
      set.children.every(d =>
        d.assets.every(a => source.assets.some(b => b.sha256 === a.sha256))
      )
    ).toBe(true);
  });
});
