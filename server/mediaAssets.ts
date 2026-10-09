import { createClient } from "@supabase/supabase-js";
import type { Express } from "express";
import { ENV } from "./_core/env";
import { createContext } from "./_core/context";
import { verifyArsenalAsset } from "./designCatalog/arsenalAssets";

export const USER_MEDIA_BUCKET = "postspark-media";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const storage = () => createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
  auth: { persistSession: false },
}).storage;

/** Content-addressed, owner-private media. The saved URL never embeds expiring credentials. */
export async function saveUserMediaAsset(
  imageData: string,
  actor: string,
  signal?: AbortSignal
): Promise<{ url: string }> {
  if (signal?.aborted) throw signal.reason ?? new Error("Operação de mídia cancelada");
  if (!uuid.test(actor)) throw new Error("Proprietário de mídia inválido");
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(imageData);
  if (!match || imageData.length > 12 * 1024 * 1024) throw new Error("Envie PNG, JPEG ou WebP de até 8 MiB");
  const bytes = Buffer.from(match[2], "base64");
  const checked = await verifyArsenalAsset(bytes, {});
  if (!checked.manifest.mimeType.startsWith("image/")) throw new Error("Arquivo não é uma imagem");
  if (signal?.aborted) throw signal.reason ?? new Error("Operação de mídia cancelada");
  const client = storage(), bucket = await client.getBucket(USER_MEDIA_BUCKET);
  if (!bucket.data) {
    if (!bucket.error || !/not found|does not exist/i.test(bucket.error.message)) throw bucket.error;
    const created = await client.createBucket(USER_MEDIA_BUCKET, {
      public: false, fileSizeLimit: 8 * 1024 * 1024,
      allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
    });
    if (created.error && !/already exists/i.test(created.error.message)) throw created.error;
  } else if (bucket.data.public) throw new Error("O bucket de mídia deve permanecer privado");
  if (signal?.aborted) throw signal.reason ?? new Error("Operação de mídia cancelada");
  const key = `${actor}/${checked.manifest.sha256}`;
  const uploaded = await client.from(USER_MEDIA_BUCKET).upload(key, bytes, {
    contentType: checked.manifest.mimeType, upsert: false,
  });
  if (uploaded.error && !/already exists|duplicate/i.test(uploaded.error.message)) throw uploaded.error;
  return { url: `/api/post-media/${key}` };
}

/** Resolve a same-owner private media path to bytes for a trusted server-side image model. */
export async function loadOwnedMediaReference(
  url: string,
  actor: string,
  signal?: AbortSignal
): Promise<{ dataUri: string }> {
  if (signal?.aborted) throw signal.reason ?? new Error("Operação de mídia cancelada");
  if (!uuid.test(actor)) throw new Error("Proprietário de referência inválido");
  const match = /^\/api\/post-media\/([^/]+)\/([a-f0-9]{64})$/i.exec(url);
  if (!match || match[1] !== actor) throw new Error("Referência privada não pertence ao proprietário");

  const client = storage();
  const bucket = await client.getBucket(USER_MEDIA_BUCKET);
  if (bucket.error || !bucket.data) throw bucket.error ?? new Error("Bucket de mídia não encontrado");
  if (bucket.data.public) throw new Error("O bucket de mídia deve permanecer privado");

  if (signal?.aborted) throw signal.reason ?? new Error("Operação de mídia cancelada");
  const downloaded = await client.from(USER_MEDIA_BUCKET).download(`${actor}/${match[2]}`);
  if (downloaded.error || !downloaded.data) throw downloaded.error ?? new Error("Mídia privada não encontrada");
  const bytes = Buffer.from(await downloaded.data.arrayBuffer());
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error("Referência de imagem excede 8 MiB");
  const checked = await verifyArsenalAsset(bytes, {});
  if (!/^image\/(?:png|jpeg|webp)$/i.test(checked.manifest.mimeType)) {
    throw new Error("Referência privada não é uma imagem compatível");
  }
  if (checked.manifest.sha256.toLowerCase() !== match[2].toLowerCase()) {
    throw new Error("Hash da referência privada não confere");
  }
  return { dataUri: `data:${checked.manifest.mimeType};base64,${bytes.toString("base64")}` };
}

/** Normalize all canonical/projection image references together, with no resolution reduction. */
export async function normalizeCanvasMediaPayload<T extends Record<string, unknown>>(
  payload: T,
  actor: string,
  signal?: AbortSignal
): Promise<T> {
  if (!payload.canvasModel || typeof payload.canvasModel !== "object") return payload;
  const cache = new Map<string, Promise<string>>();
  let visited = 0;
  const imageKeys = new Set(["url", "imageUrl", "bgImage", "logoUrl"]);
  async function visit(value: unknown, key = "", depth = 0): Promise<unknown> {
    if (signal?.aborted) throw signal.reason ?? new Error("Operação de mídia cancelada");
    if (++visited > 100000 || depth > 40) throw new Error("Documento de mídia excede os limites");
    if (typeof value === "string" && imageKeys.has(key)) {
      const owned = /^\/api\/post-media\/([^/]+)\/([a-f0-9]{64})$/.exec(value);
      if (owned && owned[1] !== actor) throw new Error("Mídia pertence a outro proprietário");
      if (!value.startsWith("data:image/")) return value;
      if (!cache.has(value)) cache.set(value, saveUserMediaAsset(value, actor, signal).then(r => r.url));
      return cache.get(value)!;
    }
    if (Array.isArray(value)) return Promise.all(value.map(v => visit(v, key, depth + 1)));
    if (value && typeof value === "object") {
      const pairs = await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await visit(v, k, depth + 1)]));
      return Object.fromEntries(pairs);
    }
    return value;
  }
  return await visit(payload) as T;
}

export function registerUserMediaRoutes(app: Express) {
  app.get("/api/post-media/:owner/:hash", async (req, res) => {
    const { owner, hash } = req.params;
    if (!uuid.test(owner) || !/^[a-f0-9]{64}$/.test(hash)) { res.sendStatus(404); return; }
    const ctx = await createContext({ req, res });
    if (!ctx.user) { res.sendStatus(401); return; }
    if (ctx.user.id !== owner) { res.sendStatus(404); return; }
    try {
      const result = await storage().from(USER_MEDIA_BUCKET).download(`${owner}/${hash}`);
      if (result.error || !result.data) { res.sendStatus(404); return; }
      res.setHeader("Content-Type", result.data.type);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Vary", "Cookie, Authorization");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(Buffer.from(await result.data.arrayBuffer()));
    } catch { res.sendStatus(503); }
  });
}
