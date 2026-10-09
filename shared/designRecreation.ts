import { z } from "zod";
import { referenceSceneSchema } from "./referenceReconstruction";
import { designMatrixSchema, MATRIX_RENDERER_VERSION } from "./designMatrix";

export const RECREATION_RENDERER_VERSION = "admin2-konva-2";
export const recreationLayerStyleSchema = z
  .object({
    layerId: z.string().min(1).max(80),
    cornerRadiusPx: z.number().min(0).max(2000),
    fit: z.enum(["preserve", "fill"]),
  })
  .strict();
export type RecreationLayerStyle = z.infer<typeof recreationLayerStyleSchema>;
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const recreationBoxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .strict();
const common = {
  id: z.string().min(1).max(80),
  role: z.string().min(1).max(80),
  box: recreationBoxSchema,
  color,
  rotationDeg: z.number().min(-360).max(360),
};
const outline = z
  .object({ color, widthPx: z.number().min(0).max(40) })
  .strict()
  .nullable();
const textLayer = z
  .object({
    ...common,
    kind: z.literal("text"),
    text: z.string().min(1).max(1200),
    font: z
      .object({
        family: z.string().min(1).max(120),
        weight: z.number().int().min(100).max(900),
        sizePx: z.number().min(1).max(2000),
        letterSpacingPx: z.number().min(-50).max(100),
      })
      .strict(),
    align: z.enum(["left", "center", "right"]),
    outline,
    fit: z.enum(["preserve", "fill"]),
    extrusion: z
      .object({
        color,
        xPx: z.number().min(-500).max(500),
        yPx: z.number().min(-500).max(500),
      })
      .strict()
      .nullable(),
    arc: z
      .object({
        centerX: z.number().min(0).max(1),
        centerY: z.number().min(0).max(1),
        radius: z.number().positive().max(1),
        startAngleDeg: z.number().min(-360).max(360),
        clockwise: z.boolean(),
      })
      .strict()
      .nullable(),
  })
  .strict();
const rectLayer = z
  .object({
    ...common,
    kind: z.literal("rect"),
    outline,
    cornerRadiusPx: z.number().min(0).max(2000),
  })
  .strict();
const pathLayer = z
  .object({
    ...common,
    kind: z.enum(["line", "polygon"]),
    outline,
    points: z.array(z.number().min(0).max(1)).min(4).max(80),
  })
  .strict();

export const recreationMissingSchema = z
  .object({
    description: z.string().min(1).max(240),
    reason: z.string().min(1).max(240),
    box: recreationBoxSchema.nullable(),
    role: z
      .enum(["hero", "background", "decoration", "texture", "logo"])
      .optional(),
    essential: z.boolean().optional(),
  })
  .strict();

/** Contrato da única chamada vision: somente o necessário para desenhar e declarar lacunas. */
export const recreationExtractionSchema = z
  .object({
    title: z.string().min(1).max(120),
    background: color,
    layers: z.array(z.union([textLayer, rectLayer, pathLayer])).max(60),
    missingElements: z
      .array(
        recreationMissingSchema.extend({
          role: z.enum(["hero", "background", "decoration", "texture", "logo"]),
          essential: z.boolean(),
        })
      )
      .max(20),
    notes: z.array(z.string().max(240)).max(20),
  })
  .strict();
export type RecreationExtraction = z.infer<typeof recreationExtractionSchema>;

