import { z } from "zod";
import { generationCopyTaskModelSchema } from "./generationModel";
import { generationIntentSchema } from "./generationPlan";
import {
  materialFindingV7,
  findingV7Schema,
  proposalReviewRecordV7Schema,
  proposalReviewResponseV7Schema,
} from "./proposalReviewV7";
import {
  proposalReviewRecordV9Schema,
  reviewDurableContextV4Schema,
  reviewExecutionConfigV4Schema,
} from "./proposalReviewV9";

const id = z.string().min(1);
const explanation = z.string().trim().min(1).max(1500);
export const reviewSourceEvidenceV10Schema = z
  .object({
    id,
    sourceId: id,
    origin: id,
    kind: z.enum(["content", "guidance", "requirement"]),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    text: z.string().min(1).max(4000),
  })
  .strict();
export type ReviewSourceEvidenceV10 = z.infer<
  typeof reviewSourceEvidenceV10Schema
>;

/** Every unit needs an actual judgment, including mixed factual/editorial language.
 * These are reviewer assertions, not a programmatic proof of semantic truth. */
export const unitCheckV10Schema = z
  .object({
    unitId: id,
    meaning: explanation,
    verdict: z.enum(["supported", "unsupported", "uncertain", "editorial"]),
    evidenceIds: z.array(id),
    editorialBasis: z
      .enum([
        "invitation",
        "question",
        "opinion",
        "metaphor",
        "heading",
        "instruction",
      ])
      .nullable(),
    explanation,
  })
  .strict();
export const intentCheckV10Schema = z
  .object({
    requirementId: id,
    status: z.enum(["met", "missing", "uncertain"]),
    deliveries: z.array(
      z.object({ contentId: id, unitIds: z.array(id).min(1) }).strict()
    ),
    explanation,
  })
  .strict();
export const sequenceAssessmentV10Schema = z
  .object({
    status: z.enum(["coherent", "material_gap", "uncertain"]),
    explanation: z.string().max(1500),
    // A delivered item is a meaning, potentially expressed by several native units.
    promises: z
      .array(
        z
          .object({
            unitId: id,
            expectedCount: z.number().int().min(1).max(100).nullable(),
            deliveredItems: z
              .array(
                z
                  .object({
                    meaning: explanation,
                    unitIds: z.array(id).min(1),
                  })
                  .strict()
              )
              .max(100),
            status: z.enum(["fulfilled", "missing", "uncertain"]),
            explanation,
          })
          .strict()
      )
      .max(40),
  })
  .strict();
const finding = findingV7Schema
  .pick({
    category: true,
    expected: true,
    explanation: true,
    consequence: true,
    certainty: true,
  })
  .extend({
    unitId: id.nullable(),
    // Only needed for a problem in pixels without a native text unit.
    slideIndex: z.number().int().min(0).max(9).nullable(),
    observedInImage: z.string().max(4000),
    evidenceIds: z.array(id),
  })
  .strict();
export const proposalReviewResponseV10Schema = z
  .object({
    outcome: proposalReviewResponseV7Schema.shape.outcome,
    limitation: proposalReviewResponseV7Schema.shape.limitation,
    reviewedSlides: proposalReviewResponseV7Schema.shape.reviewedSlides,
    requirementChecks: proposalReviewResponseV7Schema.shape.requirementChecks,
    messageAssessment: proposalReviewResponseV7Schema.shape.messageAssessment,
    unitChecks: z.array(unitCheckV10Schema),
    intentChecks: z.array(intentCheckV10Schema),
    sequenceAssessment: sequenceAssessmentV10Schema,
    findings: z.array(finding).max(40),
  })
  .strict();
export type ReviewResponseV10 = z.infer<typeof proposalReviewResponseV10Schema>;

/** Native transport narrows only the two requirement namespaces. Exact IDs and
 * counts reduce invalid provider output; uniqueness, source support and material
 * correctness remain the responsibility of the unchanged local V10 validator. */
