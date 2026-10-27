import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./env";
import { invokeLLM, resolveModelConfig } from "./llm";
import { runWithGenerationTrace } from "../ai/generationTrace";

const original = {
  geminiApiKey: ENV.geminiApiKey,
  groqApiKey: ENV.groqApiKey,
  openRouterApiKey: ENV.openRouterApiKey,
  openRouterTextModel: ENV.openRouterTextModel,
  openRouterVisionModel: ENV.openRouterVisionModel,
  openRouterImageModel: ENV.openRouterImageModel,
  openRouterPlatformFeePercent: ENV.openRouterPlatformFeePercent,
  forgeApiUrl: ENV.forgeApiUrl,
  forgeApiKey: ENV.forgeApiKey,
  aiModelFallbackEnabled: ENV.aiModelFallbackEnabled,
  llmTransientRetries: ENV.llmTransientRetries,
  llmRetryBaseDelayMs: ENV.llmRetryBaseDelayMs,
  llmRequestTimeoutMs: ENV.llmRequestTimeoutMs,
};

afterEach(() => {
  Object.assign(ENV, original);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("resolveModelConfig", () => {
  it("dispatches the validated pinned model instead of the current route default", async () => {
    ENV.openRouterApiKey = "test-openrouter";
    const pinnedModel = "provider/pinned-historical-model";
    const fetchMock = vi.fn().mockResolvedValue(providerResponse(pinnedModel,"Conteúdo controlado"));
    vi.stubGlobal("fetch",fetchMock);
    await invokeLLM({taskRoute:"static_generation",pinnedModel,messages:[{role:"user",content:"Teste de retomada"}],disableFallback:true,maxTransportAttempts:1});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe(pinnedModel);
  });
  it("refuses a pinned identity when fallback could change it", async () => {
    ENV.openRouterApiKey = "test-openrouter";
    const fetchMock = vi.fn(); vi.stubGlobal("fetch",fetchMock);
    await expect(invokeLLM({taskRoute:"static_generation",pinnedModel:"provider/pinned-model",messages:[{role:"user",content:"Teste"}]})).rejects.toThrow("pinned_model_requires_openrouter_without_fallback");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not dispatch a cancelled operation", async () => {
    ENV.openRouterApiKey = "test-openrouter";
    const controller = new AbortController(); controller.abort(new Error("cancelled"));
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(invokeLLM({ messages: [{ role: "user", content: "test" }], signal: controller.signal, disableFallback: true }))
      .rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts an in-flight transport without another provider attempt", async () => {
    ENV.openRouterApiKey = "test-openrouter";
    const controller = new AbortController();
    let began!: () => void; const started = new Promise<void>(resolve => { began = resolve; });
    const fetchMock = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
      began();
    }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = invokeLLM({ messages: [{ role: "user", content: "test" }], signal: controller.signal, disableFallback: true, maxTransportAttempts: 1 });
    const rejection = expect(pending).rejects.toThrow();
    await started; controller.abort(new Error("cancelled")); await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("routes compatible default calls to OpenRouter GPT-5 mini", () => {
    ENV.openRouterApiKey = "test-openrouter";
    ENV.openRouterTextModel = "openai/gpt-5-mini";

    expect(resolveModelConfig()).toMatchObject({
      provider: "openrouter",
      effectiveModel: "openai/gpt-5-mini",
      apiKey: "test-openrouter",
    });
  });

  it("routes Gemini to the configured Google model", () => {
    ENV.geminiApiKey = "test-gemini";

    expect(resolveModelConfig("gemini")).toMatchObject({
      provider: "google",
      effectiveModel: "gemini-2.5-flash",
      apiKey: "test-gemini",
    });
  });

  it("routes Llama to Groq instead of silently using Gemini", () => {
    ENV.groqApiKey = "test-groq";

    expect(resolveModelConfig("llama")).toMatchObject({
      provider: "groq",
      effectiveModel: "openai/gpt-oss-120b",
      apiKey: "test-groq",
    });
  });

  it("fails explicitly when Llama is selected without Groq", () => {
    ENV.groqApiKey = "";
    ENV.geminiApiKey = "test-gemini";

    expect(() => resolveModelConfig("llama")).toThrow("GROQ_API_KEY");
  });
});

const structuredFormat = {
  type: "json_schema" as const,
  json_schema: {
    name: "answer",
    strict: true,
    schema: {
      type: "object",
      properties: {
        answer: { type: "string" },
      },
      required: ["answer"],
      additionalProperties: false,
    },
  },
};

function providerResponse(
  model: string,
  content: string,
  options: {
    finishReason?: string | null;
    nativeFinishReason?: string | null;
    usage?: Record<string, unknown>;
  } = {},
): Response {
  return new Response(
    JSON.stringify({
      id: `response-${model}`,
      created: 1,
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: options.finishReason ?? "stop",
          native_finish_reason: options.nativeFinishReason,
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
        ...options.usage,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("invokeLLM resilience", () => {
  it("uses OpenRouter as the default text model", async () => {
    ENV.geminiApiKey = "test-gemini";
    ENV.groqApiKey = "test-groq";
    ENV.openRouterApiKey = "test-openrouter";
    ENV.openRouterTextModel = "openai/gpt-5-mini";
    ENV.aiModelFallbackEnabled = true;
    ENV.llmTransientRetries = 1;
    ENV.llmRetryBaseDelayMs = 0;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        providerResponse("openai/gpt-5-mini", '{"answer":"openrouter"}'),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeLLM({
      messages: [{ role: "user", content: "Responda" }],
      response_format: structuredFormat,
    });

    expect(result.model).toBe("openai/gpt-5-mini");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      max_completion_tokens?: number;
      max_tokens?: number;
      temperature: number;
      top_p: number;
      reasoning_effort: string;
      reasoning?: { effort: string; exclude: boolean };
      response_format: typeof structuredFormat;
      messages: Array<{ content: string }>;
    };
    expect(request.response_format).toEqual(structuredFormat);
    expect(request.max_tokens).toBe(2048);
    expect(request.max_completion_tokens).toBeUndefined();
    expect(request.temperature).toBe(0.4);
    expect(request.top_p).toBe(0.85);
    expect(request.reasoning_effort).toBe("minimal");
    expect(request.reasoning).toEqual({ effort: "minimal", exclude: true });
    expect(request.messages[0].content).not.toContain("JSON Schema");
  });

  it("uses low reasoning only for carousel generation", async () => {
    ENV.openRouterApiKey = "test-openrouter";
    ENV.openRouterTextModel = "openai/gpt-5-mini";
    ENV.llmTransientRetries = 0;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        providerResponse("openai/gpt-5-mini", '{"answer":"carousel"}'),
      );
    vi.stubGlobal("fetch", fetchMock);

    await invokeLLM({
      taskRoute: "carousel_generation",
      messages: [{ role: "user", content: "Crie um carrossel" }],
      response_format: structuredFormat,
    });

    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      temperature: number;
      top_p: number;
      reasoning_effort: string;
      reasoning?: { effort: string; exclude: boolean };
    };
    expect(request.temperature).toBe(0.45);
    expect(request.top_p).toBe(0.85);
    expect(request.reasoning_effort).toBe("low");
    expect(request.reasoning).toEqual({ effort: "low", exclude: true });
  });

  it("uses Groq GPT-OSS for microcopy route", async () => {
    ENV.groqApiKey = "test-groq";
    ENV.llmTransientRetries = 0;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        providerResponse("openai/gpt-oss-120b", '{"answer":"groq"}'),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeLLM({
      taskRoute: "microcopy",
      messages: [{ role: "user", content: "Crie uma legenda" }],
      response_format: structuredFormat,
    });

    expect(result.model).toBe("openai/gpt-oss-120b");
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      max_completion_tokens: number;
      reasoning_effort: string;
    };
    expect(request.max_completion_tokens).toBe(2048);
    expect(request.reasoning_effort).toBe("low");
  });

  it("retries a transient OpenRouter failure before using fallback", async () => {
    ENV.geminiApiKey = "test-gemini";
    ENV.groqApiKey = "test-groq";
    ENV.openRouterApiKey = "test-openrouter";
    ENV.aiModelFallbackEnabled = true;
    ENV.llmTransientRetries = 1;
    ENV.llmRetryBaseDelayMs = 0;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("overloaded", { status: 503, statusText: "Unavailable" }),
      )
      .mockResolvedValueOnce(
        providerResponse("openai/gpt-5-mini", '{"answer":"openrouter"}'),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeLLM({
      messages: [{ role: "user", content: "Responda" }],
      response_format: structuredFormat,
    });

    expect(result.model).toBe("openai/gpt-5-mini");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to Gemini after OpenRouter retries fail", async () => {
    ENV.geminiApiKey = "test-gemini";
    ENV.groqApiKey = "test-groq";
    ENV.openRouterApiKey = "test-openrouter";
    ENV.aiModelFallbackEnabled = true;
    ENV.llmTransientRetries = 0;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("overloaded", { status: 503, statusText: "Unavailable" }),
      )
      .mockResolvedValueOnce(
        providerResponse("gemini-2.5-flash", '{"answer":"gemini"}'),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeLLM({
      messages: [{ role: "user", content: "Responda" }],
      response_format: structuredFormat,
    });

    expect(result.model).toBe("gemini-2.5-flash");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const geminiRequest = JSON.parse(
      String(fetchMock.mock.calls[1][1]?.body),
    ) as {
      model: string;
      response_format: { type: string };
      messages: Array<{ content: string }>;
    };
    expect(geminiRequest.model).toBe("gemini-2.5-flash");
    expect(geminiRequest.response_format).toEqual(structuredFormat);
  });

  it("applies assembly transport limits and text schema to the fallback without hidden repairs", async () => {
    ENV.geminiApiKey = "test-gemini";
    ENV.openRouterApiKey = "test-openrouter";
    ENV.openRouterTextModel = "openai/gpt-5-mini";
    ENV.aiModelFallbackEnabled = true;
    ENV.llmTransientRetries = 2;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("overloaded", { status: 503 }))
      .mockResolvedValueOnce(providerResponse("gemini-2.5-flash", '{"unexpected":true}'));
    vi.stubGlobal("fetch", fetchMock);

    await expect(invokeLLM({
      messages: [{ role: "user", content: "Responda" }],
      response_format: structuredFormat,
      deadlineMs: Date.now() + 150_000,
      maxTransportAttempts: 1,
      forceTextSchema: true,
      disableStructuredRepair: true,
    })).rejects.toMatchObject({ cause: { name: "StructuredOutputError", failureType: "schema_mismatch" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      const request = JSON.parse(String(call[1]?.body));
      expect(request.response_format).toEqual({ type: "json_object" });
      expect(request.messages[0].content).toContain("JSON Schema");
      expect(request.messages[0].content).toContain('"answer"');
    }
  });

  it("aborts at the absolute deadline and does not start a fallback request", async () => {
    ENV.geminiApiKey = "test-gemini";
    ENV.openRouterApiKey = "test-openrouter";
    ENV.openRouterTextModel = "openai/gpt-5-mini";
    ENV.aiModelFallbackEnabled = true;
    ENV.llmTransientRetries = 2;
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(invokeLLM({
      messages: [{ role: "user", content: "Responda" }],
      response_format: structuredFormat,
      deadlineMs: Date.now() + 25,
    })).rejects.toThrow("deadline exceeded");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("downgrades Groq native json_schema to text schema when the provider rejects the format", async () => {
    ENV.geminiApiKey = "test-gemini";
    ENV.groqApiKey = "test-groq";
    ENV.aiModelFallbackEnabled = true;
    ENV.llmTransientRetries = 0;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("unsupported response_format", {
          status: 400,
          statusText: "Bad Request",
        }),
      )
      .mockResolvedValueOnce(
        providerResponse("openai/gpt-oss-120b", '{"answer":"groq"}'),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeLLM({
      taskRoute: "microcopy",
      messages: [{ role: "user", content: "Responda" }],
      response_format: structuredFormat,
    });

    expect(result.model).toBe("openai/gpt-oss-120b");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstRequest = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      response_format: typeof structuredFormat;
      messages: Array<{ content: string }>;
    };
    const secondRequest = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as {
      response_format: { type: string };
      messages: Array<{ content: string }>;
    };
    expect(firstRequest.response_format).toEqual(structuredFormat);
    expect(firstRequest.messages[0].content).not.toContain("JSON Schema");
    expect(secondRequest.response_format).toEqual({ type: "json_object" });
    expect(secondRequest.messages[0].content).toContain("JSON Schema");
  });

  it("repairs one schema-invalid Groq response", async () => {
    ENV.geminiApiKey = "test-gemini";
    ENV.groqApiKey = "test-groq";
    ENV.aiModelFallbackEnabled = true;
    ENV.llmTransientRetries = 0;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        providerResponse("openai/gpt-oss-120b", '{"wrong":true}'),
      )
      .mockResolvedValueOnce(
        providerResponse("openai/gpt-oss-120b", '{"answer":"repaired"}'),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeLLM({
      taskRoute: "microcopy",
      messages: [{ role: "user", content: "Responda" }],
      response_format: structuredFormat,
    });

    expect(result.choices[0].message.content).toBe('{"answer":"repaired"}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const repairRequest = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as {
      response_format: typeof structuredFormat;
    };
    expect(repairRequest.response_format).toEqual(structuredFormat);
  });

  it("does not repair truncated structured responses", async () => {
    ENV.openRouterApiKey = "test-openrouter";
    ENV.openRouterTextModel = "openai/gpt-5-mini";
    ENV.aiModelFallbackEnabled = false;
    ENV.llmTransientRetries = 0;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        providerResponse("openai/gpt-5-mini", '{"answer":"cor', {
          finishReason: "length",
          nativeFinishReason: "max_tokens",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      invokeLLM({
        taskRoute: "static_generation",
        messages: [{ role: "user", content: "Responda" }],
        response_format: structuredFormat,
      }),
    ).rejects.toThrow("Structured output truncated");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not repair empty structured responses", async () => {
    ENV.openRouterApiKey = "test-openrouter";
    ENV.openRouterTextModel = "openai/gpt-5-mini";
    ENV.aiModelFallbackEnabled = false;
    ENV.llmTransientRetries = 0;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        providerResponse("openai/gpt-5-mini", ""),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      invokeLLM({
        taskRoute: "content_strategy",
        messages: [{ role: "user", content: "Planeje" }],
        response_format: structuredFormat,
      }),
    ).rejects.toThrow("Structured output empty_content");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("routes multimodal calls to OpenRouter vision first", async () => {
    ENV.geminiApiKey = "test-gemini";
    ENV.groqApiKey = "test-groq";
    ENV.openRouterApiKey = "test-openrouter";
    ENV.aiModelFallbackEnabled = true;
    ENV.llmTransientRetries = 0;

    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        providerResponse(
          "google/gemini-3.8-flash",
          '{"answer":"vision"}',
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeLLM({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Analise" },
            {
              type: "image_url",
              image_url: { url: "data:image/png;base64,x" },
            },
          ],
        },
      ],
    });

    expect(result.model).toBe("google/gemini-3.8-flash");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      model: string;
    };
    expect(request.model).toBe("google/gemini-3.8-flash");
  });

  it("falls back from OpenRouter vision to Gemini for multimodal transient failures", async () => {
    ENV.geminiApiKey = "test-gemini";
    ENV.groqApiKey = "test-groq";
    ENV.openRouterApiKey = "test-openrouter";
    ENV.aiModelFallbackEnabled = true;
    ENV.llmTransientRetries = 0;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("overloaded", { status: 503, statusText: "Unavailable" }),
      )
      .mockResolvedValueOnce(
        providerResponse("gemini-2.5-flash", '{"answer":"gemini-vision"}'),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeLLM({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Analise" },
            {
              type: "image_url",
              image_url: { url: "data:image/png;base64,x" },
            },
          ],
        },
      ],
    });

    expect(result.model).toBe("gemini-2.5-flash");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const visionRequest = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      model: string;
    };
    const geminiRequest = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as {
      model: string;
    };
    expect(visionRequest.model).toBe("google/gemini-3.8-flash");
    expect(geminiRequest.model).toBe("gemini-2.5-flash");
  });
});

