import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENV } from "../_core/env";
import { getModelCostConfig, resolveTaskModelConfig } from "./modelRouter";

const original = {
  openRouterApiKey: ENV.openRouterApiKey,
  openRouterStaticModel: ENV.openRouterStaticModel,
  openRouterCarouselModel: ENV.openRouterCarouselModel,
  openRouterQualityRevisionModel: ENV.openRouterQualityRevisionModel,
  openRouterContentStrategyModel: ENV.openRouterContentStrategyModel,
  openRouterEvaluationModel: ENV.openRouterEvaluationModel,
  openRouterVisionModel: ENV.openRouterVisionModel,
};

describe("task model routing", () => {
  beforeEach(() => {
    ENV.openRouterApiKey = "test-openrouter";
    ENV.openRouterStaticModel = "google/gemini-3.8-flash";
    ENV.openRouterCarouselModel = "google/gemini-3.8-flash";
    ENV.openRouterQualityRevisionModel = "openai/gpt-5.4-mini";
    ENV.openRouterContentStrategyModel = "z-ai/glm-5.3-flash";
    ENV.openRouterEvaluationModel = "z-ai/glm-5.3-flash";
    ENV.openRouterVisionModel = "google/gemini-3.8-flash";
  });

  afterEach(() => Object.assign(ENV, original));

  it.each([
    ["static_generation", "google/gemini-3.8-flash"],
    ["carousel_generation", "google/gemini-3.8-flash"],
    ["quality_revision", "openai/gpt-5.4-mini"],
    ["content_strategy", "z-ai/glm-5.3-flash"],
    ["post_evaluation", "z-ai/glm-5.3-flash"],
    ["vision_analysis", "google/gemini-3.8-flash"],
  ] as const)("routes %s to %s", (taskRoute, expectedModel) => {
    expect(resolveTaskModelConfig({ taskRoute }).effectiveModel).toBe(expectedModel);
  });

  it.each([
    ["google/gemini-3.8-flash-20260902", 0.75, 3.75],
    ["openai/gpt-5.4-mini-20260815", 0.75, 4.5],
    ["z-ai/glm-5.3-flash:exacto", 0.075, 0.25],
  ] as const)("normalizes versioned model %s for cost telemetry", (model, inputCost, outputCost) => {
    expect(getModelCostConfig(model)).toMatchObject({
      inputCostPerMillion: inputCost,
      outputCostPerMillion: outputCost,
    });
  });
});
