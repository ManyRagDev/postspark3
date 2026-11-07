import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  MatrixBudget,
  type CampaignStop,
  type PaidCall,
  type PriceQuote,
} from "./budget";
import { writeJson } from "./journal";
import { loadContinuationOrigin } from "./campaignAnalysis";
import { arsenalHash } from "../../../shared/arsenalContent";
import { reconcilePaidCalls } from "./receiptReconciliation";

export type JourneyPermit = {
  id: string;
  postMode: "static" | "carousel";
  choice: "gemini" | "gpt";
  contentHash: string;
  inputHash?: string;
  idempotencyHash?: string;
  requestId?: string;
  admissionState?: "started" | "completed";
  generationConfigHash?: string;
  strategyVersion?: number;
  catalogRevision?: string;
};
export interface SharedBudgetState {
  version: 1;
  proposed: true;
  authorization?:
    | "PENDING_SPECIFIC_APPROVAL_DO_NOT_EXECUTE"
    | "DECLINED_NOT_AUTHORIZED";
  effectiveAuthorizedLimits?: { usd: number; calls: number };
  maxUsd: number;
  maxCalls: number;
  origin: {
    directory: string;
    manifestHash: string;
    ledgerHash: string;
    inheritedCount: number;
    inheritedCallsHash: string;
    reconciliation?: { file: string; sha256: string };
  };
  quotes: PriceQuote[];
  quotesHash: string;
  revisedPackage?: { path: string; sha256: string; cardContentHash: string };
  catalogSnapshots?: Record<
    "baseline" | "revised",
    { path: string; sha256: string; cardContentHash: string }
  >;
  campaigns: Record<
    string,
    {
      kind: "matrix" | "local-journeys";
      maxExecutions: number;
      pipelineHash?: string;
      executionDirectory?: string;
      permittedRunIds?: string[];
    }
  >;
  journeys: JourneyPermit[];
  calls: PaidCall[];
  interruption?: CampaignStop;
}
export const evidenceHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const catalogCardContentHash = (rows: any[]) =>
  arsenalHash(
    rows
      .map(row => ({
        id: row.component_id,
        definitionHash: row.definition_hash,
        card: row.card,
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  );

/** Cross-process lock covers accounting only; provider requests never hold it. */
export async function withBudgetFileLock<T>(
  file: string,
  work: () => Promise<T>
): Promise<T> {
  const lockPath = `${file}.lock`,
    until = Date.now() + 5000;
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  let lock;
  for (;;) {
    try {
      lock = await open(lockPath, "wx", 0o600);
      break;
    } catch (error: any) {
      if (error.code !== "EEXIST") throw error;
      try {
        const owner = JSON.parse(await readFile(lockPath, "utf8"));
        if (Number.isInteger(owner.pid)) {
          try {
            process.kill(owner.pid, 0);
          } catch (e: any) {
            if (e.code === "ESRCH")
              throw new Error(
                "shared_budget_stale_lock_requires_pid_verification"
              );
          }
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("shared_budget_stale"))
          throw e;
      }
      if (Date.now() >= until)
        throw new Error("shared_budget_accounting_lock_timeout");
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  }
  try {
    await lock.writeFile(
      JSON.stringify({ pid: process.pid, at: new Date().toISOString() })
    );
    return await work();
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
export async function readSharedBudget(
  file: string
): Promise<SharedBudgetState> {
  const state = JSON.parse(await readFile(file, "utf8")) as SharedBudgetState;
  if (
    state.version !== 1 ||
    !Number.isFinite(state.maxUsd) ||
    state.maxUsd <= 0 ||
    !Number.isInteger(state.maxCalls) ||
    state.maxCalls <= 0 ||
    !Array.isArray(state.calls) ||
    !Array.isArray(state.quotes)
  )
    throw new Error("shared_budget_invalid");
  if (
    state.calls.some(
      c =>
        !Number.isFinite(c.reservedUsd) ||
        c.reservedUsd < 0 ||
        (c.actualUsd !== undefined &&
          (!Number.isFinite(c.actualUsd) || c.actualUsd < 0))
    )
  )
    throw new Error("shared_budget_invalid_cost");
  if (
    evidenceHash(state.calls.slice(0, state.origin.inheritedCount)) !==
    state.origin.inheritedCallsHash
  )
    throw new Error("shared_budget_inherited_ledger_changed");
  if (evidenceHash(state.quotes) !== state.quotesHash)
    throw new Error("shared_budget_quotes_changed");
  if (state.origin.reconciliation) {
    const sourceBytes = await readFile(
      `${state.origin.directory}/operator/paid-calls.json`,
      "utf8"
    );
    const reconciled = await reconcilePaidCalls(
      sourceBytes,
      state.origin.reconciliation.file
    );
    if (
      reconciled.sha256 !== state.origin.reconciliation.sha256 ||
      evidenceHash(reconciled.calls) !== state.origin.inheritedCallsHash
    )
      throw new Error("shared_budget_reconciliation_changed");
  }
  return state;
}
/** Preparation only. Does not activate an app, call providers or alter the original campaign. */
export async function prepareSharedBudget(input: {
  file: string;
  origin: string;
  maxUsd: number;
  maxCalls: number;
  matrixCampaignId: string;
  journeyCampaignId: string;
  journeys: JourneyPermit[];
  permittedRunIds?: string[];
  catalogSnapshots?: Record<"baseline" | "revised", string>;
  revisedPackage?: SharedBudgetState["revisedPackage"];
  /** Explicit supplementary provider receipts; original campaign remains intact. */
  reconciliationFile?: string;
}) {
  const origin = await loadContinuationOrigin(input.origin);
  const reconciliation = input.reconciliationFile
    ? await reconcilePaidCalls(
        await readFile(
          `${origin.analysis.sourceDirectory}/operator/paid-calls.json`,
          "utf8"
        ),
        input.reconciliationFile
      )
    : undefined;
  const inheritedCalls = reconciliation?.calls ?? origin.calls;
  const inheritedCommittedUsd = inheritedCalls.reduce(
    (sum, c) => sum + (c.actualUsd ?? c.reservedUsd),
    0
  );
  if (
    !Number.isFinite(input.maxUsd) ||
    input.maxUsd < inheritedCommittedUsd ||
    !Number.isInteger(input.maxCalls) ||
    input.maxCalls < origin.calls.length
  )
    throw new Error("new_total_budget_must_cover_inherited_effects");
  if (
    input.matrixCampaignId === input.journeyCampaignId ||
    ![input.matrixCampaignId, input.journeyCampaignId].every(id =>
      /^[a-z0-9][a-z0-9_-]{2,80}$/.test(id)
    )
  )
    throw new Error("distinct_campaign_ids_required");
  const file = resolve(input.file);
  if (file.startsWith(origin.analysis.sourceDirectory + "/"))
    throw new Error("shared_budget_must_not_modify_origin_directory");
  const quotes = JSON.parse(
    await readFile(
      `${origin.analysis.sourceDirectory}/operator/prices.json`,
      "utf8"
    )
  ) as PriceQuote[];
  const catalogSnapshots = input.catalogSnapshots
    ? (Object.fromEntries(
        await Promise.all(
          Object.entries(input.catalogSnapshots).map(async ([name, path]) => {
            const bytes = await readFile(path),
              raw = JSON.parse(bytes.toString("utf8"));
            return [
              name,
              {
                path: resolve(path),
                sha256: createHash("sha256").update(bytes).digest("hex"),
                cardContentHash: catalogCardContentHash(
                  Array.isArray(raw) ? raw : (raw.snapshot ?? raw).rows
                ),
              },
            ];
          })
        )
      ) as SharedBudgetState["catalogSnapshots"])
    : undefined;
  const state: SharedBudgetState = {
    authorization: "PENDING_SPECIFIC_APPROVAL_DO_NOT_EXECUTE",
    revisedPackage: input.revisedPackage,
    version: 1,
    proposed: true,
    maxUsd: input.maxUsd,
    maxCalls: input.maxCalls,
    origin: {
      directory: origin.analysis.sourceDirectory,
      manifestHash: origin.analysis.sourceManifestHash,
      ledgerHash: origin.analysis.sourceLedgerHash,
      inheritedCount: origin.calls.length,
      inheritedCallsHash: evidenceHash(inheritedCalls),
      ...(reconciliation
        ? {
            reconciliation: {
              file: reconciliation.file,
              sha256: reconciliation.sha256,
            },
          }
        : {}),
    },
    quotes,
    quotesHash: evidenceHash(quotes),
    catalogSnapshots,
    campaigns: {
      [input.matrixCampaignId]: {
        kind: "matrix",
        maxExecutions: 8,
        permittedRunIds: input.permittedRunIds,
      },
      [input.journeyCampaignId]: { kind: "local-journeys", maxExecutions: 2 },
    },
    journeys: input.journeys,
    calls: structuredClone(inheritedCalls),
  };
  await withBudgetFileLock(file, async () => {
    try {
      await readFile(file);
      throw new Error("shared_budget_already_exists_do_not_reset");
    } catch (error: any) {
      if (error.code !== "ENOENT") throw error;
    }
    await writeJson(file, state);
  });
  return state;
}
export async function openSharedBudget(input: {
  file: string;
  campaignId: string;
  maxUsd: number;
  maxCalls: number;
  live: boolean;
  pipelineHash?: string;
  executionDirectory?: string;
  suspendLimits?: () => Promise<boolean>;
}) {
  if (!input.live) throw new Error("shared_budget_live_opt_in_required");
  const file = resolve(input.file),
    initial = await readSharedBudget(file);
  if (initial.authorization === "DECLINED_NOT_AUTHORIZED")
    throw new Error("shared_budget_declined_not_authorized");
  if (
    initial.maxUsd !== input.maxUsd ||
    initial.maxCalls !== input.maxCalls ||
    !initial.campaigns[input.campaignId]
  )
    throw new Error("shared_budget_limits_or_campaign_mismatch");
  await withBudgetFileLock(file, async () => {
    const state = await readSharedBudget(file),
      campaign = state.campaigns[input.campaignId];
    if (state.authorization === "DECLINED_NOT_AUTHORIZED")
      throw new Error("shared_budget_declined_not_authorized");
    if (campaign.pipelineHash && campaign.pipelineHash !== input.pipelineHash)
      throw new Error("shared_campaign_pipeline_changed_requires_new_evidence");
    if (
      campaign.executionDirectory &&
      campaign.executionDirectory !== input.executionDirectory
    )
      throw new Error("shared_campaign_output_directory_changed");
    if (input.pipelineHash) campaign.pipelineHash = input.pipelineHash;
    if (input.executionDirectory)
      campaign.executionDirectory = input.executionDirectory;
    await writeJson(file, state);
  });
  let budget: MatrixBudget;
  budget = new MatrixBudget(
    input.maxUsd,
    input.maxCalls,
    [],
    async calls => {
      const state = await readSharedBudget(file);
      await writeJson(file, {
        ...state,
        calls,
        interruption: budget.interruption ?? state.interruption,
      });
    },
    {
      lock: work => withBudgetFileLock(file, work),
      load: async () => {
        const s = await readSharedBudget(file);
        return { calls: s.calls, interruption: s.interruption };
      },
    },
    input.suspendLimits
  );
  await budget.refresh();
  return {
    budget,
    quotes: initial.quotes,
    origin: initial.origin,
    campaign: initial.campaigns[input.campaignId],
    file,
  };
}
