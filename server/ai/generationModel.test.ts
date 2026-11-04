import { afterEach, describe, expect, it } from "vitest";
import { ENV } from "../_core/env";
import { generationModelCallOptions, resolveGenerationModelConfig } from "./generationModel";
import { orchestratedGenerationInputSchema } from "../../shared/generationRequest";
import { requestInputHash } from "./workflows/generationRuntime";

const original = { ...ENV };
afterEach(() => Object.assign(ENV, original));

describe("admitted generation configuration", () => {
  it("keeps omitted model on the existing Gemini route and pins all route options", () => {
    ENV.openRouterStaticModel = "google/gemini-3.8-flash";
    const admitted = resolveGenerationModelConfig({ postMode: "static" });
    ENV.openRouterStaticModel = "google/changed-after-admission";
    ENV.generationStrategyVersion = 2;
    expect(generationModelCallOptions(admitted)).toEqual({
      pinnedModel: "google/gemini-3.8-flash", reasoningEffort: "low", forceTextSchema: true,
      temperature: 0.4, topP: 0.85, disableFallback: true,
    });
    expect(admitted.generationStrategyVersion).toBe(original.generationStrategyVersion);
    expect(resolveGenerationModelConfig({ generationModel: "gemini", postMode: "carousel" }).reasoningEffort).toBe("low");
    expect(resolveGenerationModelConfig({ postMode: "static" }).configurationHash).not.toBe(admitted.configurationHash);
  });
  it("pins GPT Sol medium with native schema for static and carousel without sampling options", () => {
    const staticConfig = resolveGenerationModelConfig({ generationModel: "gpt", postMode: "static" });
    const carouselConfig = resolveGenerationModelConfig({ generationModel: "gpt", postMode: "carousel" });
    expect(generationModelCallOptions(staticConfig)).toEqual(generationModelCallOptions(carouselConfig));
    expect(staticConfig).toMatchObject({ generationStrategyVersion: 2, editorialIntentVersion: 1 });
    expect(carouselConfig).toMatchObject({ generationStrategyVersion: 2, editorialIntentVersion: 1 });
    expect(staticConfig.configurationHash).not.toBe(carouselConfig.configurationHash);
    expect(staticConfig).toMatchObject({ choice: "gpt", model: "openai/gpt-6.1-sol", reasoningEffort: "medium", structuredOutputMode: "native_schema" });
    expect(staticConfig).not.toHaveProperty("temperature");
    expect(staticConfig).not.toHaveProperty("topP");
    expect(generationModelCallOptions(undefined)).toEqual({});
  });
  it("keeps the explicit strategy-1 rollback free of the new protocol", () => {
    ENV.generationStrategyVersion = 1;
    expect(resolveGenerationModelConfig({ postMode: "static" })).not.toHaveProperty("editorialIntentVersion");
  });
  it("pins Claude Haiku 5.5 and DeepSeek V4.1 configurations correctly", () => {
    ENV.openRouterClaudeModel = "anthropic/claude-haiku-5.5";
    ENV.openRouterDeepSeekModel = "deepseek/deepseek-v4.1-flash";

    const claudeConfig = resolveGenerationModelConfig({ generationModel: "claude", postMode: "static" });
    expect(claudeConfig).toMatchObject({
      choice: "claude",
      model: "anthropic/claude-haiku-5.5",
      reasoningEffort: "none",
      structuredOutputMode: "text_schema",
      temperature: 0.35,
      topP: 0.85,
    });
    expect(generationModelCallOptions(claudeConfig)).toEqual({
      pinnedModel: "anthropic/claude-haiku-5.5",
      reasoningEffort: "none",
      forceTextSchema: true,
      temperature: 0.35,
      topP: 0.85,
      disableFallback: true,
    });

    const deepseekConfig = resolveGenerationModelConfig({ generationModel: "deepseek", postMode: "carousel", slideCount: 5 });
    expect(deepseekConfig).toMatchObject({
      choice: "deepseek",
      model: "deepseek/deepseek-v4.1-flash",
      reasoningEffort: "none",
      structuredOutputMode: "text_schema",
      temperature: 0.4,
      topP: 0.85,
    });
    expect(generationModelCallOptions(deepseekConfig)).toEqual({
      pinnedModel: "deepseek/deepseek-v4.1-flash",
      reasoningEffort: "none",
      forceTextSchema: true,
      temperature: 0.4,
      topP: 0.85,
      disableFallback: true,
    });
  });
  it("leaves the caller hash untouched and rejects arbitrary provider/config input", () => {
    const input = orchestratedGenerationInputSchema.parse({
      ownerId: "11111111-1111-4111-8111-111111111111", inputType: "text", content: "Uma ideia",
      platform: "instagram", idempotencyKey: "receipt-test", generationModel: "gpt",
    });
    const hash = requestInputHash(input);
    resolveGenerationModelConfig(input);
    expect(requestInputHash(input)).toBe(hash);
    expect(orchestratedGenerationInputSchema.safeParse({ ...input, generationModel: "openai/custom" }).success).toBe(false);
    expect(orchestratedGenerationInputSchema.safeParse({ ...input, generationConfig: { model: "arbitrary" } }).success).toBe(false);
    expect(orchestratedGenerationInputSchema.parse({ ...input, generationModel: undefined })).not.toHaveProperty("generationConfig");
  });
});
