import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Express, Request, Response, RequestHandler } from "express";
import { z } from "zod";
import { publicStorageSignedUrl } from "./designCatalog/storagePublicUrl";
import { ENV } from "./_core/env";
import { registerMareSpeech } from "./mareSpeech";
import { getDb } from "./db";
import { createContext } from "./_core/context";
import type { AuthenticatedUser } from "./_core/sdk";
import { getMareCapabilities } from "./mareCapabilities";
import {
  MareError,
  MAX_MEDIA_BYTES,
  receiveMareFile,
  mareAssetKinds,
  type MareAssetKind,
} from "./mareMediaFiles";
import {
  getEditorElementState,
  COMPOSITION_BACKGROUND_ID,
} from "../client/src/pages/CanvasLab/lib/editorElementState";
import type { CanvasTemporalSource } from "../shared/canvasTemporalMedia";
import { mareSelectionFingerprint } from "../client/src/pages/CanvasLab/lib/mareSelection";
import type { CanvasPostModel } from "../client/src/pages/CanvasLab/components/types";

const bucket = "postspark-mare";
const uuid = z.string().uuid();
const targetId = z
  .string()
  .min(1)
  .max(200)
  .refine(value => !["__proto__", "constructor", "prototype"].includes(value));
const anchorInput = z
  .object({
    postId: z.number().int().positive().optional(),
    agencyProjectId: uuid.optional(),
    workspaceId: uuid.optional(),
    documentId: targetId,
    slideId: targetId,
    slotId: targetId,
    expectedRevision: z.number().int().positive(),
  })
  .refine(
    a =>
      Boolean(a.postId) !== Boolean(a.agencyProjectId) &&
      Boolean(a.agencyProjectId) === Boolean(a.workspaceId)
  );
const returnInput = z
  .object({
    revisionId: uuid,
    videoAssetId: uuid,
    scope: z.enum(["montage", "composition"]).default("montage"),
    compositionId: targetId.optional(),
    expectedRevisionId: uuid.nullish(),
  })
  .refine(a =>
    a.scope === "composition" ? !!a.compositionId : !a.compositionId
  );
