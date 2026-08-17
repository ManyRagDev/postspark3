import { ENV } from "../_core/env";
import type { AiModel } from "@shared/postspark";
import type { ProviderModelConfig } from "./providers/modelAdapters";

export type AiTaskRoute =
  | "content_strategy"
  | "static_generation"
  | "carousel_generation"
  | "vision_analysis"
  | "microcopy"
  | "fast_vision"
  | "post_evaluation"
  | "quality_revision"
  | "caption_synthesis"
  | "fallback_text_or_vision";

export type ModelCostConfig = {
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  platformFeePercent?: number;
};

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const GOOGLE_OPENAI_COMPAT_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

export const GROQ_TEXT_MODEL = "openai/gpt-oss-120b";
export const GROQ_SCOUT_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
export const GEMINI_FALLBACK_MODEL = "gemini-2.5-flash";

const MODEL_COSTS: Record<string, ModelCostConfig> = {
  "openai/gpt-5-mini": {
    inputCostPerMillion: 0.25,
    outputCostPerMillion: 2,
    platformFeePercent: ENV.openRouterPlatformFeePercent,
  },
  "openai/gpt-oss-120b": {
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
  },
  "meta-llama/llama-4-scout-17b-16e-instruct": {
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
  },
  "gemini-2.5-flash": {
    inputCostPerMillion: 0.3,
    outputCostPerMillion: 2.5,
  },
};

function normalizeModelForCost(model: string): string {
  if (model.startsWith("openai/gpt-5-mini")) return "openai/gpt-5-mini";
  if (model.startsWith("gemini-2.5-flash")) return "gemini-2.5-flash";
  return model;
}

export function getModelCostConfig(model: string): ModelCostConfig {
  return MODEL_COSTS[normalizeModelForCost(model)] ?? {
    inputCostPerMillion: ENV.llmInputCostPerMillion,
    outputCostPerMillion: ENV.llmOutputCostPerMillion,
  };
}

export function estimateModelCostUsd(input: {
  model: string;
  promptTokens: number;
  completionTokens: number;
}): number {
  const costs = getModelCostConfig(input.model);
  const base =
    (input.promptTokens / 1_000_000) * costs.inputCostPerMillion +
    (input.completionTokens / 1_000_000) * costs.outputCostPerMillion;
  return base * (1 + (costs.platformFeePercent ?? 0) / 100);
}

function openRouterConfig(model: string): ProviderModelConfig {
  if (!ENV.openRouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is required for the selected AI route.");
  }

  return {
    provider: "openrouter",
    apiUrl: OPENROUTER_CHAT_URL,
    apiKey: ENV.openRouterApiKey,
    effectiveModel: model,
    headers: {
      "HTTP-Referer": ENV.openRouterSiteUrl,
      "X-Title": ENV.openRouterAppName,
    },
    providerOptions: {
      allow_fallbacks: true,
      data_collection: "deny",
    },
  };
}

function groqConfig(model: string): ProviderModelConfig {
  if (!ENV.groqApiKey) {
    throw new Error("GROQ_API_KEY is required for the selected AI route.");
  }

  return {
    provider: "groq",
    apiUrl: GROQ_CHAT_URL,
    apiKey: ENV.groqApiKey,
    effectiveModel: model,
  };
}

export function resolveGeminiFallbackConfig(): ProviderModelConfig {
  if (ENV.geminiApiKey) {
    return {
      provider: "google",
      apiUrl: GOOGLE_OPENAI_COMPAT_URL,
      apiKey: ENV.geminiApiKey,
      effectiveModel: GEMINI_FALLBACK_MODEL,
    };
  }

  if (ENV.forgeApiUrl && ENV.forgeApiKey) {
    return {
      provider: "forge",
      apiUrl: `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`,
      apiKey: ENV.forgeApiKey,
      effectiveModel: GEMINI_FALLBACK_MODEL,
    };
  }

  throw new Error("Gemini fallback requires GEMINI_API_KEY or Forge configuration.");
}

export function resolveTaskModelConfig(input: {
  taskRoute?: AiTaskRoute;
  requestedModel?: AiModel;
  containsMultimodalContent?: boolean;
}): ProviderModelConfig {
  const route = input.taskRoute;

  if (route === "microcopy") return groqConfig(GROQ_TEXT_MODEL);
  if (route === "fast_vision") return groqConfig(GROQ_SCOUT_MODEL);
  if (route === "fallback_text_or_vision") return resolveGeminiFallbackConfig();

  if (
    route === "content_strategy" ||
    route === "static_generation" ||
    route === "carousel_generation" ||
    route === "post_evaluation" ||
    route === "quality_revision" ||
    route === "caption_synthesis"
  ) {
    return openRouterConfig(ENV.openRouterTextModel);
  }

    // CR-004: rotas high_ticket (intent router / context summary) saíram do
  // caminho síncrono — roteamento de intenção e budget de contexto são
  // determinísticos; nenhuma chamada LLM usa mais essas rotas.

  if (route === "vision_analysis" || input.containsMultimodalContent) {
    return openRouterConfig(ENV.openRouterVisionModel);
  }

  if (input.requestedModel === "gemini") return resolveGeminiFallbackConfig();
  if (input.requestedModel === "llama") return groqConfig(GROQ_TEXT_MODEL);

  return openRouterConfig(ENV.openRouterTextModel);
}

export function canUseGeminiFallback(): boolean {
  return Boolean(ENV.geminiApiKey || (ENV.forgeApiUrl && ENV.forgeApiKey));
}
