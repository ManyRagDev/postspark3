import { z } from "zod";

export const GENERATION_TELEMETRY_BATCH_SIZE = 20;
export const GENERATION_TELEMETRY_MAX_BYTES = 8192;
export const generationTelemetryEventSchema = z.object({
  eventId: z.string().uuid(),
  exposureId: z.string().uuid(),
  requestId: z.string().uuid(),
  proposalId: z.string().min(1).max(160),
  revision: z.number().int().min(0),
  kind: z.enum(["exposure", "choice", "edit", "save", "reopen", "export_png", "export_zip"]),
  position: z.number().int().min(0).max(99).optional(),
  changes: z.number().int().min(1).max(1000).optional(),
}).strict();
export const generationTelemetryBatchSchema = z.object({
  events: z.array(generationTelemetryEventSchema).min(1).max(GENERATION_TELEMETRY_BATCH_SIZE),
}).strict().refine(value => new TextEncoder().encode(JSON.stringify(value)).length <= GENERATION_TELEMETRY_MAX_BYTES, "Telemetry payload too large");
export type GenerationTelemetryEvent = z.infer<typeof generationTelemetryEventSchema>;
export type GenerationJourneyIdentity = Pick<GenerationTelemetryEvent, "requestId" | "proposalId" | "revision">;
