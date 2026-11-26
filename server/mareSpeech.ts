import type { Express, Request, RequestHandler, Response } from "express";
import type { AuthenticatedUser } from "./_core/sdk";
import { ENV } from "./_core/env";
import { publicStorageSignedUrl } from "./designCatalog/storagePublicUrl";
import { z } from "zod";
import { getDb } from "./db";
import { MareError } from "./mareMediaFiles";

const uuid = z.string().uuid();
const input = z
  .object({
    jobId: uuid,
    assetId: uuid,
    start: z.number().min(0).max(86400),
    end: z.number().positive(),
    language: z.enum(["auto", "pt", "en", "es"]),
    speech: z.boolean(),
    mask: z.boolean(),
  })
  .refine(
    v =>
      (v.speech || v.mask) &&
      v.end - v.start >= 0.03 &&
      v.end - v.start <= 60.000001
  );
type Asset = { kind: string; object_key: string; duration?: number };
type Route = (
  cap: "editor" | null,
  handle: (
    req: Request,
    res: Response,
    user: AuthenticatedUser
  ) => Promise<unknown>
) => RequestHandler;

export async function mareSpeechReady() {
  if (process.env.POSTSPARK_MARE_SPEECH !== "true") return false;
  const { data, error } = await getDb()
    .from("mare_speech_health")
    .select("ready,seen_at")
    .eq("id", true)
    .maybeSingle();
  return (
    !error &&
    data?.ready === true &&
    Date.now() - Date.parse(data.seen_at) < 90_000
  );
}
export function registerMareSpeech(
  app: Express,
  route: Route,
  assetAccess: (actor: string, id: string) => Promise<Asset>
) {
  const base = "/api/mare/speech";
  app.post(
    base,
    route("editor", async (req, _, user) => {
      if (!(await mareSpeechReady()))
        throw new MareError(503, "A análise de fala está indisponível.");
      const data = input.parse(req.body),
        { jobId, assetId, ...options } = data;
      const asset = await assetAccess(user.id, assetId);
      if (
        asset.kind !== "video" ||
        !asset.duration ||
        options.end > asset.duration + 0.08
      )
        throw new MareError(422, "Trecho fora da duração do vídeo.");
      const daily = Number(
        process.env.POSTSPARK_MARE_SPEECH_DAILY_SECONDS || 600
      );
      if (!Number.isSafeInteger(daily) || daily <= 0)
        throw new MareError(503, "Cota de análise indisponível.");
      const { error } = await getDb().rpc("mare_admit_speech", {
        p_id: jobId,
        p_actor: user.id,
        p_asset: assetId,
        p_seconds: Math.min(60, Math.ceil(data.end - data.start)),
        p_daily_seconds: daily,
        p_options: options,
      });
      if (error) {
        if (error.code === "PT429")
          throw new MareError(
            429,
            "Há uma análise em andamento ou a cota das últimas 24 horas foi atingida."
          );
        if (error.code === "PT404")
          throw new MareError(404, "Vídeo indisponível.");
        if (error.code === "23505")
          throw new MareError(409, "Esta análise já foi enviada.");
        throw new MareError(503, "Não foi possível reservar a análise.");
      }
      return { job: jobId };
    })
  );
  const jobFor = async (id: string, actor: string) => {
    const { data, error } = await getDb()
      .from("mare_speech_jobs")
      .select("id,asset_id,state,response,mask_key,created_at")
      .eq("id", uuid.parse(id))
      .eq("actor", actor)
      .maybeSingle();
    if (error) throw new MareError(503, "Análise indisponível.");
    if (!data) throw new MareError(404, "Análise indisponível.");
    await assetAccess(actor, data.asset_id);
    return data;
  };
  app.delete(
    base + "/:id",
    route(null, async (req, _, user) => {
      const job = await jobFor(req.params.id, user.id);
      const { error } = await getDb()
        .from("mare_speech_jobs")
        .update({ state: "cancelled", next_check: new Date().toISOString() })
        .eq("id", job.id)
        .eq("actor", user.id);
      if (error) throw new MareError(503, "Falha ao cancelar análise.");
      return {};
    })
  );
  app.get(
    [base + "/:id", base + "/:id/mask"],
    route(null, async (req, res, user) => {
      const job = await jobFor(req.params.id, user.id);
      if (
        job.state === "cancelled" ||
        Date.now() - Date.parse(job.created_at) > 25 * 60_000
      )
        throw new MareError(410, "Esta análise expirou.");
      if (req.path.endsWith("/mask")) {
        if (job.state !== "ready" || !job.mask_key)
          throw new MareError(404, "Máscara indisponível.");
        const signed = await getDb()
          .storage.from("postspark-mare")
          .createSignedUrl(job.mask_key, 60);
        if (!signed.data || signed.error)
          throw new MareError(503, "Máscara indisponível.");
        res.set("Referrer-Policy", "no-referrer");
        res.redirect(
          307,
          publicStorageSignedUrl(
            signed.data.signedUrl,
            ENV.supabaseUrl,
            ENV.supabasePublicUrl
          )
        );
        return;
      }
      return job.response || { state: "running", phase: "queued", progress: 0 };
    })
  );
}
