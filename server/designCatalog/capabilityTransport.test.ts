import { describe, expect, it } from "vitest";
import { assemblyIdentity, compactComponentCard, createComponentDefinition } from "@shared/componentAssembly";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { resolveDesignFamilyRepertoires } from "@shared/designRepertoire";
import { buildFamilySelectionCandidates } from "@shared/designFamilySelection";
import { shortlistDesignFamilies } from "./familyShortlist";
import { shortlistCompleteDesigns, type JevRequest } from "./designShortlist";

describe("capability profile transport", () => {
  it("keeps criteria per question and measures/splits actual JSON for 82 real candidate contracts", async () => {
    const root = completeDesignTestDefinitions()[0];
    const cards = Array.from({length: 82}, (_, index) => compactComponentCard(createComponentDefinition({
      ...root, id: assemblyIdentity(["transport82", index]), completeDesign: {...root.completeDesign!, family: `family-${index}`},
    })));
    const repertoires = resolveDesignFamilyRepertoires(cards, {slideCount: 1, contentMode: "compose"});
    const families = buildFamilySelectionCandidates(repertoires, null, true, true, "capability_v1");
    const requests: JevRequest[] = [];
    const input = {cards: repertoires.map(r => ({...r.slides[0].variants[0], id: r.defaultOffer.offerId, hash: r.defaultOffer.signature})),
      brief: JSON.stringify({request: "Compare duas opções na arte. Prefiro azul.", requirements: [{strength: "required", source: "declared", requestQuote: "Compare duas opções na arte"}]}),
      slideCount: 1, deadlineMs: null, editorialIntentVersion: 1 as const, rankingPolicy: "capability_v1" as const,
    };
    const result = await shortlistDesignFamilies(input, families, params => shortlistCompleteDesigns(params, async request => {
      requests.push(request);
      return {model: request.model, answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, {type: "score" as const, score: 3, confidence: 1}])), usage: {input_tokens: 0, output_tokens: 0, cost: 0}};
    }));
    expect(result.evaluated).toHaveLength(82);
    expect(requests.length).toBeGreaterThan(1);
    expect(result.batches).toBe(requests.length);
    for (const request of requests) {
      expect(Buffer.byteLength(JSON.stringify(request))).toBeLessThanOrEqual(64000);
      const state = JSON.parse(request.state);
      expect(state.assessmentTask).toContain("native body/list/data fields");
      expect(state.assessmentTask).toContain("declared required constraints");
      expect(state.assessmentTask).not.toContain("No fields, slides or geometry");
      expect(state.context.requirements[0].requestQuote).toBe("Compare duas opções na arte");
      for (const question of Object.values(request.questions)) {
        expect(question.criteria).toHaveLength(5);
        expect(question.instructions.design).toHaveProperty("structure.textBlocks");
        expect(question.instructions.design).toHaveProperty("rootCapabilities");
      }
    }
  });
});
