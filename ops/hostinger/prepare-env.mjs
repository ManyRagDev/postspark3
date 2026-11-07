#!/usr/bin/env node
import { readFile, mkdir, writeFile, chmod } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parse } from "dotenv";

const source = process.argv[2] || ".env";
const outDir = process.argv[3] || "/tmp/postspark-hostinger-env";
const input = parse(await readFile(source));

const allowedWorker = [
  "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENROUTER_API_KEY", "OPENROUTER_RECONCILIATION_KEY",
  "GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_DESIGN_SELECTION_MODEL", "OPENROUTER_SITE_URL", "OPENROUTER_APP_NAME",
  "OPENROUTER_TEXT_MODEL", "OPENROUTER_STATIC_MODEL", "OPENROUTER_CAROUSEL_MODEL", "OPENROUTER_CLAUDE_MODEL", "OPENROUTER_DEEPSEEK_MODEL", "OPENROUTER_QUALITY_REVISION_MODEL",
  "OPENROUTER_CONTENT_STRATEGY_MODEL", "OPENROUTER_BRIEF_INTERPRETATION_MODEL", "OPENROUTER_EVALUATION_MODEL",
  "OPENROUTER_VISION_MODEL", "OPENROUTER_PROPOSAL_REVIEW_MODEL", "OPENROUTER_DESIGN_ANALYSIS_MODEL",
  "OPENROUTER_DESIGN_RECREATION_MODEL", "OPENROUTER_IMAGE_MODEL", "OPENROUTER_V5_IMAGE_MODEL", "OPENROUTER_PLATFORM_FEE_PERCENT",
  "SCREENSHOT_SERVICE_TOKEN", "SCREENSHOT_PUBLIC_NETWORK_ONLY", "DESIGN_ARSENAL_V2_MODE", "COMPONENT_ARSENAL_MODE",
  "AI_SITE_INTELLIGENCE_ENABLED", "AI_LLM_JUDGE_ENABLED", "AI_SEMANTIC_EMBEDDINGS_ENABLED", "AI_TRACE_STORE_CONTENT",
  "AI_MODEL_FALLBACK_ENABLED", "LLM_INPUT_COST_PER_MILLION", "LLM_OUTPUT_COST_PER_MILLION", "LLM_TRANSIENT_RETRIES",
  "LLM_RETRY_BASE_DELAY_MS", "LLM_REQUEST_TIMEOUT_MS", "PROPOSAL_REVIEW_TIMEOUT_MS", "GENERATION_STRATEGY_VERSION",
];

const selectedWorker = Object.fromEntries(allowedWorker.filter(key => input[key]).map(key => [key, input[key]]));
for (const required of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENROUTER_API_KEY"]) {
  if (!selectedWorker[required]) throw new Error(`Missing required setting: ${required}`);
}

Object.assign(selectedWorker, {
  NODE_ENV: "production",
  GENERATION_WORKER_MODE: "external",
  GENERATION_LOCAL_DEMAND_ENABLED: "false",
  REVIEW_CHROMIUM_EXECUTABLE_PATH: "/usr/bin/chromium",
  POSTSPARK_API_WITHOUT_LOCAL_EMBEDDINGS: "0",
  DESIGN_RETRIEVAL_DIRECTORY: "/app/.postspark-local/design-retrieval",
  SCREENSHOT_SERVICE_URL: "http://capture:3000",
  SCREENSHOT_PUBLIC_NETWORK_ONLY: "true",
});

const selectedCapture = {
  NODE_ENV: "production",
  PORT: "3000",
  CAPTURE_CHROMIUM_EXECUTABLE_PATH: "/usr/bin/chromium",
  SCREENSHOT_SERVICE_TOKEN: input.SCREENSHOT_SERVICE_TOKEN || "",
};

await mkdir(outDir, { recursive: true, mode: 0o700 });

const workerFile = resolve(outDir, "worker.env");
await writeFile(workerFile, Object.entries(selectedWorker).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join("\n") + "\n", { mode: 0o600 });
await chmod(workerFile, 0o600);

const captureFile = resolve(outDir, "capture.env");
await writeFile(captureFile, Object.entries(selectedCapture).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join("\n") + "\n", { mode: 0o600 });
await chmod(captureFile, 0o600);

console.log(JSON.stringify({
  outDir,
  workerKeys: Object.keys(selectedWorker).length,
  captureKeys: Object.keys(selectedCapture).length
}));
