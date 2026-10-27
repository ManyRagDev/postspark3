import { describe, expect, it, vi, afterEach } from "vitest";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { defaultStudioPreferences } from "@shared/studioPreferences";
import { reconcileCatalogCoverage, type CatalogRequest } from "../../designCatalog/catalogCoverage";
import { electionCatalogFixture } from "../../designCatalog/designElection.fixture";
import { shortlistCompleteDesigns, type JevRequest } from "../../designCatalog/designShortlist";
import { prepareHistoricalContextGeneration as prepareOrchestratedGeneration } from "./historicalPreparation.fixture";
import { adaptRequestForProvider } from "../providers/modelAdapters";
import { completeSourceContext, SourceContextLimitError } from "@shared/sourceContext";
import { ENV } from "../../_core/env";
import { resolveReviewExecutionConfigV7 } from "./reviewExecutionConfigV7";
import { GenerationFailureError } from "@shared/generationFailure";

const owner = "11111111-1111-4111-8111-111111111111";

function setup(n = 14, contextContent = "Fonte sentinela padrão", requestOverrides: Partial<CatalogRequest> = {}) {
  const { definitions, inventory } = electionCatalogFixture(n);
  const catalogRequest: CatalogRequest = {
    aspectRatio: "4:5",
    postMode: "static",
    text: contextContent,
    slideCount: 1,
    experimental: false,
    ...requestOverrides,
  };
  const catalog = reconcileCatalogCoverage(catalogRequest, inventory);
  const journal = new Map<string, any>();
  const jevCalls: JevRequest[] = [];
  const evaluate = vi.fn(async (r: JevRequest) => {
    jevCalls.push(r);
    return {
      id: "controlled-jev",
      model: r.model,
      answers: Object.fromEntries(
        Object.keys(r.questions).map((id) => [
          id,
          { type: "score" as const, score: 3.5, confidence: 0.9 },
        ])
      ),
      usage: { input_tokens: 1, output_tokens: 1, cost: 0 },
    };
  });
  const generateCalls: any[] = [];
  const generate = vi.fn(async (p: any) => {
    generateCalls.push(p);
    const data = JSON.parse(p.messages[1].content);
    return {
      choices: [
        {
          message: {
            content: JSON.stringify({
              version: 2,
              options: data.catalog.slice(0, 3).map((o: any) => ({
                offerId: o.offerId,
                reason: "Estrutura compatível com este briefing.",
              })),
            }),
          },
        },
      ],
    } as any;
  });
  const deps = {
    loadContext: async () => contextContent,
    preferences: async () => defaultStudioPreferences,
    retrieve: vi.fn(async () => catalog),
    hydrate: vi.fn(async (ids: string[]) => definitions.filter((d) => ids.includes(d.id))),
    operation: async <T>(key: string, work: () => Promise<T>): Promise<T> => {
      if (journal.has(key)) return journal.get(key);
      const r = await work();
      journal.set(key, r);
      return r;
    },
    shortlist: (p: any) => shortlistCompleteDesigns(p, evaluate),
    generate,
  };
  return { definitions, inventory, catalog, journal, jevCalls, evaluate, generateCalls, generate, deps };
}

