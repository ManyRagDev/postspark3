import { createHash } from "node:crypto";
import { z } from "zod";
import { ENV } from "./env";
import { appendOperationalLog } from "./operationalLog";
import type { AiModel } from "@shared/postspark";
import { generationTaskModelSchema, type GenerationTaskModelConfig } from "@shared/generationModel";
import { TRPCError } from "@trpc/server";
import { hashPrompt, recordLlmTraceCall } from "../ai/generationTrace";
import {
  adaptRequestForProvider,
  buildRepairMessages,
  hasMultimodalContent,
  generationTaskProviderOptions,
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

/** A complete, explicit provider rejection is terminal even when its cost is unreported. */
const rejectionHashes = {
  requestHash: z.string().regex(/^[a-f0-9]{64}$/), responseHash: z.string().regex(/^[a-f0-9]{64}$/),
  costStatus: z.literal("unreported"),
};
const providerIdsSchema = z.array(z.string().regex(/^[a-z0-9][a-z0-9._/-]{0,99}$/)).max(32)
  .refine(ids => new Set(ids).size === ids.length);
export const providerRejectionReceiptSchema = z.object({
  __providerRejection: z.union([
    z.object({
      version: z.literal(1), provider: z.literal("openrouter"), model: z.string().min(1),
      httpStatus: z.union([z.literal(400), z.literal(422)]), reason: z.literal("invalid_request_error"),
      providerRequestId: z.string().min(1).max(200), ...rejectionHashes,
    }).strict(),
    z.object({
      version: z.literal(2), provider: z.literal("openrouter"), model: z.string().min(1),
      httpStatus: z.literal(404), reason: z.literal("no_allowed_providers"),
      requestedProviders: providerIdsSchema.refine(ids => ids.length > 0),
      availableProviders: providerIdsSchema, ...rejectionHashes,
    }).strict().refine(receipt => !receipt.requestedProviders.some(id => receipt.availableProviders.includes(id))),
  ]),
}).strict();
export type ProviderRejectionReceipt = z.infer<typeof providerRejectionReceiptSchema>;
export class KnownProviderRejectionError extends Error {
  readonly code?: "provider_route_unavailable";
  constructor(readonly receipt: ProviderRejectionReceipt) {
    super(`provider_request_rejected:${receipt.__providerRejection.reason}:${receipt.__providerRejection.httpStatus}`);
    this.name = "KnownProviderRejectionError";
    if (receipt.__providerRejection.reason === "no_allowed_providers") this.code = "provider_route_unavailable";
  }
}
export function providerRejectionErrorFromReceipt(value: unknown) {
  const result = providerRejectionReceiptSchema.safeParse(value);
  return result.success ? new KnownProviderRejectionError(result.data) : undefined;
}
export function knownProviderRejectionReceipt(error: unknown): ProviderRejectionReceipt | undefined {
  let current = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof KnownProviderRejectionError) return providerRejectionReceiptSchema.parse(current.receipt);
    current = typeof current === "object" && "cause" in current ? current.cause : undefined;
  }
}
/** No inference, body text or assumed zero charge is stored in this receipt. */
export function knownProviderRejectionFromResponse(input: {
  provider: string; model: string; httpStatus: number; payload: unknown; responseBody: string;
}): KnownProviderRejectionError | undefined {
  if (input.provider !== "openrouter" || ![400, 404, 422].includes(input.httpStatus)) return;
  try {
    const body = JSON.parse(input.responseBody);
    if (body?.error?.code !== input.httpStatus) return;
    const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    if (input.httpStatus === 404) {
      // This observed pre-routing rejection is specific to provider.only. An
      // ordered route or any other 404 remains uncertain without this proof.
      const payload = input.payload as { model?: unknown; provider?: { only?: unknown; allow_fallbacks?: unknown } };
      const requested = providerIdsSchema.safeParse(body.error.metadata?.requested_providers);
      const available = providerIdsSchema.safeParse(body.error.metadata?.available_providers);
      const only = providerIdsSchema.safeParse(payload?.provider?.only);
      if (typeof body.error.message !== "string" ||
          !body.error.message.startsWith("No allowed providers are available for the selected model.") ||
          payload?.model !== input.model || payload?.provider?.allow_fallbacks !== false ||
          !requested.success || !available.success || !only.success || !only.data.length ||
          only.data.length !== requested.data.length || !only.data.every(id => requested.data.includes(id)) ||
          body.usage != null || body.choices != null || body.id != null || body.error.metadata?.raw != null) return;
      return providerRejectionErrorFromReceipt({ __providerRejection: {
        version: 2, provider: "openrouter", model: input.model, httpStatus: 404, reason: "no_allowed_providers",
        requestedProviders: requested.data, availableProviders: available.data,
        requestHash: digest(input.payload), responseHash: digest(body), costStatus: "unreported",
      } });
    }
    const raw = JSON.parse(body?.error?.metadata?.raw);
    if (raw?.type !== "error" || raw?.error?.type !== "invalid_request_error" ||
        typeof raw.request_id !== "string" || !raw.request_id || raw.request_id.length > 200) return;
    return providerRejectionErrorFromReceipt({ __providerRejection: {
      version: 1, provider: "openrouter", model: input.model, httpStatus: input.httpStatus,
      reason: "invalid_request_error", providerRequestId: raw.request_id,
      requestHash: digest(input.payload), responseHash: digest(body), costStatus: "unreported",
    } });
  } catch { return; }
}

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
  /** Internal model identity from a validated durable configuration; never client input. */
  pinnedModel?: string;
  /** Internal endpoint/capability receipt for the automatic task policy. */
  taskModelConfig?: GenerationTaskModelConfig;
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
  deadlineMs?: number;
  /** Internal per-call transport budget; never extends the absolute deadline. */
  transportTimeoutMs?: number;
  signal?: AbortSignal;
  maxTransportAttempts?: number;
  forceTextSchema?: boolean;
  disableStructuredRepair?: boolean;
  structuredValidationOwner?: "transport" | "caller";
  /** Internal pinned preparation protocol; the journal owns response validation. */
  durablePreparationReceipt?: boolean;
  /** Proposal copy is validated after the provider response is journaled. */
  durableProposalCopyReceipt?: boolean;
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

