/**
 * Privacy Router - LGPD Compliance
 *
 * Endpoints para direitos dos titulares conforme LGPD:
 * - getMyData: Acesso aos dados
 * - exportData: Portabilidade
 * - requestDeletion: Eliminação
 * - updateConsent: Gestão de consentimento
 *
 * @module routers/privacy
 */

import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import {
  exportUserData,
  getUserDataStats,
  softDeleteUser,
  cancelDeletion
} from "../_core/gdpr";
import {
  logConsentGiven,
  logConsentRevoked
} from "../_core/privacyLog";

export const privacyRouter = router({
  /**
   * Obtém estatísticas dos dados do usuário
   * Para visão geral na página de privacidade
   */
  getMyData: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    const stats = await getUserDataStats(userId);

    return stats;
  }),

  /**
   * Exporta todos os dados do usuário em formato JSON
   * Conforme Art. 18, V da LGPD (portabilidade)
   */
  exportData: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;

    const data = await exportUserData(userId);

    return data;
  }),

  /**
   * Solicita exclusão da conta e dados
   * Conforme Art. 18, III da LGPD (eliminação)
   *
   * Inicia soft delete com período de reflexão de 30 dias
   */
  requestDeletion: protectedProcedure
    .input(
      z.object({
        mode: z.enum(["anonymize", "delete"]).default("anonymize")
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { mode } = input;

      const result = await softDeleteUser(userId, mode);

      return {
        success: true,
        scheduledFor: result.scheduledAt,
        message: "Solicitação recebida. Seus dados serão excluídos em 30 dias. " +
                 "Você pode cancelar entrando em contato com suporte@postspark.com"
      };
    }),

  /**
   * Cancela solicitação de exclusão (dentro do período de reflexão)
   */
  cancelDeletion: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;

    await cancelDeletion(userId);

    return {
      success: true,
      message: "Solicitação de exclusão cancelada. Sua conta permanece ativa."
    };
  }),

  /**
   * Atualiza preferências de consentimento
   */
  updateConsent: protectedProcedure
    .input(
      z.object({
        aiImprovements: z.boolean()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { aiImprovements } = input;

      // Log mudança de consentimento
      if (aiImprovements) {
        await logConsentGiven(userId, "1.0", true);
      } else {
        await logConsentRevoked(userId, ["aiImprovements"]);
      }

      // Atualizar no banco se houver tabela de consentimentos
      // Por enquanto, apenas logar

      return {
        success: true,
        message: "Preferências atualizadas."
      };
    }),

  /**
   * Obtém logs de privacidade do usuário
   */
  getLogs: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50)
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { limit } = input;

      const { getPrivacyLogs } = await import("../_core/privacyLog");

      const logs = await getPrivacyLogs(userId, limit);

      return logs;
    })
});
