// Configuration owns its bootstrap so every server entry point and transitive
// consumer sees the same values, regardless of the importing route's order.
import "dotenv/config";
import { readArsenalMode } from "../designCatalog/arsenalMode";
const envFlag = (name: string, defaultValue: boolean): boolean => {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

const envInteger = (
  name: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number => {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(maximum, Math.max(minimum, parsed));
};

const isProduction = process.env.NODE_ENV === "production";

export const ENV = {
  generationAdmissionPaused: envFlag("GENERATION_ADMISSION_PAUSED", false),
  generationWorkerMode: process.env.NODE_ENV === "development" && !process.env.VERCEL && process.env.GENERATION_WORKER_MODE !== "external" ? "local-demand" as const : "external" as const,
  localDemandEnabled: !isProduction && !process.env.VERCEL && process.env.GENERATION_WORKER_MODE !== "external" && process.env.GENERATION_LOCAL_DEMAND_ENABLED === "true",
  reviewRendererBundle: process.env.REVIEW_RENDERER_BUNDLE ?? "dist/review-renderer/renderer.js",
  reviewChromiumExecutablePath: process.env.REVIEW_CHROMIUM_EXECUTABLE_PATH ?? "",
  designArsenalV2Mode: readArsenalMode(),
  componentArsenalMode: readArsenalMode(process.env.COMPONENT_ARSENAL_MODE ?? "admin"),
  isProduction,
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  openRouterReconciliationKey: process.env.OPENROUTER_RECONCILIATION_KEY ?? "",
  openRouterDesignSelectionModel: process.env.OPENROUTER_DESIGN_SELECTION_MODEL ?? "typesafe/jev-1.13",
  openRouterSiteUrl: process.env.OPENROUTER_SITE_URL ?? "https://postspark.app",
  openRouterAppName: process.env.OPENROUTER_APP_NAME ?? "PostSpark",
  openRouterTextModel: process.env.OPENROUTER_TEXT_MODEL ?? "openai/gpt-5-mini",
  // Rotas especificas preservam OPENROUTER_TEXT_MODEL como rollback global.
  openRouterStaticModel:
    process.env.OPENROUTER_STATIC_MODEL ?? process.env.OPENROUTER_TEXT_MODEL ?? "google/gemini-3.8-flash",
  openRouterCarouselModel:
    process.env.OPENROUTER_CAROUSEL_MODEL ?? process.env.OPENROUTER_TEXT_MODEL ?? "google/gemini-3.8-flash",
  openRouterQualityRevisionModel:
    process.env.OPENROUTER_QUALITY_REVISION_MODEL ?? process.env.OPENROUTER_TEXT_MODEL ?? "openai/gpt-5.4-mini",
  openRouterContentStrategyModel:
    process.env.OPENROUTER_CONTENT_STRATEGY_MODEL ?? process.env.OPENROUTER_TEXT_MODEL ?? "z-ai/glm-5.3-flash",
  openRouterBriefInterpretationModel:
    process.env.OPENROUTER_BRIEF_INTERPRETATION_MODEL ?? "google/gemini-3.8-flash",
  openRouterEvaluationModel:
    process.env.OPENROUTER_EVALUATION_MODEL ?? process.env.OPENROUTER_TEXT_MODEL ?? "z-ai/glm-5.3-flash",
  openRouterVisionModel: process.env.OPENROUTER_VISION_MODEL ?? "google/gemini-3.8-flash",
  openRouterProposalReviewModel: process.env.OPENROUTER_PROPOSAL_REVIEW_MODEL ?? process.env.OPENROUTER_VISION_MODEL ?? "google/gemini-3.8-flash",
  proposalReviewTimeoutMs: envInteger("PROPOSAL_REVIEW_TIMEOUT_MS", 45_000, 5_000, 120_000),
  openRouterDesignAnalysisModel:
    process.env.OPENROUTER_DESIGN_ANALYSIS_MODEL ?? "openai/gpt-4o",
  openRouterDesignRecreationModel:
    process.env.OPENROUTER_DESIGN_RECREATION_MODEL ?? "deepseek/deepseek-v4.1-flash",
  openRouterImageModel: process.env.OPENROUTER_IMAGE_MODEL ?? "google/gemini-3.1-flash-image-preview",
  // V5 uses a separately capability-checked model; legacy/manual keeps its existing route.
  openRouterV5ImageModel: process.env.OPENROUTER_V5_IMAGE_MODEL ?? "google/gemini-3.1-flash-image",
  openRouterPlatformFeePercent: parseFloat(process.env.OPENROUTER_PLATFORM_FEE_PERCENT || "5.5"),
  llmInputCostPerMillion: parseFloat(process.env.LLM_INPUT_COST_PER_MILLION || "0"),
  llmOutputCostPerMillion: parseFloat(process.env.LLM_OUTPUT_COST_PER_MILLION || "0"),
  aiSiteIntelligenceEnabled: envFlag("AI_SITE_INTELLIGENCE_ENABLED", true),
  // AI_CONTENT_STRATEGY_ENABLED removida na SPEC-005: planejamento de
  // estratégia é determinístico (ver contentStrategy.ts).
  aiLlmJudgeEnabled: envFlag("AI_LLM_JUDGE_ENABLED", false),
  aiSemanticEmbeddingsEnabled: envFlag("AI_SEMANTIC_EMBEDDINGS_ENABLED", true),
  aiTraceStoreContent: envFlag("AI_TRACE_STORE_CONTENT", false),
  // SPEC-003: flags e chamadas de shadow graph / pipeline experimental
  // retirados do caminho produtivo — não existe segunda máquina de estado.
  aiUiDebugEnabled: envFlag("AI_UI_DEBUG_ENABLED", !isProduction),
  aiModelFallbackEnabled: envFlag("AI_MODEL_FALLBACK_ENABLED", true),

  // Intent router / context budget (absorvidos do High Ticket — Fase D)
  llmTransientRetries: envInteger("LLM_TRANSIENT_RETRIES", 2, 0, 4),
  llmRetryBaseDelayMs: envInteger("LLM_RETRY_BASE_DELAY_MS", 700, 100, 10_000),
  llmRequestTimeoutMs: envInteger("LLM_REQUEST_TIMEOUT_MS", 90_000, 5_000, 180_000),

  // Supabase (service role — backend only)
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",

  // Stripe
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePriceProMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? "",
  stripePriceProAnnual: process.env.STRIPE_PRICE_PRO_ANNUAL ?? "",
  stripePriceAgencyMonthly: process.env.STRIPE_PRICE_AGENCY_MONTHLY ?? "",
  stripePriceAgencyAnnual: process.env.STRIPE_PRICE_AGENCY_ANNUAL ?? "",
  stripePriceTopupStarter: process.env.STRIPE_PRICE_TOPUP_STARTER ?? "",
  stripePriceTopupPower: process.env.STRIPE_PRICE_TOPUP_POWER ?? "",
  stripePriceTopupMega: process.env.STRIPE_PRICE_TOPUP_MEGA ?? "",

  // SMTP (Hostinger)
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: parseInt(process.env.SMTP_PORT || "465"),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "",
};
