import { brandCaptureStartSchema,brandCaptureGetSchema,brandCaptureSaveSchema } from "@shared/brandCapture";
import { startCapture,readCapture,saveCapture,publicCapture } from "../brandCapture";
import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { saveVisualIdentitySchema } from "@shared/visualIdentity";
import { cachedVisualIdentity, manualVisualIdentity, identityFromDesignKit, markExtractedIdentity } from "../visualIdentity";
import { capturedProjectPalette, sameIdentityKit } from "@shared/projectIdentityExtraction";
import { loadOwnedMediaReference } from "../mediaAssets";
import { brandProjectInputSchema, compileProjectDossier } from "@shared/brandProjects";
import { requireProfessionalStudio } from "../studioAccess";
import { getImpersonatedPlan } from "../_core/planImpersonation";
import {
  getDb,
  getBrandProjectsByUser,
  getBrandProjectById,
  upsertBrandProject,
  deleteBrandProject,
  saveBrandProjectIdentity,
  saveExtractedProjectIdentity,
} from "../db";

const brandCaptureProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await requireProfessionalStudio(ctx.user, "A captura de marca por URL");
  return next();
});

// Real accounts also have a transactional SQL quota. During impersonation the
// database keeps the operator's real plan, so check the selected tier here.
async function checkSimulatedBrandLimit(owner: string, id?: string) {
  if (getImpersonatedPlan(owner) !== "SOLO") return;
  const ownedBrands = () => getDb().from("brand_projects").select("id").eq("user_uuid", owner);
  if (id) {
    const existing = await ownedBrands().eq("id", id).maybeSingle();
    if (existing.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível conferir suas marcas." });
    if (existing.data) return;
  }
  const first = await ownedBrands().limit(1);
  if (first.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível conferir suas marcas." });
  if (first.data?.length) throw new TRPCError({ code: "FORBIDDEN", message: "O plano Solo permite uma marca." });
}

export const brandProjectsRouter = router({
  extractIdentity: protectedProcedure.input(z.object({
    id: z.string().uuid(), postIds: z.array(z.number().int().positive()).min(1).max(5),
  })).mutation(async ({ ctx, input }) => {
    const project = await getBrandProjectById(input.id, ctx.user.id);
    if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto indisponível." });
    const kit = capturedProjectPalette(project.visual_preferences);
    if (!kit || !project.visual_preferences || kit.postIds.join() !== input.postIds.join())
      throw new TRPCError({ code: "CONFLICT", message: "Os modelos do projeto mudaram. Reabra a lista para extrair a identidade." });
    if (project.visual_identity && sameIdentityKit(project.visual_identity, kit.postIds))
      return { id: project.id, visualIdentity: project.visual_identity };
    const identity = identityFromDesignKit(project.visual_preferences, kit, project.visual_identity);
    const saved = await saveExtractedProjectIdentity(ctx.user.id, project, identity);
    if (saved?.visual_identity) return { id: saved.id, visualIdentity: saved.visual_identity };
    const latest = await getBrandProjectById(input.id, ctx.user.id);
    if (latest?.visual_identity && sameIdentityKit(latest.visual_identity, kit.postIds))
      return { id: latest.id, visualIdentity: latest.visual_identity };
    throw new TRPCError({ code: "CONFLICT", message: "O projeto mudou durante a extração. Reabra a identidade visual e tente novamente." });
  }),
  saveIdentity: protectedProcedure.input(saveVisualIdentitySchema).mutation(async ({ ctx, input }) => {
    const id = input.id ?? input.creationId;
    await checkSimulatedBrandLimit(ctx.user.id, id);
    const existing = id ? await getBrandProjectById(id, ctx.user.id) : undefined;
    if (input.id && !existing) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado nesta conta." });
    if (input.logoUrl) await loadOwnedMediaReference(input.logoUrl, ctx.user.id);
    const previous = existing?.visual_identity;
    const interpreted = previous?.extractedFrom && previous.description === input.description
      ? { ...previous, logoUrl: input.logoUrl }
      : ctx.user.access === "start"
      ? manualVisualIdentity(input.description, input.logoUrl)
      : await cachedVisualIdentity(ctx.user.id, input.description, input.logoUrl, existing?.visual_identity);
    const visualIdentity = previous?.extractedFrom
      ? markExtractedIdentity({ ...interpreted, rules: {
          ...interpreted.rules,
          colors: interpreted.rules.colors.length ? interpreted.rules.colors : previous.rules.colors,
          background: interpreted.rules.background ?? previous.rules.background,
          text: interpreted.rules.text ?? previous.rules.text,
          accent: interpreted.rules.accent ?? previous.rules.accent,
        } }, previous.extractedFrom.postIds)
      : interpreted;
    const saved = await saveBrandProjectIdentity(ctx.user.id, { id, name: input.name, visualIdentity });
    return { id: saved.id, visualIdentity: saved.visual_identity! };
  }),
  captureStart:brandCaptureProcedure.input(brandCaptureStartSchema).mutation(async({ctx,input})=>{try{return publicCapture(await startCapture(ctx.user.id,input));}catch(e){const error=e as {code?:string;message?:string};throw new TRPCError({code:error.code==="PT429"?"TOO_MANY_REQUESTS":"BAD_REQUEST",message:error.message??"Não foi possível iniciar a captura."});}}),
  captureGet:brandCaptureProcedure.input(brandCaptureGetSchema).query(async({ctx,input})=>{const c=await readCapture(input.captureId,ctx.user.id);if(!c)throw new TRPCError({code:"NOT_FOUND",message:"Captura não encontrada."});return publicCapture(c);}),
  captureSave:brandCaptureProcedure.input(brandCaptureSaveSchema).mutation(async({ctx,input})=>({success:true,project:await saveCapture(ctx.user.id,input)})),
  /**
   * Lista todos os projetos do usuário logado.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    try {
      const projects = await getBrandProjectsByUser(ctx.user.id);
      return projects.map((p) => ({
        id: p.id,
        name: p.name,
        niche: p.niche,
        sourceType: p.source_type,
        capture:p.capture,visualPreferences:p.visual_preferences,visualIdentity:p.visual_identity ?? undefined,
        structuredData: p.structured_data,
        compiledDocument: p.compiled_document,
        isDefault: p.is_default,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      }));
    } catch (error) {
      console.error("[brandProjects.list] Erro ao listar projetos:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Não foi possível carregar os projetos de marca.",
        cause: error,
      });
    }
  }),

  /**
   * Obtém detalhes de um projeto específico.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        const project = await getBrandProjectById(input.id, ctx.user.id);
        if (!project) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Projeto não encontrado ou acesso não autorizado.",
          });
        }
        return {
          id: project.id,
          name: project.name,
          niche: project.niche,
          sourceType: project.source_type,
          capture:project.capture,visualPreferences:project.visual_preferences,visualIdentity:project.visual_identity ?? undefined,
          structuredData: project.structured_data,
          compiledDocument: project.compiled_document,
          isDefault: project.is_default,
          createdAt: project.created_at,
          updatedAt: project.updated_at,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao carregar o projeto.",
          cause: error,
        });
      }
    }),

  /**
   * Cria ou atualiza um projeto de marca.
   */
  upsert: protectedProcedure
    .input(brandProjectInputSchema)
    .mutation(async ({ ctx, input }) => {
      await checkSimulatedBrandLimit(ctx.user.id, input.id);
      try {
        // Se compiledDocument não foi informado ou está vazio, compila a partir dos dados estruturados
        const compiledDoc =
          input.compiledDocument?.trim() ||
          compileProjectDossier(input.name, input.niche, input.structuredData);

        const saved = await upsertBrandProject({
          id: input.id,
          userUuid: ctx.user.id,
          name: input.name,
          niche: input.niche,
          sourceType: input.sourceType,
          capture:input.capture,visualPreferences:input.visualPreferences,
          structuredData: input.structuredData,
          compiledDocument: compiledDoc,
          isDefault: input.isDefault,
        });

        return {
          success: true,
          project: {
            id: saved.id,
            name: saved.name,
            niche: saved.niche,
            sourceType: saved.source_type,
            capture:saved.capture,visualPreferences:saved.visual_preferences,visualIdentity:saved.visual_identity ?? undefined,
            structuredData: saved.structured_data,
            compiledDocument: saved.compiled_document,
            isDefault: saved.is_default,
            createdAt: saved.created_at,
            updatedAt: saved.updated_at,
          },
        };
      } catch (error: any) {
        console.error("[brandProjects.upsert] Erro ao salvar projeto:", error);
        const errMsg = error?.message || "";
        const isTableMissing =
          errMsg.includes("brand_projects") &&
          (errMsg.includes("does not exist") || errMsg.includes("could not find") || errMsg.includes("42P01"));

        const userMessage = isTableMissing
          ? "Tabela postspark.brand_projects não encontrada no Supabase. É necessário rodar a migration drizzle/0039_brand_projects.sql no Supabase SQL Editor."
          : errMsg
            ? `Não foi possível salvar o projeto: ${errMsg}`
            : "Não foi possível salvar o projeto.";

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: userMessage,
          cause: error,
        });
      }
    }),

  /**
   * Remove um projeto de marca pertencente ao usuário.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await deleteBrandProject(input.id, ctx.user.id);
        return { success: true };
      } catch (error) {
        console.error("[brandProjects.delete] Erro ao excluir projeto:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Não foi possível excluir o projeto.",
          cause: error,
        });
      }
    }),
});
