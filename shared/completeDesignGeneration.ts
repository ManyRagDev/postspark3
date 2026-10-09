import { z } from "zod";
import {
  arsenalCompositionSchema,
  readArsenalComposition,
  type ArsenalComposition,
} from "./designArsenal";
import { arsenalHash, type DesignContent } from "./arsenalContent";
import {
  assemblyIdentity,
  type ComponentDefinitionV1,
  type ComponentCardV1,
} from "./componentAssembly";
import { contentTextRoles, type VariableContent } from "./variableContent";
import { studioPreferencesSchema } from "./studioPreferences";

/** Dedicated transport: resolved catalogue scenes, not instructions to compose a layout. */
export const completeDesignProvenanceSchema = z
  .object({
    schemaVersion: z.literal(1),
    pipeline: z.literal("complete-design-v1"),
    traceId: z.string().uuid(),
    runId: z.string().uuid(),
    slot: z.number().int().min(0).max(2),
    name: z.string().min(1).max(160),
    reason: z.string().min(1).max(600),
    family: z.string().min(1).max(160),
    visualPreference: studioPreferencesSchema,
  })
  .strict();
export const completeDesignVariationV1Schema = completeDesignProvenanceSchema
  .extend({
    caption: z.string(),
    hashtags: z.array(z.string()),
    slides: z
      .array(
        z
          .object({
            id: z.string(),
            role: z.enum(["static", "cover", "development", "closing"]),
            composition: arsenalCompositionSchema,
          })
          .strict()
      )
      .min(1)
      .max(10),
  })
  .strict()
  .superRefine((v, ctx) => {
    for (const slide of v.slides) {
      try {
        const c = readArsenalComposition(slide.composition),
          p = c.origin.componentAssembly;
        if (
          !p?.completeDesign ||
          p.componentIds.length !== 1 ||
          p.componentHashes.length !== 1 ||
          p.completeDesign.family !== v.family ||
          p.resolution
        )
          throw new Error("Origem de design completo inválida");
        if (c.issues.length || c.state === "needs_adjustment")
          throw new Error("Composição não aprovada para entrega");
      } catch (e) {
        ctx.addIssue({
          code: "custom",
          message: e instanceof Error ? e.message : "Composição inválida",
        });
      }
    }
  });
export type CompleteDesignVariationV1 = z.infer<
  typeof completeDesignVariationV1Schema
>;

export function completeDesignFields(
  definition: ComponentDefinitionV1 | ComponentCardV1
) {
  const bindings =
    "fragment" in definition ? definition.fragment.bindings : definition.fields;
  return Array.from(
    new Map(
      bindings.filter(b => b.kind !== "media").map(b => [b.source, b])
    ).values()
  ).map((b, index) => {
    const parsed = b.source.match(/^block:([A-Za-z]+):\d+:/)?.[1] ?? b.source;
    const role = contentTextRoles.includes(
      parsed as (typeof contentTextRoles)[number]
    )
      ? (parsed as (typeof contentTextRoles)[number])
      : "label";
    return {
      id: `field-${index}`,
      source: b.source,
      kind: b.kind,
      role,
      required: b.required,
      cardinality: b.cardinality,
    };
  });
}

/** Only field values vary. All layer/group IDs, shapes, effects, assets and native relations stay intact. */
export function instantiateCompleteDesign(input: {
  definition: ComponentDefinitionV1;
  values: Array<{ fieldId: string; value: string | string[] }>;
  mediaPrompts: Array<{ slotId: string; prompt: string }>;
  runId: string;
  slot: number;
  slide: number;
  planHash: string;
  experimental: boolean;
}): ArsenalComposition {
  const { definition: d } = input;
  if (d.kind !== "content" || !d.completeDesign?.baselineVerified)
    throw new Error("Design completo não elegível");
  const fields = completeDesignFields(d),
    values = new Map(input.values.map(v => [v.fieldId, v.value]));
  if (
    values.size !== input.values.length ||
    values.size !== fields.length ||
    input.values.some(v => !fields.some(f => f.id === v.fieldId))
  )
    throw new Error("Campos da composição divergentes");
  const blocks: VariableContent["blocks"] = fields.map(f => {
    const value = values.get(f.id)!;
    if (f.required && !(Array.isArray(value) ? value.length : value.trim()))
      throw new Error(`Campo obrigatório vazio: ${f.id}`);
    if (f.kind === "list") {
      if (
        !Array.isArray(value) ||
        value.length < (f.cardinality?.min ?? 0) ||
        value.length > (f.cardinality?.max ?? 10000)
      )
        throw new Error(`Lista incompatível: ${f.id}`);
      return {
        id: f.id,
        type: "list",
        items: value.map((text, i) => ({ id: `item-${i}`, text })),
      };
    }
    if (typeof value !== "string")
      throw new Error(`Texto incompatível: ${f.id}`);
    return { id: f.id, type: "text", role: f.role, text: value };
  });
  const content: DesignContent = {
    schemaVersion: 3,
    blocks,
    caption: "",
    hashtags: [],
  };
  const base = structuredClone(d.fragment);
  base.bindings = base.bindings.map(b => {
    const field = fields.find(f => f.source === b.source);
    return field
      ? {
          ...b,
          source: `content:${field.id}:${field.kind === "list" ? "items" : "text"}`,
        }
      : b;
  });
  const media = new Map(input.mediaPrompts.map(m => [m.slotId, m.prompt]));
  if (
    media.size !== input.mediaPrompts.length ||
    input.mediaPrompts.some(m => !base.mediaSlots?.some(s => s.id === m.slotId))
  )
    throw new Error("Slot de mídia não pertence ao design");
  base.mediaSlots = base.mediaSlots?.map(s => ({
    ...s,
    prompt: media.get(s.id) ?? s.prompt,
  }));
  const versionId = assemblyIdentity([
      input.runId,
      input.slot,
      input.slide,
      d.id,
      d.hash,
    ]),
    variantHash = arsenalHash(base);
  const origin = {
    candidateId: `${versionId}:${base.variantKey}`,
    blueprintId: d.id,
    versionId,
    version: 1,
    definitionHash: d.hash,
    variantKey: base.variantKey,
    variantHash,
    compilerVersion: base.compilerVersion,
    componentAssembly: {
      version: 1 as const,
      completeDesign: d.completeDesign,
      planHash: input.planHash,
      componentIds: [d.id],
      componentHashes: [d.hash],
      sourceHashes: [
        d.source.kind === "recipe"
          ? d.source.recipeHash
          : d.source.definitionHash,
      ],
      experimental: input.experimental,
    },
  };
  return arsenalCompositionSchema.parse({
    version: 2,
    origin,
    base,
    pieces: structuredClone(d.pieces),
    assets: structuredClone(d.assets),
    content,
    userContentHash: arsenalHash(content),
    generatedContentHash: arsenalHash(content),
    contentRevision: 0,
    elements: [],
    groups: base.groups,
    relations: base.relations,
    overrides: {},
    richText: {},
    media: {},
    seed: 0,
    state: "needs_adjustment",
    issues: [],
    layoutOrigin: "catalog-variant",
    sourceVariantKey: base.variantKey,
    effectiveAspectRatio: base.aspectRatio,
    projection: { scale: 1, x: 0, y: 0 },
    artboard: base.artboard,
  });
}
