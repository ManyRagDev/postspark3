/** Isolated automatic-policy smoke. Dry-run never starts a provider or admission. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "dotenv";
import { readLocalEnvironment, sanitizedEnvironment } from "../environment.mjs";
import { reserveQuote } from "../../../server/benchmarks/generationMatrix/budget.ts";
import { withBudgetFileLock } from "../../../server/benchmarks/generationMatrix/sharedBudget.ts";
import { writeJson } from "../../../server/benchmarks/generationMatrix/journal.ts";
import { localPipelineFingerprint } from "../../../server/benchmarks/generationMatrix/localPipelineFingerprint.ts";

const originalSmokeProfile = Object.freeze({
  session: "automatic-stack-20261106", campaign: "acervo82-automatic-stack",
  authorization: "user-authorized-automatic-stack-smoke", maxUsd: 0.50, maxCalls: 32, maxAdmissions: 2,
  cases: [
    { id: "static", postMode: "static", slides: 1, content: "Crie um post estático para a cafeteria Lume, que serve café artesanal e abre de segunda a sexta, das 8h às 18h. Convide a conhecer o espaço. Use apenas tipografia e formas, sem fotografias nem geração de imagens. Não invente preços ou promoções." },
    { id: "carousel", postMode: "carousel", slides: 3, content: "Crie um carrossel de exatamente 3 slides com sugestões para organizar uma leitura diária: no primeiro, um convite; no segundo, escolher um horário e deixar o livro à mão; no terceiro, começar com alguns minutos e retomar no dia seguinte. Use apenas tipografia e formas, sem fotografias nem geração de imagens. Evite promessas de resultado garantido." },
  ],
});
const previousSmokeProfile = Object.freeze({ ...originalSmokeProfile, maxAdmissions: 3, cases: [...originalSmokeProfile.cases, { ...originalSmokeProfile.cases[0], id: "static-v2" }] });
const thirdSmokeProfile = Object.freeze({ ...previousSmokeProfile, maxAdmissions: 4, cases: [...previousSmokeProfile.cases, { ...originalSmokeProfile.cases[0], id: "static-v3" }] });
const legacySmokeProfile = Object.freeze({ ...thirdSmokeProfile, maxCalls: 56, maxAdmissions: 6, cases: [...thirdSmokeProfile.cases, { ...originalSmokeProfile.cases[0], id: "static-v4" }, { ...originalSmokeProfile.cases[1], id: "carousel-v2" }] });
const focusedSmokeProfile = Object.freeze({ ...originalSmokeProfile,
  session: "automatic-focused-20261106", campaign: "acervo82-automatic-focused",
  authorization: "user-authorized-focused-automatic-smoke", maxUsd: 0.60, maxCalls: 24, maxAdmissions: 2,
});
export const smokeProfileSelector = process.env.POSTSPARK_AUTOMATIC_SMOKE_PROFILE ?? "legacy";
assert(["legacy", "focused-v2"].includes(smokeProfileSelector), "unknown_automatic_smoke_profile_selector");
export const automaticSmokeProfile = smokeProfileSelector === "focused-v2" ? focusedSmokeProfile : legacySmokeProfile;
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const smokeHash = hash(automaticSmokeProfile);
// Only this known earlier authorization may be amended, retaining every receipt.
export const previousSmokeHash = "1e52935dcd0b648d4d89607cc6680da4c531e0937620fe1979de007bf5dc1047";
assert.equal(hash(originalSmokeProfile), previousSmokeHash);
const knownProfiles = new Map([originalSmokeProfile, previousSmokeProfile, thirdSmokeProfile, legacySmokeProfile, focusedSmokeProfile].map(profile => [hash(profile), profile]));
export function assertAutomaticSmokeBudgetProfile(state, expectedHash = smokeHash) {
  const expected = knownProfiles.get(expectedHash);
  assert(expected, "unknown_expected_automatic_smoke_profile");
  if (expected === focusedSmokeProfile) {
    assert.equal(state.maxUsd, expected.maxUsd); assert.equal(state.maxCalls, expected.maxCalls);
    assert.deepEqual(state.effectiveAuthorizedLimits, { usd: expected.maxUsd, calls: expected.maxCalls });
    assert.equal(state.origin.manifestHash, expectedHash, "focused_smoke_must_have_independent_origin");
    assert.equal(state.smokeProfileHash, expectedHash);
    assert.equal((state.smokeAmendments ?? []).length, 0, "focused_smoke_amendments_not_authorized");
    assert.equal(state.origin.inheritedCount, 0, "focused_smoke_must_not_inherit_another_campaign");
    assert.equal(state.origin.inheritedCallsHash, hash([]));
    assert.equal(state.campaigns[expected.campaign]?.maxExecutions, expected.maxAdmissions);
    return;
  }
  assert.equal(state.maxUsd, 0.5); assert.equal(state.maxCalls, expected.maxCalls);
  assert.deepEqual(state.effectiveAuthorizedLimits, {usd:0.5,calls:expected.maxCalls});
  let active=state.origin.manifestHash;
  assert(knownProfiles.has(active) && active !== hash(focusedSmokeProfile), "unknown_automatic_smoke_origin");
  for (const amendment of state.smokeAmendments ?? []) {
    assert.equal(amendment.oldProfileHash,active,"automatic_smoke_amendment_chain");
    assert(knownProfiles.has(amendment.newProfileHash) && amendment.newProfileHash !== hash(focusedSmokeProfile),"unknown_automatic_smoke_amendment");
    assert.equal(hash(amendment.oldProfile),active); assert.equal(hash(amendment.newProfile),amendment.newProfileHash);
    assert.equal(amendment.maxUsd,.5); assert.equal(amendment.maxCalls,knownProfiles.get(amendment.newProfileHash).maxCalls);
    assert(Number.isInteger(amendment.priorCallCount)&&amendment.priorCallCount>=0&&amendment.priorCallCount<=state.calls.length);
    assert.equal(hash(state.calls.slice(0,amendment.priorCallCount)),amendment.priorCallsHash,"automatic_smoke_original_receipts_changed");
    active=amendment.newProfileHash;
  }
  assert.equal(active,expectedHash); assert.equal(state.smokeProfileHash??state.origin.manifestHash,expectedHash);
  assert.equal(state.campaigns[expected.campaign].maxExecutions,expected.maxAdmissions);
}
export function amendAutomaticSmokeBudget(state, at = new Date().toISOString()) {
  if (automaticSmokeProfile === focusedSmokeProfile) {
    // Resuming the same campaign retains its calls, reservations and stop state.
    assertAutomaticSmokeBudgetProfile(state);
    return state;
  }
  assert.equal(state.maxUsd,.5);
  const active=state.smokeProfileHash??state.origin.manifestHash;
  if(active===smokeHash){assertAutomaticSmokeBudgetProfile(state);return state;}
  const oldProfile=knownProfiles.get(active);
  assert(oldProfile && oldProfile.maxAdmissions < automaticSmokeProfile.maxAdmissions,"unknown_automatic_smoke_profile_cannot_be_amended");
  assertAutomaticSmokeBudgetProfile(state,active);
  assert(state.calls.every(call=>call.status==="completed"),"cannot_amend_pending_provider_effects");
  const next=structuredClone(state);
  next.smokeAmendments=[...(next.smokeAmendments??[]),{version:1,at,oldProfileHash:active,newProfileHash:smokeHash,oldProfile,newProfile:automaticSmokeProfile,
    reason:"Two final local admissions (static-v4 and carousel-v2) verify real-provider native schema corrections. Increase only the internal call-count ceiling from 32 to 56; retain the USD 0.50 total ceiling, every failed request, receipt and cost. Covered by the user request for complete implementation and tests.",
    maxUsd:state.maxUsd,maxCalls:automaticSmokeProfile.maxCalls,priorMaxCalls:state.maxCalls,priorCallsHash:hash(state.calls),priorCallCount:state.calls.length,
    priorCommittedUsd:state.calls.reduce((sum,call)=>sum+(call.actualUsd??call.reservedUsd),0),priorAdmissions:[...(state.pilotRequests??[])]}];
  next.maxCalls=automaticSmokeProfile.maxCalls;next.effectiveAuthorizedLimits={usd:automaticSmokeProfile.maxUsd,calls:automaticSmokeProfile.maxCalls};
  next.smokeProfileHash=smokeHash;next.campaigns[automaticSmokeProfile.campaign].maxExecutions=automaticSmokeProfile.maxAdmissions;
  assertAutomaticSmokeBudgetProfile(next);return next;
}
export const configPath = `.acervo82-local/${automaticSmokeProfile.session}.json`;
const output = `artifacts/acervo82/full/sessions/${automaticSmokeProfile.session}`;
const json = async file => JSON.parse(await readFile(file, "utf8"));
async function quotesForSmoke() {
  const focused = smokeProfileSelector === "focused-v2";
  const models = await json(focused
    ? "artifacts/acervo82/full/focused-price-check-20261106.json"
    : "artifacts/acervo82/model-routing-20261106/endpoints.json");
  const routes = [{ id: "anthropic/claude-haiku-5.5", tag: "anthropic", prompt: 0.101, completion: 0.505 }, { id: "deepseek/deepseek-v4.1-flash", tag: "deepinfra/fp8", prompt: 0.1414, completion: 0.4242 }];
  const quotes = routes.map(route => {
    const model = models.find(model => model.id === route.id);
    const endpoint = model?.data?.endpoints.find(endpoint => endpoint.tag === route.tag);
    assert(endpoint, `missing_captured_endpoint:${route.id}:${route.tag}`);
    assert(Number(endpoint.pricing.prompt) * 1e6 <= route.prompt && Number(endpoint.pricing.completion) * 1e6 <= route.completion, "captured_endpoint_exceeds_policy_price");
    if (focused) {
      // Reserve the most expensive uncached tier even for visual review. The
      // transport retains the lower task-routing max_price independently; this
      // quote never authorizes broader routing. Explicit caching is forbidden
      // by the focused preload because its write tariff can exceed these rates.
      const tiers = [endpoint.pricing, ...(endpoint.pricing.overrides ?? [])];
      const worst = key => {
        const values = tiers.map(tier => Number(tier[key] ?? endpoint.pricing[key]));
        assert(values.every(value => Number.isFinite(value) && value >= 0), `invalid_captured_tier:${key}`);
        return Math.max(...values);
      };
      return { id: route.id, context_length: endpoint.context_length, pricing: { prompt: String(worst("prompt")), completion: String(worst("completion")) } };
    }
    // Historical acceptance ceilings remain byte-for-byte stable for replay.
    return { id: route.id, context_length: endpoint.context_length, pricing: { prompt: String(route.prompt / 1e6), completion: String(route.completion / 1e6) } };
  });
  const endpoints = focused ? models.find(model => model.id === "typesafe/jev-1.13").data.endpoints : (await json("artifacts/acervo82/full/jev-endpoints.json")).data.endpoints;
  quotes.push({ id: "typesafe/jev-1.13", context_length: Math.max(...endpoints.map(e => e.context_length)), pricing: { prompt: String(Math.max(...endpoints.map(e => Number(e.pricing.prompt)))), completion: "0" } });
  return quotes;
}
async function main() {
  const action = process.argv[2] ?? "dry-run";
  assert(["dry-run", "configure", "dev", "run", "browser"].includes(action), "automatic_smoke_action_invalid");
  const base = await readLocalEnvironment(process.cwd());
  // Dedicated port preserves any existing local review server.
  base.PORT = smokeProfileSelector === "focused-v2" ? "3186" : "3185";
  const stage = await json("artifacts/acervo82/full/staged.json");
  assert.equal(stage.sources, 82);
  const quotes = await quotesForSmoke();
  const haiku = quotes.find(q => q.id === "anthropic/claude-haiku-5.5");
  const reviewReservation = reserveQuote({ model: haiku.id, max_tokens: 9216, messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,planning-only" } }] }] }, haiku).usd;
  const dryRun = { version: 1, paidCalls: 0, profile: automaticSmokeProfile, profileHash: smokeHash,
    app: `http://127.0.0.1:${base.PORT}`, catalogRevision: stage.revision,
    reviewReservation: { basis: smokeProfileSelector === "focused-v2" ? "full captured endpoint context at worst uncached captured tier + 9216 output tokens + 6% reserve; original task max_price remains pinned" : "full captured endpoint context at pinned acceptance price + 9216 output tokens + 6% reserve", context: haiku.context_length, perCallUsd: reviewReservation, threeConcurrentUsd: reviewReservation * 3, sixReviewsWorstCaseUsd: reviewReservation * 6, requiresActualCostSettlementBetweenRequests: reviewReservation * 6 > automaticSmokeProfile.maxUsd },
    limitations: ["Six reviews at worst-case context cannot all fit the total cap. Actual receipts release unused reservation; the guard stops before dispatch whenever the remaining cap is insufficient.", "Writing, interpretation, JEV and any recovery reserve their actual payload bounds at dispatch. No bypass, fabricated approval or smaller image reserve."], configPath, output };
  if (action === "dry-run") { console.log(JSON.stringify(dryRun, null, 2)); return; }
  if (action === "configure") {
    const account = await json(".acervo82-local/test-account.json");
    assert.equal(account.supabaseUrl, base.SUPABASE_URL); assert.equal(account.id, stage.actor);
    await mkdir(output, { recursive: true, mode: 0o700 });
    const budgetFile = path.resolve(output, "budget.json");
    await withBudgetFileLock(budgetFile, async () => {
      let old; try { old = await json(budgetFile); } catch (e) { if (e.code !== "ENOENT") throw e; }
      if (old) {
        assert.equal(old.quotesHash, hash(quotes), "smoke_amendment_must_preserve_existing_quotes");
        await writeJson(budgetFile, amendAutomaticSmokeBudget(old));
      } else {
        await writeFile(budgetFile, JSON.stringify({ version: 1, proposed: true, maxUsd: automaticSmokeProfile.maxUsd, maxCalls: automaticSmokeProfile.maxCalls, effectiveAuthorizedLimits: { usd: automaticSmokeProfile.maxUsd, calls: automaticSmokeProfile.maxCalls }, origin: { directory: path.resolve(output), manifestHash: smokeHash, ledgerHash: hash([]), inheritedCount: 0, inheritedCallsHash: hash([]) }, smokeProfileHash: smokeHash, quotes, quotesHash: hash(quotes), campaigns: { [automaticSmokeProfile.campaign]: { kind: "matrix", maxExecutions: automaticSmokeProfile.maxAdmissions } }, journeys: [], calls: [], pilotRequests: [] }, null, 2), { flag: "wx", mode: 0o600 });
      }
    });
    const rendererPath = smokeProfileSelector === "focused-v2" ? path.join(output, "renderer.js") : "dist/review-renderer/renderer.js";
    const config = { ...automaticSmokeProfile, profileHash: smokeHash, actor: account.id, supabaseUrl: base.SUPABASE_URL, revision: stage.revision, identity: stage.identity, indexHash: stage.indexHash, budgetFile, rendererPath, pipelineHash: await localPipelineFingerprint(rendererPath) };
    await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
    await writeFile(path.join(output, "dry-run.json"), JSON.stringify(dryRun, null, 2));
    console.log(JSON.stringify({ configured: true, paidCalls: 0, configPath, maxUsd: config.maxUsd })); return;
  }
  const config = await json(configPath); assert.equal(config.profileHash, smokeHash);
  const env = sanitizedEnvironment(base);
  Object.assign(env, { POSTSPARK_AUTOMATIC_SMOKE_PROFILE: smokeProfileSelector, POSTSPARK_ACERVO82_PILOT_CONFIG: path.resolve(configPath), DESIGN_RETRIEVAL_DIRECTORY: ".postspark-local/design-retrieval" });
  if (smokeProfileSelector === "focused-v2") env.REVIEW_RENDERER_BUNDLE = config.rendererPath;
  if (action === "dev") {
    const keyFile = process.argv[3]; assert(keyFile, "provide_existing_credentials_file_path");
    const keys = parse(await readFile(keyFile, "utf8")); assert(keys.OPENROUTER_API_KEY, "openrouter_key_missing");
    Object.assign(env, { OPENROUTER_API_KEY: keys.OPENROUTER_API_KEY, GENERATION_ADMISSION_PAUSED: "false", GENERATION_LOCAL_DEMAND_ENABLED: "true", GENERATION_LOCAL_CATALOG_REVISION: config.revision, POSTSPARK_ACERVO82_SERIAL_PROPOSALS: "true", LLM_TRANSIENT_RETRIES: "0", NODE_OPTIONS: `--import=tsx --import=${pathToFileURL(path.resolve("scripts/acervo82/full/automaticSmokePreload.mjs")).href}` });
  }
  const program = action === "dev" ? "server/_core/index.ts" : action === "browser" ? "scripts/acervo82/full/automaticSmokeBrowser.ts" : "scripts/acervo82/full/automaticSmokeRun.ts";
  const child = spawn(process.execPath, ["--import", "tsx", program, ...(action === "dev" ? [] : process.argv.slice(3))], { cwd: process.cwd(), env, stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.once("exit", code => { process.exitCode = code ?? 1; });
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
