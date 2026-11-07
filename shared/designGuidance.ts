import { z } from "zod";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
/** Authored guidance travels with the immutable design; cards are projections of it. */
export const designGuidanceSchema = z
  .object({
    version: z.literal(1),
    visualFeatures: z.object({
      chromaticPortal: z.tuple([z.string().min(1), z.string().min(1)]),
    }).strict().optional(),
    selection: z.object({version:z.literal(1), description:z.string().min(1).max(400), axes:z.object({organization:z.string().min(1).max(60),density:z.string().min(1).max(60),typography:z.string().min(1).max(60),imageRole:z.string().min(1).max(60)}).strict()}).strict().optional(),
    representation: z
      .object({
        version: z.literal(3),
        sourceId: z.string().uuid(),
        sourceHash: hash,
        method: z.literal("native_semantics_rebuild"),
      })
      .strict()
      .optional(),
    familyIdentity: z
      .object({
        essential: z.array(z.string()).min(1).max(20),
        optional: z.array(z.string()).max(20),
        adaptable: z.array(z.string()).max(20),
      })
      .strict()
      .optional(),
    fieldRelationships: z
      .array(
        z
          .object({
            kind: z.enum([
              "contrast",
              "emphasis",
              "sequence",
              "image_reference",
              "independent_items",
            ]),
            sources: z.array(z.string()).min(1),
            label: z.string(),
          })
          .strict()
      )
      .max(30)
      .optional(),
    carouselVariant: z
      .discriminatedUnion("version", [
        z
          .object({
            version: z.literal(1),
            role: z.enum(["development", "closing"]),
            sourceId: z.string().uuid(),
            sourceHash: hash,
          })
          .strict(),
        z
          .object({
            version: z.literal(2),
            role: z.enum(["development", "closing"]),
            sourceId: z.string().uuid(),
            sourceHash: hash,
            contentMode: z.enum(["compose", "literal"]),
          })
          .strict(),
        z
          .object({
            version: z.literal(3),
            role: z.enum(["development", "closing"]),
            sourceId: z.string().uuid(),
            sourceHash: hash,
            contentMode: z.enum(["compose", "literal"]),
            function: z.enum([
              "reading",
              "list",
              "comparison",
              "image_commentary",
              "highlight",
              "synthesis",
            ]),
            identity: z.array(z.string().min(1)).min(1).max(20),
          })
          .strict(),
      ])
      .optional(),
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
