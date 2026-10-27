import bundled from "@shared/arsenalBundledAssets.json";
import {
  arsenalFontMatches,
  type ArsenalAsset,
  type ArsenalComposition,
} from "@shared/designArsenal";
import { arsenalApi } from "@/lib/arsenalApi";
import { arsenalHash } from "@shared/arsenalContent";

const fonts = new Map<string, Promise<void>>();
const images = new Map<string, Promise<string>>();

/** Raster ornaments are pinned to verified asset bytes, never a generated media prompt. */
export function loadArsenalImage(asset: ArsenalAsset): Promise<string> {
  if (
    asset.kind !== "catalog" ||
    !/^image\/(png|jpeg|webp)$/.test(asset.mimeType)
  )
    return Promise.reject(new Error("Manifesto de imagem inválido"));
  const key = arsenalHash(asset);
  const existing = images.get(key);
  if (existing) return existing;
  const promise = (async () => {
    const signal = AbortSignal.timeout(8000);
    const urls = await arsenalApi.designCatalog.resolveArsenalAssets.query(
      { ids: [asset.id] },
      { signal }
    );
    const authorized = urls.find(
      item => item.id === asset.id && item.sha256 === asset.sha256
    );
    if (!authorized?.url) throw new Error("Imagem não autorizada");
    const response = await fetch(authorized.url, { signal, cache: "no-store" });
    if (!response.ok) throw new Error("Imagem indisponível");
    const bytes = await response.arrayBuffer();
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
    )
      .map(n => n.toString(16).padStart(2, "0"))
      .join("");
    if (bytes.byteLength !== asset.bytes || hash !== asset.sha256)
      throw new Error("Bytes da imagem divergentes");
    const view = new Uint8Array(bytes);
    let binary = "";
    for (let i = 0; i < view.length; i += 8192)
      binary += String.fromCharCode(...Array.from(view.subarray(i, i + 8192)));
    const url = `data:${asset.mimeType};base64,${btoa(binary)}`;
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight)
      throw new Error("Imagem não decodificada");
    return url;
  })().catch(error => {
    images.delete(key);
    throw error;
  });
  images.set(key, promise);
  return promise;
}

export async function ensureArsenalCompositionAssets(
  c: ArsenalComposition
): Promise<void> {
  const required = new Set(
    c.elements
      .filter(e => e.imageAssetId && !c.media[e.id])
      .map(e => e.imageAssetId!)
  );
  await Promise.all([
    ensureArsenalCompositionFonts(c),
    ...Array.from(required).map(id => {
      const asset = c.assets.find(a => a.id === id);
      if (!asset) throw new Error("Imagem sem manifesto");
      return loadArsenalImage(asset);
    }),
  ]);
}
const manifest = bundled as Record<
  string,
  {
    id: string;
    sha256: string;
    path: string;
    family: string;
    weight: number;
    weightRange?: { min: number; max: number };
    bytes: number;
    mimeType: string;
  }
>;
export function bundledArsenalAsset(id: string) {
  const entry = manifest[id];
  if (!entry) throw new Error("Asset fora do manifesto empacotado");
  return entry;
}
export function ensureArsenalFont(asset: ArsenalAsset): Promise<void> {
  return loadArsenalFont(asset);
}
/** Trusted renderer can preload verified bytes without granting browser API access. */
export function installArsenalFontBytes(
  asset: ArsenalAsset,
  bytes: ArrayBuffer
): Promise<void> {
  return loadArsenalFont(asset, bytes);
}
function loadArsenalFont(
  asset: ArsenalAsset,
  suppliedBytes?: ArrayBuffer
): Promise<void> {
  const known =
    asset.kind === "bundled" ? bundledArsenalAsset(asset.id) : asset;
  if (
    known.sha256 !== asset.sha256 ||
    known.family !== asset.family ||
    known.weight !== asset.weight ||
    JSON.stringify(known.weightRange) !== JSON.stringify(asset.weightRange) ||
    known.bytes !== asset.bytes ||
    known.mimeType !== asset.mimeType
  )
    return Promise.reject(new Error("Manifesto de fonte divergente"));
  const cacheKey = arsenalHash(asset);
  const existing = fonts.get(cacheKey);
  if (existing) return existing;
  const promise = (async () => {
    if (!known.family || !known.weight)
      throw new Error("Manifesto de fonte incompleto");
    const signal = AbortSignal.timeout(8000);
    const path = suppliedBytes
      ? null
      : asset.kind === "bundled"
        ? bundledArsenalAsset(asset.id).path
        : (
            await arsenalApi.designCatalog.resolveArsenalAssets.query(
              { ids: [asset.id] },
              { signal }
            )
          )[0]?.url;
    if (!path && !suppliedBytes)
      throw new Error("Asset não autorizado ou indisponível");
    const response = suppliedBytes
      ? null
      : await fetch(path!, {
          signal,
          ...(asset.kind === "catalog" ? { cache: "no-store" as const } : {}),
        });
    if (response && !response.ok) throw new Error("Fonte indisponível");
    const bytes = suppliedBytes ?? (await response!.arrayBuffer());
    if (bytes.byteLength !== known.bytes)
      throw new Error("Tamanho de fonte divergente");
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
    )
      .map(n => n.toString(16).padStart(2, "0"))
      .join("");
    if (hash !== known.sha256) throw new Error("Hash de fonte divergente");
    const face = new FontFace(known.family, bytes, {
      weight: known.weightRange
        ? `${known.weightRange.min} ${known.weightRange.max}`
        : String(known.weight),
    });
    await face.load();
    document.fonts.add(face);
  })().catch(error => {
    fonts.delete(cacheKey);
    throw error;
  });
  fonts.set(cacheKey, promise);
  return promise;
}
export async function ensureArsenalCompositionFonts(
  c: ArsenalComposition
): Promise<void> {
  const required = new Set(
    c.elements
      .filter(e => e.kind === "text" && e.fontAssetId)
      .map(e => e.fontAssetId)
  );
  for (const element of c.elements.filter(
    e => e.kind === "text" && e.fontAssetId
  )) {
    const asset = c.assets.find(a => a.id === element.fontAssetId);
    if (!asset || !arsenalFontMatches(asset, element))
      throw new Error("Fonte resolvida divergente do manifesto");
  }
  await Promise.all(
    c.assets.filter(a => required.has(a.id)).map(ensureArsenalFont)
  );
  for (const id of Array.from(required))
    if (!c.assets.some(a => a.id === id))
      throw new Error("Fonte sem manifesto");
}
