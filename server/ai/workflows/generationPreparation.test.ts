import { describe, expect, it, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import {
  compactComponentCard,
  createComponentDefinition,
} from "@shared/componentAssembly";
import {
  orchestratedGenerationInputSchema,
  normalizeExecutionBrief,
} from "@shared/generationRequest";
import {
  determineImageObligation,
  prepareOrchestratedGeneration,
  validateDesignSelection,
} from "./generationPreparation";
import { defaultStudioPreferences } from "@shared/studioPreferences";

const owner = "00000000-0000-4000-8000-000000000001";
describe("orchestrated preparation", () => {
  it("bounds execution payloads before admission without truncating their text", () => {
    const base = {
      creationMode: "execution",
      format: "static",
      platform: "instagram",
      objective: "educate",
      interventionLevel: "visual_only",
      contentSourceType: "freeform",
      rawInput: "A".repeat(24001),
    };
    expect(
      orchestratedGenerationInputSchema.safeParse({
        ownerId: owner,
        inputType: "text",
        content: "Post",
        platform: "instagram",
        idempotencyKey: "key",
        creationMode: "execution",
        executionBrief: base,
      }).success
    ).toBe(false);
    expect(
      orchestratedGenerationInputSchema.safeParse({
        ownerId: owner,
        inputType: "text",
        content: "Post",
        platform: "instagram",
        idempotencyKey: "key",
        creationMode: "execution",
        executionBrief: {
          ...base,
          rawInput: "Café",
          mustKeep: Array.from({ length: 50 }, () => "A".repeat(2000)),
        },
      }).success
    ).toBe(false);
  });
  it("selects only eligible whole designs and preserves prepared evidence and execution controls", async () => {
    const definitions = completeDesignTestDefinitions(),
      cards = definitions.map(compactComponentCard);
    const excluded = {
      ...cards[0],
      id: "00000000-0000-4000-8000-000000000999",
    };
    const shortlist = vi
      .fn()
      .mockResolvedValue({
        cards,
        evaluated: [],
        batches: 1,
        inputTokens: 100,
        outputTokens: 10,
        costUsd: 0.001,
      });
    const signal = new AbortController().signal;
    const input = orchestratedGenerationInputSchema.parse({
      ownerId: owner,
      inputType: "url",
      content: "https://example.test",
      platform: "instagram",
      idempotencyKey: "stable",
      creationMode: "execution",
      executionBrief: {
        creationMode: "execution",
        format: "static",
        platform: "instagram",
        objective: "sell",
        interventionLevel: "visual_only",
        contentSourceType: "caption_ready",
        rawInput: "Café a R$ 12",
        mustKeep: ["R$ 12"],
        mustInclude: ["Hoje"],
        forbiddenTerms: ["grátis"],
      },
    });
    const generate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              options: definitions.map(d => ({
                designIds: [d.id],
                reason: "Composição " + d.label,
              })),
            }),
          },
        },
      ],
    });
    const prepared = await prepareOrchestratedGeneration(
      input,
      owner,
      false,
      Date.now() + 60000,
      {
        generate,
        shortlist,
        signal,
        operation: async (_key, work) => work(),
        loadContext: async () => "Fonte verificada: Café a R$ 12",
        retrieve: vi.fn().mockResolvedValue([...cards, excluded]),
        hydrate: vi.fn().mockResolvedValue(definitions),
        preferences: async () => defaultStudioPreferences,
      }
    );
    expect(prepared.selectedDefinitions.map(p => p[0].id)).toEqual(
      definitions.map(d => d.id)
    );
    expect(prepared.contextContent).toContain("Fonte verificada");
    expect(JSON.stringify(generate.mock.calls[0][0].messages)).toContain(
      "visual_only"
    );
    expect(JSON.stringify(generate.mock.calls[0][0].messages)).toContain(
      "R$ 12"
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(shortlist).toHaveBeenCalledWith(
      expect.objectContaining({
        signal,
        operation: expect.any(Function),
        cards: [...cards, excluded],
      })
    );
    expect(JSON.stringify(shortlist.mock.calls[0][0])).toContain(
      "Fonte verificada"
    );
    expect(JSON.stringify(generate.mock.calls[0][0])).not.toContain(
      excluded.id
    );
    expect(generate.mock.calls[0][0].maxTransportAttempts).toBe(1);
  });
  it("rejects family mixing and missing slide roles without vetoing repeated families", () => {
    const definitions = completeDesignTestDefinitions().map(d =>
      createComponentDefinition({
        ...d,
        roles: ["cover", "development", "closing"],
      })
    );
    const cards = definitions.map(compactComponentCard);
    expect(() =>
      validateDesignSelection(
        definitions.map(d => ({
          designIds: [d.id, d.id, d.id],
          reason: "native",
        })),
        cards,
        3
      )
    ).not.toThrow();
    expect(() =>
      validateDesignSelection(
        definitions.map(d => ({
          designIds: [d.id, definitions[1].id, d.id],
          reason: "mixed",
        })),
        cards,
        3
      )
    ).toThrow("mistura famílias");
    expect(() =>
      validateDesignSelection(
        definitions.map(d => ({ designIds: [d.id], reason: "role" })),
        cards,
        1
      )
    ).toThrow("função");
    expect(() =>
      validateDesignSelection(
        Array.from({ length: 3 }, () => ({
          designIds: [definitions[0].id, definitions[0].id, definitions[0].id],
          reason: "same",
        })),
        cards,
        3
      )
    ).not.toThrow();
  });
  it("retains up to ten execution slides rather than silently truncating to five", () => {
    const input = {
      creationMode: "execution",
      format: "carousel",
      platform: "instagram",
      objective: "educate",
      interventionLevel: "visual_only",
      contentSourceType: "carousel_slides",
      rawInput: "10 slides",
      slides: Array.from({ length: 10 }, (_, i) => ({
        slideNumber: i + 1,
        rawText: "Texto " + (i + 1),
      })),
    } as const;
    expect(
      normalizeExecutionBrief({ ...input, slides: [...input.slides] }).slides
    ).toHaveLength(10);
  });

  describe("determineImageObligation", () => {
    it("returns product obligation when image reference is provided by user or brand", () => {
      const obligation1 = determineImageObligation(
        {
          ownerId: owner,
          inputType: "image",
          content: "Foto do produto",
          platform: "instagram",
          idempotencyKey: "key-1",
        },
        null
      );
      expect(obligation1.required).toBe(true);
      expect(obligation1.purpose).toBe("editorial-photo");

      const obligation2 = determineImageObligation(
        {
          ownerId: owner,
          inputType: "text",
          content: "Lançamento",
          imageUrl: "https://example.com/item.png",
          platform: "instagram",
          idempotencyKey: "key-2",
        },
        null
      );
      expect(obligation2.required).toBe(true);
      expect(obligation2.purpose).toBe("product");
    });

    it("returns none obligation for explicitly typographic requests", () => {
      const obligation = determineImageObligation(
        {
          ownerId: owner,
          inputType: "text",
          content: "Quero um post apenas texto com tipografia limpa, sem fotos",
          platform: "instagram",
          idempotencyKey: "key-3",
        },
        null
      );
      expect(obligation.policy).toBe("forbidden");
      expect(obligation.required).toBe(false);
      expect(obligation.purpose).toBe("none");
    });

    it("returns editorial-photo obligation when briefing requires contextual photo", () => {
      const obligation = determineImageObligation(
        {
          ownerId: owner,
          inputType: "text",
          content:
            "Post sobre xícara de café latte art em ambiente aconchegante",
          platform: "instagram",
          idempotencyKey: "key-4",
        },
        null
      );
      expect(obligation.policy).toBe("required");
      expect(obligation.required).toBe(true);
      expect(obligation.purpose).toBe("editorial-photo");
    });

    it("returns optional policy for neutral briefing without photo mentions or prohibitions", () => {
      const obligation = determineImageObligation(
        {
          ownerId: owner,
          inputType: "text",
          content:
            "5 passos fundamentais para organizar sua rotina matinal de estudos",
          platform: "instagram",
          idempotencyKey: "key-5",
        },
        null
      );
      expect(obligation.policy).toBe("optional");
      expect(obligation.required).toBe(false);
      expect(obligation.purpose).toBe("editorial-photo");
    });
  });

  describe("validateDesignSelection with image obligation", () => {
    it("throws when required image obligation has no media slots in selected design", () => {
      const definitions = completeDesignTestDefinitions().map(d =>
        createComponentDefinition({
          ...d,
          roles: ["cover", "development", "closing"],
          // ensure no media slots
          fragment: {
            ...d.fragment,
            mediaSlots: [],
          },
        })
      );
      const cards = definitions.map(compactComponentCard);
      expect(() =>
        validateDesignSelection(
          definitions.map(d => ({
            designIds: [d.id, d.id, d.id],
            reason: "no-media-slots",
          })),
          cards,
          3,
          {
            required: true,
            purpose: "editorial-photo",
            reason: "Foto obrigatória",
            slotTargets: 1,
          }
        )
      ).toThrow("não possui slots de mídia nativos");
    });
  });
});
