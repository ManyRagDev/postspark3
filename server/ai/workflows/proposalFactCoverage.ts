import type { ArsenalComposition } from "@shared/designArsenal";
import type { ComponentDefinitionV1 } from "@shared/componentAssembly";
import { completeDesignFields } from "@shared/completeDesignGeneration";
import type {
  ProposalFactCoverage,
  ProposalReviewFinding,
  ProposalSourceCoverage,
} from "@shared/proposalReview";
import {
  groundsEditorialFinding,
  validateEditorialPlan,
} from "./proposalEditorial";
import type { ProposalExecutionInput } from "./proposalGraph";
import type { ReviewCopy } from "./proposalReview";

export function requiresFactCoverage(
  input: ProposalExecutionInput,
  copy: ReviewCopy
) {
  return (
    input.executionBrief?.interventionLevel !== "visual_only" &&
    copy.editorialPlan?.mode === "compose"
  );
}

const fieldValue = (copy: ReviewCopy, slideIndex: number, fieldId: string) => {
  const value = copy.slides[slideIndex]?.values.find(
    row => row.fieldId === fieldId
  )?.value;
  return Array.isArray(value) ? value.join("\n") : value;
};
const whitespace = (text: string) => text.replace(/\s+/g, " ").trim();

function fieldElements(
  composition: ArsenalComposition | undefined,
  fieldId: string,
  allowEmpty = false
) {
  if (!composition) return [];
  const bindings = new Set(
    composition.base.bindings
      .filter(
        b =>
          b.source === `content:${fieldId}:text` ||
          b.source === `content:${fieldId}:items`
      )
      .map(b => b.id)
  );
  return composition.elements.filter(element => {
    // The compiler hides empty optional text. It may still be an editable target;
    // an explicit opacity override or authored hidden piece must remain excluded.
    const emptyTarget =
      allowEmpty &&
      !element.text &&
      composition.base.instances.some(
        i => i.id === element.id && i.opacity > 0
      ) &&
      composition.overrides[element.id]?.opacity !== 0;
    if (
      element.kind !== "text" ||
      !element.bindingId ||
      !bindings.has(element.bindingId) ||
      (element.opacity <= 0 && !emptyTarget) ||
      element.width <= 0 ||
      element.height <= 0
    )
      return false;
    let parent = element.parentId;
    const seen = new Set<string>();
    while (parent) {
      if (seen.has(parent)) return false;
      seen.add(parent);
      const group = composition.groups.find(g => g.id === parent);
      if (!group || group.opacity <= 0) return false;
      parent = group.parentId;
    }
    return true;
  });
}

export function visibleEditorialFieldText(
  composition: ArsenalComposition | undefined,
  fieldId: string
) {
  return fieldElements(composition, fieldId)
    .map(e => e.text)
    .join(" ");
}

/** Validates identities/literal anchors, not natural-language entailment. A detector
 * still decides semantic coverage and must examine the rendered sequence. */
