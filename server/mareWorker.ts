import { validateEditPlan } from "../labs/mare-studio/dist/edit-plan.js";
import { setTimeout as pause } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { storeRenderedProjectVideo } from "./mareRoutes";
import { executeEditorial, renderEditorial } from "./mareEditorialJobs";
import { renderMareSlide, type VideoInput } from "./mareRender";
import type { CanvasPostModel } from "../client/src/pages/CanvasLab/components/types";
import { loadOwnedMediaReference } from "./mediaAssets";
import { getSupabase } from "./billing";

type Job = {
  created_at: string;
  id: string;
  actor: string;
  payer: string;
  workspace_id: string | null;
  operation: "edit" | "narration" | "render" | "firstCut" | "review";
  payload: Record<string, unknown>;
};
const bucket = "postspark-mare";
type JobIdentity = Pick<Job, "id" | "actor" | "operation"> & {
  payload?: Record<string, unknown>;
};
function resultKey(job: JobIdentity) {
  return `jobs/${job.actor}/${job.id}/result`;
}
async function settle(
  job: JobIdentity,
  delivered: boolean,
  receipt: unknown,
  error?: string
) {
  const response = await getSupabase().rpc("mare_finish_job", {
    p_id: job.id,
    p_key: delivered ? resultKey(job) : null,
    p_mime: delivered
      ? ["edit", "review", "firstCut"].includes(job.operation) ||
        job.payload?.type === "mare.project.render"
        ? "application/json"
        : job.operation === "render"
          ? "video/mp4"
          : "audio/mpeg"
      : null,
    p_receipt: receipt,
    p_error: error ?? null,
  });
  if (response.error) throw new Error("Liquidação Maré pendente");
}
async function execute(job: Job) {
  const db = getSupabase();
  if (Date.now() - Date.parse(job.created_at) > 30 * 60 * 1000) {
    await settle(
      job,
      false,
      null,
      "O tempo de espera na fila expirou. A reserva foi liberada."
    );
    return;
  }
  if (job.workspace_id) {
    const owner = await db.rpc("agency_billing_owner", {
      p_workspace_id: job.workspace_id,
      p_user_id: job.actor,
    });
    if (owner.error) throw owner.error;
    if (owner.data !== job.payer) {
      await settle(job, false, null, "Acesso à equipe revogado");
      return;
    }
  }
  if (job.operation === "firstCut" || job.operation === "review") {
    const receipt = await executeEditorial({
      ...job,
      operation: job.operation,
    });
    await settle(job, true, receipt);
    return;
  }
  if (
    job.operation === "render" &&
    job.payload.type === "mare.project.render"
  ) {
    const source = await db
      .from("mare_assets")
      .select("kind,actor,workspace_id,object_key,size_bytes")
      .eq("id", job.payload.revisionId)
      .single();
    if (source.error) throw source.error;
    const asset = source.data;
    if (
      asset.kind !== "project" ||
      asset.workspace_id !== job.workspace_id ||
      (!job.workspace_id && asset.actor !== job.actor) ||
      Number(asset.size_bytes) > 134217728
    ) {
      await settle(
        job,
        false,
        null,
        "A fonte da renderização está indisponível."
      );
      return;
    }
    const storage = db.storage.from(bucket);
    let videoAssetId: string | undefined;
    const geometry = await renderEditorial(
      { ...job.payload, operation: "packageRender" },
      async name => {
        if (name !== "project") throw Error("Fonte inválida.");
        const original = await storage.download(asset.object_key);
        if (original.error) throw original.error;
        return original.data;
      },
      async (name, bytes) => {
        if (name !== "movie") throw Error("Entrega inválida.");
        const stored = await storeRenderedProjectVideo(
          bytes,
          job.actor,
          job.workspace_id
        );
        videoAssetId = stored.assetId;
      },
      async () => {
        throw Error("Renderização não usa IA.");
      },
      async progress => {
        const state = await db
          .from("mare_jobs")
          .update({ progress })
          .eq("id", job.id)
          .eq("status", "running")
          .select("id")
          .maybeSingle();
        if (state.error || !state.data) throw Error("Trabalho interrompido.");
      }
    );
    if (!videoAssetId) throw Error("Entrega ausente.");
    const receipt = {
      ...geometry,
      revisionId: job.payload.revisionId,
      videoAssetId,
      mime: job.payload.format === "webm" ? "video/webm" : "video/mp4",
    };
    const final = await storage.upload(
      resultKey(job),
      Buffer.from(JSON.stringify(receipt)),
      { upsert: true, contentType: "application/json" }
    );
    if (final.error) throw final.error;
    await settle(job, true, receipt);
    return;
  }
  if (job.operation === "render") {
    const post = job.payload as unknown as CanvasPostModel;
    const sources = new Map<string, VideoInput>();
    for (const { assetId } of Object.values(
      post.slides[post.currentSlideIndex].temporalMedia ?? {}
    )) {
      if (sources.has(assetId)) continue;
      const asset = await db
        .from("mare_assets")
        .select("*")
        .eq("id", assetId)
        .single();
      if (
        asset.error ||
        asset.data.kind !== "video" ||
        asset.data.workspace_id !== job.workspace_id ||
        (!job.workspace_id && asset.data.actor !== job.actor)
      )
        throw Error("Fonte indisponível");
      const file = await db.storage
        .from(bucket)
        .download(asset.data.playback_key || asset.data.object_key);
      if (file.error) throw file.error;
      sources.set(assetId, {
        bytes: Buffer.from(await file.data.arrayBuffer()),
        duration: asset.data.duration,
        mime: asset.data.playback_key ? "video/mp4" : asset.data.mime,
      });
    }
    const file = await renderMareSlide(
      post,
      sources,
      async url => {
        const owner = url.split("/")[3];
        if (owner !== job.actor) {
          const access = await db.rpc("agency_can_read_media", {
            p_user_id: job.actor,
            p_media_path: url,
          });
          if (access.error || !access.data) throw Error("Imagem indisponível");
        }
        const original = await loadOwnedMediaReference(url, owner);
        return Buffer.from(original.dataUri.split(",")[1], "base64");
      },
      job.actor,
      async progress => {
        const state = await db
          .from("mare_jobs")
          .update({ progress })
          .eq("id", job.id)
          .eq("status", "running")
          .select("id")
          .maybeSingle();
        if (state.error || !state.data) throw Error("Trabalho interrompido.");
      }
    );
    const uploaded = await db.storage
      .from(bucket)
      .upload(resultKey(job), file, { contentType: "video/mp4" });
    if (uploaded.error) throw uploaded.error;
    await settle(job, true, { bytes: file.length });
    return;
  }
  const origin = new URL(
    process.env.MARE_PROCESSOR_ORIGIN || "http://127.0.0.1:18745"
  ).origin;
  const reply = await fetch(
    origin + (job.operation === "edit" ? "/api/director" : "/api/narration"),
    {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(job.payload),
      signal: AbortSignal.timeout(140000),
      redirect: "error",
    }
  );
  if (!reply.ok) {
    await settle(job, false, null, "O processador não entregou o resultado.");
    return;
  }
  const result = Buffer.from(await reply.arrayBuffer());
  const cost = reply.headers.get("x-mare-provider-cost");
  let receipt: unknown = {
    generationId: reply.headers.get("x-generation-id"),
    model: job.payload.model,
    ...(cost !== null && Number.isFinite(Number(cost)) && Number(cost) >= 0
      ? { usage: { cost: Number(cost) } }
      : {}),
  };
  if (job.operation === "edit") {
    const parsed = JSON.parse(result.toString("utf8"));
    try {
      validateEditPlan(
        parsed.output,
        (job.payload.context as { catalog: unknown }).catalog
      );
    } catch (error) {
      await settle(
        job,
        false,
        { usage: parsed.usage, model: parsed.model, id: parsed.generationId },
        error instanceof Error
          ? error.message
          : "O modelo não produziu uma edição."
      );
      return;
    }
    receipt = {
      usage: parsed.usage,
      model: parsed.model,
      id: parsed.generationId,
    };
  }
  const upload = await db.storage.from(bucket).upload(resultKey(job), result, {
    upsert: false,
    contentType: ["edit", "review", "firstCut"].includes(job.operation)
      ? "application/json"
      : "audio/mpeg",
  });
  if (upload.error) throw new Error("Persistência do resultado pendente");
  await settle(job, true, receipt);
}
async function reconcile() {
  const db = getSupabase();
  const pending = await db
    .from("mare_jobs")
    .select("id,actor,operation,started_at,attempts,renderType:payload->>type")
    .eq("status", "reconciling")
    .order("last_checked_at", { nullsFirst: true })
    .limit(10);
  if (pending.error) throw pending.error;
  for (const candidate of pending.data ?? []) {
    const checked = await db
      .from("mare_jobs")
      .update({ last_checked_at: new Date().toISOString() })
      .eq("id", candidate.id)
      .eq("status", "reconciling");
    if (checked.error) throw checked.error;
    try {
      const info = await db.storage.from(bucket).info(resultKey(candidate));
      if (!info.error)
        await settle(
          { ...candidate, payload: { type: candidate.renderType } },
          true,
          null
        );
      else if (
        (Number(info.error.statusCode) === 404 ||
          ["NoSuchKey", "not_found"].includes(
            String((info.error as { code?: string }).code)
          )) &&
        Date.now() - Date.parse(candidate.started_at) > 15 * 60 * 1000
      ) {
        if (candidate.operation === "render" && candidate.attempts < 2) {
          const retry = await db
            .from("mare_jobs")
            .update({ status: "queued", progress: 0, error: null })
            .eq("id", candidate.id)
            .eq("status", "reconciling");
          if (retry.error) throw retry.error;
          continue;
        }
        if (["firstCut", "review"].includes(candidate.operation)) {
          const resume = await db.rpc("mare_resume_editorial", {
            p_job: candidate.id,
          });
          if (resume.error) throw resume.error;
          if (resume.data) continue;
        }
        await settle(
          candidate,
          false,
          null,
          "A entrega não foi recuperada. Reserva liberada."
        );
      }
    } catch {
      console.error("Maré: liquidação pendente para o trabalho", candidate.id);
    }
  }
}
let lastReconciliation = 0;
export async function workOnce() {
  const db = getSupabase();
  if (Date.now() - lastReconciliation > 30000) {
    await reconcile();
    lastReconciliation = Date.now();
  }
  const claim = await db.rpc("mare_claim_job");
  if (claim.error) throw claim.error;
  const job: Job | undefined = claim.data?.[0];
  if (job) {
    try {
      await execute(job);
    } catch {
      await db
        .from("mare_jobs")
        .update({
          status: "reconciling",
          error: "Conferindo o resultado da operação",
        })
        .eq("id", job.id)
        .eq("status", "running");
    }
    return true;
  }

  return false;
}
async function main() {
  let stopping = false;
  process.on("SIGTERM", () => {
    stopping = true;
  });
  process.on("SIGINT", () => {
    stopping = true;
  });
  while (!stopping) {
    try {
      if (!(await workOnce())) await pause(2000);
    } catch {
      console.error(
        "Fila Maré indisponível. Nova tentativa em cinco segundos."
      );
      await pause(5000);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main();