export function reviewResponseInventorySchemaV10(inventories: {
  requirementChecks: readonly string[];
  intentChecks: readonly string[];
}, automaticReviewVersion?: 2 | 3) {
  const pinnedId = (ids: readonly string[]) => ids.length
    ? z.enum([...ids] as [string, ...string[]])
    : id;
  const inventorySchema = proposalReviewResponseV10Schema.extend({
    requirementChecks: z.array(proposalReviewResponseV10Schema.shape.requirementChecks.element.extend({
      requirementId: pinnedId(inventories.requirementChecks),
    })).length(inventories.requirementChecks.length),
    intentChecks: z.array(intentCheckV10Schema.extend({
      requirementId: pinnedId(inventories.intentChecks),
    })).length(inventories.intentChecks.length),
  });
  if (automaticReviewVersion !== 3) return inventorySchema;
  // Native grammar prevents a material category from denying its own harm.
  // Keep the historical schema unchanged: old receipts pin its exact JSON hash.
  const material = finding.extend({
    category: z.enum(["unsupported_claim", "factual_contradiction", "entity_changed", "fact_omission", "explicit_requirement", "visible_text_loss", "media_missing"]),
    consequence: z.enum(["false_claim", "lost_condition", "identity", "explicit_requirement", "meaning_loss", "unusable_art"]),
  });
  const aesthetic = finding.extend({ category: z.literal("aesthetic"), consequence: z.literal("none") });
  const remaining = finding.extend({ category: z.enum(["contrast", "narrative_gap", "narrative_structure"]) });
  return inventorySchema.extend({ findings: z.array(z.union([material, aesthetic, remaining])).max(40) });
}

