import { z } from "zod";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
/** Authored guidance travels with the immutable design; cards are projections of it. */
export const designGuidanceSchema = z
  .object({
    version: z.literal(1),
    carouselVariant: z.discriminatedUnion("version", [
      z.object({ version: z.literal(1), role: z.enum(["development", "closing"]), sourceId: z.string().uuid(), sourceHash: hash }).strict(),
      z.object({ version: z.literal(2), role: z.enum(["development", "closing"]), sourceId: z.string().uuid(), sourceHash: hash, contentMode: z.enum(["compose", "literal"]) }).strict(),
    ]).optional(),
    summary: z.string().min(1).max(1000),
    motifs: z.array(z.string().min(1).max(120)).max(12),
    preserve: z.array(z.string().min(1).max(1000)).max(20),
    contentRules: z.array(z.string().min(1).max(1000)).max(20),
    requiredTextTargets: z
      .array(z.string().min(1).max(160))
      .max(100)
      .optional(),
    mediaRules: z
      .array(
        z
          .object({
            slotId: z.string().min(1).max(160),
            instructions: z.array(z.string().min(1).max(1000)).min(1).max(20),
          })
          .strict()
      )
      .max(20),
    knownLimitations: z.array(z.string().min(1).max(1000)).max(30),
    original: z
      .object({
        sha256: hash,
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        fileName: z
          .string()
          .min(1)
          .max(240)
          .refine(name => !/[\\/]/.test(name), "original_file_name_only"),
      })
      .strict()
      .optional(),
  })
  .strict();
export type DesignGuidance = z.infer<typeof designGuidanceSchema>;
