import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./env";
import { invokeLLM, resolveModelConfig } from "./llm";

const original = {
  geminiApiKey: ENV.geminiApiKey,
  groqApiKey: ENV.groqApiKey,
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
      effectiveModel: "llama-3.3-70b-versatile",
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
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("invokeLLM resilience", () => {
  it("retries a transient Gemini failure before using fallback", async () => {
    ENV.geminiApiKey = "test-gemini";
    ENV.groqApiKey = "test-groq";
    ENV.aiModelFallbackEnabled = true;
    ENV.llmTransientRetries = 1;
    ENV.llmRetryBaseDelayMs = 0;

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
  });

  it("translates the schema and falls back to Groq after Gemini retries", async () => {
    ENV.geminiApiKey = "test-gemini";
    ENV.groqApiKey = "test-groq";
    ENV.aiModelFallbackEnabled = true;
    ENV.llmTransientRetries = 0;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("overloaded", { status: 503, statusText: "Unavailable" }),
      )
      .mockResolvedValueOnce(
        providerResponse("llama-3.3-70b-versatile", '{"answer":"groq"}'),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeLLM({
      messages: [{ role: "user", content: "Responda" }],
      response_format: structuredFormat,
    });

    expect(result.model).toBe("llama-3.3-70b-versatile");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const groqRequest = JSON.parse(
      String(fetchMock.mock.calls[1][1]?.body),
    ) as {
      model: string;
      response_format: { type: string };
      messages: Array<{ content: string }>;
    };
    expect(groqRequest.model).toBe("llama-3.3-70b-versatile");
    expect(groqRequest.response_format).toEqual({ type: "json_object" });
    expect(groqRequest.messages[0].content).toContain("JSON Schema");
  });

  it("repairs one schema-invalid Groq response", async () => {
    ENV.geminiApiKey = "test-gemini";
    ENV.groqApiKey = "test-groq";
    ENV.aiModelFallbackEnabled = true;
    ENV.llmTransientRetries = 0;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("overloaded", { status: 503 }))
      .mockResolvedValueOnce(
        providerResponse("llama-3.3-70b-versatile", '{"wrong":true}'),
      )
      .mockResolvedValueOnce(
        providerResponse("llama-3.3-70b-versatile", '{"answer":"repaired"}'),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeLLM({
      messages: [{ role: "user", content: "Responda" }],
      response_format: structuredFormat,
    });

    expect(result.choices[0].message.content).toBe('{"answer":"repaired"}');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not send multimodal calls to the text-only fallback", async () => {
    ENV.geminiApiKey = "test-gemini";
    ENV.groqApiKey = "test-groq";
    ENV.aiModelFallbackEnabled = true;
    ENV.llmTransientRetries = 0;

    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("overloaded", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      invokeLLM({
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
      }),
    ).rejects.toThrow("temporariamente indisponivel");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
