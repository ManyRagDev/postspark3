import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./env";
import { invokeLLM, preparationTransportSnapshot } from "./llm";
import { arsenalHash } from "@shared/arsenalContent";
import { generationModelCallOptions, preparationCallBudget, resolveGenerationModelConfig } from "../ai/generationModel";
import { failureFromError } from "@shared/generationFailure";
import { runWithGenerationTrace, type GenerationTrace } from "../ai/generationTrace";

vi.mock("./operationalLog", () => ({ appendOperationalLog: vi.fn(async () => {}) }));
const original = { ...ENV };
afterEach(() => { Object.assign(ENV, original); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("pinned strategy-2 preparation transport", () => {
  it("allows seven-slide planning past the old cap, then reports a selection timeout without another inference", async () => {
    vi.useFakeTimers(); ENV.openRouterApiKey = "controlled"; ENV.generationStrategyVersion = 2;
    const config = resolveGenerationModelConfig({ generationModel: "gpt", postMode: "carousel", slideCount: 7 });
    const fetch = vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true })));
    vi.stubGlobal("fetch", fetch);
    let settled = false;
    const trace: GenerationTrace = { id: "fixture", userUuid: "owner", inputType: "text", inputContent: "", platform: "instagram", postMode: "carousel", creationMode: "execution", requestedModel: config.model, startedAt: Date.now(), calls: [], events: [] };
    const result = runWithGenerationTrace(trace, () => invokeLLM({
      taskRoute: "carousel_generation", messages: [{ role: "user", content: "controlled" }],
      maxTransportAttempts: 1, ...generationModelCallOptions(config),
      ...preparationCallBudget(config, "selection", Date.now() + 600_000),
    })).catch(error => { settled = true; return error; });
    await vi.advanceTimersByTimeAsync(60_001);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(120_000);
    const error = await result;
    expect(failureFromError(error, "selection")).toEqual({ code: "provider_timeout", stage: "selection", retryable: true });
    expect(trace.calls[0]).toMatchObject({ failureKind: "transport_timeout", transportTimeoutMs: 180_000 });
    expect(fetch).toHaveBeenCalledTimes(1);
    const savedBudget = structuredClone(config.preparationBudget);
    ENV.generationStrategyVersion = 1;
    expect(preparationCallBudget(config, "selection", 1_000_000)).toEqual({ deadlineMs: 820_000, transportTimeoutMs: 180_000 });
    expect(config.preparationBudget).toEqual(savedBudget);
  });

  it("honors the smaller absolute deadline and preserves historical routing", async () => {
    vi.useFakeTimers(); ENV.openRouterApiKey = "controlled"; ENV.generationStrategyVersion = 1;
    const historical = resolveGenerationModelConfig({ generationModel: "gpt", postMode: "carousel" });
    expect(preparationCallBudget(historical, "selection", 1000)).toEqual({ deadlineMs: 1000 });
    const fetch = vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true })));
    vi.stubGlobal("fetch", fetch);
    const pending = invokeLLM({ taskRoute: "carousel_generation", messages: [{ role: "user", content: "controlled" }],
      ...generationModelCallOptions(historical), maxTransportAttempts: 1, transportTimeoutMs: 180_000, deadlineMs: Date.now() + 20_000,
    }).catch(error => error);
    await vi.advanceTimersByTimeAsync(20_001);
    expect((await pending).name).toBe("LlmDeadlineExceededError");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["selection", "copy"] as const)("returns a known %s receipt before JSON validation without repair or fallback", async operation => {
    ENV.openRouterApiKey = "controlled";
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: "known", model: "openai/gpt-6.1-sol", choices: [{ message: { content: "{truncated" }, finish_reason: "length" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const result = await invokeLLM({ taskRoute: "carousel_generation", traceLabel: operation === "copy" ? "proposal_test_copy" : "generation_selection_v1",
      messages: [{ role: "user", content: "controlled" }], pinnedModel: "openai/gpt-6.1-sol",
      maxTransportAttempts: 1, disableFallback: true, disableStructuredRepair: true,
      structuredValidationOwner: "caller", ...(operation === "copy" ? { durableProposalCopyReceipt: true } : { durablePreparationReceipt: true }),
      response_format: { type: "json_schema", json_schema: { name: "plan", strict: true, schema: { type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false } } },
    });
    expect(result.id).toBe("known"); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["gpt", "gemini"] as const)("binds %s preparation to the actual adapted messages", async choice => {
    ENV.openRouterApiKey = "controlled"; ENV.generationStrategyVersion = 2;
    ENV.openRouterCarouselModel = "google/gemini-3.8-flash";
    const config = resolveGenerationModelConfig({ generationModel: choice, postMode: "carousel", slideCount: 7 });
    const params = { taskRoute: "carousel_generation" as const, traceLabel: "generation_selection_v1",
      messages: [{ role: "user" as const, content: "controlled" }], ...generationModelCallOptions(config),
      maxTransportAttempts: 1, disableStructuredRepair: true, structuredValidationOwner: "caller" as const, durablePreparationReceipt: true,
      response_format: { type: "json_schema" as const, json_schema: { name: "plan", strict: true,
        schema: { type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false } } },
    };
    let sent: any;
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => { sent = JSON.parse(options.body); return new Response(JSON.stringify({
      id: "provider-id", model: config.model, choices: [{ message: { content: '{"value":"ok"}' }, finish_reason: "stop" }],
    }), { status: 200 }); }));
    const expected = preparationTransportSnapshot(params);
    await invokeLLM(params);
    expect(arsenalHash(sent.messages)).toBe(arsenalHash(expected.messages));
    if (choice === "gemini") expect(arsenalHash(sent.messages)).not.toBe(arsenalHash(params.messages));
  });
});
