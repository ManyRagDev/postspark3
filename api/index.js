var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/_core/env.ts
var envFlag, envInteger, isProduction, ENV;
var init_env = __esm({
  "server/_core/env.ts"() {
    "use strict";
    envFlag = (name, defaultValue) => {
      const value = process.env[name];
      if (value === void 0) return defaultValue;
      return ["1", "true", "yes", "on"].includes(value.toLowerCase());
    };
    envInteger = (name, defaultValue, minimum, maximum) => {
      const parsed = Number.parseInt(process.env[name] ?? "", 10);
      if (!Number.isFinite(parsed)) return defaultValue;
      return Math.min(maximum, Math.max(minimum, parsed));
    };
    isProduction = process.env.NODE_ENV === "production";
    ENV = {
      isProduction,
      forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
      forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
      geminiApiKey: process.env.GEMINI_API_KEY ?? "",
      groqApiKey: process.env.GROQ_API_KEY ?? "",
      openRouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
      openRouterSiteUrl: process.env.OPENROUTER_SITE_URL ?? "https://postspark.app",
      openRouterAppName: process.env.OPENROUTER_APP_NAME ?? "PostSpark",
      openRouterTextModel: process.env.OPENROUTER_TEXT_MODEL ?? "openai/gpt-5-mini",
      openRouterVisionModel: process.env.OPENROUTER_VISION_MODEL ?? "openai/gpt-5-mini",
      openRouterImageModel: process.env.OPENROUTER_IMAGE_MODEL ?? "google/gemini-3.1-flash-image-preview",
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
      llmRetryBaseDelayMs: envInteger("LLM_RETRY_BASE_DELAY_MS", 700, 100, 1e4),
      llmRequestTimeoutMs: envInteger("LLM_REQUEST_TIMEOUT_MS", 9e4, 5e3, 18e4),
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
      smtpFrom: process.env.SMTP_FROM ?? ""
    };
  }
});

// server/db.ts
import { createClient as createClient4 } from "@supabase/supabase-js";
function promptSnapshotCalls(promptSnapshot) {
  if (Array.isArray(promptSnapshot)) {
    return promptSnapshot.filter(
      (call) => typeof call === "object" && call !== null && !Array.isArray(call)
    );
  }
  if (typeof promptSnapshot === "object" && promptSnapshot !== null && !Array.isArray(promptSnapshot) && Array.isArray(promptSnapshot.calls)) {
    return promptSnapshot.calls.filter(
      (call) => typeof call === "object" && call !== null && !Array.isArray(call)
    );
  }
  return [];
}
function getSupabaseDbClient() {
  if (!_supabaseDbClient) {
    if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
    }
    _supabaseDbClient = createClient4(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
      auth: { persistSession: false },
      db: { schema: "postspark" }
    });
  }
  return _supabaseDbClient;
}
function removeUndefined(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== void 0)
  );
}
function getDb() {
  return getSupabaseDbClient();
}
async function createPost(post) {
  const db = getSupabaseDbClient();
  const payload = {
    user_uuid: post.userUuid,
    inputType: post.inputType,
    inputContent: post.inputContent,
    platform: post.platform,
    headline: post.headline ?? null,
    body: post.body ?? null,
    caption: post.caption ?? null,
    hashtags: post.hashtags ?? null,
    callToAction: post.callToAction ?? null,
    tone: post.tone ?? null,
    imagePrompt: post.imagePrompt ?? null,
    imageUrl: post.imageUrl ?? null,
    backgroundColor: post.backgroundColor ?? null,
    textColor: post.textColor ?? null,
    accentColor: post.accentColor ?? null,
    layout: post.layout ?? null,
    postMode: post.postMode ?? "static",
    slides: post.slides ?? null,
    textElements: post.textElements ?? null,
    image_settings: post.imageSettings ?? null,
    layout_settings: post.layoutSettings ?? null,
    bg_value: post.bgValue ?? null,
    bg_overlay: post.bgOverlay ?? null,
    copy_angle: post.copyAngle ?? null,
    variation_snapshot: post.variationSnapshot ?? null
  };
  const { data, error } = await db.from("posts").insert(payload).select("id").single();
  if (error || !data) {
    throw new Error(`[Database] createPost failed: ${error?.message ?? "unknown error"}`);
  }
  return data.id;
}
async function getUserPosts(userUuid, limit = 50) {
  const db = getSupabaseDbClient();
  const { data, error } = await db.from("posts").select("*").eq("user_uuid", userUuid).order("createdAt", { ascending: false }).limit(limit);
  if (error) {
    throw new Error(`[Database] getUserPosts failed: ${error.message}`);
  }
  return data ?? [];
}
async function updatePost(postId, userUuid, data) {
  const db = getSupabaseDbClient();
  const payload = removeUndefined({
    headline: data.headline,
    body: data.body,
    caption: data.caption,
    hashtags: data.hashtags,
    callToAction: data.callToAction,
    tone: data.tone,
    imagePrompt: data.imagePrompt,
    imageUrl: data.imageUrl,
    backgroundColor: data.backgroundColor,
    textColor: data.textColor,
    accentColor: data.accentColor,
    layout: data.layout,
    postMode: data.postMode,
    slides: data.slides,
    textElements: data.textElements,
    image_settings: data.imageSettings,
    layout_settings: data.layoutSettings,
    bg_value: data.bgValue,
    bg_overlay: data.bgOverlay,
    copy_angle: data.copyAngle,
    variation_snapshot: data.variationSnapshot
  });
  if (Object.keys(payload).length === 0) {
    return;
  }
  const { error } = await db.from("posts").update(payload).eq("id", postId).eq("user_uuid", userUuid);
  if (error) {
    throw new Error(`[Database] updatePost failed: ${error.message}`);
  }
}
async function getPostById(postId, userUuid) {
  const db = getSupabaseDbClient();
  const { data, error } = await db.from("posts").select("*").eq("id", postId).eq("user_uuid", userUuid).maybeSingle();
  if (error) {
    throw new Error(`[Database] getPostById failed: ${error.message}`);
  }
  return data ?? void 0;
}
async function createBackgroundAsset(input) {
  const db = getSupabaseDbClient();
  const { data, error } = await db.from("background_assets").insert({
    user_uuid: input.userUuid,
    image_url: input.imageUrl,
    source_type: input.sourceType,
    prompt: input.prompt ?? null,
    label: input.label ?? null
  }).select("*").single();
  if (error || !data) {
    throw new Error(`[Database] createBackgroundAsset failed: ${error?.message ?? "unknown error"}`);
  }
  return data;
}
async function getUserBackgroundAssets(userUuid, limit = 100) {
  const db = getSupabaseDbClient();
  const { data, error } = await db.from("background_assets").select("*").eq("user_uuid", userUuid).order("createdAt", { ascending: false }).limit(limit);
  if (error) {
    throw new Error(`[Database] getUserBackgroundAssets failed: ${error.message}`);
  }
  return data ?? [];
}
async function getSiteIntelligenceById(id, userUuid) {
  const db = getSupabaseDbClient();
  const { data, error } = await db.from("site_intelligence").select("*").eq("id", id).eq("user_uuid", userUuid).maybeSingle();
  if (error) {
    throw new Error(`[Database] getSiteIntelligenceById failed: ${error.message}`);
  }
  return data ?? void 0;
}
async function getLatestSiteIntelligenceByUrl(normalizedUrl, userUuid) {
  const db = getSupabaseDbClient();
  const { data, error } = await db.from("site_intelligence").select("*").eq("normalized_url", normalizedUrl).eq("user_uuid", userUuid).order("updatedAt", { ascending: false }).limit(1).maybeSingle();
  if (error) {
    throw new Error(
      `[Database] getLatestSiteIntelligenceByUrl failed: ${error.message}`
    );
  }
  return data ?? void 0;
}
async function upsertSiteIntelligence(input) {
  const db = getSupabaseDbClient();
  const { data, error } = await db.from("site_intelligence").upsert(
    {
      id: input.id,
      user_uuid: input.userUuid,
      source_url: input.sourceUrl,
      normalized_url: input.normalizedUrl,
      fingerprint: input.fingerprint,
      snapshot: input.snapshot,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    { onConflict: "user_uuid,normalized_url,fingerprint" }
  ).select("*").single();
  if (error || !data) {
    throw new Error(
      `[Database] upsertSiteIntelligence failed: ${error?.message ?? "unknown error"}`
    );
  }
  return data;
}
async function createGenerationRun(input) {
  const db = getSupabaseDbClient();
  const payload = removeUndefined({
    id: input.id,
    user_uuid: input.userUuid,
    site_intelligence_id: input.siteIntelligenceId ?? null,
    status: input.status,
    input_type: input.inputType,
    input_content: input.inputContent,
    platform: input.platform,
    post_mode: input.postMode,
    creation_mode: input.creationMode,
    requested_model: input.requestedModel,
    effective_models: input.effectiveModels,
    prompt_snapshot: input.promptSnapshot ?? null,
    strategy_snapshot: input.strategySnapshot ?? null,
    evaluation_snapshot: input.evaluationSnapshot ?? null,
    output_snapshot: input.outputSnapshot ?? null,
    events: input.events ?? [],
    events_version: input.eventsVersion ?? 1,
    revision_count: input.revisionCount,
    candidate_count: input.candidateCount,
    accepted_count: input.acceptedCount,
    average_quality_score: input.averageQualityScore,
    strategy_fallback_used: input.strategyFallbackUsed,
    originality_fallback_used: input.originalityFallbackUsed,
    prompt_tokens: input.promptTokens,
    completion_tokens: input.completionTokens,
    total_tokens: input.totalTokens,
    estimated_cost_usd: input.estimatedCostUsd,
    latency_ms: input.latencyMs,
    error_message: input.errorMessage ?? null,
    graph_state: input.graphState,
    spark_cost: input.sparkCost,
    completed_at: input.completedAt
  });
  const { error } = await db.from("generation_runs").upsert(payload);
  if (error) {
    throw new Error(`[Database] createGenerationRun failed: ${error.message}`);
  }
}
async function getBrandKitByUser(userUuid) {
  const db = getSupabaseDbClient();
  const { data, error } = await db.from("brand_kits").select("*").eq("user_uuid", userUuid).maybeSingle();
  if (error) {
    throw new Error(`[Database] getBrandKitByUser failed: ${error.message}`);
  }
  return data ?? void 0;
}
async function getPersonaByUser(userUuid) {
  const db = getSupabaseDbClient();
  const { data, error } = await db.from("personas").select("*").eq("user_uuid", userUuid).maybeSingle();
  if (error) {
    throw new Error(`[Database] getPersonaByUser failed: ${error.message}`);
  }
  return data ?? void 0;
}
async function createContentFingerprints(inputs) {
  if (inputs.length === 0) return;
  const db = getSupabaseDbClient();
  const { error } = await db.from("content_fingerprints").insert(
    inputs.map((input) => ({
      id: input.id,
      user_uuid: input.userUuid,
      generation_run_id: input.generationRunId ?? null,
      source_type: input.sourceType,
      source_id: input.sourceId,
      text_hash: input.textHash,
      embedding: input.embedding,
      metadata: input.metadata ?? null
    }))
  );
  if (error) {
    throw new Error(
      `[Database] createContentFingerprints failed: ${error.message}`
    );
  }
}
async function getGenerationOperationalMetrics(windowDays = 7) {
  const db = getSupabaseDbClient();
  const since = new Date(Date.now() - windowDays * 864e5).toISOString();
  const { data, error } = await db.from("generation_runs").select(
    "status,candidate_count,accepted_count,average_quality_score,revision_count,strategy_fallback_used,originality_fallback_used,prompt_snapshot,total_tokens,estimated_cost_usd,latency_ms,events"
  ).gte("created_at", since);
  if (error) {
    throw new Error(
      `[Database] getGenerationOperationalMetrics failed: ${error.message}`
    );
  }
  const rows = data ?? [];
  const totalRuns = rows.length;
  const completedRuns = rows.filter((row) => row.status === "completed").length;
  const failedRuns = rows.filter((row) => row.status === "failed").length;
  const candidateCount = rows.reduce(
    (sum, row) => sum + Number(row.candidate_count ?? 0),
    0
  );
  const acceptedCount = rows.reduce(
    (sum, row) => sum + Number(row.accepted_count ?? 0),
    0
  );
  const completedWithQuality = rows.filter(
    (row) => Number(row.candidate_count ?? 0) > 0
  );
  const latencies = rows.map((row) => Number(row.latency_ms ?? 0)).sort((a, b) => a - b);
  const llmCalls = rows.flatMap((row) => promptSnapshotCalls(row.prompt_snapshot));
  const fallbackRuns = rows.filter(
    (row) => row.strategy_fallback_used || row.originality_fallback_used || promptSnapshotCalls(row.prompt_snapshot).some((call) => Boolean(call?.fallbackFrom))
  ).length;
  const revisedRuns = rows.filter(
    (row) => Number(row.revision_count ?? 0) > 0
  ).length;
  const ratio = (numerator, denominator) => denominator > 0 ? numerator / denominator : 0;
  return {
    windowDays,
    totalRuns,
    completedRuns,
    failedRuns,
    completionRate: ratio(completedRuns, totalRuns),
    candidateAcceptanceRate: ratio(acceptedCount, candidateCount),
    revisionRate: ratio(revisedRuns, completedRuns),
    fallbackRate: ratio(fallbackRuns, totalRuns),
    llmCallErrorRate: ratio(
      llmCalls.filter((call) => Boolean(call?.error)).length,
      llmCalls.length
    ),
    averageQualityScore: completedWithQuality.length > 0 ? completedWithQuality.reduce(
      (sum, row) => sum + Number(row.average_quality_score ?? 0),
      0
    ) / completedWithQuality.length : 0,
    averageLatencyMs: totalRuns > 0 ? latencies.reduce((sum, latency) => sum + latency, 0) / totalRuns : 0,
    p95LatencyMs: latencies.length > 0 ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)] : 0,
    totalTokens: rows.reduce(
      (sum, row) => sum + Number(row.total_tokens ?? 0),
      0
    ),
    estimatedCostUsd: rows.reduce(
      (sum, row) => sum + Number(row.estimated_cost_usd ?? 0),
      0
    )
  };
}
async function getUserGenerationRuns(userUuid, limit = 50, offset = 0) {
  const db = getSupabaseDbClient();
  const { data, error } = await db.from("generation_runs").select("*").eq("user_uuid", userUuid).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) {
    throw new Error(
      `[Database] getUserGenerationRuns failed: ${error.message}`
    );
  }
  return data ?? [];
}
async function getGenerationRunById(id, userUuid) {
  const db = getSupabaseDbClient();
  const { data, error } = await db.from("generation_runs").select("*").eq("id", id).eq("user_uuid", userUuid).single();
  if (error || !data) {
    return null;
  }
  return data;
}
var _supabaseDbClient;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    init_env();
    _supabaseDbClient = null;
  }
});

// server/_core/privacyLog.ts
var privacyLog_exports = {};
__export(privacyLog_exports, {
  getPrivacyLogs: () => getPrivacyLogs,
  logAdminDataAccess: () => logAdminDataAccess,
  logConsentGiven: () => logConsentGiven,
  logConsentRevoked: () => logConsentRevoked,
  logPrivacyEvent: () => logPrivacyEvent
});
async function logPrivacyEvent(event) {
  try {
    const { userId, action, timestamp = /* @__PURE__ */ new Date(), metadata = {} } = event;
    const sanitizedMetadata = sanitizeMetadata(metadata);
    try {
      await getDb().schema("postspark").from("privacy_logs").insert({
        user_id: userId,
        action,
        timestamp: timestamp.toISOString(),
        metadata: sanitizedMetadata,
        created_at: /* @__PURE__ */ new Date()
      });
    } catch (error) {
      console.log("[PrivacyLog]", {
        userId,
        action,
        timestamp: timestamp.toISOString(),
        metadata: sanitizedMetadata
      });
      if (process.env.NODE_ENV === "development") {
        console.warn("[PrivacyLog] Table privacy_logs does not exist. Create it for proper logging.");
      }
    }
  } catch (error) {
    console.error("[PrivacyLog] Error logging event:", error);
  }
}
function sanitizeMetadata(metadata) {
  const sanitized = {};
  const sensitiveKeys = ["password", "token", "apiKey", "secret", "creditCard", "ssn", "cpf"];
  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive.toLowerCase()))) {
      sanitized[key] = "[REDACTED]";
      continue;
    }
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeMetadata(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(
        (item) => typeof item === "object" && item !== null ? sanitizeMetadata(item) : item
      );
    } else if (typeof value === "string") {
      sanitized[key] = value.length > 1e3 ? value.substring(0, 1e3) + "...[truncated]" : value;
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
async function getPrivacyLogs(userId, limit = 50) {
  try {
    const logs = await getDb().schema("postspark").from("privacy_logs").where("user_id", userId).select("action", "timestamp", "metadata").orderBy("created_at", { ascending: false }).limit(limit);
    return logs || [];
  } catch (error) {
    console.error("[PrivacyLog] Error fetching logs:", error);
    return [];
  }
}
async function logAdminDataAccess(adminId, targetUserId, reason) {
  await logPrivacyEvent({
    userId: targetUserId,
    action: "admin_data_access",
    metadata: {
      adminId,
      reason,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    }
  });
}
async function logConsentGiven(userId, version, aiImprovements) {
  await logPrivacyEvent({
    userId,
    action: "consent_given",
    metadata: {
      version,
      aiImprovements,
      ipAddress: "[REDACTED]",
      // IP não armazenado por padrão
      userAgent: "[REDACTED]"
    }
  });
}
async function logConsentRevoked(userId, fields) {
  await logPrivacyEvent({
    userId,
    action: "consent_revoked",
    metadata: {
      fields
    }
  });
}
var init_privacyLog = __esm({
  "server/_core/privacyLog.ts"() {
    "use strict";
    init_db();
  }
});

// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// server/_core/supabaseAuth.ts
import { createClient as createClient2 } from "@supabase/supabase-js";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(req)
  };
}

// server/_core/supabaseAuth.ts
init_env();

// server/_core/manylabs.ts
init_env();
import { createClient } from "@supabase/supabase-js";
var _postsparkAdminClient = null;
function getPostSparkAdminClient() {
  if (!_postsparkAdminClient) {
    if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
    }
    _postsparkAdminClient = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
      auth: { persistSession: false },
      db: { schema: "postspark" }
    });
  }
  return _postsparkAdminClient;
}
async function hasPostSparkAccess(userId) {
  try {
    const supabase = getPostSparkAdminClient();
    const { data, error } = await supabase.rpc("has_manylabs_app_access", {
      p_user_id: userId
    });
    if (error) {
      console.error("[ManyLabs] has_manylabs_app_access RPC error:", error.message);
      return false;
    }
    return Boolean(data);
  } catch (err) {
    console.error("[ManyLabs] has_manylabs_app_access unexpected error:", err);
    return false;
  }
}
async function ensurePostSparkAccess(userId, email, name) {
  try {
    const supabase = getPostSparkAdminClient();
    const { data, error } = await supabase.rpc("ensure_manylabs_app_access", {
      p_user_id: userId,
      p_email: email,
      p_display_name: name
    });
    if (error) {
      console.error("[ManyLabs] ensure_manylabs_app_access RPC error:", error.message);
      return false;
    }
    return Boolean(data);
  } catch (err) {
    console.error("[ManyLabs] ensure_manylabs_app_access unexpected error:", err);
    return false;
  }
}

// server/_core/supabaseAuth.ts
function getSupabaseAdmin() {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
  }
  return createClient2(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
    auth: { persistSession: false }
  });
}
function registerSupabaseAuthRoutes(app2) {
  app2.post("/api/auth/supabase-session", async (req, res) => {
    const { access_token } = req.body;
    if (!access_token || typeof access_token !== "string") {
      res.status(400).json({ error: "access_token is required" });
      return;
    }
    try {
      const supabase = getSupabaseAdmin();
      const {
        data: { user },
        error
      } = await supabase.auth.getUser(access_token);
      if (error || !user) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }
      if (!(process.env.NODE_ENV === "development" && process.env.BYPASS_AUTH === "true")) {
        const metadata2 = user.user_metadata ?? {};
        const name2 = typeof metadata2.full_name === "string" ? metadata2.full_name : typeof metadata2.name === "string" ? metadata2.name : null;
        const hasAccess = await ensurePostSparkAccess(user.id, user.email ?? null, name2);
        if (!hasAccess) {
          res.status(403).json({ error: "postspark_access_required" });
          return;
        }
      }
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, access_token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      const metadata = user.user_metadata ?? {};
      const name = typeof metadata.full_name === "string" ? metadata.full_name : typeof metadata.name === "string" ? metadata.name : null;
      res.json({ ok: true, id: user.id, email: user.email ?? null, name });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Session creation failed";
      res.status(500).json({ error: "Session creation failed", detail: message });
    }
  });
  app2.post("/api/auth/supabase-logout", (req, res) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, cookieOptions);
    res.json({ ok: true });
  });
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
init_env();
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/verifyRuntime.ts
init_env();
import { createClient as createClient3 } from "@supabase/supabase-js";
import { createHash as createHash2 } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

// server/runtimeManifest.ts
import { createHash } from "node:crypto";
var RUNTIME_MANIFEST = {
  version: 1,
  requirements: [
    // ── Tabelas ──────────────────────────────────────────────────────────────
    { kind: "table", schema: "postspark", name: "profiles", critical: true, consumers: ["billing.ts:100,316,329"] },
    { kind: "table", schema: "postspark", name: "posts", critical: true, consumers: ["db.ts:622,638,687,704"] },
    { kind: "table", schema: "postspark", name: "background_assets", critical: false, consumers: ["db.ts:721,743"] },
    { kind: "table", schema: "postspark", name: "site_intelligence", critical: false, consumers: ["db.ts:762,781,803"], note: "aus\xEAncia degrada fluxo URL com warn (analyzeSiteIntelligence)" },
    { kind: "table", schema: "postspark", name: "generation_runs", critical: true, consumers: ["db.ts:866,899,974,1084,1109"] },
    { kind: "table", schema: "postspark", name: "content_fingerprints", critical: false, consumers: ["db.ts:948"], note: "aus\xEAncia degrada persist\xEAncia de fingerprints com warn" },
    { kind: "table", schema: "postspark", name: "brand_kits", critical: false, consumers: ["db.ts:914"], note: "aus\xEAncia degrada contexto de execu\xE7\xE3o" },
    { kind: "table", schema: "postspark", name: "personas", critical: false, consumers: ["db.ts:931"], note: "aus\xEAncia degrada contexto de execu\xE7\xE3o" },
    { kind: "table", schema: "postspark", name: "subscriptions", critical: true, consumers: ["billing.ts:459,488,502"] },
    { kind: "table", schema: "postspark", name: "topup_packages", critical: true, consumers: ["billing.ts:290"] },
    { kind: "table", schema: "postspark", name: "topup_purchases", critical: false, consumers: ["billing.ts:435 (process_topup)"] },
    { kind: "table", schema: "postspark", name: "spark_reservations", critical: true, consumers: ["drizzle/0014_spark_reservations.sql", "billing.ts:206,236,267"] },
    { kind: "table", schema: "postspark", name: "spark_transactions", critical: false, consumers: ["billing.ts:133 (debit_sparks legado)"], note: "usada pela RPC debit_sparks legada" },
    { kind: "table", schema: "postspark", name: "trials", critical: false, consumers: ["routers.ts:243 (start_trial)"] },
    { kind: "table", schema: "postspark", name: "founders", critical: false, consumers: ["billing.ts (RPCs de founder)"] },
    { kind: "table", schema: "postspark", name: "plan_save_limits", critical: false, consumers: ["routers.ts (limite de posts salvos)"] },
    { kind: "table", schema: "postspark", name: "users", critical: false, consumers: ["_core/gdpr.ts:50,115,191,250,309,394"] },
    { kind: "table", schema: "postspark", name: "analytics_pageviews", critical: false, consumers: ["_core/analytics.ts:48"], note: "aus\xEAncia degrada com console.log" },
    { kind: "table", schema: "postspark", name: "analytics_events", critical: false, consumers: ["_core/analytics.ts:88"], note: "aus\xEAncia degrada com console.log" },
    { kind: "table", schema: "postspark", name: "privacy_logs", critical: false, consumers: ["_core/privacyLog.ts:46,120"], note: "aus\xEAncia degrada com warn" },
    // ── Colunas críticas ─────────────────────────────────────────────────────
    { kind: "column", schema: "postspark", table: "posts", name: "user_uuid", critical: true, consumers: ["db.ts:594"] },
    { kind: "column", schema: "postspark", table: "posts", name: "variation_snapshot", critical: true, consumers: ["db.ts:618"], note: "reabertura rica de posts novos (SPEC-001/002/003)" },
    { kind: "column", schema: "postspark", table: "posts", name: "image_settings", critical: false, consumers: ["db.ts:613"] },
    { kind: "column", schema: "postspark", table: "posts", name: "layout_settings", critical: false, consumers: ["db.ts:614"] },
    { kind: "column", schema: "postspark", table: "posts", name: "bg_value", critical: false, consumers: ["db.ts:615"] },
    { kind: "column", schema: "postspark", table: "posts", name: "bg_overlay", critical: false, consumers: ["db.ts:616"] },
    { kind: "column", schema: "postspark", table: "posts", name: "copy_angle", critical: false, consumers: ["db.ts:617"] },
    { kind: "column", schema: "postspark", table: "generation_runs", name: "events", critical: true, consumers: ["db.ts:866", "generationTrace.ts:188"], note: "runtime persiste eventos de gera\xE7\xE3o" },
    { kind: "column", schema: "postspark", table: "generation_runs", name: "events_version", critical: true, consumers: ["db.ts:849", "generationTrace.ts:188"] },
    { kind: "column", schema: "postspark", table: "profiles", name: "id", critical: true, consumers: ["billing.ts:102"] },
    { kind: "column", schema: "postspark", table: "profiles", name: "email", critical: true, consumers: ["billing.ts:102"] },
    { kind: "column", schema: "postspark", table: "profiles", name: "plan", critical: true, consumers: ["billing.ts:102,473,486"] },
    { kind: "column", schema: "postspark", table: "profiles", name: "sparks", critical: true, consumers: ["billing.ts:102", "0014 (commit_spark_reservation)"] },
    // ── RPCs ─────────────────────────────────────────────────────────────────
    { kind: "rpc", schema: "postspark", name: "reserve_sparks", critical: true, consumers: ["billing.ts:206"] },
    { kind: "rpc", schema: "postspark", name: "commit_spark_reservation", critical: true, consumers: ["billing.ts:236"] },
    { kind: "rpc", schema: "postspark", name: "refund_spark_reservation", critical: true, consumers: ["billing.ts:267"] },
    { kind: "rpc", schema: "postspark", name: "debit_sparks", critical: true, consumers: ["billing.ts:133"] },
    { kind: "rpc", schema: "postspark", name: "process_topup", critical: true, consumers: ["billing.ts:435"] },
    { kind: "rpc", schema: "postspark", name: "start_trial", critical: false, consumers: ["routers.ts:243"] },
    { kind: "rpc", schema: "postspark", name: "get_billing_profile", critical: false, consumers: ["_core/gdpr.ts:343"] },
    { kind: "rpc", schema: "postspark", name: "has_manylabs_app_access", critical: true, consumers: ["_core/manylabs.ts:29"], note: "checagem de acesso por request (auth bridge)" },
    { kind: "rpc", schema: "postspark", name: "ensure_manylabs_app_access", critical: true, consumers: ["_core/manylabs.ts:57"], note: "auto-ativa\xE7\xE3o de acesso na emiss\xE3o do cookie" }
    // ── Buckets ──────────────────────────────────────────────────────────────
    // Nenhum bucket do Supabase é usado pelo runtime: uploads passam pelo
    // proxy Forge (`server/storage.ts`), configurado por BUILT_IN_FORGE_*.
  ]
};
function manifestHash(manifest = RUNTIME_MANIFEST) {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

// server/verifyRuntime.ts
async function createPostgresParser() {
  const mod = await import("@pgsql/parser");
  const pgParser = mod.default || mod;
  const parserModule = pgParser;
  const ParserClass = parserModule.Parser ?? pgParser;
  return new ParserClass();
}
var DRIZZLE_DIR = path.resolve(process.cwd(), "drizzle");
var REPORT_DIR = path.resolve(process.cwd(), "verify-output");
var HISTORICAL_INVALID_MIGRATIONS = /* @__PURE__ */ new Set(["0012_add_generation_events.sql"]);
var MIGRATION_GLOB = /^\d{4}_.+\.sql$/;
function maskProjectRef(url) {
  try {
    const host = new URL(url).hostname;
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return match ? `${match[1].slice(0, 4)}\u2026${match[1].slice(-4)}` : "unknown";
  } catch {
    return "invalid_url";
  }
}
function listMigrationFiles() {
  if (!fs.existsSync(DRIZZLE_DIR)) return [];
  return fs.readdirSync(DRIZZLE_DIR).filter((file) => MIGRATION_GLOB.test(file)).sort();
}
async function validateMigrations() {
  const files = listMigrationFiles();
  const parser = await createPostgresParser();
  const results = [];
  for (const file of files) {
    const sql = fs.readFileSync(path.join(DRIZZLE_DIR, file), "utf8").replace(/^\uFEFF/, "");
    try {
      await parser.parse(sql);
      results.push({ file, status: "valid" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (HISTORICAL_INVALID_MIGRATIONS.has(file)) {
        results.push({ file, status: "invalid_historical", error: message });
      } else {
        results.push({ file, status: "invalid", error: message });
      }
    }
  }
  return results;
}
var SENTINEL_UUID = "00000000-0000-0000-0000-000000000000";
var RPC_PROBE_ARGS = {
  reserve_sparks: {
    p_user_id: SENTINEL_UUID,
    p_amount: 0,
    p_idempotency_key: "__verify_sentinel__",
    p_description: "__verify_sentinel__"
  },
  commit_spark_reservation: { p_reservation_id: SENTINEL_UUID, p_generation_run_id: "__verify_sentinel__" },
  refund_spark_reservation: { p_reservation_id: SENTINEL_UUID, p_error_detail: "__verify_sentinel__" },
  debit_sparks: {
    p_user_id: SENTINEL_UUID,
    p_amount: 0,
    p_description: "__verify_sentinel__",
    p_generation_id: SENTINEL_UUID,
    p_metadata: {}
  },
  process_topup: {
    p_user_id: SENTINEL_UUID,
    p_package_id: "__verify_sentinel__",
    p_stripe_payment_intent_id: "__verify_sentinel__"
  },
  start_trial: {
    p_user_id: SENTINEL_UUID,
    p_email: "verify@sentinel.invalid",
    p_ip_address: "0.0.0.0",
    p_plan: "PRO"
  },
  get_billing_profile: { p_user_id: SENTINEL_UUID },
  has_manylabs_app_access: { p_user_id: SENTINEL_UUID }
  // ensure_manylabs_app_access NÃO é sondado: a função auto-ativa acesso
  // (cria registros) — auditoria read-only não a invoca. Presença é
  // verificada por information_schema (auditoria externa, ver SPEC-004).
};
function isFunctionNotFound(error) {
  return Boolean(
    error && (/Could not find the function/i.test(error.message ?? "") || /function .* does not exist/i.test(error.message ?? ""))
  );
}
function isTableNotFound(error) {
  return Boolean(
    error && (error.code === "42P01" || /could not find the table/i.test(error.message ?? "") || /relation .* does not exist/i.test(error.message ?? ""))
  );
}
function isColumnNotFound(error) {
  return Boolean(
    error && (error.code === "42703" || /column .* does not exist/i.test(error.message ?? ""))
  );
}
async function probeTable(client, requirement) {
  const label = `${requirement.schema}.${requirement.name}`;
  try {
    const { error } = await client.from(requirement.name).select("*").limit(0);
    if (isTableNotFound(error)) {
      return { requirement: label, kind: requirement.kind, critical: requirement.critical, status: "absent", detail: error?.message };
    }
    if (error) {
      return { requirement: label, kind: requirement.kind, critical: requirement.critical, status: "incompatible", detail: error.message };
    }
    return { requirement: label, kind: requirement.kind, critical: requirement.critical, status: "present" };
  } catch (error) {
    return { requirement: label, kind: requirement.kind, critical: requirement.critical, status: "not_verifiable", detail: error instanceof Error ? error.message : String(error) };
  }
}
async function probeColumn(client, requirement) {
  const label = `${requirement.schema}.${requirement.table}.${requirement.name}`;
  try {
    const { error } = await client.from(requirement.table).select(requirement.name).limit(1);
    if (isColumnNotFound(error)) {
      return { requirement: label, kind: requirement.kind, critical: requirement.critical, status: "absent", detail: error?.message };
    }
    if (isTableNotFound(error)) {
      return { requirement: label, kind: requirement.kind, critical: requirement.critical, status: "absent", detail: `tabela ausente (${error?.message})` };
    }
    if (error) {
      return { requirement: label, kind: requirement.kind, critical: requirement.critical, status: "incompatible", detail: error.message };
    }
    return { requirement: label, kind: requirement.kind, critical: requirement.critical, status: "present" };
  } catch (error) {
    return { requirement: label, kind: requirement.kind, critical: requirement.critical, status: "not_verifiable", detail: error instanceof Error ? error.message : String(error) };
  }
}
async function probeRpc(client, requirement) {
  if (requirement.name === "ensure_manylabs_app_access") {
    return {
      requirement: requirement.name,
      kind: requirement.kind,
      critical: requirement.critical,
      status: "not_verifiable",
      detail: "fun\xE7\xE3o auto-ativa acesso (write) \u2014 auditoria read-only n\xE3o a sonda; presen\xE7a verificada por information_schema na auditoria externa"
    };
  }
  const args = RPC_PROBE_ARGS[requirement.name] ?? {};
  try {
    const { error } = await client.rpc(requirement.name, args);
    if (isFunctionNotFound(error)) {
      return { requirement: requirement.name, kind: requirement.kind, critical: requirement.critical, status: "absent", detail: error?.message };
    }
    if (error) {
      return { requirement: requirement.name, kind: requirement.kind, critical: requirement.critical, status: "present", detail: `probe com sentinela sem efeito (${error.code ?? "erro"}); fun\xE7\xE3o respondeu` };
    }
    return { requirement: requirement.name, kind: requirement.kind, critical: requirement.critical, status: "present", detail: "sentinela aceito; fun\xE7\xE3o presente" };
  } catch (error) {
    return { requirement: requirement.name, kind: requirement.kind, critical: requirement.critical, status: "not_verifiable", detail: error instanceof Error ? error.message : String(error) };
  }
}
async function probeRemote() {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
    return { mode: "not_configured", results: [] };
  }
  const client = createClient3(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
    auth: { persistSession: false },
    db: { schema: "postspark" }
  });
  const results = [];
  for (const requirement of RUNTIME_MANIFEST.requirements) {
    if (requirement.kind === "table") results.push(await probeTable(client, requirement));
    else if (requirement.kind === "column") results.push(await probeColumn(client, requirement));
    else if (requirement.kind === "rpc") results.push(await probeRpc(client, requirement));
  }
  let buckets = [];
  try {
    const { data } = await client.storage.listBuckets();
    buckets = (data ?? []).map((bucket) => bucket.name);
  } catch {
    buckets = [];
  }
  return { mode: "probed", results, buckets };
}
async function runVerification() {
  const migrations = await validateMigrations();
  const remote = await probeRemote();
  const criticalMissing = remote.results.filter(
    (result) => result.critical && (result.status === "absent" || result.status === "incompatible")
  ).length;
  const requiredMissing = remote.results.filter(
    (result) => !result.critical && (result.status === "absent" || result.status === "incompatible")
  ).length;
  const invalidApplicableMigrations = migrations.filter(
    (migration) => migration.status === "invalid"
  ).length;
  const migrationHashes = migrations.map((migration) => ({
    file: migration.file,
    sha256: createHash2("sha256").update(fs.readFileSync(path.join(DRIZZLE_DIR, migration.file), "utf8")).digest("hex")
  }));
  const report = {
    command: "verify:runtime",
    version: 1,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    environment: {
      projectRef: maskProjectRef(ENV.supabaseUrl || ""),
      nodeEnv: ENV.isProduction ? "production" : "development",
      billingConfigured: Boolean(ENV.supabaseUrl && ENV.supabaseServiceRoleKey)
    },
    hashes: {
      manifest: manifestHash(),
      migrations: migrationHashes
    },
    local: { migrations },
    remote,
    summary: {
      criticalMissing,
      requiredMissing,
      invalidApplicableMigrations,
      ok: criticalMissing === 0 && invalidApplicableMigrations === 0
    }
  };
  return report;
}
function printSummary(report) {
  console.log(`
\u2500\u2500 VERIFY:RUNTIME \xB7 ${report.environment.projectRef} \xB7 ${report.timestamp} \u2500\u2500`);
  console.log(`manifesto:    ${report.hashes.manifest}`);
  console.log(`migrations:   ${report.local.migrations.length} arquivos (${report.local.migrations.filter((m) => m.status === "valid").length} v\xE1lidos, ${report.local.migrations.filter((m) => m.status === "invalid_historical").length} hist\xF3ricos inv\xE1lidos documentados, ${report.local.migrations.filter((m) => m.status === "invalid").length} inv\xE1lidos)`);
  if (report.remote.mode === "not_configured") {
    console.log("remoto:       SUPABASE_URL/SERVICE_ROLE_KEY ausentes \u2014 modo n\xE3o configurado");
  } else {
    console.log(`remoto:       ${report.remote.results.length} sondas (${report.remote.results.filter((r) => r.status === "present").length} presentes, ${report.remote.results.filter((r) => r.status === "absent").length} ausentes, ${report.remote.results.filter((r) => r.status === "incompatible").length} incompat\xEDveis, ${report.remote.results.filter((r) => r.status === "not_verifiable").length} n\xE3o verific\xE1veis)`);
    if (report.remote.buckets?.length) {
      console.log(`buckets:      ${report.remote.buckets.join(", ")}`);
    }
  }
  console.log(`resumo:       ${report.summary.criticalMissing} cr\xEDticos ausentes/incompat\xEDveis, ${report.summary.requiredMissing} n\xE3o-cr\xEDticos, ${report.summary.invalidApplicableMigrations} migrations inv\xE1lidas aplic\xE1veis`);
  console.log(report.summary.ok ? "\u2705 OK" : "\u274C FALHOU (requisito cr\xEDtico ausente ou migration inv\xE1lida)");
  const critical = report.remote.results.filter(
    (result) => result.critical && (result.status === "absent" || result.status === "incompatible")
  );
  if (critical.length > 0) {
    console.log("\nAUSENTES/INCOMPAT\xCDVEIS CR\xCDTICOS:");
    for (const result of critical) {
      console.log(`  - ${result.requirement} (${result.status})`);
      if (result.detail) console.log(`      ${result.detail}`);
    }
  }
}
async function main() {
  const healthMode = process.argv.includes("--health");
  const report = await runVerification();
  if (!healthMode) {
    printSummary(report);
    if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
    const outFile = path.join(REPORT_DIR, `verify-runtime-${report.timestamp.replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");
    console.log(`
relat\xF3rio:    ${outFile}`);
  } else {
    console.log(JSON.stringify({ ok: report.summary.ok, criticalMissing: report.summary.criticalMissing, requiredMissing: report.summary.requiredMissing }));
  }
  if (report.environment.projectRef === "invalid_url" || report.environment.projectRef === "unknown") {
    return 2;
  }
  return report.summary.ok ? 0 : 1;
}
var isMainModule = typeof process !== "undefined" && (process.argv[1]?.endsWith("verifyRuntime.ts") ?? false);
if (isMainModule) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error("verify:runtime failed:", error instanceof Error ? error.message : error);
    process.exitCode = 2;
  });
}

// server/_core/systemRouter.ts
var cachedAt = 0;
var cachedResult = null;
var CACHE_TTL_MS = 6e4;
async function runtimeHealth() {
  const now = Date.now();
  if (!cachedResult || now - cachedAt > CACHE_TTL_MS) {
    cachedResult = await runVerification();
    cachedAt = now;
  }
  return cachedResult;
}
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(async () => {
    const verification = await runtimeHealth();
    if (verification.remote.mode === "not_configured") {
      return {
        ok: true,
        mode: "dev",
        note: "SUPABASE_URL/SERVICE_ROLE_KEY ausentes \u2014 ambiente de desenvolvimento; execute npm run verify:runtime para auditoria completa."
      };
    }
    const critical = verification.remote.results.filter(
      (result) => result.critical && (result.status === "absent" || result.status === "incompatible")
    );
    const issues = critical.map(
      (result) => `[${result.status}] ${result.requirement}${result.detail ? ` \u2014 ${result.detail.slice(0, 140)}` : ""}`
    );
    return {
      ok: issues.length === 0,
      mode: "probed",
      issues,
      // Mensagem acionável sem expor segredos.
      action: issues.length > 0 ? "Requisito cr\xEDtico ausente/incompat\xEDvel. Consulte npm run verify:runtime (relat\xF3rio JSON em verify-output/) e aplique a migration corretiva drizzle/0015_harden_manifest_corrective.sql com autoriza\xE7\xE3o do dono." : void 0
    };
  }),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
import { z as z5 } from "zod";

// server/_core/llm.ts
init_env();

// server/_core/operationalLog.ts
import { appendFile, stat, writeFile } from "fs/promises";
import path2 from "path";
import { inspect } from "util";
var LOG_FILE = path2.resolve(process.cwd(), "OPERATIONAL_ERRORS.txt");
var MAX_FIELD_LENGTH = 4e3;
var MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024;
var VITE_ASSET_PATTERN = /^\/@(fs|react-refresh|id|vite)\b/;
function isViteDevRequest(url) {
  return VITE_ASSET_PATTERN.test(url);
}
async function rotateIfNeeded() {
  try {
    const stats = await stat(LOG_FILE);
    if (stats.size > MAX_LOG_SIZE_BYTES) {
      await writeFile(LOG_FILE, "# OPERATIONAL_ERRORS.txt (rotated)\n", "utf8");
    }
  } catch {
  }
}
var redact = (value) => value.replace(/(authorization\s*[:=]\s*)(bearer\s+)?[^\s,;}]+/gi, "$1[REDACTED]").replace(/(cookie\s*[:=]\s*)[^,;}]+/gi, "$1[REDACTED]").replace(/(access_token\s*[:=]\s*)[^,;}]+/gi, "$1[REDACTED]").replace(/(refresh_token\s*[:=]\s*)[^,;}]+/gi, "$1[REDACTED]").replace(/(api[_-]?key\s*[:=]\s*)[^,;}]+/gi, "$1[REDACTED]");
var truncate = (value) => value.length > MAX_FIELD_LENGTH ? `${value.slice(0, MAX_FIELD_LENGTH)}...[truncated ${value.length - MAX_FIELD_LENGTH} chars]` : value;
var serialize = (value) => {
  if (value instanceof Error) {
    return truncate(redact(value.stack || value.message));
  }
  if (typeof value === "string") {
    return truncate(redact(value));
  }
  return truncate(
    redact(
      inspect(value, {
        depth: 5,
        breakLength: 160,
        maxArrayLength: 50,
        maxStringLength: MAX_FIELD_LENGTH
      })
    )
  );
};
async function appendOperationalLog(event, details = {}) {
  const lines = [
    `[${(/* @__PURE__ */ new Date()).toISOString()}] ${event}`,
    ...Object.entries(details).map(([key, value]) => `${key}: ${serialize(value)}`),
    ""
  ];
  try {
    await rotateIfNeeded();
    await appendFile(LOG_FILE, `${lines.join("\n")}
`, "utf8");
  } catch {
  }
}
function installConsoleErrorFileLogging() {
  const originalError = console.error.bind(console);
  console.error = (...args) => {
    originalError(...args);
    void appendOperationalLog("CONSOLE_ERROR", {
      message: args.map(serialize).join(" ")
    });
  };
  process.on("unhandledRejection", (reason) => {
    void appendOperationalLog("UNHANDLED_REJECTION", { reason });
  });
  process.on("uncaughtException", (error) => {
    void appendOperationalLog("UNCAUGHT_EXCEPTION", { error });
  });
}
function httpStatusFileLogger(req, res, next) {
  const startedAt = Date.now();
  let responseBody;
  const originalJson = res.json.bind(res);
  res.json = ((body) => {
    responseBody = body;
    return originalJson(body);
  });
  const originalSend = res.send.bind(res);
  res.send = ((body) => {
    if (responseBody === void 0) {
      responseBody = body;
    }
    return originalSend(body);
  });
  res.on("finish", () => {
    if (res.statusCode < 400) return;
    const url = req.originalUrl || req.url || "";
    if (isViteDevRequest(url)) return;
    void appendOperationalLog("HTTP_ERROR", {
      method: req.method,
      url,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      responseBody
    });
  });
  next();
}

// server/_core/llm.ts
import { TRPCError as TRPCError3 } from "@trpc/server";

// server/ai/generationTrace.ts
init_db();
init_env();
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash as createHash3, randomUUID } from "node:crypto";
var storage = new AsyncLocalStorage();
function startGenerationTrace(input) {
  const trace = {
    ...input,
    id: randomUUID(),
    startedAt: Date.now(),
    calls: [],
    events: []
  };
  storage.enterWith(trace);
  return trace;
}
function recordLlmTraceCall(call) {
  storage.getStore()?.calls.push(call);
}
function recordGenerationEvent(event) {
  storage.getStore()?.events.push({
    ...event,
    at: (/* @__PURE__ */ new Date()).toISOString()
  });
}
function buildGenerationDebugTrace(input) {
  const { trace } = input;
  return {
    runId: trace.id,
    requestedModel: trace.requestedModel,
    effectiveModels: Array.from(
      new Set(trace.calls.map((call) => call.effectiveModel))
    ),
    startedAt: new Date(trace.startedAt).toISOString(),
    durationMs: Date.now() - trace.startedAt,
    calls: trace.calls,
    events: trace.events,
    strategies: input.strategies,
    evaluations: input.evaluations,
    finalOutput: input.output
  };
}
function hashPrompt(messages) {
  return createHash3("sha256").update(JSON.stringify(messages)).digest("hex");
}
function buildPromptSnapshot(trace) {
  const replayable = ENV.aiTraceStoreContent;
  return {
    version: 2,
    replayable,
    calls: trace.calls.map(({ messages, response, ...call }) => ({
      ...call,
      ...replayable ? { messages, response } : {}
    }))
  };
}
async function finishGenerationTrace(input) {
  const { trace } = input;
  const promptTokens = trace.calls.reduce(
    (sum, call) => sum + call.promptTokens,
    0
  );
  const completionTokens = trace.calls.reduce(
    (sum, call) => sum + call.completionTokens,
    0
  );
  const estimatedCostUsd = trace.calls.reduce(
    (sum, call) => sum + call.estimatedCostUsd,
    0
  );
  const evaluations = input.evaluations ?? [];
  const averageQualityScore = evaluations.length > 0 ? evaluations.reduce((sum, evaluation) => sum + evaluation.overallScore, 0) / evaluations.length : 0;
  const acceptedCount = evaluations.filter((evaluation) => evaluation.accepted).length;
  const redactedInput = `[sha256:${createHash3("sha256").update(trace.inputContent).digest("hex")}]`;
  try {
    await createGenerationRun({
      id: trace.id,
      userUuid: trace.userUuid,
      siteIntelligenceId: trace.siteIntelligenceId,
      status: input.status,
      inputType: trace.inputType,
      inputContent: ENV.aiTraceStoreContent ? trace.inputContent : redactedInput,
      platform: trace.platform,
      postMode: trace.postMode,
      creationMode: trace.creationMode,
      requestedModel: trace.requestedModel,
      effectiveModels: Array.from(
        new Set(trace.calls.map((call) => call.effectiveModel))
      ),
      promptSnapshot: buildPromptSnapshot(trace),
      strategySnapshot: ENV.aiTraceStoreContent ? input.strategies : void 0,
      evaluationSnapshot: input.evaluations,
      outputSnapshot: ENV.aiTraceStoreContent ? input.output : void 0,
      events: trace.events,
      // SPEC-004: contrato v2 — eventos do orquestrador canônico (SPEC-003),
      // incluindo `repair`, `generation_metrics` e stages de validação.
      eventsVersion: 2,
      revisionCount: input.revisionCount ?? 0,
      candidateCount: Array.isArray(input.output) ? input.output.length : evaluations.length,
      acceptedCount,
      averageQualityScore,
      strategyFallbackUsed: input.strategyFallbackUsed ?? false,
      originalityFallbackUsed: input.originalityFallbackUsed ?? false,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimatedCostUsd,
      latencyMs: Date.now() - trace.startedAt,
      errorMessage: input.error
    });
  } catch (error) {
    console.warn("[generationTrace] Could not persist generation run:", error);
  }
}

// server/ai/providers/modelAdapters.ts
function contentParts(content) {
  return Array.isArray(content) ? content : [content];
}
function hasMultimodalContent(messages) {
  return messages.some(
    (message) => contentParts(message.content).some(
      (part) => typeof part !== "string" && (part.type === "image_url" || part.type === "file_url")
    )
  );
}
function appendSystemInstruction(messages, instruction) {
  const systemIndex = messages.findIndex((message) => message.role === "system");
  if (systemIndex === -1) {
    return [{ role: "system", content: instruction }, ...messages];
  }
  return messages.map((message, index) => {
    if (index !== systemIndex) return message;
    const current = typeof message.content === "string" ? message.content : JSON.stringify(message.content);
    return {
      ...message,
      content: `${current}

${instruction}`
    };
  });
}
function adaptRequestForProvider(input) {
  if (input.provider !== "groq" || input.responseFormat?.type !== "json_schema") {
    return {
      messages: input.messages,
      responseFormat: input.responseFormat,
      schema: input.responseFormat?.type === "json_schema" ? input.responseFormat.json_schema : void 0,
      structuredOutputMode: input.responseFormat?.type === "json_schema" ? "native_schema" : void 0
    };
  }
  const schema = input.responseFormat.json_schema;
  if (input.effectiveModel === "openai/gpt-oss-120b" && !input.forceTextSchema) {
    return {
      messages: input.messages,
      responseFormat: input.responseFormat,
      schema,
      structuredOutputMode: "native_schema"
    };
  }
  const schemaInstruction = `ADAPTADOR DE SAIDA ESTRUTURADA:
Retorne SOMENTE um objeto JSON valido, sem markdown ou comentarios.
O objeto deve respeitar integralmente o JSON Schema abaixo.
Nao remova campos obrigatorios, nao crie propriedades extras e preserve os tipos.
JSON Schema (${schema.name}):
${JSON.stringify(schema.schema)}`;
  return {
    messages: appendSystemInstruction(input.messages, schemaInstruction),
    responseFormat: { type: "json_object" },
    schema,
    structuredOutputMode: "text_schema"
  };
}
function resolveReference(root, reference) {
  if (!reference.startsWith("#/")) return null;
  let current = root;
  for (const segment of reference.slice(2).split("/")) {
    if (!current || typeof current !== "object") return null;
    current = current[segment];
  }
  return current && typeof current === "object" ? current : null;
}
function validateNode(value, schema, root, path5, errors) {
  if (typeof schema.$ref === "string") {
    const resolved = resolveReference(root, schema.$ref);
    if (!resolved) {
      errors.push(`${path5}: referencia de schema nao resolvida`);
      return;
    }
    validateNode(value, resolved, root, path5, errors);
    return;
  }
  if ("const" in schema && value !== schema.const) {
    errors.push(`${path5}: valor diferente do const`);
    return;
  }
  if (Array.isArray(schema.allOf)) {
    for (const childSchema of schema.allOf) {
      if (childSchema && typeof childSchema === "object") {
        validateNode(
          value,
          childSchema,
          root,
          path5,
          errors
        );
      }
    }
  }
  for (const combinator of ["anyOf", "oneOf"]) {
    if (!Array.isArray(schema[combinator])) continue;
    const matches = schema[combinator].filter((childSchema) => {
      if (!childSchema || typeof childSchema !== "object") return false;
      const candidateErrors = [];
      validateNode(
        value,
        childSchema,
        root,
        path5,
        candidateErrors
      );
      return candidateErrors.length === 0;
    }).length;
    if (combinator === "anyOf" && matches === 0 || combinator === "oneOf" && matches !== 1) {
      errors.push(`${path5}: nao satisfaz ${combinator}`);
      return;
    }
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${path5}: valor fora do enum`);
    return;
  }
  const type = schema.type;
  if (Array.isArray(type)) {
    const matchesType = type.some((candidateType) => {
      const candidateErrors = [];
      validateNode(
        value,
        { ...schema, type: candidateType },
        root,
        path5,
        candidateErrors
      );
      return candidateErrors.length === 0;
    });
    if (!matchesType) errors.push(`${path5}: tipo nao permitido`);
    return;
  }
  if (type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${path5}: deveria ser objeto`);
      return;
    }
    const record = value;
    const properties = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required.filter((item) => typeof item === "string") : [];
    for (const key of required) {
      if (!(key in record)) errors.push(`${path5}.${key}: campo obrigatorio ausente`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(record)) {
        if (!(key in properties)) errors.push(`${path5}.${key}: propriedade extra`);
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (key in record) {
        validateNode(record[key], childSchema, root, `${path5}.${key}`, errors);
      }
    }
    return;
  }
  if (type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path5}: deveria ser array`);
      return;
    }
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${path5}: itens abaixo do minimo`);
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      errors.push(`${path5}: itens acima do maximo`);
    }
    if (schema.items && typeof schema.items === "object") {
      value.forEach(
        (item, index) => validateNode(
          item,
          schema.items,
          root,
          `${path5}[${index}]`,
          errors
        )
      );
    }
    return;
  }
  if (type === "string") {
    if (typeof value !== "string") {
      errors.push(`${path5}: deveria ser string`);
      return;
    }
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${path5}: texto abaixo do tamanho minimo`);
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      errors.push(`${path5}: texto acima do tamanho maximo`);
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path5}: texto fora do pattern`);
    }
  } else if (type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
    errors.push(`${path5}: deveria ser number`);
  } else if (type === "integer" && (typeof value !== "number" || !Number.isInteger(value))) {
    errors.push(`${path5}: deveria ser integer`);
  } else if (type === "boolean" && typeof value !== "boolean") {
    errors.push(`${path5}: deveria ser boolean`);
  } else if (type === "null" && value !== null) {
    errors.push(`${path5}: deveria ser null`);
  }
  if ((type === "number" || type === "integer") && typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(`${path5}: numero abaixo do minimo`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push(`${path5}: numero acima do maximo`);
    }
  }
}
function validateStructuredContent(content, schema) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { valid: false, errors: ["$: JSON invalido"] };
  }
  const errors = [];
  validateNode(parsed, schema.schema, schema.schema, "$", errors);
  return errors.length === 0 ? { valid: true, value: parsed } : { valid: false, errors: errors.slice(0, 12) };
}
function buildRepairMessages(input) {
  return [
    ...input.messages,
    {
      role: "assistant",
      content: input.invalidContent.slice(0, 2e4)
    },
    {
      role: "user",
      content: `A resposta anterior violou o contrato.
Erros detectados:
${input.errors.map((error) => `- ${error}`).join("\n")}

Corrija a resposta e devolva SOMENTE o objeto JSON completo conforme o schema ${input.schema.name}.`
    }
  ];
}

// server/ai/modelRouter.ts
init_env();
var OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
var GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
var GOOGLE_OPENAI_COMPAT_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
var GROQ_TEXT_MODEL = "openai/gpt-oss-120b";
var GROQ_SCOUT_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
var GEMINI_FALLBACK_MODEL = "gemini-2.5-flash";
var MODEL_COSTS = {
  "openai/gpt-5-mini": {
    inputCostPerMillion: 0.25,
    outputCostPerMillion: 2,
    platformFeePercent: ENV.openRouterPlatformFeePercent
  },
  "openai/gpt-oss-120b": {
    inputCostPerMillion: 0,
    outputCostPerMillion: 0
  },
  "meta-llama/llama-4-scout-17b-16e-instruct": {
    inputCostPerMillion: 0,
    outputCostPerMillion: 0
  },
  "gemini-2.5-flash": {
    inputCostPerMillion: 0.3,
    outputCostPerMillion: 2.5
  }
};
function normalizeModelForCost(model) {
  if (model.startsWith("openai/gpt-5-mini")) return "openai/gpt-5-mini";
  if (model.startsWith("gemini-2.5-flash")) return "gemini-2.5-flash";
  return model;
}
function getModelCostConfig(model) {
  return MODEL_COSTS[normalizeModelForCost(model)] ?? {
    inputCostPerMillion: ENV.llmInputCostPerMillion,
    outputCostPerMillion: ENV.llmOutputCostPerMillion
  };
}
function estimateModelCostUsd(input) {
  const costs = getModelCostConfig(input.model);
  const base = input.promptTokens / 1e6 * costs.inputCostPerMillion + input.completionTokens / 1e6 * costs.outputCostPerMillion;
  return base * (1 + (costs.platformFeePercent ?? 0) / 100);
}
function openRouterConfig(model) {
  if (!ENV.openRouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is required for the selected AI route.");
  }
  return {
    provider: "openrouter",
    apiUrl: OPENROUTER_CHAT_URL,
    apiKey: ENV.openRouterApiKey,
    effectiveModel: model,
    headers: {
      "HTTP-Referer": ENV.openRouterSiteUrl,
      "X-Title": ENV.openRouterAppName
    },
    providerOptions: {
      allow_fallbacks: true,
      data_collection: "deny"
    }
  };
}
function groqConfig(model) {
  if (!ENV.groqApiKey) {
    throw new Error("GROQ_API_KEY is required for the selected AI route.");
  }
  return {
    provider: "groq",
    apiUrl: GROQ_CHAT_URL,
    apiKey: ENV.groqApiKey,
    effectiveModel: model
  };
}
function resolveGeminiFallbackConfig() {
  if (ENV.geminiApiKey) {
    return {
      provider: "google",
      apiUrl: GOOGLE_OPENAI_COMPAT_URL,
      apiKey: ENV.geminiApiKey,
      effectiveModel: GEMINI_FALLBACK_MODEL
    };
  }
  if (ENV.forgeApiUrl && ENV.forgeApiKey) {
    return {
      provider: "forge",
      apiUrl: `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`,
      apiKey: ENV.forgeApiKey,
      effectiveModel: GEMINI_FALLBACK_MODEL
    };
  }
  throw new Error("Gemini fallback requires GEMINI_API_KEY or Forge configuration.");
}
function resolveTaskModelConfig(input) {
  const route = input.taskRoute;
  if (route === "microcopy") return groqConfig(GROQ_TEXT_MODEL);
  if (route === "fast_vision") return groqConfig(GROQ_SCOUT_MODEL);
  if (route === "fallback_text_or_vision") return resolveGeminiFallbackConfig();
  if (route === "content_strategy" || route === "static_generation" || route === "carousel_generation" || route === "post_evaluation" || route === "quality_revision" || route === "caption_synthesis") {
    return openRouterConfig(ENV.openRouterTextModel);
  }
  if (route === "vision_analysis" || input.containsMultimodalContent) {
    return openRouterConfig(ENV.openRouterVisionModel);
  }
  if (input.requestedModel === "gemini") return resolveGeminiFallbackConfig();
  if (input.requestedModel === "llama") return groqConfig(GROQ_TEXT_MODEL);
  return openRouterConfig(ENV.openRouterTextModel);
}
function canUseGeminiFallback() {
  return Boolean(ENV.geminiApiKey || ENV.forgeApiUrl && ENV.forgeApiKey);
}

// server/_core/llm.ts
var ensureArray = (value) => Array.isArray(value) ? value : [value];
var normalizeContentPart = (part) => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text") {
    return part;
  }
  if (part.type === "image_url") {
    return part;
  }
  if (part.type === "file_url") {
    return part;
  }
  throw new Error("Unsupported message content part");
};
var normalizeMessage = (message) => {
  const { role, name, tool_call_id } = message;
  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content).map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
    return {
      role,
      name,
      tool_call_id,
      content
    };
  }
  const contentParts2 = ensureArray(message.content).map(normalizeContentPart);
  if (contentParts2.length === 1 && contentParts2[0].type === "text") {
    return {
      role,
      name,
      content: contentParts2[0].text
    };
  }
  return {
    role,
    name,
    content: contentParts2
  };
};
var normalizeToolChoice = (toolChoice, tools) => {
  if (!toolChoice) return void 0;
  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }
  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }
    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }
    return {
      type: "function",
      function: { name: tools[0].function.name }
    };
  }
  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name }
    };
  }
  return toolChoice;
};
var normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema
}) => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }
  const schema = outputSchema || output_schema;
  if (!schema) return void 0;
  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }
  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...typeof schema.strict === "boolean" ? { strict: schema.strict } : {}
    }
  };
};
var StructuredOutputError = class extends Error {
  constructor(failureType, message) {
    super(message);
    this.failureType = failureType;
    this.name = "StructuredOutputError";
  }
};
var OPENROUTER_TASK_POLICY = {
  content_strategy: {
    temperature: 0.35,
    topP: 0.85,
    reasoningEffort: "minimal",
    timeoutMs: 12e3
  },
  static_generation: {
    temperature: 0.4,
    topP: 0.85,
    reasoningEffort: "minimal",
    // Ajustado de 35s: o gpt-5-mini via OpenRouter com strict JSON schema
    // frequentemente passa de 35s — o corte prematuro forçava 2 retries que
    // consumiam o deadline inteiro do run (rodagens manuais 2026-08-14,
    // runs d241c373 e c041215e: aborts aos ~35s e 504 por deadline).
    timeoutMs: 6e4
  },
  carousel_generation: {
    temperature: 0.45,
    topP: 0.85,
    reasoningEffort: "low",
    timeoutMs: 6e4
  },
  post_evaluation: {
    temperature: 0.25,
    topP: 0.85,
    reasoningEffort: "minimal",
    timeoutMs: 2e4
  },
  quality_revision: {
    temperature: 0.3,
    topP: 0.85,
    reasoningEffort: "minimal",
    // Ajustado de 25s: reparo real observado em ~34s; o corte forçava retry
    // dentro de um run já perto do deadline.
    timeoutMs: 6e4
  },
  caption_synthesis: {
    temperature: 0.5,
    topP: 0.9,
    reasoningEffort: "minimal",
    timeoutMs: 25e3
  }
};
function timeoutForTaskRoute(route) {
  return route ? OPENROUTER_TASK_POLICY[route]?.timeoutMs ?? ENV.llmRequestTimeoutMs : ENV.llmRequestTimeoutMs;
}
function isAiTaskRoute(value) {
  return value === "content_strategy" || value === "static_generation" || value === "carousel_generation" || value === "vision_analysis" || value === "microcopy" || value === "fast_vision" || value === "fallback_text_or_vision" || value === "post_evaluation" || value === "quality_revision" || value === "caption_synthesis";
}
function isTruncatedResult(result) {
  const choice = result.choices[0];
  const finish = `${choice?.finish_reason ?? ""} ${choice?.native_finish_reason ?? ""}`.toLowerCase();
  return finish.includes("length") || finish.includes("max_token") || finish.includes("max_output") || finish.includes("limit");
}
function classifyStructuredFailure(result, validationErrors) {
  const content = responseText(result).trim();
  if (!content) return "empty_content";
  if (isTruncatedResult(result)) return "truncated";
  if (validationErrors.some((error) => error.includes("JSON invalido"))) {
    return "invalid_json";
  }
  return "schema_mismatch";
}
function shouldAttemptStructuredRepair(type) {
  return type === "invalid_json" || type === "schema_mismatch";
}
function contentLength(result) {
  return result ? responseText(result).length : void 0;
}
function reasoningTokens(result) {
  return result?.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
}
function realOrEstimatedCostUsd(input) {
  if (typeof input.result?.usage?.cost === "number") {
    return input.result.usage.cost;
  }
  return estimateModelCostUsd({
    model: input.model,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens
  });
}
async function invokeLLM(params) {
  const {
    model,
    taskRoute,
    traceLabel = "llm",
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    disableFallback = false
  } = params;
  const normalizedMessages = messages.map(normalizeMessage);
  const containsMultimodalContent = hasMultimodalContent(normalizedMessages);
  const requestedModel = taskRoute ?? model ?? (containsMultimodalContent ? "vision_analysis" : "static_generation");
  const effectiveTaskRoute = taskRoute ?? (isAiTaskRoute(requestedModel) ? requestedModel : void 0);
  const configurationStartedAt = Date.now();
  let primaryConfig;
  try {
    primaryConfig = resolveTaskModelConfig({
      taskRoute,
      requestedModel: model,
      containsMultimodalContent
    });
  } catch (error) {
    recordLlmTraceCall({
      label: traceLabel,
      requestedModel,
      taskRoute: effectiveTaskRoute,
      effectiveModel: requestedModel,
      provider: "unconfigured",
      promptHash: hashPrompt(normalizedMessages),
      messages: normalizedMessages,
      response: void 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs: Date.now() - configurationStartedAt,
      estimatedCostUsd: 0,
      error: error instanceof Error ? error.message.slice(0, 500) : "Model configuration failed"
    });
    throw error;
  }
  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  const buildPayload = (config, adaptedMessages, adaptedFormat) => {
    const isGroqGptOss = config.provider === "groq" && config.effectiveModel === GROQ_TEXT_MODEL;
    const isScout = config.provider === "groq" && config.effectiveModel === GROQ_SCOUT_MODEL;
    const completionTokenLimit = params.maxCompletionTokens ?? params.max_completion_tokens ?? params.maxTokens ?? params.max_tokens ?? 2048;
    const payload = {
      model: config.effectiveModel,
      messages: adaptedMessages
    };
    if (isGroqGptOss) {
      payload.max_completion_tokens = completionTokenLimit;
      payload.temperature = params.temperature ?? 0.45;
      payload.top_p = params.topP ?? params.top_p ?? 0.9;
      payload.reasoning_effort = params.reasoningEffort ?? params.reasoning_effort ?? "low";
    } else if (config.provider === "openrouter") {
      const taskPolicy = effectiveTaskRoute ? OPENROUTER_TASK_POLICY[effectiveTaskRoute] : void 0;
      const reasoningEffort = params.reasoningEffort ?? params.reasoning_effort ?? taskPolicy?.reasoningEffort;
      payload.max_tokens = completionTokenLimit;
      payload.temperature = params.temperature ?? taskPolicy?.temperature ?? 0.55;
      payload.top_p = params.topP ?? params.top_p ?? taskPolicy?.topP ?? 0.9;
      if (reasoningEffort) {
        payload.reasoning_effort = reasoningEffort;
        payload.reasoning = { effort: reasoningEffort, exclude: true };
      }
      if (config.providerOptions) {
        payload.provider = config.providerOptions;
      }
    } else {
      payload.max_tokens = completionTokenLimit;
      if (typeof params.temperature === "number") {
        payload.temperature = params.temperature;
      }
      const topP = params.topP ?? params.top_p;
      if (typeof topP === "number") {
        payload.top_p = topP;
      }
    }
    if (isScout && completionTokenLimit > 2048) {
      payload.max_tokens = 2048;
    }
    if (tools && tools.length > 0) payload.tools = tools;
    if (normalizedToolChoice) payload.tool_choice = normalizedToolChoice;
    if (adaptedFormat) payload.response_format = adaptedFormat;
    return payload;
  };
  const extractPayloadOptions = (payload) => ({
    temperature: payload.temperature,
    top_p: payload.top_p,
    reasoning: payload.reasoning,
    reasoning_effort: payload.reasoning_effort,
    max_tokens: payload.max_tokens,
    max_completion_tokens: payload.max_completion_tokens
  });
  const estimateAndRecord = (input) => {
    const promptTokens = input.result?.usage?.prompt_tokens ?? 0;
    const completionTokens = input.result?.usage?.completion_tokens ?? 0;
    const totalTokens = input.result?.usage?.total_tokens ?? promptTokens + completionTokens;
    const latencyMs = Date.now() - input.startedAt;
    const estimatedCostUsd = realOrEstimatedCostUsd({
      result: input.result,
      model: input.result?.model || input.config.effectiveModel,
      promptTokens,
      completionTokens
    });
    const error = input.error instanceof Error ? input.error.message.slice(0, 500) : input.error ? String(input.error).slice(0, 500) : void 0;
    recordLlmTraceCall({
      label: traceLabel,
      requestedModel,
      taskRoute: effectiveTaskRoute,
      effectiveModel: input.result?.model || input.config.effectiveModel,
      provider: input.config.provider,
      promptHash: hashPrompt(input.adaptedMessages),
      messages: input.adaptedMessages,
      response: input.result,
      promptTokens,
      completionTokens,
      totalTokens,
      latencyMs,
      estimatedCostUsd,
      attempt: input.attempt,
      fallbackFrom: input.fallbackFrom,
      translatedSchema: input.translatedSchema,
      structuredOutputMode: input.structuredOutputMode,
      payloadOptions: input.payloadOptions,
      reasoningTokens: reasoningTokens(input.result),
      finishReason: input.result?.choices?.[0]?.finish_reason,
      nativeFinishReason: input.result?.choices?.[0]?.native_finish_reason,
      contentLength: contentLength(input.result),
      structuredFailureType: input.structuredFailureType,
      repairedOutput: input.repairedOutput,
      error
    });
    void appendOperationalLog(input.result ? "AI_PROVIDER_200" : "AI_PROVIDER_ATTEMPT_FAILED", {
      traceLabel,
      requestedModel,
      taskRoute: effectiveTaskRoute,
      provider: input.config.provider,
      effectiveModel: input.result?.model || input.config.effectiveModel,
      attempt: input.attempt,
      fallbackFrom: input.fallbackFrom,
      translatedSchema: input.translatedSchema,
      structuredOutputMode: input.structuredOutputMode,
      payloadOptions: input.payloadOptions,
      reasoningTokens: reasoningTokens(input.result),
      finishReason: input.result?.choices?.[0]?.finish_reason,
      nativeFinishReason: input.result?.choices?.[0]?.native_finish_reason,
      contentLength: contentLength(input.result),
      structuredFailureType: input.structuredFailureType,
      repairedOutput: input.repairedOutput,
      promptHash: hashPrompt(input.adaptedMessages),
      promptTokens,
      completionTokens,
      totalTokens,
      latencyMs,
      estimatedCostUsd,
      responseId: input.result?.id,
      error
    });
  };
  const callProvider = async (config, payload) => {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      timeoutForTaskRoute(effectiveTaskRoute)
    );
    try {
      const response = await fetch(config.apiUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
          ...config.headers
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (!response.ok) {
        const errorBody = (await response.text()).slice(0, 500);
        void appendOperationalLog("AI_PROVIDER_NON_200", {
          provider: config.provider,
          model: config.effectiveModel,
          statusCode: response.status,
          statusText: response.statusText,
          retryAfter: response.headers.get("retry-after"),
          body: errorBody
        });
        throw new ProviderRequestError(
          config.provider,
          response.status,
          response.statusText,
          errorBody,
          parseRetryAfterMs(response.headers.get("retry-after"))
        );
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ProviderRequestError) throw error;
      void appendOperationalLog("AI_PROVIDER_REQUEST_ERROR", {
        provider: config.provider,
        model: config.effectiveModel,
        error
      });
      throw new ProviderRequestError(
        config.provider,
        void 0,
        error instanceof Error ? error.message : "Network request failed"
      );
    } finally {
      clearTimeout(timeout);
    }
  };
  const repairGroqOutput = async (input) => {
    if (!input.adapted.schema) {
      throw new Error("Schema ausente para reparo do output");
    }
    const repairMessages = buildRepairMessages({
      messages: input.adapted.messages,
      invalidContent: input.invalidContent,
      schema: input.adapted.schema,
      errors: input.errors
    });
    const startedAt = Date.now();
    try {
      const result = await callProvider(
        input.config,
        buildPayload(
          input.config,
          repairMessages,
          input.adapted.responseFormat ?? { type: "json_object" }
        )
      );
      const content = responseText(result);
      const validation = validateStructuredContent(
        content,
        input.adapted.schema
      );
      if (!validation.valid) {
        throw new Error(
          `Structured output repair did not satisfy schema: ${validation.errors.join("; ")}`
        );
      }
      estimateAndRecord({
        config: input.config,
        result,
        adaptedMessages: repairMessages,
        startedAt,
        attempt: 1,
        fallbackFrom: input.fallbackFrom,
        translatedSchema: input.adapted.structuredOutputMode === "text_schema",
        structuredOutputMode: input.adapted.structuredOutputMode,
        payloadOptions: extractPayloadOptions(
          buildPayload(
            input.config,
            repairMessages,
            input.adapted.responseFormat ?? { type: "json_object" }
          )
        ),
        repairedOutput: true
      });
      return result;
    } catch (error) {
      estimateAndRecord({
        config: input.config,
        adaptedMessages: repairMessages,
        startedAt,
        attempt: 1,
        fallbackFrom: input.fallbackFrom,
        translatedSchema: input.adapted.structuredOutputMode === "text_schema",
        structuredOutputMode: input.adapted.structuredOutputMode,
        payloadOptions: extractPayloadOptions(
          buildPayload(
            input.config,
            repairMessages,
            input.adapted.responseFormat ?? { type: "json_object" }
          )
        ),
        repairedOutput: true,
        error
      });
      throw error;
    }
  };
  const executeWithRetries = async (config, fallbackFrom) => {
    const buildAdaptedRequest = (forceTextSchema = false) => adaptRequestForProvider({
      provider: config.provider,
      effectiveModel: config.effectiveModel,
      forceTextSchema,
      messages: normalizedMessages,
      responseFormat: normalizedResponseFormat
    });
    let adapted = buildAdaptedRequest();
    let lastError;
    let maxAttempts = ENV.llmTransientRetries + 1;
    let downgradedNativeSchema = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const startedAt = Date.now();
      const payload = buildPayload(config, adapted.messages, adapted.responseFormat);
      try {
        const result = await callProvider(config, payload);
        if (adapted.schema) {
          const content = responseText(result);
          const validation = validateStructuredContent(content, adapted.schema);
          if (!validation.valid) {
            const structuredFailureType = classifyStructuredFailure(
              result,
              validation.errors
            );
            estimateAndRecord({
              config,
              result,
              adaptedMessages: adapted.messages,
              startedAt,
              attempt,
              fallbackFrom,
              translatedSchema: adapted.structuredOutputMode === "text_schema",
              structuredOutputMode: adapted.structuredOutputMode,
              payloadOptions: extractPayloadOptions(payload),
              structuredFailureType,
              error: new Error(
                `Structured output validation failed: ${validation.errors.join("; ")}`
              )
            });
            if (!shouldAttemptStructuredRepair(structuredFailureType)) {
              throw new StructuredOutputError(
                structuredFailureType,
                `Structured output ${structuredFailureType}; skipping repair`
              );
            }
            return repairGroqOutput({
              config,
              adapted,
              invalidContent: content,
              errors: validation.errors,
              fallbackFrom
            });
          }
        }
        estimateAndRecord({
          config,
          result,
          adaptedMessages: adapted.messages,
          startedAt,
          attempt,
          fallbackFrom,
          translatedSchema: adapted.structuredOutputMode === "text_schema",
          structuredOutputMode: adapted.structuredOutputMode,
          payloadOptions: extractPayloadOptions(payload)
        });
        return result;
      } catch (error) {
        lastError = error;
        estimateAndRecord({
          config,
          adaptedMessages: adapted.messages,
          startedAt,
          attempt,
          fallbackFrom,
          translatedSchema: adapted.structuredOutputMode === "text_schema",
          structuredOutputMode: adapted.structuredOutputMode,
          payloadOptions: extractPayloadOptions(payload),
          structuredFailureType: error instanceof StructuredOutputError ? error.failureType : void 0,
          error
        });
        if (shouldDowngradeGroqSchema(error, config, adapted) && !downgradedNativeSchema) {
          adapted = buildAdaptedRequest(true);
          downgradedNativeSchema = true;
          maxAttempts += 1;
          continue;
        }
        if (attempt >= maxAttempts || !isTransientProviderError(error)) {
          throw error;
        }
        const providerDelay = error instanceof ProviderRequestError ? error.retryAfterMs : void 0;
        await sleep(Math.max(retryDelayMs(attempt), providerDelay ?? 0));
      }
    }
    throw lastError;
  };
  try {
    return await executeWithRetries(primaryConfig);
  } catch (primaryError) {
    const canFallback = primaryConfig.provider !== "google" && primaryConfig.provider !== "forge" && !disableFallback && ENV.aiModelFallbackEnabled && canUseGeminiFallback() && (!tools || tools.length === 0) && isTransientProviderError(primaryError);
    if (!canFallback) {
      throw toPublicLlmError(primaryError);
    }
    try {
      const fallbackConfig = resolveGeminiFallbackConfig();
      return await executeWithRetries(
        fallbackConfig,
        primaryConfig.effectiveModel
      );
    } catch (fallbackError) {
      throw new TRPCError3({
        code: "BAD_GATEWAY",
        message: "Os provedores de IA estao temporariamente indisponiveis. Tente novamente em alguns instantes.",
        cause: fallbackError
      });
    }
  }
}
var ProviderRequestError = class extends Error {
  constructor(provider, status, statusText, body, retryAfterMs) {
    super(
      `${provider} API failed${status ? `: ${status}` : ""}${statusText ? ` ${statusText}` : ""}${body ? ` - ${body}` : ""}`
    );
    this.provider = provider;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.name = "ProviderRequestError";
  }
};
function parseRetryAfterMs(value) {
  if (!value) return void 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.min(3e4, Math.max(0, seconds * 1e3));
  }
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return void 0;
  return Math.min(3e4, Math.max(0, date - Date.now()));
}
function isTransientStatus(status) {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}
function isTransientProviderError(error) {
  return error instanceof ProviderRequestError && (error.status === void 0 || isTransientStatus(error.status));
}
function shouldDowngradeGroqSchema(error, config, adapted) {
  return config.provider === "groq" && adapted.structuredOutputMode === "native_schema" && error instanceof ProviderRequestError && (error.status === 400 || error.status === 422);
}
function retryDelayMs(attempt) {
  const exponential = ENV.llmRetryBaseDelayMs * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.round(Math.random() * ENV.llmRetryBaseDelayMs * 0.35);
  return exponential + jitter;
}
function sleep(milliseconds) {
  return new Promise((resolve2) => setTimeout(resolve2, milliseconds));
}
function responseText(result) {
  const content = result.choices[0]?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
}
function toPublicLlmError(error) {
  if (!(error instanceof ProviderRequestError)) {
    return error instanceof Error ? error : new Error("LLM call failed");
  }
  if (isTransientProviderError(error)) {
    return new TRPCError3({
      code: error.status === 429 ? "TOO_MANY_REQUESTS" : "BAD_GATEWAY",
      message: "O provedor de IA esta temporariamente indisponivel. Tente novamente em alguns instantes.",
      cause: error
    });
  }
  return new TRPCError3({
    code: "BAD_GATEWAY",
    message: error.message,
    cause: error
  });
}

// server/storage.ts
init_env();
function getStorageConfig() {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;
  if (!baseUrl || !apiKey) {
    throw new Error(
      "Storage proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}
function buildUploadUrl(baseUrl, relKey) {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}
function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function toFormData(data, contentType, fileName) {
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}
function buildAuthHeaders(apiKey) {
  return { Authorization: `Bearer ${apiKey}` };
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const { baseUrl, apiKey } = getStorageConfig();
  const key = normalizeKey(relKey);
  const uploadUrl = buildUploadUrl(baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: formData
  });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage upload failed (${response.status} ${response.statusText}): ${message}`
    );
  }
  const url = (await response.json()).url;
  return { key, url };
}

// server/imageGenerateBackground.ts
init_env();
function wrapPrompt(userPrompt) {
  return `Photorealistic or abstract background art for a social media post. Theme: ${userPrompt}. High quality, vibrant colors. Absolutely no text, no letters, no words, no logos, no typography, no watermarks, no fake app UI elements. Leave clean visual breathing room for editable foreground copy.`;
}
function candidateFromImageNode(value) {
  if (typeof value === "string") return { value };
  if (!value || typeof value !== "object") return null;
  const node = value;
  const imageUrl = node.image_url ?? node.imageUrl;
  if (typeof imageUrl === "string") return { value: imageUrl };
  if (imageUrl && typeof imageUrl === "object") {
    const url = imageUrl.url;
    if (typeof url === "string") return { value: url };
  }
  if (typeof node.url === "string") return { value: node.url };
  const inlineData = node.inline_data ?? node.inlineData;
  if (inlineData && typeof inlineData === "object") {
    const data = inlineData.data;
    const mimeType = inlineData.mime_type ?? inlineData.mimeType;
    if (typeof data === "string") {
      return { value: data, mimeType: typeof mimeType === "string" ? mimeType : void 0 };
    }
  }
  if (typeof node.data === "string") {
    const mimeType = node.mime_type ?? node.mimeType;
    return {
      value: node.data,
      mimeType: typeof mimeType === "string" ? mimeType : void 0
    };
  }
  return null;
}
function collectImageCandidates(response) {
  if (!response || typeof response !== "object") return [];
  const output = [];
  const choices = response.choices;
  if (!Array.isArray(choices)) return output;
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const message = choice.message;
    if (!message || typeof message !== "object") continue;
    const messageRecord = message;
    if (Array.isArray(messageRecord.images)) {
      for (const image of messageRecord.images) {
        const candidate = candidateFromImageNode(image);
        if (candidate) output.push(candidate);
      }
    }
    if (Array.isArray(messageRecord.content)) {
      for (const part of messageRecord.content) {
        if (!part || typeof part !== "object") continue;
        const type = part.type;
        if (type !== "image" && type !== "image_url" && type !== "output_image") continue;
        const candidate = candidateFromImageNode(part);
        if (candidate) output.push(candidate);
      }
    }
  }
  return output;
}
function detectImageMimeType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) {
    return "image/jpeg";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))) {
    return "image/gif";
  }
  return null;
}
function validatedDataUri(base64, declaredMimeType) {
  const normalized = base64.replace(/\s/g, "");
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error("Image payload is not valid base64");
  }
  const buffer = Buffer.from(normalized, "base64");
  const detectedMimeType = detectImageMimeType(buffer);
  if (!detectedMimeType) {
    throw new Error(`Image payload has an invalid binary signature${declaredMimeType ? ` (declared ${declaredMimeType})` : ""}`);
  }
  return `data:${detectedMimeType};base64,${buffer.toString("base64")}`;
}
async function toDataUri(candidate) {
  const dataUri = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(candidate.value);
  if (dataUri) return validatedDataUri(dataUri[2], dataUri[1]);
  if (/^https?:\/\//i.test(candidate.value)) {
    const response = await fetch(candidate.value);
    if (!response.ok) {
      throw new Error(`Image URL fetch failed: ${response.status} ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return validatedDataUri(buffer.toString("base64"), response.headers.get("content-type") ?? void 0);
  }
  return validatedDataUri(candidate.value, candidate.mimeType);
}
async function generateWithOpenRouter(prompt, provider) {
  if (!ENV.openRouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured for image generation");
  }
  console.info("[ImageGen] Calling image service", {
    service: "OpenRouter",
    model: ENV.openRouterImageModel,
    qualityMode: provider
  });
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.openRouterApiKey}`,
      "HTTP-Referer": ENV.openRouterSiteUrl,
      "X-Title": ENV.openRouterAppName
    },
    body: JSON.stringify({
      model: ENV.openRouterImageModel,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${wrapPrompt(prompt)}

Output requirements:
- Generate one square 1080x1080 social media background image.
- Quality level: ${provider === "pollinations_hd" ? "high detail" : "fast production quality"}.
- Return the image result; do not return explanatory text.`
            }
          ]
        }
      ],
      modalities: ["image", "text"],
      provider: {
        allow_fallbacks: true,
        data_collection: "deny"
      }
    })
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 500);
    void appendOperationalLog("IMAGE_PROVIDER_NON_200", {
      provider: "openrouter",
      model: ENV.openRouterImageModel,
      statusCode: response.status,
      statusText: response.statusText,
      body
    });
    throw new Error(`OpenRouter image generation failed: ${response.status} ${response.statusText}`);
  }
  const json = await response.json();
  const candidates = collectImageCandidates(json);
  console.log("[ImageGen] Collected structured image candidates:", candidates.length);
  if (candidates.length === 0) {
    throw new Error("OpenRouter image response did not contain an image payload");
  }
  let image = null;
  let lastValidationError;
  for (const candidate of candidates) {
    try {
      image = await toDataUri(candidate);
      break;
    } catch (error) {
      lastValidationError = error;
    }
  }
  if (!image) {
    throw new Error("OpenRouter image response contained no valid image payload", {
      cause: lastValidationError
    });
  }
  console.info("[ImageGen] Image service succeeded", {
    service: "OpenRouter",
    model: ENV.openRouterImageModel,
    qualityMode: provider
  });
  return image;
}
async function generateWithPollinations(prompt, provider) {
  const modelId = provider === "pollinations_hd" ? "nanobanana-pro" : "nanobanana";
  const encodedPrompt = encodeURIComponent(wrapPrompt(prompt));
  const url = `https://gen.pollinations.ai/image/${encodedPrompt}?model=${modelId}&nologo=true&width=1080&height=1080&enhance=true`;
  console.info("[ImageGen] Calling image service", {
    service: "Pollinations.ai",
    model: modelId,
    qualityMode: provider
  });
  const headers = {
    "User-Agent": "PostSpark/1.0",
    Accept: "image/jpeg, image/png, image/*"
  };
  if (process.env.POLLINATIONS_API_KEY) {
    headers.Authorization = `Bearer ${process.env.POLLINATIONS_API_KEY}`;
  }
  const response = await fetch(url, { method: "GET", headers });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    void appendOperationalLog("IMAGE_PROVIDER_NON_200", {
      provider: "pollinations",
      model: modelId,
      statusCode: response.status,
      statusText: response.statusText,
      body: errorText.slice(0, 500)
    });
    throw new Error(`Pollinations API failed: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const dataUri = `data:image/jpeg;base64,${buffer.toString("base64")}`;
  console.info("[ImageGen] Image service succeeded", {
    service: "Pollinations.ai",
    model: modelId,
    qualityMode: provider
  });
  return dataUri;
}
async function generateBackgroundImage(prompt, provider = "pollinations_fast") {
  console.info("[ImageGen] Image generation requested", {
    primaryService: "OpenRouter",
    primaryModel: ENV.openRouterImageModel,
    fallbackService: "Pollinations.ai",
    qualityMode: provider
  });
  try {
    const image = await generateWithOpenRouter(prompt, provider);
    void appendOperationalLog("IMAGE_PROVIDER_200", {
      provider: "openrouter",
      model: ENV.openRouterImageModel,
      imageProvider: provider
    });
    return image;
  } catch (error) {
    console.warn("[ImageGen] Switching image service", {
      failedService: "OpenRouter",
      failedModel: ENV.openRouterImageModel,
      nextService: "Pollinations.ai",
      qualityMode: provider,
      error
    });
    void appendOperationalLog("IMAGE_PROVIDER_FALLBACK", {
      fromProvider: "openrouter",
      fromModel: ENV.openRouterImageModel,
      toProvider: "pollinations",
      error
    });
  }
  return generateWithPollinations(prompt, provider);
}

// server/_core/imageGeneration.ts
async function generateImage(options) {
  const sourceImageNote = options.originalImages && options.originalImages.length > 0 ? " Use the provided reference image(s) as style/content guidance when supported." : "";
  const dataUri = await generateBackgroundImage(
    `${options.prompt}.${sourceImageNote}`,
    "pollinations_hd"
  );
  try {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUri);
    if (match) {
      const [, mimeType, base64Data] = match;
      const buffer = Buffer.from(base64Data, "base64");
      const { url } = await storagePut(
        `generated/${Date.now()}.png`,
        buffer,
        mimeType
      );
      if (url) return { url };
    }
  } catch (storageErr) {
    console.info("[imageGeneration] Storage proxy local bypass, using direct DataURI.");
  }
  return {
    url: dataUri
  };
}

// server/routers.ts
init_db();

// server/screenshotService.ts
var SCREENSHOT_SERVICE_URL = process.env.SCREENSHOT_SERVICE_URL;
var DEFAULT_TIMEOUT_MS = 3e4;
var BATCH_TIMEOUT_MS = 9e4;
function serviceUrl(path5) {
  return `${SCREENSHOT_SERVICE_URL}${path5}`;
}
function warnMissing(fn) {
  console.warn(`[screenshotService] ${fn}: SCREENSHOT_SERVICE_URL not configured`);
  return null;
}
async function captureScreenshot(url, type = "desktop") {
  console.log(`[screenshotService] Capturing ${type} screenshot for: ${url}`);
  if (!SCREENSHOT_SERVICE_URL) return warnMissing("captureScreenshot");
  const endpoint = type === "mobile" ? "/screenshot/mobile" : "/screenshot";
  try {
    const response = await fetch(serviceUrl(endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        viewport: type === "desktop" ? { width: 1440, height: 900 } : void 0
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });
    if (!response.ok) {
      console.warn(`[screenshotService] /screenshot error: ${response.status} ${response.statusText}`);
      return null;
    }
    console.log(`[screenshotService] ${type} screenshot captured \u2713`);
    return await response.arrayBuffer();
  } catch (error) {
    console.warn(`[screenshotService] captureScreenshot failed:`, error);
    return null;
  }
}
async function captureMultipleScreenshots(urls, viewport = { width: 1440, height: 900 }, maxPages = 5) {
  if (!SCREENSHOT_SERVICE_URL) {
    warnMissing("captureMultipleScreenshots");
    return {};
  }
  if (urls.length === 0) return {};
  console.log(`[screenshotService] Multi-capture: ${urls.length} URL(s)`);
  try {
    const response = await fetch(serviceUrl("/screenshot/multi"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls, viewport, maxPages }),
      signal: AbortSignal.timeout(BATCH_TIMEOUT_MS)
    });
    if (!response.ok) {
      console.warn(`[screenshotService] /screenshot/multi error: ${response.status}`);
      return {};
    }
    const json = await response.json();
    if (Object.keys(json.errors).length > 0) {
      console.warn("[screenshotService] Multi-capture partial errors:", json.errors);
    }
    const result = {};
    for (const [url, b64] of Object.entries(json.screenshots)) {
      result[url] = Buffer.from(b64, "base64").buffer;
    }
    console.log(`[screenshotService] Multi-capture: ${Object.keys(result).length}/${urls.length} succeeded \u2713`);
    return result;
  } catch (error) {
    console.warn(`[screenshotService] captureMultipleScreenshots failed:`, error);
    return {};
  }
}
async function captureElements(url, selectors, viewport = { width: 1440, height: 900 }) {
  if (!SCREENSHOT_SERVICE_URL) {
    warnMissing("captureElements");
    return {};
  }
  if (selectors.length === 0) return {};
  console.log(`[screenshotService] Element capture: ${selectors.length} selector(s) on ${url}`);
  try {
    const response = await fetch(serviceUrl("/screenshot/element"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, selectors, viewport }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });
    if (!response.ok) {
      console.warn(`[screenshotService] /screenshot/element error: ${response.status}`);
      return {};
    }
    const json = await response.json();
    if (json.notFound.length > 0) {
      console.log(`[screenshotService] Elements not found: ${json.notFound.join(", ")}`);
    }
    const result = {};
    for (const [sel, b64] of Object.entries(json.elements)) {
      result[sel] = Buffer.from(b64, "base64").buffer;
    }
    console.log(`[screenshotService] Element capture: ${Object.keys(result).length}/${selectors.length} found \u2713`);
    return result;
  } catch (error) {
    console.warn(`[screenshotService] captureElements failed:`, error);
    return {};
  }
}
async function discoverPages(url, maxLinks = 8) {
  if (!SCREENSHOT_SERVICE_URL) {
    warnMissing("discoverPages");
    return [];
  }
  console.log(`[screenshotService] Discovering pages for: ${url}`);
  try {
    const response = await fetch(serviceUrl("/discover"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, maxLinks }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });
    if (!response.ok) {
      console.warn(`[screenshotService] /discover error: ${response.status}`);
      return [];
    }
    const json = await response.json();
    console.log(`[screenshotService] Discovered ${json.discoveredPages.length} pages \u2713`);
    return json.discoveredPages;
  } catch (error) {
    console.warn(`[screenshotService] discoverPages failed:`, error);
    return [];
  }
}

// server/visionExtractor.ts
async function extractStylesFromScreenshot(screenshotBase64, url) {
  console.log("[visionExtractor] Analyzing screenshot for:", url);
  const response = await invokeLLM({
    traceLabel: "vision_style_extraction",
    taskRoute: "vision_analysis",
    messages: [
      {
        role: "system",
        content: `You are an expert visual design analyst, trained like a Senior Art Director.
Analyze website screenshots and extract precise visual design tokens.

For COLORS: Look at actual pixel colors in the screenshot. Identify:
- The dominant background color of the page
- The main text color
- The primary brand/accent color (buttons, links, highlights)
- A secondary color if visible
Report EXACT hex values from what you see \u2014 not generic defaults.

For TYPOGRAPHY: Identify whether fonts appear to be:
- Serif (like Times, Georgia, Playfair Display)
- Sans-serif (like Inter, Roboto, Helvetica)
- Monospace (like Courier, Fira Code)
- Display/decorative
Report the most likely font category, not exact font names.

For SPACING: Assess overall density and border-radius style from the UI.

Be precise and specific. Every website has a unique visual identity \u2014 capture it.`
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyze this website screenshot (${url}) and extract the visual design system.
Return precise hex color values based on what you actually see in the image.`
          },
          {
            type: "image_url",
            image_url: {
              url: screenshotBase64,
              detail: "high"
            }
          }
        ]
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "vision_style_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            colors: {
              type: "object",
              properties: {
                primary: { type: "string", description: "Primary brand color hex (buttons, links, brand elements)" },
                secondary: { type: "string", description: "Secondary color hex" },
                background: { type: "string", description: "Main page background color hex" },
                text: { type: "string", description: "Main body text color hex" },
                accent: { type: "string", description: "Accent/highlight color hex (CTAs, hover states)" }
              },
              required: ["primary", "secondary", "background", "text", "accent"],
              additionalProperties: false
            },
            typography: {
              type: "object",
              properties: {
                headingFont: { type: "string", description: "Heading font name or category (e.g. 'Inter, sans-serif' or 'serif')" },
                bodyFont: { type: "string", description: "Body font name or category" }
              },
              required: ["headingFont", "bodyFont"],
              additionalProperties: false
            },
            spacing: {
              type: "object",
              properties: {
                density: { type: "string", enum: ["compact", "normal", "spacious"] },
                borderRadius: { type: "string", enum: ["square", "rounded", "pill"] }
              },
              required: ["density", "borderRadius"],
              additionalProperties: false
            },
            effects: {
              type: "object",
              properties: {
                shadows: { type: "boolean", description: "Does the UI use visible box shadows?" },
                gradients: { type: "boolean", description: "Are gradients visible in the design?" },
                darkMode: { type: "boolean", description: "Is this a dark-themed website?" }
              },
              required: ["shadows", "gradients", "darkMode"],
              additionalProperties: false
            },
            aesthetic: {
              type: "string",
              description: "Overall design aesthetic in 2-3 words (e.g. 'modern minimalist', 'bold corporate', 'playful colorful')"
            }
          },
          required: ["colors", "typography", "spacing", "effects", "aesthetic"],
          additionalProperties: false
        }
      }
    }
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from Vision LLM");
  const contentStr = typeof content === "string" ? content : JSON.stringify(content);
  const parsed = JSON.parse(contentStr);
  console.log("[visionExtractor] Vision extraction result:", {
    colors: parsed.colors,
    aesthetic: parsed.aesthetic,
    darkMode: parsed.effects.darkMode
  });
  return parsed;
}
function mergeExtractionResults(html, vision) {
  const isDefaultColor = (hex) => ["#6366f1", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"].includes(hex);
  const isDefaultFont = (font) => font === "Inter, sans-serif" || font === "Inter";
  return {
    colors: {
      // Vision colors take precedence when HTML returned defaults
      primary: isDefaultColor(html.colors.primary) ? vision.colors.primary : html.colors.primary,
      secondary: isDefaultColor(html.colors.secondary) ? vision.colors.secondary : html.colors.secondary,
      background: html.colors.background === "#ffffff" && vision.effects.darkMode ? vision.colors.background : isDefaultColor(html.colors.background) ? vision.colors.background : html.colors.background,
      text: html.colors.text === "#1f2937" && vision.effects.darkMode ? vision.colors.text : isDefaultColor(html.colors.text) ? vision.colors.text : html.colors.text,
      accent: isDefaultColor(html.colors.accent) ? vision.colors.accent : html.colors.accent,
      // Build palette from both sources
      palette: buildMergedPalette(html, vision)
    },
    typography: {
      // HTML font names are more precise (actual font names vs vision guesses)
      // But if HTML returned defaults, use vision's font category
      headingFont: isDefaultFont(html.typography.headingFont) ? vision.typography.headingFont : html.typography.headingFont,
      bodyFont: isDefaultFont(html.typography.bodyFont) ? vision.typography.bodyFont : html.typography.bodyFont,
      headingWeight: html.typography.headingWeight,
      bodyWeight: html.typography.bodyWeight
    },
    spacing: {
      // Vision spacing is usually more accurate (sees the actual rendered layout)
      density: html.spacing.density === "normal" ? vision.spacing.density : html.spacing.density,
      borderRadius: html.spacing.borderRadius === "rounded" ? vision.spacing.borderRadius : html.spacing.borderRadius,
      padding: html.spacing.padding
    },
    effects: {
      shadows: html.effects.shadows || vision.effects.shadows,
      gradients: html.effects.gradients || vision.effects.gradients,
      animations: html.effects.animations,
      glassmorphism: html.effects.glassmorphism,
      noise: html.effects.noise
    },
    metadata: html.metadata
  };
}
function buildMergedPalette(html, vision) {
  const seen = /* @__PURE__ */ new Set();
  const palette = [];
  for (const color of [vision.colors.primary, vision.colors.accent, vision.colors.secondary, vision.colors.background, vision.colors.text]) {
    const lower = color.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      palette.push(lower);
    }
  }
  const defaults = /* @__PURE__ */ new Set(["#6366f1", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#ffffff", "#1f2937"]);
  for (const color of html.colors.palette) {
    const lower = color.toLowerCase();
    if (!seen.has(lower) && !defaults.has(lower)) {
      seen.add(lower);
      palette.push(lower);
    }
  }
  return palette.slice(0, 8);
}
function assessExtractionQuality(data) {
  let score = 0;
  const defaultColors = /* @__PURE__ */ new Set(["#6366f1", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"]);
  const realColors = data.colors.palette.filter((c) => !defaultColors.has(c));
  if (realColors.length >= 3) score += 0.3;
  else if (realColors.length >= 1) score += 0.15;
  if (!defaultColors.has(data.colors.primary)) score += 0.2;
  if (data.typography.headingFont !== "Inter, sans-serif") score += 0.15;
  if (data.typography.bodyFont !== "Inter, sans-serif") score += 0.1;
  if (data.effects.shadows || data.effects.gradients || data.effects.animations) score += 0.1;
  if (data.metadata?.siteName) score += 0.05;
  if (data.metadata?.favicon) score += 0.05;
  if (data.metadata?.logo) score += 0.05;
  return Math.min(1, score);
}

// server/styleExtractor.ts
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0")).join("");
}
function parseColorToHex(colorStr) {
  if (colorStr.startsWith("#")) {
    const hex = colorStr.slice(1);
    if (hex.length === 3) {
      return "#" + hex.split("").map((c) => c + c).join("");
    }
    return colorStr.length <= 7 ? colorStr : colorStr.slice(0, 7);
  }
  const rgbMatch = colorStr.match(/rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/i);
  if (rgbMatch) {
    return rgbToHex(parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3]));
  }
  const rgbaMatch = colorStr.match(/rgba\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (rgbaMatch) {
    return rgbToHex(parseInt(rgbaMatch[1]), parseInt(rgbaMatch[2]), parseInt(rgbaMatch[3]));
  }
  return null;
}
function isValidColor(hex) {
  if (hex.length < 7) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1e3;
  return brightness > 20 && brightness < 235;
}
function getBrightness(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1e3;
}
function getSaturation(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}
function resolveUrl(url, baseUrl) {
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return url;
  }
  try {
    const base = new URL(baseUrl);
    return new URL(url, base).href;
  } catch {
    return url;
  }
}
function getAllStyleContent(html) {
  const styleContent = html.match(/style\s*=\s*["'][^"']*["']/gi) || [];
  const styleTags = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
  return [...styleContent, ...styleTags].join("\n");
}
async function fetchExternalStylesheets(html, baseUrl) {
  const linkPatterns = [
    /<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi,
    /<link[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi
  ];
  const urls = /* @__PURE__ */ new Set();
  for (const pattern of linkPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const resolved = resolveUrl(match[1], baseUrl);
      if (resolved.startsWith("http") && !resolved.includes("fonts.googleapis.com")) {
        urls.add(resolved);
      }
    }
  }
  if (urls.size === 0) return "";
  console.log(`[styleExtractor] Fetching ${urls.size} external stylesheets`);
  const cssPromises = Array.from(urls).slice(0, 5).map(async (cssUrl) => {
    try {
      const res = await fetch(cssUrl, {
        signal: AbortSignal.timeout(5e3),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PostSpark Style Extractor/1.0)",
          "Accept": "text/css,*/*"
        }
      });
      if (!res.ok) return "";
      const text = await res.text();
      return text.slice(0, 5e5);
    } catch {
      return "";
    }
  });
  const results = await Promise.all(cssPromises);
  const totalCss = results.join("\n");
  console.log(`[styleExtractor] Fetched ${totalCss.length} chars of external CSS`);
  return totalCss;
}
function extractGoogleFonts(html) {
  const fonts = [];
  const googleFontsPattern = /fonts\.googleapis\.com\/css2?\?[^"'<>]*family=([^"'<>]+)/gi;
  let match;
  while ((match = googleFontsPattern.exec(html)) !== null) {
    const familyStr = match[1];
    const familyParts = familyStr.split(/&(?:family=)?|\|/);
    for (const part of familyParts) {
      const fontName = decodeURIComponent(part.split(":")[0].replace(/\+/g, " ")).trim();
      if (fontName && !fontName.includes("=") && fontName.length > 1) {
        fonts.push(fontName);
      }
    }
  }
  return Array.from(new Set(fonts));
}
function classifyColor(hex, contextMap) {
  const brightness = getBrightness(hex);
  if (contextMap) {
    const entry = contextMap.get(hex.toLowerCase());
    if (entry) {
      if (entry.contexts.has("background")) return { type: "bg", brightness };
      if (entry.contexts.has("text")) return { type: "text", brightness };
      if (entry.contexts.has("accent") || entry.contexts.has("meta")) return { type: "accent", brightness };
    }
  }
  const saturation = getSaturation(hex);
  if (brightness < 50) return { type: "text", brightness };
  if (brightness > 200) return { type: "bg", brightness };
  if (saturation > 0.3) return { type: "accent", brightness };
  return { type: "bg", brightness };
}
function extractColorsWithContext(html) {
  const colorMap = /* @__PURE__ */ new Map();
  function addColor(hex, score, context) {
    if (!hex) return;
    hex = hex.toLowerCase();
    if (!isValidColor(hex)) return;
    const existing = colorMap.get(hex);
    if (existing) {
      existing.score += score;
      existing.contexts.add(context);
    } else {
      colorMap.set(hex, { hex, score, contexts: /* @__PURE__ */ new Set([context]) });
    }
  }
  const allStyles = getAllStyleContent(html);
  const metaThemeColor = html.match(/<meta[^>]*name\s*=\s*["']theme-color["'][^>]*content\s*=\s*["']([^"']+)["']/i);
  if (metaThemeColor) addColor(parseColorToHex(metaThemeColor[1]), 30, "meta");
  const metaTileColor = html.match(/<meta[^>]*name\s*=\s*["']msapplication-TileColor["'][^>]*content\s*=\s*["']([^"']+)["']/i);
  if (metaTileColor) addColor(parseColorToHex(metaTileColor[1]), 30, "meta");
  const brandVarPatterns = [
    { pattern: /--(?:primary|brand|main)[-\w]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi, score: 25, ctx: "accent" },
    { pattern: /--(?:accent|highlight|cta|action)[-\w]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi, score: 25, ctx: "accent" },
    { pattern: /--(?:bg|background|surface)[-\w]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi, score: 20, ctx: "background" },
    { pattern: /--(?:text|foreground|body)[-\w]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi, score: 20, ctx: "text" },
    { pattern: /--(?:color|secondary)[-\w]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi, score: 15, ctx: "variable" }
  ];
  for (const { pattern, score, ctx } of brandVarPatterns) {
    let m2;
    while ((m2 = pattern.exec(allStyles)) !== null) {
      addColor(parseColorToHex(m2[1]), score, ctx);
    }
  }
  let m;
  const bodyBgPattern = /(?:body|html|:root)\s*\{[^}]*background(?:-color)?\s*:\s*([^;}\s]+)/gi;
  while ((m = bodyBgPattern.exec(allStyles)) !== null) addColor(parseColorToHex(m[1]), 20, "background");
  const bodyTextPattern = /(?:body|html)\s*\{[^}]*(?<![a-z-])color\s*:\s*([^;}\s]+)/gi;
  while ((m = bodyTextPattern.exec(allStyles)) !== null) addColor(parseColorToHex(m[1]), 20, "text");
  const btnPattern = /(?:button|\.btn|\.cta|a\.btn|input\[type=['"]submit['"]\]|\.button)\s*\{[^}]*(?:background(?:-color)?|color)\s*:\s*([^;}\s]+)/gi;
  while ((m = btnPattern.exec(allStyles)) !== null) addColor(parseColorToHex(m[1]), 15, "accent");
  const bgColorPattern = /background-color\s*:\s*([^;}"'\s]+)/gi;
  while ((m = bgColorPattern.exec(allStyles)) !== null) addColor(parseColorToHex(m[1]), 5, "background");
  const bgShortPattern = /background\s*:\s*(#[0-9a-fA-F]{3,8}|rgb\([^)]+\))/gi;
  while ((m = bgShortPattern.exec(allStyles)) !== null) addColor(parseColorToHex(m[1]), 5, "background");
  const textColorPattern = /(?<![a-z-])color\s*:\s*([^;}"'\s]+)/gi;
  while ((m = textColorPattern.exec(allStyles)) !== null) addColor(parseColorToHex(m[1]), 3, "text");
  const borderColorPattern = /border(?:-color)?\s*:\s*(?:\d+px\s+\w+\s+)?(#[0-9a-fA-F]{3,8}|rgb[a]?\([^)]+\))/gi;
  while ((m = borderColorPattern.exec(allStyles)) !== null) addColor(parseColorToHex(m[1]), 2, "border");
  const bgColor = html.match(/bgcolor\s*=\s*["']([^"']+)["']/i);
  if (bgColor) addColor(parseColorToHex(bgColor[1]), 5, "background");
  const hexPattern = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
  while ((m = hexPattern.exec(allStyles)) !== null) {
    let hex = "#" + m[1];
    if (hex.length === 4) hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    hex = hex.slice(0, 7).toLowerCase();
    addColor(hex, 1, "variable");
  }
  const rgbPattern = /rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/g;
  while ((m = rgbPattern.exec(allStyles)) !== null) {
    addColor(rgbToHex(parseInt(m[1]), parseInt(m[2]), parseInt(m[3])), 1, "variable");
  }
  const colors = Array.from(colorMap.values()).sort((a, b) => b.score - a.score).slice(0, 8).map((c) => c.hex);
  return { colors, contextMap: colorMap };
}
function extractTypographyFromHTML(html, googleFonts) {
  const allStyles = getAllStyleContent(html);
  let semanticHeadingFont = null;
  let semanticBodyFont = null;
  const headingCssPattern = /(?:^|\}|\s)(h[1-3])(?:\s*,\s*h[1-3])*\s*\{[^}]*font-family\s*:\s*([^;}"']+)/gi;
  let m;
  while ((m = headingCssPattern.exec(allStyles)) !== null) {
    const font = m[2].split(",")[0].replace(/["']/g, "").trim();
    if (font && font !== "inherit" && font !== "initial") {
      semanticHeadingFont = font;
      break;
    }
  }
  const bodyCssPattern = /(?:^|\}|\s)(?:body|p|\.text|\.content|\.body-text|main)\s*\{[^}]*font-family\s*:\s*([^;}"']+)/gi;
  while ((m = bodyCssPattern.exec(allStyles)) !== null) {
    const font = m[1].split(",")[0].replace(/["']/g, "").trim();
    if (font && font !== "inherit" && font !== "initial") {
      semanticBodyFont = font;
      break;
    }
  }
  if (!semanticHeadingFont) {
    const h1InlinePattern = /<h[1-3][^>]*style\s*=\s*["'][^"']*font-family\s*:\s*([^;}"']+)/gi;
    while ((m = h1InlinePattern.exec(html)) !== null) {
      const font = m[1].split(",")[0].replace(/["']/g, "").trim();
      if (font && font !== "inherit" && font !== "initial") {
        semanticHeadingFont = font;
        break;
      }
    }
  }
  const detectedGoogleFonts = googleFonts ?? extractGoogleFonts(html);
  if (!semanticHeadingFont && detectedGoogleFonts.length >= 1) {
    semanticHeadingFont = detectedGoogleFonts[0];
  }
  if (!semanticBodyFont && detectedGoogleFonts.length >= 2) {
    semanticBodyFont = detectedGoogleFonts[1];
  } else if (!semanticBodyFont && detectedGoogleFonts.length === 1) {
    semanticBodyFont = detectedGoogleFonts[0];
  }
  const fonts = /* @__PURE__ */ new Map();
  const weights = /* @__PURE__ */ new Map();
  const fontMatches = allStyles.match(/font-family\s*:\s*([^;}"']+)/gi) || [];
  for (const match of fontMatches) {
    const fontValue = match.replace(/font-family\s*:\s*/i, "").trim();
    const primaryFont = fontValue.split(",")[0].replace(/["']/g, "").trim();
    if (primaryFont && primaryFont !== "inherit" && primaryFont !== "initial") {
      fonts.set(primaryFont, (fonts.get(primaryFont) || 0) + 1);
    }
  }
  for (const gf of detectedGoogleFonts) {
    fonts.set(gf, (fonts.get(gf) || 0) + 50);
  }
  const weightMatches = allStyles.match(/font-weight\s*:\s*(\d+|normal|bold|lighter|bolder)/gi) || [];
  for (const match of weightMatches) {
    const weight = match.replace(/font-weight\s*:\s*/i, "").trim();
    weights.set(weight, (weights.get(weight) || 0) + 1);
  }
  const sortedFonts = Array.from(fonts.entries()).sort((a, b) => b[1] - a[1]);
  const sortedWeights = Array.from(weights.entries()).sort((a, b) => b[1] - a[1]);
  const bodyFont = semanticBodyFont || sortedFonts[0]?.[0] || "Inter, sans-serif";
  const headingFont = semanticHeadingFont || sortedFonts[1]?.[0] || bodyFont;
  const bodyWeight = sortedWeights.find(([w]) => w === "normal" || w === "400")?.[0] || "400";
  const headingWeight = sortedWeights.find(([w]) => w === "bold" || w === "600" || w === "700")?.[0] || "700";
  return {
    headingFont,
    bodyFont,
    headingWeight,
    bodyWeight
  };
}
function extractSpacingFromHTML(html) {
  const allStyles = getAllStyleContent(html);
  const paddingMatches = allStyles.match(/padding\s*:\s*(\d+)/gi) || [];
  const paddingValues = paddingMatches.map((m) => parseInt(m.match(/\d+/)?.[0] || "0"));
  const avgPadding = paddingValues.length > 0 ? paddingValues.reduce((a, b) => a + b, 0) / paddingValues.length : 16;
  let density = "normal";
  if (avgPadding < 10) density = "compact";
  else if (avgPadding > 24) density = "spacious";
  let padding = "normal";
  if (avgPadding < 12) padding = "tight";
  else if (avgPadding > 20) padding = "loose";
  const radiusMatches = allStyles.match(/border-radius\s*:\s*(\d+)(px|rem|em|%)/gi) || [];
  const radiusValues = radiusMatches.map((m) => parseInt(m.match(/\d+/)?.[0] || "0"));
  const avgRadius = radiusValues.length > 0 ? radiusValues.reduce((a, b) => a + b, 0) / radiusValues.length : 4;
  let borderRadius = "rounded";
  if (avgRadius === 0 || avgRadius < 2) borderRadius = "square";
  else if (avgRadius > 20) borderRadius = "pill";
  return { density, borderRadius, padding };
}
function detectEffectsFromHTML(html) {
  const allStyles = getAllStyleContent(html).toLowerCase();
  return {
    shadows: /box-shadow\s*:|text-shadow\s*:/.test(allStyles),
    gradients: /linear-gradient|radial-gradient|gradient\s*\(/.test(allStyles),
    animations: /animation\s*:|@keyframes|transition\s*:/.test(allStyles),
    glassmorphism: /backdrop-filter\s*:\s*blur|backdrop-filter\s*:\s*saturate/.test(allStyles),
    noise: /noise|grain|texture/.test(html.toLowerCase()) || /url\s*\([^)]*noise/.test(allStyles)
  };
}
function extractMetadata(html, baseUrl) {
  const metadata = {};
  const faviconMatch = html.match(/<link[^>]*rel\s*=\s*["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*href\s*=\s*["']([^"']+)["']/i);
  if (faviconMatch) {
    metadata.favicon = resolveUrl(faviconMatch[1], baseUrl);
  }
  const ogImageMatch = html.match(/<meta[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i);
  if (ogImageMatch) {
    metadata.logo = resolveUrl(ogImageMatch[1], baseUrl);
  }
  const siteNameMatch = html.match(/<meta[^>]*property\s*=\s*["']og:site_name["'][^>]*content\s*=\s*["']([^"']+)["']/i);
  if (siteNameMatch) {
    metadata.siteName = siteNameMatch[1];
  }
  return metadata;
}
async function extractStyleFromUrlWithMeta(url) {
  console.log("[styleExtractor] \u2500\u2500 Hybrid Pipeline Start \u2500\u2500");
  console.log("[styleExtractor] URL:", url);
  const htmlResult = await extractFromHTML(url);
  const quality = assessExtractionQuality(htmlResult);
  console.log("[styleExtractor] HTML extraction quality score:", quality.toFixed(2));
  if (quality >= 0.6) {
    console.log("[styleExtractor] HTML extraction sufficient, skipping vision");
    console.log("[styleExtractor] \u2500\u2500 Hybrid Pipeline End (HTML only) \u2500\u2500");
    return { data: htmlResult, visionUsed: false };
  }
  console.log("[styleExtractor] Low quality HTML extraction, attempting vision fallback...");
  try {
    const screenshotBuffer = await captureScreenshot(url);
    if (!screenshotBuffer) {
      console.log("[styleExtractor] Screenshot capture failed, using HTML result as-is");
      return { data: htmlResult, visionUsed: false };
    }
    const screenshotBase64 = `data:image/png;base64,${Buffer.from(screenshotBuffer).toString("base64")}`;
    const visionResult = await extractStylesFromScreenshot(screenshotBase64, url);
    const merged = mergeExtractionResults(htmlResult, visionResult);
    console.log("[styleExtractor] \u2500\u2500 Hybrid Pipeline End (HTML + Vision merged) \u2500\u2500");
    return { data: merged, visionUsed: true };
  } catch (error) {
    console.warn("[styleExtractor] Vision extraction failed:", error);
    console.log("[styleExtractor] \u2500\u2500 Hybrid Pipeline End (HTML fallback) \u2500\u2500");
    return { data: htmlResult, visionUsed: false };
  }
}
async function extractFromHTML(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
      },
      signal: AbortSignal.timeout(15e3)
    });
    console.log("[styleExtractor] Response status:", response.status);
    const html = await response.text();
    console.log("[styleExtractor] HTML length:", html.length, "characters");
    const externalCss = await fetchExternalStylesheets(html, url);
    const enrichedHtml = externalCss ? html + `
<style>${externalCss}</style>` : html;
    console.log("[styleExtractor] Enriched HTML length:", enrichedHtml.length, "characters");
    const googleFonts = extractGoogleFonts(html);
    if (googleFonts.length > 0) {
      console.log("[styleExtractor] Google Fonts detected:", googleFonts.join(", "));
    }
    const { colors, contextMap } = extractColorsWithContext(enrichedHtml);
    const typography = extractTypographyFromHTML(enrichedHtml, googleFonts);
    const spacing = extractSpacingFromHTML(enrichedHtml);
    const effects = detectEffectsFromHTML(enrichedHtml);
    const metadata = extractMetadata(html, url);
    const classifiedColors = colors.map((c) => ({ hex: c, ...classifyColor(c, contextMap) }));
    const bgColors = classifiedColors.filter((c) => c.type === "bg").map((c) => c.hex);
    const textColors = classifiedColors.filter((c) => c.type === "text").map((c) => c.hex);
    const accentColors = classifiedColors.filter((c) => c.type === "accent").map((c) => c.hex);
    console.log("[styleExtractor] Classification:", {
      bg: bgColors.slice(0, 2),
      text: textColors.slice(0, 2),
      accent: accentColors.slice(0, 2),
      totalPalette: colors.length
    });
    return {
      colors: {
        primary: accentColors[0] || colors[0] || "#6366f1",
        secondary: accentColors[1] || colors[1] || colors[0] || "#8b5cf6",
        background: bgColors[0] || "#ffffff",
        text: textColors[0] || "#1f2937",
        accent: accentColors[0] || colors[2] || "#f59e0b",
        palette: colors.slice(0, 8)
      },
      typography,
      spacing,
      effects,
      metadata
    };
  } catch (error) {
    console.error("HTML extraction failed:", error);
    return getDefaultStyleData();
  }
}
function getDefaultStyleData() {
  return {
    colors: {
      primary: "#6366f1",
      secondary: "#8b5cf6",
      background: "#ffffff",
      text: "#1f2937",
      accent: "#f59e0b",
      palette: ["#6366f1", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"]
    },
    typography: {
      headingFont: "Inter, sans-serif",
      bodyFont: "Inter, sans-serif",
      headingWeight: "700",
      bodyWeight: "400"
    },
    spacing: {
      density: "normal",
      borderRadius: "rounded",
      padding: "normal"
    },
    effects: {
      shadows: false,
      gradients: false,
      animations: false,
      glassmorphism: false,
      noise: false
    },
    metadata: {}
  };
}

// server/brandDNA.ts
var BRAND_ELEMENT_SELECTORS = [
  "header",
  "nav",
  '.hero, [class*="hero"], [class*="Hero"]',
  "footer",
  'button:not([aria-hidden]), .btn, [class*="btn-"], [class*="button-"]',
  "h1"
];
function mapPersonalityToComposition(dna) {
  const { seriousPlayful, luxuryAccessible, modernClassic, boldSubtle } = dna.personality;
  const { contrast, harmony } = dna.colors.colorRelationships;
  let rhythm;
  if (seriousPlayful < 35 && boldSubtle < 50) {
    rhythm = "staccato";
  } else if (seriousPlayful > 65 || luxuryAccessible > 70) {
    rhythm = "syncopated";
  } else {
    rhythm = "legato";
  }
  let harmonyRule;
  if (harmony === "complementary" || harmony === "split-complementary") {
    harmonyRule = "dissonant";
  } else if (harmony === "triadic") {
    harmonyRule = "resolved";
  } else {
    harmonyRule = "consonant";
  }
  let dynamics;
  if (boldSubtle < 35 && contrast === "high") {
    dynamics = "forte";
  } else if (boldSubtle > 65 || contrast === "low") {
    dynamics = "piano";
  } else {
    dynamics = "mezzo";
  }
  let tempo;
  if (modernClassic < 35 && luxuryAccessible > 60) {
    tempo = "allegro";
  } else if (modernClassic > 65 || luxuryAccessible < 35) {
    tempo = "adagio";
  } else {
    tempo = "andante";
  }
  return { rhythm, harmony: harmonyRule, dynamics, tempo };
}
function compositionToLayout(composition) {
  const densityMap = {
    allegro: "compact",
    andante: "normal",
    adagio: "spacious"
  };
  const radiusMap = {
    staccato: "square",
    legato: "rounded",
    syncopated: "pill"
  };
  const paddingMap = {
    allegro: "tight",
    andante: "normal",
    adagio: "loose"
  };
  const alignmentMap = {
    forte: "left",
    mezzo: "center",
    piano: "center"
  };
  return {
    density: densityMap[composition.tempo],
    borderRadius: radiusMap[composition.rhythm],
    padding: paddingMap[composition.tempo],
    preferredAlignment: alignmentMap[composition.dynamics]
  };
}
async function analyzeWithVision(screenshots, elementScreenshots, url) {
  const pageImages = screenshots.slice(0, 2);
  const elementImages = elementScreenshots.slice(0, 1);
  const allBuffers = [...pageImages, ...elementImages];
  if (allBuffers.length === 0) return null;
  console.log(`[brandDNA] Sending ${allBuffers.length} image(s) to Gemini Vision for brand analysis`);
  const imageContents = allBuffers.map((buf) => ({
    type: "image_url",
    image_url: {
      // Use 'low' detail to reduce token usage and avoid INVALID_ARGUMENT on large batches
      url: `data:image/png;base64,${Buffer.from(buf).toString("base64")}`,
      detail: "low"
    }
  }));
  try {
    const response = await invokeLLM({
      traceLabel: "site_visual_identity",
      taskRoute: "vision_analysis",
      messages: [
        {
          role: "system",
          content: `You are a Senior Brand Strategist and Art Director who analyzes brand identities holistically.
You are looking at multiple screenshots of a website to extract its complete brand DNA.

Your analysis must be PRECISE and based on what you actually SEE in the images:
- Extract EXACT hex colors from the rendered interface (not guesses)
- Assess brand personality on each spectrum based on visual and tonal cues
- Identify emotional qualities that the design evokes
- Classify the industry/sector based on visual language clues

Be specific. Avoid generic defaults. Every brand has a unique identity.`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze these ${allBuffers.length} screenshot(s) from the website: ${url}

I need a complete brand DNA analysis. Extract:
1. The brand name (from logo, title, or domain)
2. Industry/sector
3. Personality spectrum (score each axis 0-100 based on visual/tonal evidence)
4. Exact colors from the UI (primary CTA, background, text, accents)
5. Color relationship type (analogous/complementary/triadic/monochromatic)
6. Typography style (serif/sans/display \u2014 identify actual font names if visible)
7. Visual effects (shadows, gradients, glassmorphism, etc.)
8. Emotional profile (what feeling does this brand evoke?)
9. Card/UI style \u2014 what is the primary design language of the site's cards and components?
   - "neobrutalist": thick solid borders (2px+), hard offset drop shadows, flat colors, bold typography
   - "glass": frosted glass / backdrop blur effects, semi-transparent surfaces
   - "minimal": no borders, no drop shadows, maximum whitespace, typography-driven
   - "editorial": strong typographic hierarchy, serif fonts, accent rules/dividers, print-like grid
   - "flat": flat solid colors, subtle or no borders, no drop shadows (most modern apps/SaaS)

Return ONLY valid JSON matching the schema.`
            },
            ...imageContents
          ]
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "vision_brand_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              brandName: { type: "string" },
              industry: { type: "string" },
              personality: {
                type: "object",
                properties: {
                  seriousPlayful: { type: "number", description: "0=serious, 100=playful" },
                  luxuryAccessible: { type: "number", description: "0=luxury, 100=accessible" },
                  modernClassic: { type: "number", description: "0=modern, 100=classic" },
                  boldSubtle: { type: "number", description: "0=bold, 100=subtle" },
                  warmCool: { type: "number", description: "0=warm, 100=cool" }
                },
                required: ["seriousPlayful", "luxuryAccessible", "modernClassic", "boldSubtle", "warmCool"],
                additionalProperties: false
              },
              colors: {
                type: "object",
                properties: {
                  primary: { type: "string", description: "Primary brand/CTA color hex" },
                  secondary: { type: "string", description: "Secondary color hex" },
                  background: { type: "string", description: "Main background color hex" },
                  text: { type: "string", description: "Main body text color hex" },
                  accent: { type: "string", description: "Accent/highlight color hex" },
                  colorRelationships: {
                    type: "object",
                    properties: {
                      harmony: { type: "string", enum: ["complementary", "analogous", "triadic", "monochromatic", "split-complementary"] },
                      contrast: { type: "string", enum: ["high", "medium", "low"] },
                      temperature: { type: "string", enum: ["warm", "cool", "neutral"] }
                    },
                    required: ["harmony", "contrast", "temperature"],
                    additionalProperties: false
                  }
                },
                required: ["primary", "secondary", "background", "text", "accent", "colorRelationships"],
                additionalProperties: false
              },
              typography: {
                type: "object",
                properties: {
                  headingFont: { type: "string", description: "Heading font name or category" },
                  bodyFont: { type: "string", description: "Body font name or category" },
                  fontPairing: { type: "string", enum: ["matching", "contrasting", "complementary"] }
                },
                required: ["headingFont", "bodyFont", "fontPairing"],
                additionalProperties: false
              },
              effects: {
                type: "object",
                properties: {
                  shadows: { type: "boolean" },
                  gradients: { type: "boolean" },
                  animations: { type: "boolean" },
                  glassmorphism: { type: "boolean" },
                  noise: { type: "boolean" }
                },
                required: ["shadows", "gradients", "animations", "glassmorphism", "noise"],
                additionalProperties: false
              },
              emotionalProfile: {
                type: "object",
                properties: {
                  primary: { type: "string", description: "Primary emotional quality: trust, energy, calm, excitement, elegance, etc." },
                  secondary: { type: "string", description: "Secondary emotional quality" },
                  mood: { type: "string", description: '2-3 word mood descriptor, e.g. "confident professional"' }
                },
                required: ["primary", "secondary", "mood"],
                additionalProperties: false
              },
              cardStyle: {
                type: "string",
                enum: ["neobrutalist", "glass", "minimal", "editorial", "flat"],
                description: "Primary design language of the site's UI cards and components: neobrutalist=thick borders+offset shadow, glass=frosted blur, minimal=no borders/shadows, editorial=top accent rule+serif, flat=clean modern default"
              }
            },
            required: ["brandName", "industry", "personality", "colors", "typography", "effects", "emotionalProfile", "cardStyle"],
            additionalProperties: false
          }
        }
      }
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from Vision LLM");
    const str = typeof content === "string" ? content : JSON.stringify(content);
    return JSON.parse(str);
  } catch (err) {
    console.warn("[brandDNA] Vision analysis failed:", err);
    return null;
  }
}
function deriveCardStyle(dna) {
  if (dna.effects.glassmorphism) return "glass";
  if (dna.effects.shadows && !dna.effects.gradients && dna.personality.boldSubtle < 45) return "neobrutalist";
  if (!dna.effects.shadows && !dna.effects.gradients && dna.personality.boldSubtle > 65) return "minimal";
  if (dna.typography.fontPairing === "contrasting" && dna.personality.modernClassic > 55) return "editorial";
  return "flat";
}
function buildFallbackPersonality() {
  return {
    seriousPlayful: 40,
    luxuryAccessible: 50,
    modernClassic: 30,
    boldSubtle: 40,
    warmCool: 50
  };
}
function buildFallbackEmotional() {
  return { primary: "trust", secondary: "competence", mood: "professional and reliable" };
}
async function extractBrandDNA(url, options) {
  console.log("[brandDNA] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  console.log("[brandDNA] Starting extraction for:", url);
  const discovered = options?.discoveredPages ?? await discoverPages(url, 8);
  const highPriority = discovered.filter((p) => p.priority === "high").slice(0, 3);
  const urlsToCapture = [url, ...highPriority.map((p) => p.url)].slice(0, 5);
  console.log("[brandDNA] Pages to capture:", urlsToCapture);
  const [multiScreenshots, elementScreenshots, htmlResult] = await Promise.all([
    captureMultipleScreenshots(urlsToCapture),
    captureElements(url, BRAND_ELEMENT_SELECTORS),
    extractStyleFromUrlWithMeta(url)
  ]);
  const screenshotBuffers = Object.values(multiScreenshots);
  const elementBuffers = Object.values(elementScreenshots);
  const htmlData = htmlResult.data;
  console.log("[brandDNA] Screenshots:", screenshotBuffers.length, "| Elements:", elementBuffers.length);
  const visionAnalysis = await analyzeWithVision(screenshotBuffers, elementBuffers, url);
  const isDefaultColor = (hex) => ["#6366f1", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#ffffff", "#1f2937"].includes(hex.toLowerCase());
  const colors = {
    primary: !isDefaultColor(htmlData.colors.primary) ? htmlData.colors.primary : visionAnalysis?.colors.primary ?? htmlData.colors.primary,
    secondary: !isDefaultColor(htmlData.colors.secondary) ? htmlData.colors.secondary : visionAnalysis?.colors.secondary ?? htmlData.colors.secondary,
    background: !isDefaultColor(htmlData.colors.background) ? htmlData.colors.background : visionAnalysis?.colors.background ?? htmlData.colors.background,
    text: !isDefaultColor(htmlData.colors.text) ? htmlData.colors.text : visionAnalysis?.colors.text ?? htmlData.colors.text,
    accent: !isDefaultColor(htmlData.colors.accent) ? htmlData.colors.accent : visionAnalysis?.colors.accent ?? htmlData.colors.accent,
    palette: htmlData.colors.palette.length >= 4 ? htmlData.colors.palette : [
      visionAnalysis?.colors.primary ?? htmlData.colors.primary,
      visionAnalysis?.colors.secondary ?? htmlData.colors.secondary,
      visionAnalysis?.colors.accent ?? htmlData.colors.accent,
      visionAnalysis?.colors.background ?? htmlData.colors.background,
      visionAnalysis?.colors.text ?? htmlData.colors.text,
      ...htmlData.colors.palette
    ].filter((c, i, arr) => arr.indexOf(c) === i).slice(0, 8),
    colorRelationships: visionAnalysis?.colors.colorRelationships ?? {
      harmony: "analogous",
      contrast: "medium",
      temperature: "neutral"
    }
  };
  const isDefaultFont = (f) => f === "Inter, sans-serif" || f === "Inter";
  const typography = {
    headingFont: !isDefaultFont(htmlData.typography.headingFont) ? htmlData.typography.headingFont : visionAnalysis?.typography.headingFont ?? htmlData.typography.headingFont,
    bodyFont: !isDefaultFont(htmlData.typography.bodyFont) ? htmlData.typography.bodyFont : visionAnalysis?.typography.bodyFont ?? htmlData.typography.bodyFont,
    headingWeight: htmlData.typography.headingWeight,
    bodyWeight: htmlData.typography.bodyWeight,
    fontPairing: visionAnalysis?.typography.fontPairing ?? "complementary"
  };
  const effects = {
    shadows: htmlData.effects.shadows || (visionAnalysis?.effects.shadows ?? false),
    gradients: htmlData.effects.gradients || (visionAnalysis?.effects.gradients ?? false),
    animations: htmlData.effects.animations || (visionAnalysis?.effects.animations ?? false),
    glassmorphism: htmlData.effects.glassmorphism || (visionAnalysis?.effects.glassmorphism ?? false),
    noise: htmlData.effects.noise || (visionAnalysis?.effects.noise ?? false)
  };
  const personality = visionAnalysis?.personality ?? buildFallbackPersonality();
  const emotionalProfile = visionAnalysis?.emotionalProfile ?? buildFallbackEmotional();
  const brandName = visionAnalysis?.brandName ?? htmlData.metadata?.siteName ?? new URL(url).hostname.replace(/^www\./, "");
  const industry = visionAnalysis?.industry ?? "Business";
  const composition = mapPersonalityToComposition({ personality, colors });
  const layoutBase = compositionToLayout(composition);
  const cardStyle = visionAnalysis?.cardStyle ?? deriveCardStyle({ effects, personality, typography });
  const layout = {
    ...layoutBase,
    cardStyle
  };
  console.log("[brandDNA] Card style resolved:", cardStyle, visionAnalysis?.cardStyle ? "(Vision)" : "(fallback)");
  const visionUsed = screenshotBuffers.length > 0 && visionAnalysis !== null;
  const realColors = colors.palette.filter((c) => !isDefaultColor(c));
  const extractionQuality = Math.min(1, (realColors.length >= 4 ? 0.4 : realColors.length * 0.1) + (visionUsed ? 0.4 : 0) + (htmlData.metadata?.siteName ? 0.1 : 0) + (typography.headingFont !== "Inter, sans-serif" ? 0.1 : 0));
  const brandDNA = {
    brandName,
    industry,
    personality,
    colors,
    typography,
    composition,
    layout,
    effects,
    emotionalProfile,
    metadata: {
      sourceUrl: url,
      pagesAnalyzed: urlsToCapture.length,
      extractionQuality,
      visionUsed,
      favicon: htmlData.metadata?.favicon,
      logo: htmlData.metadata?.logo,
      siteName: htmlData.metadata?.siteName
    }
  };
  console.log("[brandDNA] Extraction complete:", {
    brandName: brandDNA.brandName,
    industry: brandDNA.industry,
    mood: brandDNA.emotionalProfile.mood,
    composition: brandDNA.composition,
    quality: brandDNA.metadata.extractionQuality.toFixed(2),
    visionUsed: brandDNA.metadata.visionUsed
  });
  console.log("[brandDNA] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  return brandDNA;
}

// server/brandThemeGenerator.ts
function getBrightness2(hex) {
  const h = hex.replace("#", "");
  if (h.length < 6) return 128;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1e3;
}
function isDark(hex) {
  return getBrightness2(hex) < 128;
}
function mixColors(hex1, hex2, ratio = 0.5) {
  const h1 = hex1.replace("#", "");
  const h2 = hex2.replace("#", "");
  if (h1.length < 6 || h2.length < 6) return hex1;
  const r = Math.round(parseInt(h1.slice(0, 2), 16) * (1 - ratio) + parseInt(h2.slice(0, 2), 16) * ratio);
  const g = Math.round(parseInt(h1.slice(2, 4), 16) * (1 - ratio) + parseInt(h2.slice(2, 4), 16) * ratio);
  const b = Math.round(parseInt(h1.slice(4, 6), 16) * (1 - ratio) + parseInt(h2.slice(4, 6), 16) * ratio);
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}
function invertCardStyle(style) {
  switch (style) {
    case "neobrutalist":
      return "minimal";
    case "minimal":
      return "neobrutalist";
    case "glass":
      return "flat";
    case "editorial":
      return "flat";
    case "flat":
    default:
      return "flat";
  }
}
function rhythmToDecoration(rhythm) {
  return rhythm === "staccato" ? "none" : rhythm === "syncopated" ? "glitch" : "none";
}
function dynamicsToHeadingSize(dynamics) {
  return dynamics === "forte" ? "2.5rem" : dynamics === "mezzo" ? "2rem" : "1.75rem";
}
function buildSurface(bg) {
  const dark = isDark(bg);
  return dark ? mixColors(bg, "#ffffff", 0.08) : mixColors(bg, "#000000", 0.05);
}
function buildEffects(dna, composition) {
  const isGlowStyle = dna.emotionalProfile.primary === "energy" || dna.emotionalProfile.primary === "excitement";
  return {
    glow: isGlowStyle && composition.dynamics === "forte",
    noise: dna.effects.noise || composition.rhythm === "staccato",
    glitch: composition.rhythm === "syncopated" && composition.dynamics === "forte",
    grid: dna.industry.toLowerCase().includes("tech") || dna.industry.toLowerCase().includes("saas")
  };
}
function buildSyntheticPattern(dna, variationName, confidence) {
  const { seriousPlayful, modernClassic, boldSubtle } = dna.personality;
  const category = boldSubtle < 30 && modernClassic < 30 ? "neon" : seriousPlayful > 70 ? "playful" : seriousPlayful < 30 && boldSubtle < 50 ? "corporate" : boldSubtle > 70 ? "minimalist" : modernClassic > 70 ? "classic" : "modern";
  return {
    id: `dna-${variationName.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
    name: variationName,
    category,
    confidence,
    characteristics: [
      dna.emotionalProfile.mood,
      dna.industry,
      `${dna.composition.rhythm} rhythm`
    ],
    description: `${dna.emotionalProfile.mood} \u2014 extracted from ${dna.metadata.siteName ?? dna.brandName}`,
    suggestedColors: {
      bg: dna.colors.background,
      text: dna.colors.text,
      accent: dna.colors.accent,
      secondary: dna.colors.secondary
    }
  };
}
function buildBrandFaithful(dna, url) {
  const { composition, layout } = dna;
  const effects = buildEffects(dna, composition);
  return {
    id: `temp-brand-${Date.now()}-0`,
    label: `${dna.brandName} \xB7 Original`,
    description: `Fiel ao DNA visual: ${dna.emotionalProfile.mood}`,
    category: "brand",
    source: "website-extraction",
    sourceUrl: url,
    designPattern: buildSyntheticPattern(dna, "Brand Faithful", 92),
    isTemporary: true,
    createdAt: Date.now(),
    colors: {
      bg: dna.colors.background,
      text: dna.colors.text,
      accent: dna.colors.primary,
      surface: buildSurface(dna.colors.background)
    },
    typography: {
      headingFont: dna.typography.headingFont,
      bodyFont: dna.typography.bodyFont,
      headingSize: dynamicsToHeadingSize(composition.dynamics),
      bodySize: "1rem"
    },
    layout: {
      alignment: layout.preferredAlignment,
      borderStyle: layout.borderRadius,
      decoration: rhythmToDecoration(composition.rhythm),
      padding: layout.padding,
      // Brand Faithful: use the extracted cardStyle directly — highest fidelity to the site
      cardStyle: dna.layout.cardStyle
    },
    effects,
    brandMeta: {
      logoUrl: dna.metadata.logo,
      brandName: dna.brandName,
      favicon: dna.metadata.favicon
    }
  };
}
function buildHarmoniousRemix(dna, url) {
  const remixRhythm = dna.composition.rhythm === "staccato" ? "legato" : dna.composition.rhythm === "legato" ? "syncopated" : "staccato";
  const remixComposition = {
    ...dna.composition,
    rhythm: remixRhythm,
    dynamics: dna.composition.dynamics === "forte" ? "mezzo" : "forte"
  };
  const remixLayout = compositionToLayout(remixComposition);
  const bg = isDark(dna.colors.background) ? dna.colors.background : dna.colors.secondary;
  const accent = dna.colors.accent !== dna.colors.primary ? dna.colors.accent : dna.colors.secondary;
  const effects = buildEffects(dna, remixComposition);
  return {
    id: `temp-remix-${Date.now()}-1`,
    label: `${dna.brandName} \xB7 Remix`,
    description: `Mesma personalidade, nova composi\xE7\xE3o: ${remixRhythm} rhythm`,
    category: "remix",
    source: "website-extraction",
    sourceUrl: url,
    designPattern: buildSyntheticPattern(dna, "Harmonious Remix", 78),
    isTemporary: true,
    createdAt: Date.now() + 1,
    colors: {
      bg,
      text: isDark(bg) ? "#f5f5f5" : dna.colors.text,
      accent,
      surface: buildSurface(bg)
    },
    typography: {
      headingFont: dna.typography.headingFont,
      bodyFont: dna.typography.bodyFont,
      headingSize: dynamicsToHeadingSize(remixComposition.dynamics),
      bodySize: "1rem"
    },
    layout: {
      alignment: "center",
      borderStyle: remixLayout.borderRadius,
      decoration: rhythmToDecoration(remixRhythm),
      padding: remixLayout.padding,
      // Harmonious Remix: soften neobrutalist to flat for variety; others carry through
      cardStyle: dna.layout.cardStyle === "neobrutalist" ? "flat" : dna.layout.cardStyle
    },
    effects,
    brandMeta: {
      logoUrl: dna.metadata.logo,
      brandName: dna.brandName,
      favicon: dna.metadata.favicon
    }
  };
}
function buildDisruptiveContrast(dna, url) {
  const { seriousPlayful, boldSubtle, modernClassic } = dna.personality;
  const disruptiveComposition = {
    rhythm: "staccato",
    harmony: dna.composition.harmony === "consonant" ? "dissonant" : "consonant",
    dynamics: "forte",
    tempo: "allegro"
  };
  const disruptiveLayout = compositionToLayout(disruptiveComposition);
  let bg;
  let accent;
  let text;
  if (isDark(dna.colors.background)) {
    bg = "#f8fafc";
    text = "#0f172a";
    accent = dna.colors.primary;
  } else if (seriousPlayful < 40) {
    bg = mixColors(dna.colors.primary, "#0a0a0a", 0.75);
    text = "#f5f5f5";
    accent = dna.colors.accent !== dna.colors.primary ? dna.colors.accent : dna.colors.primary;
  } else {
    bg = dna.colors.primary;
    text = isDark(dna.colors.primary) ? "#ffffff" : "#000000";
    accent = isDark(dna.colors.primary) ? "#ffffff" : dna.colors.background;
  }
  const effects = {
    glow: boldSubtle < 50,
    noise: modernClassic > 60,
    glitch: seriousPlayful > 60,
    grid: !isDark(bg)
  };
  return {
    id: `temp-disruptive-${Date.now()}-2`,
    label: `${dna.brandName} \xB7 Contraste`,
    description: `Ruptura criativa: invers\xE3o de ${seriousPlayful < 40 ? "tom" : boldSubtle > 60 ? "din\xE2mica" : "paleta"}`,
    category: "disruptive",
    source: "website-extraction",
    sourceUrl: url,
    designPattern: buildSyntheticPattern(dna, "Disruptive Contrast", 65),
    isTemporary: true,
    createdAt: Date.now() + 2,
    colors: {
      bg,
      text,
      accent,
      surface: buildSurface(bg)
    },
    typography: {
      headingFont: dna.typography.headingFont,
      bodyFont: dna.typography.bodyFont,
      headingSize: "2.75rem",
      bodySize: "1rem"
    },
    layout: {
      alignment: disruptiveLayout.preferredAlignment,
      borderStyle: "square",
      decoration: "none",
      padding: disruptiveLayout.padding,
      // Disruptive Contrast: inverts the cardStyle for maximum visual tension
      cardStyle: invertCardStyle(dna.layout.cardStyle)
    },
    effects,
    brandMeta: {
      logoUrl: dna.metadata.logo,
      brandName: dna.brandName,
      favicon: dna.metadata.favicon
    }
  };
}
function generateThemesFromBrandDNA(dna, url) {
  console.log("[brandThemeGenerator] Generating 3 variations for:", dna.brandName);
  const themes = [
    buildBrandFaithful(dna, url),
    buildHarmoniousRemix(dna, url),
    buildDisruptiveContrast(dna, url)
  ];
  themes.forEach((t2, i) => {
    console.log(`[brandThemeGenerator] Variation ${i + 1}:`, {
      label: t2.label,
      category: t2.category,
      bg: t2.colors.bg,
      accent: t2.colors.accent,
      composition: `${t2.layout.borderStyle} \xB7 ${t2.layout.alignment} \xB7 ${t2.layout.padding}`
    });
  });
  return themes;
}

// server/chameleon.ts
function mapFontCategory(headingFont) {
  const lower = headingFont.toLowerCase();
  if (lower.includes("mono") || lower.includes("code") || lower.includes("courier")) return "mono";
  if (lower.includes("serif") || lower.includes("georgia") || lower.includes("playfair") || lower.includes("merriweather") || lower.includes("lora")) return "serif";
  if (lower.includes("display") || lower.includes("bebas") || lower.includes("oswald") || lower.includes("impact") || lower.includes("black")) return "display";
  return "sans";
}
async function analyzeBrandFromUrl(url) {
  try {
    const dna = await extractBrandDNA(url);
    return {
      brandColors: {
        primary: dna.colors.primary,
        secondary: dna.colors.secondary
      },
      logoUrl: dna.metadata.logo,
      fontCategory: mapFontCategory(dna.typography.headingFont),
      summary: `${dna.brandName} \u2014 ${dna.industry}. ${dna.emotionalProfile.mood}. ${dna.emotionalProfile.primary} brand identity.`,
      brandName: dna.brandName,
      dna
    };
  } catch (error) {
    console.warn("[chameleon] extractBrandDNA failed, falling back to mock:", error);
    return mockScrapeUrl(url);
  }
}
async function mockScrapeUrl(url) {
  const mocks = {
    apple: {
      brandColors: { primary: "#555555", secondary: "#FFFFFF" },
      logoUrl: "https://www.apple.com/favicon.ico",
      fontCategory: "sans",
      summary: "Apple Inc. - Technology company known for innovative products and sleek design.",
      brandName: "Apple"
    },
    google: {
      brandColors: { primary: "#4285F4", secondary: "#FFFFFF" },
      logoUrl: "https://www.google.com/favicon.ico",
      fontCategory: "sans",
      summary: "Google - Search engine and technology company with a focus on simplicity.",
      brandName: "Google"
    },
    nike: {
      brandColors: { primary: "#111111", secondary: "#FFFFFF" },
      logoUrl: "https://www.nike.com/favicon.ico",
      fontCategory: "sans",
      summary: "Nike - Athletic footwear and apparel company with a sporty aesthetic.",
      brandName: "Nike"
    },
    starbucks: {
      brandColors: { primary: "#00704A", secondary: "#FFFFFF" },
      logoUrl: "https://www.starbucks.com/favicon.ico",
      fontCategory: "sans",
      summary: "Starbucks - Coffee company known for premium beverages and cozy ambiance.",
      brandName: "Starbucks"
    }
  };
  const lowerUrl = url.toLowerCase();
  for (const [key, data] of Object.entries(mocks)) {
    if (lowerUrl.includes(key)) return data;
  }
  return {
    brandColors: { primary: "#FF6B6B", secondary: "#F5F5F5" },
    fontCategory: "sans",
    summary: "Brand website - Modern design with professional aesthetic.",
    brandName: "Brand"
  };
}
function generateCardThemeVariations(brandAnalysis) {
  if (brandAnalysis.dna) {
    const themes = generateThemesFromBrandDNA(brandAnalysis.dna, brandAnalysis.dna.metadata.sourceUrl);
    return themes.map((t2, i) => ({
      themeId: t2.id,
      themeName: t2.label,
      description: t2.description,
      brandColors: { primary: t2.colors.accent, secondary: t2.colors.bg },
      type: i === 0 ? "brand-match" : i === 1 ? "remix-safe" : "remix-disruptive"
    }));
  }
  return [
    {
      themeId: "brand-custom",
      themeName: "Brand Match",
      description: "Clone your brand identity exactly",
      brandColors: brandAnalysis.brandColors,
      type: "brand-match"
    },
    {
      themeId: "swiss-modern",
      themeName: "Remix Seguro",
      description: "Swiss Modern with your brand accent",
      brandColors: { primary: brandAnalysis.brandColors.primary, secondary: "#FFFFFF" },
      type: "remix-safe"
    },
    {
      themeId: "cyber-core",
      themeName: "Remix Disruptivo",
      description: "Bold neon aesthetic for maximum impact",
      type: "remix-disruptive"
    }
  ];
}

// server/designPatternAnalyzer.ts
async function analyzeDesignPattern(data, url) {
  try {
    const response = await invokeLLM({
      traceLabel: "design_pattern_analysis",
      taskRoute: "content_strategy",
      messages: [
        {
          role: "system",
          content: `You are a design pattern analyst. Analyze website style data and classify the design patterns.

Return JSON with up to 3 design patterns that match the website's visual style.
Each pattern should have:
- id: unique identifier (kebab-case)
- name: display name (title case)
- category: one of: modern, brutalist, neon, classic, playful, corporate, artistic, minimalist, retro, futuristic
- confidence: 0-100 (how confident you are this pattern matches)
- characteristics: array of 3-5 characteristic names
- description: brief description (max 100 chars)

Consider:
- Color palette (dark = modern/brutalist/neon, light = classic/minimalist, colorful = playful/artistic)
- Typography (serif = classic/retro, sans = modern/corporate, mono = neon/futuristic)
- Effects (gradients/glow = neon/futuristic, minimal effects = minimalist/modern)
- Spacing (spacious = modern/minimalist, compact = brutalist/corporate)`
        },
        {
          role: "user",
          content: `Analyze this website style data and classify design patterns:

URL: ${url}

IMPORTANT CONTEXT: This website data may be incomplete because many modern websites (Next.js, React SPAs) 
render content dynamically. The HTML we captured may be minimal (just the app shell).
In that case, use the URL domain name, brand name, and any available clues to make smart inferences about the 
website's visual identity and design style. Do NOT default to generic "modern/corporate" patterns unless truly warranted.

Colors extracted (may be defaults if SPA):
- Primary: ${data.colors.primary}
- Secondary: ${data.colors.secondary}
- Background: ${data.colors.background}
- Text: ${data.colors.text}
- Accent: ${data.colors.accent}
- Palette: ${data.colors.palette.length > 0 ? data.colors.palette.join(", ") : "(none found - likely SPA, infer from brand)"}

Typography:
- Heading Font: ${data.typography.headingFont}
- Body Font: ${data.typography.bodyFont}
- Heading Weight: ${data.typography.headingWeight}
- Body Weight: ${data.typography.bodyWeight}

Spacing:
- Density: ${data.spacing.density}
- Border Radius: ${data.spacing.borderRadius}
- Padding: ${data.spacing.padding}

Effects:
- Shadows: ${data.effects.shadows}
- Gradients: ${data.effects.gradients}
- Animations: ${data.effects.animations}
- Glassmorphism: ${data.effects.glassmorphism}
- Noise: ${data.effects.noise}

${data.metadata?.siteName ? `Site Name: ${data.metadata.siteName}` : ""}

CRITICAL: If the palette is empty (SPA), you MUST infer the brand's likely visual identity from:
1. The URL/domain name (what kind of product/service is it?)
2. The brand name (startup, SaaS, agency, etc.)
3. Industry conventions (productivity apps = modern/clean, events/party = playful/colorful, finance = corporate)

For each pattern you return, also specify the ACTUAL HEX COLORS that best represent this brand, not generic defaults.
Add an optional field "suggestedColors" with {bg, text, accent, secondary} hex values.

Return exactly 2-3 patterns that best describe this website's design.`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "design_patterns",
          strict: true,
          schema: {
            type: "object",
            properties: {
              patterns: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    category: {
                      type: "string",
                      enum: [
                        "modern",
                        "brutalist",
                        "neon",
                        "classic",
                        "playful",
                        "corporate",
                        "artistic",
                        "minimalist",
                        "retro",
                        "futuristic"
                      ]
                    },
                    confidence: { type: "number", minimum: 0, maximum: 100 },
                    characteristics: {
                      type: "array",
                      items: { type: "string" },
                      minItems: 3,
                      maxItems: 5
                    },
                    description: { type: "string", maxLength: 100 },
                    suggestedColors: {
                      type: "object",
                      properties: {
                        bg: { type: "string" },
                        text: { type: "string" },
                        accent: { type: "string" },
                        secondary: { type: "string" }
                      },
                      required: ["bg", "text", "accent", "secondary"],
                      additionalProperties: false
                    }
                  },
                  required: ["id", "name", "category", "confidence", "characteristics", "description", "suggestedColors"],
                  additionalProperties: false
                },
                minItems: 2,
                maxItems: 3
              }
            },
            required: ["patterns"],
            additionalProperties: false
          }
        }
      }
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from LLM");
    const contentStr = typeof content === "string" ? content : JSON.stringify(content);
    const parsed = JSON.parse(contentStr);
    return parsed.patterns.map((p, i) => ({
      id: p.id || `pattern-${i}`,
      name: p.name,
      category: p.category,
      confidence: Math.min(100, Math.max(0, p.confidence)),
      characteristics: p.characteristics,
      description: p.description,
      suggestedColors: p.suggestedColors
    }));
  } catch (error) {
    console.error("Pattern analysis failed:", error);
    return generateFallbackPatterns(data);
  }
}
function generateFallbackPatterns(data) {
  const patterns = [];
  const bgBrightness = getColorBrightness(data.colors.background);
  const isDark3 = bgBrightness < 128;
  const hasVibrantColors = data.colors.palette.some((c) => getColorSaturation(c) > 0.5);
  if (isDark3 && hasVibrantColors) {
    patterns.push({
      id: "dark-modern",
      name: "Dark Modern",
      category: "modern",
      confidence: 75,
      characteristics: ["Dark background", "Vibrant accents", "High contrast"],
      description: "Modern dark theme with vibrant color accents",
      suggestedColors: CATEGORY_PALETTES.modern
    });
  } else if (isDark3) {
    patterns.push({
      id: "minimalist-dark",
      name: "Minimalist Dark",
      category: "minimalist",
      confidence: 70,
      characteristics: ["Dark theme", "Minimal colors", "Clean layout"],
      description: "Clean dark minimalist design",
      suggestedColors: CATEGORY_PALETTES.minimalist
    });
  } else if (hasVibrantColors) {
    patterns.push({
      id: "playful-modern",
      name: "Playful Modern",
      category: "playful",
      confidence: 70,
      characteristics: ["Colorful palette", "Light background", "Vibrant accents"],
      description: "Light modern design with colorful accents",
      suggestedColors: CATEGORY_PALETTES.playful
    });
  } else {
    patterns.push({
      id: "clean-modern",
      name: "Clean Modern",
      category: "modern",
      confidence: 75,
      characteristics: ["Clean layout", "Balanced colors", "Professional look"],
      description: "Professional modern design",
      suggestedColors: CATEGORY_PALETTES.modern
    });
  }
  const isSerif = data.typography.headingFont.toLowerCase().includes("serif");
  if (isSerif) {
    patterns.push({
      id: "elegant-classic",
      name: "Elegant Classic",
      category: "classic",
      confidence: 65,
      characteristics: ["Serif typography", "Elegant feel", "Traditional style"],
      description: "Classic elegant design with serif typography",
      suggestedColors: CATEGORY_PALETTES.classic
    });
  }
  if (patterns.length < 2) {
    patterns.push({
      id: "professional-clean",
      name: "Professional Clean",
      category: "corporate",
      confidence: 60,
      characteristics: ["Clean design", "Professional look", "Balanced spacing"],
      description: "Professional clean corporate style",
      suggestedColors: CATEGORY_PALETTES.corporate
    });
  }
  return patterns;
}
function generateThemesFromPatterns(patterns, data, url) {
  return patterns.map((pattern, index) => {
    const themeId = `temp-${Date.now()}-${index}`;
    const category = pattern.confidence > 80 ? "brand" : pattern.confidence > 60 ? "remix" : "disruptive";
    const effects = mapPatternToEffects(pattern.category);
    const decoration = mapPatternToDecoration(pattern.category);
    const hasExtractedColors = data.colors.palette.length > 2;
    let themeColors;
    if (!hasExtractedColors && pattern.suggestedColors) {
      console.log(`[generateThemes] Using LLM suggested colors for ${pattern.name}:`, pattern.suggestedColors);
      themeColors = {
        bg: pattern.suggestedColors.bg,
        text: pattern.suggestedColors.text,
        accent: pattern.suggestedColors.accent,
        surface: pattern.suggestedColors.secondary
      };
    } else {
      const colors = adjustColorsForPattern(data.colors, pattern.category);
      themeColors = {
        bg: colors.background,
        text: colors.text,
        accent: colors.accent,
        surface: colors.secondary
      };
    }
    return {
      id: themeId,
      label: pattern.name,
      description: pattern.description,
      category,
      source: "website-extraction",
      sourceUrl: url,
      designPattern: pattern,
      isTemporary: true,
      createdAt: Date.now(),
      colors: themeColors,
      typography: {
        headingFont: mapFontForPattern(data.typography.headingFont, pattern.category),
        bodyFont: mapFontForPattern(data.typography.bodyFont, pattern.category),
        headingSize: mapHeadingSizeForPattern(pattern.category),
        bodySize: mapBodySizeForPattern(pattern.category)
      },
      layout: {
        alignment: mapAlignmentForPattern(pattern.category),
        borderStyle: data.spacing.borderRadius,
        decoration,
        padding: mapPaddingForPattern(data.spacing.padding)
      },
      effects
    };
  });
}
function mapPatternToEffects(category) {
  const effectMap = {
    modern: { glow: false, noise: false },
    brutalist: { noise: true },
    neon: { glow: true, glitch: true },
    classic: {},
    playful: { glow: false },
    corporate: {},
    artistic: { noise: true },
    minimalist: {},
    retro: { noise: true },
    futuristic: { glow: true, grid: true }
  };
  return effectMap[category] || {};
}
function mapPatternToDecoration(category) {
  const decorationMap = {
    modern: "none",
    brutalist: "noise",
    neon: "glitch",
    classic: "none",
    playful: "none",
    corporate: "none",
    artistic: "noise",
    minimalist: "none",
    retro: "noise",
    futuristic: "grid"
  };
  return decorationMap[category] || "none";
}
var CATEGORY_PALETTES = {
  modern: { bg: "#0f0f0f", text: "#ffffff", accent: "#6366f1", secondary: "#1a1a2e" },
  brutalist: { bg: "#111111", text: "#ffffff", accent: "#ff5277", secondary: "#1a1a1a" },
  neon: { bg: "#0a0a0f", text: "#00ffff", accent: "#ff00ff", secondary: "#151520" },
  classic: { bg: "#faf8f3", text: "#2d2d2d", accent: "#8b4513", secondary: "#f0ebe0" },
  playful: { bg: "#fff5f5", text: "#2d2d2d", accent: "#ff6b6b", secondary: "#ffe4e4" },
  corporate: { bg: "#f8fafc", text: "#1e293b", accent: "#0f172a", secondary: "#e2e8f0" },
  artistic: { bg: "#1a1a1a", text: "#f5f5f5", accent: "#ffd700", secondary: "#2a2a2a" },
  minimalist: { bg: "#ffffff", text: "#1a1a1a", accent: "#6366f1", secondary: "#f5f5f5" },
  retro: { bg: "#f4e4bc", text: "#3d2914", accent: "#d4594a", secondary: "#e8d5a3" },
  futuristic: { bg: "#050510", text: "#00ff88", accent: "#00d4ff", secondary: "#0a0a1a" }
};
function adjustColorsForPattern(colors, category) {
  const palette = CATEGORY_PALETTES[category] || CATEGORY_PALETTES.modern;
  const hasExtractedColors = colors.palette.length > 2;
  if (hasExtractedColors) {
    const bgBrightness = getColorBrightness(colors.background);
    if (["neon", "brutalist", "futuristic"].includes(category)) {
      if (bgBrightness > 128) {
        return {
          ...colors,
          background: palette.bg,
          text: palette.text
        };
      }
    }
    if (category === "classic" && bgBrightness < 200) {
      return {
        ...colors,
        background: palette.bg,
        text: palette.text
      };
    }
    return colors;
  }
  return {
    primary: palette.accent,
    secondary: palette.secondary,
    background: palette.bg,
    text: palette.text,
    accent: palette.accent,
    palette: [palette.accent, palette.secondary, palette.text, palette.bg]
  };
}
function mapFontForPattern(originalFont, category) {
  const fontMap = {
    modern: "'Inter', sans-serif",
    brutalist: "'Space Mono', monospace",
    neon: "'Space Mono', monospace",
    classic: "'Playfair Display', serif",
    playful: "'Quicksand', sans-serif",
    corporate: "'Inter', sans-serif",
    artistic: originalFont.includes("serif") ? "'Playfair Display', serif" : "'Inter', sans-serif",
    minimalist: "'Inter', sans-serif",
    retro: "'Garamond', serif",
    futuristic: "'Space Mono', monospace"
  };
  return fontMap[category] || originalFont;
}
function mapHeadingSizeForPattern(category) {
  const sizeMap = {
    modern: "2.5rem",
    brutalist: "3rem",
    neon: "1.8rem",
    classic: "2.8rem",
    playful: "2.2rem",
    corporate: "2rem",
    artistic: "2.6rem",
    minimalist: "2.2rem",
    retro: "2.8rem",
    futuristic: "1.6rem"
  };
  return sizeMap[category] || "2rem";
}
function mapBodySizeForPattern(category) {
  const sizeMap = {
    modern: "1rem",
    brutalist: "0.9rem",
    neon: "0.85rem",
    classic: "1.1rem",
    playful: "1rem",
    corporate: "0.9rem",
    artistic: "1rem",
    minimalist: "0.9rem",
    retro: "1.1rem",
    futuristic: "0.8rem"
  };
  return sizeMap[category] || "1rem";
}
function mapAlignmentForPattern(category) {
  const alignmentMap = {
    modern: "center",
    brutalist: "left",
    neon: "left",
    classic: "left",
    playful: "center",
    corporate: "left",
    artistic: "center",
    minimalist: "center",
    retro: "left",
    futuristic: "left"
  };
  return alignmentMap[category] || "center";
}
function mapPaddingForPattern(padding) {
  const paddingMap = {
    tight: "1rem",
    normal: "1.5rem",
    loose: "2rem"
  };
  return paddingMap[padding] || "1.5rem";
}
function getColorBrightness(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1e3;
}
function getColorSaturation(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  return (max - min) / (1 - Math.abs(2 * l - 1));
}

// shared/creative/color.ts
function parseHex(hex) {
  hex = hex.replace(/^#/, "");
  if (hex.length === 3) {
    hex = hex.split("").map((c) => c + c).join("");
  }
  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return [r, g, b];
}
function toHex(r, g, b) {
  const clamp = (val) => Math.max(0, Math.min(255, Math.round(val)));
  const toHexStr = (val) => clamp(val).toString(16).padStart(2, "0");
  return `#${toHexStr(r)}${toHexStr(g)}${toHexStr(b)}`;
}
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h, s, l];
}
function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p2, q2, t2) => {
      if (t2 < 0) t2 += 1;
      if (t2 > 1) t2 -= 1;
      if (t2 < 1 / 6) return p2 + (q2 - p2) * 6 * t2;
      if (t2 < 1 / 2) return q2;
      if (t2 < 2 / 3) return p2 + (q2 - p2) * (2 / 3 - t2) * 6;
      return p2;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [r * 255, g * 255, b * 255];
}
function lighten(hex, pct) {
  const [r, g, b] = parseHex(hex);
  if (pct === 0) return toHex(r, g, b);
  const [h, s, l] = rgbToHsl(r, g, b);
  const newL = Math.min(1, l + pct / 100);
  const [newR, newG, newB] = hslToRgb(h, s, newL);
  return toHex(newR, newG, newB);
}
function darken(hex, pct) {
  const [r, g, b] = parseHex(hex);
  if (pct === 0) return toHex(r, g, b);
  const [h, s, l] = rgbToHsl(r, g, b);
  const newL = Math.max(0, l - pct / 100);
  const [newR, newG, newB] = hslToRgb(h, s, newL);
  return toHex(newR, newG, newB);
}
function mix(hexA, hexB, t2) {
  const [r1, g1, b1] = parseHex(hexA);
  const [r2, g2, b2] = parseHex(hexB);
  const clamp = (val) => Math.max(0, Math.min(1, val));
  const tNorm = clamp(t2);
  const r = Math.round(r1 + (r2 - r1) * tNorm);
  const g = Math.round(g1 + (g2 - g1) * tNorm);
  const b = Math.round(b1 + (b2 - b1) * tNorm);
  return toHex(r, g, b);
}
function luminance(r, g, b) {
  const a = [r, g, b].map(function(v) {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}
function contrastRatio(hexA, hexB) {
  const [r1, g1, b1] = parseHex(hexA);
  const [r2, g2, b2] = parseHex(hexB);
  const lum1 = luminance(r1, g1, b1);
  const lum2 = luminance(r2, g2, b2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}
function isDark2(hex) {
  return contrastRatio(hex, "#ffffff") > contrastRatio(hex, "#000000");
}
var OVERLAY_DOMINANT_THRESHOLD = 0.55;
function effectiveBackgroundColor(input, fallbackColor) {
  if (input.backgroundType === "solid") {
    const solid = input.solidColor || fallbackColor;
    const overlayOpacity = input.overlayOpacity ?? 0;
    if (input.overlayColor && overlayOpacity >= OVERLAY_DOMINANT_THRESHOLD) {
      return { color: mix(solid, input.overlayColor, overlayOpacity), basis: "overlay-dominant" };
    }
    return { color: solid, basis: "solid" };
  }
  if (input.overlayColor && (input.overlayOpacity ?? 0) >= OVERLAY_DOMINANT_THRESHOLD) {
    return { color: input.overlayColor, basis: "overlay-dominant" };
  }
  return { color: input.overlayColor || fallbackColor, basis: "unproven" };
}

// server/postJudge.ts
function contrastRatio2(hex1, hex2) {
  try {
    return contrastRatio(hex1, hex2);
  } catch {
    return 1;
  }
}
function contrastToScore(ratio) {
  if (ratio >= 7) return 100;
  if (ratio >= 4.5) return 75;
  if (ratio >= 3) return 50;
  if (ratio >= 2) return 30;
  return 15;
}
async function evaluatePostQuality(variations, brandDNA) {
  if (variations.length === 0) return [];
  console.log(`[postJudge] Evaluating ${variations.length} variation(s)...`);
  const contrastScores = variations.map((v) => ({
    textContrast: contrastToScore(contrastRatio2(v.backgroundColor, v.textColor)),
    accentContrast: contrastToScore(contrastRatio2(v.backgroundColor, v.accentColor))
  }));
  const brandContext = brandDNA ? `
Brand DNA Context:
- Brand: ${brandDNA.brandName} (${brandDNA.industry})
- Mood: ${brandDNA.emotionalProfile.mood}
- Primary color: ${brandDNA.colors.primary}
- Personality: serious=${100 - brandDNA.personality.seriousPlayful}/100, bold=${100 - brandDNA.personality.boldSubtle}/100
- Composition: ${brandDNA.composition.rhythm} rhythm, ${brandDNA.composition.dynamics} dynamics` : "No brand DNA provided \u2014 evaluate without brand alignment context.";
  const variationsSummary = variations.map(
    (v, i) => `
Variation ${i + 1}:
- Headline: "${v.headline}"
- Body: "${v.body.slice(0, 120)}${v.body.length > 120 ? "..." : ""}"
- CTA: "${v.callToAction}"
- Layout: ${v.layout}
- Colors: bg=${v.backgroundColor}, text=${v.textColor}, accent=${v.accentColor}
- Platform: ${v.platform}
- Measured contrast ratio (text/bg): ${contrastRatio2(v.backgroundColor, v.textColor).toFixed(1)}:1`
  ).join("\n");
  try {
    const response = await invokeLLM({
      traceLabel: "post_quality_judge",
      taskRoute: "post_evaluation",
      messages: [
        {
          role: "system",
          content: `You are a Senior Brand Strategist and Social Media Art Director.
Your task is to evaluate ${variations.length} social media post variation(s) as an expert judge.

Evaluate each variation on these dimensions (0-100 each):
1. **brandAlignment** \u2014 how well do the copy/colors/tone match the brand's DNA? (50 if no brand DNA)
2. **aestheticQuality** \u2014 NIMA-inspired: is the visual composition appealing? Consider color harmony, contrast, visual hierarchy
3. **readability** \u2014 Is the text easy to read? Consider contrast, length, hierarchy (use the measured contrast data provided)
4. **messageClarity** \u2014 VQAScore-inspired: does every element serve the main message? Is the CTA clear?
5. **engagement** \u2014 will this catch attention on social media? Consider hook strength, emotional pull, shareability

For each variation, also provide:
- Up to 3 specific, actionable improvement suggestions (concrete, not generic)
- A verdict: "excellent" (avg \u2265 80), "good" (avg \u2265 60), "needs-improvement" (avg < 60)

Be honest and specific. Avoid inflated scores \u2014 real feedback is more valuable.`
        },
        {
          role: "user",
          content: `${brandContext}

${variationsSummary}

Evaluate all ${variations.length} variation(s). Return JSON matching the schema exactly.`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "post_quality_evaluation",
          strict: true,
          schema: {
            type: "object",
            properties: {
              evaluations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    overallScore: { type: "number", description: "Average of all dimensions (0-100)" },
                    dimensions: {
                      type: "object",
                      properties: {
                        brandAlignment: { type: "number" },
                        aestheticQuality: { type: "number" },
                        readability: { type: "number" },
                        messageClarity: { type: "number" },
                        engagement: { type: "number" }
                      },
                      required: ["brandAlignment", "aestheticQuality", "readability", "messageClarity", "engagement"],
                      additionalProperties: false
                    },
                    suggestions: {
                      type: "array",
                      items: { type: "string" }
                    },
                    verdict: { type: "string", enum: ["excellent", "good", "needs-improvement"] }
                  },
                  required: ["overallScore", "dimensions", "suggestions", "verdict"],
                  additionalProperties: false
                }
              }
            },
            required: ["evaluations"],
            additionalProperties: false
          }
        }
      }
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from Judge LLM");
    const str = typeof content === "string" ? content : JSON.stringify(content);
    const parsed = JSON.parse(str);
    const merged = parsed.evaluations.map((ev, i) => {
      const cs = contrastScores[i];
      if (!cs) return ev;
      const blendedReadability = Math.round(ev.dimensions.readability * 0.7 + cs.textContrast * 0.3);
      const dims = { ...ev.dimensions, readability: blendedReadability };
      const overall = Math.round(
        (dims.brandAlignment + dims.aestheticQuality + dims.readability + dims.messageClarity + dims.engagement) / 5
      );
      const verdict = overall >= 80 ? "excellent" : overall >= 60 ? "good" : "needs-improvement";
      return { ...ev, dimensions: dims, overallScore: overall, verdict };
    });
    console.log("[postJudge] Evaluation complete:", merged.map((e) => ({
      score: e.overallScore,
      verdict: e.verdict
    })));
    return merged;
  } catch (err) {
    console.warn("[postJudge] LLM evaluation failed:", err);
    return variations.map((v, i) => ({
      overallScore: 70,
      dimensions: {
        brandAlignment: 70,
        aestheticQuality: 70,
        readability: contrastScores[i]?.textContrast ?? 70,
        messageClarity: 70,
        engagement: 70
      },
      suggestions: [],
      verdict: "good"
    }));
  }
}

// server/siteIntelligence.ts
import { randomUUID as randomUUID2 } from "node:crypto";
init_db();

// server/siteContent.ts
import { createHash as createHash4 } from "node:crypto";
function normalizeSiteUrl(rawUrl) {
  const withProtocol = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const url = new URL(withProtocol);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}
function decodeHtmlEntities(value) {
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}
function extractMeta(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`,
      "i"
    )
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1]).trim();
  }
  return "";
}
function extractReadablePage(url, html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = extractMeta(html, "og:title") || decodeHtmlEntities(titleMatch?.[1] || "").replace(/\s+/g, " ").trim();
  const description = extractMeta(html, "og:description") || extractMeta(html, "description");
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyHtml = bodyMatch?.[1] || html;
  const content = decodeHtmlEntities(
    bodyHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ").replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ").replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim().slice(0, 12e3);
  return { url, title, description, content };
}
async function scrapeUrl(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PostSpark/2.0)",
        Accept: "text/html"
      },
      signal: AbortSignal.timeout(12e3)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return extractReadablePage(url, await response.text());
  } catch (error) {
    console.warn("[siteContent] Failed to scrape URL:", url, error);
    return { url, title: "", description: "", content: "" };
  }
}
function buildEvidence(pages) {
  const evidence = [];
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];
    if (page.title) {
      evidence.push({
        id: `page-${pageIndex + 1}-title`,
        sourceUrl: page.url,
        kind: "title",
        text: page.title.slice(0, 300)
      });
    }
    if (page.description) {
      evidence.push({
        id: `page-${pageIndex + 1}-description`,
        sourceUrl: page.url,
        kind: "description",
        text: page.description.slice(0, 500)
      });
    }
    if (page.content) {
      evidence.push({
        id: `page-${pageIndex + 1}-body`,
        sourceUrl: page.url,
        kind: "body",
        text: page.content.slice(0, 2500)
      });
    }
  }
  return evidence.slice(0, 15);
}
async function collectSiteContent(rawUrl) {
  const normalizedUrl = normalizeSiteUrl(rawUrl);
  const discoveredPages = await discoverPages(normalizedUrl, 8);
  const prioritized = discoveredPages.filter((page) => page.priority !== "low").map((page) => page.url);
  const urls = Array.from(/* @__PURE__ */ new Set([normalizedUrl, ...prioritized])).slice(0, 5);
  const pages = await Promise.all(urls.map(scrapeUrl));
  const evidence = buildEvidence(pages);
  const fingerprint = createHash4("sha256").update(
    JSON.stringify(
      pages.map(({ url, title, description, content }) => ({
        url,
        title,
        description,
        content
      }))
    )
  ).digest("hex");
  return {
    normalizedUrl,
    pages,
    evidence,
    fingerprint,
    discoveredPages
  };
}

// server/siteIntelligence.ts
function responseText2(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter(
      (part) => Boolean(part) && typeof part === "object" && "type" in part && part.type === "text" && "text" in part && typeof part.text === "string"
    ).map((part) => part.text).join("\n");
  }
  return "";
}
function uniqueWords(value, limit) {
  const stopWords = /* @__PURE__ */ new Set([
    "para",
    "com",
    "uma",
    "que",
    "dos",
    "das",
    "por",
    "seu",
    "sua",
    "the",
    "and",
    "with",
    "from",
    "our"
  ]);
  const words = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]{4,}/g) ?? [];
  return Array.from(new Set(words.filter((word) => !stopWords.has(word)))).slice(
    0,
    limit
  );
}
function fallbackSynthesis(content) {
  const combined = content.pages.map((page) => `${page.title} ${page.description} ${page.content}`).join(" ").slice(0, 2e4);
  const topics = uniqueWords(combined, 8);
  const summary = content.pages[0]?.description || content.pages[0]?.content.slice(0, 300) || `Conteudo institucional de ${new URL(content.normalizedUrl).hostname}.`;
  return {
    business: {
      summary,
      products: [],
      services: [],
      valueProposition: summary,
      differentiators: [],
      audiences: [],
      audienceProblems: [],
      objections: [],
      goals: ["authority", "engage"]
    },
    editorial: {
      pillars: topics.slice(0, 4),
      priorityTopics: topics,
      prohibitedClaims: [
        "Nao inventar numeros, clientes, certificacoes ou resultados sem evidencia."
      ],
      toneGuidelines: [
        "Manter linguagem coerente com as evidencias do site.",
        "Evitar tom generico quando houver sinais editoriais claros."
      ]
    },
    warnings: [
      "A sintese semantica usou fallback deterministico; confirme publico, oferta e diferenciais."
    ]
  };
}
async function synthesizeBusiness(content) {
  const evidenceText = content.evidence.map(
    (item) => `[${item.id}] ${item.kind} ${item.sourceUrl}
${item.text}`
  ).join("\n\n").slice(0, 28e3);
  if (!evidenceText.trim()) {
    return fallbackSynthesis(content);
  }
  try {
    const response = await invokeLLM({
      traceLabel: "site_semantic_analysis",
      taskRoute: "content_strategy",
      messages: [
        {
          role: "system",
          content: `Voce e um estrategista de marca e conteudo. Extraia somente informacoes sustentadas pelas evidencias do site.
Nao invente produtos, publicos, diferenciais, resultados ou objetivos.
Quando algo nao estiver claro, retorne array vazio e registre um warning.
Os pilares e temas editoriais devem servir ao assunto, publico e objetivos comerciais observados no site.`
        },
        {
          role: "user",
          content: `Evidencias:
${evidenceText}

Sintetize negocio e estrategia editorial. Responda apenas JSON valido.`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "site_business_intelligence",
          strict: true,
          schema: {
            type: "object",
            properties: {
              business: {
                type: "object",
                properties: {
                  summary: { type: "string" },
                  products: { type: "array", items: { type: "string" } },
                  services: { type: "array", items: { type: "string" } },
                  valueProposition: { type: "string" },
                  differentiators: { type: "array", items: { type: "string" } },
                  audiences: { type: "array", items: { type: "string" } },
                  audienceProblems: { type: "array", items: { type: "string" } },
                  objections: { type: "array", items: { type: "string" } },
                  goals: {
                    type: "array",
                    items: {
                      type: "string",
                      enum: ["educate", "authority", "sell", "engage", "lead"]
                    }
                  }
                },
                required: [
                  "summary",
                  "products",
                  "services",
                  "valueProposition",
                  "differentiators",
                  "audiences",
                  "audienceProblems",
                  "objections",
                  "goals"
                ],
                additionalProperties: false
              },
              editorial: {
                type: "object",
                properties: {
                  pillars: { type: "array", items: { type: "string" } },
                  priorityTopics: { type: "array", items: { type: "string" } },
                  prohibitedClaims: { type: "array", items: { type: "string" } },
                  toneGuidelines: { type: "array", items: { type: "string" } }
                },
                required: [
                  "pillars",
                  "priorityTopics",
                  "prohibitedClaims",
                  "toneGuidelines"
                ],
                additionalProperties: false
              },
              warnings: { type: "array", items: { type: "string" } }
            },
            required: ["business", "editorial", "warnings"],
            additionalProperties: false
          }
        }
      }
    });
    const parsed = JSON.parse(
      responseText2(response.choices[0]?.message?.content)
    );
    return parsed;
  } catch (error) {
    console.warn("[siteIntelligence] Semantic synthesis failed:", error);
    return fallbackSynthesis(content);
  }
}
function calculateQuality(brand, content, synthesis) {
  const semanticSignals = [
    synthesis.business.summary,
    synthesis.business.valueProposition,
    ...synthesis.business.products,
    ...synthesis.business.services,
    ...synthesis.business.audiences,
    ...synthesis.editorial.pillars
  ].filter(Boolean).length;
  const semantic = Math.min(1, semanticSignals / 10);
  const evidenceCoverage = Math.min(1, content.evidence.length / 8);
  const visual = brand.metadata.extractionQuality;
  const fallbackUsed = synthesis.warnings.some(
    (warning) => warning.toLowerCase().includes("fallback")
  );
  return {
    overall: Number(
      (visual * 0.4 + semantic * 0.4 + evidenceCoverage * 0.2).toFixed(3)
    ),
    visual,
    semantic,
    evidenceCoverage,
    fallbackUsed,
    warnings: synthesis.warnings
  };
}
function isSiteIntelligence(value) {
  return Boolean(
    value && typeof value === "object" && "id" in value && "brand" in value && "business" in value && "editorial" in value
  );
}
async function loadSiteIntelligence(id, userUuid) {
  try {
    const record = await getSiteIntelligenceById(id, userUuid);
    return isSiteIntelligence(record?.snapshot) ? record.snapshot : null;
  } catch (error) {
    console.warn("[siteIntelligence] Could not load persisted snapshot:", error);
    return null;
  }
}
async function analyzeSiteIntelligence(rawUrl, userUuid, options = {}) {
  const shouldPersist = options.persist !== false;
  const normalizedUrl = normalizeSiteUrl(rawUrl);
  const content = await collectSiteContent(normalizedUrl);
  if (shouldPersist) {
    try {
      const cached = await getLatestSiteIntelligenceByUrl(normalizedUrl, userUuid);
      if (cached?.fingerprint === content.fingerprint && isSiteIntelligence(cached.snapshot)) {
        const siteIntelligence2 = cached.snapshot;
        return {
          siteIntelligence: siteIntelligence2,
          brandDNA: siteIntelligence2.brand,
          themes: generateThemesFromBrandDNA(siteIntelligence2.brand, normalizedUrl),
          fallbackUsed: siteIntelligence2.quality.fallbackUsed,
          cached: true
        };
      }
    } catch (error) {
      console.warn("[siteIntelligence] Cache lookup unavailable:", error);
    }
  }
  const [brand, synthesis] = await Promise.all([
    extractBrandDNA(normalizedUrl, {
      discoveredPages: content.discoveredPages
    }),
    synthesizeBusiness(content)
  ]);
  const siteIntelligence = {
    id: randomUUID2(),
    version: 1,
    sourceUrl: rawUrl,
    normalizedUrl,
    fingerprint: content.fingerprint,
    brand,
    business: synthesis.business,
    editorial: synthesis.editorial,
    evidence: content.evidence,
    quality: calculateQuality(brand, content, synthesis),
    extractedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (shouldPersist) {
    try {
      const record = await upsertSiteIntelligence({
        id: siteIntelligence.id,
        userUuid,
        sourceUrl: rawUrl,
        normalizedUrl,
        fingerprint: content.fingerprint,
        snapshot: siteIntelligence
      });
      if (record.id !== siteIntelligence.id) {
        siteIntelligence.id = record.id;
      }
    } catch (error) {
      console.warn("[siteIntelligence] Persistence unavailable:", error);
      siteIntelligence.quality.warnings.push(
        "Snapshot nao persistido; a migration de site_intelligence pode estar pendente."
      );
    }
  }
  return {
    siteIntelligence,
    brandDNA: brand,
    themes: generateThemesFromBrandDNA(brand, normalizedUrl),
    fallbackUsed: siteIntelligence.quality.fallbackUsed,
    cached: false
  };
}
function siteIntelligenceToPrompt(intelligence) {
  const palette = intelligence.brand.colors.palette ?? [
    intelligence.brand.colors.primary,
    intelligence.brand.colors.secondary,
    intelligence.brand.colors.background,
    intelligence.brand.colors.text,
    intelligence.brand.colors.accent
  ];
  const brandAccent = pickBrandAccent(palette) ?? intelligence.brand.colors.accent ?? intelligence.brand.colors.primary ?? "#ff6f61";
  const canvasBackground = pickCanvasBackground(palette);
  return `SITE INTELLIGENCE (fonte unica):
- Snapshot: ${intelligence.id}
- Marca/setor: ${intelligence.brand.brandName} (${intelligence.brand.industry})
- Resumo do negocio: ${intelligence.business.summary}
- Proposta de valor: ${intelligence.business.valueProposition}
- Produtos: ${intelligence.business.products.join("; ") || "nao confirmados"}
- Servicos: ${intelligence.business.services.join("; ") || "nao confirmados"}
- Publicos: ${intelligence.business.audiences.join("; ") || "nao confirmados"}
- Problemas do publico: ${intelligence.business.audienceProblems.join("; ") || "nao confirmados"}
- Diferenciais: ${intelligence.business.differentiators.join("; ") || "nao confirmados"}
- Objetivos observados: ${intelligence.business.goals.join(", ")}
- Pilares editoriais: ${intelligence.editorial.pillars.join("; ")}
- Temas prioritarios: ${intelligence.editorial.priorityTopics.join("; ")}
- Tom: ${intelligence.editorial.toneGuidelines.join("; ")}
- Alegacoes proibidas: ${intelligence.editorial.prohibitedClaims.join("; ")}
- Cores: ${palette.join(", ")}
- Ritmo/dinamica: ${intelligence.brand.composition.rhythm}/${intelligence.brand.composition.dynamics}

REGRAS:
1. Cada tema e post deve se conectar explicitamente a assunto, publico e objetivo acima.
2. Nao invente oferta, numero, cliente, certificacao ou resultado ausente nas evidencias.
3. Use os temas prioritarios como materia-prima, sem copiar frases do site literalmente.
4. Preserve a identidade visual da marca e contraste legivel.

REGRAS DE CORES OBRIGATORIAS (BRAND SOUL):
- O post DEVE pertencer visualmente ao site. As cores abaixo sao MANDATORIAS.
- backgroundColor DEVE ser um destes hexes: ${[canvasBackground, ...palette].slice(0, 4).join(", ")}.
- accentColor DEVE ser o hex mais saturado da marca: ${brandAccent}.
- textColor deve garantir contraste WCAG >= 4.5:1 contra o backgroundColor escolhido.
- NUNCA use preto puro (#000000) nem branco puro (#ffffff) quando a paleta da marca oferece alternativas.`;
}
function hexToRgb(hex) {
  let clean = hex.trim().replace(/^#/, "");
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length !== 6) return null;
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return null;
  return {
    r: num >> 16 & 255,
    g: num >> 8 & 255,
    b: num & 255
  };
}
function relativeLuminance(rgb) {
  const normalize2 = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * normalize2(rgb.r) + 0.7152 * normalize2(rgb.g) + 0.0722 * normalize2(rgb.b);
}
function wcagContrast(hexA, hexB) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return 0;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
function colorSaturation(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  return max === 0 ? 0 : (max - min) / max;
}
function colorBrightness(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 128;
  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1e3;
}
var NEUTRAL_FALLBACK_HEXES = /* @__PURE__ */ new Set([
  "#ffffff",
  "#fff",
  "#1a1a1a",
  "#1f2937",
  "#262626",
  "#4a4a4a",
  "#000000",
  "#000"
]);
function isNeutralOrFallback(hex) {
  return NEUTRAL_FALLBACK_HEXES.has(hex.trim().toLowerCase());
}
function pickBrandAccent(palette) {
  const candidates = palette.filter((hex) => hexToRgb(hex) !== null).filter((hex) => !isNeutralOrFallback(hex)).sort((a, b) => colorSaturation(b) - colorSaturation(a));
  return candidates[0] ?? null;
}
function pickCanvasBackground(palette) {
  const valid = palette.filter((hex) => hexToRgb(hex) !== null);
  if (valid.length === 0) return "#171717";
  const darks = valid.filter((hex) => {
    const b = colorBrightness(hex);
    return b > 12 && b < 80;
  }).sort((a, b) => colorBrightness(a) - colorBrightness(b));
  if (darks.length > 0) return darks[0];
  const notPureBlack = valid.filter((hex) => colorBrightness(hex) > 12);
  const pool = notPureBlack.length > 0 ? notPureBlack : valid;
  return pool.sort((a, b) => colorBrightness(a) - colorBrightness(b))[0];
}
function readableTextFor(background, candidates) {
  for (const candidate of candidates) {
    if (hexToRgb(candidate) && wcagContrast(background, candidate) >= 4.5) {
      return candidate;
    }
  }
  return colorBrightness(background) < 128 ? "#FFFFFF" : "#1A1A1A";
}
function siteIntelligenceToDesignTokens(intelligence) {
  const brand = intelligence.brand;
  const palette = brand.colors.palette ?? [
    brand.colors.primary,
    brand.colors.secondary,
    brand.colors.background,
    brand.colors.text,
    brand.colors.accent
  ];
  const brandAccent = pickBrandAccent(palette) ?? brand.colors.accent ?? brand.colors.primary ?? "#ff6f61";
  const background = pickCanvasBackground(palette);
  const text = readableTextFor(background, [
    brand.colors.text,
    ...palette.filter((hex) => !isNeutralOrFallback(hex))
  ]);
  const secondary = pickBrandAccent(
    palette.filter((hex) => hex.toLowerCase() !== brandAccent.toLowerCase())
  ) ?? brand.colors.secondary ?? brandAccent;
  const card = secondary && wcagContrast(background, secondary) >= 3 ? secondary : background;
  return {
    colors: {
      background,
      primary: brandAccent,
      secondary,
      text,
      card
    },
    typography: {
      fontFamily: brand.typography.headingFont,
      customFontUrl: "",
      originalFont: brand.typography.headingFont,
      textTransform: "none",
      textAlign: brand.layout.preferredAlignment === "left" ? "left" : "center"
    },
    structure: {
      borderRadius: brand.layout.borderRadius === "square" ? "0px" : brand.layout.borderRadius === "pill" ? "40px" : "16px",
      boxShadow: brand.effects.shadows ? "0 10px 25px rgba(0,0,0,0.16)" : "none",
      border: brand.layout.cardStyle === "neobrutalist" ? `2px solid ${brand.colors.text}` : "none"
    },
    decorations: brand.personality.seriousPlayful > 60 ? "playful" : "minimal"
  };
}

// server/routers.ts
import * as fs2 from "fs";
import * as path3 from "path";

// server/billing.ts
init_env();
import Stripe from "stripe";
import { createClient as createClient5 } from "@supabase/supabase-js";
import { createHash as createHash5 } from "node:crypto";
var SPARK_COSTS = {
  GENERATE_TEXT: 10,
  // 3 variações de texto
  GENERATE_IMAGE: 25,
  // imagem IA
  REGEN_IMAGE: 10,
  // regenerar imagem (mesma sessão)
  CHAMELEON: 15,
  // ChameleonProtocol
  CAROUSEL: 40
  // carrossel completo (texto + imagem)
};
var _stripe = null;
function getStripe() {
  if (!_stripe) {
    if (!ENV.stripeSecretKey) throw new Error("STRIPE_SECRET_KEY not set");
    _stripe = new Stripe(ENV.stripeSecretKey, { apiVersion: "2026-01-28.clover" });
  }
  return _stripe;
}
var _supabase = null;
function getSupabase() {
  if (!_supabase) {
    if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
    }
    _supabase = createClient5(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
      auth: { persistSession: false },
      db: { schema: "postspark" }
    });
  }
  return _supabase;
}
async function rpcCall(fn, args) {
  const sb = getSupabase();
  const { data, error } = await sb.rpc(fn, args);
  return {
    data: data ?? null,
    error: error ? { message: error.message, code: error.code, details: error.details } : null
  };
}
var FREE_PROFILE_DEFAULTS = {
  plan: "FREE",
  sparks: 150,
  sparks_refill_date: null,
  stripe_customer_id: null
};
async function getBillingProfile(email) {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
    return { id: "dev-mock", email, ...FREE_PROFILE_DEFAULTS };
  }
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from("profiles").select("id, email, plan, sparks, sparks_refill_date, stripe_customer_id").eq("email", email).single();
    if (error || !data) {
      return { id: "no-profile", email, ...FREE_PROFILE_DEFAULTS };
    }
    return data;
  } catch {
    return { id: "error", email, ...FREE_PROFILE_DEFAULTS };
  }
}
async function debitSparks(profileId, amount, description) {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) return { success: true };
  if (profileId === "dev-mock" || profileId === "no-profile" || profileId === "error") {
    return { success: true };
  }
  try {
    const { data, error } = await rpcCall("debit_sparks", {
      p_user_id: profileId,
      p_amount: amount,
      p_description: description
    });
    if (error) return { success: false, reason: error.message };
    return { success: Boolean(data), reason: data ? void 0 : "insufficient_sparks" };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}
function isSentinelProfile(profileId) {
  return profileId === "dev-mock" || profileId === "no-profile" || profileId === "error";
}
function isUnlimitedPlan(plan) {
  return plan === "FOUNDER" || plan === "DEV";
}
function isBillingDisabled() {
  return !ENV.supabaseUrl || !ENV.supabaseServiceRoleKey;
}
function deriveIdempotencyKey(userUuid, input) {
  const normalized = `${userUuid}:${input.inputType}:${input.postMode}:${input.platform}:${input.content.trim()}`;
  return "gen_" + createHash5("sha256").update(normalized).digest("hex").slice(0, 24);
}
async function reserveSparks(profile, amount, idempotencyKey, description) {
  if (isBillingDisabled() || isSentinelProfile(profile.id) || isUnlimitedPlan(profile.plan)) {
    return { reservationId: "dev-mock" };
  }
  try {
    const { data, error } = await rpcCall("reserve_sparks", {
      p_user_id: profile.id,
      p_amount: amount,
      p_idempotency_key: idempotencyKey,
      p_description: description
    });
    if (error) return { reservationId: null, reason: error.message };
    if (!data) return { reservationId: null, reason: "insufficient_sparks" };
    return { reservationId: data };
  } catch (err) {
    return { reservationId: null, reason: err.message };
  }
}
async function commitSparkReservation(reservationId, generationRunId) {
  if (isBillingDisabled() || reservationId === "dev-mock") {
    return true;
  }
  try {
    const { data, error } = await rpcCall("commit_spark_reservation", {
      p_reservation_id: reservationId,
      p_generation_run_id: generationRunId
    });
    if (error) {
      console.warn("[billing] commit_spark_reservation failed:", error.message);
      return false;
    }
    return Boolean(data);
  } catch (err) {
    console.warn("[billing] commit_spark_reservation error:", err.message);
    return false;
  }
}
async function refundSparkReservation(reservationId, errorDetail) {
  if (isBillingDisabled() || reservationId === "dev-mock") {
    return true;
  }
  try {
    const { data, error } = await rpcCall("refund_spark_reservation", {
      p_reservation_id: reservationId,
      p_error_detail: errorDetail
    });
    if (error) {
      console.warn("[billing] refund_spark_reservation failed:", error.message);
      return false;
    }
    return Boolean(data);
  } catch (err) {
    console.warn("[billing] refund_spark_reservation error:", err.message);
    return false;
  }
}
async function getTopupPackages() {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) return [];
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from("topup_packages").select("*").eq("active", true).order("price_brl", { ascending: true });
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}
async function getOrCreateStripeCustomer(profileId, email, name) {
  const sb = getSupabase();
  const { data: profile } = await sb.from("profiles").select("stripe_customer_id").eq("id", profileId).single();
  if (profile?.stripe_customer_id) return profile.stripe_customer_id;
  const stripe = getStripe();
  const customer = await stripe.customers.create({ email, name });
  await sb.from("profiles").update({ stripe_customer_id: customer.id }).eq("id", profileId);
  return customer.id;
}
async function createSubscriptionCheckout(params) {
  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(params.profileId, params.email, params.name);
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: params.priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    currency: "brl",
    metadata: { profile_id: params.profileId, email: params.email },
    subscription_data: {
      metadata: { profile_id: params.profileId, email: params.email }
    }
  });
  return session.url;
}
function getSubscriptionPriceId(plan, cycle) {
  if (plan === "PRO") {
    const priceId2 = cycle === "annual" ? ENV.stripePriceProAnnual : ENV.stripePriceProMonthly;
    if (!priceId2) throw new Error(`Stripe price for ${plan} (${cycle}) not configured`);
    return priceId2;
  }
  const priceId = cycle === "annual" ? ENV.stripePriceAgencyAnnual : ENV.stripePriceAgencyMonthly;
  if (!priceId) throw new Error(`Stripe price for ${plan} (${cycle}) not configured`);
  return priceId;
}
async function createTopupCheckout(params) {
  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(params.profileId, params.email, params.name);
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [{ price: params.priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    currency: "brl",
    metadata: {
      profile_id: params.profileId,
      email: params.email,
      package_id: params.packageId,
      type: "topup"
    }
  });
  return session.url;
}
async function handleStripeWebhook(event) {
  const sb = getSupabase();
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const meta = session.metadata ?? {};
      const profileId = meta.profile_id;
      const email = meta.email;
      if (!profileId || !email) return;
      if (meta.type === "topup") {
        const packageId = meta.package_id;
        if (!packageId || !session.payment_intent) return;
        await rpcCall("process_topup", {
          p_user_id: profileId,
          p_package_id: packageId,
          p_stripe_payment_intent_id: session.payment_intent
        });
      }
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object;
      const meta = sub.metadata ?? {};
      const profileId = meta.profile_id;
      if (!profileId) return;
      const plan = getPlanFromPriceId(sub.items?.data?.[0]?.price?.id ?? "");
      const status = mapStripeStatus(sub.status);
      const periodStart = sub.current_period_start ?? sub.items?.data?.[0]?.period?.start;
      const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.period?.end;
      await sb.from("subscriptions").upsert({
        stripe_subscription_id: sub.id,
        user_id: profileId,
        stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
        plan,
        status,
        current_period_start: periodStart ? new Date(periodStart * 1e3).toISOString() : null,
        current_period_end: periodEnd ? new Date(periodEnd * 1e3).toISOString() : null,
        cancel_at_period_end: sub.cancel_at_period_end ?? false,
        billing_cycle: sub.items?.data?.[0]?.price?.recurring?.interval === "year" ? "annual" : "monthly"
      }, { onConflict: "stripe_subscription_id" });
      if (status === "active" || status === "trialing") {
        await sb.from("profiles").update({ plan }).eq("id", profileId);
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const meta = sub.metadata ?? {};
      const profileId = meta.profile_id;
      if (!profileId) return;
      await sb.from("profiles").update({ plan: "FREE" }).eq("id", profileId);
      await sb.from("subscriptions").update({ status: "canceled" }).eq("stripe_subscription_id", sub.id);
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription ?? invoice.subscription_details?.subscription;
      if (!subscriptionId) return;
      await sb.from("subscriptions").update({ status: "past_due" }).eq("stripe_subscription_id", subscriptionId);
      break;
    }
    case "payment_intent.succeeded": {
      break;
    }
  }
}
function getPlanFromPriceId(priceId) {
  if (priceId === ENV.stripePriceAgencyMonthly || priceId === ENV.stripePriceAgencyAnnual) {
    return "AGENCY";
  }
  if (priceId === ENV.stripePriceProMonthly || priceId === ENV.stripePriceProAnnual) {
    return "PRO";
  }
  throw new Error(`Unknown Stripe price id received in webhook: ${priceId}`);
}
function mapStripeStatus(status) {
  switch (status) {
    case "active":
      return "active";
    case "canceled":
      return "canceled";
    case "past_due":
      return "past_due";
    case "trialing":
      return "trialing";
    case "paused":
      return "paused";
    default:
      return "active";
  }
}

// server/routers.ts
init_env();
import { TRPCError as TRPCError5 } from "@trpc/server";

// server/ai/contentStrategy.ts
var ANGLES = [
  "pain",
  "benefit",
  "objection",
  "authority",
  "story",
  "myth",
  "how-to"
];
function normalize(value) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]{3,}/g) ?? [];
}
function lexicalOverlap(a, b) {
  const aSet = new Set(normalize(a));
  const bSet = new Set(normalize(b));
  if (aSet.size === 0 || bSet.size === 0) return 0;
  const intersection = Array.from(aSet).filter((token) => bSet.has(token)).length;
  return intersection / Math.min(aSet.size, bSet.size);
}
function resolveObjective(intelligence, executionBrief) {
  return executionBrief?.objective ?? intelligence?.business.goals[0] ?? "engage";
}
function buildFallbackCandidates(sourceContent, objective, intelligence) {
  const topics = [
    ...intelligence?.editorial.priorityTopics ?? [],
    ...intelligence?.editorial.pillars ?? []
  ];
  const fallbackTopic = intelligence?.business.valueProposition || sourceContent.slice(0, 120) || "tema principal";
  const uniqueTopics = Array.from(new Set(topics.filter(Boolean)));
  const audiences = intelligence?.business.audiences.length ? intelligence.business.audiences : ["publico principal"];
  const evidenceIds = intelligence?.evidence.map((item) => item.id) ?? [];
  return Array.from({ length: 5 }, (_, index) => {
    const topic = uniqueTopics[index % Math.max(uniqueTopics.length, 1)] || fallbackTopic;
    const angle = ANGLES[index % ANGLES.length];
    return {
      title: `${topic} por ${angle}`,
      topic,
      objective,
      audience: audiences[index % audiences.length],
      angle,
      hook: `${topic}: o ponto que merece atencao agora`,
      promise: intelligence?.business.valueProposition || "Entregar uma perspectiva util e acionavel.",
      evidenceIds: evidenceIds.slice(index % 2, index % 2 + 2)
    };
  });
}
function scoreCandidates(candidates, sourceContent, objective, intelligence) {
  const topicReference = [
    sourceContent,
    intelligence?.business.summary ?? "",
    intelligence?.business.valueProposition ?? "",
    ...intelligence?.editorial.priorityTopics ?? [],
    ...intelligence?.editorial.pillars ?? []
  ].join(" ");
  const validEvidence = new Set(
    intelligence?.evidence.map((item) => item.id) ?? []
  );
  return candidates.map((candidate, index) => {
    const topicRelevance = Math.round(
      Math.min(1, lexicalOverlap(candidate.topic, topicReference) * 1.5) * 100
    );
    const objectiveAlignment = candidate.objective === objective ? 100 : 45;
    const evidenceGrounding = intelligence ? candidate.evidenceIds.length === 0 ? 35 : Math.round(
      candidate.evidenceIds.filter((id) => validEvidence.has(id)).length / candidate.evidenceIds.length * 100
    ) : 70;
    const distinctiveness = Math.round(
      (1 - Math.max(
        0,
        ...candidates.filter((_, otherIndex) => otherIndex !== index).map((other) => lexicalOverlap(candidate.topic, other.topic))
      )) * 100
    );
    const total = Math.round(
      topicRelevance * 0.35 + objectiveAlignment * 0.3 + evidenceGrounding * 0.25 + distinctiveness * 0.1
    );
    return {
      ...candidate,
      id: `strategy-${index + 1}`,
      score: {
        total,
        topicRelevance,
        objectiveAlignment,
        evidenceGrounding,
        distinctiveness
      }
    };
  });
}
function selectDistinctStrategies(candidates) {
  const ranked = [...candidates].sort((a, b) => b.score.total - a.score.total);
  const selected = [];
  for (const candidate of ranked) {
    const duplicates = selected.some(
      (item) => item.angle === candidate.angle && lexicalOverlap(item.topic, candidate.topic) >= 0.6
    );
    if (!duplicates) selected.push(candidate);
    if (selected.length === 3) break;
  }
  for (const candidate of ranked) {
    if (selected.length === 3) break;
    if (!selected.some((item) => item.id === candidate.id)) {
      selected.push(candidate);
    }
  }
  return selected;
}
function planContentStrategiesDeterministic(input) {
  const objective = resolveObjective(input.siteIntelligence, input.executionBrief);
  const candidates = scoreCandidates(
    buildFallbackCandidates(input.sourceContent, objective, input.siteIntelligence),
    input.sourceContent,
    objective,
    input.siteIntelligence
  );
  return {
    objective,
    candidates,
    selected: selectDistinctStrategies(candidates),
    fallbackUsed: true
  };
}

// server/ai/postGenerator.ts
function buildStrategyGenerationContext(strategies) {
  if (strategies.length === 0) return "";
  return `CONTRATOS ESTRATEGICOS DAS VARIACOES:
${strategies.map(
    (strategy, index) => `${index + 1}. ${strategy.title}
   - Topico: ${strategy.topic}
   - Objetivo: ${strategy.objective}
   - Publico: ${strategy.audience}
   - Angulo: ${strategy.angle}
   - Gancho: ${strategy.hook}
   - Promessa: ${strategy.promise}
   - Evidencias permitidas: ${strategy.evidenceIds.join(", ") || "nenhuma afirmacao factual especifica"}`
  ).join("\n")}

REGRAS:
- A variacao 1 deve executar a estrategia 1, e assim por diante.
- Nao misture os tres angulos em uma mesma variacao.
- Preserve o topico, objetivo, publico e limite factual de cada contrato.
- Escreva copy original; nao copie literalmente o texto de evidencia.`;
}

// server/ai/generationPipeline.ts
async function prepareGenerationPlan(input) {
  const strategies = planContentStrategiesDeterministic(input);
  return {
    strategies,
    promptContext: buildStrategyGenerationContext(strategies.selected)
  };
}

// server/ai/contextLoader.ts
init_db();

// server/ai/contextBudget.ts
var HIGH_TICKET_CONTEXT_BUDGET_CHARS = 18e3;
function estimateContextSize(briefing) {
  return JSON.stringify({
    brand: briefing.brand,
    persona: briefing.persona,
    site: {
      summary: briefing.site.summary,
      evidence: briefing.site.evidence,
      toneGuidelines: briefing.site.toneGuidelines,
      prohibitedClaims: briefing.site.prohibitedClaims
    },
    constraints: briefing.constraints
  }).length;
}
function deterministicCompress(briefing) {
  return {
    ...briefing,
    site: {
      ...briefing.site,
      evidence: briefing.site.evidence.filter((item) => item.text.trim()).sort((a, b) => b.text.length - a.text.length).slice(0, 12).map((item) => ({ ...item, text: item.text.slice(0, 1e3) }))
    },
    compressed: true,
    compressionNotes: [
      ...briefing.compressionNotes,
      "Deterministic context compression kept the strongest site evidence within budget."
    ]
  };
}
async function applyContextBudget(briefing) {
  if (estimateContextSize(briefing) <= HIGH_TICKET_CONTEXT_BUDGET_CHARS) {
    return briefing;
  }
  const compressed = deterministicCompress(briefing);
  if (estimateContextSize(compressed) <= HIGH_TICKET_CONTEXT_BUDGET_CHARS) {
    return compressed;
  }
  return {
    ...compressed,
    fallbackNotes: [
      ...compressed.fallbackNotes,
      `Context still above ${HIGH_TICKET_CONTEXT_BUDGET_CHARS} chars after deterministic compression; limited deterministically (no LLM summary in sync path).`
    ]
  };
}

// server/ai/contextLoader.ts
var asStringArray = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
async function loadGenerationContext(input) {
  const [brandKit, persona, siteIntelligence] = await Promise.all([
    getBrandKitByUser(input.userUuid).catch(() => void 0),
    getPersonaByUser(input.userUuid).catch(() => void 0),
    input.siteIntelligenceId ? loadSiteIntelligence(input.siteIntelligenceId, input.userUuid).catch(() => void 0) : Promise.resolve(void 0)
  ]);
  const brandFallback = !brandKit;
  const personaFallback = !persona;
  const siteFallback = !siteIntelligence;
  const forbiddenTerms = [
    ...asStringArray(brandKit?.forbidden_terms),
    ...siteIntelligence?.editorial.prohibitedClaims ?? [],
    ...input.executionBrief?.forbiddenTerms ?? []
  ];
  const requiredTerms = [
    ...asStringArray(brandKit?.must_include),
    ...input.executionBrief?.mustInclude ?? []
  ];
  const preferredColors = asStringArray(brandKit?.visual_palette);
  const briefing = {
    version: 1,
    userInput: {
      inputType: input.inputType,
      content: input.content,
      platform: input.platform,
      postMode: input.postMode,
      creationMode: input.creationMode,
      executionBrief: input.executionBrief
    },
    brand: {
      toneOfVoice: brandKit?.tone ?? input.executionBrief?.tone,
      formattingRules: asStringArray(brandKit?.formatting_rules),
      forbiddenTerms: asStringArray(brandKit?.forbidden_terms),
      requiredTerms: asStringArray(brandKit?.must_include),
      dictionary: brandKit?.dictionary ?? {},
      colors: preferredColors,
      fontPrimary: brandKit?.font_family ?? void 0,
      visualTokens: brandKit ? {
        typography: {
          fontFamily: brandKit.font_family ?? "Inter",
          customFontUrl: "",
          originalFont: brandKit.font_family ?? "Inter",
          textTransform: "none",
          textAlign: "left"
        },
        structure: {
          borderRadius: brandKit.border_radius ?? "16px",
          boxShadow: brandKit.box_shadow ?? "none",
          border: "none"
        }
      } : void 0,
      fallbackUsed: brandFallback
    },
    persona: {
      audience: persona?.audience,
      pains: asStringArray(persona?.pains),
      goals: asStringArray(persona?.goals),
      languageStyle: persona?.language_style ?? void 0,
      objections: asStringArray(persona?.objections),
      fallbackUsed: personaFallback
    },
    site: {
      siteIntelligenceId: siteIntelligence?.id,
      summary: siteIntelligence?.business.summary,
      evidence: siteIntelligence?.evidence.map((item) => ({
        id: item.id,
        text: item.text,
        kind: item.kind
      })) ?? [],
      toneGuidelines: siteIntelligence?.editorial.toneGuidelines ?? [],
      prohibitedClaims: siteIntelligence?.editorial.prohibitedClaims ?? [],
      source: siteIntelligence ?? void 0,
      fallbackUsed: siteFallback
    },
    constraints: {
      forbiddenTerms,
      requiredTerms,
      toneGuidelines: [
        ...siteIntelligence?.editorial.toneGuidelines ?? [],
        ...brandKit?.tone ? [`Tom da marca: ${brandKit.tone}`] : [],
        ...persona?.language_style ? [`Linguagem da persona: ${persona.language_style}`] : []
      ],
      formattingRules: asStringArray(brandKit?.formatting_rules),
      preferredColors,
      maxHeadlineChars: 60,
      maxBodyChars: 110
    },
    compressed: false,
    compressionNotes: [],
    fallbackNotes: [
      ...brandFallback ? ["BrandKit absent; using safe brand defaults."] : [],
      ...personaFallback ? ["Persona absent; using broad-audience defaults."] : [],
      ...siteFallback ? ["Site Intelligence absent; using user input and persisted brand context only."] : []
    ]
  };
  return applyContextBudget(briefing);
}

// server/ai/intentRouter.ts
function routeHighTicketIntentDeterministic(briefing) {
  const audience = briefing.persona.audience || briefing.site.source?.business.audiences[0] || "publico principal";
  const topic = briefing.site.summary || briefing.userInput.content.slice(0, 100) || "tema principal";
  return {
    intent: {
      objective: briefing.userInput.executionBrief?.objective ?? "engage",
      confidence: 0.55,
      rationale: "Fallback deterministico baseado no briefing e contexto disponivel."
    },
    angles: [
      {
        angleId: "angle-story",
        title: "Narrativa de transformacao",
        thesis: `Mostrar ${topic} como uma mudanca concreta na rotina do publico.`,
        mechanism: "story",
        audience,
        hook: "Antes de prometer mais, mostre o que muda.",
        promise: "Uma leitura clara do ganho real.",
        visualDirection: "Composicao editorial premium, hierarquia forte e respiro.",
        risks: ["Evitar melodrama", "Nao inventar cases"]
      },
      {
        angleId: "angle-authority",
        title: "Autoridade objetiva",
        thesis: `Posicionar ${topic} com criterio, prova e linguagem senior.`,
        mechanism: "authority",
        audience,
        hook: "O que profissionais maduros observam primeiro.",
        promise: "Clareza para decidir com mais seguranca.",
        visualDirection: "Visual limpo, contraste alto, tom institucional sofisticado.",
        risks: ["Nao inventar numeros", "Evitar jargao vazio"]
      },
      {
        angleId: "angle-objection",
        title: "Quebra de objecao",
        thesis: `Enfrentar a principal friccao do publico antes de vender ${topic}.`,
        mechanism: "objection",
        audience,
        hook: "A objecao que trava a decisao.",
        promise: "Reduzir incerteza com uma resposta direta.",
        visualDirection: "Composicao direta, tensao controlada e CTA claro.",
        risks: ["Nao soar agressivo", "Nao exagerar dor"]
      }
    ],
    fallbackUsed: true
  };
}
function routeHighTicketIntent(briefing) {
  return routeHighTicketIntentDeterministic(briefing);
}
function angleToStrategy(angle, index) {
  return {
    id: angle.angleId,
    title: angle.title,
    topic: angle.thesis,
    objective: "engage",
    audience: angle.audience,
    angle: angle.mechanism === "story" ? "story" : angle.mechanism === "objection" ? "objection" : angle.mechanism === "authority" ? "authority" : angle.mechanism === "myth" ? "myth" : angle.mechanism === "how-to" ? "how-to" : angle.mechanism === "pain" ? "pain" : "benefit",
    hook: angle.hook,
    promise: angle.promise,
    evidenceIds: [],
    score: {
      total: 80 - index,
      topicRelevance: 80,
      objectiveAlignment: 80,
      evidenceGrounding: 70,
      distinctiveness: 85
    }
  };
}

// server/ai/semanticOriginality.ts
init_env();
init_db();
import { createHash as createHash6, randomUUID as randomUUID3 } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
function variationText(variation) {
  return [
    variation.headline,
    variation.body,
    variation.caption,
    variation.callToAction
  ].filter(Boolean).join("\n").slice(0, 4e3);
}
function postRecordText(post) {
  return [
    post.headline,
    post.body,
    post.caption,
    post.callToAction
  ].filter(Boolean).join("\n").slice(0, 4e3);
}
function normalizeVector(vector) {
  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0)
  );
  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}
function fallbackEmbedding(text, dimensions = 768) {
  const vector = Array.from({ length: dimensions }, () => 0);
  const tokens = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]{3,}/g) ?? [];
  for (let index = 0; index < tokens.length; index++) {
    const unigram = tokens[index];
    const bigram = `${tokens[index]}_${tokens[index + 1] ?? ""}`;
    for (const feature of [unigram, bigram]) {
      const hash = createHash6("sha256").update(feature).digest();
      const bucket = hash.readUInt16BE(0) % dimensions;
      const sign = hash[2] % 2 === 0 ? 1 : -1;
      vector[bucket] += sign;
    }
  }
  return normalizeVector(vector);
}
async function embedTexts(texts) {
  if (texts.length === 0) return { vectors: [], fallbackUsed: false };
  if (ENV.aiSemanticEmbeddingsEnabled && ENV.geminiApiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: ENV.geminiApiKey });
      const response = await ai.models.embedContent({
        model: "gemini-embedding-001",
        contents: texts,
        config: {
          taskType: "SEMANTIC_SIMILARITY",
          outputDimensionality: 768
        }
      });
      const vectors = response.embeddings?.map(
        (item) => normalizeVector(item.values ?? [])
      );
      if (vectors && vectors.length === texts.length && vectors.every((vector) => vector.length > 0)) {
        return { vectors, fallbackUsed: false };
      }
    } catch (error) {
      console.warn("[semanticOriginality] Embedding API unavailable:", error);
    }
  }
  return {
    vectors: texts.map((text) => fallbackEmbedding(text)),
    fallbackUsed: true
  };
}
function cosineSimilarity(a, b) {
  if (a.length === 0 || a.length !== b.length) return 0;
  return Math.max(
    -1,
    Math.min(
      1,
      a.reduce((sum, value, index) => sum + value * b[index], 0)
    )
  );
}
function maxSimilarity(vector, references) {
  return Math.max(0, ...references.map((item) => cosineSimilarity(vector, item)));
}
async function assessSemanticOriginality(input) {
  const candidateTexts = input.candidates.map(variationText);
  const siteTexts = input.siteIntelligence?.evidence.slice(0, 8).map((item) => item.text) ?? [];
  const historyTexts = (input.recentPosts ?? []).slice(0, 20).map(postRecordText);
  const allTexts = [...candidateTexts, ...siteTexts, ...historyTexts];
  const embedded = await embedTexts(allTexts);
  const candidateVectors = embedded.vectors.slice(0, candidateTexts.length);
  const siteStart = candidateTexts.length;
  const historyStart = siteStart + siteTexts.length;
  const siteVectors = embedded.vectors.slice(siteStart, historyStart);
  const historyVectors = embedded.vectors.slice(historyStart);
  const assessments = candidateVectors.map((vector, index) => {
    const otherCandidates = candidateVectors.filter(
      (_, otherIndex) => otherIndex !== index
    );
    const maxCandidateSimilarity = maxSimilarity(vector, otherCandidates);
    const maxSiteSimilarity = maxSimilarity(vector, siteVectors);
    const maxHistorySimilarity = maxSimilarity(vector, historyVectors);
    const weightedSimilarity = Math.max(
      maxCandidateSimilarity,
      maxHistorySimilarity,
      maxSiteSimilarity * 0.65
    );
    const sources = [
      ["candidate", maxCandidateSimilarity],
      ["site", maxSiteSimilarity * 0.65],
      ["history", maxHistorySimilarity]
    ].sort((a, b) => b[1] - a[1]);
    const closestSource = weightedSimilarity > 0 ? sources[0][0] : "none";
    return {
      score: Math.max(0, Math.min(100, Math.round((1 - weightedSimilarity) * 100))),
      maxCandidateSimilarity,
      maxSiteSimilarity,
      maxHistorySimilarity,
      closestSource,
      fallbackUsed: embedded.fallbackUsed
    };
  });
  return {
    assessments,
    embeddings: candidateVectors,
    fallbackUsed: embedded.fallbackUsed
  };
}
async function persistCandidateFingerprints(input) {
  try {
    await createContentFingerprints(
      input.candidates.map((candidate, index) => ({
        id: randomUUID3(),
        userUuid: input.userUuid,
        generationRunId: input.generationRunId,
        sourceType: "candidate",
        sourceId: candidate.id || `candidate-${index + 1}`,
        textHash: createHash6("sha256").update(variationText(candidate)).digest("hex"),
        embedding: input.embeddings[index] ?? [],
        metadata: input.assessments[index]
      }))
    );
  } catch (error) {
    console.warn("[semanticOriginality] Could not persist fingerprints:", error);
  }
}

// shared/validation.ts
var STATIC_SECTION_TARGET = 3;
var STATIC_SECTION_LABEL_MAX_LENGTH = 24;
var STATIC_SECTION_DESCRIPTION_MAX_LENGTH = 36;
function hasRequiredCopy(variation) {
  const hasBody = Boolean(
    variation.body?.trim() || variation.creativeDirection?.hiddenOrnaments?.body?.trim()
  );
  return Boolean(
    variation.headline?.trim() && hasBody && variation.caption?.trim() && variation.callToAction?.trim() && variation.imagePrompt?.trim()
  );
}
function advertisedItemCounts(text) {
  if (!text) return [];
  const normalized = text.toLowerCase();
  const counts = /* @__PURE__ */ new Set();
  const itemWords = "(dicas|criterios|crit.rios|perguntas|passos|sinais|motivos|erros|formas|maneiras|itens|pontos|topicos|t.picos|metricas|m.tricas)";
  const explicitPattern = new RegExp(`\\b([2-9]|1[0-9]|20)\\s+${itemWords}\\b`, "gi");
  let match;
  while (match = explicitPattern.exec(normalized)) {
    counts.add(Number(match[1]));
  }
  const danglingCountPattern = /[:\-\u2013\u2014]\s*([2-9]|1[0-9]|20)\s*(?:\.{2,}|\u2026)?\s*$/g;
  while (match = danglingCountPattern.exec(normalized)) {
    counts.add(Number(match[1]));
  }
  return Array.from(counts);
}
function hasCoherentStaticItemCount(variation) {
  if (!variation.template || variation.template === "simple") return true;
  const counts = advertisedItemCounts(variation.headline);
  return counts.length === 0 || counts.every((count) => count === STATIC_SECTION_TARGET);
}
function hasValidStaticSections(variation) {
  const sections = variation.sections ?? [];
  if (!variation.template || variation.template === "simple") {
    return sections.length === 0;
  }
  return sections.length === STATIC_SECTION_TARGET && sections.every(
    (section) => Boolean(section.label?.trim()) && section.label.trim().length <= STATIC_SECTION_LABEL_MAX_LENGTH && (section.description?.trim().length ?? 0) <= STATIC_SECTION_DESCRIPTION_MAX_LENGTH
  );
}
function applyDeterministicCopyGuards(variation) {
  const next = { ...variation };
  if (typeof next.headline === "string") {
    let headline = next.headline.slice(0, 60).trim().replace(/(?:\.{2,}|\u2026)+$/, "").trim();
    if (next.template && next.template !== "simple") {
      headline = headline.replace(/[:\-\u2013\u2014]\s*([2-9]|1[0-9]|20)\s*$/, "").trim();
    }
    headline = headline.replace(/[:\-\u2013\u2014]\s*$/, "").trim();
    next.headline = headline;
  }
  if (typeof next.body === "string") next.body = next.body.slice(0, 140).trim();
  if (typeof next.caption === "string") {
    next.caption = next.caption.slice(0, 1500).trim();
  }
  if (typeof next.callToAction === "string") next.callToAction = next.callToAction.slice(0, 40).trim();
  if (Array.isArray(next.hashtags)) {
    next.hashtags = next.hashtags.filter((item) => typeof item === "string" && item.trim().startsWith("#")).map((item) => item.trim()).slice(0, 4);
  }
  return next;
}

// shared/postspark.ts
var DEFAULT_DESIGN_TOKENS = {
  colors: {
    background: "#1a1a2e",
    primary: "#a855f7",
    secondary: "#f0f5f2",
    text: "#ffffff",
    card: "#242a26"
  },
  typography: {
    fontFamily: "Inter",
    customFontUrl: "",
    originalFont: "",
    textTransform: "none",
    textAlign: "left"
  },
  structure: {
    borderRadius: "16px",
    boxShadow: "none",
    border: "none"
  },
  decorations: "minimal"
};
var PLATFORM_SPECS = {
  instagram: {
    width: 1080,
    height: 1080,
    label: "Instagram",
    maxChars: 2200,
    icon: "\u{1F4F7}",
    description: "Feed, Stories ou Reels"
  },
  twitter: {
    width: 1200,
    height: 675,
    label: "Twitter/X",
    maxChars: 280,
    icon: "\u{1F426}",
    description: "Post com imagem"
  },
  linkedin: {
    width: 1200,
    height: 627,
    label: "LinkedIn",
    maxChars: 3e3,
    icon: "\u{1F4BC}",
    description: "Post profissional"
  },
  facebook: {
    width: 1200,
    height: 630,
    label: "Facebook",
    maxChars: 63206,
    icon: "\u{1F465}",
    description: "Post com imagem"
  }
};
var DEFAULT_IMAGE_SETTINGS = {
  zoom: 1,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  blur: 0,
  overlayOpacity: 0,
  overlayColor: "#000000",
  blendMode: "normal",
  panX: 50,
  panY: 50
};
var DEFAULT_LAYOUT_SETTINGS = {
  headline: { position: "bottom-left", textAlign: "left" },
  body: { position: "bottom-left", textAlign: "left" },
  accentBar: { position: "top-left", textAlign: "left", width: 15 },
  badge: { position: "top-center", textAlign: "center" },
  sticker: { position: "bottom-center", textAlign: "center" },
  carouselArrow: {
    position: "bottom-right",
    textAlign: "right",
    width: 12
  },
  card: { position: "center", textAlign: "center" },
  sectionLayouts: {},
  padding: 24
};
var DEFAULT_BG_OVERLAY = {
  opacity: 0.5,
  color: "#000000",
  position: { x: 50, y: 50 }
};

// shared/layoutToAdvanced.ts
function layoutToAdvanced(layout) {
  switch (layout) {
    case "centered":
      return {
        headline: { position: "center", textAlign: "center" },
        body: { position: "bottom-center", textAlign: "center" },
        accentBar: {
          position: "top-center",
          textAlign: "center",
          width: 10
        },
        badge: { position: "top-center", textAlign: "center" },
        sticker: { position: "bottom-center", textAlign: "center" },
        carouselArrow: {
          position: "bottom-right",
          textAlign: "right",
          width: 12
        },
        card: { position: "center", textAlign: "center" },
        padding: 24
      };
    case "split":
      return {
        headline: { position: "center-left", textAlign: "left" },
        body: { position: "bottom-left", textAlign: "left" },
        accentBar: {
          position: "top-left",
          textAlign: "left",
          width: 10
        },
        badge: { position: "top-right", textAlign: "right" },
        sticker: { position: "bottom-right", textAlign: "right" },
        carouselArrow: {
          position: "bottom-right",
          textAlign: "right",
          width: 12
        },
        card: { position: "center-left", textAlign: "left" },
        padding: 24
      };
    case "minimal":
      return {
        headline: { position: "center", textAlign: "center" },
        body: { position: "bottom-center", textAlign: "center" },
        accentBar: {
          position: "top-center",
          textAlign: "center",
          width: 15
        },
        badge: { position: "top-center", textAlign: "center" },
        sticker: { position: "bottom-center", textAlign: "center" },
        carouselArrow: {
          position: "bottom-right",
          textAlign: "right",
          width: 12
        },
        card: { position: "center", textAlign: "center" },
        padding: 24
      };
    case "left-aligned":
    default:
      return {
        headline: { position: "center-left", textAlign: "left" },
        body: { position: "bottom-left", textAlign: "left" },
        accentBar: {
          position: "top-left",
          textAlign: "left",
          width: 10
        },
        badge: { position: "top-right", textAlign: "right" },
        sticker: { position: "bottom-right", textAlign: "right" },
        carouselArrow: {
          position: "bottom-right",
          textAlign: "right",
          width: 12
        },
        card: { position: "center-left", textAlign: "left" },
        padding: 24
      };
  }
}

// shared/creative/layoutArchetypes.ts
function aspectOf(ratio) {
  return ratio === "5:6" ? "5:6" : ratio === "9:16" ? "9:16" : "1:1";
}
var flX = (leftPercent, widthPercent) => leftPercent + widthPercent / 2;
function stack(params) {
  const {
    xCenterPercent = 50,
    headlineWidthPercent,
    bodyWidthPercent = headlineWidthPercent,
    headlineHeightPercent,
    bodyHeightPercent,
    // Precisa ter folga REAL acima de MIN_TEXT_GAP (shared/visualFit.ts = 4) —
    // não só tecnicamente >=. Um gap exatamente igual ao mínimo fica na borda
    // do que `overlaps()` aceita; qualquer divergência entre a medição
    // (fontkit) e a renderização real do navegador (a mesma razão de
    // RESOLUTION_WIDTH_SAFETY existir para largura) pode empurrar para dentro
    // do overlap. 6 dá 50% de margem sobre o mínimo.
    gapPercent = 6,
    topPercent,
    textAlign = "center",
    position = "top-left"
  } = params;
  const headline = {
    position,
    textAlign,
    freePosition: { x: xCenterPercent, y: topPercent + headlineHeightPercent / 2 },
    width: headlineWidthPercent,
    height: headlineHeightPercent
  };
  if (bodyHeightPercent === void 0) return { headline };
  const bodyTop = topPercent + headlineHeightPercent + gapPercent;
  const body = {
    position,
    textAlign,
    freePosition: { x: xCenterPercent, y: bodyTop + bodyHeightPercent / 2 },
    width: bodyWidthPercent,
    height: bodyHeightPercent
  };
  return { headline, body };
}
function centeredStack(params) {
  const { yCenterPercent = 50, gapPercent = 3, headlineHeightPercent, bodyHeightPercent } = params;
  const totalHeight = headlineHeightPercent + (bodyHeightPercent !== void 0 ? gapPercent + bodyHeightPercent : 0);
  const topPercent = yCenterPercent - totalHeight / 2;
  return stack({ ...params, topPercent });
}
function posterBottom(params) {
  const { bottomMarginPercent, gapPercent = 3, headlineHeightPercent, bodyHeightPercent } = params;
  const totalHeight = headlineHeightPercent + (bodyHeightPercent !== void 0 ? gapPercent + bodyHeightPercent : 0);
  const topPercent = 100 - bottomMarginPercent - totalHeight;
  return stack({ ...params, topPercent });
}
function sectionGrid(params) {
  const {
    topPercent,
    rowHeightPercent,
    count = 3,
    xLeftPercent = 8,
    totalWidthPercent = 84,
    gapPercent = 3,
    textAlign = "center"
  } = params;
  const colWidth = (totalWidthPercent - gapPercent * (count - 1)) / count;
  const result = {};
  for (let i = 0; i < count; i++) {
    const left = xLeftPercent + i * (colWidth + gapPercent);
    result[`section-${i + 1}`] = {
      position: "top-left",
      textAlign,
      freePosition: { x: left + colWidth / 2, y: topPercent + rowHeightPercent / 2 },
      width: colWidth,
      height: rowHeightPercent
    };
  }
  return result;
}
function safeAreaMarginsPercent(aspectRatio) {
  if (aspectRatio === "9:16") {
    return { top: 6, bottom: 12, left: 6, right: 6 };
  }
  return { top: 5, bottom: 5, left: 5, right: 5 };
}

// shared/visualFit.ts
var REFERENCE_CANVAS_WIDTH = 360;
var MIN_CARD_WIDTH = 72;
var MIN_STRUCTURED_CARD_WIDTH = 90;
var MIN_TEXT_GAP = 4;
function canvasHeight(aspectRatio) {
  const [w, h] = aspectRatio.split(":").map(Number);
  if (!w || !h) return REFERENCE_CANVAS_WIDTH;
  return REFERENCE_CANVAS_WIDTH * h / w;
}
function textHeightPercent(text, widthPercent, aspectRatio, kind) {
  const fontPx = kind === "headline" ? 26 : 13;
  const lineHeight = kind === "headline" ? 1.15 : 1.55;
  const widthPx = Math.max(10, Math.min(100, widthPercent)) / 100 * REFERENCE_CANVAS_WIDTH;
  const charsPerLine = Math.max(6, widthPx / (fontPx * 0.55));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  return Math.min(100, lines * fontPx * lineHeight / canvasHeight(aspectRatio) * 100 * 1.2);
}
function positionCenter(position) {
  switch (position) {
    case "top-left":
      return { x: 25, y: 18 };
    case "top-center":
      return { x: 50, y: 18 };
    case "top-right":
      return { x: 75, y: 18 };
    case "center-left":
      return { x: 25, y: 50 };
    case "center":
      return { x: 50, y: 50 };
    case "center-right":
      return { x: 75, y: 50 };
    case "bottom-left":
      return { x: 25, y: 82 };
    case "bottom-center":
      return { x: 50, y: 82 };
    case "bottom-right":
      return { x: 75, y: 82 };
    default:
      return { x: 50, y: 50 };
  }
}
function layoutRect(pos, text, aspectRatio, kind) {
  const width = pos.width ?? 80;
  const center = pos.freePosition ?? positionCenter(pos.position);
  const height = typeof pos.height === "number" ? pos.height : textHeightPercent(text, width, aspectRatio, kind);
  return {
    left: center.x - width / 2,
    right: center.x + width / 2,
    top: center.y - height / 2,
    bottom: center.y + height / 2
  };
}
function textElementRect(element, aspectRatio) {
  const widthPx = typeof element.width === "number" ? element.width : 120;
  const fontPx = Number.parseFloat(element.styles.fontSize || "16") || 16;
  const lineHeight = Number.parseFloat(element.styles.lineHeight || "1.2") || 1.2;
  const charsPerLine = Math.max(4, widthPx / (fontPx * 0.55));
  const lines = Math.max(1, Math.ceil(element.text.length / charsPerLine));
  const heightPx = typeof element.height === "number" ? element.height : lines * fontPx * lineHeight + 4;
  const height = canvasHeight(aspectRatio);
  return {
    left: element.x / REFERENCE_CANVAS_WIDTH * 100,
    right: (element.x + widthPx) / REFERENCE_CANVAS_WIDTH * 100,
    top: element.y / height * 100,
    bottom: (element.y + heightPx) / height * 100
  };
}
function explicitRect(pos) {
  if (!pos?.freePosition || typeof pos.width !== "number" || typeof pos.height !== "number") return void 0;
  const { x, y } = pos.freePosition;
  return { left: x - pos.width / 2, right: x + pos.width / 2, top: y - pos.height / 2, bottom: y + pos.height / 2 };
}
function overlaps(a, b, gap = 0) {
  return a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;
}
function outside(rect) {
  return rect.left < 0 || rect.top < 0 || rect.right > 100 || rect.bottom > 100;
}
function isGeneratedDecoration(element) {
  return element.id.startsWith("cd-");
}
function flowLayout(snapshot) {
  return layoutToAdvanced(snapshot.layout);
}
function hasStructuredSections(snapshot) {
  return (snapshot.template ?? "simple") !== "simple" && (snapshot.sections?.length ?? 0) > 0;
}
function estimatedWrappedLines(text, widthPercent, fontPx) {
  if (!text.trim()) return 0;
  const widthPx = Math.max(10, Math.min(100, widthPercent)) / 100 * REFERENCE_CANVAS_WIDTH;
  const charsPerLine = Math.max(4, Math.floor(widthPx / (fontPx * 0.55)));
  let lines = 1;
  let used = 0;
  for (const word of text.trim().split(/\s+/)) {
    const length = word.length;
    if (length > charsPerLine) {
      if (used > 0) lines += 1;
      lines += Math.ceil(length / charsPerLine) - 1;
      used = length % charsPerLine;
    } else if (used === 0) used = length;
    else if (used + 1 + length <= charsPerLine) used += 1 + length;
    else {
      lines += 1;
      used = length;
    }
  }
  return lines;
}
function clampedCopyIssues(snapshot, structured) {
  if (snapshot.aspectRatio === "9:16") return [];
  const headline = snapshot.headline ?? "";
  const body = snapshot.body ?? "";
  const headlineLen = headline.length;
  const totalLen = headlineLen + body.length;
  const portrait = snapshot.aspectRatio === "5:6";
  const headlineRem = Math.max(
    portrait ? 1.05 : 1.1,
    (structured ? 1.38 : portrait ? 1.55 : 1.65) - Math.max(0, headlineLen - (portrait ? 35 : 40)) * 0.014
  ) * (snapshot.headlineFontSize ?? 1);
  const bodyRem = Math.max(
    portrait ? 0.75 : 0.78,
    (structured ? 0.8 : portrait ? 0.9 : 0.95) - Math.max(0, totalLen - (portrait ? 110 : 120)) * (portrait ? 1e-3 : 8e-4)
  ) * (snapshot.bodyFontSize ?? 1);
  const headlineClamp = headlineLen > 60 ? 3 : 2;
  const bodyClamp = portrait ? totalLen > 140 ? 4 : 3 : 4;
  const headlineLines = estimatedWrappedLines(
    headline,
    snapshot.layoutSettings.headline.width ?? snapshot.layoutSettings.card.width ?? 80,
    headlineRem * 16
  );
  const bodyLines = estimatedWrappedLines(
    body,
    snapshot.layoutSettings.body.width ?? snapshot.layoutSettings.card.width ?? 80,
    bodyRem * 16
  );
  const issues = [];
  if (headlineLines > headlineClamp) issues.push({
    type: "text_exceeds_visible_area",
    target: "headline",
    detail: `Headline needs about ${headlineLines} lines, but the renderer shows at most ${headlineClamp}.`
  });
  if (body && bodyLines > bodyClamp) issues.push({
    type: "text_exceeds_visible_area",
    target: "body",
    detail: `Body needs about ${bodyLines} lines, but the renderer shows at most ${bodyClamp}.`
  });
  return issues;
}
function validateVisualFit(snapshot) {
  const issues = [];
  const structured = hasStructuredSections(snapshot);
  const { layoutSettings } = snapshot;
  const headlineRect = layoutRect(layoutSettings.headline, snapshot.headline ?? "", snapshot.aspectRatio, "headline");
  const bodyRect = snapshot.body ? layoutRect(layoutSettings.body, snapshot.body, snapshot.aspectRatio, "body") : void 0;
  if (structured && (layoutSettings.body.freePosition || layoutSettings.card.freePosition)) {
    issues.push({
      type: "structured_absolute_layout",
      target: "layoutSettings",
      detail: "Structured templates must render body and card in flow; only the headline may be absolutely positioned."
    });
  }
  if (structured && layoutSettings.headline.freePosition) {
    const sections = snapshot.sections ?? [];
    const sectionRects = [];
    let missingGeometry = false;
    sections.forEach((section, index) => {
      const id = section.id ?? `section-${index + 1}`;
      const rect = explicitRect(layoutSettings.sectionLayouts?.[id]);
      if (!rect) {
        missingGeometry = true;
        return;
      }
      sectionRects.push(rect);
    });
    if (missingGeometry) {
      issues.push({
        type: "section_missing_geometry",
        target: "sectionLayouts",
        detail: "Template estruturado com headline em freePosition exige geometria expl\xEDcita para cada se\xE7\xE3o."
      });
    }
    const collides = sectionRects.some(
      (rect) => overlaps(rect, headlineRect, MIN_TEXT_GAP) || bodyRect && layoutSettings.body.freePosition && overlaps(rect, bodyRect, MIN_TEXT_GAP) || sectionRects.some((other) => other !== rect && overlaps(rect, other, 0))
    );
    if (collides) {
      issues.push({
        type: "section_overlap",
        target: "sectionLayouts",
        detail: "Estimated section box overlaps headline, body, or another section."
      });
    }
  }
  if (snapshot.snapshotVersion === 4) {
    const margins = safeAreaMarginsPercent(snapshot.aspectRatio);
    const outsideSafeArea = (rect, target) => rect.left < margins.left || rect.top < margins.top || rect.right > 100 - margins.right || rect.bottom > 100 - margins.bottom;
    if (layoutSettings.headline.freePosition && outsideSafeArea(headlineRect, "headline")) {
      issues.push({
        type: "outside_safe_area",
        target: "headline",
        detail: `Headline box extends past the safe area margins for ${snapshot.aspectRatio} (top ${margins.top}%, bottom ${margins.bottom}%, sides ${margins.left}%).`
      });
    }
    if (bodyRect && layoutSettings.body.freePosition && outsideSafeArea(bodyRect, "body")) {
      issues.push({
        type: "outside_safe_area",
        target: "body",
        detail: `Body box extends past the safe area margins for ${snapshot.aspectRatio} (top ${margins.top}%, bottom ${margins.bottom}%, sides ${margins.left}%).`
      });
    }
  }
  if (bodyRect && overlaps(headlineRect, bodyRect, MIN_TEXT_GAP)) {
    issues.push({
      type: "headline_body_overlap",
      target: "headline/body",
      detail: "Estimated headline and body boxes overlap."
    });
  }
  const cardWidth = layoutSettings.card.width ?? 100;
  const requiredCardWidth = structured ? MIN_STRUCTURED_CARD_WIDTH : MIN_CARD_WIDTH;
  if (cardWidth < requiredCardWidth) {
    issues.push({
      type: "card_too_narrow",
      target: "card",
      detail: `Card width ${cardWidth}% is below required ${requiredCardWidth}%.`
    });
  }
  for (const element of snapshot.textElements ?? []) {
    if (!isGeneratedDecoration(element)) continue;
    const rect = textElementRect(element, snapshot.aspectRatio);
    if (outside(rect)) {
      issues.push({
        type: "text_element_outside_canvas",
        target: element.id,
        detail: "Generated decorative text element is outside the canvas."
      });
      continue;
    }
    if (overlaps(rect, headlineRect, 2) || bodyRect && overlaps(rect, bodyRect, 2)) {
      issues.push({
        type: "text_element_overlaps_copy",
        target: element.id,
        detail: "Generated decorative text element overlaps primary copy."
      });
    }
  }
  issues.push(...clampedCopyIssues(snapshot, structured));
  return {
    ok: issues.length === 0,
    issues,
    suggestedFallback: issues.some((issue) => issue.type.startsWith("text_element")) ? "drop-text-elements" : issues.some((issue) => issue.type === "card_too_narrow") ? "expand-card" : issues.length > 0 ? "flow-layout" : void 0
  };
}
function applyVisualFitFallback(snapshot, options = {}) {
  const result = validateVisualFit(snapshot);
  if (result.ok) return snapshot;
  const structured = hasStructuredSections(snapshot);
  const flow = flowLayout(snapshot);
  let layoutSettings = snapshot.layoutSettings;
  const hasExplicitGeometry = Boolean(
    layoutSettings.headline.freePosition || layoutSettings.body.freePosition || layoutSettings.card.freePosition
  );
  const geometryIsAuthoritative = snapshot.snapshotVersion === 4 && hasExplicitGeometry && options.geometryResolved === true;
  if (!geometryIsAuthoritative && !structured && result.issues.some((issue) => issue.type === "headline_body_overlap") && !result.issues.some((issue) => issue.type === "structured_absolute_layout")) {
    layoutSettings = {
      ...layoutSettings,
      headline: {
        ...layoutSettings.headline,
        ...flow.headline,
        freePosition: void 0,
        backgroundColor: layoutSettings.headline.backgroundColor,
        borderRadius: layoutSettings.headline.borderRadius
      },
      body: {
        ...layoutSettings.body,
        ...flow.body,
        freePosition: void 0,
        backgroundColor: layoutSettings.body.backgroundColor,
        borderRadius: layoutSettings.body.borderRadius
      },
      sectionLayouts: {}
    };
  }
  if (result.issues.some((issue) => issue.type === "structured_absolute_layout")) {
    layoutSettings = {
      ...layoutSettings,
      sectionLayouts: {}
    };
  }
  if (!geometryIsAuthoritative && result.issues.some((issue) => issue.type === "card_too_narrow" || issue.type === "structured_absolute_layout")) {
    layoutSettings = {
      ...layoutSettings,
      card: {
        ...layoutSettings.card,
        ...flow.card,
        width: structured ? 100 : Math.max(layoutSettings.card.width ?? 100, MIN_CARD_WIDTH),
        backgroundColor: layoutSettings.card.backgroundColor,
        borderRadius: layoutSettings.card.borderRadius
      }
    };
  }
  const blockedGeneratedTextIds = new Set(
    result.issues.filter((issue) => issue.type === "text_element_outside_canvas" || issue.type === "text_element_overlaps_copy").map((issue) => issue.target)
  );
  const textElements = snapshot.textElements?.filter(
    (element) => !blockedGeneratedTextIds.has(element.id)
  );
  const removedTextElementIds = Array.from(blockedGeneratedTextIds);
  return {
    ...snapshot,
    layoutSettings,
    textElements,
    // SPEC-002 (docs/reforma/SPEC-002 passo 7): o fallback corrigia geometria
    // e apagava elementos sem deixar rastro observável no snapshot — a
    // correção acontecia, mas nada além de um log efêmero registrava o quê
    // e por quê. `visualFitIssues` é o diagnóstico que motivou a correção;
    // `removedTextElementIds` é exatamente o que foi descartado, para que
    // testes/telemetria/UI consigam mostrar isso em vez de só herdar um
    // resultado silenciosamente diferente do que a família pediu.
    visualFitIssues: result.issues,
    removedTextElementIds: removedTextElementIds.length > 0 ? removedTextElementIds : void 0
  };
}

// shared/typography/fit.ts
function heightAt(fontSizePx, request, measurer) {
  const style = { ...request.style, fontSize: fontSizePx };
  const wrapped = measurer.wrapText(request.text, style, request.maxWidth);
  return {
    height: measurer.linesHeight(wrapped.lines.length, style),
    lines: wrapped.lines,
    overflowingWords: wrapped.overflowingWords
  };
}
function fitText(request, measurer) {
  const precision = request.precisionPx ?? 0.5;
  const atCeiling = heightAt(request.ceilingPx, request, measurer);
  if (atCeiling.height <= request.maxHeight && atCeiling.overflowingWords.length === 0) {
    return {
      fontSizePx: request.ceilingPx,
      lines: atCeiling.lines,
      lineCount: atCeiling.lines.length,
      heightPx: atCeiling.height,
      fitsAboveFloor: true,
      fitsAtFloor: true,
      overflowingWords: [],
      iterations: 1
    };
  }
  const atFloor = heightAt(request.floorPx, request, measurer);
  const fitsAtFloor = atFloor.height <= request.maxHeight && atFloor.overflowingWords.length === 0;
  if (!fitsAtFloor) {
    return {
      fontSizePx: request.floorPx,
      lines: atFloor.lines,
      lineCount: atFloor.lines.length,
      heightPx: atFloor.height,
      fitsAboveFloor: false,
      fitsAtFloor: false,
      overflowingWords: atFloor.overflowingWords,
      iterations: 2
    };
  }
  let low = request.floorPx;
  let high = request.ceilingPx;
  let best = atFloor;
  let bestSize = request.floorPx;
  let iterations = 2;
  while (high - low > precision) {
    const mid = (low + high) / 2;
    const probe = heightAt(mid, request, measurer);
    iterations += 1;
    if (probe.height <= request.maxHeight && probe.overflowingWords.length === 0) {
      best = probe;
      bestSize = mid;
      low = mid;
    } else {
      high = mid;
    }
  }
  return {
    fontSizePx: bestSize,
    lines: best.lines,
    lineCount: best.lines.length,
    heightPx: best.height,
    fitsAboveFloor: true,
    fitsAtFloor: true,
    overflowingWords: [],
    iterations
  };
}

// shared/typography/types.ts
var MissingFontError = class extends Error {
  constructor(fontFamily, hint) {
    super(`Fonte ausente: "${fontFamily}". ${hint}`);
    this.fontFamily = fontFamily;
    this.hint = hint;
    this.name = "MissingFontError";
  }
};

// shared/typography/measurer.ts
var activeMeasurer = null;
function setTypographyMeasurer(measurer) {
  activeMeasurer = measurer;
}
var unavailableMeasurer = {
  id: "unavailable",
  supports: () => false,
  measureWidth: () => {
    throw new MissingFontError("unavailable", "medidor tipogr\xE1fico n\xE3o configurado neste ambiente");
  },
  wrapText: () => {
    throw new MissingFontError("unavailable", "medidor tipogr\xE1fico n\xE3o configurado neste ambiente");
  },
  linesHeight: () => 0
};
function getTypographyMeasurer() {
  return activeMeasurer ?? unavailableMeasurer;
}

// shared/typography/constants.ts
var LEGIBILITY_FLOOR_PX = 24;
var HEADLINE_CEILING_PX = 56;
var BODY_CEILING_PX = 22;
var BODY_FLOOR_PX = 17;

// shared/typography/resolve.ts
var CANONICAL_CANVAS_WIDTH = 360;
var ENGINE_VERSION = "spec-001.v1";
var TypographyResolutionError = class extends Error {
  constructor(reason, target, message) {
    super(message);
    this.reason = reason;
    this.target = target;
    this.name = "TypographyResolutionError";
  }
};
function canonicalCanvasHeightPx(aspectRatio) {
  const [w, h] = aspectRatio.split(":").map(Number);
  if (!w || !h) return CANONICAL_CANVAS_WIDTH;
  return CANONICAL_CANVAS_WIDTH * h / w;
}
var DEFAULT_FONT = "Inter";
var RESOLUTION_WIDTH_SAFETY = 0.96;
function resolveBlock(target, text, slot, fontFamily, ceilingPx, floorPx, lineHeight, docHeight, textTransform) {
  if (!slot?.freePosition || typeof slot.width !== "number" || typeof slot.height !== "number") {
    throw new TypographyResolutionError(
      "missing-geometry",
      target,
      `${target}: posi\xE7\xE3o simb\xF3lica sem geometria expl\xEDcita (freePosition/width/height) \u2014 n\xE3o \xE9 poss\xEDvel resolver deterministicamente.`
    );
  }
  const measurer = getTypographyMeasurer();
  if (!measurer.supports(fontFamily)) {
    throw new TypographyResolutionError(
      "missing-font",
      target,
      `${target}: fonte "${fontFamily}" ausente do registro (shared/typography/fonts/registry.ts).`
    );
  }
  const widthPx = slot.width / 100 * CANONICAL_CANVAS_WIDTH;
  const heightPx = slot.height / 100 * docHeight;
  const measureTransform = textTransform === "uppercase" ? "uppercase" : "none";
  const fit = fitText(
    {
      text,
      maxWidth: widthPx * RESOLUTION_WIDTH_SAFETY,
      maxHeight: heightPx,
      style: { fontFamily, lineHeight, textTransform: measureTransform },
      ceilingPx,
      floorPx
    },
    measurer
  );
  if (fit.overflowingWords.length > 0) {
    throw new TypographyResolutionError(
      "unbreakable-word",
      target,
      `${target}: palavra(s) n\xE3o cabem na largura mesmo no corpo m\xEDnimo: ${fit.overflowingWords.join(", ")}.`
    );
  }
  if (!fit.fitsAboveFloor) {
    throw new TypographyResolutionError(
      "below-floor",
      target,
      `${target}: texto n\xE3o cabe nem no piso de legibilidade (${floorPx}px) dentro da caixa dispon\xEDvel (${Math.round(widthPx)}\xD7${Math.round(heightPx)}px).`
    );
  }
  return {
    text,
    fontFamily,
    fontWeight: 400,
    fontSizePx: fit.fontSizePx,
    lineHeight,
    lines: fit.lines,
    box: {
      x: slot.freePosition.x / 100 * CANONICAL_CANVAS_WIDTH - widthPx / 2,
      y: slot.freePosition.y / 100 * docHeight - fit.heightPx / 2,
      width: widthPx,
      height: fit.heightPx
    },
    textTransform
  };
}
function resolveTypography(input) {
  const docHeight = canonicalCanvasHeightPx(input.aspectRatio);
  const headline = resolveBlock(
    "headline",
    input.headline,
    input.layoutSettings.headline,
    input.headlineFontFamily ?? DEFAULT_FONT,
    HEADLINE_CEILING_PX * (input.headlineFontSize ?? 1),
    LEGIBILITY_FLOOR_PX,
    1.15,
    docHeight,
    input.textTransform
  );
  let body;
  const hasBodyText = Boolean(input.body && input.body.trim().length > 0);
  const bodySlot = input.layoutSettings.body;
  if (hasBodyText && bodySlot?.freePosition) {
    body = resolveBlock(
      "body",
      input.body,
      bodySlot,
      input.bodyFontFamily ?? DEFAULT_FONT,
      BODY_CEILING_PX * (input.bodyFontSize ?? 1),
      BODY_FLOOR_PX,
      1.5,
      docHeight,
      input.textTransform
    );
  }
  return { engineVersion: ENGINE_VERSION, headline, body };
}

// shared/variationSnapshot.ts
var ICON_FALLBACKS = ["Zap", "Shield", "Target", "TrendingUp", "CheckCircle"];
var MIN_CENTER_Y = 8;
var MAX_CENTER_Y = 92;
var MIN_BLOCK_GAP_Y = 4;
var MAX_BLOCK_BOTTOM_Y = 98;
var MIN_AI_TEXT_WIDTH = 36;
var MIN_AI_CARD_WIDTH = 45;
function normalizeSectionIcon(icon, index = 0) {
  const raw = typeof icon === "string" ? icon.trim() : "";
  if (!raw) return ICON_FALLBACKS[index % ICON_FALLBACKS.length];
  const aliases = {
    automation: "Zap",
    automacao: "Zap",
    performance: "TrendingUp",
    seguranca: "Shield",
    security: "Shield",
    analysis: "Target",
    analise: "Target",
    data: "Target",
    dados: "Target",
    check: "CheckCircle"
  };
  const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z]/g, "").toLowerCase();
  return aliases[normalized] ?? raw.charAt(0).toUpperCase() + raw.slice(1);
}
function normalizeSections(sections) {
  if (!Array.isArray(sections) || sections.length === 0) return void 0;
  return sections.map((section, index) => ({
    ...section,
    id: section.id || `section-${index + 1}`,
    icon: normalizeSectionIcon(section.icon, index),
    number: section.number ?? index + 1
  }));
}
function normalizeVariationForEditor(variation) {
  const normalizedSections = normalizeSections(variation.sections);
  return {
    ...variation,
    sections: normalizedSections
  };
}
function normalizeImageSettings(variation) {
  return {
    ...DEFAULT_IMAGE_SETTINGS,
    ...variation.imageSettings ?? {}
  };
}
function clampFreePosition(free, width) {
  const halfWidth = typeof width === "number" ? Math.max(0, Math.min(100, width)) / 2 : 0;
  return {
    x: Math.max(halfWidth, Math.min(100 - halfWidth, free.x)),
    y: Math.max(MIN_CENTER_Y, Math.min(MAX_CENTER_Y, free.y))
  };
}
function formatOptimizationToLayoutSettings(fopt, ctx) {
  const base = layoutToAdvanced(fopt.layout);
  const allowFreePosition = !ctx.hasStructuredSections;
  const toPosition = (foptItem, basePos) => {
    if (!foptItem) return basePos;
    const hasCoord = allowFreePosition && foptItem.x != null && foptItem.y != null;
    const safeBaseWidth = typeof basePos.width === "number" && basePos.width >= MIN_AI_TEXT_WIDTH ? basePos.width : 90;
    const requestedWidth = foptItem.width ?? safeBaseWidth;
    const width = requestedWidth < MIN_AI_TEXT_WIDTH ? safeBaseWidth : Math.min(100, requestedWidth);
    return {
      position: hasCoord ? "top-left" : basePos.position,
      textAlign: foptItem.textAlign ?? basePos.textAlign,
      freePosition: hasCoord ? clampFreePosition({ x: foptItem.x, y: foptItem.y }, width) : basePos.freePosition,
      width,
      backgroundColor: foptItem.backgroundColor ?? basePos.backgroundColor,
      borderRadius: foptItem.borderRadius ?? basePos.borderRadius
    };
  };
  const toFlow = (pos, basePos) => ({
    ...pos,
    position: basePos.position,
    freePosition: basePos.freePosition
  });
  let headline = toPosition(fopt.headline, base.headline);
  let body = toPosition(fopt.body, base.body);
  if (headline.freePosition && body.freePosition) {
    const headlineHeight = textHeightPercent(
      ctx.headlineText,
      headline.width ?? 90,
      ctx.aspectRatio,
      "headline"
    );
    const bodyHeight = textHeightPercent(
      ctx.bodyText,
      body.width ?? 90,
      ctx.aspectRatio,
      "body"
    );
    const minBodyCenterY = headline.freePosition.y + headlineHeight / 2 + MIN_BLOCK_GAP_Y + bodyHeight / 2;
    if (body.freePosition.y < minBodyCenterY) {
      if (minBodyCenterY + bodyHeight / 2 <= MAX_BLOCK_BOTTOM_Y) {
        body = { ...body, freePosition: { ...body.freePosition, y: minBodyCenterY } };
      } else {
        headline = toFlow(headline, base.headline);
        body = toFlow(body, base.body);
      }
    }
  }
  let card = toPosition(fopt.card, base.card);
  if (typeof card.width === "number" && card.width < MIN_AI_CARD_WIDTH) {
    card = { ...toFlow(card, base.card), width: base.card.width };
  }
  return {
    headline,
    body,
    accentBar: base.accentBar,
    badge: base.badge,
    sticker: base.sticker,
    carouselArrow: base.carouselArrow,
    card,
    sectionLayouts: base.sectionLayouts ?? {},
    padding: fopt.padding ?? base.padding
  };
}
function normalizeLayoutSettings(variation, aspectRatio, preserveVisualIdentity = false, originalAspectRatio) {
  const arOpt = variation.aspectRatioOptimizations?.[aspectRatio];
  const geometryOptimization = arOpt && preserveVisualIdentity ? { ...arOpt, layout: variation.layout } : arOpt;
  const fromArOpt = geometryOptimization && (geometryOptimization.headline || geometryOptimization.body || geometryOptimization.card) ? formatOptimizationToLayoutSettings(geometryOptimization, {
    headlineText: variation.headline ?? "",
    bodyText: variation.body ?? "",
    hasStructuredSections: (variation.template ?? "simple") !== "simple" && (variation.sections?.length ?? 0) > 0,
    aspectRatio
  }) : void 0;
  const existingSnapshot = variation;
  const sameRatioSnapshotLayout = (existingSnapshot.snapshotVersion === 3 || existingSnapshot.snapshotVersion === 4) && originalAspectRatio === aspectRatio ? variation.layoutSettings : void 0;
  const selected = sameRatioSnapshotLayout ?? variation.layoutSettingsByAspectRatio?.[aspectRatio] ?? variation.layoutSettings ?? fromArOpt ?? layoutToAdvanced(variation.layout);
  const resolved = {
    headline: { ...DEFAULT_LAYOUT_SETTINGS.headline, ...selected.headline },
    body: { ...DEFAULT_LAYOUT_SETTINGS.body, ...selected.body },
    accentBar: { ...DEFAULT_LAYOUT_SETTINGS.accentBar, ...selected.accentBar },
    badge: { ...DEFAULT_LAYOUT_SETTINGS.badge, ...selected.badge },
    sticker: { ...DEFAULT_LAYOUT_SETTINGS.sticker, ...selected.sticker },
    carouselArrow: {
      ...DEFAULT_LAYOUT_SETTINGS.carouselArrow,
      ...selected.carouselArrow
    },
    card: { ...DEFAULT_LAYOUT_SETTINGS.card, ...selected.card },
    sectionLayouts: selected.sectionLayouts ?? {},
    padding: selected.padding ?? DEFAULT_LAYOUT_SETTINGS.padding
  };
  if (!preserveVisualIdentity) return resolved;
  const safeReflowWidth = (width) => typeof width === "number" && width >= MIN_AI_TEXT_WIDTH ? Math.min(100, width) : 90;
  return {
    ...resolved,
    headline: {
      ...resolved.headline,
      width: safeReflowWidth(resolved.headline.width)
    },
    body: {
      ...resolved.body,
      width: safeReflowWidth(resolved.body.width)
    }
  };
}
function synchronizeDesignTokenColors(designTokens, colors) {
  const base = designTokens ?? {};
  return {
    ...DEFAULT_DESIGN_TOKENS,
    ...base,
    colors: {
      ...DEFAULT_DESIGN_TOKENS.colors,
      ...base.colors,
      background: colors.backgroundColor,
      text: colors.textColor,
      primary: colors.accentColor,
      secondary: base.colors?.secondary ?? colors.accentColor,
      card: base.colors?.card ?? colors.backgroundColor
    },
    typography: {
      ...DEFAULT_DESIGN_TOKENS.typography,
      ...base.typography
    },
    structure: {
      ...DEFAULT_DESIGN_TOKENS.structure,
      ...base.structure
    }
  };
}
function isStructuredTemplate(snapshot) {
  return (snapshot.template ?? "simple") !== "simple" && (snapshot.sections?.length ?? 0) > 0;
}
function resolveSnapshotTypography(snapshot) {
  const structured = isStructuredTemplate(snapshot);
  const headlineHasGeometry = Boolean(snapshot.layoutSettings?.headline?.freePosition);
  if (structured && !headlineHasGeometry) return {};
  try {
    const resolvedTypography = resolveTypography({
      headline: snapshot.headline,
      body: snapshot.body,
      aspectRatio: snapshot.aspectRatio,
      layoutSettings: snapshot.layoutSettings,
      headlineFontFamily: snapshot.headlineFontFamily,
      bodyFontFamily: snapshot.bodyFontFamily,
      headlineFontSize: snapshot.headlineFontSize,
      bodyFontSize: snapshot.bodyFontSize
    });
    return { resolvedTypography };
  } catch (error) {
    if (error instanceof TypographyResolutionError) {
      return { typographyResolutionError: error.message };
    }
    throw error;
  }
}
function createPostVisualSnapshot(variation, requestedAspectRatio = variation.aspectRatio ?? "1:1", options = {}) {
  const originalAspectRatio = variation.aspectRatio;
  const normalized = normalizeVariationForEditor(variation);
  const formatAdjusted = applyAspectRatioToVariation(normalized, requestedAspectRatio);
  const adjusted = options.preserveVisualIdentity ? {
    ...formatAdjusted,
    backgroundColor: normalized.backgroundColor,
    textColor: normalized.textColor,
    accentColor: normalized.accentColor,
    headlineColor: normalized.headlineColor,
    bodyColor: normalized.bodyColor,
    layout: normalized.layout,
    bgValue: normalized.bgValue,
    designTokens: normalized.designTokens,
    textElements: normalized.textElements,
    imageElements: normalized.imageElements
  } : formatAdjusted;
  const backgroundColor = adjusted.backgroundColor || "#171717";
  const textColor = adjusted.textColor || "#ffffff";
  const accentColor = adjusted.accentColor || "#a855f7";
  const headlineColor = adjusted.headlineColor || textColor;
  const bodyColor = adjusted.bodyColor || textColor;
  const designTokens = synchronizeDesignTokenColors(adjusted.designTokens, {
    backgroundColor,
    textColor,
    accentColor
  });
  const imageSettings = normalizeImageSettings(adjusted);
  const layoutSettings = normalizeLayoutSettings(
    adjusted,
    requestedAspectRatio,
    options.preserveVisualIdentity,
    originalAspectRatio
  );
  const hasFormatOptimization = Boolean(
    adjusted.aspectRatioOptimizations?.[requestedAspectRatio]
  );
  const bgValue = adjusted.bgValue && (options.preserveVisualIdentity || !(hasFormatOptimization && adjusted.bgValue.type === "solid")) ? adjusted.bgValue : adjusted.imageUrl ? { type: "ai", url: adjusted.imageUrl } : { type: "solid", color: backgroundColor };
  const bgOverlayBase = {
    ...DEFAULT_BG_OVERLAY,
    ...adjusted.bgOverlay ?? {}
  };
  const isImageBackground = bgValue.type !== "solid";
  const protectedOverlay = isImageBackground && (bgOverlayBase.opacity ?? 0) < 0.55 ? { ...bgOverlayBase, color: bgOverlayBase.color ?? "#000000", opacity: 0.6 } : bgOverlayBase;
  const snapshot = {
    ...adjusted,
    snapshotVersion: 4,
    aspectRatio: requestedAspectRatio,
    postMode: adjusted.postMode ?? (adjusted.slides?.length ? "carousel" : "static"),
    backgroundColor,
    textColor,
    accentColor,
    headlineColor,
    bodyColor,
    designTokens,
    imageSettings,
    layoutSettings,
    bgValue,
    bgOverlay: protectedOverlay
  };
  const preResolution = resolveSnapshotTypography(snapshot);
  const fitted = applyVisualFitFallback(snapshot, {
    geometryResolved: Boolean(preResolution.resolvedTypography)
  });
  const { resolvedTypography, typographyResolutionError } = fitted.layoutSettings === snapshot.layoutSettings ? preResolution : resolveSnapshotTypography(fitted);
  const withTypography = {
    ...fitted,
    resolvedTypography,
    typographyResolutionError
  };
  return options.preserveVisualIdentity ? {
    ...withTypography,
    textElements: snapshot.textElements,
    imageElements: snapshot.imageElements
  } : withTypography;
}
function projectSnapshotForSlide(snapshot, slideIndex = 0) {
  if (snapshot.postMode !== "carousel" || !snapshot.slides?.length) return snapshot;
  const slide = snapshot.slides[slideIndex] ?? snapshot.slides[0];
  const editorState = slide.editorState;
  const layoutOverride = editorState?.layoutSettings;
  const projectedHeadline = slide.headline || snapshot.headline;
  const projectedBody = slide.body || snapshot.body;
  const projectedLayoutSettings = layoutOverride ? {
    ...snapshot.layoutSettings,
    ...layoutOverride,
    headline: { ...snapshot.layoutSettings.headline, ...layoutOverride.headline },
    body: { ...snapshot.layoutSettings.body, ...layoutOverride.body },
    accentBar: { ...snapshot.layoutSettings.accentBar, ...layoutOverride.accentBar },
    badge: { ...snapshot.layoutSettings.badge, ...layoutOverride.badge },
    sticker: { ...snapshot.layoutSettings.sticker, ...layoutOverride.sticker },
    carouselArrow: { ...snapshot.layoutSettings.carouselArrow, ...layoutOverride.carouselArrow },
    card: { ...snapshot.layoutSettings.card, ...layoutOverride.card },
    sectionLayouts: {
      ...snapshot.layoutSettings.sectionLayouts ?? {},
      ...layoutOverride.sectionLayouts ?? {}
    }
  } : snapshot.layoutSettings;
  const cached = editorState?.resolvedTypography;
  const needsFreshResolution = !cached || cached.headline.text !== projectedHeadline || projectedBody && cached.body?.text !== projectedBody;
  const { resolvedTypography, typographyResolutionError } = needsFreshResolution ? resolveSnapshotTypography({
    headline: projectedHeadline,
    body: projectedBody,
    aspectRatio: snapshot.aspectRatio,
    layoutSettings: projectedLayoutSettings,
    headlineFontFamily: editorState?.variation?.headlineFontFamily ?? snapshot.headlineFontFamily,
    bodyFontFamily: editorState?.variation?.bodyFontFamily ?? snapshot.bodyFontFamily,
    headlineFontSize: editorState?.variation?.headlineFontSize ?? snapshot.headlineFontSize,
    bodyFontSize: editorState?.variation?.bodyFontSize ?? snapshot.bodyFontSize,
    template: snapshot.template,
    sections: snapshot.sections
  }) : { resolvedTypography: cached, typographyResolutionError: editorState?.typographyResolutionError };
  return {
    ...snapshot,
    ...editorState?.variation ?? {},
    headline: projectedHeadline,
    body: projectedBody,
    imageSettings: {
      ...snapshot.imageSettings,
      ...editorState?.imageSettings ?? {}
    },
    layoutSettings: projectedLayoutSettings,
    bgValue: editorState?.bgValue ?? snapshot.bgValue,
    bgOverlay: {
      ...snapshot.bgOverlay,
      ...editorState?.bgOverlay ?? {}
    },
    resolvedTypography,
    typographyResolutionError
  };
}
function applyAspectRatioToVariation(variation, aspectRatio) {
  const arOpt = variation.aspectRatioOptimizations?.[aspectRatio];
  if (!arOpt) return { ...variation, aspectRatio };
  return {
    ...variation,
    aspectRatio,
    backgroundColor: arOpt.backgroundColor ?? variation.backgroundColor,
    textColor: arOpt.textColor ?? variation.textColor,
    accentColor: arOpt.accentColor ?? variation.accentColor,
    layout: arOpt.layout ?? variation.layout
  };
}

// shared/creative/seed.ts
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t2 = Math.imul(a ^ a >>> 15, 1 | a);
    t2 = t2 + Math.imul(t2 ^ t2 >>> 7, 61 | t2) ^ t2;
    return ((t2 ^ t2 >>> 14) >>> 0) / 4294967296;
  };
}

// shared/creative/utils.ts
function splitHeadline(headline, rand) {
  const words = headline.trim().split(/\s+/);
  if (words.length <= 1) return words;
  let parts = 2;
  if (words.length >= 5 && words.length <= 6) {
    parts = rand() < 0.5 ? 3 : 2;
  } else if (words.length > 6) {
    parts = 3;
  }
  if (parts === 2) {
    const mid = Math.round(words.length / 2);
    return [
      words.slice(0, mid).join(" "),
      words.slice(mid).join(" ")
    ];
  } else {
    const third1 = Math.round(words.length / 3);
    const third2 = Math.round(words.length * 2 / 3);
    return [
      words.slice(0, third1).join(" "),
      words.slice(third1, third2).join(" "),
      words.slice(third2).join(" ")
    ];
  }
}

// shared/creative/palettes.ts
var PALETTES = [
  { id: "tiffany-dark", label: "Tiffany Dark", colorA: "#21F1A8", colorB: "#171717", temperature: "cool", vibe: ["tech", "cru"], invertible: false },
  { id: "true-pink", label: "True Pink", colorA: "#FD1843", colorB: "#FFF9FA", temperature: "warm", vibe: ["divertido", "urgente"], invertible: true },
  { id: "violet-lime", label: "Violet Lime", colorA: "#3C1A47", colorB: "#B6FF00", temperature: "cool", vibe: ["tech", "divertido"], invertible: true },
  { id: "cyprus-sand", label: "Cyprus Sand", colorA: "#004741", colorB: "#F0EDE4", temperature: "neutral", vibe: ["premium", "editorial"], invertible: true },
  { id: "lime-canopy", label: "Lime Canopy", colorA: "#E4FD97", colorB: "#2D3E2C", temperature: "neutral", vibe: ["sereno"], invertible: true, bodyNeedsBoost: true },
  { id: "milky-mantis", label: "Milky Mantis", colorA: "#FFFDF1", colorB: "#59C749", temperature: "warm", vibe: ["sereno", "divertido"], invertible: true, bodyNeedsBoost: true },
  { id: "turmeric-malt", label: "Turmeric Malt", colorA: "#FFBE0B", colorB: "#2A2312", temperature: "warm", vibe: ["urgente", "divertido"], invertible: true },
  { id: "silver-moss", label: "Silver Moss", colorA: "#141414", colorB: "#28EE34", temperature: "cool", vibe: ["tech", "cru"], invertible: false },
  { id: "volcano-night", label: "Volcano Night", colorA: "#FF4103", colorB: "#001621", temperature: "warm", vibe: ["urgente", "cru"], invertible: false },
  { id: "skin-bridal", label: "Skin Bridal", colorA: "#FFC6A8", colorB: "#741A2F", temperature: "warm", vibe: ["premium", "editorial"], invertible: true }
];
function paletteToDesignTokens(p, inverted) {
  const aDark = isDark2(p.colorA);
  const bDark = isDark2(p.colorB);
  let dark, light;
  if (aDark !== bDark) {
    dark = aDark ? p.colorA : p.colorB;
    light = aDark ? p.colorB : p.colorA;
  } else {
    dark = p.colorB;
    light = p.colorA;
  }
  let background = dark;
  let text = light;
  if (inverted && p.invertible) {
    if (contrastRatio(light, dark) >= 4.5) {
      background = light;
      text = dark;
    }
  }
  const getSaturation2 = (hex) => {
    const hexClean = hex.replace(/^#/, "");
    const r = parseInt(hexClean.slice(0, 2), 16);
    const g = parseInt(hexClean.slice(2, 4), 16);
    const b = parseInt(hexClean.slice(4, 6), 16);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max === 0 ? 0 : (max - min) / max;
  };
  const satA = getSaturation2(p.colorA);
  const satB = getSaturation2(p.colorB);
  const primary = satA > satB ? p.colorA : p.colorB;
  const secondary = mix(primary, background, 0.35);
  const card = isDark2(background) ? lighten(background, 6) : darken(background, 4);
  const ensureAa = (fg, bg) => {
    let candidate = fg;
    let lighter = fg;
    let darker = fg;
    for (let step = 0; step < 40 && contrastRatio(candidate, bg) < 4.5; step += 1) {
      if (isDark2(bg)) {
        lighter = lighten(lighter, 6);
        candidate = lighter;
      } else {
        darker = darken(darker, 6);
        candidate = darker;
      }
    }
    return candidate;
  };
  const accessibleText = contrastRatio(text, background) >= 4.5 ? text : ensureAa(text, background);
  const accessiblePrimary = contrastRatio(primary, background) >= 4.5 ? primary : ensureAa(primary, background);
  const accessibleSecondary = contrastRatio(secondary, background) >= 4.5 ? secondary : ensureAa(secondary, background);
  return {
    colors: {
      background,
      primary: accessiblePrimary,
      secondary: accessibleSecondary,
      text: accessibleText,
      card
    },
    typography: {
      fontFamily: "Space Grotesk",
      customFontUrl: "",
      originalFont: "",
      textTransform: "none",
      textAlign: "left"
    },
    structure: {
      borderRadius: "16px",
      boxShadow: "none",
      border: "none"
    },
    decorations: "minimal"
  };
}

// shared/creative/families.ts
var HEADLINE_HEIGHT_PCT = {
  // 4 linhas no piso (fontes compactas, largura ~84%)
  compact: { "1:1": 33, "5:6": 28, "9:16": 19 },
  // 5 linhas no piso (fontes display largas / larguras menores)
  display: { "1:1": 41, "5:6": 34, "9:16": 23 },
  // 6 linhas no piso (mono/estreitas)
  mono: { "1:1": 49, "5:6": 41, "9:16": 28 }
};
var BODY_HEIGHT_PCT = {
  standard: { "1:1": 24, "5:6": 20, "9:16": 14 }
};
var GAP_PCT = 6;
var HEADLINE_TOP_ANCHOR = { "1:1": 26, "5:6": 23, "9:16": 20 };
var BOTTOM_MARGIN_PCT = { "1:1": 6, "5:6": 6, "9:16": 13 };
function createTextElement(id, text, x, y, width, overrides) {
  const baseStyles = {
    fontSize: "16px",
    fontFamily: "Inter",
    color: "#ffffff",
    fontWeight: "400",
    fontStyle: "normal",
    textDecoration: "none",
    textAlign: "left",
    lineHeight: "1.2",
    opacity: "1"
  };
  return {
    id,
    text,
    x,
    y,
    width,
    height: "auto",
    rotation: 0,
    ...overrides,
    styles: { ...baseStyles, ...overrides?.styles || {} }
  };
}
var FAMILIES = [
  {
    id: "editorial-poster",
    label: "Editorial Poster",
    description: "Capa de revista; hierarquia de poster cinematogr\xE1fico.",
    axes: { composition: "poster", typography: "editorial-serif", color: "monochrome", ornaments: "minimal", texture: "clean", vibe: "editorial" },
    moods: ["editorial", "premium", "sereno"],
    fit: { maxHeadlineChars: 70 },
    carousel: "title-emphasis",
    compose: (ctx) => {
      const { variation, tokens, pxX, pxY } = ctx;
      const { background, secondary } = tokens.colors;
      const stickerText = variation.creativeDirection?.hiddenOrnaments?.stickerText || "EDITORIAL";
      const hasImage = !!variation.imageUrl || !!variation.bgValue?.url;
      const ar = aspectOf(ctx.aspectRatio);
      const posterSlots = stack({
        xCenterPercent: flX(8, 84),
        headlineWidthPercent: 84,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.compact[ar],
        bodyHeightPercent: BODY_HEIGHT_PCT.standard[ar],
        gapPercent: GAP_PCT,
        topPercent: 100 - BOTTOM_MARGIN_PCT[ar] - (HEADLINE_HEIGHT_PCT.compact[ar] + GAP_PCT + BODY_HEIGHT_PCT.standard[ar]),
        textAlign: "left",
        position: "bottom-left"
      });
      return {
        layout: "left-aligned",
        headlineFontSize: 1.8,
        headlineFontFamily: "Playfair Display",
        bodyFontFamily: "Inter",
        layoutSettings: {
          headline: posterSlots.headline,
          body: posterSlots.body,
          badge: { position: "top-left", textAlign: "left", width: 12 },
          accentBar: { position: "top-left", textAlign: "left", freePosition: { x: flX(8, 12), y: 56 }, width: 12 }
        },
        ornaments: { badge: "keep", sticker: "hide", accentBar: "keep" },
        cardMode: "full-bleed",
        textElements: [
          createTextElement("cd-kicker", stickerText.toUpperCase(), pxX(8), pxY(8), pxX(84), {
            styles: { fontSize: "11px", fontFamily: "Space Mono", color: secondary, fontWeight: "600" }
          })
        ],
        bgOverlay: hasImage ? { color: darken(background, 20), opacity: 0.45 } : void 0
      };
    }
  },
  {
    id: "chromatic-block",
    label: "Chromatic Block",
    description: "A cor \xC9 o design. Minimalismo brutal.",
    axes: { composition: "centered-minimal", typography: "display-brutal", color: "monochrome", ornaments: "minimal", texture: "clean", vibe: "tech" },
    moods: ["tech", "cru", "divertido", "urgente"],
    fit: { maxHeadlineChars: 45 },
    carousel: "uniform",
    compose: (ctx) => {
      const { variation, rand, pxX, pxY } = ctx;
      const stickerText = variation.creativeDirection?.hiddenOrnaments?.stickerText || "NOVO";
      const ar = aspectOf(ctx.aspectRatio);
      const chromaticSlots = centeredStack({
        headlineWidthPercent: 84,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.compact[ar],
        bodyHeightPercent: BODY_HEIGHT_PCT.standard[ar],
        textAlign: "center",
        position: "center"
      });
      return {
        layout: "centered",
        headlineFontFamily: "Anton",
        headlineFontSize: 1.6 + rand() * 0.4,
        typography: { textTransform: "uppercase" },
        structure: { borderRadius: "0px" },
        layoutSettings: {
          padding: 32,
          headline: chromaticSlots.headline,
          body: chromaticSlots.body
        },
        ornaments: { badge: "hide", sticker: "keep", accentBar: "hide" },
        cardMode: "full-bleed",
        textElements: [
          createTextElement("cd-sticker-rot", stickerText.toUpperCase(), pxX(70), pxY(15), pxX(25), {
            rotation: -6 + rand() * 12,
            styles: { fontSize: "14px", fontFamily: "Anton", color: ctx.tokens.colors.primary, textAlign: "center" }
          })
        ]
      };
    }
  },
  {
    id: "brutal-split",
    label: "Brutal Split",
    description: "Declara\xE7\xE3o agressiva, neobrutalismo.",
    axes: { composition: "split", typography: "display-brutal", color: "vibrant", ornaments: "minimal", texture: "clean", vibe: "urgente" },
    moods: ["urgente", "cru", "tech"],
    fit: { maxHeadlineChars: 40 },
    carousel: "uniform",
    compose: (ctx) => {
      const { tokens, rand } = ctx;
      const { background, primary } = tokens.colors;
      const borderCol = isDark2(background) ? "#ffffff" : "#000000";
      const splitImagePosition = rand() < 0.5 ? "top" : "bottom";
      const ar = aspectOf(ctx.aspectRatio);
      const brutalSlots = centeredStack({
        // 88, não 90: centrado, sobra (100-88)/2=6% de cada lado — cabe na
        // safe area mais apertada (9:16, margem lateral 6%, safeAreaMarginsPercent
        // em layoutArchetypes.ts). 90 cabia em 1:1/5:6 (margem 5%) mas estourava em 9:16.
        headlineWidthPercent: 88,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.display[ar],
        textAlign: "center",
        position: "center",
        yCenterPercent: splitImagePosition === "top" ? 72 : 28
      });
      return {
        layout: "split",
        splitImagePosition,
        headlineFontFamily: "Archivo Black",
        typography: { textTransform: "uppercase" },
        structure: {
          border: `3px solid ${borderCol}`,
          boxShadow: `6px 6px 0px ${darken(primary, 30)}`,
          borderRadius: "0px"
        },
        // We simulate the background color on the headline block via structure if possible,
        // or we just rely on standard layout. The spec says `layoutSettings.headline.backgroundColor: primary`
        // Note: AdvancedLayoutSettings doesn't have backgroundColor in LayoutPosition in the provided schema,
        // we'll set what we can.
        layoutSettings: {
          headline: brutalSlots.headline,
          badge: { position: "top-left", textAlign: "left", width: 12 }
        },
        ornaments: { badge: "keep", sticker: "keep", accentBar: "hide", body: "hide" },
        cardMode: "card"
      };
    }
  },
  {
    id: "glitch-signal",
    label: "Glitch Signal",
    description: "Ru\xEDdo digital e est\xE9tica tech.",
    axes: { composition: "freeform", typography: "mono-tech", color: "desaturated", ornaments: "minimal", texture: "clean", vibe: "tech" },
    moods: ["tech", "cru"],
    fit: { maxHeadlineChars: 30 },
    carousel: "title-emphasis",
    compose: (ctx) => {
      const { variation, tokens, pxX, pxY, rand } = ctx;
      const { background, primary, secondary } = tokens.colors;
      const badgeText = variation.creativeDirection?.hiddenOrnaments?.badge || "SYS";
      const off1x = 1 + rand() * 1.5;
      const off1y = 1 + rand() * 1.5;
      const off2x = -(1 + rand() * 1.5);
      const off2y = -(1 + rand() * 1.5);
      const ar = aspectOf(ctx.aspectRatio);
      const glitchSlots = centeredStack({
        xCenterPercent: flX(10, 80),
        headlineWidthPercent: 80,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.mono[ar],
        bodyHeightPercent: BODY_HEIGHT_PCT.standard[ar],
        textAlign: "center",
        position: "center",
        yCenterPercent: 45
      });
      return {
        headlineFontFamily: "Space Mono",
        layoutSettings: {
          headline: glitchSlots.headline,
          body: glitchSlots.body
        },
        ornaments: { badge: "hide", sticker: "hide", accentBar: "hide" },
        cardMode: "full-bleed",
        // CR-003: overlay SUBDOMINANTE (8% de escurecimento é quase invisível) —
        // com opacidade dominante, o fundo efetivo do texto mudaria e derrubaria
        // o contraste do texto em paletas claras.
        bgOverlay: { color: darken(background, 8), opacity: 0.4 },
        textElements: [
          createTextElement("cd-glitch-1", variation.headline, pxX(10 + off1x), pxY(45 + off1y), pxX(80), {
            styles: { fontSize: "32px", fontFamily: "Space Mono", color: primary, opacity: "0.65", fontWeight: "700" }
          }),
          createTextElement("cd-glitch-2", variation.headline, pxX(10 + off2x), pxY(45 + off2y), pxX(80), {
            styles: { fontSize: "32px", fontFamily: "Space Mono", color: secondary, opacity: "0.65", fontWeight: "700" }
          }),
          createTextElement("cd-scanline-tag", `//${badgeText.toUpperCase()}`, pxX(10), pxY(90), pxX(80), {
            styles: { fontSize: "12px", fontFamily: "Space Mono", color: secondary, opacity: "0.8" }
          })
        ]
      };
    }
  },
  {
    id: "glass-veil",
    label: "Glass Veil",
    description: "Premium et\xE9reo sobre foto.",
    axes: { composition: "centered-minimal", typography: "clean-sans", color: "vibrant", ornaments: "minimal", texture: "clean", vibe: "premium" },
    moods: ["premium", "sereno"],
    fit: { needsImage: true },
    carousel: "uniform",
    compose: (ctx) => {
      const { tokens } = ctx;
      const { background, primary } = tokens.colors;
      const ar = aspectOf(ctx.aspectRatio);
      const glassSlots = centeredStack({
        headlineWidthPercent: 78,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.display[ar],
        bodyHeightPercent: BODY_HEIGHT_PCT.standard[ar],
        textAlign: "center",
        position: "center"
      });
      return {
        layout: "centered",
        bgOverlay: { color: lighten(background, 12), opacity: 0.25 },
        imageSettings: { blur: 2, brightness: 1.05 },
        layoutSettings: {
          card: { position: "center", textAlign: "center", width: 78 },
          headline: glassSlots.headline,
          body: glassSlots.body
        },
        structure: {
          border: `1px solid ${primary}40`,
          borderRadius: "24px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)"
        },
        ornaments: { badge: "keep", sticker: "hide", accentBar: "hide" },
        cardMode: "card"
        // using card to show the transluscent background
      };
    }
  },
  {
    id: "kinetic-type",
    label: "Kinetic Type",
    description: "Energia, coreografia tipogr\xE1fica.",
    axes: { composition: "freeform", typography: "display-brutal", color: "chromatic-block", ornaments: "badges-stickers", texture: "grain", vibe: "divertido" },
    moods: ["urgente", "divertido", "tech", "cru"],
    fit: { maxHeadlineChars: 999 },
    // No strict max, actually requires long headline
    carousel: "title-emphasis",
    compose: (ctx) => {
      const { variation, tokens, pxX, pxY, rand } = ctx;
      const { text, primary } = tokens.colors;
      const segments = splitHeadline(variation.headline, rand);
      const total = segments.length;
      const textElements = [];
      for (let i = 0; i < total - 1; i++) {
        const segText = segments[i];
        const rot = -4 + rand() * 8;
        const size = i % 2 === 0 ? "48px" : "34px";
        const realSize = i % 2 === 0 ? "16px" : "12px";
        const col = i % 2 === 0 ? text : primary;
        textElements.push(
          createTextElement(`cd-kin-${i}`, segText, pxX(10), pxY(18 + i * 16), pxX(80), {
            rotation: rot,
            styles: { fontSize: realSize, fontFamily: "Anton", color: col, textTransform: "uppercase", lineHeight: "1" }
          })
        );
      }
      const ar = aspectOf(ctx.aspectRatio);
      const kineticSlots = centeredStack({
        xCenterPercent: flX(10, 80),
        headlineWidthPercent: 80,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.display[ar],
        bodyHeightPercent: BODY_HEIGHT_PCT.standard[ar],
        position: "center",
        yCenterPercent: 45
      });
      return {
        headlineFontFamily: "Anton",
        typography: { textTransform: "uppercase" },
        layoutSettings: {
          headline: kineticSlots.headline,
          body: kineticSlots.body
        },
        ornaments: { badge: "hide", sticker: "keep", accentBar: "hide" },
        cardMode: "full-bleed",
        textElements
      };
    }
  },
  {
    id: "data-punch",
    label: "Data Punch",
    description: "Autoridade num\xE9rica; estat\xEDstica em destaque.",
    axes: { composition: "poster", typography: "clean-sans", color: "desaturated", ornaments: "minimal", texture: "clean", vibe: "sereno" },
    moods: ["editorial", "premium", "tech"],
    fit: { needsNumber: true },
    carousel: "title-emphasis",
    compose: (ctx) => {
      const { variation, tokens, pxX, pxY } = ctx;
      const content = `${variation.headline} ${variation.body}`;
      const match = content.match(/\d+([.,]\d+)?%?/);
      const stat2 = match ? match[0] : "100%";
      const ar = aspectOf(ctx.aspectRatio);
      const dataPunchSlots = stack({
        xCenterPercent: flX(8, 84),
        headlineWidthPercent: 84,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.display[ar],
        topPercent: 49,
        textAlign: "left",
        position: "top-left"
      });
      return {
        headlineFontSize: 0.8,
        layoutSettings: {
          headline: dataPunchSlots.headline,
          accentBar: { position: "top-left", textAlign: "left", freePosition: { x: flX(8, 12), y: 50 }, width: 12 }
        },
        ornaments: { badge: "keep", sticker: "hide", accentBar: "keep", body: "hide" },
        cardMode: "full-bleed",
        textElements: [
          createTextElement("cd-stat", stat2, pxX(8), pxY(22), pxX(84), {
            styles: { fontSize: "32px", fontWeight: "800", color: tokens.colors.primary, fontFamily: "Inter", lineHeight: "1" }
          })
        ]
      };
    }
  },
  {
    id: "versus",
    label: "Versus / Mito vs Verdade",
    description: "Contraste bin\xE1rio, grade clara.",
    axes: { composition: "grid", typography: "display-brutal", color: "vibrant", ornaments: "minimal", texture: "halftone", vibe: "cru" },
    moods: ["cru", "divertido", "urgente"],
    fit: { needsSections: true },
    carousel: "uniform",
    compose: (ctx) => {
      const ar = aspectOf(ctx.aspectRatio);
      const versusSlots = centeredStack({
        headlineWidthPercent: 84,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.display[ar],
        position: "top-left",
        yCenterPercent: HEADLINE_TOP_ANCHOR[ar]
      });
      const sectionsTop = versusSlots.headline.freePosition.y + versusSlots.headline.height / 2 + GAP_PCT;
      const sections = sectionGrid({
        topPercent: sectionsTop,
        rowHeightPercent: BODY_HEIGHT_PCT.standard[ar]
      });
      return {
        template: "feature-grid",
        typography: { textTransform: "uppercase" },
        ornaments: { badge: "keep", sticker: "hide", accentBar: "hide", body: "hide" },
        cardMode: "card",
        layoutSettings: {
          headline: versusSlots.headline,
          sectionLayouts: sections
        },
        layout: "left-aligned"
      };
    }
  },
  {
    id: "quote-authority",
    label: "Quote Authority",
    description: "Cita\xE7\xE3o com peso institucional.",
    axes: { composition: "centered-minimal", typography: "editorial-serif", color: "monochrome", ornaments: "minimal", texture: "clean", vibe: "editorial" },
    moods: ["editorial", "premium", "sereno"],
    fit: { maxHeadlineChars: 90 },
    carousel: "uniform",
    compose: (ctx) => {
      const { variation, tokens, pxX, pxY } = ctx;
      const attribution = variation.creativeDirection?.hiddenOrnaments?.badge || "AUTORIDADE";
      const ar = aspectOf(ctx.aspectRatio);
      const quoteSlots = centeredStack({
        headlineWidthPercent: 70,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.display[ar],
        bodyHeightPercent: BODY_HEIGHT_PCT.standard[ar],
        textAlign: "center",
        position: "center"
      });
      return {
        headlineFontFamily: "Lora",
        headlineFontSize: 1.3,
        layoutSettings: {
          headline: quoteSlots.headline,
          body: quoteSlots.body
        },
        ornaments: { badge: "hide", sticker: "hide", accentBar: "hide" },
        cardMode: "full-bleed",
        textElements: [
          createTextElement("cd-quote-open", '"', pxX(6), pxY(6), pxX(15), {
            styles: { fontSize: "40px", color: tokens.colors.primary, opacity: "0.35", fontFamily: "Lora", lineHeight: "1" }
          }),
          createTextElement("cd-quote-close", '"', pxX(82), pxY(70), pxX(15), {
            styles: { fontSize: "40px", color: tokens.colors.primary, opacity: "0.35", fontFamily: "Lora", lineHeight: "1" }
          }),
          createTextElement("cd-attribution", attribution.toUpperCase(), pxX(10), pxY(86), pxX(80), {
            styles: { fontSize: "13px", color: tokens.colors.secondary, fontFamily: "Inter", textAlign: "center", fontWeight: "500" }
          })
        ]
      };
    }
  },
  {
    id: "minimal-air",
    label: "Minimal Air",
    description: "Sil\xEAncio premium; muito whitespace.",
    axes: { composition: "centered-minimal", typography: "clean-sans", color: "monochrome", ornaments: "minimal", texture: "clean", vibe: "premium" },
    moods: ["premium", "sereno", "editorial"],
    fit: { maxHeadlineChars: 50 },
    carousel: "uniform",
    compose: (ctx) => {
      const ar = aspectOf(ctx.aspectRatio);
      const minimalSlots = centeredStack({
        headlineWidthPercent: 80,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.display[ar],
        bodyHeightPercent: BODY_HEIGHT_PCT.standard[ar],
        textAlign: "center",
        position: "center"
      });
      return {
        layout: "centered",
        headlineFontSize: 0.9,
        bodyFontSize: 0.85,
        layoutSettings: {
          padding: 48,
          accentBar: { position: "top-center", textAlign: "center", width: 8 },
          headline: minimalSlots.headline,
          body: minimalSlots.body
        },
        ornaments: { badge: "keep", sticker: "hide", accentBar: "keep" },
        cardMode: "full-bleed"
      };
    }
  },
  {
    id: "mosaic-grid",
    label: "Mosaic Grid",
    description: "Conte\xFAdo denso em blocos assim\xE9tricos.",
    axes: { composition: "grid", typography: "clean-sans", color: "desaturated", ornaments: "minimal", texture: "grain", vibe: "cru" },
    moods: ["tech", "divertido", "urgente"],
    fit: { needsSections: true },
    carousel: "uniform",
    compose: (ctx) => {
      const ar = aspectOf(ctx.aspectRatio);
      const mosaicSlots = centeredStack({
        headlineWidthPercent: 84,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.display[ar],
        position: "top-left",
        yCenterPercent: HEADLINE_TOP_ANCHOR[ar]
      });
      const sectionsTop = mosaicSlots.headline.freePosition.y + mosaicSlots.headline.height / 2 + GAP_PCT;
      const sections = sectionGrid({
        topPercent: sectionsTop,
        rowHeightPercent: BODY_HEIGHT_PCT.standard[ar]
      });
      return {
        template: "feature-grid",
        decorations: "playful",
        ornaments: { badge: "keep", sticker: "keep", accentBar: "hide", body: "hide" },
        cardMode: "card",
        layoutSettings: {
          headline: mosaicSlots.headline,
          sectionLayouts: sections
        },
        layout: "left-aligned"
      };
    }
  },
  {
    id: "duotone-wash",
    label: "Duotone Wash",
    description: "Foto banhada na cor da marca.",
    axes: { composition: "poster", typography: "display-brutal", color: "duotone", ornaments: "minimal", texture: "halftone", vibe: "tech" },
    moods: ["tech", "cru", "urgente", "divertido"],
    fit: { needsImage: true },
    carousel: "uniform",
    compose: (ctx) => {
      const { tokens } = ctx;
      const { primary } = tokens.colors;
      const ar = aspectOf(ctx.aspectRatio);
      const referenceBg = mix(primary, "#000000", 0.55);
      const headlineCol = isDark2(referenceBg) ? "#ffffff" : "#111111";
      const duotoneSlots = posterBottom({
        headlineWidthPercent: 84,
        headlineHeightPercent: HEADLINE_HEIGHT_PCT.display[ar],
        bodyHeightPercent: BODY_HEIGHT_PCT.standard[ar],
        gapPercent: GAP_PCT,
        bottomMarginPercent: BOTTOM_MARGIN_PCT[ar],
        textAlign: "left",
        position: "bottom-left"
      });
      return {
        imageSettings: { saturation: 0.1, contrast: 1.15, blendMode: "multiply" },
        // CR-003: o wash duotone é ESCURO por construção (`primary⊕preto`),
        // com opacidade alta — o fundo efetivo do texto independe da paleta
        // base (clara ou escura) e o texto branco sempre atinge AA. Um wash
        // de 55% de cor brilhante vira tom médio e quebra o contraste.
        bgOverlay: { color: referenceBg, opacity: 0.85 },
        headlineColor: headlineCol,
        bodyColor: headlineCol,
        textColor: headlineCol,
        layoutSettings: {
          headline: duotoneSlots.headline,
          body: duotoneSlots.body
        },
        ornaments: { badge: "hide", sticker: "keep", accentBar: "keep" },
        cardMode: "full-bleed"
      };
    }
  }
];

// shared/creative/directCreative.ts
function isValidIntent(intent) {
  return intent && typeof intent.mood === "string" && typeof intent.energy === "string" && typeof intent.formality === "string";
}
function classifyIntentFromContent(variation) {
  const content = `${variation.headline || ""} ${variation.body || ""} ${(variation.hashtags || []).join(" ")}`.toLowerCase();
  let mood = "editorial";
  if (/(urgente|última|não perca|hoje|agora|corre|imperdível|promoção)/.test(content)) mood = "urgente";
  else if (/(ia|inteligência artificial|tech|startup|app|software|digital|crypto|futuro|inovação)/.test(content)) mood = "tech";
  else if (/(luxo|premium|exclusivo|sofisticado|elite|alta performance)/.test(content)) mood = "premium";
  else if (/(saúde|bem-estar|equilíbrio|meditação|yoga|calma|natureza|orgânico)/.test(content)) mood = "sereno";
  else if (/(game|meme|festa|diversão|criativo|arte|música|cultura)/.test(content)) mood = "divertido";
  else if (/(pare|chega|basta|nunca|verdade|mito|ninguém fala)/.test(content)) mood = "cru";
  const headlineLen = (variation.headline || "").length;
  const bodyLen = (variation.body || "").length;
  let energy = "media";
  if (headlineLen <= 30 || mood === "urgente" || mood === "cru") energy = "alta";
  else if (bodyLen > 200) energy = "baixa";
  let formality = "neutro";
  const type = variation.copyAngle?.type;
  if (type === "autoridade" || type === "objecao") formality = "formal";
  else if (mood === "divertido") formality = "casual";
  return { mood, energy, formality };
}
function fitsContent(fit, variation) {
  if (fit.maxHeadlineChars && (variation.headline?.length || 0) > fit.maxHeadlineChars) return false;
  if (fit.minHeadlineChars && (variation.headline?.length || 0) < fit.minHeadlineChars) return false;
  const sectionsCount = variation.sections?.length || 0;
  const isStructured = Boolean(variation.template && variation.template !== "simple");
  const hasSectionsContent = sectionsCount >= 2 || isStructured;
  if (fit.needsSections) {
    if (!hasSectionsContent) return false;
  } else if (hasSectionsContent) {
    return false;
  }
  if (fit.needsNumber && !/\d/.test((variation.headline || "") + " " + (variation.body || ""))) return false;
  if (fit.needsImage && !variation.imageUrl && !variation.bgValue?.url) return false;
  return true;
}
function creativeCellOf(family) {
  const structureGroup = family.axes.composition === "grid" ? "grid" : family.axes.composition === "poster" || family.axes.composition === "split" ? "poster" : family.axes.composition === "centered-minimal" ? "centered" : "freeform";
  const voiceGroup = family.axes.typography === "display-brutal" || family.axes.typography === "mono-tech" ? "display" : family.axes.typography === "editorial-serif" ? "serif" : "clean";
  return `${structureGroup}:${voiceGroup}`;
}
function cellTaken(f, excludeIds) {
  if (!excludeIds || excludeIds.length === 0) return false;
  const takenCells = excludeIds.map((id) => FAMILIES.find((fam) => fam.id === id)).filter(Boolean).map((fam) => creativeCellOf(fam));
  return takenCells.includes(creativeCellOf(f));
}
function pickSeeded(arr, rand) {
  return arr[Math.floor(rand() * arr.length)];
}
var TEMP_BY_MOOD = {
  urgente: "warm",
  divertido: "warm",
  premium: "neutral",
  editorial: "neutral",
  sereno: "neutral",
  tech: "cool",
  cru: "cool"
};
function pickPalette(intent, variation, rand) {
  let candidates = PALETTES.filter((p) => p.vibe.includes(intent.mood));
  if (candidates.length === 0) candidates = PALETTES.filter((p) => p.temperature === TEMP_BY_MOOD[intent.mood]);
  if (candidates.length === 0) candidates = PALETTES;
  const palette = pickSeeded(candidates, rand);
  let inverted = false;
  if (palette.invertible && rand() < 0.35) {
    const dark = isDark2(palette.colorA) ? palette.colorA : palette.colorB;
    const light = isDark2(palette.colorA) ? palette.colorB : palette.colorA;
    if (contrastRatio(light, dark) >= 4.5) {
      inverted = true;
    }
  }
  return { id: palette.id, inverted };
}
function directCreative(variation, intent, seed, opts = {}) {
  const rand = mulberry32(seed);
  const resolvedIntent = isValidIntent(intent) ? intent : classifyIntentFromContent(variation);
  const eligible = FAMILIES.filter(
    (f) => f.moods.includes(resolvedIntent.mood) && fitsContent(f.fit, variation) && !opts.excludeFamilyIds?.includes(f.id) && !cellTaken(f, opts.excludeFamilyIds)
  );
  const fresh = eligible.filter((f) => !opts.recentFamilyIds?.includes(f.id));
  const pool = fresh.length ? fresh : eligible;
  let family = pool.length ? pickSeeded(pool, rand) : null;
  if (!family) {
    const relaxMood = FAMILIES.filter((f) => fitsContent(f.fit, variation) && !cellTaken(f, opts.excludeFamilyIds));
    family = relaxMood.length ? pickSeeded(relaxMood, rand) : null;
  }
  if (!family) {
    const relaxAll = FAMILIES.filter((f) => fitsContent(f.fit, variation));
    family = relaxAll.length ? pickSeeded(relaxAll, rand) : null;
  }
  if (!family) {
    family = FAMILIES.find((f) => f.id === "chromatic-block");
  }
  const palette = opts.brandLocked ? { id: "brand", inverted: false } : pickPalette(resolvedIntent, variation, rand);
  return {
    version: 1,
    familyId: family.id,
    paletteId: palette.id,
    paletteInverted: palette.inverted,
    seed,
    axes: family.axes,
    source: isValidIntent(intent) ? "llm-intent" : "classifier"
  };
}

// shared/creative/compose.ts
var RATIO_KEYS = ["1:1", "5:6", "9:16"];
function composeVariation(variation, brandTokens, opts = {}) {
  const seed = hashString(variation.id);
  const dir = variation.creativeDirection ? { ...variation.creativeDirection, hiddenOrnaments: { ...variation.creativeDirection.hiddenOrnaments } } : directCreative(variation, null, seed, opts);
  const existingBg = variation.backgroundColor;
  const existingText = variation.textColor;
  const existingAccent = variation.accentColor;
  let paletteTokens;
  if (dir.paletteId === "brand") {
    paletteTokens = brandTokens;
  } else {
    const palette = PALETTES.find((p) => p.id === dir.paletteId) || PALETTES[0];
    paletteTokens = paletteToDesignTokens(palette, dir.paletteInverted);
  }
  const tokens = {
    ...paletteTokens,
    colors: {
      ...paletteTokens.colors,
      background: existingBg || paletteTokens.colors.background,
      text: existingText || paletteTokens.colors.text,
      primary: existingAccent || paletteTokens.colors.primary
    }
  };
  const family = FAMILIES.find((f) => f.id === dir.familyId) || FAMILIES.find((f) => f.id === "chromatic-block");
  const rand = mulberry32(dir.seed);
  const requestedRatio = variation.aspectRatio ?? "1:1";
  const docWidth = 360;
  const ratioParts = requestedRatio.split(":").map(Number);
  const docHeight = ratioParts.length === 2 && ratioParts[0] && ratioParts[1] ? docWidth * ratioParts[1] / ratioParts[0] : docWidth;
  const ctx = {
    variation,
    tokens,
    rand,
    aspectRatio: requestedRatio,
    doc: { width: docWidth, height: docHeight },
    pxX: (pct) => pct / 100 * docWidth,
    pxY: (pct) => pct / 100 * docHeight
  };
  const output = family.compose(ctx);
  const mergedTokens = {
    ...tokens,
    structure: { ...tokens.structure, ...output.structure || {} },
    typography: { ...tokens.typography, ...output.typography || {} },
    decorations: output.decorations ?? tokens.decorations
  };
  const composedLayoutSettings = output.layoutSettings ? { ...variation.layoutSettings, ...output.layoutSettings } : variation.layoutSettings;
  const composedImageSettings = output.imageSettings ? { ...variation.imageSettings, ...output.imageSettings } : variation.imageSettings;
  const composedBgOverlay = output.bgOverlay ? { ...variation.bgOverlay, ...output.bgOverlay } : variation.bgOverlay;
  const composed = {
    ...variation,
    creativeDirection: dir,
    copyAngle: variation.copyAngle ? { ...variation.copyAngle } : variation.copyAngle,
    layout: output.layout || variation.layout || "minimal",
    template: output.template || variation.template || "simple",
    layoutSettings: composedLayoutSettings,
    imageSettings: composedImageSettings,
    bgOverlay: composedBgOverlay,
    backgroundColor: existingBg || mergedTokens.colors.background,
    textColor: existingText || mergedTokens.colors.text,
    accentColor: existingAccent || mergedTokens.colors.primary,
    headlineFontFamily: output.headlineFontFamily || mergedTokens.typography.fontFamily,
    bodyFontFamily: output.bodyFontFamily || mergedTokens.typography.fontFamily,
    textElements: output.textElements || [],
    imageElements: output.imageElements || [],
    designTokens: mergedTokens
  };
  if (output.headlineFontSize) composed.headlineFontSize = output.headlineFontSize;
  if (output.bodyFontSize) composed.bodyFontSize = output.bodyFontSize;
  if (output.headlineColor) composed.headlineColor = output.headlineColor;
  if (output.bodyColor) composed.bodyColor = output.bodyColor;
  if (output.textColor) composed.textColor = output.textColor;
  if (output.splitImagePosition) composed.splitImagePosition = output.splitImagePosition;
  if (output.ornaments) {
    const cd = composed.creativeDirection;
    if (!cd.hiddenOrnaments) {
      cd.hiddenOrnaments = {};
    }
    const ca = composed.copyAngle;
    if (ca) {
      if (output.ornaments.sticker === "hide" && ca.stickerText) {
        cd.hiddenOrnaments.stickerText = ca.stickerText;
        ca.stickerText = "";
      } else if (output.ornaments.sticker === "keep" && cd.hiddenOrnaments.stickerText) {
        ca.stickerText = cd.hiddenOrnaments.stickerText;
        delete cd.hiddenOrnaments.stickerText;
      }
      if (output.ornaments.badge === "hide" && ca.badge) {
        cd.hiddenOrnaments.badge = ca.badge;
        ca.badge = "";
      } else if (output.ornaments.badge === "keep" && cd.hiddenOrnaments.badge) {
        ca.badge = cd.hiddenOrnaments.badge;
        delete cd.hiddenOrnaments.badge;
      }
    }
    if (output.ornaments.body === "hide" && composed.body) {
      cd.hiddenOrnaments.body = composed.body;
      composed.body = "";
    } else if (output.ornaments.body === "keep" && cd.hiddenOrnaments.body) {
      composed.body = cd.hiddenOrnaments.body;
      delete cd.hiddenOrnaments.body;
    }
  }
  if (!family.fit.needsSections && (composed.sections?.length ?? 0) > 0) {
    composed.template = "simple";
    composed.sections = void 0;
  }
  const ls = composed.layoutSettings;
  const isStructured = (composed.template ?? "simple") !== "simple" && (composed.sections?.length ?? 0) > 0;
  if (!isStructured && ls?.headline?.freePosition && !ls?.body?.freePosition && String(composed.body ?? "").trim().length > 0) {
    throw new Error(
      `[compose] fam\xEDlia "${dir.familyId}" declara headline com freePosition e body em fluxo com texto \u2014 declare bodyHeightPercent no arqu\xE9tipo ou use ornaments.body: "hide".`
    );
  }
  const compositionRatioKey = aspectOf(requestedRatio);
  const layoutSettingsByAspectRatio = {};
  for (const ratioKey of RATIO_KEYS) {
    if (ratioKey === compositionRatioKey) {
      layoutSettingsByAspectRatio[ratioKey] = composed.layoutSettings;
      continue;
    }
    const ratioDocHeight = docWidth * Number(ratioKey.split(":")[1]) / Number(ratioKey.split(":")[0]);
    const ratioCtx = {
      variation,
      tokens,
      // Seed FRESCA por chamada: a mesma sequência pseudoaleatória em cada
      // proporção, para que decorações não-geométricas (splitImagePosition,
      // rotação de sticker) saiam idênticas — só a geometria calibrada por
      // `ar` deve variar entre as 3 chamadas.
      rand: mulberry32(dir.seed),
      aspectRatio: ratioKey,
      doc: { width: docWidth, height: ratioDocHeight },
      pxX: (pct) => pct / 100 * docWidth,
      pxY: (pct) => pct / 100 * ratioDocHeight
    };
    const ratioOutput = family.compose(ratioCtx);
    layoutSettingsByAspectRatio[ratioKey] = ratioOutput.layoutSettings ? { ...variation.layoutSettings, ...ratioOutput.layoutSettings } : variation.layoutSettings;
  }
  composed.layoutSettingsByAspectRatio = layoutSettingsByAspectRatio;
  return composed;
}

// shared/creative/visualDiversityPlan.ts
function visualDiversityIssues(variations) {
  if (variations.length < 2 || !variations.every((variation) => variation.creativeDirection?.familyId)) {
    return [];
  }
  const layouts = new Set(variations.map((variation) => variation.layout).filter(Boolean));
  const familyIds = new Set(variations.map((variation) => variation.creativeDirection?.familyId).filter(Boolean));
  const cells = new Set(
    variations.map((variation) => FAMILIES.find((family) => family.id === variation.creativeDirection?.familyId)).filter(Boolean).map((family) => creativeCellOf(family))
  );
  const issues = [];
  if (layouts.size < 2) issues.push("visual diversity requires at least two composed layouts");
  if (familyIds.size < 2) issues.push("visual diversity requires at least two creative families");
  if (cells.size < 2) issues.push("visual diversity requires at least two composition cells");
  return issues;
}
function cloneForComposition(variation, creativeDirection) {
  return {
    ...variation,
    copyAngle: variation.copyAngle ? { ...variation.copyAngle } : variation.copyAngle,
    creativeDirection: {
      ...creativeDirection,
      hiddenOrnaments: creativeDirection.hiddenOrnaments ? { ...creativeDirection.hiddenOrnaments } : void 0
    }
  };
}
function composeVisualDiversityPlan(variations, brandTokens, options = {}) {
  const composed = [];
  const usedFamilyIds = [];
  const usedLayouts = /* @__PURE__ */ new Set();
  const usedCells = /* @__PURE__ */ new Set();
  let recompositionAttempts = 0;
  for (const variation of variations) {
    let best;
    let bestScore = -1;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const seed = hashString(`${variation.id}:visual-diversity:${attempt}`);
      const creativeDirection = directCreative(
        variation,
        null,
        seed,
        { excludeFamilyIds: usedFamilyIds, brandLocked: options.brandLocked }
      );
      const candidate = composeVariation(
        cloneForComposition(variation, creativeDirection),
        brandTokens
      );
      const family2 = FAMILIES.find((item) => item.id === creativeDirection.familyId);
      const cell2 = family2 ? creativeCellOf(family2) : "unknown";
      const score = (usedLayouts.has(candidate.layout) ? 0 : 4) + (usedFamilyIds.includes(creativeDirection.familyId) ? 0 : 2) + (usedCells.has(cell2) ? 0 : 1);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
      if (score === 7) break;
    }
    if (!best) {
      best = composeVariation(variation, brandTokens, { brandLocked: options.brandLocked });
    }
    const familyId = best.creativeDirection?.familyId;
    const family = FAMILIES.find((item) => item.id === familyId);
    const cell = family ? creativeCellOf(family) : void 0;
    if (composed.length > 0) recompositionAttempts += 1;
    composed.push(best);
    if (familyId) usedFamilyIds.push(familyId);
    if (best.layout) usedLayouts.add(best.layout);
    if (cell) usedCells.add(cell);
  }
  const issues = visualDiversityIssues(composed);
  return {
    variations: composed,
    plan: {
      slots: composed.map((variation) => {
        const familyId = variation.creativeDirection?.familyId;
        const family = FAMILIES.find((item) => item.id === familyId);
        return {
          id: variation.id,
          familyId,
          cell: family ? creativeCellOf(family) : void 0,
          layout: variation.layout
        };
      }),
      layouts: Array.from(usedLayouts),
      familyIds: Array.from(new Set(usedFamilyIds)),
      cells: Array.from(usedCells),
      recompositionAttempts,
      issues
    }
  };
}

// server/ai/variationDiversity.ts
function normalizeVariationText(value) {
  return (value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s#]/g, " ").replace(/\s+/g, " ").trim();
}
function tokenizeVariationText(value) {
  return normalizeVariationText(value).split(" ").filter((token) => token.length > 2);
}
function jaccardSimilarity(a, b) {
  if (a.length === 0 && b.length === 0) return 1;
  const aSet = new Set(a);
  const bSet = new Set(b);
  let intersection = 0;
  for (const token of Array.from(aSet)) {
    if (bSet.has(token)) intersection += 1;
  }
  const union = (/* @__PURE__ */ new Set([...Array.from(aSet), ...Array.from(bSet)])).size;
  return union === 0 ? 0 : intersection / union;
}
function variationsNeedDiversification(variations) {
  if (variations.length < 3) return true;
  for (let i = 0; i < variations.length; i++) {
    for (let j = i + 1; j < variations.length; j++) {
      const a = variations[i];
      const b = variations[j];
      const aText = tokenizeVariationText(
        `${a.headline} ${a.body} ${a.callToAction} ${a.caption}`
      );
      const bText = tokenizeVariationText(
        `${b.headline} ${b.body} ${b.callToAction} ${b.caption}`
      );
      const copySimilarity = jaccardSimilarity(aText, bText);
      const sameHeadline = normalizeVariationText(a.headline) === normalizeVariationText(b.headline);
      const sameBody = normalizeVariationText(a.body) === normalizeVariationText(b.body);
      const sameTone = normalizeVariationText(a.tone) === normalizeVariationText(b.tone);
      const sameLayout = a.layout === b.layout;
      const sameColors = a.backgroundColor === b.backgroundColor && a.textColor === b.textColor && a.accentColor === b.accentColor;
      if (sameHeadline || sameBody && sameLayout || copySimilarity >= 0.78 && sameLayout || copySimilarity >= 0.9 && sameColors || sameTone && sameLayout && sameColors) {
        return true;
      }
    }
  }
  return false;
}

// server/ai/generationValidation.ts
var POST_VARIATION_TARGET = 3;
var CAROUSEL_SLIDE_TARGET = 5;
function validateVariationSet(variations, postMode) {
  const errors = [];
  if (variations.length !== POST_VARIATION_TARGET) {
    errors.push(
      `expected ${POST_VARIATION_TARGET} variations, received ${variations.length}`
    );
  }
  variations.forEach((variation, index) => {
    if (!hasRequiredCopy(variation)) {
      errors.push(`variation ${index + 1} is missing required copy fields`);
    }
    if (!variation.copyAngle?.type || !variation.copyAngle.label) {
      errors.push(`variation ${index + 1} is missing a copy angle`);
    }
    if (postMode === "static" && !hasValidStaticSections(variation)) {
      errors.push(
        `variation ${index + 1} must use no sections for simple templates or exactly ${STATIC_SECTION_TARGET} short sections for structured templates`
      );
    }
    if (postMode === "static" && !hasCoherentStaticItemCount(variation)) {
      errors.push(
        `variation ${index + 1} headline advertises a different item count than its ${STATIC_SECTION_TARGET} structured sections`
      );
    }
    if (postMode === "carousel" && variation.slides?.length !== CAROUSEL_SLIDE_TARGET) {
      errors.push(
        `variation ${index + 1} must contain ${CAROUSEL_SLIDE_TARGET} slides`
      );
    }
  });
  if (variations.length === POST_VARIATION_TARGET && variationsNeedDiversification(variations)) {
    errors.push("variations are not sufficiently distinct");
  }
  errors.push(...visualDiversityIssues(variations));
  return { valid: errors.length === 0, errors };
}

// server/ai/brandVisualGuardian.ts
function hexToRgb2(hex) {
  let clean = hex.trim().replace(/^#/, "");
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length !== 6) return null;
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return null;
  return {
    r: num >> 16 & 255,
    g: num >> 8 & 255,
    b: num & 255
  };
}
function colorBrightness2(hex) {
  const rgb = hexToRgb2(hex);
  if (!rgb) return 128;
  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1e3;
}
function colorDistance(a, b) {
  const ra = hexToRgb2(a);
  const rb = hexToRgb2(b);
  if (!ra || !rb) return Number.POSITIVE_INFINITY;
  return Math.sqrt(
    (ra.r - rb.r) ** 2 + (ra.g - rb.g) ** 2 + (ra.b - rb.b) ** 2
  );
}
function nearestPaletteColor(candidate, palette) {
  const valid = palette.filter((hex) => hexToRgb2(hex) !== null);
  if (valid.length === 0) return null;
  let best = valid[0];
  let bestDist = colorDistance(candidate, best);
  for (const hex of valid) {
    const dist = colorDistance(candidate, hex);
    if (dist < bestDist) {
      best = hex;
      bestDist = dist;
    }
  }
  return { hex: best, distance: bestDist };
}
var ACCENT_SNAP_TOLERANCE = 60;
function snapAccentToPalette(candidate, palette, fallback) {
  if (!candidate) return fallback;
  const nearest = nearestPaletteColor(candidate, palette);
  if (!nearest) return fallback;
  return nearest.distance > ACCENT_SNAP_TOLERANCE ? nearest.hex : candidate;
}
function ensureReadableText(background, text, palette) {
  const currentText = text ?? "#FFFFFF";
  if (wcagContrast(background, currentText) >= 4.5) return currentText;
  const bgBright = colorBrightness2(background);
  const wantLight = bgBright < 128;
  const candidates = palette.filter((hex) => hexToRgb2(hex) !== null).filter((hex) => {
    const b = colorBrightness2(hex);
    return wantLight ? b > 180 : b < 80;
  }).sort((a, b) => {
    const ca = wcagContrast(background, a);
    const cb = wcagContrast(background, b);
    return cb - ca;
  });
  for (const candidate of candidates) {
    if (wcagContrast(background, candidate) >= 4.5) return candidate;
  }
  return wantLight ? "#FFFFFF" : "#1A1A1A";
}
function enforceBrandVisualGuardian(variations, siteIntelligence, options = {}) {
  const enforcePalette = options.enforcePalette !== false;
  const bgSnapTol = options.backgroundSnapTolerance ?? 40;
  if (!siteIntelligence) return variations.slice();
  const palette = siteIntelligence.brand.colors.palette ?? [
    siteIntelligence.brand.colors.primary,
    siteIntelligence.brand.colors.secondary,
    siteIntelligence.brand.colors.background,
    siteIntelligence.brand.colors.text,
    siteIntelligence.brand.colors.accent
  ].filter(Boolean);
  if (palette.length === 0) return variations.slice();
  return variations.map((variation) => {
    const patched = { ...variation };
    if (enforcePalette && patched.backgroundColor) {
      const nearest = nearestPaletteColor(patched.backgroundColor, palette);
      if (nearest && nearest.distance > bgSnapTol) {
        patched.backgroundColor = nearest.hex;
      }
    }
    if (enforcePalette && patched.accentColor) {
      patched.accentColor = snapAccentToPalette(
        patched.accentColor,
        palette,
        siteIntelligence.brand.colors.accent ?? patched.accentColor
      );
    }
    if (patched.backgroundColor && patched.textColor) {
      patched.textColor = ensureReadableText(
        patched.backgroundColor,
        patched.textColor,
        palette
      );
    }
    if (patched.aspectRatioOptimizations) {
      const arClone = {};
      for (const [ratio, opt] of Object.entries(patched.aspectRatioOptimizations)) {
        const fixedOpt = { ...opt };
        if (enforcePalette && fixedOpt.backgroundColor) {
          const nearest = nearestPaletteColor(fixedOpt.backgroundColor, palette);
          if (nearest && nearest.distance > bgSnapTol) {
            fixedOpt.backgroundColor = nearest.hex;
          }
        }
        if (enforcePalette && fixedOpt.accentColor) {
          fixedOpt.accentColor = snapAccentToPalette(
            fixedOpt.accentColor,
            palette,
            siteIntelligence.brand.colors.accent ?? fixedOpt.accentColor
          );
        }
        if (fixedOpt.backgroundColor && fixedOpt.textColor) {
          fixedOpt.textColor = ensureReadableText(
            fixedOpt.backgroundColor,
            fixedOpt.textColor,
            palette
          );
        }
        arClone[ratio] = fixedOpt;
      }
      patched.aspectRatioOptimizations = arClone;
    }
    return patched;
  });
}

// server/ai/captionSynthesis.ts
function extractVisualContent(variation) {
  const slides = variation.slides ?? [];
  if (slides.length > 0) {
    const text = slides.map((slide, index) => {
      const headline2 = slide.headline?.trim() ?? "";
      const body2 = slide.body?.trim() ?? "";
      return `Slide ${index + 1}: ${headline2}${body2 ? ` \u2014 ${body2}` : ""}`;
    }).join("\n");
    return { text, source: "slides" };
  }
  const sections = variation.sections ?? [];
  if (sections.length > 0) {
    const text = sections.map((section, index) => {
      const label = section.label?.trim() ?? "";
      const description = section.description?.trim() ?? "";
      return `Item ${index + 1}: ${label}${description ? ` \u2014 ${description}` : ""}`;
    }).join("\n");
    return { text, source: "sections" };
  }
  const headline = variation.headline?.trim() ?? "";
  const body = variation.body?.trim() ?? "";
  return {
    text: `${headline}${body ? ` \u2014 ${body}` : ""}`,
    source: "headline_body"
  };
}
function synthesizeCaptionDeterministic(variation, platform) {
  const { source } = extractVisualContent(variation);
  const maxChars = PLATFORM_SPECS[platform].maxChars;
  const headline = variation.headline?.trim() ?? "";
  const body = variation.body?.trim() ?? "";
  const callToAction = variation.callToAction?.trim() ?? "";
  const paragraphs = [];
  if (headline) paragraphs.push(headline);
  if (source === "slides") {
    const slides = variation.slides ?? [];
    const items = slides.map((slide, index) => {
      const slideHeadline = slide.headline?.trim() ?? "";
      const slideBody = slide.body?.trim() ?? "";
      return `\u2022 ${slideHeadline}${slideBody ? `: ${slideBody}` : ""}`;
    }).join("\n");
    paragraphs.push(
      `Consist\xEAncia e clareza visual s\xE3o os pilares de marcas que lideram seus mercados.

Os pontos centrais deste posicionamento:
${items}`
    );
  } else if (source === "sections") {
    const sections = variation.sections ?? [];
    const items = sections.map((section) => {
      const label = section.label?.trim() ?? "";
      const description = section.description?.trim() ?? "";
      return `\u2022 ${label}${description ? `: ${description}` : ""}`;
    }).join("\n");
    paragraphs.push(
      `A percep\xE7\xE3o de valor nasce quando cada elemento \xE9 deliberado:
${items}`
    );
  } else if (body) {
    paragraphs.push(body);
  }
  if (callToAction) {
    paragraphs.push(callToAction);
  } else {
    paragraphs.push("Qual desses princ\xEDpios \xE9 inegoci\xE1vel na sua opera\xE7\xE3o hoje?");
  }
  return paragraphs.join("\n\n").slice(0, maxChars).trim();
}

// server/ai/postEvaluation.ts
init_env();
function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
function contrastRatio3(foreground, background) {
  if (!foreground || !background) return 1;
  try {
    return contrastRatio(foreground, background);
  } catch {
    return 1;
  }
}
function overlapScore(value, reference) {
  const valueTokens = tokenizeVariationText(value);
  const referenceTokens = tokenizeVariationText(reference);
  if (valueTokens.length === 0 || referenceTokens.length === 0) return 60;
  const overlap = valueTokens.filter(
    (token) => new Set(referenceTokens).has(token)
  ).length;
  return clampScore(45 + overlap / valueTokens.length * 80);
}
var LAYOUT_INTEGRITY_PENALTY = {
  headline_body_overlap: 35,
  structured_absolute_layout: 25,
  card_too_narrow: 20,
  text_element_outside_canvas: 15,
  text_element_overlaps_copy: 15,
  text_exceeds_visible_area: 55,
  // SPEC-002 passo 6: menos grave que overlap/overflow de texto — o bloco
  // ainda está legível, só invade a margem de segurança (ex.: zona de UI do
  // Instagram Stories em 9:16).
  outside_safe_area: 10,
  section_overlap: 35,
  // mesma classe de headline_body_overlap (texto sobre texto)
  section_missing_geometry: 25
  // mesma classe de structured_absolute_layout (defeito de autoria)
};
function computeLayoutIntegrity(candidate) {
  try {
    const snapshot = createPostVisualSnapshot(
      candidate,
      candidate.aspectRatio ?? "1:1"
    );
    const slides = snapshot.slides ?? [];
    const snapshotsToValidate = slides.length > 0 ? slides.map((_, slideIndex) => projectSnapshotForSlide(snapshot, slideIndex)) : [snapshot];
    const allIssues = snapshotsToValidate.flatMap((projected) => validateVisualFit(projected).issues);
    if (allIssues.length === 0) return 100;
    const totalPenalty = allIssues.reduce(
      (sum, issue) => sum + (LAYOUT_INTEGRITY_PENALTY[issue.type] ?? 10),
      0
    );
    return clampScore(100 - totalPenalty);
  } catch {
    return 75;
  }
}
function deterministicEvaluation(input) {
  const { candidate, allCandidates, strategy, siteIntelligence, platform } = input;
  const fullText = `${candidate.headline ?? ""} ${candidate.body ?? ""} ${candidate.caption ?? ""} ${candidate.callToAction ?? ""}`;
  const brandReference = siteIntelligence ? `${siteIntelligence.business.summary} ${siteIntelligence.business.valueProposition} ${siteIntelligence.editorial.toneGuidelines.join(" ")}` : fullText;
  const audienceReference = strategy?.audience ?? siteIntelligence?.business.audiences.join(" ") ?? fullText;
  const objectiveReference = strategy ? `${strategy.topic} ${strategy.hook} ${strategy.promise}` : siteIntelligence?.editorial.priorityTopics.join(" ") ?? fullText;
  const evidenceText = siteIntelligence?.evidence.map((item) => item.text).join(" ") ?? "";
  const containsUnverifiedNumber = /\b\d+(?:[.,]\d+)?%?\b/.test(fullText) && !normalizeNumbers(evidenceText).some((number) => fullText.includes(number));
  const otherSimilarities = allCandidates.filter((item) => item !== candidate).map(
    (item) => jaccardSimilarity(
      tokenizeVariationText(fullText),
      tokenizeVariationText(
        `${item.headline ?? ""} ${item.body ?? ""} ${item.caption ?? ""}`
      )
    )
  );
  const maxSimilarity2 = Math.max(0, ...otherSimilarities);
  const headlineLength = candidate.headline?.length ?? 0;
  const bodyLength = candidate.body?.length ?? 0;
  const captionLength = candidate.caption?.length ?? 0;
  const platformLimit = platform === "twitter" ? 280 : platform === "instagram" ? 2200 : 3e3;
  const effectiveBg = effectiveBackgroundColor(
    {
      backgroundType: candidate.bgValue?.type ?? "solid",
      solidColor: candidate.bgValue?.color ?? candidate.backgroundColor,
      overlayColor: candidate.bgOverlay?.color,
      overlayOpacity: candidate.bgOverlay?.opacity
    },
    candidate.backgroundColor ?? "#000000"
  );
  const contrast = contrastRatio3(candidate.textColor, effectiveBg.color);
  const UNPROVEN_READABILITY_CAP = 70;
  const dimensions = {
    brandAlignment: overlapScore(fullText, brandReference),
    objectiveAlignment: overlapScore(fullText, objectiveReference),
    audienceRelevance: overlapScore(fullText, audienceReference),
    factuality: containsUnverifiedNumber ? 35 : siteIntelligence ? 85 : 75,
    originality: input.originalityScore ?? clampScore(100 - maxSimilarity2 * 100),
    clarity: clampScore(
      100 - Math.max(0, headlineLength - 60) * 1.5 - Math.max(0, bodyLength - 120) * 0.8
    ),
    platformFit: clampScore(
      100 - Math.max(0, captionLength - platformLimit) * 0.5
    ),
    visualReadability: effectiveBg.basis === "unproven" ? Math.min(UNPROVEN_READABILITY_CAP, clampScore(contrast * 20)) : contrast >= 4.5 ? 100 : clampScore(contrast * 20),
    captionCoherence: computeCaptionCoherence(candidate),
    layoutIntegrity: computeLayoutIntegrity(candidate)
  };
  return summarize(dimensions, []);
}
function normalizeNumbers(value) {
  return value.match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? [];
}
function computeCaptionCoherence(candidate) {
  const caption = candidate.caption?.trim() ?? "";
  if (!caption) return 40;
  const slides = candidate.slides ?? [];
  const sections = candidate.sections ?? [];
  let visualContent = "";
  let itemCount = 0;
  if (slides.length > 0) {
    visualContent = slides.map((s) => `${s.headline ?? ""} ${s.body ?? ""}`).join(" ");
    itemCount = slides.length;
  } else if (sections.length > 0) {
    visualContent = sections.map((s) => `${s.label ?? ""} ${s.description ?? ""}`).join(" ");
    itemCount = sections.length;
  } else {
    visualContent = `${candidate.headline ?? ""} ${candidate.body ?? ""}`;
    itemCount = 1;
  }
  if (!visualContent.trim()) return 50;
  const captionTokens = tokenizeVariationText(caption);
  const visualTokens = tokenizeVariationText(visualContent);
  const overlap = captionTokens.length > 0 ? captionTokens.filter((t2) => new Set(visualTokens).has(t2)).length / captionTokens.length : 0;
  const overlapScore2 = clampScore(40 + overlap * 70);
  const captionNumbers = caption.match(/\b(\d+)\b/g)?.map(Number) ?? [];
  const relevantNumbers = captionNumbers.filter((n) => n >= 2 && n <= 20);
  let numberCoherence = 100;
  if (itemCount > 1 && relevantNumbers.length > 0) {
    const matchingNumber = relevantNumbers.some((n) => n === itemCount);
    if (!matchingNumber) {
      numberCoherence = 25;
    }
  }
  if (itemCount > 1 && advertisedItemCounts(candidate.headline).some((n) => n !== itemCount)) {
    numberCoherence = Math.min(numberCoherence, 20);
  }
  const lengthScore = caption.length < 80 ? 45 : caption.length > 2e3 ? 80 : 90;
  return clampScore(
    overlapScore2 * 0.45 + numberCoherence * 0.4 + lengthScore * 0.15
  );
}
function summarize(dimensions, feedback) {
  const weights = {
    brandAlignment: 0.1,
    objectiveAlignment: 0.12,
    audienceRelevance: 0.09,
    factuality: 0.12,
    originality: 0.09,
    clarity: 0.07,
    platformFit: 0.05,
    visualReadability: 0.09,
    captionCoherence: 0.17,
    layoutIntegrity: 0.1
  };
  const overallScore = clampScore(
    Object.keys(dimensions).reduce(
      (sum, key) => sum + dimensions[key] * weights[key],
      0
    )
  );
  const accepted = overallScore >= 70 && dimensions.factuality >= 65 && dimensions.visualReadability >= 65 && dimensions.objectiveAlignment >= 60 && dimensions.captionCoherence >= 50 && dimensions.layoutIntegrity >= 50;
  const layoutFeedback = dimensions.layoutIntegrity < 50 ? [
    "Layout com sobreposicao, estouro ou texto truncado: ajuste a caixa de texto quando houver espaco; caso contrario, encurte headline/body ate todo o conteudo ficar visivel, sem reticencias."
  ] : [];
  return {
    overallScore,
    accepted,
    dimensions,
    feedback: [...layoutFeedback, ...feedback]
  };
}
async function llmEvaluation(input) {
  if (!ENV.aiLlmJudgeEnabled) return null;
  try {
    const response = await invokeLLM({
      traceLabel: "post_evaluation",
      taskRoute: "post_evaluation",
      messages: [
        {
          role: "system",
          content: `Voce e um avaliador rigoroso de conteudo social. Avalie somente o que esta no candidato e no contexto.
Penalize afirmacoes nao sustentadas, tema generico, desalinhamento com objetivo/publico e copy semelhante a cliches.
Retorne notas 0-100 e ate 4 feedbacks objetivos.`
        },
        {
          role: "user",
          content: `Candidato:
${JSON.stringify(input.candidate)}

Estrategia:
${JSON.stringify(input.strategy ?? null)}

Site:
${JSON.stringify(
            input.siteIntelligence ? {
              business: input.siteIntelligence.business,
              editorial: input.siteIntelligence.editorial,
              evidence: input.siteIntelligence.evidence
            } : null
          )}`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "post_generation_evaluation",
          strict: true,
          schema: {
            type: "object",
            properties: {
              dimensions: {
                type: "object",
                properties: {
                  brandAlignment: { type: "number" },
                  objectiveAlignment: { type: "number" },
                  audienceRelevance: { type: "number" },
                  factuality: { type: "number" },
                  originality: { type: "number" },
                  clarity: { type: "number" },
                  platformFit: { type: "number" },
                  visualReadability: { type: "number" },
                  captionCoherence: { type: "number" },
                  layoutIntegrity: { type: "number" }
                },
                required: [
                  "brandAlignment",
                  "objectiveAlignment",
                  "audienceRelevance",
                  "factuality",
                  "originality",
                  "clarity",
                  "platformFit",
                  "visualReadability",
                  "captionCoherence",
                  "layoutIntegrity"
                ],
                additionalProperties: false
              },
              feedback: { type: "array", items: { type: "string" } }
            },
            required: ["dimensions", "feedback"],
            additionalProperties: false
          }
        }
      }
    });
    const content = response.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const parsed = JSON.parse(text);
    const dimensionKeys = [
      "brandAlignment",
      "objectiveAlignment",
      "audienceRelevance",
      "factuality",
      "originality",
      "clarity",
      "platformFit",
      "visualReadability",
      "captionCoherence",
      "layoutIntegrity"
    ];
    if (!parsed.dimensions || !dimensionKeys.every(
      (key) => typeof parsed.dimensions[key] === "number"
    ) || !Array.isArray(parsed.feedback)) {
      throw new Error("Judge response did not match evaluation schema");
    }
    return parsed;
  } catch (error) {
    console.warn("[postEvaluation] LLM judge unavailable:", error);
    return null;
  }
}
async function evaluateCandidates(input) {
  return Promise.all(
    input.candidates.map(async (candidate, index) => {
      const deterministic = deterministicEvaluation({
        candidate,
        allCandidates: input.candidates,
        strategy: input.strategies[index],
        siteIntelligence: input.siteIntelligence,
        platform: input.platform,
        originalityScore: input.originalityScores?.[index]
      });
      if (input.skipJudgeIndexes?.includes(index)) return deterministic;
      const judged = await llmEvaluation({
        candidate,
        strategy: input.strategies[index],
        siteIntelligence: input.siteIntelligence
      });
      if (!judged) return deterministic;
      const dimensions = Object.fromEntries(
        Object.keys(deterministic.dimensions).map(
          (key) => [
            key,
            clampScore(
              deterministic.dimensions[key] * 0.45 + judged.dimensions[key] * 0.55
            )
          ]
        )
      );
      return summarize(dimensions, judged.feedback.slice(0, 4));
    })
  );
}
function applyOriginalityToEvaluations(evaluations, originalityScores) {
  return evaluations.map((evaluation, index) => {
    const score = originalityScores[index];
    if (score === void 0 || !Number.isFinite(score)) return evaluation;
    const dimensions = {
      ...evaluation.dimensions,
      originality: clampScore(score)
    };
    return summarize(dimensions, evaluation.feedback);
  });
}

// server/ai/revisionValidation.ts
function validateRevisedCandidate(input) {
  const guardedCopy = applyDeterministicCopyGuards(input.candidate);
  const guardedBrand = input.siteIntelligence ? enforceBrandVisualGuardian(
    [guardedCopy],
    input.siteIntelligence,
    { enforcePalette: true, backgroundSnapTolerance: 40 }
  )[0] : guardedCopy;
  const tentativeSet = input.candidates.map(
    (candidate, index) => index === input.candidateIndex ? guardedBrand : candidate
  );
  const schemaValidation = validateVariationSet(tentativeSet, input.postMode);
  const errors = [...schemaValidation.errors];
  try {
    const snapshot = createPostVisualSnapshot(
      guardedBrand,
      guardedBrand.aspectRatio ?? "1:1"
    );
    const visualFit = validateVisualFit(snapshot);
    errors.push(
      ...visualFit.issues.map(
        (issue) => `variation ${input.candidateIndex + 1} ${issue.type}: ${issue.detail}`
      )
    );
  } catch (error) {
    errors.push(
      `variation ${input.candidateIndex + 1} could not produce a valid visual snapshot: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return { candidate: guardedBrand, errors: Array.from(new Set(errors)) };
}

// server/ai/llmJson.ts
function extractTextContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter(
      (part) => Boolean(part) && typeof part === "object" && "type" in part && part.type === "text" && "text" in part
    ).map((part) => part.text).join("\n");
  }
  return "";
}
function safeJsonParse(str, fallback) {
  let cleaned = str.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  const startIdx = cleaned.indexOf("{");
  const endIdx = cleaned.lastIndexOf("}");
  if (startIdx !== -1 && (endIdx === -1 || endIdx > startIdx)) {
    cleaned = cleaned.substring(startIdx, endIdx !== -1 ? endIdx + 1 : void 0);
  }
  const tryParse = (jsonStr) => {
    try {
      const repaired = jsonStr.replace(/,\s*([\]}])/g, "$1");
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  };
  let result = tryParse(cleaned);
  if (result) return result;
  console.warn("[safeJsonParse] Initial parse failed. Attempting heuristic repair...");
  let repairAttempt = cleaned;
  const stack2 = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < repairAttempt.length; i++) {
    const char = repairAttempt[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") stack2.push("{");
    else if (char === "[") stack2.push("[");
    else if (char === "}") stack2.pop();
    else if (char === "]") stack2.pop();
  }
  if (inString) {
    repairAttempt += '"';
  }
  while (stack2.length > 0) {
    const last = stack2.pop();
    if (last === "{") repairAttempt += "}";
    else if (last === "[") repairAttempt += "]";
  }
  result = tryParse(repairAttempt);
  if (result) {
    console.log("[safeJsonParse] Heuristic repair successful.");
    return result;
  }
  console.error("[safeJsonParse] Failed to parse JSON even after repair.");
  console.error("[safeJsonParse] Input snippet (100 chars):", str.substring(0, 100));
  return fallback;
}

// shared/typography/fontkitMeasurer.ts
import * as fontkit from "fontkit";

// shared/typography/fonts/registry.ts
import { existsSync as existsSync2 } from "node:fs";
import { dirname, join as join2 } from "node:path";
import { fileURLToPath } from "node:url";
var HERE = dirname(fileURLToPath(import.meta.url));
var FONT_DIR_CANDIDATES = [
  join2(HERE, "files"),
  join2(process.cwd(), "shared", "typography", "fonts", "files"),
  join2(process.cwd(), "api", "files")
];
var FONT_DIR = FONT_DIR_CANDIDATES.find((candidate) => existsSync2(candidate)) ?? FONT_DIR_CANDIDATES[0];
var TARGET_FONTS = [
  { family: "Fraunces", file: "fraunces.ttf", source: "postspark-next/packages/fonts/files" },
  { family: "Archivo", file: "archivo.ttf", source: "Google Fonts (OFL) \u2014 vari\xE1vel, eixos wdth+wght" },
  { family: "Bricolage Grotesque", file: "bricolage-grotesque.ttf", source: "Google Fonts (OFL) \u2014 vari\xE1vel, eixos wdth+opsz+wght" }
];
var BASELINE_FONTS = [
  { family: "Inter", file: "inter.ttf", source: "postspark-next/packages/fonts/files" },
  { family: "Space Grotesk", file: "space-grotesk.ttf", source: "postspark-next/packages/fonts/files" },
  { family: "Playfair Display", file: "playfair-display.ttf", source: "Google Fonts (OFL)" },
  { family: "Anton", file: "anton.ttf", source: "Google Fonts (OFL)" },
  { family: "Archivo Black", file: "archivo-black.ttf", source: "Google Fonts (OFL)" },
  { family: "Space Mono", file: "space-mono.ttf", source: "Google Fonts (OFL)" },
  { family: "Lora", file: "lora.ttf", source: "Google Fonts (OFL)" }
];
var ALL_FONTS = [...TARGET_FONTS, ...BASELINE_FONTS];
function entryFor(family) {
  return ALL_FONTS.find((f) => f.family.toLowerCase() === family.toLowerCase());
}
function pathFor(family) {
  const entry = entryFor(family);
  if (!entry) return void 0;
  const full = join2(FONT_DIR, entry.file);
  return existsSync2(full) ? full : void 0;
}
function checkAvailability(entries = ALL_FONTS) {
  const present = [];
  const missing = [];
  for (const entry of entries) {
    (existsSync2(join2(FONT_DIR, entry.file)) ? present : missing).push(entry);
  }
  return { present, missing };
}

// shared/typography/wrap.ts
function greedyWrap(text, widthOf2, style, maxWidth) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines = [];
  const overflowingWords = [];
  let current = "";
  for (const word of words) {
    if (widthOf2(word, style) > maxWidth) overflowingWords.push(word);
    const candidate = current ? `${current} ${word}` : word;
    if (current && widthOf2(candidate, style) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  const widestLine = lines.reduce((max, line) => Math.max(max, widthOf2(line, style)), 0);
  return { lines, widestLine, overflowingWords };
}
function greedyLinesHeight(lineCount, style) {
  return lineCount * style.fontSize * style.lineHeight;
}

// shared/typography/fontkitMeasurer.ts
var cache = /* @__PURE__ */ new Map();
function loadFont(style) {
  const axisKey = style.axes ? Object.entries(style.axes).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(",") : "";
  const key = `${style.fontFamily}|${axisKey}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const file = pathFor(style.fontFamily);
  if (!file) {
    throw new MissingFontError(
      style.fontFamily,
      `Coloque o .ttf vari\xE1vel em harness/fonts/files/ e registre em harness/fonts/registry.ts.`
    );
  }
  let font = fontkit.openSync(file);
  if (typeof font.layout !== "function") {
    throw new MissingFontError(
      style.fontFamily,
      `O arquivo em ${file} n\xE3o \xE9 uma fonte simples utiliz\xE1vel (talvez seja uma cole\xE7\xE3o .ttc).`
    );
  }
  if (style.axes && font.getVariation && font.variationAxes) {
    const known = Object.keys(font.variationAxes);
    const applicable = {};
    for (const [axis, value] of Object.entries(style.axes)) {
      if (known.includes(axis)) applicable[axis] = value;
    }
    if (Object.keys(applicable).length > 0) {
      font = font.getVariation(applicable);
    }
  }
  cache.set(key, font);
  return font;
}
function applyTransform(text, style) {
  return style.textTransform === "uppercase" ? text.toLocaleUpperCase("pt-BR") : text;
}
function widthOf(text, style) {
  if (text.length === 0) return 0;
  const font = loadFont(style);
  const run = font.layout(applyTransform(text, style));
  return run.advanceWidth / font.unitsPerEm * style.fontSize;
}
var fontkitMeasurer = {
  id: "fontkit",
  supports(fontFamily) {
    return pathFor(fontFamily) !== void 0;
  },
  measureWidth(text, style) {
    return widthOf(text, style);
  },
  /**
   * Quebra gulosa por palavra — delegada a `shared/typography/wrap.ts` para
   * que o medidor browser (canvas) produza as MESMAS linhas (CR-002). Não
   * implementa hifenização nem quebra dentro de palavra: uma palavra que não
   * cabe é reportada em `overflowingWords`.
   */
  wrapText(text, style, maxWidth) {
    return greedyWrap(text, widthOf, style, maxWidth);
  },
  linesHeight(lineCount, style) {
    return greedyLinesHeight(lineCount, style);
  }
};

// server/ai/generationOrchestrator.ts
setTypographyMeasurer(fontkitMeasurer);
function cleanAIFillerFromCaption(caption) {
  if (!caption) return "";
  let text = caption;
  const aiPhrases = [
    /(\n*|\s*)(espero que (essas dicas|este conteúdo|este post|isso) (te |lhe )?ajude.*)/gi,
    /(\n*|\s*)(se precisar de mais (dicas|informações|ajuda|conteúdo|estratégias).*)/gi,
    /(\n*|\s*)(estou (sempre )?aqui para (ajudar|o que precisar|tirar dúvidas).*)/gi,
    /(\n*|\s*)(qualquer dúvida(,| )*(estou à disposição|conte comigo|deixe nos comentários|é só chamar).*)/gi,
    /(\n*|\s*)(se tiver (alguma )?dúvida(,| )*(estou à disposição|deixe abaixo|me chame).*)/gi,
    /(\n*|\s*)(vamos juntos nessa jornada.*)/gi,
    /(\n*|\s*)(não se esqueça de salvar e me dizer o que achou.*)/gi,
    /^(aqui está (uma|a|o) (estratégia|post|legenda|conteúdo|opção).*:\s*)/gi,
    /^(neste post (vamos|eu vou|você vai) (ver|aprender|descobrir).*:\s*)/gi
  ];
  for (const pattern of aiPhrases) {
    text = text.replace(pattern, "");
  }
  return text.trim();
}
function createMetrics(deadlineMs, now) {
  return {
    startedAt: now,
    generativeCalls: 0,
    repairCalls: 0,
    evaluationCalls: 0,
    embeddingCalls: 0,
    transportRetries: 0,
    fallbacks: [],
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    deadlineMs,
    exceededDeadline: false
  };
}
function addCallMetrics(metrics, result) {
  metrics.promptTokens += result.usage?.prompt_tokens ?? 0;
  metrics.completionTokens += result.usage?.completion_tokens ?? 0;
  metrics.totalTokens += result.usage?.total_tokens ?? 0;
  metrics.estimatedCostUsd += result.usage?.cost ?? 0;
}
function finishMetrics(metrics, now) {
  const finishedAt = now;
  return {
    ...metrics,
    finishedAt,
    durationMs: finishedAt - metrics.startedAt
  };
}
var CAPTION_MIN_LENGTH = 40;
function buildExecutionBriefContext(brief) {
  const slidesBlock = brief.slides.length > 0 ? brief.slides.map(
    (slide) => `Slide ${slide.slideNumber} [${slide.role || "custom"}${slide.locked ? ", travado" : ""}]: ${slide.rawText}`
  ).join("\n") : "Nenhum slide estruturado foi fornecido.";
  const brandBlock = brief.brandInput ? [
    `- Site: ${brief.brandInput.websiteUrl || "n\xE3o informado"}`,
    `- Refer\xEAncia visual: ${brief.brandInput.referenceImageUrl || "n\xE3o informada"}`,
    `- Cores: ${brief.brandInput.brandColors?.join(", ") || "n\xE3o informadas"}`,
    `- Fonte sugerida: ${brief.brandInput.fontHint || "n\xE3o informada"}`,
    `- Modo de adapta\xE7\xE3o: ${brief.brandInput.adaptationMode}`
  ].join("\n") : "- Nenhuma identidade visual estruturada foi enviada.";
  const mustKeepBlock = brief.mustKeep.length > 0 ? brief.mustKeep.join(" | ") : "nenhum";
  const mustIncludeBlock = brief.mustInclude.length > 0 ? brief.mustInclude.join(" | ") : "nenhum";
  const forbiddenBlock = brief.forbiddenTerms.length > 0 ? brief.forbiddenTerms.join(" | ") : "nenhum";
  return `BRIEFING DE EXECU\xC7\xC3O:
- Formato: ${brief.format}
- Plataforma: ${brief.platform}
- Objetivo: ${brief.objective}
- Tom desejado: ${brief.tone || "n\xE3o informado"}
- CTA obrigat\xF3rio: ${brief.callToAction || "n\xE3o informado"}
- N\xEDvel de interven\xE7\xE3o: ${brief.interventionLevel}
- Tipo de insumo: ${brief.contentSourceType}

CONTE\xDADO BRUTO:
${brief.rawInput}

SLIDES FORNECIDOS:
${slidesBlock}

ITENS QUE DEVEM SER PRESERVADOS:
${mustKeepBlock}

ITENS QUE DEVEM APARECER:
${mustIncludeBlock}

TERMOS PROIBIDOS:
${forbiddenBlock}

IDENTIDADE VISUAL:
${brandBlock}

OBSERVA\xC7\xD5ES:
${brief.notes || "nenhuma"}`;
}
function buildGenerationInstructionCore(input) {
  const { isCarousel, executionBrief } = input;
  const modeInstruction = executionBrief ? isCarousel ? `
IMPORTANTE: Gere conte\xFAdo para um CARROSSEL de execu\xE7\xE3o guiada. Cada varia\xE7\xE3o DEVE ter exatamente 5 slides organizados em "slides". Preserve a estrutura fornecida pelo usu\xE1rio sempre que ela existir. Slide 1 = gancho, slides 2-4 = desenvolvimento, slide 5 = CTA final. N\xE3o coloque CTA nos slides 1-4.` : "\nIMPORTANTE: Gere uma pe\xE7a de execu\xE7\xE3o guiada, fiel ao briefing, com baixa dist\xE2ncia entre as varia\xE7\xF5es." : isCarousel ? `
IMPORTANTE: Gere conte\xFAdo para um CARROSSEL (m\xFAltiplos slides). Cada varia\xE7\xE3o DEVE ter exatamente 5 slides organizados em um array "slides". N\xE3o retorne array vazio, parcial ou simplificado. Estrutura obrigat\xF3ria do carrossel: slide 1 = gancho forte e altamente curioso para fazer a pessoa folhear; slides 2, 3 e 4 = desenvolvimento progressivo do tema; slide 5 = CTA final, e somente ele deve conter call-to-action. N\xE3o coloque CTA nos slides 1-4. Cada slide deve ter: headline (t\xEDtulo curto m\xE1x 50 caracteres), body (mensagem m\xE1x 80 caracteres), slideNumber (1-5), isTitleSlide (true apenas no slide 1), isCtaSlide (true apenas no slide 5). O headline/body de n\xEDvel superior s\xE3o apenas um resumo do carrossel; o conte\xFAdo principal vive nos slides.` : "\nGere posts individuais (est\xE1tico).";
  const executionSystemContext = executionBrief ? `
MODO DE EXECU\xC7\xC3O ATIVADO:
- Voc\xEA N\xC3O est\xE1 criando do zero. Voc\xEA est\xE1 executando um briefing.
- Preserve a inten\xE7\xE3o, a estrutura, o CTA e os termos obrigat\xF3rios enviados pelo usu\xE1rio.
- Se houver slides fornecidos, trate-os como material fonte priorit\xE1rio.
- N\xE3o reescreva agressivamente sem necessidade.
- O n\xEDvel de interven\xE7\xE3o permitido \xE9: ${executionBrief.interventionLevel}.
- Gere EXATAMENTE ${POST_VARIATION_TARGET} varia\xE7\xF5es pr\xF3ximas entre si. Varie principalmente acabamento visual, microcopy e hierarquia, n\xE3o o conceito central.
- Se o n\xEDvel for "visual_only", mantenha o texto quase intacto.
- Se o n\xEDvel for "light_optimize", melhore clareza, ritmo e impacto sem alterar a estrutura principal.
- Se o n\xEDvel for "optimize_structure", voc\xEA pode reorganizar trechos, mas sem trair a mensagem central.
` : "";
  const copyRules = `
CAT\xC1LOGO DOS 8 ARQU\xC9TIPOS VISUAIS DISPON\xCDVEIS (SELE\xC7\xC3O INTELIGENTE):
Para cada uma das 3 varia\xE7\xF5es geradas, selecione no campo "familyId" o arqu\xE9tipo que melhor traduza a psicologia e nicho do post.
\u26A0\uFE0F REGRA OBRIGAT\xD3RIA: As 3 varia\xE7\xF5es DEVEM usar 3 "familyId" TOTALMENTE DIFERENTES entre si (nunca repita a mesma fam\xEDlia no mesmo conjunto de 3).

1. "editorial-poster" \u2794 Luxo, consultoria, moda, gastronomia, finan\xE7as. (Serifas elegantes, Playfair Display, aspas decorativas).
2. "glass-veil" \u2794 Inova\xE7\xE3o, SaaS, tecnologia, modernidade. (Cart\xE3o transl\xFAcido flutuante de vidro fosco com borda iluminada).
3. "chromatic-block" \u2794 Impacto direto, marketing de resposta r\xE1pida, varejo, not\xEDcias urgentes. (Sticker angular rotacionado, Anton massiva).
4. "brutal-split" \u2794 Alto contraste, educa\xE7\xE3o, compara\xE7\xF5es 'antes/depois', hacks de produtividade. (Divis\xE3o 50/50 em duas cores puras com selo central).
5. "stroke-impact" \u2794 Lifestyle, fitness, m\xFAsica, moda streetwear, eventos. (T\xEDtulos com palavras vazadas em contorno stroke outline).
6. "cyber-glitch" \u2794 Cripto, intelig\xEAncia artificial, desenvolvimento, seguran\xE7a, futuro. (Miras t\xE1ticas +, scanlines, est\xE9tica terminal).
7. "cinematic-depth" \u2794 Narrativas profundas, cinema, cultura, storytelling denso. (Tipografia monumental condensada em camadas).
8. "duotone-wash" \u2794 Criatividade, design, psicologia, autoridade suave. (Gradiente diagonal a 135\xB0 com composi\xE7\xE3o limpa).

DIRETRIZES DE COPYWRITING AUTORAL DE ALTO PADR\xC3O (ZERO V\xCDCIOS DE IA):

1. PERSONA E VOZ:
   - Escreva SEMPRE na voz do CRIADOR / FUNDADOR / MARCA DE ALTO VALOR falando diretamente com seu cliente ideal.
   - O tom deve ser deliberado, autoral, assertivo e sofisticado.

2. PROIBI\xC7\xD5ES ABSOLUTAS (V\xCDCIOS DE CHATBOT / IA):
   - \u{1F6AB} PROIBIDO tom de assistente virtual ("Se precisar de mais dicas estou aqui", "Espero que ajude", "Se tiver d\xFAvidas estou \xE0 disposi\xE7\xE3o", "Conte comigo", "Aqui est\xE3o algumas dicas").
   - \u{1F6AB} PROIBIDO clich\xEAs batidos ("No mundo acelerado de hoje", "Em tempos de constante mudan\xE7a", "Voc\xEA sabia?", "Fica a dica", "Arrasta pro lado").
   - \u{1F6AB} PROIBIDO pre\xE2mbulos conversacionais ("Neste post eu vou te mostrar", "Hoje eu trouxe uma reflex\xE3o"). V\xE1 direto ao ponto!

3. REGRAS POR CAMPO:
   - Headline: m\xE1ximo 60 caracteres. T\xEDtulo forte, conciso e magn\xE9tico. Sem ponto final. Sem retic\xEAncias soltas.
   - Body: m\xE1ximo 2 frases curtas (m\xE1x 100 caracteres). Complementa o headline com precis\xE3o.
   - Caption/Legenda: Legenda completa pronta para publica\xE7\xE3o no Instagram/LinkedIn com formata\xE7\xE3o e respiros reais:
     \u2022 Gancho de abertura provocativo que expande o t\xEDtulo;
     \u2022 Conflito / Causa raiz da dor do p\xFAblico;
     \u2022 2 ou 3 t\xF3picos estrat\xE9gicos com quebras de linha duplas;
     \u2022 CTA natural e maduro (ex: "Qual \xE9 o posicionamento que a sua marca quer consolidar?", "Salve este post para consultar no seu pr\xF3ximo planejamento estrat\xE9gico.").
   - NUNCA coloque hashtags ou emojis dentro do headline ou body.
   - Hashtags: m\xE1ximo 4, somente no campo separado "hashtags".
   - CallToAction: m\xE1ximo 40 caracteres com verbo de a\xE7\xE3o direto.
   - As 3 varia\xE7\xF5es DEVEM explorar 3 \xE2ngulos psicol\xF3gicos distintos (ex: 1. Pergunta/Quebra de padr\xE3o, 2. Diagn\xF3stico/Choque, 3. Princ\xEDpio de Autoridade).

PRINC\xCDPIOS DE DESIGN VISUAL E MIMETISMO:

1. HIERARQUIA VISUAL (Propor\xE7\xE3o 3:2:1):
   - O headline deve ser a informa\xE7\xE3o MAIS impactante (peso visual m\xE1ximo).
   - O body deve complementar, nunca competir com o headline.

2. LAYOUT INTELIGENTE por objetivo do post:
   - "centered": Inspira\xE7\xE3o, emo\xE7\xE3o, celebra\xE7\xE3o, cita\xE7\xF5es. Melhor em 1:1.
   - "left-aligned": Educa\xE7\xE3o, listas, tutoriais. Melhor em 5:6 e 9:16.
   - "split": Promo\xE7\xF5es, impacto. Vers\xE1til.
   - "minimal": Ultra-limpo, essencial. Para marcas focadas no white-space.

3. PSICOLOGIA E CLONAGEM DE CORES:
   - SE houver [INSTRU\xC7\xD5ES DE CLONAGEM DE MARCA] no prompt, AS CORES S\xC3O MANDAT\xD3RIAS. Mimetize a "Alma" injetando backgroundColor e textColor apenas baseados na Extra\xE7\xE3o Fornecida.
   - SE N\xC3O houver extra\xE7\xE3o, use a psicologia cl\xE1ssica: backgroundColor neutro escuro/azul para tom Corporativo, cores quentes para Criativo, etc.

4. CONTRASTE (WCAG 2.1):
   - SEMPRE garanta contraste alto: fundo escuro \u2192 textColor claro (#FFFFFF). Fundo claro \u2192 textColor escuro (#1A1A1A).
   - NUNCA use texto cinza m\xE9dio sobre fundo cinza m\xE9dio.

5. TEMPLATES ESTRUTURADOS:
   - Use 'simple' quando headline e body forem suficientes. N\xE3o invente se\xE7\xF5es apenas para preencher o layout.
   - Use 'feature-grid', 'numbered-list' ou 'step-by-step' somente quando a mensagem realmente exigir itens distintos.
   - Todo template estruturado deve ter EXATAMENTE 3 se\xE7\xF5es. Nunca gere 4 ou 5 itens em um \xFAnico post est\xE1tico.
   - Se o headline promete quantidade de itens, esse numero DEVE ser 3. Ex.: "3 sinais", "3 criterios". Se a ideia tem 5, 7 ou 10 itens, escolha carrossel ou reformule sem numero.
   - Cada label deve ter no m\xE1ximo 24 caracteres e cada description no m\xE1ximo 36 caracteres.
   - Resuma cada item em uma \xFAnica ideia. N\xE3o repita no item o que j\xE1 est\xE1 no headline ou body.
   - Sections sao micro-blocos visuais, nao paragrafos. Prefira substantivos claros e descricoes telegraficas.

Responda APENAS com JSON v\xE1lido.`;
  return `${modeInstruction}
${executionBrief ? `As ${POST_VARIATION_TARGET} varia\xE7\xF5es devem ser pr\xF3ximas entre si e altamente fi\xE9is ao briefing.` : `Cada varia\xE7\xE3o deve ter um tom diferente: 1) Profissional/Corporativo, 2) Casual/Engajador, 3) Criativo/Ousado.`}${input.toneHint}
${input.brandDnaContext}
${executionSystemContext}
${input.promptContext}
${copyRules}`;
}
function buildSystemPrompt(input) {
  const core = buildGenerationInstructionCore({
    isCarousel: input.isCarousel,
    executionBrief: input.executionBrief,
    toneHint: input.toneHint,
    brandDnaContext: input.brandDnaContext,
    promptContext: input.promptContext
  });
  return `Voc\xEA \xE9 um especialista em marketing digital, design visual e cria\xE7\xE3o de conte\xFAdo para redes sociais.
Gere EXATAMENTE ${POST_VARIATION_TARGET} varia\xE7\xF5es de post para ${input.platformLabel}.
${core}`;
}
function buildUserPrompt(input) {
  const userPrompt = input.executionBrief ? `Execute este briefing com fidelidade. Otimize apenas no grau permitido.

${buildExecutionBriefContext(input.executionBrief)}` : input.request.inputType === "image" ? `Crie posts baseados nesta imagem: ${input.request.imageUrl || input.request.content}` : `Crie posts baseados neste conte\xFAdo: ${input.contextContent}`;
  if (input.request.inputType === "image") {
    const imageUrl = input.request.imageUrl;
    const isValidImageUrl = typeof imageUrl === "string" && /^(https?:\/\/|data:image\/)/i.test(imageUrl.trim());
    if (isValidImageUrl) {
      return {
        content: [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: imageUrl.trim(), detail: "high" } }
        ]
      };
    }
    return { content: userPrompt };
  }
  return { content: userPrompt };
}
function formatOptimizationSchema() {
  return {
    type: "object",
    properties: {
      layout: { type: "string", enum: ["centered", "left-aligned", "split", "minimal"] },
      backgroundColor: { type: "string" },
      textColor: { type: "string" },
      accentColor: { type: "string" }
    },
    required: ["layout", "backgroundColor", "textColor", "accentColor"],
    additionalProperties: false
  };
}
function variationSchema(isCarousel) {
  const commonProperties = {
    headline: { type: "string", description: "T\xEDtulo principal do post" },
    body: { type: "string", description: "Corpo principal do post" },
    hashtags: {
      type: "array",
      items: { type: "string" },
      description: "Hashtags relevantes"
    },
    callToAction: {
      type: "string",
      description: "Call to action final"
    },
    caption: {
      type: "string",
      description: "Legenda final do post, coerente com o conte\xFAdo visual."
    },
    tone: { type: "string", description: "Tom do post" },
    imagePrompt: {
      type: "string",
      description: "Prompt em ingl\xEAs para gerar imagem de fundo do post. Deve ser visual, art\xEDstico e relevante ao conte\xFAdo."
    },
    backgroundColor: { type: "string", description: "Cor de fundo hex" },
    textColor: { type: "string", description: "Cor do texto hex" },
    accentColor: { type: "string", description: "Cor de destaque hex" },
    layout: {
      type: "string",
      enum: ["centered", "left-aligned", "split", "minimal"],
      description: "Layout sugerido"
    },
    aspectRatio: {
      type: "string",
      enum: ["1:1", "5:6", "9:16"],
      description: "Propor\xE7\xE3o de aspecto: 1:1 quadrado, 5:6 retrato, 9:16 story/reels \u2014 varie entre as varia\xE7\xF5es para oferecer diversidade"
    },
    template: {
      type: "string",
      enum: ["simple", "feature-grid", "numbered-list", "step-by-step"],
      description: "Template de conte\xFAdo estruturado. Use 'simple' para mensagens \xFAnicas, outros para conte\xFAdo rico."
    },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          icon: { type: "string", description: "Nome de \xEDcone lucide (ex: Users, Star, Zap, Heart, Globe)" },
          label: { type: "string", maxLength: 24, description: "T\xEDtulo curto da se\xE7\xE3o, m\xE1ximo 24 caracteres" },
          description: { type: "string", maxLength: 36, description: "Texto de suporte opcional, m\xE1ximo 36 caracteres" },
          number: { type: "integer", description: "N\xFAmero para listas numeradas" }
        },
        required: ["icon", "label", "description", "number"],
        additionalProperties: false
      },
      maxItems: 3,
      description: "Use [] para template simple. Para templates estruturados, gere exatamente 3 itens curtos."
    },
    aspectRatioOptimizations: {
      type: "object",
      properties: {
        "1:1": { $ref: "#/$defs/formatOptimization" },
        "5:6": { $ref: "#/$defs/formatOptimization" },
        "9:16": { $ref: "#/$defs/formatOptimization" }
      },
      required: ["1:1", "5:6", "9:16"],
      additionalProperties: false
    },
    // `badge`/`stickerText` NÃO são gerados pelo LLM: são ornamentos visuais,
    // não estratégia de copy. Gerados aqui, o modelo só tinha acesso à copy
    // que ele mesmo acabou de escrever e ecoava uma palavra dela (headline
    // "…com confiança" → badge "Confiança"), somando zero informação e uma
    // camada de texto a mais no card. A identidade de marca real é
    // `brandMeta` (logo + brandName, via BrandOverlay); o selo avulso continua
    // disponível como entrada MANUAL no Workbench (FontColorBlock/CopyEditorPanel).
    copyAngle: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["dor", "beneficio", "objecao", "autoridade", "escassez", "storytelling", "mito_vs_verdade"]
        },
        label: { type: "string" }
      },
      required: ["type", "label"],
      additionalProperties: false
    }
  };
  if (isCarousel) {
    return {
      type: "object",
      properties: {
        ...commonProperties,
        slides: {
          type: "array",
          items: {
            type: "object",
            properties: {
              headline: { type: "string", description: "T\xEDtulo do slide" },
              body: { type: "string", description: "Conte\xFAdo do slide" },
              slideNumber: { type: "integer", description: "N\xFAmero do slide (1-5)" },
              isTitleSlide: { type: "boolean", description: "Se \xE9 o primeiro slide" },
              isCtaSlide: { type: "boolean", description: "Se \xE9 o \xFAltimo slide" }
            },
            required: ["headline", "body", "slideNumber", "isTitleSlide", "isCtaSlide"],
            additionalProperties: false
          },
          minItems: CAROUSEL_SLIDE_TARGET,
          maxItems: CAROUSEL_SLIDE_TARGET,
          description: "Slides do carrossel (5 itens)"
        }
      },
      required: [
        "headline",
        "body",
        "hashtags",
        "callToAction",
        "caption",
        "tone",
        "imagePrompt",
        "backgroundColor",
        "textColor",
        "accentColor",
        "layout",
        "aspectRatio",
        "template",
        "sections",
        "slides",
        "aspectRatioOptimizations",
        "copyAngle"
      ],
      additionalProperties: false
    };
  }
  return {
    type: "object",
    properties: {
      ...commonProperties,
      sections: commonProperties.sections
    },
    required: [
      "headline",
      "body",
      "hashtags",
      "callToAction",
      "caption",
      "tone",
      "imagePrompt",
      "backgroundColor",
      "textColor",
      "accentColor",
      "layout",
      "aspectRatio",
      "template",
      "sections",
      "aspectRatioOptimizations",
      "copyAngle"
    ],
    additionalProperties: false
  };
}
function buildVariationsSchema(isCarousel, count, schemaName) {
  return {
    type: "json_schema",
    json_schema: {
      name: schemaName,
      strict: true,
      schema: {
        type: "object",
        properties: {
          variations: {
            type: "array",
            minItems: count,
            maxItems: count,
            items: variationSchema(isCarousel)
          }
        },
        required: ["variations"],
        $defs: {
          formatOptimization: formatOptimizationSchema()
        },
        additionalProperties: false
      }
    }
  };
}
function stripUnsupportedControlChars(value) {
  if (typeof value === "string") {
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripUnsupportedControlChars(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, stripUnsupportedControlChars(item)])
    );
  }
  return value;
}
function collectSlotIssues(variation, isCarousel, index) {
  if (!variation) {
    return [`slot ${index + 1} ausente na resposta do modelo`];
  }
  const issues = [];
  if (!hasRequiredCopy(variation)) {
    issues.push(`slot ${index + 1} com copy obrigat\xF3rio incompleto (headline, body, caption, CTA ou imagePrompt)`);
  }
  if (!variation.copyAngle?.type || !variation.copyAngle.label) {
    issues.push(`slot ${index + 1} sem copyAngle completo`);
  }
  if (!isCarousel) {
    if (!hasValidStaticSections(variation)) {
      issues.push(`slot ${index + 1} com sections inv\xE1lidas (simple sem se\xE7\xF5es ou estruturado com exatamente 3)`);
    }
    if (!hasCoherentStaticItemCount(variation)) {
      issues.push(`slot ${index + 1} com contagem de itens incoerente entre headline e sections`);
    }
  }
  if (isCarousel && (variation.slides?.length ?? 0) !== CAROUSEL_SLIDE_TARGET) {
    issues.push(`slot ${index + 1} com ${variation.slides?.length ?? 0} slides (esperado ${CAROUSEL_SLIDE_TARGET})`);
  }
  return issues;
}
function normalizeCarouselSlides(variation) {
  const rawSlides = Array.isArray(variation?.slides) ? variation.slides : [];
  const normalized = rawSlides.filter(Boolean).slice(0, CAROUSEL_SLIDE_TARGET).map((slide, index) => ({
    headline: String(slide?.headline || variation?.headline || `Slide ${index + 1}`),
    body: String(slide?.body || variation?.body || ""),
    slideNumber: index + 1,
    isTitleSlide: index === 0,
    isCtaSlide: index === CAROUSEL_SLIDE_TARGET - 1
  }));
  if (normalized.length === CAROUSEL_SLIDE_TARGET) {
    return normalized;
  }
  return buildFallbackCarouselSlides(variation);
}
function buildFallbackCarouselSlides(variation) {
  const baseHeadline = String(variation?.headline || "Resumo");
  const baseBody = String(variation?.body || "").trim();
  const callToAction = String(variation?.callToAction || "Saiba mais").trim();
  const bodyParts = baseBody.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
  const fallbackBodies = [
    baseBody || "Entenda o contexto desta ideia.",
    bodyParts[0] || baseBody || "Veja por que isso importa agora.",
    bodyParts[1] || bodyParts[0] || "Descubra o principal benef\xEDcio desta proposta.",
    bodyParts[2] || bodyParts[1] || "Veja como aplicar isso no dia a dia.",
    callToAction || "D\xEA o pr\xF3ximo passo com seguran\xE7a."
  ];
  const fallbackHeadlines = [baseHeadline, "O problema", "O que muda", "Na pr\xE1tica", callToAction || "Pr\xF3ximo passo"];
  return fallbackHeadlines.map((headline, index) => ({
    headline,
    body: fallbackBodies[index],
    slideNumber: index + 1,
    isTitleSlide: index === 0,
    isCtaSlide: index === CAROUSEL_SLIDE_TARGET - 1
  }));
}
function buildRepairPrompt(input) {
  const reasons = input.targets.map((slotIndex) => {
    const structural = input.issuesBySlot.get(slotIndex) ?? [];
    const quality = input.qualityFeedbackBySlot.get(slotIndex) ?? [];
    const allReasons = [...structural, ...quality];
    const current = input.variations[slotIndex] ? JSON.stringify(input.variations[slotIndex], null, 2) : "(slot ausente)";
    return `SLOT ${slotIndex + 1}:
- Motivos da rejei\xE7\xE3o: ${allReasons.length > 0 ? allReasons.join("; ") : "falha na valida\xE7\xE3o de qualidade"}
- Conte\xFAdo atual: ${current}`;
  }).join("\n\n");
  const diversityDirective = input.diversityDirective ? `
DIVERSIDADE: o conjunto ficou parecido demais. Reescreva os slots listados para que fiquem nitidamente distintos entre si:
- N\xE3o repita headline, body, CTA, hashtags, copyAngle, nem a mesma combina\xE7\xE3o de layout + paleta.
- Garanta pelo menos 2 layouts diferentes no conjunto final.
- Garanta \xE2ngulos de copy diferentes e facilmente distingu\xEDveis.
${input.isCarousel ? "- Preserve exatamente 5 slides por varia\xE7\xE3o de carrossel, com narrativa completa." : ""}` : "";
  const brandContext = input.siteIntelligence ? `REGRA DE MARCA: respeite a identidade visual extra\xEDda (cores, paleta e WCAG) j\xE1 aplicada.` : "";
  const userContent = `Voc\xEA recebeu ${input.targets.length} varia\xE7\xE3o(\xF5es) rejeitada(s) de um conjunto de ${POST_VARIATION_TARGET} varia\xE7\xF5es do mesmo post.

${input.executionBrief ? `Execute este briefing com fidelidade. Otimize apenas no grau permitido.

${buildExecutionBriefContext(input.executionBrief)}` : `Tema: ${input.contextContent.slice(0, 3e3)}`}

SLOTS REJEITADOS (reescreva SOMENTE estes):
${reasons}
${diversityDirective}
${brandContext}

REGRAS:
- Responda com um objeto "variations" contendo EXATAMENTE ${input.targets.length} item(ns), na ordem dos slots listados acima.
- Mantenha o mesmo schema e o tema central; n\xE3o altere slots que n\xE3o foram listados.
- Preencha todos os campos obrigat\xF3rios.
- Responda APENAS com JSON v\xE1lido.`;
  return userContent;
}
function parseMainResponse(content) {
  const parsed = safeJsonParse(content, { variations: [] });
  const raw = Array.isArray(parsed.variations) ? parsed.variations : [];
  return raw.slice(0, POST_VARIATION_TARGET).map((item) => item && typeof item === "object" ? item : null).concat(Array.from({ length: Math.max(0, POST_VARIATION_TARGET - raw.length) }, () => null));
}
function applyBrandGuardian(variations, siteIntelligence) {
  if (!siteIntelligence) return variations;
  try {
    const beforeCount = variations.length;
    const guarded = enforceBrandVisualGuardian(
      variations,
      siteIntelligence,
      { enforcePalette: true, backgroundSnapTolerance: 40 }
    );
    return guarded.length === beforeCount ? guarded : variations;
  } catch (error) {
    console.warn("[Brand Guardian] Failing gracefully. Returning raw variations.", error);
    return variations;
  }
}
function buildComposition(input) {
  const chameleonDesignTokens = input.siteIntelligence ? siteIntelligenceToDesignTokens(input.siteIntelligence) : void 0;
  const executionBrief = input.request.creationMode === "execution" ? input.executionBrief : null;
  return input.variations.map((variation, index) => {
    const normalizedSlides = input.isCarousel ? normalizeCarouselSlides(variation) : void 0;
    const baseVar = {
      id: `var-${input.clock()}-${index}`,
      ...variation,
      caption: cleanAIFillerFromCaption(variation.caption || ""),
      // Ornamentos nascem VAZIOS e o render já é silencioso com string vazia
      // (`renderTopBar`/`renderBottomBar` em PostCardV2). O usuário preenche
      // manualmente no Workbench quando quiser um selo.
      ...variation.copyAngle ? {
        copyAngle: {
          ...variation.copyAngle,
          badge: variation.copyAngle.badge ?? "",
          stickerText: variation.copyAngle.stickerText ?? ""
        }
      } : {},
      platform: input.request.platform,
      hashtags: variation.hashtags || [],
      postMode: input.request.postMode,
      slides: normalizedSlides,
      ...chameleonDesignTokens ? { designTokens: chameleonDesignTokens } : {},
      generationMeta: {
        creationMode: input.request.creationMode,
        fidelity: executionBrief ? "high" : "medium",
        interventionLevel: executionBrief?.interventionLevel,
        siteIntelligenceId: input.siteIntelligence?.id,
        strategyId: input.plan.strategies.selected[index]?.id,
        revisionCount: input.revisionCount,
        revisionApplied: input.revisedIndexes.includes(index),
        revisionFailed: input.revisionFailedIndexes.includes(index),
        evaluation: input.evaluations[index],
        originality: input.originality.assessments[index]
      }
    };
    return baseVar;
  });
}
async function generatePostVariations(input, deps) {
  const metrics = createMetrics(input.deadlineMs, deps.clock());
  const { request, siteIntelligence, executionBrief, plan } = input;
  const isCarousel = request.postMode === "carousel";
  const platformSpecs = {
    instagram: { label: "Instagram" },
    twitter: { label: "Twitter/X" },
    linkedin: { label: "LinkedIn" },
    facebook: { label: "Facebook" }
  };
  const spec = platformSpecs[request.platform];
  const effectiveTone = executionBrief?.tone || request.tone;
  const toneHint = effectiveTone ? `
Tom detectado no input do usu\xE1rio: "${effectiveTone}" \u2014 calibre o conte\xFAdo gerado para esse estado emocional.
` : "";
  const brandDnaContext = siteIntelligence ? siteIntelligenceToPrompt(siteIntelligence) : "";
  const contextContent = request.content;
  const deadlineExceeded = () => {
    if (input.deadlineMs === null) return false;
    const exceeded = deps.clock() > input.deadlineMs;
    if (exceeded) metrics.exceededDeadline = true;
    return exceeded;
  };
  const recordEvent = (stage, status, detail, data) => {
    deps.trace.recordEvent({ stage, status, detail, data });
  };
  recordEvent("orchestrator", "started", `Orchestrating ${request.postMode} generation (${request.creationMode}).`);
  if (input.plan.strategies.fallbackUsed) {
    metrics.fallbacks.push("strategy_deterministic");
  }
  try {
    if (deadlineExceeded()) {
      return { status: "failed", runId: deps.trace.id, error: { kind: "deadline", message: "Deadline excedido antes da chamada principal." }, metrics: finishMetrics(metrics, deps.clock()) };
    }
    const systemPrompt = buildSystemPrompt({
      platformLabel: spec.label,
      isCarousel,
      executionBrief,
      toneHint,
      brandDnaContext,
      promptContext: plan.promptContext
    });
    const { content: userContent } = buildUserPrompt({ request, executionBrief, contextContent });
    let mainResponse;
    try {
      mainResponse = await deps.generate({
        traceLabel: "post_generation",
        taskRoute: isCarousel ? "carousel_generation" : "static_generation",
        model: request.model,
        maxCompletionTokens: isCarousel ? 12e3 : 9e3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        response_format: buildVariationsSchema(isCarousel, POST_VARIATION_TARGET, "post_variations")
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordEvent("post_generation", "failed", `Main generation call failed: ${message}`);
      return { status: "failed", runId: deps.trace.id, error: { kind: "provider", message, cause: error }, metrics: finishMetrics(metrics, deps.clock()) };
    }
    metrics.generativeCalls += 1;
    addCallMetrics(metrics, mainResponse);
    if (deadlineExceeded()) {
      return { status: "failed", runId: deps.trace.id, error: { kind: "deadline", message: "Deadline excedido ap\xF3s a chamada principal." }, metrics: finishMetrics(metrics, deps.clock()) };
    }
    const content = extractTextContent(mainResponse.choices[0]?.message?.content);
    let variations = parseMainResponse(content);
    variations = variations.map(
      (variation) => variation ? stripUnsupportedControlChars(variation) : null
    );
    if (variations.every((variation) => variation === null)) {
      recordEvent("post_generation", "failed", "Main call returned no parseable variations.");
      return { status: "failed", runId: deps.trace.id, error: { kind: "parse", message: "Resposta principal n\xE3o retornou varia\xE7\xF5es parse\xE1veis." }, metrics: finishMetrics(metrics, deps.clock()) };
    }
    recordEvent("post_generation", "completed", `Primary generation returned ${variations.filter(Boolean).length} variation(s).`);
    const issuesBySlot = /* @__PURE__ */ new Map();
    variations.forEach((variation, index) => {
      const issues = collectSlotIssues(variation, isCarousel, index);
      if (issues.length > 0) issuesBySlot.set(index, issues);
    });
    const recentPosts = await deps.loadRecentPosts(input.userUuid, 20).catch(() => []);
    const originalityPromise = deps.assessOriginality({
      candidates: variations.filter((v) => v !== null),
      siteIntelligence,
      recentPosts
    }).catch(
      (error) => ({
        assessments: variations.filter(Boolean).map(() => ({ score: 50, maxCandidateSimilarity: 0, maxSiteSimilarity: 0, maxHistorySimilarity: 0, closestSource: "none", fallbackUsed: true })),
        embeddings: [],
        fallbackUsed: true
      })
    );
    metrics.embeddingCalls += 1;
    const evaluatedCandidates = variations.map(
      (variation) => variation ?? {}
    );
    let evaluations = await evaluateCandidates({
      candidates: evaluatedCandidates,
      strategies: plan.strategies.selected,
      siteIntelligence,
      platform: request.platform,
      originalityScores: void 0,
      skipJudgeIndexes: Array.from(issuesBySlot.keys())
    });
    metrics.evaluationCalls += input.aiLlmJudgeEnabled ? variations.length - issuesBySlot.size : 0;
    const originality = await originalityPromise;
    if (originality.fallbackUsed) metrics.fallbacks.push("originality");
    const originalityScores = originality.assessments.map((assessment) => assessment.score);
    evaluations = applyOriginalityToEvaluations(evaluations, originalityScores);
    recordEvent("originality", originality.fallbackUsed ? "fallback" : "completed", `Originality assessed (${originality.assessments.length} assessments).`);
    recordEvent("quality_evaluation", evaluations.every((evaluation) => evaluation.accepted) ? "completed" : "rejected", `Evaluation round: ${evaluations.filter((evaluation) => evaluation.accepted).length}/${evaluations.length} accepted.`);
    const qualityFeedbackBySlot = /* @__PURE__ */ new Map();
    const structuralTargets = Array.from(issuesBySlot.keys());
    const qualityTargets = evaluations.map((evaluation, index) => evaluation.accepted ? -1 : index).filter((index) => index >= 0);
    qualityTargets.forEach((index) => {
      qualityFeedbackBySlot.set(index, evaluations[index].feedback.slice(0, 3));
    });
    const needsDiversity = variations.every((variation) => variation !== null) && variationsNeedDiversification(variations);
    const repairTargets = needsDiversity ? [0, 1, 2] : Array.from(/* @__PURE__ */ new Set([...structuralTargets, ...qualityTargets])).sort((a, b) => a - b);
    const revisedIndexes = [];
    const revisionFailedIndexes = [];
    let revisionCount = 0;
    if (repairTargets.length > 0) {
      if (deadlineExceeded()) {
        return { status: "failed", runId: deps.trace.id, error: { kind: "deadline", message: "Deadline excedido antes do reparo." }, metrics: finishMetrics(metrics, deps.clock()) };
      }
      const REPAIR_BUDGET_MS = 6e4;
      const hasRepairBudget = input.deadlineMs === null || input.deadlineMs === void 0 || deps.clock() + REPAIR_BUDGET_MS <= input.deadlineMs;
      if (!hasRepairBudget && input.deadlineMs !== null && input.deadlineMs !== void 0) {
        metrics.fallbacks.push("repair_skipped_deadline");
        recordEvent("repair", "fallback", "Reparo pulado: or\xE7amento restante menor que o timeout da rota.");
      }
      if (hasRepairBudget) {
        recordEvent("repair", "started", `Repairing ${repairTargets.length} slot(s): ${repairTargets.map((i) => i + 1).join(", ")}`);
        const repairSystemPrompt = `Voc\xEA \xE9 um revisor cir\xFArgico do PostSpark.
Revise exatamente as varia\xE7\xF5es listadas pelo usu\xE1rio, preservando a estrat\xE9gia, o layout e a estrutura.
Corrija apenas os problemas apontados. N\xE3o reescreva do zero, n\xE3o misture estrat\xE9gias, n\xE3o invente fatos e responda somente JSON v\xE1lido.
COERENCIA DA LEGENDA: se houver slides ou secoes, a caption deve refletir o mesmo numero de topicos. Se os slides apresentam 5 dicas, a legenda nao deve dizer "3 dicas".
COERENCIA DO HEADLINE: em post estatico estruturado, o headline nao pode prometer 5, 7 ou 10 itens quando o visual tem exatamente 3 secoes. Reformule sem numero ou prometa 3.`;
        const repairUserPrompt = buildRepairPrompt({
          request,
          executionBrief,
          siteIntelligence,
          isCarousel,
          targets: repairTargets,
          issuesBySlot,
          qualityFeedbackBySlot,
          diversityDirective: needsDiversity,
          variations,
          contextContent
        });
        let repairResponse;
        try {
          repairResponse = await deps.generate({
            traceLabel: "generation_repair",
            taskRoute: isCarousel ? "carousel_generation" : "static_generation",
            model: request.model,
            // Mesmo orçamento por slot da chamada principal (9000/3 estático,
            // 12000/3 carrossel): o reparo de diversidade reescreve os 3 slots.
            maxCompletionTokens: Math.min(
              isCarousel ? 12e3 : 9e3,
              Math.max(2048, (isCarousel ? 4e3 : 3e3) * repairTargets.length)
            ),
            messages: [
              { role: "system", content: repairSystemPrompt },
              { role: "user", content: repairUserPrompt }
            ],
            response_format: buildVariationsSchema(isCarousel, repairTargets.length, "post_variations_repair")
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          recordEvent("repair", "failed", `Repair call failed: ${message}`);
          metrics.fallbacks.push("repair_failed");
        }
        if (repairResponse) {
          metrics.generativeCalls += 1;
          metrics.repairCalls += 1;
          addCallMetrics(metrics, repairResponse);
          if (deadlineExceeded()) {
            return { status: "failed", runId: deps.trace.id, error: { kind: "deadline", message: "Deadline excedido ap\xF3s o reparo." }, metrics: finishMetrics(metrics, deps.clock()) };
          }
          const repairContent = extractTextContent(repairResponse.choices[0]?.message?.content);
          const repaired = safeJsonParse(repairContent, { variations: [] });
          const repairedItems = Array.isArray(repaired.variations) ? repaired.variations.map((item) => stripUnsupportedControlChars(item)) : [];
          const candidateSet = [...variations];
          repairTargets.forEach((slotIndex, position) => {
            const rawItem = repairedItems[position];
            const candidate = rawItem && typeof rawItem === "object" ? rawItem : null;
            if (!candidate) {
              revisionFailedIndexes.push(slotIndex);
              return;
            }
            const guarded = applyDeterministicCopyGuards(candidate);
            const validated = validateRevisedCandidate({
              candidate: guarded,
              candidateIndex: slotIndex,
              candidates: candidateSet,
              postMode: request.postMode,
              siteIntelligence
            });
            const stillBroken = collectSlotIssues(validated.candidate, isCarousel, slotIndex).length > 0;
            if (validated.errors.length > 0 || stillBroken) {
              recordEvent("repair", "rejected", `Slot ${slotIndex + 1} repair rejected: ${validated.errors.join("; ")}`);
              revisionFailedIndexes.push(slotIndex);
              return;
            }
            candidateSet[slotIndex] = validated.candidate;
            revisedIndexes.push(slotIndex);
            revisionCount += 1;
          });
          variations = candidateSet;
        }
        const repairedSet = variations;
        revisedIndexes.forEach((slotIndex) => {
          evaluations[slotIndex] = deterministicEvaluation({
            candidate: repairedSet[slotIndex],
            allCandidates: repairedSet,
            strategy: plan.strategies.selected[slotIndex],
            siteIntelligence,
            platform: request.platform,
            originalityScore: originalityScores[slotIndex]
          });
        });
        recordEvent("repair", revisedIndexes.length > 0 ? "completed" : "rejected", `Repair applied to ${revisedIndexes.length} slot(s); failed for ${revisionFailedIndexes.length}.`);
      }
    }
    const captionFallbackSlots = [];
    variations = variations.map((variation, index) => {
      if (variation && String(variation.caption ?? "").trim().length < CAPTION_MIN_LENGTH) {
        captionFallbackSlots.push(index);
        return { ...variation, caption: synthesizeCaptionDeterministic(variation, request.platform) };
      }
      return variation;
    });
    if (captionFallbackSlots.length > 0) {
      metrics.fallbacks.push(`caption_deterministic_slots:${captionFallbackSlots.join(",")}`);
      recordEvent("caption_synthesis", "fallback", `Deterministic captions applied for slots ${captionFallbackSlots.map((i) => i + 1).join(", ")}.`);
    }
    if (isCarousel) {
      const carouselFallbackSlots = [];
      variations.forEach((variation, index) => {
        if (variation && (variation.slides?.length ?? 0) < CAROUSEL_SLIDE_TARGET) {
          carouselFallbackSlots.push(index);
        }
      });
      if (carouselFallbackSlots.length > 0) {
        metrics.fallbacks.push(`carousel_slide_fabrication:${carouselFallbackSlots.join(",")}`);
        recordEvent(
          "carousel_slide_fabrication",
          "fallback",
          `Slides fabricados deterministicamente para slots ${carouselFallbackSlots.map((i) => i + 1).join(", ")}.`
        );
      }
    }
    variations = applyBrandGuardian(variations, siteIntelligence);
    const compositionInputs = buildComposition({
      variations,
      isCarousel,
      request,
      executionBrief,
      siteIntelligence,
      plan,
      evaluations,
      originality,
      revisionCount,
      revisedIndexes,
      revisionFailedIndexes,
      clock: deps.clock
    });
    const chameleonDesignTokens = siteIntelligence ? siteIntelligenceToDesignTokens(siteIntelligence) : void 0;
    const visualDiversity = composeVisualDiversityPlan(
      compositionInputs,
      chameleonDesignTokens ?? {},
      { brandLocked: Boolean(chameleonDesignTokens) }
    );
    const generatedVariations = visualDiversity.variations;
    recordEvent("visual_diversity_plan", visualDiversity.plan.issues.length === 0 ? "completed" : "fallback", visualDiversity.plan.issues.length === 0 ? `Composed ${visualDiversity.plan.layouts.length} layouts across ${visualDiversity.plan.familyIds.length} creative families.` : visualDiversity.plan.issues.join("; "));
    const frozenSnapshots = generatedVariations.map(
      (variation) => createPostVisualSnapshot(variation, variation.aspectRatio ?? "1:1")
    );
    const unresolvedSlots = frozenSnapshots.map((snapshot, index) => snapshot.resolvedTypography ? -1 : index).filter((index) => index >= 0);
    if (unresolvedSlots.length > 0) {
      metrics.fallbacks.push(`typography_unresolved_slots:${unresolvedSlots.join(",")}`);
      recordEvent(
        "typography_resolution",
        "fallback",
        `Slots sem tipografia resolvida: ${unresolvedSlots.map((i) => i + 1).join(", ")}.`
      );
    }
    const finalValidation = validateVariationSet(frozenSnapshots, request.postMode);
    recordEvent("final_validation", finalValidation.valid ? "completed" : "rejected", finalValidation.valid ? "Exactly three complete and distinct variations approved." : finalValidation.errors.join("; "));
    if (!finalValidation.valid) {
      const issues = finalValidation.errors.map((detail) => ({
        slot: "set",
        type: detail.includes("distinct") ? "diversity" : "invalid_set",
        detail
      }));
      const rejectedMetrics = finishMetrics(metrics, deps.clock());
      recordEvent("generation_metrics", "completed", `Rejected run: ${JSON.stringify(rejectedMetrics)}`, rejectedMetrics);
      return { status: "rejected", runId: deps.trace.id, issues, metrics: rejectedMetrics };
    }
    recordEvent("orchestrator", "completed", `Generation approved with ${metrics.generativeCalls} generative call(s), ${metrics.repairCalls} repair(s).`);
    const approvedMetrics = finishMetrics(metrics, deps.clock());
    recordEvent("generation_metrics", "completed", `Approved run: ${JSON.stringify(approvedMetrics)}`, approvedMetrics);
    return {
      status: "approved",
      runId: deps.trace.id,
      snapshots: frozenSnapshots,
      evaluations,
      originality,
      plan,
      metrics: approvedMetrics
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "failed", runId: deps.trace.id, error: { kind: "internal", message, cause: error }, metrics: finishMetrics(metrics, deps.clock()) };
  }
}

// shared/postsparkSchemas.ts
import { z as z2 } from "zod";
var inputTypeSchema = z2.enum(["text", "url", "image"]);
var platformSchema = z2.enum(["instagram", "twitter", "linkedin", "facebook"]);
var aspectRatioSchema = z2.enum(["1:1", "5:6", "9:16"]);
var postModeSchema = z2.enum(["static", "carousel"]);
var postLayoutSchema = z2.enum(["centered", "left-aligned", "split", "minimal"]);
var postTemplateSchema = z2.enum(["simple", "feature-grid", "numbered-list", "step-by-step"]);
var layoutPositionSchema = z2.object({
  position: z2.enum(["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"]),
  textAlign: z2.enum(["left", "center", "right"]),
  freePosition: z2.object({
    x: z2.number(),
    y: z2.number()
  }).optional(),
  width: z2.number().optional(),
  height: z2.number().optional(),
  backgroundColor: z2.string().optional(),
  borderRadius: z2.number().optional()
});
var advancedLayoutSettingsSchema = z2.object({
  headline: layoutPositionSchema,
  body: layoutPositionSchema,
  accentBar: layoutPositionSchema,
  badge: layoutPositionSchema,
  sticker: layoutPositionSchema,
  carouselArrow: layoutPositionSchema,
  card: layoutPositionSchema,
  sectionLayouts: z2.record(z2.string(), layoutPositionSchema).optional(),
  padding: z2.number()
});
var imageSettingsSchema = z2.object({
  zoom: z2.number(),
  brightness: z2.number(),
  contrast: z2.number(),
  saturation: z2.number(),
  blur: z2.number(),
  overlayOpacity: z2.number(),
  overlayColor: z2.string(),
  blendMode: z2.enum(["normal", "multiply", "screen", "overlay", "darken", "lighten"]),
  panX: z2.number(),
  panY: z2.number()
});
var backgroundValueSchema = z2.object({
  type: z2.enum(["none", "gallery", "upload", "ai", "solid"]),
  url: z2.string().optional(),
  color: z2.string().optional()
});
var bgOverlaySettingsSchema = z2.object({
  opacity: z2.number(),
  color: z2.string(),
  position: z2.object({
    x: z2.number(),
    y: z2.number()
  })
});
var copyAngleSchema = z2.object({
  type: z2.enum(["dor", "beneficio", "objecao", "autoridade", "escassez", "storytelling", "mito_vs_verdade"]),
  label: z2.string(),
  badge: z2.string(),
  stickerText: z2.string()
});
var contentSectionSchema = z2.object({
  id: z2.string().optional(),
  icon: z2.string().optional(),
  label: z2.string(),
  description: z2.string().optional(),
  number: z2.number().optional()
});
var textElementSchema = z2.object({
  id: z2.string(),
  text: z2.string(),
  x: z2.number(),
  y: z2.number(),
  width: z2.union([z2.number(), z2.literal("auto")]),
  height: z2.union([z2.number(), z2.literal("auto")]),
  rotation: z2.number(),
  styles: z2.object({
    fontSize: z2.string(),
    fontFamily: z2.string(),
    color: z2.string(),
    fontWeight: z2.string(),
    fontStyle: z2.string(),
    textDecoration: z2.string(),
    textAlign: z2.enum(["left", "center", "right"]),
    lineHeight: z2.string(),
    opacity: z2.string()
  })
});
var imageElementSchema = z2.object({
  id: z2.string(),
  url: z2.string(),
  x: z2.number(),
  y: z2.number(),
  width: z2.number(),
  height: z2.union([z2.number(), z2.literal("auto")]),
  rotation: z2.number(),
  source: z2.enum(["upload", "url"]).optional()
});
var designTokensSchema = z2.object({
  colors: z2.object({
    background: z2.string(),
    primary: z2.string(),
    secondary: z2.string(),
    text: z2.string(),
    card: z2.string()
  }),
  typography: z2.object({
    fontFamily: z2.string(),
    customFontUrl: z2.string(),
    originalFont: z2.string(),
    textTransform: z2.enum(["none", "uppercase"]),
    textAlign: z2.enum(["left", "center"])
  }),
  structure: z2.object({
    borderRadius: z2.string(),
    boxShadow: z2.string(),
    border: z2.string()
  }),
  decorations: z2.enum(["minimal", "playful"])
});
var formatOptimizationSchema2 = z2.object({
  layout: postLayoutSchema,
  backgroundColor: z2.string(),
  textColor: z2.string(),
  accentColor: z2.string(),
  headlineFontSize: z2.number().optional(),
  bodyFontSize: z2.number().optional(),
  padding: z2.number().optional(),
  headline: z2.object({
    x: z2.number().optional(),
    y: z2.number().optional(),
    width: z2.number().optional(),
    textAlign: z2.enum(["left", "center", "right"]).optional(),
    backgroundColor: z2.string().optional(),
    borderRadius: z2.number().optional()
  }).optional(),
  body: z2.object({
    x: z2.number().optional(),
    y: z2.number().optional(),
    width: z2.number().optional(),
    textAlign: z2.enum(["left", "center", "right"]).optional(),
    backgroundColor: z2.string().optional(),
    borderRadius: z2.number().optional()
  }).optional(),
  card: z2.object({
    x: z2.number().optional(),
    y: z2.number().optional(),
    width: z2.number().optional(),
    textAlign: z2.enum(["left", "center", "right"]).optional(),
    backgroundColor: z2.string().optional(),
    borderRadius: z2.number().optional()
  }).optional()
});
var generationEvaluationSchema = z2.object({
  overallScore: z2.number(),
  accepted: z2.boolean(),
  dimensions: z2.object({
    brandAlignment: z2.number(),
    objectiveAlignment: z2.number(),
    audienceRelevance: z2.number(),
    factuality: z2.number(),
    originality: z2.number(),
    clarity: z2.number(),
    platformFit: z2.number(),
    visualReadability: z2.number(),
    captionCoherence: z2.number(),
    layoutIntegrity: z2.number()
  }),
  feedback: z2.array(z2.string())
});
var generationMetaSchema = z2.object({
  creationMode: z2.enum(["ideation", "execution"]),
  fidelity: z2.enum(["high", "medium"]).optional(),
  interventionLevel: z2.enum(["visual_only", "light_optimize", "optimize_structure"]).optional(),
  siteIntelligenceId: z2.string().optional(),
  strategyId: z2.string().optional(),
  revisionCount: z2.number().optional(),
  revisionApplied: z2.boolean().optional(),
  revisionFailed: z2.boolean().optional(),
  evaluation: generationEvaluationSchema.optional(),
  originality: z2.object({
    score: z2.number(),
    maxCandidateSimilarity: z2.number(),
    maxSiteSimilarity: z2.number(),
    maxHistorySimilarity: z2.number(),
    closestSource: z2.enum(["candidate", "site", "history", "none"]),
    fallbackUsed: z2.boolean()
  }).optional()
});
var creativeDirectionSchema = z2.object({
  version: z2.literal(1),
  familyId: z2.string(),
  paletteId: z2.string(),
  paletteInverted: z2.boolean(),
  seed: z2.number(),
  source: z2.enum(["llm-intent", "classifier", "user"]),
  axes: z2.object({
    composition: z2.enum(["grid", "poster", "split", "centered-minimal", "freeform"]),
    typography: z2.enum(["display-brutal", "editorial-serif", "mono-tech", "clean-sans"]),
    color: z2.enum(["monochrome", "duotone", "vibrant", "chromatic-block", "desaturated"]),
    ornaments: z2.enum(["minimal", "badges-stickers", "scanlines-glitch", "frames"]),
    texture: z2.enum(["clean", "grain", "paper", "halftone"]),
    vibe: z2.enum(["tech", "urgente", "sereno", "premium", "divertido", "cru", "editorial"])
  }),
  hiddenOrnaments: z2.object({
    badge: z2.string().optional(),
    stickerText: z2.string().optional(),
    accentBar: z2.boolean().optional()
  }).optional()
});
var variationVisualPatchSchema = z2.object({
  headline: z2.string().optional(),
  body: z2.string().optional(),
  caption: z2.string().optional(),
  hashtags: z2.array(z2.string()).optional(),
  callToAction: z2.string().optional(),
  tone: z2.string().optional(),
  platform: platformSchema.optional(),
  imagePrompt: z2.string().optional(),
  imageUrl: z2.string().optional(),
  backgroundColor: z2.string().optional(),
  textColor: z2.string().optional(),
  headlineColor: z2.string().optional(),
  bodyColor: z2.string().optional(),
  headlineFontSize: z2.number().optional(),
  bodyFontSize: z2.number().optional(),
  headlineFontFamily: z2.string().optional(),
  bodyFontFamily: z2.string().optional(),
  accentColor: z2.string().optional(),
  layout: postLayoutSchema.optional(),
  aspectRatio: aspectRatioSchema.optional(),
  postMode: postModeSchema.optional(),
  splitImagePosition: z2.enum(["top", "bottom"]).optional(),
  template: postTemplateSchema.optional(),
  sections: z2.array(contentSectionSchema).optional(),
  textElements: z2.array(textElementSchema).optional(),
  imageElements: z2.array(imageElementSchema).optional(),
  imageSettings: imageSettingsSchema.optional(),
  layoutSettings: advancedLayoutSettingsSchema.optional(),
  bgValue: backgroundValueSchema.optional(),
  bgOverlay: bgOverlaySettingsSchema.optional(),
  copyAngle: copyAngleSchema.optional(),
  creativeDirection: creativeDirectionSchema.optional(),
  designTokens: designTokensSchema.partial().optional(),
  brandMeta: z2.object({
    logoUrl: z2.string().optional(),
    brandName: z2.string().optional(),
    favicon: z2.string().optional()
  }).optional()
});
var resolvedTextBlockSchema = z2.object({
  text: z2.string(),
  fontFamily: z2.string(),
  fontWeight: z2.number(),
  fontSizePx: z2.number(),
  lineHeight: z2.number(),
  lines: z2.array(z2.string()),
  box: z2.object({
    x: z2.number(),
    y: z2.number(),
    width: z2.number(),
    height: z2.number()
  }),
  textTransform: z2.enum(["none", "uppercase", "lowercase"]).optional()
});
var resolvedTypographySchema = z2.object({
  engineVersion: z2.string(),
  headline: resolvedTextBlockSchema,
  body: resolvedTextBlockSchema.optional()
});
var carouselSlideSchema = z2.object({
  headline: z2.string(),
  body: z2.string(),
  slideNumber: z2.number(),
  isTitleSlide: z2.boolean().optional(),
  isCtaSlide: z2.boolean().optional(),
  editorState: z2.object({
    variation: variationVisualPatchSchema.optional(),
    imageSettings: imageSettingsSchema.partial().optional(),
    layoutSettings: advancedLayoutSettingsSchema.partial().optional(),
    bgValue: backgroundValueSchema.optional(),
    bgOverlay: bgOverlaySettingsSchema.partial().optional(),
    resolvedTypography: resolvedTypographySchema.optional(),
    typographyResolutionError: z2.string().optional()
  }).optional()
});
var visualFitIssueSchema = z2.object({
  type: z2.enum([
    "headline_body_overlap",
    "structured_absolute_layout",
    "card_too_narrow",
    "text_element_outside_canvas",
    "text_element_overlaps_copy",
    "text_exceeds_visible_area",
    "outside_safe_area",
    "section_overlap",
    "section_missing_geometry"
  ]),
  target: z2.string(),
  detail: z2.string()
});
var postVisualSnapshotSchema = z2.object({
  snapshotVersion: z2.union([z2.literal(1), z2.literal(2), z2.literal(3), z2.literal(4)]),
  resolvedTypography: resolvedTypographySchema.optional(),
  typographyResolutionError: z2.string().optional(),
  visualFitIssues: z2.array(visualFitIssueSchema).optional(),
  removedTextElementIds: z2.array(z2.string()).optional(),
  id: z2.string(),
  headline: z2.string(),
  body: z2.string(),
  caption: z2.string(),
  hashtags: z2.array(z2.string()),
  callToAction: z2.string(),
  tone: z2.string(),
  platform: platformSchema,
  imagePrompt: z2.string(),
  imageUrl: z2.string().optional(),
  backgroundColor: z2.string(),
  textColor: z2.string(),
  headlineColor: z2.string().optional(),
  bodyColor: z2.string().optional(),
  headlineFontSize: z2.number().optional(),
  bodyFontSize: z2.number().optional(),
  headlineFontFamily: z2.string().optional(),
  bodyFontFamily: z2.string().optional(),
  accentColor: z2.string(),
  layout: postLayoutSchema,
  aspectRatio: aspectRatioSchema,
  postMode: postModeSchema,
  slides: z2.array(carouselSlideSchema).optional(),
  splitImagePosition: z2.enum(["top", "bottom"]).optional(),
  template: postTemplateSchema.optional(),
  sections: z2.array(contentSectionSchema).optional(),
  textElements: z2.array(textElementSchema).optional(),
  imageElements: z2.array(imageElementSchema).optional(),
  aspectRatioOptimizations: z2.partialRecord(aspectRatioSchema, formatOptimizationSchema2).optional(),
  layoutSettingsByAspectRatio: z2.partialRecord(aspectRatioSchema, advancedLayoutSettingsSchema).optional(),
  copyAngle: copyAngleSchema.optional(),
  creativeDirection: creativeDirectionSchema.optional(),
  designTokens: designTokensSchema.partial().optional(),
  brandMeta: z2.object({
    logoUrl: z2.string().optional(),
    brandName: z2.string().optional(),
    favicon: z2.string().optional()
  }).optional(),
  generationMeta: generationMetaSchema.optional(),
  imageSettings: imageSettingsSchema,
  layoutSettings: advancedLayoutSettingsSchema,
  bgValue: backgroundValueSchema,
  bgOverlay: bgOverlaySettingsSchema
}).superRefine((value, ctx) => {
  if (value.snapshotVersion !== 3 && value.snapshotVersion !== 4) return;
  if (!value.designTokens) {
    ctx.addIssue({
      code: z2.ZodIssueCode.custom,
      path: ["designTokens"],
      message: "v3+ snapshots must carry complete designTokens"
    });
    return;
  }
  const requiredGroups = ["colors", "typography", "structure"];
  for (const group of requiredGroups) {
    if (!value.designTokens[group]) {
      ctx.addIssue({
        code: z2.ZodIssueCode.custom,
        path: ["designTokens", group],
        message: `v3+ snapshots must carry complete designTokens.${group}`
      });
    }
  }
});

// server/routers/admin.ts
import { z as z3 } from "zod";
import { TRPCError as TRPCError4 } from "@trpc/server";
init_db();
init_env();
var adminRouter = router({
  /**
   * List all user profiles for administrative management.
   * Protected by RBAC (role: 'admin')
   */
  listProfiles: adminProcedure.query(async () => {
    const sb = getSupabase();
    const { data, error } = await sb.schema("postspark").from("profiles").select("*").order("created_at", { ascending: false });
    if (error) {
      throw new TRPCError4({
        code: "INTERNAL_SERVER_ERROR",
        message: `Erro ao buscar perfis: ${error.message}`
      });
    }
    return data;
  }),
  /**
   * Get basic growth stats (Total users, Active plans)
   */
  getStats: adminProcedure.query(async () => {
    const sb = getSupabase();
    const { count, error } = await sb.schema("postspark").from("profiles").select("*", { count: "exact", head: true });
    if (error) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return {
      totalUsers: count || 0
    };
  }),
  getGenerationMetrics: adminProcedure.input(z3.object({
    windowDays: z3.number().int().min(1).max(90).default(7)
  }).optional()).query(async ({ input }) => {
    return getGenerationOperationalMetrics(input?.windowDays ?? 7);
  }),
  getAiRollout: adminProcedure.query(() => ({
    siteIntelligence: ENV.aiSiteIntelligenceEnabled,
    llmJudge: ENV.aiLlmJudgeEnabled,
    semanticEmbeddings: ENV.aiSemanticEmbeddingsEnabled,
    modelFallback: ENV.aiModelFallbackEnabled,
    traceStoresContent: ENV.aiTraceStoreContent,
    uiDebug: ENV.aiUiDebugEnabled
  }))
});

// server/routers/privacy.ts
import { z as z4 } from "zod";

// server/_core/gdpr.ts
init_db();
init_privacyLog();
async function softDeleteUser(userId, mode = "anonymize") {
  try {
    const scheduledAt = /* @__PURE__ */ new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 30);
    await getDb().schema("postspark").from("users").where("id", userId).update({
      deleted_at: /* @__PURE__ */ new Date(),
      deletion_scheduled_at: scheduledAt,
      deletion_mode: mode,
      email: null,
      name: null,
      openId: `deleted_${userId.substring(0, 8)}`,
      updated_at: /* @__PURE__ */ new Date()
    });
    await logPrivacyEvent({
      userId,
      action: "soft_delete_initiated",
      metadata: {
        mode,
        scheduledFor: scheduledAt.toISOString()
      }
    });
    return { success: true, scheduledAt };
  } catch (error) {
    console.error("[GDPR] Error in softDeleteUser:", error);
    throw error;
  }
}
async function cancelDeletion(userId) {
  try {
    const user = await getDb().schema("postspark").from("users").where("id", userId).select("*").single();
    if (!user) {
      throw new Error("User not found");
    }
    if (!user.deletion_scheduled_at) {
      throw new Error("No deletion scheduled");
    }
    const now = /* @__PURE__ */ new Date();
    const scheduled = new Date(user.deletion_scheduled_at);
    if (now > scheduled) {
      throw new Error("Reflection period expired");
    }
    await getDb().schema("postspark").from("users").where("id", userId).update({
      deleted_at: null,
      deletion_scheduled_at: null,
      deletion_mode: null,
      updated_at: /* @__PURE__ */ new Date()
    });
    await logPrivacyEvent({
      userId,
      action: "deletion_cancelled",
      metadata: {
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
    return { success: true };
  } catch (error) {
    console.error("[GDPR] Error in cancelDeletion:", error);
    throw error;
  }
}
async function exportUserData(userId) {
  try {
    const user = await getDb().schema("postspark").from("users").where("id", userId).select("*").single();
    const posts = await getDb().schema("postspark").from("posts").where("user_uuid", userId).select("*");
    const backgrounds = await getDb().schema("postspark").from("background_assets").where("user_uuid", userId).select("*");
    let generations = [];
    try {
      generations = await getDb().schema("postspark").from("generation_runs").where("user_uuid", userId).select("*");
    } catch {
    }
    const billing = {
      profile: null,
      subscriptions: [],
      transactions: []
    };
    try {
      const profileResult = await getDb().rpc("get_billing_profile", {
        p_user_id: userId
      });
      billing.profile = profileResult;
      const subscriptionsResult = await getDb().schema("postspark").from("subscriptions").where("user_id", userId).select("*");
      billing.subscriptions = subscriptionsResult;
    } catch {
    }
    await logPrivacyEvent({
      userId,
      action: "data_exported",
      metadata: {
        postsCount: posts?.length || 0,
        backgroundsCount: backgrounds?.length || 0,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
    return {
      user: user || {},
      posts: posts || [],
      backgrounds: backgrounds || [],
      generations,
      billing
    };
  } catch (error) {
    console.error("[GDPR] Error in exportUserData:", error);
    throw error;
  }
}
async function getUserDataStats(userId) {
  try {
    const { count: postsCount } = await getDb().schema("postspark").from("posts").where("user_uuid", userId).select("*", { count: "exact", head: true });
    const { count: backgroundsCount } = await getDb().schema("postspark").from("background_assets").where("user_uuid", userId).select("*", { count: "exact", head: true });
    let generationsCount = 0;
    try {
      const { count } = await getDb().schema("postspark").from("generation_runs").where("user_uuid", userId).select("*", { count: "exact", head: true });
      generationsCount = count || 0;
    } catch {
    }
    const user = await getDb().schema("postspark").from("users").where("id", userId).select("created_at").single();
    const avgPostSize = 5e4;
    const avgBackgroundSize = 2e5;
    const totalBytes = (postsCount || 0) * avgPostSize + (backgroundsCount || 0) * avgBackgroundSize;
    const storageUsed = formatBytes(totalBytes);
    const storagePercent = Math.min(totalBytes / (100 * 1024 * 1024) * 100, 100);
    return {
      postsCount: postsCount || 0,
      backgroundsCount: backgroundsCount || 0,
      generationsCount,
      memberSince: user?.created_at ? new Date(user.created_at).toLocaleDateString("pt-BR") : "N/A",
      storageUsed,
      storagePercent
    };
  } catch (error) {
    console.error("[GDPR] Error in getUserDataStats:", error);
    throw error;
  }
}
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round(bytes / Math.pow(k, i) * 100) / 100} ${sizes[i]}`;
}

// server/routers/privacy.ts
init_privacyLog();
var privacyRouter = router({
  /**
   * Obtém estatísticas dos dados do usuário
   * Para visão geral na página de privacidade
   */
  getMyData: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const stats = await getUserDataStats(userId);
    return stats;
  }),
  /**
   * Exporta todos os dados do usuário em formato JSON
   * Conforme Art. 18, V da LGPD (portabilidade)
   */
  exportData: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;
    const data = await exportUserData(userId);
    return data;
  }),
  /**
   * Solicita exclusão da conta e dados
   * Conforme Art. 18, III da LGPD (eliminação)
   *
   * Inicia soft delete com período de reflexão de 30 dias
   */
  requestDeletion: protectedProcedure.input(
    z4.object({
      mode: z4.enum(["anonymize", "delete"]).default("anonymize")
    })
  ).mutation(async ({ ctx, input }) => {
    const userId = ctx.user.id;
    const { mode } = input;
    const result = await softDeleteUser(userId, mode);
    return {
      success: true,
      scheduledFor: result.scheduledAt,
      message: "Solicita\xE7\xE3o recebida. Seus dados ser\xE3o exclu\xEDdos em 30 dias. Voc\xEA pode cancelar entrando em contato com suporte@postspark.com"
    };
  }),
  /**
   * Cancela solicitação de exclusão (dentro do período de reflexão)
   */
  cancelDeletion: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;
    await cancelDeletion(userId);
    return {
      success: true,
      message: "Solicita\xE7\xE3o de exclus\xE3o cancelada. Sua conta permanece ativa."
    };
  }),
  /**
   * Atualiza preferências de consentimento
   */
  updateConsent: protectedProcedure.input(
    z4.object({
      aiImprovements: z4.boolean()
    })
  ).mutation(async ({ ctx, input }) => {
    const userId = ctx.user.id;
    const { aiImprovements } = input;
    if (aiImprovements) {
      await logConsentGiven(userId, "1.0", true);
    } else {
      await logConsentRevoked(userId, ["aiImprovements"]);
    }
    return {
      success: true,
      message: "Prefer\xEAncias atualizadas."
    };
  }),
  /**
   * Obtém logs de privacidade do usuário
   */
  getLogs: protectedProcedure.input(
    z4.object({
      limit: z4.number().min(1).max(100).default(50)
    })
  ).query(async ({ ctx, input }) => {
    const userId = ctx.user.id;
    const { limit } = input;
    const { getPrivacyLogs: getPrivacyLogs2 } = await Promise.resolve().then(() => (init_privacyLog(), privacyLog_exports));
    const logs = await getPrivacyLogs2(userId, limit);
    return logs;
  })
});

// server/routers.ts
var logSnippet = (value, maxLength = 320) => {
  if (value === void 0 || value === null) return void 0;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return void 0;
  return text.length > maxLength ? `${text.slice(0, maxLength)}...[truncated]` : text;
};
var summarizeGeneratedVariation = (variation, index) => ({
  index,
  id: variation?.id,
  layout: variation?.layout,
  platform: variation?.platform,
  postMode: variation?.postMode,
  familyId: variation?.creativeDirection?.familyId,
  typographyResolved: Boolean(variation?.resolvedTypography),
  typographyResolutionError: variation?.typographyResolutionError,
  visualFitIssues: Array.isArray(variation?.visualFitIssues) ? variation.visualFitIssues.map((issue) => issue?.type) : [],
  headline: logSnippet(variation?.headline),
  body: logSnippet(variation?.body),
  caption: logSnippet(variation?.caption, 500),
  callToAction: logSnippet(variation?.callToAction),
  hashtags: Array.isArray(variation?.hashtags) ? variation.hashtags.slice(0, 8) : [],
  colors: {
    backgroundColor: variation?.backgroundColor,
    textColor: variation?.textColor,
    accentColor: variation?.accentColor
  },
  copyAngle: variation?.copyAngle ? {
    type: variation.copyAngle.type,
    label: logSnippet(variation.copyAngle.label),
    badge: logSnippet(variation.copyAngle.badge),
    stickerText: logSnippet(variation.copyAngle.stickerText)
  } : void 0,
  sections: Array.isArray(variation?.sections) ? variation.sections.map((section, sectionIndex) => ({
    index: sectionIndex,
    id: section?.id,
    number: section?.number,
    icon: section?.icon,
    label: logSnippet(section?.label),
    description: logSnippet(section?.description)
  })) : [],
  slides: Array.isArray(variation?.slides) ? variation.slides.map((slide, slideIndex) => ({
    index: slideIndex,
    headline: logSnippet(slide?.headline),
    body: logSnippet(slide?.body),
    slideNumber: slide?.slideNumber,
    isTitleSlide: slide?.isTitleSlide,
    isCtaSlide: slide?.isCtaSlide
  })) : [],
  generationMeta: variation?.generationMeta ? {
    creationMode: variation.generationMeta.creationMode,
    fidelity: variation.generationMeta.fidelity,
    interventionLevel: variation.generationMeta.interventionLevel,
    siteIntelligenceId: variation.generationMeta.siteIntelligenceId,
    strategyId: variation.generationMeta.strategyId,
    revisionCount: variation.generationMeta.revisionCount,
    evaluation: variation.generationMeta.evaluation ? {
      accepted: variation.generationMeta.evaluation.accepted,
      overallScore: variation.generationMeta.evaluation.overallScore,
      reasons: variation.generationMeta.evaluation.reasons
    } : void 0,
    originality: variation.generationMeta.originality ? {
      score: variation.generationMeta.originality.score,
      verdict: variation.generationMeta.originality.verdict,
      reason: variation.generationMeta.originality.reason
    } : void 0
  } : void 0
});
var CAROUSEL_SLIDE_TARGET2 = 5;
var executionSlideInputSchema = z5.object({
  slideNumber: z5.number().int().min(1).max(CAROUSEL_SLIDE_TARGET2),
  rawText: z5.string(),
  role: z5.enum(["hook", "development", "cta", "custom"]).optional(),
  locked: z5.boolean().optional()
});
var executionBrandInputSchema = z5.object({
  websiteUrl: z5.string().optional(),
  logoUrl: z5.string().optional(),
  referenceImageUrl: z5.string().optional(),
  brandColors: z5.array(z5.string()).optional(),
  fontHint: z5.string().optional(),
  adaptationMode: z5.enum(["strict", "adaptive", "reference_clone"])
});
var executionBriefSchema = z5.object({
  creationMode: z5.literal("execution"),
  format: z5.enum(["static", "carousel", "story", "ad"]),
  platform: z5.enum(["instagram", "twitter", "linkedin", "facebook"]),
  objective: z5.enum(["educate", "authority", "sell", "engage", "lead"]),
  tone: z5.string().optional(),
  callToAction: z5.string().optional(),
  interventionLevel: z5.enum(["visual_only", "light_optimize", "optimize_structure"]),
  contentSourceType: z5.enum(["freeform", "carousel_topics", "carousel_slides", "caption_ready"]),
  rawInput: z5.string(),
  slides: z5.array(executionSlideInputSchema).optional(),
  mustKeep: z5.array(z5.string()).optional(),
  mustInclude: z5.array(z5.string()).optional(),
  forbiddenTerms: z5.array(z5.string()).optional(),
  notes: z5.string().optional(),
  brandInput: executionBrandInputSchema.optional()
});
function normalizeExecutionBrief(input) {
  const brief = executionBriefSchema.parse(input);
  const normalizedSlides = Array.isArray(brief.slides) ? brief.slides.filter((slide) => slide.rawText.trim().length > 0).sort((a, b) => a.slideNumber - b.slideNumber).slice(0, CAROUSEL_SLIDE_TARGET2) : [];
  return {
    ...brief,
    slides: normalizedSlides,
    mustKeep: brief.mustKeep || [],
    mustInclude: brief.mustInclude || [],
    forbiddenTerms: brief.forbiddenTerms || [],
    brandInput: brief.brandInput ? {
      ...brief.brandInput,
      brandColors: brief.brandInput.brandColors || []
    } : void 0
  };
}
function decodeDataUrl(dataUrl) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid data URL");
  }
  const contentType = match[1];
  const base64 = match[2];
  const extension = contentType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  return {
    buffer: Buffer.from(base64, "base64"),
    contentType,
    extension
  };
}
var PLAN_SAVE_LIMIT_MESSAGES = {
  FREE: "No plano gratuito, voc\xEA pode salvar at\xE9 5 posts. Fa\xE7a upgrade para manter sua biblioteca completa.",
  PRO: "Seu plano PRO permite salvar at\xE9 100 posts. Exclua itens antigos ou fa\xE7a upgrade para continuar salvando.",
  AGENCY: "Seu plano AGENCY permite salvar at\xE9 500 posts. Exclua itens antigos ou fale com o suporte para ampliar a capacidade.",
  LITE: "Seu plano LITE permite salvar at\xE9 20 posts. Fa\xE7a upgrade para ampliar sua biblioteca."
};
function resolveSaveLimitMessage(plan) {
  return PLAN_SAVE_LIMIT_MESSAGES[plan || ""] || "Voc\xEA atingiu o limite de posts salvos do seu plano. Exclua itens antigos ou fa\xE7a upgrade para continuar.";
}
var billingRouter = router({
  /** Retorna perfil de billing do usuário logado (plano, sparks, etc.) */
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const email = ctx.user.email ?? "dev@local.dev";
    return getBillingProfile(email);
  }),
  /** Inicia trial de 7 dias (anti-abuso por e-mail + IP) */
  startTrial: protectedProcedure.input(
    z5.object({
      plan: z5.enum(["PRO", "AGENCY"]).default("PRO")
    })
  ).mutation(async ({ input, ctx }) => {
    const email = ctx.user.email ?? "";
    const ip = ctx.req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ?? ctx.req.socket.remoteAddress ?? "0.0.0.0";
    if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
      return { success: true, reason: "ok" };
    }
    const profile = await getBillingProfile(email);
    if (profile.id === "no-profile" || profile.id === "error" || profile.id === "dev-mock") {
      return { success: false, reason: "profile_not_found" };
    }
    const { data, error } = await rpcCall("start_trial", {
      p_user_id: profile.id,
      p_email: email,
      p_ip_address: ip,
      p_plan: input.plan
    });
    if (error) return { success: false, reason: error.message };
    return data ?? { success: false, reason: "unknown" };
  }),
  /** Cria Stripe Checkout Session para assinatura */
  createCheckout: protectedProcedure.input(
    z5.object({
      plan: z5.enum(["PRO", "AGENCY"]),
      cycle: z5.enum(["monthly", "annual"]).default("monthly"),
      successPath: z5.string().default("/billing/success"),
      cancelPath: z5.string().default("/pricing")
    })
  ).mutation(async ({ input, ctx }) => {
    const email = ctx.user.email ?? "";
    const name = ctx.user.name ?? void 0;
    const profile = await getBillingProfile(email);
    if (profile.id === "no-profile" || profile.id === "error") {
      throw new TRPCError5({
        code: "PRECONDITION_FAILED",
        message: "Perfil de billing n\xE3o encontrado."
      });
    }
    const host = `${ctx.req.protocol}://${ctx.req.get("host")}`;
    const priceId = getSubscriptionPriceId(input.plan, input.cycle);
    const url = await createSubscriptionCheckout({
      profileId: profile.id,
      email,
      name,
      priceId,
      successUrl: `${host}${input.successPath}`,
      cancelUrl: `${host}${input.cancelPath}`
    });
    return { url };
  }),
  /** Lista pacotes de top-up ativos */
  getTopupPackages: publicProcedure.query(async () => {
    return getTopupPackages();
  }),
  /** Cria Stripe Checkout Session para top-up avulso */
  createTopupCheckout: protectedProcedure.input(
    z5.object({
      packageId: z5.string(),
      successPath: z5.string().default("/billing/topup-success"),
      cancelPath: z5.string().default("/billing")
    })
  ).mutation(async ({ input, ctx }) => {
    const email = ctx.user.email ?? "";
    const name = ctx.user.name ?? void 0;
    const packages = await getTopupPackages();
    const pkg = packages.find((p) => p.id === input.packageId);
    if (!pkg)
      throw new TRPCError5({
        code: "NOT_FOUND",
        message: "Pacote n\xE3o encontrado."
      });
    const profile = await getBillingProfile(email);
    if (profile.id === "no-profile" || profile.id === "error") {
      throw new TRPCError5({
        code: "PRECONDITION_FAILED",
        message: "Perfil de billing n\xE3o encontrado."
      });
    }
    const host = `${ctx.req.protocol}://${ctx.req.get("host")}`;
    const url = await createTopupCheckout({
      profileId: profile.id,
      email,
      name,
      priceId: pkg.stripe_price_id,
      packageId: pkg.id,
      successUrl: `${host}${input.successPath}`,
      cancelUrl: `${host}${input.cancelPath}`
    });
    return { url };
  })
});
var appRouter = router({
  system: systemRouter,
  billing: billingRouter,
  admin: adminRouter,
  privacy: privacyRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  post: router({
    /** Generate 3 post variations from user input */
    generate: protectedProcedure.input(
      z5.object({
        inputType: z5.enum(["text", "url", "image"]),
        content: z5.string().min(1),
        platform: z5.enum(["instagram", "twitter", "linkedin", "facebook"]),
        imageUrl: z5.string().optional(),
        tone: z5.string().optional(),
        postMode: z5.enum(["static", "carousel"]).default("static"),
        model: z5.enum(["gemini", "llama"]).optional(),
        creationMode: z5.enum(["ideation", "execution"]).default("ideation"),
        executionBrief: executionBriefSchema.optional(),
        siteIntelligenceId: z5.string().uuid().optional(),
        idempotencyKey: z5.string().min(1).max(128).optional(),
        debug: z5.boolean().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const email = ctx.user.email ?? "dev@local.dev";
      const profile = await getBillingProfile(email);
      const cost = input.postMode === "carousel" ? SPARK_COSTS.CAROUSEL : SPARK_COSTS.GENERATE_TEXT;
      const idempotencyKey = input.idempotencyKey ?? deriveIdempotencyKey(ctx.user.id, input);
      const reservation = await reserveSparks(profile, cost, idempotencyKey, `Gera\xE7\xE3o de post (${input.postMode})`);
      if (!reservation.reservationId) {
        await appendOperationalLog("POST_GENERATION_REJECTED", {
          reason: reservation.reason ?? "INSUFFICIENT_SPARKS",
          userUuid: ctx.user.id,
          profileId: profile.id,
          inputType: input.inputType,
          platform: input.platform,
          postMode: input.postMode,
          creationMode: input.creationMode,
          requestedModel: input.model ?? "llama",
          siteIntelligenceId: input.siteIntelligenceId,
          contentLength: input.content.length,
          contentPreview: logSnippet(input.content, 500),
          sparkCost: cost,
          idempotencyKey
        });
        throw new TRPCError5({
          code: "PAYMENT_REQUIRED",
          message: "Sparks insuficientes. Fa\xE7a upgrade ou adquira um pacote de recarga."
        });
      }
      const generationTrace = startGenerationTrace({
        userUuid: ctx.user.id,
        inputType: input.inputType,
        inputContent: input.content,
        platform: input.platform,
        postMode: input.postMode,
        creationMode: input.creationMode,
        requestedModel: input.model ?? "llama",
        siteIntelligenceId: input.siteIntelligenceId
      });
      const debugEnabled = Boolean(input.debug && ENV.aiUiDebugEnabled);
      await appendOperationalLog("POST_GENERATION_STARTED", {
        generationRunId: generationTrace.id,
        userUuid: ctx.user.id,
        inputType: input.inputType,
        platform: input.platform,
        postMode: input.postMode,
        creationMode: input.creationMode,
        requestedModel: input.model ?? "llama",
        siteIntelligenceId: input.siteIntelligenceId,
        contentLength: input.content.length,
        contentPreview: logSnippet(input.content, 500),
        hasImageUrl: Boolean(input.imageUrl),
        hasExecutionBrief: Boolean(input.executionBrief),
        debugEnabled,
        sparkCost: cost
      });
      try {
        recordGenerationEvent({
          stage: "generation",
          status: "started",
          detail: "Generation pipeline started."
        });
        const normalizedExecutionBrief = input.creationMode === "execution" && input.executionBrief ? normalizeExecutionBrief(input.executionBrief) : null;
        const recentPostsPromise = getUserPosts(ctx.user.id, 20).catch((error) => {
          console.warn("[post.generate] Recent post history unavailable:", error);
          return [];
        });
        let contextContent = input.content;
        let brandDnaContext = "";
        let siteIntelligence = null;
        const siteUrl = input.inputType === "url" ? input.content : normalizedExecutionBrief?.brandInput?.websiteUrl;
        if (ENV.aiSiteIntelligenceEnabled && input.siteIntelligenceId) {
          siteIntelligence = await loadSiteIntelligence(input.siteIntelligenceId, ctx.user.id);
        }
        if (ENV.aiSiteIntelligenceEnabled && siteUrl && !siteIntelligence) {
          try {
            const result = await analyzeSiteIntelligence(siteUrl, ctx.user.id);
            siteIntelligence = result.siteIntelligence;
          } catch (error) {
            console.warn("[post.generate] Site intelligence unavailable:", error);
          }
        }
        if (siteIntelligence) {
          contextContent = siteIntelligence.evidence.map((item) => `[${item.kind}] ${item.text}`).join("\n").slice(0, 24e3);
          brandDnaContext = siteIntelligenceToPrompt(siteIntelligence);
        } else if (siteUrl) {
          const scrapeResult = await scrapeUrl(siteUrl);
          contextContent = `URL: ${siteUrl}
Titulo: ${scrapeResult.title}
Descricao: ${scrapeResult.description}
Conteudo: ${scrapeResult.content}`;
        }
        const generationPlan = await prepareGenerationPlan({
          sourceContent: contextContent,
          siteIntelligence,
          executionBrief: normalizedExecutionBrief
        });
        recordGenerationEvent({
          stage: "content_strategy",
          status: generationPlan.strategies.fallbackUsed ? "fallback" : "completed",
          detail: `${generationPlan.strategies.selected.length} strategies selected.`,
          data: generationPlan.strategies
        });
        if (input.creationMode === "execution" && normalizedExecutionBrief) {
          try {
            const briefing = await loadGenerationContext({
              userUuid: ctx.user.id,
              inputType: input.inputType,
              content: input.content,
              platform: input.platform,
              postMode: input.postMode,
              creationMode: input.creationMode,
              executionBrief: normalizedExecutionBrief,
              siteIntelligenceId: input.siteIntelligenceId
            });
            const routing = await routeHighTicketIntent(briefing);
            const intentStrategies = routing.angles.map(angleToStrategy);
            generationPlan.strategies.selected = intentStrategies;
            recordGenerationEvent({
              stage: "intent_router",
              status: routing.fallbackUsed ? "fallback" : "completed",
              detail: `Intent router produced ${intentStrategies.length} orthogonal angles.`,
              data: { intent: routing.intent, fallbackUsed: routing.fallbackUsed }
            });
          } catch (error) {
            recordGenerationEvent({
              stage: "intent_router",
              status: "fallback",
              detail: `Intent router failed, using planContentStrategies: ${error instanceof Error ? error.message : String(error)}`
            });
          }
        }
        const outcome = await generatePostVariations(
          {
            userUuid: ctx.user.id,
            request: {
              inputType: input.inputType,
              content: input.content,
              platform: input.platform,
              imageUrl: input.imageUrl,
              tone: input.tone,
              postMode: input.postMode,
              model: input.model,
              creationMode: input.creationMode
            },
            siteIntelligence,
            executionBrief: normalizedExecutionBrief,
            plan: generationPlan,
            aiLlmJudgeEnabled: ENV.aiLlmJudgeEnabled,
            // Cobre chamada principal + reparo (60 s cada em OPENROUTER_TASK_POLICY)
            // com folga para embeddings, juízes e persistência.
            deadlineMs: Date.now() + 15e4
          },
          {
            generate: (params) => invokeLLM(params),
            clock: () => Date.now(),
            assessOriginality: assessSemanticOriginality,
            // Reaproveita a busca já disparada no início do handler.
            loadRecentPosts: () => recentPostsPromise,
            trace: {
              id: generationTrace.id,
              recordEvent: (event) => recordGenerationEvent(event)
            }
          }
        );
        if (outcome.status === "approved") {
          const revisionCount = Math.max(
            0,
            ...outcome.snapshots.map(
              (snapshot) => snapshot.generationMeta?.revisionCount ?? 0
            )
          );
          await persistCandidateFingerprints({
            userUuid: ctx.user.id,
            generationRunId: generationTrace.id,
            candidates: outcome.snapshots,
            embeddings: outcome.originality.embeddings,
            assessments: outcome.originality.assessments
          });
          await finishGenerationTrace({
            trace: generationTrace,
            status: "completed",
            strategies: outcome.plan,
            evaluations: outcome.evaluations,
            revisionCount,
            strategyFallbackUsed: outcome.plan.strategies.fallbackUsed,
            originalityFallbackUsed: outcome.originality.fallbackUsed,
            output: outcome.snapshots
          });
          await appendOperationalLog("POST_GENERATION_COMPLETED", {
            generationRunId: generationTrace.id,
            userUuid: ctx.user.id,
            durationMs: Date.now() - generationTrace.startedAt,
            inputType: input.inputType,
            platform: input.platform,
            postMode: input.postMode,
            creationMode: input.creationMode,
            requestedModel: input.model ?? "llama",
            effectiveModels: Array.from(
              new Set(generationTrace.calls.map((call) => call.effectiveModel))
            ),
            siteIntelligenceId: siteIntelligence?.id,
            variationCount: outcome.snapshots.length,
            revisionCount,
            strategyFallbackUsed: outcome.plan.strategies.fallbackUsed,
            originalityFallbackUsed: outcome.originality.fallbackUsed,
            generativeCalls: outcome.metrics.generativeCalls,
            repairCalls: outcome.metrics.repairCalls,
            llmCalls: generationTrace.calls.map((call) => ({
              label: call.label,
              provider: call.provider,
              effectiveModel: call.effectiveModel,
              attempt: call.attempt,
              fallbackFrom: call.fallbackFrom,
              promptHash: call.promptHash,
              promptTokens: call.promptTokens,
              completionTokens: call.completionTokens,
              totalTokens: call.totalTokens,
              latencyMs: call.latencyMs,
              estimatedCostUsd: call.estimatedCostUsd,
              error: call.error
            })),
            outputSummary: outcome.snapshots.map(summarizeGeneratedVariation)
          });
          const committed = await commitSparkReservation(reservation.reservationId, generationTrace.id);
          if (!committed) {
            throw new Error(
              `commitSparkReservation(${reservation.reservationId}) retornou false \u2014 reserva n\xE3o confirmada; run terminado como falha terminal (refund aplicado no catch).`
            );
          }
          return {
            variations: outcome.snapshots,
            generationRunId: generationTrace.id,
            ...debugEnabled ? {
              debug: buildGenerationDebugTrace({
                trace: generationTrace,
                strategies: outcome.plan,
                evaluations: outcome.evaluations,
                output: outcome.snapshots
              })
            } : {}
          };
        }
        if (outcome.status === "rejected") {
          const issuesText = outcome.issues.map((issue) => issue.detail).join("; ");
          throw new TRPCError5({
            code: "BAD_GATEWAY",
            message: "A IA n\xE3o conseguiu produzir tr\xEAs varia\xE7\xF5es v\xE1lidas e distintas. Tente novamente.",
            cause: new Error(issuesText)
          });
        }
        throw new TRPCError5({
          code: outcome.error.kind === "deadline" ? "GATEWAY_TIMEOUT" : "INTERNAL_SERVER_ERROR",
          message: "Falha operacional durante a gera\xE7\xE3o. Tente novamente.",
          cause: new Error(outcome.error.message)
        });
      } catch (error) {
        const refunded = await refundSparkReservation(
          reservation.reservationId,
          error instanceof Error ? error.message : "Generation failed"
        );
        const refundNote = refunded ? "" : ` [SPARK_REFUND_FAILED: refundSparkReservation(${reservation.reservationId}) retornou false \u2014 reserva pode ter ficado pendente; a\xE7\xE3o manual necess\xE1ria]`;
        if (!refunded) {
          await appendOperationalLog("SPARK_REFUND_FAILED", {
            reservationId: reservation.reservationId,
            generationRunId: generationTrace.id,
            userUuid: ctx.user.id,
            originalError: error instanceof Error ? error.message : "Generation failed"
          });
        }
        await finishGenerationTrace({
          trace: generationTrace,
          status: "failed",
          error: `${error instanceof Error ? error.message : "Generation failed"}${refundNote}`
        });
        await appendOperationalLog("POST_GENERATION_FAILED", {
          generationRunId: generationTrace.id,
          userUuid: ctx.user.id,
          durationMs: Date.now() - generationTrace.startedAt,
          inputType: input.inputType,
          platform: input.platform,
          postMode: input.postMode,
          creationMode: input.creationMode,
          requestedModel: input.model ?? "llama",
          siteIntelligenceId: generationTrace.siteIntelligenceId,
          llmCalls: generationTrace.calls.map((call) => ({
            label: call.label,
            provider: call.provider,
            effectiveModel: call.effectiveModel,
            attempt: call.attempt,
            fallbackFrom: call.fallbackFrom,
            promptHash: call.promptHash,
            promptTokens: call.promptTokens,
            completionTokens: call.completionTokens,
            totalTokens: call.totalTokens,
            latencyMs: call.latencyMs,
            estimatedCostUsd: call.estimatedCostUsd,
            error: call.error
          })),
          error
        });
        throw error;
      }
    }),
    /** Generate image for a post */
    generateImage: protectedProcedure.input(
      z5.object({
        prompt: z5.string().min(1)
      })
    ).mutation(async ({ input, ctx }) => {
      const email = ctx.user.email ?? "dev@local.dev";
      const profile = await getBillingProfile(email);
      const debit = await debitSparks(profile.id, SPARK_COSTS.GENERATE_IMAGE, "Gera\xE7\xE3o de imagem IA");
      if (!debit.success) {
        throw new TRPCError5({
          code: "PAYMENT_REQUIRED",
          message: "Sparks insuficientes. Fa\xE7a upgrade ou adquira um pacote de recarga."
        });
      }
      const result = await generateImage({
        prompt: input.prompt
      });
      return { imageUrl: result.url || "" };
    }),
    /** Scrape URL for content extraction */
    scrapeUrl: protectedProcedure.input(
      z5.object({
        url: z5.string().url()
      })
    ).mutation(async ({ input }) => {
      return scrapeUrl2(input.url);
    }),
    /** Save a post to the database */
    save: protectedProcedure.input(
      z5.object({
        inputType: inputTypeSchema,
        inputContent: z5.string(),
        platform: platformSchema,
        headline: z5.string().optional(),
        body: z5.string().optional(),
        caption: z5.string().optional(),
        hashtags: z5.array(z5.string()).optional(),
        callToAction: z5.string().optional(),
        tone: z5.string().optional(),
        imagePrompt: z5.string().optional(),
        imageUrl: z5.string().optional(),
        backgroundColor: z5.string().optional(),
        textColor: z5.string().optional(),
        accentColor: z5.string().optional(),
        layout: postLayoutSchema.optional(),
        postMode: postModeSchema.optional(),
        slides: z5.array(carouselSlideSchema).optional(),
        textElements: z5.array(textElementSchema).optional(),
        imageSettings: imageSettingsSchema.optional(),
        layoutSettings: advancedLayoutSettingsSchema.optional(),
        bgValue: backgroundValueSchema.optional(),
        bgOverlay: bgOverlaySettingsSchema.optional(),
        copyAngle: copyAngleSchema.optional(),
        variationSnapshot: postVisualSnapshotSchema.optional()
      })
    ).mutation(async ({ input, ctx }) => {
      try {
        const validatedSnapshot = input.variationSnapshot ? postVisualSnapshotSchema.parse(input.variationSnapshot) : void 0;
        const postId = await createPost({
          ...input,
          variationSnapshot: validatedSnapshot,
          userUuid: ctx.user.id
        });
        return { id: postId };
      } catch (error) {
        const rawMessage = String(error?.message || "");
        if (rawMessage.includes("Saved posts limit reached for plan")) {
          const profile = await getBillingProfile(ctx.user.email ?? "dev@local.dev");
          throw new TRPCError5({
            code: "FORBIDDEN",
            message: resolveSaveLimitMessage(profile.plan)
          });
        }
        throw error;
      }
    }),
    /** Update a post */
    update: protectedProcedure.input(
      z5.object({
        id: z5.number(),
        headline: z5.string().optional(),
        body: z5.string().optional(),
        caption: z5.string().optional(),
        hashtags: z5.array(z5.string()).optional(),
        callToAction: z5.string().optional(),
        imageUrl: z5.string().optional(),
        backgroundColor: z5.string().optional(),
        textColor: z5.string().optional(),
        accentColor: z5.string().optional(),
        layout: postLayoutSchema.optional(),
        postMode: postModeSchema.optional(),
        slides: z5.array(carouselSlideSchema).optional(),
        textElements: z5.array(textElementSchema).optional(),
        imageSettings: imageSettingsSchema.optional(),
        layoutSettings: advancedLayoutSettingsSchema.optional(),
        bgValue: backgroundValueSchema.optional(),
        bgOverlay: bgOverlaySettingsSchema.optional(),
        copyAngle: copyAngleSchema.optional(),
        variationSnapshot: postVisualSnapshotSchema.optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const validatedSnapshot = input.variationSnapshot ? postVisualSnapshotSchema.parse(input.variationSnapshot) : void 0;
      await updatePost(input.id, ctx.user.id, { ...input, variationSnapshot: validatedSnapshot });
      return { success: true };
    }),
    /** List user's posts */
    list: protectedProcedure.query(async ({ ctx }) => {
      return getUserPosts(ctx.user.id);
    }),
    /** List user's generation history */
    listGenerations: protectedProcedure.input(
      z5.object({
        limit: z5.number().int().min(1).max(100).default(50),
        offset: z5.number().int().min(0).default(0)
      }).optional()
    ).query(async ({ input, ctx }) => {
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;
      return getUserGenerationRuns(ctx.user.id, limit, offset);
    }),
    /** Get single generation by ID */
    getGeneration: protectedProcedure.input(z5.object({ id: z5.string().uuid() })).query(async ({ input, ctx }) => {
      const generation = await getGenerationRunById(input.id, ctx.user.id);
      if (!generation) {
        throw new TRPCError5({
          code: "NOT_FOUND",
          message: "Gera\xE7\xE3o n\xE3o encontrada."
        });
      }
      return generation;
    }),
    /** Get single post */
    get: protectedProcedure.input(z5.object({ id: z5.number() })).query(async ({ input, ctx }) => {
      return getPostById(input.id, ctx.user.id);
    }),
    /** Generate background image via OpenRouter, with Pollinations as fallback */
    generateBackground: protectedProcedure.input(
      z5.object({
        prompt: z5.string().min(1),
        provider: z5.enum(["pollinations_fast", "pollinations_hd"]).default("pollinations_fast")
      })
    ).mutation(async ({ input, ctx }) => {
      const email = ctx.user.email ?? "dev@local.dev";
      const profile = await getBillingProfile(email);
      const debit = await debitSparks(profile.id, SPARK_COSTS.GENERATE_IMAGE, "Gera\xE7\xE3o de imagem de fundo");
      if (!debit.success) {
        throw new TRPCError5({
          code: "PAYMENT_REQUIRED",
          message: "Sparks insuficientes. Fa\xE7a upgrade ou adquira um pacote de recarga."
        });
      }
      const imageData = await generateBackgroundImage(input.prompt, input.provider);
      return { imageData };
    }),
    saveBackgroundAsset: protectedProcedure.input(
      z5.object({
        imageUrl: z5.string().min(1),
        sourceType: z5.enum(["ai", "upload", "gallery"]),
        prompt: z5.string().optional(),
        label: z5.string().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      let finalImageUrl = input.imageUrl;
      if (input.imageUrl.startsWith("data:image/")) {
        const { buffer, contentType, extension } = decodeDataUrl(input.imageUrl);
        const key = `users/${ctx.user.id}/backgrounds/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
        const uploaded = await storagePut(key, buffer, contentType);
        finalImageUrl = uploaded.url;
      }
      const asset = await createBackgroundAsset({
        userUuid: ctx.user.id,
        imageUrl: finalImageUrl,
        sourceType: input.sourceType,
        prompt: input.prompt,
        label: input.label
      });
      return asset;
    }),
    listSavedBackgrounds: protectedProcedure.query(async ({ ctx }) => {
      return getUserBackgroundAssets(ctx.user.id);
    }),
    /** Automatically adjust layout based on current canvas */
    autoPilotDesign: protectedProcedure.input(
      z5.object({
        imageBase64: z5.string(),
        currentState: z5.any()
      })
    ).mutation(async ({ input }) => {
      const systemPrompt = `
Voc\xEA \xE9 um Diretor de Arte Assistente focado estritamente em Ajuste de Propor\xE7\xE3o, Margens de Respiro e Legibilidade Adaptativa (WCAG).

O usu\xE1rio fez altera\xE7\xF5es Manuais de posicionamento (drag and drop) nos elementos visuais do post. Voc\xEA recebeu o estado atual desses elementos no campo "elements" do JSON e a imagem correspondente.

SUA MISS\xC3O N\xC3O \xC9 REINVENTAR O DESIGN, MAS SIM ADAPT\xC1-LO PARA O NOVO ASPECT RATIO (${input.currentState.aspectRatio}) PROTEGENDO A INTEN\xC7\xC3O DO USU\xC1RIO.

DIRETRIZES R\xCDGIDAS:
1. Respeite as posi\xE7\xF5es centrais enviadas em "elements". Se um elemento foi movido para perto de uma borda ou canto, mantenha a inten\xE7\xE3o de proximidade daquele canto, aplicando apenas pequenos recuos (paddings de seguran\xE7a) para o texto n\xE3o vazar a tela f\xEDsica.
2. N\xE3o mude elementos de lugar drasticamente (ex: se o t\xEDtulo est\xE1 no topo, n\xE3o o jogue para a base).
3. Ajuste o tamanho do bloco (width) ou o tamanho da fonte apenas se o novo aspectRatio encolheu o espa\xE7o horizontal dispon\xEDvel, for\xE7ando quebras de linha mais elegantes.
4. Se houver sobreposi\xE7\xE3o (interse\xE7\xE3o indesejada) criada pela mudan\xE7a de propor\xE7\xE3o de tela, fa\xE7a uma micro-corre\xE7\xE3o no eixo Y para afastar os blocos, preservando a ordem de leitura de cima para baixo.

JSON DO ESTADO ATUAL DO USU\xC1RIO:
${JSON.stringify(input.currentState, null, 2)}

Devolva as sugest\xF5es respeitando estritamente os IDs recebidos. N\xE3o invente novos elementos.
`;
      const response = await invokeLLM({
        traceLabel: "auto_pilot_design",
        taskRoute: "vision_analysis",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analise a imagem e o posicionamento abaixo para gerar o JSON refatorado."
              },
              { type: "image_url", image_url: { url: input.imageBase64 } }
            ]
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "auto_pilot_design",
            strict: true,
            schema: {
              type: "object",
              properties: {
                score: {
                  type: "number",
                  description: "Sua nota para o design inicial (0 a 100)"
                },
                feedback: {
                  type: "string",
                  description: "Descri\xE7\xE3o curta em portugu\xEAs sobre o erro vis\xEDvel e por que voc\xEA corrigiu do jeito que corrigiu."
                },
                textColor: {
                  type: "string",
                  description: "Cor HEX sugerida para os textos principais"
                },
                suggestedElements: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      x: { type: "number" },
                      y: { type: "number" },
                      width: { type: "number" },
                      textAlign: {
                        type: "string",
                        enum: ["left", "center", "right"]
                      },
                      backgroundColor: { type: "string" },
                      borderRadius: { type: "number" }
                    },
                    required: ["id", "x", "y", "width", "textAlign", "backgroundColor", "borderRadius"],
                    additionalProperties: false
                  }
                },
                suggestedLayoutMoves: {
                  type: "object",
                  properties: {
                    headline: {
                      type: "object",
                      properties: {
                        x: { type: "number" },
                        y: { type: "number" },
                        width: { type: "number" },
                        textAlign: { type: "string" },
                        backgroundColor: { type: "string" },
                        borderRadius: { type: "number" }
                      },
                      required: ["x", "y", "width", "textAlign", "backgroundColor", "borderRadius"],
                      additionalProperties: false
                    },
                    body: {
                      type: "object",
                      properties: {
                        x: { type: "number" },
                        y: { type: "number" },
                        width: { type: "number" },
                        textAlign: { type: "string" },
                        backgroundColor: { type: "string" },
                        borderRadius: { type: "number" }
                      },
                      required: ["x", "y", "width", "textAlign", "backgroundColor", "borderRadius"],
                      additionalProperties: false
                    },
                    textColor: {
                      type: "string",
                      description: "Cor HEX sugerida para todos os textos"
                    }
                  },
                  required: ["textColor"],
                  additionalProperties: false
                }
              },
              required: ["score", "feedback", "textColor", "suggestedElements", "suggestedLayoutMoves"],
              additionalProperties: false
            }
          }
        }
      });
      const content = response.choices[0]?.message?.content;
      const contentStr = typeof content === "string" ? content : Array.isArray(content) ? content.filter((c) => c.type === "text").map((c) => c.text).join("\n") : "{}";
      const parsed = safeJsonParse(contentStr, {});
      return parsed;
    }),
    /** List curated background images grouped by category */
    listBackgrounds: publicProcedure.query(() => {
      const bgRoot = path3.join(process.cwd(), "client", "public", "images", "backgrounds");
      try {
        const categories = fs2.readdirSync(bgRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((dir) => {
          const catPath = path3.join(bgRoot, dir.name);
          const images = fs2.readdirSync(catPath).filter((f) => /\.(webp|jpg|jpeg|png|gif|svg)$/i.test(f)).map((f) => `/images/backgrounds/${encodeURIComponent(dir.name)}/${encodeURIComponent(f)}`);
          return { id: dir.name, name: dir.name, images };
        }).filter((c) => c.images.length > 0);
        return categories;
      } catch {
        return [];
      }
    }),
    /** Analyze brand from URL and return theme variations */
    analyzeBrand: protectedProcedure.input(
      z5.object({
        url: z5.string().url()
      })
    ).mutation(async ({ input, ctx }) => {
      const email = ctx.user.email ?? "dev@local.dev";
      const profile = await getBillingProfile(email);
      const debit = await debitSparks(profile.id, SPARK_COSTS.CHAMELEON, "ChameleonProtocol \u2014 an\xE1lise de marca");
      if (!debit.success) {
        throw new TRPCError5({
          code: "PAYMENT_REQUIRED",
          message: "Sparks insuficientes. Fa\xE7a upgrade ou adquira um pacote de recarga."
        });
      }
      const brandAnalysis = await analyzeBrandFromUrl(input.url);
      const themeVariations = generateCardThemeVariations(brandAnalysis);
      return {
        brandAnalysis,
        themeVariations
      };
    }),
    /** Extract visual styles from a website URL (Pomelli-inspired hybrid pipeline) */
    extractStyles: protectedProcedure.input(
      z5.object({
        url: z5.string().url()
      })
    ).mutation(async ({ input }) => {
      const { data: extractedData, visionUsed } = await extractStyleFromUrlWithMeta(input.url);
      const defaultColors = /* @__PURE__ */ new Set(["#6366f1", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"]);
      const realColors = extractedData.colors.palette.filter((c) => !defaultColors.has(c));
      const fallbackUsed = realColors.length === 0;
      const designPatterns = await analyzeDesignPattern(extractedData, input.url);
      const themes = generateThemesFromPatterns(designPatterns, extractedData, input.url);
      return {
        extractedData,
        designPatterns,
        themes,
        fallbackUsed,
        visionUsed
      };
    }),
    /**
     * Extract full Brand DNA from a website URL (Tom & Matiz enhanced pipeline).
     * Multi-page screenshots + Gemini Vision + synthesis + musical composition mapping.
     * Cost: 20 Sparks (replaces the 15✦ ChameleonProtocol)
     */
    extractBrandDNA: protectedProcedure.input(
      z5.object({
        url: z5.string().url(),
        debug: z5.boolean().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      if (!ENV.aiSiteIntelligenceEnabled) {
        throw new TRPCError5({
          code: "SERVICE_UNAVAILABLE",
          message: "A inteligencia de site esta temporariamente desativada."
        });
      }
      const email = ctx.user.email ?? "dev@local.dev";
      const profile = await getBillingProfile(email);
      const debit = await debitSparks(profile.id, 20, "Brand DNA \u2014 extra\xE7\xE3o multi-p\xE1gina + an\xE1lise visual");
      if (!debit.success) {
        throw new TRPCError5({
          code: "PAYMENT_REQUIRED",
          message: "Sparks insuficientes. Fa\xE7a upgrade ou adquira um pacote de recarga."
        });
      }
      const extractionTrace = startGenerationTrace({
        userUuid: ctx.user.id,
        inputType: "url",
        inputContent: input.url,
        platform: "site-intelligence",
        postMode: "analysis",
        creationMode: "site-intelligence",
        requestedModel: "gemini"
      });
      recordGenerationEvent({
        stage: "site_collection",
        status: "started",
        detail: "Shared site collection and specialist analysis started."
      });
      const result = await analyzeSiteIntelligence(input.url, ctx.user.id);
      recordGenerationEvent({
        stage: "site_compilation",
        status: result.fallbackUsed ? "fallback" : "completed",
        detail: "Semantic and visual analyses compiled into SiteIntelligence.",
        data: {
          siteIntelligenceId: result.siteIntelligence.id,
          quality: result.siteIntelligence.quality
        }
      });
      return {
        ...result,
        ...input.debug && ENV.aiUiDebugEnabled ? {
          debug: buildGenerationDebugTrace({
            trace: extractionTrace
          })
        } : {}
      };
    }),
    /**
     * Evaluate quality of generated post variations (LLM-as-Judge).
     * Inspired by Pomelli's evaluation methodology: NIMA aesthetics, VQAScore, brand alignment.
     * Cost: 0 Sparks (quality signal — included as product differentiator)
     *
     * Variations are passed directly from the client (already in memory after generation).
     */
    evaluateQuality: protectedProcedure.input(
      z5.object({
        variations: z5.array(
          z5.object({
            id: z5.string(),
            headline: z5.string(),
            body: z5.string(),
            callToAction: z5.string(),
            backgroundColor: z5.string(),
            textColor: z5.string(),
            accentColor: z5.string(),
            layout: z5.string(),
            platform: z5.string()
          })
        ),
        brandDNA: z5.object({
          brandName: z5.string(),
          industry: z5.string(),
          colors: z5.object({ primary: z5.string() }),
          composition: z5.object({ dynamics: z5.string() }),
          personality: z5.object({
            seriousPlayful: z5.number(),
            boldSubtle: z5.number(),
            luxuryAccessible: z5.number(),
            modernClassic: z5.number(),
            warmCool: z5.number()
          }),
          emotionalProfile: z5.object({ mood: z5.string() })
        }).optional()
      })
    ).mutation(async ({ input }) => {
      if (input.variations.length === 0) {
        return { evaluations: [] };
      }
      const evaluations = await evaluatePostQuality(input.variations, input.brandDNA);
      return { evaluations };
    })
  })
});
async function scrapeUrl2(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PostSpark/1.0)",
        Accept: "text/html"
      },
      signal: AbortSignal.timeout(1e4)
    });
    const html = await response.text();
    const getMetaContent = (htmlSource, property) => {
      const p1 = new RegExp(`< meta[^>] * property=["']${property}["'][^>]*content=["']([^ "']*)["']`, "i");
      const p2 = new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']*)["']`, "i");
      const m1 = htmlSource.match(p1);
      if (m1?.[1]) return m1[1];
      const m2 = htmlSource.match(p2);
      if (m2?.[1]) return m2[1];
      return "";
    };
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = getMetaContent(html, "og:title") || (titleMatch?.[1] || "").trim();
    const description = getMetaContent(html, "og:description") || getMetaContent(html, "description");
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyHtml = bodyMatch?.[1] || "";
    const textContent = bodyHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ").replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return {
      title,
      description,
      content: textContent.substring(0, 1e4)
      // Limit reasonable amount for context
    };
  } catch (error) {
    console.warn("Failed to scrape URL:", url, error);
    return {
      title: "",
      description: "",
      content: ""
    };
  }
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
init_env();
import { parse as parseCookieHeader } from "cookie";
import { createClient as createClient6 } from "@supabase/supabase-js";
var _supabaseAuthClient = null;
function getSupabaseAuthClient() {
  if (!_supabaseAuthClient) {
    if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
    }
    _supabaseAuthClient = createClient6(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
      auth: { persistSession: false }
    });
  }
  return _supabaseAuthClient;
}
var SDKServer = class {
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  /**
   * Auth 100% Supabase:
   * - le access token do cookie bridge
   * - valida com supabase.auth.getUser(token)
   */
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    const accessToken = cookies.get(COOKIE_NAME);
    if (!accessToken) {
      throw ForbiddenError("Missing session token");
    }
    const supabase = getSupabaseAuthClient();
    const {
      data: { user },
      error
    } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      throw ForbiddenError("Invalid or expired session");
    }
    if (!(process.env.NODE_ENV === "development" && process.env.BYPASS_AUTH === "true")) {
      const hasAccess = await hasPostSparkAccess(user.id);
      if (!hasAccess) {
        throw ForbiddenError("PostSpark access required");
      }
    }
    const metadata = user.user_metadata ?? {};
    const nameFromMetadata = typeof metadata.full_name === "string" ? metadata.full_name : typeof metadata.name === "string" ? metadata.name : null;
    const phoneFromMetadata = typeof metadata.phone === "string" ? metadata.phone : null;
    const companyFromMetadata = typeof metadata.company === "string" ? metadata.company : null;
    const roleFromMetadata = typeof user.app_metadata?.role === "string" ? user.app_metadata.role : null;
    return {
      id: user.id,
      email: user.email ?? null,
      name: nameFromMetadata,
      phone: phoneFromMetadata,
      company: companyFromMetadata,
      role: roleFromMetadata
    };
  }
};
var sdk = new SDKServer();

// server/_core/context.ts
var DEV_USER = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Dev User",
  email: "dev@local.dev",
  role: "admin"
};
async function createContext(opts) {
  if (process.env.NODE_ENV === "development" && process.env.BYPASS_AUTH === "true") {
    return { req: opts.req, res: opts.res, user: DEV_USER };
  }
  try {
    const user = await sdk.authenticateRequest(opts.req);
    return {
      req: opts.req,
      res: opts.res,
      user
    };
  } catch {
    return { req: opts.req, res: opts.res, user: null };
  }
}

// server/_core/vite.ts
import express from "express";
import fs3 from "fs";
import { nanoid } from "nanoid";
import path4 from "path";
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    // Let Vite load vite.config.ts on its own (do NOT import it here,
    // otherwise esbuild will embed it + all its devDependencies into the bundle)
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path4.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs3.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const candidatePaths = [
    path4.resolve(import.meta.dirname, "../dist/public"),
    path4.resolve(process.cwd(), "dist/public"),
    path4.resolve(import.meta.dirname, "../../dist/public"),
    path4.resolve(import.meta.dirname, "public"),
    path4.resolve(import.meta.dirname, "..", "client", "dist")
  ];
  const distPath = candidatePaths.find((p) => fs3.existsSync(p)) || path4.resolve(process.cwd(), "dist/public");
  if (!fs3.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path4.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
init_env();

// server/_core/analytics.ts
init_db();
async function trackPageView(data) {
  try {
    const { path: path5, referrer, timestamp } = data;
    const pathCategory = categorizePath(path5);
    let referrerDomain;
    if (referrer) {
      try {
        const url = new URL(referrer);
        referrerDomain = url.hostname;
      } catch {
      }
    }
    try {
      await getDb().schema("postspark").from("analytics_pageviews").insert({
        path: path5,
        path_category: pathCategory,
        referrer_domain: referrerDomain || null,
        timestamp: new Date(timestamp).toISOString(),
        created_at: /* @__PURE__ */ new Date()
      });
    } catch (error) {
      console.log("[Analytics] PageView:", {
        path: path5,
        pathCategory,
        referrerDomain
      });
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[Analytics] Table analytics_pageviews does not exist. Create it for proper analytics."
        );
      }
    }
  } catch (error) {
    console.error("[Analytics] Error tracking page view:", error);
  }
}
async function trackEvent(data) {
  try {
    const { event, properties, timestamp } = data;
    const sanitizedProperties = sanitizeProperties(properties || {});
    try {
      await getDb().schema("postspark").from("analytics_events").insert({
        event_name: event,
        properties: sanitizedProperties,
        timestamp: new Date(timestamp).toISOString(),
        created_at: /* @__PURE__ */ new Date()
      });
    } catch (error) {
      console.log("[Analytics] Event:", {
        event,
        properties: sanitizedProperties
      });
    }
  } catch (error) {
    console.error("[Analytics] Error tracking event:", error);
  }
}
function categorizePath(path5) {
  if (path5 === "/") return "home";
  if (path5.startsWith("/pricing")) return "pricing";
  if (path5.startsWith("/billing")) return "billing";
  if (path5.startsWith("/privacy")) return "privacy";
  if (path5.startsWith("/terms")) return "legal";
  if (path5.startsWith("/cookies")) return "legal";
  if (path5.includes("/post/")) return "post_detail";
  if (path5.includes("/settings")) return "settings";
  return "other";
}
function sanitizeProperties(properties) {
  const sanitized = {};
  const sensitiveKeys = [
    "email",
    "uuid",
    "userid",
    "user_id",
    "token",
    "password",
    "secret",
    "apikey",
    "api_key"
  ];
  for (const [key, value] of Object.entries(properties)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
      continue;
    }
    if (typeof value === "string") {
      sanitized[key] = value.length > 500 ? value.substring(0, 500) + "..." : value;
    } else if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        sanitized[key] = value.slice(0, 10);
      } else {
        sanitized[key] = sanitizeProperties(value);
      }
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// server/_core/index.ts
var fontAvailability = checkAvailability(ALL_FONTS);
if (fontAvailability.missing.length > 0) {
  console.error(
    `[typography] ${fontAvailability.missing.length} fonte(s) ausente(s) em ${FONT_DIR}: ` + fontAvailability.missing.map((entry) => entry.family).join(", ") + " \u2014 snapshots v\xE3o cair no caminho legado e sobrepor texto."
  );
  void appendOperationalLog("TYPOGRAPHY_FONTS_MISSING", {
    fontDir: FONT_DIR,
    missing: fontAvailability.missing.map((entry) => entry.family)
  });
}
function isPortAvailable(port) {
  return new Promise((resolve2) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve2(true));
    });
    server.on("error", () => resolve2(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
installConsoleErrorFileLogging();
var app = express2();
app.use(httpStatusFileLogger);
app.post(
  "/api/stripe/webhook",
  express2.raw({ type: "application/json" }),
  async (req, res) => {
    if (!ENV.stripeWebhookSecret || !ENV.stripeSecretKey) {
      res.status(503).json({ error: "Billing not configured" });
      return;
    }
    const sig = req.headers["stripe-signature"];
    if (!sig) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }
    try {
      const stripe = getStripe();
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        ENV.stripeWebhookSecret
      );
      await handleStripeWebhook(event);
      res.json({ received: true });
    } catch (err) {
      console.error("[Webhook] Error:", err.message);
      res.status(400).json({ error: err.message });
    }
  }
);
app.use(express2.json({ limit: "50mb" }));
app.use(express2.urlencoded({ limit: "50mb", extended: true }));
app.post("/api/extract", async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string") {
    res.status(400).json({ success: false, error: "Missing or invalid URL" });
    return;
  }
  try {
    const [desktopBuffer, mobileBuffer] = await Promise.all([
      captureScreenshot(url, "desktop"),
      captureScreenshot(url, "mobile")
    ]);
    const desktopSizeKB = desktopBuffer ? (desktopBuffer.byteLength / 1024).toFixed(2) : 0;
    const mobileSizeKB = mobileBuffer ? (mobileBuffer.byteLength / 1024).toFixed(2) : 0;
    res.json({
      success: true,
      url,
      desktopSizeKB: Number(desktopSizeKB),
      mobileSizeKB: Number(mobileSizeKB)
    });
  } catch (error) {
    console.error("[/api/extract] Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/analytics/pageview", async (req, res) => {
  try {
    const { path: path5, referrer, timestamp } = req.body;
    await trackPageView({ path: path5, referrer, timestamp });
    res.json({ received: true });
  } catch (error) {
    console.error("[Analytics] Error:", error.message);
    res.status(400).json({ error: error.message });
  }
});
app.post("/api/analytics/event", async (req, res) => {
  try {
    const { event, properties, timestamp } = req.body;
    await trackEvent({ event, properties, timestamp });
    res.json({ received: true });
  } catch (error) {
    console.error("[Analytics] Error:", error.message);
    res.status(400).json({ error: error.message });
  }
});
app.post("/api/brand-dna", async (req, res) => {
  if (!ENV.aiSiteIntelligenceEnabled) {
    return res.status(503).json({ error: "Site intelligence is temporarily disabled" });
  }
  const { url } = req.body;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing or invalid URL" });
  }
  try {
    const result = await analyzeSiteIntelligence(
      url,
      "00000000-0000-0000-0000-000000000000",
      { persist: false }
    );
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error("[/api/brand-dna] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});
registerSupabaseAuthRoutes(app);
app.use(
  ["/api/trpc", "/trpc"],
  createExpressMiddleware({
    router: appRouter,
    createContext
  })
);
async function startServer() {
  const server = createServer(app);
  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }
  }
  if (!process.env.VERCEL) {
    const preferredPort = parseInt(process.env.PORT || "3000");
    const port = await findAvailablePort(preferredPort);
    if (port !== preferredPort) {
      console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
    }
    server.listen(port, () => {
      console.log(`Server running on http://localhost:${port}/`);
    });
  }
}
startServer().catch(console.error);
var index_default = app;
export {
  index_default as default
};
