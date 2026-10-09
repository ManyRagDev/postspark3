import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { analyzeDesignReference } from "../designDnaAnalyzer";
import { searchOpenFontCatalog } from "../fontCatalog";
import { decodeRecreation } from "../designRecreation";
import { StructuredOutputError } from "../_core/llm";

export const designDnaRouter = router({
  decodeRecreation: adminProcedure
    .input(z.object({ imageDataUrl: z.string().max(12_000_000) }).strict())
    .mutation(async ({ input }) => {
      try {
        return await decodeRecreation(input.imageDataUrl);
      } catch (error) {
        if (error instanceof StructuredOutputError) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message:
              error.failureType === "truncated"
                ? "A resposta da IA atingiu o limite antes de completar a composição. Nenhuma receita parcial foi salva. Você pode tentar decodificar novamente; isso faz uma nova chamada de IA."
                : "A IA não retornou uma receita válida. Nenhuma receita parcial foi salva. Você pode tentar decodificar novamente; isso faz uma nova chamada de IA.",
            cause: error,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Não foi possível decodificar: ${error instanceof Error ? error.message : "falha na análise"}`,
        });
      }
    }),
  searchFonts: adminProcedure
    .input(
      z.object({
        query: z.string().trim().min(2).max(80),
        category: z
          .enum(["sans-serif", "serif", "display", "monospace", "handwriting"])
          .optional(),
      })
    )
    .query(({ input }) => searchOpenFontCatalog(input.query, input.category)),
  analyze: adminProcedure
    .input(
      z.object({
        imageDataUrl: z
          .string()
          .max(12_000_000)
          .refine(
            value => /^data:image\/(png|jpeg|webp);base64,/i.test(value),
            "Envie uma imagem PNG, JPEG ou WebP válida."
          ),
        categoryHint: z.string().trim().max(120).optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await analyzeDesignReference(input);
      } catch (error) {
        console.error("[designDna.analyze] analysis failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? `Não foi possível analisar a referência: ${error.message}`
              : "Não foi possível analisar a referência.",
        });
      }
    }),
});
