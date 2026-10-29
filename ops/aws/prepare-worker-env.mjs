#!/usr/bin/env node
// Extract only worker settings from an existing private environment file.
import { readFile, mkdir, writeFile, chmod } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parse } from "dotenv";

const source = process.argv[2];
const destination = process.argv[3];
if (!source || !destination) throw new Error("Usage: node ops/aws/prepare-worker-env.mjs SOURCE.env PRIVATE_DESTINATION.env");
const input = parse(await readFile(source));
const allowed = [
  "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENROUTER_API_KEY", "OPENROUTER_RECONCILIATION_KEY",
  "GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_DESIGN_SELECTION_MODEL", "OPENROUTER_SITE_URL", "OPENROUTER_APP_NAME",
  "OPENROUTER_TEXT_MODEL", "OPENROUTER_STATIC_MODEL", "OPENROUTER_CAROUSEL_MODEL", "OPENROUTER_QUALITY_REVISION_MODEL",
  "OPENROUTER_CONTENT_STRATEGY_MODEL", "OPENROUTER_BRIEF_INTERPRETATION_MODEL", "OPENROUTER_EVALUATION_MODEL",
  "OPENROUTER_VISION_MODEL", "OPENROUTER_PROPOSAL_REVIEW_MODEL", "OPENROUTER_DESIGN_ANALYSIS_MODEL",
  "OPENROUTER_DESIGN_RECREATION_MODEL", "OPENROUTER_IMAGE_MODEL", "OPENROUTER_V5_IMAGE_MODEL", "OPENROUTER_PLATFORM_FEE_PERCENT",
  "SCREENSHOT_SERVICE_URL", "SCREENSHOT_SERVICE_TOKEN", "SCREENSHOT_PUBLIC_NETWORK_ONLY", "DESIGN_ARSENAL_V2_MODE", "COMPONENT_ARSENAL_MODE",
  "AI_SITE_INTELLIGENCE_ENABLED", "AI_LLM_JUDGE_ENABLED", "AI_SEMANTIC_EMBEDDINGS_ENABLED", "AI_TRACE_STORE_CONTENT",
  "AI_MODEL_FALLBACK_ENABLED", "LLM_INPUT_COST_PER_MILLION", "LLM_OUTPUT_COST_PER_MILLION", "LLM_TRANSIENT_RETRIES",
  "LLM_RETRY_BASE_DELAY_MS", "LLM_REQUEST_TIMEOUT_MS", "PROPOSAL_REVIEW_TIMEOUT_MS",
];
const selected = Object.fromEntries(allowed.filter(key => input[key]).map(key => [key, input[key]]));
for (const required of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENROUTER_API_KEY"])
  if (!selected[required]) throw new Error(`Missing required setting: ${required}`);
Object.assign(selected, { NODE_ENV: "production", GENERATION_WORKER_MODE: "external", GENERATION_LOCAL_DEMAND_ENABLED: "false" });
const target = resolve(destination);
if (target === resolve(source)) throw new Error("Never overwrite the source environment");
await mkdir(dirname(target), { recursive: true, mode: 0o700 });
await writeFile(target, Object.entries(selected).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { mode: 0o600 });
await chmod(target, 0o600);
console.log(JSON.stringify({ destination: target, includedKeys: Object.keys(selected), secretValuesPrinted: false }));
