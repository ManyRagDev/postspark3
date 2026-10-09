import { z } from "zod";
import {
  arsenalHash,
  readContentSource,
  contentCoverageIssues,
  contentListItems,
  type DesignContent,
} from "./arsenalContent";
import {
  ARSENAL_COMPILER,
  arsenalCompilerSchema,
  arsenalAssetSchema,
  arsenalPieceSchema,
  arsenalVariantSchema,
  arsenalBindingSchema,
  validatePieceRelations,
  type ResolvedVariantDefinitionV2,
  type PieceDefinitionV2,
} from "./designArsenal";
import { describe } from "./designDescriptors";
import type { RecreationRecipe } from "./designRecreation";
import { emptyReferenceLayer } from "./referenceReconstruction";

export const ARSENAL_CAPABILITIES = [
  "text",
  "rect",
  "line",
  "polygon",
  "media",
  "groups",
  "relations",
] as const;
export const ARSENAL_REVIEW_POLICY = "arsenal-eligibility-v1";
export const arsenalSearchHitSchema = z
  .object({
    candidateId: z.string(),
    versionId: z.string().uuid(),
    blueprintId: z.string().uuid(),
    version: z.number().int().positive(),
    definitionHash: z.string().regex(/^[a-f0-9]{64}$/),
    variantKey: z.string(),
    variantHash: z.string().regex(/^[a-f0-9]{64}$/),
    distance: z.number().finite().nullable(),
    card: z
      .object({
        name: z.string().max(160),
        description: z.string().max(800),
        tags: z.array(z.string()),
        intentions: z.array(z.string()),
        aspectRatio: z.enum(["1:1", "4:5", "5:6", "9:16"]),
        compilerVersion: arsenalCompilerSchema,
        capabilities: z.array(z.string()),
        fields: z.array(
          arsenalBindingSchema.pick({
            source: true,
            kind: true,
            required: true,
            cardinality: true,
          })
        ),
        hasMedia: z.boolean(),
        brandPolicy: arsenalVariantSchema.shape.brandPolicy.nullable(),
        fontFamilies: z.array(z.string()),
        limitations: z.array(z.string()),
      })
      .strict(),
  })
  .strict();
export type ArsenalSearchHit = z.infer<typeof arsenalSearchHitSchema>;
export function arsenalCardCompatible(
  hit: ArsenalSearchHit,
  content: DesignContent,
  aspectRatio: string
) {
  const c = hit.card;
  if (c.aspectRatio !== aspectRatio || c.hasMedia) return false;
  if (contentCoverageIssues(content, c.fields).length) return false;
  return c.fields.every(b => {
    if (b.source === "media.primary") return false;
    const value = readContentSource(content, b.source);
    if (
      b.required &&
      !(Array.isArray(value) ? value.length : value.trim().length)
    )
      return false;
    return (
      b.kind !== "list" ||
      !b.cardinality ||
      (contentListItems(content, b.source).length >= b.cardinality.min &&
        contentListItems(content, b.source).length <= b.cardinality.max)
    );
  });
}
export const arsenalDefinitionSchema = z
  .object({
    schemaVersion: z.literal(2),
    compilerVersion: arsenalCompilerSchema,
    name: z.string().min(1).max(160),
    description: z.string().max(800),
    tags: z.array(z.string().max(80)).max(30),
    intentions: z.array(z.string().max(80)).max(20),
    variants: z.array(arsenalVariantSchema).min(1).max(16),
    assets: z.array(arsenalAssetSchema).max(20),
    provenance: z
      .object({
        sourceFileHash: z.string().regex(/^[a-f0-9]{64}$/),
        sourceRecipeHash: z.string().regex(/^[a-f0-9]{64}$/),
        converterVersion: z.string().max(80),
        notes: z.array(z.string().max(500)).max(40),
      })
      .strict(),
  })
  .strict()
  .superRefine((d, c) => {
    if (new Set(d.variants.map(v => v.variantKey)).size !== d.variants.length)
      c.addIssue({ code: "custom", message: "Variantes duplicadas" });
    if (new Set(d.assets.map(a => a.id)).size !== d.assets.length)
      c.addIssue({ code: "custom", message: "Assets duplicados" });
    for (const v of d.variants) {
      if (v.assetIds.some(id => !d.assets.some(a => a.id === id)))
        c.addIssue({ code: "custom", message: "Manifesto incompleto" });
      const assets = d.assets.filter(a => v.assetIds.includes(a.id));
      if (
        assets.reduce((n, a) => n + a.bytes, 0) > 24 * 1024 * 1024 ||
        assets.filter(a => a.family).length > 16 ||
        assets.filter(a => !a.family).length > 4
      )
        c.addIssue({ code: "custom", message: "Limite de assets excedido" });
    }
  });
