import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./env";
import { invokeLLM, resolveModelConfig } from "./llm";

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
          "openai/gpt-5-mini",
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

    expect(result.model).toBe("openai/gpt-5-mini");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      model: string;
    };
    expect(request.model).toBe("openai/gpt-5-mini");
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
    expect(visionRequest.model).toBe("openai/gpt-5-mini");
    expect(geminiRequest.model).toBe("gemini-2.5-flash");
  });
});
