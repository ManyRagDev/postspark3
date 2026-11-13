import { describe, it, expect, vi } from "vitest";
import { arsenalHash } from "@shared/arsenalContent";
import { capabilityGenerationIntentSchema } from "@shared/compactGenerationIntent";
import { generationEditorialIntentSchema, generationIntentLegacySchema, generationPlanResponseSchema } from "@shared/generationPlan";
import { z } from "zod";
import { resolveReviewExecutionConfigV9 } from "./reviewExecutionConfigV9";
import {
  validateRecoveredReview,
  reconcileGenerationReviews,
  validateRecoveredPreparation,
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

describe("preparation reconciliation", () => {
  it.each([false, true])("recovers capability intent only with its admitted policy and exact schema (editorial=%s)", editorial => {
    const schema = z.toJSONSchema(editorial ? capabilityGenerationIntentSchema.required({ editorial: true }) : capabilityGenerationIntentSchema); delete schema.$schema;
    const model = "anthropic/claude-haiku-5.5";
    const expectation = {kind:"generation_preparation_v1",model,configurationHash:"a".repeat(64),messagesHash:arsenalHash(messages),requestHash:"c".repeat(64),
      responseFormatHash:arsenalHash({type:"json_schema",json_schema:{name:"generation_intent_v1",strict:true,schema}})};
    const request: any = {input:{selectionPolicy:"capability_v1"},generationConfig:{...(editorial ? {editorialIntentVersion:1} : {}),generationStrategyVersion:2,model,configurationHash:expectation.configurationHash,structuredOutputMode:"text_schema"}};
    const op: any = {operationKey:"prepare:intent",expectation};
    const recovered = {id:"known-receipt",model,messages,completion:'{"captured":"provider result"}'};
    expect(validateRecoveredPreparation(request,op,recovered).__preparationReceipt.expectation).toEqual(expectation);
    expect(() => validateRecoveredPreparation({...request,input:{}},op,recovered)).toThrow("Recovered preparation schema mismatch");
  });
  it.each(["current", "historical"])("recovers an intent using its %s pinned schema without reinterpretation", version => {
    const intentSchema = version === "historical"
      ? generationIntentLegacySchema.extend({ requirements: generationIntentLegacySchema.shape.requirements.element.omit({ kind: true }).array().max(50) })
      : generationIntentLegacySchema;
    const schema = z.toJSONSchema(intentSchema);
    delete schema.$schema;
    const model = "anthropic/claude-haiku-5.5";
    const expectation = { kind: "generation_preparation_v1", model, configurationHash: "a".repeat(64), messagesHash: arsenalHash(messages), requestHash: "c".repeat(64), responseFormatHash: arsenalHash({ type: "json_schema", json_schema: { name: "generation_intent_v1", strict: true, schema } }) };
    // Captured before editorial extraction was added; deriving both sides from
    // the latest schema would hide an accidental historical contract change.
    expect(expectation.responseFormatHash).toBe(version === "historical"
      ? "e67545e8aa10f85533be367d0a35c26c2d3be2cdbf20d756006279aad5e60043"
      : "e84353cbfbe756a7065d3f073b882e33c867e3512a8439afa74c02e9a3734be2");
    const request: any = { generationConfig: { generationStrategyVersion: 2, model, configurationHash: expectation.configurationHash, structuredOutputMode: "text_schema" } };
    const op: any = { operationKey: "prepare:intent", expectation };
    expect(validateRecoveredPreparation(request, op, { id: "intent-receipt", model, messages, completion: "{}" }).__preparationReceipt.expectation).toEqual(expectation);
    expect(() => validateRecoveredPreparation({ ...request, generationConfig: { ...request.generationConfig, editorialIntentVersion: 1 } }, op,
      { id: "intent-receipt", model, messages, completion: "{}" })).toThrow("Recovered preparation schema mismatch");
  });
  it("recovers the editorial schema only under its admitted protocol and preserves the raw response", () => {
    const schema = z.toJSONSchema(generationEditorialIntentSchema); delete schema.$schema;
    const model = "anthropic/claude-haiku-5.5";
    const expectation = { kind: "generation_preparation_v1", model, configurationHash: "a".repeat(64), messagesHash: arsenalHash(messages), requestHash: "c".repeat(64),
      responseFormatHash: arsenalHash({ type: "json_schema", json_schema: { name: "generation_intent_v1", strict: true, schema } }) };
    const request: any = { generationConfig: { generationStrategyVersion: 2, editorialIntentVersion: 1, model, configurationHash: expectation.configurationHash, structuredOutputMode: "text_schema" } };
    const op: any = { operationKey: "prepare:intent", expectation };
    const recovered = { id: "editorial-intent-receipt", model, messages, completion: '{"editorial":{"captured":"raw provider evidence"}}' };
    const receipt = validateRecoveredPreparation(request, op, recovered);
    expect(receipt.__preparationReceipt.expectation).toEqual(expectation);
    expect(receipt.choices[0].message.content).toBe(recovered.completion);
    const { editorialIntentVersion: _version, ...legacyConfig } = request.generationConfig;
    expect(() => validateRecoveredPreparation({ ...request, generationConfig: legacyConfig }, op, recovered)).toThrow("Recovered preparation schema mismatch");
  });
  const model = "openai/gpt-6.1-sol";
  const schema = z.toJSONSchema(generationPlanResponseSchema); delete schema.$schema;
  const responseFormatHash = arsenalHash({ type: "json_schema", json_schema: { name: "generation_selection_v1", strict: true, schema } });
  const pinned = { ...record, prepared: undefined, generationConfig: { generationStrategyVersion: 2, model, structuredOutputMode: "native_schema", configurationHash: "a".repeat(64) } };
  const op = { operationKey: "prepare:selection", state: "uncertain", expectation: {
    kind: "generation_preparation_v1", model, configurationHash: "a".repeat(64), messagesHash: arsenalHash(messages),
    responseFormatHash, requestHash: "c".repeat(64),
  } };
  const response = { ...recovered, model, completion: '{"version":1,"slots":[]}' };

  it("uses the known raw response without a new provider call and keeps unknown cost explicit", async () => {
    const retrieve = vi.fn(), recoverPreparation = vi.fn(async () => ({ ...pinned, status: "queued" }));
    const result = await reconcileGenerationReviews(id, id, {
      store: { get: async () => pinned, listOperations: async () => [op] } as any,
      loadCalls: async () => [{ operationKey: op.operationKey, providerId: response.id, messages,
        response: { id: response.id, model, choices: [{ message: { content: response.completion } }] } }] as any,
      retrieve, recoverPreparation,
    });
    expect(result.status).toBe("queued"); expect(retrieve).not.toHaveBeenCalled();
    expect(recoverPreparation.mock.calls[0][2]).toMatchObject({ id: response.id, __preparationReceipt: { version: 1, expectation: op.expectation },
      __generationTrace: { calls: [{ costSource: "unknown" }] } });
    for (const invalid of [{ ...response, model: "other" }, { ...response, messages: [] }])
      expect(() => validateRecoveredPreparation(pinned as any, op, invalid)).toThrow();
  });

  it("stays pending when there is no provider identity; terminal requests are not reopened", async () => {
    const recoverPreparation = vi.fn(), retrieve = vi.fn();
    for (const status of ["awaiting_reconciliation", "failed"]) {
      const result = await reconcileGenerationReviews(id, id, { store: { get: async () => ({ ...pinned, status }), listOperations: async () => [op] } as any,
        loadCalls: async () => [], retrieve, recoverPreparation });
      expect(result.status).toBe(status);
    }
    expect(retrieve).not.toHaveBeenCalled(); expect(recoverPreparation).not.toHaveBeenCalled();
  });
});
