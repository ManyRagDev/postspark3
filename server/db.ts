import { createClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

type CopyAngleValue = {
  type: string;
  label: string;
  badge: string;
  stickerText: string;
};

export type PostRecord = {
  id: number;
  user_uuid: string | null;
  inputType: string;
  inputContent: string;
  platform: string;
  headline: string | null;
  body: string | null;
  caption: string | null;
  hashtags: string[] | null;
  callToAction: string | null;
  tone: string | null;
  imagePrompt: string | null;
  imageUrl: string | null;
  backgroundColor: string | null;
  textColor: string | null;
  accentColor: string | null;
  layout: string | null;
  postMode: string;
  slides: JsonValue[] | null;
  textElements: JsonValue[] | null;
  image_settings: JsonValue | null;
  layout_settings: JsonValue | null;
  bg_value: JsonValue | null;
  bg_overlay: JsonValue | null;
  copy_angle: CopyAngleValue | null;
  variation_snapshot: JsonValue | null;
  exported: boolean | null;
  createdAt: string;
  updatedAt: string;
};

export type CreatePostInput = {
  userUuid: string;
  inputType: string;
  inputContent: string;
  platform: string;
  headline?: string;
  body?: string;
  caption?: string;
  hashtags?: string[];
  callToAction?: string;
  tone?: string;
  imagePrompt?: string;
  imageUrl?: string;
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
  layout?: string;
  postMode?: string;
  slides?: JsonValue[];
  textElements?: JsonValue[];
  imageSettings?: JsonValue;
  layoutSettings?: JsonValue;
  bgValue?: JsonValue;
  bgOverlay?: JsonValue;
  copyAngle?: CopyAngleValue;
  variationSnapshot?: JsonValue;
};

export type UpdatePostInput = Partial<Omit<CreatePostInput, "userUuid">> & {
  id?: number;
};

export type BackgroundAssetRecord = {
  id: number;
  user_uuid: string;
  image_url: string;
  source_type: string;
  prompt: string | null;
  label: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateBackgroundAssetInput = {
  userUuid: string;
  imageUrl: string;
  sourceType: string;
  prompt?: string;
  label?: string;
};

export type SiteIntelligenceRecord = {
  id: string;
  user_uuid: string;
  source_url: string;
  normalized_url: string;
  fingerprint: string;
  snapshot: JsonValue;
  createdAt: string;
  updatedAt: string;
};

export type UpsertSiteIntelligenceInput = {
  id: string;
  userUuid: string;
  sourceUrl: string;
  normalizedUrl: string;
  fingerprint: string;
  snapshot: JsonValue;
};

export type CreateGenerationRunInput = {
  id: string;
  userUuid: string;
  siteIntelligenceId?: string;
  status: string;
  inputType: string;
  inputContent: string;
  platform: string;
  postMode: string;
  creationMode: string;
  requestedModel: string;
  effectiveModels: string[];
  promptSnapshot?: JsonValue;
  strategySnapshot?: JsonValue;
  evaluationSnapshot?: JsonValue;
  outputSnapshot?: JsonValue;
  revisionCount: number;
  candidateCount: number;
  acceptedCount: number;
  averageQualityScore: number;
  strategyFallbackUsed: boolean;
  originalityFallbackUsed: boolean;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  errorMessage?: string;
};

export type CreateContentFingerprintInput = {
  id: string;
  userUuid: string;
  generationRunId?: string;
  sourceType: string;
  sourceId: string;
  textHash: string;
  embedding: number[];
  metadata?: JsonValue;
};

export type GenerationRunRecord = {
  id: string;
  user_uuid: string;
  site_intelligence_id: string | null;
  status: string;
  input_type: string;
  input_content: string;
  platform: string;
  post_mode: string;
  creation_mode: string;
  requested_model: string;
  effective_models: string[];
  prompt_snapshot: JsonValue | null;
  strategy_snapshot: JsonValue | null;
  evaluation_snapshot: JsonValue | null;
  output_snapshot: JsonValue | null;
  revision_count: number;
  candidate_count: number;
  accepted_count: number;
  average_quality_score: number;
  strategy_fallback_used: boolean;
  originality_fallback_used: boolean;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  latency_ms: number;
  error_message: string | null;
  createdAt: string;
};

export type GenerationOperationalMetrics = {
  windowDays: number;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  completionRate: number;
  candidateAcceptanceRate: number;
  revisionRate: number;
  fallbackRate: number;
  llmCallErrorRate: number;
  averageQualityScore: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

let _supabaseDbClient: any = null;

function getSupabaseDbClient() {
  if (!_supabaseDbClient) {
    if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
    }

    _supabaseDbClient = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
      auth: { persistSession: false },
      db: { schema: "postspark" },
    } as any);
  }

  return _supabaseDbClient;
}

