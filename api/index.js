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
      openRouterImageModel: process.env.OPENROUTER_IMAGE_MODEL ?? "google/gemini-3.1-flash-image",
      openRouterPlatformFeePercent: parseFloat(process.env.OPENROUTER_PLATFORM_FEE_PERCENT || "5.5"),
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
import { createClient as createClient3 } from "@supabase/supabase-js";
function getSupabaseDbClient() {
  if (!_supabaseDbClient) {
    if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
    }
    _supabaseDbClient = createClient3(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
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
  const { error } = await db.from("generation_runs").insert({
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
    error_message: input.errorMessage ?? null
  });
  if (error) {
    throw new Error(`[Database] createGenerationRun failed: ${error.message}`);
  }
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
    "status,candidate_count,accepted_count,average_quality_score,revision_count,strategy_fallback_used,originality_fallback_used,prompt_snapshot,total_tokens,estimated_cost_usd,latency_ms"
  ).gte("createdAt", since);
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
  const llmCalls = rows.flatMap(
    (row) => Array.isArray(row.prompt_snapshot) ? row.prompt_snapshot : []
  );
  const fallbackRuns = rows.filter(
    (row) => row.strategy_fallback_used || row.originality_fallback_used || Array.isArray(row.prompt_snapshot) && row.prompt_snapshot.some((call) => Boolean(call?.fallbackFrom))
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

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
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
import { appendFile } from "fs/promises";
import path from "path";
import { inspect } from "util";
var LOG_FILE = path.resolve(process.cwd(), "OPERATIONAL_ERRORS.txt");
var MAX_FIELD_LENGTH = 4e3;
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
    if (res.statusCode === 200) return;
    void appendOperationalLog("HTTP_NON_200", {
      method: req.method,
      url: req.originalUrl || req.url,
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
import { createHash, randomUUID } from "node:crypto";
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
  return createHash("sha256").update(JSON.stringify(messages)).digest("hex");
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
  const redactedInput = `[sha256:${createHash("sha256").update(trace.inputContent).digest("hex")}]`;
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
      promptSnapshot: trace.calls.map(({ messages: _messages, response: _response, ...call }) => call),
      strategySnapshot: ENV.aiTraceStoreContent ? input.strategies : void 0,
      evaluationSnapshot: input.evaluations,
      outputSnapshot: ENV.aiTraceStoreContent ? input.output : void 0,
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
function validateNode(value, schema, root, path4, errors) {
  if (typeof schema.$ref === "string") {
    const resolved = resolveReference(root, schema.$ref);
    if (!resolved) {
      errors.push(`${path4}: referencia de schema nao resolvida`);
      return;
    }
    validateNode(value, resolved, root, path4, errors);
    return;
  }
  if ("const" in schema && value !== schema.const) {
    errors.push(`${path4}: valor diferente do const`);
    return;
  }
  if (Array.isArray(schema.allOf)) {
    for (const childSchema of schema.allOf) {
      if (childSchema && typeof childSchema === "object") {
        validateNode(
          value,
          childSchema,
          root,
          path4,
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
        path4,
        candidateErrors
      );
      return candidateErrors.length === 0;
    }).length;
    if (combinator === "anyOf" && matches === 0 || combinator === "oneOf" && matches !== 1) {
      errors.push(`${path4}: nao satisfaz ${combinator}`);
      return;
    }
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${path4}: valor fora do enum`);
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
        path4,
        candidateErrors
      );
      return candidateErrors.length === 0;
    });
    if (!matchesType) errors.push(`${path4}: tipo nao permitido`);
    return;
  }
  if (type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${path4}: deveria ser objeto`);
      return;
    }
    const record = value;
    const properties = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required.filter((item) => typeof item === "string") : [];
    for (const key of required) {
      if (!(key in record)) errors.push(`${path4}.${key}: campo obrigatorio ausente`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(record)) {
        if (!(key in properties)) errors.push(`${path4}.${key}: propriedade extra`);
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (key in record) {
        validateNode(record[key], childSchema, root, `${path4}.${key}`, errors);
      }
    }
    return;
  }
  if (type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path4}: deveria ser array`);
      return;
    }
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${path4}: itens abaixo do minimo`);
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      errors.push(`${path4}: itens acima do maximo`);
    }
    if (schema.items && typeof schema.items === "object") {
      value.forEach(
        (item, index) => validateNode(
          item,
          schema.items,
          root,
          `${path4}[${index}]`,
          errors
        )
      );
    }
    return;
  }
  if (type === "string") {
    if (typeof value !== "string") {
      errors.push(`${path4}: deveria ser string`);
      return;
    }
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${path4}: texto abaixo do tamanho minimo`);
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      errors.push(`${path4}: texto acima do tamanho maximo`);
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path4}: texto fora do pattern`);
    }
  } else if (type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
    errors.push(`${path4}: deveria ser number`);
  } else if (type === "integer" && (typeof value !== "number" || !Number.isInteger(value))) {
    errors.push(`${path4}: deveria ser integer`);
  } else if (type === "boolean" && typeof value !== "boolean") {
    errors.push(`${path4}: deveria ser boolean`);
  } else if (type === "null" && value !== null) {
    errors.push(`${path4}: deveria ser null`);
  }
  if ((type === "number" || type === "integer") && typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(`${path4}: numero abaixo do minimo`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push(`${path4}: numero acima do maximo`);
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
    timeoutMs: 35e3
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
    timeoutMs: 25e3
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
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
function collectImageCandidates(value, output = []) {
  if (!value) return output;
  if (typeof value === "string") {
    if (value.startsWith("data:image/") || /^https?:\/\//i.test(value) || value.length > 500 && /^[A-Za-z0-9+/=\s]+$/.test(value)) {
      output.push(value.trim());
    }
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectImageCandidates(item, output));
    return output;
  }
  if (typeof value === "object") {
    Object.values(value).forEach(
      (item) => collectImageCandidates(item, output)
    );
  }
  return output;
}
async function toDataUri(candidate) {
  if (candidate.startsWith("data:image/")) return candidate;
  if (/^https?:\/\//i.test(candidate)) {
    const response = await fetch(candidate);
    if (!response.ok) {
      throw new Error(`Image URL fetch failed: ${response.status} ${response.statusText}`);
    }
    const contentType = response.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  }
  return `data:image/png;base64,${candidate.replace(/\s/g, "")}`;
}
async function generateWithOpenRouter(prompt, provider) {
  if (!ENV.openRouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured for image generation");
  }
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
  const candidate = collectImageCandidates(json)[0];
  if (!candidate) {
    throw new Error("OpenRouter image response did not contain an image payload");
  }
  return toDataUri(candidate);
}
async function generateWithPollinations(prompt, provider) {
  const modelId = provider === "pollinations_hd" ? "nanobanana-pro" : "nanobanana";
  const encodedPrompt = encodeURIComponent(wrapPrompt(prompt));
  const url = `https://gen.pollinations.ai/image/${encodedPrompt}?model=${modelId}&nologo=true&width=1080&height=1080&enhance=true`;
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
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}
async function generateBackgroundImage(prompt, provider = "pollinations_fast") {
  console.log(`[ImageGen] Request: provider=${provider}, prompt="${prompt.substring(0, 50)}..."`);
  try {
    const image = await generateWithOpenRouter(prompt, provider);
    void appendOperationalLog("IMAGE_PROVIDER_200", {
      provider: "openrouter",
      model: ENV.openRouterImageModel,
      imageProvider: provider
    });
    return image;
  } catch (error) {
    console.warn("[ImageGen] OpenRouter image generation failed; falling back to Pollinations.", error);
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
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUri);
  if (!match) {
    throw new Error("Image generation returned an invalid data URI");
  }
  const [, mimeType, base64Data] = match;
  const buffer = Buffer.from(base64Data, "base64");
  const { url } = await storagePut(
    `generated/${Date.now()}.png`,
    buffer,
    mimeType
  );
  return {
    url
  };
}

// server/routers.ts
init_db();

// server/screenshotService.ts
var SCREENSHOT_SERVICE_URL = process.env.SCREENSHOT_SERVICE_URL;
var DEFAULT_TIMEOUT_MS = 3e4;
var BATCH_TIMEOUT_MS = 9e4;
function serviceUrl(path4) {
  return `${SCREENSHOT_SERVICE_URL}${path4}`;
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
  const isDark2 = bgBrightness < 128;
  const hasVibrantColors = data.colors.palette.some((c) => getColorSaturation(c) > 0.5);
  if (isDark2 && hasVibrantColors) {
    patterns.push({
      id: "dark-modern",
      name: "Dark Modern",
      category: "modern",
      confidence: 75,
      characteristics: ["Dark background", "Vibrant accents", "High contrast"],
      description: "Modern dark theme with vibrant color accents",
      suggestedColors: CATEGORY_PALETTES.modern
    });
  } else if (isDark2) {
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

// server/postJudge.ts
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  if (h.length < 6) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ];
}
function relativeLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}
function contrastRatio(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return 1;
  const l1 = relativeLuminance(...rgb1);
  const l2 = relativeLuminance(...rgb2);
  const [light, dark] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
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
    textContrast: contrastToScore(contrastRatio(v.backgroundColor, v.textColor)),
    accentContrast: contrastToScore(contrastRatio(v.backgroundColor, v.accentColor))
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
- Measured contrast ratio (text/bg): ${contrastRatio(v.backgroundColor, v.textColor).toFixed(1)}:1`
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
import { createHash as createHash2 } from "node:crypto";
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
  const fingerprint = createHash2("sha256").update(
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
function relativeLuminance2(rgb) {
  const normalize2 = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * normalize2(rgb.r) + 0.7152 * normalize2(rgb.g) + 0.0722 * normalize2(rgb.b);
}
function wcagContrast(hexA, hexB) {
  const a = hexToRgb2(hexA);
  const b = hexToRgb2(hexB);
  if (!a || !b) return 0;
  const la = relativeLuminance2(a);
  const lb = relativeLuminance2(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
function colorSaturation(hex) {
  const rgb = hexToRgb2(hex);
  if (!rgb) return 0;
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  return max === 0 ? 0 : (max - min) / max;
}
function colorBrightness(hex) {
  const rgb = hexToRgb2(hex);
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
  const candidates = palette.filter((hex) => hexToRgb2(hex) !== null).filter((hex) => !isNeutralOrFallback(hex)).sort((a, b) => colorSaturation(b) - colorSaturation(a));
  return candidates[0] ?? null;
}
function pickCanvasBackground(palette) {
  const valid = palette.filter((hex) => hexToRgb2(hex) !== null);
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
    if (hexToRgb2(candidate) && wcagContrast(background, candidate) >= 4.5) {
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

// server/chameleonVision.ts
function buildChameleonPrompt(siteContent) {
  const contextBlock = siteContent ? `
Contexto textual extra\xEDdo do site:
${siteContent.slice(0, 2e3)}
` : "";
  return `Voc\xEA \xE9 um Desenvolvedor Front-end Senior, Diretor de Arte e Copywriter de elite.
Analise a imagem desta Landing Page / Website anexa e clone a ess\xEAncia do design dela para posts de rede social.

Sua miss\xE3o:

1. EXTRAIR A IDENTIDADE VISUAL (Cores HEX exatas):
   - background: cor predominante de fundo da p\xE1gina
   - card: cor de fundo dos blocos/cards/se\xE7\xF5es de conte\xFAdo
   - primary: cor de destaque principal (bot\xF5es, CTAs, links)
   - secondary: cor de suporte (badges, \xEDcones secund\xE1rios)
   - text: cor do texto principal

2. EXTRAIR DESIGN TOKENS (valores CSS exatos):
   - borderRadius: avalie o site e retorne EXATAMENTE um destes valores:
     "0px" = quinas totalmente retas/secas
     "8px" = cantos levemente arredondados
     "16px" = arredondamento m\xE9dio
     "24px" = bem arredondado
   - boxShadow: qual estilo de sombra o site usa?
     "none" = sem sombra
     "0 10px 25px rgba(0,0,0,0.1)" = sombra suave elegante
     "0 20px 40px rgba(0,0,0,0.2)" = sombra suave forte
     "8px 8px 0px 0px #000000" = sombra neo-brutalista (offset duro)
   - border: qual estilo de borda nos cards/elementos?
     "none" = sem borda
     "1px solid rgba(0,0,0,0.1)" = borda fina sutil
     "2px solid #000000" = borda marcada
     "4px solid #000000" = borda grossa brutalista
   - textAlign: t\xEDtulos e textos principais s\xE3o alinhados \xE0 esquerda ("left") ou centralizados ("center")?
   - textTransform: t\xEDtulos est\xE3o em CAIXA ALTA ("uppercase") ou normal ("none")?
   - decorations: o design \xE9 limpo/minimalista ("minimal") ou usa elementos decorativos soltos como confetes, selos, formas geom\xE9tricas ("playful")?

3. DETECTAR TIPOGRAFIA:
   - originalFont: qual \xE9 a fonte que o site aparenta usar? (seu melhor palpite)
   - fontFamily: escolha a fonte GRATUITA equivalente mais pr\xF3xima do Google Fonts.
     Op\xE7\xF5es comuns: Inter, Roboto, Montserrat, Poppins, Lato, Open Sans, Raleway, Work Sans,
     Quicksand, Space Grotesk, Playfair Display, Merriweather, Lora, PT Serif, Crimson Text,
     Oswald, Bebas Neue, Syne, Anton, Righteous, Space Mono, JetBrains Mono

4. CRIAR 7 OP\xC7\xD5ES DE COPYWRITING baseadas no produto/servi\xE7o do site:
   - Op\xE7\xE3o 1 (dor): Foque no PROBLEMA que o produto resolve. Gancho provocativo.
   - Op\xE7\xE3o 2 (beneficio): Foque no RESULTADO DESEJADO. Gancho aspiracional.
   - Op\xE7\xE3o 3 (objecao): Quebre uma OBJE\xC7\xC3O comum. Gancho desmistificador.
   - Op\xE7\xE3o 4 (autoridade): Use PROVA SOCIAL ou dados. Gancho de credibilidade.
   - Op\xE7\xE3o 5 (escassez): Crie URG\xCANCIA ou exclusividade. Gancho de escassez.
   - Op\xE7\xE3o 6 (storytelling): Conte uma pequena hist\xF3ria de jornada ou transforma\xE7\xE3o. Gancho narrativo.
   - Op\xE7\xE3o 7 (mito_vs_verdade): Desminta um mito de mercado e mostre a verdade do produto. Gancho de revela\xE7\xE3o.

   Para CADA op\xE7\xE3o:
   - badge: nome curto da marca/produto (m\xE1x 15 caracteres)
   - headline: gancho de IMPACTO (m\xE1ximo 5 palavras, sem ponto final)
   - subheadline: explica\xE7\xE3o clara (m\xE1ximo 12 palavras)
   - stickerText: UMA palavra decorativa de impacto (ex: "Magia", "Pr\xE1tico", "F\xE1cil", "Novo", "Top")
${contextBlock}
Retorne ESTRITAMENTE um JSON v\xE1lido no formato especificado. Sem markdown, sem explica\xE7\xF5es.`;
}
var CHAMELEON_SCHEMA = {
  type: "object",
  properties: {
    colors: {
      type: "object",
      properties: {
        background: { type: "string", description: "Background color HEX" },
        primary: { type: "string", description: "Primary/CTA color HEX" },
        secondary: { type: "string", description: "Secondary color HEX" },
        text: { type: "string", description: "Text color HEX" },
        card: { type: "string", description: "Card/surface background HEX" }
      },
      required: ["background", "primary", "secondary", "text", "card"],
      additionalProperties: false
    },
    designTokens: {
      type: "object",
      properties: {
        borderRadius: { type: "string" },
        boxShadow: { type: "string" },
        border: { type: "string" },
        textAlign: { type: "string", enum: ["left", "center"] },
        originalFont: { type: "string" },
        fontFamily: { type: "string" },
        textTransform: { type: "string", enum: ["none", "uppercase"] },
        decorations: { type: "string", enum: ["minimal", "playful"] }
      },
      required: ["borderRadius", "boxShadow", "border", "textAlign", "originalFont", "fontFamily", "textTransform", "decorations"],
      additionalProperties: false
    },
    posts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          angle: { type: "string", enum: ["dor", "beneficio", "objecao", "autoridade", "escassez", "storytelling", "mito_vs_verdade"] },
          badge: { type: "string" },
          headline: { type: "string" },
          subheadline: { type: "string" },
          stickerText: { type: "string" }
        },
        required: ["label", "angle", "badge", "headline", "subheadline", "stickerText"],
        additionalProperties: false
      }
    }
  },
  required: ["colors", "designTokens", "posts"],
  additionalProperties: false
};
async function chameleonVision(screenshot, siteContent) {
  console.log("[chameleonVision] Starting direct extraction...");
  const base64 = Buffer.from(screenshot).toString("base64");
  const promptText = buildChameleonPrompt(siteContent);
  try {
    const response = await invokeLLM({
      traceLabel: "chameleon_vision",
      taskRoute: "vision_analysis",
      messages: [
        {
          role: "system",
          content: "Voc\xEA \xE9 um assistente criativo que s\xF3 responde em JSON v\xE1lido. Nunca inclua markdown, explica\xE7\xF5es ou texto fora do JSON."
        },
        {
          role: "user",
          content: [
            { type: "text", text: promptText },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${base64}`,
                detail: "low"
              }
            }
          ]
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "chameleon_vision_result",
          strict: true,
          schema: CHAMELEON_SCHEMA
        }
      }
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from Vision LLM");
    const str = typeof content === "string" ? content : JSON.stringify(content);
    let cleaned = str.trim();
    if (cleaned.startsWith("```json")) cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    else if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.colors?.background || !parsed.designTokens || !Array.isArray(parsed.posts)) {
      console.warn("[chameleonVision] Invalid response structure, returning null");
      return null;
    }
    const requiredAngles = ["dor", "beneficio", "objecao", "autoridade", "escassez"];
    const existingAngles = new Set(parsed.posts.map((p) => p.angle));
    for (const angle of requiredAngles) {
      if (!existingAngles.has(angle)) {
        parsed.posts.push({
          label: angle.charAt(0).toUpperCase() + angle.slice(1),
          angle,
          badge: parsed.posts[0]?.badge || "Marca",
          headline: "Headline pendente",
          subheadline: "Subheadline pendente",
          stickerText: "Novo"
        });
      }
    }
    console.log(`[chameleonVision] Extraction complete: ${parsed.posts.length} copy angles, font: ${parsed.designTokens.fontFamily}`);
    return parsed;
  } catch (err) {
    console.error("[chameleonVision] Extraction failed:", err);
    return null;
  }
}