export type ArsenalDefinition = z.infer<typeof arsenalDefinitionSchema>;
export const arsenalImportSchema = z
  .object({
    format: z.literal("postspark.arsenal.import"),
    version: z.literal(1),
    blueprintId: z.string().uuid(),
    definition: arsenalDefinitionSchema,
    pieces: z.record(z.string().regex(/^[a-f0-9]{64}$/), arsenalPieceSchema),
  })
  .strict()
  .superRefine((p, c) => {
    for (const v of p.definition.variants) {
      try {
        validatePieceRelations(v, p.pieces, v.relations);
      } catch (e) {
        c.addIssue({ code: "custom", message: (e as Error).message });
      }
      if (
        v.compilerVersion !== p.definition.compilerVersion ||
        v.bindings.some(b => b.source.startsWith("content:")) ||
        (v.compilerVersion === ARSENAL_COMPILER
          ? !v.bindings.some(b => b.source === "headline" && b.required)
          : !v.bindings.some(b => b.kind !== "media"))
      )
        c.addIssue({
          code: "custom",
          message: "Catálogo exige binding obrigatório headline",
        });
      if (
        v.capabilities.some(
          cap => !(ARSENAL_CAPABILITIES as readonly string[]).includes(cap)
        )
      )
        c.addIssue({ code: "custom", message: "Capacidade não suportada" });
      for (const b of v.bindings)
        for (const target of b.targetIds) {
          const i = v.instances.find(i => i.id === target),
            piece = i && p.pieces[i.pieceHash];
          if (
            piece &&
            (b.kind === "media"
              ? piece.kind !== "media"
              : piece.kind !== "text")
          )
            c.addIssue({
              code: "custom",
              message: "Tipo de binding e peça divergentes",
            });
        }
    }
    for (const [hash, piece] of Object.entries(p.pieces))
      if (arsenalHash(piece) !== hash)
        c.addIssue({ code: "custom", message: "Hash da peça divergente" });
    for (const v of p.definition.variants)
      for (const i of v.instances) {
        const piece = p.pieces[i.pieceHash];
        if (!piece)
          c.addIssue({ code: "custom", message: `Peça ausente: ${i.id}` });
        else if (
          piece.kind === "text" &&
          (!piece.fontAssetId || !v.assetIds.includes(piece.fontAssetId))
        )
          c.addIssue({
            code: "custom",
            message: `Fonte verificável ausente: ${i.id}`,
          });
        if (piece?.fixedText?.trim() && piece.fixedTextRole !== "ornament")
          c.addIssue({
            code: "custom",
            message:
              "Texto fixo exige classificação de ornamentação na autoria; não publicar copy de referência",
          });
        if (piece && !v.capabilities.includes(piece.kind))
          c.addIssue({
            code: "custom",
            message: "Capacidade da peça não declarada",
          });
      }
  });
export type ArsenalImport = z.infer<typeof arsenalImportSchema>;

/** Reuse structural-v1 unchanged, with explicit world geometry from the V2 bases.
 * No demonstration copy is needed to derive an index. Text boxes, not glyph pixels. */
export function describeArsenalVariant(
  v: ResolvedVariantDefinitionV2,
  pieces: Record<string, PieceDefinitionV2>
) {
  const world = (
    id: string
  ): { x: number; y: number; rotation: number; scale: number } => {
    const g = v.groups.find(g => g.id === id)!;
    if (!g.parentId)
      return { x: g.x, y: g.y, rotation: g.rotation, scale: g.scale };
    const p = world(g.parentId),
      r = (p.rotation * Math.PI) / 180;
    return {
      x: p.x + (g.x * Math.cos(r) - g.y * Math.sin(r)) * p.scale,
      y: p.y + (g.x * Math.sin(r) + g.y * Math.cos(r)) * p.scale,
      rotation: p.rotation + g.rotation,
      scale: p.scale * g.scale,
    };
  };
  const layers = v.instances.map(i => {
    const p = pieces[i.pieceHash];
    if (!p) throw new Error("Peça ausente");
    const g = i.parentId
        ? world(i.parentId)
        : { x: 0, y: 0, rotation: 0, scale: 1 },
      r = (g.rotation * Math.PI) / 180;
    return {
      ...emptyReferenceLayer(p.kind === "media" ? "rect" : p.kind, i.id),
      ...p,
      x: g.x + (i.x * Math.cos(r) - i.y * Math.sin(r)) * g.scale,
      y: g.y + (i.x * Math.sin(r) + i.y * Math.cos(r)) * g.scale,
      width: i.width * g.scale,
      height: i.height * g.scale,
      rotationDeg: g.rotation + i.rotation,
      fontSize: p.fontSize * g.scale,
      strokeColor: p.stroke,
      opacity: i.opacity,
      zIndex: i.zIndex,
    };
  });
  const recipe = {
    scene: {
      source: { widthPx: v.artboard.width, heightPx: v.artboard.height },
      artboard: { background: v.artboard.background },
      layers,
    },
    matrix: {
      fields: v.bindings
        .filter(b => b.kind !== "media")
        .map(b => ({ id: b.id, groupId: null, layerIds: b.targetIds })),
      media: v.bindings
        .filter(b => b.kind === "media")
        .map(b => ({ id: b.id, layerId: b.targetIds[0], groupId: null })),
      groups: v.groups.map(g => ({
        id: g.id,
        label: g.label,
        transform: { x: g.x, y: g.y, rotationDeg: g.rotation },
        members: v.instances
          .filter(i => i.parentId === g.id)
          .map(i => ({
            layerId: i.id,
            x: i.x,
            y: i.y,
            rotationDeg: i.rotation,
          })),
      })),
    },
  } as unknown as RecreationRecipe;
  return describe(recipe);
}

export function compactArsenalCard(
  d: ArsenalDefinition,
  v: ResolvedVariantDefinitionV2
) {
  return {
    name: d.name,
    description: d.description,
    tags: d.tags,
    intentions: d.intentions,
    aspectRatio: v.aspectRatio,
    compilerVersion: v.compilerVersion,
    capabilities: v.capabilities,
    fields: v.bindings.map(({ source, kind, required, cardinality }) => ({
      source,
      kind,
      required,
      cardinality,
    })),
    hasMedia: v.bindings.some(b => b.kind === "media"),
    brandPolicy: v.brandPolicy ?? null,
    fontFamilies: Array.from(
      new Set(
        d.assets
          .filter(a => v.assetIds.includes(a.id) && a.sourceFamily)
          .map(a => a.sourceFamily!)
      )
    ),
    limitations: v.limitations,
  };
}
