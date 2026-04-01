import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getSupabase } from "../billing";

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
});
