import { describe, expect, it } from "vitest";
import { arsenalHash } from "./arsenalContent";
import { encodeGenerationSelectionCatalog, decodeGenerationSelectionCatalog, type GenerationSelectionCandidate } from "./generationSelectionTransport";

describe("structured preparation transport", () => {
  const repeated = { fields: [{ id: "real-field", required: true, items: 5, chars: 180 }], mechanics: { mode: "preserve_occupancy", targets: ["title", "body"], explanation: "Preservar relações e capacidades reais da composição." } };
  const original = Array.from({ length: 12 }, (_, i) => ({ candidateId: `family-${i}`, profile: { family: `f-${i}`, common: repeated,
    variants: [{ componentId: `cover-${i}`, profile: repeated }, { componentId: `read-${i}`, profile: repeated }],
    literal: { $selectionValue: "a literal tag", nested: repeated },
  }, fields: { [`cover-${i}`]: [] }, suitability: null })) as unknown as GenerationSelectionCandidate[];

  it("shares exact objects across families with a lossless canonical roundtrip", () => {
    const before = structuredClone(original);
    const v1 = encodeGenerationSelectionCatalog(original), v2 = encodeGenerationSelectionCatalog(original, 2);
    expect(v1.encoding).toBe("selection_catalog_v1"); expect(v2.encoding).toBe("selection_catalog_v2");
    expect(decodeGenerationSelectionCatalog(JSON.parse(JSON.stringify(v2)))).toEqual(before);
    expect(v2.canonicalHash).toBe(arsenalHash(before)); expect(original).toEqual(before);
    expect(JSON.stringify(v2).length).toBeLessThan(JSON.stringify(v1).length);
  });

  it("rejects missing/cyclic references and altered canonical data", () => {
    const v2 = encodeGenerationSelectionCatalog(original, 2);
    if (v2.encoding !== "selection_catalog_v2") throw new Error("wrong encoding");
    const missing = structuredClone(v2); missing.candidates[0].profile = { $selectionValue: "absent" };
    expect(() => decodeGenerationSelectionCatalog(missing)).toThrow("value_reference_invalid");
    const cycle = structuredClone(v2); cycle.sharedValues.loop = { $selectionValue: "loop" }; cycle.candidates[0].profile = { $selectionValue: "loop" };
    expect(() => decodeGenerationSelectionCatalog(cycle)).toThrow("value_reference_invalid");
    const changed = structuredClone(v2); changed.candidates[0].candidateId = "wrong-owner-of-fields";
    expect(() => decodeGenerationSelectionCatalog(changed)).toThrow("hash_mismatch");
  });
});
