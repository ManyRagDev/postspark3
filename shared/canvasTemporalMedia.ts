import { z } from "zod";

const assetId = z.string().uuid();
const seconds = z.number().finite().nonnegative();
const playback = {
  muted: z.boolean().optional(),
  volume: z.number().min(0).max(1).optional(),
  start: seconds.optional(),
  trimIn: seconds.optional(),
  trimOut: seconds.positive().optional(),
};
export const canvasTemporalSourceSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("video"), assetId, ...playback }).strict(),
    z
      .object({
        kind: z.literal("mare"),
        assetId,
        projectId: z.string().uuid(),
        revisionId: z.string().uuid(),
        scope: z.enum(["composition", "montage"]),
        compositionId: z.string().min(1).max(200).optional(),
        ...playback,
      })
      .strict(),
  ])
  .superRefine((source, ctx) => {
    if (source.trimOut !== undefined && source.trimOut <= (source.trimIn ?? 0))
      ctx.addIssue({
        code: "custom",
        message: "O fim do trecho precisa vir depois do início.",
      });
    if (
      source.kind === "mare" &&
      source.scope === "composition" &&
      !source.compositionId
    )
      ctx.addIssue({ code: "custom", message: "Composição Maré ausente." });
  });
export const canvasTemporalMediaSchema = z.record(
  z.string().min(1).max(200),
  canvasTemporalSourceSchema
);
export type CanvasTemporalSource = z.infer<typeof canvasTemporalSourceSchema>;
export type CanvasTemporalMedia = z.infer<typeof canvasTemporalMediaSchema>;

export function temporalInterval(
  source: CanvasTemporalSource,
  duration: number
) {
  const start = source.start ?? 0;
  const from = source.trimIn ?? 0;
  const to = Math.min(source.trimOut ?? duration, duration);
  return { start, from, to, end: start + Math.max(0, to - from) };
}
