import { z } from "zod";
import { designGuidanceSchema } from "./designGuidance";
export { designGuidanceSchema, type DesignGuidance } from "./designGuidance";
import { arsenalHash, contentCoverageIssues } from "./arsenalContent";
import { bindAssemblyContent, bindCompleteDesignClosingContent } from "./assemblyContentBindings";
import {
  ARSENAL_VARIABLE_COMPILER,
  arsenalAssetSchema,
  arsenalPieceSchema,
  arsenalVariantSchema,
  catalogBundleV2Schema,
  arsenalCompositionSchema,
  readArsenalComposition,
  arsenalFontMatches,
  validatePieceRelations,
  type ArsenalAsset,
  type ArsenalComposition,
  type PieceDefinitionV2,
  type ResolvedVariantDefinitionV2,
  type CatalogBundleV2,
} from "./designArsenal";
import {
  variableContentDocumentSchema,
  contentBlockTypes,
  contentTextRoles,
} from "./variableContent";
import {
  resolveArsenalGeometry,
  arsenalWorldGeometry,
  type ArsenalTextMeasurer,
} from "./arsenalGeometry";
import { aspectRatioHeight } from "./aspectRatios";
import { buildArsenalFallback } from "./arsenalFallback";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const uuid = z.string().uuid();
const identity = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_:.~-]+$/);
const aspect = z.enum(["1:1", "4:5", "5:6", "9:16"]);
const normalizedBoxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .strict()
  .refine(
    b => b.x + b.width <= 1.000001 && b.y + b.height <= 1.000001,
    "component_placement_out_of_bounds"
  );
