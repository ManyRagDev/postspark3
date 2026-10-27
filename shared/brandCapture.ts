import { z } from "zod";
import { brandProjectInputSchema } from "./brandProjects";
export const brandCaptureStartSchema = z
  .object({
    url: z.string().url().max(2048),
    idempotencyKey: z.string().min(1).max(128),
    refresh: z.boolean().default(false),
  })
  .strict();
export const brandCaptureGetSchema = z
  .object({ captureId: z.string().uuid() })
  .strict();
export const brandCaptureSaveSchema = z
  .object({
    captureId: z.string().uuid(),
    idempotencyKey: z.string().min(1).max(128),
    project: brandProjectInputSchema,
  })
  .strict();
export type BrandCapturePreview = z.infer<typeof brandProjectInputSchema>;
