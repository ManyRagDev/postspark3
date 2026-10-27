import { arsenalHash } from "@shared/arsenalContent";
import {
  requirementMatches,
  type EffectiveContentRequirement,
} from "@shared/contentRequirements";
import {
  materialFindingV7,
  proposalReviewRecordV7Schema,
  reviewDecisionV7,
  type ReviewResponseV7,
  type ReviewTextUnitV7,
  type ReviewFindingV7,
} from "@shared/proposalReviewV7";
import type { ReviewCopy } from "./proposalReview";
import type { ArsenalComposition } from "@shared/designArsenal";
import type { buildReviewEvidenceAliases } from "./reviewEvidence";
import { resolveSourceQuote } from "./sourceRepresentation";
import type { editorialContextV7 } from "./editorialContextV7";

type Aliases = ReturnType<typeof buildReviewEvidenceAliases>;
export function reviewTextUnitsV7(
  copy: ReviewCopy,
  aliases: Aliases
): ReviewTextUnitV7[] {
  const units: Omit<ReviewTextUnitV7, "id" | "textHash">[] = [];
  copy.slides.forEach((s, slideIndex) =>
    s.values.forEach(v =>
      (Array.isArray(v.value) ? v.value : [v.value]).forEach((text, index) => {
        if (!text.trim()) return;
        const itemIndex = Array.isArray(v.value) ? index : null;
        units.push({
          scope: "art",
          slideIndex,
          fieldId: v.fieldId,
          itemIndex,
          text,
          visibleAliases: aliases.inventory
            .filter(
              a =>
                a.slideIndex === slideIndex &&
                a.fieldId === v.fieldId &&
                a.itemIndex === itemIndex
            )
            .map(a => a.alias),
        });
      })
    )
  );
  if (copy.caption.trim())
    units.push({
      scope: "caption",
      slideIndex: null,
      fieldId: "$caption",
      itemIndex: null,
      text: copy.caption,
      visibleAliases: [],
    });
  copy.hashtags.forEach((text, itemIndex) => {
    if (text.trim())
      units.push({
        scope: "caption",
        slideIndex: null,
        fieldId: "$hashtags",
        itemIndex,
        text,
        visibleAliases: [],
      });
  });
  return units.map((u, i) => ({
    ...u,
    id: `t${i + 1}`,
    textHash: arsenalHash(u.text),
  }));
}
export function visibleUnitTextV7(unit: ReviewTextUnitV7, aliases: Aliases) {
  if (unit.scope === "caption") return unit.text;
  const anchors = aliases.inventory
    .filter(a => unit.visibleAliases.includes(a.alias))
    .sort((a, b) => a.start - b.start);
  let text = "",
    end = -1;
  for (const a of anchors) {
    if (a.end <= end) continue;
    if (end >= 0 && a.start > end) text += "\n";
    text += a.quote.slice(Math.max(0, end - a.start));
    end = a.end;
  }
  return text;
}
export function requirementUnitMatchesV7(
  r: EffectiveContentRequirement,
  units: ReviewTextUnitV7[],
  aliases: Aliases
) {
  const matches = units.filter(
    u =>
      (r.scope === "either" || r.scope === u.scope) &&
      requirementMatches(visibleUnitTextV7(u, aliases), r)
  );
  if (matches.length) return matches;
  // Preserve native reading order across fields without combining art and caption.
  for (const scope of ["art", "caption"] as const) {
    if (r.scope !== "either" && r.scope !== scope) continue;
    const scoped = units.filter(
      u => u.scope === scope && visibleUnitTextV7(u, aliases).trim()
    );
    if (
      requirementMatches(
        scoped.map(u => visibleUnitTextV7(u, aliases)).join("\n"),
        r
      )
    )
      return scoped;
  }
  return [];
}
const invalid = (reason = "incomplete_evidence"): never => {
  throw new Error(`proposal_review_${reason}`);
};
export function normalizeReviewV7(options: {
  response: ReviewResponseV7;
  units: ReviewTextUnitV7[];
  aliases: Aliases;
  context: ReturnType<typeof editorialContextV7>;
  copy: ReviewCopy;
  compositions: ArsenalComposition[];
  inputHash: string;
  round: "initial" | "recheck";
  operationKeys: string[];
  discardedFields: string[];
}) {
  const { response: r, units, aliases, context, copy, compositions } = options;
  const equal = (a: Array<string | number>, b: Array<string | number>) =>
    a.length === b.length &&
    new Set(a).size === a.length &&
    a.every(v => b.includes(v));
  if (
    !equal(
      r.reviewedSlides,
      copy.slides.map((_, i) => i)
    ) ||
    !equal(
      r.checkedTextUnits,
      units.map(u => u.id)
    )
  )
    invalid();
  if (
    !equal(
      r.requirementChecks.map(c => c.requirementId),
      context.requirements.map(c => c.id)
    )
  )
    invalid();
  const checks = r.requirementChecks.map(c => {
    const req = context.requirements.find(x => x.id === c.requirementId)!;
    if (
      new Set(c.unitIds).size !== c.unitIds.length ||
      c.unitIds.some(id => !units.some(u => u.id === id))
    )
      invalid();
    const evidence = c.unitIds.map(id => units.find(u => u.id === id)!);
    if (evidence.some(u => req.scope !== "either" && u.scope !== req.scope))
      invalid();
    if (req.kind === "meaning") {
      if (
        c.status === "met" &&
        (!evidence.length ||
          evidence.some(u => !visibleUnitTextV7(u, aliases).trim()))
      )
        invalid();
      if (c.status !== "met" && !c.explanation.trim()) invalid();
      return c;
    }
    const matched = requirementUnitMatchesV7(req, units, aliases);
    const status = (
      req.kind === "forbidden" ? matched.length === 0 : matched.length > 0
    )
      ? ("met" as const)
      : ("missing" as const);
    return {
      ...c,
      status,
      unitIds: matched.map(u => u.id),
      explanation:
        status === "missing"
          ? "Obrigação textual não atendida no destino solicitado."
          : "",
    };
  });
  const rawFindings = [...r.findings];
  for (const c of checks.filter(c => c.status !== "met")) {
    const req = context.requirements.find(x => x.id === c.requirementId)!;
    const unit =
      units.find(u => c.unitIds.includes(u.id)) ??
      units.find(
        u =>
          (req.scope === "either" || req.scope === u.scope) &&
          (u.scope === "caption" || u.visibleAliases.length)
      );
    rawFindings.push({
      category: "explicit_requirement",
      slideIndex: unit?.slideIndex ?? 0,
      fieldId:
        unit?.fieldId ??
        (req.scope === "caption"
          ? "$caption"
          : (copy.slides[0]?.values[0]?.fieldId ?? null)),
      scope: unit?.scope ?? (req.scope === "caption" ? "caption" : "art"),
      unitId: unit?.id ?? null,
      observed: unit?.text.slice(0, 4000) ?? "",
      expected: req.value,
      sourceId: null,
      sourceQuote: "",
      explanation: c.explanation,
      consequence: "explicit_requirement",
      certainty: c.status === "uncertain" ? "uncertain" : "established",
      effect: "blocking",
    });
  }
  if (
    r.messageAssessment.status !== "preserved" &&
    (!r.messageAssessment.explanation.trim() ||
      !rawFindings.some(f => materialFindingV7(f)))
  )
    invalid();
  const findings = rawFindings.map((f, index) => {
    const generated = index >= r.findings.length;
    const unit = f.unitId ? units.find(u => u.id === f.unitId) : undefined;
    if (f.unitId && !unit) invalid("unknown_evidence_reference");
    if (unit) {
      if (
        f.scope !== unit.scope ||
        f.fieldId !== unit.fieldId ||
        f.slideIndex !== (unit.slideIndex ?? 0) ||
        !unit.text.includes(f.observed)
      )
        invalid("divergent_finding_reference");
    } else if (f.scope === "art") {
      if (
        !compositions[f.slideIndex] ||
        (f.fieldId !== null &&
          !copy.slides[f.slideIndex].values.some(v => v.fieldId === f.fieldId))
      )
        invalid();
      if (!generated && f.fieldId !== null && f.category !== "fact_omission")
        invalid();
    } else if (!generated || f.fieldId !== "$caption") invalid();
    if (!generated && f.sourceQuote) {
      const source = context.sources.find(s => s.id === f.sourceId);
      if (!source || !resolveSourceQuote(source.text, f.sourceQuote).length)
        invalid("invalid_source_quote");
    } else if (!generated && f.sourceId !== null)
      invalid("invalid_source_quote");
    if (
      !generated &&
      ["factual_contradiction", "entity_changed", "fact_omission"].includes(
        f.category
      ) &&
      !f.sourceQuote
    )
      invalid("invalid_source_quote");
    if (!generated && f.category === "explicit_requirement" && !f.sourceQuote)
      invalid("invalid_source_quote");
    // A visual preference is not a measured contrast defect; technical gates own measurements.
    const finding: ReviewFindingV7 =
      f.category === "contrast"
        ? { ...f, consequence: "none", effect: "advisory" }
        : f;
    const material = materialFindingV7(finding);
    if (material && !finding.expected.trim()) invalid();
    if (
      !finding.observed &&
      finding.category !== "fact_omission" &&
      finding.category !== "explicit_requirement"
    )
      invalid();
    return {
      ...finding,
      itemIndex: unit?.itemIndex ?? null,
      action: "none" as const,
      effect: material ? ("blocking" as const) : ("advisory" as const),
      authority: material
        ? finding.category === "explicit_requirement"
          ? ("contract_grounded" as const)
          : ("source_grounded" as const)
        : ("diagnostic" as const),
    };
  });
  const record = {
    ...r,
    requirementChecks: checks,
    findings,
    policyVersion: 7 as const,
    round: options.round,
    inputHash: options.inputHash,
    factCoverage: [],
    sourceCoverage: [],
    operationKeys: options.operationKeys,
    discardedFields: options.discardedFields,
  };
  const status = reviewDecisionV7(record);
  return proposalReviewRecordV7Schema.parse({
    ...record,
    status,
    limitation:
      status === "inconclusive"
        ? r.limitation || "proposal_review_semantic_inconclusive"
        : "",
  });
}
