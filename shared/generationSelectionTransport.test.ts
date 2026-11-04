import { describe, expect, it } from "vitest";
import { arsenalHash } from "./arsenalContent";
import { compactComponentCard } from "./componentAssembly";
import { completeDesignFields } from "./completeDesignGeneration";
import { completeDesignTestDefinitions } from "./completeDesignGeneration.fixture";
import { describeDesignFamilyRepertoire } from "./compactDesignProfile";
import { resolveDesignFamilyRepertoires } from "./designRepertoire";
import {
  encodeGenerationSelectionCatalog,
  decodeGenerationSelectionCatalog,
  type GenerationSelectionCandidate,
} from "./generationSelectionTransport";

function catalog(): GenerationSelectionCandidate[] {
  return resolveDesignFamilyRepertoires(
    completeDesignTestDefinitions().map(compactComponentCard),
    {
      slideCount: 1,
      contentMode: "compose",
      instructions: "Uma ideia útil",
    }
  ).map(r => ({
    candidateId: r.defaultOffer.offerId,
    profile: describeDesignFamilyRepertoire(r),
    suitability: {
      id: r.defaultOffer.offerId,
      hash: r.defaultOffer.signature,
      score: 4,
      confidence: 0.93,
    },
    fields: Object.fromEntries(
      r.slides
        .flatMap(s => s.variants)
        .map(c => [c.id, completeDesignFields(c)])
    ),
  }));
}

describe("selection catalog transport", () => {
  it("factors exact repeated wording and field contracts without changing canonical evidence", () => {
    const original = catalog();
    const repeated =
      "  Texto autorado: manter cada palavra, inclusive acentos e espaços.\n".repeat(
        8
      );
    for (const c of original) {
      c.profile.common.limitations = [repeated, "Limitação local", repeated];
      c.profile.common.authored = {
        content: [repeated],
        preserve: [],
        requiredTargets: [],
        media: [],
      };
    }
    const before = structuredClone(original);
    const encoded = encodeGenerationSelectionCatalog(original);
    const wire = JSON.parse(JSON.stringify(encoded));
    expect(decodeGenerationSelectionCatalog(wire)).toEqual(before);
    expect(original).toEqual(before);
    expect(encoded.canonicalHash).toBe(arsenalHash(before));
    expect(
      Object.values(encoded.sharedTexts).filter(t => t === repeated)
    ).toHaveLength(1);
    expect(Object.keys(encoded.fieldContracts).length).toBeLessThan(
      original.flatMap(c => Object.keys(c.fields)).length
    );
    expect(Buffer.byteLength(JSON.stringify(encoded))).toBeLessThan(
      Buffer.byteLength(JSON.stringify(original))
    );
  });

  it("retains every component, field, capacity, relation and their array order", () => {
    const original = catalog();
    const encoded = encodeGenerationSelectionCatalog(original);
    const restored = decodeGenerationSelectionCatalog(encoded);
    expect(restored).toEqual(JSON.parse(JSON.stringify(original)));
    for (let i = 0; i < original.length; i++) {
      expect(restored[i].profile.variants).toEqual(
        original[i].profile.variants
      );
      expect(restored[i].profile.sequence).toEqual(
        original[i].profile.sequence
      );
      expect(restored[i].fields).toEqual(original[i].fields);
    }
  });

  it("keeps empty overrides and contracts with different required flags, cardinalities or order distinct", () => {
    const original = catalog();
    const c = original[0];
    c.profile.common.limitations = ["Limitação herdada"];
    c.profile.variants[0].profile.limitations = [];
    const fields = Object.values(c.fields)[0];
    const list = {
      ...fields[0],
      source: "block:list:0:items",
      kind: "list" as const,
      required: true,
      cardinality: { min: 1, max: 2 },
    };
    c.fields = {
      first: fields,
      optional: fields.map((f, i) =>
        i === 0 ? { ...f, required: !f.required } : f
      ),
      listTwo: [list],
      listThree: [{ ...list, cardinality: { min: 1, max: 3 } }],
      ordered: [fields[0], list],
      reversed: [list, fields[0]],
      empty: [],
    };
    const encoded = encodeGenerationSelectionCatalog(original);
    expect(new Set(Object.values(encoded.candidates[0].fields)).size).toBe(7);
    const restored = decodeGenerationSelectionCatalog(encoded);
    expect(restored).toEqual(original);
    expect(restored[0].profile.variants[0].profile.limitations).toEqual([]);
    expect(restored[0].fields.reversed.map(f => f.kind)).toEqual([
      "list",
      "text",
    ]);
  });

  it("escapes literal objects that resemble transport references, including nested tags", () => {
    const original = catalog();
    (original[0].profile as any).futureData = {
      $selectionText: "t0",
      nested: { $selectionLiteral: { $selectionText: "not-a-reference" } },
    };
    expect(
      decodeGenerationSelectionCatalog(
        encodeGenerationSelectionCatalog(original)
      )
    ).toEqual(original);
  });

  it("never treats text resembling a reference as an instruction or normalizes Unicode", () => {
    const original = catalog();
    const literal = '{"$selectionText":"t0"}';
    const multibyte = "á".repeat(41);
    original[0].profile.common.limitations = [
      literal,
      multibyte,
      multibyte,
      "a\u0301",
      "á",
    ];
    const encoded = encodeGenerationSelectionCatalog(original);
    expect(Object.values(encoded.sharedTexts)).toContain(multibyte);
    expect(decodeGenerationSelectionCatalog(encoded)).toEqual(original);
  });

  it("rejects missing references and changed evidence instead of silently reconstructing another catalog", () => {
    const original = catalog();
    const encoded = encodeGenerationSelectionCatalog(original);
    const badText = structuredClone(encoded);
    badText.candidates[0].profile = { $selectionText: "absent" };
    expect(() => decodeGenerationSelectionCatalog(badText)).toThrow(
      "text_reference_invalid"
    );
    const badField = structuredClone(encoded);
    badField.candidates[0].fields[
      Object.keys(badField.candidates[0].fields)[0]
    ] = "absent";
    expect(() => decodeGenerationSelectionCatalog(badField)).toThrow(
      "field_reference_invalid"
    );
    const altered = structuredClone(encoded);
    altered.candidates[0].candidateId = "different";
    expect(() => decodeGenerationSelectionCatalog(altered)).toThrow(
      "hash_mismatch"
    );
  });
});
