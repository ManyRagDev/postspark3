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
type Recovered = {
  id: string;
  model: string;
  messages: unknown[];
  completion: string;
};
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
  };
}
export function validateRecoveredReview(
  record: RequestRecord,
  operation: GenerationOperationRecord,
  recovered: Recovered
) {
  const expectation = operation.expectation as any;
  if (!expectation?.transport || record.prepared?.reviewPolicyVersion !== 9)
    throw new Error("Missing durable review expectation");
  const config = assertPinnedReviewConfig(
    record.prepared.reviewExecutionConfig
  );
  const { transport, ...context } = expectation;
  if (
    config.policyVersion !== 9 ||
    transport.configurationHash !== config.configurationHash ||
    context.configurationHash !== config.configurationHash ||
    context.requestId !== record.id ||
    context.sourceContextHash !== record.prepared.editorialContextHash ||
    recovered.model !== config.resolvedModel ||
    transport.model !== recovered.model ||
    arsenalHash(recovered.messages) !== transport.messagesHash
  )
    throw new Error("Recovered review identity mismatch");
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
      };
    recovered ??= await (overrides.retrieve ?? storedOpenRouterReview)(
      call.providerId!
    ).catch(() => null);
    if (!recovered || recovered.id !== call.providerId) continue;
    let result: unknown;
    try {
      result = validateRecoveredReview(record, op, recovered);
    } catch {
      continue;
    }
    // Normal workflow replay parses and validates the recovered judgment before public delivery.
    if (overrides.recover) record = await overrides.recover(record, op, result);
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
