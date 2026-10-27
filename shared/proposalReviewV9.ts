import { z } from "zod";
import { arsenalHash } from "./arsenalContent";
import {
  proposalReviewRecordV8Schema,
  proposalReviewResponseV8Schema,
  reviewExecutionConfigV3Schema,
  reviewDurableContextV3Schema,
} from "./proposalReviewV8";
export const proposalReviewResponseV9Schema = proposalReviewResponseV8Schema;
export const proposalReviewRecordV9Schema = z
  .object({
    ...proposalReviewRecordV8Schema.shape,
    policyVersion: z.literal(9),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (
      !proposalReviewRecordV8Schema.safeParse({ ...r, policyVersion: 8 })
        .success
    )
      ctx.addIssue({ code: "custom", message: "Revisão material inválida" });
  });
export type ProposalReviewRecordV9 = z.infer<
  typeof proposalReviewRecordV9Schema
>;
export const reviewExecutionConfigV4Schema =
  reviewExecutionConfigV3Schema.extend({
    version: z.literal(4),
    policyVersion: z.literal(9),
    editorialGuidanceVersion: z.literal(8),
    extendedTimeoutMs: z.literal(90000),
  });
export type ReviewExecutionConfigV4 = z.infer<
  typeof reviewExecutionConfigV4Schema
>;
export const reviewDurableContextV4Schema = reviewDurableContextV3Schema.extend(
  { version: z.literal(4), policyVersion: z.literal(9) }
);
export type ProposalReviewDurableContextV4 = z.infer<
  typeof reviewDurableContextV4Schema
>;
