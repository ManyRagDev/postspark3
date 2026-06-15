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
  isProduction,
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  llmInputCostPerMillion: parseFloat(process.env.LLM_INPUT_COST_PER_MILLION || "0"),
  llmOutputCostPerMillion: parseFloat(process.env.LLM_OUTPUT_COST_PER_MILLION || "0"),
  aiSiteIntelligenceEnabled: envFlag("AI_SITE_INTELLIGENCE_ENABLED", true),
  aiContentStrategyEnabled: envFlag("AI_CONTENT_STRATEGY_ENABLED", true),
  aiLlmJudgeEnabled: envFlag("AI_LLM_JUDGE_ENABLED", true),
  aiSemanticEmbeddingsEnabled: envFlag("AI_SEMANTIC_EMBEDDINGS_ENABLED", true),
  aiTraceStoreContent: envFlag("AI_TRACE_STORE_CONTENT", false),
  aiUiDebugEnabled: envFlag("AI_UI_DEBUG_ENABLED", !isProduction),
  aiModelFallbackEnabled: envFlag("AI_MODEL_FALLBACK_ENABLED", true),
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
