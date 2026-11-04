import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  receiptEvidenceHash,
  reconcilePaidCalls,
  type ReceiptReconciliation,
} from "./receiptReconciliation";
import {
  prepareSharedBudget,
  readSharedBudget,
  openSharedBudget,
} from "./sharedBudget";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map(p => rm(p, { recursive: true, force: true }))
  );
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "postspark-receipts-"));
  temporary.push(directory);
  const origin = join(directory, "old"),
    evidenceFile = join(directory, "supplement.json"),
    receiptFile = join(directory, "receipt.json");
  await mkdir(join(origin, "operator"), { recursive: true });
  const calls = [
    {
      operation: "old:review",
      model: "test/model",
      startedAt: "2026-11-01T20:20:31.537Z",
      reservedUsd: 0.9,
      status: "uncertain",
    },
  ];
  const ledgerBytes = JSON.stringify(calls);
  const receipt = {
    httpStatus: 200,
    endpoint: "https://openrouter.ai/api/v1/generation?id=gen-recovered",
    body: {
      data: {
        id: "gen-recovered",
        request_id: "req-recovered",
        model: "test/model-20261001",
        created_at: "2026-11-01T20:20:31.773Z",
        total_cost: 0.02,
        usage: 0.02,
        origin: "https://example.test/",
        app_id: 4,
        workspace_id: "workspace",
        user_agent: "node",
      },
    },
  };
  const evidence: ReceiptReconciliation = {
    version: 1,
    sourceLedgerSha256: receiptEvidenceHash(ledgerBytes),
    observation: {
      method: "provider_logs_operator_verified",
      appLabel: "test",
      apiKeyLabel: "test",
      origin: "https://example.test/",
      appId: 4,
      workspaceId: "workspace",
      userAgent: "node",
    },
    matches: [
      {
        operation: calls[0].operation,
        startedAt: calls[0].startedAt,
        originalCallSha256: receiptEvidenceHash(JSON.stringify(calls[0])),
        providerId: "gen-recovered",
        receiptFile: "receipt.json",
        receiptSha256: receiptEvidenceHash(JSON.stringify(receipt)),
      },
    ],
  };
  const saveEvidence = () => writeFile(evidenceFile, JSON.stringify(evidence));
  const saveReceipt = async () => {
    const bytes = JSON.stringify(receipt);
    await writeFile(receiptFile, bytes);
    evidence.matches[0].receiptSha256 = receiptEvidenceHash(bytes);
    await saveEvidence();
  };
  await writeFile(join(origin, "operator/paid-calls.json"), ledgerBytes);
  await writeFile(
    join(origin, "operator/manifest.json"),
    JSON.stringify({
      version: 1,
      fingerprint: "old",
      maxUsd: 4,
      maxCalls: 80,
      entries: [],
    })
  );
  await writeFile(
    join(origin, "operator/prices.json"),
    JSON.stringify([
      {
        id: "test/model",
        context_length: 1000,
        pricing: { prompt: "0.000001", completion: "0.000001" },
      },
    ])
  );
  await saveReceipt();
  return {
    directory,
    origin,
    evidenceFile,
    receiptFile,
    calls,
    ledgerBytes,
    receipt,
    evidence,
    saveEvidence,
    saveReceipt,
  };
}

describe("supplementary provider receipts", () => {
  it("inherits verified costs in the runtime budget while preserving original receipts and uncertain outcomes", async () => {
    const f = await fixture(),
      file = join(f.directory, "new/shared-budget.json");
    await prepareSharedBudget({
      file,
      origin: f.origin,
      maxUsd: 0.2,
      maxCalls: 80,
      matrixCampaignId: "new-matrix",
      journeyCampaignId: "new-ui",
      journeys: [],
      reconciliationFile: f.evidenceFile,
    });
    const { budget } = await openSharedBudget({
      file,
      campaignId: "new-matrix",
      maxUsd: 0.2,
      maxCalls: 80,
      live: true,
    });
    expect(budget.calls).toHaveLength(1);
    expect(budget.committedUsd).toBe(0.02);
    expect(budget.calls[0].status).toBe("uncertain");
    expect(budget.calls[0].providerId).toBe("gen-recovered");
    expect(
      await readFile(join(f.origin, "operator/paid-calls.json"), "utf8")
    ).toBe(f.ledgerBytes);
    await writeFile(f.receiptFile, "{}");
    await expect(readSharedBudget(file)).rejects.toThrow("receipt_changed");
  });

  it("rejects mismatched original evidence and provider identity instead of inferring a free call", async () => {
    const f = await fixture();
    await expect(
      reconcilePaidCalls(f.ledgerBytes + " ", f.evidenceFile)
    ).rejects.toThrow("evidence_invalid");
    f.receipt.body.data.total_cost = -1;
    await f.saveReceipt();
    await expect(
      reconcilePaidCalls(f.ledgerBytes, f.evidenceFile)
    ).rejects.toThrow("provider_mismatch");
    f.receipt.body.data.total_cost = 0.02;
    f.receipt.body.data.app_id = 999;
    await f.saveReceipt();
    await expect(
      reconcilePaidCalls(f.ledgerBytes, f.evidenceFile)
    ).rejects.toThrow("provider_mismatch");
  });

  it("requires operator-observed identity and a unique dispatch match, not timestamps alone", async () => {
    const f = await fixture();
    f.evidence.observation.apiKeyLabel = "";
    await f.saveEvidence();
    await expect(
      reconcilePaidCalls(f.ledgerBytes, f.evidenceFile)
    ).rejects.toThrow("evidence_invalid");
    f.evidence.observation.apiKeyLabel = "test";
    f.receipt.body.data.model = "another/model";
    await f.saveReceipt();
    await expect(
      reconcilePaidCalls(f.ledgerBytes, f.evidenceFile)
    ).rejects.toThrow("dispatch_mismatch");
    f.receipt.body.data.model = "test/model";
    await f.saveReceipt();
    const ambiguous = JSON.stringify([
      ...f.calls,
      { ...f.calls[0], operation: "other:review" },
    ]);
    f.evidence.sourceLedgerSha256 = receiptEvidenceHash(ambiguous);
    await f.saveEvidence();
    await expect(reconcilePaidCalls(ambiguous, f.evidenceFile)).rejects.toThrow(
      "dispatch_mismatch"
    );
  });

  it("rejects a duplicate mapping and changed call history", async () => {
    const f = await fixture();
    f.evidence.matches.push({ ...f.evidence.matches[0] });
    await f.saveEvidence();
    await expect(
      reconcilePaidCalls(f.ledgerBytes, f.evidenceFile)
    ).rejects.toThrow("call_changed");
    f.evidence.matches.pop();
    f.evidence.matches[0].originalCallSha256 = "wrong";
    await f.saveEvidence();
    await expect(
      reconcilePaidCalls(f.ledgerBytes, f.evidenceFile)
    ).rejects.toThrow("call_changed");
  });
});
