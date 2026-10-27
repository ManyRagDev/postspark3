import { brandCaptureStartSchema,brandCaptureGetSchema,brandCaptureSaveSchema } from "@shared/brandCapture";
import { startCapture,readCapture,saveCapture,publicCapture } from "../brandCapture";
import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { brandProjectInputSchema, compileProjectDossier } from "@shared/brandProjects";
import {
  getBrandProjectsByUser,
  getBrandProjectById,
  upsertBrandProject,
  deleteBrandProject,
} from "../db";

export const brandProjectsRouter = router({
  captureStart:protectedProcedure.input(brandCaptureStartSchema).mutation(async({ctx,input})=>{try{return publicCapture(await startCapture(ctx.user.id,input));}catch(e){const error=e as {code?:string;message?:string};throw new TRPCError({code:error.code==="PT429"?"TOO_MANY_REQUESTS":"BAD_REQUEST",message:error.message??"Não foi possível iniciar a captura."});}}),
  captureGet:protectedProcedure.input(brandCaptureGetSchema).query(async({ctx,input})=>{const c=await readCapture(input.captureId,ctx.user.id);if(!c)throw new TRPCError({code:"NOT_FOUND",message:"Captura não encontrada."});return publicCapture(c);}),
  captureSave:protectedProcedure.input(brandCaptureSaveSchema).mutation(async({ctx,input})=>({success:true,project:await saveCapture(ctx.user.id,input)})),
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
        capture:p.capture,visualPreferences:p.visual_preferences,
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
          capture:project.capture,visualPreferences:project.visual_preferences,
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
            capture:saved.capture,visualPreferences:saved.visual_preferences,
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
