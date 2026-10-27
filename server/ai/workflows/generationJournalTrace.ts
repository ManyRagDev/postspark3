import {localDiagnosticsEnabled,compactDiagnosticEvents,writeLocalDiagnostic} from "../localDiagnostics";
import { ENV } from "../../_core/env";
import type { LlmTraceCall, GenerationTrace } from "../generationTrace";
import type { GenerationOperationRecord } from "./generationStore";

const field = "__generationTrace";
const object = (value: unknown): Record<string, any> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : undefined;
const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
export const isPaidGenerationOperation = (key: string) =>
  key === "prepare:selection" ||
  key.startsWith("prepare:design-shortlist:") ||
  /:(?:copy(?:_recovery)?$|review:|review_correction:|review_evidence_repair:|image:)/.test(key);

/** Only an explicit durable receipt can prove that a potentially paid branch stayed local. */
export function journalOperationWasLocal(result: unknown) {
  const metadata = object(result)?.[field];
  return (
    metadata?.version === 1 &&
    Array.isArray(metadata.events) &&
    metadata.events.some(
      (event: any) =>
        event.stage === "review_correction" &&
        event.status === "completed" &&
        event.detail === "deterministic_local" &&
        event.data?.paidEffect === false
    ) &&
    Array.isArray(metadata.calls) &&
    metadata.calls.length === 0
  );
}

/** Metadata is additive: historical readers retain id/model/usage/options/url at the root. */
export function journalResultWithTrace<T>(value: T, trace: GenerationTrace): T {
  if (!object(value) || (!trace.calls.length && !trace.events.length))
    return value;
  if(localDiagnosticsEnabled())void writeLocalDiagnostic(trace.id,trace).catch(error=>console.error("[diagnostics] Falha de gravação local",error));
  return {
    ...value,
    [field]: {
      version: 1,
      calls: trace.calls.map(({ messages, response, ...call }) => ({
        ...call,
        providerId: call.providerId ?? object(response)?.id,
        costSource:
          call.costSource ??
          (typeof object(object(response)?.usage)?.cost === "number"
            ? "provider"
            : call.error
              ? "unknown"
              : "estimate"),
        messages: (ENV.aiTraceStoreContent && !localDiagnosticsEnabled()) ? messages : [],
        ...((ENV.aiTraceStoreContent && !localDiagnosticsEnabled()) ? { response } : {}),
      })),
      events:localDiagnosticsEnabled()?compactDiagnosticEvents(trace.events):trace.events,
    },
  };
}

export function readJournalResult<T>(value: unknown): T {
  const source = object(value);
  if (!source || source[field]?.version !== 1) return value as T;
  const { [field]: _metadata, ...result } = source;
  return result as T;
}

/** Legacy raw results can prove usage, but never invent absent selection/image costs. */
function legacyCall(
  operation: GenerationOperationRecord
): LlmTraceCall | undefined {
  const result = object(operation.result),
    usage = object(result?.usage);
  if (!result || !usage || typeof result.model !== "string") return;
  const promptTokens = number(usage.prompt_tokens ?? usage.input_tokens);
  const completionTokens = number(
    usage.completion_tokens ?? usage.output_tokens
  );
  const known =
    typeof usage.cost === "number" &&
    Number.isFinite(usage.cost) &&
    usage.cost >= 0;
  return {
    label: operation.operationKey,
    requestedModel: result.model,
    effectiveModel: result.model,
    provider: result.provider ?? "unknown",
    providerId: typeof result.id === "string" ? result.id : undefined,
    promptHash: "legacy-not-persisted",
    messages: [],
    promptTokens,
    completionTokens,
    totalTokens: number(usage.total_tokens) || promptTokens + completionTokens,
    latencyMs: 0,
    estimatedCostUsd: known ? usage.cost : 0,
    costSource: known ? "provider" : "unknown",
  };
}

/** Every operation contributes once, including operations skipped because siblings are already ready. */
export function summarizeGenerationJournal(
  operations: GenerationOperationRecord[]
) {
  const calls: LlmTraceCall[] = [],
    events: GenerationTrace["events"] = [];
  const unknownCostOperations: string[] = [];
  const seen = new Set<string>();
  for (const operation of operations) {
    if (seen.has(operation.operationKey)) continue;
    seen.add(operation.operationKey);
    const metadata = object(operation.result)?.[field];
    const savedCalls: LlmTraceCall[] =
      metadata?.version === 1 && Array.isArray(metadata.calls)
        ? metadata.calls
        : [];
    const inferred = savedCalls.length
      ? savedCalls
      : [legacyCall(operation)].filter((call): call is LlmTraceCall =>
          Boolean(call)
        );
    calls.push(
      ...inferred.map(call => ({
        ...call,
        operationKey: operation.operationKey,
        messages: call.messages ?? [],
      }))
    );
    if (metadata?.version === 1 && Array.isArray(metadata.events))
      events.push(...metadata.events);
    if (
      isPaidGenerationOperation(operation.operationKey) &&
      !journalOperationWasLocal(operation.result) &&
      (operation.state !== "completed" ||
        !inferred.length ||
        inferred.some(call => call.costSource === "unknown"))
    )
      unknownCostOperations.push(operation.operationKey);
  }
  return { calls, events, unknownCostOperations };
}
