import { describe, expect, it } from "vitest";
import { arsenalCanonicalJson } from "@shared/arsenalContent";
import { centerArtSelection, artSelectionBounds, emphasizeArtGroup } from "./artControls";
import { overrideArsenalElement, resolveArsenalComposition } from "./arsenalComposition";
import { createArsenalFixtureComposition } from "./arsenalFixture";

describe("art controls", () => {
  it("centers through a rotated scaled parent and leaves the old pinned composition intact", () => {
    const original = createArsenalFixtureComposition();
    const element = original.elements.find(candidate => candidate.parentId === "titulo")!;
    const transformed = overrideArsenalElement(original, "titulo", { rotation: 23, scale: 1.3 });
    const before = artSelectionBounds(transformed, element.id)!;
    const next = centerArtSelection(transformed, element.id, "horizontal");
    const after = artSelectionBounds(next, element.id)!;

    expect(after.x + after.width / 2).toBeCloseTo(next.artboard.width / 2, 5);
    expect(after.y + after.height / 2).toBeCloseTo(before.y + before.height / 2, 5);
    const enlarged=emphasizeArtGroup(transformed,"titulo","increase");
    const groupBefore=artSelectionBounds(transformed,"titulo")!,groupAfter=artSelectionBounds(enlarged,"titulo")!;
    expect(groupAfter.x+groupAfter.width/2).toBeCloseTo(groupBefore.x+groupBefore.width/2,5);
    expect(groupAfter.y+groupAfter.height/2).toBeCloseTo(groupBefore.y+groupBefore.height/2,5);
    expect(enlarged.content).toEqual(transformed.content);
    expect(next).not.toBe(transformed);
    expect(transformed.elements.find(candidate => candidate.id === element.id)!.x).toBe(element.x);
    expect(next.base).toEqual(transformed.base);
    expect(next.origin).toEqual(transformed.origin);
    expect(next.content).toEqual(transformed.content);
    expect(next.userContentHash).toBe(transformed.userContentHash);
    expect(next.generatedContentHash).toBe(transformed.generatedContentHash);
    expect(resolveArsenalComposition(transformed)).toEqual(transformed);
    // Undo can restore this untouched prior composition, including its pinned variant.
    expect(arsenalCanonicalJson(transformed.base)).toBe(arsenalCanonicalJson(original.base));
  });
});
