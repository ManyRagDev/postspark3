import { firstCut, review, editorialInputs } from "./mareEditorialJobs";
import { authorizeArsenalSaveModel } from "./designCatalog/arsenalSave";
import { createHash } from "node:crypto";
import { publicStorageSignedUrl } from "./designCatalog/storagePublicUrl";
import { ENV } from "./_core/env";
import {
  canvasTemporalMediaSchema,
  temporalInterval,
} from "../shared/canvasTemporalMedia";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { createContext } from "./_core/context";
import { getRealBillingProfile, getSupabase, isUnlimitedPlan } from "./billing";
import { getMareCapabilities } from "./mareCapabilities";

const narration = z
  .object({
    text: z.string().trim().min(1).max(1500),
    model: z.enum([
      "elevenlabs/eleven-flash-v2.5",
      "elevenlabs/eleven-multilingual-v2",
      "elevenlabs/eleven-v4",
    ]),
    voice: z.string().min(1).max(100),
  })
  .strict();
const edit = z
  .object({
    stage: z.literal("edit"),
    context: z
      .object({
        request: z.string().trim().min(1).max(4000),
        catalog: z.array(z.unknown()).min(1).max(160),
        state: z.record(z.string(), z.unknown()),
      })
      .passthrough(),
    previews: z.array(z.never()).optional(),
  })
  .strict();
