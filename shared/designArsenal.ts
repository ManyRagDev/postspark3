import {
  variableContentContractSchema,
  validateVariableContent,
} from "./variableContent";
import { z } from "zod";
import { designGuidanceSchema } from "./designGuidance";
import {
  arsenalHash,
  designContentDocumentSchema,
  visualContentSources,
  contentListItems,
  readContentSource,
} from "./arsenalContent";

export const ARSENAL_COMPILER = "arsenal-v2.0.0" as const;
export const ARSENAL_VARIABLE_COMPILER = "arsenal-v3.0.0" as const;
export const arsenalCompilerSchema = z.enum([
  ARSENAL_COMPILER,
  ARSENAL_VARIABLE_COMPILER,
]);
export const arsenalContentSourceSchema = z
  .string()
  .refine(
    s =>
      (visualContentSources as readonly string[]).includes(s) ||
      s === "media.primary" ||
      /^textGroup:[A-Za-z0-9_-]+(?:,[A-Za-z0-9_-]+)+$/.test(s) ||
      /^block:(headline|body|eyebrow|sectionLabel|callToAction|label|text):\d+:text$/.test(
        s
      ) ||
      /^block:list:\d+:items$/.test(s) ||
      /^block:metric:\d+:(value|label)$/.test(s) ||
      /^block:quote:\d+:(text|author)$/.test(s) ||
      /^block:comparison:\d+:(left|right)\.(label|text)$/.test(s) ||
      /^content:[A-Za-z0-9_-]+:(text|items|value|label|author|(?:left|right)\.(?:label|text))$/.test(
        s
      ),
    "Source de conteúdo inválida"
  );
