import { describe, expect, it, vi } from "vitest";
import { compactComponentCard } from "@shared/componentAssembly";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { resolveDesignFamilyRepertoires } from "@shared/designRepertoire";
import { sealGenerationPlanningReceipt, type ViableGenerationPlan } from "@shared/generationPlan";
import { GenerationCoordinator } from "./generationCoordinator";
import { executeProposalWorkflow } from "./proposalGraph";

vi.mock("./proposalGraph", () => ({ executeProposalWorkflow: vi.fn() }));

describe("coordinator planning provenance", () => {
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
});
