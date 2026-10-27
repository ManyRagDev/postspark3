import type { ProposalExecutionInput } from "./proposalGraph";
import type { EditorialCopy, EditorialPlan } from "./proposalEditorial";
import { narrativeSlideRole } from "@shared/carouselNarrative";
export function narrativePlanFixture(
  plan: EditorialPlan,
  count: number
): EditorialPlan {
  if (plan.version === 2 || plan.mode === "literal" || count < 2) return plan;
  return {
    ...plan,
    version: 2,
    mode: "compose",
    slides: plan.slides.map(s => ({
      ...s,
      role: narrativeSlideRole(s.slideIndex, count) as
        | "cover"
        | "development"
        | "closing",
      readerTakeaway: `Aprendizado da etapa ${s.slideIndex + 1}`,
      bridgeFromPrevious: s.slideIndex ? "Continuar a ideia anterior" : "",
    })),
  };
}
/** Source-backed fixture for tests that exercise geometry/media rather than editorial writing. */
export function editorialPlanFixture(
  input: ProposalExecutionInput,
  copy: EditorialCopy
): EditorialPlan {
  const literal = input.executionBrief?.interventionLevel === "visual_only";
  const base = {
    version: 1 as const,
    mode: literal ? ("literal" as const) : ("compose" as const),
    centralMessage: "Mensagem fornecida no pedido",
    facts: literal
      ? []
      : [
          {
            id: "source",
            sourceQuote: (input.executionBrief?.rawInput ?? input.prompt).slice(
              0,
              1500
            ),
            meaning: "Tema e informação fornecidos",
          },
        ],
    protectedEntities: [],
    slides: copy.slides.map((_slide, slideIndex) => ({
      slideIndex,
      purpose: `Desenvolver a etapa ${slideIndex + 1}`,
      factIds: literal ? [] : ["source"],
    })),
  };
  return narrativePlanFixture(base, copy.slides.length);
}
export function attachEditorialPlanFixture(
  result: any,
  input: ProposalExecutionInput
) {
  const content = result?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return result;
  try {
    const copy = JSON.parse(content);
    if (!Array.isArray(copy?.slides) || copy.editorialPlan) return result;
    return {
      ...result,
      choices: [
        {
          ...result.choices[0],
          message: {
            ...result.choices[0].message,
            content: JSON.stringify({
              ...copy,
              editorialPlan: editorialPlanFixture(input, copy),
            }),
          },
        },
        ...result.choices.slice(1),
      ],
    };
  } catch {
    return result;
  }
}
