import { describe, expect, it, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { compactComponentCard, createComponentDefinition } from "@shared/componentAssembly";
import { resolveDesignFamilyRepertoires } from "@shared/designRepertoire";
import { sealGenerationPlanningReceipt, type GenerationIntent, type ViableGenerationPlan } from "@shared/generationPlan";
import { executeProposalWorkflow, fitExistingProposalCopy, type ProposalExecutionInput, type ProposalGraphDeps } from "./proposalGraph";
import { editorialContextV9 } from "./editorialContextV9";
import { resolveReviewExecutionConfigV10 } from "./reviewExecutionConfigV10";
import { healthyReviewV10Fixture } from "./proposalReviewV10.fixture";
import { reviewPayloadV7 } from "./proposalReviewV7.fixture";
import { renderReviewFixtureScenes } from "./proposalReview.fixture";
import { resolveGenerationModelConfig } from "../generationModel";
import { editorialCatalogHash } from "@shared/editorialIntent";
import { GenerationCoordinator } from "./generationCoordinator";
import { recoverGenerationDelivery } from "./generationDeliveryRecovery";

const actor = "00000000-0000-4000-8000-000000000001";
const runId = "00000000-0000-4000-8000-000000000002";
const definition = completeDesignTestDefinitions()[0];
const response = (content: unknown): any => ({ choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }] });
const copy = (title: string, dirty = false) => ({
  caption: dirty ? "MUDOU LEGENDA" : "Legenda preservada", hashtags: dirty ? ["#alterou"] : ["#original"],
  slides: [{ values: [
    { fieldId: "field-0", value: title },
    { fieldId: "field-1", value: dirty ? "MUDOU CAMPO SAUDÁVEL" : "Apoio saudável" },
  ], mediaPrompts: [] }],
});

function scenario(options: { physical?: boolean; priorKeys?: string[]; failCorrection?: boolean; brokenCorrection?: boolean } = {}) {
  const generationConfig = resolveGenerationModelConfig({ generationModel: "gpt", postMode: "static" });
  const input: ProposalExecutionInput = {
    requestId: runId, runId, proposalId: "recovery-v10", slot: 0, selectedDefinition: definition,
    prompt: "Apresente o serviço", contextContent: "O serviço oferece um teste de sete dias.",
    platform: "instagram", postMode: "static", reviewPolicyVersion: 10,
    reviewExecutionConfig: resolveReviewExecutionConfigV10(generationConfig.model), generationConfig,
  };
  input.editorialContext = editorialContextV9(input);
  input.editorialContextHash = input.editorialContext.hash;
  const completed = new Map<string, unknown>();
  const generateText = vi.fn(async (params: Parameters<ProposalGraphDeps["generateText"]>[0]) => {
    if (params.taskRoute === "post_evaluation") {
      const review = healthyReviewV10Fixture(params), payload = reviewPayloadV7(params);
      const target = payload.textUnits.find((u: any) => u.fieldId === "field-0");
      if (target.text.includes("para sempre")) {
        const check = review.unitChecks.find(c => c.unitId === target.id)!;
        Object.assign(check, { verdict: "unsupported", editorialBasis: null, meaning: target.text, explanation: "Gratuidade permanente não é sustentada pelo material fornecido." });
      }
      return response(review);
    }
    if (params.traceLabel?.endsWith("_copy_recovery")) return response(copy("Gratuito para sempre", true));
    if (params.traceLabel?.endsWith("_editorial_recovery")) {
      if (options.failCorrection) throw new Error("simulated_provider_timeout");
      return response(copy(options.brokenCorrection ? "LONG Conheça o serviço" : "Conheça o serviço", true));
    }
    return response(copy(options.physical ? "LONG gratuito para sempre" : "Gratuito para sempre"));
  });
  const deps: ProposalGraphDeps = {
    actor, generateText, renderReviewScenes: vi.fn(renderReviewFixtureScenes),
    measureText: p => ({ height: p.text.includes("LONG") ? 5000 : 20, lines: [{ width: 100 }], runs: [{ fill: p.fill, fontSize: p.fontSize, fontStyle: p.fontStyle }] }),
    recoveryOperationKeys: async () => [
      ...(options.priorKeys ?? []),
      ...Array.from(completed.keys()).filter(key => key === "copy_recovery" || key.startsWith("review_correction:")),
    ],
    reviewOperations: async () => Array.from(completed).map(([operationKey, result]) => ({ operationKey, state: "completed", result })),
    executeOperation: async ({ operationKey }, work) => {
      if (completed.has(operationKey)) return completed.get(operationKey) as any;
      const result = await work();
      completed.set(operationKey, result);
      return result;
    },
  };
  return { input, deps, completed, generateText, run: () => executeProposalWorkflow(input, deps) };
}

