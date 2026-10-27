import { legacyCapture } from "./brandCapture";
import {catalogRouter} from "./routers/catalog";
import { executionBriefSchema } from "../shared/generationRequest";
import { validateArsenalSaveModel, authorizeArsenalSaveModel } from "./designCatalog/arsenalSave";
import type { retrieveArsenalForGeneration } from "./designCatalog/arsenalRetrieval";
import { generationRouter } from "./routers/generation";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { invokeLLM } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { imagePostContextSchema } from "@shared/imageGeneration";
import { getUserPostSummaries, createBackgroundAsset, createPost, getBrandKitByUser, getGenerationRunById, getPostById, getUserBackgroundAssets, getUserGenerationRuns, getUserPosts, updatePost } from "./db";
import { storagePut } from "./storage";
import { analyzeBrandFromUrl, generateCardThemeVariations } from "./chameleon";
import { generateBackgroundImage } from "./imageGenerateBackground";
import { extractStyleFromUrlWithMeta } from "./styleExtractor";
import { analyzeDesignPattern, generateThemesFromPatterns } from "./designPatternAnalyzer";
import { evaluatePostQuality } from "./postJudge";
import type { SiteIntelligence } from "@shared/postspark";
import { analyzeSiteIntelligence, loadSiteIntelligence, siteIntelligenceToPrompt } from "./siteIntelligence";
import { scrapeUrl as scrapeSiteUrl } from "./siteContent";
import { extractBrandDNA } from "./brandDNA";
import * as fs from "fs";
import * as path from "path";
import { getBillingProfile, debitSparks, deriveIdempotencyKey, reserveSparks, commitSparkReservation, refundSparkReservation, getTopupPackages, createSubscriptionCheckout, createTopupCheckout, getSubscriptionPriceId, rpcCall, SPARK_COSTS } from "./billing";
import { ENV } from "./_core/env";
import { appendOperationalLog } from "./_core/operationalLog";
import { TRPCError } from "@trpc/server";
import { compressPostPayload } from "./lib/imageCompress";
import { normalizeCanvasMediaPayload, saveUserMediaAsset } from "./mediaAssets";
import { buildGenerationDebugTrace, recordGenerationEvent, startGenerationTrace } from "./ai/generationTrace";
import { safeJsonParse } from "./ai/llmJson";
import {
  advancedLayoutSettingsSchema,
  backgroundValueSchema,
  bgOverlaySettingsSchema,
  carouselSlideSchema,
  copyAngleSchema,
  imageSettingsSchema,
  inputTypeSchema,
  platformSchema,
  postLayoutSchema,
  postModeSchema,
  postVisualSnapshotSchema,
  textElementSchema,
} from "@shared/postsparkSchemas";



function decodeDataUrl(dataUrl: string): {
  buffer: Buffer;
  contentType: string;
  extension: string;
} {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid data URL");
  }

  const contentType = match[1];
  const base64 = match[2];
  const extension = contentType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  return {
    buffer: Buffer.from(base64, "base64"),
    contentType,
    extension,
  };
}

const PLAN_SAVE_LIMIT_MESSAGES: Record<string, string> = {
  FREE: "No plano gratuito, você pode salvar até 5 posts. Faça upgrade para manter sua biblioteca completa.",
  PRO: "Seu plano PRO permite salvar até 100 posts. Exclua itens antigos ou faça upgrade para continuar salvando.",
  AGENCY: "Seu plano AGENCY permite salvar até 500 posts. Exclua itens antigos ou fale com o suporte para ampliar a capacidade.",
  LITE: "Seu plano LITE permite salvar até 20 posts. Faça upgrade para ampliar sua biblioteca.",
};

function resolveSaveLimitMessage(plan: string | null | undefined): string {
  return PLAN_SAVE_LIMIT_MESSAGES[plan || ""] || "Você atingiu o limite de posts salvos do seu plano. Exclua itens antigos ou faça upgrade para continuar.";
}