export const proposalReviewRecordV10Schema = z
  .object({
    ...proposalReviewRecordV9Schema.shape,
    policyVersion: z.literal(10),
    evidenceInventory: z.array(reviewSourceEvidenceV10Schema),
    unitChecks: z.array(unitCheckV10Schema),
    intentRequirements: generationIntentSchema.shape.requirements,
    intentChecks: z.array(intentCheckV10Schema),
    findingEvidence: z.array(
      z
        .object({
          findingIndex: z.number().int().nonnegative(),
          evidenceIds: z.array(id),
        })
        .strict()
    ),
    sequenceAssessment: sequenceAssessmentV10Schema,
  })
  .strict()
  .superRefine((record, ctx) => {
    const {
      evidenceInventory,
      unitChecks,
      sequenceAssessment,
      intentRequirements,
      intentChecks,
      findingEvidence,
      ...legacy
    } = record;
    if (
      !proposalReviewRecordV9Schema.safeParse({ ...legacy, policyVersion: 9 })
        .success
    )
      ctx.addIssue({
        code: "custom",
        message: "Contrato material de revisão inválido",
      });
    const issue = () =>
      ctx.addIssue({
        code: "custom",
        message: "Evidência V10 incompleta ou divergente",
      });
    if (
      new Set(evidenceInventory.map(e => e.id)).size !==
        evidenceInventory.length ||
      evidenceInventory.some(
        e => e.end <= e.start || e.end - e.start !== e.text.length
      )
    )
      issue();
    if (
      new Set(unitChecks.map(u => u.unitId)).size !== unitChecks.length ||
      unitChecks.some(
        u =>
          new Set(u.evidenceIds).size !== u.evidenceIds.length ||
          u.evidenceIds.some(id => !evidenceInventory.some(e => e.id === id))
      )
    )
      issue();
    if (
      record.status !== "inconclusive" &&
      (unitChecks.length !== record.checkedTextUnits.length ||
        unitChecks.some(u => !record.checkedTextUnits.includes(u.unitId)))
    )
      issue();
    for (const check of unitChecks) {
      if (
        check.verdict === "editorial"
          ? !check.editorialBasis || check.evidenceIds.length > 0
          : check.editorialBasis !== null
      )
        issue();
      if (
        check.verdict === "supported" &&
        (!check.evidenceIds.length ||
          check.evidenceIds.some(
            id => evidenceInventory.find(e => e.id === id)?.kind !== "content"
          ))
      )
        issue();
      const audit = record.factualAudit.units.find(
        u => u.unitId === check.unitId
      );
      if (
        !audit ||
        (check.verdict === "editorial"
          ? audit.classification !== "non_factual"
          : !audit.claimIds.length)
      )
        issue();
      const expectedClaims = record.factualAudit.claims.filter(
        c => c.unitId === check.unitId
      );
      if (
        check.verdict === "editorial"
          ? expectedClaims.length !== 0
          : expectedClaims.length !== 1 ||
            expectedClaims[0].status !== check.verdict
      )
        issue();
    }
    if (
      findingEvidence.some(
        f =>
          f.findingIndex >= record.findings.length ||
          f.evidenceIds.some(id => !evidenceInventory.some(e => e.id === id))
      )
    )
      issue();
    if (
      new Set(intentChecks.map(c => c.requirementId)).size !==
        intentChecks.length ||
      (record.status !== "inconclusive" &&
        intentChecks.length !== intentRequirements.length)
    )
      issue();
    for (const check of intentChecks) {
      const requirement = intentRequirements.find(
        r => r.id === check.requirementId
      );
      if (
        !requirement ||
        check.deliveries.some(d =>
          d.unitIds.some(id => !record.checkedTextUnits.includes(id))
        ) ||
        new Set(check.deliveries.map(d => d.contentId)).size !==
          check.deliveries.length
      )
        issue();
      if (
        record.status === "passed" &&
        requirement?.origin === "explicit" &&
        (check.status !== "met" ||
          !check.deliveries.length ||
          (requirement.itemCount !== null &&
            check.deliveries.length < requirement.itemCount))
      )
        issue();
    }
    if (
      new Set(sequenceAssessment.promises.map(p => p.unitId)).size !==
        sequenceAssessment.promises.length ||
      sequenceAssessment.promises.some(
        p =>
          !record.checkedTextUnits.includes(p.unitId) ||
          p.deliveredItems.some(item =>
            item.unitIds.some(id => !record.checkedTextUnits.includes(id))
          )
      )
    )
      issue();
    if (
      record.status === "passed" &&
      (unitChecks.some(
        u => u.verdict === "unsupported" || u.verdict === "uncertain"
      ) ||
        sequenceAssessment.status !== "coherent" ||
        sequenceAssessment.promises.some(
          p =>
            p.status !== "fulfilled" ||
            (p.expectedCount !== null &&
              p.expectedCount > p.deliveredItems.length)
        ))
    )
      issue();
  });
export type ProposalReviewRecordV10 = z.infer<
  typeof proposalReviewRecordV10Schema
>;
export const reviewExecutionConfigV5Schema =
  reviewExecutionConfigV4Schema.extend({
    version: z.literal(5),
    policyVersion: z.literal(10),
    editorialGuidanceVersion: z.literal(9),
    /** Automatic transport overrides legacy sampling fields; absent on historical/manual receipts. */
    taskModelConfig: generationCopyTaskModelSchema.optional(),
    /** Absent retains the historical unconstrained native response schema. */
    nativeInventoryVersion: z.literal(1).optional(),
    /** New automatic admissions: compact review and conservative local namespace recovery. */
    automaticReviewVersion: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
    /** New automatic admissions only; absence preserves historical colors/handles. */
    localContrastPolicyVersion: z.literal(1).optional(),
    textFlexibilityVersion: z.literal(1).optional(),
    /** Uses the pinned vision evaluator for the existing copy recovery purchase. */
    visualTextRepairVersion: z.literal(1).optional(),
    profileHandlePolicyVersion: z.literal(1).optional(),
    nativeGlyphProjection: z.literal(1).optional(),
    nativeGlyphManifestHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  });