function validatedTaskModelConfig(params: InvokeParams) {
  if (!params.taskModelConfig) return undefined;
  const config = generationTaskModelSchema.parse(params.taskModelConfig);
  if (params.pinnedModel !== config.model || !params.disableFallback ||
      params.forceTextSchema || params.maxTransportAttempts !== 1 || !params.disableStructuredRepair) {
    throw new Error("automatic_task_transport_policy_mismatch");
  }
  return config;
}

/** Exact OpenRouter wire messages used to bind a preparation receipt to its request. */
export function preparationTransportSnapshot(params: InvokeParams) {
  if (!params.pinnedModel || !params.disableFallback)
    throw new Error("pinned_preparation_transport_required");
  const responseFormat = normalizeResponseFormat(params);
  const taskModelConfig = validatedTaskModelConfig(params);
  return adaptRequestForProvider({
    provider: "openrouter", effectiveModel: params.pinnedModel, forceTextSchema: params.forceTextSchema,
    requireNativeSchema: Boolean(taskModelConfig),
    messages: params.messages.map(normalizeMessage), responseFormat,
  });
}

type StructuredFailureType =
  | "empty_content"
  | "truncated"
  | "invalid_json"
  | "schema_mismatch";

export class StructuredOutputError extends Error {
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
      reasoningEffort?: "minimal" | "low";
      timeoutMs: number;
    }
  >
