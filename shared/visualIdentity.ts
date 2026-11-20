import { z } from "zod";
import { arsenalBundledManifest } from "./arsenalBundledManifest";

const hex = z.string().regex(/^#[a-f\d]{6}$/i);
/** Nullable fields are intentional: an incomplete identity stays incomplete. */
export const visualIdentityRulesSchema = z
  .object({
    colors: z.array(hex).max(20),
    background: hex.nullable(),
    text: hex.nullable(),
    accent: hex.nullable(),
    headingFont: z.string().max(120).nullable(),
    bodyFont: z.string().max(120).nullable(),
    headingWeight: z.number().int().min(100).max(900).nullable(),
    bodyWeight: z.number().int().min(100).max(900).nullable(),
    headingSize: z.number().min(16).max(200).nullable(),
    bodySize: z.number().min(16).max(120).nullable(),
    /** Canonical measurements on a 1080px-wide artboard. */
    margin: z.number().min(0).max(240).nullable(),
    gap: z.number().min(0).max(160).nullable(),
    lineHeight: z.number().min(0.9).max(2.5).nullable(),
    align: z.enum(["left", "center", "right"]).nullable(),
    style: z.string().max(4000),
  })
  .strict();
export type VisualIdentityRules = z.infer<typeof visualIdentityRulesSchema>;

export const identityFontSchema = z
  .object({
    requested: z.string().nullable(),
    applied: z.string(),
    assetId: z.string(),
    weight: z.number().int().min(100).max(900),
    substituted: z.boolean(),
  })
  .strict();
export const visualIdentitySchema = z
  .object({
    version: z.literal(1),
    revision: z.string().regex(/^[a-f\d]{64}$/),
    description: z.string().max(24000),
    logoUrl: z.string().max(2048).optional(),
    rules: visualIdentityRulesSchema,
    fonts: z
      .object({ heading: identityFontSchema, body: identityFontSchema })
      .strict(),
    warnings: z.array(z.string().max(500)).max(20),
  })
  .strict();
export type VisualIdentity = z.infer<typeof visualIdentitySchema>;

export const saveVisualIdentitySchema = z
  .object({
    id: z.string().uuid().optional(),
    creationId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(24000),
    logoUrl: z.string().max(2048).optional(),
  })
  .strict()
  .refine(
    v => Boolean(v.description || v.logoUrl),
    "Descreva a identidade ou envie um logo."
  );

const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
const assets = Object.values(arsenalBundledManifest).filter(
  a => a.sourceFamily && a.mimeType.startsWith("font/")
);
export const identityAvailableFamilies = Array.from(
  new Set(assets.map(a => a.sourceFamily!))
).sort();

/** Pick actual bundled bytes, including a real available weight, before measuring. */
export function resolveIdentityFont(
  requested: string | null,
  weight: number,
  heading: boolean
) {
  const name = requested?.split(",")[0].replace(/["']/g, "").trim();
  let matches = name
    ? assets.filter(a => normalize(a.sourceFamily!) === normalize(name))
    : [];
  const substituted = Boolean(name && !matches.length);
  if (!matches.length) {
    const fallback =
      name &&
      /serif|times|georgia|garamond|baskerville|didot|bodoni/i.test(name) &&
      !/sans/i.test(name)
        ? "Playfair Display"
        : name && /mono|courier|consolas/i.test(name)
          ? "Space Mono"
          : "Inter";
    matches = assets.filter(a => a.sourceFamily === fallback);
  }
  const actualWeight = (a: (typeof assets)[number]) =>
    a.weightRange
      ? Math.max(a.weightRange.min, Math.min(a.weightRange.max, weight))
      : (a.weight ?? (heading ? 700 : 400));
  matches.sort(
    (a, b) =>
      Math.abs(actualWeight(a) - weight) - Math.abs(actualWeight(b) - weight) ||
      a.id.localeCompare(b.id)
  );
  const asset = matches[0];
  if (!asset) throw new Error("identity_font_unavailable");
  return identityFontSchema.parse({
    requested: name || null,
    applied: asset.sourceFamily!,
    assetId: asset.id,
    weight: actualWeight(asset),
    substituted,
  });
}

export function identityFontWarnings(fonts: VisualIdentity["fonts"]) {
  return Array.from(
    new Set(
      Object.values(fonts)
        .filter(f => f.substituted)
        .map(
          f =>
            `Não encontramos a fonte solicitada “${f.requested}”. Foi ajustado para ${f.applied}.`
        )
    )
  );
}
