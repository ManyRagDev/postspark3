import { ENV } from "../_core/env";
import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import {
  readCatalogManifest,
  readCatalogSnapshot,
  versionedCatalogEnabled,
} from "../designCatalog/versionedCatalog";
import { arsenalHash } from "@shared/arsenalContent";
import { TRPCError } from "@trpc/server";
import { localCatalogRevisionOverride } from "../designCatalog/localCatalogOverride";
import { acervo82FamilyDirectory } from "@shared/acervo82Directory";
import { componentCardV1Schema } from "@shared/componentAssembly";
import { acervo82ReviewEnabled, listAcervo82Review, openAcervo82Review } from "../designCatalog/acervo82Review";
import type { CatalogRow } from "../designCatalog/versionedCatalog";
const familyProjection=(rows:CatalogRow[],scope:string)=>acervo82FamilyDirectory(rows.flatMap(row=>{
  if(row.design_components.status==='archived'||(row.design_components.status==='draft'&&scope!=='experimental'))return [];
  const card=componentCardV1Schema.safeParse(row.card);
  return card.success?[card.data]:[];
}));
export const catalogRouter = router({
  acervo82Review: adminProcedure.query(listAcervo82Review),
  openAcervo82Review: adminProcedure.input(z.object({id:z.string().max(40),mode:z.enum(["static","compose","literal","pilot"]).optional()})).mutation(({ctx,input})=>openAcervo82Review(input.id,ctx.user.id,input.mode)),
  acervo82Directory: protectedProcedure.query(async ({ctx})=>{
    if(!acervo82ReviewEnabled()||!versionedCatalogEnabled()||ctx.user.role!=='admin')return null;
    const revision=localCatalogRevisionOverride();
    if(!revision)return null;
    const scope='experimental';
    return {revision,families:familyProjection((await readCatalogSnapshot(revision)).rows,scope)};
  }),
  manifest: protectedProcedure.query(async ({ ctx }) => {
    if (!versionedCatalogEnabled())
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Catálogo versionado não ativado.",
      });
    const m = await readCatalogManifest(localCatalogRevisionOverride()),
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
      // Match generation.capabilities: Studio downloads this snapshot before
      // admission, including a server-selected development staging revision.
      const manifest = await readCatalogManifest(localCatalogRevisionOverride());
      if (input.revision !== manifest.revision)
        throw new TRPCError({
          code: "CONFLICT",
          message: "O catálogo foi atualizado.",
        });
      const scope = ctx.user.role === "admin" ? "experimental" : "approved";
      const rows = (await readCatalogSnapshot(input.revision)).rows
        .filter(
          r =>
            r.design_components.status !== "archived" && (r.design_components.status !== "draft" || scope === "experimental")
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
        families: familyProjection(rows, scope),
        hash: arsenalHash(rows),
      };
    }),
});
