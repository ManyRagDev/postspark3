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
if (
  config.authorization !== "user-authorized-acervo82-pilot" ||
  config.maxUsd !== 10 ||
  config.maxCalls !== 120
)
  throw new Error("pilot_authorization_or_limits_invalid");
if (
  (await localPipelineFingerprint(config.rendererPath)) !== config.pipelineHash
)
  throw new Error("pilot_pipeline_changed_reconfigure_before_running");
const { budget, quotes } = await openSharedBudget({
  file: config.budgetFile,
  campaignId: "acervo82-pilot",
  maxUsd: 10,
  maxCalls: 120,
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
          if (state.pilotRequests.length >= 5)
            throw new Error("pilot_five_request_limit");
          state.pilotRequests.push(b.p_id);
          await writeJson(config.budgetFile, state);
        }
      });
    }
    return true;
  },
  context: async payload => ({
    operation: `acervo82-pilot:${getGenerationTrace()?.id ?? "visual-review"}:${randomUUID()}`,
    metadata: {
      phase: "acervo82-pilot",
      generationRequestId: getGenerationTrace()?.id ?? "",
      payloadHash: createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex"),
    },
  }),
});
globalThis.__acervo82PilotBudget = budget;
