import { beforeEach, describe, expect, it, vi } from "vitest";
import { compactComponentCard } from "@shared/componentAssembly";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { resolveDesignFamilyRepertoires } from "@shared/designRepertoire";
import { sealGenerationPlanningReceipt, type ViableGenerationPlan } from "@shared/generationPlan";
import { arsenalHash } from "@shared/arsenalContent";
import { resolveGenerationModelConfig } from "../generationModel";
import { resolveReviewExecutionConfigV10, assertReviewExecutionConfigV10 } from "./reviewExecutionConfigV10";
import { GenerationCoordinator } from "./generationCoordinator";
import { executeProposalWorkflow } from "./proposalGraph";

vi.mock("./proposalGraph", () => ({ executeProposalWorkflow: vi.fn() }));

describe("coordinator planning provenance", () => {
  beforeEach(() => vi.resetAllMocks());

  it("passes the replacement plan's reason and approach to the workflow after a family change", async () => {
    const definitions = completeDesignTestDefinitions();
    const repertoires = resolveDesignFamilyRepertoires(definitions.map(compactComponentCard), { slideCount: 1, contentMode: "compose" });
    const offer = repertoires[0].defaultOffer;
    const initial: ViableGenerationPlan = {
      slot: 0, status: "viable", candidateId: offer.offerId,
      reason: "A composição inicial privilegia uma abertura curta.", editorialApproach: "Abordagem inicial",
      captionContentIds: [], pages: [{ slideIndex: 0, componentId: offer.slides[0].componentId, purpose: "Explicar", rhythm: "highlight", assignments: [{ fieldId: "field-0", contentIds: ["idea"], itemCount: null, instruction: "Apresente a ideia." }] }],
    };
    const alternative = repertoires.find(r => r.family !== repertoires[0].family)!;
    const replacement: ViableGenerationPlan = { ...initial, candidateId: alternative.defaultOffer.offerId, reason: "A família alternativa acomoda a explicação em outra distribuição.", editorialApproach: "Abordagem da família alternativa", pages: [{ ...initial.pages[0], componentId: alternative.defaultOffer.slides[0].componentId }] };
    const replacementDefinitions = alternative.defaultOffer.slides.map(s => definitions.find(d => d.id === s.componentId)!);
    const planning = sealGenerationPlanningReceipt({
      version: 1,
      intent: { version: 1, objective: "Explicar", tone: { description: "Claro", origin: "inferred", rationale: "Informação útil" }, adaptation: "controlled", requirements: [], content: [{ id: "idea", meaning: "Uma ideia", requirementIds: [], sourceIds: [] }] },
      slots: [initial, { slot: 1, status: "insufficient_fit", reason: "Sem opção", unmetRequirementIds: [] }, { slot: 2, status: "insufficient_fit", reason: "Sem opção", unmetRequirementIds: [] }],
      offers: [offer, null, null], catalogReceiptHash: null, candidates: [], selectorIds: [], ranking: [], recoveryRepertoires: [[alternative], [], []],
    });
    const workflow = vi.mocked(executeProposalWorkflow);
    workflow.mockImplementation(async input => ({
      contractVersion: 1, proposalId: input.proposalId, runId: input.runId, slot: input.slot,
      status: "failed", revision: 1, findings: [], diagnostics: [],
      failure: { code: workflow.mock.calls.length === 1 ? "artwork_unusable" : "provider_unavailable", stage: "copy", retryable: false },
    }));
    const replan = vi.fn(async () => ({ definitions: replacementDefinitions, plan: replacement }));
    const owner = "00000000-0000-4000-8000-000000000001";
    const coordinator = new GenerationCoordinator({
      requestId: owner, runId: owner, actor: owner, prompt: "Uma ideia", reviewPolicyVersion: 10,
      selectedDefinitions: [offer.slides.map(s => definitions.find(d => d.id === s.componentId)!), [], []],
      planning, selectionReasons: [initial.reason], editorialApproaches: [initial.editorialApproach],
    }, { actor: owner, generateText: vi.fn(), replan });
    await coordinator.start();
    expect(replan).toHaveBeenCalledTimes(1);
    expect(workflow).toHaveBeenCalledTimes(2);
    expect(workflow.mock.calls[1][0]).toMatchObject({
      selectedDefinitions: replacementDefinitions, narrativePlan: replacement,
      selectionReason: replacement.reason, editorialApproach: replacement.editorialApproach,
    });
  });

  it("reserves a shared replacement before concurrent sibling recoveries can use it twice", async () => {
    const definitions = completeDesignTestDefinitions();
    const repertoires = resolveDesignFamilyRepertoires(definitions.map(compactComponentCard), { slideCount: 1, contentMode: "compose" });
    const [first, second, spare] = Array.from(new Map(repertoires.map(r => [r.family, r])).values());
    const planFor = (slot: number, r: typeof spare): ViableGenerationPlan => ({
      slot, status: "viable", candidateId: r.defaultOffer.offerId,
      reason: "Composição compatível", editorialApproach: "Explicar uma ideia", captionContentIds: [],
      pages: [{ slideIndex: 0, componentId: r.defaultOffer.slides[0].componentId, purpose: "Explicar", rhythm: "highlight",
        assignments: [{ fieldId: "field-0", contentIds: ["idea"], itemCount: null, instruction: "Apresente a ideia." }] }],
    });
    const defsFor = (r: typeof spare) => r.defaultOffer.slides.map(s => definitions.find(d => d.id === s.componentId)!);
    const planning = sealGenerationPlanningReceipt({
      version: 1, proposalSelectionVersion: 1,
      intent: { version: 1, objective: "Explicar", tone: { description: "Claro", origin: "inferred", rationale: "Informação útil" }, adaptation: "controlled", requirements: [], content: [{ id: "idea", meaning: "Uma ideia", requirementIds: [], sourceIds: [] }] },
      slots: [planFor(0, first), planFor(1, second), { slot: 2, status: "insufficient_fit", reason: "Sem opção", unmetRequirementIds: [] }],
      offers: [first.defaultOffer, second.defaultOffer, null], catalogReceiptHash: null, candidates: [], selectorIds: [], ranking: [],
      recoveryRepertoires: [[spare], [spare], []],
    });
    const workflow = vi.mocked(executeProposalWorkflow);
    workflow.mockImplementation(async input => ({
      contractVersion: 1, proposalId: input.proposalId, runId: input.runId, slot: input.slot,
      status: "failed", revision: 1, findings: [], diagnostics: [],
      failure: { code: "artwork_unusable", stage: "copy", retryable: false },
    }));
    const replan = vi.fn(async (slot: number) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return { definitions: defsFor(spare), plan: planFor(slot, spare) };
    });
    const owner = "00000000-0000-4000-8000-000000000001";
    const coordinator = new GenerationCoordinator({ requestId: owner, runId: owner, actor: owner,
      prompt: "Uma ideia", reviewPolicyVersion: 10, selectedDefinitions: [defsFor(first), defsFor(second), []], planning,
    }, { actor: owner, generateText: vi.fn(), replan });
    await coordinator.start();
    expect(replan).toHaveBeenCalledTimes(1);
    expect(workflow.mock.calls.map(([input]) => input.selectedDefinitions?.[0].completeDesign?.family).sort())
      .toEqual([first.family, second.family, spare.family].sort());
  });
});