type Asset = {
  id: string;
  actor: string;
  workspace_id: string | null;
  kind: MareAssetKind;
  object_key: string;
  playback_key?: string;
  mime: string;
  composition_ids?: string[];
};
type Anchor = {
  id: string;
  actor: string;
  post_id: number | null;
  agency_project_id: string | null;
  workspace_id: string | null;
  document_id: string;
  slide_id: string;
  slot_id: string;
  expected_revision: number;
  original_source: {
    temporal: CanvasTemporalSource | null;
    sourceComposition?: unknown;
    selectionHash?: string;
    image: string | null;
  } | null;
  project_id: string;
  revision_id: string | null;
  video_asset_id: string | null;
  pending: boolean;
  scope: string;
  composition_id: string | null;
  applied_revision: number | null;
};
type Handler = (
  req: Request,
  res: Response,
  user: AuthenticatedUser
) => Promise<unknown>;
function route(
  capability: "video" | "editor" | null,
  handle: Handler
): RequestHandler {
  return async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      if (
        !["GET", "HEAD"].includes(req.method) &&
        (req.headers["sec-fetch-site"] === "cross-site" ||
          (req.headers.origin &&
            new URL(req.headers.origin).host !== req.headers.host))
      )
        throw new MareError(403, "Origem inválida.");
      const { user } = await createContext({ req, res });
      if (!user) throw new MareError(401, "Entre no PostSpark.");
      if (capability && !(await getMareCapabilities(user))[capability])
        throw new MareError(403, "Recurso indisponível para esta conta.");
      const result = await handle(req, res, user);
      if (!res.headersSent) res.json(result);
    } catch (e) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (e instanceof z.ZodError) {
        res.status(400).json({ error: "Parâmetros inválidos." });
        return;
      }
      const status = e instanceof MareError ? e.status : 503;
      res.status(status).json({
        error:
          e instanceof MareError ? e.message : "Serviço de mídia indisponível.",
      });
    }
  };
}
function checked<T>(r: { data: T; error: { code?: string } | null }): T {
  if (r.error) {
    if (r.error.code === "PT403")
      throw new MareError(403, "Permissão insuficiente.");
    if (r.error.code === "PT413")
      throw new MareError(413, "Cota de armazenamento excedida.");
    if (r.error.code === "PT404")
      throw new MareError(404, "Destino indisponível.");
    if (["PT409", "23505"].includes(r.error.code ?? ""))
      throw new MareError(409, "A revisão mudou. Reabra a versão salva.");
    throw new MareError(503, "Banco de mídia indisponível.");
  }
  return r.data;
}
function required<T>(value: T | null): T {
  if (value == null) throw new MareError(404, "Recurso indisponível.");
  return value;
}
async function workspaceAccess(
  actor: string,
  workspace: string,
  write: boolean
) {
  const role = checked<string | null>(
    await getDb().rpc("mare_workspace_role", {
      p_actor: actor,
      p_workspace: workspace,
    })
  );
  if (!role || (write && !["editor", "owner"].includes(role)))
    throw new MareError(403, "Permissão de equipe insuficiente.");
}
async function assetAccess(actor: string, id: string): Promise<Asset> {
  const asset = required(
    checked<Asset | null>(
      await getDb().from("mare_assets").select("*").eq("id", id).maybeSingle()
    )
  );
  if (asset.workspace_id)
    await workspaceAccess(actor, asset.workspace_id, false);
  else if (asset.actor !== actor)
    throw new MareError(404, "Mídia indisponível.");
  return asset;
}
async function readDesign(
  actor: string,
  a: Pick<Anchor, "post_id" | "agency_project_id" | "workspace_id">,
  write: boolean
): Promise<{
  canvas_model: CanvasPostModel;
  revision: number;
  status?: string;
}> {
  const db = getDb();
  if (a.workspace_id) {
    await workspaceAccess(actor, a.workspace_id, write);
    const project = required(
      checked<any>(
        await db.rpc("agency_get_project", {
          p_user_id: actor,
          p_project_id: a.agency_project_id,
        })
      )
    );
    if (project.workspace_id !== a.workspace_id)
      throw new MareError(404, "Projeto indisponível.");
    if (write && project.status !== "draft")
      throw new MareError(409, "O projeto precisa estar em rascunho.");
    return project;
  }
  return required(
    checked<any>(
      await db
        .from("posts")
        .select("canvas_model,revision")
        .eq("id", a.post_id)
        .eq("user_uuid", actor)
        .maybeSingle()
    )
  );
}
async function anchorAccess(actor: string, id: string, write = false) {
  const anchor = required(
    checked<Anchor | null>(
      await getDb()
        .from("mare_anchors")
        .select("*")
        .eq("id", id)
        .eq("actor", actor)
        .maybeSingle()
    )
  );
  const design = await readDesign(actor, anchor, write);
  return { anchor, design };
}
function display(a: Anchor) {
  return {
    id: a.id,
    actorId: a.actor,
    postId: a.post_id,
    agencyProjectId: a.agency_project_id,
    workspaceId: a.workspace_id,
    documentId: a.document_id,
    slideId: a.slide_id,
    slotId: a.slot_id,
    expectedRevision: a.expected_revision,
    sourceVideoAssetId: a.original_source?.temporal?.assetId ?? null,
    sourceImageUrl: a.original_source?.image ?? null,
    sourceComposition: a.original_source?.sourceComposition ?? null,
    projectId: a.project_id,
    revisionId: a.revision_id,
    videoAssetId: a.video_asset_id,
    scope: a.scope,
    compositionId: a.composition_id,
    appliedRevision: a.applied_revision,
    pending: a.pending,
    returnUrl:
      (a.workspace_id ? "/agency" : "/thevoid") + "?mareReturn=" + a.id,
  };
}
export function locateMareTarget(
  model: CanvasPostModel,
  doc: string,
  slideId: string,
  slot: string
) {
  const slide = model?.slides?.find(item => item.id === slideId);
  if (!slide || model.id !== doc)
    throw new MareError(409, "Slide ou documento mudou.");
  const background = slot === "__background__",
    comp = slide.composition;
  const element = comp?.elements.find(
    e =>
      e.id === slot &&
      e.kind === "media" &&
      (!e.imageAssetId || e.imageReplacement)
  );
  const extra = (slide.extraImages ?? model.extraImages ?? []).find(
    item => item.id === slot
  );
  if (!background && !(comp ? element : extra))
    throw new MareError(409, "Elemento removido ou substituído.");
  if (
    getEditorElementState(
      model,
      slide.id,
      background ? (comp ? COMPOSITION_BACKGROUND_ID : "background") : slot
    ).locked
  )
    throw new MareError(409, "Elemento bloqueado.");
  const selection = slide.mareSelections?.[slot];
  const fingerprint = selection
    ? mareSelectionFingerprint(model, slot, slideId)
    : null;
  if (selection && !fingerprint)
    throw new MareError(409, "A seleção original mudou.");
  const original = background
    ? comp?.version === 3
      ? comp.customBackground?.imageUrl
      : slide.bgImage
    : comp
      ? comp.media?.[slot]?.url
      : extra?.url;
  return {
    slide,
    source: {
      temporal: slide.temporalMedia?.[slot] ?? null,
      image: selection ? null : (original ?? null),
      ...(selection && fingerprint
        ? {
            sourceComposition: selection.sourceComposition,
            selectionHash: createHash("sha256")
              .update(fingerprint)
              .digest("hex"),
          }
        : {}),
    },
  };
}
const PART_BYTES = 2 * 1024 * 1024;
export type MareUpload = {
  phase: "receiving" | "queued" | "running" | "failed";
  reason: string | null;
  lease: string | null;
  attempts: number;
  id: string;
  actor: string;
  workspace_id: string | null;
  kind: MareAssetKind;
  sha256: string;
  size_bytes: number;
  asset_id: string | null;
  expires_at: string;
};
const stored = (id: string) => ({
  assetId: id,
  id,
  url: "/api/studio-media/" + id,
});
async function beginUpload(
  user: Pick<AuthenticatedUser, "id">,
  workspace: string | null,
  kind: string,
  size: number,
  sha: string
) {
  const configured = Number(
    process.env.POSTSPARK_MEDIA_QUOTA_BYTES ?? 1073741824
  );
  if (!Number.isSafeInteger(configured) || configured < 1)
    throw new MareError(503, "Cota de mídia indisponível.");
  return checked<{ id?: string; assetId?: string }>(
    await getDb().rpc("mare_begin_upload", {
      p_actor: user.id,
      p_workspace: workspace,
      p_kind: kind,
      p_hash: sha,
      p_size: size,
      p_quota: configured,
    })
  );
}
async function uploadScope(
  user: AuthenticatedUser,
  workspaceId: unknown,
  anchorId: unknown
) {
  const a = anchorId
    ? await anchorAccess(user.id, uuid.parse(anchorId), false)
    : null;
  const workspace = a
    ? a.anchor.workspace_id
    : workspaceId
      ? uuid.parse(workspaceId)
      : null;
  if (workspace) await workspaceAccess(user.id, workspace, true);
  if (!workspace && user.access === "agency")
    throw new MareError(403, "Selecione um workspace.");
  return workspace;
}
async function checkUploadCapability(
  user: AuthenticatedUser,
  kind: MareAssetKind
) {
  const caps = await getMareCapabilities(user);
  if (!(kind !== "video" ? caps.editor : caps.editor || caps.video))
    throw new MareError(403, "Envio indisponível.");
}
async function uploadById(user: AuthenticatedUser, id: unknown) {
  const ticket = required(
    checked<MareUpload | null>(
      await getDb()
        .from("mare_uploads")
        .select("*")
        .eq("id", uuid.parse(id))
        .eq("actor", user.id)
        .maybeSingle()
    )
  );
  if (!ticket.asset_id && Date.parse(ticket.expires_at) <= Date.now())
    throw new MareError(410, "Envio expirado.");
  await checkUploadCapability(user, ticket.kind);
  if (ticket.workspace_id)
    await workspaceAccess(user.id, ticket.workspace_id, true);
  return ticket;
}
async function commitMedia(
  input: Readable,
  kind: MareAssetKind,
  user: Pick<AuthenticatedUser,"id">,
  workspace: string | null,
  ticket?: MareUpload
) {
  return receiveMareFile(input, kind, async (file, hash, meta, playback) => {
    if (ticket && (ticket.sha256 !== hash || ticket.size_bytes !== file.size))
      throw new MareError(422, "As partes divergem do arquivo selecionado.");
    const admission = ticket
      ? { id: ticket.id, assetId: ticket.asset_id }
      : await beginUpload(user, workspace, kind, file.size, hash);
    if (admission.assetId) return { ...stored(admission.assetId), ...meta };
    const db = getDb(),
      store = db.storage.from(bucket);
    const key = fileKey({
      actor: user.id,
      workspace_id: workspace,
      kind,
      sha256: hash,
      id: required(admission.id ?? null),
    });
    const playbackKey = playback ? key + ".mp4" : null;
    if (playback && playbackKey) {
      checked(
        await db.rpc("mare_resize_upload", {
          p_session: admission.id,
          p_actor: user.id,
          p_extra: playback.size,
          p_quota: Number(
            process.env.POSTSPARK_MEDIA_QUOTA_BYTES ?? 1073741824
          ),
        })
      );
      const proxy = await store.upload(playbackKey, playback, {
        contentType: "video/mp4",
        upsert: false,
      });
      if (proxy.error && !/duplicate|already exists/i.test(proxy.error.message))
        throw new MareError(503, "Falha ao guardar o vídeo preparado.");
    }
    const uploaded = await store.upload(key, file, {
      contentType: file.type,
      upsert: false,
    });
    if (
      uploaded.error &&
      !/duplicate|already exists/i.test(uploaded.error.message)
    )
      throw new MareError(503, "Falha ao guardar o arquivo.");
    const insert = await db
      .from("mare_assets")
      .insert({
        actor: user.id,
        workspace_id: workspace,
        kind,
        object_key: key,
        playback_key: playbackKey,
        playback_bytes: playback?.size ?? 0,
        sha256: hash,
        size_bytes: file.size,
        ...meta,
      })
      .select("id")
      .single();
    let asset: { id: string };
    if (insert.error?.code === "23505") {
      const match = db
        .from("mare_assets")
        .select("id")
        .eq("kind", kind)
        .eq("sha256", hash);
      asset = required(
        checked<{ id: string }>(
          await (
            workspace
              ? match.eq("workspace_id", workspace)
              : match.is("workspace_id", null).eq("actor", user.id)
          ).single()
        )
      );
    } else asset = checked<{ id: string }>(insert);
    let save = db
      .from("mare_uploads")
      .update({ asset_id: asset.id })
      .eq("id", admission.id)
      .eq("actor", user.id);
    if (ticket?.lease) save = save.eq("lease", ticket.lease);
    const saved = checked<{ id: string }[]>(await save.select("id"));
    if (!saved.length)
      throw new MareError(409, "O envio foi assumido por outro executor.");
    return { ...stored(asset.id), ...meta };
  });
}
export function storeRenderedProjectVideo(bytes:Buffer,actor:string,workspace:string|null){
  return commitMedia(Readable.from([bytes]),"video",{id:actor},workspace);
}
const workerIngest = () =>
  process.env.POSTSPARK_MARE_INGEST_MODE === "worker" ||
  process.env.VERCEL === "1";
