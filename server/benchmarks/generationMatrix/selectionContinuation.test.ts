import { mkdtemp, mkdir, readFile, writeFile, cp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { hashPrompt } from "../../ai/generationTrace";
import type { InvokeParams } from "../../_core/llm";
import {
  loadSelectionContinuation,
  prepareSelectionContinuation,
} from "./selectionContinuation";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "selection-replay-test-"));
  const operator = join(root, "operator"),
    id = "five-items-1-s2-gpt",
    campaignId = "source-campaign";
  const base = join(operator, id),
    ops = join(base, "operations");
  await mkdir(ops, { recursive: true });
  const save = (file: string, value: unknown) =>
    writeFile(file, JSON.stringify(value));
  const params: InvokeParams = {
    pinnedModel: "openai/gpt-6.1-sol",
    traceLabel: "generation_intent_v1",
    messages: [{ role: "user", content: "Synthetic request" }],
    maxCompletionTokens: 4500,
    reasoningEffort: "medium",
    forceTextSchema: false,
  };
  const result = { version: 1, objective: "fixture" };
  const response = {
    choices: [{ message: { content: JSON.stringify(result) } }],
  };
  const call = {
    label: params.traceLabel,
    messages: params.messages,
    promptHash: hashPrompt(params.messages),
    effectiveModel: params.pinnedModel,
    response,
    payloadOptions: { max_tokens: 4500, reasoning_effort: "medium" },
    structuredOutputMode: "native_schema",
  };
  await save(join(ops, "intent.json"), {
    operationKey: "prepare:intent",
    state: "completed",
    result,
    trace: { calls: [call], events: [] },
  });
  const keys = [];
  for (let i = 0; i < 12; i++) {
    const hash = hashPrompt([{ model: "jev", index: i }]);
    const key = `prepare:design-shortlist:${i}:${hash}`;
    keys.push(key);
    await save(join(ops, `jev-${i}.json`), {
      operationKey: key,
      state: "completed",
      result: { assessmentContext: { requestHash: hash }, answers: {} },
      trace: { calls: [{ promptHash: hash }], events: [] },
    });
  }
  await save(join(ops, "selection.json"), {
    operationKey: "prepare:selection",
    state: "blocked",
    campaignInterruption: { reason: "budget_exhausted" },
  });
  const entry = { id, runId: "run-identity", strategy: 2, choice: "gpt" };
  const manifest = {
    campaignId,
    entries: [entry],
    maxUsd: 4,
    maxCalls: 80,
    fingerprint: "original",
    version: 3,
  };
  await save(join(operator, "manifest.json"), manifest);
  const calls = [
    ...Array.from({ length: 57 }, (_, i) => ({
      operation: `older:${i}`,
      reservedUsd: 0.01,
      actualUsd: 0.01,
    })),
    ...["prepare:intent", ...keys].map(key => ({
      operation: `${campaignId}:${id}:${key}`,
      reservedUsd: 0.01,
      actualUsd: 0.001,
    })),
  ];
  await save(join(operator, "paid-calls.json"), calls);
  await save(join(base, "result.json"), {
    metrics: { overallStatus: "failed", ready: 0 },
  });
  await save(join(operator, "sources-five-items.json"), {
    text: "Synthetic request",
  });
  const receipt = await prepareSelectionContinuation(root);
  const file = join(root, "replay.json");
  await save(file, receipt);
  return { root, ops, params, result, response, receipt, file, keys, save };
}

