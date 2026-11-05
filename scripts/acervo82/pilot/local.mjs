import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import path from "node:path";
import { parse } from "dotenv";
import { createHash } from "node:crypto";
import { readLocalEnvironment, sanitizedEnvironment } from "../environment.mjs";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const base = await readLocalEnvironment(root),
  action = process.argv[2];
if (!["stage", "configure", "dev", "test", "review"].includes(action))
  throw new Error("pilot_action_invalid");
const env = sanitizedEnvironment(base);
const configFile = path.join(root, ".acervo82-local/pilot.json");
if (action === "configure") {
  const stage = JSON.parse(
    await readFile(
      path.join(root, "artifacts/acervo82/pilot/staged.json"),
      "utf8"
    )
  );
  const all = JSON.parse(
    await readFile(
      path.join(root, "artifacts/acervo82/pilot/model-quotes.json"),
      "utf8"
    )
  );
  const endpoint = JSON.parse(
    await readFile(
      path.join(root, "artifacts/acervo82/pilot/jev-endpoints.json"),
      "utf8"
    )
  ).data.endpoints;
  const ids = [
    "google/gemini-3.8-flash",
    "openai/gpt-5.4-mini",
    "google/gemini-3.1-flash-image",
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
  const budgetFile = path.join(root, "artifacts/acervo82/pilot/budget.json");
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
          effectiveAuthorizedLimits: { usd: 10, calls: 120 },
          maxUsd: 10,
          maxCalls: 120,
          origin: {
            directory: path.dirname(budgetFile),
            manifestHash: hash({}),
            ledgerHash: hash([]),
            inheritedCount: 0,
            inheritedCallsHash: hash([]),
          },
          quotes,
          quotesHash: hash(quotes),
          campaigns: { "acervo82-pilot": { kind: "matrix", maxExecutions: 5 } },
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
  await withBudgetFileLock(budgetFile, async () => {
    const state = await readSharedBudget(budgetFile);
    if (state.campaigns["acervo82-pilot"].maxExecutions === 4) {
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
  const rendererPath = "dist/review-renderer/renderer.js";
  await writeFile(
    configFile,
    JSON.stringify(
      {
        authorization: "user-authorized-acervo82-pilot",
        actor: stage.actor,
        revision: stage.revision,
        supabaseUrl: base.SUPABASE_URL,
        budgetFile,
        maxUsd: 10,
        maxCalls: 120,
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
      localOnly: true,
      revision: stage.revision,
      maxUsd: 10,
      maxCalls: 120,
    })
  );
  process.exit(0);
}
const programs = {
  stage: ["scripts/acervo82/pilot/stage.ts"],
  dev: ["server/_core/index.ts"],
  test: ["scripts/acervo82/pilot/test.ts"],
  review: ["scripts/acervo82/pilot/review.ts"],
};
if (action === "dev" || action === "review") {
  const keyFile = process.argv[3];
  if (!keyFile) throw new Error("provide_existing_credentials_file_path");
  const source = parse(await readFile(keyFile, "utf8"));
  if (!source.OPENROUTER_API_KEY) throw new Error("openrouter_key_missing");
  env.OPENROUTER_API_KEY = source.OPENROUTER_API_KEY;
  env.POSTSPARK_ACERVO82_PILOT_CONFIG = configFile;
  env.NODE_OPTIONS = `--import=tsx --import=${pathToFileURL(path.join(root, "scripts/acervo82/pilot/preload.mjs")).href}`;
}
if (action === "dev") {
  const config = JSON.parse(await readFile(configFile, "utf8"));
  Object.assign(env, {
    GENERATION_ADMISSION_PAUSED: "false",
    GENERATION_LOCAL_DEMAND_ENABLED: "true",
    GENERATION_LOCAL_CATALOG_REVISION: config.revision,
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
    ...(["test", "stage"].includes(action) ? process.argv.slice(3) : []),
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
