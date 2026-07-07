import type { HighTicketGraphState, HighTicketPipelineInput } from "@shared/highTicket";
import { createGenerationRun, updateGenerationRun } from "../../db";
import type { JsonValue } from "../../db";

function toJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export async function createHighTicketRun(input: HighTicketPipelineInput): Promise<void> {
  await createGenerationRun({
    id: input.runId,
    userUuid: input.userUuid,
    siteIntelligenceId: input.siteIntelligenceId,
    status: "created",
    inputType: input.inputType,
    inputContent: input.content,
    platform: input.platform,
    postMode: input.postMode,
    creationMode: input.creationMode,
    requestedModel: input.model ?? "high_ticket_router",
    effectiveModels: [],
    revisionCount: 0,
    candidateCount: 0,
    acceptedCount: 0,
    averageQualityScore: 0,
    strategyFallbackUsed: false,
    originalityFallbackUsed: false,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    latencyMs: 0,
    graphState: {},
  });
}

export async function persistHighTicketGraphState(input: {
  userUuid: string;
  state: HighTicketGraphState;
}): Promise<void> {
  await updateGenerationRun(input.state.runId, input.userUuid, {
    status: input.state.status,
    graphState: toJson(input.state),
    outputSnapshot: input.state.output ? toJson(input.state.output) : undefined,
    evaluationSnapshot: input.state.qa.length ? toJson(input.state.qa) : undefined,
    revisionCount: input.state.attempt,
    candidateCount: input.state.workers.length,
    acceptedCount: input.state.qa.filter((item) => item.passed).length,
    averageQualityScore: input.state.qa.length
      ? input.state.qa.reduce((sum, item) => sum + item.evaluation.overallScore, 0) / input.state.qa.length
      : 0,
    originalityFallbackUsed: input.state.originality?.fallbackUsed,
    completedAt: ["completed", "failed"].includes(input.state.status)
      ? new Date().toISOString()
      : undefined,
    errorMessage: input.state.control.failedReason ?? undefined,
  });
}
