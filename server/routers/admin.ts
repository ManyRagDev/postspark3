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

    getMareMetrics: adminProcedure.query(async () => {
        const db=getSupabase();
        const [ops,storage]=await Promise.all([db.rpc("mare_operational_summary",{p_days:7}),db.rpc("mare_media_summary")]);
        if(ops.error || storage.error) throw new TRPCError({code:"INTERNAL_SERVER_ERROR",message:"Métricas Maré indisponíveis."});
        return {
            operations: ops.data as Array<{operation:string; jobs:number; delivered:number; pending:number; failed:number; charged_sparks:number; provider_cost_usd:number|null; measured_jobs:number; p95_seconds:number|null}>,
            storage:storage.data[0] as {asset_bytes:number;proxied_bytes:number;signed_reads:number}
        };
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