describe("generation selection context handoff (OS-01 / C2 / C7)", () => {
  it("AC-1: delivers sentinel source and complementary instruction to selector in execution mode", async () => {
    const sentinelSource = "Fonte sentinela exclusiva C2 - dados clínicos e restrições de dose.";
    const sentinelInstruction = "Instrução sentinela exclusiva do pedido complementar - enfatizar carrossel educativo.";
    const s = setup(8, sentinelSource, { postMode: "static", slideCount: 1 });

    const input = orchestratedGenerationInputSchema.parse({
      ownerId: owner,
      idempotencyKey: "test-c2-ac1",
      inputType: "text",
      content: sentinelInstruction,
      platform: "instagram",
      postMode: "static",
      aspectRatio: "4:5",
      executionBrief: {
        creationMode: "execution",
        format: "static",
        platform: "instagram",
        objective: "educate",
        interventionLevel: "light_optimize",
        contentSourceType: "freeform",
        rawInput: "Briefing bruto do produto farmacêutico sem a fonte e sem o pedido complementar.",
        notes: "Notas gerais do briefing sem sentinela.",
        mustKeep: ["Dose diária"],
        mustInclude: ["Consulte um médico"],
        forbiddenTerms: ["Cura mágica"],
      },
    });

    const prepared = await prepareOrchestratedGeneration(input, owner, false, Date.now() + 60000, s.deps);

    // Verify prepared keeps contextContent
    expect(prepared.contextContent).toBe(sentinelSource);

    // Verify selector effective message
    expect(s.generateCalls.length).toBe(1);
    const selectorPayload = JSON.parse(s.generateCalls[0].messages[1].content);

    // Both sentinels must be present and identified
    expect(selectorPayload).toHaveProperty("sourceEvidence", sentinelSource);
    expect(selectorPayload).toHaveProperty("complementaryInstruction", sentinelInstruction);
    expect(selectorPayload.brief).toContain("Briefing bruto do produto farmacêutico");
    expect(selectorPayload).toHaveProperty("requirements");
    expect(selectorPayload.requirements.some((r: any) => r.value === "Dose diária" && r.kind === "literal" && r.caseSensitive === true)).toBe(true);
    expect(selectorPayload.requirements.some((r: any) => r.value === "Consulte um médico" && r.kind === "literal")).toBe(true);
    expect(selectorPayload.requirements.some((r: any) => r.value === "Cura mágica" && r.kind === "forbidden" && r.match === "word_or_phrase")).toBe(true);
  });

  it("AC-2: <=12 offers bypasses Jev; >12 delivers same material condition to Jev and selector through model adapter", async () => {
    const sentinelSource = "Fonte sentinela de teste de cobertura e lotes.";
    const sentinelInstruction = "Pedido complementar de foco técnico.";

    // Scenario A: <= 12 offers (e.g. 10 offers)
    {
      const sSmall = setup(10, sentinelSource, { postMode: "static", slideCount: 1 });
      const inputSmall = orchestratedGenerationInputSchema.parse({
        ownerId: owner,
        idempotencyKey: "test-c2-small",
        inputType: "text",
        content: sentinelInstruction,
        platform: "instagram",
        postMode: "static",
        aspectRatio: "4:5",
        executionBrief: {
          creationMode: "execution",
          format: "static",
          platform: "instagram",
          objective: "educate",
          interventionLevel: "light_optimize",
          contentSourceType: "freeform",
          rawInput: "Briefing curto.",
        },
      });

      await prepareOrchestratedGeneration(inputSmall, owner, false, Date.now() + 60000, sSmall.deps);

      // Jev must NOT be called for <= 12 offers
      expect(sSmall.evaluate).not.toHaveBeenCalled();

      // Selector still receives the sentinels
      const selectorPayload = JSON.parse(sSmall.generateCalls[0].messages[1].content);
      expect(selectorPayload.sourceEvidence).toBe(sentinelSource);
      expect(selectorPayload.complementaryInstruction).toBe(sentinelInstruction);
    }

    // Scenario B: > 12 offers (e.g. 15 offers)
    {
      const sLarge = setup(15, sentinelSource);
      const inputLarge = orchestratedGenerationInputSchema.parse({
        ownerId: owner,
        idempotencyKey: "test-c2-large",
        inputType: "text",
        content: sentinelInstruction,
        platform: "instagram",
        postMode: "static",
        aspectRatio: "4:5",
        executionBrief: {
          creationMode: "execution",
          format: "static",
          platform: "instagram",
          objective: "educate",
          interventionLevel: "light_optimize",
          contentSourceType: "freeform",
          rawInput: "Briefing longo para classificação Jev.",
        },
      });

      const prepared = await prepareOrchestratedGeneration(inputLarge, owner, false, Date.now() + 60000, sLarge.deps);

      // Jev must be called
      expect(sLarge.evaluate).toHaveBeenCalled();

      // Jev state contains both sourceEvidence and complementaryInstruction in context
      const jevState = JSON.parse(sLarge.jevCalls[0].state);
      const jevContext = jevState.context ?? jevState;
      expect(jevContext).toHaveProperty("sourceEvidence", sentinelSource);
      expect(jevContext).toHaveProperty("complementaryInstruction", sentinelInstruction);

      // Selector receives both sentinels
      const selectorPayload = JSON.parse(sLarge.generateCalls[0].messages[1].content);
      expect(selectorPayload).toHaveProperty("sourceEvidence", sentinelSource);
      expect(selectorPayload).toHaveProperty("complementaryInstruction", sentinelInstruction);

      // Check model adapter serialization
      const adapted = adaptRequestForProvider({
        provider: "openrouter",
        effectiveModel: "google/gemini-3.8-flash",
        messages: sLarge.generateCalls[0].messages,
        responseFormat: sLarge.generateCalls[0].response_format,
      });
      const adaptedUserMessage = adapted.messages.find((m) => m.role === "user");
      expect(typeof adaptedUserMessage?.content).toBe("string");
      expect(adaptedUserMessage?.content as string).toContain(sentinelSource);
      expect(adaptedUserMessage?.content as string).toContain(sentinelInstruction);

      // 3 finite options selected
      expect(prepared.selectedOffers).toHaveLength(3);
      expect(prepared.selectedDefinitions).toHaveLength(3);
    }
  });

  it("AC-3: ideation textual & URL preserve source in brief, execution preserves constraints, >24k fails explicitly", async () => {
    // Ideation mode
    const ideationSource = "Conteúdo ideativo original da URL http://exemplo.com/artigo";
    const sIdeation = setup(6, ideationSource, { postMode: "static", slideCount: 1 });
    const inputIdeation = orchestratedGenerationInputSchema.parse({
      ownerId: owner,
      idempotencyKey: "test-c2-ideation",
      inputType: "url",
      content: "http://exemplo.com/artigo",
      platform: "instagram",
      postMode: "static",
      aspectRatio: "4:5",
    });

    await prepareOrchestratedGeneration(inputIdeation, owner, false, Date.now() + 60000, sIdeation.deps);

    const selectorPayload = JSON.parse(sIdeation.generateCalls[0].messages[1].content);
    // In ideation, source is in the brief text
    expect(selectorPayload.brief).toContain(ideationSource);

    // Source context above 24000 fails explicitly with SourceContextLimitError
    const hugeSource = "X".repeat(24001);
    expect(() => completeSourceContext(hugeSource)).toThrow(SourceContextLimitError);

    // End-of-source conditions and negation are preserved
    const sourceWithEndingCondition = "Regra 1: Validade de 30 dias. NÃO aplicar desconto em itens de outlet.";
    const sEnding = setup(6, sourceWithEndingCondition, { postMode: "static", slideCount: 1 });
    const inputEnding = orchestratedGenerationInputSchema.parse({
      ownerId: owner,
      idempotencyKey: "test-c2-ending",
      inputType: "text",
      content: "Foco no produto",
      platform: "instagram",
      postMode: "static",
      aspectRatio: "4:5",
      executionBrief: {
        creationMode: "execution",
        format: "static",
        platform: "instagram",
        objective: "sell",
        interventionLevel: "visual_only",
        contentSourceType: "freeform",
        rawInput: "Produto A",
      },
    });
    await prepareOrchestratedGeneration(inputEnding, owner, false, Date.now() + 60000, sEnding.deps);
    const endingPayload = JSON.parse(sEnding.generateCalls[0].messages[1].content);
    expect(endingPayload.sourceEvidence).toContain("NÃO aplicar desconto em itens de outlet.");
  });

  it("AC-4: completed operations and saved preparation are reused without recalling selector or Jev", async () => {
    const s = setup(14, "Fonte estável", { postMode: "static", slideCount: 1 });
    const input = orchestratedGenerationInputSchema.parse({
      ownerId: owner,
      idempotencyKey: "test-c2-replay",
      inputType: "text",
      content: "Instrução inicial",
      platform: "instagram",
      postMode: "static",
      aspectRatio: "4:5",
      executionBrief: {
        creationMode: "execution",
        format: "static",
        platform: "instagram",
        objective: "educate",
        interventionLevel: "light_optimize",
        contentSourceType: "freeform",
        rawInput: "Briefing",
      },
    });

    // Run first time
    const prepared1 = await prepareOrchestratedGeneration(input, owner, false, Date.now() + 60000, s.deps);
    expect(s.generateCalls.length).toBe(1);
    expect(s.evaluate.mock.calls.length).toBeGreaterThan(0);

    const initialGenerateCount = s.generateCalls.length;
    const initialEvaluateCount = s.evaluate.mock.calls.length;

    // Run second time with same journal (simulating operation store replay)
    const prepared2 = await prepareOrchestratedGeneration(input, owner, false, Date.now() + 60000, s.deps);

    // No new calls to generate or evaluate
    expect(s.generateCalls.length).toBe(initialGenerateCount);
    expect(s.evaluate.mock.calls.length).toBe(initialEvaluateCount);
    expect(prepared2.selectedOffers).toEqual(prepared1.selectedOffers);
  });

  it("AC-5: prepared selection delivers context and selected definitions to consumer", async () => {
    const sentinelSource = "Fonte de dados para o workflow";
    const s = setup(6, sentinelSource, { postMode: "static", slideCount: 1 });
    const input = orchestratedGenerationInputSchema.parse({
      ownerId: owner,
      idempotencyKey: "test-c2-ac5",
      inputType: "text",
      content: "Instrução para entrega",
      platform: "instagram",
      postMode: "static",
      aspectRatio: "4:5",
      executionBrief: {
        creationMode: "execution",
        format: "static",
        platform: "instagram",
        objective: "educate",
        interventionLevel: "light_optimize",
        contentSourceType: "freeform",
        rawInput: "Briefing para bundle",
      },
    });

    const prepared = await prepareOrchestratedGeneration(input, owner, false, Date.now() + 60000, s.deps);

    expect(prepared.contextContent).toBe(sentinelSource);
    expect(prepared.selectedDefinitions).toHaveLength(3);
    expect(prepared.selectedDefinitions.every((seq) => seq.length > 0)).toBe(true);
    expect(prepared.selectedOffers).toHaveLength(3);
    expect(prepared.executionBrief).toBeDefined();
    expect(prepared.preparationVersion).toBe(3);
  });

  it("C-01 AC-4: with <=12 and >12 compact offers, typed requirements (literal, meaning, forbidden) appear in Jev and selector with correct scope/case/match", async () => {
    const sentinelLiteral = "REQ_LITERAL_SENTINELA";
    const sentinelForbidden = "TERMO_PROIBIDO_SENTINELA";
    const sentinelMeaning = "Conceito essencial de garantia semântica";

    // 1. Scenario <= 12 offers
    {
      const sSmall = setup(8, "Fonte curta", { postMode: "static", slideCount: 1 });
      const inputSmall = orchestratedGenerationInputSchema.parse({
        ownerId: owner,
        idempotencyKey: "test-c01-ac4-small",
        inputType: "text",
        content: "Pedido complementar",
        platform: "instagram",
        postMode: "static",
        aspectRatio: "4:5",
        executionBrief: {
          creationMode: "execution",
          format: "static",
          platform: "instagram",
          objective: "educate",
          interventionLevel: "light_optimize",
          contentSourceType: "freeform",
          rawInput: "Briefing com requisitos tipados",
          mustKeep: [sentinelLiteral],
          forbiddenTerms: [sentinelForbidden],
          contentRequirements: [
            {
              kind: "meaning",
              value: sentinelMeaning,
              scope: "art",
            },
          ],
        },
      });

      await prepareOrchestratedGeneration(inputSmall, owner, false, Date.now() + 60000, sSmall.deps);

      expect(sSmall.evaluate).not.toHaveBeenCalled();
      expect(sSmall.generateCalls).toHaveLength(1);
      const selectorPayload = JSON.parse(sSmall.generateCalls[0].messages[1].content);
      expect(selectorPayload.requirements).toBeDefined();
      expect(Array.isArray(selectorPayload.requirements)).toBe(true);

      const litReq = selectorPayload.requirements.find((r: any) => r.value === sentinelLiteral);
      expect(litReq).toBeDefined();
      expect(litReq.kind).toBe("literal");
      expect(litReq.caseSensitive).toBe(true);
      expect(litReq.scope).toBe("either");

      const forbReq = selectorPayload.requirements.find((r: any) => r.value === sentinelForbidden);
      expect(forbReq).toBeDefined();
      expect(forbReq.kind).toBe("forbidden");
      expect(forbReq.match).toBe("word_or_phrase");

      const meanReq = selectorPayload.requirements.find((r: any) => r.value === sentinelMeaning);
      expect(meanReq).toBeDefined();
      expect(meanReq.kind).toBe("meaning");
      expect(meanReq.scope).toBe("art");
    }

    // 2. Scenario > 12 offers
    {
      const sLarge = setup(15, "Fonte longa");
      const inputLarge = orchestratedGenerationInputSchema.parse({
        ownerId: owner,
        idempotencyKey: "test-c01-ac4-large",
        inputType: "text",
        content: "Pedido complementar grande",
        platform: "instagram",
        postMode: "static",
        aspectRatio: "4:5",
        executionBrief: {
          creationMode: "execution",
          format: "static",
          platform: "instagram",
          objective: "educate",
          interventionLevel: "light_optimize",
          contentSourceType: "freeform",
          rawInput: "Briefing longo com requisitos tipados",
          mustKeep: [sentinelLiteral],
          forbiddenTerms: [sentinelForbidden],
          contentRequirements: [
            {
              kind: "meaning",
              value: sentinelMeaning,
              scope: "art",
            },
          ],
        },
      });

      await prepareOrchestratedGeneration(inputLarge, owner, false, Date.now() + 60000, sLarge.deps);

      // Jev was called
      expect(sLarge.evaluate).toHaveBeenCalled();
      const jevState = JSON.parse(sLarge.jevCalls[0].state);
      const jevContext = jevState.context ?? jevState;
      expect(jevContext.requirements).toBeDefined();
      expect(jevContext.requirements.some((r: any) => r.value === sentinelLiteral && r.kind === "literal")).toBe(true);
      expect(jevContext.requirements.some((r: any) => r.value === sentinelForbidden && r.kind === "forbidden")).toBe(true);
      expect(jevContext.requirements.some((r: any) => r.value === sentinelMeaning && r.kind === "meaning")).toBe(true);

      // Selector was called with same requirements
      const selectorPayload = JSON.parse(sLarge.generateCalls[0].messages[1].content);
      expect(selectorPayload.requirements).toBeDefined();
      expect(selectorPayload.requirements.some((r: any) => r.value === sentinelLiteral)).toBe(true);
      expect(selectorPayload.requirements.some((r: any) => r.value === sentinelForbidden)).toBe(true);
      expect(selectorPayload.requirements.some((r: any) => r.value === sentinelMeaning)).toBe(true);

      // Model adapter serialization retains requirements
      const adapted = adaptRequestForProvider({
        provider: "openrouter",
        effectiveModel: "google/gemini-3.8-flash",
        messages: sLarge.generateCalls[0].messages,
        responseFormat: sLarge.generateCalls[0].response_format,
      });
      const adaptedUserMessage = adapted.messages.find((m) => m.role === "user");
      expect(typeof adaptedUserMessage?.content).toBe("string");
      expect(adaptedUserMessage?.content as string).toContain(sentinelLiteral);
      expect(adaptedUserMessage?.content as string).toContain(sentinelForbidden);
      expect(adaptedUserMessage?.content as string).toContain(sentinelMeaning);
    }
  });

  describe("RC-001: selection input receipt full pre-effect validation", () => {
    const originalEnv = { ...ENV };
    afterEach(() => {
      Object.assign(ENV, originalEnv);
    });

    const createInput = () =>
      orchestratedGenerationInputSchema.parse({
        ownerId: owner,
        idempotencyKey: "test-rc001",
        inputType: "text",
        content: "Briefing de validação de recibo",
        platform: "instagram",
        postMode: "static",
        aspectRatio: "4:5",
        executionBrief: {
          creationMode: "execution",
          format: "static",
          platform: "instagram",
          objective: "educate",
          interventionLevel: "light_optimize",
          contentSourceType: "freeform",
          rawInput: "Briefing de validação de recibo",
        },
      });

    it("matrix case 1 (control): valid brief and valid receipt proceeds to shortlist with Jev and selector", async () => {
      const s = setup(14);
      const input = createInput();
      const prepared = await prepareOrchestratedGeneration(input, owner, false, Date.now() + 60000, s.deps);
      expect(prepared).toBeDefined();
      expect(s.jevCalls.length).toBeGreaterThan(0);
      expect(s.generateCalls.length).toBe(1);
    });

    it("matrix case 2: brief: null in receipt fails with preparation_contract_incompatible before any Jev/selector call", async () => {
      const s = setup(14);
      const validConfig = resolveReviewExecutionConfigV7();
      s.journal.set("selection_input", {
        brief: null,
        requirements: [],
        reviewExecutionConfig: validConfig,
        jevModel: ENV.openRouterDesignSelectionModel,
      });
      const input = createInput();
      await expect(
        prepareOrchestratedGeneration(input, owner, false, Date.now() + 60000, s.deps)
      ).rejects.toMatchObject({
        failure: {
          code: "preparation_contract_incompatible",
          stage: "selection",
          retryable: false,
        },
      });
      expect(s.jevCalls.length).toBe(0);
      expect(s.generateCalls.length).toBe(0);
    });

    it("matrix case 3: brief: 123 in receipt fails with preparation_contract_incompatible before any Jev/selector call", async () => {
      const s = setup(14);
      const validConfig = resolveReviewExecutionConfigV7();
      s.journal.set("selection_input", {
        brief: 123,
        requirements: [],
        reviewExecutionConfig: validConfig,
        jevModel: ENV.openRouterDesignSelectionModel,
      });
      const input = createInput();
      await expect(
        prepareOrchestratedGeneration(input, owner, false, Date.now() + 60000, s.deps)
      ).rejects.toMatchObject({
        failure: {
          code: "preparation_contract_incompatible",
          stage: "selection",
          retryable: false,
        },
      });
      expect(s.jevCalls.length).toBe(0);
      expect(s.generateCalls.length).toBe(0);
    });

    it("matrix case 4: zeroed configurationHash fails with preparation_contract_incompatible before any Jev/selector call", async () => {
      const s = setup(14);
      const validConfig = resolveReviewExecutionConfigV7();
      s.journal.set("selection_input", {
        brief: "Brief válido",
        requirements: [],
        reviewExecutionConfig: {
          ...validConfig,
          configurationHash: "0".repeat(64),
        },
        jevModel: ENV.openRouterDesignSelectionModel,
      });
      const input = createInput();
      await expect(
        prepareOrchestratedGeneration(input, owner, false, Date.now() + 60000, s.deps)
      ).rejects.toMatchObject({
        failure: {
          code: "preparation_contract_incompatible",
          stage: "selection",
          retryable: false,
        },
      });
      expect(s.jevCalls.length).toBe(0);
      expect(s.generateCalls.length).toBe(0);
    });

    it("matrix case 5: changed review model environment after valid pin fails before any Jev/selector call", async () => {
      const s = setup(14);
      const validConfig = resolveReviewExecutionConfigV7();
      s.journal.set("selection_input", {
        brief: "Brief válido",
        requirements: [],
        reviewExecutionConfig: validConfig,
        jevModel: ENV.openRouterDesignSelectionModel,
      });
      // Environment model changed after receipt was recorded
      ENV.openRouterProposalReviewModel = "anthropic/claude-3.7-sonnet";
      const input = createInput();
      await expect(
        prepareOrchestratedGeneration(input, owner, false, Date.now() + 60000, s.deps)
      ).rejects.toMatchObject({
        failure: {
          code: "preparation_contract_incompatible",
          stage: "selection",
          retryable: false,
        },
      });
      expect(s.jevCalls.length).toBe(0);
      expect(s.generateCalls.length).toBe(0);
    });
  });
});
