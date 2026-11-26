import { z } from "zod";

const dimension = z.number().positive().finite().max(100000);
const key = z.string().min(1).max(200);
const layer = z.object({
  kind: z.enum(["text", "image", "rect", "ellipse"]),
  name: z.string().max(200),
  x: z.number().finite(),
  y: z.number().finite(),
  width: dimension,
  height: dimension,
  rotation: z.number().finite().optional(),
  opacity: z.number().min(0).max(1).optional(),
  text: z
    .string()
    .max(2000, "O Maré aceita até 2000 caracteres por camada de texto.")
    .optional(),
  url: z
    .string()
    .regex(
      /^(?:\/(?:api\/post-media|arsenal\/images|backgrounds|designs|images)\/|data:image\/(?:png|jpeg|webp);base64,)/
    )
    .max(2000000)
    .optional(),
  color: z.string().max(80).optional(),
  fontSize: dimension.optional(),
  fontFamily: z.string().max(80).optional(),
  fontWeight: z.number().int().min(100).max(900).optional(),
  italic: z.boolean().optional(),
  align: z.enum(["left", "center", "right"]).optional(),
});
export const mareSelectionSchema = z.object({
  elementIds: z
    .array(key)
    .min(1)
    .max(64, "O Maré aceita até 64 camadas por composição."),
  sourceComposition: z.object({
    name: z.string().max(200),
    width: dimension,
    height: dimension,
    layers: z
      .array(layer)
      .min(1)
      .max(64, "O Maré aceita até 64 camadas por composição."),
  }),
});
export const mareSelectionsSchema = z.record(key, mareSelectionSchema);
export type MareSelection = z.infer<typeof mareSelectionSchema>;
export type MareLayer = z.infer<typeof layer>;