function removeUndefined<T extends Record<string, unknown>>(payload: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

export function getDb() {
  return getSupabaseDbClient();
}

export async function createPost(post: CreatePostInput): Promise<number> {
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
    variation_snapshot: post.variationSnapshot ?? null,
  };

  const { data, error } = await db
    .from("posts")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`[Database] createPost failed: ${error?.message ?? "unknown error"}`);
  }

  return data.id as number;
}

export async function getUserPosts(userUuid: string, limit = 50): Promise<PostRecord[]> {
  const db = getSupabaseDbClient();

  const { data, error } = await db
    .from("posts")
    .select("*")
    .eq("user_uuid", userUuid)
    .order("createdAt", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`[Database] getUserPosts failed: ${error.message}`);
  }

  return (data ?? []) as PostRecord[];
}

export async function updatePost(
  postId: number,
  userUuid: string,
  data: UpdatePostInput
): Promise<void> {
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
    variation_snapshot: data.variationSnapshot,
  });

  if (Object.keys(payload).length === 0) {
    return;
  }

  const { error } = await db
    .from("posts")
    .update(payload)
    .eq("id", postId)
    .eq("user_uuid", userUuid);

  if (error) {
    throw new Error(`[Database] updatePost failed: ${error.message}`);
  }
}

export async function getPostById(
  postId: number,
  userUuid: string
): Promise<PostRecord | undefined> {
  const db = getSupabaseDbClient();

  const { data, error } = await db
    .from("posts")
    .select("*")
    .eq("id", postId)
    .eq("user_uuid", userUuid)
    .maybeSingle();

  if (error) {
    throw new Error(`[Database] getPostById failed: ${error.message}`);
  }

  return (data ?? undefined) as PostRecord | undefined;
}

export async function createBackgroundAsset(input: CreateBackgroundAssetInput): Promise<BackgroundAssetRecord> {
  const db = getSupabaseDbClient();

  const { data, error } = await db
    .from("background_assets")
    .insert({
      user_uuid: input.userUuid,
      image_url: input.imageUrl,
      source_type: input.sourceType,
      prompt: input.prompt ?? null,
      label: input.label ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`[Database] createBackgroundAsset failed: ${error?.message ?? "unknown error"}`);
  }

  return data as BackgroundAssetRecord;
}

export async function getUserBackgroundAssets(userUuid: string, limit = 100): Promise<BackgroundAssetRecord[]> {
  const db = getSupabaseDbClient();

  const { data, error } = await db
    .from("background_assets")
    .select("*")
    .eq("user_uuid", userUuid)
    .order("createdAt", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`[Database] getUserBackgroundAssets failed: ${error.message}`);
  }

  return (data ?? []) as BackgroundAssetRecord[];
}

export async function getSiteIntelligenceById(
  id: string,
  userUuid: string,
): Promise<SiteIntelligenceRecord | undefined> {
  const db = getSupabaseDbClient();
  const { data, error } = await db
    .from("site_intelligence")
    .select("*")
    .eq("id", id)
    .eq("user_uuid", userUuid)
    .maybeSingle();

  if (error) {
    throw new Error(`[Database] getSiteIntelligenceById failed: ${error.message}`);
  }

  return (data ?? undefined) as SiteIntelligenceRecord | undefined;
}

