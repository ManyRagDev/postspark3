import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { storedAspectRatios } from "@shared/aspectRatios";
import { protectedProcedure, router } from "./_core/trpc";
import { rpcCall } from "./billing";

const trialState = z.object({
  requestId: z.string().uuid().nullable(),
  draft: z.record(z.string(), z.unknown()).nullable(),
  finalized: z.record(z.string(), z.unknown()).nullable(),
});

export function startPilotMemberLimit() {
  const limit = Number(process.env.POSTSPARK_START_PILOT_MAX_MEMBERS);
  return Number.isSafeInteger(limit) && limit > 0 ? limit : 0;
}

export async function enrollStartPilot(userId: string) {
  const { data, error } = await rpcCall<boolean>("start_pilot_enroll", {
    p_user_id: userId, p_seats: startPilotMemberLimit(),
  });
  if (error) throw new Error("START enrollment unavailable");
  return { enrolled: data === true };
}

const startModel = z.object({
  id: z.string().min(1),
  aspectRatio: z.enum(storedAspectRatios),
  slides: z.array(z.object({ id: z.string().min(1) }).passthrough()).min(1).max(10),
  provenance: z.object({ journey: z.object({ requestId: z.string().uuid() }).passthrough() }).passthrough(),
}).passthrough();

export const startPilotRouter = router({
  state: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await rpcCall<unknown>("start_pilot_state", { p_user_id: ctx.user.id });
    if (error) throw new Error("START project unavailable");
    return trialState.nullable().parse(data);
  }),
  save: protectedProcedure.input(z.object({ model: startModel, finalize: z.boolean() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.access !== "start")
      throw new TRPCError({ code: "FORBIDDEN", message: "Salve pelo fluxo do seu plano." });
    if (Buffer.byteLength(JSON.stringify(input.model), "utf8") > 2_000_000)
      throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Esta peça excede o tamanho disponível para o START." });
    const { data, error } = await rpcCall<unknown>("start_pilot_save_piece", {
      p_user_id: ctx.user.id,
      p_request_id: input.model.provenance.journey.requestId,
      p_model: input.model,
      p_finalize: input.finalize,
    });
    if (error) throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível salvar a peça do START." });
    return startModel.parse(data);
  }),
});
