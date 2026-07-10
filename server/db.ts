import { createClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";

export type JsonValue =
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
  events?: JsonValue;
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
  graphState?: JsonValue;
  sparkCost?: number;
  completedAt?: string;
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
  events: JsonValue | null;
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
  graph_state?: JsonValue | null;
  spark_cost?: number | null;
  completed_at?: string | null;
  createdAt: string;
};

export type BrandKitRecord = {
  id: string;
  user_uuid: string;
  tone: string;
  formatting_rules: string[] | null;
  forbidden_terms: string[] | null;
  must_include: string[] | null;
  dictionary: Record<string, string> | null;
  visual_palette: string[] | null;
  font_family: string | null;
  border_radius: string | null;
  box_shadow: string | null;
  created_at: string;
  updated_at: string;
};

export type PersonaRecord = {
  id: string;
  user_uuid: string;
  audience: string;
  pains: string[] | null;
  goals: string[] | null;
  language_style: string | null;
  objections: string[] | null;
  created_at: string;
  updated_at: string;
};

export type UpdateGenerationRunInput = {
  status?: string;
  graphState?: JsonValue;
  sparkCost?: number;
  completedAt?: string | null;
  errorMessage?: string | null;
  outputSnapshot?: JsonValue;
  evaluationSnapshot?: JsonValue;
  revisionCount?: number;
  candidateCount?: number;
  acceptedCount?: number;
  averageQualityScore?: number;
  originalityFallbackUsed?: boolean;
  events?: JsonValue;
};

export type ShadowGraphMetrics = {
  totalShadowRuns: number;
  shadowCompletedRuns: number;
  shadowRejectedRuns: number;
  shadowFailedRuns: number;
  shadowValidationErrors: number;
  shadowCopyErrors: number;
  shadowSectionsErrors: number;
  shadowVisualFitErrors: number;
  shadowGuardsAppliedRate: number;
  shadowDivergenceRate: number;
};

export type PipelineGraphMetrics = {
  totalPipelineRuns: number;
  pipelineCompletedRuns: number;
  pipelineFailedRuns: number;
  pipelineSlotRetryRate: number;
  pipelineDiversificationRate: number;
  pipelineRevisionRate: number;
  /**
   * Average share of visual-fit issues auto-fixed by applyVisualFitFallback.
   * `null` when no run in the window reported a computable value (the current
   * pipeline reports null per run because it only observes the post-fit snapshot).
   */
  pipelineVisualFitAutoFixRate: number | null;
  pipelineJudgeRejectionRate: number;
  pipelineCarouselDegradationRate: number;
  pipelineLlmCallsAvg: number;
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
  shadowGraph: ShadowGraphMetrics;
  pipelineGraph: PipelineGraphMetrics;
};

function promptSnapshotCalls(promptSnapshot: unknown): Array<Record<string, any>> {
  if (Array.isArray(promptSnapshot)) {
    return promptSnapshot.filter(
      (call): call is Record<string, any> =>
        typeof call === "object" && call !== null && !Array.isArray(call),
    );
  }
  if (
    typeof promptSnapshot === "object" &&
    promptSnapshot !== null &&
    !Array.isArray(promptSnapshot) &&
    Array.isArray((promptSnapshot as { calls?: unknown }).calls)
  ) {
    return ((promptSnapshot as { calls: unknown[] }).calls).filter(
      (call): call is Record<string, any> =>
        typeof call === "object" && call !== null && !Array.isArray(call),
    );
  }
  return [];
}

/**
 * Extrai eventos do shadow graph de um generation_run.
 * Suporta tanto o formato legado (array vazio) quanto o novo formato com events.
 */
export function extractShadowGraphEvents(events: unknown): Array<Record<string, any>> {
  if (!Array.isArray(events)) return [];
  return events.filter(
    (event): event is Record<string, any> =>
      typeof event === "object" &&
      event !== null &&
      !Array.isArray(event) &&
      event.stage === "generation_graph_shadow"
  );
}

/**
 * Calcula métricas agregadas do shadow graph a partir de eventos.
 * NOTA: Atualmente, eventos do shadow graph são mantidos apenas em memória
 * no GenerationTrace e não persistidos no banco. Para análise histórica completa,
 * será necessário adicionar persistência de events (tabela generation_events ou
 * coluna events em generation_runs).
 */
