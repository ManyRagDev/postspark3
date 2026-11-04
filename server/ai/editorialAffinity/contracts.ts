import { z } from "zod";
import { createHash } from "node:crypto";

/** Order-independent JSON hash, including model/tokenizer/scoring configuration. */
export function affinityHash(value: unknown): string {
  const canonical = (item: any): any =>
    Array.isArray(item)
      ? item.map(canonical)
      : item !== null && typeof item === "object"
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .filter(key => item[key] !== undefined)
              .map(key => [key, canonical(item[key])])
          )
        : item;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const cosine = z.number().finite().min(-1).max(1);
export const affinityScoreSchema = z
  .object({
    profileId: z.string().min(1),
    familyId: z.string().min(1),
    sourceHash: z.string().min(1),
    score: cosine,
    references: z
      .array(
        z
          .object({
            id: z.string().min(1),
            dimension: z.string().min(1),
            score: cosine,
          })
          .strict()
      )
      .min(1)
      .max(16),
  })
  .strict();

export const editorialAffinityReceiptSchema = z
  .object({
    version: z.literal(1),
    mode: z.literal("shadow"),
    status: z.enum(["scored", "insufficient_input", "unavailable"]),
    inputHash: digest,
    /** This receipt describes the submitted text/options, not facts read later from URLs/images. */
    inputScope: z.literal("submitted_text_v1"),
    configurationHash: digest.nullable(),
    modelId: z.string().min(1).nullable(),
    artifactHash: digest.nullable(),
    profilesHash: digest.nullable(),
    scoringVersion: z.literal(1),
    tokenCount: z.number().int().nonnegative().nullable(),
    truncated: z.literal(false),
    scores: z.array(affinityScoreSchema).max(1000),
    reason: z
      .enum([
        "empty",
        "input_limit",
        "token_limit",
        "model_unavailable",
        "invalid_artifact",
        "busy",
        "timeout",
        "aborted",
        "invalid_output",
        "not_configured",
      ])
      .nullable(),
    latencyMs: z.number().finite().nonnegative(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.status === "scored" &&
      (!value.scores.length ||
        !value.configurationHash ||
        !value.modelId ||
        !value.artifactHash ||
        !value.profilesHash ||
        value.tokenCount === null ||
        value.reason !== null)
    )
      ctx.addIssue({
        code: "custom",
        message: "Scored affinity requires complete provenance",
      });
    if (value.status !== "scored" && (value.scores.length || !value.reason))
      ctx.addIssue({
        code: "custom",
        message: "Abstention cannot contain scores",
      });
    if (
      new Set(value.scores.map(score => score.profileId)).size !==
      value.scores.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Duplicate repertoire identity",
      });
  });
export type EditorialAffinityReceipt = z.infer<
  typeof editorialAffinityReceiptSchema
>;

export const modelManifestSchema = z
  .object({
    version: z.literal(1),
    modelId: z.string().min(1),
    revision: z.string().regex(/^[a-f0-9]{40}$/),
    dimensions: z.number().int().positive().max(4096),
    maxTokens: z.number().int().min(4).max(8192),
    dtype: z.enum(["q8", "fp32"]),
    queryPrefix: z.string().max(256),
    referencePrefix: z.string().max(256),
    files: z.record(z.string().min(1), digest),
  })
  .strict();
export type EditorialModelManifest = z.infer<typeof modelManifestSchema>;

export const affinityBundleSchema = z
  .object({
    version: z.literal(1),
    scoringVersion: z.literal(1),
    model: modelManifestSchema,
    embeddingFingerprint: digest,
    profilesHash: digest,
    references: z
      .array(
        z
          .object({
            profileId: z.string().min(1),
            referenceId: z.string().min(1),
            vector: z.array(z.number().finite()).min(1).max(4096),
          })
          .strict()
      )
      .min(1)
      .max(16000),
    hash: digest,
  })
  .strict();
export type EditorialAffinityBundle = z.infer<typeof affinityBundleSchema>;
