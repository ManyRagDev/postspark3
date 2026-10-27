import { describe, it, expect, vi } from "vitest";
import { arsenalHash } from "@shared/arsenalContent";
import { resolveReviewExecutionConfigV9 } from "./reviewExecutionConfigV9";
import {
  validateRecoveredReview,
  reconcileGenerationReviews,
} from "./generationReconciliation";
const config = resolveReviewExecutionConfigV9("writer"),
  messages = [{ role: "user", content: "frozen input" }],
  id = "00000000-0000-4000-8000-000000000001";
const context = {
  requestId: id,
  proposalId: "p1",
  configurationHash: config.configurationHash,
  sourceContextHash: "context-hash",
  round: "initial",
  inputHash: "a".repeat(64),
};
const operation: any = {
  operationKey: `p1:review:initial:${context.inputHash}`,
  state: "uncertain",
  expectation: {
    ...context,
    transport: {
      model: config.resolvedModel,
      configurationHash: config.configurationHash,
      messagesHash: arsenalHash(messages),
    },
  },
};
const record: any = {
  id,
  ownerId: id,
  status: "awaiting_reconciliation",
  deadlineAt: Date.now() + 60000,
  prepared: {
    reviewPolicyVersion: 9,
    reviewExecutionConfig: config,
    editorialContextHash: "context-hash",
  },
};
const recovered = {
  id: "provider-id",
  model: config.resolvedModel,
  messages,
  completion: '{"outcome":"reviewed"}',
};
describe("existing review reconciliation", () => {
  it("binds recovered content to frozen model, prompt, configuration and operation", () => {
    expect(
      validateRecoveredReview(record, operation, recovered).__proposalReview
    ).toEqual(context);
    for (const bad of [
      { ...recovered, model: "another-model" },
      {
        ...recovered,
        messages: [{ role: "user", content: "different input" }],
      },
      { ...recovered, completion: "" },
    ])
      expect(() => validateRecoveredReview(record, operation, bad)).toThrow();
    expect(() =>
      validateRecoveredReview(
        record,
        { ...operation, operationKey: "p1:review:initial:other" },
        recovered
      )
    ).toThrow();
  });
  it("uses a durable local response first, without a provider call or new inference", async () => {
    const retrieve = vi.fn(),
      recover = vi.fn(async () => ({ ...record, status: "queued" }));
    const result = await reconcileGenerationReviews(id, id, {
      store: {
        get: async () => record,
        listOperations: async () => [operation],
      } as any,
      loadCalls: async () =>
        [
          {
            operationKey: operation.operationKey,
            providerId: recovered.id,
            messages,
            response: {
              id: recovered.id,
              model: recovered.model,
              choices: [{ message: { content: recovered.completion } }],
            },
          },
        ] as any,
      retrieve,
      recover,
    });
    expect(result.status).toBe("queued");
    expect(recover).toHaveBeenCalledOnce();
    expect(retrieve).not.toHaveBeenCalled();
  });
  it("absent provider identity or content stays pending", async () => {
    const recover = vi.fn(),
      retrieve = vi.fn(async () => null);
    const result = await reconcileGenerationReviews(id, id, {
      store: {
        get: async () => record,
        listOperations: async () => [operation],
      } as any,
      loadCalls: async () => [],
      retrieve,
      recover,
    });
    expect(result.status).toBe("awaiting_reconciliation");
    expect(recover).not.toHaveBeenCalled();
    expect(retrieve).not.toHaveBeenCalled();
  });
});
