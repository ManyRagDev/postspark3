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
  diversifyDesignSelection,
} from "./generationPreparation";
import { defaultStudioPreferences } from "@shared/studioPreferences";
import { arsenalHash } from "@shared/arsenalContent";
import type { InvokeParams } from "../../_core/llm";
import type { DesignShortlistResult } from "../../designCatalog/designShortlist";

const owner = "00000000-0000-4000-8000-000000000001";
function withNativePhoto(
  base: ReturnType<typeof completeDesignTestDefinitions>[number],
  family = base.completeDesign!.family
) {
  const source = Object.values(base.pieces)[0];
  const media = {
    ...source,
    kind: "media" as const,
    fixedText: null,
    fill: "#CCCCCC",
  };
  const hash = arsenalHash(media);
  return createComponentDefinition({
    ...base,
    completeDesign: { ...base.completeDesign!, family },
    pieces: { ...base.pieces, [hash]: media },
    fragment: {
      ...base.fragment,
      instances: [
        ...base.fragment.instances,
        {
          id: "native-photo",
          pieceHash: hash,
          parentId: null,
          x: 0,
          y: 800,
          width: 400,
          height: 300,
          rotation: 0,
          opacity: 1,
          zIndex: -1,
        },
      ],
      mediaSlots: [
        {
          id: "native-photo",
          label: "Foto nativa",
          function: "Foto editorial",
          prompt: "",
          deferred: true,
          policy: "cover",
        },
      ],
    },
  });
}

function inputFor(content: string, extras: Record<string, unknown> = {}) {
  return orchestratedGenerationInputSchema.parse({
    ownerId: owner,
    inputType: "text",
    content,
    platform: "instagram",
    idempotencyKey: "stable",
    ...extras,
  });
}

