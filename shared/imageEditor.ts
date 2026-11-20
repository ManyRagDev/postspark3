import { z } from "zod";

export const IMAGE_EDITOR_MAX_BYTES = 8 * 1024 * 1024;
export const IMAGE_EDITOR_MAX_DIMENSION = 3840;
export const IMAGE_EDITOR_MAX_PIXELS = 3840 * 3840;
export const IMAGE_EDITOR_TIMEOUT_MS = 90_000;
const unit = z.number().finite().min(0).max(1);
const polygon = z
  .array(z.tuple([unit, unit]))
  .min(3)
  .max(128)
  .refine(points => {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const next = points[(i + 1) % points.length];
      area += points[i][0] * next[1] - next[0] * points[i][1];
    }
    return Math.abs(area) > 0.00001;
  }, "Desenhe um contorno com área válida.");
export const imageEditOperationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("adjust"),
      brightness: z.number().finite().min(-150).max(150),
      contrast: z.number().finite().min(-50).max(100),
      saturation: z.number().finite().min(-100).max(100),
    })
    .strict(),
  z
    .object({
      kind: z.literal("crop"),
      x: unit,
      y: unit,
      width: unit.positive(),
      height: unit.positive(),
    })
    .strict()
    .refine(
      v => v.x + v.width <= 1.000001 && v.y + v.height <= 1.000001,
      "Mantenha o recorte dentro da imagem."
    ),
  z
    .object({
      kind: z.literal("resize"),
      width: z.number().int().min(1).max(IMAGE_EDITOR_MAX_DIMENSION),
      height: z.number().int().min(1).max(IMAGE_EDITOR_MAX_DIMENSION),
    })
    .strict(),
  z.object({ kind: z.literal("trim") }).strict(),
  z.object({ kind: z.literal("black-white") }).strict(),
  z
    .object({
      kind: z.literal("duotone"),
      dark: z.string().regex(/^#[0-9a-f]{6}$/i),
      light: z.string().regex(/^#[0-9a-f]{6}$/i),
    })
    .strict(),
  z
    .object({
      kind: z.literal("shadows-highlights"),
      shadows: z.number().finite().min(0).max(50),
      highlights: z.number().finite().min(0).max(40),
    })
    .strict(),
  z
    .object({
      kind: z.literal("look"),
      preset: z.enum(["warm", "teal-orange"]),
    })
    .strict(),
  z.object({ kind: z.literal("iris") }).strict(),
  z
    .object({
      kind: z.literal("grain"),
      amount: z.number().finite().min(0.5).max(3),
    })
    .strict(),
  z
    .object({
      kind: z.literal("mask"),
      points: polygon,
      feather: z.number().finite().min(0).max(32),
    })
    .strict(),
  z
    .object({
      kind: z.literal("blur"),
      points: polygon,
      feather: z.number().finite().min(0).max(32),
      radius: z.number().finite().min(0.5).max(30),
    })
    .strict(),
]);
export type ImageEditOperation = z.infer<typeof imageEditOperationSchema>;
export const imageEditFormatSchema = z.enum(["png", "webp"]);
export const imageEditDataSchema = z
  .string()
  .min(1)
  .max(12 * 1024 * 1024);
export const imageEditInputSchema = z
  .object({
    requestId: z.string().uuid(),
    imageData: imageEditDataSchema,
    operation: imageEditOperationSchema,
    format: imageEditFormatSchema,
  })
  .strict();
export type ImageEditInput = z.infer<typeof imageEditInputSchema>;
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const imageEditDimensionsSchema = z
  .object({
    width: z.number().int().positive().max(IMAGE_EDITOR_MAX_DIMENSION),
    height: z.number().int().positive().max(IMAGE_EDITOR_MAX_DIMENSION),
  })
  .strict();
export const imageEditResultSchema = z
  .object({
    requestId: z.string().uuid(),
    imageData: imageEditDataSchema,
    sourceSha256: sha256,
    resultSha256: sha256,
    sourceDimensions: imageEditDimensionsSchema,
    resultDimensions: imageEditDimensionsSchema,
    format: imageEditFormatSchema,
  })
  .strict();
export type ImageEditResult = z.infer<typeof imageEditResultSchema>;
export const imageEditPublishSchema = imageEditInputSchema
  .extend({ result: imageEditResultSchema })
  .strict();
const ownedUrl = z
  .string()
  .regex(/^\/api\/post-media\/[a-f0-9-]{36}\/[a-f0-9]{64}$/i);
export const imageEditAssetSchema = z
  .object({
    version: z.literal(1),
    originalUrl: ownedUrl,
    inputUrl: ownedUrl,
    resultUrl: ownedUrl,
    originalFocal: z.object({ x: unit, y: unit }).strict().optional(),
    operation: imageEditOperationSchema,
    sourceDimensions: imageEditDimensionsSchema,
    resultDimensions: imageEditDimensionsSchema,
  })
  .strict();
export const imageEditAssetsSchema = z
  .record(ownedUrl, imageEditAssetSchema)
  .refine(
    value =>
      Object.keys(value).length <= 64 &&
      Object.entries(value).every(([key, entry]) => key === entry.resultUrl)
  );
export type ImageEditAsset = z.infer<typeof imageEditAssetSchema>;

export const IMAGE_EDITOR_TOOLS = [
  { kind: "adjust", label: "Ajustes" },
  { kind: "crop", label: "Recortar" },
  { kind: "resize", label: "Dimensões" },
  { kind: "mask", label: "Máscara" },
  { kind: "blur", label: "Desfocar" },
  { kind: "trim", label: "Limpar bordas" },
  { kind: "black-white", label: "Preto e branco" },
  { kind: "duotone", label: "Duotone", maxDimension: 2048 },
  { kind: "shadows-highlights", label: "Sombras e realces" },
  { kind: "look", label: "Looks" },
  { kind: "iris", label: "Centro nítido" },
  { kind: "grain", label: "Granulação", maxDimension: 2048 },
] as const;

export function imageEditorToolsForGroups(
  core: boolean,
  finishing: boolean,
  iris = false
) {
  return IMAGE_EDITOR_TOOLS.filter(tool =>
    tool.kind === "iris"
      ? iris && finishing
      : ["black-white", "duotone", "shadows-highlights"].includes(tool.kind)
        ? core
        : ["look", "iris", "grain"].includes(tool.kind)
          ? finishing
          : true
  );
}
