import { publishWorkEvent } from "./ai/workflows/generationEvents";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { ENV } from "./_core/env";
import { analyzeSiteIntelligence } from "./siteIntelligence";
import { normalizeSiteUrl } from "./siteContent";
import { publicUrl } from "./publicUrl";
import {
  brandProjectInputSchema,
  compileProjectDossier,
} from "@shared/brandProjects";
import type { SiteIntelligenceResult } from "@shared/postspark";
import type { z } from "zod";
import type {
  brandCaptureStartSchema,
  brandCaptureSaveSchema,
} from "@shared/brandCapture";
export type CaptureRecord = {
  id: string;
  owner_id: string;
  normalized_url: string;
  status: "queued" | "running" | "completed" | "failed";
  executor_scope: string | null;
  execution_mode: string;
  lease_token: string | null;
  lease_until: string | null;
  deadline_at: string;
  result: SiteIntelligenceResult | null;
  error_reason: string | null;
  created_at: string;
  saved_project_id: string | null;
};
export async function captureRpc(name: string, args: Record<string, unknown>) {
  const r = await getDb().rpc(name, args);
  if (r.error) throw r.error;
  return r.data;
}
export async function readCapture(id: string, owner?: string, scope?: string) {
  let q = getDb().from("brand_captures").select("*").eq("id", id);
  if (owner) q = q.eq("owner_id", owner);
  if (scope) q = q.eq("executor_scope", scope);
  const r = await q.maybeSingle();
  if (r.error) throw r.error;
  return r.data as CaptureRecord | null;
}
export function capturePreview(c: CaptureRecord) {
  if (!c.result) return null;
  const { brand, business, editorial, quality, sourceUrl, extractedAt } =
    c.result.siteIntelligence;
  const structuredData = {
    offerAndTransformation: business.valueProposition || business.summary,
    factualDifferentials: business.differentiators.join("\n"),
    targetAudience: business.audiences.join("\n"),
    painsAndObjections: [
      ...business.audienceProblems,
      ...business.objections,
    ].join("\n"),
    voiceTone: editorial.toneGuidelines.join("\n"),
    forbiddenTerms: editorial.prohibitedClaims.join("; "),
    defaultCta: "",
  };
  return brandProjectInputSchema.parse({
    name: brand.brandName || new URL(sourceUrl).hostname,
    niche: brand.industry || "Revisar segmento",
    sourceType: "website",
    structuredData,
    compiledDocument: compileProjectDossier(
      brand.brandName || new URL(sourceUrl).hostname,
      brand.industry || "Revisar segmento",
      structuredData
    ),
    capture: {
      version: 1,
      captureId: c.id,
      sourceUrl,
      capturedAt: extractedAt,
      warnings: quality.warnings,
      inferredFields: [
        "targetAudience",
        "painsAndObjections",
        "voiceTone",
        ...(!brand.metadata.visionUsed ? ["visualPreferences"] : []),
      ],
    },
    visualPreferences: {
      colors: brand.colors.palette,
      fonts: [brand.typography.headingFont, brand.typography.bodyFont],
      personality: [
        brand.emotionalProfile.primary,
        brand.emotionalProfile.secondary,
        brand.emotionalProfile.mood,
      ],
      composition: JSON.stringify(brand.composition),
    },
  });
}
export function publicCapture(c: CaptureRecord) {
  return {
    id: c.id,
    status: c.status,
    sourceUrl: c.normalized_url,
    error: c.error_reason,
    deadlineAt: Date.parse(c.deadline_at),
    savedProjectId: c.saved_project_id,
    progressTransport:
      c.execution_mode === "local-demand"
        ? ("events" as const)
        : ("poll" as const),
    preview: capturePreview(c),
  };
}
export async function startCapture(
  owner: string,
  input: z.infer<typeof brandCaptureStartSchema>
) {
  if (!ENV.aiSiteIntelligenceEnabled)
    throw new Error("Captura de marca indisponível nesta configuração.");
  if (ENV.generationAdmissionPaused) {
    const existing = await getDb()
      .from("brand_captures")
      .select("*")
      .eq("owner_id", owner)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return existing.data as CaptureRecord;
    throw new Error(
      "A captura está em manutenção. Nenhuma captura nova foi iniciada."
    );
  }
  const url = normalizeSiteUrl(input.url);
  await publicUrl(url);
  const local = ENV.localDemandEnabled;
  const scope = local
    ? await (
        await import("./ai/workflows/localDemandSupervisor")
      ).localExecutorScope()
    : null;
  const c = (await captureRpc("brand_capture_start", {
    p_owner: owner,
    p_url: url,
    p_key: input.idempotencyKey,
    p_mode: local ? "local-demand" : "external",
    p_scope: scope,
    p_refresh: input.refresh,
  })) as CaptureRecord;
  if (local && ["queued", "running"].includes(c.status))
    await (await import("./ai/workflows/brandCaptureDemand")).enqueueCapture(c);
  return c;
}
export async function saveCapture(
  owner: string,
  input: z.infer<typeof brandCaptureSaveSchema>
) {
  const c = await readCapture(input.captureId, owner);
  if (!c || c.status !== "completed")
    throw new Error("A captura ainda não está disponível.");
  const preview = capturePreview(c)!;
  const project = brandProjectInputSchema.parse({
    ...input.project,
    sourceType: "website",
    capture: preview.capture,
    visualPreferences:
      input.project.visualPreferences ?? preview.visualPreferences,
    compiledDocument: compileProjectDossier(
      input.project.name,
      input.project.niche,
      input.project.structuredData
    ),
  });
  return captureRpc("brand_capture_save", {
    p_id: c.id,
    p_owner: owner,
    p_project: project,
    p_save_key: input.idempotencyKey,
  });
}
export async function executeCapture(c: CaptureRecord, signal?: AbortSignal) {
  if (!c.lease_token) throw new Error("Capture lease required");
  const update = async (
    action: string,
    key: string | null = null,
    result: unknown = null
  ) => {
    const value = await captureRpc("brand_capture_update", {
      p_id: c.id,
      p_lease: c.lease_token,
      p_action: action,
      p_key: key,
      p_result: result,
    });
    if (action !== "heartbeat")
      publishWorkEvent({
        kind: "brand-capture",
        requestId: c.id,
        ownerId: c.owner_id,
        proposals: [],
        status:
          action === "finish"
            ? "completed"
            : action === "fail"
              ? "failed"
              : "running",
        phase: key ? `${key}:${action}` : undefined,
      });
    return value;
  };
  const timer = setInterval(() => {
    void update("heartbeat").catch(() => {});
  }, 10000);
  try {
    const result = await analyzeSiteIntelligence(c.normalized_url, c.owner_id, {
      requirePersistence: true,
      operation: async (key, work) => {
        signal?.throwIfAborted();
        if (Date.now() >= Date.parse(c.deadline_at))
          throw new Error("capture_deadline_expired");
        const prior = await update("begin", key);
        if (prior.state === "completed") return prior.result;
        if (prior.state !== "new")
          throw new Error("capture_operation_uncertain");
        try {
          const value = await work();
          await update("complete", key, value);
          return value;
        } catch (error) {
          await update("uncertain", key).catch(() => {});
          throw error;
        }
      },
    });
    await update("finish", null, result);
  } catch (error) {
    if (signal?.aborted) throw error;
    await update("fail", null, {
      reason: error instanceof Error ? error.message : "capture_failed",
    });
  } finally {
    clearInterval(timer);
  }
}
/** Legacy is compatible once finished, and shares limits/cache and zero billing. */
export async function legacyCapture(owner: string, url: string) {
  let c = await startCapture(owner, {
    url,
    idempotencyKey: randomUUID(),
    refresh: false,
  });
  const until = Math.min(Date.now() + 90000, Date.parse(c.deadline_at));
  while (["queued", "running"].includes(c.status) && Date.now() < until) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    c = (await readCapture(c.id, owner)) ?? c;
  }
  if (c.status === "completed" && c.result) return c.result;
  throw new Error(
    c.error_reason ||
      `Captura em andamento. Revise a marca no Studio (${c.id}).`
  );
}
