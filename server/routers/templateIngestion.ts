import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { decodeRecreation } from "../designRecreation";
import { StructuredOutputError } from "../_core/llm";
import { captureScreenshot } from "../screenshotService";
import { publicUrl } from "../publicUrl";
import { searchOpenFontCatalog } from "../fontCatalog";
import { createPost, getBrandProjectById, upsertBrandProject } from "../db";
import {
  designExtractionSchema,
  dnaToVisualPreferences,
  sanitizeForCatalog,
} from "@shared/designExtraction";
import { extractDesignFromScreenshot, extractDesignFromUrl } from "../designExtraction";
import { validateInputImage } from "../referenceImageInput";
import { adminProcedure } from "../_core/trpc";
import { authorizeArsenalSaveModel, validateArsenalSaveModel } from "../designCatalog/arsenalSave";
import { compressPostPayload } from "../lib/imageCompress";
import { normalizeCanvasMediaPayload } from "../mediaAssets";

const saveTemplateInput = z.object({
  title: z.string().trim().min(1).max(120),
  canvasModel: z.any().superRefine((value, ctx) => {
    try {
      validateArsenalSaveModel(value);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Composição inválida",
      });
    }
  }),
  previewDataUrl: z.string().optional(),
});

async function persistTemplatePost(
  userId: string,
  title: string,
  canvasModel: any,
  previewDataUrl?: string
) {
  await authorizeArsenalSaveModel(canvasModel, userId);
  const headline = typeof canvasModel?.headline === "string" ? canvasModel.headline : "";
  const subtext = typeof canvasModel?.subtext === "string" ? canvasModel.subtext : "";
  const payload = {
    inputType: "image" as const,
    inputContent: `Template Ingerido: ${title}`,
    platform: "instagram" as const,
    headline,
    body: subtext,
    layout: "centered" as const,
    postMode: "static" as const,
    slides: [{ headline, body: subtext, slideNumber: 1 }],
    canvasModel,
    galleryPreview: previewDataUrl,
    userUuid: userId,
  };
  const normalized = await normalizeCanvasMediaPayload(payload, userId);
  const compressed = await compressPostPayload(normalized);
  const postId = await createPost({ ...compressed, userUuid: userId });
  return { id: postId };
}

