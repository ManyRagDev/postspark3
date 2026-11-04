import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { arsenalHash } from "../../../shared/arsenalContent";
import {
  generationIntentSchema,
  generationPlanResponseSchema,
} from "../../../shared/generationPlan";
import { z } from "zod";
import type { InvokeParams } from "../../_core/llm";
import { getGenerationTrace, hashPrompt } from "../../ai/generationTrace";
import type { LocalOperation } from "./journal";
import { loadContinuationOrigin } from "./campaignAnalysis";

const sha = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
type Pin = { path: string; sha256: string };
export interface SelectionContinuationReceipt {
  version: 1;
  kind: "functional_selection_continuation";
  sourceDirectory: string;
  sourceManifest: Pin;
  sourceLedger: Pin;
  sourceResult: Pin;
  sourceData: Pin;
  entryId: string;
  runId: string;
  inheritedCalls: number;
  operations: Array<Pin & { operationKey: string }>;
  blockedSelection: Pin;
  currentIntentSchema: { hash: string; sourceSchemaBytesPreserved: false };
  completedSelection?: true;
  blockedOperation?: "prepare:definitions";
  priorReceipt?: Pin;
  currentSelectionSchema?: { hash: string; sourceSchemaBytesPreserved: false };
  limitations: string[];
}
async function pin(path: string): Promise<Pin> {
  path = resolve(path);
  return { path, sha256: sha(await readFile(path)) };
}
async function readPinned<T>(p: Pin): Promise<T> {
  const bytes = await readFile(p.path);
  if (sha(bytes) !== p.sha256)
    throw new Error("selection_replay_source_changed");
  return JSON.parse(bytes.toString("utf8"));
}

/** Creates evidence only. The old ledger, result and blocked operation remain immutable. */
export async function prepareSelectionContinuation(
  directory: string
): Promise<SelectionContinuationReceipt> {
  const origin = await loadContinuationOrigin(directory);
  if (
    origin.manifest.entries.length !== 1 ||
    origin.analysis.limits.usd !== 4 ||
    origin.analysis.limits.calls !== 80
  )
    throw new Error("selection_replay_requires_one_original_authorized_arm");
  const entry = origin.manifest.entries[0];
  if (
    entry.id !== "five-items-1-s2-gpt" ||
    entry.strategy !== 2 ||
    entry.choice !== "gpt"
  )
    throw new Error("selection_replay_scope_mismatch");
  const operator = join(origin.analysis.sourceDirectory, "operator");
  const base = join(operator, entry.id);
  const rows = await Promise.all(
    (await readdir(join(base, "operations")))
      .filter(f => f.endsWith(".json"))
      .map(async f => {
        const p = await pin(join(base, "operations", f));
        return { pin: p, row: await readPinned<LocalOperation>(p) };
      })
  );
  const selection = rows.find(r => r.row.operationKey === "prepare:selection");
  const completedSelection = selection?.row.state === "completed";
  const blocked = completedSelection
    ? rows.find(r => r.row.operationKey === "prepare:definitions")
    : selection;
  const prefix = `${origin.manifest.campaignId}:${entry.id}:`;
  const ownCalls = origin.calls.filter(c => c.operation.startsWith(prefix));
  if (
    !blocked ||
    blocked.row.state !== "blocked" ||
    (!completedSelection &&
      blocked.row.campaignInterruption?.reason !== "budget_exhausted") ||
    origin.calls.some(
      c => c.operation === `${prefix}${blocked.row.operationKey}`
    ) ||
    rows.some(r => r !== blocked && r.row.state !== "completed") ||
    !rows.some(r => r.row.operationKey === "prepare:intent") ||
    origin.calls.length !== (completedSelection ? 71 : 70) ||
    ownCalls.length !== (completedSelection ? 1 : 13) ||
    rows.filter(r => r.row.operationKey.startsWith("prepare:design-shortlist:"))
      .length !== 12
  )
    throw new Error(
      "selection_replay_requires_completed_preparation_and_undispatched_selection"
    );
  let priorReceipt: Pin | undefined;
  if (completedSelection) {
    if (
      blocked!.row.error !==
        "selection_replay_unexpected_preparation_operation:prepare:definitions" ||
      ownCalls[0].operation !== `${prefix}prepare:selection` ||
      ownCalls[0].actualUsd === undefined ||
      !origin.manifest.selectionContinuation?.receiptFile
    )
      throw new Error("selection_replay_completed_selection_origin_invalid");
    priorReceipt = await pin(origin.manifest.selectionContinuation.receiptFile);
    if (
      priorReceipt.sha256 !== origin.manifest.selectionContinuation.receiptHash
    )
      throw new Error("selection_replay_prior_receipt_changed");
    const prior = await loadSelectionContinuation(priorReceipt.path);
    if (
      prior.receipt.completedSelection ||
      arsenalHash(origin.calls.slice(0, prior.calls.length)) !==
        arsenalHash(prior.calls)
    )
      throw new Error("selection_replay_prior_ledger_changed");
  }
  return {
    version: 1,
    kind: "functional_selection_continuation",
    sourceDirectory: origin.analysis.sourceDirectory,
    sourceManifest: await pin(join(operator, "manifest.json")),
    sourceLedger: await pin(join(operator, "paid-calls.json")),
    sourceResult: await pin(join(base, "result.json")),
    sourceData: await pin(join(operator, "sources-five-items.json")),
    entryId: entry.id,
    runId: entry.runId,
    inheritedCalls: origin.calls.length,
    operations: rows
      .filter(r => r !== blocked)
      .map(r => ({ ...r.pin, operationKey: r.row.operationKey })),
    blockedSelection: blocked.pin,
    currentIntentSchema: {
      hash: arsenalHash(z.toJSONSchema(generationIntentSchema)),
      sourceSchemaBytesPreserved: false,
    },
    ...(completedSelection
      ? {
          completedSelection: true as const,
          blockedOperation: "prepare:definitions" as const,
          priorReceipt,
          currentSelectionSchema: {
            hash: arsenalHash(z.toJSONSchema(generationPlanResponseSchema)),
            sourceSchemaBytesPreserved: false as const,
          },
        }
      : {}),
    limitations: [
      "Mixed functional phase: original interrupted outcome and deadline remain unchanged; the new phase has its own deadline and fingerprint.",
      "Only completed receipts are reused. JEV operation keys include the complete request hash; intent messages/model/output/reasoning/native-schema mode must match.",
      "The old intent trace did not preserve the response-schema body. Current schema validation is repeated; retrospective byte equality of that missing schema is not claimed.",
      "No provider effect from the source phase is purchased again. This is not a clean model or latency comparison.",
    ],
  };
}

