/** A new bounded local campaign; historical pilot ledgers and authorizations stay untouched. */
import assert from "node:assert/strict";
import { readFile, appendFile, mkdir, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { automaticSmokeProfile, smokeHash, assertAutomaticSmokeBudgetProfile } from "./automaticSmoke.mjs";
import { openSharedBudget, withBudgetFileLock, readSharedBudget } from "../../../server/benchmarks/generationMatrix/sharedBudget.ts";
import { installMatrixTransport, blocksCampaign } from "../../../server/benchmarks/generationMatrix/budget.ts";
import { writeJson } from "../../../server/benchmarks/generationMatrix/journal.ts";
import { localPipelineFingerprint } from "../../../server/benchmarks/generationMatrix/localPipelineFingerprint.ts";
import { getGenerationTrace } from "../../../server/ai/generationTrace.ts";
const filename = process.env.POSTSPARK_ACERVO82_PILOT_CONFIG;
assert(filename, "automatic_smoke_config_required");
const config = JSON.parse(await readFile(filename, "utf8"));
assert.equal(config.profileHash, smokeHash);
for (const name of ["session", "campaign", "authorization", "maxUsd", "maxCalls", "maxAdmissions"]) assert.equal(config[name], automaticSmokeProfile[name]);
assert.equal(config.pipelineHash, await localPipelineFingerprint(config.rendererPath), "automatic_smoke_reconfigure_after_code_changes");
const stage = JSON.parse(await readFile("artifacts/acervo82/full/staged.json", "utf8"));
assert.equal(stage.sources, 82);
for (const name of ["revision", "identity", "indexHash", "actor"]) assert.equal(config[name], stage[name]);
const allowed = new URL(config.supabaseUrl);
assert(["localhost", "127.0.0.1", "[::1]"].includes(allowed.hostname) && allowed.protocol === "http:");
assertAutomaticSmokeBudgetProfile(await readSharedBudget(config.budgetFile));
const { budget, quotes } = await openSharedBudget({ file: config.budgetFile, campaignId: config.campaign, maxUsd: config.maxUsd, maxCalls: config.maxCalls, live: true });
const receiptFile = path.join(path.dirname(config.budgetFile), "provider-receipts.jsonl");
const original = globalThis.fetch;
// Test-only wire capture: synthetic inputs, no request headers or credentials.
globalThis.fetch = async (request, init) => {
  const response = await original(request, init);
  const url = new URL(typeof request === "string" || request instanceof URL ? request : request.url);
  if (url.hostname === "openrouter.ai" && init?.method === "POST") {
    const payload = JSON.parse(init.body), body = await response.clone().json().catch(() => null);
    const wireDirectory = path.join(path.dirname(config.budgetFile), "wire");
    await mkdir(wireDirectory, {recursive:true,mode:0o700});
    const wireId = String(body?.id ?? randomUUID()).replace(/[^a-zA-Z0-9_-]/g,"_");
    await writeFile(path.join(wireDirectory, `${wireId}.json`), JSON.stringify({requestId:getGenerationTrace()?.id,httpStatus:response.status,request:payload,response:body},null,2),{mode:0o600,flag:"wx"});
    await appendFile(receiptFile, JSON.stringify({ at: new Date().toISOString(), requestId: getGenerationTrace()?.id, model: payload.model, stage: payload.response_format?.json_schema?.name ?? (url.pathname.endsWith("/systemone") ? "jev" : "unknown"), providerId: body?.id, usage: body?.usage, httpStatus: response.status, provider: payload.provider, requestBytes: Buffer.byteLength(init.body), responseFormatHash: createHash("sha256").update(JSON.stringify(payload.response_format ?? null)).digest("hex") }) + "\n", { mode: 0o600 });
  }
  return response;
};
installMatrixTransport(budget, new Map(quotes.map(quote => [quote.id, quote])), {
  allowApplicationRequest: async (url, method, _request, init) => {
    if (url.origin !== allowed.origin) return false;
    assert(/^\/(auth|rest|storage)\/v1\//.test(url.pathname), "automatic_smoke_local_endpoint_invalid");
    if (method === "POST" && url.pathname.includes("/rpc/generation_admit")) {
      const body = JSON.parse(init.body), input = body.p_input;
      assert.equal(body.p_owner, config.actor); assert.equal(String(body.p_revision), config.revision); assert.equal(body.p_experimental, true);
      assert(url.pathname.endsWith("generation_admit_staged_local"), "automatic_smoke_staged_admission_required");
      const expected = automaticSmokeProfile.cases.find(entry => body.p_idempotency_key === `${automaticSmokeProfile.session}-${entry.id}`);
      assert(expected && expected.content === input?.content && expected.postMode === input.postMode && expected.slides === (input.slideCount ?? 1), "automatic_smoke_case_identity_mismatch");
      assert(expected && input.generationModel === "auto" && input.inputType === "text" && input.platform === "instagram" && input.aspectRatio === "4:5" && !input.sources?.length && !input.imageUrl && !input.projectId && !input.projectSnapshot && !input.projectDossier && !input.executionBrief && !input.generationParentRequestId, "automatic_smoke_input_out_of_scope");
      await withBudgetFileLock(config.budgetFile, async () => {
        const state = await readSharedBudget(config.budgetFile);
        state.pilotRequests ??= []; state.smokeCases ??= {};
        assert(!state.smokeCases[expected.id] || state.smokeCases[expected.id] === body.p_id, "automatic_smoke_case_already_admitted");
        if (!state.pilotRequests.includes(body.p_id)) {
          assert(!blocksCampaign(state.interruption, false) && state.calls.length < config.maxCalls && state.calls.reduce((sum, call) => sum + (call.actualUsd ?? call.reservedUsd), 0) < config.maxUsd && state.pilotRequests.length < config.maxAdmissions, "automatic_smoke_budget_exhausted");
          state.pilotRequests.push(body.p_id); state.smokeCases[expected.id] = body.p_id; await writeJson(config.budgetFile, state);
        }
      });
    }
    return true;
  },
  context: async payload => {
    const requestId = getGenerationTrace()?.id;
    assert(requestId && (await readSharedBudget(config.budgetFile)).pilotRequests?.includes(requestId), "automatic_smoke_unadmitted_provider_call");
    if (process.env.POSTSPARK_AUTOMATIC_SMOKE_PROFILE === "focused-v2")
      assert(!JSON.stringify(payload).includes('"cache_control":'), "focused_smoke_cache_writes_not_budgeted");
    if (payload.model !== "typesafe/jev-1.13") {
      const endpoint = payload.model === "anthropic/claude-haiku-5.5" ? "anthropic" : "deepinfra/fp8";
      assert.deepEqual(payload.provider?.only, [endpoint]);
      assert.equal(payload.provider?.allow_fallbacks, false); assert.equal(payload.provider?.require_parameters, true);
      assert.equal(payload.reasoning?.enabled, false); assert.equal(payload.response_format?.type, "json_schema");
    }
    return { operation: `${config.campaign}:${requestId}:${randomUUID()}`, metadata: { phase: config.campaign, generationRequestId: requestId, stage: payload.response_format?.json_schema?.name ?? "jev", payloadHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex") } };
  },
});
globalThis.__acervo82PilotBudget = budget;