export const recreationRecipeSchema = z
  .object({
    format: z.literal("postspark.admin2.recipe"),
    version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    id: z.string().min(1).max(80),
    title: z.string().min(1).max(120),
    createdAt: z.string().datetime(),
    model: z.string().min(1).max(160),
    provider: z.string().max(160).nullable(),
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
      })
      .strict(),
    scene: referenceSceneSchema,
    missingElements: z.array(recreationMissingSchema).max(20),
    notes: z.array(z.string().max(500)).max(200),
    adaptation: z
      .object({
        parentRecipeId: z.string().min(1).max(80).nullable(),
        layerStyles: z.array(recreationLayerStyleSchema).max(100),
      })
      .strict()
      .optional(),
    matrix: designMatrixSchema.optional(),
  })
  .strict()
  .superRefine((recipe, ctx) => {
    if (
      recipe.scene.rendererVersion !==
        (recipe.version === 1
          ? "admin2-konva-1"
          : recipe.version === 3
            ? MATRIX_RENDERER_VERSION
            : RECREATION_RENDERER_VERSION) ||
      (recipe.version >= 2 && !recipe.adaptation) ||
      (recipe.version === 1 && recipe.adaptation) ||
      (recipe.version === 3) !== Boolean(recipe.matrix)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["scene", "rendererVersion"],
        message: "Versão de renderização incompatível com /admin2.",
      });
    }
    const ids = new Set<string>();
    for (const [index, layer] of Array.from(recipe.scene.layers.entries())) {
      if (ids.has(layer.id) || layer.width <= 0 || layer.height <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ["scene", "layers", index],
          message: "Camada duplicada ou sem dimensões positivas.",
        });
      }
      ids.add(layer.id);
      if (
        (layer.kind === "text" || layer.kind === "arcText") &&
        (!layer.text || !layer.fontFamily)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["scene", "layers", index],
          message: "Texto precisa de transcrição e de uma fonte escolhida.",
        });
      }
      if (layer.kind === "arcText" && !layer.arc) {
        ctx.addIssue({
          code: "custom",
          path: ["scene", "layers", index],
          message: "Arco sem geometria.",
        });
      }
      if (
        (layer.kind === "line" || layer.kind === "polygon") &&
        (layer.points.length % 2 !== 0 ||
          layer.points.length < (layer.kind === "polygon" ? 6 : 4))
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["scene", "layers", index],
          message: "Caminho precisa de pares x,y válidos.",
        });
      }
    }
    const styledIds = new Set<string>();
    for (const style of recipe.adaptation?.layerStyles ?? []) {
      if (!ids.has(style.layerId) || styledIds.has(style.layerId)) {
        ctx.addIssue({
          code: "custom",
          path: ["adaptation", "layerStyles"],
          message: "Estilo sem camada correspondente ou duplicado.",
        });
      }
      styledIds.add(style.layerId);
    }
    for (const [index, font] of Array.from(recipe.scene.fonts.entries())) {
      if (
        font.dataUrl &&
        (!/^data:font\/(woff2?|ttf|otf);base64,[A-Za-z0-9+/]+=*$/.test(
          font.dataUrl
        ) ||
          !font.sha256)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["scene", "fonts", index],
          message: "Fonte incorporada precisa de base64 e SHA-256 válidos.",
        });
      }
    }
    if (recipe.matrix) {
      const issue = (message: string) =>
        ctx.addIssue({ code: "custom", path: ["matrix"], message });
      const groups = new Map(recipe.matrix.groups.map(g => [g.id, g]));
      if (groups.size !== recipe.matrix.groups.length)
        issue("Grupos precisam de IDs distintos.");
      const members = new Set<string>();
      for (const g of recipe.matrix.groups)
        for (const member of g.members) {
          if (!ids.has(member.layerId) || members.has(member.layerId))
            issue("Cada camada deve pertencer a um único grupo válido.");
          if (
            recipe.scene.layers.find(l => l.id === member.layerId)?.kind ===
            "arcText"
          )
            issue("Texto em arco ainda não pode integrar grupos da matriz.");
          members.add(member.layerId);
        }
      const bound = new Set<string>(),
        slotIds = new Set<string>();
      for (const f of recipe.matrix.fields) {
        if (slotIds.has(f.id)) issue("Campos precisam de IDs distintos.");
        slotIds.add(f.id);
        if (
          f.layerIds.length !== f.baseFontSizes.length ||
          (f.kind === "text" && f.layerIds.length !== 1)
        )
          issue("Campo com métricas incompatíveis.");
        for (const layerId of f.layerIds) {
          if (
            bound.has(layerId) ||
            recipe.scene.layers.find(l => l.id === layerId)?.kind !== "text" ||
            !groups.get(f.groupId)?.members.some(m => m.layerId === layerId)
          )
            issue(
              "Campo de texto sem camada/grupo correspondente ou duplicado."
            );
          bound.add(layerId);
        }
      }
      for (const m of recipe.matrix.media) {
        if (
          slotIds.has(m.id) ||
          bound.has(m.layerId) ||
          recipe.scene.layers.find(l => l.id === m.layerId)?.kind !== "rect" ||
          !groups
            .get(m.groupId)
            ?.members.some(member => member.layerId === m.layerId)
        )
          issue("Área de mídia sem retângulo/grupo válido ou duplicada.");
        slotIds.add(m.id);
        bound.add(m.layerId);
      }
    }
  });
export type RecreationRecipe = z.infer<typeof recreationRecipeSchema>;