// ─── Billing router ───────────────────────────────────────────────────────────
const billingRouter = router({
  /** Retorna perfil de billing do usuário logado (plano, sparks, etc.) */
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const email = ctx.user.email ?? "dev@local.dev";
    return getBillingProfile(email);
  }),

  /** Inicia trial de 7 dias (anti-abuso por e-mail + IP) */
  startTrial: protectedProcedure
    .input(
      z.object({
        plan: z.enum(["PRO", "AGENCY"]).default("PRO"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const email = ctx.user.email ?? "";
      const ip = (ctx.req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? ctx.req.socket.remoteAddress ?? "0.0.0.0";

      if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
        return { success: true, reason: "ok" };
      }

      const profile = await getBillingProfile(email);
      if (profile.id === "no-profile" || profile.id === "error" || profile.id === "dev-mock") {
        return { success: false, reason: "profile_not_found" };
      }

      const { data, error } = await rpcCall<{ success: boolean; reason: string }>("start_trial", {
        p_user_id: profile.id,
        p_email: email,
        p_ip_address: ip,
        p_plan: input.plan,
      });

      if (error) return { success: false, reason: error.message };
      return data ?? { success: false, reason: "unknown" };
    }),

  /** Cria Stripe Checkout Session para assinatura */
  createCheckout: protectedProcedure
    .input(
      z.object({
        plan: z.enum(["PRO", "AGENCY"]),
        cycle: z.enum(["monthly", "annual"]).default("monthly"),
        successPath: z.string().default("/billing/success"),
        cancelPath: z.string().default("/pricing"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const email = ctx.user.email ?? "";
      const name = ctx.user.name ?? undefined;

      const profile = await getBillingProfile(email);
      if (profile.id === "no-profile" || profile.id === "error") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Perfil de billing não encontrado.",
        });
      }

      const host = `${ctx.req.protocol}://${ctx.req.get("host")}`;
      const priceId = getSubscriptionPriceId(input.plan, input.cycle);
      const url = await createSubscriptionCheckout({
        profileId: profile.id,
        email,
        name,
        priceId,
        successUrl: `${host}${input.successPath}`,
        cancelUrl: `${host}${input.cancelPath}`,
      });

      return { url };
    }),

  /** Lista pacotes de top-up ativos */
  getTopupPackages: publicProcedure.query(async () => {
    return getTopupPackages();
  }),

  /** Cria Stripe Checkout Session para top-up avulso */
  createTopupCheckout: protectedProcedure
    .input(
      z.object({
        packageId: z.string(),
        successPath: z.string().default("/billing/topup-success"),
        cancelPath: z.string().default("/billing"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const email = ctx.user.email ?? "";
      const name = ctx.user.name ?? undefined;

      const packages = await getTopupPackages();
      const pkg = packages.find(p => p.id === input.packageId);
      if (!pkg)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pacote não encontrado.",
        });

      const profile = await getBillingProfile(email);
      if (profile.id === "no-profile" || profile.id === "error") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Perfil de billing não encontrado.",
        });
      }

      const host = `${ctx.req.protocol}://${ctx.req.get("host")}`;
      const url = await createTopupCheckout({
        profileId: profile.id,
        email,
        name,
        priceId: pkg.stripe_price_id,
        packageId: pkg.id,
        successUrl: `${host}${input.successPath}`,
        cancelUrl: `${host}${input.cancelPath}`,
      });

      return { url };
    }),
});

import { adminRouter } from "./routers/admin";
import { designCatalogRouter } from "./routers/designCatalog";
import { retrieveCatalog } from "./designCatalog/retrieval";
import { designDnaRouter } from "./routers/designDna";
import { privacyRouter } from "./routers/privacy";
import { brandProjectsRouter } from "./routers/brandProjects";

