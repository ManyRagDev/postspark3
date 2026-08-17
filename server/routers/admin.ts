import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getSupabase } from "../billing";
import { getGenerationOperationalMetrics } from "../db";
import { ENV } from "../_core/env";

export const adminRouter = router({
    /**
     * List all user profiles for administrative management.
     * Protected by RBAC (role: 'admin')
     */
    listProfiles: adminProcedure.query(async () => {
        const sb = getSupabase();
        const { data, error } = await sb
            .schema("postspark")
            .from("profiles")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: `Erro ao buscar perfis: ${error.message}`,
            });
        }

        return data;
    }),

    /**
     * Get basic growth stats (Total users, Active plans)
     */
    getStats: adminProcedure.query(async () => {
        const sb = getSupabase();

        // Count total from postspark.profiles
        const { count, error } = await sb
            .schema("postspark")
            .from("profiles")
            .select("*", { count: "exact", head: true });

        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

        return {
            totalUsers: count || 0,
        };
    }),

    getGenerationMetrics: adminProcedure
        .input(z.object({
            windowDays: z.number().int().min(1).max(90).default(7),
        }).optional())
        .query(async ({ input }) => {
            return getGenerationOperationalMetrics(input?.windowDays ?? 7);
        }),

    getAiRollout: adminProcedure.query(() => ({
        siteIntelligence: ENV.aiSiteIntelligenceEnabled,
        llmJudge: ENV.aiLlmJudgeEnabled,
        semanticEmbeddings: ENV.aiSemanticEmbeddingsEnabled,
        modelFallback: ENV.aiModelFallbackEnabled,
        traceStoresContent: ENV.aiTraceStoreContent,
        uiDebug: ENV.aiUiDebugEnabled,
    })),
});