export function marePrice(
  operation: "edit" | "narration" | "firstCut" | "review",
  payload: Record<string, unknown>
) {
  const key =
    operation === "firstCut"
      ? "POSTSPARK_MARE_FIRST_CUT_SPARKS"
      : operation === "review"
        ? "POSTSPARK_MARE_REVIEW_SPARKS"
        : operation === "edit"
          ? "POSTSPARK_MARE_EDIT_SPARKS"
          : payload.model === "elevenlabs/eleven-flash-v2.5"
            ? "POSTSPARK_MARE_FLASH_PER_1000"
            : "POSTSPARK_MARE_VOICE_PER_1000";
  const unit = Number(process.env[key]);
  if (!Number.isSafeInteger(unit) || unit < 1 || unit > 10000)
    throw new Error("Tarifa indisponível");
  return operation !== "narration"
    ? unit
    : Math.ceil((Array.from(String(payload.text)).length * unit) / 1000);
}
type Handler = (
  req: Request,
  res: Response,
  actor: string,
  agency: boolean
) => Promise<void>;
function protect(handler: Handler, admission = false) {
  return async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const { user } = await createContext({ req, res });
      if (!user) {
        res.sendStatus(401);
        return;
      }
      if (admission && !(await getMareCapabilities(user)).paid) {
        res.sendStatus(403);
        return;
      }
      await handler(req, res, user.id, user.access === "agency");
    } catch (e) {
      res.status(e instanceof z.ZodError ? 400 : 503).json({
        error:
          e instanceof z.ZodError
            ? "Pedido inválido"
            : "Operação Maré indisponível.",
      });
    }
  };
}
async function admitRender(
  req: Request,
  res: Response,
  actor: string,
  payer: string,
  workspaceId: string | null,
  payload: unknown,
  fingerprint: string
) {
  const db = getSupabase();
  const limit = Number(process.env.POSTSPARK_MARE_INCLUDED_RENDERS || 10);
  if (!Number.isSafeInteger(limit) || limit < 1) {
    res.status(503).json({ error: "Franquia de exportação indisponível." });
    return;
  }
  if (req.query.quote === "1") {
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    const [existing, monthly] = await Promise.all([
      db
        .from("mare_jobs")
        .select("id")
        .eq("actor", actor)
        .eq("fingerprint", fingerprint)
        .not("status", "in", "(failed,cancelled)")
        .maybeSingle(),
      db
        .from("mare_jobs")
        .select("id", { count: "exact", head: true })
        .eq("payer", payer)
        .eq("operation", "render")
        .not("status", "in", "(failed,cancelled)")
        .gte("created_at", since.toISOString()),
    ]);
    if (existing.error || monthly.error) throw existing.error || monthly.error;
    res.json({
      id: existing.data?.id,
      remaining: Math.max(0, limit - (monthly.count ?? 0)),
      limit,
    });
    return;
  }
  const task = await db.rpc("mare_admit_render", {
    p_actor: actor,
    p_payer: payer,
    p_workspace: workspaceId ?? null,
    p_payload: payload,
    p_fingerprint: fingerprint,
    p_limit: limit,
  });
  if (task.error) {
    res.status(task.error.code === "PT429" ? 429 : 503).json({
      error:
        task.error.code === "PT429"
          ? "Franquia de renders do mês esgotada."
          : "Fila de vídeo indisponível.",
    });
    return;
  }
  res.json({ id: task.data });
}
export function registerMareJobs(app: Express) {
  const base = "/api/mare/processor";
  app.post(
    base + "/quote",
    protect(async (req, res, actor, agency) => {
      const { operation, payload, anchorId, workspaceId } = z
        .object({
          operation: z.enum(["edit", "narration", "firstCut", "review"]),
          payload: z.record(z.string(), z.unknown()),
          anchorId: z.string().uuid().nullish(),
          workspaceId: z.string().uuid().optional(),
        })
        .parse(req.body);
      const validated = { edit, narration, firstCut, review }[operation].parse(
        payload
      );
      if (JSON.stringify(validated).length > 240000) {
        res.sendStatus(413);
        return;
      }
      const db = getSupabase();
      let payer = actor,
        workspace = workspaceId ?? null;
      if (anchorId) {
        const { data, error } = await db
          .from("mare_anchors")
          .select("workspace_id")
          .eq("actor", actor)
          .eq("id", anchorId)
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          res.sendStatus(404);
          return;
        }
        if (workspaceId && workspaceId !== data.workspace_id) {
          res.sendStatus(403);
          return;
        }
        workspace = data.workspace_id;
      }
      if (agency && !workspace) {
        res.sendStatus(403);
        return;
      }
      if (workspace) {
        const { data, error } = await db.rpc("agency_billing_owner", {
          p_user_id: actor,
          p_workspace_id: workspace,
        });
        if (error) throw error;
        if (!data) {
          res.sendStatus(403);
          return;
        }
        payer = data;
      }
      if (
        (operation === "firstCut" || operation === "review") &&
        !(await editorialInputs(operation, validated, actor, workspace))
      ) {
        res.sendStatus(404);
        return;
      }
      const profile = await getRealBillingProfile("", payer);
      const sparks = isUnlimitedPlan(profile.plan)
        ? 0
        : marePrice(operation, validated);
      const tariff = process.env.POSTSPARK_MARE_TARIFF_VERSION || "1";
      const hash = createHash("sha256")
        .update(
          JSON.stringify([
            anchorId ?? null,
            workspace,
            payer,
            tariff,
            sparks,
            operation,
            validated,
          ])
        )
        .digest("hex");
      const expired = await db
        .from("mare_jobs")
        .delete()
        .eq("actor", actor)
        .eq("request_hash", hash)
        .eq("status", "quoted")
        .lt("expires_at", new Date().toISOString());
      if (expired.error) throw expired.error;
      const result = await db
        .from("mare_jobs")
        .insert({
          actor,
          payer,
          workspace_id: workspace,
          anchor_id: anchorId,
          operation,
          payload: validated,
          sparks,
          tariff,
          request_hash: hash,
        })
        .select("id,sparks")
        .single();
      const quote =
        result.error?.code === "23505"
          ? await db
              .from("mare_jobs")
              .select("id,sparks")
              .eq("actor", actor)
              .eq("request_hash", hash)
              .in("status", ["quoted", "queued", "running", "reconciling"])
              .single()
          : result;
      if (quote.error) throw quote.error;
      res.json({
        ...quote.data,
        balance: isUnlimitedPlan(profile.plan) ? null : profile.sparks,
      });
    }, true)
  );
  app.post(
    base + "/jobs/:id/start",
    protect(async (req, res, actor) => {
      const id = z.string().uuid().parse(req.params.id);
      const { data, error } = await getSupabase().rpc("mare_start_job", {
        p_actor: actor,
        p_id: id,
      });
      if (error) {
        const status =
          (
            { PT402: 402, PT403: 403, PT409: 409, P0002: 404 } as Record<
              string,
              number
            >
          )[error.code] || 503;
        res.status(status).json({
          error:
            status === 402
              ? "Sparks insuficientes"
              : status === 409
                ? "A cotação expirou"
                : "Trabalho indisponível",
        });
        return;
      }
      res.json({ status: data });
    }, true)
  );
  app.post(
    base + "/project-render",
    protect(async (req, res, actor, agency) => {
      const data = z
        .object({
          revisionId: z.string().uuid(),
          compositionId: z.string().min(1).max(200).optional(),
          format: z.enum(["mp4", "webm"]),
          workspaceId: z.string().uuid().optional(),
          frame: z
            .object({
              width: z.number().positive().max(8192),
              height: z.number().positive().max(8192),
            })
            .optional(),
        })
        .strict()
        .parse(req.body);
      const ctx = await createContext({ req, res });
      if (!ctx.user || !(await getMareCapabilities(ctx.user)).projectRender) {
        res.sendStatus(403);
        return;
      }
      if (agency && !data.workspaceId) {
        res.sendStatus(403);
        return;
      }
      const db = getSupabase(),
        workspace = data.workspaceId ?? null;
      let payer = actor;
      if (workspace) {
        const owner = await db.rpc("agency_billing_owner", {
          p_user_id: actor,
          p_workspace_id: workspace,
        });
        if (owner.error) throw owner.error;
        if (!owner.data) {
          res.sendStatus(403);
          return;
        }
        payer = owner.data;
      }
      const asset = await db
        .from("mare_assets")
        .select("actor,workspace_id,kind,size_bytes,composition_ids")
        .eq("id", data.revisionId)
        .maybeSingle();
      if (asset.error) throw asset.error;
      const source = asset.data;
      if (
        !source ||
        source.kind !== "project" ||
        source.workspace_id !== workspace ||
        (!workspace && source.actor !== actor)
      ) {
        res.sendStatus(404);
        return;
      }
      if (
        source.size_bytes > 134217728 ||
        (data.compositionId &&
          !source.composition_ids?.includes(data.compositionId)) ||
        (data.format === "webm" && !data.compositionId) ||
        (data.frame &&
          (data.frame.width / data.frame.height < 0.562 ||
            data.frame.width / data.frame.height > 2))
      ) {
        res
          .status(422)
          .json({ error: "Composição ou formato de saída incompatível." });
        return;
      }
      const payload = {
        type: "mare.project.render",
        revisionId: data.revisionId,
        compositionId: data.compositionId,
        format: data.format,
        frame: data.frame,
      };
      const fingerprint = createHash("sha256")
        .update(JSON.stringify([workspace, payload]))
        .digest("hex");
      await admitRender(
        req,
        res,
        actor,
        payer,
        workspace,
        payload,
        fingerprint
      );
    })
  );
  app.post(
    base + "/render",
    protect(async (req, res, actor, agency) => {
      const { post, workspaceId } = z
        .object({
          post: z
            .object({
              id: z.string(),
              aspectRatio: z.enum(["1:1", "4:5", "9:16", "5:6"]),
              currentSlideIndex: z.number().int().nonnegative(),
              slides: z
                .array(
                  z
                    .object({
                      temporalMedia: canvasTemporalMediaSchema.optional(),
                    })
                    .passthrough()
                )
                .min(1)
                .max(100),
            })
            .passthrough(),
          workspaceId: z.string().uuid().optional(),
        })
        .parse(req.body);
      const media = post.slides[post.currentSlideIndex]?.temporalMedia;
      if (!media || post.type === "mare.project.render") {
        res.sendStatus(400);
        return;
      }
      if (
        JSON.stringify(post).length > 3500000 ||
        Object.keys(media).length > 8
      ) {
        res.sendStatus(413);
        return;
      }
      const ctx = await createContext({ req, res });
      if (
        !ctx.user ||
        !(await getMareCapabilities(ctx.user)).video ||
        process.env.POSTSPARK_MARE_RENDER_ENABLED !== "true"
      ) {
        res.status(503).json({ error: "Exportação na VPS indisponível." });
        return;
      }
      if (agency && !workspaceId) {
        res.sendStatus(403);
        return;
      }
      const db = getSupabase();
      let payer = actor;
      if (workspaceId) {
        const owner = await db.rpc("agency_billing_owner", {
          p_user_id: actor,
          p_workspace_id: workspaceId,
        });
        if (owner.error) throw owner.error;
        if (!owner.data) {
          res.sendStatus(403);
          return;
        }
        payer = owner.data;
      }
      try {
        await authorizeArsenalSaveModel(post, actor);
      } catch {
        res
          .status(403)
          .json({ error: "O design contém um recurso indisponível." });
        return;
      }
      const ids = Array.from(new Set(Object.values(media).map(s => s.assetId)));
      if (!ids.length) {
        res.sendStatus(400);
        return;
      }
      const assets = await db
        .from("mare_assets")
        .select("id,actor,workspace_id,duration,kind,size_bytes,playback_bytes")
        .in("id", ids);
      if (assets.error) throw assets.error;
      if (
        assets.data.length !== ids.length ||
        assets.data.some(
          a =>
            a.kind !== "video" ||
            a.workspace_id !== (workspaceId ?? null) ||
            (!workspaceId && a.actor !== actor)
        )
      ) {
        res.sendStatus(404);
        return;
      }
      const durations = new Map(
        assets.data.map(a => [a.id, Number(a.duration)])
      );
      const invalidRange = Object.values(media).some(source => {
        const timing = temporalInterval(
          source,
          durations.get(source.assetId) ?? 0
        );
        return timing.from >= timing.to || timing.end > 60.001;
      });
      if (
        invalidRange ||
        assets.data.reduce(
          (n, a) => n + Number(a.playback_bytes || a.size_bytes),
          0
        ) > 134217728
      ) {
        res.status(413).json({
          error:
            "O render aceita trechos de até 60 segundos e fontes de até 128 MiB por slide.",
        });
        return;
      }
      const { slides, ...documentStyle } = post;
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify([
            workspaceId ?? null,
            documentStyle,
            slides.length,
            slides[post.currentSlideIndex],
          ])
        )
        .digest("hex");
      await admitRender(
        req,
        res,
        actor,
        payer,
        workspaceId ?? null,
        post,
        fingerprint
      );
    })
  );
  app.get(
    base + "/editorial",
    protect(async (req, res, actor) => {
      const project = z.string().uuid().optional().parse(req.query.projectId);
      const anchor = z.string().uuid().optional().parse(req.query.anchorId);
      const db = getSupabase();
      const query = db
        .from("mare_jobs")
        .select("id,operation,status,workspace_id,created_at,payload")
        .eq("actor", actor)
        .in("operation", ["firstCut", "review"])
        .in("status", ["queued", "running", "ready", "reconciling"])
        .order("created_at", { ascending: false })
        .limit(30);
      const workspace = z
        .string()
        .uuid()
        .optional()
        .parse(req.query.workspaceId);
      const history = await (anchor
        ? query.eq("anchor_id", anchor)
        : (workspace
            ? query.eq("workspace_id", workspace)
            : query.is("workspace_id", null)
          ).is("anchor_id", null));
      if (!anchor && !project) {
        res.sendStatus(400);
        return;
      }
      if (history.error) throw history.error;
      const visible = [];
      for (const row of history.data) {
        if (row.workspace_id) {
          const role = await db.rpc("mare_workspace_role", {
            p_actor: actor,
            p_workspace: row.workspace_id,
          });
          if (role.error) throw role.error;
          if (!role.data) continue;
        }
        visible.push({
          id: row.id,
          operation: row.operation,
          status: row.status,
          createdAt: row.created_at,
          projectId: row.payload.projectId,
        });
      }
      res.json({ jobs: visible });
    })
  );
  const job: Handler = async (req, res, actor) => {
    const id = z.string().uuid().parse(req.params.id);
    const db = getSupabase();
    const { data, error } = await db
      .from("mare_jobs")
      .select("status,error,result_key,mime,workspace_id,operation,progress")
      .eq("id", id)
      .eq("actor", actor)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.sendStatus(404);
      return;
    }
    if (data.workspace_id) {
      const role = await db.rpc("mare_workspace_role", {
        p_actor: actor,
        p_workspace: data.workspace_id,
      });
      if (role.error) throw role.error;
      if (!role.data) {
        res.sendStatus(404);
        return;
      }
    }
    if (!req.params.file && !req.path.endsWith("/result")) {
      res.json({
        status: data.status,
        error: data.error,
        progress: data.progress,
      });
      return;
    }
    if (data.status !== "ready") {
      res.sendStatus(409);
      return;
    }
    let key = data.result_key,
      mime = data.mime;
    if (req.params.file) {
      const name = z.enum(["project", "movie"]).parse(req.params.file);
      if (!["review", "firstCut"].includes(data.operation)) {
        res.sendStatus(404);
        return;
      }
      key = `jobs/${actor}/${id}/${name}`;
      mime = name === "project" ? "application/octet-stream" : "video/mp4";
    }
    const storage = db.storage.from("postspark-mare");
    if (process.env.VERCEL) {
      const signed = await storage.createSignedUrl(key, 120);
      if (signed.error) throw signed.error;
      res.redirect(
        302,
        publicStorageSignedUrl(
          signed.data.signedUrl,
          ENV.supabaseUrl,
          ENV.supabasePublicUrl
        )
      );
      return;
    }
    const result = await storage.download(key);
    if (result.error) throw result.error;
    res.type(mime).send(Buffer.from(await result.data.arrayBuffer()));
  };
  app.delete(
    base + "/jobs/:id",
    protect(async (req, res, actor) => {
      const id = z.string().uuid().parse(req.params.id);
      const result = await getSupabase().rpc("mare_cancel_render", {
        p_actor: actor,
        p_id: id,
      });
      if (result.error) throw result.error;
      res
        .status(result.data ? 200 : 409)
        .json({ cancelled: result.data === true });
    })
  );
  app.get(base + "/jobs/:id", protect(job));
  app.get(base + "/jobs/:id/editorial/:file", protect(job));
  app.get(base + "/jobs/:id/result", protect(job));
}