// shared/postspark.ts
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
function chameleonResultToDesignTokens(result) {
  return {
    colors: result.colors,
    typography: {
      fontFamily: result.designTokens.fontFamily,
      customFontUrl: "",
      originalFont: result.designTokens.originalFont,
      textTransform: result.designTokens.textTransform,
      textAlign: result.designTokens.textAlign
    },
    structure: {
      borderRadius: result.designTokens.borderRadius,
      boxShadow: result.designTokens.boxShadow,
      border: result.designTokens.border
    },
    decorations: result.designTokens.decorations
  };
}

// server/routers.ts
import * as fs from "fs";
import * as path2 from "path";

// server/billing.ts
init_env();
import Stripe from "stripe";
import { createClient as createClient4 } from "@supabase/supabase-js";
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
    _supabase = createClient4(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
      auth: { persistSession: false },
      db: { schema: "postspark" }
    });
  }
  return _supabase;
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
    const sb = getSupabase();
    const { data, error } = await sb.rpc("debit_sparks", {
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
        await sb.rpc("process_topup", {
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

// server/ai/brandVisualGuardian.ts
function hexToRgb3(hex) {
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
  const rgb = hexToRgb3(hex);
  if (!rgb) return 128;
  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1e3;
}
function colorDistance(a, b) {
  const ra = hexToRgb3(a);
  const rb = hexToRgb3(b);
  if (!ra || !rb) return Number.POSITIVE_INFINITY;
  return Math.sqrt(
    (ra.r - rb.r) ** 2 + (ra.g - rb.g) ** 2 + (ra.b - rb.b) ** 2
  );
}
function nearestPaletteColor(candidate, palette) {
  const valid = palette.filter((hex) => hexToRgb3(hex) !== null);
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
  const candidates = palette.filter((hex) => hexToRgb3(hex) !== null).filter((hex) => {
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

// server/ai/contentStrategy.ts
init_env();
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
function parseResponse(content) {
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.filter(
    (part) => Boolean(part) && typeof part === "object" && "type" in part && part.type === "text" && "text" in part
  ).map((part) => part.text).join("\n") : "";
  const parsed = JSON.parse(text);
  return Array.isArray(parsed.strategies) ? parsed.strategies.slice(0, 5) : [];
}
async function generateCandidates(sourceContent, objective, intelligence, executionBrief) {
  if (!ENV.aiContentStrategyEnabled) {
    return {
      candidates: buildFallbackCandidates(sourceContent, objective, intelligence),
      fallbackUsed: true
    };
  }
  const evidence = intelligence?.evidence.map((item) => `[${item.id}] ${item.text}`).join("\n").slice(0, 18e3);
  const context = intelligence ? `Negocio: ${intelligence.business.summary}
Proposta de valor: ${intelligence.business.valueProposition}
Publicos: ${intelligence.business.audiences.join("; ")}
Problemas: ${intelligence.business.audienceProblems.join("; ")}
Pilares: ${intelligence.editorial.pillars.join("; ")}
Temas prioritarios: ${intelligence.editorial.priorityTopics.join("; ")}
Evidencias:
${evidence}` : `Conteudo fornecido:
${sourceContent.slice(0, 18e3)}`;
  try {
    const response = await invokeLLM({
      traceLabel: "content_strategy",
      taskRoute: "content_strategy",
      maxCompletionTokens: 1024,
      messages: [
        {
          role: "system",
          content: `Voce e um estrategista editorial. Proponha exatamente 5 estrategias de post diferentes.
Cada estrategia deve ser relevante ao contexto, servir ao objetivo informado e citar apenas evidenceIds existentes.
Nao escreva o post final. Nao invente fatos. Varie topico, angulo e promessa.
Em modo execution, preserve a intencao do briefing e varie somente a abordagem permitida.`
        },
        {
          role: "user",
          content: `Objetivo: ${objective}
Modo: ${executionBrief ? "execution" : "ideation"}
${executionBrief ? `Briefing: ${executionBrief.rawInput}` : ""}

${context}`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "content_strategies",
          strict: true,
          schema: {
            type: "object",
            properties: {
              strategies: {
                type: "array",
                minItems: 5,
                maxItems: 5,
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    topic: { type: "string" },
                    objective: {
                      type: "string",
                      enum: ["educate", "authority", "sell", "engage", "lead"]
                    },
                    audience: { type: "string" },
                    angle: {
                      type: "string",
                      enum: [
                        "pain",
                        "benefit",
                        "objection",
                        "authority",
                        "story",
                        "myth",
                        "how-to"
                      ]
                    },
                    hook: { type: "string" },
                    promise: { type: "string" },
                    evidenceIds: {
                      type: "array",
                      items: { type: "string" }
                    }
                  },
                  required: [
                    "title",
                    "topic",
                    "objective",
                    "audience",
                    "angle",
                    "hook",
                    "promise",
                    "evidenceIds"
                  ],
                  additionalProperties: false
                }
              }
            },
            required: ["strategies"],
            additionalProperties: false
          }
        }
      }
    });
    const candidates = parseResponse(response.choices[0]?.message?.content);
    if (candidates.length === 5) {
      return { candidates, fallbackUsed: false };
    }
  } catch (error) {
    console.warn("[contentStrategy] Candidate generation failed:", error);
  }
  return {
    candidates: buildFallbackCandidates(sourceContent, objective, intelligence),
    fallbackUsed: true
  };
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
async function planContentStrategies(input) {
  const objective = resolveObjective(
    input.siteIntelligence,
    input.executionBrief
  );
  const generated = await generateCandidates(
    input.sourceContent,
    objective,
    input.siteIntelligence,
    input.executionBrief
  );
  const candidates = scoreCandidates(
    generated.candidates,
    input.sourceContent,
    objective,
    input.siteIntelligence
  );
  return {
    objective,
    candidates,
    selected: selectDistinctStrategies(candidates),
    fallbackUsed: generated.fallbackUsed
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
  const strategies = await planContentStrategies(input);
  return {
    strategies,
    promptContext: buildStrategyGenerationContext(strategies.selected)
  };
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
function buildCaptionSystemPrompt(platform, source) {
  const maxChars = PLATFORM_SPECS[platform].maxChars;
  const targetMin = Math.min(400, maxChars);
  const targetMax = Math.min(Math.max(800, targetMin), maxChars);
  const sourceDescription = source === "slides" ? "os SLIDES do carrossel" : source === "sections" ? "os ITENS/SE\xC7\xD5ES estruturados do post" : "o HEADLINE e BODY do post";
  return `Voce e um copywriter especialista em legendas para redes sociais.

Sua tarefa: escrever a legenda (caption) que acompanha um post publicado.

FONTE OBRIGATORIA: A legenda DEVE ser coerente com ${sourceDescription}.
- Voce recebe o conteudo visual real do post como input.
- A legenda deve SINTETIZAR, EXPANDIR e DAR CONTEXTO ao que esta no post visual.
- NUNCA invente topicos, numeros ou informacoes que nao estao no post.
- Se o post tem ${source === "slides" ? "5 slides" : source === "sections" ? "3 itens" : "1 mensagem central"}, a legenda deve referenciar esse mesmo conteudo.
- Se o post lista dicas ou passos, a legenda deve mencionar o MESMO numero de dicas/passos ou fazer referencia geral sem contradizer.

ESTRUTURA DA LEGENDA:
1. GANCHO (1-2 frases): abertura que desperta curiosidade e conecta com a dor/desejo do publico.
2. CONTEXTO/VALOR (2-4 frases): expande o tema do post, explica por que importa, agrega valor real.
3. S\xCDNTESE DO CONTE\xDADO (2-4 frases): referencia os topicos do post de forma fluida (nao copie literalmente, mas reflita o conteudo).
4. CTA/PERGUNTA (1 frase): convite ao engajamento ou proximo passo.

REGRAS:
- Tamanho: entre ${targetMin} e ${targetMax} caracteres (limite da plataforma: ${maxChars}).
- Tom: alinhado ao tom informado pela marca/estrategia.
- Pode usar emojis moderados (3-5 no total, bem distribuidos).
- Pode usar quebras de linha para legibilidade.
- NUNCA use hashtags na legenda (elas ficam em campo separado).
- NUNCA repita literalmente o headline \u2014 adicione perspectiva nova.
- Escreva em portugues natural e envolvente.

Responda APENAS com JSON valido no formato: {"caption": "texto da legenda aqui"}`;
}
function buildCaptionUserPrompt(input) {
  const toneLine = input.tone ? `Tom desejado: ${input.tone}` : "Tom desejado: natural e envolvente";
  const strategyLine = input.strategy ? `Angulo estrategico: ${input.strategy.angle} \u2014 ${input.strategy.hook}. Promessa: ${input.strategy.promise}` : "Angulo estrategico: nenhum especifico";
  const existingHint = input.existingCaption?.trim() ? `

Legenda anterior (use apenas como referencia de tom, NAO copie):
"${input.existingCaption.trim()}"` : "";
  return `CONTEUDO VISUAL DO POST (${input.source.toUpperCase()}):
${input.contentText}

PLATAFORMA: ${PLATFORM_SPECS[input.platform].label}
${toneLine}
${strategyLine}${existingHint}

Escreva a legenda coerente com o conteudo acima.`;
}
function safeParseCaption(content) {
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.filter(
    (part) => Boolean(part) && typeof part === "object" && "type" in part && part.type === "text" && "text" in part
  ).map((part) => part.text).join("\n") : "";
  if (!text.trim()) return null;
  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.caption === "string" && parsed.caption.trim()) {
      return parsed.caption.trim();
    }
  } catch {
    const startIdx = text.indexOf("{");
    const endIdx = text.lastIndexOf("}");
    if (startIdx !== -1 && endIdx > startIdx) {
      try {
        const jsonSub = text.substring(startIdx, endIdx + 1);
        const parsed = JSON.parse(jsonSub);
        if (typeof parsed.caption === "string" && parsed.caption.trim()) {
          return parsed.caption.trim();
        }
      } catch {
      }
    }
  }
  return null;
}
async function synthesizeCaption(input) {
  const { variation, platform } = input;
  const { text: contentText, source } = extractVisualContent(variation);
  if (!contentText.trim()) {
    return variation.caption ?? "";
  }
  const systemPrompt = buildCaptionSystemPrompt(platform, source);
  const userPrompt = buildCaptionUserPrompt({
    contentText,
    source,
    platform,
    tone: input.tone,
    strategy: input.strategy,
    existingCaption: variation.caption
  });
  try {
    const response = await invokeLLM({
      traceLabel: "caption_synthesis",
      taskRoute: "caption_synthesis",
      maxCompletionTokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "caption_synthesis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              caption: {
                type: "string",
                description: "Legenda coerente com o conteudo visual do post"
              }
            },
            required: ["caption"],
            additionalProperties: false
          }
        }
      }
    });
    const content = response.choices[0]?.message?.content;
    const caption = safeParseCaption(content);
    if (caption && caption.length >= 100) {
      const maxChars = PLATFORM_SPECS[platform].maxChars;
      return caption.slice(0, maxChars).trim();
    }
    return variation.caption ?? "";
  } catch (error) {
    console.warn(
      "[captionSynthesis] Failed, using original caption:",
      error
    );
    return variation.caption ?? "";
  }
}
async function synthesizeCaptionsForVariations(variations, options) {
  return Promise.all(
    variations.map(async (variation, index) => {
      try {
        const caption = await synthesizeCaption({
          variation,
          platform: options.platform,
          tone: options.tone,
          strategy: options.strategies?.[index],
          isCarousel: options.isCarousel
        });
        return { ...variation, caption };
      } catch {
        return variation;
      }
    })
  );
}

// server/ai/postEvaluation.ts
init_env();
function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
function hexToRgb4(hex) {
  if (!hex) return null;
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16)
  ];
}
function luminance(rgb) {
  const values = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrastRatio2(foreground, background) {
  const fg = hexToRgb4(foreground);
  const bg = hexToRgb4(background);
  if (!fg || !bg) return 1;
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
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
  const contrast = contrastRatio2(
    candidate.textColor,
    candidate.backgroundColor
  );
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
    visualReadability: contrast >= 4.5 ? 100 : clampScore(contrast * 20),
    captionCoherence: computeCaptionCoherence(candidate)
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
  const lengthScore = caption.length < 80 ? 45 : caption.length > 2e3 ? 80 : 90;
  return clampScore(
    overlapScore2 * 0.45 + numberCoherence * 0.4 + lengthScore * 0.15
  );
}
function summarize(dimensions, feedback) {
  const weights = {
    brandAlignment: 0.12,
    objectiveAlignment: 0.14,
    audienceRelevance: 0.1,
    factuality: 0.14,
    originality: 0.1,
    clarity: 0.08,
    platformFit: 0.06,
    visualReadability: 0.1,
    captionCoherence: 0.16
  };
  const overallScore = clampScore(
    Object.keys(dimensions).reduce(
      (sum, key) => sum + dimensions[key] * weights[key],
      0
    )
  );
  const accepted = overallScore >= 70 && dimensions.factuality >= 65 && dimensions.visualReadability >= 65 && dimensions.objectiveAlignment >= 60 && dimensions.captionCoherence >= 50;
  return {
    overallScore,
    accepted,
    dimensions,
    feedback
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
                  captionCoherence: { type: "number" }
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
                  "captionCoherence"
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
      "captionCoherence"
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
async function evaluateAndReviseCandidates(input) {
  let candidates = input.candidates;
  let evaluations = await evaluateCandidates({
    candidates,
    strategies: input.strategies,
    siteIntelligence: input.siteIntelligence,
    platform: input.platform,
    originalityScores: input.originalityScores
  });
  if (evaluations.every((evaluation) => evaluation.accepted)) {
    return { candidates, evaluations, revisionCount: 0, revisedIndexes: [], revisionFailedIndexes: [] };
  }
  if (!ENV.aiLlmJudgeEnabled) {
    return { candidates, evaluations, revisionCount: 0, revisedIndexes: [], revisionFailedIndexes: [] };
  }
  const revisedCandidates = [...candidates];
  const revisedIndexes = [];
  const revisionFailedIndexes = [];
  let revisionCount = 0;
  await Promise.all(
    evaluations.map(async (evaluation, index) => {
      if (evaluation.accepted) return;
      try {
        const revised = await input.revise(candidates[index], evaluation, index);
        if (revised) {
          revisedCandidates[index] = revised;
          revisedIndexes.push(index);
          revisionCount += 1;
        } else {
          revisionFailedIndexes.push(index);
        }
      } catch (error) {
        console.warn(`[postEvaluation] Revision failed for candidate ${index + 1}:`, error);
        revisionFailedIndexes.push(index);
      }
    })
  );
  if (revisionCount === 0) {
    return { candidates, evaluations, revisionCount: 0, revisedIndexes: [], revisionFailedIndexes };
  }
  candidates = revisedCandidates;
  evaluations = await evaluateCandidates({
    candidates,
    strategies: input.strategies,
    siteIntelligence: input.siteIntelligence,
    platform: input.platform,
    originalityScores: input.originalityScores
  });
  return { candidates, evaluations, revisionCount, revisedIndexes, revisionFailedIndexes };
}

// server/ai/semanticOriginality.ts
init_env();
init_db();
import { createHash as createHash3, randomUUID as randomUUID3 } from "node:crypto";
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
      const hash = createHash3("sha256").update(feature).digest();
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
        textHash: createHash3("sha256").update(variationText(candidate)).digest("hex"),
        embedding: input.embeddings[index] ?? [],
        metadata: input.assessments[index]
      }))
    );
  } catch (error) {
    console.warn("[semanticOriginality] Could not persist fingerprints:", error);
  }
}

