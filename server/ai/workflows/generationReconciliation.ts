import { arsenalHash } from "@shared/arsenalContent";
import { ENV } from "../../_core/env";
import { getDb } from "../../db";
import {
  loadPersistedGenerationCalls,
  type LlmTraceCall,
} from "../generationTrace";
import {
  createGenerationStore,
  requestRecord,
  type RequestRecord,
  type GenerationOperationRecord,
} from "./generationStore";
import { assertPinnedReviewConfig } from "./pinnedReviewConfig";
import { reviewDurableContextV5Schema } from "@shared/proposalReviewV10";
import { preparationExpectationSchema, preparationReceipt } from "@shared/generationPreparationReceipt";
import { adaptRequestForProvider } from "../providers/modelAdapters";
import { generationEditorialIntentSchema, generationIntentLegacySchema, generationPlanResponseSchema } from "@shared/generationPlan";
import { z } from "zod";
type Recovered = {
  id: string;
  model: string;
  messages: unknown[];
  completion: string;
  finishReason?: string | null;
};

export function validateRecoveredPreparation(record: RequestRecord, operation: GenerationOperationRecord, recovered: Recovered) {
  const expectation = preparationExpectationSchema.parse(operation.expectation);
  if (record.prepared || record.generationConfig?.generationStrategyVersion !== 2 ||
      !["prepare:intent", "prepare:selection"].includes(operation.operationKey) ||
      expectation.configurationHash !== record.generationConfig.configurationHash ||
      expectation.model !== record.generationConfig.model || recovered.model !== expectation.model ||
      arsenalHash(recovered.messages) !== expectation.messagesHash || !recovered.id ||
      !recovered.completion.trim() || recovered.completion.length > 500_000)
    throw new Error("Recovered preparation identity mismatch");
  const schemas = operation.operationKey === "prepare:intent"
    ? record.generationConfig.editorialIntentVersion === 1
      ? [generationEditorialIntentSchema]
      : [
          generationIntentLegacySchema,
          // Receipts admitted before execution/content classification retain
          // their original shape, including the absence of editorial metadata.
          generationIntentLegacySchema.extend({ requirements: generationIntentLegacySchema.shape.requirements.element.omit({ kind: true }).array().max(50) }),
        ]
    : [generationPlanResponseSchema];
  const responseFormat = schemas.map(candidate => {
    const schema = z.toJSONSchema(candidate);
    delete schema.$schema;
    return { type: "json_schema" as const, json_schema: {
      name: operation.operationKey === "prepare:intent" ? "generation_intent_v1" : "generation_selection_v1", strict: true, schema,
    } };
  }).find(format => arsenalHash(format) === expectation.responseFormatHash);
  if (!responseFormat)
    throw new Error("Recovered preparation schema mismatch");
  const adapted = adaptRequestForProvider({ provider: "openrouter", effectiveModel: expectation.model,
    forceTextSchema: record.generationConfig.structuredOutputMode === "text_schema", messages: [], responseFormat });
  const completion = adapted.normalizeResponseContent?.(recovered.completion) ?? recovered.completion;
  return preparationReceipt({ id: recovered.id, model: recovered.model,
    choices: [{ finish_reason: recovered.finishReason ?? null, message: { role: "assistant", content: completion } }],
  }, expectation);
}
/** Read-only provider API. This never requests inference or enables content retention. */
export async function storedOpenRouterReview(
  id: string
): Promise<Recovered | null> {
  if (!ENV.openRouterReconciliationKey) return null;
  const headers = {
      Authorization: `Bearer ${ENV.openRouterReconciliationKey}`,
    },
    signal = AbortSignal.timeout(15000);
  const [meta, content] = await Promise.all([
    fetch(
      `https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(id)}`,
      { headers, signal }
    ),
    fetch(
      `https://openrouter.ai/api/v1/generation/content?id=${encodeURIComponent(id)}`,
      { headers, signal }
    ),
  ]);
  if (!meta.ok || !content.ok) return null;
  const m = (await meta.json()).data,
    c = (await content.json()).data;
  if (
    m?.id !== id ||
    typeof m?.model !== "string" ||
    c?.error ||
    !Array.isArray(c?.input?.messages) ||
    typeof c?.output?.completion !== "string"
  )
    return null;
  return {
    id,
    model: m.model,
    messages: c.input.messages,
    completion: c.output.completion,
    finishReason: m.finish_reason ?? m.native_finish_reason ?? null,
  };
}
export function validateRecoveredReview(
  record: RequestRecord,
  operation: GenerationOperationRecord,
  recovered: Recovered
) {
  const expectation = operation.expectation as any;
  if (
    !expectation?.transport ||
    !record.prepared ||
    ![9, 10].includes(record.prepared.reviewPolicyVersion ?? 0)
  )
    throw new Error("Missing durable review expectation");
  const config = assertPinnedReviewConfig(
    record.prepared.reviewExecutionConfig
  );
  const { transport, ...context } = expectation;
  if (
    config.policyVersion !== record.prepared.reviewPolicyVersion ||
    transport.configurationHash !== config.configurationHash ||
    context.configurationHash !== config.configurationHash ||
    context.requestId !== record.id ||
    context.sourceContextHash !== record.prepared.editorialContextHash ||
    recovered.model !== config.resolvedModel ||
    transport.model !== recovered.model ||
    arsenalHash(recovered.messages) !== transport.messagesHash
  )
    throw new Error("Recovered review identity mismatch");
  if (config.policyVersion === 10) {
    reviewDurableContextV5Schema.parse(context);
    const proposal = record.proposals.find(
      p => p.proposalId === context.proposalId
    );
    const separator = operation.operationKey.indexOf(":"),
      prefix = operation.operationKey.slice(0, separator),
      suffix = operation.operationKey.slice(separator + 1);
    if (
      !proposal ||
      proposal.revision !== context.revision ||
      ![
        context.proposalId,
        ...[1, 2, 3].map(n => `${context.proposalId}-fb${n}`),
      ].includes(prefix) ||
      !(
        suffix === `review:${context.round}:${context.inputHash}` ||
        new RegExp(
          `^review_evidence_repair:${context.round}:[a-f0-9]{64}$`
        ).test(suffix)
      )
    )
      throw new Error("Recovered operation mismatch");
  }
  if (
    !operation.operationKey.includes(
      `:${context.round}:${context.inputHash}`
    ) &&
    !operation.operationKey.includes(":review_evidence_repair:")
  )
    throw new Error("Recovered operation mismatch");
  if (!recovered.completion.trim() || recovered.completion.length > 200000)
    throw new Error("Recovered content unavailable");
  return {
    id: recovered.id,
    model: recovered.model,
    choices: [
      {
        finish_reason: "stop",
        message: { role: "assistant", content: recovered.completion },
      },
    ],
    __proposalReview: context,
  };
}
export async function reconcileGenerationReviews(
  requestId: string,
  owner: string,
  overrides: {
    loadCalls?: (id: string, owner: string) => Promise<LlmTraceCall[]>;
    retrieve?: (id: string) => Promise<Recovered | null>;
    store?: ReturnType<typeof createGenerationStore>;
    recover?: (
      record: RequestRecord,
      op: GenerationOperationRecord,
      result: unknown
    ) => Promise<RequestRecord>;
    recoverPreparation?: (record: RequestRecord, op: GenerationOperationRecord, result: unknown) => Promise<RequestRecord>;
  } = {}
) {
  const store = overrides.store ?? createGenerationStore();
  let record = await store.get(requestId, owner);
  if (!record) throw new Error("Generation not found");
  if (
    record.status !== "awaiting_reconciliation" ||
    record.deadlineAt <= Date.now()
  )
    return record;
  const operations = await store.listOperations(requestId, owner),
    calls = await (overrides.loadCalls ?? loadPersistedGenerationCalls)(
      requestId,
      owner
    );
  for (const op of operations.filter(
    o => o.state !== "completed" && o.expectation
  )) {
    // A local response saved in the durable trace takes precedence over provider reads.
    const matches = calls.filter(
      c => c.operationKey === op.operationKey && c.providerId
    );
    if (matches.length !== 1) continue;
    const call = matches[0];
    let recovered: Recovered | null = null;
    const response = call.response as any;
    if (
      response?.id === call.providerId &&
      response?.choices?.[0]?.message?.content &&
      call.messages?.length
    )
      recovered = {
        id: call.providerId!,
        model: response.model,
        messages: call.messages,
        completion: response.choices[0].message.content,
        finishReason: response.choices[0].finish_reason ?? null,
      };
    recovered ??= await (overrides.retrieve ?? storedOpenRouterReview)(
      call.providerId!
    ).catch(() => null);
    if (!recovered || recovered.id !== call.providerId) continue;
    let result: unknown;
    try {
      result = (op.expectation as {kind?:string})?.kind === "generation_preparation_v1"
        ? validateRecoveredPreparation(record, op, recovered)
        : validateRecoveredReview(record, op, recovered);
    } catch {
      continue;
    }
    // Normal workflow replay parses and validates the recovered judgment before public delivery.
    if ((op.expectation as {kind?:string})?.kind === "generation_preparation_v1") {
      // Keep usage/receipt metadata without inventing costs for a recovered response.
      const { messages: _messages, response: _response, ...metadata } = call;
      const receipt = { ...result as object, __generationTrace: { version: 1, calls: [{ ...metadata,
        providerId: recovered.id, effectiveModel: recovered.model, costSource: call.costSource ?? "unknown", messages: [],
      }], events: [] } };
      if (overrides.recoverPreparation) record = await overrides.recoverPreparation(record, op, receipt);
      else {
        const r = await getDb().rpc("generation_recover_preparation", { p_id: requestId, p_owner: owner, p_key: op.operationKey,
          p_expectation: op.expectation, p_result: receipt });
        if (r.error) throw r.error;
        record = requestRecord(r.data);
      }
    } else if (overrides.recover) record = await overrides.recover(record, op, result);
    else {
      const r = await getDb().rpc("generation_recover_review", {
        p_id: requestId,
        p_owner: owner,
        p_key: op.operationKey,
        p_expectation: op.expectation,
        p_result: result,
      });
      if (r.error) throw r.error;
      record = requestRecord(r.data);
    }
  }
  return record;
}
