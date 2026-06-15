import { ENV } from "./env";
import type { AiModel } from "@shared/postspark";
import { TRPCError } from "@trpc/server";
import { hashPrompt, recordLlmTraceCall } from "../ai/generationTrace";
import {
  adaptRequestForProvider,
  buildRepairMessages,
  hasMultimodalContent,
  validateStructuredContent,
  type ProviderModelConfig,
} from "../ai/providers/modelAdapters";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  model?: AiModel;
  traceLabel?: string;
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  disableFallback?: boolean;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

export function resolveModelConfig(
  model: AiModel = "gemini",
): ProviderModelConfig {
  if (model === "llama") {
    if (!ENV.groqApiKey) {
      throw new Error(
        "O modelo Llama requer GROQ_API_KEY; nenhum fallback silencioso foi aplicado.",
      );
    }
    return {
      provider: "groq",
      apiUrl: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: ENV.groqApiKey,
      effectiveModel: "llama-3.3-70b-versatile",
    };
  }

  if (ENV.geminiApiKey) {
    return {
      provider: "google",
      apiUrl:
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      apiKey: ENV.geminiApiKey,
      effectiveModel: "gemini-2.5-flash",
    };
  }

  if (ENV.forgeApiUrl && ENV.forgeApiKey) {
    return {
      provider: "forge",
      apiUrl: `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`,
      apiKey: ENV.forgeApiKey,
      effectiveModel: "gemini-2.5-flash",
    };
  }

  throw new Error("Nenhuma API configurada. Defina GEMINI_API_KEY no .env");
}

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const {
    model = "gemini",
    traceLabel = "llm",
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    disableFallback = false,
  } = params;
  const normalizedMessages = messages.map(normalizeMessage);
  const configurationStartedAt = Date.now();
  let primaryConfig: ReturnType<typeof resolveModelConfig>;
  try {
    primaryConfig = resolveModelConfig(model);
  } catch (error) {
    recordLlmTraceCall({
      label: traceLabel,
      requestedModel: model,
      effectiveModel: model,
      provider: "unconfigured",
      promptHash: hashPrompt(normalizedMessages),
      messages: normalizedMessages,
      response: undefined,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs: Date.now() - configurationStartedAt,
      estimatedCostUsd: 0,
      error: error instanceof Error ? error.message.slice(0, 500) : "Model configuration failed",
    });
    throw error;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  const buildPayload = (
    config: ProviderModelConfig,
    adaptedMessages: ReturnType<typeof adaptRequestForProvider>["messages"],
    adaptedFormat: ResponseFormat | undefined,
  ): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
      model: config.effectiveModel,
      messages: adaptedMessages,
      max_tokens: params.maxTokens ?? params.max_tokens ?? 8192,
    };
    if (tools && tools.length > 0) payload.tools = tools;
    if (normalizedToolChoice) payload.tool_choice = normalizedToolChoice;
    if (adaptedFormat) payload.response_format = adaptedFormat;
    return payload;
  };

  const estimateAndRecord = (input: {
    config: ProviderModelConfig;
    result?: InvokeResult;
    adaptedMessages: ReturnType<typeof adaptRequestForProvider>["messages"];
    startedAt: number;
    attempt: number;
    fallbackFrom?: string;
    translatedSchema: boolean;
    repairedOutput?: boolean;
    error?: unknown;
  }) => {
    const promptTokens = input.result?.usage?.prompt_tokens ?? 0;
    const completionTokens = input.result?.usage?.completion_tokens ?? 0;
    recordLlmTraceCall({
      label: traceLabel,
      requestedModel: model,
      effectiveModel:
        input.result?.model || input.config.effectiveModel,
      provider: input.config.provider,
      promptHash: hashPrompt(input.adaptedMessages),
      messages: input.adaptedMessages,
      response: input.result,
      promptTokens,
      completionTokens,
      totalTokens:
        input.result?.usage?.total_tokens ?? promptTokens + completionTokens,
      latencyMs: Date.now() - input.startedAt,
      estimatedCostUsd:
        (promptTokens / 1_000_000) * ENV.llmInputCostPerMillion +
        (completionTokens / 1_000_000) * ENV.llmOutputCostPerMillion,
      attempt: input.attempt,
      fallbackFrom: input.fallbackFrom,
      translatedSchema: input.translatedSchema,
      repairedOutput: input.repairedOutput,
      error:
        input.error instanceof Error
          ? input.error.message.slice(0, 500)
          : input.error
            ? String(input.error).slice(0, 500)
            : undefined,
    });
  };

  const callProvider = async (
    config: ProviderModelConfig,
    payload: Record<string, unknown>,
  ): Promise<InvokeResult> => {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      ENV.llmRequestTimeoutMs,
    );
    try {
      const response = await fetch(config.apiUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ProviderRequestError(
          config.provider,
          response.status,
          response.statusText,
          (await response.text()).slice(0, 500),
          parseRetryAfterMs(response.headers.get("retry-after")),
        );
      }
      return (await response.json()) as InvokeResult;
    } catch (error) {
      if (error instanceof ProviderRequestError) throw error;
      throw new ProviderRequestError(
        config.provider,
        undefined,
        error instanceof Error ? error.message : "Network request failed",
      );
    } finally {
      clearTimeout(timeout);
    }
  };

  const repairGroqOutput = async (input: {
    config: ProviderModelConfig;
    adapted: ReturnType<typeof adaptRequestForProvider>;
    invalidContent: string;
    errors: string[];
    fallbackFrom?: string;
  }): Promise<InvokeResult> => {
    if (!input.adapted.schema) {
      throw new Error("Schema ausente para reparo do output");
    }
    const repairMessages = buildRepairMessages({
      messages: input.adapted.messages,
      invalidContent: input.invalidContent,
      schema: input.adapted.schema,
      errors: input.errors,
    });
    const startedAt = Date.now();
    try {
      const result = await callProvider(
        input.config,
        buildPayload(input.config, repairMessages, { type: "json_object" }),
      );
      const content = responseText(result);
      const validation = validateStructuredContent(
        content,
        input.adapted.schema,
      );
      if (!validation.valid) {
        throw new Error(
          `Groq repair did not satisfy schema: ${validation.errors.join("; ")}`,
        );
      }
      estimateAndRecord({
        config: input.config,
        result,
        adaptedMessages: repairMessages,
        startedAt,
        attempt: 1,
        fallbackFrom: input.fallbackFrom,
        translatedSchema: true,
        repairedOutput: true,
      });
      return result;
    } catch (error) {
      estimateAndRecord({
        config: input.config,
        adaptedMessages: repairMessages,
        startedAt,
        attempt: 1,
        fallbackFrom: input.fallbackFrom,
        translatedSchema: true,
        repairedOutput: true,
        error,
      });
      throw error;
    }
  };

  const executeWithRetries = async (
    config: ProviderModelConfig,
    fallbackFrom?: string,
  ): Promise<InvokeResult> => {
    const adapted = adaptRequestForProvider({
      provider: config.provider,
      messages: normalizedMessages,
      responseFormat: normalizedResponseFormat,
    });
    let lastError: unknown;

    for (
      let attempt = 1;
      attempt <= ENV.llmTransientRetries + 1;
      attempt += 1
    ) {
      const startedAt = Date.now();
      try {
        const result = await callProvider(
          config,
          buildPayload(config, adapted.messages, adapted.responseFormat),
        );
        if (config.provider === "groq" && adapted.schema) {
          const content = responseText(result);
          const validation = validateStructuredContent(content, adapted.schema);
          if (!validation.valid) {
            estimateAndRecord({
              config,
              result,
              adaptedMessages: adapted.messages,
              startedAt,
              attempt,
              fallbackFrom,
              translatedSchema: true,
              error: new Error(
                `Structured output validation failed: ${validation.errors.join("; ")}`,
              ),
            });
            return repairGroqOutput({
              config,
              adapted,
              invalidContent: content,
              errors: validation.errors,
              fallbackFrom,
            });
          }
        }
        estimateAndRecord({
          config,
          result,
          adaptedMessages: adapted.messages,
          startedAt,
          attempt,
          fallbackFrom,
          translatedSchema:
            config.provider === "groq" && Boolean(adapted.schema),
        });
        return result;
      } catch (error) {
        lastError = error;
        estimateAndRecord({
          config,
          adaptedMessages: adapted.messages,
          startedAt,
          attempt,
          fallbackFrom,
          translatedSchema:
            config.provider === "groq" && Boolean(adapted.schema),
          error,
        });
        if (
          attempt > ENV.llmTransientRetries ||
          !isTransientProviderError(error)
        ) {
          throw error;
        }
        const providerDelay =
          error instanceof ProviderRequestError
            ? error.retryAfterMs
            : undefined;
        await sleep(Math.max(retryDelayMs(attempt), providerDelay ?? 0));
      }
    }
    throw lastError;
  };

  try {
    return await executeWithRetries(primaryConfig);
  } catch (primaryError) {
    const canFallback =
      model === "gemini" &&
      !disableFallback &&
      ENV.aiModelFallbackEnabled &&
      Boolean(ENV.groqApiKey) &&
      !hasMultimodalContent(messages) &&
      (!tools || tools.length === 0) &&
      isTransientProviderError(primaryError);

    if (!canFallback) {
      throw toPublicLlmError(primaryError);
    }

    try {
      const fallbackConfig = resolveModelConfig("llama");
      return await executeWithRetries(
        fallbackConfig,
        primaryConfig.effectiveModel,
      );
    } catch (fallbackError) {
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message:
          "Os provedores de IA estao temporariamente indisponiveis. Tente novamente em alguns instantes.",
        cause: fallbackError,
      });
    }
  }
}

