import { prepareHistoricalGeneration as prepareOrchestratedGeneration } from "../ai/workflows/historicalPreparation.fixture";
import { describe, it, expect, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import {
  compactComponentCard,
  createComponentDefinition,
} from "@shared/componentAssembly";
import { resolveCompleteDesignOffers } from "@shared/completeDesignOffers";
import { authorCarouselVisualVariant } from "./carouselVisualVariants";
import {
  verifyPreparedEligibility,
} from "../ai/workflows/generationPreparation";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { defaultStudioPreferences } from "@shared/studioPreferences";
const sources = completeDesignTestDefinitions();
const defs = sources.flatMap(d => [
  d,
  authorCarouselVisualVariant(d, "development"),
  authorCarouselVisualVariant(d, "closing"),
  authorCarouselVisualVariant(d, "development", false),
  authorCarouselVisualVariant(d, "closing", false),
]);
const cards = defs.map(compactComponentCard);
const owner = "00000000-0000-4000-8000-000000000001";
const input = (extra = {}) =>
  orchestratedGenerationInputSchema.parse({
    ownerId: owner,
    idempotencyKey: "offers",
    content: "Café artesanal, uma pausa para conversar.",
    platform: "instagram",
    inputType: "text",
    postMode: "carousel",
    slideCount: 3,
    ...extra,
  });
function depsFor(catalog = defs) {
  return {
    operation: async <T>(_: string, work: () => Promise<T>) => work(),
    loadContext: async () => "Café artesanal, uma pausa para conversar.",
    preferences: async () => defaultStudioPreferences,
    retrieve: vi.fn(async () => catalog.map(compactComponentCard)),
    hydrate: vi.fn(async (ids: string[]) =>
      catalog.filter(d => ids.includes(d.id))
    ),
    shortlist: vi.fn(async ({ cards }: any) => ({
      cards,
      evaluated: [],
      batches: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    })),
    generate: vi.fn(async (p: any) => {
      const data = JSON.parse(p.messages[1].content);
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                version: 2,
                options: [0, 1, 2].map(i => ({
                  offerId: data.catalog[i % data.catalog.length].offerId,
                  reason: "Capacidades reais por papel",
                })),
              }),
            },
          },
        ],
      } as any;
    }),
  };
}
describe("curated exact offers", () => {
  it("requires only roles used and rejects missing/revision-mismatched children", () => {
    expect(
      resolveCompleteDesignOffers(cards, {
        slideCount: 3,
        contentMode: "compose",
      })
    ).toHaveLength(3);
    const source = sources[0];
    const closing = authorCarouselVisualVariant(source, "closing");
    expect(
      resolveCompleteDesignOffers([source, closing].map(compactComponentCard), {
        slideCount: 2,
        contentMode: "compose",
      })
    ).toHaveLength(1);
    expect(
      resolveCompleteDesignOffers([source, closing].map(compactComponentCard), {
        slideCount: 3,
        contentMode: "compose",
      })
    ).toEqual([]);
    const changed = createComponentDefinition({
      ...source,
      description: "new revision",
    });
    expect(
      resolveCompleteDesignOffers(
        [changed, ...defs.filter(d => d.id !== source.id)].map(
          compactComponentCard
        ),
        { slideCount: 3, contentMode: "compose" }
      ).some(o => o.sourceId === changed.id)
    ).toBe(false);
  });
  it("separates literal and compose identities, keeps static and declared uniform original", () => {
    const compose = resolveCompleteDesignOffers(cards, {
        slideCount: 4,
        contentMode: "compose",
      })[0],
      literal = resolveCompleteDesignOffers(cards, {
        slideCount: 4,
        contentMode: "literal",
      })[0];
    expect(compose.signature).not.toBe(literal.signature);
    const keys = defs
      .filter(d => d.completeDesign?.designGuidance?.carouselVariant)
      .map(d =>
        JSON.stringify([
          d.source.kind === "recipe"
            ? d.source.referenceId
            : d.source.versionId,
          d.source.variantKey,
        ])
      );
    expect(new Set(keys).size).toBe(keys.length);
    expect(
      resolveCompleteDesignOffers(cards, {
        slideCount: 1,
        contentMode: "compose",
      }).every(
        o =>
          o.slides.length === 1 &&
          !o.slides[0].card.completeDesign?.designGuidance?.carouselVariant
      )
    ).toBe(true);
    expect(
      resolveCompleteDesignOffers(cards, {
        slideCount: 3,
        contentMode: "compose",
        instructions: "Use o mesmo layout em todos os slides",
      }).every(o => new Set(o.slides.map(s => s.componentId)).size === 1)
    ).toBe(true);
    expect(() => authorCarouselVisualVariant(defs[1], "closing")).toThrow(
      "cannot_derive"
    );
  });
  it("rejects equal revision ambiguity and source without children before any simulated paid call", async () => {
    expect(() =>
      resolveCompleteDesignOffers(
        [
          ...cards,
          compactComponentCard(
            createComponentDefinition({
              ...defs[1],
              id: "00000000-0000-4000-8000-000000000099",
            })
          ),
        ],
        { slideCount: 3, contentMode: "compose" }
      )
    ).toThrow("ambiguous");
    const deps = depsFor(sources);
    await expect(
      prepareOrchestratedGeneration(
        input(),
        owner,
        false,
        Date.now() + 60000,
        deps
      )
    ).rejects.toThrow("catalog_variant_unavailable");
    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.shortlist).not.toHaveBeenCalled();
  });
  it("selects versioned offers, hydrates every exact ID and pins policy 7 without authoring", async () => {
    const deps = depsFor();
    const p = await prepareOrchestratedGeneration(
      input(),
      owner,
      false,
      Date.now() + 60000,
      deps
    );
    expect(p.preparationVersion).toBe(3);
    expect(p.reviewPolicyVersion).toBe(7);
    expect(p.reviewExecutionConfig?.policyVersion).toBe(7);
    expect(p.reviewExecutionConfig?.configurationHash).toMatch(/^[a-f0-9]{64}$/);
    for (const sequence of p.selectedDefinitions)
      for (const d of sequence) expect(defs).toContainEqual(d);
    expect(deps.shortlist.mock.calls[0][0].cards).toHaveLength(3);
    await verifyPreparedEligibility(p, false, deps.hydrate);
    const absent = {
      ...p,
      selectedDefinitions: p.selectedDefinitions.map(s =>
        s.map(d => ({ ...d, hash: "a".repeat(64) }))
      ),
    };
    await expect(
      verifyPreparedEligibility(absent, false, deps.hydrate)
    ).rejects.toThrow("catalog_component_ineligible");
  });
  it("does not reinterpret or repurchase a historical selection receipt", async () => {
    const deps = depsFor();
    deps.operation = async (key, work) =>
      key === "selection" ? ({ options: [] } as any) : work();
    await expect(
      prepareOrchestratedGeneration(
        input(),
        owner,
        false,
        Date.now() + 60000,
        deps
      )
    ).rejects.toThrow("preparation_contract_incompatible");
    expect(deps.generate).not.toHaveBeenCalled();
  });
  it("preserves literal fields and paid results when a selected component is archived", async () => {
    const deps = depsFor();
    const p = await prepareOrchestratedGeneration(
      input({
        executionBrief: {
          creationMode: "execution",
          rawInput: "Café artesanal",
          interventionLevel: "visual_only",
          objective: "educate",
          format: "carousel",
          platform: "instagram",
          contentSourceType: "freeform",
        },
      }),
      owner,
      true,
      Date.now() + 60000,
      deps
    );
    expect(p.selectedOffers?.every(o => o.contentMode === "literal")).toBe(
      true
    );
    await expect(
      verifyPreparedEligibility(p, true, async () => [])
    ).rejects.toThrow("catalog_component_ineligible");
  });
});