describe("V10 bounded physical and editorial recovery", () => {
  const artIntent = (objective: string, designRequirements: Partial<NonNullable<GenerationIntent["designRequirements"]>>): GenerationIntent => ({
    version: 1, objective, adaptation: "controlled",
    tone: { description: "Direto", origin: "inferred", rationale: "Briefing" },
    requirements: [], content: [],
    designRequirements: { version: 1, requiresComparison: false, requiresTextCta: false, textCta: null,
      forbidsPhotography: false, requiredFacts: [], estimatedArtCharacters: 0, ...designRequirements },
  });
  const enableArtworkBrief = (input: ProposalExecutionInput) => {
    input.generationConfig = resolveGenerationModelConfig({ generationModel: "auto", postMode: input.postMode ?? "static" }, true, true, true);
    input.reviewExecutionConfig = resolveReviewExecutionConfigV10(input.generationConfig.model, input.generationConfig.taskRouting!.copy,
      { artworkBriefPolicyVersion: 1 });
    input.editorialContext = editorialContextV9(input);
    input.editorialContextHash = input.editorialContext.hash;
    const plan: ViableGenerationPlan = {
      slot: 0, status: "viable", candidateId: definition.id, reason: "Direção compatível", editorialApproach: input.prompt,
      captionContentIds: [], pages: (input.selectedDefinitions ?? [definition]).map((d, slideIndex) =>
        ({ slideIndex, componentId: d.id, purpose: input.prompt, rhythm: "reading", assignments: [] })),
    };
    input.narrativePlan = plan;
    return plan;
  };
  const reviewed = (slides: number) => response({ status: "reviewed", reviewedSlides: Array.from({ length: slides }, (_, index) => index), limitation: null, findings: [] });

  it("separates alternatives in the delivered native body, including a provider paragraph", async () => {
    const s = scenario();
    s.input.generationIntent = artIntent("Compare os planos", { requiresComparison: true,
      requiredFacts: [
        { contentId: "essential", text: "Essencial", comparisonGroup: 1, slideIndex: null, role: "label" },
        { contentId: "complete", text: "Completo", comparisonGroup: 2, slideIndex: null, role: "label" },
      ] });
    const plan = enableArtworkBrief(s.input);
    plan.pages[0].assignments = [{ contentIds: ["essential", "complete"], fieldId: "field-1",
      instruction: "Mantenha cada preço junto do plano.", itemCount: null }];
    s.generateText.mockImplementation(async params => {
      if (params.taskRoute === "post_evaluation") return reviewed(1);
      expect(params.messages[0].content).toContain("Separe as alternativas com \\n");
      expect(params.messages[1].content).toContain('"comparisonAlternatives":["Essencial","Completo"]');
      const draft = copy("Compare os planos");
      draft.slides[0].values[1].value = "Essencial: R$ 39/mês e 1 oficina. Completo: R$ 69/mês e 2 oficinas.";
      return response(draft);
    });
    const result = await s.run();
    expect(result.status, result.errorReason).toBe("ready");
    expect(result.bundle?.slides[0].composition.elements.find(e => e.id === "support")?.text)
      .toBe("Essencial: R$ 39/mês e 1 oficina.\nCompleto: R$ 69/mês e 2 oficinas.");
  });

  it.each([true, false])("checks the final artwork field independently of the caption (local CTA %s)", async localCta => {
    const s = scenario();
    const ctaDesign = createComponentDefinition({ ...definition, fragment: { ...definition.fragment,
      bindings: [definition.fragment.bindings[0], { ...definition.fragment.bindings[1], source: "block:callToAction:0:text" }],
    } });
    s.input.selectedDefinitions = [ctaDesign, ctaDesign];
    s.input.postMode = "carousel";
    const action = localCta ? "feche convidando a salvar o guia." : "feche convidando a salvar o guia e compartilhar.";
    s.input.generationIntent = artIntent("Ensine cerâmica em casa", { requiresTextCta: true });
    s.input.generationIntent.requirements.push({ id: "required-cta", requestQuote: action, description: action,
      kind: "content", origin: "explicit", surface: "art", itemCount: null });
    const plan = enableArtworkBrief(s.input);
    plan.pages[1].assignments = [{ contentIds: ["required-cta"], fieldId: "field-1", instruction: action, itemCount: null }];
    const draft = copy("Cerâmica em casa");
    draft.caption = "Salve o guia e compartilhe.";
    draft.slides[0].values[1].value = "Salve o guia e compartilhe";
    draft.slides.push(copy("A peça deve secar").slides[0]);
    draft.slides[1].values[1].value = "Arraste para o próximo passo";
    s.generateText.mockImplementation(async params => {
      if (params.taskRoute === "post_evaluation") return reviewed(2);
      expect(params.messages[1].content).toContain('"requiredOnArt":');
      return response(draft);
    });
    const result = await s.run();
    if (localCta) {
      expect(result.status, result.errorReason).toBe("ready");
      expect(result.bundle?.slides[1].composition.elements.find(e => e.id === "support")?.text).toBe("Salve o guia");
    } else {
      expect(result.failure?.code).toBe("content_requirement_unmet");
      expect(s.generateText.mock.calls.some(([params]) => params.taskRoute === "post_evaluation")).toBe(false);
    }
  });

  it("keeps a comparison reserve's fact groups from being mixed with unmapped text", async () => {
    const source = structuredClone(definition);
    const template = source.fragment.instances[1];
    source.fragment.instances.push({ ...template, id: "extra-price-label", y: template.y + template.height });
    source.fragment.bindings.push({
      ...source.fragment.bindings[1], id: "extra-price", source: "block:label:0:text",
      targetIds: ["extra-price-label"], required: false,
    });
    const original = copy("Compare os planos");
    original.slides[0].values.push({ fieldId: "field-2", value: "R$ 69" });
    const { input, deps } = scenario();
    const args = { copy: original, source: [createComponentDefinition(source)], target: [definition], input, deps, lastChance: true };
    const ordinary = await fitExistingProposalCopy(args);
    expect(ordinary?.slides[0].values[1].value).toContain("R$ 69");
    input.generationIntent = {
      version: 1, objective: "Comparar os planos", adaptation: "controlled",
      tone: { description: "Direto", origin: "inferred", rationale: "Comparação" },
      requirements: [], content: [],
      designRequirements: { version: 1, requiresComparison: true, requiresTextCta: false, textCta: null,
        forbidsPhotography: false, requiredFacts: [], estimatedArtCharacters: 0 },
    };
    expect(await fitExistingProposalCopy(args)).toBeUndefined();
  });
  it("keeps a fitted field and journals only the residual input for the second pass", async () => {
    const s = scenario({ priorKeys: ["previous_attempt:copy_recovery"] });
    const recoveryCopy = copy("LONG título");
    recoveryCopy.slides[0].values[1].value = "LONG apoio";
    Object.assign(s.input, {
      generationConfig: resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" }, true, true, true),
      recoveryCopy, finalFit: true, deliveryRecoveryEnabled: true,
    });
    s.deps.finalFitOperation = s.deps.executeOperation;
    s.generateText.mockImplementation(async params => {
      if (params.taskRoute === "post_evaluation") return response(healthyReviewV10Fixture(params));
      const { targets } = JSON.parse(String(params.messages[1].content));
      expect(targets[0].fit.boxes[0]).toHaveProperty("maxLines");
      if (params.traceLabel?.endsWith("_copy_final_fit_residual")) {
        expect(targets.map((target: {fieldId:string}) => target.fieldId)).toEqual(["field-1"]);
        expect(targets[0].current).toBe("LONG apoio");
        return response({ patches: [{ slideIndex: 0, fieldId: "field-1", itemIndex: null, value: "Sete dias" }] });
      }
      expect(targets.map((target: {fieldId:string}) => target.fieldId)).toEqual(["field-0", "field-1"]);
      return response({ patches: [
        { slideIndex: 0, fieldId: "field-0", itemIndex: null, value: "Conheça o serviço" },
        { slideIndex: 0, fieldId: "field-1", itemIndex: null, value: "LONG proposta de apoio" },
      ] });
    });
    for (let replay = 0; replay < 2; replay++) {
      const result = await s.run();
      expect(result.status, result.errorReason).toBe("ready");
      expect(JSON.stringify(result.bundle?.slides[0].composition.content)).toContain("Conheça o serviço");
      expect(JSON.stringify(result.bundle?.slides[0].composition.content)).toContain("Sete dias");
    }
    const fit = s.generateText.mock.calls.filter(([params]) => params.traceLabel?.includes("_copy_final_fit"));
    expect(fit).toHaveLength(2);
    expect(s.completed.has("copy_final_fit_residual")).toBe(true);
  });

  it.each(["fits", "still_long", "healthy", "uncertain", "historical", "literal", "not_terminal", "ordinary_fits"] as const)(
    "handles a terminal overflow with a bounded journaled repair (%s)", async mode => {
      const s = scenario({ priorKeys: mode === "ordinary_fits" ? [] : ["previous_attempt:copy_recovery"] });
      const config = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" }, true, mode !== "historical");
      Object.assign(s.input, { generationConfig: config, finalFit: mode !== "not_terminal", deliveryRecoveryEnabled: true,
        recoveryCopy: copy(mode === "healthy" ? "Conheça o serviço" : "LONG apresentação do serviço") });
      if (mode === "literal") s.input.generationIntent = { version: 1, objective: s.input.prompt, adaptation: "literal",
        tone: { description: "Direto", origin: "explicit", rationale: "Pedido" }, requirements: [], content: [] };
      s.deps.finalFitOperation = s.deps.executeOperation;
      s.deps.hasUncertainEffect = async () => mode === "uncertain";
      s.generateText.mockImplementation(async params => {
        if (params.taskRoute === "post_evaluation") return response(healthyReviewV10Fixture(params));
        const { targets } = JSON.parse(String(params.messages[1].content));
        expect(targets).toHaveLength(1);
        expect(targets[0]).toMatchObject({ slideIndex: 0, fieldId: "field-0" });
        return response({ patches: [{ slideIndex: 0, fieldId: "field-0", itemIndex: null,
          value: mode === "still_long" ? "LONG de novo" : "Conheça o serviço" }] });
      });
      const expectedReady = ["fits", "healthy", "ordinary_fits"].includes(mode);
      for (let replay = 0; replay < 2; replay++) {
        const result = await s.run();
        expect(result.status, result.errorReason).toBe(expectedReady ? "ready" : "failed");
        if (expectedReady) {
          expect(result.bundle?.caption).toBe("Legenda preservada");
          expect(JSON.stringify(result.bundle?.slides[0].composition.content)).toContain("Apoio saudável");
        }
      }
      const labels = s.generateText.mock.calls.map(([params]) => params.traceLabel ?? "");
      expect(labels.filter(label => label.endsWith("_copy_final_fit"))).toHaveLength(["fits", "still_long"].includes(mode) ? 1 : 0);
      expect(labels.filter(label => label.endsWith("_copy_recovery"))).toHaveLength(mode === "ordinary_fits" ? 1 : 0);
    }
  );
  it("rescues an exhausted slot on its last actual design, using the same copy and a single durable effect", async () => {
    const s = scenario();
    const generationConfig = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    const offer = resolveDesignFamilyRepertoires([compactComponentCard(definition)], { slideCount: 1, contentMode: "compose" })[0].defaultOffer;
    const plan: ViableGenerationPlan = { slot: 0, status: "viable", candidateId: offer.offerId, reason: "Direção compatível",
      editorialApproach: "Apresente o serviço", captionContentIds: [], pages: [{ slideIndex: 0, componentId: definition.id, purpose: "Apresentar", rhythm: "highlight", assignments: [] }] };
    const planning = sealGenerationPlanningReceipt({ version: 1, intent: { version: 1, objective: "Apresentar o serviço",
      tone: { description: "Direto", origin: "inferred", rationale: "Briefing" }, adaptation: "controlled", requirements: [], content: [] },
      slots: [plan, ...[1, 2].map(slot => ({ slot, status: "insufficient_fit" as const, reason: "Sem opção", unmetRequirementIds: [] }))],
      offers: [offer, null, null], candidates: [], selectorIds: [], ranking: [], catalogReceiptHash: null, recoveryRepertoires: [[], [], []], deliveryReserves: [[], [], []] });
    s.generateText.mockImplementation(async params => {
      if (params.taskRoute === "post_evaluation") return response(healthyReviewV10Fixture(params));
      if (params.traceLabel?.endsWith("_copy_final_fit")) return response({ patches: [{ slideIndex: 0, fieldId: "field-0", itemIndex: null, value: "Conheça o serviço" }] });
      return response(copy("LONG apresentação"));
    });
    const deliver = vi.fn(async () => {});
    const recoverDelivery = vi.fn(async () => null);
    const start = () => new GenerationCoordinator({ ...s.input, generationConfig, actor, planning,
      selectedDefinitions: [[definition], [], []] }, {
      ...s.deps, deliver, recoverDelivery, recoveryOperationKeys: async () => ["previous_attempt:copy_recovery"],
      operationForProposal: attemptId => ({operationKey}, work) => s.deps.executeOperation!({operationKey: attemptId + ":" + operationKey, stage: "test"}, work),
    }).start();
    for (let run = 0; run < 2; run++) expect((await start()).proposals[0].status).toBe("ready");
    expect(recoverDelivery).toHaveBeenCalledTimes(2);
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(s.generateText.mock.calls.filter(([p]) => p.traceLabel?.endsWith("_copy_final_fit"))).toHaveLength(1);
    expect(s.generateText.mock.calls.filter(([p]) => p.traceLabel?.endsWith("_copy"))).toHaveLength(1);
    expect(s.completed.has(`p-${runId}-0:copy_final_fit`)).toBe(true);
  });

  it.each(["transfer", "rewrite", "invalid-copy"] as const)("recovers a first delivery through %s", async mode => {
    const fits = mode === "transfer";
    const s = scenario();
    const base = completeDesignTestDefinitions()[1];
    const reserveDefinition = createComponentDefinition({ ...base, fragment: { ...base.fragment,
      instances: base.fragment.instances.map(instance => ({ ...instance, width: 940 })),
    } });
    const [first, reserve] = [definition, reserveDefinition].map(d => resolveDesignFamilyRepertoires([compactComponentCard(d)], { slideCount: 1, contentMode: "compose" })[0].defaultOffer);
    const planFor = (offer: typeof first): ViableGenerationPlan => ({ slot: 0, status: "viable", candidateId: offer.offerId,
      reason: "Direção compatível", editorialApproach: "Apresente o serviço", captionContentIds: [],
      pages: [{ slideIndex: 0, componentId: offer.slides[0].componentId, purpose: "Apresentar", rhythm: "highlight", assignments: [] }],
    });
    const planning = sealGenerationPlanningReceipt({ version: 1, proposalSelectionVersion: 1,
      intent: { version: 1, objective: "Apresentar o serviço", tone: { description: "Direto", origin: "inferred", rationale: "Apresentação" }, adaptation: "controlled", requirements: [], content: [] },
      slots: [planFor(first), ...[1, 2].map(slot => ({ slot, status: "insufficient_fit" as const, reason: "Sem outra proposta", unmetRequirementIds: [] }))],
      offers: [first, null, null], catalogReceiptHash: null, candidates: [], selectorIds: [], ranking: [], recoveryRepertoires: [[], [], []],
      deliveryReserves: [[{ family: reserve.family, plan: planFor(reserve), componentHashes: [reserveDefinition.hash] }], [], []],
    });
    const originalCopy = copy("LONG apresentação do serviço");
    s.deps.measureText = p => ({ height: p.text.includes("LONG") && (!fits || p.width <= 900) ? 5000 : 20,
      lines: [{ width: 100 }], runs: [{ fill: p.fill, fontSize: p.fontSize, fontStyle: p.fontStyle }],
    });
    s.generateText.mockImplementation(async params => {
      if (params.taskRoute === "post_evaluation") return response(healthyReviewV10Fixture(params));
      if (params.traceLabel?.endsWith("_copy_recovery")) return response(copy("Conheça o serviço", true));
      if (String(params.messages[1].content).includes("Adapte a redação a estas caixas")) return response(copy("Conheça o serviço"));
      if (mode === "invalid-copy") {
        expect(params.durableProposalCopyReceipt).toBe(true);
        if (String(params.messages[1].content).includes("Adapte a redação a estas caixas")) return response(copy("Conheça o serviço"));
        return { choices: [{ message: { content: "{invalid" }, finish_reason: "stop" }] } as any;
      }
      return response(originalCopy);
    });
    const { selectedDefinition, proposalId, slot, ...input } = s.input;
    const snapshot = await new GenerationCoordinator({ ...input, actor, selectedDefinitions: [[definition], [], []], planning }, {
      ...s.deps,
      operationForProposal: attempt => async ({ operationKey }, work) => {
        const key = `${attempt}:${operationKey}`;
        if (!s.completed.has(key)) s.completed.set(key, await work());
        return s.completed.get(key) as any;
      },
      recoverDelivery: (proposalInput, reuseOriginal, context) => recoverGenerationDelivery({
        ...context, planning, sourceDefinitions: context?.sourceDefinitions ?? [definition], input: proposalInput, reuseOriginal,
        readOriginalCopy: async () => originalCopy, graphDeps: s.deps,
        hydrate: async ids => [definition, reserveDefinition].filter(d => ids.includes(d.id)),
        operation: (_key, work) => work(),
      }),
    }).start();
    const delivered = snapshot.proposals[0];
    expect(delivered.status).toBe("ready");
    if (delivered.status !== "ready") return;
    expect(delivered.bundle.family).toBe(reserve.family);
    expect(delivered.bundle.caption).toBe(originalCopy.caption);
    const content = delivered.bundle.slides[0].composition.content;
    expect(content.schemaVersion === 3 && content.blocks[0]).toMatchObject({ text: fits ? "LONG apresentação do serviço" : "Conheça o serviço" });
    expect(s.generateText.mock.calls.filter(([params]) => params.traceLabel?.endsWith("_copy"))).toHaveLength(fits ? 1 : 2);
    expect(s.generateText.mock.calls.filter(([params]) => params.traceLabel?.endsWith("_copy_recovery"))).toHaveLength(0);
  });

  it.each([1, undefined] as const)("routes carousel detail through the caption with pinned policy %s", async policy => {
    const s = scenario();
    const definitions = completeDesignTestDefinitions().map((base, index) =>
      createComponentDefinition({
        ...base,
        completeDesign: { ...base.completeDesign!, family: "family-0" },
        fragment: index !== 1 ? base.fragment : {
          ...base.fragment,
          bindings: base.fragment.bindings.map(binding => binding.id !== "support" ? binding : {
            ...binding,
            kind: "list",
            source: "block:list:0:items",
            required: true,
            cardinality: { min: 1, max: 3 },
          }),
        },
      })
    );
    const caption = "Defina quem precisa decidir e qual critério vai orientar a conversa.";
    const artExample = "Exemplo: priorizar gargalos da triagem.";
    Object.assign(s.input, {
      selectedDefinitions: definitions,
      postMode: "carousel",
      prompt: "Mostre como preparar uma oficina. Dê um exemplo curto na lâmina de desenvolvimento.",
      carouselCaptionPolicy: policy,
      narrativePlan: {
        slot: 0,
        status: "viable",
        candidateId: definitions[0].id,
        reason: "A composição aceita um exemplo curto.",
        editorialApproach: "Uma ideia por lâmina.",
        captionContentIds: [],
        pages: definitions.map((d, slideIndex) => ({
          slideIndex,
          componentId: d.id,
          purpose: "Guiar a preparação.",
          rhythm: "reading",
          assignments: [{ fieldId: "field-1", contentIds: [], itemCount: slideIndex === 1 ? 1 : null, instruction: "Exemplo curto" }],
        })),
      },
    } satisfies Partial<ProposalExecutionInput>);
    s.input.editorialContext = editorialContextV9(s.input);
    s.input.editorialContextHash = s.input.editorialContext.hash;
    s.generateText.mockImplementation(async params => {
      if (params.taskRoute === "post_evaluation") {
        const payload = reviewPayloadV7(params);
        expect(payload.textUnits).toEqual(expect.arrayContaining([
          expect.objectContaining({ scope: "caption", text: caption }),
          expect.objectContaining({ scope: "art", text: artExample }),
        ]));
        return response(healthyReviewV10Fixture(params));
      }
      const system = params.messages[0].content;
      const user = params.messages[1].content;
      if (policy) {
        expect(system).toContain("Use o campo caption para aprofundar as etapas");
        expect(system).toContain("preserve na lâmina tudo que foi pedido para a arte");
        expect(user).toContain('"cardinality":{"min":1,"max":3},"plannedItemCount":1');
      } else {
        expect(system).not.toContain("Use o campo caption para aprofundar as etapas");
        expect(user).not.toContain('"plannedItemCount"');
      }
      return response({
        caption,
        hashtags: [],
        slides: ["Prepare uma oficina", "Defina o objetivo", "Salve para consultar"].map((value, index) => ({
          values: [{ fieldId: "field-0", value }, { fieldId: "field-1", value: index === 1 ? [artExample] : "" }],
          mediaPrompts: [],
        })),
      });
    });
    const result = await s.run();
    expect(result.status, result.errorReason).toBe("ready");
    expect(result.bundle?.caption).toBe(caption);
    expect(result.bundle?.slides[1].composition.content.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "list", items: [expect.objectContaining({ text: artExample })] }),
    ]));
    expect(s.generateText).toHaveBeenCalledTimes(2);
  });

  it("preserves the frozen partial interpretation through both repair prompts", async () => {
    const s = scenario({ physical: true });
    const document = { version: 1 as const, intents: [{ id: "apresentar_servico", label: "Apresentação", description: "Apresentar o serviço com contexto suficiente." }], designs: [] };
    s.input.editorialCatalog = { version: 1, catalogRevision: "4", revision: actor, hash: editorialCatalogHash(document), document };
    s.input.generationIntent = {
      version: 1, objective: s.input.prompt, adaptation: "controlled",
      tone: { description: "Claro", origin: "inferred", rationale: "Apresentação concisa" }, requirements: [],
      content: [{ id: "service", meaning: "Apresentar o serviço", requirementIds: [], sourceIds: [] }],
      editorial: { version: 1, signals: [{ intentId: "apresentar_servico", state: "requested", origin: "explicit", clarity: "clear", requestQuote: "Apresente o serviço", rationale: "Pedido direto" }] },
    };
    expect((await s.run()).status).toBe("ready");
    const repairs = s.generateText.mock.calls.map(([p]) => p).filter(p => /_(copy|editorial)_recovery$/.test(p.traceLabel ?? ""));
    expect(repairs).toHaveLength(2);
    for (const repair of repairs) {
      expect(JSON.stringify(repair.messages)).toContain("apresentar_servico");
      expect(JSON.stringify(repair.messages)).toContain(document.intents[0].description);
      expect(JSON.stringify(repair.messages)).toContain("ausência é neutra");
    }
  });
  it("repairs overflow then a material claim, preserving healthy fields and replaying without another purchase", async () => {
    const s = scenario({ physical: true });
    const first = await s.run();
    expect(first.status, first.errorReason).toBe("ready");
    expect(first.reviews?.map(r => r.status)).toEqual(["correction_required", "passed"]);
    expect(first.bundle?.caption).toBe("Legenda preservada");
    expect(first.bundle?.hashtags).toEqual(["#original"]);
    expect(first.bundle?.slides[0].composition.content.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "field-0", text: "Conheça o serviço" }),
      expect.objectContaining({ id: "field-1", text: "Apoio saudável" }),
    ]));
    expect(first.bundle?.slides[0].composition.pieces).toEqual(definition.pieces);
    const calls = s.generateText.mock.calls.map(([p]) => p);
    expect(calls).toHaveLength(5);
    const repairs = calls.filter(p => /_(copy|editorial)_recovery$/.test(p.traceLabel ?? ""));
    expect(repairs).toHaveLength(2);
    for (const call of repairs)
      expect(call).toMatchObject({ pinnedModel: "openai/gpt-6.1-sol", reasoningEffort: "medium", forceTextSchema: false, disableFallback: true });
    const replay = await s.run();
    expect(replay.status, replay.errorReason).toBe("ready");
    expect(s.generateText).toHaveBeenCalledTimes(5);
    expect(Array.from(s.completed.keys()).filter(k => k === "copy_recovery" || k.startsWith("review_correction:"))).toHaveLength(2);
  });

  it("rolls back a technically invalid correction and retains the original visual review", async () => {
    const s = scenario({ brokenCorrection: true });
    s.input.reviewLenientDelivery = true;
    const result = await s.run();
    expect(result.status, result.errorReason).toBe("ready");
    expect(result.findings).toEqual([]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "review_correction_rolled_back" }),
      expect.objectContaining({ code: "review_lenient_delivery", evidence: "correction_required" }),
    ]));
    expect(result.bundle?.slides[0].composition.content.blocks[0]).toMatchObject({ text: "Gratuito para sempre" });
    expect(s.generateText.mock.calls.filter(([params]) => params.taskRoute === "post_evaluation")).toHaveLength(1);
    const calls = s.generateText.mock.calls.length;
    expect((await s.run()).status).toBe("ready");
    expect(s.generateText).toHaveBeenCalledTimes(calls);
  });

  it.each([true, false])("preserves the first delivery after an initial repair and truncated recheck, priority=%s", async priority => {
    const s = scenario();
    s.input.firstDeliveryReviewRecovery = priority;
    const provider = s.generateText.getMockImplementation()!;
    s.generateText.mockImplementation(async params => {
      if (params.traceLabel === "proposal_review_initial") return response({});
      if (params.traceLabel === "proposal_review_recheck") {
        const truncated = response({});
        truncated.choices[0].finish_reason = "length";
        return truncated;
      }
      if (params.traceLabel === "proposal_review_evidence_repair_recheck") {
        expect(params.reasoningEffort).toBe("low");
        expect(JSON.stringify(params.messages)).not.toContain('"invalidResponse"');
      }
      return provider(params);
    });
    const result = await s.run();
    if (priority) {
      expect(result.status, result.errorReason).toBe("ready");
      expect(result.reviews?.map(review => review.status)).toEqual(["correction_required", "passed"]);
      expect(result.bundle?.slides[0].composition.content.blocks[0]).toMatchObject({ text: "Conheça o serviço" });
      expect(result.bundle?.caption).toBe("Legenda preservada");
      expect(Array.from(s.completed.keys()).filter(key => key.startsWith("review_evidence_repair:"))).toHaveLength(2);
      const calls = s.generateText.mock.calls.length;
      expect((await s.run()).status).toBe("ready");
      expect(s.generateText).toHaveBeenCalledTimes(calls);
    } else {
      expect(result.status).toBe("failed");
      expect(result.failure?.code).toBe("review_response_truncated");
    }
  });

  it("a physical repair on a previous template leaves the editorial budget available", async () => {
    const s = scenario({ priorKeys: ["previous_attempt:copy_recovery"] });
    const result = await s.run();
    expect(result.status, result.errorReason).toBe("ready");
    expect(s.generateText.mock.calls.some(([p]) => p.traceLabel?.endsWith("_editorial_recovery"))).toBe(true);
    expect(s.generateText.mock.calls.some(([p]) => p.traceLabel?.endsWith("_copy_recovery"))).toBe(false);
  });

  it("consumed or uncertain recovery keys prevent repeat purchases across fallback attempts", async () => {
    const physical = scenario({ physical: true, priorKeys: ["previous_attempt:copy_recovery"] });
    expect((await physical.run()).status).toBe("failed");
    expect(physical.generateText).toHaveBeenCalledTimes(1);
    const editorial = scenario({ priorKeys: ["previous_attempt:review_correction:older-artifact-hash"] });
    expect((await editorial.run()).status).toBe("failed");
    expect(editorial.generateText).toHaveBeenCalledTimes(2);
    expect(editorial.generateText.mock.calls.some(([p]) => /_(copy|editorial)_recovery$/.test(p.traceLabel ?? ""))).toBe(false);
  });

  it("records the active V10 policy on failures", async () => {
    const s = scenario({ failCorrection: true });
    const failed = await s.run();
    expect(failed.status).toBe("failed");
    const diagnostic = failed.diagnostics.find(d => d.target === "proposal" && d.code === failed.failure?.code);
    expect(JSON.parse(diagnostic!.evidence)).toMatchObject({ policyVersion: 10 });
  });

  it("does not repurchase an uncertain physical effect when replay reaches its journal key", async () => {
    const s = scenario({ physical: true, priorKeys: ["copy_recovery"] });
    const execute = s.deps.executeOperation!;
    s.deps.executeOperation = async (operation, work) => {
      if (operation.operationKey === "copy_recovery") throw new Error("uncertain_external_effect");
      return execute(operation, work);
    };
    expect((await s.run()).status).toBe("failed");
    expect(s.generateText).toHaveBeenCalledTimes(1);
  });
});