describe("visual repair before design recovery", () => {
  beforeEach(() => vi.resetAllMocks());
  it.each(["visual", "historical", "manual"] as const)("preserves the shared recovery budget and attempt limit in %s mode", async mode => {
    const definitions = completeDesignTestDefinitions();
    const offer = resolveDesignFamilyRepertoires(definitions.map(compactComponentCard), { slideCount: 1, contentMode: "compose" })[0].defaultOffer;
    const selected = offer.slides.map(slide => definitions.find(def => def.id === slide.componentId)!);
    const plan: ViableGenerationPlan = { slot: 0, status: "viable", candidateId: offer.offerId, reason: "Composição selecionada", editorialApproach: "Explicar", captionContentIds: [], pages: [{ slideIndex: 0, componentId: selected[0].id, purpose: "Explicar", rhythm: "highlight", assignments: [{ fieldId: "field-0", contentIds: [], itemCount: null, instruction: "Apresentar" }] }] };
    const planning = sealGenerationPlanningReceipt({ version: 1, intent: { version: 1, objective: "Explicar", tone: { description: "Claro", origin: "inferred", rationale: "Pedido" }, adaptation: "controlled", requirements: [], content: [] },
      slots: [plan, { slot: 1, status: "insufficient_fit", reason: "Sem opção", unmetRequirementIds: [] }, { slot: 2, status: "insufficient_fit", reason: "Sem opção", unmetRequirementIds: [] }], offers: [offer, null, null], catalogReceiptHash: null, candidates: [], selectorIds: [], ranking: [], recoveryRepertoires: [[], [], []], deliveryReserves: [[], [], []] });
    const generation = resolveGenerationModelConfig({ generationModel: mode === "manual" ? "gemini" : "auto", postMode: "static" });
    const { configurationHash: _, ...data } = resolveReviewExecutionConfigV10(generation.model, generation.taskRouting?.copy);
    if (mode === "historical") delete data.visualTextRepairVersion;
    const reviewExecutionConfig = assertReviewExecutionConfigV10({ ...data, configurationHash: arsenalHash(data) });
    const recoveryKeys = vi.fn(async (_proposalId: string, attemptId?: string) => attemptId?.endsWith("-fb1") ? ["previous_attempt:copy_recovery"] : []);
    const observedBudgets: string[][] = [];
    const workflow = vi.mocked(executeProposalWorkflow);
    workflow.mockImplementation(async (input, deps) => {
      observedBudgets.push(await deps.recoveryOperationKeys!());
      return { contractVersion: 1, proposalId: input.proposalId, runId: input.runId, slot: input.slot, status: "failed", revision: 1, findings: [], diagnostics: [], failure: { code: "artwork_unusable", stage: "copy", retryable: false } };
    });
    const recoveryCopy = { caption: "Mesmo candidato", hashtags: [], slides: [{ values: [{ fieldId: "field-0", value: "Café artesanal" }], mediaPrompts: [] }] };
    const recoverDelivery = vi.fn(async () => ({ definitions: selected, plan, recoveryCopy, rewriteForRecovery: false }));
    const owner = "00000000-0000-4000-8000-000000000001";
    const coordinator = new GenerationCoordinator({ requestId: owner, runId: owner, actor: owner, prompt: "Uma ideia", reviewPolicyVersion: 10, reviewExecutionConfig, selectedDefinitions: [selected, [], []], planning }, { actor: owner, generateText: vi.fn(), recoverDelivery, recoveryOperationKeys: recoveryKeys });
    const result = await coordinator.start();
    expect(workflow).toHaveBeenCalledTimes(2); expect(recoverDelivery).toHaveBeenCalledTimes(1);
    expect(workflow.mock.calls[0][0].deferCopyRepair).toBe(mode !== "visual");
    expect(workflow.mock.calls[1][0]).toMatchObject({ deferCopyRepair: false, recoveryCopy });
    expect(recoverDelivery.mock.calls[0][1]).toBe(true);
    expect(observedBudgets).toEqual([[], ["previous_attempt:copy_recovery"]]);
    expect(recoveryKeys).toHaveBeenNthCalledWith(2, `p-${owner}-0`, `p-${owner}-0-fb1`);
    expect(result.proposals[0]).toMatchObject({ status: "failed", attempt: { index: 1 } });
  });
});
