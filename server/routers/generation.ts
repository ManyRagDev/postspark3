import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { hasFormatMismatch } from "@shared/formatIntent";
import {
  getBillingProfile,
  reserveSparks,
  refundSparkReservation,
  calculateV5SparkReservation,
  settleV5GenerationReservation,
  getReservationByIdempotencyKey,
  isBillingDisabled,
} from "../billing";
import { createGenerationStore } from "../ai/workflows/generationStore";
import { resolveProposalMediaReferences } from "../ai/workflows/proposalMedia";
import {
  generationV5Enabled,
  requestInputHash,
  requestSnapshot,
} from "../ai/workflows/generationRuntime";

async function eligible(email: string | undefined | null) {
  if (!generationV5Enabled()) return false;
  const profile = email ? await getBillingProfile(email) : null;
  return profile?.plan === "DEV";
}

export const generationRouter = router({
  capabilities: protectedProcedure.query(async ({ ctx }) => {
    if (!generationV5Enabled())
      return {
        ownerId: ctx.user.id,
        selectable: false,
        enabled: false as const,
        contractVersion: 5 as const,
        reason: "pilot_disabled",
      };
    if (!(await eligible(ctx.user.email)))
      return {
        ownerId: ctx.user.id,
        selectable: false,
        enabled: false as const,
        contractVersion: 5 as const,
        reason: "dev_account_required",
      };
    try {
      const available = await createGenerationStore().isAvailable();
      return {
        ownerId: ctx.user.id,
        selectable: true,
        enabled: available,
        contractVersion: 5 as const,
        reason: available ? "ready" : "durable_worker_required",
      };
    } catch {
      return {
        ownerId: ctx.user.id,
        selectable: true,
        enabled: false as const,
        contractVersion: 5 as const,
        reason: "durable_worker_required",
      };
    }
  }),
  start: protectedProcedure
    .input(orchestratedGenerationInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.ownerId !== ctx.user.id)
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Este pedido pertence a outra sessão. Inicie uma nova geração nesta conta.",
        });
      if (!(await eligible(ctx.user.email)))
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "A geração orquestrada está disponível somente no piloto DEV.",
        });
      if (input.includeDraftDesigns && ctx.user.role !== "admin")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Designs em rascunho exigem acesso administrativo.",
        });
      if (
        !input.formatIntentConfirmed &&
        hasFormatMismatch(input.content, input.postMode)
      )
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Confirme o formato do post antes de gerar.",
        });
      const references = Array.from(
        new Set(
          [
            input.imageUrl,
            input.executionBrief?.brandInput?.referenceImageUrl,
            input.executionBrief?.brandInput?.logoUrl,
          ].filter((v): v is string => Boolean(v))
        )
      );
      try {
        await resolveProposalMediaReferences(
          references.map(ref =>
            ref.startsWith("data:") ? { dataUri: ref } : { url: ref }
          ),
          ctx.user.id,
          undefined,
          {}
        );
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Não foi possível validar a imagem ou o logo. Use PNG, JPEG ou WebP válido enviado à sua biblioteca privada.",
          cause: error,
        });
      }
      const store = createGenerationStore();
      if (!(await store.isAvailable()))
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "O executor persistente de geração está indisponível. Nenhuma geração foi iniciada.",
        });
      const email = ctx.user.email ?? "dev@local.dev";
      const profile = await getBillingProfile(email);
      const { totalReservation } = calculateV5SparkReservation(input.postMode, 3);
      const reservation = await reserveSparks(
        profile,
        totalReservation,
        input.idempotencyKey,
        `Geração V5 (${input.postMode})`
      );
      if (!reservation.reservationId) {
        throw new TRPCError({
          code: "PAYMENT_REQUIRED",
          message: "Sparks insuficientes. Faça upgrade ou adquira um pacote de recarga.",
        });
      }
      try {
        const admitted = await store.admission({
          ownerId: ctx.user.id,
          idempotencyKey: input.idempotencyKey,
          inputHash: requestInputHash(input),
          input,
          experimental: input.includeDraftDesigns,
          deadlineAt: Date.now() + 600000,
        });
        return {
          snapshot: requestSnapshot(admitted.record),
          created: admitted.created,
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Não foi possível iniciar a geração";
        if (message.toLowerCase().includes("idempotency"))
          throw new TRPCError({
            code: "CONFLICT",
            message: "Esta chave já foi utilizada para outro pedido.",
          });
        if (reservation.reservationId && reservation.reservationId !== "dev-mock") {
          await refundSparkReservation(
            reservation.reservationId,
            `Admissão persistente falhou: ${message}`
          ).catch(() => undefined);
        }
        if (message.toLowerCase().includes("active generation limit"))
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message:
              "Aguarde seus pedidos em andamento antes de iniciar outro.",
          });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Não foi possível registrar a geração persistente.",
          cause: error,
        });
      }
    }),
  get: protectedProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const record = await createGenerationStore().get(
        input.requestId,
        ctx.user.id
      );
      if (!record)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Geração não encontrada.",
        });
      return {
        snapshot: requestSnapshot(record),
        errorReason: record.errorReason,
        input: {
          inputType: record.input.inputType,
          content: record.input.content,
          postMode: record.input.postMode,
          executionBrief: record.input.executionBrief
            ? { rawInput: record.input.executionBrief.rawInput }
            : undefined,
        },
      };
    }),
  cancel: protectedProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const record = await createGenerationStore().cancel(
        input.requestId,
        ctx.user.id
      );
      if (!record)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Geração não encontrada.",
        });
      const readyCount = record.proposals.filter(p => p.status === "ready").length;
      const res = await getReservationByIdempotencyKey(record.ownerId, record.input.idempotencyKey).catch(() => null);
      const reservationId = res?.id ?? (isBillingDisabled() ? "dev-mock" : null);
      if (reservationId) {
        await settleV5GenerationReservation({
          reservationId,
          postMode: record.input.postMode ?? "static",
          deliveredReadyCount: readyCount,
          totalProposalsCount: 3,
          generationRunId: record.id,
        }).catch(() => undefined);
      }
      return { snapshot: requestSnapshot(record) };
    }),
});