export function calculateShadowGraphMetrics(events: Array<Record<string, any>>): ShadowGraphMetrics {
  const shadowEvents = extractShadowGraphEvents(events);
  const totalShadowRuns = shadowEvents.length;

  const shadowCompletedRuns = shadowEvents.filter((e) => e.status === "completed").length;
  const shadowRejectedRuns = shadowEvents.filter((e) => e.status === "rejected").length;
  const shadowFailedRuns = shadowEvents.filter((e) => e.status === "failed").length;

  const shadowValidationErrors = shadowEvents.reduce(
    (sum, event) => sum + (event.data?.validationErrors?.length ?? 0),
    0
  );
  const shadowCopyErrors = shadowEvents.reduce(
    (sum, event) => sum + (event.data?.copyValidationErrors?.length ?? 0),
    0
  );
  const shadowSectionsErrors = shadowEvents.reduce(
    (sum, event) => sum + (event.data?.sectionsValidationErrors?.length ?? 0),
    0
  );
  const shadowVisualFitErrors = shadowEvents.reduce(
    (sum, event) => sum + (event.data?.visualFitErrors?.length ?? 0),
    0
  );

  const shadowGuardsAppliedRuns = shadowEvents.filter(
    (e) => e.data?.copyGuardsApplied === true
  ).length;

  const shadowDivergenceRuns = shadowEvents.filter(
    (e) =>
      e.status === "rejected" ||
      (e.data?.validationErrors?.length ?? 0) > 0 ||
      (e.data?.copyValidationErrors?.length ?? 0) > 0 ||
      (e.data?.sectionsValidationErrors?.length ?? 0) > 0 ||
      (e.data?.visualFitErrors?.length ?? 0) > 0
  ).length;

  const ratio = (numerator: number, denominator: number) =>
    denominator > 0 ? numerator / denominator : 0;

  return {
    totalShadowRuns,
    shadowCompletedRuns,
    shadowRejectedRuns,
    shadowFailedRuns,
    shadowValidationErrors,
    shadowCopyErrors,
    shadowSectionsErrors,
    shadowVisualFitErrors,
    shadowGuardsAppliedRate: ratio(shadowGuardsAppliedRuns, totalShadowRuns),
    shadowDivergenceRate: ratio(shadowDivergenceRuns, totalShadowRuns),
  };
}

/**
 * Retorna métricas zeradas para o shadow graph.
 * Usado quando não há dados de eventos disponíveis (persistência não implementada).
 */
export function getEmptyShadowGraphMetrics(): ShadowGraphMetrics {
  return {
    totalShadowRuns: 0,
    shadowCompletedRuns: 0,
    shadowRejectedRuns: 0,
    shadowFailedRuns: 0,
    shadowValidationErrors: 0,
    shadowCopyErrors: 0,
    shadowSectionsErrors: 0,
    shadowVisualFitErrors: 0,
    shadowGuardsAppliedRate: 0,
    shadowDivergenceRate: 0,
  };
}

/**
 * Extrai eventos do pipeline graph de um generation_run.
 */
export function extractPipelineGraphEvents(events: unknown): Array<Record<string, any>> {
  if (!Array.isArray(events)) return [];
  return events.filter(
    (event): event is Record<string, any> =>
      typeof event === "object" &&
      event !== null &&
      !Array.isArray(event) &&
      event.stage === "generation_graph_pipeline"
  );
}

/**
 * Calcula métricas agregadas do pipeline graph a partir de eventos.
 */
export function calculatePipelineGraphMetrics(events: Array<Record<string, any>>): PipelineGraphMetrics {
  const pipelineEvents = extractPipelineGraphEvents(events);
  const totalPipelineRuns = pipelineEvents.length;

  const pipelineCompletedRuns = pipelineEvents.filter((e) => e.status === "completed").length;
  const pipelineFailedRuns = pipelineEvents.filter((e) => e.status === "failed").length;

  const pipelineSlotRetryRate = pipelineEvents.reduce(
    (sum, event) => sum + (event.data?.kpi?.slotRetryRate ?? 0),
    0
  );
  const pipelineDiversificationRate = pipelineEvents.reduce(
    (sum, event) => sum + (event.data?.kpi?.diversificationTriggered ? 1 : 0),
    0
  );
  const pipelineRevisionRate = pipelineEvents.reduce(
    (sum, event) => sum + (event.data?.kpi?.qualityRevisionRate ?? 0),
    0
  );
  const pipelineVisualFitAutoFixValues = pipelineEvents
    .map((event) => event.data?.kpi?.visualFitAutoFixRate)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const pipelineVisualFitAutoFixRate = pipelineVisualFitAutoFixValues.length > 0
    ? pipelineVisualFitAutoFixValues.reduce((sum, value) => sum + value, 0) /
      pipelineVisualFitAutoFixValues.length
    : null;
  const pipelineJudgeRejectionRate = pipelineEvents.reduce(
    (sum, event) => sum + (event.data?.kpi?.judgeRejectionRate ?? 0),
    0
  );
  const pipelineCarouselDegradationRate = pipelineEvents.reduce(
    (sum, event) => sum + (event.data?.kpi?.carouselDegradationRate ?? 0),
    0
  );
  const pipelineLlmCallsAvg = pipelineEvents.reduce(
    (sum, event) => sum + (event.data?.kpi?.llmCallsTotal ?? 0),
    0
  );

  return {
    totalPipelineRuns,
    pipelineCompletedRuns,
    pipelineFailedRuns,
    pipelineSlotRetryRate,
    pipelineDiversificationRate: totalPipelineRuns > 0 ? pipelineDiversificationRate / totalPipelineRuns : 0,
    pipelineRevisionRate: totalPipelineRuns > 0 ? pipelineRevisionRate / totalPipelineRuns : 0,
    pipelineVisualFitAutoFixRate,
    pipelineJudgeRejectionRate: totalPipelineRuns > 0 ? pipelineJudgeRejectionRate / totalPipelineRuns : 0,
    pipelineCarouselDegradationRate: totalPipelineRuns > 0 ? pipelineCarouselDegradationRate / totalPipelineRuns : 0,
    pipelineLlmCallsAvg: totalPipelineRuns > 0 ? pipelineLlmCallsAvg / totalPipelineRuns : 0,
  };
}

