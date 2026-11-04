import { describe, it, expect } from "vitest";
import { completeDesignTestDefinitions } from "../../shared/completeDesignGeneration.fixture";
import {
  compactComponentCard,
  createComponentDefinition,
} from "../../shared/componentAssembly";
import { authorFamilyCarouselRepertoire } from "./familyCarouselRepertoire";
import {
  resolveDesignFamilyRepertoires,
  materializeDesignFamilyOffer,
} from "../../shared/designRepertoire";
import {
  describeDesignFamilyRepertoire,
  describeCompactOfferV3,
  describeCompactOffer,
} from "../../shared/compactDesignProfile";
import { arsenalHash } from "../../shared/arsenalContent";

describe("family repertoire", () => {
  const source = completeDesignTestDefinitions()[0];
  const children = authorFamilyCarouselRepertoire(source);
  const cards = [source, ...children].map(compactComponentCard);
  it("authors stacked Mosaic explanations with optional editable markers without mutating source relationships", () => {
    const shape = {
      ...Object.values(source.pieces)[0],
      kind: "rect" as const,
      fixedText: null,
      fill: "#26314B",
    };
    const shapeHash = arsenalHash(shape),
      head = source.fragment.instances[0],
      body = source.fragment.instances[1];
    const mosaic = createComponentDefinition({
      ...source,
      completeDesign: {
        ...source.completeDesign!,
        family: "mosaic-grid",
        designGuidance: {
          version: 1,
          summary: "Three independent cards",
          motifs: ["three-cards"],
          preserve: [],
          contentRules: [],
          mediaRules: [],
          knownLimitations: [],
          fieldRelationships: [],
        },
      },
      pieces: { ...source.pieces, [shapeHash]: shape },
      fragment: {
        ...source.fragment,
        instances: [
          { ...head, id: "headline-1" },
          ...Array.from({ length: 3 }, (_, i) => [
            {
              ...body,
              id: `section-card-${i}`,
              pieceHash: shapeHash,
              x: 72 + i * 310,
              y: 500,
              width: 280,
              height: 220,
            },
            {
              ...body,
              id: `section-${i}-1`,
              x: 92 + i * 310,
              y: 530,
              width: 240,
              height: 50,
            },
            {
              ...body,
              id: `section-${i}-2`,
              x: 92 + i * 310,
              y: 590,
              width: 240,
              height: 80,
            },
          ]).flat(),
        ],
        bindings: [
          { ...source.fragment.bindings[0], targetIds: ["headline-1"] },
          ...Array.from({ length: 3 }, (_, i) => ({
            ...source.fragment.bindings[1],
            id: `item-${i}`,
            source: `block:body:${i}:text`,
            targetIds: [`section-${i}-1`, `section-${i}-2`],
          })),
        ],
      },
    });
    const before = arsenalHash(mosaic);
    const derived = authorFamilyCarouselRepertoire(mosaic);
    expect(arsenalHash(mosaic)).toBe(before);
    for (const d of derived.filter(d => {
      const v = d.completeDesign?.designGuidance?.carouselVariant;
      return v?.version === 3 && v.function === "reading";
    })) {
      const card = compactComponentCard(d);
      expect(
        card.fields.filter(f => f.source.startsWith("block:label:"))
      ).toHaveLength(3);
      expect(
        card.fields
          .filter(f => f.source.startsWith("block:label:"))
          .every(f => !f.required)
      ).toBe(true);
      expect(
        d.fragment.instances
          .filter(i => i.id.startsWith("section-card-"))
          .every(i => i.width > 700)
      ).toBe(true);
      const bodyFields = d.fragment.bindings.filter(b =>
        b.source.startsWith("block:body:")
      );
      expect(bodyFields.every(b => b.targetIds.length === 1)).toBe(true);
      expect(
        d.completeDesign?.designGuidance?.fieldRelationships?.filter(
          r => r.kind === "sequence"
        )
      ).toHaveLength(3);
    }
  });
  it("keeps identity and immutable originals while exposing alternatives, without Cartesian offers", () => {
    const before = arsenalHash(source);
    const [family] = resolveDesignFamilyRepertoires(cards, {
      slideCount: 8,
      contentMode: "compose",
    });
    expect(family.slides).toHaveLength(8);
    expect(family.slides[1].variants).toHaveLength(2);
    expect(family.slides[6].variants).toEqual(family.slides[1].variants);
    for (const child of children) {
      expect(child.fragment.instances.map(i => i.id)).toEqual(
        source.fragment.instances.map(i => i.id)
      );
      expect(child.assets).toEqual(source.assets);
      expect(
        child.completeDesign?.designGuidance?.carouselVariant?.version
      ).toBe(3);
      expect(child.fragment.bindings).toEqual(source.fragment.bindings);
    }
    expect(arsenalHash(source)).toBe(before);
  });
  it("materializes intentional repetition and exact contracts from the chosen alternatives", () => {
    const [family] = resolveDesignFamilyRepertoires(cards, {
      slideCount: 4,
      contentMode: "literal",
    });
    const plan = family.slides.map(s => s.variants.at(-1)!.id);
    const result = materializeDesignFamilyOffer(family, plan);
    expect(result.slides[1].componentId).toBe(result.slides[2].componentId);
    expect(result.contentMode).toBe("literal");
    expect(() => materializeDesignFamilyOffer(family, plan.slice(1))).toThrow(
      "length"
    );
    expect(() =>
      materializeDesignFamilyOffer(family, [plan[0], plan[3], plan[2], plan[3]])
    ).toThrow("not_offered");
    const stale = structuredClone(family);
    stale.slides[1].variants[0].completeDesign!.designGuidance!.carouselVariant!.sourceHash =
      "a".repeat(64);
    expect(() =>
      materializeDesignFamilyOffer(
        stale,
        stale.slides.map(s => s.variants[0].id)
      )
    ).toThrow("provenance");
  });
  it("rejects a sequence of individually valid cards with incompatible aspects", () => {
    const [family] = resolveDesignFamilyRepertoires(cards, {
      slideCount: 3,
      contentMode: "compose",
    });
    const incompatible = structuredClone(family);
    incompatible.slides[0].variants[0].aspectRatios = ["4:5"];
    incompatible.slides[1].variants.forEach(c => (c.aspectRatios = ["1:1"]));
    expect(() =>
      materializeDesignFamilyOffer(
        incompatible,
        incompatible.slides.map(s => s.variants[0].id)
      )
    ).toThrow("aspect_incompatible");
  });
  it("publishes per-variant field meaning and capacity estimates while historical V2 stays readable", () => {
    const [family] = resolveDesignFamilyRepertoires(cards, {
      slideCount: 5,
      contentMode: "compose",
    });
    const profile = describeDesignFamilyRepertoire(family);
    expect(profile.version).toBe(3);
    expect(profile.capacityRule).toBe("choose_one_variant_per_slide");
    expect(profile.variants.length).toBe(4);
    for (const v of profile.variants) {
      const section = { ...profile.common, ...v.profile };
      expect(section.mechanics?.fields[0].label).toBe("Título");
      expect(section.mechanics?.capacityEvidence).toBe(
        "geometry_estimate_not_measurement"
      );
    }
    expect(
      describeCompactOfferV3(family.defaultOffer).sequence.every(
        s => s.alternatives.length === 1
      )
    ).toBe(true);
    expect(describeCompactOffer(family.defaultOffer).version).toBe(2);
  });
});
