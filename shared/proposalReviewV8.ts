import { z } from "zod";
import {
  proposalReviewResponseV7Schema,
  proposalReviewRecordV7Schema,
  reviewExecutionConfigV2Schema,
  reviewDurableContextV2Schema,
} from "./proposalReviewV7";

export const sourceRangeSchema = z
  .object({
    sourceId: z.string().min(1),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
  })
  .strict();
export const factualAuditSchema = z
  .object({
    units: z.array(
      z
        .object({
          unitId: z.string().min(1),
          classification: z.enum(["factual", "non_factual", "mixed"]),
          claimIds: z.array(z.string().min(1)),
        })
        .strict()
    ),
    claims: z.array(
      z
        .object({
          id: z.string().min(1),
          unitId: z.string().min(1),
          observed: z.string().min(1).max(4000),
          sources: z.array(sourceRangeSchema),
          status: z.enum(["supported", "unsupported", "uncertain"]),
          explanation: z.string().min(1).max(1500),
        })
        .strict()
    ),
  })
  .strict();
export const proposalReviewResponseV8Schema =
  proposalReviewResponseV7Schema.safeExtend({
    factualAudit: factualAuditSchema,
  });
export type ReviewResponseV8 = z.infer<typeof proposalReviewResponseV8Schema>;
export const proposalReviewRecordV8Schema = z
  .object({
    ...proposalReviewRecordV7Schema.shape,
    policyVersion: z.literal(8),
    factualAudit: factualAuditSchema,
  })
  .strict()
  .superRefine((r, ctx) => {
    const { factualAudit, ...base } = r;
    if (
      !proposalReviewRecordV7Schema.safeParse({ ...base, policyVersion: 7 })
        .success
    )
      ctx.addIssue({
        code: "custom",
        message: "Contrato material de revisão inválido",
      });
    const { units, claims } = r.factualAudit;
    const issue = () =>
      ctx.addIssue({
        code: "custom",
        message: "Auditoria factual incompleta ou incompatível com a decisão",
      });
    if (
      r.status !== "inconclusive" &&
      (units.length !== r.checkedTextUnits.length ||
        new Set(units.map(u => u.unitId)).size !== units.length ||
        units.some(u => !r.checkedTextUnits.includes(u.unitId)))
    )
      issue();
    if (
      new Set(claims.map(c => c.id)).size !== claims.length ||
      units.some(
        u =>
          new Set(u.claimIds).size !== u.claimIds.length ||
          (u.classification === "non_factual"
            ? u.claimIds.length > 0
            : !u.claimIds.length) ||
          u.claimIds.some(
            id => !claims.some(c => c.id === id && c.unitId === u.unitId)
          )
      ) ||
      claims.some(
        c =>
          !units.some(u => u.unitId === c.unitId && u.claimIds.includes(c.id))
      )
    )
      issue();
    if (
      claims.some(c => c.status === "supported" && !c.sources.length) ||
      (r.status === "passed" && claims.some(c => c.status !== "supported"))
    )
      issue();
  });
export type ProposalReviewRecordV8 = z.infer<
  typeof proposalReviewRecordV8Schema
>;
export const reviewExecutionConfigV3Schema =
  reviewExecutionConfigV2Schema.extend({
    version: z.literal(3),
    policyVersion: z.literal(8),
    editorialGuidanceVersion: z.literal(7),
  });
export type ReviewExecutionConfigV3 = z.infer<
  typeof reviewExecutionConfigV3Schema
>;
export const reviewDurableContextV3Schema = reviewDurableContextV2Schema.extend(
  { version: z.literal(3), policyVersion: z.literal(8) }
);
export type ProposalReviewDurableContextV3 = z.infer<
  typeof reviewDurableContextV3Schema
>;
