import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import path from "node:path";
import { parse } from "dotenv";
import { createHash } from "node:crypto";
import { readLocalEnvironment, sanitizedEnvironment } from "../environment.mjs";
import { manualTrial, promptTrial, readTrialCatalog } from "../full/promptTrial.mjs";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const base = await readLocalEnvironment(root),
  action = process.argv[2];
if (
  !["stage", "configure", "dev", "test", "review", "smoke", "audit", "journeys", "retrieval", "verify-dev", "aura-stage", "aura-preview", "aura-catalog"].includes(
    action
  )
)
  throw new Error("pilot_action_invalid");
const env = sanitizedEnvironment(base);
const full = process.env.POSTSPARK_ACERVO82_CAMPAIGN === "full";
const requestedFullSession = process.env.POSTSPARK_ACERVO82_FULL_SESSION;
const trial = [promptTrial, manualTrial].find(profile => profile.session === requestedFullSession);
if (requestedFullSession && (!full || !trial)) {
  throw new Error("acervo82_full_session_not_authorized");
}
if (trial === manualTrial && action === "smoke") throw new Error("acervo82_manual_session_requires_studio");
const campaign = trial?.campaign ?? (full ? "acervo82-full" : "acervo82-pilot");
const session = trial?.session ?? (full ? "full-catalog-01" : process.env.POSTSPARK_ACERVO82_PILOT_SESSION ?? "pilot");
const maxUsd = trial?.maxUsd ?? 10;
const maxCalls = trial?.maxCalls ?? (full ? 240 : 120);
const maxAdmissions = trial?.maxAdmissions ?? (full ? 12 : 5);
const artifacts = full ? "artifacts/acervo82/full" : "artifacts/acervo82/pilot";
if (full) env.DESIGN_RETRIEVAL_DIRECTORY ||= ".postspark-local/design-retrieval";
if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(session))
  throw new Error("pilot_session_invalid");
