import { createHash } from "node:crypto";
import { generationModelConfigSchema, type GenerationModel, type GenerationModelConfig, type GenerationTaskModelConfig, type GenerationTaskStage } from "../../shared/generationModel";
import { ENV } from "../_core/env";

export const GPT_GENERATION_MODEL = "openai/gpt-6.1-sol";

function automaticTaskModel(stage: GenerationTaskStage) {
  return {
    ...(stage === "copy" ? {
      model: "anthropic/claude-haiku-5.5" as const,
      providerEndpoint: "anthropic" as const,
      maxPrice: { prompt: 0.101 as const, completion: 0.505 as const },
    } : {
      model: "deepseek/deepseek-v4.1-flash" as const,
      providerEndpoint: "deepinfra" as const,
      allowProviderFallbacks: true as const,
      maxPrice: { prompt: 0.1414 as const, completion: 0.4242 as const },
    }),
    reasoningEffort: "none" as const,
    reasoningEnabled: false as const,
    structuredOutputMode: "native_schema" as const,
    transportTimeoutMs: stage === "repair" ? 60_000 : 90_000,
  };
}

/** Resolve once, before admission. Workers must consume the persisted receipt. */
export function resolveGenerationModelConfig(input: {
  generationModel?: GenerationModel;
  postMode: "static" | "carousel";
  slideCount?: number;
}): GenerationModelConfig {
  const choice = input.generationModel ?? "auto";
  const generationStrategyVersion = choice === "auto" ? 2 : ENV.generationStrategyVersion;
  // Immutable stage policy; environment overrides remain available for manual choices.
  const taskRouting = choice === "auto" ? {
    version: 2 as const,
    policy: "deepseek_haiku_v2" as const,
    intent: automaticTaskModel("intent"),
    copy: automaticTaskModel("copy"),
    repair: automaticTaskModel("repair"),
  } : undefined;
  const config = {
    version: 1 as const,
    generationStrategyVersion,
    choice,
    ...(taskRouting ? {
      model: taskRouting.copy.model,
      reasoningEffort: "none" as const,
      structuredOutputMode: "native_schema" as const,
      taskRouting,
    } : choice === "gpt" ? {
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
    // Persist the policy before admission; historical jobs retain their original fit.
    layoutFitPolicy: choice === "auto" ? "adaptive_v2" as const : "subpixel_v1" as const,
    ...(generationStrategyVersion === 2 ? { editorialIntentVersion: 1 as const, preparationBudget: {
      version: 1 as const,
      intentTimeoutMs: 90_000,
      selectionTimeoutMs: input.postMode === "static" ? 90_000 : (input.slideCount ?? 5) > 5 ? 180_000 : 120_000,
      downstreamReserveMs: input.postMode === "static" ? 120_000 : Math.min(240_000, 75_000 + (input.slideCount ?? 5) * 15_000),
      catalogEncoding: 2 as const,
    } } : {}),
  };
  const admitted = generationModelConfigSchema.parse({
    ...config,
    configurationHash: createHash("sha256").update(JSON.stringify(config)).digest("hex"),
  });
  if (!taskRouting) return admitted;
  // Hash the normalized persisted policy, including every endpoint and ceiling.
  // Manual/historical receipts retain their original hash convention.
  const { configurationHash: _hash, ...snapshot } = admitted;
  return { ...snapshot, configurationHash: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex") };

}

/** Reserve the downstream journey without changing historical transport policy. */
export function preparationCallBudget(config: GenerationModelConfig, stage: "intent" | "selection", deadlineMs: number) {
  const budget = config.preparationBudget;
  return budget ? {
    transportTimeoutMs: stage === "intent" ? config.taskRouting?.intent.transportTimeoutMs ?? budget.intentTimeoutMs : budget.selectionTimeoutMs,
    deadlineMs: deadlineMs - budget.downstreamReserveMs,
  } : { deadlineMs };
}

/** Spread last in selection, copy and repairs. Review/media retain their own policy. */
export function generationModelCallOptions(config?: GenerationModelConfig) {
  if (!config) return {};
  if (config.taskRouting) return generationPinnedTaskModelCallOptions(config.taskRouting.copy);
  return {
    pinnedModel: config.model,
    reasoningEffort: config.reasoningEffort,
    forceTextSchema: config.structuredOutputMode === "text_schema",
    temperature: config.temperature,
    topP: config.topP,
    disableFallback: true as const,
  };
}

/** Resolve only from the admitted receipt; historical/manual stages keep one model. */
export function resolveGenerationTaskModel(config: GenerationModelConfig, stage: GenerationTaskStage) {
  return config.taskRouting?.[stage] ?? config;
}

export function generationPinnedTaskModelCallOptions(taskModelConfig: GenerationTaskModelConfig) {
  return {
    pinnedModel: taskModelConfig.model,
    reasoningEffort: taskModelConfig.reasoningEffort,
    forceTextSchema: false,
    taskModelConfig,
    transportTimeoutMs: taskModelConfig.transportTimeoutMs,
    disableFallback: true as const,
    disableStructuredRepair: true as const,
    maxTransportAttempts: 1,
  };
}

/** Spread last for the named stage. Review/media and JEV keep their own policies. */
export function generationTaskModelCallOptions(config: GenerationModelConfig | undefined, stage: GenerationTaskStage) {
  if (!config?.taskRouting) return generationModelCallOptions(config);
  return generationPinnedTaskModelCallOptions(config.taskRouting[stage]);
}