const id = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9_:.~-]+$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const n = z.number().finite();
const color = z.string().regex(/^#[a-fA-F0-9]{6}$/);
const geometry = {
  x: n,
  y: n,
  width: n.positive(),
  height: n.positive(),
  rotation: n,
  opacity: n.min(0).max(1),
};
export const arsenalAssetSchema = z
  .object({
    id,
    kind: z.enum(["bundled", "catalog"]),
    sha256: hash,
    mimeType: z.string(),
    bytes: n
      .int()
      .positive()
      .max(8 * 1024 * 1024),
    family: z.string().optional(),
    sourceFamily: z.string().optional(),
    weight: n.int().min(100).max(900).optional(),
    weightRange: z.object({ min: n.int().min(100).max(900), max: n.int().min(100).max(900) }).strict().refine(r => r.min <= r.max, "Faixa de pesos inválida").optional(),
    license: z.string().optional(),
  })
  .strict();
export type ArsenalAsset = z.infer<typeof arsenalAssetSchema>;
/** Canonical shape points remain local to the immutable source box, never to a prior resolved frame. */
export function arsenalEffectivePoints(points:readonly number[],basis:{width:number;height:number},frame:{width:number;height:number}):number[]{
  if(!Number.isFinite(basis.width)||basis.width<=0||!Number.isFinite(basis.height)||basis.height<=0)throw new Error("Base geométrica inválida");
  return points.map((coordinate,index)=>coordinate*(index%2===0?frame.width/basis.width:frame.height/basis.height));
}
export function resolveArsenalShapePoints(c:ArsenalComposition):void{
  for(const element of c.elements){
    if(element.kind!=="polygon"&&element.kind!=="line")continue;
    const instance=c.base.instances.find(i=>i.id===element.id);
    const layer=c.version===3?c.authorialLayers?.find(l=>l.id===element.id):undefined;
    const basis=instance ?? layer;
    const points=instance?c.pieces[instance.pieceHash]?.points:layer?.points;
    if(basis && points)element.points=arsenalEffectivePoints(points,basis,element);
  }
}
export function arsenalFontMatches(asset: ArsenalAsset, font: { fontFamily: string; fontWeight: number; fontAssetId: string | null }): boolean {
  return asset.id === font.fontAssetId && asset.family === font.fontFamily &&
    (asset.weight === font.fontWeight || !!asset.weightRange && font.fontWeight >= asset.weightRange.min && font.fontWeight <= asset.weightRange.max);
}
export const arsenalUserMediaSchema = z
  .object({
    kind: z.literal("user"),
    url: z
      .string()
      .refine(
        v => /^(https?:\/\/|data:image\/(png|jpeg|webp);base64,)/i.test(v) || /^\/api\/post-media\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/[a-f0-9]{64}$/i.test(v),
        "Imagem inválida"
      ),
    focalX: n.min(0).max(1),
    focalY: n.min(0).max(1),
  })
  .strict();

/** Explicit deferred media is a valid editable document, not a broken asset. */
export const arsenalMediaSlotSchema = z.object({
  id,
  label: z.string().min(1).max(120),
  function: z.string().max(240),
  prompt: z.string().max(2000),
  deferred: z.boolean(),
  policy: z.enum(["cover", "contain"]),
}).strict();
export type ArsenalMediaSlot = z.infer<typeof arsenalMediaSlotSchema>;

export const arsenalContentFragmentSchema = z.object({
  index: n.int().min(0),
  count: n.int().min(1).max(100),
  unit: z.literal("words"),
  weights: z.array(n.positive()).max(100).optional(),
}).strict().superRefine((f, ctx) => {
  if (f.index >= f.count || (f.weights && f.weights.length !== f.count))
    ctx.addIssue({ code: "custom", message: "Partição de conteúdo inválida" });
});
/** Partition without dropping or duplicating canonical text, including whitespace. */
export function fragmentContentText(text: string, fragment?: z.infer<typeof arsenalContentFragmentSchema>): string {
  if (!fragment) return text;
  const tokens = text.match(/\s*\S+\s*/g) ?? (text ? [text] : []);
  const weights = fragment.weights ?? Array(fragment.count).fill(1);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const boundary = (index: number) => index === fragment.count ? tokens.length :
    Math.floor(tokens.length * weights.slice(0, index).reduce((sum, weight) => sum + weight, 0) / total);
  return tokens.slice(boundary(fragment.index), boundary(fragment.index + 1)).join("");
}

export const arsenalTextFragmentSchema = z.object({
  start: n.int().min(0),
  end: n.int().min(1),
  style: z.object({
    color: color.optional(),
    sizeScale: n.positive().optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
  }).strict(),
}).strict().superRefine((f, ctx) => {
  if (f.end <= f.start) ctx.addIssue({ code: "custom", message: "Intervalo textual inválido" });
});
export type ArsenalTextFragment = z.infer<typeof arsenalTextFragmentSchema>;

export const arsenalPieceSchema = z
  .object({
    kind: z.enum(["text", "rect", "line", "polygon", "media"]),
    fill: color,
    stroke: color.nullable(),
    strokeWidth: n.min(0),
    cornerRadius: n.min(0),
    points: z.array(n).max(400),
    fontFamily: z.string().min(1).max(120),
    fontAssetId: id.nullable(),
    fontSize: n.positive(),
    fontWeight: n.int().min(100).max(900),
    align: z.enum(["left", "center", "right"]),
    lineHeight: n.positive(),
    letterSpacing: n,
    fixedText: z.string().nullable(),
    fixedTextRole: z.literal("ornament").optional(),
    /** Verified immutable raster layer, distinct from a generated photo slot. */
    imageAssetId: id.optional(),
    contentFragment: arsenalContentFragmentSchema.optional(),
    textFragments: z.array(arsenalTextFragmentSchema).max(100).optional(),
    extrusion: z.object({ color, offsetX: n, offsetY: n, steps: n.int().min(1).max(100) }).strict().optional(),
  })
  .strict();
export type PieceDefinitionV2 = z.infer<typeof arsenalPieceSchema>;
export const arsenalInstanceSchema = z
  .object({
    id,
    pieceHash: hash,
    parentId: id.nullable(),
    zIndex: n.int(),
    ...geometry,
  })
  .strict();
export type ArsenalInstance = z.infer<typeof arsenalInstanceSchema>;
export const arsenalGroupSchema = z
  .object({
    id,
    label: z.string().max(120),
    parentId: id.nullable(),
    zIndex: n.int(),
    ...geometry,
    scale: n.positive(),
  })
  .strict();
export type ArsenalGroup = z.infer<typeof arsenalGroupSchema>;
export const arsenalBindingSchema = z
  .object({
    id,
    label: z.string().max(120),
    kind: z.enum(["text", "list", "media"]),
    listMode: z.literal("native-slots").optional(),
    source: arsenalContentSourceSchema,
    required: z.boolean(),
    targetIds: z.array(id).min(1).max(20),
    cardinality: z
      .object({ min: n.int().min(0), max: n.int().min(1).max(10000) })
      .strict()
      .nullable(),
    prefix: z.string().max(40),
    gap: n.min(0),
  })
  .strict()
  .superRefine((b, ctx) => {
    if (
      (b.kind === "list") !==
        (b.source === "items" || b.source.endsWith(":items")) ||
      (b.kind === "media") !== (b.source === "media.primary")
    )
      ctx.addIssue({
        code: "custom",
        message: "Tipo/source de binding incompatíveis",
      });
    if (
      b.kind === "list" &&
      (!b.cardinality ||
        (b.listMode === "native-slots"
          ? b.cardinality.max > b.targetIds.length || new Set(b.targetIds).size !== b.targetIds.length
          : b.targetIds.length !== 1) ||
        b.cardinality.min > b.cardinality.max)
    )
      ctx.addIssue({
        code: "custom",
        message: "Lista exige slots nativos suficientes ou uma peça repetível e cardinalidade válida",
      });
    if (b.listMode && b.kind !== "list")
      ctx.addIssue({ code: "custom", message: "Modo de lista incompatível com binding" });
  });
export type ArsenalBinding = z.infer<typeof arsenalBindingSchema>;

const relationBase = { id, version: z.literal(1), enabled: z.boolean() };
const output = z
  .object({
    targetId: id,
    properties: z
      .array(
        z.enum(["x", "y", "width", "height", "rotation", "scale", "fontSize"])
      )
      .min(1),
  })
  .strict();
const relationMeta = {
  ...relationBase,
  inputs: z.array(id).max(40),
  outputs: z.array(output).min(1).max(40),
};
export const arsenalRelationSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        ...relationMeta,
        kind: z.literal("textFit"),
        parameters: z
          .object({
            anchor: z.enum(["left", "center", "right"]),
            maxWidth: n.positive(),
            maxHeight: n.positive(),
            minFontSize: n.positive(),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...relationMeta,
        kind: z.literal("surfaceFit"),
        parameters: z
          .object({
            padding: z
              .object({ left: n, right: n, top: n, bottom: n })
              .strict(),
            minWidth: n.positive(),
            minHeight: n.positive(),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...relationMeta,
        kind: z.literal("verticalFlow"),
        parameters: z.object({ gap: n, startY: n }).strict(),
      })
      .strict(),
    z
      .object({
        ...relationMeta,
        kind: z.literal("anchor"),
        parameters: z
          .object({
            axis: z.enum(["x", "y"]),
            referenceEdge: z.enum(["start", "center", "end"]),
            targetEdge: z.enum(["start", "center", "end"]),
            offset: n,
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...relationMeta,
        kind: z.literal("groupTransform"),
        parameters: z.object({ rotation: n, scale: n.positive() }).strict(),
      })
      .strict(),
    z
      .object({
        ...relationMeta,
        kind: z.literal("mediaSlot"),
        parameters: z.object({ fit: z.literal("cover") }).strict(),
      })
      .strict(),
  ])
  .superRefine((relation, ctx) => {
    const allowed: Record<string, readonly string[]> = {
      textFit: ["x", "width", "height", "fontSize"],
      surfaceFit: ["x", "y", "width", "height"],
      verticalFlow: ["y"],
      anchor: [relation.kind === "anchor" ? relation.parameters.axis : "x"],
      groupTransform: ["rotation", "scale"],
      mediaSlot: ["width", "height"],
    };
    for (const output of relation.outputs) {
      if (
        output.targetId === "artboard" ||
        output.properties.some(p => !allowed[relation.kind].includes(p))
      )
        ctx.addIssue({
          code: "custom",
          message: "Propriedade de saída incompatível com a relação",
        });
    }
  });
export type ArsenalRelation = z.infer<typeof arsenalRelationSchema>;

export const arsenalVariantSchema = z
  .object({
    variantKey: id,
    aspectRatio: z.enum(["1:1", "4:5", "5:6", "9:16"]),
    compilerVersion: arsenalCompilerSchema,
    artboard: z
      .object({ width: n.positive(), height: n.positive(), background: color })
      .strict(),
    instances: z.array(arsenalInstanceSchema).max(500),
    groups: z.array(arsenalGroupSchema).max(80),
    bindings: z.array(arsenalBindingSchema).max(200),
    relations: z.array(arsenalRelationSchema).max(200),
    assetIds: z.array(id).max(20),
    capabilities: z.array(z.string().max(80)).max(30),
    mediaSlots: z.array(arsenalMediaSlotSchema).max(20).optional(),
    lineBoxOverlaps: z.array(z.object({a:id,b:id,maxOverlapFraction:n.positive().max(.25),singleLineOnly:z.literal(true)}).strict()).max(200).optional(),
    // Optional for existing M1 snapshots: never inject defaults into hashed variants.
    brandPolicy: z
      .object({
        version: z.literal(1),
        background: z.enum(["background", "preserve"]),
        colors: z.record(
          z.string(),
          z.enum(["background", "accent", "text", "surface"])
        ),
        strokes: z
          .record(
            z.string(),
            z.enum(["background", "accent", "text", "surface"])
          )
          .optional(),
        fonts: z.enum(["preserve-design", "require-brand"]),
      })
      .strict()
      .optional(),
    intentionalOverlaps: z.array(z.tuple([id, id])).max(100),
    limitations: z.array(z.string().max(400)).max(30),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.compilerVersion === ARSENAL_COMPILER &&
      v.bindings.some(
        b => b.source.startsWith("block:") || b.source.startsWith("content:")
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Bindings variáveis exigem compiler V3",
      });
    for (const message of validateArsenalGraph(v))
      ctx.addIssue({ code: "custom", message });
    if (v.mediaSlots && (new Set(v.mediaSlots.map(s => s.id)).size !== v.mediaSlots.length ||
        v.mediaSlots.some(s => !v.instances.some(i => i.id === s.id))))
      ctx.addIssue({ code: "custom", message: "Slot de mídia ausente ou duplicado" });
    for(const pair of v.lineBoxOverlaps ?? [])if(pair.a===pair.b || ![pair.a,pair.b].every(id=>v.instances.some(i=>i.id===id)))ctx.addIssue({code:"custom",message:"Par de caixas de linha inválido"});
    if (
      v.brandPolicy &&
      [
        ...Object.keys(v.brandPolicy.colors),
        ...Object.keys(v.brandPolicy.strokes ?? {}),
      ].some(id => !v.instances.some(i => i.id === id))
    )
      ctx.addIssue({
        code: "custom",
        message: "Política de marca aponta para elemento inexistente",
      });
  });
export type ResolvedVariantDefinitionV2 = z.infer<typeof arsenalVariantSchema>;

/** Publication and client use the same ownership/dependency rules. */
export function validateArsenalGraph(v: {
  instances: ArsenalInstance[];
  groups: ArsenalGroup[];
  bindings: ArsenalBinding[];
  relations: ArsenalRelation[];
}): string[] {
  const errors: string[] = [];
  const nodes = [...v.instances, ...v.groups],
    ids = new Set(nodes.map(e => e.id));
  const groups = new Map(v.groups.map(g => [g.id, g]));
  if (ids.size !== nodes.length)
    errors.push("IDs de elementos/grupos duplicados");
  for (const e of nodes) {
    if (e.parentId && !groups.has(e.parentId))
      errors.push(`Pai inválido: ${e.id}`);
    const seen = new Set([e.id]);
    let parent = e.parentId;
    while (parent) {
      if (seen.has(parent)) {
        errors.push(`Ciclo de grupos: ${e.id}`);
        break;
      }
      seen.add(parent);
      parent = groups.get(parent)?.parentId ?? null;
    }
  }
  const bound = new Set<string>();
  if (new Set(v.bindings.map(b => b.id)).size !== v.bindings.length)
    errors.push("IDs de bindings duplicados");
  for (const b of v.bindings)
    for (const target of b.targetIds) {
      if (!v.instances.some(e => e.id === target) || bound.has(target))
        errors.push(`Binding inválido/duplicado: ${target}`);
      bound.add(target);
    }
  const ownership = new Map<string, string>();
  if (new Set(v.relations.map(r => r.id)).size !== v.relations.length)
    errors.push("IDs de relações duplicados");
  for (const r of v.relations) {
    for (const target of [...r.inputs, ...r.outputs.map(o => o.targetId)])
      if (target !== "artboard" && !ids.has(target))
        errors.push(`Relação sem alvo: ${r.id}/${target}`);
    if (!r.enabled) continue;
    for (const o of r.outputs)
      for (const p of o.properties) {
        const key = `${o.targetId}/${p}`;
        if (ownership.has(key)) errors.push(`Ownership conflitante: ${key}`);
        ownership.set(key, r.id);
      }
  }
  try {
    orderArsenalRelations(v.relations);
  } catch {
    errors.push("Ciclo de relações");
  }
  return errors;
}

export function orderArsenalRelations(
  relations: ArsenalRelation[]
): ArsenalRelation[] {
  const remaining = relations.filter(r => r.enabled),
    out: ArsenalRelation[] = [];
  while (remaining.length) {
    const ready = remaining
      .filter(
        r =>
          !remaining.some(
            other =>
              other !== r &&
              other.outputs.some(o => r.inputs.includes(o.targetId))
          )
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    if (!ready.length) throw new Error("Ciclo de relações");
    for (const r of ready) {
      out.push(r);
      remaining.splice(remaining.indexOf(r), 1);
    }
  }
  return out;
}

export const arsenalResolvedElementSchema = arsenalInstanceSchema
  .omit({ pieceHash: true })
  .extend(arsenalPieceSchema.shape)
  .extend({
    text: z.string(),
    bindingId: id.nullable(),
    itemId: z.string().nullable(),
    richText: z
      .array(
        z
          .object({
            text: z.string(),
            color: z.string().optional(),
            sizeScale: n.positive().optional(),
            bold: z.boolean().optional(),
            italic: z.boolean().optional(),
            underline: z.boolean().optional(),
          })
          .strict()
      )
      .optional(),
    mediaSlot: arsenalMediaSlotSchema.optional(),
  })
  .strict();
export type ArsenalElement = z.infer<typeof arsenalResolvedElementSchema>;
export const arsenalOriginSchema = z
  .object({
    candidateId: z.string(),
    blueprintId: z.string().uuid(),
    versionId: z.string().uuid(),
    version: n.int().positive(),
    definitionHash: hash,
    variantKey: id,
    variantHash: hash,
    compilerVersion: arsenalCompilerSchema,
    assembly: z.object({
      version: z.literal(1),
      planId: z.string().max(120),
      label: z.string().max(160),
      componentIds: z.array(z.string().max(120)).min(3).max(8),
      sourceHashes: z.array(hash).min(1).max(8),
      kitHash: hash,
      queryHash: hash,
      retrievalMethod: z.literal("component-feature-cosine-v1"),
      retrievalScore: n.min(0).max(1),
      experimental: z.literal(true),
    }).strict().optional(),
    componentAssembly: z.object({
      completeDesign: z.object({family:z.string().min(1).max(160),authorshipRevision:z.number().int().min(1).optional(),baselineVerified:z.boolean().optional(),colors:z.array(z.string().regex(/^#[a-f\d]{6}$/i)).max(100).optional(),designGuidance:designGuidanceSchema.optional()}).strict().optional(),
      version: z.literal(1),
      planHash: hash,
      componentIds: z.array(z.string().uuid()).min(1).max(12),
      componentHashes: z.array(hash).min(1).max(12),
      sourceHashes: z.array(hash).min(1).max(24),
      experimental: z.boolean(),
      resolution: z.object({
        kind: z.enum(["layout-adaptation", "component-adaptation", "quiet-adaptation", "editorial-fallback"]),
        reasons: z.array(z.string().max(160)).max(48),
        requestedComponentIds: z.array(z.string().uuid()).max(12),
      }).strict().optional(),
    }).strict().optional(),
  })
  .strict();
export const arsenalAuthorialLayerSchema = z
  .object({
    id,
    kind: z.enum(["text", "rect", "image", "line", "polygon"]),
    zIndex: n.int(),
    parentId: id.nullable().default(null),
    x: n,
    y: n,
    width: n.positive(),
    height: n.positive(),
    rotation: n.default(0),
    opacity: n.min(0).max(1).default(1),
    text: z.string().optional(),
    fontFamily: z.string().max(120).optional(),
    fontSize: n.positive().optional(),
    fontWeight: n.int().min(100).max(900).optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    lineHeight: n.positive().optional(),
    letterSpacing: n.optional(),
    fill: color.optional(),
    stroke: color.nullable().optional(),
    strokeWidth: n.min(0).optional(),
    cornerRadius: n.min(0).optional(),
    points: z.array(n).max(400).optional(),
    richText: z
      .array(
        z
          .object({
            text: z.string(),
            color: z.string().optional(),
            sizeScale: n.positive().optional(),
            bold: z.boolean().optional(),
            italic: z.boolean().optional(),
            underline: z.boolean().optional(),
          })
          .strict()
      )
      .optional(),
    url: z.string().optional(),
    imagePrompt: z.string().max(2000).optional(),
    focalX: n.min(0).max(1).optional(),
    focalY: n.min(0).max(1).optional(),
    effect: z.string().optional(),
    effectColor: z.string().optional(),
  })
  .strict();
export type ArsenalAuthorialLayer = z.infer<typeof arsenalAuthorialLayerSchema>;

export const arsenalCustomBackgroundSchema = z
  .object({
    fill: color.optional(),
    fitMode: z.enum(["cover", "contain"]).optional(),
    imageUrl: z.string().optional(),
    focalX: n.min(0).max(1).optional(),
    focalY: n.min(0).max(1).optional(),
    overlayOpacity: n.min(0).max(1).optional(),
    overlayColor: color.optional(),
    overlayMode: z
      .enum(["gradient-bottom", "gradient-top", "solid", "radial"])
      .optional(),
  })
  .strict();
export type ArsenalCustomBackground = z.infer<typeof arsenalCustomBackgroundSchema>;

export const arsenalLogoSchema = z
  .object({
    url: z.string(),
    position: z.enum(["top-left", "top-right", "bottom-left", "bottom-right", "custom"]),
    x: n.optional(),
    y: n.optional(),
    width: n.positive().optional(),
    height: n.positive().optional(),
    opacity: n.min(0).max(1).optional(),
  })
  .strict();
export type ArsenalLogo = z.infer<typeof arsenalLogoSchema>;

export const arsenalUserFontSchema = z
  .object({
    family: z.string().min(1).max(120),
    url: z.string(),
    weight: n.int().min(100).max(900).optional(),
    format: z.string().optional(),
  })
  .strict();
export type ArsenalUserFont = z.infer<typeof arsenalUserFontSchema>;

export const arsenalElementEffectSchema = z
  .object({
    effect: z.enum([
      "none",
      "shadow",
      "outline",
      "box-card",
      "box-pill",
      "box-glass",
      "box-accent",
      "box-brutal",
      "scrim",
      "strip-line",
    ]),
    color: color.optional(),
    blur: n.min(0).optional(),
    offset: z.object({ x: n, y: n }).strict().optional(),
  })
  .strict();
export type ArsenalElementEffect = z.infer<typeof arsenalElementEffectSchema>;

/** Authoring state never removes geometry, editorial bindings or media. */
export const canvasElementStateSchema = z.object({
  hidden: z.boolean().optional(),
  locked: z.boolean().optional(),
}).strict();
export const canvasElementStatesSchema = z.record(z.string().min(1), canvasElementStateSchema);
export type CanvasElementStates = z.infer<typeof canvasElementStatesSchema>;

const arsenalCompositionBaseFields = {
  elementStates: canvasElementStatesSchema.optional(),
  /** Last fill written by an explicit palette action; other fill overrides remain manual. */
  paletteAppliedFills: z.record(id, color).optional(),
  origin: arsenalOriginSchema,
  mediaSlotPrompts: z.record(id, z.string().max(2000)).optional(),
  base: arsenalVariantSchema,
  pieces: z.record(hash, arsenalPieceSchema),
  assets: z.array(arsenalAssetSchema),
  content: designContentDocumentSchema,
  userContentHash: hash,
  generatedContentHash: hash,
  contentRevision: n.int().min(0),
  elements: z.array(arsenalResolvedElementSchema).max(2000),
  groups: z.array(arsenalGroupSchema),
  relations: z.array(arsenalRelationSchema),
  overrides: z.record(
    id,
    z.record(z.string(), z.union([n, z.string(), z.boolean(), z.null()]))
  ),
  richText: z.record(
    id,
    z.array(
      z
        .object({
          text: z.string(),
          color: z.string().optional(),
          sizeScale: n.positive().optional(),
          bold: z.boolean().optional(),
          italic: z.boolean().optional(),
          underline: z.boolean().optional(),
        })
        .strict()
    )
  ),
  media: z.record(id, arsenalUserMediaSchema),
  seed: n.int(),
  state: z.enum(["applied", "adapted", "needs_adjustment"]),
  issues: z.array(z.string()).max(300),
  layoutOrigin: z.enum(["catalog-variant", "manual-projection"]),
  sourceVariantKey: id,
  effectiveAspectRatio: z.enum(["1:1", "4:5", "5:6", "9:16"]),
  projection: z.object({ scale: n.positive(), x: n, y: n }).strict(),
  artboard: z
    .object({ width: n.positive(), height: n.positive(), background: color })
    .strict(),
};

export const arsenalCompositionV2Schema = z
  .object({
    version: z.literal(2),
    ...arsenalCompositionBaseFields,
  })
  .strict();

export const arsenalCompositionV3Schema = z
  .object({
    version: z.literal(3),
    ...arsenalCompositionBaseFields,
    authorialLayers: z.array(arsenalAuthorialLayerSchema).default([]),
    hiddenInstanceIds: z.array(id).default([]),
    customBackground: arsenalCustomBackgroundSchema.optional(),
    logo: arsenalLogoSchema.optional(),
    userFonts: z.array(arsenalUserFontSchema).default([]),
    effects: z.record(id, arsenalElementEffectSchema).default({}),
  })
  .strict();

export const arsenalCompositionSchema = z.discriminatedUnion("version", [
  arsenalCompositionV2Schema,
  arsenalCompositionV3Schema,
]);
export type ArsenalCompositionV2 = z.infer<typeof arsenalCompositionV2Schema>;
export type ArsenalCompositionV3 = z.infer<typeof arsenalCompositionV3Schema>;
export type ArsenalComposition = ArsenalCompositionV2 | ArsenalCompositionV3;

export function validatePieceRelations(
  variant: ResolvedVariantDefinitionV2,
  pieces: Record<string, PieceDefinitionV2>,
  relations: ArsenalRelation[]
): void {
  for(const pair of variant.lineBoxOverlaps ?? []){
    const a=variant.instances.find(i=>i.id===pair.a),b=variant.instances.find(i=>i.id===pair.b);
    const ab=variant.bindings.find(binding=>binding.targetIds.includes(pair.a)),bb=variant.bindings.find(binding=>binding.targetIds.includes(pair.b));
    if(!a || !b || pieces[a.pieceHash]?.kind!=="text" || pieces[b.pieceHash]?.kind!=="text" || !ab || !bb || ab.source!==bb.source)throw new Error("Par de caixas de linha deve compartilhar texto canônico");
  }
  for (const slot of variant.mediaSlots ?? []) {
    const instance = variant.instances.find(i => i.id === slot.id);
    if (!instance || pieces[instance.pieceHash]?.kind !== "media")
      throw new Error("Slot deve apontar para peça de mídia");
  }
  const fragments = new Map<string, Array<z.infer<typeof arsenalContentFragmentSchema>>>();
  for (const binding of variant.bindings)
    for (const target of binding.targetIds) {
      const instance = variant.instances.find(i => i.id === target);
      const fragment = instance && pieces[instance.pieceHash]?.contentFragment;
      if (fragment) {
        if (binding.kind !== "text") throw new Error("Fragmento exige binding textual");
        fragments.set(binding.source, [...(fragments.get(binding.source) ?? []), fragment]);
      }
    }
  for (const rows of Array.from(fragments.values())) {
    const first = rows[0];
    if (rows.length !== first.count || new Set(rows.map(f => f.index)).size !== first.count ||
        rows.some(f => f.count !== first.count || arsenalHash(f.weights ?? []) !== arsenalHash(first.weights ?? [])))
      throw new Error("Partição textual incompleta ou inconsistente");
  }
  for (const relation of relations)
    for (const output of relation.outputs) {
      const instance = variant.instances.find(i => i.id === output.targetId);
      const kind = instance ? pieces[instance.pieceHash]?.kind : "group";
      if (
        (relation.kind === "textFit" && kind !== "text") ||
        (relation.kind === "mediaSlot" && kind !== "media") ||
        (relation.kind === "groupTransform" && kind !== "group") ||
        (relation.kind === "surfaceFit" && !["rect","group","polygon","line"].includes(kind))
      )
        throw new Error("Tipo de alvo incompatível com a relação");
    }
}

/** Integrity validation is shared by save, reopen and the portable reader; no browser measurement. */
export function readArsenalComposition(value: unknown): ArsenalComposition {
  const c = arsenalCompositionSchema.parse(value);
  for (const id of Object.keys(c.mediaSlotPrompts ?? {}))
    if (!c.base.mediaSlots?.some(slot => slot.id === id)) throw new Error("Prompt sem slot correspondente");
  for (const element of c.elements) {
    const slot = c.base.mediaSlots?.find(slot => slot.id === element.id);
    const expected = slot ? { ...slot, prompt: c.mediaSlotPrompts?.[slot.id] ?? slot.prompt } : undefined;
    if (arsenalHash(element.mediaSlot ?? null) !== arsenalHash(expected ?? null))
      throw new Error("Metadados de mídia divergentes da definição");
  }
  if (
    c.origin.candidateId !== `${c.origin.versionId}:${c.origin.variantKey}` ||
    c.origin.variantKey !== c.base.variantKey ||
    c.origin.compilerVersion !== c.base.compilerVersion ||
    c.sourceVariantKey !== c.base.variantKey
  )
    throw new Error("Identidade da variante divergente");
  if (c.userContentHash !== arsenalHash(c.content))
    throw new Error("Hash do conteúdo da composição divergente");
  if (c.origin.variantHash !== arsenalHash(c.base))
    throw new Error("Hash da variante divergente");
  for (const [hash, piece] of Object.entries(c.pieces))
    if (arsenalHash(piece) !== hash) throw new Error("Hash de peça divergente");
  for (const i of c.base.instances)
    if (!c.pieces[i.pieceHash]) throw new Error("Composição sem peça");
  validatePieceRelations(c.base, c.pieces, c.relations);
  const graphErrors = validateArsenalGraph({
    ...c.base,
    relations: c.relations,
  });
  if (graphErrors.length) throw new Error(graphErrors.join("; "));
  const ids = new Set([...c.elements, ...c.groups].map(e => e.id));
  if (ids.size !== c.elements.length + c.groups.length)
    throw new Error("IDs resolvidos duplicados");
  const groups = new Map(c.groups.map(g => [g.id, g]));
  for (const e of [...c.elements, ...c.groups]) {
    const seen = new Set([e.id]);
    let parent = e.parentId;
    while (parent) {
      if (seen.has(parent) || !groups.has(parent))
        throw new Error("Pai resolvido inválido/cíclico");
      seen.add(parent);
      parent = groups.get(parent)!.parentId;
    }
  }
  const allowed = new Set([
    "x",
    "y",
    "width",
    "height",
    "rotation",
    "scale",
    "opacity",
    "zIndex",
    "text",
    "fill",
    "stroke",
    "strokeWidth",
    "cornerRadius",
    "fontSize",
    "fontFamily",
    "fontAssetId",
    "fontWeight",
    "align",
    "lineHeight",
    "letterSpacing",
  ]);
  for (const patch of Object.values(c.overrides))
    for (const key of Object.keys(patch))
      if (!allowed.has(key)) throw new Error("Override não permitido");
  for (const b of c.base.bindings)
    for (const id of b.targetIds) {
      const piece =
        c.pieces[c.base.instances.find(i => i.id === id)!.pieceHash];
      if (piece.kind !== (b.kind === "media" ? "media" : "text"))
        throw new Error("Binding incompatível com peça");
    }
  // Verify completeness and bound copy without remeasuring a saved snapshot.
  const hidden = new Set(c.version === 3 ? (c.hiddenInstanceIds ?? []) : []);
  const expected = new Map<
    string,
    {
      parentId: string | null;
      kind: string;
      bindingId: string | null;
      itemId: string | null;
      text?: string;
    }
  >();
  for (const instance of c.base.instances) {
    if (hidden.has(instance.id)) continue;
    const binding = c.base.bindings.find(b =>
      b.targetIds.includes(instance.id)
    );
    const piece = c.pieces[instance.pieceHash];
    if (binding?.kind === "list") {
      if (binding.listMode === "native-slots") {
        const item = contentListItems(c.content, binding.source)[binding.targetIds.indexOf(instance.id)];
        expected.set(instance.id, {
          parentId: instance.parentId, kind: piece.kind, bindingId: binding.id,
          itemId: item?.id ?? null, text: item ? `${binding.prefix}${item.text}` : "",
        });
        continue;
      }
      for (const item of contentListItems(c.content, binding.source))
        expected.set(`${instance.id}~${arsenalHash(item.id).slice(0, 16)}`, {
          parentId: instance.parentId,
          kind: piece.kind,
          bindingId: binding.id,
          itemId: item.id,
          text: item.text,
        });
    } else {
      const boundText =
        binding && binding.kind !== "media"
          ? readContentSource(
              c.content,
              binding.source as (typeof visualContentSources)[number]
            )
          : undefined;
      expected.set(instance.id, {
        parentId: instance.parentId,
        kind: piece.kind,
        bindingId: binding?.kind === "text" ? binding.id : null,
        itemId: null,
        text:
          binding?.kind === "text"
            ? typeof boundText === "string"
              ? fragmentContentText(boundText, piece.contentFragment)
              : ""
            : undefined,
      });
    }
  }
  if (c.version === 3 && c.authorialLayers) {
    for (const layer of c.authorialLayers) {
      expected.set(layer.id, {
        parentId: layer.parentId ?? null,
        kind: layer.kind === "image" ? "media" : layer.kind,
        bindingId: null,
        itemId: null,
        text: layer.kind === "text" ? (layer.text ?? "") : undefined,
      });
    }
  }
  if (
    c.elements.length !== expected.size ||
    c.groups.length !== c.base.groups.length ||
    c.groups.some(
      g =>
        !c.base.groups.some(
          base => base.id === g.id && base.parentId === g.parentId
        )
    )
  )
    throw new Error("Snapshot resolvido incompleto");
  for (const element of c.elements) {
    const source = expected.get(element.id);
    if (
      !source ||
      source.parentId !== element.parentId ||
      source.kind !== element.kind ||
      source.bindingId !== element.bindingId ||
      source.itemId !== element.itemId ||
      (source.text !== undefined && source.text !== element.text)
    )
      throw new Error("Snapshot resolvido diverge do conteúdo ou da definição");
  }
  for (const e of c.elements)
    if (e.kind === "text" && e.fontAssetId) {
      const a = c.assets.find(a => a.id === e.fontAssetId);
      if (!a || !arsenalFontMatches(a, e))
        throw new Error("Fonte resolvida sem asset correspondente");
    }
  for (const assetId of c.base.assetIds)
    if (!c.assets.some(a => a.id === assetId))
      throw new Error("Asset da variante ausente");
  for (const e of c.elements) {
    const instance = c.base.instances.find(i => i.id === e.id);
    const authoredImage = instance && c.pieces[instance.pieceHash]?.imageAssetId;
    if (e.imageAssetId !== authoredImage)
      throw new Error("Imagem imutável diverge da definição");
    if (e.imageAssetId && (e.kind !== "media" || !c.assets.some(a => a.id === e.imageAssetId && /^image\/(png|jpeg|webp)$/.test(a.mimeType))))
      throw new Error("Imagem imutável sem manifesto correspondente");
  }
  // Repair old saved resolved boxes as well: base/overrides remain pinned and only derived points change.
  resolveArsenalShapePoints(c);
  return c;
}

export const pinnedCandidateV2Schema = arsenalOriginSchema
  .extend({ variant: arsenalVariantSchema })
  .strict()
  .superRefine((candidate, ctx) => {
    if (
      candidate.candidateId !==
        `${candidate.versionId}:${candidate.variantKey}` ||
      candidate.variantKey !== candidate.variant.variantKey ||
      candidate.compilerVersion !== candidate.variant.compilerVersion ||
      candidate.variantHash !== arsenalHash(candidate.variant)
    )
      ctx.addIssue({
        code: "custom",
        message: "Identidade/hash do candidato divergente",
      });
  });
export const catalogBundleV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    contentContract: variableContentContractSchema.optional(),
    traceId: z.string().min(1),
    runId: z.string().min(1),
    slot: n.int().min(0).max(2),
    content: designContentDocumentSchema,
    userContentHash: hash,
    targetAspectRatio: z.enum(["1:1", "4:5", "5:6", "9:16"]),
    selection: z.enum(["llm", "ranked_fallback", "none"]),
    candidates: z.array(pinnedCandidateV2Schema).max(3),
    pieces: z.record(hash, arsenalPieceSchema),
    assets: z.array(arsenalAssetSchema).max(20),
  })
  .strict()
  .superRefine((bundle, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (bundle.content.schemaVersion === 3 && !bundle.contentContract)
      issue("Contrato de geração V3 ausente");
    if (bundle.contentContract && bundle.content.schemaVersion === 3)
      for (const message of validateVariableContent(
        bundle.content,
        bundle.contentContract
      ))
        issue(message);
    if (bundle.userContentHash !== arsenalHash(bundle.content))
      issue("Hash de conteúdo divergente");
    if ((bundle.selection === "none") !== (bundle.candidates.length === 0))
      issue("Seleção none exige zero candidatos");
    if (
      new Set(bundle.candidates.map(c => c.candidateId)).size !==
      bundle.candidates.length
    )
      issue("Candidatos duplicados");
    if (new Set(bundle.assets.map(a => a.id)).size !== bundle.assets.length)
      issue("Assets duplicados");
    for (const [hash, piece] of Object.entries(bundle.pieces))
      if (arsenalHash(piece) !== hash) issue("Hash de peça divergente");
    for (const c of bundle.candidates) {
      if (c.variant.aspectRatio !== bundle.targetAspectRatio)
        issue("Formato do candidato incompatível");
      for (const i of c.variant.instances)
        if (!bundle.pieces[i.pieceHash]) issue("Peça do candidato ausente");
      for (const id of c.variant.assetIds)
        if (!bundle.assets.some(a => a.id === id))
          issue("Asset do candidato ausente");
      try {
        validatePieceRelations(c.variant, bundle.pieces, c.variant.relations);
      } catch (error) {
        issue((error as Error).message);
      }
    }
    if (
      new TextEncoder().encode(JSON.stringify(bundle)).byteLength >
      512 * 1024
    )
      issue("bundle_too_large");
  });
export type PinnedCandidateV2 = z.infer<typeof pinnedCandidateV2Schema>;
export type CatalogBundleV2 = z.infer<typeof catalogBundleV2Schema>;