const configFile = path.join(
  root,
  ".acervo82-local",
  full ? `${session}.json` : session === "pilot" ? "pilot.json" : `pilot-${session}.json`
);
env.POSTSPARK_ACERVO82_PILOT_CONFIG = configFile;
if (action === "configure") {
  const { original, stage } = await readTrialCatalog(root, full, trial);
  const all = JSON.parse(
    await readFile(
      path.join(root, artifacts, "model-quotes.json"),
      "utf8"
    )
  );
  const endpoint = JSON.parse(
    await readFile(
      path.join(root, artifacts, "jev-endpoints.json"),
      "utf8"
    )
  ).data.endpoints;
  const ids = [
    "google/gemini-3.8-flash",
    "openai/gpt-5.4-mini",
    "google/gemini-3.1-flash-image",
    "anthropic/claude-haiku-5.5",
    "deepseek/deepseek-v4.1-flash",
    "openai/gpt-6.1-sol",
  ];
  const quotes = ids.map(id => {
    const q = all.find(q => q.id === id);
    if (!q) throw new Error(`model_quote_missing:${id}`);
    return q;
  });
  // Image output tokens are a separate tariff. Use their rate conservatively in
  // the existing transport reservation as well as the provider's actual receipt.
  for (const q of quotes)
    if (q.pricing.image_output)
      q.pricing.image = String(
        Math.max(Number(q.pricing.image ?? 0), Number(q.pricing.image_output))
      );
  quotes.push({
    id: "typesafe/jev-1.13",
    context_length: Math.max(...endpoint.map(e => e.context_length)),
    pricing: {
      prompt: String(Math.max(...endpoint.map(e => Number(e.pricing.prompt)))),
      completion: "0",
    },
  });
  const hash = x =>
    createHash("sha256").update(JSON.stringify(x)).digest("hex");
  const casesHash = trial === promptTrial ? hash(JSON.parse(await readFile(path.join(root, trial.casesFile), "utf8"))) : null;
  const scope = {revision:original.revision,identity:original.identity,
    ...(trial === promptTrial ? {casesHash} : {}),
    ...(trial === manualTrial ? {session: manualTrial.session} : {})};
  const budgetFile = path.join(
    root,
    artifacts,
    ...(session === "pilot" ? [] : ["sessions", session]),
    "budget.json"
  );
  await mkdir(path.dirname(budgetFile), { recursive: true, mode: 0o700 });
  try {
    await readFile(budgetFile);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    await writeFile(
      budgetFile,
      JSON.stringify(
        {
          version: 1,
          proposed: true,
          effectiveAuthorizedLimits: { usd: maxUsd, calls: maxCalls },
          maxUsd,
          maxCalls,
          origin: {
            directory: path.dirname(budgetFile),
            manifestHash: hash(full ? scope : {}),
            ledgerHash: hash([]),
            inheritedCount: 0,
            inheritedCallsHash: hash([]),
          },
          quotes,
          quotesHash: hash(quotes),
          campaigns: { [campaign]: { kind: "matrix", maxExecutions: maxAdmissions } },
          journeys: [],
          calls: [],
          pilotRequests: [],
        },
        null,
        2
      )
    );
  }
  const { withBudgetFileLock, readSharedBudget } = await import(
    "../../../server/benchmarks/generationMatrix/sharedBudget.ts"
  );
  const { writeJson } = await import("../../../server/benchmarks/generationMatrix/journal.ts");
  await withBudgetFileLock(budgetFile, async () => {
    const state = await readSharedBudget(budgetFile);
    const sessionCampaign = state.campaigns[campaign];
    const extendManual = trial === manualTrial &&
      sessionCampaign?.maxExecutions === manualTrial.previousMaxAdmissions;
    if (trial && (state.maxUsd !== maxUsd || state.maxCalls !== maxCalls ||
      (sessionCampaign?.maxExecutions !== maxAdmissions && !extendManual) ||
      state.origin.manifestHash !== hash(scope))) {
      throw new Error("acervo82_trial_scope_changed");
    }
    if (extendManual) {
      sessionCampaign.maxExecutions = maxAdmissions;
      state.manualExtension = {
        reason: "User requested more local Studio tests after the initial admissions were used.",
        from: manualTrial.previousMaxAdmissions,
        to: maxAdmissions,
      };
      await writeJson(budgetFile, state);
    }
    // A session with no admissions or provider effects can refresh its public
    // quotes. Used sessions keep their prices and every historical receipt.
    if (
      session !== "pilot" &&
      !state.calls.length &&
      !(state.pilotRequests ?? []).length
    ) {
      state.quotes = quotes;
      state.quotesHash = hash(quotes);
      await writeFile(budgetFile, JSON.stringify(state, null, 2));
    }
    if (!full && state.campaigns["acervo82-pilot"].maxExecutions === 4) {
      state.campaigns["acervo82-pilot"].maxExecutions = 5;
      state.pilotExtension = {
        reason:
          "One corrective repetition of the mandatory-photo case; user-authorized paid pilot, unchanged USD/call ceilings.",
        from: 4,
        to: 5,
      };
      await writeFile(budgetFile, JSON.stringify(state, null, 2));
    }
  });
  const { localPipelineFingerprint } = await import(
    "../../../server/benchmarks/generationMatrix/localPipelineFingerprint.ts"
  );
  if (full && stage.sources !== 82) throw new Error("full_catalog_required");
  const rendererPath = "dist/review-renderer/renderer.js";
  await writeFile(
    configFile,
    JSON.stringify(
      {
        authorization: trial?.authorization ?? (full ? "user-authorized-acervo82-full" : "user-authorized-acervo82-pilot"),
        campaign, maxAdmissions,
        ...(trial === promptTrial ? { casesHash } : {}),
        ...(full ? {identity:stage.identity,indexHash:stage.indexHash} : {}),
        session,
        actor: stage.actor,
        revision: stage.revision,
        supabaseUrl: base.SUPABASE_URL,
        budgetFile,
        maxUsd,
        maxCalls,
        rendererPath,
        pipelineHash: await localPipelineFingerprint(rendererPath),
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  console.log(
    JSON.stringify({
      configured: true,
      session,
      localOnly: true,
      revision: stage.revision,
      maxUsd,
      maxCalls,
      maxAdmissions,
    })
  );
  process.exit(0);
}
const programs = {
  stage: [full ? "scripts/acervo82/full/stage.ts" : "scripts/acervo82/pilot/stage.ts"],
  journeys: ["scripts/acervo82/full/journeys.ts"],
  retrieval: ["scripts/acervo82/full/retrieval.ts"],
  "verify-dev": ["server/_core/index.ts"],
  "aura-stage": ["scripts/acervo82/full/auraPilot.ts"],
  "aura-catalog": ["scripts/acervo82/full/auraCatalog.ts"],
  "aura-preview": ["server/_core/index.ts"],
  dev: ["server/_core/index.ts"],
  test: ["scripts/acervo82/pilot/test.ts"],
  review: ["scripts/acervo82/pilot/review.ts"],
  smoke: [full ? "scripts/acervo82/full/live.ts" : "scripts/acervo82/pilot/smoke.ts"],
  audit: ["scripts/inspectGenerationRun.ts"],
};
if (action === "dev" || action === "review") {
  const keyFile = process.argv[3];
  if (!keyFile) throw new Error("provide_existing_credentials_file_path");
  const source = parse(await readFile(keyFile, "utf8"));
  if (!source.OPENROUTER_API_KEY) throw new Error("openrouter_key_missing");
  env.OPENROUTER_API_KEY = source.OPENROUTER_API_KEY;
  env.NODE_OPTIONS = `--import=tsx --import=${pathToFileURL(path.join(root, "scripts/acervo82/pilot/preload.mjs")).href}`;
}
if (action === "verify-dev" || action === "aura-preview") {
  if (!full) throw new Error("full_campaign_required");
  const staged=JSON.parse(await readFile(path.join(root,artifacts,"staged.json"),"utf8"));
  Object.assign(env,{GENERATION_ADMISSION_PAUSED:"true",GENERATION_LOCAL_DEMAND_ENABLED:"true",GENERATION_LOCAL_CATALOG_REVISION:staged.revision});
  if (action === "aura-preview") {
    if (env.PORT === "3183") throw new Error("aura_preview_port_conflict");
    Object.assign(env, {PORT:"3183", POSTSPARK_AURA_PREVIEW:"true"});
  }
}
if (action === "dev") {
  const config = JSON.parse(await readFile(configFile, "utf8"));
  Object.assign(env, {
    GENERATION_ADMISSION_PAUSED: "false",
    GENERATION_LOCAL_DEMAND_ENABLED: "true",
    GENERATION_LOCAL_CATALOG_REVISION: config.revision,
    ...(trial ? { POSTSPARK_ACERVO82_SERIAL_PROPOSALS: "true" } : {}),
    OPENROUTER_STATIC_MODEL: "google/gemini-3.8-flash",
    OPENROUTER_CAROUSEL_MODEL: "google/gemini-3.8-flash",
    OPENROUTER_VISION_MODEL: "google/gemini-3.8-flash",
    OPENROUTER_PROPOSAL_REVIEW_MODEL: "google/gemini-3.8-flash",
    OPENROUTER_BRIEF_INTERPRETATION_MODEL: "google/gemini-3.8-flash",
    OPENROUTER_QUALITY_REVISION_MODEL: "google/gemini-3.8-flash",
    OPENROUTER_CONTENT_STRATEGY_MODEL: "google/gemini-3.8-flash",
    OPENROUTER_EVALUATION_MODEL: "google/gemini-3.8-flash",
    LLM_TRANSIENT_RETRIES: "0",
  });
}
const child = spawn(
  process.execPath,
  [
    "--import",
    "tsx",
    ...programs[action],
    ...(["test", "stage", "smoke", "audit", "journeys", "retrieval", "aura-stage"].includes(action)
      ? process.argv.slice(3)
      : []),
  ],
  { cwd: root, env, stdio: "inherit" }
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.once("error", e => {
  console.error(e.message);
  process.exitCode = 1;
});
child.once("exit", code => (process.exitCode = code ?? 1));
