import { describe, expect, it } from "vitest";
import { assemblyIdentity, compactComponentCard } from "@shared/componentAssembly";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { projectStructuralGenerationIntent } from "@shared/compactGenerationIntent";
import { resolveDesignFamilyRepertoires } from "@shared/designRepertoire";
import { structuralIntentFixture } from "../ai/workflows/generationIntent.fixture";
import { selectEditorialDesigns } from "../ai/workflows/editorialDesignSelection";
import { buildHeuristicGenerationPlan } from "../ai/workflows/heuristicPlanBuilder";
import { checkPageCapacity } from "./designCapacity";
import { filterRepertoiresByCapacity } from "./familyRetrieval";

describe("requirements before family scoring", () => {
  const reading = structuralIntentFixture({
    objective: "Comparar os planos.", tone: "Direto", semanticQuery: "planos em colunas",
    ideas: [{ meaning: "Planos de jardinagem", sourceIds: [] }],
  });
  const intent = projectStructuralGenerationIntent(reading, {
    request: "Compare os planos. Essencial: R$ 39 por mês e 1 oficina mensal. Completo: R$ 69 por mês, 2 oficinas mensais e kit de sementes. Encerre com “Escolha seu plano”. Funcione sem fotografia.",
    slideCount: 1, adaptation: "controlled", factualSourceIds: new Set(),
  });
  const cards = completeDesignTestDefinitions().map(compactComponentCard);
  const addField = (card: typeof cards[number], source: string, width: number, authoredChars?: number) => {
    card.fields.push({ source, kind: "text", required: false, cardinality: null });
    card.capacity.textRegions.push({ source, width, height: 56, fontSize: 26, minFontSize: 20, minWords: 1 });
    if (authoredChars !== undefined) card.mechanics!.fields.push({
      source, label: source, distribution: "continuous",
      targets: [{ id: source, label: source, fontSize: 26, emphasis: [], charsEstimate: authoredChars }],
    });
  };
  const cta = "block:callToAction:0:text";
  const rightBody = "block:body:1:text";
  addField(cards[0], cta, 240, 1);
  addField(cards[0], rightBody, 400);
  addField(cards[1], cta, 240);
  addField(cards[2], cta, 240);
  addField(cards[2], rightBody, 400);

  it("keeps a capable single body and rejects one-glyph CTAs before producing family candidates", () => {
    const repertoires = resolveDesignFamilyRepertoires(cards, { slideCount: 1, contentMode: "compose" });
    const { eligible, rejected } = filterRepertoiresByCapacity(repertoires, intent);
    expect(new Set(eligible.map(r => r.sourceId))).toEqual(new Set([cards[1].id, cards[2].id]));
    expect(rejected).toEqual([expect.objectContaining({ sourceId: cards[0].id, reasons: ["text_cta_capacity"] })]);
    const editorial = checkPageCapacity(cards[1], intent, 0, 1);
    expect(editorial.comparisonLayout).toBe(false);
    expect(Array.from(editorial.assignments.values())).toEqual(expect.arrayContaining([
      expect.objectContaining({
        contentIds: ["required-fact-1", "required-fact-2", "required-fact-3", "required-fact-4"],
        instruction: expect.stringContaining("Essencial: R$ 39/mês e 1 oficina mensal | Completo: R$ 69/mês"),
      }),
    ]));
    const match = checkPageCapacity(cards[2], intent, 0, 1);
    expect(match.comparisonLayout).toBe(true);
    expect(Array.from(match.assignments.values()).some(assignment => assignment.instruction.includes("Escolha seu plano"))).toBe(true);
    expect(Array.from(match.assignments.values()).some(assignment => assignment.instruction.includes("kit de sementes"))).toBe(true);
  });
  it("rejects photography and a layout without room for the grouped facts", () => {
    const card = structuredClone(cards[2]);
    card.mediaSlots.push({ id: "photo", label: "Foto", function: "", prompt: "", deferred: true, policy: "cover" });
    for (const body of card.capacity.textRegions.filter(region => region.source.startsWith("block:body:"))) body.width = 42;
    for (const field of card.mechanics!.fields.filter(field => field.source.startsWith("block:body:"))) {
      for (const target of field.targets) target.charsEstimate = 4;
    }
    expect(checkPageCapacity(card, intent, 0, 1).issues).toEqual(["photography_forbidden", "comparison_fact_capacity"]);
  });

  it("prioritizes the paired design in slot zero and fills the other slots with distinct families", async () => {
    const extra = structuredClone(cards[1]);
    extra.id = assemblyIdentity(["comparison-alternate", extra.id]);
    extra.completeDesign!.family = "editorial-alternativo";
    const eligible = resolveDesignFamilyRepertoires([cards[1], cards[2], extra], { slideCount: 1, contentMode: "compose" });
    const paired = eligible.find(item => item.sourceId === cards[2].id)!;
    const planInput = {
      intent, eligible, slideCount: 1,
      imageObligation: { policy: "forbidden" as const, purpose: "none" as const, required: false, reason: "Sem mídia", slotTargets: 0 },
      shortlist: { cards: [], evaluated: [], batches: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
    };
    const editorial = await selectEditorialDesigns({ planInput, brief: intent.objective, deadlineMs: Date.now() + 1_000 });
    const ordinary = buildHeuristicGenerationPlan({ ...planInput, familyFirst: true, neutrality: {
      version: 1, seed: "comparison-slots", proposalSelectionVersion: 1, deliveryRecoveryVersion: 3,
    } });
    for (const result of [editorial, ordinary]) {
      expect(result.slots[0]).toMatchObject({ status: "viable", candidateId: paired.defaultOffer.offerId });
      expect(result.slots.every(slot => slot.status === "viable")).toBe(true);
      expect(new Set(result.slots.map(slot => slot.status === "viable" && slot.candidateId)).size).toBe(3);
    }
  });
});
