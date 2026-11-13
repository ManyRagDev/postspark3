import { describe, expect, it } from "vitest";
import { compactComponentCard, textFragmentCount } from "./componentAssembly";
import { completeDesignTestDefinitions } from "./completeDesignGeneration.fixture";
import { resolveDesignFamilyRepertoires } from "./designRepertoire";
import { buildFamilySelectionCandidates, familyAssessmentProfile } from "./designFamilySelection";
import { projectCapabilityGenerationIntent } from "./compactGenerationIntent";
import { generationIntentLegacySchema, generationIntentSchema, materialGenerationIntent, validateGenerationIntent } from "./generationPlan";
import { selectionPolicyForNewRequest } from "./selectionPolicy";

const reading = {
  version: 1 as const, objective: "Explicar três opções", tone: { description: "Direto", origin: "inferred" as const, rationale: "Leitura do pedido" },
  adaptation: "controlled" as const, semanticQuery: "comparação de opções",
  requirements: [
    { id: "content", description: "Uma comparação na arte", kind: "content" as const, surface: "art" as const,
      origin: "explicit" as const, source: "declared" as const, strength: "required" as const, requestQuote: "Compare na arte", itemCount: null },
    { id: "style", description: "Preferência por azul", kind: "execution" as const, surface: "art" as const,
      origin: "explicit" as const, source: "declared" as const, strength: "preference" as const, requestQuote: "Prefiro azul", itemCount: null },
  ],
  content: [{id: "comparison", meaning: "Comparar opções", requirementIds: ["content"], sourceIds: []}],
};

describe("capability_v1 persisted selection contract", () => {
  it("retains declared evidence and strength without promoting preferences to vetoes", () => {
    const intent = projectCapabilityGenerationIntent(reading, {slideCount: 3, aspectRatio: "4:5"});
    expect(intent.requirements[0]).toMatchObject({source: "declared", strength: "required", origin: "explicit"});
    expect(intent.requirements[1]).toMatchObject({source: "declared", strength: "preference", origin: "inferred", requestQuote: "Prefiro azul"});
    expect(intent.requirements[2]).toMatchObject({source: "physical", strength: "required"});
    expect(validateGenerationIntent(intent, "Compare na arte. Prefiro azul.", new Set())).toEqual([]);
    expect(materialGenerationIntent(intent)?.requirements.map(r => r.id)).toEqual(["content"]);
    expect(generationIntentSchema.parse(intent)).toEqual(intent);
    expect(validateGenerationIntent(intent, "Outro pedido", new Set())).toContain("unattributed_requirement:content");
    expect(validateGenerationIntent(intent, "Outro pedido", new Set())).toContain("unattributed_requirement:style");
  });

  it("does not change the historical provider schema or force upgrades on old records", () => {
    const legacy = {...reading, requirements: [], semanticQuery: undefined};
    const {semanticQuery: _query, ...body} = legacy;
    expect(generationIntentLegacySchema.parse(body)).toEqual(body);
    expect(selectionPolicyForNewRequest(undefined)).toBe("legacy");
    expect(selectionPolicyForNewRequest("capability_v1")).toBe("capability_v1");
    expect(() => selectionPolicyForNewRequest("unknown")).toThrow();
    expect(textFragmentCount({minWords: 3})).toBe(3);
    expect(textFragmentCount({minWords: 1, fragmentCount: 4})).toBe(4);
  });

  it("preserves correlated root capacities and source hashes in compact assessment", () => {
    const cards = completeDesignTestDefinitions().map(compactComponentCard);
    const repertoires = resolveDesignFamilyRepertoires(cards, {slideCount: 1, contentMode: "compose"});
    const legacy = buildFamilySelectionCandidates(repertoires, null, true, true);
    const policy = buildFamilySelectionCandidates(repertoires, null, true, true, "capability_v1");
    for (const family of policy) {
      const compact = familyAssessmentProfile(family.profile) as any;
      expect(compact.structure.capacityRule).toBe("ranges_across_root_designs_not_additive");
      expect(compact.availability.roles).toEqual(["static"]);
      for (const root of compact.rootCapabilities) {
        const card = cards.find(c => c.id === root.sourceId)!;
        expect(root.sourceHash).toBe(card.hash);
        expect(root.mediaSlots).toBe(card.mediaSlots.length);
        expect(root.textBlocks).toBe(new Set(card.fields.filter(f => f.kind === "text").map(f => f.source)).size);
      }
    }
    expect(familyAssessmentProfile(legacy[0].profile)).not.toHaveProperty("structure");
    expect(policy[0].id).not.toBe(legacy[0].id);
  });
});