function preparationDeps(
  definitions: ReturnType<typeof completeDesignTestDefinitions>,
  options = definitions.map(d => ({ designIds: [d.id], reason: "Nativo" }))
) {
  return {
    generate: vi.fn(
      async (_params: InvokeParams) =>
        ({
          choices: [{ message: { content: JSON.stringify({ version: 2, options }) } }],
        }) as any
    ),
    retrieve: vi.fn(async () => definitions.map(compactComponentCard)),
    shortlist: vi.fn(
      async ({
        cards,
      }: {
        cards: ReturnType<typeof compactComponentCard>[];
      }): Promise<DesignShortlistResult> => ({
        cards,
        evaluated: [],
        batches: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      })
    ),
    hydrate: vi.fn(async (ids: string[]) =>
      definitions.filter(d => ids.includes(d.id))
    ),
    preferences: vi.fn(async () => defaultStudioPreferences),
    operation: async <T>(_key: string, work: () => Promise<T>) => work(),
    loadContext: async () => "Fatos fornecidos",
  };
}
describe("orchestrated preparation", () => {

  it("does not replace explanatory space with small labels merely to diversify similar scores", () => {
    const cards = completeDesignTestDefinitions().map(compactComponentCard);
    const rich = {
      source: "block:body:0:text",
      width: 600,
      height: 200,
      fontSize: 20,
      minFontSize: 20,
      minWords: 1,
    };
    cards[0].capacity.textRegions = [rich];
    cards[1].capacity.textRegions = [
      { ...rich, width: 160, height: 37, fontSize: 32 },
    ];
    cards[2].capacity.textRegions = [
      { ...rich, width: 160, height: 37, fontSize: 32 },
    ];
    const options = Array.from({ length: 3 }, () => ({
      designIds: [cards[0].id],
      reason: "Space for all facts",
    }));
    const evaluated = cards.map(card => ({
      id: card.id,
      hash: card.hash,
      score: 3.8,
      confidence: 1,
    }));
    expect(
      diversifyDesignSelection(
        options,
        cards,
        evaluated,
        1,
        {
          policy: "optional",
          required: false,
          purpose: "none",
          reason: "optional",
          slotTargets: 0,
        },
        false,
        []
      )
    ).toEqual(options);
  });
  it("softly diversifies similarly suitable families and recent results without sacrificing an adequate design for variety", () => {
    const cards = completeDesignTestDefinitions().map(compactComponentCard);
    const options = [cards[0], cards[0], cards[0]].map(card => ({
      designIds: [card.id],
      reason: "Good fit",
    }));
    const obligation = {
      policy: "optional" as const,
      required: false,
      purpose: "none" as const,
      reason: "",
      slotTargets: 0,
    };
    const evaluated = cards.map(card => ({
      id: card.id,
      hash: card.hash,
      score: 3,
      confidence: 0.9,
    }));
    const varied = diversifyDesignSelection(
      options,
      cards,
      evaluated,
      1,
      obligation,
      false,
      []
    );
    expect(new Set(varied.map(option => option.designIds[0])).size).toBe(3);
    expect(
      diversifyDesignSelection(
        options,
        cards,
        evaluated,
        1,
        obligation,
        false,
        [],
        new Set([cards[0].completeDesign!.family])
      )
    ).toEqual(options);
    const recent = [
      {
        requestId: "old",
        selections: [
          { family: cards[0].completeDesign!.family, designIds: [cards[0].id] },
        ],
      },
    ];
    expect(
      diversifyDesignSelection(
        options,
        cards,
        evaluated,
        1,
        obligation,
        false,
        recent
      )[0].designIds[0]
    ).not.toBe(cards[0].id);
    evaluated[1].score = 1;
    evaluated[2].score = 1;
    expect(
      diversifyDesignSelection(
        options,
        cards,
        evaluated,
        1,
        obligation,
        false,
        recent
      )
    ).toEqual(options);
    expect(
      diversifyDesignSelection(options, cards, [], 1, obligation, false, recent)
    ).toEqual(options);
  });
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

    it("does not turn topic nouns into a mandatory photograph", () => {
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
      expect(obligation.policy).toBe("optional");
      expect(obligation.required).toBe(false);
      expect(obligation.purpose).toBe("editorial-photo");
    });

    it.each([
      "Um visual de produto com cores fortes",
      "Design tipográfico para café",
      "Fotografia como arte",
      "Produto, comida, prato e ambiente",
    ])("keeps descriptive topic/style words optional: %s", content => {
      expect(
        determineImageObligation(inputFor(content), null, {
          ...defaultStudioPreferences,
          enabled: true,
          language: "typographic",
        }).policy
      ).toBe("optional");
    });

    it.each([
      "Post com foto de café",
      "Use esta imagem",
      "Inclua uma foto do produto",
      "Mostre imagens da coleção",
      "Adicione ilustração do espaço",
    ])(
      "current explicit image request overrides saved typographic taste: %s",
      content => {
        expect(
          determineImageObligation(inputFor(content), null, {
            ...defaultStudioPreferences,
            enabled: true,
            language: "typographic",
          }).policy
        ).toBe("required");
      }
    );

    it("allows a reference to guide a current explicit result without photos", () => {
      const result = determineImageObligation(
        inputFor("Use a referência de cores, mas apenas texto sem fotos", {
          imageUrl: "https://example.test/reference.png",
          inputType: "image",
        }),
        null
      );
      expect(result.policy).toBe("forbidden");
      expect(result.required).toBe(false);
    });

    it.each([
      "duas propostas com foto e uma tipográfica",
      "2 variações com espaço para imagem e 1 proposta sem foto",
      "Crie três propostas para uma cafeteria artesanal: duas com foto de uma xícara de café e uma apenas tipográfica, sem foto. Mensagem: Café da manhã com calma. Horário: das 8h às 18h.",
    ])(
      "preserves the explicit two-photo/one-type mix globally: %s",
      content => {
        expect(
          determineImageObligation(
            inputFor(content, {
              imageUrl: "https://example.test/reference.png",
            }),
            null
          ).policy
        ).toBe("optional");
      }
    );

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
    it("forbids every native media slot in an explicitly text-only proposal", () => {
      const definitions = completeDesignTestDefinitions();
      const photo = withNativePhoto(definitions[0]);
      const cards = [
        compactComponentCard(photo),
        ...definitions.slice(1).map(compactComponentCard),
      ];
      expect(() =>
        validateDesignSelection(
          cards.map(card => ({ designIds: [card.id], reason: "Foto" })),
          cards,
          1,
          {
            policy: "forbidden",
            required: false,
            purpose: "none",
            reason: "Sem fotos",
            slotTargets: 0,
          }
        )
      ).toThrow("não permite slots");
    });

    it("requires exactly two photo-bearing proposals in an explicit mixed request", () => {
      const definitions = completeDesignTestDefinitions();
      const cards = [
        withNativePhoto(definitions[0]),
        withNativePhoto(definitions[1]),
        definitions[2],
      ].map(compactComponentCard);
      const choices = cards.map(card => ({
        designIds: [card.id],
        reason: "Nativo",
      }));
      expect(() =>
        validateDesignSelection(choices, cards, 1, undefined, true)
      ).not.toThrow();
      expect(() =>
        validateDesignSelection(
          [choices[0], choices[0], choices[0]],
          cards,
          1,
          undefined,
          true
        )
      ).toThrow("two_options");
      expect(() =>
        validateDesignSelection(
          [choices[2], choices[2], choices[2]],
          cards,
          1,
          undefined,
          true
        )
      ).toThrow("two_options");
    });
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

  it("does not dispatch a paid selector after cancellation during shortlist", async () => {
    const deps = preparationDeps(completeDesignTestDefinitions());
    const controller = new AbortController();
    deps.shortlist.mockImplementation(async ({ cards }) => {
      controller.abort(new Error("generation_cancelled"));
      return {
        cards,
        evaluated: [],
        batches: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      };
    });
    await expect(
      prepareOrchestratedGeneration(
        inputFor("Café artesanal"),
        owner,
        false,
        Date.now() + 60000,
        { ...deps, signal: controller.signal }
      )
    ).rejects.toThrow("generation_cancelled");
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("does not start preparation after its absolute deadline", async () => {
    const deps = preparationDeps(completeDesignTestDefinitions());
    await expect(
      prepareOrchestratedGeneration(
        inputFor("Café artesanal"),
        owner,
        false,
        Date.now() - 1,
        deps
      )
    ).rejects.toThrow("generation_deadline_exceeded");
    expect(deps.retrieve).not.toHaveBeenCalled();
    expect(deps.shortlist).not.toHaveBeenCalled();
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("pins editorialGuidanceVersion 8 and includes brand context in preparation", async () => {
    const deps = preparationDeps(completeDesignTestDefinitions());
    deps.generate = vi.fn(async (params: any) => {
      const parsed = JSON.parse(params.messages[1].content);
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                version: params.traceLabel === "generation_selection_v3" ? 3 : 2,
                options: parsed.catalog.slice(0, 3).map((o: any) => ({
                  offerId: o.offerId,
                  reason: "Nativo",
                  ...(params.traceLabel === "generation_selection_v3" ? {editorialApproach:"Benefício concreto da proposta"} : {}),
                })),
              }),
            },
          },
        ],
      } as any;
    });
    const input = inputFor("Café especial", {
      creationMode: "execution",
      executionBrief: {
        creationMode: "execution",
        format: "static",
        platform: "instagram",
        objective: "engage",
        interventionLevel: "optimize_structure",
        contentSourceType: "freeform",
        rawInput: "Café especial colhido à mão",
        audience: "Amantes de café espresso",
        brandEssence: "Café de origem sustentável",
      },
    });
    const prepared = await prepareOrchestratedGeneration(
      input,
      owner,
      false,
      Date.now() + 60000,
      deps
    );
    expect(prepared.reviewExecutionConfig.editorialGuidanceVersion).toBe(8);
    const { editorialContextV9 } = await import("./editorialContextV9");
    const expectedHash = editorialContextV9(
      {
        prompt: input.content,
        executionBrief: input.executionBrief,
        contextContent: prepared.contextContent,
        platform:input.platform, postMode:input.postMode, tone:input.tone,
      }
    ).hash;
    expect(prepared.editorialContextHash).toBe(expectedHash);
    const otherNetwork = await prepareOrchestratedGeneration({...input,platform:"linkedin",executionBrief:{...input.executionBrief!,platform:"linkedin"}},owner,false,Date.now()+60000,deps);
    expect(otherNetwork.reviewExecutionConfig?.editorialGuidanceVersion).toBe(8);
    expect(otherNetwork.editorialContext?.version).toBe(3);
  });

  it("C-01: pins selection_input operation before models and reuses it idempotently", async () => {
    const journal = new Map<string, any>();
    const deps = preparationDeps(completeDesignTestDefinitions());
    deps.generate = vi.fn(async (params: any) => {
      const parsed = JSON.parse(params.messages[1].content);
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                version: params.traceLabel === "generation_selection_v3" ? 3 : 2,
                options: parsed.catalog.slice(0, 3).map((o: any) => ({
                  offerId: o.offerId,
                  reason: "Nativo",
                  ...(params.traceLabel === "generation_selection_v3" ? {editorialApproach:"Benefício concreto da proposta"} : {}),
                })),
              }),
            },
          },
        ],
      } as any;
    });
    deps.operation = vi.fn(async (key: string, work: any) => {
      if (journal.has(key)) return journal.get(key);
      const res = await work();
      journal.set(key, res);
      return res;
    });

    const input = inputFor("Café com requisitos", {
      creationMode: "execution",
      executionBrief: {
        creationMode: "execution",
        format: "static",
        platform: "instagram",
        objective: "engage",
        interventionLevel: "optimize_structure",
        contentSourceType: "freeform",
        rawInput: "Café especial",
        mustKeep: ["Grãos Selecionados"],
      },
    });

    const prepared = await prepareOrchestratedGeneration(
      input,
      owner,
      false,
      Date.now() + 60000,
      deps
    );

    // Verify selection_input operation was recorded
    expect(journal.has("selection_input")).toBe(true);
    const pinned = journal.get("selection_input");
    expect(pinned).toHaveProperty("brief");
    expect(pinned).toHaveProperty("requirements");
    expect(pinned.requirements[0].value).toBe("Grãos Selecionados");
    expect(pinned).toHaveProperty("reviewExecutionConfig");
    expect(pinned).toHaveProperty("jevModel");

    // Second run reuses pinned input without calling work
    let workCalled = false;
    deps.operation = vi.fn(async (key: string, work: any) => {
      if (journal.has(key)) return journal.get(key);
      if (key === "selection_input") {
        workCalled = true;
      }
      const res = await work();
      journal.set(key, res);
      return res;
    });

    const prepared2 = await prepareOrchestratedGeneration(
      input,
      owner,
      false,
      Date.now() + 60000,
      deps
    );
    expect(workCalled).toBe(false);
    expect(prepared2.editorialContextHash).toBe(prepared.editorialContextHash);
  });

  it("resumes a valid historical configuration and its pinned JEV model", async () => {
    const journal = new Map<string, any>();
    const deps = preparationDeps(completeDesignTestDefinitions());
    deps.operation = vi.fn(async (key: string, work: any) => {
      if (journal.has(key)) return journal.get(key);
      const res = await work();
      journal.set(key, res);
      return res;
    });

    deps.generate = vi.fn(async (params:any) => ({choices:[{message:{content:JSON.stringify({version:2, options:JSON.parse(params.messages[1].content).catalog.slice(0,3).map((o:any) => ({offerId:o.offerId,reason:"Direção histórica"}))})}}]} as any));
    const input = inputFor("Café simples");
    // Pre-populate selection_input with incompatible jevModel
    const { resolveReviewExecutionConfigV7 } = await import("./reviewExecutionConfigV7");
    journal.set("selection_input", {
      brief: "Prompt fixo",
      requirements: [],
      reviewExecutionConfig: resolveReviewExecutionConfigV7(5),
      jevModel: "historical/pinned-model",
    });

    const prepared = await prepareOrchestratedGeneration(input, owner, false, Date.now() + 60000, deps);
    expect(prepared.reviewExecutionConfig?.editorialGuidanceVersion).toBe(5);
    expect(deps.shortlist).toHaveBeenCalledWith(expect.objectContaining({model:"historical/pinned-model"}));
  });
});
