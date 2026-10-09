import { z } from "zod";

const id = z.string().min(1).max(80);
const coordinate = z.number().finite().min(-16000).max(16000);
export const matrixTransformSchema = z
  .object({
    x: coordinate,
    y: coordinate,
    rotationDeg: z.number().finite().min(-360).max(360),
  })
  .strict();
export const matrixMediaAssetSchema = z
  .object({
    dataUrl: z
      .string()
      .max(8_000_000)
      .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    width: z.number().int().min(64).max(1600),
    height: z.number().int().min(64).max(1600),
  })
  .strict();

/** Private laboratory matrix. Resolved drawing stays in scene; bindings guide explicit adaptations. */
export const designMatrixSchema = z
  .object({
    version: z.literal(1),
    groups: z
      .array(
        z
          .object({
            id,
            label: z.string().min(1).max(100),
            transform: matrixTransformSchema,
            members: z
              .array(matrixTransformSchema.extend({ layerId: id }))
              .min(1)
              .max(100),
          })
          .strict()
      )
      .min(1)
      .max(20),
    fields: z
      .array(
        z
          .object({
            id,
            label: z.string().min(1).max(100),
            kind: z.enum(["text", "list"]),
            groupId: id,
            layerIds: z.array(id).min(1).max(12),
            baseFontSizes: z.array(z.number().min(1).max(2000)).min(1).max(12),
            minScale: z.number().min(0.5).max(1),
            prefix: z.string().max(12),
          })
          .strict()
      )
      .min(1)
      .max(30),
    media: z
      .array(
        z
          .object({
            id,
            label: z.string().min(1).max(100),
            groupId: id,
            layerId: id,
            fit: z.literal("cover"),
            positionX: z.number().min(0).max(1),
            positionY: z.number().min(0).max(1),
            asset: matrixMediaAssetSchema.nullable(),
          })
          .strict()
      )
      .max(4),
    lastCompilation: z
      .object({
        at: z.string().datetime(),
        status: z.enum(["applied", "adapted"]),
        resizedFields: z.array(id).max(30),
        changedGroups: z.array(id).max(20),
        changedFields: z.array(id).max(30),
        filledMedia: z.array(id).max(4),
      })
      .strict()
      .optional(),
  })
  .strict();
export type DesignMatrix = z.infer<typeof designMatrixSchema>;
export type MatrixMediaAsset = z.infer<typeof matrixMediaAssetSchema>;
export type MatrixTransform = z.infer<typeof matrixTransformSchema>;
export const MATRIX_RENDERER_VERSION = "admin2-konva-3";
