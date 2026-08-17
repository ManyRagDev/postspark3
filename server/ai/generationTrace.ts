import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import type {
  GenerationDebugEvent,
  GenerationDebugTrace,
  GenerationEvaluationSummary,
  PostVariation,
} from "@shared/postspark";
import { createGenerationRun } from "../db";
import { ENV } from "../_core/env";

export interface LlmTraceCall {
  label: string;
  requestedModel: string;
  taskRoute?: string;
  effectiveModel: string;
  provider: string;
  promptHash: string;
  messages: unknown[];
  response?: unknown;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  attempt?: number;
  fallbackFrom?: string;
  translatedSchema?: boolean;
  structuredOutputMode?: "native_schema" | "text_schema";
  payloadOptions?: {
    temperature?: unknown;
    top_p?: unknown;
    reasoning?: unknown;
    reasoning_effort?: unknown;
    max_tokens?: unknown;
    max_completion_tokens?: unknown;
  };
  reasoningTokens?: number;
  finishReason?: string | null;
  nativeFinishReason?: string | null;
  contentLength?: number;
  structuredFailureType?: string;
  repairedOutput?: boolean;
  error?: string;
}

export interface GenerationTrace {
  id: string;
  userUuid: string;
  inputType: string;
  inputContent: string;
  platform: string;
  postMode: string;
  creationMode: string;
  requestedModel: string;
  siteIntelligenceId?: string;
  startedAt: number;
  calls: LlmTraceCall[];
  events: GenerationDebugEvent[];
}

const storage = new AsyncLocalStorage<GenerationTrace>();

export function startGenerationTrace(
  input: Omit<GenerationTrace, "id" | "startedAt" | "calls" | "events">,
): GenerationTrace {
  const trace: GenerationTrace = {
    ...input,
    id: randomUUID(),
    startedAt: Date.now(),
    calls: [],
    events: [],
  };
  storage.enterWith(trace);
  return trace;
}

export function getGenerationTrace(): GenerationTrace | undefined {
  return storage.getStore();
}

export function recordLlmTraceCall(call: LlmTraceCall): void {
  storage.getStore()?.calls.push(call);
}

export function recordGenerationEvent(
  event: Omit<GenerationDebugEvent, "at">,
): void {
  storage.getStore()?.events.push({
    ...event,
    at: new Date().toISOString(),
  });
}

export function buildGenerationDebugTrace(input: {
  trace: GenerationTrace;
  strategies?: unknown;
  evaluations?: GenerationEvaluationSummary[];
  output?: PostVariation[];
}): GenerationDebugTrace {
  const { trace } = input;
  return {
    runId: trace.id,
    requestedModel: trace.requestedModel,
    effectiveModels: Array.from(
      new Set(trace.calls.map((call) => call.effectiveModel)),
    ),
    startedAt: new Date(trace.startedAt).toISOString(),
    durationMs: Date.now() - trace.startedAt,
    calls: trace.calls,
    events: trace.events,
    strategies: input.strategies,
    evaluations: input.evaluations,
    finalOutput: input.output,
  };
}

export function hashPrompt(messages: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(messages)).digest("hex");
}

function buildPromptSnapshot(trace: GenerationTrace): unknown {
  const replayable = ENV.aiTraceStoreContent;
  return {
    version: 2,
    replayable,
    calls: trace.calls.map(({ messages, response, ...call }) => ({
      ...call,
      ...(replayable ? { messages, response } : {}),
    })),
  };
}

export async function finishGenerationTrace(input: {
  trace: GenerationTrace;
  status: "completed" | "failed";
  strategies?: unknown;
  evaluations?: GenerationEvaluationSummary[];
  revisionCount?: number;
  output?: unknown;
  strategyFallbackUsed?: boolean;
  originalityFallbackUsed?: boolean;
  error?: string;
}): Promise<void> {
  const { trace } = input;
  const promptTokens = trace.calls.reduce(
    (sum, call) => sum + call.promptTokens,
    0,
  );
  const completionTokens = trace.calls.reduce(
    (sum, call) => sum + call.completionTokens,
    0,
  );
  const estimatedCostUsd = trace.calls.reduce(
    (sum, call) => sum + call.estimatedCostUsd,
    0,
  );
  const evaluations = input.evaluations ?? [];
  const averageQualityScore = evaluations.length > 0
    ? evaluations.reduce((sum, evaluation) => sum + evaluation.overallScore, 0) /
      evaluations.length
    : 0;
  const acceptedCount = evaluations.filter((evaluation) => evaluation.accepted).length;
  const redactedInput = `[sha256:${createHash("sha256")
    .update(trace.inputContent)
    .digest("hex")}]`;

  try {
    await createGenerationRun({
      id: trace.id,
      userUuid: trace.userUuid,
      siteIntelligenceId: trace.siteIntelligenceId,
      status: input.status,
      inputType: trace.inputType,
      inputContent: ENV.aiTraceStoreContent ? trace.inputContent : redactedInput,
      platform: trace.platform,
      postMode: trace.postMode,
      creationMode: trace.creationMode,
      requestedModel: trace.requestedModel,
      effectiveModels: Array.from(
        new Set(trace.calls.map((call) => call.effectiveModel)),
      ),
      promptSnapshot: buildPromptSnapshot(trace) as any,
      strategySnapshot: ENV.aiTraceStoreContent ? input.strategies as any : undefined,
      evaluationSnapshot: input.evaluations as any,
      outputSnapshot: ENV.aiTraceStoreContent ? input.output as any : undefined,
      events: trace.events,
      // SPEC-004: contrato v2 — eventos do orquestrador canônico (SPEC-003),
      // incluindo `repair`, `generation_metrics` e stages de validação.
      eventsVersion: 2,
      revisionCount: input.revisionCount ?? 0,
      candidateCount: Array.isArray(input.output)
        ? input.output.length
        : evaluations.length,
      acceptedCount,
      averageQualityScore,
      strategyFallbackUsed: input.strategyFallbackUsed ?? false,
      originalityFallbackUsed: input.originalityFallbackUsed ?? false,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimatedCostUsd,
      latencyMs: Date.now() - trace.startedAt,
      errorMessage: input.error,
    });
  } catch (error) {
    console.warn("[generationTrace] Could not persist generation run:", error);
  }
}
