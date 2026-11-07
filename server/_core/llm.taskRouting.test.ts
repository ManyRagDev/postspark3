import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./env";
import { invokeLLM, preparationTransportSnapshot, KnownProviderRejectionError, knownProviderRejectionFromResponse } from "./llm";
import { generationTaskModelCallOptions, generationPinnedTaskModelCallOptions, resolveGenerationModelConfig } from "../ai/generationModel";
import { runWithGenerationTrace, type GenerationTrace } from "../ai/generationTrace";
import { durableOperations } from "../ai/workflows/generationRuntime";

vi.mock("./operationalLog", () => ({ appendOperationalLog: vi.fn(async () => {}) }));
const original = { ...ENV };
beforeEach(() => { ENV.openRouterApiKey = "controlled"; ENV.geminiApiKey = "controlled-fallback"; ENV.aiModelFallbackEnabled = true; ENV.llmTransientRetries = 2; });
afterEach(() => { Object.assign(ENV, original); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const responseFormat = { type: "json_schema" as const, json_schema: { name: "bounded", schema: {
  type: "object", properties: { text: { type: "string", maxLength: 7 } }, required: ["text"], additionalProperties: false,
} } };
const messages = [{ role: "user" as const, content: "Encurte o texto" }];
const response = (model: string, content = '{"text":"Agora"}', usage: Record<string, unknown> = {}) => new Response(JSON.stringify({
  id: "known-provider-id", model, choices: [{ message: { content }, finish_reason: "stop" }],
  usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100, ...usage },
}), { status: 200 });
const traceFixture = (): GenerationTrace => ({ id: "route-test", userUuid: "owner", inputType: "text", inputContent: "", platform: "instagram", postMode: "static", creationMode: "execution", requestedModel: "auto", startedAt: Date.now(), calls: [], events: [] });

describe("automatic task provider transport", () => {
  it.each(["intent", "copy", "repair"] as const)("sends the validated %s provider policy and capabilities", async stage => {
    const config = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    const options = generationTaskModelCallOptions(config, stage);
    const fetch = vi.fn(async () => response(config.taskRouting![stage].model));
    vi.stubGlobal("fetch", fetch);
    const params = { messages, taskRoute: "static_generation" as const, response_format: responseFormat,
      temperature: 0.8, topP: 0.5, max_tokens: 3456, ...options };
    const expectedSnapshot = preparationTransportSnapshot(params);
    await invokeLLM(params);
    const payload = JSON.parse(String(fetch.mock.calls[0][1].body));
    expect(payload.model).toBe(config.taskRouting![stage].model);
    expect(payload.provider).toEqual({ ...(stage === "copy" ? {only:["anthropic"],allow_fallbacks:false} : {order:["deepinfra"],allow_fallbacks:true}), require_parameters: true, data_collection: "deny", max_price: config.taskRouting![stage].maxPrice });
    expect(payload.reasoning).toEqual({ enabled: false });
    expect(payload).not.toHaveProperty("reasoning_effort");
    expect(payload).not.toHaveProperty("temperature");
    expect(payload).not.toHaveProperty("top_p");
    expect(payload.max_tokens).toBe(3456);
    expect(payload.messages).toEqual(expectedSnapshot.messages);
    expect(payload.response_format).toEqual(expectedSnapshot.responseFormat);
    expect(payload.response_format.json_schema.strict).toBe(true);
    expect(payload.response_format.json_schema.schema.properties.text.maxLength).toBe(7);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps historical task endpoint pins and never inherits the current provider order", async () => {
    const config = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    const { allowProviderFallbacks: _old, ...task } = config.taskRouting!.intent as any;
    const historical = { ...task, providerEndpoint: "deepinfra/fp8" };
    const fetch = vi.fn(async () => response(historical.model)); vi.stubGlobal("fetch", fetch);
    await invokeLLM({ messages, taskRoute: "static_generation", ...generationPinnedTaskModelCallOptions(historical) });
    const sent = JSON.parse(String(fetch.mock.calls[0][1].body));
    expect(sent.provider).toEqual({only:["deepinfra/fp8"],allow_fallbacks:false,require_parameters:true,data_collection:"deny",max_price:historical.maxPrice});
    expect(sent.provider).not.toHaveProperty("order");
  });

  it("fails before a provider call when an automatic receipt is mismatched or has an untested endpoint", async () => {
    const config = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    const options = generationTaskModelCallOptions(config, "copy");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(invokeLLM({ ...options, pinnedModel: "expensive/model", messages })).rejects.toThrow("policy_mismatch");
    await expect(invokeLLM({ ...options, disableFallback: false, messages })).rejects.toThrow("policy_mismatch");
    await expect(invokeLLM({ ...options, maxTransportAttempts: 2, messages })).rejects.toThrow("policy_mismatch");
    await expect(invokeLLM({ ...options, taskModelConfig: { ...config.taskRouting!.copy, providerEndpoint: "unknown" } as any, messages })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([400, 429, 500])( "does not retry, downgrade or fall back after provider status %i", async status => {
    const config = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    const fetch = vi.fn(async () => new Response("unsupported or unavailable", { status })); vi.stubGlobal("fetch", fetch);
    await expect(invokeLLM({ messages, taskRoute: "static_generation", response_format: responseFormat,
      ...generationTaskModelCallOptions(config, "repair") })).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("validates native field limits locally without starting a second repair inference", async () => {
    const config = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    const fetch = vi.fn(async () => response(config.taskRouting!.repair.model, '{"text":"Texto muito longo"}'));
    vi.stubGlobal("fetch", fetch);
    await expect(invokeLLM({ messages, taskRoute: "quality_revision", response_format: responseFormat,
      ...generationTaskModelCallOptions(config, "repair") })).rejects.toMatchObject({ failureType: "schema_mismatch" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns a known malformed intent response for durable caller validation", async () => {
    const config = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    const fetch = vi.fn(async () => response(config.taskRouting!.intent.model, "{truncated")); vi.stubGlobal("fetch", fetch);
    const result = await invokeLLM({ messages, taskRoute: "static_generation", traceLabel: "generation_intent_v1",
      response_format: responseFormat, ...generationTaskModelCallOptions(config, "intent"),
      structuredValidationOwner: "caller", durablePreparationReceipt: true });
    expect(result.id).toBe("known-provider-id");
    expect(fetch).toHaveBeenCalledTimes(1);
  });


  it("journals a known malformed editorial patch before local parsing and replays it without another inference", async () => {
    const config = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    const fetch = vi.fn(async () => response(config.taskRouting!.repair.model, "{truncated")); vi.stubGlobal("fetch", fetch);
    let saved: any;
    const store = {
      beginOperation: vi.fn(async () => saved ?? { state: "started" }),
      persistOperationResult: vi.fn(async (_id, _lease, _key, result) => { saved = { state: "completed", result }; }),
      markOperationUncertain: vi.fn(),
    };
    const operation = durableOperations(store as any, { id: "request", deadlineAt: Date.now() + 120_000 } as any, "lease", new AbortController().signal);
    const infer = () => invokeLLM({ messages, taskRoute: "static_generation", traceLabel: "proposal_test_editorial_recovery",
      response_format: responseFormat, ...generationTaskModelCallOptions(config, "repair"), maxCompletionTokens: 2048,
      structuredValidationOwner: "caller", durableProposalCopyReceipt: true });
    const first = await operation("review_correction:known", infer);
    expect(first.id).toBe("known-provider-id");
    expect(() => JSON.parse(first.choices[0].message.content as string)).toThrow();
    expect(await operation("review_correction:known", infer)).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.persistOperationResult).toHaveBeenCalledTimes(1);
    expect(store.markOperationUncertain).not.toHaveBeenCalled();
  });

  it.each(["manual", "copy_model", "intent_budget", "excess_tokens", "excess_timeout", "unbound_timeout", "missing_receipt", "missing_schema"])("rejects editorial patch caller privilege for %s before fetch", async invalid => {
    const config = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    const params: any = { messages, taskRoute: "static_generation", traceLabel: "proposal_test_editorial_recovery",
      response_format: responseFormat, ...generationTaskModelCallOptions(config, "repair"), maxCompletionTokens: 2048,
      structuredValidationOwner: "caller", durableProposalCopyReceipt: true };
    if (invalid === "manual") delete params.taskModelConfig;
    if (invalid === "copy_model") Object.assign(params, generationTaskModelCallOptions(config, "copy"));
    if (invalid === "intent_budget") Object.assign(params, generationTaskModelCallOptions(config, "intent"));
    if (invalid === "excess_tokens") params.maxCompletionTokens = 2049;
    if (invalid === "excess_timeout") params.transportTimeoutMs = 60_001;
    if (invalid === "unbound_timeout") delete params.transportTimeoutMs;
    if (invalid === "missing_receipt") delete params.durableProposalCopyReceipt;
    if (invalid === "missing_schema") delete params.response_format;
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(invokeLLM(params)).rejects.toThrow("structuredValidationOwner 'caller'");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("persists a complete known provider rejection and rethrows it on replay without inference", async () => {
    const config = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    const body = { error: { code: 400, message: "Provider returned error", metadata: { raw: JSON.stringify({
      type: "error", error: { type: "invalid_request_error", message: "The compiled grammar is too large" }, request_id: "req_known",
    }) } } };
    const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status: 400 })); vi.stubGlobal("fetch", fetch);
    let saved: any;
    const store = {
      beginOperation: vi.fn(async () => saved ?? { state: "started" }),
      persistOperationResult: vi.fn(async (_id, _lease, _key, result) => { saved = { state: "completed", result }; }),
      markOperationUncertain: vi.fn(),
    };
    const operation = durableOperations(store as any, { id: "request", deadlineAt: Date.now() + 120_000 } as any, "lease", new AbortController().signal);
    const infer = () => invokeLLM({ messages, taskRoute: "static_generation", response_format: responseFormat,
      ...generationTaskModelCallOptions(config, "copy") });
    await expect(operation("proposal:copy", infer)).rejects.toBeInstanceOf(KnownProviderRejectionError);
    expect(saved.result.__providerRejection).toMatchObject({ version: 1, providerRequestId: "req_known", httpStatus: 400, costStatus: "unreported" });
    expect(saved.result).not.toHaveProperty("usage");
    const sent = JSON.parse(String(fetch.mock.calls[0][1].body));
    expect(knownProviderRejectionFromResponse({ provider: "openrouter", model: config.model, httpStatus: 400,
      payload: sent, responseBody: JSON.stringify(body) })?.receipt).toEqual(saved.result);
    await expect(operation("proposal:copy", infer)).rejects.toBeInstanceOf(KnownProviderRejectionError);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.persistOperationResult).toHaveBeenCalledTimes(1);
    expect(store.markOperationUncertain).not.toHaveBeenCalled();
  });

  it("journals a proven route 404 once, retains unknown cost and rejects replay without another call", async () => {
    const config = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    const { allowProviderFallbacks: _new, ...task } = config.taskRouting!.intent as any;
    const historical = { ...task, providerEndpoint: "deepinfra/fp8" };
    const body = { error: { code: 404, message: "No allowed providers are available for the selected model. Providers serving deepseek: morph, but your request's provider.only preference permits only: deepinfra/fp8.",
      metadata: { requested_providers: ["deepinfra/fp8"], available_providers: ["morph", "open-inference"] } } };
    const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status: 404 })); vi.stubGlobal("fetch", fetch);
    let saved: any;
    const store = { beginOperation: vi.fn(async () => saved ?? {state:"started"}),
      persistOperationResult: vi.fn(async (_id, _lease, _key, result) => {saved={state:"completed",result};}), markOperationUncertain: vi.fn() };
    const operation = durableOperations(store as any, {id:"request",deadlineAt:Date.now()+120000} as any, "lease", new AbortController().signal);
    const infer = () => invokeLLM({messages,taskRoute:"static_generation",...generationPinnedTaskModelCallOptions(historical)});
    await expect(operation("prepare:intent",infer)).rejects.toMatchObject({code:"provider_route_unavailable"});
    expect(saved.result.__providerRejection).toMatchObject({version:2,httpStatus:404,reason:"no_allowed_providers",requestedProviders:["deepinfra/fp8"],availableProviders:["morph","open-inference"],costStatus:"unreported"});
    expect(saved.result.__providerRejection).not.toHaveProperty("providerRequestId");
    expect(saved.result).not.toHaveProperty("usage");
    const sent=JSON.parse(String(fetch.mock.calls[0][1].body));
    expect(knownProviderRejectionFromResponse({provider:"openrouter",model:historical.model,httpStatus:404,payload:sent,responseBody:JSON.stringify(body)})?.receipt).toEqual(saved.result);
    await expect(operation("prepare:intent",infer)).rejects.toMatchObject({code:"provider_route_unavailable"});
    expect(fetch).toHaveBeenCalledTimes(1); expect(store.persistOperationResult).toHaveBeenCalledTimes(1); expect(store.markOperationUncertain).not.toHaveBeenCalled();
  });

  it.each(["generic404","503","wrong_code","missing_metadata","overlap","different_requested","ordered_route","wrong_model","truncated","upstream_raw","usage","duplicate_requested"])("does not recognize an unproven route rejection: %s", mode => {
    const payload:any={model:"deepseek/deepseek-v4.1-flash",provider:{only:["deepinfra/fp8"],allow_fallbacks:false}};
    const body:any={error:{code:404,message:"No allowed providers are available for the selected model.",metadata:{requested_providers:["deepinfra/fp8"],available_providers:["morph"]}}};
    if(mode==="generic404")body.error.message="Model not found";
    if(mode==="wrong_code")body.error.code=400;
    if(mode==="missing_metadata")delete body.error.metadata;
    if(mode==="overlap")body.error.metadata.available_providers=["deepinfra/fp8"];
    if(mode==="different_requested")body.error.metadata.requested_providers=["other"];
    if(mode==="ordered_route")payload.provider={order:["deepinfra"],allow_fallbacks:true};
    if(mode==="wrong_model")payload.model="other/model";
    if(mode==="upstream_raw")body.error.metadata.raw='{"error":"unknown"}';
    if(mode==="usage")body.usage={cost:0.01};
    if(mode==="duplicate_requested")body.error.metadata.requested_providers=["deepinfra/fp8","deepinfra/fp8"];
    expect(knownProviderRejectionFromResponse({provider:"openrouter",model:"deepseek/deepseek-v4.1-flash",httpStatus:mode==="503"?503:404,payload,responseBody:mode==="truncated"?JSON.stringify(body).slice(0,-1):JSON.stringify(body)})).toBeUndefined();
  });

  it.each(["ambiguous_400", "generic_404", "server_500", "server_503", "network_timeout"])("keeps %s uncertain and prohibits replay", async mode => {
    const config = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    const fetch = vi.fn(async () => {
      if (mode === "network_timeout") throw new Error("network timeout after dispatch");
      return new Response(mode === "ambiguous_400" ? "unreadable provider response" : JSON.stringify({ error: {
        code: 500, metadata: { raw: JSON.stringify({ type: "error", error: { type: "invalid_request_error" }, request_id: "req_unconfirmed" }) },
      } }), { status: mode === "ambiguous_400" ? 400 : mode === "generic_404" ? 404 : mode === "server_503" ? 503 : 500 });
    }); vi.stubGlobal("fetch", fetch);
    let state = "started";
    const store = { beginOperation: vi.fn(async () => ({ state })), persistOperationResult: vi.fn(),
      markOperationUncertain: vi.fn(async () => { state = "uncertain"; }) };
    const operation = durableOperations(store as any, { id: "request", deadlineAt: Date.now() + 120_000 } as any, "lease", new AbortController().signal);
    const infer = () => invokeLLM({ messages, taskRoute: "static_generation", response_format: responseFormat,
      ...generationTaskModelCallOptions(config, "copy") });
    await expect(operation("proposal:copy", infer)).rejects.toThrow();
    expect(store.markOperationUncertain).toHaveBeenCalledTimes(1);
    expect(store.persistOperationResult).not.toHaveBeenCalled();
    await expect(operation("proposal:copy", infer)).rejects.toThrow("reconciliation_required");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retains a known rejection when cancellation races its fully decoded HTTP error", async () => {
    const config = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    const controller = new AbortController();
    const body = { error: { code: 400, metadata: { raw: JSON.stringify({ type: "error",
      error: { type: "invalid_request_error" }, request_id: "req_cancelled_after_rejection" }) } } };
    vi.stubGlobal("fetch", vi.fn(async () => { controller.abort(); return new Response(JSON.stringify(body), { status: 400 }); }));
    await expect(invokeLLM({ messages, taskRoute: "static_generation", response_format: responseFormat,
      signal: controller.signal, ...generationTaskModelCallOptions(config, "copy") })).rejects.toBeInstanceOf(KnownProviderRejectionError);
  });

  it.each([0, 0.123])( "prefers actual provider usage cost %s over route estimates", async actualCost => {
    const config = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    const trace = traceFixture();
    vi.stubGlobal("fetch", vi.fn(async () => response("anthropic/claude-haiku-5.5-20261007", undefined, { cost: actualCost })));
    await runWithGenerationTrace(trace, () => invokeLLM({ messages, taskRoute: "static_generation", response_format: responseFormat,
      ...generationTaskModelCallOptions(config, "copy") }));
    expect(trace.calls[0].estimatedCostUsd).toBe(actualCost);
  });

  it("uses the pinned stage transport budget and never extends the caller deadline", async () => {
    vi.useFakeTimers();
    const config = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    const fetch = vi.fn((_url: unknown, options: any) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true })));
    vi.stubGlobal("fetch", fetch);
    const pending = invokeLLM({ messages, taskRoute: "quality_revision", ...generationTaskModelCallOptions(config, "repair"), deadlineMs: Date.now() + 100_000 }).catch(error => error);
    await vi.advanceTimersByTimeAsync(60_001);
    expect((await pending).name).toBe("LlmTransportTimeoutError");
    const deadlinePending = invokeLLM({ messages, taskRoute: "quality_revision", ...generationTaskModelCallOptions(config, "repair"), deadlineMs: Date.now() + 10_000 }).catch(error => error);
    await vi.advanceTimersByTimeAsync(10_001);
    expect((await deadlinePending).name).toBe("LlmDeadlineExceededError");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
