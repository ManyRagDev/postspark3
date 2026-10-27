import { z } from "zod";
/** Purpose survives admission, retries and context normalization. */
export const generationSourceSchema = z
  .object({
    id: z.string().min(1).max(80),
    kind: z.enum(["url", "image"]),
    purpose: z.enum(["content", "visual_reference"]),
    value: z.string().min(1).max(12_000_000),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.kind === "url" && !/^https?:\/\//i.test(s.value))
      ctx.addIssue({ code: "custom", message: "URL HTTP/HTTPS obrigatória" });
  });
export type GenerationSource = z.infer<typeof generationSourceSchema>;
export const brandCaptureMetadataSchema = z
  .object({
    version: z.literal(1),
    captureId: z.string().uuid(),
    sourceUrl: z.string().url(),
    capturedAt: z.string(),
    warnings: z.array(z.string().max(2000)).max(100),
    inferredFields: z.array(z.string()).max(30),
  })
  .strict();
export const capturedVisualPreferencesSchema = z
  .object({
    colors: z.array(z.string().max(40)).max(20),
    fonts: z.array(z.string().max(200)).max(20),
    personality: z.array(z.string().max(300)).max(30),
    composition: z.string().max(4000),
  })
  .strict();
/** A URL followed by instructions is text containing a source, not a capture request. */
export function isStandaloneHttpUrl(value: string) {
  const text = value.trim();
  if (!text || /\s/.test(text)) return false;
  try {
    return ["http:", "https:"].includes(new URL(text).protocol);
  } catch {
    return false;
  }
}