export async function getLatestSiteIntelligenceByUrl(
  normalizedUrl: string,
  userUuid: string,
): Promise<SiteIntelligenceRecord | undefined> {
  const db = getSupabaseDbClient();
  const { data, error } = await db
    .from("site_intelligence")
    .select("*")
    .eq("normalized_url", normalizedUrl)
    .eq("user_uuid", userUuid)
    .order("updatedAt", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[Database] getLatestSiteIntelligenceByUrl failed: ${error.message}`,
    );
  }

  return (data ?? undefined) as SiteIntelligenceRecord | undefined;
}

export async function upsertSiteIntelligence(
  input: UpsertSiteIntelligenceInput,
): Promise<SiteIntelligenceRecord> {
  const db = getSupabaseDbClient();
  const { data, error } = await db
    .from("site_intelligence")
    .upsert(
      {
        id: input.id,
        user_uuid: input.userUuid,
        source_url: input.sourceUrl,
        normalized_url: input.normalizedUrl,
        fingerprint: input.fingerprint,
        snapshot: input.snapshot,
        updatedAt: new Date().toISOString(),
      },
      { onConflict: "user_uuid,normalized_url,fingerprint" },
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `[Database] upsertSiteIntelligence failed: ${error?.message ?? "unknown error"}`,
    );
  }

  return data as SiteIntelligenceRecord;
}

export async function createGenerationRun(
  input: CreateGenerationRunInput,
): Promise<void> {
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
    error_message: input.errorMessage ?? null,
  });

  if (error) {
    throw new Error(`[Database] createGenerationRun failed: ${error.message}`);
  }
}

export async function createContentFingerprints(
  inputs: CreateContentFingerprintInput[],
): Promise<void> {
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
      metadata: input.metadata ?? null,
    })),
  );

  if (error) {
    throw new Error(
      `[Database] createContentFingerprints failed: ${error.message}`,
    );
  }
}

export async function getGenerationOperationalMetrics(
  windowDays = 7,
): Promise<GenerationOperationalMetrics> {
  const db = getSupabaseDbClient();
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const { data, error } = await db
    .from("generation_runs")
    .select(
      "status,candidate_count,accepted_count,average_quality_score,revision_count,strategy_fallback_used,originality_fallback_used,prompt_snapshot,total_tokens,estimated_cost_usd,latency_ms",
    )
    .gte("createdAt", since);

  if (error) {
    throw new Error(
      `[Database] getGenerationOperationalMetrics failed: ${error.message}`,
    );
  }

  const rows = (data ?? []) as Array<Record<string, any>>;
  const totalRuns = rows.length;
  const completedRuns = rows.filter((row) => row.status === "completed").length;
  const failedRuns = rows.filter((row) => row.status === "failed").length;
  const candidateCount = rows.reduce(
    (sum, row) => sum + Number(row.candidate_count ?? 0),
    0,
  );
  const acceptedCount = rows.reduce(
    (sum, row) => sum + Number(row.accepted_count ?? 0),
    0,
  );
  const completedWithQuality = rows.filter(
    (row) => Number(row.candidate_count ?? 0) > 0,
  );
  const latencies = rows
    .map((row) => Number(row.latency_ms ?? 0))
    .sort((a, b) => a - b);
  const llmCalls = rows.flatMap((row) =>
    Array.isArray(row.prompt_snapshot) ? row.prompt_snapshot : [],
  );
  const fallbackRuns = rows.filter(
    (row) =>
      row.strategy_fallback_used ||
      row.originality_fallback_used ||
      (Array.isArray(row.prompt_snapshot) &&
        row.prompt_snapshot.some((call: any) => Boolean(call?.fallbackFrom))),
  ).length;
  const revisedRuns = rows.filter(
    (row) => Number(row.revision_count ?? 0) > 0,
  ).length;
  const ratio = (numerator: number, denominator: number) =>
    denominator > 0 ? numerator / denominator : 0;

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
      llmCalls.length,
    ),
    averageQualityScore: completedWithQuality.length > 0
      ? completedWithQuality.reduce(
          (sum, row) => sum + Number(row.average_quality_score ?? 0),
          0,
        ) / completedWithQuality.length
      : 0,
    averageLatencyMs: totalRuns > 0
      ? latencies.reduce((sum, latency) => sum + latency, 0) / totalRuns
      : 0,
    p95LatencyMs: latencies.length > 0
      ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)]
      : 0,
    totalTokens: rows.reduce(
      (sum, row) => sum + Number(row.total_tokens ?? 0),
      0,
    ),
    estimatedCostUsd: rows.reduce(
      (sum, row) => sum + Number(row.estimated_cost_usd ?? 0),
      0,
    ),
  };
}

/**
 * Busca o histórico de gerações de um usuário.
 * Retorna em ordem decrescente de criação (mais recentes primeiro).
 */
export async function getUserGenerationRuns(
  userUuid: string,
  limit = 50,
  offset = 0,
): Promise<GenerationRunRecord[]> {
  const db = getSupabaseDbClient();

  const { data, error } = await db
    .from("generation_runs")
    .select("*")
    .eq("user_uuid", userUuid)
    .order("createdAt", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(
      `[Database] getUserGenerationRuns failed: ${error.message}`,
    );
  }

  return (data ?? []) as GenerationRunRecord[];
}

/**
 * Busca uma geração específica por ID.
 */
export async function getGenerationRunById(
  id: string,
  userUuid: string,
): Promise<GenerationRunRecord | null> {
  const db = getSupabaseDbClient();

  const { data, error } = await db
    .from("generation_runs")
    .select("*")
    .eq("id", id)
    .eq("user_uuid", userUuid)
    .single();

  if (error || !data) {
    return null;
  }

  return data as GenerationRunRecord;
}