export async function loadSelectionContinuation(file: string) {
  const receiptBytes = await readFile(file);
  const receipt = JSON.parse(
    receiptBytes.toString("utf8")
  ) as SelectionContinuationReceipt;
  if (
    receipt.version !== 1 ||
    receipt.kind !== "functional_selection_continuation"
  )
    throw new Error("selection_replay_receipt_invalid");
  const expected = await prepareSelectionContinuation(receipt.sourceDirectory);
  if (arsenalHash(receipt) !== arsenalHash(expected))
    throw new Error("selection_replay_receipt_changed");
  const manifest = await readPinned<any>(receipt.sourceManifest);
  const calls = await readPinned<any[]>(receipt.sourceLedger);
  const sourceData = await readPinned<any>(receipt.sourceData);
  const rows = new Map<string, LocalOperation>();
  for (const item of receipt.operations) {
    const row = await readPinned<LocalOperation>(item);
    if (
      row.operationKey !== item.operationKey ||
      row.state !== "completed" ||
      rows.has(row.operationKey)
    )
      throw new Error("selection_replay_operation_invalid");
    rows.set(row.operationKey, row);
  }
  const active = new AsyncLocalStorage<string>();
  const consumed = new Set<string>();
  let intentValidated = false;
  let selectionValidated = false;
  const prior = receipt.priorReceipt
    ? await readPinned<SelectionContinuationReceipt>(receipt.priorReceipt)
    : undefined;
  const identityCampaignId: string = prior
    ? (await readPinned<any>(prior.sourceManifest)).campaignId
    : manifest.campaignId;
  const appendTrace = (row: LocalOperation) => {
    const trace = getGenerationTrace();
    if (trace && row.trace) {
      trace.calls.push(...row.trace.calls);
      trace.events.push(...row.trace.events);
    }
  };
  return {
    receipt,
    receiptHash: sha(receiptBytes),
    manifest,
    calls,
    sourceData,
    identityCampaignId,
    assertBasis(basis: {
      entries: unknown;
      inputs: unknown;
      configs: unknown;
      catalogs: unknown;
      ancillaryModels: unknown;
      includeDrafts: boolean;
    }) {
      for (const field of [
        "entries",
        "inputs",
        "configs",
        "catalogs",
        "ancillaryModels",
        "includeDrafts",
      ] as const)
        if (arsenalHash(basis[field]) !== arsenalHash(manifest[field]))
          throw new Error(`selection_replay_${field}_changed`);
    },
    async operation<T>(key: string, work: () => Promise<T>): Promise<T> {
      if (key === "prepare:selection") {
        const required = rows.size - (rows.has(key) ? 1 : 0);
        if (!intentValidated || consumed.size !== required)
          throw new Error("selection_replay_preparation_not_fully_verified");
        const current = await active.run(key, work);
        const saved = rows.get(key);
        if (saved && arsenalHash(current) !== arsenalHash(saved.result))
          throw new Error("selection_replay_selection_result_changed");
        if (saved) consumed.add(key);
        selectionValidated = true;
        return current;
      }
      const row = rows.get(key);
      if (!row && selectionValidated) return work();
      if (!row)
        throw new Error(
          `selection_replay_unexpected_preparation_operation:${key}`
        );
      if (key.startsWith("prepare:design-shortlist:")) {
        const requestHash = key.split(":").at(-1);
        if (
          (row.result as any)?.assessmentContext?.requestHash !== requestHash ||
          row.trace?.calls.length !== 1 ||
          row.trace.calls[0].promptHash !== requestHash
        )
          throw new Error("selection_replay_jev_request_changed");
        appendTrace(row);
        consumed.add(key);
        return structuredClone(row.result) as T;
      }
      const current = await active.run(key, work);
      const contentIdentity = (value: unknown) => {
        if (key !== "prepare:catalog" || !(value as any)?.coverage)
          return value;
        const {
          capturedAt: _capturedAt,
          receiptHash: _receiptHash,
          ...coverage
        } = (value as any).coverage;
        return { ...(value as any), coverage };
      };
      if (
        arsenalHash(contentIdentity(current)) !==
        arsenalHash(contentIdentity(row.result))
      ) {
        const fields = Object.keys((current ?? {}) as object).filter(
          field =>
            arsenalHash((current as any)?.[field]) !==
            arsenalHash((row.result as any)?.[field])
        );
        throw new Error(
          `selection_replay_local_input_changed:${key}:${fields.join(",")}`
        );
      }
      consumed.add(key);
      // The current read verifies identical inventory/scope/cards; retain the original capture receipt/time.
      return key === "prepare:catalog"
        ? (structuredClone(row.result) as T)
        : current;
    },
    generate(params: InvokeParams) {
      const key =
        params.traceLabel === "generation_intent_v1"
          ? "prepare:intent"
          : params.traceLabel === "generation_selection_v1" &&
              receipt.completedSelection
            ? "prepare:selection"
            : undefined;
      if (!key) return undefined;
      if (active.getStore() !== key)
        throw new Error(
          "selection_replay_inference_outside_verified_operation"
        );
      const row = rows.get(key)!;
      const call = row.trace?.calls[0];
      if (
        !call ||
        row.trace!.calls.length !== 1 ||
        call.error ||
        !call.response ||
        hashPrompt(params.messages) !== call.promptHash ||
        arsenalHash(params.messages) !== arsenalHash(call.messages) ||
        params.pinnedModel !== call.effectiveModel ||
        params.maxCompletionTokens !== call.payloadOptions?.max_tokens ||
        params.reasoningEffort !== call.payloadOptions?.reasoning_effort ||
        params.forceTextSchema !== false ||
        call.structuredOutputMode !== "native_schema"
      )
        throw new Error(
          key === "prepare:intent"
            ? "selection_replay_intent_request_changed"
            : "selection_replay_selection_request_changed"
        );
      if (key === "prepare:intent") intentValidated = true;
      appendTrace(row);
      return structuredClone(call.response) as Awaited<
        ReturnType<typeof import("../../_core/llm").invokeLLM>
      >;
    },
    verification() {
      return {
        importedOperations: Array.from(consumed),
        intentValidated,
        selectionValidated,
        importedCalls: Array.from(rows.values()).reduce(
          (n, r) => n + (r.trace?.calls.length ?? 0),
          0
        ),
        inheritedBudgetCalls: receipt.inheritedCalls,
        sourceReceiptHash: sha(receiptBytes),
      };
    },
  };
}
