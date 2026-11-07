import { describe, expect, it, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { compactComponentCard, createComponentDefinition } from "@shared/componentAssembly";
import { resolveDesignFamilyRepertoires } from "@shared/designRepertoire";
import { sealGenerationPlanningReceipt, type ViableGenerationPlan } from "@shared/generationPlan";
import { executeProposalWorkflow, type ProposalExecutionInput, type ProposalGraphDeps } from "./proposalGraph";
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

function scenario(options: { physical?: boolean; priorKeys?: string[]; failCorrection?: boolean } = {}) {
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
      return response(copy("Conheça o serviço", true));
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
      recoverDelivery: (proposalInput, reuseOriginal) => recoverGenerationDelivery({
        planning, sourceDefinitions: [definition], input: proposalInput, reuseOriginal,
        readOriginalCopy: async () => originalCopy, graphDeps: s.deps,
        hydrate: async ids => [definition, reserveDefinition].filter(d => ids.includes(d.id)),
        operation: (_key, work) => work(),
      }),
    }).start();
    const delivered = snapshot.proposals[0];
    expect(delivered.status).toBe("ready");
    if (delivered.status !== "ready") return;
    expect(delivered.bundle.family).toBe(mode === "rewrite" ? first.family : reserve.family);
    expect(delivered.bundle.caption).toBe(originalCopy.caption);
    const content = delivered.bundle.slides[0].composition.content;
    expect(content.schemaVersion === 3 && content.blocks[0]).toMatchObject({ text: fits ? "LONG apresentação do serviço" : "Conheça o serviço" });
    expect(s.generateText.mock.calls.filter(([params]) => params.traceLabel?.endsWith("_copy"))).toHaveLength(mode === "invalid-copy" ? 2 : 1);
    expect(s.generateText.mock.calls.filter(([params]) => params.traceLabel?.endsWith("_copy_recovery"))).toHaveLength(mode === "rewrite" ? 1 : 0);
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
