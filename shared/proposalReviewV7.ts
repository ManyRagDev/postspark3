import { z } from "zod";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const textUnitV7Schema = z
  .object({
    id: z.string().min(1),
    scope: z.enum(["art", "caption"]),
    slideIndex: z.number().int().min(0).max(9).nullable(),
    fieldId: z.string().min(1),
    itemIndex: z.number().int().min(0).nullable(),
    text: z.string().min(1),
    textHash: hash,
    visibleAliases: z.array(z.string().regex(/^e[1-9]\d*$/)),
  })
  .strict();
export type ReviewTextUnitV7 = z.infer<typeof textUnitV7Schema>;
const findingV7Base = z.object({
  category: z.enum([
    "factual_contradiction",
    "explicit_requirement",
    "visible_text_loss",
    "media_missing",
    "contrast",
    "aesthetic",
    "entity_changed",
    "fact_omission",
    "narrative_gap",
    "narrative_structure",
    "unsupported_claim",
  ]),
  slideIndex: z.number().int().min(0).max(9),
  fieldId: z.string().max(120).nullable(),
  unitId: z.string().nullable(),
  scope: z.enum(["art", "caption"]),
  observed: z.string().max(4000),
  expected: z.string().max(4000),
  sourceId: z.string().nullable(),
  sourceQuote: z.string().max(4000),
  explanation: z.string().min(1).max(1500),
  consequence: z.enum([
    "none",
    "false_claim",
    "lost_condition",
    "identity",
    "explicit_requirement",
    "meaning_loss",
    "unusable_art",
  ]),
  certainty: z.enum(["established", "uncertain"]),
  effect: z.enum(["blocking", "advisory"]),
});
export const findingV7Schema = findingV7Base.strict();
export type ReviewFindingV7 = z.infer<typeof findingV7Schema>;
export function materialFindingV7(f: ReviewFindingV7) {
  if (
    [
      "unsupported_claim",
      "factual_contradiction",
      "entity_changed",
      "explicit_requirement",
      "visible_text_loss",
      "media_missing",
    ].includes(f.category)
  )
    return true;
  if (f.category === "aesthetic" || f.consequence === "none") return false;
  if (f.category === "narrative_gap" || f.category === "narrative_structure")
    return (
      f.consequence === "meaning_loss" ||
      f.consequence === "explicit_requirement"
    );
  return true;
}
export const requirementCheckV7Schema = z
  .object({
    requirementId: z.string().min(1),
    status: z.enum(["met", "missing", "uncertain"]),
    unitIds: z.array(z.string().min(1)),
    explanation: z.string().max(1500),
  })
  .strict();
const assessment = z
  .object({
    status: z.enum(["preserved", "changed", "uncertain"]),
    explanation: z.string().max(1500),
  })
  .strict();
export const proposalReviewResponseV7Schema = z
  .object({
    outcome: z.enum(["reviewed", "inconclusive"]),
    limitation: z.string().max(1500),
    reviewedSlides: z.array(z.number().int().min(0).max(9)).max(10),
    checkedTextUnits: z.array(z.string().min(1)),
    requirementChecks: z.array(requirementCheckV7Schema),
    messageAssessment: assessment,
    findings: z.array(findingV7Schema).max(40),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.outcome === "reviewed" && !r.reviewedSlides.length)
      ctx.addIssue({
        code: "custom",
        message: "Parecer reviewed exige slides inspecionados",
      });
  });
export type ReviewResponseV7 = z.infer<typeof proposalReviewResponseV7Schema>;
export function reviewDecisionV7(
  r: Pick<
    ReviewResponseV7,
    | "outcome"
    | "limitation"
    | "findings"
    | "messageAssessment"
    | "requirementChecks"
  >
) {
  if (
    r.outcome === "inconclusive" ||
    r.limitation ||
    r.messageAssessment.status === "uncertain" ||
    r.requirementChecks.some(c => c.status === "uncertain") ||
    r.findings.some(f => materialFindingV7(f) && f.certainty === "uncertain")
  )
    return "inconclusive" as const;
  if (
    r.messageAssessment.status === "changed" ||
    r.requirementChecks.some(c => c.status === "missing") ||
    r.findings.some(materialFindingV7)
  )
    return "correction_required" as const;
  return "passed" as const;
}
const normalizedFinding = findingV7Base
  .extend({
    itemIndex: z.number().int().min(0).nullable(),
    action: z.literal("none"),
    authority: z.enum(["diagnostic", "source_grounded", "contract_grounded"]),
  })
  .strict();
