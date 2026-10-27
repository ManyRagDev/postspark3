import {
  narrativeCriteria,
  type NarrativeCheck,
  type ProposalReviewFinding,
} from "@shared/proposalReview";
import { carouselNarrativeContract } from "@shared/carouselNarrative";
import type { ArsenalComposition } from "@shared/designArsenal";
import type { ProposalExecutionInput } from "./proposalGraph";
import type { ReviewCopy } from "./proposalReview";
import { editorialSlideText } from "./proposalEditorial";
import { visibleEditorialFieldText } from "./proposalFactCoverage";

export function requiresNarrativeReview(
  input: ProposalExecutionInput,
  copy: ReviewCopy
) {
  return (
    copy.editorialPlan?.version === 2 &&
    Boolean(
      carouselNarrativeContract(
        copy.slides.length,
        input.executionBrief?.interventionLevel
      )
    )
  );
}

/** Verifies coverage and literal visible anchors, not the semantic judgment itself. */
export function inspectNarrativeChecks(
  input: ProposalExecutionInput,
  copy: ReviewCopy,
  compositions: ArsenalComposition[],
  checks?: NarrativeCheck[]
): { findings: ProposalReviewFinding[]; limitation?: string } {
  const fail = (limitation: string) => ({ findings: [], limitation });
  if (!requiresNarrativeReview(input, copy))
    return checks?.length
      ? fail("proposal_review_unexpected_narrative_checks")
      : { findings: [] };
  if (
    !checks ||
    checks.length !== 4 ||
    new Set(checks.map(c => c.criterion)).size !== 4 ||
    narrativeCriteria.some(
      criterion => !checks.some(c => c.criterion === criterion)
    )
  )
    return fail("proposal_review_incomplete_narrative_checks");
  const instructions = [
    input.prompt,
    input.executionBrief?.rawInput,
    input.executionBrief?.notes,
  ].filter((v): v is string => Boolean(v));
  const affected = new Map<number, string[]>();
  const count = copy.slides.length;
  for (const check of checks) {
    if (check.status === "uncertain")
      return fail("proposal_review_uncertain_narrative_checks");
    if (
      check.status === "user_directed"
        ? !check.instructionQuote.trim() ||
          !instructions.some(s => s.includes(check.instructionQuote))
        : Boolean(check.instructionQuote.trim())
    )
      return fail("proposal_review_invalid_narrative_override");
    for (const anchor of check.evidence) {
      const value = copy.slides[anchor.slideIndex]?.values.find(
        v => v.fieldId === anchor.fieldId
      )?.value;
      const actual = Array.isArray(value) ? value.join("\n") : value;
      const native = visibleEditorialFieldText(
        compositions[anchor.slideIndex],
        anchor.fieldId
      );
      const squash = (s: string) => s.replace(/\s+/g, " ").trim();
      if (
        !anchor.quote.trim() ||
        !actual?.includes(anchor.quote) ||
        !squash(native).includes(squash(anchor.quote))
      )
        return fail("proposal_review_invalid_narrative_evidence");
    }
    const indices = new Set(check.evidence.map(e => e.slideIndex));
    const required =
      check.criterion === "cover_hook"
        ? [0]
        : check.criterion === "closing"
          ? [count - 1]
          : check.criterion === "cohesion"
            ? copy.slides.map((_, i) => i)
            : count === 2
              ? [1]
              : Array.from({ length: count - 2 }, (_, i) => i + 1);
    if (
      required.some(i => !indices.has(i)) ||
      (check.criterion === "cover_hook" &&
        Array.from(indices).some(i => i !== 0)) ||
      (check.criterion === "closing" &&
        Array.from(indices).some(i => i !== count - 1))
    )
      return fail("proposal_review_incomplete_narrative_evidence");
    if (
      check.status === "needs_revision"
        ? !check.revisionSlides.length ||
          new Set(check.revisionSlides).size !== check.revisionSlides.length ||
          check.revisionSlides.some(i => !indices.has(i))
        : Boolean(check.revisionSlides.length)
    )
      return fail("proposal_review_invalid_narrative_revision_scope");
    if (check.status === "needs_revision")
      for (const slideIndex of check.revisionSlides)
        affected.set(slideIndex, [
          ...(affected.get(slideIndex) ?? []),
          `${check.criterion}: ${check.explanation}`,
        ]);
  }
  const findings: ProposalReviewFinding[] = [];
  for (const [slideIndex, problems] of Array.from(affected)) {
    const observed = editorialSlideText(copy, slideIndex);
    if (!observed.trim() || observed.length > 1500)
      return fail("proposal_review_invalid_narrative_target");
    findings.push({
      category: "narrative_structure",
      slideIndex,
      fieldId: null,
      observed,
      expected:
        "Cumprir o papel narrativo deste slide e sua ligação com a sequência, preservando todos os fatos e instruções explícitas.",
      sourceQuote: "",
      explanation: problems.join("\n").slice(0, 1500),
      action: "none",
    });
  }
  return { findings };
}
