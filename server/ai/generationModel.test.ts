import { afterEach, describe, expect, it } from "vitest";
import { generationModelConfigSchema } from "../../shared/generationModel";
import { createHash } from "node:crypto";
import { ENV } from "../_core/env";
import { generationModelCallOptions, generationTaskModelCallOptions, resolveGenerationTaskModel, resolveGenerationModelConfig } from "./generationModel";
import { orchestratedGenerationInputSchema } from "../../shared/generationRequest";
import { requestInputHash } from "./workflows/generationRuntime";

const original = { ...ENV };
afterEach(() => Object.assign(ENV, original));

describe("admitted generation configuration", () => {
  it("keeps the explicit Gemini choice on the existing route and pins all route options", () => {
    ENV.openRouterStaticModel = "google/gemini-3.8-flash";
    const admitted = resolveGenerationModelConfig({ generationModel: "gemini", postMode: "static" });
    ENV.openRouterStaticModel = "google/changed-after-admission";
    ENV.generationStrategyVersion = 2;
    expect(generationModelCallOptions(admitted)).toEqual({
      pinnedModel: "google/gemini-3.8-flash", reasoningEffort: "low", forceTextSchema: true,
      temperature: 0.4, topP: 0.85, disableFallback: true,
    });
    expect(admitted.generationStrategyVersion).toBe(original.generationStrategyVersion);
    expect(resolveGenerationModelConfig({ generationModel: "gemini", postMode: "carousel" }).reasoningEffort).toBe("low");
    expect(resolveGenerationModelConfig({ generationModel: "gemini", postMode: "static" }).configurationHash).not.toBe(admitted.configurationHash);
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
    expect(resolveGenerationModelConfig({ generationModel: "gemini", postMode: "static" })).not.toHaveProperty("editorialIntentVersion");
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


describe("automatic task routing receipt", () => {
  it("pins adaptive layout only for new automatic requests and preserves historical receipts", () => {
    const current = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    expect(current.layoutFitPolicy).toBe("adaptive_v2");
    expect(resolveGenerationModelConfig({ generationModel: "claude", postMode: "static" }).layoutFitPolicy).toBe("subpixel_v1");
    const historical = { ...current, layoutFitPolicy: "subpixel_v1" as const };
    expect(generationModelConfigSchema.parse(historical).layoutFitPolicy).toBe("subpixel_v1");
    const { layoutFitPolicy: _policy, ...unversioned } = historical;
    expect(generationModelConfigSchema.parse(unversioned)).not.toHaveProperty("layoutFitPolicy");
  });

  it("defaults new admissions to the tested task policy even with the strategy-1 rollback env", () => {
    ENV.generationStrategyVersion = 1;
    const config = resolveGenerationModelConfig({ postMode: "static" });
    expect(config).toMatchObject({ choice: "auto", generationStrategyVersion: 2, editorialIntentVersion: 1,
      model: "anthropic/claude-haiku-5.5", structuredOutputMode: "native_schema",
      taskRouting: { version: 2, policy: "deepseek_haiku_v2",
        intent: { model: "deepseek/deepseek-v4.1-flash", providerEndpoint: "deepinfra", allowProviderFallbacks: true, reasoningEnabled: false },
        copy: { model: "anthropic/claude-haiku-5.5", providerEndpoint: "anthropic", reasoningEnabled: false },
        repair: { model: "deepseek/deepseek-v4.1-flash", providerEndpoint: "deepinfra", allowProviderFallbacks: true, reasoningEnabled: false },
      },
    });
    expect(config).not.toHaveProperty("temperature");
    expect(config).not.toHaveProperty("topP");
    const { configurationHash, ...body } = config;
    expect(configurationHash).toBe(createHash("sha256").update(JSON.stringify(body)).digest("hex"));
  });

  it("resumes the admitted endpoints, budgets and prices independently of later environment changes", () => {
    const config = resolveGenerationModelConfig({ generationModel: "auto", postMode: "carousel", slideCount: 7 });
    const saved = JSON.parse(JSON.stringify(config));
    ENV.openRouterClaudeModel = "expensive/changed";
    ENV.openRouterDeepSeekModel = "expensive/changed";
    ENV.generationStrategyVersion = 1;
    for (const stage of ["intent", "copy", "repair"] as const) {
      expect(resolveGenerationTaskModel(config, stage)).toEqual(saved.taskRouting[stage]);
      expect(generationTaskModelCallOptions(config, stage)).toEqual({
        pinnedModel: saved.taskRouting[stage].model, reasoningEffort: "none", forceTextSchema: false,
        taskModelConfig: saved.taskRouting[stage], transportTimeoutMs: saved.taskRouting[stage].transportTimeoutMs,
        disableFallback: true, disableStructuredRepair: true, maxTransportAttempts: 1,
      });
    }
    expect(generationModelCallOptions(config)).toEqual(generationTaskModelCallOptions(config, "copy"));
    expect(config).toEqual(saved);
  });

  it.each(["gemini", "claude", "deepseek", "gpt"] as const)("preserves manual %s and old receipts without task routing", choice => {
    const config = resolveGenerationModelConfig({ generationModel: choice, postMode: "static" });
    expect(config).not.toHaveProperty("taskRouting");
    const historical = { ...config };
    delete historical.preparationBudget;
    delete historical.editorialIntentVersion;
    delete historical.layoutFitPolicy;
    expect(generationModelConfigSchema.safeParse(historical).success).toBe(true);
    for (const stage of ["intent", "copy", "repair"] as const) {
      expect(resolveGenerationTaskModel(historical, stage)).toEqual(historical);
      expect(generationTaskModelCallOptions(historical, stage)).toEqual(generationModelCallOptions(historical));
    }
  });

  it("rejects unpinned automatic configs and a policy grafted onto a historical manual choice", () => {
    const config = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    expect(generationModelConfigSchema.safeParse({ ...config, taskRouting: undefined }).success).toBe(false);
    expect(generationModelConfigSchema.safeParse({ ...config, choice: "claude" }).success).toBe(false);
    expect(generationModelConfigSchema.safeParse({ ...config, generationStrategyVersion: 1 }).success).toBe(false);
    expect(generationModelConfigSchema.safeParse({ ...config, taskRouting: { ...config.taskRouting, intent: config.taskRouting!.copy } }).success).toBe(false);
    expect(generationModelConfigSchema.safeParse({ ...config, taskRouting: { ...config.taskRouting, copy: { ...config.taskRouting!.copy, providerEndpoint: "amazon-bedrock" } } }).success).toBe(false);
    expect(generationTaskModelCallOptions(undefined, "repair")).toEqual({});
  });
});

describe("compatible DeepSeek provider routing V2", () => {
  const hashConfig = (value: any) => {
    const { configurationHash: _hash, ...body } = value;
    return { ...body, configurationHash: createHash("sha256").update(JSON.stringify(body)).digest("hex") };
  };
  function historicalV1() {
    const current = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    const legacy = (task: any) => {
      const { allowProviderFallbacks: _fallback, ...old } = task;
      return { ...old, providerEndpoint: "deepinfra/fp8" };
    };
    return hashConfig({ ...current, taskRouting: { version: 1, policy: "deepseek_haiku_v1",
      intent: legacy(current.taskRouting!.intent), copy: current.taskRouting!.copy, repair: legacy(current.taskRouting!.repair),
    } });
  }
  it("preserves the exact historical routing body/hash without migrating it on read or replay", () => {
    const legacy = historicalV1(), serialized = JSON.stringify(legacy);
    const restored = generationModelConfigSchema.parse(JSON.parse(serialized));
    expect(JSON.stringify(restored)).toBe(serialized);
    expect(restored.configurationHash).toBe(hashConfig(restored).configurationHash);
    expect(generationTaskModelCallOptions(restored, "intent").taskModelConfig).toEqual(legacy.taskRouting.intent);
    expect(generationTaskModelCallOptions(restored, "repair").taskModelConfig).toEqual(legacy.taskRouting.repair);
    const current = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    expect(current.configurationHash).not.toBe(restored.configurationHash);
    expect(current.taskRouting!.copy).toEqual(restored.taskRouting!.copy);
  });
  it("does not graft provider fallback onto V1 or relax V2 price/model/schema/privacy prerequisites", () => {
    const current = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    const routing = current.taskRouting!, legacy = historicalV1();
    const invalid = [
      { ...current, taskRouting: { ...routing, version: 1 } },
      { ...current, taskRouting: { ...routing, policy: "deepseek_haiku_v1" } },
      { ...legacy, taskRouting: { ...legacy.taskRouting, intent: routing.intent } },
      { ...current, taskRouting: { ...routing, intent: legacy.taskRouting.intent } },
      ...[
        { providerEndpoint: "morph" }, { allowProviderFallbacks: false },
        { model: "other/model" }, { maxPrice: { prompt: 1, completion: 1 } },
        { reasoningEnabled: true }, { structuredOutputMode: "text_schema" },
      ].map(patch => ({ ...current, taskRouting: { ...routing, intent: { ...routing.intent, ...patch } } })),
      { ...current, taskRouting: { ...routing, copy: { ...routing.copy, allowProviderFallbacks: true } } },
    ];
    for (const value of invalid) expect(generationModelConfigSchema.safeParse(value).success).toBe(false);
    expect(generationTaskModelCallOptions(current, "intent")).toMatchObject({ disableFallback: true, disableStructuredRepair: true, maxTransportAttempts: 1 });
  });
});
