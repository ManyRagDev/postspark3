import { z } from "zod";

export const activeGenerationModelSchema = z.enum(["gemini", "claude", "deepseek"]);
export type ActiveGenerationModel = z.infer<typeof activeGenerationModelSchema>;

/** Public choice is deliberately an enum; provider slugs belong to the server.
 * Retains 'gpt' strictly for backward compatibility with historical receipts.
 */
export const generationModelSchema = z.enum(["gemini", "claude", "deepseek", "gpt"]);
export type GenerationModel = z.infer<typeof generationModelSchema>;

/** Pinned only for new strategy-2 requests; absent on historical receipts. */
export const preparationBudgetSchema = z.object({
  version: z.literal(1),
  intentTimeoutMs: z.number().int().min(1).max(180_000),
  selectionTimeoutMs: z.number().int().min(1).max(180_000),
  downstreamReserveMs: z.number().int().min(1).max(300_000),
  catalogEncoding: z.literal(2),
}).strict();

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
  layoutFitPolicy: z.literal("subpixel_v1").optional(),
  /** Absent means the exact historical prompt/schema must be replayed. */
  editorialIntentVersion: z.literal(1).optional(),
  preparationBudget: preparationBudgetSchema.optional(),
  configurationHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type GenerationModelConfig = z.infer<typeof generationModelConfigSchema>;

export const GENERATION_MODEL_LABELS: Record<ActiveGenerationModel, string> = {
  claude: "Claude Haiku 5.5",
  deepseek: "DeepSeek V4.1 Flash",
  gemini: "Gemini 3.8 Flash",
};

export const GENERATION_MODEL_HINTS: Record<ActiveGenerationModel, string> = {
  claude: "Elegante e natural em português. Melhor vocabulário e rigor aos limites do layout.",
  deepseek: "Copy direto e persuasivo, com foco em dor e conversão.",
  gemini: "Equilibrado e ágil. Excelente consistência estrutural e leitura multimodal.",
};

export function getGenerationModelHint(model?: string): string {
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
