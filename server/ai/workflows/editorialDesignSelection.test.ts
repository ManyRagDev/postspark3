import { describe, expect, it, vi } from "vitest";
import { assemblyIdentity, compactComponentCard, createComponentDefinition } from "@shared/componentAssembly";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { materializeDesignFamilyOffer, resolveDesignFamilyRepertoires } from "@shared/designRepertoire";
import { validateGenerationPlan, type GenerationIntent } from "@shared/generationPlan";
import { editorialAssessmentSchema, recoverEditorialAssessments, selectEditorialDesigns } from "./editorialDesignSelection";
import type { HeuristicPlanBuilderInput } from "./heuristicPlanBuilder";

const brief = "Compare Essencial por R$ 39 e Completo por R$ 69. Encerre com ‘Escolha seu plano’.";
const intent: GenerationIntent = {
  version: 1,
  objective: "Comparar os planos do clube",
  adaptation: "controlled",
  tone: { origin: "inferred", description: "Próximo", rationale: "Clube de jardinagem" },
  requirements: [{ id: "prices", kind: "content", description: "Mostrar os dois preços", origin: "explicit", surface: "art", requestQuote: "Compare Essencial por R$ 39 e Completo por R$ 69.", itemCount: null }],
  content: [{ id: "offer", meaning: "Essencial por R$ 39, Completo por R$ 69", requirementIds: ["prices"], sourceIds: [] }],
};

const names = ["Versus", "Dual Split", "Art Nouveau", "Thermal Receipt", "Fraco"];
const base = completeDesignTestDefinitions()[0];
const eligible = resolveDesignFamilyRepertoires(names.map(label => compactComponentCard(createComponentDefinition({
  ...base,
  label,
  id: assemblyIdentity(["editorial-design-selection-test", label]),
  completeDesign: { ...base.completeDesign!, family: label },
}))), { slideCount: 1, contentMode: "compose" });