// server/ai/generationValidation.ts
var POST_VARIATION_TARGET = 3;
var CAROUSEL_SLIDE_TARGET = 5;
var STATIC_SECTION_TARGET = 3;
var STATIC_SECTION_LABEL_MAX_LENGTH = 24;
var STATIC_SECTION_DESCRIPTION_MAX_LENGTH = 48;
function hasRequiredCopy(variation) {
  return Boolean(
    variation.headline?.trim() && variation.body?.trim() && variation.caption?.trim() && variation.callToAction?.trim() && variation.imagePrompt?.trim()
  );
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
    if (postMode === "carousel" && variation.slides?.length !== CAROUSEL_SLIDE_TARGET) {
      errors.push(
        `variation ${index + 1} must contain ${CAROUSEL_SLIDE_TARGET} slides`
      );
    }
  });
  if (variations.length === POST_VARIATION_TARGET && variationsNeedDiversification(variations)) {
    errors.push("variations are not sufficiently distinct");
  }
  return { valid: errors.length === 0, errors };
}
function assertVariationSet(variations, postMode) {
  const validation = validateVariationSet(variations, postMode);
  if (!validation.valid) {
    throw new Error(`Invalid variation set: ${validation.errors.join("; ")}`);
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
var formatOptimizationSchema = z2.object({
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
    visualReadability: z2.number()
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
  imageSettings: imageSettingsSchema.optional(),
  layoutSettings: advancedLayoutSettingsSchema.optional(),
  bgValue: backgroundValueSchema.optional(),
  bgOverlay: bgOverlaySettingsSchema.optional(),
  copyAngle: copyAngleSchema.optional(),
  designTokens: designTokensSchema.partial().optional(),
  brandMeta: z2.object({
    logoUrl: z2.string().optional(),
    brandName: z2.string().optional(),
    favicon: z2.string().optional()
  }).optional()
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
    bgOverlay: bgOverlaySettingsSchema.partial().optional()
  }).optional()
});
var postVisualSnapshotSchema = z2.object({
  snapshotVersion: z2.literal(1),
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
  aspectRatioOptimizations: z2.partialRecord(aspectRatioSchema, formatOptimizationSchema).optional(),
  layoutSettingsByAspectRatio: z2.partialRecord(aspectRatioSchema, advancedLayoutSettingsSchema).optional(),
  copyAngle: copyAngleSchema.optional(),
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
    contentStrategy: ENV.aiContentStrategyEnabled,
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
function isLegacySitePipelineEnabled() {
  return false;
}
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
  const stack = [];
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
    if (char === "{") stack.push("{");
    else if (char === "[") stack.push("[");
    else if (char === "}") stack.pop();
    else if (char === "]") stack.pop();
  }
  if (inString) {
    repairAttempt += '"';
  }
  while (stack.length > 0) {
    const last = stack.pop();
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
var CAROUSEL_SLIDE_TARGET2 = 5;
var EXECUTION_VARIATION_TARGET = 3;
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
function buildExecutionBriefContext(brief) {
  const slidesBlock = brief.slides.length > 0 ? brief.slides.map((slide) => `Slide ${slide.slideNumber} [${slide.role || "custom"}${slide.locked ? ", travado" : ""}]: ${slide.rawText}`).join("\n") : "Nenhum slide estruturado foi fornecido.";
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
    isCtaSlide: index === CAROUSEL_SLIDE_TARGET2 - 1
  }));
}
function normalizeCarouselSlides(variation) {
  const rawSlides = Array.isArray(variation?.slides) ? variation.slides : [];
  const normalized = rawSlides.filter(Boolean).slice(0, CAROUSEL_SLIDE_TARGET2).map((slide, index) => ({
    headline: String(slide?.headline || variation?.headline || `Slide ${index + 1}`),
    body: String(slide?.body || variation?.body || ""),
    slideNumber: index + 1,
    isTitleSlide: index === 0,
    isCtaSlide: index === CAROUSEL_SLIDE_TARGET2 - 1
  }));
  if (normalized.length === CAROUSEL_SLIDE_TARGET2) {
    return normalized;
  }
  return buildFallbackCarouselSlides(variation);
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
    const sb = getSupabase();
    const { data, error } = await sb.rpc("start_trial", {
      p_user_id: profile.id,
      p_email: email,
      p_ip_address: ip,
      p_plan: input.plan
    });
    if (error) return { success: false, reason: error.message };
    return data;
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
        debug: z5.boolean().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const email = ctx.user.email ?? "dev@local.dev";
      const profile = await getBillingProfile(email);
      const cost = input.postMode === "carousel" ? SPARK_COSTS.CAROUSEL : SPARK_COSTS.GENERATE_TEXT;
      const debit = await debitSparks(profile.id, cost, `Gera\xE7\xE3o de post (${input.postMode})`);
      if (!debit.success) {
        await appendOperationalLog("POST_GENERATION_REJECTED", {
          reason: "INSUFFICIENT_SPARKS",
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
          sparkCost: cost
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
        const recentPostsPromise = getUserPosts(ctx.user.id, 20).catch((error) => {
          console.warn("[post.generate] Recent post history unavailable:", error);
          return [];
        });
        let contextContent = input.content;
        let brandDnaContext = "";
        let chameleonResult = null;
        let siteIntelligence = null;
        const normalizedExecutionBrief = input.creationMode === "execution" && input.executionBrief ? normalizeExecutionBrief(input.executionBrief) : null;
        if (isLegacySitePipelineEnabled() && input.inputType === "url") {
          try {
            const scrapeResult = await scrapeUrl2(input.content);
            contextContent = `URL: ${input.content}
T\xEDtulo: ${scrapeResult.title}
Descri\xE7\xE3o: ${scrapeResult.description}
Conte\xFAdo: ${scrapeResult.content}`;
            const [screenshot, brandDNA] = await Promise.all([
              captureScreenshot(input.content).catch(() => null),
              extractBrandDNA(input.content).catch((err) => {
                console.warn("Falha ao extrair Brand DNA no processamento da gera\xE7\xE3o.", err);
                return null;
              })
            ]);
            if (screenshot) {
              try {
                chameleonResult = await chameleonVision(screenshot, contextContent);
                if (chameleonResult) {
                  console.log("[Chameleon Vision] Extraction successful \u2014 CSS tokens + 5 copy angles ready");
                }
              } catch (cvErr) {
                console.warn("[Chameleon Vision] Failed, falling back to BrandDNA:", cvErr);
              }
            }
            if (brandDNA) {
              brandDnaContext = `

INSTRU\xC7\xD5ES DE CLONAGEM DE MARCA (BRAND SOUL):
Voc\xEA DEVE FOR\xC7AR o post gerado a ser uma extens\xE3o org\xE2nica do site original.
Dados da Marca extra\xEDdos:
- Nome/Setor: ${brandDNA.brandName} (${brandDNA.industry})
- Cores Sugeridas (UTILIZE OBRIGATORIAMENTE ESTAS BASEADAS EM PSICOLOGIA DE CONTRASTE):
  Prim\xE1ria: ${chameleonResult?.colors.primary || brandDNA.colors.primary}
  Secund\xE1rias: ${chameleonResult?.colors.secondary || brandDNA.colors.secondary}
  Background Sugerido: ${chameleonResult?.colors.background || brandDNA.colors.background}
  Accent Sugerido: ${chameleonResult?.colors.primary || brandDNA.colors.accent}
  Paleta Geral: ${brandDNA.colors.palette.join(", ")}
- Ritmo Visual/Din\xE2mica: ${brandDNA.composition.dynamics} / ${brandDNA.composition.rhythm}

REGRA CARDINAL DE CORES (A FONTE \xC9 URL):
1) Voc\xEA N\xC3O PODE IGNORAR a paleta fornecida acima. O post DEVE pertencer ao site visualmente.
2) Selecione backgroundColor, accentColor e textColor EXCLUSIVAMENTE extra\xEDdos dessa paleta extra\xEDda, garantindo ratio > 4.5:1 WCAG.
3) Se o site for Dark Mode, gere posts escuros. Se o site for claro, gere variabilidades claras.
              `;
            }
          } catch {
            contextContent = `URL fornecida: ${input.content} (n\xE3o foi poss\xEDvel extrair conte\xFAdo, crie baseado na URL)`;
          }
        }
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
        const platformSpecs = {
          instagram: { label: "Instagram", maxChars: 2200 },
          twitter: { label: "Twitter/X", maxChars: 280 },
          linkedin: { label: "LinkedIn", maxChars: 3e3 },
          facebook: { label: "Facebook", maxChars: 63206 }
        };
        const spec = platformSpecs[input.platform];
        const effectiveTone = normalizedExecutionBrief?.tone || input.tone;
        const toneHint = effectiveTone ? `
Tom detectado no input do usu\xE1rio: "${effectiveTone}" \u2014 calibre o conte\xFAdo gerado para esse estado emocional.
` : "";
        const isCarousel = input.postMode === "carousel";
        const modeInstruction = normalizedExecutionBrief ? isCarousel ? `
IMPORTANTE: Gere conte\xFAdo para um CARROSSEL de execu\xE7\xE3o guiada. Cada varia\xE7\xE3o DEVE ter exatamente 5 slides organizados em "slides". Preserve a estrutura fornecida pelo usu\xE1rio sempre que ela existir. Slide 1 = gancho, slides 2-4 = desenvolvimento, slide 5 = CTA final. N\xE3o coloque CTA nos slides 1-4.` : "\nIMPORTANTE: Gere uma pe\xE7a de execu\xE7\xE3o guiada, fiel ao briefing, com baixa dist\xE2ncia entre as varia\xE7\xF5es." : isCarousel ? `
IMPORTANTE: Gere conte\xFAdo para um CARROSSEL (m\xFAltiplos slides). Cada varia\xE7\xE3o DEVE ter exatamente 5 slides organizados em um array "slides". N\xE3o retorne array vazio, parcial ou simplificado. Estrutura obrigat\xF3ria do carrossel: slide 1 = gancho forte e altamente curioso para fazer a pessoa folhear; slides 2, 3 e 4 = desenvolvimento progressivo do tema; slide 5 = CTA final, e somente ele deve conter call-to-action. N\xE3o coloque CTA nos slides 1-4. Cada slide deve ter: headline (t\xEDtulo curto m\xE1x 50 caracteres), body (mensagem m\xE1x 80 caracteres), slideNumber (1-5), isTitleSlide (true apenas no slide 1), isCtaSlide (true apenas no slide 5). O headline/body de n\xEDvel superior s\xE3o apenas um resumo do carrossel; o conte\xFAdo principal vive nos slides.` : "\nGere posts individuais (est\xE1tico).";
        const executionSystemContext = normalizedExecutionBrief ? `
MODO DE EXECU\xC7\xC3O ATIVADO:
- Voc\xEA N\xC3O est\xE1 criando do zero. Voc\xEA est\xE1 executando um briefing.
- Preserve a inten\xE7\xE3o, a estrutura, o CTA e os termos obrigat\xF3rios enviados pelo usu\xE1rio.
- Se houver slides fornecidos, trate-os como material fonte priorit\xE1rio.
- N\xE3o reescreva agressivamente sem necessidade.
- O n\xEDvel de interven\xE7\xE3o permitido \xE9: ${normalizedExecutionBrief.interventionLevel}.
- Gere EXATAMENTE ${EXECUTION_VARIATION_TARGET} varia\xE7\xF5es pr\xF3ximas entre si. Varie principalmente acabamento visual, microcopy e hierarquia, n\xE3o o conceito central.
- Se o n\xEDvel for "visual_only", mantenha o texto quase intacto.
- Se o n\xEDvel for "light_optimize", melhore clareza, ritmo e impacto sem alterar a estrutura principal.
- Se o n\xEDvel for "optimize_structure", voc\xEA pode reorganizar trechos, mas sem trair a mensagem central.
` : "";
        const generationInstructionCore = `${modeInstruction}
${normalizedExecutionBrief ? "As 3 varia\xE7\xF5es devem ser pr\xF3ximas entre si e altamente fi\xE9is ao briefing." : "Cada varia\xE7\xE3o deve ter um tom diferente: 1) Profissional/Corporativo, 2) Casual/Engajador, 3) Criativo/Ousado."}${toneHint}
${brandDnaContext}
${executionSystemContext}
${generationPlan.promptContext}

REGRAS DE COPY \u2014 SIGA COM RIGOR:
- Headline: m\xE1ximo 60 caracteres. Seja direto e impactante. Sem ponto final.
- Body: m\xE1ximo 2 frases curtas. M\xE1ximo 100 caracteres no total. Sem rodeios.
- Caption/Legenda: forne\xE7a uma legenda INICIAL curta (1-2 frases). Esta legenda ser\xE1 substitu\xEDda por uma vers\xE3o mais rica e coerente em um passo dedicado posterior, ent\xE3o n\xE3o precisa ser longa \u2014 apenas garantida.
- NUNCA coloque hashtags ou emojis dentro do headline ou body.
- Hashtags: m\xE1ximo 4, somente no campo separado "hashtags".
- CallToAction: m\xE1ximo 40 caracteres. Verbo de a\xE7\xE3o. Ex: "Saiba mais", "Experimente agora".
- copyAngle: Para cada varia\xE7\xE3o, forne\xE7a um objeto com o Prop\xF3sito e Ganchos do post com type (dor, beneficio, objecao, autoridade, escassez, storytelling, mito_vs_verdade), label (nome da abordagem), badge (palavra curta para o selo da marca/tema) e stickerText (uma palavra de impacto para adesivo decorativo).
- As 3 varia\xE7\xF5es DEVEM ser claramente distingu\xEDveis entre si. N\xE3o repita headline, body, copyAngle, CTA, hashtags ou a mesma combina\xE7\xE3o de layout + paleta.
- Fa\xE7a cada varia\xE7\xE3o abrir por uma ideia diferente: 1) institucional/autoridade, 2) conversa/engajamento, 3) criativa ou provocativa.
- Seja conciso. Corte qualquer palavra desnecess\xE1ria. Menos \xE9 mais.

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

5. PACOTE CRIATIVO MULTI-FORMATO:
   - Cada varia\xE7\xE3o deve fluir formatada no aspectRatio correspondente.

6. TEMPLATES ESTRUTURADOS:
   - Use 'simple' quando headline e body forem suficientes. N\xE3o invente se\xE7\xF5es apenas para preencher o layout.
   - Use 'feature-grid', 'numbered-list' ou 'step-by-step' somente quando a mensagem realmente exigir itens distintos.
   - Todo template estruturado deve ter EXATAMENTE 3 se\xE7\xF5es. Nunca gere 4 ou 5 itens em um \xFAnico post est\xE1tico.
   - Cada label deve ter no m\xE1ximo 24 caracteres e cada description no m\xE1ximo 48 caracteres.
   - Resuma cada item em uma \xFAnica ideia. N\xE3o repita no item o que j\xE1 est\xE1 no headline ou body.

7. FLOATING CARDS & ELEMENT STYLING (NEW):
   - O card PRINCIPAL n\xE3o precisa estar sempre centralizado ou ocupar 100% da tela.
   - Use o objeto "card" dentro das otimiza\xE7\xF5es para criar composi\xE7\xF5es din\xE2micas (ex: card inclinado, card menor no canto, layout Figma/Canva).
   - Isso \xE9 especialmente \xFAtil quando o fundo (backgroundImage) \xE9 rico visualmente.
   - Use 'backgroundColor' e 'borderRadius' em 'headline' ou 'body' para criar efeitos de BADGE ou STIKER (texto com fundo colorido e cantos arredondados). Isso ajuda a destacar informa\xE7\xF5es de forma "divertida" e moderna. Use cores contrastantes.
   
Responda APENAS com JSON v\xE1lido.`;
        const systemPrompt = `Voc\xEA \xE9 um especialista em marketing digital, design visual e cria\xE7\xE3o de conte\xFAdo para redes sociais.
Gere EXATAMENTE 3 varia\xE7\xF5es de post para ${spec.label}.
${generationInstructionCore}`;
        const slotGenerationInstructionCore = generationInstructionCore.replace(generationPlan.promptContext, "").replace(
          "As 3 varia\xE7\xF5es devem ser pr\xF3ximas entre si e altamente fi\xE9is ao briefing.",
          "Esta varia\xE7\xE3o deve ser altamente fiel ao briefing e ao contrato estrat\xE9gico do slot."
        ).replace(
          "Cada varia\xE7\xE3o deve ter um tom diferente: 1) Profissional/Corporativo, 2) Casual/Engajador, 3) Criativo/Ousado.",
          "Esta varia\xE7\xE3o deve seguir exclusivamente o tom e o \xE2ngulo definidos no contrato estrat\xE9gico do slot."
        ).replace(
          "- As 3 varia\xE7\xF5es DEVEM ser claramente distingu\xEDveis entre si. N\xE3o repita headline, body, copyAngle, CTA, hashtags ou a mesma combina\xE7\xE3o de layout + paleta.",
          "- Esta varia\xE7\xE3o DEVE ser claramente alinhada ao contrato estrat\xE9gico do slot. N\xE3o reaproveite mecanicamente headline, body, copyAngle, CTA, hashtags ou combina\xE7\xE3o de layout + paleta de outros \xE2ngulos."
        ).replace(
          "- Fa\xE7a cada varia\xE7\xE3o abrir por uma ideia diferente: 1) institucional/autoridade, 2) conversa/engajamento, 3) criativa ou provocativa.",
          "- Fa\xE7a esta varia\xE7\xE3o abrir por uma ideia forte e alinhada ao contrato estrat\xE9gico do slot, sem cair em f\xF3rmulas gen\xE9ricas."
        );
        const slotSystemPrompt = `Voc\xEA \xE9 um especialista em marketing digital, design visual e cria\xE7\xE3o de conte\xFAdo para redes sociais.
Gere exatamente UMA varia\xE7\xE3o de post para ${spec.label}, correspondente ao slot solicitado pelo usu\xE1rio.

PRIORIDADE CRIATIVA:
- O schema \xE9 apenas o cont\xEAiner de entrega; a pe\xE7a precisa sair pronta para produ\xE7\xE3o.
- A varia\xE7\xE3o deve ter uma ideia clara, copy objetiva, coer\xEAncia visual e diferen\xE7a real em rela\xE7\xE3o aos outros \xE2ngulos.
- N\xE3o preencha campos mecanicamente. Cada headline, body, se\xE7\xE3o, CTA e cor deve servir ao contrato estrat\xE9gico do slot.

${slotGenerationInstructionCore}`;
        const userPrompt = normalizedExecutionBrief ? `Execute este briefing com fidelidade. Otimize apenas no grau permitido.

${buildExecutionBriefContext(normalizedExecutionBrief)}` : input.inputType === "image" ? `Crie posts baseados nesta imagem: ${input.imageUrl || input.content}` : `Crie posts baseados neste conte\xFAdo: ${contextContent}`;
        const layoutPositionSchema2 = {
          type: "object",
          properties: {
            x: { type: "number", description: "Posi\xE7\xE3o X em % (0-100)" },
            y: { type: "number", description: "Posi\xE7\xE3o Y em % (0-100)" },
            width: { type: "number", description: "Largura em % (10-100)" },
            textAlign: { type: "string", enum: ["left", "center", "right"] },
            backgroundColor: {
              type: "string",
              description: "Cor de fundo opcional para o elemento (RGBA ou Hex)"
            },
            borderRadius: {
              type: "number",
              description: "Raio da borda em px (0-40)"
            }
          },
          required: ["x", "y", "width", "textAlign", "backgroundColor", "borderRadius"],
          additionalProperties: false
        };
        const formatOptimizationSchema2 = {
          type: "object",
          properties: {
            layout: {
              type: "string",
              enum: ["centered", "left-aligned", "split", "minimal"]
            },
            backgroundColor: { type: "string" },
            textColor: { type: "string" },
            accentColor: { type: "string" },
            headline: { $ref: "#/$defs/layoutPosition" },
            body: { $ref: "#/$defs/layoutPosition" },
            card: { $ref: "#/$defs/layoutPosition" },
            padding: { type: "number" }
          },
          required: ["layout", "backgroundColor", "textColor", "accentColor", "headline", "body", "card", "padding"],
          additionalProperties: false
        };
        const layoutDefs = {
          layoutPosition: layoutPositionSchema2,
          formatOptimization: formatOptimizationSchema2
        };
        const variationSchema = isCarousel ? {
          type: "object",
          properties: {
            headline: {
              type: "string",
              description: "T\xEDtulo principal do carrossel"
            },
            body: {
              type: "string",
              description: "Descri\xE7\xE3o geral do carrossel"
            },
            hashtags: {
              type: "array",
              items: { type: "string" },
              description: "Hashtags relevantes"
            },
            callToAction: {
              type: "string",
              description: "Call to action final do carrossel"
            },
            caption: {
              type: "string",
              description: "Legenda inicial do post. Ser\xE1 refinada posteriormente."
            },
            tone: { type: "string", description: "Tom do post" },
            imagePrompt: {
              type: "string",
              description: "Prompt em ingl\xEAs para gerar imagem de fundo"
            },
            backgroundColor: {
              type: "string",
              description: "Cor de fundo hex"
            },
            textColor: {
              type: "string",
              description: "Cor do texto hex"
            },
            accentColor: {
              type: "string",
              description: "Cor de destaque hex"
            },
            layout: {
              type: "string",
              enum: ["centered", "left-aligned", "split", "minimal"],
              description: "Layout sugerido"
            },
            aspectRatio: {
              type: "string",
              enum: ["1:1", "5:6", "9:16"],
              description: "Propor\xE7\xE3o de aspecto"
            },
            slides: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  headline: {
                    type: "string",
                    description: "T\xEDtulo do slide"
                  },
                  body: {
                    type: "string",
                    description: "Conte\xFAdo do slide"
                  },
                  slideNumber: {
                    type: "integer",
                    description: "N\xFAmero do slide (1-5)"
                  },
                  isTitleSlide: {
                    type: "boolean",
                    description: "Se \xE9 o primeiro slide"
                  },
                  isCtaSlide: {
                    type: "boolean",
                    description: "Se \xE9 o \xFAltimo slide"
                  }
                },
                required: ["headline", "body", "slideNumber", "isTitleSlide", "isCtaSlide"],
                additionalProperties: false
              },
              minItems: CAROUSEL_SLIDE_TARGET2,
              maxItems: CAROUSEL_SLIDE_TARGET2,
              description: "Slides do carrossel (5 itens)"
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
            copyAngle: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["dor", "beneficio", "objecao", "autoridade", "escassez", "storytelling", "mito_vs_verdade"]
                },
                label: { type: "string" },
                badge: { type: "string" },
                stickerText: { type: "string" }
              },
              required: ["type", "label", "badge", "stickerText"],
              additionalProperties: false
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
            "slides",
            "aspectRatioOptimizations",
            "copyAngle"
          ],
          additionalProperties: false
        } : {
          type: "object",
          properties: {
            headline: {
              type: "string",
              description: "T\xEDtulo chamativo do post"
            },
            body: {
              type: "string",
              description: "Corpo principal do post"
            },
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
              description: "Legenda inicial do post. Ser\xE1 refinada posteriormente."
            },
            tone: { type: "string", description: "Tom do post" },
            imagePrompt: {
              type: "string",
              description: "Prompt em ingl\xEAs para gerar imagem de fundo do post. Deve ser visual, art\xEDstico e relevante ao conte\xFAdo."
            },
            backgroundColor: {
              type: "string",
              description: "Cor de fundo hex"
            },
            textColor: {
              type: "string",
              description: "Cor do texto hex"
            },
            accentColor: {
              type: "string",
              description: "Cor de destaque hex"
            },
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
                  icon: {
                    type: "string",
                    description: "Nome de \xEDcone lucide (ex: Users, Star, Zap, Heart, Globe)"
                  },
                  label: {
                    type: "string",
                    maxLength: 24,
                    description: "T\xEDtulo curto da se\xE7\xE3o, m\xE1ximo 24 caracteres"
                  },
                  description: {
                    type: "string",
                    maxLength: 48,
                    description: "Texto de suporte opcional, m\xE1ximo 48 caracteres"
                  },
                  number: {
                    type: "integer",
                    description: "N\xFAmero para listas numeradas"
                  }
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
            copyAngle: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["dor", "beneficio", "objecao", "autoridade", "escassez", "storytelling", "mito_vs_verdade"]
                },
                label: { type: "string" },
                badge: { type: "string" },
                stickerText: { type: "string" }
              },
              required: ["type", "label", "badge", "stickerText"],
              additionalProperties: false
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
            "aspectRatioOptimizations",
            "copyAngle"
          ],
          additionalProperties: false
        };
        const slotResponses = await Promise.all(
          generationPlan.strategies.selected.map(async (strategy, index) => {
            const slotPrompt = `${userPrompt}

TAREFA DESTE AGENTE:
- Gere somente a variacao ${index + 1} de 3.
- Execute exclusivamente este contrato estrategico:
${JSON.stringify(strategy, null, 2)}
- Nao misture os outros angulos.
- Retorne um array "variations" com exatamente 1 item.`;
            const generateSlot = async (attempt) => {
              const userContent = input.inputType === "image" && (input.imageUrl || input.content) ? [
                {
                  type: "text",
                  text: attempt === 1 ? slotPrompt : `${slotPrompt}

A tentativa anterior retornou um item ausente ou incompleto.
Preencha todos os campos obrigatorios do schema sem alterar o contrato estrategico.`
                },
                {
                  type: "image_url",
                  image_url: { url: input.imageUrl || input.content, detail: "high" }
                }
              ] : attempt === 1 ? slotPrompt : `${slotPrompt}

A tentativa anterior retornou um item ausente ou incompleto.
Preencha todos os campos obrigatorios do schema sem alterar o contrato estrategico.`;
              const response = await invokeLLM({
                traceLabel: attempt === 1 ? `post_generation_${index + 1}` : `post_generation_${index + 1}_retry`,
                taskRoute: isCarousel ? "carousel_generation" : "static_generation",
                model: input.model,
                maxCompletionTokens: attempt === 1 ? isCarousel ? 4096 : 3072 : isCarousel ? 3072 : 2048,
                messages: [
                  {
                    role: "system",
                    content: slotSystemPrompt
                  },
                  {
                    role: "user",
                    content: userContent
                  }
                ],
                response_format: {
                  type: "json_schema",
                  json_schema: {
                    name: `post_variation_${index + 1}`,
                    strict: true,
                    schema: {
                      type: "object",
                      properties: {
                        variations: {
                          type: "array",
                          minItems: 1,
                          maxItems: 1,
                          items: variationSchema
                        }
                      },
                      required: ["variations"],
                      $defs: layoutDefs,
                      additionalProperties: false
                    }
                  }
                }
              });
              const content = response.choices[0]?.message?.content;
              const contentStr = typeof content === "string" ? content : Array.isArray(content) ? content.filter((c) => "text" in c).map((c) => c.text).join("\n") : "{}";
              return safeJsonParse(contentStr, {
                variations: []
              }).variations[0];
            };
            let first = null;
            try {
              first = await generateSlot(1);
            } catch (error) {
              recordGenerationEvent({
                stage: `post_generation_${index + 1}`,
                status: "rejected",
                detail: "Slot generation failed fast; requesting one targeted retry.",
                data: error instanceof Error ? error.message : String(error)
              });
            }
            const firstIsComplete = Boolean(
              first?.headline?.trim() && first?.body?.trim() && first?.caption?.trim() && first?.callToAction?.trim() && first?.imagePrompt?.trim() && first?.copyAngle?.type && (input.postMode === "carousel" || hasValidStaticSections(first)) && (input.postMode !== "carousel" || first?.slides?.length === CAROUSEL_SLIDE_TARGET2)
            );
            if (firstIsComplete) return first;
            recordGenerationEvent({
              stage: `post_generation_${index + 1}`,
              status: "rejected",
              detail: "Slot incomplete; requesting one targeted retry.",
              data: first
            });
            try {
              return await generateSlot(2);
            } catch (error) {
              recordGenerationEvent({
                stage: `post_generation_${index + 1}`,
                status: "failed",
                detail: "Targeted retry failed; slot will be omitted.",
                data: error instanceof Error ? error.message : String(error)
              });
              return null;
            }
          })
        );
        let variations = slotResponses.filter(Boolean).slice(0, POST_VARIATION_TARGET).map((variation) => applyDeterministicCopyGuards(variation));
        recordGenerationEvent({
          stage: "post_generation",
          status: variations.length === POST_VARIATION_TARGET ? "completed" : "rejected",
          detail: `Primary generation returned ${variations.length} variation(s).`,
          data: variations
        });
        if (siteIntelligence && brandDnaContext.length > 0) {
          try {
            console.log("[Brand Guardian] Deterministically enforcing brand palette + WCAG contrast...");
            const beforeCount = variations.length;
            variations = enforceBrandVisualGuardian(
              variations,
              siteIntelligence,
              { enforcePalette: true, backgroundSnapTolerance: 40 }
            );
            console.log(
              "[Brand Guardian] Enforced %d variation(s) against brand palette.",
              variations.length
            );
            recordGenerationEvent({
              stage: "brand_visual_qa",
              status: variations.length === beforeCount ? "completed" : "rejected",
              detail: "Deterministic brand visual guardian applied palette + WCAG corrections.",
              data: variations
            });
          } catch (guardianErr) {
            console.warn("[Brand Guardian] Failing gracefully. Returning raw variations.", guardianErr);
          }
        }
        if (!normalizedExecutionBrief && variationsNeedDiversification(variations)) {
          try {
            console.warn("[Variation Guard] Similar variations detected. Requesting diversified rewrite...");
            const diversificationPrompt = `Voc\xEA recebeu 3 varia\xE7\xF5es de post que ficaram parecidas demais.
Reescreva o array para entregar EXATAMENTE 3 varia\xE7\xF5es nitidamente diferentes entre si.

REGRAS OBRIGAT\xD3RIAS:
- Preserve o mesmo tema central e as regras de marca j\xE1 aplicadas.
- N\xE3o repita headline, body, CTA, hashtags, copyAngle, nem a mesma combina\xE7\xE3o de layout + paleta.
- Garanta pelo menos 2 layouts diferentes no conjunto final.
- Garanta \xE2ngulos de copy diferentes e facilmente distingu\xEDveis.
- ${isCarousel ? "Se for carrossel, preserve exatamente 5 slides por varia\xE7\xE3o, com narrativa completa e `slides` nunca vazio." : "Mantenha o formato est\xE1tico atual."}
- Mantenha o JSON no mesmo schema exato.

Varia\xE7\xF5es atuais:
${JSON.stringify(variations, null, 2)}

Responda APENAS com JSON v\xE1lido.`;
            const diversificationResponse = await invokeLLM({
              traceLabel: "lexical_diversification",
              taskRoute: isCarousel ? "carousel_generation" : "static_generation",
              model: input.model,
              maxCompletionTokens: 4096,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: diversificationPrompt }
              ],
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "post_variations_diversified",
                  strict: true,
                  schema: {
                    type: "object",
                    properties: {
                      variations: {
                        type: "array",
                        minItems: POST_VARIATION_TARGET,
                        maxItems: POST_VARIATION_TARGET,
                        items: variationSchema
                      }
                    },
                    required: ["variations"],
                    $defs: layoutDefs,
                    additionalProperties: false
                  }
                }
              }
            });
            const diversifiedContent = diversificationResponse.choices[0]?.message?.content;
            const diversifiedContentStr = typeof diversifiedContent === "string" ? diversifiedContent : Array.isArray(diversifiedContent) ? diversifiedContent.filter((c) => "text" in c).map((c) => c.text).join("\n") : "{}";
            const diversifiedParsed = safeJsonParse(diversifiedContentStr, { variations: [] });
            const diversifiedVariations = (diversifiedParsed.variations || []).slice(0, 3);
            if (diversifiedVariations.length > 0 && !variationsNeedDiversification(diversifiedVariations)) {
              if (diversifiedVariations.length === POST_VARIATION_TARGET) {
                variations = diversifiedVariations;
              }
              console.log("[Variation Guard] Diversified variations accepted.");
              recordGenerationEvent({
                stage: "diversification",
                status: diversifiedVariations.length === POST_VARIATION_TARGET ? "completed" : "rejected",
                detail: `Diversification returned ${diversifiedVariations.length} variation(s).`,
                data: diversifiedVariations
              });
            } else {
              console.warn("[Variation Guard] Diversification attempt still too similar. Keeping original output.");
            }
          } catch (diversificationErr) {
            console.warn("[Variation Guard] Diversification retry failed. Keeping original output.", diversificationErr);
          }
        }
        const recentPosts = await recentPostsPromise;
        const initialOriginality = await assessSemanticOriginality({
          candidates: variations,
          siteIntelligence,
          recentPosts
        });
        const evaluationPipeline = await evaluateAndReviseCandidates({
          candidates: variations,
          strategies: generationPlan.strategies.selected,
          siteIntelligence,
          platform: input.platform,
          originalityScores: initialOriginality.assessments.map((assessment) => assessment.score),
          revise: async (candidate, evaluation, index) => {
            const revisionResponse = await invokeLLM({
              traceLabel: `quality_revision_${index + 1}`,
              taskRoute: "quality_revision",
              model: input.model,
              maxCompletionTokens: isCarousel ? 3072 : 2048,
              messages: [
                {
                  role: "system",
                  content: `Voce e um revisor cirurgico do PostSpark.
Revise exatamente UMA variacao rejeitada, preservando a estrategia, o layout e a estrutura.
Corrija apenas os problemas apontados na avaliacao.
Nao reescreva do zero, nao misture estrategias, nao invente fatos e responda somente JSON valido.
COERENCIA DA LEGENDA: se houver slides ou secoes, a caption deve refletir o mesmo numero de topicos. Se os slides apresentam 5 dicas, a legenda nao deve dizer "3 dicas".`
                },
                {
                  role: "user",
                  content: `Indice: ${index + 1}

Contrato estrategico:
${JSON.stringify(generationPlan.strategies.selected[index], null, 2)}

Avaliacao:
${JSON.stringify(evaluation, null, 2)}

Variacao:
${JSON.stringify(candidate, null, 2)}

Retorne um objeto com "variations" contendo exatamente 1 variacao corrigida.`
                }
              ],
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: `post_variation_revised_${index + 1}`,
                  strict: true,
                  schema: {
                    type: "object",
                    properties: {
                      variations: {
                        type: "array",
                        minItems: 1,
                        maxItems: 1,
                        items: variationSchema
                      }
                    },
                    required: ["variations"],
                    $defs: layoutDefs,
                    additionalProperties: false
                  }
                }
              }
            });
            const revisedContent = revisionResponse.choices[0]?.message?.content;
            const revisedText = typeof revisedContent === "string" ? revisedContent : "{}";
            return safeJsonParse(revisedText, {
              variations: []
            }).variations[0] ?? null;
          }
        });
        variations = evaluationPipeline.candidates.map(
          (variation) => applyDeterministicCopyGuards(variation)
        );
        recordGenerationEvent({
          stage: "caption_synthesis",
          status: "started",
          detail: "Synthesizing captions from final visual content."
        });
        try {
          const synthesized = await synthesizeCaptionsForVariations(
            variations,
            {
              platform: input.platform,
              tone: effectiveTone,
              strategies: generationPlan.strategies.selected,
              isCarousel
            }
          );
          variations = synthesized.map(
            (variation) => applyDeterministicCopyGuards(variation)
          );
          recordGenerationEvent({
            stage: "caption_synthesis",
            status: "completed",
            detail: "Captions synthesized from final visual content."
          });
        } catch (synthesisError) {
          recordGenerationEvent({
            stage: "caption_synthesis",
            status: "fallback",
            detail: "Caption synthesis failed; original captions preserved.",
            data: synthesisError instanceof Error ? synthesisError.message : String(synthesisError)
          });
        }
        const originality = evaluationPipeline.revisionCount > 0 ? await assessSemanticOriginality({
          candidates: variations,
          siteIntelligence,
          recentPosts
        }) : initialOriginality;
        const chameleonDesignTokens = siteIntelligence ? siteIntelligenceToDesignTokens(siteIntelligence) : chameleonResult ? chameleonResultToDesignTokens(chameleonResult) : void 0;
        const chameleonPosts = chameleonResult?.posts || [];
        const generatedVariations = variations.map((v, i) => {
          const chameleonPost = chameleonPosts[i];
          const normalizedSlides = isCarousel ? normalizeCarouselSlides(v) : void 0;
          return {
            id: `var-${Date.now()}-${i}`,
            ...v,
            caption: v.caption || "",
            platform: input.platform,
            hashtags: v.hashtags || [],
            postMode: input.postMode,
            slides: normalizedSlides,
            // Chameleon Vision enrichments
            ...chameleonDesignTokens ? { designTokens: chameleonDesignTokens } : {},
            ...chameleonPost ? {
              copyAngle: {
                type: chameleonPost.angle,
                label: chameleonPost.label,
                badge: chameleonPost.badge,
                stickerText: chameleonPost.stickerText
              }
            } : {},
            generationMeta: {
              creationMode: input.creationMode,
              fidelity: normalizedExecutionBrief ? "high" : "medium",
              interventionLevel: normalizedExecutionBrief?.interventionLevel,
              siteIntelligenceId: siteIntelligence?.id,
              strategyId: generationPlan.strategies.selected[i]?.id,
              revisionCount: evaluationPipeline.revisionCount,
              revisionApplied: evaluationPipeline.revisedIndexes.includes(i),
              revisionFailed: evaluationPipeline.revisionFailedIndexes.includes(i),
              evaluation: evaluationPipeline.evaluations[i],
              originality: originality.assessments[i]
            }
          };
        });
        const finalValidation = validateVariationSet(generatedVariations, input.postMode);
        recordGenerationEvent({
          stage: "final_validation",
          status: finalValidation.valid ? "completed" : "rejected",
          detail: finalValidation.valid ? "Exactly three complete and distinct variations approved." : finalValidation.errors.join("; "),
          data: finalValidation
        });
        try {
          assertVariationSet(generatedVariations, input.postMode);
        } catch (error) {
          throw new TRPCError5({
            code: "BAD_GATEWAY",
            message: "A IA n\xE3o conseguiu produzir tr\xEAs varia\xE7\xF5es v\xE1lidas e distintas. Tente novamente.",
            cause: error
          });
        }
        generationTrace.siteIntelligenceId = siteIntelligence?.id;
        await persistCandidateFingerprints({
          userUuid: ctx.user.id,
          generationRunId: generationTrace.id,
          candidates: generatedVariations,
          embeddings: originality.embeddings,
          assessments: originality.assessments
        });
        await finishGenerationTrace({
          trace: generationTrace,
          status: "completed",
          strategies: generationPlan.strategies,
          evaluations: evaluationPipeline.evaluations,
          revisionCount: evaluationPipeline.revisionCount,
          strategyFallbackUsed: generationPlan.strategies.fallbackUsed,
          originalityFallbackUsed: originality.fallbackUsed,
          output: generatedVariations
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
          variationCount: generatedVariations.length,
          revisionCount: evaluationPipeline.revisionCount,
          strategyFallbackUsed: generationPlan.strategies.fallbackUsed,
          originalityFallbackUsed: originality.fallbackUsed,
          finalValidation,
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
          outputSummary: generatedVariations.map(summarizeGeneratedVariation)
        });
        return {
          variations: generatedVariations,
          generationRunId: generationTrace.id,
          ...debugEnabled ? {
            debug: buildGenerationDebugTrace({
              trace: generationTrace,
              strategies: generationPlan.strategies,
              evaluations: evaluationPipeline.evaluations,
              output: generatedVariations
            })
          } : {}
        };
      } catch (error) {
        await finishGenerationTrace({
          trace: generationTrace,
          status: "failed",
          error: error instanceof Error ? error.message : "Generation failed"
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
        const postId = await createPost({
          ...input,
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
      await updatePost(input.id, ctx.user.id, input);
      return { success: true };
    }),
    /** List user's posts */
    list: protectedProcedure.query(async ({ ctx }) => {
      return getUserPosts(ctx.user.id);
    }),
    /** Get single post */
    get: protectedProcedure.input(z5.object({ id: z5.number() })).query(async ({ input, ctx }) => {
      return getPostById(input.id, ctx.user.id);
    }),
    /** Generate background image via Pollinations or Gemini */
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
      const bgRoot = path2.join(process.cwd(), "client", "public", "images", "backgrounds");
      try {
        const categories = fs.readdirSync(bgRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((dir) => {
          const catPath = path2.join(bgRoot, dir.name);
          const images = fs.readdirSync(catPath).filter((f) => /\.(webp|jpg|jpeg|png|gif|svg)$/i.test(f)).map((f) => `/ images / backgrounds / ${dir.name} / ${f}`);
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
      console.log("[extractStyles] ==========================================");
      console.log("[extractStyles] Starting extraction for:", input.url);
      console.log("[extractStyles] Timestamp:", (/* @__PURE__ */ new Date()).toISOString());
      console.log("[extractStyles] Step 1: Running hybrid extraction pipeline...");
      const { data: extractedData, visionUsed } = await extractStyleFromUrlWithMeta(input.url);
      console.log("[extractStyles] Palette found:", extractedData.colors.palette.length, "colors");
      console.log("[extractStyles] Vision used:", visionUsed);
      console.log("[extractStyles] Colors:", {
        primary: extractedData.colors.primary,
        background: extractedData.colors.background,
        accent: extractedData.colors.accent,
        palette: extractedData.colors.palette
      });
      const defaultColors = /* @__PURE__ */ new Set(["#6366f1", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"]);
      const realColors = extractedData.colors.palette.filter((c) => !defaultColors.has(c));
      const fallbackUsed = realColors.length === 0;
      if (fallbackUsed) {
        console.log("[extractStyles] FALLBACK: No real colors extracted (SPA/empty detected)");
      }
      console.log("[extractStyles] Step 2: Analyzing design patterns...");
      const designPatterns = await analyzeDesignPattern(extractedData, input.url);
      console.log("[extractStyles] Patterns returned:", designPatterns.length);
      designPatterns.forEach((p, i) => {
        console.log(`[extractStyles] Pattern ${i + 1}: `, {
          name: p.name,
          category: p.category,
          confidence: p.confidence,
          suggestedColors: p.suggestedColors
        });
      });
      console.log("[extractStyles] Step 3: Generating themes...");
      const themes = generateThemesFromPatterns(designPatterns, extractedData, input.url);
      console.log("[extractStyles] Generated themes:", themes.length);
      themes.forEach((t2, i) => {
        console.log(`[extractStyles] Theme ${i + 1}: `, {
          id: t2.id,
          label: t2.label,
          category: t2.category,
          colors: t2.colors
        });
      });
      console.log("[extractStyles] ==========================================");
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
function applyDeterministicCopyGuards(variation) {
  const next = { ...variation };
  if (typeof next.headline === "string") next.headline = next.headline.slice(0, 60).trim();
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
import { createClient as createClient5 } from "@supabase/supabase-js";
var _supabaseAuthClient = null;
function getSupabaseAuthClient() {
  if (!_supabaseAuthClient) {
    if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
    }
    _supabaseAuthClient = createClient5(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
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
import fs2 from "fs";
import { nanoid } from "nanoid";
import path3 from "path";
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
      const clientTemplate = path3.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
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
  const distPath = process.env.NODE_ENV === "development" ? path3.resolve(import.meta.dirname, "../..", "dist", "public") : fs2.existsSync(path3.resolve(import.meta.dirname, "public")) ? path3.resolve(import.meta.dirname, "public") : path3.resolve(import.meta.dirname, "..", "client", "dist");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path3.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
init_env();

// server/_core/analytics.ts
init_db();
async function trackPageView(data) {
  try {
    const { path: path4, referrer, timestamp } = data;
    const pathCategory = categorizePath(path4);
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
        path: path4,
        path_category: pathCategory,
        referrer_domain: referrerDomain || null,
        timestamp: new Date(timestamp).toISOString(),
        created_at: /* @__PURE__ */ new Date()
      });
    } catch (error) {
      console.log("[Analytics] PageView:", {
        path: path4,
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
function categorizePath(path4) {
  if (path4 === "/") return "home";
  if (path4.startsWith("/pricing")) return "pricing";
  if (path4.startsWith("/billing")) return "billing";
  if (path4.startsWith("/privacy")) return "privacy";
  if (path4.startsWith("/terms")) return "legal";
  if (path4.startsWith("/cookies")) return "legal";
  if (path4.includes("/post/")) return "post_detail";
  if (path4.includes("/settings")) return "settings";
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
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
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
    const { path: path4, referrer, timestamp } = req.body;
    await trackPageView({ path: path4, referrer, timestamp });
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