> = {
  brief_interpretation: {
    temperature: 0.2,
    topP: 0.85,
    reasoningEffort: "low",
    timeoutMs: 8_000,
  },
  content_strategy: {
    temperature: 0.35,
    topP: 0.85,
    reasoningEffort: "minimal",
    timeoutMs: 12_000,
  },
  design_analysis: {
    temperature: 0.2,
    topP: 0.85,
    timeoutMs: 90_000,
  },
  design_recreation: {
    temperature: 0.15,
    topP: 0.85,
    reasoningEffort: "low",
    timeoutMs: 90_000,
  },
  static_generation: {
    temperature: 0.4,
    topP: 0.85,
    reasoningEffort: "minimal",
    // Ajustado de 35s: o gpt-5-mini via OpenRouter com strict JSON schema
    // frequentemente passa de 35s — o corte prematuro forçava 2 retries que
    // consumiam o deadline inteiro do run (rodagens manuais 2026-08-14,
    // runs d241c373 e c041215e: aborts aos ~35s e 504 por deadline).
    timeoutMs: 60_000,
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
    // Ajustado de 25s: reparo real observado em ~34s; o corte forçava retry
    // dentro de um run já perto do deadline.
    timeoutMs: 60_000,
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
  return value === "brief_interpretation" ||
    value === "content_strategy" ||
    value === "static_generation" ||
    value === "carousel_generation" ||
    value === "vision_analysis" ||
    value === "design_analysis" ||
    value === "design_recreation" ||
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

function reasoningTokens(result?: InvokeResult): number | undefined {
  const value = result?.usage?.completion_tokens_details?.reasoning_tokens;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function realOrEstimatedCostUsd(input: {
  result?: InvokeResult;
  model: string;
  promptTokens: number;
  completionTokens: number;
}): number {
  if (typeof input.result?.usage?.cost === "number" && Number.isFinite(input.result.usage.cost) && input.result.usage.cost >= 0) {
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
    deadlineMs,
    signal,
    maxTransportAttempts,
    forceTextSchema = false,
    disableStructuredRepair = false,
    structuredValidationOwner = "transport",
  } = params;
  const ensureBeforeDeadline = () => {
    signal?.throwIfAborted();
    if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
      throw new LlmDeadlineExceededError();
    }
  };
  const taskModelConfig = validatedTaskModelConfig(params);
  const normalizedMessages = messages.map(normalizeMessage);
  const containsMultimodalContent = hasMultimodalContent(normalizedMessages);
  const requestedModel = taskRoute ?? model ?? (containsMultimodalContent ? "vision_analysis" : "static_generation");
  const effectiveTaskRoute = taskRoute ?? (isAiTaskRoute(requestedModel) ? requestedModel : undefined);

  if (structuredValidationOwner === "caller") {
    const preparationCaller = params.durablePreparationReceipt === true && Boolean(params.pinnedModel) &&
      ["static_generation", "carousel_generation"].includes(effectiveTaskRoute ?? "") &&
      ["generation_intent_v1", "generation_selection_v1"].includes(traceLabel);
    const proposalCopyCaller = params.durableProposalCopyReceipt === true && Boolean(params.pinnedModel) &&
      ["static_generation", "carousel_generation"].includes(effectiveTaskRoute ?? "") &&
      /^proposal_.+_copy(?:_recovery)?$/.test(traceLabel);
    const completionLimit = params.maxCompletionTokens ?? params.max_completion_tokens ?? params.maxTokens ?? params.max_tokens;
    // A targeted editorial patch must be journaled before local validation too.
    // Keep this exception limited to the validated, bounded automatic repair route.
    const proposalRepairCaller = params.durableProposalCopyReceipt === true &&
      taskModelConfig?.model === "deepseek/deepseek-v4.1-flash" &&
      normalizeResponseFormat(params)?.type === "json_schema" &&
      taskModelConfig.transportTimeoutMs <= 60_000 &&
      typeof params.transportTimeoutMs === "number" && params.transportTimeoutMs > 0 &&
      params.transportTimeoutMs <= taskModelConfig.transportTimeoutMs &&
      typeof completionLimit === "number" && Number.isInteger(completionLimit) && completionLimit > 0 && completionLimit <= 2048 &&
      ["static_generation", "carousel_generation"].includes(effectiveTaskRoute ?? "") &&
      /^proposal_.+_editorial_recovery$/.test(traceLabel);
    if (
      effectiveTaskRoute !== "post_evaluation" && !preparationCaller && !proposalCopyCaller && !proposalRepairCaller ||
      maxTransportAttempts !== 1 ||
      !disableFallback ||
      !disableStructuredRepair
    ) {
      throw new Error(
        "structuredValidationOwner 'caller' requires post_evaluation route or a permitted journaled generation, exactly 1 transport attempt, disableFallback: true, and disableStructuredRepair: true"
      );
    }
  }
  const configurationStartedAt = Date.now();
  let primaryConfig: ProviderModelConfig;
  try {
    primaryConfig = resolveTaskModelConfig({
      taskRoute,
      requestedModel: model,
      containsMultimodalContent,
    });
    if (params.pinnedModel) {
      if (primaryConfig.provider !== "openrouter" || !params.disableFallback)
        throw new Error("pinned_model_requires_openrouter_without_fallback");
      primaryConfig = {...primaryConfig, effectiveModel:params.pinnedModel};
    }
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
      const isGptSol = config.effectiveModel.startsWith("openai/gpt-6.1-sol");
      const requestedReasoning =
        params.reasoningEffort ??
        params.reasoning_effort ??
        taskPolicy?.reasoningEffort;
      const reasoningEffort = isGptSol && (!requestedReasoning || ["none", "minimal"].includes(requestedReasoning))
        ? "medium" : requestedReasoning;
      payload.max_tokens = completionTokenLimit;
      if (!isGptSol && !taskModelConfig) {
        payload.temperature = params.temperature ?? taskPolicy?.temperature ?? 0.55;
        payload.top_p = params.topP ?? params.top_p ?? taskPolicy?.topP ?? 0.9;
      }
      if (taskModelConfig) {
        payload.reasoning = { enabled: taskModelConfig.reasoningEnabled };
      } else if (reasoningEffort) {
        payload.reasoning_effort = reasoningEffort;
        payload.reasoning = { effort: reasoningEffort, exclude: true };
      }
      if (taskModelConfig) {
        // The immutable task receipt owns the entire provider preference; never
        // inherit a stale only/order constraint from the default model route.
        payload.provider = generationTaskProviderOptions(taskModelConfig);
      } else if (config.providerOptions) {
        payload.provider = isGptSol ? { ...config.providerOptions, require_parameters: true } : config.providerOptions;
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
      ...(structuredValidationOwner === "caller" ? {
        costSource: typeof input.result?.usage?.cost === "number" && Number.isFinite(input.result.usage.cost) && input.result.usage.cost >= 0
          ? "provider" as const
          : Number.isFinite(input.result?.usage?.prompt_tokens) && Number.isFinite(input.result?.usage?.completion_tokens)
            ? "estimate" as const : "unknown" as const,
      } : {}),
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
      transportTimeoutMs: params.transportTimeoutMs ?? timeoutForTaskRoute(effectiveTaskRoute),
      deadlineAt: deadlineMs,
      failureKind: input.error instanceof LlmTransportTimeoutError ? "transport_timeout" : input.error instanceof LlmDeadlineExceededError ? "deadline" : input.error ? "provider_error" : undefined,
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
    ensureBeforeDeadline();
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", onAbort, { once: true });
    const routeTimeoutMs = Number.isFinite(params.transportTimeoutMs) && params.transportTimeoutMs! > 0
      ? Math.min(params.transportTimeoutMs!, 180_000)
      : timeoutForTaskRoute(effectiveTaskRoute);
    const remainingMs = deadlineMs === undefined ? Infinity : deadlineMs - Date.now();
    const deadlineIsLimiting = remainingMs <= routeTimeoutMs;
    let deadlineTimerFired = false;
    let transportTimerFired = false;
    const timeout = setTimeout(() => {
      if (deadlineIsLimiting) deadlineTimerFired = true;
      else transportTimerFired = true;
      controller.abort();
    }, Math.max(1, Math.min(routeTimeoutMs, remainingMs)));
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
        const completeErrorBody = await response.text();
        const errorBody = completeErrorBody.slice(0, 500);
        void appendOperationalLog("AI_PROVIDER_NON_200", {
          provider: config.provider,
          model: config.effectiveModel,
          statusCode: response.status,
          statusText: response.statusText,
          retryAfter: response.headers.get("retry-after"),
          body: errorBody,
        });
        const rejected = knownProviderRejectionFromResponse({ provider: config.provider, model: config.effectiveModel,
          httpStatus: response.status, payload, responseBody: completeErrorBody });
        if (rejected) throw rejected;
        throw new ProviderRequestError(
          config.provider,
          response.status,
          response.statusText,
          errorBody,
          parseRetryAfterMs(response.headers.get("retry-after")),
        );
      }
      const result = (await response.json()) as InvokeResult;
      if (structuredValidationOwner === "caller") {
        // A known receipt must reach the journal even if cancellation/deadline
        // arrived while its already-completed HTTP body was being decoded.
        if (!result || typeof result.id !== "string" || !result.id || typeof result.model !== "string" || !result.model ||
          !Array.isArray(result.choices) || !result.choices.length || !result.choices[0]?.message || typeof result.choices[0].message !== "object")
          throw new ProviderRequestError(config.provider, response.status, "Unusable provider receipt");
        return result;
      }
      ensureBeforeDeadline();
      return result;
    } catch (error) {
      // A complete rejection remains known if cancellation races its body decode.
      if (error instanceof KnownProviderRejectionError) throw error;
      signal?.throwIfAborted();
      if (deadlineTimerFired || (deadlineMs !== undefined && Date.now() >= deadlineMs)) {
        throw new LlmDeadlineExceededError();
      }
      if (transportTimerFired) throw new LlmTransportTimeoutError(routeTimeoutMs);
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
      signal?.removeEventListener("abort", onAbort);
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
        requireNativeSchema: Boolean(taskModelConfig),
        forceTextSchema,
        messages: normalizedMessages,
        responseFormat: normalizedResponseFormat,
      });
    let adapted = buildAdaptedRequest(forceTextSchema);
    let lastError: unknown;
    // A interpretação é auxiliar: não deixa retries consumirem o tempo da geração.
    const defaultMaxAttempts = effectiveTaskRoute === "brief_interpretation" ? 1 : ENV.llmTransientRetries + 1;
    let maxAttempts = maxTransportAttempts === undefined
      ? defaultMaxAttempts
      : Math.max(1, Math.floor(maxTransportAttempts));
    let downgradedNativeSchema = false;

    for (
      let attempt = 1;
      attempt <= maxAttempts;
      attempt += 1
    ) {
      ensureBeforeDeadline();
      const startedAt = Date.now();
      const payload = buildPayload(config, adapted.messages, adapted.responseFormat);
      try {
        const result = await callProvider(config, payload);
        if (adapted.normalizeResponseContent && typeof result.choices?.[0]?.message?.content === "string") {
          result.choices[0].message.content = adapted.normalizeResponseContent(result.choices[0].message.content);
        }
        if (adapted.schema) {
          const content = responseText(result);
          const validation = validateStructuredContent(content, adapted.schema);
          if (!validation.valid) {
            const structuredFailureType = classifyStructuredFailure(
              result,
              validation.errors,
            );
            if (structuredValidationOwner === "caller") {
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
              });
              return result;
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
              structuredFailureType,
              error: new Error(
                `Structured output validation failed: ${validation.errors.join("; ")}`,
              ),
            });
            if (disableStructuredRepair || effectiveTaskRoute === "brief_interpretation" || effectiveTaskRoute === "design_recreation" || !shouldAttemptStructuredRepair(structuredFailureType)) {
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
        if (!(error instanceof StructuredOutputError)) {
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
        }
        if (
          shouldDowngradeGroqSchema(error, config, adapted) &&
          !downgradedNativeSchema
        ) {
          if (maxTransportAttempts === undefined) maxAttempts += 1;
          else if (attempt >= maxAttempts) throw error;
          adapted = buildAdaptedRequest(true);
          downgradedNativeSchema = true;
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
        ensureBeforeDeadline();
        const delay = Math.max(retryDelayMs(attempt), providerDelay ?? 0);
        const remaining = deadlineMs === undefined ? delay : Math.max(0, deadlineMs - Date.now());
        await sleep(Math.min(delay, remaining));
        ensureBeforeDeadline();
      }
    }
    throw lastError;
  };

  try {
    return await executeWithRetries(primaryConfig);
  } catch (primaryError) {
    if (primaryError instanceof KnownProviderRejectionError) throw primaryError;
    if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
      throw primaryError instanceof LlmDeadlineExceededError
        ? primaryError
        : new LlmDeadlineExceededError();
    }
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
      ensureBeforeDeadline();
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

class LlmDeadlineExceededError extends Error {
  constructor() {
    super("LLM request deadline exceeded");
    this.name = "LlmDeadlineExceededError";
  }
}

class LlmTransportTimeoutError extends Error {
  readonly code = "TIMEOUT";
  constructor(readonly timeoutMs: number) {
    super(`LLM transport timeout after ${timeoutMs}ms`);
    this.name = "LlmTransportTimeoutError";
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
