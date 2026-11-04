import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { PaidCall } from "./budget";
import type { LocalOperation } from "./journal";

const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
async function optionalJson(file: string) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error: any) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}
/** Read-only accounting. No original receipt, reservation or failed result is rewritten. */
export async function inspectMatrixCampaign(directory: string) {
  const sourceDirectory = resolve(directory),
    operator = join(sourceDirectory, "operator");
  const [manifestBytes, ledgerBytes] = await Promise.all([
    readFile(join(operator, "manifest.json"), "utf8"),
    readFile(join(operator, "paid-calls.json"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestBytes),
    calls = JSON.parse(ledgerBytes) as PaidCall[];
  if (!Array.isArray(calls) || !Array.isArray(manifest.entries))
    throw new Error("campaign_evidence_invalid");
  if (
    calls.some(
      c =>
        !Number.isFinite(c.reservedUsd) ||
        c.reservedUsd < 0 ||
        (c.actualUsd !== undefined &&
          (!Number.isFinite(c.actualUsd) || c.actualUsd < 0))
    )
  )
    throw new Error("campaign_cost_invalid");
  const units = [];
  for (const entry of manifest.entries) {
    const prefix = manifest.campaignId
      ? `${manifest.campaignId}:${entry.id}:`
      : `${entry.id}:`;
    const ownCalls = calls.filter(c => c.operation.startsWith(prefix));
    let files: string[];
    try {
      files = await readdir(join(operator, entry.id, "operations"));
    } catch (error: any) {
      if (error.code !== "ENOENT") throw error;
      files = [];
    }
    const operations = await Promise.all(
      files
        .filter(f => f.endsWith(".json"))
        .map(
          async f =>
            JSON.parse(
              await readFile(join(operator, entry.id, "operations", f), "utf8")
            ) as LocalOperation
        )
    );
    const result = await optionalJson(join(operator, entry.id, "result.json"));
    const operationStatus = operations.map(o => {
      const paid = ownCalls.filter(
        c => c.operation === `${prefix}${o.operationKey}`
      );
      return {
        operationKey: o.operationKey,
        persistedState: o.state,
        paidDispatches: paid.length,
        reuse:
          o.state === "completed"
            ? "reuse_exact_receipt"
            : paid.length
              ? "do_not_repeat_dispatched_effect"
              : "no_paid_dispatch_recorded",
        error: o.error,
        campaignInterruption: o.campaignInterruption,
      };
    });
    units.push({
      ...entry,
      exercised: ownCalls.length > 0,
      calls: ownCalls.length,
      knownUsd: ownCalls.reduce((sum, c) => sum + (c.actualUsd ?? 0), 0),
      unknownReservedUsd: ownCalls
        .filter(c => c.actualUsd === undefined)
        .reduce((sum, c) => sum + c.reservedUsd, 0),
      originalOverallStatus: result?.metrics?.overallStatus ?? null,
      ready: result?.metrics?.ready ?? 0,
      originalResultPath: result
        ? join(operator, entry.id, "result.json")
        : null,
      operations: operationStatus,
    });
  }
  const unknown = calls.filter(c => c.actualUsd === undefined);
  const knownUsd = calls.reduce((sum, c) => sum + (c.actualUsd ?? 0), 0),
    unknownReservedUsd = unknown.reduce((sum, c) => sum + c.reservedUsd, 0);
  return {
    version: 1,
    sourceDirectory,
    sourceManifestHash: digest(manifestBytes),
    sourceLedgerHash: digest(ledgerBytes),
    sourceFingerprint: manifest.fingerprint,
    limits: { usd: manifest.maxUsd, calls: manifest.maxCalls },
    knownUsd,
    unknownReservedUsd,
    committedUsd: knownUsd + unknownReservedUsd,
    remaining: {
      usd: Math.max(0, manifest.maxUsd - knownUsd - unknownReservedUsd),
      calls: Math.max(0, manifest.maxCalls - calls.length),
    },
    originalProtocol: manifest.version,
    planned: units.length,
    exercised: units.filter(u => u.exercised).length,
    ready: units.reduce((sum, u) => sum + u.ready, 0),
    units,
    unknownCalls: unknown.map(c => ({
      ...c,
      reconciliation: c.providerId
        ? "metadata_lookup_by_recorded_id"
        : "external_generation_id_required",
    })),
    comparisonStatus: "interrupted_campaign_not_a_clean_model_comparison",
    limitations: [
      "Incomplete receipts retain their entire reservation. Missing generation IDs cannot be reconstructed from timestamps alone.",
      "Completed operations may be reused as exact evidence; dispatched uncertain operations must not be repeated.",
      "Existing deadlines/results remain immutable. A new protocol phase may run untouched arms only, under the same total ledger and limits.",
    ],
  };
}

export async function loadContinuationOrigin(directory: string) {
  const lock = await optionalJson(join(directory, "operator", "RUNNING.lock"));
  if (Number.isInteger(lock?.pid)) {
    try {
      process.kill(lock.pid, 0);
      throw new Error("continuation_source_still_running");
    } catch (error: any) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  const analysis = await inspectMatrixCampaign(directory);
  const manifestBytes = await readFile(
      join(analysis.sourceDirectory, "operator", "manifest.json"),
      "utf8"
    ),
    ledgerBytes = await readFile(
      join(analysis.sourceDirectory, "operator", "paid-calls.json"),
      "utf8"
    );
  if (
    digest(manifestBytes) !== analysis.sourceManifestHash ||
    digest(ledgerBytes) !== analysis.sourceLedgerHash
  )
    throw new Error("continuation_source_changed_during_read");
  const manifest = JSON.parse(manifestBytes),
    calls = JSON.parse(ledgerBytes) as PaidCall[];
  return { analysis, manifest, calls };
}
