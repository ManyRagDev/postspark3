import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { PaidCall } from "./budget";

export const receiptEvidenceHash = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

export interface ReceiptReconciliation {
  version: 1;
  sourceLedgerSha256: string;
  // An operator must establish account/app/key identity from provider logs.
  // Timestamps alone never authorize matching or releasing a reservation.
  observation: {
    method: "provider_logs_operator_verified";
    appLabel: string;
    apiKeyLabel: string;
    origin: string;
    appId: number;
    workspaceId: string;
    userAgent: string;
  };
  matches: Array<{
    operation: string;
    startedAt: string;
    originalCallSha256: string;
    providerId: string;
    receiptFile: string;
    receiptSha256: string;
  }>;
}

/** Applies explicit, independently recovered receipt mappings to a copy. This
 * performs no requests, infers no zero costs, and preserves operation outcomes. */
export async function reconcilePaidCalls(ledgerBytes: string, file: string) {
  const bytes = await readFile(file, "utf8");
  const evidence = JSON.parse(bytes) as ReceiptReconciliation;
  const observation = evidence.observation;
  if (
    evidence.version !== 1 ||
    evidence.sourceLedgerSha256 !== receiptEvidenceHash(ledgerBytes) ||
    !Array.isArray(evidence.matches) ||
    !evidence.matches.length ||
    observation?.method !== "provider_logs_operator_verified" ||
    !observation.appLabel ||
    !observation.apiKeyLabel ||
    !observation.origin ||
    !Number.isInteger(observation.appId) ||
    !observation.workspaceId ||
    !observation.userAgent
  )
    throw new Error("receipt_reconciliation_evidence_invalid");

  const calls = JSON.parse(ledgerBytes) as PaidCall[];
  const used = new Set(calls.map(c => c.providerId).filter(Boolean));
  for (const match of evidence.matches) {
    const candidates = calls.filter(
      c => c.operation === match.operation && c.startedAt === match.startedAt
    );
    if (candidates.length !== 1)
      throw new Error("receipt_reconciliation_call_ambiguous");
    const call = candidates[0];
    if (
      call.actualUsd !== undefined ||
      call.providerId ||
      used.has(match.providerId) ||
      receiptEvidenceHash(JSON.stringify(call)) !== match.originalCallSha256
    )
      throw new Error("receipt_reconciliation_call_changed");

    const receiptBytes = await readFile(
      resolve(dirname(file), match.receiptFile),
      "utf8"
    );
    if (receiptEvidenceHash(receiptBytes) !== match.receiptSha256)
      throw new Error("receipt_reconciliation_receipt_changed");
    const receipt = JSON.parse(receiptBytes),
      data = receipt.body?.data;
    const endpoint = new URL(receipt.endpoint);
    if (
      receipt.httpStatus !== 200 ||
      endpoint.origin !== "https://openrouter.ai" ||
      endpoint.pathname !== "/api/v1/generation" ||
      endpoint.searchParams.get("id") !== match.providerId ||
      data?.id !== match.providerId ||
      typeof data.request_id !== "string" ||
      !data.request_id ||
      data.origin !== observation.origin ||
      data.app_id !== observation.appId ||
      data.workspace_id !== observation.workspaceId ||
      data.user_agent !== observation.userAgent ||
      !Number.isFinite(data.total_cost) ||
      data.total_cost < 0 ||
      !Number.isFinite(data.usage) ||
      data.usage !== data.total_cost
    )
      throw new Error("receipt_reconciliation_provider_mismatch");

    const sameModel = (c: PaidCall) =>
      data.model === c.model || data.model?.startsWith(`${c.model}-`);
    const created = Date.parse(data.created_at);
    // These recovered synchronous receipts must uniquely fit the dispatch window.
    // This corroborates the explicit operator mapping; it does not create one.
    const inWindow = calls.filter(c => {
      const delta = created - Date.parse(c.startedAt);
      return (
        sameModel(c) && Number.isFinite(delta) && delta >= 0 && delta <= 1000
      );
    });
    if (inWindow.length !== 1 || inWindow[0] !== call)
      throw new Error("receipt_reconciliation_dispatch_mismatch");

    call.actualUsd = data.total_cost;
    call.providerId = data.id;
    call.requestId = data.request_id;
    used.add(data.id);
  }
  return { calls, file: resolve(file), sha256: receiptEvidenceHash(bytes) };
}
