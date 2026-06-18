import { ENV } from "./env";
import { appendOperationalLog } from "./operationalLog";
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
import {
  canUseGeminiFallback,
  estimateModelCostUsd,
  GROQ_SCOUT_MODEL,
  GROQ_TEXT_MODEL,
  resolveGeminiFallbackConfig,
  resolveTaskModelConfig,
  type AiTaskRoute,
} from "../ai/modelRouter";

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
  taskRoute?: AiTaskRoute;
  traceLabel?: string;
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  temperature?: number;
  topP?: number;
  top_p?: number;
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
  reasoning_effort?: "none" | "minimal" | "low" | "medium" | "high";
  maxCompletionTokens?: number;
  max_completion_tokens?: number;
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
  provider?: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
    native_finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost?: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
      [key: string]: unknown;
    };
    cost_details?: Record<string, unknown>;
    [key: string]: unknown;
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

export function resolveModelConfig(model?: AiModel): ProviderModelConfig {
  return resolveTaskModelConfig({ requestedModel: model });
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

type StructuredFailureType =
  | "empty_content"
  | "truncated"
  | "invalid_json"
  | "schema_mismatch";

class StructuredOutputError extends Error {
  constructor(
    readonly failureType: StructuredFailureType,
    message: string,
  ) {
    super(message);
    this.name = "StructuredOutputError";
  }
}

const OPENROUTER_TASK_POLICY: Partial<
  Record<
    AiTaskRoute,
    {
      temperature: number;
      topP: number;
      reasoningEffort: "minimal" | "low";
      timeoutMs: number;
    }
  >
> = {
  content_strategy: {
    temperature: 0.35,
    topP: 0.85,
    reasoningEffort: "minimal",
    timeoutMs: 12_000,
  },
  static_generation: {
    temperature: 0.4,
    topP: 0.85,
    reasoningEffort: "minimal",
    timeoutMs: 35_000,
  },
  carousel_generation: {
    temperature: 0.45,
    topP: 0.85,
    reasoningEffort: "low",
    timeoutMs: 60_000,
  },
  post_evaluation: {
    temperature: 0.25,
    topP: 0.85,
    reasoningEffort: "minimal",
    timeoutMs: 20_000,
  },
  quality_revision: {
    temperature: 0.3,
    topP: 0.85,
    reasoningEffort: "minimal",
    timeoutMs: 25_000,
  },
  caption_synthesis: {
    temperature: 0.5,
    topP: 0.9,
    reasoningEffort: "minimal",
    timeoutMs: 25_000,
  },
};

function timeoutForTaskRoute(route?: AiTaskRoute): number {
  return route ? OPENROUTER_TASK_POLICY[route]?.timeoutMs ?? ENV.llmRequestTimeoutMs : ENV.llmRequestTimeoutMs;
}

function isAiTaskRoute(value: string | undefined): value is AiTaskRoute {
  return value === "content_strategy" ||
    value === "static_generation" ||
    value === "carousel_generation" ||
    value === "vision_analysis" ||
    value === "microcopy" ||
    value === "fast_vision" ||
    value === "fallback_text_or_vision" ||
    value === "post_evaluation" ||
    value === "quality_revision" ||
    value === "caption_synthesis";
}

function isTruncatedResult(result: InvokeResult): boolean {
  const choice = result.choices[0];
  const finish = `${choice?.finish_reason ?? ""} ${choice?.native_finish_reason ?? ""}`.toLowerCase();
  return finish.includes("length") ||
    finish.includes("max_token") ||
    finish.includes("max_output") ||
    finish.includes("limit");
}

function classifyStructuredFailure(
  result: InvokeResult,
  validationErrors: string[],
): StructuredFailureType {
  const content = responseText(result).trim();
  if (!content) return "empty_content";
  if (isTruncatedResult(result)) return "truncated";
  if (validationErrors.some((error) => error.includes("JSON invalido"))) {
    return "invalid_json";
  }
  return "schema_mismatch";
}

function shouldAttemptStructuredRepair(type: StructuredFailureType): boolean {
  return type === "invalid_json" || type === "schema_mismatch";
}

function contentLength(result?: InvokeResult): number | undefined {
  return result ? responseText(result).length : undefined;
}

function reasoningTokens(result?: InvokeResult): number {
  return result?.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
}

function realOrEstimatedCostUsd(input: {
  result?: InvokeResult;
  model: string;
  promptTokens: number;
  completionTokens: number;
}): number {
  if (typeof input.result?.usage?.cost === "number") {
    return input.result.usage.cost;
  }
  return estimateModelCostUsd({
    model: input.model,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
  });
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const {
    model,
    taskRoute,
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
  const containsMultimodalContent = hasMultimodalContent(normalizedMessages);
  const requestedModel = taskRoute ?? model ?? (containsMultimodalContent ? "vision_analysis" : "static_generation");
  const effectiveTaskRoute = taskRoute ?? (isAiTaskRoute(requestedModel) ? requestedModel : undefined);
  const configurationStartedAt = Date.now();
  let primaryConfig: ProviderModelConfig;
  try {
    primaryConfig = resolveTaskModelConfig({
      taskRoute,
      requestedModel: model,
      containsMultimodalContent,
    });
  } catch (error) {
    recordLlmTraceCall({
      label: traceLabel,
      requestedModel,
      taskRoute: effectiveTaskRoute,
      effectiveModel: requestedModel,
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
    const isGroqGptOss =
      config.provider === "groq" && config.effectiveModel === GROQ_TEXT_MODEL;
    const isScout =
      config.provider === "groq" && config.effectiveModel === GROQ_SCOUT_MODEL;
    const completionTokenLimit =
      params.maxCompletionTokens ??
      params.max_completion_tokens ??
      params.maxTokens ??
      params.max_tokens ??
      2048;
    const payload: Record<string, unknown> = {
      model: config.effectiveModel,
      messages: adaptedMessages,
    };
    if (isGroqGptOss) {
      payload.max_completion_tokens = completionTokenLimit;
      payload.temperature = params.temperature ?? 0.45;
      payload.top_p = params.topP ?? params.top_p ?? 0.9;
      payload.reasoning_effort =
        params.reasoningEffort ?? params.reasoning_effort ?? "low";
    } else if (config.provider === "openrouter") {
      const taskPolicy = effectiveTaskRoute ? OPENROUTER_TASK_POLICY[effectiveTaskRoute] : undefined;
      const reasoningEffort =
        params.reasoningEffort ??
        params.reasoning_effort ??
        taskPolicy?.reasoningEffort;
      payload.max_tokens = completionTokenLimit;
      payload.temperature = params.temperature ?? taskPolicy?.temperature ?? 0.55;
      payload.top_p = params.topP ?? params.top_p ?? taskPolicy?.topP ?? 0.9;
      if (reasoningEffort) {
        payload.reasoning_effort = reasoningEffort;
        payload.reasoning = { effort: reasoningEffort, exclude: true };
      }
      if (config.providerOptions) {
        payload.provider = config.providerOptions;
      }
    } else {
      payload.max_tokens = completionTokenLimit;
      if (typeof params.temperature === "number") {
        payload.temperature = params.temperature;
      }
      const topP = params.topP ?? params.top_p;
      if (typeof topP === "number") {
        payload.top_p = topP;
      }
    }
    if (isScout && completionTokenLimit > 2048) {
      payload.max_tokens = 2048;
    }
    if (tools && tools.length > 0) payload.tools = tools;
    if (normalizedToolChoice) payload.tool_choice = normalizedToolChoice;
    if (adaptedFormat) payload.response_format = adaptedFormat;
    return payload;
  };

  const extractPayloadOptions = (payload: Record<string, unknown>) => ({
    temperature: payload.temperature,
    top_p: payload.top_p,
    reasoning: payload.reasoning,
    reasoning_effort: payload.reasoning_effort,
    max_tokens: payload.max_tokens,
    max_completion_tokens: payload.max_completion_tokens,
  });

  const estimateAndRecord = (input: {
    config: ProviderModelConfig;
    result?: InvokeResult;
    adaptedMessages: ReturnType<typeof adaptRequestForProvider>["messages"];
    startedAt: number;
    attempt: number;
    fallbackFrom?: string;
    translatedSchema: boolean;
    structuredOutputMode?: "native_schema" | "text_schema";
    payloadOptions?: {
      temperature?: unknown;
      top_p?: unknown;
      reasoning?: unknown;
      reasoning_effort?: unknown;
      max_tokens?: unknown;
      max_completion_tokens?: unknown;
    };
    structuredFailureType?: StructuredFailureType;
    repairedOutput?: boolean;
    error?: unknown;
  }) => {
    const promptTokens = input.result?.usage?.prompt_tokens ?? 0;
    const completionTokens = input.result?.usage?.completion_tokens ?? 0;
    const totalTokens =
      input.result?.usage?.total_tokens ?? promptTokens + completionTokens;
    const latencyMs = Date.now() - input.startedAt;
    const estimatedCostUsd =
      realOrEstimatedCostUsd({
        result: input.result,
        model: input.result?.model || input.config.effectiveModel,
        promptTokens,
        completionTokens,
      });
    const error =
      input.error instanceof Error
        ? input.error.message.slice(0, 500)
        : input.error
          ? String(input.error).slice(0, 500)
          : undefined;
    recordLlmTraceCall({
      label: traceLabel,
      requestedModel,
      taskRoute: effectiveTaskRoute,
      effectiveModel:
        input.result?.model || input.config.effectiveModel,
      provider: input.config.provider,
      promptHash: hashPrompt(input.adaptedMessages),
      messages: input.adaptedMessages,
      response: input.result,
      promptTokens,
      completionTokens,
      totalTokens,
      latencyMs,
      estimatedCostUsd,
      attempt: input.attempt,
      fallbackFrom: input.fallbackFrom,
      translatedSchema: input.translatedSchema,
      structuredOutputMode: input.structuredOutputMode,
      payloadOptions: input.payloadOptions,
      reasoningTokens: reasoningTokens(input.result),
      finishReason: input.result?.choices?.[0]?.finish_reason,
      nativeFinishReason: input.result?.choices?.[0]?.native_finish_reason,
      contentLength: contentLength(input.result),
      structuredFailureType: input.structuredFailureType,
      repairedOutput: input.repairedOutput,
      error,
    });
    void appendOperationalLog(input.result ? "AI_PROVIDER_200" : "AI_PROVIDER_ATTEMPT_FAILED", {
      traceLabel,
      requestedModel,
      taskRoute: effectiveTaskRoute,
      provider: input.config.provider,
      effectiveModel: input.result?.model || input.config.effectiveModel,
      attempt: input.attempt,
      fallbackFrom: input.fallbackFrom,
      translatedSchema: input.translatedSchema,
      structuredOutputMode: input.structuredOutputMode,
      payloadOptions: input.payloadOptions,
      reasoningTokens: reasoningTokens(input.result),
      finishReason: input.result?.choices?.[0]?.finish_reason,
      nativeFinishReason: input.result?.choices?.[0]?.native_finish_reason,
      contentLength: contentLength(input.result),
      structuredFailureType: input.structuredFailureType,
      repairedOutput: input.repairedOutput,
      promptHash: hashPrompt(input.adaptedMessages),
      promptTokens,
      completionTokens,
      totalTokens,
      latencyMs,
      estimatedCostUsd,
      responseId: input.result?.id,
      error,
    });
  };

  const callProvider = async (
    config: ProviderModelConfig,
    payload: Record<string, unknown>,
  ): Promise<InvokeResult> => {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      timeoutForTaskRoute(effectiveTaskRoute),
    );
    try {
      const response = await fetch(config.apiUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
          ...config.headers,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        const errorBody = (await response.text()).slice(0, 500);
        void appendOperationalLog("AI_PROVIDER_NON_200", {
          provider: config.provider,
          model: config.effectiveModel,
          statusCode: response.status,
          statusText: response.statusText,
          retryAfter: response.headers.get("retry-after"),
          body: errorBody,
        });
        throw new ProviderRequestError(
          config.provider,
          response.status,
          response.statusText,
          errorBody,
          parseRetryAfterMs(response.headers.get("retry-after")),
        );
      }
      return (await response.json()) as InvokeResult;
    } catch (error) {
      if (error instanceof ProviderRequestError) throw error;
      void appendOperationalLog("AI_PROVIDER_REQUEST_ERROR", {
        provider: config.provider,
        model: config.effectiveModel,
        error,
      });
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
        buildPayload(
          input.config,
          repairMessages,
          input.adapted.responseFormat ?? { type: "json_object" },
        ),
      );
      const content = responseText(result);
      const validation = validateStructuredContent(
        content,
        input.adapted.schema,
      );
      if (!validation.valid) {
        throw new Error(
          `Structured output repair did not satisfy schema: ${validation.errors.join("; ")}`,
        );
      }
      estimateAndRecord({
        config: input.config,
        result,
        adaptedMessages: repairMessages,
        startedAt,
        attempt: 1,
        fallbackFrom: input.fallbackFrom,
        translatedSchema: input.adapted.structuredOutputMode === "text_schema",
        structuredOutputMode: input.adapted.structuredOutputMode,
        payloadOptions: extractPayloadOptions(
          buildPayload(
            input.config,
            repairMessages,
            input.adapted.responseFormat ?? { type: "json_object" },
          ),
        ),
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
        translatedSchema: input.adapted.structuredOutputMode === "text_schema",
        structuredOutputMode: input.adapted.structuredOutputMode,
        payloadOptions: extractPayloadOptions(
          buildPayload(
            input.config,
            repairMessages,
            input.adapted.responseFormat ?? { type: "json_object" },
          ),
        ),
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
    const buildAdaptedRequest = (forceTextSchema = false) =>
      adaptRequestForProvider({
        provider: config.provider,
        effectiveModel: config.effectiveModel,
        forceTextSchema,
        messages: normalizedMessages,
        responseFormat: normalizedResponseFormat,
      });
    let adapted = buildAdaptedRequest();
    let lastError: unknown;
    let maxAttempts = ENV.llmTransientRetries + 1;
    let downgradedNativeSchema = false;

    for (
      let attempt = 1;
      attempt <= maxAttempts;
      attempt += 1
    ) {
      const startedAt = Date.now();
      const payload = buildPayload(config, adapted.messages, adapted.responseFormat);
      try {
        const result = await callProvider(config, payload);
        if (adapted.schema) {
          const content = responseText(result);
          const validation = validateStructuredContent(content, adapted.schema);
          if (!validation.valid) {
            const structuredFailureType = classifyStructuredFailure(
              result,
              validation.errors,
            );
            estimateAndRecord({
              config,
              result,
              adaptedMessages: adapted.messages,
              startedAt,
              attempt,
              fallbackFrom,
              translatedSchema: adapted.structuredOutputMode === "text_schema",
              structuredOutputMode: adapted.structuredOutputMode,
              payloadOptions: extractPayloadOptions(payload),
              structuredFailureType,
              error: new Error(
                `Structured output validation failed: ${validation.errors.join("; ")}`,
              ),
            });
            if (!shouldAttemptStructuredRepair(structuredFailureType)) {
              throw new StructuredOutputError(
                structuredFailureType,
                `Structured output ${structuredFailureType}; skipping repair`,
              );
            }
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
          translatedSchema: adapted.structuredOutputMode === "text_schema",
          structuredOutputMode: adapted.structuredOutputMode,
          payloadOptions: extractPayloadOptions(payload),
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
          translatedSchema: adapted.structuredOutputMode === "text_schema",
          structuredOutputMode: adapted.structuredOutputMode,
          payloadOptions: extractPayloadOptions(payload),
          structuredFailureType:
            error instanceof StructuredOutputError
              ? error.failureType
              : undefined,
          error,
        });
        if (
          shouldDowngradeGroqSchema(error, config, adapted) &&
          !downgradedNativeSchema
        ) {
          adapted = buildAdaptedRequest(true);
          downgradedNativeSchema = true;
          maxAttempts += 1;
          continue;
        }
        if (
          attempt >= maxAttempts ||
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
      primaryConfig.provider !== "google" &&
      primaryConfig.provider !== "forge" &&
      !disableFallback &&
      ENV.aiModelFallbackEnabled &&
      canUseGeminiFallback() &&
      (!tools || tools.length === 0) &&
      isTransientProviderError(primaryError);

    if (!canFallback) {
      throw toPublicLlmError(primaryError);
    }

    try {
      const fallbackConfig = resolveGeminiFallbackConfig();
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

function shouldDowngradeGroqSchema(
  error: unknown,
  config: ProviderModelConfig,
  adapted: ReturnType<typeof adaptRequestForProvider>,
): boolean {
  return (
    config.provider === "groq" &&
    adapted.structuredOutputMode === "native_schema" &&
    error instanceof ProviderRequestError &&
    (error.status === 400 || error.status === 422)
  );
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
