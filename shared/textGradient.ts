import { z } from "zod";
/** User fill on one text object. Undefined inherits; null explicitly selects solid fill. */
export const textGradientSchema = z
  .object({
    colors: z.tuple([
      z.string().regex(/^#[0-9a-f]{6}$/i),
      z.string().regex(/^#[0-9a-f]{6}$/i),
    ]),
    start: z.literal(0),
    end: z.literal(1),
  })
  .strict();
export type TextGradient = z.infer<typeof textGradientSchema>;
export const readTextGradient = (
  value: unknown
): TextGradient | null | undefined => {
  if (value === null) return null;
  const parsed = textGradientSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};
