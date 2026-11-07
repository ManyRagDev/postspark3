import { describe, expect, it, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { compactComponentCard, createComponentDefinition } from "@shared/componentAssembly";
import { defaultStudioPreferences } from "@shared/studioPreferences";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import {
  prepareOrchestratedGeneration,
  verifyPreparedEligibility,
} from "./generationPreparation";
import { GenerationCoordinator } from "./generationCoordinator";
import { resolveGenerationModelConfig } from "../generationModel";
import { replanGenerationSlot } from "./generationPlanning";
import { buildHeuristicGenerationPlan } from "./heuristicPlanBuilder";
import { resolveDesignFamilyRepertoires } from "@shared/designRepertoire";
import { describeConciseDesignFamilyRepertoire } from "@shared/compactDesignProfile";
import { authorFamilyCarouselRepertoire } from "../../designCatalog/familyCarouselRepertoire";
import { isPaidGenerationOperation } from "./generationJournalTrace";
import type { InvokeParams } from "../../_core/llm";
import { decodeGenerationSelectionCatalog } from "@shared/generationSelectionTransport";

const owner = "00000000-0000-4000-8000-000000000001";
const definitions = completeDesignTestDefinitions();
const intent = {
  version: 1,
  objective: "Apresentar uma ideia útil",
  tone: {
    description: "Cuidadoso",
    origin: "inferred",
    rationale: "O pedido envolve riscos.",
  },
  adaptation: "controlled",
  requirements: [],
  content: [
    {
      id: "idea",
      meaning: "Planejar com antecedência",
      sourceIds: [],
      requirementIds: [],
    },
  ],
};
function option(candidate: any, slot: number) {
  const page = candidate.profile.sequence[0];
  return {
    slot,
    status: "viable",
    candidateId: candidate.candidateId,
    reason: "A área textual comporta a ideia",
    editorialApproach: "Planejamento prático",
    captionContentIds: [],
    pages: [
      {
        slideIndex: 0,
        componentId: page.alternatives[0],
        purpose: "Apresentar a ideia",
        rhythm: "highlight",
        assignments: [
          {
            fieldId: "field-0",
            contentIds: ["idea"],
            itemCount: null,
            instruction: "Título com uma ideia útil",
          },
        ],
      },
    ],
  };
}
async function prepare(
  status:
    | "viable"
    | "insufficient_fit"
    | "unknown_candidate"
    | "unknown_component" = "viable",
  portalBrief?: string
) {
  const cards = portalBrief ? definitions.map((definition, index) => index === 0
    ? createComponentDefinition({
        ...definition,
        completeDesign: {
          ...definition.completeDesign!,
          designGuidance: {
            version: 1,
            summary: "Portal luminoso",
            motifs: [],
            preserve: [],
            contentRules: [],
            mediaRules: [],
            knownLimitations: [],
            visualFeatures: { chromaticPortal: ["arch", "background"] },
          },
        },
      })
    : definition) : definitions;
  const calls: InvokeParams[] = [];
  const journal = new Map<string, unknown>();
  const input = orchestratedGenerationInputSchema.parse({
    ownerId: owner,
    inputType: "text",
    content: portalBrief ?? "Explique como planejar diante de riscos",
    platform: "instagram",
    postMode: "static",
    idempotencyKey: "planning",
  });
  const generationConfig = {
    ...resolveGenerationModelConfig({
      generationModel: "gpt",
      postMode: "static",
    }),
    // Historical strategy-2 receipt: predates the editorial protocol and budgets.
    generationStrategyVersion: 2 as const,
    editorialIntentVersion: undefined,
    preparationBudget: undefined,
  };
  const generate = vi.fn(async (params: InvokeParams) => {
    calls.push(params);
    const data = JSON.parse(
      params.messages.find(m => m.role === "user")!.content as string
    );
    if (data.catalog)
      data.catalog = decodeGenerationSelectionCatalog(data.catalog);
    const result = params.traceLabel?.includes("intent")
      ? intent
      : {
          version: 1,
          slots: [0, 1, 2].map(slot =>
            status === "insufficient_fit" || slot === 2
              ? {
                  slot,
                  status: "insufficient_fit",
                  reason: "Nenhuma distribuição preserva esta opção",
                  unmetRequirementIds: [],
                }
              : {
                  ...option(data.catalog[portalBrief ? 0 : slot], slot),
                  ...(slot === 0 && status === "unknown_candidate"
                    ? { candidateId: "00000000-0000-4000-8000-000000009999" }
                    : {}),
                  ...(slot === 0 && status === "unknown_component"
                    ? {
                        pages: [
                          {
                            ...option(data.catalog[slot], slot).pages[0],
                            componentId: "00000000-0000-4000-8000-000000009999",
                          },
                        ],
                      }
                    : {}),
                }
          ),
        };
    return {
      choices: [{ message: { content: JSON.stringify(result) } }],
    } as any;
  });
  const hydrate = vi.fn(async (ids: string[]) =>
    cards.filter(d => ids.includes(d.id))
  );
  const operation = async <T>(key: string, work: () => Promise<T>) => {
    if (!journal.has(key)) journal.set(key, await work());
    return journal.get(key) as T;
  };
  const deps = {
    generationConfig,
    useLegacyLlmSelection: true,
    generate,
    hydrate,
    operation,
    loadContext: async () => input.content,
    preferences: async () => defaultStudioPreferences,
    retrieve: async () => cards.map(compactComponentCard),
    shortlist: vi.fn(async ({ cards }: any) => ({
      cards,
      evaluated: [],
      batches: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    })),
  };
  const prepared = await prepareOrchestratedGeneration(
    input,
    owner,
    true,
    Date.now() + 60000,
    deps
  );
  return { prepared, deps, calls, input, journal };
}

describe("planned generation integration", () => {
  it("offers only portal designs when the creator explicitly requires a chromatic portal", async () => {
    const { prepared, deps } = await prepare("viable",
      "Destaque a frase sobre experimentação. Quero portal luminoso com transição cromática no fundo. Sem fotografia.");
    expect(prepared.planning?.visualRequirements?.chromaticPortal?.quote).toContain("transição cromática");
    expect(deps.shortlist.mock.calls[0][0].cards).toHaveLength(1);
    expect(prepared.selectedDefinitions.flat().map(definition => definition.id)).toEqual([definitions[0].id, definitions[0].id]);
    await expect(verifyPreparedEligibility(prepared, true, deps.hydrate)).resolves.toBeUndefined();
  });
  it("pins native GPT for interpretation and visual plan, preserving viable siblings", async () => {
    const { prepared, calls, deps } = await prepare();
    expect(prepared.preparationVersion).toBe(6);
    expect(prepared.planning!.slots.map(s => s.status)).toEqual([
      "viable",
      "viable",
      "insufficient_fit",
    ]);
    expect(prepared.selectedDefinitions.map(s => s.length)).toEqual([1, 1, 0]);
    expect(calls).toHaveLength(2);
    expect(
      calls.every(
        c =>
          c.pinnedModel === "openai/gpt-6.1-sol" &&
          c.forceTextSchema === false &&
          c.disableFallback &&
          c.reasoningEffort === "medium"
      )
    ).toBe(true);
    await expect(
      verifyPreparedEligibility(prepared, true, deps.hydrate)
    ).resolves.toBeUndefined();
    const corrupted = structuredClone(prepared);
    corrupted.planning!.slots[0].reason = "changed";
    await expect(
      verifyPreparedEligibility(corrupted, true, deps.hydrate)
    ).rejects.toThrow("preparation_contract_incompatible");
  });
  it.each(["unknown_candidate", "unknown_component"] as const)(
    "preserves valid siblings when one plan returns %s",
    async status => {
      const { prepared, deps } = await prepare(status);
      expect(prepared.planning!.slots.map(s => s.status)).toEqual([
        "planning_failed",
        "viable",
        "insufficient_fit",
      ]);
      expect(prepared.selectedDefinitions.map(s => s.length)).toEqual([
        0, 1, 0,
      ]);
      expect(prepared.planning!.offers[0]).toBeNull();
      await expect(
        verifyPreparedEligibility(prepared, true, deps.hydrate)
      ).resolves.toBeUndefined();
    }
  );
  it("terminates three insufficient slots without copy, fake definitions or image calls", async () => {
    const { prepared } = await prepare("insufficient_fit");
    const copy = vi.fn(),
      persist = vi.fn();
    const coordinator = new GenerationCoordinator(
      {
        requestId: owner,
        runId: owner,
        actor: owner,
        prompt: "pedido",
        reviewPolicyVersion: 10,
        selectedDefinitions: prepared.selectedDefinitions,
        planning: prepared.planning,
      },
      { actor: owner, generateText: copy, persistUpdate: persist } as any
    );
    const snapshot = await coordinator.start();
    expect(snapshot.overallStatus).toBe("failed");
    expect(
      snapshot.proposals.every(
        p => p.failure?.code === "selection_insufficient_fit"
      )
    ).toBe(true);
    expect(copy).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledTimes(3);
  });
  it("replans the approach and fields for a fallback family before copy", async () => {
    const { prepared, deps } = await prepare();
    const generate = vi.fn(async (params: InvokeParams) => {
      const data = JSON.parse(
        params.messages.find(m => m.role === "user")!.content as string
      );
      expect((params.response_format as any).json_schema.schema.type).toBe(
        "object"
      );
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                slotPlan: {
                  ...option(data, 0),
                  editorialApproach: "Nova abordagem para esta família",
                },
              }),
            },
          },
        ],
      } as any;
    });
    const result = await replanGenerationSlot(
      {
        prepared,
        slot: 0,
        attempt: 1,
        currentFamilies: ["family-1"],
        generationConfig: deps.generationConfig,
        deadlineMs: Date.now() + 60000,
        experimental: true,
      },
      { ...deps, generate }
    );
    expect(result?.plan.editorialApproach).toBe(
      "Nova abordagem para esta família"
    );
    expect(result?.definitions[0].id).not.toBe(
      prepared.selectedDefinitions[0][0].id
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(isPaidGenerationOperation("prepare:intent")).toBe(true);
    expect(isPaidGenerationOperation("prepare:template_replan:0:1")).toBe(true);
  });
  it("plans a recovery family locally without another model call and reuses its journal", async () => {
    const { prepared, deps } = await prepare();
    const generate = vi.fn(async () => { throw new Error("paid visual replan must not run"); });
    const args = { prepared, slot: 0, attempt: 1, currentFamilies: [], generationConfig: deps.generationConfig, deadlineMs: Date.now() + 60000, experimental: true };
    const localDeps = { ...deps, generate, useLegacyLlmSelection: false };
    const result = await replanGenerationSlot(args, localDeps);
    expect(result?.plan.status).toBe("viable");
    expect(result?.definitions[0].id).not.toBe(prepared.selectedDefinitions[0][0].id);
    expect(await replanGenerationSlot(args, localDeps)).toEqual(result);
    expect(generate).not.toHaveBeenCalled();
  });
  it("executes hybrid decision tree: pins GPT for intent, builds deterministic heuristic visual plan in 1 call", async () => {
    const calls: InvokeParams[] = [];
    const journal = new Map<string, unknown>();
    const input = orchestratedGenerationInputSchema.parse({
      ownerId: owner,
      inputType: "text",
      content: "Explique como planejar diante de riscos",
      platform: "instagram",
      postMode: "static",
      idempotencyKey: "heuristic-hybrid-planning",
    });
    const generationConfig = {
      ...resolveGenerationModelConfig({
        generationModel: "gpt",
        postMode: "static",
      }),
      // Historical strategy-2 receipt: predates the editorial protocol and budgets.
    generationStrategyVersion: 2 as const,
    editorialIntentVersion: undefined,
    preparationBudget: undefined,
    };
    const generate = vi.fn(async (params: InvokeParams) => {
      calls.push(params);
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                version: 1,
                objective: "Apresentar os 3 pilares financeiros",
                tone: {
                  description: "Prático e estruturado",
                  origin: "inferred",
                  rationale: "Tema exige organização objetiva.",
                },
                adaptation: "controlled",
                requirements: [],
                content: [
                  { id: "cnt-1", meaning: "Pilar 1: Orçamento base", sourceIds: [], requirementIds: [] },
                  { id: "cnt-2", meaning: "Pilar 2: Reserva de liquidez", sourceIds: [], requirementIds: [] },
                  { id: "cnt-3", meaning: "Pilar 3: Alocação estratégica", sourceIds: [], requirementIds: [] },
                ],
              }),
            },
          },
        ],
      } as any;
    });
    const hydrate = vi.fn(async (ids: string[]) =>
      definitions.filter(d => ids.includes(d.id))
    );
    const operation = async <T>(key: string, work: () => Promise<T>) => {
      if (!journal.has(key)) journal.set(key, await work());
      return journal.get(key) as T;
    };
    const deps = {
      generationConfig,
      generate,
      hydrate,
      operation,
      loadContext: async () => input.content,
      preferences: async () => defaultStudioPreferences,
      retrieve: async () => definitions.map(compactComponentCard),
      shortlist: vi.fn(async ({ cards }: any) => ({
        cards,
        evaluated: cards.map((c: any) => ({ id: c.id, score: 3.5, confidence: 0.9 })),
        batches: 1,
        inputTokens: 150,
        outputTokens: 20,
        costUsd: 0.001,
      })),
    };
    const prepared = await prepareOrchestratedGeneration(
      input,
      owner,
      true,
      Date.now() + 60000,
      deps
    );
    // Deve chamar o LLM apenas UMA VEZ (para o intent)! A seleção visual é calculada pela árvore heurística local.
    expect(calls).toHaveLength(1);
    expect(calls[0].traceLabel).toBe("generation_intent_v1");
    expect(JSON.stringify(calls[0].messages)).toContain("kind=content somente para obrigações de conteúdo");
    expect(prepared.planning).toBeDefined();
    expect(prepared.planning!.slots.every(s => s.status === "viable")).toBe(true);
    expect(prepared.planning!.slots[0].pages).toHaveLength(1);
    expect(prepared.planning!.offers[0]).toBeDefined();
    await expect(verifyPreparedEligibility(prepared, true, deps.hydrate)).resolves.toBeUndefined();
  });
  it("sanitizes unknown sourceIds hallucinated by LLM in intent", async () => {
    const journal = new Map<string, unknown>();
    const input = orchestratedGenerationInputSchema.parse({
      ownerId: owner,
      inputType: "text",
      content: "Fato sobre tecnologia",
      platform: "instagram",
      postMode: "static",
      idempotencyKey: "sanitize-source-ids",
    });
    const generationConfig = {
      ...resolveGenerationModelConfig({
        generationModel: "gemini",
        postMode: "static",
      }),
      // Historical strategy-2 receipt: predates the editorial protocol and budgets.
    generationStrategyVersion: 2 as const,
    editorialIntentVersion: undefined,
    preparationBudget: undefined,
    };
    const generate = vi.fn(async (params: InvokeParams) => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              version: 1,
              objective: "Apresentar o fato",
              tone: { description: "Informativo", origin: "inferred", rationale: "Neutro" },
              adaptation: "controlled",
              requirements: [],
              content: [
                // Alucinação simulada: s7, s8, s10 não existem em factualSourceIds
                { id: "cnt-1", meaning: "Fato principal", sourceIds: ["s7", "s8", "s10"], requirementIds: [] },
              ],
            }),
          },
        },
      ],
    } as any));
    const hydrate = vi.fn(async (ids: string[]) => definitions.filter(d => ids.includes(d.id)));
    const operation = async <T>(key: string, work: () => Promise<T>) => {
      if (!journal.has(key)) journal.set(key, await work());
      return journal.get(key) as T;
    };
    const deps = {
      generationConfig,
      generate,
      hydrate,
      operation,
      loadContext: async () => input.content,
      preferences: async () => defaultStudioPreferences,
      retrieve: async () => definitions.map(compactComponentCard),
      shortlist: vi.fn(async ({ cards }: any) => ({
        cards,
        evaluated: cards.map((c: any) => ({ id: c.id, score: 3.5, confidence: 0.9 })),
        batches: 1,
        inputTokens: 100,
        outputTokens: 10,
        costUsd: 0.001,
      })),
    };
    // Sem a sanitização defensiva, isso lançaria erro 'planning_response_invalid'
    const prepared = await prepareOrchestratedGeneration(input, owner, true, Date.now() + 60000, deps);
    expect(prepared.planning).toBeDefined();
    expect(prepared.planning!.intent.content[0].sourceIds).toEqual([]);
  });
  it("falls back to another eligible family when the higher-scored family cannot satisfy independent list cardinality", () => {
    const base = definitions[0];
    const makeListFamily = (family: string, maxItems: number) =>
      createComponentDefinition({
        ...base,
        id: `00000000-0000-4000-8000-00000000010${maxItems}`,
        completeDesign: { ...base.completeDesign!, family },
        fragment: {
          ...base.fragment,
          bindings: [
            base.fragment.bindings[0],
            {
              ...base.fragment.bindings[1],
              kind: "list",
              source: "block:list:0:items",
              cardinality: { min: 1, max: maxItems },
            },
          ],
        },
      });
    const twoItemCard = compactComponentCard(makeListFamily("family-max-2", 2));
    const threeItemCard = compactComponentCard(makeListFamily("family-max-3", 3));
    const repertoires = resolveDesignFamilyRepertoires(
      [twoItemCard, threeItemCard],
      { slideCount: 1, contentMode: "compose" }
    );
    const twoItemRep = repertoires.find(r => r.family === "family-max-2")!;
    const threeItemRep = repertoires.find(r => r.family === "family-max-3")!;
    const threeItemIntent = {
      version: 1 as const,
      objective: "Apresentar três itens na arte",
      tone: {
        description: "Direto",
        origin: "inferred" as const,
        rationale: "Lista objetiva",
      },
      adaptation: "controlled" as const,
      requirements: [
        {
          id: "req-3",
          summary: "Três itens na arte",
          origin: "explicit" as const,
          kind: "content" as const,
          surface: "art" as const,
          itemCount: 3,
          requestQuote: "três itens",
        },
      ],
      content: [
        { id: "c1", meaning: "Item 1", sourceIds: [], requirementIds: ["req-3"] },
        { id: "c2", meaning: "Item 2", sourceIds: [], requirementIds: ["req-3"] },
        { id: "c3", meaning: "Item 3", sourceIds: [], requirementIds: ["req-3"] },
      ],
    };
    const result = buildHeuristicGenerationPlan({
      intent: threeItemIntent,
      eligible: [twoItemRep, threeItemRep],
      shortlist: {
        cards: [],
        evaluated: [
          { id: twoItemRep.defaultOffer.offerId, hash: twoItemRep.signature, score: 3.9, confidence: 1 },
          { id: threeItemRep.defaultOffer.offerId, hash: threeItemRep.signature, score: 3.1, confidence: 1 },
        ],
        batches: 1,
        inputTokens: 10,
        outputTokens: 5,
        costUsd: 0,
      },
      imageObligation: { policy: "optional", required: false, purpose: "none", reason: "Sem obrigação", slotTargets: 0 },
      slideCount: 1,
    });
    expect(result.slots.map(s => s.status)).toEqual(["viable", "viable", "viable"]);
    expect(
      result.slots.every(
        s => s.status === "viable" && s.candidateId === threeItemRep.defaultOffer.offerId
      )
    ).toBe(true);
  });
  it("includes interior development and closing carousel variants in the concise JEV profile", () => {
    const source = definitions[0];
    const cards = [source, ...authorFamilyCarouselRepertoire(source)].map(compactComponentCard);
    const [repertoire] = resolveDesignFamilyRepertoires(cards, {
      slideCount: 5,
      contentMode: "compose",
    });
    const profile = describeConciseDesignFamilyRepertoire(repertoire);
    expect(profile.sequence).toHaveLength(5);
    expect(profile.sequence.map(s => s.role)).toEqual([
      "cover",
      "development",
      "development",
      "development",
      "closing",
    ]);
    expect(profile.variants.some(v => v.roles.includes("development"))).toBe(true);
    expect(profile.variants.some(v => v.roles.includes("closing"))).toBe(true);
  });
});
