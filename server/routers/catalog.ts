import { ENV } from "../_core/env";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  readCatalogManifest,
  readCatalogSnapshot,
  versionedCatalogEnabled,
} from "../designCatalog/versionedCatalog";
import { arsenalHash } from "@shared/arsenalContent";
import { TRPCError } from "@trpc/server";
export const catalogRouter = router({
  manifest: protectedProcedure.query(async ({ ctx }) => {
    if (!versionedCatalogEnabled())
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Catálogo versionado não ativado.",
      });
    const m = await readCatalogManifest(),
      scope = ctx.user.role === "admin" ? "experimental" : "approved";
    return {
      revision: m.revision,
      formatVersion: m.formatVersion,
      projectKey: arsenalHash(ENV.supabaseUrl),
      scope,
      ownerId: ctx.user.id,
      summary: m.summary[scope],
    };
  }),
  snapshot: protectedProcedure
    .input(z.object({ revision: z.string().regex(/^\d+$/) }))
    .query(async ({ ctx, input }) => {
      if (!versionedCatalogEnabled())
        throw new TRPCError({ code: "PRECONDITION_FAILED" });
      const manifest = await readCatalogManifest();
      if (input.revision !== manifest.revision)
        throw new TRPCError({
          code: "CONFLICT",
          message: "O catálogo foi atualizado.",
        });
      const scope = ctx.user.role === "admin" ? "experimental" : "approved";
      const rows = (await readCatalogSnapshot(input.revision)).rows
        .filter(
          r =>
            r.design_components.status !== "draft" || scope === "experimental"
        )
        .map(({ component_id, definition_hash, card, design_components }) => ({
          component_id,
          definition_hash,
          card,
          design_components,
        }));
      return {
        revision: input.revision,
        formatVersion: 1 as const,
        scope,
        ownerId: ctx.user.id,
        rows,
        hash: arsenalHash(rows),
      };
    }),
});
