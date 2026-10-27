import {cachedAssetBytes} from "../designCatalog/localAssetCache";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { create as createFont } from "fontkit";
import { createClient } from "@supabase/supabase-js";
import { ENV } from "../_core/env";
import { ARSENAL_BUCKET } from "../designCatalog/arsenalAssets";
import bundled from "@shared/arsenalBundledAssets.json";
import { arsenalHash } from "@shared/arsenalContent";
import type { ArsenalAsset } from "@shared/designArsenal";
import type { ArsenalTextMeasurer } from "@shared/arsenalGeometry";
import { layoutRichText } from "@shared/arsenalTextLayout";
import type { RichTextLayoutConfig } from "@shared/arsenalTextLayout";

/** Word partitions retain separators for lossless reassembly. They have no ink
 * at line end and must not turn an otherwise fitting fragment into overflow.
 * This affects measurement only; canonical text, rich styles and line breaks survive. */
function measurementText(input: RichTextLayoutConfig): RichTextLayoutConfig {
  const removed = new Set<number>();
  for (const match of Array.from(input.text.matchAll(/[^\S\r\n]+(?=\r?$)/gm)))
    for (let i = match.index; i < match.index + match[0].length; i++)
      removed.add(i);
  if (!removed.size) return input;
  const filter = (text: string, offset: number) =>
    text
      .split("")
      .filter((_char, i) => !removed.has(offset + i))
      .join("");
  let offset = 0;
  const richText = input.richText?.map(chunk => {
    const next = { ...chunk, text: filter(chunk.text, offset) };
    offset += chunk.text.length;
    return next;
  });
  return {
    ...input,
    text: filter(input.text, 0),
    ...(richText ? { richText } : {}),
  };
}

type MeasurableFont = {
  unitsPerEm: number;
  layout: (text: string) => { advanceWidth: number };
  variationAxes?: Record<string, { min: number; max: number }>;
  getVariation?: (axes: Record<string, number>) => MeasurableFont;
};
// Cache only completed fonts: one request's cancellation must never poison another.
const cachedFonts = new Map<string, MeasurableFont>();
export async function loadComponentFontBytes(
  asset: ArsenalAsset,
  signal?: AbortSignal
): Promise<Buffer> {
  if (asset.kind === "bundled") {
    const entry = (bundled as Record<string, { path: string }>)[asset.id];
    if (
      !entry ||
      !entry.path.startsWith("/arsenal/fonts/") ||
      entry.path.includes("..")
    )
      throw new Error("unverified_bundled_font");
    return readFile(join(process.cwd(), "client/public", entry.path), {
      signal,
    });
  }
  const download=async(downloadSignal?:AbortSignal)=>{
  const signal=downloadSignal;
  const result = await createClient(
    ENV.supabaseUrl,
    ENV.supabaseServiceRoleKey,
    {
      auth: { persistSession: false },
      global: signal
        ? {
            fetch: (url, init) =>
              fetch(url, {
                ...init,
                signal: init?.signal
                  ? AbortSignal.any([signal, init.signal])
                  : signal,
              }),
          }
        : undefined,
    }
  )
    .storage.from(ARSENAL_BUCKET)
    .download(asset.sha256);
  if (result.error || !result.data)
    throw new Error("component_font_unavailable");
  return Buffer.from(await result.data.arrayBuffer());
  };
  return ENV.localDemandEnabled?cachedAssetBytes(asset.sha256,()=>download(AbortSignal.timeout(15000)),signal):download(signal);
}
/** No font substitution: bytes, family metadata and variation weight are checked. */
export async function createComponentTextMeasurer(
  assets: ArsenalAsset[],
  loadBytes = loadComponentFontBytes,
  signal?: AbortSignal
): Promise<ArsenalTextMeasurer> {
  signal?.throwIfAborted();
  const fonts = new Map<
    string,
    { asset: ArsenalAsset; font: MeasurableFont }
  >();
  await Promise.all(
    assets
      .filter(a => a.family)
      .map(async asset => {
        const key = arsenalHash(asset);
        let font = cachedFonts.get(key);
        if (!font) {
          font = await (async () => {
            const bytes = await loadBytes(asset, signal);
            signal?.throwIfAborted();
            if (
              bytes.length !== asset.bytes ||
              createHash("sha256").update(bytes).digest("hex") !== asset.sha256
            )
              throw new Error("component_font_hash_mismatch");
            const parsed = createFont(bytes);
            if ("fonts" in parsed)
              throw new Error("component_font_collection_unsupported");
            const font = parsed as unknown as MeasurableFont;
            if (!font.unitsPerEm || typeof font.layout !== "function")
              throw new Error("invalid_component_font");
            if (asset.weightRange) {
              const actual = font.variationAxes?.wght;
              if (
                !actual ||
                actual.min !== asset.weightRange.min ||
                actual.max !== asset.weightRange.max
              )
                throw new Error("component_font_weight_range_mismatch");
            }
            return font;
          })();
          cachedFonts.set(key, font);
        }
        signal?.throwIfAborted();
        fonts.set(`${asset.family}|${asset.weight}`, { asset, font });
      })
  );
  return input =>
    layoutRichText({
      ...measurementText(input),
      measureGlyph: (text, family, size, style) => {
        const weight = Number(
          style.match(/\b([1-8]\d{2}|900)\b/)?.[1] ??
            (style.includes("bold") ? 700 : 400)
        );
        const match =
          fonts.get(`${family}|${weight}`) ??
          Array.from(fonts.values()).find(
            row =>
              row.asset.family === family &&
              row.asset.weightRange &&
              weight >= row.asset.weightRange.min &&
              weight <= row.asset.weightRange.max
          );
        if (!match)
          throw new Error(
            `component_font_weight_unavailable:${family}:${weight}`
          );
        if (
          style.includes("italic") &&
          !match.font.variationAxes?.ital &&
          !match.font.variationAxes?.slnt
        )
          throw new Error("component_italic_font_unavailable");
        const axes: Record<string, number> = {};
        if (match.font.variationAxes?.wght) axes.wght = weight;
        if (style.includes("italic") && match.font.variationAxes?.ital)
          axes.ital = 1;
        const font =
          Object.keys(axes).length && match.font.getVariation
            ? match.font.getVariation(axes)
            : match.font;
        return (font.layout(text).advanceWidth / font.unitsPerEm) * size;
      },
    });
}
