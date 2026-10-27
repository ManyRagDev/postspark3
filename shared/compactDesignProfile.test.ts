import { describe, expect, it } from "vitest";
import { compactComponentCard } from "./componentAssembly";
import { completeDesignTestDefinitions } from "./completeDesignGeneration.fixture";
import { resolveCompleteDesignOffers } from "./completeDesignOffers";
import { authorCarouselVisualVariant } from "../server/designCatalog/carouselVisualVariants";
import {
  compactDesignSection,
  describeCompactOffer,
  offerRecencyPenalty,
  compactOfferProfileSchema,
} from "./compactDesignProfile";
import { describeCompleteDesign } from "./designSelection";

const card = () => compactComponentCard(completeDesignTestDefinitions()[0]);
const region = (x: number, y: number, width = 0.3, height = 0.2) => ({
  id: `${x}-${y}`,
  kind: "text" as const,
  x,
  y,
  width,
  height,
  rotation: 0,
});

describe("compact design profiles", () => {
  it("distinguishes side-by-side comparison space from stacked explanation without using topic labels", () => {
    const a = card(),
      b = card();
    a.regions = [region(0.1, 0.2), region(0.6, 0.2)];
    b.regions = [region(0.1, 0.2), region(0.1, 0.6)];
    expect(compactDesignSection(a).layout).toMatchObject({
      flow: "side_by_side",
      textAreaPct: 12,
    });
    expect(compactDesignSection(b).layout).toMatchObject({
      flow: "stacked",
      alignment: "left_edges",
      textAreaPct: 12,
    });
    const before = compactDesignSection(a);
    a.label = "Only for coffee";
    a.completeDesign!.family = "food-and-coffee";
    expect(compactDesignSection(a)).toEqual(before);
  });
  it("does not double-count overlapping rectangles or report missing geometry as zero space", () => {
    const c = card();
    c.regions = [region(0, 0, 0.5, 0.5), region(0.25, 0, 0.5, 0.5)];
    expect(compactDesignSection(c).layout).toMatchObject({
      textAreaPct: 37.5,
      unoccupiedBoundsPct: 62.5,
    });
    delete c.regions;
    expect(compactDesignSection(c)).toMatchObject({
      layout: { flow: "unknown", textAreaPct: null },
      unknowns: expect.arrayContaining(["spatial_geometry"]),
    });
    c.regions = [{ ...region(0, 0), rotation: 30 }, region(0, 0.5)];
    expect(compactDesignSection(c).layout).toMatchObject({
      flow: "unknown",
      alignment: "unknown",
      rotatedRegions: 1,
    });
  });
  it("keeps canonical field capacity, partitioning and distinct authored constraints without copying sample media prompts", () => {
    const c = card(),
      source = "block:body:0:text";
    c.fields = [{ source, kind: "text", required: true, cardinality: null }];
    const r = {
      source,
      width: 160,
      height: 37,
      fontSize: 32,
      minFontSize: 32,
      minWords: 2,
    };
    c.capacity.textRegions = [r, { ...r }];
    c.mediaSlots = [
      {
        id: "picture",
        label: "Coffee photo",
        function: "editorial",
        prompt: "private sample coffee prompt",
        policy: "cover",
        deferred: true,
      },
    ];
    c.completeDesign!.designGuidance = {
      version: 1,
      summary: "Two panels",
      motifs: ["comparison-grid"],
      preserve: ["Keep panels", "Keep panels"],
      contentRules: ["Preserve the qualifier"],
      mediaRules: [{ slotId: "picture", instructions: ["Use one subject"] }],
      knownLimitations: ["No reflow"],
      requiredTextTargets: ["title-left"],
    };
    const before = structuredClone(c),
      result = compactDesignSection(c);
    expect(result.fields).toEqual([
      { source, kind: "text", required: true, chars: 18, splitTargets: 2 },
    ]);
    expect(result.authored).toMatchObject({
      preserve: ["Keep panels"],
      content: ["Preserve the qualifier"],
      requiredTargets: ["title-left"],
      media: [{ slot: "picture", instructions: ["Use one subject"] }],
    });
    expect(result.limitations).toContain("No reflow");
    expect(JSON.stringify(result)).not.toContain(
      "private sample coffee prompt"
    );
    expect(c).toEqual(before);
    c.capacity.textRegions.forEach(r => (r.minWords = 1));
    expect(compactDesignSection(c).fields[0]).toMatchObject({ chars: 9 });
    c.fields.push({ source, kind: "text", required: false, cardinality: null });
    expect(compactDesignSection(c).fields).toHaveLength(2);
  });
  it("factors a ten-slide sequence without losing role, order, different typography or guidance", () => {
    const source = completeDesignTestDefinitions()[0];
    const cards = [
      source,
      authorCarouselVisualVariant(source, "development"),
      authorCarouselVisualVariant(source, "closing"),
    ].map(compactComponentCard);
    const offer = resolveCompleteDesignOffers(cards, {
      slideCount: 10,
      contentMode: "compose",
    })[0];
    const profile = describeCompactOffer(offer);
    expect(profile.sequence).toHaveLength(10);
    expect(profile.variants.length).toBeLessThanOrEqual(3);
    expect(
      new Set(profile.sequence.slice(1, -1).map(s => s.variant)).size
    ).toBe(1);
    for (const [i, entry] of profile.sequence.entries()) {
      expect(entry.role).toBe(offer.slides[i].role);
      expect({ ...profile.common, ...profile.variants[entry.variant] }).toEqual(
        compactDesignSection(offer.slides[i].card)
      );
    }
    const original = JSON.stringify(offer);
    const bytes = (x: unknown) => Buffer.byteLength(JSON.stringify(x));
    expect(bytes(profile)).toBeLessThan(
      bytes(offer.slides.map(s => describeCompleteDesign(s.card))) * 0.7
    );
    expect(JSON.stringify(offer)).toBe(original);
    const bad = structuredClone(profile);
    bad.sequence[0].variant = 99;
    expect(compactOfferProfileSchema.safeParse(bad).success).toBe(false);
    offer.slides[0].card = {
      ...offer.slides[0].card,
      sourceFontFamilies: ["A different real font"],
    };
    expect(describeCompactOffer(offer)).not.toEqual(profile);
  });
  it("matches recency by real members or family, independently of generated offer identity", () => {
    const offer = resolveCompleteDesignOffers([card()], {
      slideCount: 1,
      contentMode: "compose",
    })[0];
    expect(offer.offerId).not.toBe(offer.sourceId);
    const history = [
      {
        requestId: "old",
        selections: [{ family: offer.family, designIds: [offer.sourceId] }],
      },
    ];
    expect(offerRecencyPenalty(offer, history)).toBe(0.3);
    history[0].selections[0].designIds = ["different-component"];
    expect(offerRecencyPenalty(offer, history)).toBe(0.22);
    history[0].selections[0].family = "different-family";
    expect(offerRecencyPenalty(offer, history)).toBe(0);
  });
});
