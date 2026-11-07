import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import {
  openSharedBudget,
  withBudgetFileLock,
  readSharedBudget,
} from "../../../server/benchmarks/generationMatrix/sharedBudget.ts";
import { blocksCampaign, installMatrixTransport } from "../../../server/benchmarks/generationMatrix/budget.ts";
import { getGenerationTrace } from "../../../server/ai/generationTrace.ts";
import { localPipelineFingerprint } from "../../../server/benchmarks/generationMatrix/localPipelineFingerprint.ts";
import { writeJson } from "../../../server/benchmarks/generationMatrix/journal.ts";
import { manualTrial, promptTrial, readTrialCatalog } from "../full/promptTrial.mjs";
const filename = process.env.POSTSPARK_ACERVO82_PILOT_CONFIG;
if (!filename) throw new Error("pilot_config_required");
const config = JSON.parse(await readFile(filename, "utf8"));
const trial = [promptTrial, manualTrial].find(profile => profile.authorization === config.authorization);
const full = Boolean(trial) || config.authorization === "user-authorized-acervo82-full";
const campaignId = trial?.campaign ?? (full ? "acervo82-full" : "acervo82-pilot");
const maxUsd = trial?.maxUsd ?? 10;
const maxCalls = trial?.maxCalls ?? (full ? 240 : 120);
const maxAdmissions = trial?.maxAdmissions ?? (full ? 12 : 5);
if (
  (!full && config.authorization !== "user-authorized-acervo82-pilot") ||
  config.maxUsd !== maxUsd || config.maxCalls !== maxCalls ||
  (full && (config.session !== (trial?.session ?? "full-catalog-01") ||
    config.campaign !== campaignId || config.maxAdmissions !== maxAdmissions || !config.identity || !config.indexHash))
) throw new Error("acervo82_authorization_or_limits_invalid");
const trialCases = trial === promptTrial ? JSON.parse(await readFile(promptTrial.casesFile, "utf8")) : null;
if (trialCases) {
  const hash = createHash("sha256").update(JSON.stringify(trialCases)).digest("hex");
  if (hash !== config.casesHash || trialCases.length !== maxAdmissions ||
    new Set(trialCases.map(entry => entry.id)).size !== maxAdmissions)
    throw new Error("acervo82_prompt_trial_cases_changed");
}
if(full){
  const { stage: staged } = await readTrialCatalog(process.cwd(), full, trial);
  if(staged.sources!==82||staged.revision!==config.revision||staged.identity!==config.identity||staged.indexHash!==config.indexHash)
    throw new Error("acervo82_catalog_scope_invalid");
}
const currentPipelineMatches = async () =>
  (await localPipelineFingerprint(config.rendererPath)) === config.pipelineHash;
if (!(await currentPipelineMatches()))
  throw new Error("pilot_pipeline_changed_reconfigure_before_running");
// The operator marker suspends all numeric limits only for manual Studio use.
// The original accounting file, provider receipts and manual stops stay durable.
async function manualLimitsSuspended() {
  if (trial !== manualTrial) return false;
  const override = await readFile(`${filename}.open-admissions`, "utf8").catch(error => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  return override?.trim() === "enabled";
}
const { budget, quotes } = await openSharedBudget({
  file: config.budgetFile,
  campaignId,
  maxUsd,
  maxCalls,
  live: true,
  suspendLimits: manualLimitsSuspended,
});
const allowed = new URL(config.supabaseUrl);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(allowed.hostname) ||
  allowed.protocol !== "http:"
)
  throw new Error("pilot_requires_local_supabase");
async function reachedAdmissionLimit(state) {
  const suspended = await manualLimitsSuspended();
  return state.authorization === "DECLINED_NOT_AUTHORIZED" || blocksCampaign(state.interruption, suspended) ||
    (!suspended && (state.calls.length >= maxCalls ||
      state.calls.reduce((total, call) => total + (call.actualUsd ?? call.reservedUsd), 0) >= maxUsd ||
      (state.pilotRequests?.length ?? 0) >= maxAdmissions));
}
if (trial === manualTrial) {
  globalThis.__acervo82ManualAdmissionReason = async actor => {
    if (actor !== config.actor) return "maintenance";
    if (!(await currentPipelineMatches())) return "pipeline_reconfiguration_required";
    return await reachedAdmissionLimit(await readSharedBudget(config.budgetFile)) ? "manual_session_limit" : null;
  };
}
installMatrixTransport(budget, new Map(quotes.map(q => [q.id, q])), {
  allowApplicationRequest: async (url, method, _request, init) => {
    if (url.origin !== allowed.origin) return false;
    if (!/^\/(auth|rest|storage)\/v1\//.test(url.pathname))
      throw new Error("pilot_local_endpoint_not_allowed");
    if (method === "POST" && url.pathname.includes("/rpc/generation_admit")) {
      const b = JSON.parse(init.body);
      if (
        b.p_owner !== config.actor ||
        String(b.p_revision) !== config.revision ||
        b.p_experimental !== true ||
        !url.pathname.endsWith("generation_admit_staged_local")
      )
        throw new Error("pilot_admission_scope_invalid");
      if (trialCases) {
        const input = b.p_input;
        const entry = trialCases.find(c => b.p_idempotency_key === `acervo82-${promptTrial.session}-${c.id}`);
        if (!entry || input?.content !== entry.content || input.postMode !== entry.postMode ||
          (input.slideCount ?? 1) !== entry.slides || input.inputType !== "text" ||
          input.platform !== "instagram" || input.aspectRatio !== "4:5" || input.generationModel !== "gemini" ||
          input.sources?.length || input.imageUrl || input.projectId || input.projectSnapshot ||
          input.projectDossier || input.executionBrief || input.generationParentRequestId)
          throw new Error("acervo82_prompt_trial_input_not_authorized");
      }
      await withBudgetFileLock(config.budgetFile, async () => {
        const state = await readSharedBudget(config.budgetFile);
        state.pilotRequests ??= [];
        if (!state.pilotRequests.includes(b.p_id)) {
          if (await reachedAdmissionLimit(state))
            throw new Error("acervo82_session_budget_exhausted");
          state.pilotRequests.push(b.p_id);
          await writeJson(config.budgetFile, state);
        }
      });
    }
    return true;
  },
  context: async payload => {
    const requestId = getGenerationTrace()?.id;
    if (trial && (!requestId || !(await readSharedBudget(config.budgetFile)).pilotRequests?.includes(requestId))) {
      throw new Error("acervo82_prompt_trial_unadmitted_effect");
    }
    return {
      operation: `${campaignId}:${requestId ?? "visual-review"}:${randomUUID()}`,
      metadata: {
        phase: campaignId,
        generationRequestId: requestId ?? "",
        payloadHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
      },
    };
  },
});
globalThis.__acervo82PilotBudget = budget;