export function inspectFactCoverage(
  input: ProposalExecutionInput,
  copy: ReviewCopy,
  compositions: ArsenalComposition[],
  definitions: ComponentDefinitionV1[],
  coverage: ProposalFactCoverage[] | undefined
): { findings: ProposalReviewFinding[]; limitation?: string } {
  const fail = (limitation: string) => ({ findings: [], limitation });
  if (!requiresFactCoverage(input, copy))
    return coverage?.length
      ? fail("proposal_review_unexpected_fact_coverage")
      : { findings: [] };
  if (validateEditorialPlan(copy, input).length)
    return fail("proposal_review_invalid_editorial_plan");
  const plan = copy.editorialPlan!;
  const ids = new Set(plan.facts.map(f => f.id));
  if (
    !coverage ||
    coverage.length !== ids.size ||
    new Set(coverage.map(c => c.factId)).size !== ids.size ||
    coverage.some(c => !ids.has(c.factId))
  )
    return fail("proposal_review_incomplete_fact_coverage");
  const findings: ProposalReviewFinding[] = [];
  for (const item of coverage) {
    const fact = plan.facts.find(f => f.id === item.factId)!;
    if (item.status === "uncertain")
      return fail("proposal_review_uncertain_fact_coverage");
    for (const anchor of item.evidence) {
      const actual = fieldValue(copy, anchor.slideIndex, anchor.fieldId);
      const native = fieldElements(
        compositions[anchor.slideIndex],
        anchor.fieldId
      )
        .map(e => e.text)
        .join(" ");
      if (
        !anchor.quote.trim() ||
        actual === undefined ||
        !actual.includes(anchor.quote) ||
        !whitespace(native).includes(whitespace(anchor.quote))
      )
        return fail("proposal_review_invalid_fact_evidence");
    }
    if (item.status === "covered") {
      if (!item.evidence.length || item.missingSourceQuote.trim())
        return fail("proposal_review_incomplete_fact_evidence");
      continue;
    }
    if (
      !item.missingSourceQuote.trim() ||
      !fact.sourceQuote.includes(item.missingSourceQuote) ||
      (item.status === "partial" && !item.evidence.length)
    )
      return fail("proposal_review_invalid_missing_fact");
    // A partial row points at the actual field cited. A wholly missing fact uses
    // a native support field on an assigned slide, including an empty optional one.
    const candidates = item.evidence.map(e => ({
      slideIndex: e.slideIndex,
      fieldId: e.fieldId,
    }));
    for (const slide of plan.slides.filter(s => s.factIds.includes(fact.id))) {
      const fields = definitions[slide.slideIndex]
        ? completeDesignFields(definitions[slide.slideIndex])
        : [];
      for (const field of [
        ...fields.filter(f => f.role === "body"),
        ...fields.filter(f => f.role !== "body"),
      ])
        candidates.push({ slideIndex: slide.slideIndex, fieldId: field.id });
    }
    const target = candidates.find(
      c =>
        fieldValue(copy, c.slideIndex, c.fieldId) !== undefined &&
        fieldElements(
          compositions[c.slideIndex],
          c.fieldId,
          fieldValue(copy, c.slideIndex, c.fieldId) === ""
        ).length > 0
    );
    if (!target) return fail("proposal_review_missing_fact_target");
    const finding: ProposalReviewFinding = {
      category: "fact_omission",
      ...target,
      observed: fieldValue(copy, target.slideIndex, target.fieldId)!,
      expected: `Recuperar a informação da fonte: ${item.missingSourceQuote}`,
      sourceQuote: item.missingSourceQuote,
      explanation: item.explanation,
      action: "none",
    };
    if (
      finding.observed.length > 1500 ||
      !groundsEditorialFinding(finding, copy, input)
    )
      return fail("proposal_review_inconsistent_fact_coverage");
    findings.push(finding);
  }
  return { findings };
}

/** Reuse native evidence/grounding checks against the reviewer's source inventory.
 * This temporary plan is only a validation adapter; it never replaces the writer's
 * persisted plan. All slides are possible repair targets for a fact omitted there. */
export function inspectSourceCoverage(
  input: ProposalExecutionInput,
  copy: ReviewCopy,
  compositions: ArsenalComposition[],
  definitions: ComponentDefinitionV1[],
  coverage: ProposalSourceCoverage[] | undefined
): { findings: ProposalReviewFinding[]; limitation?: string } {
  if (!requiresFactCoverage(input, copy))
    return coverage?.length
      ? {
          findings: [],
          limitation: "proposal_review_unexpected_source_coverage",
        }
      : { findings: [] };
  if (
    !coverage?.length ||
    new Set(coverage.map(c => c.factId)).size !== coverage.length
  )
    return {
      findings: [],
      limitation: "proposal_review_incomplete_source_coverage",
    };
  const plan = copy.editorialPlan!;
  const auditCopy: ReviewCopy = {
    ...copy,
    editorialPlan: {
      version: 1,
      mode: plan.mode,
      centralMessage: plan.centralMessage,
      protectedEntities: plan.protectedEntities,
      facts: coverage.map(({ factId, sourceQuote, meaning }) => ({
        id: factId,
        sourceQuote,
        meaning,
      })),
      slides: plan.slides.map(slide => ({
        slideIndex: slide.slideIndex,
        purpose: slide.purpose,
        factIds: coverage.map(c => c.factId),
      })),
    },
  };
  const result = inspectFactCoverage(
    input,
    auditCopy,
    compositions,
    definitions,
    coverage
  );
  return result.limitation
    ? {
        findings: [],
        limitation: result.limitation.replace(
          "proposal_review_",
          "proposal_review_source_"
        ),
      }
    : result;
}
