import { z } from "zod";
import { generationIntentSchema } from "./generationPlan";
import {
  findingV7Schema,
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