export type ReviewExecutionConfigV5 = z.infer<
  typeof reviewExecutionConfigV5Schema
>;
export const reviewDurableContextV5Schema = reviewDurableContextV4Schema.extend(
  {
    version: z.literal(5),
    policyVersion: z.literal(10),
    evidenceInventory: z.array(reviewSourceEvidenceV10Schema),
  }
);
export type ProposalReviewDurableContextV5 = z.infer<
  typeof reviewDurableContextV5Schema
>;

/** Automatic V4 reports exceptions, never synthetic positive per-unit judgments. */
export const proposalReviewExceptionsResponseV10Schema = z.object({
  status: z.enum(["reviewed", "partial", "unavailable"]),
  reviewedSlides: z.array(z.number().int().min(0).max(9)).max(10),
  limitation: z.string().min(1).max(1500).nullable(),
  findings: z.array(z.object({
    targetId: z.string().min(1).max(120),
    category: findingV7Schema.shape.category.exclude(["aesthetic"]),
    consequence: findingV7Schema.shape.consequence,
    certainty: findingV7Schema.shape.certainty,
    evidenceIds: z.array(z.string().min(1)),
    detail: z.string().min(1).max(1500),
    expected: z.string().max(4000),
  }).strict()).max(40),
}).strict();
export type ReviewExceptionsResponseV10 = z.infer<typeof proposalReviewExceptionsResponseV10Schema>;
export const proposalReviewExceptionsRecordV10Schema = z.object({
  policyVersion: z.literal(10), automaticReviewVersion: z.literal(4),
  round: z.enum(["initial", "recheck"]), inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["passed", "correction_required", "inconclusive"]),
  inspectionStatus: proposalReviewExceptionsResponseV10Schema.shape.status,
  expectedSlideCount: z.number().int().min(1).max(10),
  reviewedSlides: proposalReviewExceptionsResponseV10Schema.shape.reviewedSlides,
  findings: proposalReviewRecordV7Schema.shape.findings,
  limitation: z.string().max(1500),
  operationKeys: z.array(z.string().min(1)).max(2),
  rawResponseHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  evidenceInventory: z.array(reviewSourceEvidenceV10Schema),
}).strict().superRefine((r,ctx)=>{
  const bad=()=>ctx.addIssue({code:"custom",message:"Recibo de revisão por exceções inconsistente"});
  const complete=r.reviewedSlides.length===r.expectedSlideCount&&new Set(r.reviewedSlides).size===r.expectedSlideCount&&r.reviewedSlides.every((i)=>i<r.expectedSlideCount);
  const uncertain=r.findings.some(f=>f.effect==="blocking"&&f.certainty==="uncertain");
  const blocking=r.findings.some(f=>f.effect==="blocking");
  const expected=r.inspectionStatus!=="reviewed"||r.limitation||uncertain?"inconclusive":blocking?"correction_required":"passed";
  if(new Set(r.reviewedSlides).size!==r.reviewedSlides.length||r.reviewedSlides.some(i=>i>=r.expectedSlideCount)||r.findings.some(f=>f.effect!==(materialFindingV7(f)?"blocking":"advisory"))||r.status!==expected || (r.inspectionStatus==="reviewed"&&!complete) ||
    (r.status!=="inconclusive"&&(!r.rawResponseHash||!r.operationKeys.length)) ||
    (r.status==="inconclusive"&&!r.limitation.trim()) ||
    new Set(r.operationKeys).size!==r.operationKeys.length ||
    r.operationKeys.some((key,i)=>i===0?!key.endsWith(`:review:${r.round}:${r.inputHash}`):!new RegExp(`:review_evidence_repair:${r.round}:[a-f0-9]{64}$`).test(key)))bad();
});
export type ProposalReviewExceptionsRecordV10 = z.infer<typeof proposalReviewExceptionsRecordV10Schema>;