const planInput: HeuristicPlanBuilderInput = {
  intent,
  eligible,
  imageObligation: { policy: "optional", purpose: "none", required: false, reason: "Sem exigência de mídia", slotTargets: 0 },
  slideCount: 1,
  shortlist: { cards: [], evaluated: [], batches: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
};

type Request = Parameters<typeof selectEditorialDesigns>[0];
type Evaluate = NonNullable<Request["evaluate"]>;

function candidate(id: number, fit: number, reading: string) {
  return {
    id, fit, reading, readerPriority: `Perceber primeiro ${reading}.`, rationale: `A composição organiza ${reading}.`,
    cues: [{ fieldId: "field-0", instruction: `Apresente ${reading} no título.` }],
  };
}

describe("editorial Studio selection", () => {
  it("accepts six distinct field cues from one assessment", () => {
    const evaluation = {
      ...candidate(1, 3, "comparação"),
      cues: Array.from({ length: 6 }, (_, index) => ({
        fieldId: `field-${index}`, instruction: "Preserve o conteúdo associado ao campo.",
      })),
    };
    expect(editorialAssessmentSchema.parse({ candidates: [evaluation] }).candidates).toEqual([evaluation]);
  });

  it("keeps accepted instructions when Haiku overflows a candidate budget", () => {
    const valid = candidate(2, 3, "benefícios");
    const long = {
      ...candidate(1, 3, "comparação"),
      rationale: "Os dois lados mantêm os fatos associados aos planos. ".repeat(6).trim(),
      cues: Array.from({ length: 9 }, (_, index) => ({
        fieldId: `field-${index}`, instruction: "Preserve o conteúdo associado ao campo.",
      })),
    };
    const receipt = { candidates: [long, { ...candidate(3, 4, "consulta"), fit: -1 }, valid] };
    expect(editorialAssessmentSchema.safeParse(receipt).success).toBe(false);
    const recovered = recoverEditorialAssessments(receipt);
    expect(recovered?.candidates.map(value => value.id)).toEqual([1, 2]);
    expect(recovered?.candidates[0].rationale).toMatch(/…$/);
    expect(recovered?.candidates[0].rationale.length).toBeLessThanOrEqual(220);
    expect(recovered?.candidates[0].cues).toEqual(long.cues.slice(0, 8));
    expect(recovered?.candidates[1]).toEqual(valid);
    expect(editorialAssessmentSchema.safeParse(recovered).success).toBe(true);
  });

  it("grounds a single assessment in the full viable pool and selects the complementary set before writing", async () => {
    const choices: Record<string, [number, string]> = {
      "Versus": [4, "comparação"], "Dual Split": [3.9, "comparação"], "Art Nouveau": [3, "convite"],
      "Thermal Receipt": [2.8, "preços"], "Fraco": [.5, "impróprio"],
    };
    const evaluate = vi.fn<Evaluate>(async messages => {
      const supplied = JSON.parse(String(messages[1].content)) as {
        brief: string;
        candidates: Array<{ id: number; design: string; fields: unknown[][] }>;
      };
      expect(supplied.brief).toBe(brief);
      expect(supplied.candidates.map(profile => profile.design)).toEqual(expect.arrayContaining(names));
      expect(supplied.candidates[0].fields[0]).toEqual(expect.arrayContaining(["field-0", "headline"]));
      return { candidates: supplied.candidates.map(profile => candidate(profile.id, ...choices[profile.design])) };
    });
    const result = await selectEditorialDesigns({ planInput, brief, evaluate, deadlineMs: Date.now() + 1_000 });
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ source: "model", evaluated: 5 });
    expect(result.slots).toHaveLength(3);
    expect(result.slots.map(slot => slot.status === "viable" ? eligible.find(item => item.defaultOffer.offerId === slot.candidateId)?.family : slot.status))
      .toEqual(expect.arrayContaining(["Versus", "Art Nouveau", "Thermal Receipt"]));
    for (const slot of result.slots) {
      if (slot.status !== "viable") throw new Error("missing plan");
      const repertoire = eligible.find(item => item.defaultOffer.offerId === slot.candidateId)!;
      const offer = materializeDesignFamilyOffer(repertoire, slot.pages.map(page => page.componentId));
      expect(validateGenerationPlan(slot, offer, intent)).toEqual([]);
      expect(slot.pages[0].assignments[0].instruction).toMatch(/^Apresente /);
    }
    for (const [slot, reserves] of result.reserves.entries()) {
      expect(reserves[0].family).toBe("Dual Split");
      expect(reserves.every(reserve => reserve.plan.slot === slot && reserve.plan.editorialDesign?.readerPriority)).toBe(true);
    }
  });

  it("keeps local choices and three viable slots when no provider cues match native fields", async () => {
    const evaluate: Evaluate = async () => ({ candidates: [
      { ...candidate(1, 4, "inválido"), cues: [{ fieldId: "field-99", instruction: "Campo inexistente." }] },
      candidate(999, 4, "ausente"),
    ] });
    const result = await selectEditorialDesigns({ planInput, brief, evaluate, deadlineMs: Date.now() + 1_000 });
    expect(result).toMatchObject({ source: "layout", evaluated: 0 });
    expect(result.slots.every(slot => slot.status === "viable")).toBe(true);
    expect(result.reserves.every(slot => slot.length === 4)).toBe(true);
  });

  it("gives a technically viable unassessed family priority over a weak assessment", async () => {
    const evaluate: Evaluate = async messages => ({ candidates: JSON.parse(String(messages[1].content)).candidates
      .filter((profile: { design: string }) => profile.design !== "Thermal Receipt")
      .map((profile: { id: number; design: string }) => candidate(profile.id, ["Versus", "Art Nouveau"].includes(profile.design) ? 4 : .5, profile.design)) });
    const result = await selectEditorialDesigns({ planInput, brief, evaluate, deadlineMs: Date.now() + 1_000 });
    expect(result.slots.map(slot => slot.status === "viable" ? eligible.find(item => item.defaultOffer.offerId === slot.candidateId)?.family : slot.status))
      .toEqual(expect.arrayContaining(["Versus", "Art Nouveau", "Thermal Receipt"]));
  });
});
