import { z } from "zod";

export const activeGenerationModelSchema = z.enum(["auto", "gemini", "claude", "deepseek"]);
export type ActiveGenerationModel = z.infer<typeof activeGenerationModelSchema>;

/** Public choice is deliberately an enum; provider slugs belong to the server.
 * Retains 'gpt' strictly for backward compatibility with historical receipts.
 */
export const generationModelSchema = z.enum(["auto", "gemini", "claude", "deepseek", "gpt"]);
export type GenerationModel = z.infer<typeof generationModelSchema>;

/** Pinned only for new strategy-2 requests; absent on historical receipts. */
export const preparationBudgetSchema = z.object({
  version: z.literal(1),
  intentTimeoutMs: z.number().int().min(1).max(180_000),
  selectionTimeoutMs: z.number().int().min(1).max(180_000),
  downstreamReserveMs: z.number().int().min(1).max(300_000),
  catalogEncoding: z.literal(2),
}).strict();

/** Capabilities and endpoint prices proven by the 2026-11-06 routing evidence.
 * This version is immutable: a policy change needs a new routing version.
 */
const taskModelBaseSchema = z.object({
  reasoningEffort: z.literal("none"),
  reasoningEnabled: z.literal(false),
  structuredOutputMode: z.literal("native_schema"),
  transportTimeoutMs: z.number().int().min(1).max(180_000),
}).strict();
const deepSeekTaskModelSchema = taskModelBaseSchema.extend({
  model: z.literal("deepseek/deepseek-v4.1-flash"),
  providerEndpoint: z.literal("deepinfra/fp8"),
  maxPrice: z.object({ prompt: z.literal(0.1414), completion: z.literal(0.4242) }).strict(),
});
export const generationCopyTaskModelSchema = taskModelBaseSchema.extend({
  model: z.literal("anthropic/claude-haiku-5.5"),
  providerEndpoint: z.literal("anthropic"),
  maxPrice: z.object({ prompt: z.literal(0.101), completion: z.literal(0.505) }).strict(),
});
// V1 remains strict and immutable; only V2 may use compatible providers of the
// same DeepSeek model when its preferred provider has no allowed endpoint.
const deepSeekTaskModelV2Schema = deepSeekTaskModelSchema.extend({
  providerEndpoint: z.literal("deepinfra"),
  allowProviderFallbacks: z.literal(true),
});
export const generationTaskModelSchema = z.union([deepSeekTaskModelSchema, generationCopyTaskModelSchema, deepSeekTaskModelV2Schema]);
export type GenerationTaskModelConfig = z.infer<typeof generationTaskModelSchema>;
export type GenerationTaskStage = "intent" | "copy" | "repair";
const generationTaskRoutingV1Schema = z.object({
  version: z.literal(1),
  policy: z.literal("deepseek_haiku_v1"),
  intent: deepSeekTaskModelSchema,
  copy: generationCopyTaskModelSchema,
  repair: deepSeekTaskModelSchema,
}).strict();
const generationTaskRoutingV2Schema = z.object({
  version: z.literal(2),
  policy: z.literal("deepseek_haiku_v2"),
  intent: deepSeekTaskModelV2Schema,
  copy: generationCopyTaskModelSchema,
  repair: deepSeekTaskModelV2Schema,
}).strict();
export const generationTaskRoutingSchema = z.discriminatedUnion("version", [generationTaskRoutingV1Schema, generationTaskRoutingV2Schema]);

/** Immutable admission receipt. Old requests legitimately have no receipt. */
export const generationModelConfigSchema = z.object({
  version: z.literal(1),
  generationStrategyVersion: z.union([z.literal(1), z.literal(2)]),
  choice: generationModelSchema,
  model: z.string().min(1),
  reasoningEffort: z.enum(["none", "minimal", "low", "medium"]),
  structuredOutputMode: z.enum(["text_schema", "native_schema"]),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  /** Absent on historical receipts that use the original fit thresholds. */
  layoutFitPolicy: z.enum(["subpixel_v1", "adaptive_v2"]).optional(),
  /** Absent means the exact historical prompt/schema must be replayed. */
  editorialIntentVersion: z.literal(1).optional(),
  preparationBudget: preparationBudgetSchema.optional(),
  /** Absent on historical/manual receipts: never infer a new route on resume. */
  taskRouting: generationTaskRoutingSchema.optional(),
  configurationHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((config, context) => {
  if ((config.choice === "auto") !== Boolean(config.taskRouting)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "auto_requires_task_routing", path: ["taskRouting"] });
  }
  if (config.taskRouting && (config.generationStrategyVersion !== 2 ||
      config.model !== config.taskRouting.copy.model || config.reasoningEffort !== "none" ||
      config.structuredOutputMode !== "native_schema" || config.temperature !== undefined || config.topP !== undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "task_routing_configuration_mismatch", path: ["taskRouting"] });
  }
});
export type GenerationModelConfig = z.infer<typeof generationModelConfigSchema>;

export const GENERATION_MODEL_LABELS: Record<ActiveGenerationModel, string> = {
  auto: "Automático",
  claude: "Claude Haiku 5.5",
  deepseek: "DeepSeek V4.1 Flash",
  gemini: "Gemini 3.8 Flash",
};

export const GENERATION_MODEL_HINTS: Record<ActiveGenerationModel, string> = {
  auto: "Equilíbrio entre criatividade, qualidade e custo.",
  claude: "Escrita natural e expressiva em português.",
  deepseek: "Textos diretos e objetivos.",
  gemini: "Modelo versátil para criação de conteúdo.",
};

export function getGenerationModelHint(model?: string): string {
  if (model === "auto" || model === undefined) return GENERATION_MODEL_HINTS.auto;
  if (model === "claude") return GENERATION_MODEL_HINTS.claude;
  if (model === "deepseek") return GENERATION_MODEL_HINTS.deepseek;
  if (model === "gemini") return GENERATION_MODEL_HINTS.gemini;
  return GENERATION_MODEL_HINTS.claude;
}

/** Admission identifies the protocol even when preparation never completed. */
export function generationUsesPlanning(request: { generation_config?: unknown; generationConfig?: unknown; prepared?: unknown }) {
  const config = generationModelConfigSchema.safeParse(request.generation_config ?? request.generationConfig);
  return config.success && config.data.generationStrategyVersion === 2 ||
    (request.prepared as { preparationVersion?: number } | null)?.preparationVersion === 6;
}
