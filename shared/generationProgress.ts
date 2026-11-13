import { z } from "zod";

export const generationProgressSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(["queued", "running", "awaiting_reconciliation", "completed", "partial", "failed", "cancelled"]),
  deadlineAt: z.number(),
  billingPending: z.boolean(),
  error: z.string().nullable(),
  proposals: z.array(z.object({ proposalId: z.string(), revision: z.number(), status: z.string() })).max(3),
});
export type GenerationProgress = z.infer<typeof generationProgressSchema>;
