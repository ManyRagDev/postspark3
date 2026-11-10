import { describe, expect, it } from "vitest";
import { completeDesignTestDefinitions } from "./completeDesignGeneration.fixture";
import { compactComponentCard } from "./componentAssembly";
import { completeDesignProvenanceSchema } from "./completeDesignGeneration";
import {
  resolveDesignFamilyRepertoires,
  materializeDesignFamilyOffer,
} from "./designRepertoire";
import {
  validateGenerationIntent,
  normalizeGenerationIntent,
  materialGenerationIntent,
  validateGenerationPlan,
  viablePlanSchema,
  type GenerationIntent,
  type ViableGenerationPlan,
} from "./generationPlan";

const intent: GenerationIntent = {
  version: 1,
  objective: "Explicar cinco riscos",
  tone: {
    description: "Cuidadoso",
    origin: "inferred",
    rationale: "Riscos têm consequências práticas.",
  },
  adaptation: "controlled",
  requirements: [
    {
      id: "five",
      description: "Cinco riscos na arte",
      origin: "explicit",
      requestQuote: "cinco riscos na arte",
      surface: "art",
      itemCount: 5,
    },
  ],
  content: Array.from({ length: 5 }, (_, i) => ({
    id: `c${i}`,
    meaning: `Risco ${i + 1}`,
    requirementIds: ["five"],
    sourceIds: [],
  })),
};
function fixture() {
  const repertoire = resolveDesignFamilyRepertoires(
    completeDesignTestDefinitions().map(compactComponentCard),
    { slideCount: 1, contentMode: "compose" }
  )[0];
  const offer = materializeDesignFamilyOffer(repertoire, [repertoire.sourceId]);
  const plan: ViableGenerationPlan = {
    slot: 0,
    status: "viable",
    candidateId: repertoire.defaultOffer.offerId,
    reason: "Área textual",
    editorialApproach: "Consequências práticas",
    captionContentIds: [],
    pages: [
      {
        slideIndex: 0,
        componentId: repertoire.sourceId,
        purpose: "Explicar riscos",
        rhythm: "list",
        assignments: [
          {
            fieldId: "field-0",
            contentIds: [],
            itemCount: null,
            instruction: "Título",
          },
          {
            fieldId: "field-1",
            contentIds: intent.content.map(c => c.id),
            itemCount: 5,
            instruction: "Um risco por item",
          },
        ],
      },
    ],
  };
  return { offer, plan };
}
describe("joint narrative and visual plan", () => {
  it("normalizes an admitted slide count within a full quoted sentence, retaining content cardinality", () => {
    const request = "Crie um carrossel de 5 slides com cinco riscos na arte. Estruture capa, desenvolvimento e encerramento.";
    const format = { id: "format", description: "Formato do carrossel", kind: "execution" as const,
      surface: "art" as const, origin: "explicit" as const, requestQuote: request, itemCount: 5 };
    const input = { ...intent, requirements: [...intent.requirements, format] };
    const before = structuredClone(input);
    const normalized = normalizeGenerationIntent(input, 5, new Set(), request);
    expect(normalized.requirements[1].itemCount).toBeNull();
    expect(normalized.requirements[0]).toEqual(intent.requirements[0]);
    expect(validateGenerationIntent(normalized, request, new Set())).toEqual([]);
    expect(input).toEqual(before);
    for (const [quote, admitted] of [[request, 4], ["cinco riscos na arte", 5],
      ["Crie 5 slides ou 6 páginas", 5], ["Produza 5 slides", 5]] as const) {
      const invalid = normalizeGenerationIntent({ ...input, requirements: [{ ...format, requestQuote: quote }] }, admitted, new Set(), request);
      expect(validateGenerationIntent(invalid, request, new Set())).toContain("execution_item_count:format");
    }
  });
  it("rejects an explicit obligation with no mapped content before choosing any design", () => {
    const requestText = "cinco riscos na arte; use somente os fatos fornecidos";
    const invalid: GenerationIntent = {
      ...intent,
      requirements: [...intent.requirements, { id: "orphan", description: "Use somente os fatos fornecidos", origin: "explicit", requestQuote: "use somente os fatos fornecidos", surface: "either", itemCount: null }],
    };
    expect(validateGenerationIntent(invalid, requestText, new Set())).toContain("unmapped_requirement:orphan");
    expect(validateGenerationIntent(intent, requestText, new Set())).toEqual([]);
    const execution: GenerationIntent = { ...invalid, requirements: invalid.requirements.map(r => r.id === "orphan" ? { ...r, kind: "execution" } : r) };
    expect(validateGenerationIntent(execution, requestText, new Set())).toEqual([]);
    const { plan, offer } = fixture();
    expect(validateGenerationPlan(plan, offer, execution)).toEqual([]);
    const material = materialGenerationIntent(execution)!;
    expect(material.requirements.map(r => r.id)).toEqual(["five"]);
    expect(material.content).toEqual(intent.content);
    expect(materialGenerationIntent(intent)).toBe(intent);
  });
  it("uses the delivery's reason limit before buying copy and review", () => {
    const { plan } = fixture();
    for (const length of [1, 600, 601, 1600]) {
      const reason = "a".repeat(length);
      expect(viablePlanSchema.safeParse({ ...plan, reason }).success).toBe(
        completeDesignProvenanceSchema.shape.reason.safeParse(reason).success
      );
    }
  });
  it("requires all five promised independent ideas on the requested surface", () => {
    const { offer, plan } = fixture();
    expect(validateGenerationPlan(plan, offer, intent)).toEqual([]);
    plan.pages[0].assignments[1].contentIds = ["c0", "c1", "c2"];
    plan.captionContentIds = ["c3", "c4"];
    expect(validateGenerationPlan(plan, offer, intent)).toContain(
      "required_item_count:five"
    );
  });
  it("rejects invented variants/fields and missing required fields before copy", () => {
    const { offer, plan } = fixture();
    plan.pages[0].assignments[0].fieldId = "made-up";
    expect(validateGenerationPlan(plan, offer, intent)).toEqual(
      expect.arrayContaining([
        "field_identity:0:made-up",
        "required_field:0:field-0",
      ])
    );
  });
  it("cannot assign five independent ideas to a native list with three slots", () => {
    const { offer, plan } = fixture();
    offer.slides[0].card.fields[1].kind = "list";
    offer.slides[0].card.fields[1].cardinality = { min: 1, max: 3 };
    plan.pages[0].assignments[1].itemCount = 3;
    expect(validateGenerationPlan(plan, offer, intent)).toContain(
      "independent_items_exceed_slots:0:field-1"
    );
  });
  it("keeps approximate character estimates advisory", () => {
    const { offer, plan } = fixture();
    offer.slides[0].card.capacity.width = 1;
    offer.slides[0].card.capacity.height = 1;
    expect(validateGenerationPlan(plan, offer, intent)).toEqual([]);
  });
  it("does not turn an inferred content preference into a hard requirement", () => {
    const { offer, plan } = fixture();
    plan.pages[0].assignments[1].contentIds = ["c0", "c1", "c2"];
    const inferred = structuredClone(intent);
    inferred.requirements[0].origin = "inferred";
    inferred.requirements[0].requestQuote = null;
    expect(validateGenerationPlan(plan, offer, inferred)).toEqual([]);
  });
  it("does not promote inferred constraints or imaginary sources into explicit evidence", () => {
    expect(
      validateGenerationIntent(
        intent,
        "Explique cinco riscos na arte",
        new Set()
      )
    ).toEqual([]);
    const invalid = structuredClone(intent);
    invalid.requirements[0].requestQuote = "faça humor";
    invalid.content[0].sourceIds = ["imaginary"];
    expect(
      validateGenerationIntent(
        invalid,
        "Explique cinco riscos na arte",
        new Set()
      )
    ).toEqual(["unattributed_requirement:five", "unknown_source:c0"]);
  });

  it("matches markdown-formatted request quotes when LLM strips markdown syntax", () => {
    const rawRequest = "**Slide 1:** \nTítulo: O Imposto Invisível da Sua Operação\n\n**Slide 2:** \nTexto: Emergências saem caro.";
    const intentWithStrippedMarkdown: GenerationIntent = {
      ...intent,
      requirements: [
        {
          id: "r1",
          description: "Gancho imposto invisível",
          origin: "explicit",
          requestQuote: "Slide 1: Título: O Imposto Invisível da Sua Operação",
          surface: "art",
          itemCount: null,
        },
      ],
      content: [
        {
          id: "c0",
          meaning: "Imposto invisível",
          requirementIds: ["r1"],
          sourceIds: [],
        },
      ],
    };
    expect(validateGenerationIntent(intentWithStrippedMarkdown, rawRequest, new Set())).toEqual([]);
  });

  it("matches multi-sentence quotes from distinct slides when parts are in source", () => {
    const rawRequest = "**Slide 4:** \nPlaneje a reposição com base no consumo real.\n\n**Slide 5:** \nPadronize marcas de alto rendimento.";
    const multiSentenceIntent: GenerationIntent = {
      ...intent,
      requirements: [
        {
          id: "r1",
          description: "Solução planejamento",
          origin: "explicit",
          requestQuote: "Planeje a reposição com base no consumo real. Padronize marcas de alto rendimento.",
          surface: "art",
          itemCount: null,
        },
      ],
      content: [
        {
          id: "c0",
          meaning: "Planejamento e padronização",
          requirementIds: ["r1"],
          sourceIds: [],
        },
      ],
    };
    expect(validateGenerationIntent(multiSentenceIntent, rawRequest, new Set())).toEqual([]);
  });

  it("maps positional s1, s2 source IDs defensively in normalizeGenerationIntent", () => {
    const rawIntent: GenerationIntent = {
      ...intent,
      requirements: [{ id: "r1", description: "req", origin: "inferred", requestQuote: null, surface: "art", itemCount: null }],
      content: [
        { id: "c0", meaning: "m0", requirementIds: ["r1"], sourceIds: ["s1", "s2"] },
      ],
    };
    const factualSourceIds = new Set(["source-real-1", "source-real-2"]);
    const normalized = normalizeGenerationIntent(rawIntent, 5, factualSourceIds, "request text");
    expect(normalized.content[0].sourceIds).toEqual(["source-real-1", "source-real-2"]);
    expect(validateGenerationIntent(normalized, "request text", factualSourceIds)).toEqual([]);
  });
});