export function getEmptyPipelineGraphMetrics(): PipelineGraphMetrics {
  return {
    totalPipelineRuns: 0,
    pipelineCompletedRuns: 0,
    pipelineFailedRuns: 0,
    pipelineSlotRetryRate: 0,
    pipelineDiversificationRate: 0,
    pipelineRevisionRate: 0,
    pipelineVisualFitAutoFixRate: null,
    pipelineJudgeRejectionRate: 0,
    pipelineCarouselDegradationRate: 0,
    pipelineLlmCallsAvg: 0,
  };
}

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
    completed_at: input.completedAt,
  });
  const { error } = await db.from("generation_runs").upsert(payload);

  if (error) {
    throw new Error(`[Database] createGenerationRun failed: ${error.message}`);
  }
}

export async function updateGenerationRun(
  id: string,
  userUuid: string,
  input: UpdateGenerationRunInput,
): Promise<void> {
  const db = getSupabaseDbClient();
  const payload = removeUndefined({
    status: input.status,
    graph_state: input.graphState,
    spark_cost: input.sparkCost,
    completed_at: input.completedAt,
    error_message: input.errorMessage,
    output_snapshot: input.outputSnapshot,
    evaluation_snapshot: input.evaluationSnapshot,
    revision_count: input.revisionCount,
    candidate_count: input.candidateCount,
    accepted_count: input.acceptedCount,
    average_quality_score: input.averageQualityScore,
    originality_fallback_used: input.originalityFallbackUsed,
    events: input.events,
  });

  if (Object.keys(payload).length === 0) return;

  const { error } = await db
    .from("generation_runs")
    .update(payload)
    .eq("id", id)
    .eq("user_uuid", userUuid);

  if (error) {
    throw new Error(`[Database] updateGenerationRun failed: ${error.message}`);
  }
}

export async function getBrandKitByUser(
  userUuid: string,
): Promise<BrandKitRecord | undefined> {
  const db = getSupabaseDbClient();
  const { data, error } = await db
    .from("brand_kits")
    .select("*")
    .eq("user_uuid", userUuid)
    .maybeSingle();

  if (error) {
    throw new Error(`[Database] getBrandKitByUser failed: ${error.message}`);
  }

  return (data ?? undefined) as BrandKitRecord | undefined;
}

export async function getPersonaByUser(
  userUuid: string,
): Promise<PersonaRecord | undefined> {
  const db = getSupabaseDbClient();
  const { data, error } = await db
    .from("personas")
    .select("*")
    .eq("user_uuid", userUuid)
    .maybeSingle();

  if (error) {
    throw new Error(`[Database] getPersonaByUser failed: ${error.message}`);
  }

  return (data ?? undefined) as PersonaRecord | undefined;
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
      "status,candidate_count,accepted_count,average_quality_score,revision_count,strategy_fallback_used,originality_fallback_used,prompt_snapshot,total_tokens,estimated_cost_usd,latency_ms,events",
    )
    .gte("created_at", since);

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
  const llmCalls = rows.flatMap((row) => promptSnapshotCalls(row.prompt_snapshot));
  const fallbackRuns = rows.filter(
    (row) =>
      row.strategy_fallback_used ||
      row.originality_fallback_used ||
      promptSnapshotCalls(row.prompt_snapshot).some((call) => Boolean(call?.fallbackFrom)),
  ).length;
  const revisedRuns = rows.filter(
    (row) => Number(row.revision_count ?? 0) > 0,
  ).length;

  // Processar shadow events dos output_snapshots que contêm events
  const allShadowEvents = rows.flatMap((row) => extractShadowGraphEvents(row.events));

  // Calcular métricas do shadow graph (será empty array até events serem persistidos)
  const shadowGraphMetrics = allShadowEvents.length > 0
    ? calculateShadowGraphMetrics(allShadowEvents)
    : getEmptyShadowGraphMetrics();

  // Processar pipeline graph events
  const allPipelineEvents = rows.flatMap((row) => extractPipelineGraphEvents(row.events));

  const pipelineGraphMetrics = allPipelineEvents.length > 0
    ? calculatePipelineGraphMetrics(allPipelineEvents)
    : getEmptyPipelineGraphMetrics();

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
    shadowGraph: shadowGraphMetrics,
    pipelineGraph: pipelineGraphMetrics,
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
    .order("created_at", { ascending: false })
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