export const assemblyComponentRefV1Schema = z
  .object({
    id: uuid,
    hash,
    placement: normalizedBoxSchema.optional(),
    layoutRelation: z
      .object({
        kind: z.enum(["native", "beside", "below", "overlay"]),
        relativeTo: uuid.nullable(),
        gap: z.number().min(0).max(0.2).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const assemblySlideRoles = [
  "static",
  "cover",
  "development",
  "list",
  "comparison",
  "example",
  "closing",
] as const;
export const assemblyDensities = ["quiet", "balanced", "expressive"] as const;
export const componentKinds = [
  "background",
  "content",
  "typography",
  "media",
  "ornament",
] as const;
export const componentSourceV1Schema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("recipe"),
      recipeHash: hash,
      fileHash: hash,
      referenceId: z.string().min(1).max(160),
      variantKey: identity,
    })
    .strict(),
  z
    .object({
      kind: z.literal("catalog"),
      versionId: uuid,
      definitionHash: hash,
      variantKey: identity,
      variantHash: hash,
    })
    .strict(),
]);
const componentDefinitionFields = {
  schemaVersion: z.literal(1),
  completeDesign: z.object({ family: z.string().min(1).max(160), authorshipRevision:z.number().int().min(1).optional(), baselineVerified:z.boolean().optional(), colors:z.array(z.string().regex(/^#[a-f\d]{6}$/i)).max(100).optional(), designGuidance:designGuidanceSchema.optional() }).strict().optional(),
  id: uuid,
  kind: z.enum(componentKinds),
  label: z.string().min(1).max(160),
  description: z.string().max(800),
  source: componentSourceV1Schema,
  roles: z.array(z.enum(assemblySlideRoles)).min(1).max(7),
  densities: z.array(z.enum(assemblyDensities)).min(1).max(3),
  aspectRatios: z.array(aspect).min(1).max(4),
  decorativeIntensity: z.number().min(0).max(1).optional(),
  colorRoles: z
    .record(
      z.string(),
      z.enum(["background", "surface", "text", "accent", "preserve"])
    )
    .optional(),
  removableElementIds: z.array(z.string()).max(200).optional(),
  fragment: arsenalVariantSchema,
  pieces: z.record(hash, arsenalPieceSchema),
  assets: z.array(arsenalAssetSchema).max(20),
};
export const componentDefinitionV1Schema = z
  .object({ ...componentDefinitionFields, hash })
  .strict()
  .superRefine((c, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (componentHash(c) !== c.hash) issue("component_hash_mismatch");
    if (new Set(c.assets.map(a => a.id)).size !== c.assets.length)
      issue("duplicate_component_asset");
    for (const [h, p] of Object.entries(c.pieces))
      if (arsenalHash(p) !== h) issue("piece_hash_mismatch");
    for (const i of c.fragment.instances)
      if (!c.pieces[i.pieceHash]) issue("missing_component_piece");
    for (const id of c.fragment.assetIds)
      if (!c.assets.some(a => a.id === id)) issue("missing_component_asset");
    for (const p of Object.values(c.pieces))
      if (p.fontAssetId && !c.assets.some(a => arsenalFontMatches(a, p)))
        issue("component_font_manifest_mismatch");
    for (const p of Object.values(c.pieces))
      if (p.imageAssetId && (p.kind !== "media" || !c.assets.some(a => a.id === p.imageAssetId && /^image\/(png|jpeg|webp)$/.test(a.mimeType))))
        issue("component_image_manifest_mismatch");
    for (const id of c.completeDesign?.designGuidance?.requiredTextTargets ?? []) {
      const target = c.fragment.instances.find(i => i.id === id);
      if (!target || c.pieces[target.pieceHash]?.kind !== "text")
        issue("component_required_text_target_invalid");
    }
    for (const id of [
      ...Object.keys(c.colorRoles ?? {}),
      ...(c.removableElementIds ?? []),
    ])
      if (!c.fragment.instances.some(i => i.id === id))
        issue("component_metadata_target_absent");
    try {
      validatePieceRelations(c.fragment, c.pieces, c.fragment.relations);
    } catch (e) {
      issue(e instanceof Error ? e.message : "invalid_component_relations");
    }
  });
export type ComponentDefinitionV1 = z.infer<typeof componentDefinitionV1Schema>;
export type ComponentDefinitionInputV1 = Omit<ComponentDefinitionV1, "hash">;
/** Hash excludes its own digest. Optional fields are never injected into source fragments. */
export function componentHash(
  value: Omit<ComponentDefinitionV1, "hash"> | ComponentDefinitionV1
): string {
  const { hash: ignored, ...definition } = value as ComponentDefinitionV1;
  return arsenalHash(definition);
}
export function createComponentDefinition(
  value: Omit<ComponentDefinitionV1, "hash">
): ComponentDefinitionV1 {
  return componentDefinitionV1Schema.parse({
    ...value,
    hash: componentHash(value),
  });
}
export const assemblyVisualLanguages = ["editorial", "graphic", "typographic", "organic", "restrained"] as const;
export const componentCardV1Schema = z
  .object({
    id: uuid,
    hash,
    completeDesign: componentDefinitionV1Schema.shape.completeDesign,
    kind: z.enum(componentKinds),
    label: z.string(),
    description: z.string(),
    visualTraits: z.object({
      version: z.literal(1),
      sourceKey: z.string().min(1).max(240),
      languages: z.array(z.enum(assemblyVisualLanguages)).min(1).max(5),
      treatments: z.array(z.string().min(1).max(40)).max(10),
    }).strict().optional(),
    roles: z.array(z.enum(assemblySlideRoles)),
    densities: z.array(z.enum(assemblyDensities)),
    aspectRatios: z.array(aspect),
    fields: z.array(
      z
        .object({
          source: z.string(),
          kind: z.enum(["text", "list", "media"]),
          required: z.boolean(),
          cardinality: z
            .object({ min: z.number(), max: z.number() })
            .nullable(),
        })
        .strict()
    ),
    mediaSlots: z.array(
      z
        .object({
          id: z.string(),
          label: z.string(),
          function: z.string(),
          prompt: z.string(),
          deferred: z.boolean(),
          policy: z.enum(["cover", "contain"]),
        })
        .strict()
    ),
    fontFamilies: z.array(z.string()),
    sourceFontFamilies: z.array(z.string()).optional(),
    contentTypes: z.array(z.enum(contentBlockTypes)).optional(),
    limitations: z.array(z.string()),
    decorativeIntensity: z.number().min(0).max(1),
    regions: z
      .array(
        z
          .object({
            id: z.string(),
            kind: z.enum(["text", "media"]),
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number(),
            rotation: z.number(),
          })
          .strict()
      )
      .optional(),
    capacity: z
      .object({
        width: z.number(),
        height: z.number(),
        textRegions: z.array(
          z
            .object({
              source: z.string(),
              width: z.number(),
              height: z.number(),
              fontSize: z.number(),
              minFontSize: z.number(),
              minWords: z.number().int().min(1),
            })
            .strict()
        ),
      })
      .strict(),
  })
  .strict();
export type ComponentCardV1 = z.infer<typeof componentCardV1Schema>;
export function compactComponentCard(
  component: ComponentDefinitionV1
): ComponentCardV1 {
  const c = componentDefinitionV1Schema.parse(component),
    v = c.fragment;
  const names = `${c.label} ${c.source.kind === "recipe" ? c.source.referenceId : ""} ${v.instances.map(i => i.id).join(" ")}`.toLowerCase();
  const treatments = new Set<string>();
  if (c.source.variantKey.includes("-curated-")) treatments.add("assembly-authored");
  const languages = new Set<(typeof assemblyVisualLanguages)[number]>();
  for (const instance of v.instances) {
    const piece = c.pieces[instance.pieceHash];
    if (piece.extrusion) treatments.add("extrusion");
    if (piece.kind === "text" && piece.stroke && piece.strokeWidth > 0) treatments.add("outline");
    if (Math.abs(arsenalWorldGeometry({...instance, label:instance.id, scale:1},v.groups).rotation) > .1) treatments.add("rotation");
    if (piece.kind === "polygon") treatments.add("geometric-accents");
  }
  if (/paper|papel|scrapbook/.test(names)) { treatments.add("paper"); languages.add("editorial"); }
  if (/window|janela/.test(names)) { treatments.add("window"); languages.add("graphic"); }
  if (/ribbon|tarja/.test(names)) treatments.add("line-bars");
  if (/organic|org[aâ]nic|forma-verde|forma-laranja/.test(names)) languages.add("organic");
  if (/editorial|quote|paper|papel|glass/.test(names)) languages.add("editorial");
  if (c.kind === "typography" || treatments.has("extrusion") || /kinetic|tipograf|typograph/.test(names)) languages.add("typographic");
  if (c.kind === "ornament" || treatments.has("geometric-accents") || /chromatic|brutal|glitch|data-punch|janela/.test(names)) languages.add("graphic");
  if (c.densities.includes("quiet") || /minimal-air/.test(names)) languages.add("restrained");
  if (!languages.size) languages.add(c.kind === "media" ? "editorial" : "graphic");
  return componentCardV1Schema.parse({
    id: c.id,
    hash: c.hash,
    ...(c.completeDesign ? {completeDesign:c.completeDesign} : {}),
    kind: c.kind,
    label: c.label,
    description: c.description,
    visualTraits: {version:1,sourceKey:c.source.kind === "recipe" ? `recipe:${c.source.referenceId}` : `catalog:${c.source.versionId}:${c.source.variantKey}`,languages:Array.from(languages),treatments:Array.from(treatments)},
    roles: c.roles,
    densities: c.densities,
    aspectRatios: c.aspectRatios,
    fields: v.bindings.map(({ source, kind, required, cardinality }) => ({
      source,
      kind,
      required,
      cardinality,
    })),
    mediaSlots: v.mediaSlots ?? [],
    fontFamilies: Array.from(
      new Set(
        Object.values(c.pieces)
          .filter(p => p.kind === "text")
          .map(p => p.fontFamily)
      )
    ),
    sourceFontFamilies: Array.from(
      new Set(
        c.assets
          .map(a => a.sourceFamily ?? a.family)
          .filter((f): f is string => !!f)
      )
    ),
    contentTypes: Array.from(
      new Set(
        v.bindings
          .filter(b => b.kind !== "media")
          .map(b =>
            b.kind === "list"
              ? ("list" as const)
              : /^block:comparison:|^content:[^:]+:(left|right)\./.test(
                    b.source
                  )
                ? ("comparison" as const)
                : /^block:metric:/.test(b.source)
                  ? ("metric" as const)
                  : /^block:quote:/.test(b.source)
                    ? ("quote" as const)
                    : ("text" as const)
          )
      )
    ),
    limitations: v.limitations,
    regions: v.instances
      .filter(i => ["text", "media"].includes(c.pieces[i.pieceHash].kind))
      .map(i => {
        const w = arsenalWorldGeometry(
          { ...i, scale: 1, label: i.id },
          v.groups
        );
        return {
          id: i.id,
          kind: c.pieces[i.pieceHash].kind,
          x: w.x / v.artboard.width,
          y: w.y / v.artboard.height,
          width: (i.width * w.scale) / v.artboard.width,
          height: (i.height * w.scale) / v.artboard.height,
          rotation: w.rotation,
        };
      }),
    decorativeIntensity:
      c.decorativeIntensity ??
      Math.min(
        1,
        v.instances.filter(
          i => !["text", "media"].includes(c.pieces[i.pieceHash].kind)
        ).length / 20
      ),
    capacity: {
      width: v.artboard.width,
      height: v.artboard.height,
      textRegions: v.bindings
        .filter(b => b.kind !== "media")
        .flatMap(b =>
          b.targetIds.map(id => {
            const i = v.instances.find(i => i.id === id)!,
              p = c.pieces[i.pieceHash],
              r = v.relations.find(
                r =>
                  r.kind === "textFit" && r.outputs.some(o => o.targetId === id)
              );
            return {
              source: b.source,
              width: i.width,
              height: i.height,
              fontSize: p.fontSize,
              minFontSize:
                r?.kind === "textFit" ? r.parameters.minFontSize : p.fontSize,
              minWords: p.contentFragment?.count ?? 1,
            };
          })
        ),
    },
  });
}
export const assemblyArtIntentV1Schema = z.object({
  language: z.enum(assemblyVisualLanguages),
  hierarchy: z.enum(["headline", "content", "media", "comparison", "metric"]),
  recurringComponentIds: z.array(uuid).max(6),
  mediaRole: z.enum(["none", "support", "subject"]),
  rhythm: z.array(z.object({slideId:identity,emphasis:z.enum(["hero", "reading", "highlight", "closing"]),density:z.enum(assemblyDensities)}).strict()).min(1).max(10),
}).strict();
export const assemblyDirectionV1Schema = z
  .object({
    label: z.string().min(1).max(160),
    palette: z
      .object({
        background: z.string().regex(/^#[a-fA-F\d]{6}$/),
        text: z.string().regex(/^#[a-fA-F\d]{6}$/),
        accent: z.string().regex(/^#[a-fA-F\d]{6}$/),
      })
      .strict(),
    typographyComponentId: uuid.nullable(),
    intent: assemblyArtIntentV1Schema.optional(),
  })
  .strict();
export const assemblySlidePlanV1Schema = z
  .object({
    id: identity,
    role: z.enum(assemblySlideRoles),
    density: z.enum(assemblyDensities),
    content: variableContentDocumentSchema,
    components: z.array(assemblyComponentRefV1Schema).min(1).max(12),
    mediaPrompts: z
      .array(
        z
          .object({
            componentId: uuid,
            slotId: z.string().min(1).max(160),
            prompt: z.string().min(1).max(2000),
          })
          .strict()
      )
      .max(20),
  })
  .strict();
export const assemblyPlanV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    postMode: z.enum(["static", "carousel"]),
    aspectRatio: aspect,
    variations: z
      .array(
        z
          .object({
            id: identity,
            direction: assemblyDirectionV1Schema,
            caption: z.string(),
            hashtags: z.array(z.string()),
            slides: z.array(assemblySlidePlanV1Schema).min(1).max(10),
          })
          .strict()
      )
      .length(3),
  })
  .strict();
export type AssemblyPlanV1 = z.infer<typeof assemblyPlanV1Schema>;
export const assemblyVariationBundleV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    traceId: uuid,
    runId: uuid,
    slot: z.number().int().min(0).max(2),
    planHash: hash,
    direction: assemblyDirectionV1Schema,
    caption: z.string(),
    hashtags: z.array(z.string()),
    slides: z
      .array(
        z
          .object({
            id: identity,
            role: z.enum(assemblySlideRoles),
            density: z.enum(assemblyDensities),
            bundle: catalogBundleV2Schema,
          })
          .strict()
      )
      .min(1)
      .max(10),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.slides.map(s => s.id)).size !== v.slides.length)
      ctx.addIssue({ code: "custom", message: "duplicate_slide_id" });
    if (
      v.slides.some(
        s =>
          s.bundle.runId !== v.runId ||
          s.bundle.traceId !== v.traceId ||
          s.bundle.slot !== v.slot
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "slide_bundle_identity_mismatch",
      });
    if (
      v.slides.some(s =>
        s.bundle.candidates.some(
          c =>
            !c.componentAssembly || c.componentAssembly.planHash !== v.planHash
        )
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "slide_candidate_plan_hash_mismatch",
      });
  });
export type AssemblyVariationBundleV1 = z.infer<
  typeof assemblyVariationBundleV1Schema
>;
export const generationAssemblyBundleV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    traceId: uuid,
    runId: uuid,
    planHash: hash,
    variations: z.array(assemblyVariationBundleV1Schema).length(3),
  })
  .strict()
  .superRefine((g, ctx) => {
    if (
      g.variations.some(
        (v, i) =>
          v.slot !== i ||
          v.traceId !== g.traceId ||
          v.runId !== g.runId ||
          v.planHash !== g.planHash
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "generation_bundle_identity_mismatch",
      });
  });
