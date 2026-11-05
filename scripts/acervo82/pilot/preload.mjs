import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import {
  openSharedBudget,
  withBudgetFileLock,
  readSharedBudget,
} from "../../../server/benchmarks/generationMatrix/sharedBudget.ts";
import { installMatrixTransport } from "../../../server/benchmarks/generationMatrix/budget.ts";
import { getGenerationTrace } from "../../../server/ai/generationTrace.ts";
import { localPipelineFingerprint } from "../../../server/benchmarks/generationMatrix/localPipelineFingerprint.ts";
import { writeJson } from "../../../server/benchmarks/generationMatrix/journal.ts";
const filename = process.env.POSTSPARK_ACERVO82_PILOT_CONFIG;
if (!filename) throw new Error("pilot_config_required");
const config = JSON.parse(await readFile(filename, "utf8"));
const full = config.authorization === "user-authorized-acervo82-full";
const campaignId = full ? "acervo82-full" : "acervo82-pilot";
const maxCalls = full ? 240 : 120, maxAdmissions = full ? 12 : 5;
if (
  (!full && config.authorization !== "user-authorized-acervo82-pilot") ||
  config.maxUsd !== 10 || config.maxCalls !== maxCalls ||
  (full && (config.session !== "full-catalog-01" || config.maxAdmissions !== 12 || !config.identity || !config.indexHash))
) throw new Error("acervo82_authorization_or_limits_invalid");
if(full){
  const staged=JSON.parse(await readFile("artifacts/acervo82/full/staged.json","utf8"));
  if(staged.sources!==82||staged.revision!==config.revision||staged.identity!==config.identity||staged.indexHash!==config.indexHash)
    throw new Error("acervo82_catalog_scope_invalid");
}
if (
  (await localPipelineFingerprint(config.rendererPath)) !== config.pipelineHash
)
  throw new Error("pilot_pipeline_changed_reconfigure_before_running");
const { budget, quotes } = await openSharedBudget({
  file: config.budgetFile,
  campaignId,
  maxUsd: 10,
  maxCalls,
  live: true,
});
const allowed = new URL(config.supabaseUrl);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(allowed.hostname) ||
  allowed.protocol !== "http:"
)
  throw new Error("pilot_requires_local_supabase");
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
      await withBudgetFileLock(config.budgetFile, async () => {
        const state = await readSharedBudget(config.budgetFile);
        state.pilotRequests ??= [];
        if (!state.pilotRequests.includes(b.p_id)) {
          const reservedOrSpent=state.calls.reduce((n,call)=>n+(call.actualUsd??call.reservedUsd),0);
          if (state.pilotRequests.length >= maxAdmissions || state.calls.length >= maxCalls || reservedOrSpent >= 10 || state.interruption)
            throw new Error("acervo82_session_budget_exhausted");
          state.pilotRequests.push(b.p_id);
          await writeJson(config.budgetFile, state);
        }
      });
    }
    return true;
  },
  context: async payload => ({
    operation: `${campaignId}:${getGenerationTrace()?.id ?? "visual-review"}:${randomUUID()}`,
    metadata: {
      phase: campaignId,
      generationRequestId: getGenerationTrace()?.id ?? "",
      payloadHash: createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex"),
    },
  }),
});
globalThis.__acervo82PilotBudget = budget;
