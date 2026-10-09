import { z } from "zod";
import {
  completeDesignVariationV1Schema,
  type CompleteDesignVariationV1,
} from "./completeDesignGeneration";
import {
  studioPreferencesSchema,
  defaultStudioPreferences,
} from "./studioPreferences";

/** Proposal lifecycle states according to Blueprint §9 */
export const proposalStateSchema = z.enum([
  "planned",
  "running",
  "waiting_input",
  "checking",
  "recovering",
  "delivery_pending",
  "ready",
  "failed",
  "cancelled",
  "expired",
]);
export type ProposalState = z.infer<typeof proposalStateSchema>;

/** Technical finding for objective, measurable defects only (Blueprint §8) */
export const technicalFindingSchema = z.object({
  rule: z.string(),
  target: z.string(), // e.g. "slide-1:field-0" or "media:photo"
  severity: z.enum(["warning", "fatal"]),
  evidence: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type TechnicalFinding = z.infer<typeof technicalFindingSchema>;

/** Non-blocking observations do not participate in V1 readiness decisions. */
export const proposalDiagnosticSchema = z
  .object({
    code: z.string().min(1),
    target: z.string().min(1),
    evidence: z.string().min(1),
  })
  .strict();
export type ProposalDiagnostic = z.infer<typeof proposalDiagnosticSchema>;

export const imageTaskPurposeSchema = z.enum([
  "editorial-photo",
  "product",
  "illustration",
  "series",
  "conceptual",
  "none",
]);
export type ImageTaskPurpose = z.infer<typeof imageTaskPurposeSchema>;

/** Image task contract for native media slots (Blueprint §6.2 / §6.3) */
export const imageTaskContractSchema = z.object({
  slotId: z.string(),
  slideIndex: z.number().int().min(0),
  purpose: imageTaskPurposeSchema.default("editorial-photo"),
  prompt: z.string(),
  aspectRatio: z.enum(["1:1", "4:5", "5:6", "9:16", "16:9"]).default("4:5"),
  required: z.boolean().default(true),
  scene: z.string().optional(),
  guidance: z
    .object({
      light: z.string().optional(),
      mood: z.string().optional(),
      materials: z.string().optional(),
    })
    .optional(),
  requiredCapabilities: z
    .array(z.string())
    .default(["image-output"]),
  status: z.enum(["pending", "fulfilled", "failed"]).default("pending"),
});
export type ImageTaskContract = z.infer<typeof imageTaskContractSchema>;

/** Pre-selection image obligation (Blueprint §6.1 / §21) */
export const imageObligationSchema = z
  .object({
    policy: z.enum(["forbidden", "required", "optional"]).default("optional"),
    required: z.boolean(),
    purpose: imageTaskPurposeSchema.default("none"),
    reason: z.string(),
    slotTargets: z.number().int().min(0).default(0),
  })
  .strict();
export type ImageObligation = z.infer<typeof imageObligationSchema>;

const proposalDeliveryBase = z.object({
  contractVersion: z.literal(1).default(1),
  proposalId: z.string().min(1),
  runId: z.string().uuid(),
  slot: z.number().int().min(0).max(2),
  revision: z.number().int().min(1).default(1),
  findings: z.array(technicalFindingSchema).default([]),
  diagnostics: z.array(proposalDiagnosticSchema).default([]),
  errorReason: z.string().optional(),
  completedAt: z.number().finite().optional(),
});

/** Versioned lifecycle union: a ready proposal is always a complete canonical bundle. */
export const proposalDeliverySchema = z
  .discriminatedUnion("status", [
    proposalDeliveryBase
      .extend({
        status: z.literal("ready"),
        bundle: completeDesignVariationV1Schema,
      })
      .strict(),
    proposalDeliveryBase.extend({ status: z.literal("planned") }).strict(),
    proposalDeliveryBase.extend({ status: z.literal("running") }).strict(),
    proposalDeliveryBase
      .extend({ status: z.literal("waiting_input") })
      .strict(),
    proposalDeliveryBase.extend({ status: z.literal("checking") }).strict(),
    proposalDeliveryBase.extend({ status: z.literal("recovering") }).strict(),
    proposalDeliveryBase
      .extend({ status: z.literal("delivery_pending") })
      .strict(),
    proposalDeliveryBase.extend({ status: z.literal("failed") }).strict(),
    proposalDeliveryBase.extend({ status: z.literal("cancelled") }).strict(),
    proposalDeliveryBase.extend({ status: z.literal("expired") }).strict(),
  ])
  .superRefine((delivery, ctx) => {
    if (delivery.status !== "ready") return;
    if (delivery.bundle.runId !== delivery.runId)
      ctx.addIssue({
        code: "custom",
        path: ["bundle", "runId"],
        message: "Bundle runId diverge da entrega",
      });
    if (delivery.bundle.traceId !== delivery.runId)
      ctx.addIssue({
        code: "custom",
        path: ["bundle", "traceId"],
        message: "Bundle traceId diverge da entrega",
      });
    if (delivery.bundle.slot !== delivery.slot)
      ctx.addIssue({
        code: "custom",
        path: ["bundle", "slot"],
        message: "Bundle slot diverge da entrega",
      });
  });
export type ProposalDelivery = z.infer<typeof proposalDeliverySchema>;

/** Coordinator snapshot contract (Blueprint §5.1 / §12) */
export const generationCoordinatorSnapshotSchema = z.object({
  contractVersion: z.literal(1).default(1),
  requestId: z.string(),
  runId: z.string().uuid(),
  overallStatus: z.enum([
    "running",
    "completed",
    "partial",
    "failed",
    "cancelled",
  ]),
  proposals: z.array(proposalDeliverySchema),
  updatedAt: z.number(),
});
export type GenerationCoordinatorSnapshot = z.infer<
  typeof generationCoordinatorSnapshotSchema
>;

/** Shared defaults are the canonical source for callers that omit style preferences. */
export const proposalStudioPreferencesSchema = studioPreferencesSchema.default(
  defaultStudioPreferences
);
