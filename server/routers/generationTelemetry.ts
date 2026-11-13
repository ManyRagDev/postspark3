import { generationTelemetryBatchSchema } from "@shared/generationTelemetry";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";

export const generationTelemetryRouter = router({
  record: protectedProcedure.input(generationTelemetryBatchSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    if (!db) return { accepted: 0 };
    // SQL checks request AND proposal ownership. Do not retrieve full generations.
    const { data, error } = await db.schema("postspark").rpc("generation_record_telemetry", { p_owner: ctx.user.id, p_events: input.events });
    return { accepted: error ? 0 : Number(data ?? 0) };
  }),
});