async function storeSource(
  req: Request,
  user: AuthenticatedUser,
  kind: MareAssetKind
) {
  if (workerIngest())
    throw new MareError(409, "Use o envio retomável em /api/mare/uploads.");
  const workspace = await uploadScope(
    user,
    req.query.workspaceId,
    req.query.anchorId
  );
  if (Number(req.header("Content-Length")) > MAX_MEDIA_BYTES)
    throw new MareError(413, "Arquivo excede 128 MiB.");
  if (req.is("application/json") || req.is("application/x-www-form-urlencoded"))
    throw new MareError(415, "Envie os bytes do arquivo.");
  return commitMedia(req, kind, user, workspace);
}
const fileKey = (
  ticket: Pick<MareUpload, "id" | "actor" | "workspace_id" | "kind" | "sha256">
) =>
  (ticket.workspace_id
    ? "workspace/" + ticket.workspace_id
    : "personal/" + ticket.actor) +
  "/" +
  ticket.kind +
  "/" +
  ticket.sha256 +
  "/" +
  ticket.id;
const partRoot = (ticket: MareUpload) =>
  "uploads/" + ticket.actor + "/" + ticket.id;
const partKey = (ticket: MareUpload, index: number) =>
  partRoot(ticket) + "/" + index;
async function dropParts(ticket: MareUpload) {
  const count = Math.ceil(ticket.size_bytes / PART_BYTES);
  const result = await getDb()
    .storage.from(bucket)
    .remove(Array.from({ length: count }, (_, i) => partKey(ticket, i)));
  if (result.error) throw new MareError(503, "Limpeza do envio pendente.");
}
export async function finishMareUpload(ticket: MareUpload) {
  if (ticket.workspace_id)
    await workspaceAccess(ticket.actor, ticket.workspace_id, true);
  async function* parts() {
    for (let i = 0; i < Math.ceil(ticket.size_bytes / PART_BYTES); i++) {
      const obj = await getDb()
        .storage.from(bucket)
        .download(partKey(ticket, i));
      if (obj.error || !obj.data)
        throw new MareError(
          409,
          "Envio incompleto. Retome as partes pendentes."
        );
      yield Buffer.from(await obj.data.arrayBuffer());
    }
  }
  const result = await commitMedia(
    Readable.from(parts()),
    ticket.kind,
    { id: ticket.actor },
    ticket.workspace_id,
    ticket
  );
  await dropParts(ticket);
  return result;
}
export async function cleanupMareUploads() {
  const now = new Date().toISOString(),
    db = getDb();
  const rows = checked<MareUpload[]>(
    await db.from("mare_uploads").select("*").lt("expires_at", now).limit(10)
  );
  for (const ticket of rows) {
    await dropParts(ticket);
    const key = fileKey(ticket);
    const registration = checked<{ id: string } | null>(
      await db
        .from("mare_assets")
        .select("id")
        .eq("object_key", key)
        .maybeSingle()
    );
    if (!registration) {
      const cleared = await db.storage.from(bucket).remove([key, key + ".mp4"]);
      if (cleared.error)
        throw new MareError(503, "Falha ao liberar arquivos incompletos.");
    }
    checked(
      await db
        .from("mare_uploads")
        .delete()
        .eq("id", ticket.id)
        .lt("expires_at", now)
    );
  }
  return rows.length;
}
function registerMultipart(app: Express) {
  app.post(
    "/api/mare/uploads",
    route(null, async (req, _, user) => {
      const data = z
        .object({
          kind: z.enum(mareAssetKinds),
          size: z.number().int().min(1).max(MAX_MEDIA_BYTES),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
          workspaceId: uuid.optional(),
          anchorId: uuid.optional(),
        })
        .parse(req.body);
      await checkUploadCapability(user, data.kind);
      const workspace = await uploadScope(
        user,
        data.workspaceId,
        data.anchorId
      );
      const admission = await beginUpload(
        user,
        workspace,
        data.kind,
        data.size,
        data.sha256
      );
      if (admission.assetId) return stored(admission.assetId);
      const listed = await getDb()
        .storage.from(bucket)
        .list("uploads/" + user.id + "/" + admission.id, { limit: 100 });
      if (listed.error) throw new MareError(503, "Envio indisponível.");
      return {
        uploadId: admission.id,
        partBytes: PART_BYTES,
        received: listed.data
          .filter((p: { name: string }) => /^\d+$/.test(p.name))
          .map((p: { name: string }) => Number(p.name)),
      };
    })
  );
  app.get(
    "/api/mare/uploads/:id",
    route(null, async (req, _, user) => {
      const ticket = await uploadById(user, req.params.id);
      if (ticket.asset_id) return stored(ticket.asset_id);
      if (ticket.phase === "failed")
        throw new MareError(422, ticket.reason || "Falha ao preparar a mídia.");
      return { uploadId: ticket.id, status: ticket.phase };
    })
  );
  app.put(
    "/api/mare/uploads/:id/parts/:part",
    route(null, async (req, _, user) => {
      const ticket = await uploadById(user, req.params.id);
      if (ticket.asset_id) return stored(ticket.asset_id);
      const count = Math.ceil(ticket.size_bytes / PART_BYTES);
      const index = z.coerce
        .number()
        .int()
        .min(0)
        .max(count - 1)
        .parse(req.params.part);
      const expected = Math.min(
        PART_BYTES,
        ticket.size_bytes - index * PART_BYTES
      );
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of req) {
        const bytes = Buffer.from(chunk);
        length += bytes.length;
        if (length > expected) throw new MareError(413, "Parte grande demais.");
        chunks.push(bytes);
      }
      if (length !== expected) throw new MareError(422, "Parte incompleta.");
      const result = await getDb()
        .storage.from(bucket)
        .upload(partKey(ticket, index), Buffer.concat(chunks), {
          contentType: "application/octet-stream",
          upsert: false,
        });
      if (
        result.error &&
        !/duplicate|already exists/i.test(result.error.message)
      )
        throw new MareError(503, "Falha ao receber a parte.");
      return { part: index };
    })
  );
  app.post(
    "/api/mare/uploads/:id/complete",
    route(null, async (req, _, user) => {
      const ticket = await uploadById(user, req.params.id);
      if (ticket.asset_id) {
        await dropParts(ticket);
        return stored(ticket.asset_id);
      }
      if (ticket.phase === "failed")
        throw new MareError(422, ticket.reason || "Falha no processamento.");
      if (workerIngest()) {
        if (ticket.phase === "receiving") {
          const listed = await getDb()
            .storage.from(bucket)
            .list(partRoot(ticket), { limit: 100 });
          if (listed.error)
            throw new MareError(503, "Não foi possível verificar as partes.");
          if (listed.data.length !== Math.ceil(ticket.size_bytes / PART_BYTES))
            throw new MareError(409, "Envio incompleto.");
          checked(
            await getDb()
              .from("mare_uploads")
              .update({ phase: "queued" })
              .eq("id", ticket.id)
              .eq("phase", "receiving")
          );
        }
        return { uploadId: ticket.id, status: "processing" };
      }
      return finishMareUpload(ticket);
    })
  );
}
async function recordDelivery(
  actor: string,
  workspace: string | null,
  signed: boolean,
  bytes: number
) {
  try {
    const recorded = await getDb().rpc("mare_record_delivery", {
      p_actor: actor,
      p_workspace: workspace,
      p_signed: signed,
      p_bytes: bytes,
    });
    if (recorded.error) throw recorded.error;
  } catch {
    console.warn("Métrica de leitura de mídia indisponível.");
  }
}
export function registerMareRoutes(app: Express) {
  registerMultipart(app);
  registerMareSpeech(app, route, assetAccess);
  app.post(
    "/api/studio-media",
    route("video", (req, _, user) => storeSource(req, user, "video"))
  );
  app.post(
    "/api/mare/assets",
    route("editor", (req, _, user) =>
      storeSource(req, user, z.enum(mareAssetKinds).parse(req.query.kind))
    )
  );
  app.get(
    ["/api/studio-media/:id", "/api/mare/assets/:id"],
    route(null, async (req, res, user) => {
      const asset = await assetAccess(user.id, uuid.parse(req.params.id));
      const signed = await getDb()
        .storage.from(bucket)
        .createSignedUrl(asset.playback_key || asset.object_key, 60);
      if (signed.error || !signed.data?.signedUrl)
        throw new MareError(503, "Arquivo indisponível.");
      const headers = new Headers();
      const range = req.header("range");
      if (range) {
        if (!/^bytes=(?:\d+-\d*|-\d+)$/.test(range))
          throw new MareError(416, "Intervalo inválido.");
        headers.set("Range", range);
      }
      if (process.env.VERCEL === "1") {
        if (req.method !== "HEAD")
          await recordDelivery(user.id, asset.workspace_id, true, 0);
        res.set({
          "Referrer-Policy": "no-referrer",
          Vary: "Cookie, Authorization",
        });
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
      const signal = new AbortController();
      res.once("close", () => signal.abort());
      const upstream = await fetch(signed.data.signedUrl, {
        headers,
        method: req.method === "HEAD" ? "HEAD" : "GET",
        signal: signal.signal,
      });
      if (![200, 206, 416].includes(upstream.status))
        throw new MareError(503, "Arquivo indisponível.");
      res.status(upstream.status).set({
        "Content-Type": asset.playback_key ? "video/mp4" : asset.mime,
        "X-Content-Type-Options": "nosniff",
        "Accept-Ranges": "bytes",
        Vary: "Cookie, Authorization",
      });
      for (const h of ["Content-Length", "Content-Range"]) {
        const value = upstream.headers.get(h);
        if (value) res.set(h, value);
      }
      if (upstream.body && req.method !== "HEAD") {
        let bytes = 0;
        const count = new Transform({
          transform(chunk, _, done) {
            bytes += chunk.length;
            done(null, chunk);
          },
        });
        try {
          await pipeline(Readable.fromWeb(upstream.body as any), count, res);
        } finally {
          await recordDelivery(user.id, asset.workspace_id, false, bytes);
        }
      } else res.end();
    })
  );
  app.post(
    "/api/mare/anchors",
    route("editor", async (req, _, user) => {
      const input = anchorInput.parse(req.body);
      if (user.access === "agency" && !input.workspaceId)
        throw new MareError(403, "Selecione um projeto da Agência.");
      const destination = {
        post_id: input.postId ?? null,
        agency_project_id: input.agencyProjectId ?? null,
        workspace_id: input.workspaceId ?? null,
      };
      const design = await readDesign(user.id, destination, true);
      if (design.revision !== input.expectedRevision)
        throw new MareError(409, "Design mudou. Salve novamente.");
      const { source } = locateMareTarget(
        design.canvas_model,
        input.documentId,
        input.slideId,
        input.slotId
      );
      const old = source.temporal?.kind === "mare" ? source.temporal : null;
      const a = checked<Anchor>(
        await getDb()
          .from("mare_anchors")
          .insert({
            ...destination,
            actor: user.id,
            document_id: input.documentId,
            slide_id: input.slideId,
            slot_id: input.slotId,
            expected_revision: design.revision,
            original_source: source,
            project_id: old?.projectId ?? randomUUID(),
            revision_id: old?.revisionId ?? null,
            video_asset_id: old?.assetId ?? null,
            scope: old?.scope ?? "montage",
            composition_id: old?.compositionId ?? null,
          })
          .select("*")
          .single()
      );
      return display(a);
    })
  );
  app.get(
    "/api/mare/anchors/:id",
    route(null, async (req, _, user) => {
      const { anchor, design } = await anchorAccess(
        user.id,
        uuid.parse(req.params.id)
      );
      const role = anchor.workspace_id
        ? checked<string>(
            await getDb().rpc("mare_workspace_role", {
              p_actor: user.id,
              p_workspace: anchor.workspace_id,
            })
          )
        : "owner";
      const canEdit = role === "owner" || role === "editor";
      return {
        ...display(anchor),
        currentRevision: design.revision,
        canEdit,
        canApply:
          canEdit && (!anchor.workspace_id || design.status === "draft"),
      };
    })
  );
  app.post(
    "/api/mare/anchors/:id/return",
    route("editor", async (req, _, user) => {
      const { anchor: a } = await anchorAccess(
        user.id,
        uuid.parse(req.params.id),
        false
      );
      if (a.workspace_id) await workspaceAccess(user.id, a.workspace_id, true);
      const p = returnInput.parse(req.body);
      if (
        a.revision_id === p.revisionId &&
        a.video_asset_id === p.videoAssetId &&
        a.scope === p.scope &&
        a.composition_id === (p.compositionId ?? null) &&
        (a.pending || a.applied_revision)
      )
        return display(a);
      if ((p.expectedRevisionId ?? null) !== a.revision_id || a.pending)
        throw new MareError(
          409,
          "Outra edição chegou primeiro. Reabra a mídia."
        );
      for (const [id, kind] of [
        [p.revisionId, "project"],
        [p.videoAssetId, "video"],
      ]) {
        const asset = await assetAccess(user.id, id);
        if (
          kind === "project" &&
          p.scope === "composition" &&
          !asset.composition_ids?.includes(p.compositionId!)
        )
          throw new MareError(
            422,
            "A composição escolhida não pertence à revisão."
          );
        if (asset.kind !== kind || asset.workspace_id !== a.workspace_id)
          throw new MareError(403, "Arquivo incompatível com o destino.");
      }
      const update = getDb()
        .from("mare_anchors")
        .update({
          revision_id: p.revisionId,
          video_asset_id: p.videoAssetId,
          scope: p.scope,
          composition_id: p.compositionId ?? null,
          pending: true,
          applied_revision: null,
        })
        .eq("id", a.id)
        .eq("pending", false);
      const saved = checked<Anchor | null>(
        await (
          a.revision_id
            ? update.eq("revision_id", a.revision_id)
            : update.is("revision_id", null)
        )
          .select("*")
          .maybeSingle()
      );
      if (!saved) {
        const concurrent = (await anchorAccess(user.id, a.id)).anchor;
        if (
          concurrent.revision_id === p.revisionId &&
          concurrent.video_asset_id === p.videoAssetId &&
          concurrent.scope === p.scope &&
          concurrent.composition_id === (p.compositionId ?? null)
        )
          return display(concurrent);
        throw new MareError(409, "Edição concorrente.");
      }
      return display(saved);
    })
  );
  app.post(
    "/api/mare/anchors/:id/retarget",
    route(null, async (req, _, user) => {
      const { slideId, slotId, revisionId, expectedRevision } = z
        .object({
          slideId: targetId,
          slotId: targetId,
          revisionId: uuid,
          expectedRevision: z.number().int().positive(),
        })
        .parse(req.body);
      const { anchor: a, design } = await anchorAccess(
        user.id,
        uuid.parse(req.params.id),
        true
      );
      if (
        !a.pending ||
        a.revision_id !== revisionId ||
        design.revision !== expectedRevision
      )
        throw new MareError(
          409,
          "O destino mudou. Reabra o design para escolher o elemento."
        );
      const { source } = locateMareTarget(
        design.canvas_model,
        a.document_id,
        slideId,
        slotId
      );
      const saved = checked<Anchor | null>(
        await getDb()
          .from("mare_anchors")
          .update({
            slide_id: slideId,
            slot_id: slotId,
            expected_revision: expectedRevision,
            original_source: source,
          })
          .eq("id", a.id)
          .eq("actor", user.id)
          .eq("pending", true)
          .eq("revision_id", revisionId)
          .eq("expected_revision", a.expected_revision)
          .eq("slide_id", a.slide_id)
          .eq("slot_id", a.slot_id)
          .select("*")
          .maybeSingle()
      );
      if (!saved) throw new MareError(409, "Outra edição mudou o destino.");
      return display(saved);
    })
  );
  app.post(
    "/api/mare/anchors/:id/apply",
    route(null, async (req, _, user) => {
      const { anchor: a, design } = await anchorAccess(
        user.id,
        uuid.parse(req.params.id),
        true
      );
      const revisionId = uuid.parse(req.body.revisionId);
      if (a.revision_id !== revisionId)
        throw new MareError(409, "Retorno substituído.");
      if (a.applied_revision) return { appliedRevision: a.applied_revision };
      if (!a.pending) throw new MareError(409, "Nenhuma edição pendente.");
      const { slide, source } = locateMareTarget(
        design.canvas_model,
        a.document_id,
        a.slide_id,
        a.slot_id
      );
      if (!isDeepStrictEqual(a.original_source, source))
        throw new MareError(409, "O conteúdo do elemento mudou.");
      const previous = source.temporal;
      const media = {
        ...(previous
          ? {
              muted: previous.muted,
              volume: previous.volume,
              start: previous.start,
              trimIn: previous.trimIn,
              trimOut: previous.trimOut,
            }
          : {}),
        kind: "mare",
        assetId: a.video_asset_id,
        projectId: a.project_id,
        revisionId,
        scope: a.scope,
        ...(a.composition_id ? { compositionId: a.composition_id } : {}),
      };
      const model = {
        ...design.canvas_model,
        temporalMediaVersion: 1,
        slides: design.canvas_model.slides.map(s =>
          s.id === slide.id
            ? {
                ...s,
                temporalMedia: {
                  ...s.temporalMedia,
                  [a.slot_id]: media,
                },
              }
            : s
        ),
      };
      const appliedRevision = checked<number>(
        await getDb().rpc("mare_apply_return", {
          p_actor: user.id,
          p_anchor: a.id,
          p_package: revisionId,
          p_revision: design.revision,
          p_model: model,
          p_slide: a.slide_id,
          p_slot: a.slot_id,
          p_original: a.original_source,
        })
      );
      return { appliedRevision };
    })
  );
  app.get(
    "/api/mare/projects",
    route(null, async (_req, _, user) => {
      const projects = checked(
        await getDb().rpc("mare_list_projects", { p_actor: user.id })
      );
      return { actorId: user.id, projects };
    })
  );
  app.post(
    "/api/mare/projects",
    route("editor", async (req, _, user) => {
      const data = z
        .object({
          id: uuid,
          name: z.string().trim().min(1).max(120),
          revisionId: uuid,
          expectedRevisionId: uuid.nullable(),
          anchorId: uuid.optional(),
          workspaceId: uuid.optional(),
        })
        .parse(req.body);
      const asset = await assetAccess(user.id, data.revisionId);
      const a = data.anchorId
        ? (await anchorAccess(user.id, data.anchorId, false)).anchor
        : null;
      if (
        asset.kind !== "project" ||
        asset.workspace_id !==
          (a ? a.workspace_id : (data.workspaceId ?? null)) ||
        (a && a.project_id !== data.id)
      )
        throw new MareError(403, "Pacote não pertence a este projeto.");
      if (asset.workspace_id)
        await workspaceAccess(user.id, asset.workspace_id, true);
      checked(
        await getDb().rpc("mare_save_project", {
          p_actor: user.id,
          p_id: data.id,
          p_name: data.name,
          p_package: data.revisionId,
          p_expected: data.expectedRevisionId,
          p_workspace: asset.workspace_id,
        })
      );
      return { id: data.id, revisionId: data.revisionId };
    })
  );
}
