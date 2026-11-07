import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENV } from "../_core/env";
import { estimateModelCostUsd, getModelCostConfig, resolveTaskModelConfig } from "./modelRouter";

const original = {
  openRouterApiKey: ENV.openRouterApiKey,
  openRouterStaticModel: ENV.openRouterStaticModel,
  openRouterCarouselModel: ENV.openRouterCarouselModel,
  openRouterQualityRevisionModel: ENV.openRouterQualityRevisionModel,
  openRouterContentStrategyModel: ENV.openRouterContentStrategyModel,
  openRouterBriefInterpretationModel: ENV.openRouterBriefInterpretationModel,
  openRouterEvaluationModel: ENV.openRouterEvaluationModel,
  openRouterVisionModel: ENV.openRouterVisionModel,
  openRouterProposalReviewModel: ENV.openRouterProposalReviewModel,
};

describe("task model routing", () => {
  beforeEach(() => {
    ENV.openRouterApiKey = "test-openrouter";
    ENV.openRouterStaticModel = "google/gemini-3.8-flash";
    ENV.openRouterCarouselModel = "google/gemini-3.8-flash";
    ENV.openRouterQualityRevisionModel = "openai/gpt-5.4-mini";
    ENV.openRouterContentStrategyModel = "z-ai/glm-5.3-flash";
    ENV.openRouterBriefInterpretationModel = "google/gemini-3.8-flash";
    ENV.openRouterEvaluationModel = "z-ai/glm-5.3-flash";
    ENV.openRouterVisionModel = "google/gemini-3.8-flash";
  });

  afterEach(() => Object.assign(ENV, original));

  it.each([
    ["static_generation", "google/gemini-3.8-flash"],
    ["carousel_generation", "google/gemini-3.8-flash"],
    ["quality_revision", "openai/gpt-5.4-mini"],
    ["content_strategy", "z-ai/glm-5.3-flash"],
    ["brief_interpretation", "google/gemini-3.8-flash"],
    ["post_evaluation", "z-ai/glm-5.3-flash"],
    ["vision_analysis", "google/gemini-3.8-flash"],
  ] as const)("routes %s to %s", (taskRoute, expectedModel) => {
    expect(resolveTaskModelConfig({ taskRoute }).effectiveModel).toBe(
      expectedModel
    );
  });

  it("routes actual render review to the vision-capable model independently of text-only judges", () => {
    ENV.openRouterProposalReviewModel = "test/vision-review";
    expect(
      resolveTaskModelConfig({
        taskRoute: "post_evaluation",
        containsMultimodalContent: true,
      }).effectiveModel
    ).toBe("test/vision-review");
    expect(
      resolveTaskModelConfig({ taskRoute: "post_evaluation" }).effectiveModel
    ).toBe("z-ai/glm-5.3-flash");
  });

  it.each(["llama", "gemini", undefined] as const)(
    "keeps configured generation models authoritative over the legacy hint %s",
    requestedModel => {
      ENV.openRouterCarouselModel = "configured/carousel";
      ENV.openRouterStaticModel = "configured/static";
      for (const [taskRoute, expected] of [
        ["carousel_generation", "configured/carousel"],
        ["static_generation", "configured/static"],
      ] as const) {
        expect(resolveTaskModelConfig({ taskRoute, requestedModel })).toMatchObject({
          provider: "openrouter",
          effectiveModel: expected,
        });
      }
    }
  );

  it.each([
    ["google/gemini-3.8-flash-20260902", 0.75, 3.75],
    ["openai/gpt-5.4-mini-20260815", 0.75, 4.5],
    ["z-ai/glm-5.3-flash:exacto", 0.075, 0.25],
    ["anthropic/claude-haiku-5.5", 0.1, 0.5],
    ["anthropic/claude-haiku-5.5-20261007", 0.1, 0.5],
    ["deepseek/deepseek-v4.1-flash", 0.14, 0.42],
    ["deepseek/deepseek-v4.1-flash-20260910", 0.14, 0.42],
  ] as const)(
    "normalizes versioned model %s for cost telemetry",
    (model, inputCost, outputCost) => {
      expect(getModelCostConfig(model)).toMatchObject({
        inputCostPerMillion: inputCost,
        outputCostPerMillion: outputCost,
      });
    }
  );
});


it("estimates Haiku's verified long-context price tier without undercounting it", () => {
  const fee = 1 + ENV.openRouterPlatformFeePercent / 100;
  expect(estimateModelCostUsd({ model: "anthropic/claude-haiku-5.5-20261007", promptTokens: 100_001, completionTokens: 1_000 }))
    .toBeCloseTo((100_001 / 1_000_000 * 0.5 + 1_000 / 1_000_000 * 2.5) * fee, 12);
});
