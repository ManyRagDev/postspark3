import {
  proposalReviewRecordV8Schema,
  proposalReviewResponseV8Schema,
  type ReviewResponseV8,
} from "@shared/proposalReviewV8";
import { normalizeReviewV7 } from "./proposalReviewPolicy";
import { decodeReviewV7 } from "./reviewProtocolV7";
import {
  sourceRangeText,
  resolvedEditorialContext,
  type EditorialContextV2,
} from "./editorialContextV8";

export function decodeReviewV8(raw: string) {
  const legacy = decodeReviewV7(raw); // also rejects duplicate JSON keys at every nesting depth
  const parsed = proposalReviewResponseV8Schema.safeParse({
    ...legacy.response,
    factualAudit: JSON.parse(raw).factualAudit,
  });
  if (!parsed.success) throw new Error("proposal_review_response_invalid");
  return {
    response: parsed.data,
    discarded: legacy.discarded.filter(k => k !== "review.factualAudit"),
  };
}
export function normalizeReviewV8(
  options: Omit<
    Parameters<typeof normalizeReviewV7>[0],
    "context" | "response"
  > & { context: EditorialContextV2; response: ReviewResponseV8 }
) {
  const { response, context, units } = options;
  const invalid = (): never => {
    throw new Error("proposal_review_incomplete_evidence");
  };
  const { units: checks, claims } = response.factualAudit;
  if (
    checks.length !== units.length ||
    new Set(checks.map(u => u.unitId)).size !== checks.length ||
    checks.some(c => !units.some(u => u.id === c.unitId)) ||
    new Set(claims.map(c => c.id)).size !== claims.length
  )
    invalid();
  for (const check of checks) {
    if (
      new Set(check.claimIds).size !== check.claimIds.length ||
      (check.classification === "non_factual"
        ? check.claimIds.length > 0
        : !check.claimIds.length) ||
      check.claimIds.some(
        id => !claims.some(c => c.id === id && c.unitId === check.unitId)
      )
    )
      invalid();
  }
  const findings = [...response.findings];
  for (const claim of claims) {
    const unit = units.find(u => u.id === claim.unitId);
    if (
      !unit ||
      !unit.text.includes(claim.observed) ||
      !checks.some(
        c => c.unitId === claim.unitId && c.claimIds.includes(claim.id)
      )
    )
      invalid();
    for (const ref of claim.sources) {
      sourceRangeText(context, ref);
      if (
        claim.status === "supported" &&
        context.guidanceRanges.some(
          g =>
            g.sourceId === ref.sourceId &&
            ref.start >= g.start &&
            ref.end <= g.end
        )
      )
        invalid();
    }
    if (claim.status === "supported") {
      if (
        !claim.sources.length ||
        findings.some(
          f =>
            f.unitId === unit!.id &&
            f.category === "unsupported_claim" &&
            f.observed === claim.observed
        )
      )
        invalid();
      continue;
    }
    const existing = findings.find(
      f =>
        f.unitId === unit!.id &&
        f.observed === claim.observed &&
        f.category === "unsupported_claim"
    );
    if (
      existing &&
      (existing.consequence === "none" ||
        (claim.status === "uncertain" && existing.certainty !== "uncertain"))
    )
      invalid();
    if (!existing)
      findings.push({
        category: "unsupported_claim",
        slideIndex: unit!.slideIndex ?? 0,
        fieldId: unit!.fieldId,
        unitId: unit!.id,
        scope: unit!.scope,
        observed: claim.observed,
        expected:
          "Ajustar a afirmação ao alcance sustentado pelas fontes, preservando os demais campos.",
        sourceId: null,
        sourceQuote: "",
        explanation: claim.explanation,
        consequence: "false_claim",
        certainty: claim.status === "uncertain" ? "uncertain" : "established",
        effect: "blocking",
      });
  }
  const { factualAudit, ...base } = response;
  const normalized = normalizeReviewV7({
    ...options,
    context: resolvedEditorialContext(context),
    response: { ...base, limitation:base.limitation === "source_conflict" ? "proposal_review_source_conflict" : base.limitation, findings },
  });
  return proposalReviewRecordV8Schema.parse({
    ...normalized,
    policyVersion: 8,
    factualAudit,
  });
}
