import { reviewDurableContextV4Schema, type ReviewExecutionConfigV4, type ProposalReviewDurableContextV4 } from "@shared/proposalReviewV9";
import { reviewDurableContextV3Schema, type ReviewExecutionConfigV3, type ProposalReviewDurableContextV3 } from "@shared/proposalReviewV8";
import { reviewDurableContextV2Schema, type ReviewExecutionConfigV2, type ProposalReviewDurableContextV2 } from "@shared/proposalReviewV7";
import { arsenalHash } from "@shared/arsenalContent";
import { GenerationFailureError } from "@shared/generationFailure";
import {
  reviewDurableContextV1Schema as reviewContextSchema,
  type ProposalReviewDurableContextV1,
  type ReviewExecutionConfigV1,
} from "@shared/proposalReview";
import type {
  ProposalExecutionInput,
  ProposalGraphDeps,
} from "./proposalGraph";
import type { GenerationOperationRecord } from "./generationStore";
import { readJournalResult } from "./generationJournalTrace";
import { buildReviewEvidenceAliases } from "./reviewEvidence";

export type { ProposalReviewDurableContextV1 } from "@shared/proposalReview";
const pattern =
  /^(review|review_evidence_repair):(initial|recheck):([a-f0-9]{64})$/;
const incompatible = () =>
  new GenerationFailureError("preparation_contract_incompatible", "review");

export function readReviewContext(
  result: unknown,
  input: ProposalExecutionInput,
  config: ReviewExecutionConfigV1 | ReviewExecutionConfigV2 | ReviewExecutionConfigV3 | ReviewExecutionConfigV4,
  key: string
) {
  const value = readJournalResult<Record<string, unknown>>(result);
  const parsed = config.policyVersion === 9 ? reviewDurableContextV4Schema.safeParse(value?.__proposalReview) : config.policyVersion === 8 ? reviewDurableContextV3Schema.safeParse(value?.__proposalReview) : config.policyVersion === 7
    ? reviewDurableContextV2Schema.safeParse(value?.__proposalReview)
    : reviewContextSchema.safeParse(value?.__proposalReview);
  if (!parsed.success) throw incompatible();
  const ctx = parsed.data,
    match = pattern.exec(key);
  if (
    !match ||
    ctx.policyVersion !== config.policyVersion ||
    ((ctx.policyVersion === 7 || ctx.policyVersion === 8 || ctx.policyVersion === 9) && ctx.sourceContextHash !== input.editorialContextHash) ||
    ctx.requestId !== input.requestId ||
    ctx.proposalId !== input.proposalId ||
    ctx.revision !== (input.revision ?? 1) ||
    ctx.round !== match[2] ||
    (match[1] === "review" && ctx.inputHash !== match[3]) ||
    ctx.configurationHash !== config.configurationHash ||
    ctx.renderHashes.some((s, i) => s.slideIndex !== i)
  )
    throw incompatible();
  const anchors = ctx.anchorInventory.map(
    ({ alias: _alias, ...anchor }) => anchor
  );
  if (
    anchors.some(
      ({ anchorId, ...anchor }) =>
        anchor.textHash !== arsenalHash(anchor.quote) ||
        anchorId !== arsenalHash(anchor)
    )
  )
    throw incompatible();
  if ((ctx.policyVersion === 7 || ctx.policyVersion === 8 || ctx.policyVersion === 9) && (new Set(ctx.textUnitInventory.map(u=>u.id)).size !== ctx.textUnitInventory.length || ctx.textUnitInventory.some(u=>u.textHash !== arsenalHash(u.text) || u.visibleAliases.some(a=>!ctx.aliasMap[a])))) throw incompatible();
  const expected = buildReviewEvidenceAliases(anchors);
  if (
    arsenalHash(expected.inventory) !== arsenalHash(ctx.anchorInventory) ||
    arsenalHash(expected.aliasMap) !== arsenalHash(ctx.aliasMap)
  )
    throw incompatible();
  return ctx;
}
export async function readReviewOperations(
  deps: ProposalGraphDeps,
  input: ProposalExecutionInput
): Promise<GenerationOperationRecord[]> {
  if (deps.reviewOperations)
    return (await deps.reviewOperations(input.proposalId)).filter(o =>
      pattern.test(o.operationKey)
    );
  if (deps.executeOperation) throw incompatible(); // no invisible paid journal adapter
  deps.reviewOperationCache ??= new Map();
  return Array.from(deps.reviewOperationCache.values());
}
export function initialReviewContext(
  operations: GenerationOperationRecord[],
  input: ProposalExecutionInput,
  config: ReviewExecutionConfigV1 | ReviewExecutionConfigV2 | ReviewExecutionConfigV3 | ReviewExecutionConfigV4
) {
  const initial = operations.filter(o =>
    o.operationKey.startsWith("review:initial:")
  );
  if (
    initial.length > 1 ||
    operations.length > 3 ||
    operations.filter(o => o.operationKey.startsWith("review_evidence_repair:"))
      .length > 1
  )
    throw incompatible();
  for (const op of operations) {
    if (op.state !== "completed")
      throw new Error("proposal_review_reconciliation_required");
    readReviewContext(op.result, input, config, op.operationKey);
  }
  return initial[0]
    ? readReviewContext(
        initial[0].result,
        input,
        config,
        initial[0].operationKey
      )
    : undefined;
}