class ProviderRequestError extends Error {
  constructor(
    readonly provider: string,
    readonly status?: number,
    statusText?: string,
    body?: string,
    readonly retryAfterMs?: number,
  ) {
    super(
      `${provider} API failed${status ? `: ${status}` : ""}${statusText ? ` ${statusText}` : ""}${body ? ` - ${body}` : ""}`,
    );
    this.name = "ProviderRequestError";
  }
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.min(30_000, Math.max(0, seconds * 1_000));
  }
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.min(30_000, Math.max(0, date - Date.now()));
}

export function isTransientStatus(status: number | undefined): boolean {
  return status === 408 || status === 429 || status === 500 ||
    status === 502 || status === 503 || status === 504;
}

function isTransientProviderError(error: unknown): boolean {
  return error instanceof ProviderRequestError &&
    (error.status === undefined || isTransientStatus(error.status));
}

function retryDelayMs(attempt: number): number {
  const exponential = ENV.llmRetryBaseDelayMs * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.round(Math.random() * ENV.llmRetryBaseDelayMs * 0.35);
  return exponential + jitter;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function responseText(result: InvokeResult): string {
  const content = result.choices[0]?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is TextContent => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function toPublicLlmError(error: unknown): Error {
  if (!(error instanceof ProviderRequestError)) {
    return error instanceof Error ? error : new Error("LLM call failed");
  }
  if (isTransientProviderError(error)) {
    return new TRPCError({
      code: error.status === 429 ? "TOO_MANY_REQUESTS" : "BAD_GATEWAY",
      message:
        "O provedor de IA esta temporariamente indisponivel. Tente novamente em alguns instantes.",
      cause: error,
    });
  }
  return new TRPCError({
    code: "BAD_GATEWAY",
    message: error.message,
    cause: error,
  });
}