describe("restricted completed-preparation replay", () => {
  it("reuses the real recorded responses, verifies intent, and never executes JEV effects", async () => {
    const f = await fixture();
    const ledgerBefore = await readFile(
      join(f.root, "operator/paid-calls.json"),
      "utf8"
    );
    const replay = await loadSelectionContinuation(f.file);
    const value = await replay.operation("prepare:intent", async () => {
      const response = replay.generate(f.params)!;
      return JSON.parse(response.choices[0].message.content as string);
    });
    expect(value).toEqual(f.result);
    const forbidden = vi.fn(async () => {
      throw new Error("paid effect must not run");
    });
    for (const key of f.keys) await replay.operation(key, forbidden);
    expect(forbidden).not.toHaveBeenCalled();
    expect(
      await replay.operation("prepare:selection", async () => "next phase")
    ).toBe("next phase");
    expect(
      await replay.operation("prepare:definitions", async () => [
        "native-definition",
      ])
    ).toEqual(["native-definition"]);
    expect(
      await replay.operation("prepare:finish", async () => ({ complete: true }))
    ).toEqual({ complete: true });
    expect(replay.verification().importedOperations).toHaveLength(13);
    expect(
      await readFile(join(f.root, "operator/paid-calls.json"), "utf8")
    ).toBe(ledgerBefore);
  });
  it("reuses completed selection after a harness failure and continues through definitions", async () => {
    const f = await fixture();
    const next = await mkdtemp(join(tmpdir(), "selection-completed-test-"));
    await cp(join(f.root, "operator"), join(next, "operator"), {
      recursive: true,
    });
    const operator = join(next, "operator"),
      ops = join(operator, "five-items-1-s2-gpt/operations");
    const manifest = JSON.parse(
      await readFile(join(operator, "manifest.json"), "utf8")
    );
    manifest.campaignId = "completed-selection-phase";
    manifest.selectionContinuation = {
      receiptFile: f.file,
      receiptHash: createHash("sha256")
        .update(await readFile(f.file))
        .digest("hex"),
    };
    await f.save(join(operator, "manifest.json"), manifest);
    const params: InvokeParams = {
      ...f.params,
      traceLabel: "generation_selection_v1",
      maxCompletionTokens: 9000,
      messages: [{ role: "user", content: "Actual compact selection catalog" }],
    };
    const result = { version: 1, slots: ["real-result"] };
    const response = {
      choices: [{ message: { content: JSON.stringify(result) } }],
    };
    await f.save(join(ops, "selection.json"), {
      operationKey: "prepare:selection",
      state: "completed",
      result,
      trace: {
        calls: [
          {
            label: params.traceLabel,
            messages: params.messages,
            promptHash: hashPrompt(params.messages),
            effectiveModel: params.pinnedModel,
            response,
            payloadOptions: { max_tokens: 9000, reasoning_effort: "medium" },
            structuredOutputMode: "native_schema",
          },
        ],
        events: [],
      },
    });
    await f.save(join(ops, "definitions.json"), {
      operationKey: "prepare:definitions",
      state: "blocked",
      error:
        "selection_replay_unexpected_preparation_operation:prepare:definitions",
    });
    const ledger = JSON.parse(
      await readFile(join(operator, "paid-calls.json"), "utf8")
    );
    ledger.push({
      operation:
        "completed-selection-phase:five-items-1-s2-gpt:prepare:selection",
      reservedUsd: 0.6,
      actualUsd: 0.18,
    });
    await f.save(join(operator, "paid-calls.json"), ledger);
    const receipt = await prepareSelectionContinuation(next),
      file = join(next, "replay.json");
    await f.save(file, receipt);
    const replay = await loadSelectionContinuation(file);
    expect(receipt.completedSelection).toBe(true);
    await replay.operation("prepare:intent", async () =>
      JSON.parse(
        replay.generate(f.params)!.choices[0].message.content as string
      )
    );
    for (const key of f.keys)
      await replay.operation(key, async () => {
        throw new Error("JEV must not run");
      });
    await expect(
      replay.operation("prepare:definitions", async () => [])
    ).rejects.toThrow("unexpected_preparation_operation");
    expect(
      await replay.operation("prepare:selection", async () =>
        JSON.parse(
          replay.generate(params)!.choices[0].message.content as string
        )
      )
    ).toEqual(result);
    const hydrate = vi.fn(async () => [
      "definition-0",
      "definition-1",
      "definition-2",
    ]);
    expect(await replay.operation("prepare:definitions", hydrate)).toHaveLength(
      3
    );
    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(replay.verification()).toMatchObject({
      selectionValidated: true,
      importedCalls: 14,
      inheritedBudgetCalls: 71,
    });
    expect(await readFile(join(operator, "paid-calls.json"), "utf8")).toBe(
      JSON.stringify(ledger)
    );
  });
  it("fails closed on changed observable intent inputs and unrecognized JEV requests", async () => {
    const f = await fixture(),
      replay = await loadSelectionContinuation(f.file);
    await expect(
      replay.operation("prepare:intent", async () =>
        replay.generate({
          ...f.params,
          messages: [{ role: "user", content: "changed" }],
        })
      )
    ).rejects.toThrow("intent_request_changed");
    await expect(
      replay.operation("prepare:design-shortlist:0:changed", async () => null)
    ).rejects.toThrow("unexpected_preparation_operation");
    await expect(
      replay.operation("prepare:selection", async () => null)
    ).rejects.toThrow("not_fully_verified");
  });
  it("detects changed immutable evidence and refuses previously dispatched selection", async () => {
    const f = await fixture();
    await writeFile(join(f.ops, "intent.json"), "{}");
    await expect(loadSelectionContinuation(f.file)).rejects.toThrow();
    const other = await fixture();
    const ledger = JSON.parse(
      await readFile(join(other.root, "operator/paid-calls.json"), "utf8")
    );
    ledger[69].operation =
      "source-campaign:five-items-1-s2-gpt:prepare:selection";
    await other.save(join(other.root, "operator/paid-calls.json"), ledger);
    await expect(prepareSelectionContinuation(other.root)).rejects.toThrow(
      "undispatched_selection"
    );
  });
});
