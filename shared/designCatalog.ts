import { z } from "zod";

export const CATALOG_VERSION = 1;
export const CATALOG_COMPILER = "canvas-catalog-1";
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const catalogBoxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0.05).max(1),
    height: z.number().min(0.03).max(1),
  })
  .strict()
  .refine(
    b => b.x + b.width <= 1.001 && b.y + b.height <= 1.001,
    "Caixa fora da prancheta"
  );
export const catalogPieceSchema = z
  .object({
    key: id,
    role: z.enum(["headline", "body"]),
    box: catalogBoxSchema,
    fontFamily: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9À-ÿ ,.-]+$/),
    fontWeight: z.number().int().min(100).max(900),
    fontSize: z.number().min(8).max(150), // canonical 360 px canvas
    minFontSize: z.number().min(8).max(80),
    align: z.enum(["left", "center", "right"]),
    effect: z.enum([
      "none",
      "shadow",
      "outline",
      "box-card",
      "box-pill",
      "box-brutal",
      "strip-line",
    ]),
    confidenceScore: z.number().min(0).max(1),
    constraints: z
      .object({
        requires: z.array(id).max(8),
        conflictsWith: z.array(id).max(8),
      })
      .strict(),
  })
  .strict()
  .refine(
    p => p.minFontSize <= p.fontSize,
    "Tamanho mínimo maior que o inicial"
  );

export const catalogBlueprintSchema = z
  .object({
    schemaVersion: z.literal(1),
    compilerVersion: z.literal(CATALOG_COMPILER),
    name: z.string().trim().min(3).max(100),
    description: z.string().trim().min(10).max(500),
    tags: z.array(z.string().trim().min(2).max(40)).max(20),
    intents: z.array(z.string().trim().min(2).max(60)).max(12),
    formats: z
      .array(z.enum(["1:1", "4:5", "5:6", "9:16"]))
      .min(1)
      .max(3),
    postMode: z.literal("static"),
    media: z.enum(["none", "optional", "required"]),
    maxHeadlineChars: z.number().int().min(10).max(400),
    maxBodyChars: z.number().int().min(0).max(1800),
    pieces: z.array(catalogPieceSchema).min(2).max(2),
    sourceRecipeId: z.string().max(80).nullable(),
    sourceHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    limitations: z.array(z.string().max(240)).max(30),
    // Optional provenance for grouped extraction. Omitted on existing versions: hashes stay stable.
    extraction: z
      .object({
        version: z.literal(1),
        headlineLayerIds: z.array(z.string().min(1).max(80)).max(100),
        bodyLayerIds: z.array(z.string().min(1).max(80)).max(100),
        ignoredLayerIds: z.array(z.string().min(1).max(80)).max(100),
        inferredBodyArea: z.boolean(),
        mediaAreas: z
          .array(
            z
              .object({
                box: catalogBoxSchema,
                placement: z.enum(["background", "reserved"]),
              })
              .strict()
          )
          .max(8),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((b, ctx) => {
    const keys = new Set(b.pieces.map(p => p.key));
    if (
      keys.size !== b.pieces.length ||
      new Set(b.pieces.map(p => p.role)).size !== 2
    )
      ctx.addIssue({
        code: "custom",
        message: "Defina uma peça de título e uma de apoio, com IDs distintos.",
      });
    for (const p of b.pieces) {
      if (
        p.constraints.requires.some(k => !keys.has(k)) ||
        p.constraints.conflictsWith.some(k => keys.has(k))
      )
        ctx.addIssue({
          code: "custom",
          message: `Constraints incompatíveis em ${p.key}.`,
        });
    }
    if (b.pieces.length !== 2) return;
    const [a, c] = b.pieces.map(p => p.box);
    if (
      a.x < c.x + c.width &&
      c.x < a.x + a.width &&
      a.y < c.y + c.height &&
      c.y < a.y + a.height
    )
      ctx.addIssue({
        code: "custom",
        message:
          "As áreas de título e apoio não podem se sobrepor nesta versão.",
      });
  });
export type CatalogBlueprint = z.infer<typeof catalogBlueprintSchema>;
export type CatalogPiece = z.infer<typeof catalogPieceSchema>;
export type CatalogEntry = {
  id: string;
  blueprintId: string;
  version: number;
  status: "draft" | "approved" | "archived";
  contentHash: string;
  definition: CatalogBlueprint;
  createdAt: string;
};
export const catalogSelectionSchema = z
  .object({
    traceId: z.string().uuid(),
    versionId: z.string().uuid(),
    blueprintId: z.string().uuid(),
    version: z.number().int().positive(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    definition: catalogBlueprintSchema,
    selection: z.enum(["llm", "ranked_fallback"]),
    preserveBrandFonts: z.boolean(),
  })
  .strict();
export type CatalogSelection = z.infer<typeof catalogSelectionSchema>;
export const catalogCompilationSchema = z
  .object({
    traceId: z.string().uuid(),
    versionId: z.string().uuid(),
    blueprintId: z.string().uuid(),
    version: z.number().int().positive(),
    compilerVersion: z.literal(CATALOG_COMPILER),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(["applied", "adapted", "fallback"]),
    reasons: z.array(z.string().max(100)).max(12),
  })
  .strict();
export type CatalogCompilation = z.infer<typeof catalogCompilationSchema>;

export type CatalogQuery = {
  text: string;
  postMode: string;
  format?: string;
  hasImage: boolean;
  headline?: string;
  body?: string;
};
const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .filter(w => w.length > 2)
  );
export function rankCatalog(entries: CatalogEntry[], query: CatalogQuery) {
  const tokens = words(query.text);
  return entries
    .map(entry => {
      const b = entry.definition;
      const rejected: string[] = [];
      if (entry.status !== "approved") rejected.push("not_approved");
      if (b.postMode !== query.postMode) rejected.push("post_mode");
      if (query.format && !b.formats.includes(query.format as any))
        rejected.push("format");
      if (b.media === "required" && !query.hasImage)
        rejected.push("missing_image");
      if (
        query.headline !== undefined &&
        query.headline.length > b.maxHeadlineChars
      )
        rejected.push("headline_length");
      if (query.body !== undefined && query.body.length > b.maxBodyChars)
        rejected.push("body_length");
      const overlap = (text: string) =>
        Array.from(words(text)).filter(w => tokens.has(w)).length;
      const components = {
        tags: overlap(b.tags.join(" ")) * 4,
        intents: overlap(b.intents.join(" ")) * 5,
        description: Math.min(10, overlap(b.description)),
        media: b.media === (query.hasImage ? "optional" : "none") ? 2 : 0,
      };
      return {
        entry,
        rejected,
        components,
        score: Object.values(components).reduce((a, v) => a + v, 0),
      };
    })
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));
}