// Single worker lease is the cross-process fence. This also serializes same-lease
// re-entries in one process so different hashes cannot race the journal read.
const locks = new Map<string, Promise<void>>();
async function locked<T>(scope: string, work: () => Promise<T>): Promise<T> {
  const previous = locks.get(scope) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  locks.set(scope, tail);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (locks.get(scope) === tail) locks.delete(scope);
  }
}
export async function executeReviewOperation<T>(
  input: ProposalExecutionInput,
  deps: ProposalGraphDeps,
  key: string,
  context: ProposalReviewDurableContextV1 | ProposalReviewDurableContextV2 | ProposalReviewDurableContextV3 | ProposalReviewDurableContextV4,
  config: ReviewExecutionConfigV1 | ReviewExecutionConfigV2 | ReviewExecutionConfigV3 | ReviewExecutionConfigV4,
  work: () => Promise<T>
): Promise<T> {
  return locked(`${input.requestId}:${input.proposalId}`, async () => {
    input.signal?.throwIfAborted();
    if (Date.now() >= (input.deadlineMs ?? Infinity))
      throw new Error("proposal_review_timeout");
    const operations = await readReviewOperations(deps, input);
    const match = pattern.exec(key);
    if (!match) throw incompatible();
    initialReviewContext(operations, input, config);
    const sameRound = operations.filter(o =>
      o.operationKey.startsWith(`${match[1]}:${match[2]}:`)
    );
    if (sameRound.some(o => o.operationKey !== key)) throw incompatible();
    const existing = operations.find(o => o.operationKey === key);
    if (existing) {
      const saved = readReviewContext(existing.result, input, config, key);
      if (arsenalHash(saved) !== arsenalHash(context)) throw incompatible();
      return readJournalResult<T>(existing.result);
    }
    if (
      operations.length >= 3 ||
      (match[1] === "review_evidence_repair" &&
        operations.some(o =>
          o.operationKey.startsWith("review_evidence_repair:")
        ))
    )
      throw new Error("proposal_review_evidence_repair_exhausted");
    if (
      match[2] === "recheck" &&
      !operations.some(o => o.operationKey.startsWith("review:initial:"))
    )
      throw incompatible();
    if (deps.executeOperation) {
      try {
        return await deps.executeOperation(
          {
            operationKey: key,
            stage: "review",
            deadlineMs: input.deadlineMs,
            signal: input.signal,
          },
          work
        );
      } catch (error) {
        if (input.signal?.aborted) throw error;
        const saved = (
          await readReviewOperations(deps, input).catch(() => [])
        ).find(o => o.operationKey === key);
        if (saved?.state === "completed") {
          const ctx = readReviewContext(saved.result, input, config, key);
          if (arsenalHash(ctx) !== arsenalHash(context)) throw incompatible();
          return readJournalResult<T>(saved.result);
        }
        const e = error as {
          name?: string;
          code?: string;
          message?: string;
          cause?: { name?: string };
        };
        if (
          e?.code === "BAD_GATEWAY" ||
          e?.code === "TOO_MANY_REQUESTS" ||
          e?.code === "TIMEOUT" ||
          e?.name === "ProviderRequestError" ||
          e?.name === "LlmDeadlineExceededError" ||
          e?.cause?.name === "ProviderRequestError" ||
          e?.message === "proposal_review_timeout"
        )
          throw error;
        throw new Error("proposal_review_reconciliation_required");
      }
    }
    deps.reviewOperationCache!.set(key, {
      operationKey: key,
      state: "started",
    });
    try {
      const result = await work();
      deps.reviewOperationCache!.set(key, {
        operationKey: key,
        state: "completed",
        result,
      });
      return result;
    } catch (error) {
      deps.reviewOperationCache!.set(key, {
        operationKey: key,
        state: "uncertain",
      });
      throw error;
    }
  });
}
