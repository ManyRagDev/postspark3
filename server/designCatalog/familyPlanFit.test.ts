import { describe, expect, it } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { componentAssemblyFixture } from "@shared/componentAssembly.fixture";
import {
  compactComponentCard,
  createComponentDefinition,
} from "@shared/componentAssembly";
import { resolveDesignFamilyRepertoires } from "@shared/designRepertoire";
import { buildFamilySelectionCandidates } from "@shared/designFamilySelection";
import type { GenerationIntent } from "@shared/generationPlan";
import { inspectFamilyPlanFit } from "./familyPlanFit";
const intent: GenerationIntent = {
  version: 1,
  objective: "Preservar a mensagem",
  tone: { description: "Claro", origin: "explicit", rationale: "Pedido" },
  adaptation: "controlled",
  requirements: [],
  content: [
    {
      id: "idea",
      meaning: "Mensagem fornecida",
      sourceIds: [],
      requirementIds: [],
    },
  ],
};
function args(definitions = completeDesignTestDefinitions()) {
  const families = buildFamilySelectionCandidates(
    resolveDesignFamilyRepertoires(definitions.map(compactComponentCard), {
      slideCount: 1,
      contentMode: "compose",
    })
  );
  return {
    families,
    ids: [families[0].id],
    scores: families.map(f => ({ id: f.id, score: 1.5, confidence: 0.12 })),
    intent,
    imageObligation: {
      policy: "optional" as const,
      required: false,
      purpose: "none" as const,
      reason: "Teste",
      slotTargets: 0,
    },
    requestedPhotoMix: false,
    slideCount: 1,
    recentSelections: [],
  };
}
describe("real local fit remains mandatory during recovery", () => {
  it("allows the existing planner to reuse one family for three viable proposals", () => {
    expect(inspectFamilyPlanFit(args()).viableSlots).toEqual([0, 1, 2]);
  });
  it("rejects a typographic source for mandatory photo and a photo source when photos are forbidden", () => {
    const required = {
      ...args(),
      imageObligation: {
        policy: "required" as const,
        required: true,
        purpose: "editorial-photo" as const,
        reason: "Obrigatória",
        slotTargets: 1,
      },
    };
    expect(inspectFamilyPlanFit(required).viableSlots).toEqual([]);
    const photographic = createComponentDefinition({
      ...componentAssemblyFixture()[0],
      completeDesign: { family: "photographic", baselineVerified: true },
    });
    const forbidden = {
      ...args([photographic]),
      imageObligation: {
        policy: "forbidden" as const,
        required: false,
        purpose: "none" as const,
        reason: "Proibida",
        slotTargets: 0,
      },
    };
    expect(inspectFamilyPlanFit(forbidden).viableSlots).toEqual([]);
  });
  it("rejects a missing required item instead of silently reducing the requested content", () => {
    const f = args();
    f.intent = {
      ...intent,
      requirements: [
        {
          id: "items",
          kind: "content",
          origin: "explicit",
          surface: "art",
          itemCount: 50,
          description: "Cinquenta itens independentes",
          requestQuote: "50 itens",
        },
      ],
      content: Array.from({ length: 49 }, (_, i) => ({
        id: `item-${i}`,
        meaning: `Item ${i}`,
        sourceIds: [],
        requirementIds: ["items"],
      })),
    };
    expect(inspectFamilyPlanFit(f).viableSlots).toEqual([]);
  });
});
