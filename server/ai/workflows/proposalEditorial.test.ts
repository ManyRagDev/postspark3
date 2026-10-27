import { describe, expect, it } from "vitest";
import { editorialPlanFixture } from "./proposalEditorial.fixture";
import {
  entitySpellingFindings,
  groundsEditorialFinding,
  validateEditorialPlan,
} from "./proposalEditorial";
import type { ProposalExecutionInput } from "./proposalGraph";

const input = {
  prompt:
    "BizuMiner verifica promoções e acompanha preços todos os dias nas grandes lojas.",
} as ProposalExecutionInput;
const copy = {
  caption: "",
  hashtags: [],
  slides: [
    {
      values: [
        { fieldId: "name", value: "Bizu Miner" },
        { fieldId: "body", value: "Melhores preços online" },
      ],
    },
    {
      values: [
        { fieldId: "name", value: "Grandes Lojas" },
        { fieldId: "body", value: "Nas melhores plataformas" },
      ],
    },
  ],
};
describe("source-backed editorial contract", () => {
  it("validates quotes, complete slide attribution and fact references rather than trusting a plan's declaration", () => {
    const editorialPlan = editorialPlanFixture(input, copy);
    expect(validateEditorialPlan({ ...copy, editorialPlan }, input)).toEqual(
      []
    );
    expect(
      validateEditorialPlan(
        {
          ...copy,
          editorialPlan: {
            ...editorialPlan,
            facts: [
              {
                id: "invented",
                sourceQuote: "Economia garantida de 50%",
                meaning: "Benefício",
              },
            ],
          },
        },
        input
      )
    ).toEqual(
      expect.arrayContaining([
        "editorial_plan_unbacked_fact:invented",
        "editorial_plan_unassigned_fact:invented",
        "editorial_plan_unknown_fact",
      ])
    );
    expect(
      validateEditorialPlan(
        {
          ...copy,
          editorialPlan: {
            ...editorialPlan,
            slides: [editorialPlan.slides[0], editorialPlan.slides[0]],
          },
        },
        input
      )
    ).toContain("editorial_plan_slide_coverage");
    expect(
      validateEditorialPlan(
        {
          ...copy,
          editorialPlan: {
            ...editorialPlan,
            protectedEntities: [
              { value: "OutraMarca", sourceQuote: input.prompt },
            ],
          },
        },
        input
      )
    ).toContain("editorial_plan_unbacked_entity");
    expect(
      validateEditorialPlan(
        {
          ...copy,
          editorialPlan: {
            ...editorialPlan,
            slides: editorialPlan.slides.map(s => ({
              ...s,
              purpose: "Apresentar o tema",
            })),
          },
        },
        input
      )
    ).toContain("editorial_plan_repeated_purpose");
  });
  it("detects the exact BizuMiner spelling regression even when a provider declared a clean review", () => {
    expect(entitySpellingFindings(copy, input)).toEqual([
      expect.objectContaining({
        category: "entity_changed",
        slideIndex: 0,
        fieldId: "name",
        observed: "Bizu Miner",
        expected: "BizuMiner",
        sourceQuote: "BizuMiner",
      }),
    ]);
    const captionCopy = {
      ...copy,
      caption: "Conheça Bizu Miner",
      slides: [{ values: [{ fieldId: "name", value: "BizuMiner" }] }],
    };
    const captionFinding = entitySpellingFindings(captionCopy, input)[0];
    expect(captionFinding).toMatchObject({
      fieldId: "$caption",
      observed: captionCopy.caption,
    });
    expect(groundsEditorialFinding(captionFinding, captionCopy, input)).toBe(
      true
    );
    expect(
      entitySpellingFindings(
        {
          ...copy,
          slides: [{ values: [{ fieldId: "name", value: "BIZUMINER" }] }],
        },
        input
      )
    ).toEqual([]);
    expect(
      entitySpellingFindings(
        {
          ...copy,
          slides: [{ values: [{ fieldId: "name", value: "BizuMiner" }] }],
        },
        input
      )
    ).toEqual([]);
  });
  it("accepts grounded editorial loss but refuses invented quotes, unknown fields and already visible literal facts", () => {
    const finding = {
      category: "fact_omission",
      slideIndex: 1,
      fieldId: "body",
      observed: "Nas melhores plataformas",
      expected: "Explicar a verificação de promoções",
      sourceQuote: "verifica promoções",
      explanation: "Diferencial não aparece na arte",
      action: "none",
    } as const;
    expect(groundsEditorialFinding(finding, copy, input)).toBe(true);
    expect(
      groundsEditorialFinding(
        { ...finding, sourceQuote: "garante economia" },
        copy,
        input
      )
    ).toBe(false);
    expect(
      groundsEditorialFinding({ ...finding, fieldId: "invented" }, copy, input)
    ).toBe(false);
    expect(
      groundsEditorialFinding(
        { ...finding, observed: "Outro texto" },
        copy,
        input
      )
    ).toBe(false);
    expect(
      groundsEditorialFinding(
        finding,
        {
          ...copy,
          slides: [
            copy.slides[0],
            { values: [{ fieldId: "body", value: "verifica promoções" }] },
          ],
        },
        input
      )
    ).toBe(false);
    expect(
      groundsEditorialFinding(
        { ...finding, category: "entity_changed", sourceQuote: "BizuMiner" },
        copy,
        input
      )
    ).toBe(false);
  });
  it("grounds a protected multiword name omission, including explanatory expected text, without authorizing unknown entities or already exact names", () => {
    const cafeInput = {
      prompt: "Café da Tarde é o nome do local",
    } as ProposalExecutionInput;
    const cafeCopy = {
      caption: "",
      hashtags: [],
      slides: [{ values: [{ fieldId: "name", value: "Café Tarde" }] }],
    };
    const editorialPlan = {
      ...editorialPlanFixture(cafeInput, cafeCopy),
      protectedEntities: [
        { value: "Café da Tarde", sourceQuote: cafeInput.prompt },
      ],
    };
    const protectedCopy = { ...cafeCopy, editorialPlan };
    const finding = {
      category: "entity_changed",
      slideIndex: 0,
      fieldId: "name",
      observed: "Café Tarde",
      expected: "O nome canônico exato fornecido é 'Café da Tarde'.",
      sourceQuote: cafeInput.prompt,
      explanation: "Preposição do nome omitida",
      action: "none",
    } as const;
    expect(groundsEditorialFinding(finding, protectedCopy, cafeInput)).toBe(
      true
    );
    expect(
      groundsEditorialFinding(
        { ...finding, expected: "Preservar Café da Tardezinha" },
        protectedCopy,
        cafeInput
      )
    ).toBe(false);
    expect(
      groundsEditorialFinding(
        { ...finding, observed: "Conheça Café da Tarde" },
        {
          ...protectedCopy,
          slides: [
            { values: [{ fieldId: "name", value: "Conheça Café da Tarde" }] },
          ],
        },
        cafeInput
      )
    ).toBe(false);
    expect(
      groundsEditorialFinding(
        finding,
        {
          ...protectedCopy,
          editorialPlan: {
            ...editorialPlan,
            protectedEntities: [
              { value: "Café da Tarde", sourceQuote: "Outra fonte" },
            ],
          },
        },
        cafeInput
      )
    ).toBe(false);
    expect(
      groundsEditorialFinding(finding, protectedCopy, {
        ...cafeInput,
        prompt: "Outra cafeteria",
      })
    ).toBe(false);
  });

  it("does not turn supplied visual_only text into an obligation to add narrative or CTA", () => {
    const literal = {
      ...input,
      executionBrief: {
        rawInput: "Bizu Miner",
        interventionLevel: "visual_only",
      },
    } as ProposalExecutionInput;
    const editorialPlan = editorialPlanFixture(literal, copy);
    expect(editorialPlan.mode).toBe("literal");
    expect(validateEditorialPlan({ ...copy, editorialPlan }, literal)).toEqual(
      []
    );
    expect(entitySpellingFindings(copy, literal)).toEqual([]);
    expect(
      groundsEditorialFinding(
        {
          category: "narrative_gap",
          slideIndex: 0,
          fieldId: "name",
          observed: "Bizu Miner",
          expected: "Adicionar explicação",
          sourceQuote: "Bizu Miner",
          explanation: "Muito curto",
          action: "none",
        },
        copy,
        literal
      )
    ).toBe(false);
  });
});
