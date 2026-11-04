import { createHash } from "node:crypto";
import { generationModelConfigSchema, type GenerationModel, type GenerationModelConfig } from "../../shared/generationModel";
import { ENV } from "../_core/env";

export const GPT_GENERATION_MODEL = "openai/gpt-6.1-sol";

/** Resolve once, before admission. Workers must consume the persisted receipt. */
export function resolveGenerationModelConfig(input: {
  generationModel?: GenerationModel;
  postMode: "static" | "carousel";
  slideCount?: number;
}): GenerationModelConfig {
  const choice = input.generationModel ?? "gemini";
  const config = {
    version: 1 as const,
    generationStrategyVersion: ENV.generationStrategyVersion,
    choice,
    ...(choice === "gpt" ? {
      model: GPT_GENERATION_MODEL,
      reasoningEffort: "medium" as const,
      structuredOutputMode: "native_schema" as const,
    } : choice === "claude" ? {
      model: ENV.openRouterClaudeModel,
      reasoningEffort: "none" as const,
      structuredOutputMode: "text_schema" as const,
      temperature: 0.35,
      topP: 0.85,
    } : choice === "deepseek" ? {
      model: ENV.openRouterDeepSeekModel,
      reasoningEffort: "none" as const,
      structuredOutputMode: "text_schema" as const,
      temperature: 0.4,
      topP: 0.85,
    } : {
      model: input.postMode === "carousel" ? ENV.openRouterCarouselModel : ENV.openRouterStaticModel,
      reasoningEffort: "low" as const,
      structuredOutputMode: "text_schema" as const,
      temperature: input.postMode === "carousel" ? 0.45 : 0.4,
      topP: 0.85,
    }),
    layoutFitPolicy: "subpixel_v1" as const,
    ...(ENV.generationStrategyVersion === 2 ? { editorialIntentVersion: 1 as const, preparationBudget: {
      version: 1 as const,
      intentTimeoutMs: 90_000,
      selectionTimeoutMs: input.postMode === "static" ? 90_000 : (input.slideCount ?? 5) > 5 ? 180_000 : 120_000,
      downstreamReserveMs: input.postMode === "static" ? 120_000 : Math.min(240_000, 75_000 + (input.slideCount ?? 5) * 15_000),
      catalogEncoding: 2 as const,
    } } : {}),
  };
  return generationModelConfigSchema.parse({
    ...config,
    configurationHash: createHash("sha256").update(JSON.stringify(config)).digest("hex"),
  });
}

/** Reserve the downstream journey without changing historical transport policy. */
export function preparationCallBudget(config: GenerationModelConfig, stage: "intent" | "selection", deadlineMs: number) {
  const budget = config.preparationBudget;
  return budget ? {
    transportTimeoutMs: stage === "intent" ? budget.intentTimeoutMs : budget.selectionTimeoutMs,
    deadlineMs: deadlineMs - budget.downstreamReserveMs,
  } : { deadlineMs };
}

/** Spread last in selection, copy and repairs. Review/media retain their own policy. */
export function generationModelCallOptions(config?: GenerationModelConfig) {
  if (!config) return {};
  return {
    pinnedModel: config.model,
    reasoningEffort: config.reasoningEffort,
    forceTextSchema: config.structuredOutputMode === "text_schema",
    temperature: config.temperature,
    topP: config.topP,
    disableFallback: true as const,
  };
}