describe("explicit review transport budget", () => {
  it.each([undefined, 30000])("allows a longer review but respects the absolute deadline (%s)", async remaining => {
    vi.useFakeTimers();
    ENV.openRouterApiKey = "test-openrouter";
    const fetchMock = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      let settled = false;
      const pending = invokeLLM({
        messages: [{ role: "user", content: "test" }], taskRoute: "post_evaluation",
        transportTimeoutMs: 45000, deadlineMs: remaining ? Date.now() + remaining : undefined,
        disableFallback: true, maxTransportAttempts: 1,
      }).catch(error => { settled = true; return error; });
      await vi.advanceTimersByTimeAsync(20001);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(settled).toBe(false); // the old route's 20s cap must not apply
      await vi.advanceTimersByTimeAsync((remaining ?? 45000) - 20000);
      expect(await pending).toBeInstanceOf(Error);
      expect(settled).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});

describe("structuredValidationOwner caller mode", () => {
  it("keeps absent usage/cost unknown rather than presenting a zero-cost receipt",async()=>{
    ENV.openRouterApiKey="test-openrouter";
    const fetch=vi.fn(async()=>new Response(JSON.stringify({id:"known-receipt",model:"google/gemini-3.8-flash",choices:[{message:{role:"assistant",content:"{}"},finish_reason:"stop"}]}),{status:200}));vi.stubGlobal("fetch",fetch);
    const trace:any={id:"fixture",startedAt:Date.now(),calls:[],events:[]};
    await runWithGenerationTrace(trace,()=>invokeLLM({taskRoute:"post_evaluation",messages:[{role:"user",content:"fixture"}],structuredValidationOwner:"caller",maxTransportAttempts:1,disableFallback:true,disableStructuredRepair:true}));
    expect(trace.calls).toHaveLength(1);expect(trace.calls[0].costSource).toBe("unknown");
  });
  it("does not turn an unusable HTTP 200 envelope into a known receipt",async()=>{
    ENV.openRouterApiKey="test-openrouter";
    const fetch=vi.fn(async()=>new Response(JSON.stringify({error:"bad envelope"}),{status:200}));vi.stubGlobal("fetch",fetch);
    await expect(invokeLLM({taskRoute:"post_evaluation",messages:[{role:"user",content:"fixture"}],structuredValidationOwner:"caller",maxTransportAttempts:1,disableFallback:true,disableStructuredRepair:true})).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("returns a fully received caller receipt when cancellation arrives during JSON decoding",async()=>{
    ENV.openRouterApiKey="test-openrouter";
    const controller=new AbortController();
    const response=providerResponse("google/gemini-3.8-flash",'{}');
    const json=response.json.bind(response);
    vi.spyOn(response,"json").mockImplementation(async()=>{const result=await json();controller.abort(new Error("after-receipt"));return result;});
    const fetch=vi.fn(async()=>response);vi.stubGlobal("fetch",fetch);
    const result=await invokeLLM({taskRoute:"post_evaluation",messages:[{role:"user",content:"fixture"}],structuredValidationOwner:"caller",maxTransportAttempts:1,disableFallback:true,disableStructuredRepair:true,signal:controller.signal});
    expect(result.id).toBeTruthy();expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects implicit retry settings before any HTTP dispatch", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(invokeLLM({ taskRoute: "post_evaluation", messages: [{role:"user",content:"fixture"}], structuredValidationOwner:"caller", disableFallback:true, disableStructuredRepair:true }))
      .rejects.toThrow("exactly 1 transport attempt");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("enforces required options for caller mode", async () => {
    ENV.openRouterApiKey = "test-openrouter";
    // Missing post_evaluation
    await expect(
      invokeLLM({
        messages: [{ role: "user", content: "test" }],
        structuredValidationOwner: "caller",
        disableFallback: true,
        disableStructuredRepair: true,
        maxTransportAttempts: 1,
      })
    ).rejects.toThrow("structuredValidationOwner 'caller' requires post_evaluation route");

    // Missing disableFallback
    await expect(
      invokeLLM({
        messages: [{ role: "user", content: "test" }],
        taskRoute: "post_evaluation",
        structuredValidationOwner: "caller",
        disableFallback: false,
        disableStructuredRepair: true,
        maxTransportAttempts: 1,
      })
    ).rejects.toThrow("structuredValidationOwner 'caller' requires post_evaluation route");

    // maxTransportAttempts > 1
    await expect(
      invokeLLM({
        messages: [{ role: "user", content: "test" }],
        taskRoute: "post_evaluation",
        structuredValidationOwner: "caller",
        disableFallback: true,
        disableStructuredRepair: true,
        maxTransportAttempts: 2,
      })
    ).rejects.toThrow("structuredValidationOwner 'caller' requires post_evaluation route");
  });

  it("returns truncated or invalid JSON result without throwing StructuredOutputError in caller mode", async () => {
    ENV.openRouterApiKey = "test-openrouter";
    ENV.openRouterProposalReviewModel = "google/gemini-3.8-flash";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        providerResponse("google/gemini-3.8-flash", '{"answer":', {
          finishReason: "length",
          nativeFinishReason: "MAX_TOKENS",
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeLLM({
      taskRoute: "post_evaluation",
      messages: [{ role: "user", content: "Analise" }],
      response_format: structuredFormat,
      structuredValidationOwner: "caller",
      disableFallback: true,
      disableStructuredRepair: true,
      maxTransportAttempts: 1,
    });

    expect(result.model).toBe("google/gemini-3.8-flash");
    expect(result.choices[0].finish_reason).toBe("length");
    expect(result.choices[0].native_finish_reason).toBe("MAX_TOKENS");
    expect(result.choices[0].message.content).toBe('{"answer":');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still throws network errors in caller mode", async () => {
    ENV.openRouterApiKey = "test-openrouter";
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("Network failure"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      invokeLLM({
        taskRoute: "post_evaluation",
        messages: [{ role: "user", content: "Analise" }],
        response_format: structuredFormat,
        structuredValidationOwner: "caller",
        disableFallback: true,
        disableStructuredRepair: true,
        maxTransportAttempts: 1,
      })
    ).rejects.toThrow();
  });
});