export const templateIngestionRouter = router({
  ingestFromImage: protectedProcedure
    .input(
      z.object({
        imageDataUrl: z
          .string()
          .max(15_000_000)
          .refine(
            value => /^data:image\/(png|jpeg|webp);base64,/i.test(value),
            "Envie uma imagem PNG, JPEG ou WebP válida em formato data URL."
          ),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const recipe = await decodeRecreation(input.imageDataUrl);
        return {
          recipe,
          previewDataUrl: input.imageDataUrl,
        };
      } catch (error) {
        console.error("[templateIngestion.ingestFromImage] Error:", error);
        if (error instanceof StructuredOutputError) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message:
              error.failureType === "truncated"
                ? "A análise visual atingiu o limite de tokens antes de finalizar. Tente novamente ou use uma imagem mais focada na composição principal."
                : "A IA não conseguiu decodificar a hierarquia do layout. Tente novamente com outra referência.",
            cause: error,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Falha na análise da imagem.",
        });
      }
    }),

  ingestFromUrl: protectedProcedure
    .input(
      z.object({
        url: z.string().trim().url("Informe uma URL válida com http:// ou https://"),
        viewport: z.enum(["desktop", "mobile"]).optional().default("desktop"),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await publicUrl(input.url);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `URL inacessível ou restrita: ${error instanceof Error ? error.message : "endereço inválido"}`,
        });
      }

      console.log(`[templateIngestion.ingestFromUrl] Capturing screenshot for ${input.url} (${input.viewport})`);
      const screenshotBuffer = await captureScreenshot(input.url, input.viewport);

      if (!screenshotBuffer) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "O serviço de captura visual (VPS) não conseguiu renderizar a página. Verifique se o site está online e permite visualização pública.",
        });
      }

      const base64 = Buffer.from(screenshotBuffer).toString("base64");
      const imageDataUrl = `data:image/png;base64,${base64}`;

      try {
        const recipe = await decodeRecreation(imageDataUrl);
        return {
          recipe,
          previewDataUrl: imageDataUrl,
        };
      } catch (error) {
        console.error("[templateIngestion.ingestFromUrl] Error during recreation decode:", error);
        if (error instanceof StructuredOutputError) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: "A captura foi obtida com sucesso, mas a IA não conseguiu decodificar o layout. Tente novamente.",
            cause: error,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Falha na engenharia reversa visual da captura.",
        });
      }
    }),

  searchFonts: publicProcedure
    .input(
      z.object({
        query: z.string().trim().min(2).max(80),
        category: z.enum(["sans-serif", "serif", "display", "monospace", "handwriting"]).optional(),
      })
    )
    .query(({ input }) => searchOpenFontCatalog(input.query, input.category)),

  saveAsTemplate: protectedProcedure
    .input(saveTemplateInput)
    .mutation(async ({ input, ctx }) => {
      try {
        return await persistTemplatePost(ctx.user.id, input.title, input.canvasModel, input.previewDataUrl);
      } catch (error) {
        console.error("[templateIngestion.saveAsTemplate] Error saving post:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Não foi possível salvar o template na sua biblioteca.",
        });
      }
    }),

  /**
   * Extrai DNA visual + intenções de post. O resultado é privado do usuário:
   * nada aqui toca o catálogo global.
   */
  extractDesign: protectedProcedure
    .input(
      z
        .object({
          projectId: z.string().uuid(),
          url: z.string().trim().url().optional(),
          imageDataUrl: z
            .string()
            .max(15_000_000)
            .refine(v => /^data:image\/(png|jpeg|webp);base64,/i.test(v), "Envie PNG, JPEG ou WebP.")
            .optional(),
          viewport: z.enum(["desktop", "mobile"]).default("desktop"),
        })
        .refine(v => Boolean(v.url) !== Boolean(v.imageDataUrl), "Informe uma URL ou uma imagem.")
    )
    .mutation(async ({ input, ctx }) => {
      const project = await getBrandProjectById(input.projectId, ctx.user.id);
      if (!project) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Projeto não encontrado ou sem acesso." });
      }
      try {
        if (input.url) {
          try {
            await publicUrl(input.url);
          } catch (error) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `URL inacessível ou restrita: ${error instanceof Error ? error.message : "endereço inválido"}`,
            });
          }
          const result = await extractDesignFromUrl(input.url, input.viewport);
          return {
            extraction: result.extraction,
            previewDataUrl: result.previewDataUrl,
            sourceUrl: result.sourceUrl,
            fontsDetected: result.evidence.fonts,
          };
        }
        await validateInputImage(input.imageDataUrl!);
        const extraction = await extractDesignFromScreenshot({
          imageDataUrl: input.imageDataUrl!,
          sourceUrl: null,
          evidence: { fonts: [], colors: [] },
        });
        return { extraction, previewDataUrl: input.imageDataUrl!, sourceUrl: null, fontsDetected: [] as string[] };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("[templateIngestion.extractDesign] Error:", error);
        if (error instanceof StructuredOutputError) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: "A IA não conseguiu interpretar o design desta referência. Tente novamente.",
            cause: error,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Falha na extração de design.",
        });
      }
    }),

  /**
   * Destino privado: o DNA vira a identidade visual do projeto do próprio usuário e
   * as peças aprovadas vão para a biblioteca dele. O dono vem sempre da sessão.
   */
  saveExtractionToProject: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        extraction: designExtractionSchema,
        posts: z.array(saveTemplateInput).max(5),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const project = await getBrandProjectById(input.projectId, ctx.user.id);
      if (!project) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Projeto não encontrado ou sem acesso." });
      }
      try {
        const postIds: number[] = [];
        for (const post of input.posts) {
          const saved = await persistTemplatePost(ctx.user.id, post.title, post.canvasModel, post.previewDataUrl);
          postIds.push(saved.id);
        }
        const visualPreferences = dnaToVisualPreferences(input.extraction);
        visualPreferences.composition = JSON.stringify({ ...JSON.parse(visualPreferences.composition), postIds });
        await upsertBrandProject({
          id: project.id,
          userUuid: ctx.user.id,
          name: project.name,
          niche: project.niche,
          sourceType: project.source_type,
          structuredData: project.structured_data,
          compiledDocument: project.compiled_document,
          isDefault: project.is_default,
          visualPreferences,
        });
        return { projectId: project.id, postIds };
      } catch (error) {
        console.error("[templateIngestion.saveExtractionToProject] Error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Não foi possível salvar a extração no projeto.",
        });
      }
    }),

  /**
   * Somente admin: mostra exatamente o que entraria como família original
   * (marca removida, textos viram slots). Não publica nada.
   */
  previewOriginalFamilyDraft: adminProcedure
    .input(z.object({ extraction: designExtractionSchema }))
    .mutation(({ input }) => ({ sanitized: sanitizeForCatalog(input.extraction) })),
});