export const appRouter = router({
  generation: generationRouter,
  catalog: catalogRouter,
  system: systemRouter,
  billing: billingRouter,
  admin: adminRouter,
  designDna: designDnaRouter,
  designCatalog: designCatalogRouter,
  privacy: privacyRouter,
  brandProjects: brandProjectsRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  /** Etapa 4 §9.5 — Carrega a síntese de Brand Kit do usuário logado */
  brandKit: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      try {
        const kit = await getBrandKitByUser(ctx.user.id);
        return kit ?? null;
      } catch (err) {
        console.warn("[brandKit.get] Falha ao carregar brand kit:", err);
        return null;
      }
    }),
  }),

  post: router({
    /** Generate 3 post variations from user input */
    generate: protectedProcedure
      .input(
        z.object({
          inputType: z.enum(["text", "url", "image"]),
          content: z.string().min(1),
          platform: z.enum(["instagram", "twitter", "linkedin", "facebook"]),
          imageUrl: z.string().optional(),
          tone: z.string().optional(),
          postMode: z.enum(["static", "carousel"]).default("static"),
          formatIntentConfirmed: z.boolean().optional(),
          designContractVersion: z.union([z.literal(2),z.literal(3),z.literal(4)]).optional(),
          assemblyPilot: z.boolean().optional(),
          includeDraftDesigns: z.boolean().optional(),
          slideCount: z.number().int().min(2).max(10).optional(),
          aspectRatio: z.enum(["1:1", "4:5", "9:16"]).optional(),
          model: z.enum(["gemini", "llama"]).optional(),
          creationMode: z.enum(["ideation", "execution"]).default("ideation"),
          executionBrief: executionBriefSchema.optional(),
          siteIntelligenceId: z.string().uuid().optional(),
          idempotencyKey: z.string().min(1).max(128).optional(),
          debug: z.boolean().optional(),
        })
      )
      .mutation(async (): Promise<{
        variations: import("@shared/postspark").PostVariation[];
        generationRunId: string;
        debug?: ReturnType<typeof buildGenerationDebugTrace>;
        arsenalAvailability?: Awaited<ReturnType<typeof retrieveArsenalForGeneration>>["availability"];
      }> => {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Esta entrada de geração foi substituída. Abra o Studio e use generation.start para iniciar e acompanhar suas três propostas.",
        });
      }),

    /** Generate only on explicit user action; commit after owner-private media delivery. */
    generateImage: protectedProcedure
      .input(z.object({
        prompt: z.string().min(1).max(2000),
        aspectRatio: z.enum(["1:1", "4:5", "5:6", "9:16"]).optional(),
        postContext: imagePostContextSchema.optional(),
        idempotencyKey: z.string().min(1).max(128).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const profile = await getBillingProfile(ctx.user.email ?? "dev@local.dev");
        const reservation = await reserveSparks(profile, SPARK_COSTS.GENERATE_IMAGE, input.idempotencyKey ?? deriveIdempotencyKey(ctx.user.id,{inputType:"image",postMode:"image",platform:"canvas",content:JSON.stringify([input.prompt,input.aspectRatio,input.postContext])}), "Geração de imagem IA");
        if (!reservation.reservationId) throw new TRPCError({code:reservation.reason==="committed"?"CONFLICT":"PAYMENT_REQUIRED",message:reservation.reason==="committed"?"Esta solicitação já foi concluída. Acione uma nova geração no editor.":"Não foi possível reservar Sparks para esta imagem. Verifique seu saldo ou tente novamente."});
        try {
          const result = await generateImage({prompt: input.prompt, aspectRatio: input.aspectRatio, postContext: input.postContext, ownerId: ctx.user.id});
          if (!result.url) throw new Error("Nenhuma imagem retornada");
          if (!await commitSparkReservation(reservation.reservationId, `image:${input.idempotencyKey ?? reservation.reservationId}`)) throw new Error("Não foi possível confirmar a geração da imagem");
          return { imageUrl: result.url };
        } catch(error) {
          const refunded=await refundSparkReservation(reservation.reservationId,"Falha na geração ou entrega da imagem");
          if(!refunded) appendOperationalLog("SPARK_REFUND_FAILED", {message: `Imagem: reserva ${reservation.reservationId} não estornada.`});
          throw error;
        }
      }),

    /** Scrape URL for content extraction */
    scrapeUrl: protectedProcedure
      .input(
        z.object({
          url: z.string().url(),
        })
      )
      .mutation(async ({ input }) => {
        return scrapeUrl(input.url);
      }),

    /** Save a post to the database */
    save: protectedProcedure
      .input(
        z.object({
          inputType: inputTypeSchema,
          inputContent: z.string(),
          platform: platformSchema,
          headline: z.string().optional(),
          body: z.string().optional(),
          caption: z.string().optional(),
          hashtags: z.array(z.string()).optional(),
          callToAction: z.string().optional(),
          tone: z.string().optional(),
          imagePrompt: z.string().optional(),
          imageUrl: z.string().optional(),
          backgroundColor: z.string().optional(),
          textColor: z.string().optional(),
          accentColor: z.string().optional(),
          layout: postLayoutSchema.optional(),
          postMode: postModeSchema.optional(),
          slides: z.array(carouselSlideSchema).optional(),
          textElements: z.array(textElementSchema).optional(),
          imageSettings: imageSettingsSchema.optional(),
          layoutSettings: advancedLayoutSettingsSchema.optional(),
          bgValue: backgroundValueSchema.optional(),
          bgOverlay: bgOverlaySettingsSchema.optional(),
          copyAngle: copyAngleSchema.optional(),
          variationSnapshot: postVisualSnapshotSchema.optional(),
          /** Modelo completo do editor CanvasLab (PostSpark Studio). */
          galleryPreview:z.string().max(100000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).nullish(),
          canvasModel: z.any().superRefine((value, ctx) => {
            try { validateArsenalSaveModel(value); }
            catch (error) { ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Composição inválida" }); }
          }).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          await authorizeArsenalSaveModel(input.canvasModel,ctx.user.id);
          const validatedSnapshot = input.variationSnapshot
            ? postVisualSnapshotSchema.parse(input.variationSnapshot)
            : undefined;
          const compressedInput = await compressPostPayload(await normalizeCanvasMediaPayload({
            ...input,
            variationSnapshot: validatedSnapshot,
          }, ctx.user.id));
          const postId = await createPost({
            ...compressedInput,
            userUuid: ctx.user.id,
          });
          return { id: postId };
        } catch (error: any) {
          const rawMessage = String(error?.message || "");
          if (rawMessage.includes("Saved posts limit reached for plan")) {
            const profile = await getBillingProfile(ctx.user.email ?? "dev@local.dev");
            throw new TRPCError({
              code: "FORBIDDEN",
              message: resolveSaveLimitMessage(profile.plan),
            });
          }
          throw error;
        }
      }),

    /** Update a post */
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          headline: z.string().optional(),
          body: z.string().optional(),
          caption: z.string().optional(),
          hashtags: z.array(z.string()).optional(),
          callToAction: z.string().optional(),
          imageUrl: z.string().optional(),
          backgroundColor: z.string().optional(),
          textColor: z.string().optional(),
          accentColor: z.string().optional(),
          layout: postLayoutSchema.optional(),
          postMode: postModeSchema.optional(),
          slides: z.array(carouselSlideSchema).optional(),
          textElements: z.array(textElementSchema).optional(),
          imageSettings: imageSettingsSchema.optional(),
          layoutSettings: advancedLayoutSettingsSchema.optional(),
          bgValue: backgroundValueSchema.optional(),
          bgOverlay: bgOverlaySettingsSchema.optional(),
          copyAngle: copyAngleSchema.optional(),
          variationSnapshot: postVisualSnapshotSchema.optional(),
          /** Modelo completo do editor CanvasLab (PostSpark Studio). */
          galleryPreview:z.string().max(100000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).nullish(),
          canvasModel: z.any().superRefine((value, ctx) => {
            try { validateArsenalSaveModel(value); }
            catch (error) { ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Composição inválida" }); }
          }).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const validatedSnapshot = input.variationSnapshot
          ? postVisualSnapshotSchema.parse(input.variationSnapshot)
          : undefined;
        const compressedInput = await compressPostPayload(await normalizeCanvasMediaPayload({
          ...input,
          variationSnapshot: validatedSnapshot,
        }, ctx.user.id));
        await authorizeArsenalSaveModel(input.canvasModel,ctx.user.id);
        await updatePost(input.id, ctx.user.id, compressedInput);
        return { success: true };
      }),

    listSummary: protectedProcedure.input(z.object({limit:z.number().int().min(1).max(50).default(20),offset:z.number().int().min(0).default(0)}).optional()).query(({ctx,input})=>getUserPostSummaries(ctx.user.id,input?.limit,input?.offset)),
    /** List user's posts */
    list: protectedProcedure.query(async ({ ctx }) => {
      return getUserPosts(ctx.user.id);
    }),

    /** List user's generation history */
    listGenerations: protectedProcedure
      .input(
        z.object({
          limit: z.number().int().min(1).max(100).default(50),
          offset: z.number().int().min(0).default(0),
        }).optional(),
      )
      .query(async ({ input, ctx }) => {
        const limit = input?.limit ?? 50;
        const offset = input?.offset ?? 0;
        return getUserGenerationRuns(ctx.user.id, limit, offset);
      }),

    /** Get single generation by ID */
    getGeneration: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        const generation = await getGenerationRunById(input.id, ctx.user.id);
        if (!generation) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Geração não encontrada.",
          });
        }
        return generation;
      }),

    /** Get single post */
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
      return getPostById(input.id, ctx.user.id);
    }),

    /** Generate background image via OpenRouter, with Pollinations as fallback */
    generateBackground: protectedProcedure
      .input(
        z.object({
          prompt: z.string().min(1),
          provider: z.enum(["pollinations_fast", "pollinations_hd"]).default("pollinations_fast"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Debita Sparks para geração de imagem de fundo
        const email = ctx.user.email ?? "dev@local.dev";
        const profile = await getBillingProfile(email);
        const debit = await debitSparks(profile.id, SPARK_COSTS.GENERATE_IMAGE, "Geração de imagem de fundo");
        if (!debit.success) {
          throw new TRPCError({
            code: "PAYMENT_REQUIRED",
            message: "Sparks insuficientes. Faça upgrade ou adquira um pacote de recarga.",
          });
        }

        const imageData = await generateBackgroundImage(input.prompt, input.provider);
        return { imageData }; // base64 data URI
      }),

    saveMediaAsset: protectedProcedure
      .input(z.object({ imageData: z.string().min(1).max(12 * 1024 * 1024) }))
      .mutation(({ input, ctx }) => saveUserMediaAsset(input.imageData, ctx.user.id)),

    saveBackgroundAsset: protectedProcedure
      .input(
        z.object({
          imageUrl: z.string().min(1),
          sourceType: z.enum(["ai", "upload", "gallery"]),
          prompt: z.string().optional(),
          label: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        let finalImageUrl = input.imageUrl;

        if (input.imageUrl.startsWith("data:image/")) {
          const { buffer, contentType, extension } = decodeDataUrl(input.imageUrl);
          const key = `users/${ctx.user.id}/backgrounds/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
          const uploaded = await storagePut(key, buffer, contentType);
          finalImageUrl = uploaded.url;
        }

        const asset = await createBackgroundAsset({
          userUuid: ctx.user.id,
          imageUrl: finalImageUrl,
          sourceType: input.sourceType,
          prompt: input.prompt,
          label: input.label,
        });

        return asset;
      }),

    listSavedBackgrounds: protectedProcedure.query(async ({ ctx }) => {
      return getUserBackgroundAssets(ctx.user.id);
    }),

    /** Automatically adjust layout based on current canvas */
    autoPilotDesign: protectedProcedure
      .input(
        z.object({
          imageBase64: z.string(),
          currentState: z.any(),
        })
      )
      .mutation(async ({ input }) => {
        const systemPrompt = `
Você é um Diretor de Arte Assistente focado estritamente em Ajuste de Proporção, Margens de Respiro e Legibilidade Adaptativa (WCAG).

O usuário fez alterações Manuais de posicionamento (drag and drop) nos elementos visuais do post. Você recebeu o estado atual desses elementos no campo "elements" do JSON e a imagem correspondente.

SUA MISSÃO NÃO É REINVENTAR O DESIGN, MAS SIM ADAPTÁ-LO PARA O NOVO ASPECT RATIO (${input.currentState.aspectRatio}) PROTEGENDO A INTENÇÃO DO USUÁRIO.

DIRETRIZES RÍGIDAS:
1. Respeite as posições centrais enviadas em "elements". Se um elemento foi movido para perto de uma borda ou canto, mantenha a intenção de proximidade daquele canto, aplicando apenas pequenos recuos (paddings de segurança) para o texto não vazar a tela física.
2. Não mude elementos de lugar drasticamente (ex: se o título está no topo, não o jogue para a base).
3. Ajuste o tamanho do bloco (width) ou o tamanho da fonte apenas se o novo aspectRatio encolheu o espaço horizontal disponível, forçando quebras de linha mais elegantes.
4. Se houver sobreposição (interseção indesejada) criada pela mudança de proporção de tela, faça uma micro-correção no eixo Y para afastar os blocos, preservando a ordem de leitura de cima para baixo.

JSON DO ESTADO ATUAL DO USUÁRIO:
${JSON.stringify(input.currentState, null, 2)}

Devolva as sugestões respeitando estritamente os IDs recebidos. Não invente novos elementos.
`;

        const response = await invokeLLM({
          traceLabel: "auto_pilot_design",
          taskRoute: "vision_analysis",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Analise a imagem e o posicionamento abaixo para gerar o JSON refatorado.",
                },
                { type: "image_url", image_url: { url: input.imageBase64 } },
              ],
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "auto_pilot_design",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  score: {
                    type: "number",
                    description: "Sua nota para o design inicial (0 a 100)",
                  },
                  feedback: {
                    type: "string",
                    description: "Descrição curta em português sobre o erro visível e por que você corrigiu do jeito que corrigiu.",
                  },
                  textColor: {
                    type: "string",
                    description: "Cor HEX sugerida para os textos principais",
                  },
                  suggestedElements: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        x: { type: "number" },
                        y: { type: "number" },
                        width: { type: "number" },
                        textAlign: {
                          type: "string",
                          enum: ["left", "center", "right"],
                        },
                        backgroundColor: { type: "string" },
                        borderRadius: { type: "number" },
                      },
                      required: ["id", "x", "y", "width", "textAlign", "backgroundColor", "borderRadius"],
                      additionalProperties: false,
                    },
                  },
                  suggestedLayoutMoves: {
                    type: "object",
                    properties: {
                      headline: {
                        type: "object",
                        properties: {
                          x: { type: "number" },
                          y: { type: "number" },
                          width: { type: "number" },
                          textAlign: { type: "string" },
                          backgroundColor: { type: "string" },
                          borderRadius: { type: "number" },
                        },
                        required: ["x", "y", "width", "textAlign", "backgroundColor", "borderRadius"],
                        additionalProperties: false,
                      },
                      body: {
                        type: "object",
                        properties: {
                          x: { type: "number" },
                          y: { type: "number" },
                          width: { type: "number" },
                          textAlign: { type: "string" },
                          backgroundColor: { type: "string" },
                          borderRadius: { type: "number" },
                        },
                        required: ["x", "y", "width", "textAlign", "backgroundColor", "borderRadius"],
                        additionalProperties: false,
                      },
                      textColor: {
                        type: "string",
                        description: "Cor HEX sugerida para todos os textos",
                      },
                    },
                    required: ["textColor"],
                    additionalProperties: false,
                  },
                },
                required: ["score", "feedback", "textColor", "suggestedElements", "suggestedLayoutMoves"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0]?.message?.content;
        const contentStr =
          typeof content === "string"
            ? content
            : Array.isArray(content)
              ? content
                  .filter((c: any) => c.type === "text")
                  .map((c: any) => c.text)
                  .join("\n")
              : "{}";
        const parsed = safeJsonParse(contentStr, {} as any);
        return parsed;
      }),

    /** List curated background images grouped by category */
    listBackgrounds: publicProcedure.query(() => {
      const bgRoot = path.join(process.cwd(), "client", "public", "images", "backgrounds");

      try {
        const categories = fs
          .readdirSync(bgRoot, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(dir => {
            const catPath = path.join(bgRoot, dir.name);
            const images = fs
              .readdirSync(catPath)
              .filter(f => /\.(webp|jpg|jpeg|png|gif|svg)$/i.test(f))
              .map(f => `/images/backgrounds/${encodeURIComponent(dir.name)}/${encodeURIComponent(f)}`);
            return { id: dir.name, name: dir.name, images };
          })
          .filter(c => c.images.length > 0);

        return categories;
      } catch {
        return [];
      }
    }),

    /** Analyze brand from URL and return theme variations */
    analyzeBrand: protectedProcedure
      .input(
        z.object({
          url: z.string().url(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // ChameleonProtocol debita Sparks
        const email = ctx.user.email ?? "dev@local.dev";
        const profile = await getBillingProfile(email);
        const debit = await debitSparks(profile.id, SPARK_COSTS.CHAMELEON, "ChameleonProtocol — análise de marca");
        if (!debit.success) {
          throw new TRPCError({
            code: "PAYMENT_REQUIRED",
            message: "Sparks insuficientes. Faça upgrade ou adquira um pacote de recarga.",
          });
        }
        const brandAnalysis = await analyzeBrandFromUrl(input.url);
        const themeVariations = generateCardThemeVariations(brandAnalysis);
        return {
          brandAnalysis,
          themeVariations,
        };
      }),

    /** Extract visual styles from a website URL (Pomelli-inspired hybrid pipeline) */
    extractStyles: protectedProcedure
      .input(
        z.object({
          url: z.string().url(),
        })
      )
      .mutation(async ({ input }) => {
        // Step 1: Extract raw style data (HTML + Vision hybrid pipeline)
        const { data: extractedData, visionUsed } = await extractStyleFromUrlWithMeta(input.url);

        // Check if extraction returned default values (indicates failure)
        const defaultColors = new Set(["#6366f1", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"]);
        const realColors = extractedData.colors.palette.filter(c => !defaultColors.has(c));
        const fallbackUsed = realColors.length === 0;

        // Step 2: Analyze design patterns using LLM
        const designPatterns = await analyzeDesignPattern(extractedData, input.url);

        // Step 3: Generate temporary themes from patterns
        const themes = generateThemesFromPatterns(designPatterns, extractedData, input.url);

        return {
          extractedData,
          designPatterns,
          themes,
          fallbackUsed,
          visionUsed,
        };
      }),

    /**
     * Extract full Brand DNA from a website URL (Tom & Matiz enhanced pipeline).
     * Multi-page screenshots + Gemini Vision + synthesis + musical composition mapping.
     * Cost: 20 Sparks (replaces the 15✦ ChameleonProtocol)
     */
    extractBrandDNA: protectedProcedure
      .input(
        z.object({
          url: z.string().url(),
          debug: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ENV.aiSiteIntelligenceEnabled) {
          throw new TRPCError({
            code: "SERVICE_UNAVAILABLE",
            message: "A inteligencia de site esta temporariamente desativada.",
          });
        }

        return legacyCapture(ctx.user.id,input.url);
      }),

    /**
     * Evaluate quality of generated post variations (LLM-as-Judge).
     * Inspired by Pomelli's evaluation methodology: NIMA aesthetics, VQAScore, brand alignment.
     * Cost: 0 Sparks (quality signal — included as product differentiator)
     *
     * Variations are passed directly from the client (already in memory after generation).
     */
    evaluateQuality: protectedProcedure
      .input(
        z.object({
          variations: z.array(
            z.object({
              id: z.string(),
              headline: z.string(),
              body: z.string(),
              callToAction: z.string(),
              backgroundColor: z.string(),
              textColor: z.string(),
              accentColor: z.string(),
              layout: z.string(),
              platform: z.string(),
            })
          ),
          brandDNA: z
            .object({
              brandName: z.string(),
              industry: z.string(),
              colors: z.object({ primary: z.string() }),
              composition: z.object({ dynamics: z.string() }),
              personality: z.object({
                seriousPlayful: z.number(),
                boldSubtle: z.number(),
                luxuryAccessible: z.number(),
                modernClassic: z.number(),
                warmCool: z.number(),
              }),
              emotionalProfile: z.object({ mood: z.string() }),
            })
            .optional(),
        })
      )
      .mutation(async ({ input }) => {
        if (input.variations.length === 0) {
          return { evaluations: [] };
        }
        const evaluations = await evaluatePostQuality(input.variations as any[], input.brandDNA as any);
        return { evaluations };
      }),
  }),
});

/** Helper: scrape URL for metadata */
async function scrapeUrl(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PostSpark/1.0)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });
    const html = await response.text();

    const getMetaContent = (htmlSource: string, property: string): string => {
      const p1 = new RegExp(`< meta[^>] * property=["']${property}["'][^>]*content=["']([^ "']*)["']`, "i");
      const p2 = new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']*)["']`, "i");

      const m1 = htmlSource.match(p1);
      if (m1?.[1]) return m1[1];

      const m2 = htmlSource.match(p2);
      if (m2?.[1]) return m2[1];

      return "";
    };

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = getMetaContent(html, "og:title") || (titleMatch?.[1] || "").trim();
    const description = getMetaContent(html, "og:description") || getMetaContent(html, "description");

    // Extract text content (simplified)
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyHtml = bodyMatch?.[1] || "";
    const textContent = bodyHtml
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return {
      title,
      description,
      content: textContent.substring(0, 10000), // Limit reasonable amount for context
    };
  } catch (error) {
    console.warn("Failed to scrape URL:", url, error);
    return {
      title: "",
      description: "",
      content: "",
    };
  }
}

export type AppRouter = typeof appRouter;
