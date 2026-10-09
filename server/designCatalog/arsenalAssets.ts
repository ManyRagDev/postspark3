import { createHash, randomUUID } from "node:crypto";
import { create as readFont } from "fontkit";
import { loadImage } from "@napi-rs/canvas";
import { arsenalAssetSchema, type ArsenalAsset } from "@shared/designArsenal";
import { getDb } from "../db";
import { createClient } from "@supabase/supabase-js";
import { ENV } from "../_core/env";
import { traceCatalog } from "./trace";
import { arsenalHash } from "@shared/arsenalContent";

export const ARSENAL_BUCKET = "design-arsenal";
const storage = () =>
  createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  }).storage;
export async function requestArsenalAssetUpload(sha256: string) {
  await ensureArsenalBucket();
  const r = await storage()
    .from(ARSENAL_BUCKET)
    .createSignedUploadUrl(sha256, { upsert: false });
  if (r.error) throw r.error;
  return { path: sha256, token: r.data.token, bucket: ARSENAL_BUCKET };
}
export async function finalizeArsenalAssetUpload(
  sha256: string,
  options: { license?: string; weight?: number },
  actor: string
) {
  const r = await storage().from(ARSENAL_BUCKET).download(sha256);
  if (r.error || !r.data) throw new Error("Upload não encontrado");
  const bytes = Buffer.from(await r.data.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== sha256)
    throw new Error("Hash do upload divergente");
  return uploadArsenalAsset(bytes, options, actor);
}
export async function ensureArsenalBucket() {
  const s = storage(),
    result = await s.getBucket(ARSENAL_BUCKET);
  if (result.data) {
    if (result.data.public)
      throw new Error("O bucket design-arsenal deve ser privado");
    return;
  }
  if (!result.error || !/not found|does not exist/i.test(result.error.message))
    throw result.error;
  const created = await s.createBucket(ARSENAL_BUCKET, {
    public: false,
    fileSizeLimit: 8 * 1024 * 1024,
    allowedMimeTypes: [
      "font/woff2",
      "font/ttf",
      "font/otf",
      "image/png",
      "image/jpeg",
      "image/webp",
    ],
  });
  if (created.error && !/already exists/i.test(created.error.message))
    throw created.error;
}
export async function verifyArsenalAsset(
  bytes: Buffer,
  options: { license?: string; weight?: number }
) {
  if (!bytes.length || bytes.length > 8 * 1024 * 1024)
    throw new Error("Asset deve ter no máximo 8 MiB");
  if (bytes.length < 4) throw new Error("Asset inválido");
  const sha256 = createHash("sha256").update(bytes).digest("hex"),
    sig = bytes.subarray(0, 4).toString("latin1");
  let mimeType: string;
  if (sig === "wOF2") mimeType = "font/woff2";
  else if (sig === "OTTO") mimeType = "font/otf";
  else if (bytes.readUInt32BE(0) === 0x00010000) mimeType = "font/ttf";
  else if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    mimeType = "image/png";
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    mimeType = "image/jpeg";
  else if (sig === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP")
    mimeType = "image/webp";
  else throw new Error("Assinatura de asset não suportada");
  let metadata: Record<string, unknown> = {
    signatureVerified: true,
    decoded: true,
  };
  let extra: Partial<ArsenalAsset> = {};
  if (mimeType.startsWith("font/")) {
    if (!options.license || options.license === "unknown")
      throw new Error("Fonte exige licença/procedência conferida");
    const font = readFont(bytes);
    if ("fonts" in font) throw new Error("Coleção de fontes não suportada");
    if (!font.familyName || !font.numGlyphs) throw new Error("Fonte inválida");
    const weight = options.weight ?? 400;
    const metrics = font as typeof font & {
      "OS/2"?: { usWeightClass?: number };
      variationAxes?: Record<string, { min: number; max: number }>;
    };
    const axis = metrics.variationAxes?.wght,
      actual = metrics["OS/2"]?.usWeightClass;
    if (
      axis
        ? weight < axis.min || weight > axis.max
        : actual !== undefined && actual !== weight
    )
      throw new Error("Peso solicitado não corresponde aos bytes da fonte");
    extra = {
      family: `Arsenal_${sha256.slice(0, 16)}`,
      sourceFamily: font.familyName,
      weight,
      license: options.license,
      ...(axis ? { weightRange: { min: axis.min, max: axis.max } } : {}),
    };
    metadata = {
      ...metadata,
      sourceFamily: font.familyName,
      postscriptName: font.postscriptName,
      glyphs: font.numGlyphs,
      license: options.license,
    };
  } else {
    const img = await loadImage(bytes);
    if (!img.width || !img.height || img.width * img.height > 32_000_000)
      throw new Error("Imagem inválida ou acima de 32 megapixels");
    metadata = { ...metadata, width: img.width, height: img.height };
  }
  return {
    manifest: arsenalAssetSchema.parse({
      id: `${mimeType.startsWith("font/") ? "font" : "image"}-${sha256}`,
      kind: "catalog",
      sha256,
      mimeType,
      bytes: bytes.length,
      ...extra,
    }),
    metadata,
  };
}
export async function uploadArsenalAsset(
  bytes: Buffer,
  options: { license?: string; weight?: number },
  actor: string
) {
  const checked = await verifyArsenalAsset(bytes, options),
    db = getDb();
  const existing = await db
    .from("design_catalog_assets")
    .select("manifest")
    .eq("id", checked.manifest.id)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    if (arsenalHash(existing.data.manifest) !== arsenalHash(checked.manifest))
      throw new Error("Manifesto divergente para os mesmos bytes");
    return arsenalAssetSchema.parse(existing.data.manifest);
  }
  await ensureArsenalBucket();
  const upload = await storage()
    .from(ARSENAL_BUCKET)
    .upload(checked.manifest.sha256, bytes, {
      contentType: checked.manifest.mimeType,
      upsert: false,
    });
  if (upload.error && !/already exists|duplicate/i.test(upload.error.message))
    throw upload.error;
  // Read the original stored bytes back; existing objects are never trusted by key alone.
  const stored = await storage()
    .from(ARSENAL_BUCKET)
    .download(checked.manifest.sha256);
  if (stored.error || !stored.data)
    throw new Error("Asset enviado não pôde ser conferido");
  const hash = createHash("sha256")
    .update(Buffer.from(await stored.data.arrayBuffer()))
    .digest("hex");
  if (hash !== checked.manifest.sha256)
    throw new Error("Bytes armazenados divergentes");
  const inserted = await db
    .from("design_catalog_assets")
    .upsert(
      {
        id: checked.manifest.id,
        sha256: hash,
        storage_key: hash,
        manifest: checked.manifest,
        metadata: checked.metadata,
        verified_at: new Date().toISOString(),
      },
      { onConflict: "id", ignoreDuplicates: true }
    );
  if (inserted.error) throw inserted.error;
  await traceCatalog(randomUUID(), actor, "catalog.asset", "completed", {
    assetId: checked.manifest.id,
    sha256: hash,
    source: "server",
    reason: "verified_upload",
  });
  return checked.manifest;
}
export async function authorizeArsenalAssets(
  ids: string[],
  actor: string,
  admin = false,
  signal?: AbortSignal
): Promise<ArsenalAsset[]> {
  if (!ids.length) return [];
  const distinct = Array.from(new Set(ids));
  if (distinct.length > 60) throw new Error("Muitos assets");
  const db = getDb();
  if (!admin) {
    const g = await db
      .from("design_catalog_asset_grants")
      .select("asset_id")
      .eq("user_uuid", actor)
      .in("asset_id", distinct)
      .abortSignal(signal ?? AbortSignal.timeout(8000));
    if(g.error) throw new Error("Asset não autorizado para este usuário");
    const missing=distinct.filter(id=>!g.data?.some((a:{asset_id:string})=>a.asset_id===id));
    if(missing.length){
      const components=await db.from("design_component_asset_grants").select("asset_id").eq("user_uuid",actor).in("asset_id",missing).abortSignal(signal??AbortSignal.timeout(8000));
      if(components.error||missing.some(id=>!components.data?.some((a:{asset_id:string})=>a.asset_id===id)))throw new Error("Asset não autorizado para este usuário");
    }
  }
  const a = await db
    .from("design_catalog_assets")
    .select("manifest")
    .in("id", distinct)
    .abortSignal(signal ?? AbortSignal.timeout(8000));
  if (a.error || a.data?.length !== distinct.length)
    throw new Error("Manifesto de asset indisponível");
  return a.data.map((r: { manifest: unknown }) =>
    arsenalAssetSchema.parse(r.manifest)
  );
}
export async function resolveArsenalAssetUrls(
  ids: string[],
  actor: string,
  admin = false
) {
  const assets = await authorizeArsenalAssets(ids, actor, admin);
  const result = await storage()
    .from(ARSENAL_BUCKET)
    .createSignedUrls(
      assets.map(a => a.sha256),
      900
    );
  if (result.error) throw result.error;
  return assets.map((a, i) => {
    const url = result.data?.[i];
    if (!url?.signedUrl || url.error)
      throw new Error("Não foi possível resolver o asset");
    return {
      id: a.id,
      sha256: a.sha256,
      url: url.signedUrl,
      expiresAt: Date.now() + 900_000,
    };
  });
}