export type GenerationAssemblyBundleV1 = z.infer<
  typeof generationAssemblyBundleV1Schema
>;
export function validateAssemblyPlan(
  value: unknown,
  offered: ReadonlyArray<ComponentDefinitionV1 | ComponentCardV1>,
  expected?: { postMode: "static" | "carousel"; slideCount?: number }
): string[] {
  const parsed = assemblyPlanV1Schema.safeParse(value);
  if (!parsed.success)
    return parsed.error.issues.map(i => `${i.path.join(".")}:${i.message}`);
  const plan = parsed.data,
    issues: string[] = [],
    map = new Map(offered.map(c => [c.id, c]));
  if (expected && plan.postMode !== expected.postMode)
    issues.push("post_mode_mismatch");
  const count = plan.postMode === "static" ? 1 : (expected?.slideCount ?? 5);
  if (plan.postMode === "carousel" && (count < 2 || count > 10))
    issues.push("unsupported_slide_count");
  if (new Set(plan.variations.map(v => v.id)).size !== 3)
    issues.push("duplicate_variation_id");
  for (const [slot, v] of Array.from(plan.variations.entries())) {
    if (v.slides.length !== count) issues.push(`slide_count:${slot}`);
    if (new Set(v.slides.map(s => s.id)).size !== v.slides.length)
      issues.push(`duplicate_slide_id:${slot}`);
    const typography =
      v.direction.typographyComponentId &&
      map.get(v.direction.typographyComponentId);
    if (
      v.direction.typographyComponentId &&
      (!typography || typography.kind !== "typography")
    )
      issues.push(`typography_not_offered:${slot}`);
    for (const [index, s] of Array.from(v.slides.entries())) {
      if (plan.postMode === "static" && s.role !== "static")
        issues.push(`static_role:${slot}/${index}`);
      if (
        plan.postMode === "carousel" &&
        ((index === 0 && s.role !== "cover") ||
          (index === v.slides.length - 1 && s.role !== "closing") ||
          (index > 0 &&
            index < v.slides.length - 1 &&
            ["cover", "closing", "static"].includes(s.role)))
      )
        issues.push(`slide_role:${slot}/${index}`);
      if (new Set(s.components.map(r => r.id)).size !== s.components.length)
        issues.push(`duplicate_component:${slot}/${index}`);
      for (const ref of s.components) {
        const target = ref.layoutRelation?.relativeTo;
        if (
          target &&
          (target === ref.id || !s.components.some(c => c.id === target))
        )
          issues.push(`component_relation_target:${ref.id}`);
        if (
          ref.layoutRelation &&
          ref.layoutRelation.kind !== "native" &&
          !target
        )
          issues.push(`component_relation_target:${ref.id}`);
        const visited = new Set<string>([ref.id]);
        let cursor = target;
        while (cursor) {
          if (visited.has(cursor)) {
            issues.push(`component_relation_cycle:${ref.id}`);
            break;
          }
          visited.add(cursor);
          cursor = s.components.find(c => c.id === cursor)?.layoutRelation
            ?.relativeTo;
        }
      }
      const selected = s.components.flatMap(ref => {
        const c = map.get(ref.id);
        if (!c || c.hash !== ref.hash) {
          issues.push(`component_not_offered:${ref.id}`);
          return [];
        }
        if (
          !c.roles.includes(s.role) ||
          ((c.kind === "content" || c.kind === "ornament") &&
            !c.densities.includes(s.density)) ||
          !c.aspectRatios.includes(plan.aspectRatio)
        )
          issues.push(`component_incompatible:${ref.id}`);
        return [c];
      });
      if (selected.filter(c => c.kind === "content").length !== 1)
        issues.push(`content_component_count:${slot}/${index}`);
      if (selected.filter(c => c.kind === "background").length > 1)
        issues.push(`background_component_count:${slot}/${index}`);
      const promptKeys = s.mediaPrompts.map(
        p => `${p.componentId}:${p.slotId}`
      );
      if (new Set(promptKeys).size !== promptKeys.length)
        issues.push(`duplicate_media_prompt:${slot}/${index}`);
      for (const p of s.mediaPrompts) {
        const c = selected.find(c => c.id === p.componentId),
          slots = c && ("fragment" in c ? c.fragment.mediaSlots : c.mediaSlots);
        if (!slots?.some(slot => slot.id === p.slotId))
          issues.push(`media_slot_not_offered:${p.slotId}`);
      }
    }
  }
  return Array.from(new Set(issues));
}
export function assemblyIdentity(value: unknown): string {
  const h = arsenalHash(value);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export function materializeAssemblySlide(
  plan: AssemblyPlanV1,
  slot: number,
  index: number,
  components: ComponentDefinitionV1[],
  run: {
    traceId: string;
    runId: string;
    experimental?: boolean;
    brandPalette?: z.infer<typeof assemblyDirectionV1Schema>["palette"];
    brandFonts?: { heading?: string; body?: string };
    /** Server-only, bounded reflow of authored text regions before placing media. */
    compactContentComponentId?: string;
  }
): CatalogBundleV2 {
  const variation = plan.variations[slot],
    slide = variation.slides[index],
    planHash = arsenalHash(plan),
    W = 1080,
    H = aspectRatioHeight(plan.aspectRatio, W);
  const selected = slide.components.map(
    ref => components.find(c => c.id === ref.id)!
  );
  const complete = selected.find(c => c.completeDesign);
  if (complete && (selected.length !== 1 || complete.kind !== "content" ||
    variation.direction.typographyComponentId || slide.components.some(ref => ref.placement || ref.layoutRelation)))
    throw new Error("complete_design_must_remain_whole");
  const donor = components.find(
    c => c.id === variation.direction.typographyComponentId
  );
  const pieces: Record<string, PieceDefinitionV2> = {},
    assets = new Map<string, ArsenalAsset>();
  const base: ResolvedVariantDefinitionV2 = {
    variantKey: `assembly-${slot}-${index}-${planHash.slice(0, 12)}`,
    aspectRatio: plan.aspectRatio,
    compilerVersion: ARSENAL_VARIABLE_COMPILER,
    artboard: {
      width: W,
      height: H,
      background: complete?.fragment.artboard.background ?? (run.brandPalette ?? variation.direction.palette).background,
    },
    instances: [],
    groups: [],
    bindings: [],
    relations: [],
    assetIds: [],
    capabilities: [
      "text",
      "rect",
      "line",
      "polygon",
      "media",
      "groups",
      "relations",
    ],
    intentionalOverlaps: [],
    limitations: [],
    mediaSlots: [],
  };
  const addAsset = (a: ArsenalAsset) => {
    const prior = assets.get(a.id);
    if (prior && arsenalHash(prior) !== arsenalHash(a))
      throw new Error("conflicting_component_asset");
    assets.set(a.id, a);
  };
  for (const a of donor?.assets ?? []) addAsset(a);
  const boxes = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >();
  const boxFor = (
    id: string
  ): { x: number; y: number; width: number; height: number } => {
    const cached = boxes.get(id);
    if (cached) return cached;
    const ref = slide.components.find(r => r.id === id)!;
    let box = ref.placement
      ? {
          x: ref.placement.x * W,
          y: ref.placement.y * H,
          width: ref.placement.width * W,
          height: ref.placement.height * H,
        }
      : { x: 0, y: 0, width: W, height: H };
    if (ref.layoutRelation && ref.layoutRelation.kind !== "native") {
      const anchor = boxFor(ref.layoutRelation.relativeTo!),
        gap = (ref.layoutRelation.gap ?? 0.03) * Math.min(W, H);
      if (ref.layoutRelation.kind === "overlay")
        box = ref.placement ? box : { ...anchor };
      else if (ref.layoutRelation.kind === "beside")
        box = {
          x: anchor.x + anchor.width + gap,
          y: anchor.y,
          width: ref.placement ? box.width : W - anchor.x - anchor.width - gap,
          height: ref.placement ? box.height : anchor.height,
        };
      else
        box = {
          x: anchor.x,
          y: anchor.y + anchor.height + gap,
          width: ref.placement ? box.width : anchor.width,
          height: ref.placement
            ? box.height
            : H - anchor.y - anchor.height - gap,
        };
    }
    if (
      box.width <= 0 ||
      box.height <= 0 ||
      box.x + box.width > W + 0.01 ||
      box.y + box.height > H + 0.01
    )
      throw new Error(`component_placement_out_of_bounds:${id}`);
    boxes.set(id, box);
    return box;
  };
  for (const [ci, c] of Array.from(selected.entries())) {
    if (c.kind === "typography") continue;
    const f = c.fragment,
      prefix = `c${ci}`,
      ids = new Map(
        [...f.instances, ...f.groups].map(i => [
          i.id,
          `${prefix}-${arsenalHash(i.id).slice(0, 20)}`,
        ])
      );
    const remap = (id: string) => ids.get(id) ?? id,
      root = `${prefix}-root`,
      box = boxFor(c.id);
    // Explicit media/ornament frames address the actual motif, not empty source-artboard space.
    // Native keeps the recipe geometry; pinned documents already contain their resolved geometry.
    let basis = {
      x: 0,
      y: 0,
      width: f.artboard.width,
      height: f.artboard.height,
    };
    if ((c.kind === "media" || c.kind === "ornament") && slide.components[ci].placement) {
      const corners = f.instances
        .filter(instance => c.kind === "ornament" || c.pieces[instance.pieceHash].kind === "media")
        .flatMap(instance => {
          const world = arsenalWorldGeometry(
              { ...instance, label: instance.id, scale: 1 },
              f.groups
            ),
            angle = (world.rotation * Math.PI) / 180;
          return [
            [0, 0],
            [instance.width, 0],
            [instance.width, instance.height],
            [0, instance.height],
          ].map(([x, y]) => ({
            x:
              world.x +
              world.scale * (x * Math.cos(angle) - y * Math.sin(angle)),
            y:
              world.y +
              world.scale * (x * Math.sin(angle) + y * Math.cos(angle)),
          }));
        });
      if (corners.length) {
        const x = Math.min(...corners.map(p => p.x)),
          y = Math.min(...corners.map(p => p.y));
        basis = {
          x,
          y,
          width: Math.max(...corners.map(p => p.x)) - x,
          height: Math.max(...corners.map(p => p.y)) - y,
        };
      }
    }
    const scale = Math.min(box.width / basis.width, box.height / basis.height);
    const zIndex =
      { background: 0, content: 20, typography: 0, media: 10, ornament: 40 }[
        c.kind
      ] + ci;
    base.groups.push({
      id: root,
      label: c.label,
      parentId: null,
      zIndex,
      x: box.x + (box.width - basis.width * scale) / 2 - basis.x * scale,
      y: box.y + (box.height - basis.height * scale) / 2 - basis.y * scale,
      width: f.artboard.width,
      height: f.artboard.height,
      rotation: 0,
      opacity: 1,
      scale,
    });
    const relative = slide.components[ci].layoutRelation;
    if (relative?.kind === "overlay" && relative.relativeTo) {
      const anchorIndex = slide.components.findIndex(
        c => c.id === relative.relativeTo
      );
      base.intentionalOverlaps.push([root, `c${anchorIndex}-root`]);
    }
    for (const group of f.groups)
      base.groups.push({
        ...group,
        id: remap(group.id),
        parentId: group.parentId ? remap(group.parentId) : root,
      });
    const removable = new Set(
      slide.density === "quiet"
        ? (c.removableElementIds ?? []).filter(id => {
            const node = f.instances.find(i => i.id === id);
            return (
              node && !["text", "media"].includes(c.pieces[node.pieceHash].kind)
            );
          })
        : []
    );
    for (const instance of f.instances) {
      if (removable.has(instance.id)) continue;
      let p = structuredClone(c.pieces[instance.pieceHash]);
      const palette = run.brandPalette ?? variation.direction.palette;
      const explicit =
        c.colorRoles?.[instance.id] ?? f.brandPolicy?.colors[instance.id];
      const surfaceName = `${instance.id} ${f.groups.find(g => g.id === instance.parentId)?.label ?? ""}`;
      const functionalRole =
        p.kind === "text"
          ? "text"
          : c.kind === "background"
            ? "background"
            : /shadow|sombra/i.test(surfaceName)
              ? "text"
              : /paper|papel|surface|superf[ií]cie|card|cart[aã]o|window|janela|panel|painel|container|fundo|background/i.test(
                    surfaceName
                  ) ||
                  p.fill.toLowerCase() === f.artboard.background.toLowerCase()
                ? "surface"
                : p.kind === "line" ||
                    p.kind === "polygon" ||
                    /ribbon|highlight|realce|tarja|sticker|adesivo|selo|marca|label|faixa/i.test(
                      surfaceName
                    )
                  ? "accent"
                  : "surface";
      const role =
        complete ? "preserve" : run.brandPalette && explicit === "preserve"
          ? functionalRole
          : (explicit ?? functionalRole);
      if (role !== "preserve")
        p.fill =
          role === "surface" || role === "background"
            ? palette.background
            : role === "text"
              ? palette.text
              : palette.accent;
      if (p.stroke && role !== "preserve")
        p.stroke = run.brandPalette ? palette.text : palette.accent;
      if (run.brandPalette && !complete) {
        if (p.textFragments)
          p.textFragments = p.textFragments.map(fragment => ({
            ...fragment,
            style: {
              ...fragment.style,
              ...(fragment.style.color ? { color: palette.text } : {}),
            },
          }));
        if (p.extrusion)
          p.extrusion = { ...p.extrusion, color: palette.accent };
      }
      if (p.kind === "text" && donor) {
        const binding = f.bindings.find(b => b.targetIds.includes(instance.id)),
          isHeadline =
            binding?.source === "headline" ||
            binding?.source.includes("headline");
        const match = donor.fragment.bindings.find(
          b =>
            b.kind === "text" &&
            (isHeadline
              ? b.source.includes("headline")
              : b.source.includes("body"))
        );
        const font = match
          ? donor.pieces[
              donor.fragment.instances.find(i => i.id === match.targetIds[0])!
                .pieceHash
            ]
          : Object.values(donor.pieces).find(p => p.kind === "text");
        if (font)
          p = {
            ...p,
            fontFamily: font.fontFamily,
            fontAssetId: font.fontAssetId,
            fontWeight: font.fontWeight,
          };
      }
      if (p.kind === "text" && run.brandFonts && !complete) {
        const binding = f.bindings.find(b => b.targetIds.includes(instance.id));
        const preferred = (
          binding?.source.includes("headline")
            ? run.brandFonts.heading
            : run.brandFonts.body
        )
          ?.trim()
          .toLowerCase();
        const available = [
          ...(donor?.assets ?? []),
          ...selected.flatMap(c => c.assets),
        ].filter(
          a =>
            a.family &&
            [a.family, a.sourceFamily].some(
              f => f?.trim().toLowerCase() === preferred
            )
        );
        const preferredAsset =
          available.find(a =>
            arsenalFontMatches(a, {
              fontAssetId: a.id,
              fontFamily: a.family!,
              fontWeight: p.fontWeight,
            })
          ) ?? available[0];
        if (preferredAsset) {
          p = {
            ...p,
            fontFamily: preferredAsset.family!,
            fontAssetId: preferredAsset.id,
            fontWeight: arsenalFontMatches(preferredAsset, {
              fontAssetId: preferredAsset.id,
              fontFamily: preferredAsset.family!,
              fontWeight: p.fontWeight,
            })
              ? p.fontWeight
              : (preferredAsset.weight ?? 400),
          };
          addAsset(preferredAsset);
        }
      }
      const ph = arsenalHash(p);
      pieces[ph] = p;
      base.instances.push({
        ...instance,
        id: remap(instance.id),
        parentId: instance.parentId ? remap(instance.parentId) : root,
        pieceHash: ph,
      });
    }
    for (const b of f.bindings)
      base.bindings.push({
        ...b,
        id: `${prefix}-${arsenalHash(b.id).slice(0, 20)}`,
        targetIds: b.targetIds.map(remap),
      });
    for (const relation of f.relations) {
      const outputs = relation.outputs.filter(o => !removable.has(o.targetId));
      if (outputs.length)
        base.relations.push({
          ...relation,
          id: `${prefix}-${arsenalHash(relation.id).slice(0, 20)}`,
          inputs: relation.inputs.filter(id => !removable.has(id)).map(remap),
          outputs: outputs.map(o => ({ ...o, targetId: remap(o.targetId) })),
        });
    }
    for (const pair of f.intentionalOverlaps)
      if (!pair.some(id => removable.has(id)))
        base.intentionalOverlaps.push([remap(pair[0]), remap(pair[1])]);
    if (f.lineBoxOverlaps?.length) {
      base.lineBoxOverlaps ??= [];
      base.lineBoxOverlaps.push(
        ...f.lineBoxOverlaps.map(pair => ({
          ...pair,
          a: remap(pair.a),
          b: remap(pair.b),
        }))
      );
    }
    for (const media of f.mediaSlots ?? []) {
      const prompt =
        slide.mediaPrompts.find(
          p => p.componentId === c.id && p.slotId === media.id
        )?.prompt ?? media.prompt;
      base.mediaSlots!.push({ ...media, id: remap(media.id), prompt });
    }
    for (const a of c.assets) addAsset(a);
  }
  base.assetIds = Array.from(assets.keys());
  base.bindings = complete && slide.role === "closing"
    ? bindCompleteDesignClosingContent(slide.content, base.bindings)
    : bindAssemblyContent(slide.content, base.bindings);
  if (run.compactContentComponentId) {
    const ci = selected.findIndex(c => c.id === run.compactContentComponentId && c.kind === "content" && c.source.variantKey.includes("curated-"));
    if (ci >= 0) {
      const root = `c${ci}-root`, prefix = `c${ci}-`;
      const texts = base.instances.filter(i => i.parentId === root && pieces[i.pieceHash].kind === "text").sort((a,b) => a.y-b.y || a.x-b.x);
      // Complex nested layouts retain their native relations. This reflow only
      // uses the direct text regions of the authored assembly variants.
      if (texts.length > 1 && base.instances.filter(i => i.id.startsWith(prefix) && pieces[i.pieceHash].kind === "text").length === texts.length) {
        const ids = new Set(texts.map(i => i.id));
        base.relations = base.relations.flatMap(r => {
          const outputs = r.outputs.flatMap(o => {
            const properties = ids.has(o.targetId) ? o.properties.filter(p => p !== "y") : o.properties;
            return properties.length ? [{...o,properties}] : [];
          });
          if (!outputs.length) return [];
          if (r.kind === "surfaceFit" && outputs.every(o => o.targetId.startsWith(prefix)))
            return [{...r,outputs,parameters:{...r.parameters,minHeight:1}}];
          return [{...r,outputs}];
        });
        const regions = new Map<string, typeof texts>();
        for (const text of texts) {
          const binding = base.bindings.find(b => b.targetIds.includes(text.id));
          const key = binding?.source ?? text.id;
          regions.set(key, [...(regions.get(key) ?? []), text]);
        }
        let previous: string | undefined;
        for (const [ri, region] of Array.from(Array.from(regions.values()).entries())) {
          // Separate functional regions generously enough for their surfaces,
          // while keeping authored headline fragments close to each other.
          base.relations.push({
            id:`${prefix}media-reading-flow-${ri}`,kind:"verticalFlow",version:1,enabled:true,
            inputs:[...(previous ? [previous] : []), ...region.map(i=>i.id)],
            outputs:region.map(i=>({targetId:i.id,properties:["y"]})),
            parameters:{startY:region[0].y,gap:selected[ci].fragment.artboard.height*(previous ? .07 : .008)},
          });
          previous = region.at(-1)!.id;
        }
        base.limitations.push("authored_text_spacing_compacted_for_media; fonts, copy and treatments preserved");
      }
    }
  }
  const coverage = contentCoverageIssues(slide.content, base.bindings);
  if (coverage.length) throw new Error(coverage.join(";"));
  validatePieceRelations(base, pieces, base.relations);
  const variant = arsenalVariantSchema.parse(base),
    versionId = assemblyIdentity([
      planHash,
      slot,
      index,
      "generated-component-document",
    ]),
    variantHash = arsenalHash(variant);
  const sources = selected.concat(
    donor && !selected.some(c => c.id === donor.id) ? [donor] : []
  );
  const candidate = {
    candidateId: `${versionId}:${variant.variantKey}`,
    blueprintId: assemblyIdentity(sources.map(c => c.id)),
    versionId,
    version: 1,
    definitionHash: arsenalHash({ pieces, variant }),
    variantKey: variant.variantKey,
    variantHash,
    compilerVersion: ARSENAL_VARIABLE_COMPILER,
    componentAssembly: {
      ...(complete?.completeDesign ? {completeDesign:complete.completeDesign} : {}),
      version: 1 as const,
      planHash,
      componentIds: sources.map(c => c.id),
      componentHashes: sources.map(c => c.hash),
      sourceHashes: Array.from(
        new Set(
          sources.flatMap(c =>
            c.source.kind === "recipe"
              ? [c.source.recipeHash, c.source.fileHash]
              : [c.source.definitionHash, c.source.variantHash]
          )
        )
      ),
      experimental: run.experimental ?? true,
    },
    variant,
  };
  return catalogBundleV2Schema.parse({
    schemaVersion: 2,
    traceId: run.traceId,
    runId: run.runId,
    slot,
    content: slide.content,
    contentContract: {
      version: 2,
      blocks: null,
      allowedTypes: [...contentBlockTypes],
      requiredTypes: [],
      allowedTextRoles: [...contentTextRoles],
      requiredTextRoles: [],
      listItems: null,
    },
    userContentHash: arsenalHash(slide.content),
    targetAspectRatio: plan.aspectRatio,
    selection: "llm",
    candidates: [candidate],
    pieces,
    assets: Array.from(assets.values()),
  });
}
export function materializeAssemblyPlan(
  value: unknown,
  offered: ComponentDefinitionV1[],
  run: {
    traceId: string;
    runId: string;
    experimental?: boolean;
    brandPalette?: z.infer<typeof assemblyDirectionV1Schema>["palette"];
    brandFonts?: { heading?: string; body?: string };
  }
): GenerationAssemblyBundleV1 {
  const components = offered.map(c => componentDefinitionV1Schema.parse(c)),
    plan = assemblyPlanV1Schema.parse(value);
  const errors = validateAssemblyPlan(plan, components, {
    postMode: plan.postMode,
    slideCount:
      plan.postMode === "static" ? 1 : plan.variations[0].slides.length,
  });
  if (errors.length) throw new Error(errors.join(";"));
  const planHash = arsenalHash(plan);
  return generationAssemblyBundleV1Schema.parse({
    schemaVersion: 1,
    traceId: run.traceId,
    runId: run.runId,
    planHash,
    variations: plan.variations.map((v, slot) => ({
      schemaVersion: 1,
      traceId: run.traceId,
      runId: run.runId,
      slot,
      planHash,
      direction: {
        ...v.direction,
        palette: run.brandPalette ?? v.direction.palette,
      },
      caption: v.caption,
      hashtags: v.hashtags,
      slides: v.slides.map((s, index) => ({
        id: s.id,
        role: s.role,
        density: s.density,
        bundle: materializeAssemblySlide(plan, slot, index, components, run),
      })),
    })),
  });
}
/** Explicit last resort: preserves every canonical field and carries real font/source provenance. */
export function materializeEditorialAssemblySlide(
  plan: AssemblyPlanV1,
  slot: number,
  index: number,
  components: ComponentDefinitionV1[],
  run: {
    traceId: string;
    runId: string;
    experimental?: boolean;
    brandPalette?: z.infer<typeof assemblyDirectionV1Schema>["palette"];
    brandFonts?: { heading?: string; body?: string };
  },
  reasons: string[]
): CatalogBundleV2 {
  const variation = plan.variations[slot],
    slide = variation.slides[index];
  const ids = [
    ...slide.components.map(c => c.id),
    ...(variation.direction.typographyComponentId
      ? [variation.direction.typographyComponentId]
      : []),
  ];
  const sources = components.filter(c => ids.includes(c.id));
  const fonts = sources.flatMap(c => c.assets).filter(a => Boolean(a.family));
  const preferred =
    run.brandFonts?.body?.trim().toLowerCase() ??
    run.brandFonts?.heading?.trim().toLowerCase();
  const font =
    fonts.find(a =>
      [a.family, a.sourceFamily].some(
        f => f?.trim().toLowerCase() === preferred
      )
    ) ?? fonts[0];
  if (!font) throw new Error("editorial_fallback_verified_font_absent");
  const fallback = buildArsenalFallback(
    slide.content,
    plan.aspectRatio,
    run.brandPalette ?? variation.direction.palette,
    { slot }
  );
  const mediaSources = sources.flatMap(component =>
    (component.fragment.mediaSlots ?? []).map(metadata => ({
      component,
      metadata,
      instance: component.fragment.instances.find(i => i.id === metadata.id)!,
    }))
  );
  const mediaHeight = mediaSources.length
    ? fallback.base.artboard.height * 0.32
    : 0;
  const mediaTop = fallback.base.artboard.height - 72 - mediaHeight;
  for (const relation of fallback.base.relations)
    if (relation.kind === "textFit") {
      relation.parameters.minFontSize = Math.max(
        36,
        relation.parameters.minFontSize
      );
      if (mediaSources.length)
        relation.parameters.maxHeight = Math.min(
          relation.parameters.maxHeight,
          mediaTop - 90
        );
    }
  const pieces: Record<string, PieceDefinitionV2> = {};
  const remapped = new Map<string, string>();
  for (const [oldHash, piece] of Object.entries(fallback.pieces)) {
    const isHeadline = fallback.base.bindings.some(
      b =>
        b.source.includes("headline") &&
        b.targetIds.some(id =>
          fallback.base.instances.some(
            i => i.id === id && i.pieceHash === oldHash
          )
        )
    );
    const preferredFamily = (
      isHeadline ? run.brandFonts?.heading : run.brandFonts?.body
    )
      ?.trim()
      .toLowerCase();
    const familyFont =
      fonts.find(a =>
        [a.family, a.sourceFamily].some(
          f => f?.trim().toLowerCase() === preferredFamily
        )
      ) ?? font;
    const desired = piece.fontWeight ?? font.weight ?? 400;
    const matched = fonts
      .filter(a => a.family === familyFont.family)
      .find(a =>
        arsenalFontMatches(a, {
          fontFamily: a.family!,
          fontAssetId: a.id,
          fontWeight: desired,
        })
      );
    const chosen = matched ?? familyFont;
    const next = {
      ...piece,
      fontSize: Math.max(36, piece.fontSize),
      fontFamily: chosen.family!,
      fontAssetId: chosen.id,
      fontWeight: matched ? desired : (chosen.weight ?? 400),
    };
    const nextHash = arsenalHash(next);
    pieces[nextHash] = next;
    remapped.set(oldHash, nextHash);
  }
  const assets = Array.from(new Map(fonts.map(a => [a.id, a])).values());
  const variant = arsenalVariantSchema.parse({
    ...fallback.base,
    variantKey: `editorial-${slot}-${index}`,
    instances: fallback.base.instances.map(i => ({
      ...i,
      pieceHash: remapped.get(i.pieceHash)!,
    })),
    assetIds: assets.map(a => a.id),
  });
  if (mediaSources.length) {
    variant.mediaSlots = [];
    const columns = Math.min(3, mediaSources.length),
      rows = Math.ceil(mediaSources.length / columns),
      gap = 18,
      width = (variant.artboard.width - 144 - (columns - 1) * gap) / columns,
      height = (mediaHeight - (rows - 1) * gap) / rows;
    for (const [position, item] of Array.from(mediaSources.entries())) {
      const id = `pending-media-${position}`,
        original = item.component.pieces[item.instance.pieceHash],
        mediaPiece = {
          ...original,
          stroke: run.brandPalette?.text ?? original.stroke,
          fill: run.brandPalette?.background ?? original.fill,
        };
      const pieceHash = arsenalHash(mediaPiece);
      pieces[pieceHash] = mediaPiece;
      variant.instances.push({
        id,
        pieceHash,
        parentId: null,
        zIndex: -1,
        x: 72 + (position % columns) * (width + gap),
        y: mediaTop + Math.floor(position / columns) * (height + gap),
        width,
        height,
        rotation: 0,
        opacity: 1,
      });
      variant.bindings.push({
        id: `binding-${id}`,
        label: item.metadata.label,
        kind: "media",
        source: "media.primary",
        required: false,
        targetIds: [id],
        cardinality: null,
        prefix: "",
        gap: 0,
      });
      const prompt =
        slide.mediaPrompts.find(
          p =>
            p.componentId === item.component.id && p.slotId === item.metadata.id
        )?.prompt ?? item.metadata.prompt;
      variant.mediaSlots.push({ ...item.metadata, id, prompt });
    }
    validatePieceRelations(variant, pieces, variant.relations);
  }
  const planHash = arsenalHash(plan),
    versionId = assemblyIdentity([planHash, slot, index, "editorial-fallback"]);
  const sourceHashes = Array.from(
    new Set(
      sources.flatMap(c =>
        c.source.kind === "recipe"
          ? [c.source.recipeHash, c.source.fileHash]
          : [c.source.definitionHash, c.source.variantHash]
      )
    )
  );
  return catalogBundleV2Schema.parse({
    schemaVersion: 2,
    traceId: run.traceId,
    runId: run.runId,
    slot,
    content: slide.content,
    userContentHash: arsenalHash(slide.content),
    targetAspectRatio: plan.aspectRatio,
    selection: "llm",
    contentContract: {
      version: 2,
      blocks: null,
      allowedTypes: [...contentBlockTypes],
      requiredTypes: [],
      allowedTextRoles: [...contentTextRoles],
      requiredTextRoles: [],
      listItems: null,
    },
    pieces,
    assets,
    candidates: [
      {
        candidateId: `${versionId}:${variant.variantKey}`,
        blueprintId: assemblyIdentity(ids),
        versionId,
        version: 1,
        definitionHash: arsenalHash({ pieces, variant }),
        variantKey: variant.variantKey,
        variantHash: arsenalHash(variant),
        compilerVersion: ARSENAL_VARIABLE_COMPILER,
        componentAssembly: {
          version: 1,
          planHash,
          componentIds: sources.map(c => c.id),
          componentHashes: sources.map(c => c.hash),
          sourceHashes,
          experimental: run.experimental ?? true,
          resolution: {
            kind: "editorial-fallback",
            reasons: reasons.slice(0, 48).map(s => s.slice(0, 160)),
            requestedComponentIds: slide.components.map(c => c.id),
          },
        },
        variant,
      },
    ],
  });
}
export function compositionFromAssemblyBundle(
  bundle: CatalogBundleV2
): ArsenalComposition {
  const candidate = bundle.candidates[0];
  if (!candidate) throw new Error("assembly_candidate_absent");
  const { variant, ...origin } = candidate;
  return arsenalCompositionSchema.parse({
    version: 3,
    origin,
    base: variant,
    pieces: bundle.pieces,
    assets: bundle.assets,
    content: bundle.content,
    generatedContentHash: bundle.userContentHash,
    userContentHash: bundle.userContentHash,
    contentRevision: 0,
    elements: [],
    groups: variant.groups,
    relations: variant.relations,
    overrides: {},
    richText: {},
    media: {},
    seed: 0,
    state: "applied",
    issues: [],
    layoutOrigin: "catalog-variant",
    sourceVariantKey: variant.variantKey,
    effectiveAspectRatio: variant.aspectRatio,
    projection: { scale: 1, x: 0, y: 0 },
    artboard: variant.artboard,
    authorialLayers: [],
    hiddenInstanceIds: [],
    userFonts: [],
    effects: {},
  });
}
/** Both browser and server inject verified-font measurement into the same solver. */
export function preflightAssemblyGeneration(
  value: GenerationAssemblyBundleV1,
  options: { measureText: ArsenalTextMeasurer; allowReduction?: boolean }
) {
  const generation = generationAssemblyBundleV1Schema.parse(value);
  return generation.variations.map(v => ({
    slot: v.slot,
    slides: v.slides.map(s => {
      const composition = readArsenalComposition(
        resolveArsenalGeometry(compositionFromAssemblyBundle(s.bundle), options)
      );
      return {
        id: s.id,
        role: s.role,
        density: s.density,
        composition,
        issues: composition.issues,
        pendingMedia: composition.elements
          .filter(
            e =>
              e.kind === "media" &&
              e.mediaSlot?.deferred &&
              !composition.media[e.id]
          )
          .map(e => e.id),
      };
    }),
  }));
}