export const proposalReviewRecordV7Schema = proposalReviewResponseV7Schema
  .safeExtend({
    policyVersion: z.literal(7),
    round: z.enum(["initial", "recheck"]),
    inputHash: hash,
    status: z.enum(["passed", "correction_required", "inconclusive"]),
    // Empty compatibility projections; V7 does not depend on the writer's plan.
    factCoverage: z.array(z.never()).max(0),
    sourceCoverage: z.array(z.never()).max(0),
    findings: z.array(normalizedFinding).max(100),
    operationKeys: z.array(z.string().min(1)).max(2),
    // A renderer failure can record zero inspected slides only as inconclusive.
    // The provider response still requires at least one; approval is guarded below.
    reviewedSlides: z.array(z.number().int().min(0).max(9)).max(10),
    discardedFields: z.array(z.string()),
  })
  .strict()
  .superRefine((r, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (r.status !== reviewDecisionV7(r))
      issue("Decisão V7 diverge da política material");
    if (
      r.status !== "inconclusive" &&
      (!r.reviewedSlides.length || !r.operationKeys.length)
    )
      issue("Parecer V7 sem recibo ou slides");
    if (r.status === "passed" && r.outcome !== "reviewed")
      issue("Aprovação exige inspeção concluída");
    if (r.status === "inconclusive" && !r.limitation.trim())
      issue("Inconclusão exige causa");
    for (const values of [
      r.reviewedSlides,
      r.checkedTextUnits,
      r.operationKeys,
      r.requirementChecks.map(c => c.requirementId),
    ])
      if (new Set<string | number>(values).size !== values.length)
        issue("Referências duplicadas");
    if (
      r.operationKeys.some((key, i) =>
        i === 0
          ? !key.endsWith(`:review:${r.round}:${r.inputHash}`)
          : !new RegExp(
              `:review_evidence_repair:${r.round}:[a-f0-9]{64}$`
            ).test(key)
      )
    )
      issue("Recibo V7 divergente");
    if (
      r.findings.some(
        f => f.effect !== (materialFindingV7(f) ? "blocking" : "advisory")
      )
    )
      issue("Efeito incompatível com materialidade");
    if (
      r.messageAssessment.status !== "preserved" &&
      !r.messageAssessment.explanation.trim()
    )
      issue("Desvio material exige explicação");
    if (
      r.requirementChecks.some(c => c.status !== "met" && !c.explanation.trim())
    )
      issue("Requisito pendente exige explicação");
    if (
      r.status === "correction_required" &&
      !r.findings.some(f => f.effect === "blocking")
    )
      issue("Correção exige alvo bloqueante");
  });
export type ProposalReviewRecordV7 = z.infer<
  typeof proposalReviewRecordV7Schema
>;
export const reviewExecutionConfigV2Schema = z
  .object({
    version: z.literal(2),
    policyVersion: z.literal(7),
    resolvedModel: z.string().min(1).max(200),
    textModel: z.string().min(1).max(200).optional(),
    // Missing means the original V7 instructions; existing journals stay pinned.
    editorialGuidanceVersion: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]).optional(),
    configurationHash: hash,
    contractHash: hash,
    reasoningEffort: z.literal("medium"),
    temperature: z.literal(0.1),
    timeoutMs: z.number().int().min(1).max(300000),
    profiles: z
      .object({
        standard: z
          .object({
            maxCompletionTokens: z.literal(9216),
            maxSlides: z.literal(4),
            maxRequirements: z.literal(8),
            maxTextUnits: z.literal(20),
          })
          .strict(),
        extended: z.object({ maxCompletionTokens: z.literal(12288) }).strict(),
      })
      .strict(),
  })
  .strict();
export type ReviewExecutionConfigV2 = z.infer<
  typeof reviewExecutionConfigV2Schema
>;
export const reviewDurableContextV2Schema = z
  .object({
    version: z.literal(2),
    policyVersion: z.literal(7),
    requestId: z.string().uuid(),
    proposalId: z.string().min(1),
    revision: z.number().int().positive(),
    round: z.enum(["initial", "recheck"]),
    inputHash: hash,
    configurationHash: hash,
    sourceContextHash: hash,
    renderHashes: z
      .array(
        z.object({ slideIndex: z.number().int().min(0).max(9), hash }).strict()
      )
      .min(1)
      .max(10),
    anchorInventory: z.array(
      z
        .object({
          alias: z.string().regex(/^e[1-9]\d*$/),
          anchorId: hash,
          slideIndex: z.number().int().min(0).max(9),
          fieldId: z.string().min(1),
          itemIndex: z.number().int().min(0).nullable(),
          start: z.number().int().min(0),
          end: z.number().int().positive(),
          quote: z.string().min(1).max(500),
          textHash: hash,
        })
        .strict()
    ),
    aliasMap: z.record(z.string(), hash),
    textUnitInventory: z.array(textUnitV7Schema),
    profile: z.enum(["standard", "extended"]),
  })
  .strict();
export type ProposalReviewDurableContextV2 = z.infer<
  typeof reviewDurableContextV2Schema
>;
