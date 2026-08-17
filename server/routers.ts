import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { invokeLLM } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { createBackgroundAsset, createPost, getGenerationRunById, getPostById, getUserBackgroundAssets, getUserGenerationRuns, getUserPosts, updatePost } from "./db";
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
import { prepareGenerationPlan } from "./ai/generationPipeline";
import { loadGenerationContext } from "./ai/contextLoader";
import { routeHighTicketIntent, angleToStrategy } from "./ai/intentRouter";
import { buildGenerationDebugTrace, finishGenerationTrace, recordGenerationEvent, startGenerationTrace } from "./ai/generationTrace";
import { assessSemanticOriginality, persistCandidateFingerprints } from "./ai/semanticOriginality";
import { generatePostVariations, type ExecutionBriefContext } from "./ai/generationOrchestrator";
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

const logSnippet = (value: unknown, maxLength = 320): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > maxLength ? `${text.slice(0, maxLength)}...[truncated]` : text;
};

const summarizeGeneratedVariation = (variation: any, index: number) => ({
  index,
  id: variation?.id,
  layout: variation?.layout,
  platform: variation?.platform,
  postMode: variation?.postMode,
  familyId: variation?.creativeDirection?.familyId,
  typographyResolved: Boolean(variation?.resolvedTypography),
  typographyResolutionError: variation?.typographyResolutionError,
  visualFitIssues: Array.isArray(variation?.visualFitIssues)
    ? variation.visualFitIssues.map((issue: any) => issue?.type)
    : [],
  headline: logSnippet(variation?.headline),
  body: logSnippet(variation?.body),
  caption: logSnippet(variation?.caption, 500),
  callToAction: logSnippet(variation?.callToAction),
  hashtags: Array.isArray(variation?.hashtags) ? variation.hashtags.slice(0, 8) : [],
  colors: {
    backgroundColor: variation?.backgroundColor,
    textColor: variation?.textColor,
    accentColor: variation?.accentColor,
  },
  copyAngle: variation?.copyAngle
    ? {
        type: variation.copyAngle.type,
        label: logSnippet(variation.copyAngle.label),
        badge: logSnippet(variation.copyAngle.badge),
        stickerText: logSnippet(variation.copyAngle.stickerText),
      }
    : undefined,
  sections: Array.isArray(variation?.sections)
    ? variation.sections.map((section: any, sectionIndex: number) => ({
        index: sectionIndex,
        id: section?.id,
        number: section?.number,
        icon: section?.icon,
        label: logSnippet(section?.label),
        description: logSnippet(section?.description),
      }))
    : [],
  slides: Array.isArray(variation?.slides)
    ? variation.slides.map((slide: any, slideIndex: number) => ({
        index: slideIndex,
        headline: logSnippet(slide?.headline),
        body: logSnippet(slide?.body),
        slideNumber: slide?.slideNumber,
        isTitleSlide: slide?.isTitleSlide,
        isCtaSlide: slide?.isCtaSlide,
      }))
    : [],
  generationMeta: variation?.generationMeta
    ? {
        creationMode: variation.generationMeta.creationMode,
        fidelity: variation.generationMeta.fidelity,
        interventionLevel: variation.generationMeta.interventionLevel,
        siteIntelligenceId: variation.generationMeta.siteIntelligenceId,
        strategyId: variation.generationMeta.strategyId,
        revisionCount: variation.generationMeta.revisionCount,
        evaluation: variation.generationMeta.evaluation
          ? {
              accepted: variation.generationMeta.evaluation.accepted,
              overallScore: variation.generationMeta.evaluation.overallScore,
              reasons: variation.generationMeta.evaluation.reasons,
            }
          : undefined,
        originality: variation.generationMeta.originality
          ? {
              score: variation.generationMeta.originality.score,
              verdict: variation.generationMeta.originality.verdict,
              reason: variation.generationMeta.originality.reason,
            }
          : undefined,
      }
    : undefined,
});
const CAROUSEL_SLIDE_TARGET = 5;
const executionSlideInputSchema = z.object({
  slideNumber: z.number().int().min(1).max(CAROUSEL_SLIDE_TARGET),
  rawText: z.string(),
  role: z.enum(["hook", "development", "cta", "custom"]).optional(),
  locked: z.boolean().optional(),
});

const executionBrandInputSchema = z.object({
  websiteUrl: z.string().optional(),
  logoUrl: z.string().optional(),
  referenceImageUrl: z.string().optional(),
  brandColors: z.array(z.string()).optional(),
  fontHint: z.string().optional(),
  adaptationMode: z.enum(["strict", "adaptive", "reference_clone"]),
});

const executionBriefSchema = z.object({
  creationMode: z.literal("execution"),
  format: z.enum(["static", "carousel", "story", "ad"]),
  platform: z.enum(["instagram", "twitter", "linkedin", "facebook"]),
  objective: z.enum(["educate", "authority", "sell", "engage", "lead"]),
  tone: z.string().optional(),
  callToAction: z.string().optional(),
  interventionLevel: z.enum(["visual_only", "light_optimize", "optimize_structure"]),
  contentSourceType: z.enum(["freeform", "carousel_topics", "carousel_slides", "caption_ready"]),
  rawInput: z.string(),
  slides: z.array(executionSlideInputSchema).optional(),
  mustKeep: z.array(z.string()).optional(),
  mustInclude: z.array(z.string()).optional(),
  forbiddenTerms: z.array(z.string()).optional(),
  notes: z.string().optional(),
  brandInput: executionBrandInputSchema.optional(),
});

function normalizeExecutionBrief(input: any) {
  const brief = executionBriefSchema.parse(input);
  const normalizedSlides = Array.isArray(brief.slides)
    ? brief.slides
        .filter(slide => slide.rawText.trim().length > 0)
        .sort((a, b) => a.slideNumber - b.slideNumber)
        .slice(0, CAROUSEL_SLIDE_TARGET)
    : [];

  return {
    ...brief,
    slides: normalizedSlides,
    mustKeep: brief.mustKeep || [],
    mustInclude: brief.mustInclude || [],
    forbiddenTerms: brief.forbiddenTerms || [],
    brandInput: brief.brandInput
      ? {
          ...brief.brandInput,
          brandColors: brief.brandInput.brandColors || [],
        }
      : undefined,
  };
}

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
import { privacyRouter } from "./routers/privacy";

export const appRouter = router({
  system: systemRouter,
  billing: billingRouter,
  admin: adminRouter,
  privacy: privacyRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
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
          model: z.enum(["gemini", "llama"]).optional(),
          creationMode: z.enum(["ideation", "execution"]).default("ideation"),
          executionBrief: executionBriefSchema.optional(),
          siteIntelligenceId: z.string().uuid().optional(),
          idempotencyKey: z.string().min(1).max(128).optional(),
          debug: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Fase C — Billing transacional: reserva Sparks no início (bloqueando
        // saldo), commit só na aprovação final, refund em qualquer falha.
        // idempotencyKey derivada do input impede double-charge no duplo-click.
        const email = ctx.user.email ?? "dev@local.dev";
        const profile = await getBillingProfile(email);
        const cost = input.postMode === "carousel" ? SPARK_COSTS.CAROUSEL : SPARK_COSTS.GENERATE_TEXT;
        const idempotencyKey = input.idempotencyKey ?? deriveIdempotencyKey(ctx.user.id, input);
        const reservation = await reserveSparks(profile, cost, idempotencyKey, `Geração de post (${input.postMode})`);
        if (!reservation.reservationId) {
          await appendOperationalLog("POST_GENERATION_REJECTED", {
            reason: reservation.reason ?? "INSUFFICIENT_SPARKS",
            userUuid: ctx.user.id,
            profileId: profile.id,
            inputType: input.inputType,
            platform: input.platform,
            postMode: input.postMode,
            creationMode: input.creationMode,
            requestedModel: input.model ?? "llama",
            siteIntelligenceId: input.siteIntelligenceId,
            contentLength: input.content.length,
            contentPreview: logSnippet(input.content, 500),
            sparkCost: cost,
            idempotencyKey,
          });
          throw new TRPCError({
            code: "PAYMENT_REQUIRED",
            message: "Sparks insuficientes. Faça upgrade ou adquira um pacote de recarga.",
          });
        }
        const generationTrace = startGenerationTrace({
          userUuid: ctx.user.id,
          inputType: input.inputType,
          inputContent: input.content,
          platform: input.platform,
          postMode: input.postMode,
          creationMode: input.creationMode,
          requestedModel: input.model ?? "llama",
          siteIntelligenceId: input.siteIntelligenceId,
        });
        const debugEnabled = Boolean(input.debug && ENV.aiUiDebugEnabled);
        await appendOperationalLog("POST_GENERATION_STARTED", {
          generationRunId: generationTrace.id,
          userUuid: ctx.user.id,
          inputType: input.inputType,
          platform: input.platform,
          postMode: input.postMode,
          creationMode: input.creationMode,
          requestedModel: input.model ?? "llama",
          siteIntelligenceId: input.siteIntelligenceId,
          contentLength: input.content.length,
          contentPreview: logSnippet(input.content, 500),
          hasImageUrl: Boolean(input.imageUrl),
          hasExecutionBrief: Boolean(input.executionBrief),
          debugEnabled,
          sparkCost: cost,
        });
        try {
          recordGenerationEvent({
            stage: "generation",
            status: "started",
            detail: "Generation pipeline started.",
          });
          const normalizedExecutionBrief = input.creationMode === "execution" && input.executionBrief ? normalizeExecutionBrief(input.executionBrief) : null;
          const recentPostsPromise = getUserPosts(ctx.user.id, 20).catch(error => {
            console.warn("[post.generate] Recent post history unavailable:", error);
            return [];
          });
          let contextContent = input.content;
          let brandDnaContext = "";
          let siteIntelligence: SiteIntelligence | null = null;

          const siteUrl = input.inputType === "url" ? input.content : normalizedExecutionBrief?.brandInput?.websiteUrl;

          if (ENV.aiSiteIntelligenceEnabled && input.siteIntelligenceId) {
            siteIntelligence = await loadSiteIntelligence(input.siteIntelligenceId, ctx.user.id);
          }

          if (ENV.aiSiteIntelligenceEnabled && siteUrl && !siteIntelligence) {
            try {
              const result = await analyzeSiteIntelligence(siteUrl, ctx.user.id);
              siteIntelligence = result.siteIntelligence;
            } catch (error) {
              console.warn("[post.generate] Site intelligence unavailable:", error);
            }
          }

          if (siteIntelligence) {
            contextContent = siteIntelligence.evidence
              .map(item => `[${item.kind}] ${item.text}`)
              .join("\n")
              .slice(0, 24_000);
            brandDnaContext = siteIntelligenceToPrompt(siteIntelligence);
          } else if (siteUrl) {
            const scrapeResult = await scrapeSiteUrl(siteUrl);
            contextContent = `URL: ${siteUrl}\nTitulo: ${scrapeResult.title}\nDescricao: ${scrapeResult.description}\nConteudo: ${scrapeResult.content}`;
          }

          const generationPlan = await prepareGenerationPlan({
            sourceContent: contextContent,
            siteIntelligence,
            executionBrief: normalizedExecutionBrief,
          });
          recordGenerationEvent({
            stage: "content_strategy",
            status: generationPlan.strategies.fallbackUsed ? "fallback" : "completed",
            detail: `${generationPlan.strategies.selected.length} strategies selected.`,
            data: generationPlan.strategies,
          });

          // Fase D — modo "execution" usa o intent router (3 ângulos ortogonais
          // story/authority/objection) como fonte de estratégias, substituindo
          // o planContentStrategies padrão. O contexto enriquecido (BrandKit +
          // Persona + context budget) alimenta o router. O resto do pipeline
          // (slots, composition, snapshot, QA, captions) é idêntico.
          if (input.creationMode === "execution" && normalizedExecutionBrief) {
            try {
              const briefing = await loadGenerationContext({
                userUuid: ctx.user.id,
                inputType: input.inputType,
                content: input.content,
                platform: input.platform,
                postMode: input.postMode,
                creationMode: input.creationMode,
                executionBrief: normalizedExecutionBrief,
                siteIntelligenceId: input.siteIntelligenceId,
              });
              const routing = await routeHighTicketIntent(briefing);
              const intentStrategies = routing.angles.map(angleToStrategy);
              // Substitui as estratégias selecionadas pelas do intent router.
              generationPlan.strategies.selected = intentStrategies;
              recordGenerationEvent({
                stage: "intent_router",
                status: routing.fallbackUsed ? "fallback" : "completed",
                detail: `Intent router produced ${intentStrategies.length} orthogonal angles.`,
                data: { intent: routing.intent, fallbackUsed: routing.fallbackUsed },
              });
            } catch (error) {
              recordGenerationEvent({
                stage: "intent_router",
                status: "fallback",
                detail: `Intent router failed, using planContentStrategies: ${error instanceof Error ? error.message : String(error)}`,
              });
            }
          }

          const outcome = await generatePostVariations(
            {
              userUuid: ctx.user.id,
              request: {
                inputType: input.inputType,
                content: input.content,
                platform: input.platform,
                imageUrl: input.imageUrl,
                tone: input.tone,
                postMode: input.postMode,
                model: input.model,
                creationMode: input.creationMode,
              },
              siteIntelligence,
              executionBrief: normalizedExecutionBrief,
              plan: generationPlan,
              aiLlmJudgeEnabled: ENV.aiLlmJudgeEnabled,
              // Cobre chamada principal + reparo (60 s cada em OPENROUTER_TASK_POLICY)
              // com folga para embeddings, juízes e persistência.
              deadlineMs: Date.now() + 150_000,
            },
            {
              generate: (params) => invokeLLM(params),
              clock: () => Date.now(),
              assessOriginality: assessSemanticOriginality,
              // Reaproveita a busca já disparada no início do handler.
              loadRecentPosts: () => recentPostsPromise,
              trace: {
                id: generationTrace.id,
                recordEvent: (event) => recordGenerationEvent(event),
              },
            },
          );

          if (outcome.status === "approved") {
            const revisionCount = Math.max(
              0,
              ...outcome.snapshots.map(
                (snapshot) => snapshot.generationMeta?.revisionCount ?? 0,
              ),
            );
            await persistCandidateFingerprints({
              userUuid: ctx.user.id,
              generationRunId: generationTrace.id,
              candidates: outcome.snapshots,
              embeddings: outcome.originality.embeddings,
              assessments: outcome.originality.assessments,
            });
            await finishGenerationTrace({
              trace: generationTrace,
              status: "completed",
              strategies: outcome.plan,
              evaluations: outcome.evaluations,
              revisionCount,
              strategyFallbackUsed: outcome.plan.strategies.fallbackUsed,
              originalityFallbackUsed: outcome.originality.fallbackUsed,
              output: outcome.snapshots,
            });
            await appendOperationalLog("POST_GENERATION_COMPLETED", {
              generationRunId: generationTrace.id,
              userUuid: ctx.user.id,
              durationMs: Date.now() - generationTrace.startedAt,
              inputType: input.inputType,
              platform: input.platform,
              postMode: input.postMode,
              creationMode: input.creationMode,
              requestedModel: input.model ?? "llama",
              effectiveModels: Array.from(
                new Set(generationTrace.calls.map((call) => call.effectiveModel)),
              ),
              siteIntelligenceId: siteIntelligence?.id,
              variationCount: outcome.snapshots.length,
              revisionCount,
              strategyFallbackUsed: outcome.plan.strategies.fallbackUsed,
              originalityFallbackUsed: outcome.originality.fallbackUsed,
              generativeCalls: outcome.metrics.generativeCalls,
              repairCalls: outcome.metrics.repairCalls,
              llmCalls: generationTrace.calls.map((call) => ({
                label: call.label,
                provider: call.provider,
                effectiveModel: call.effectiveModel,
                attempt: call.attempt,
                fallbackFrom: call.fallbackFrom,
                promptHash: call.promptHash,
                promptTokens: call.promptTokens,
                completionTokens: call.completionTokens,
                totalTokens: call.totalTokens,
                latencyMs: call.latencyMs,
                estimatedCostUsd: call.estimatedCostUsd,
                error: call.error,
              })),
              outputSummary: outcome.snapshots.map(summarizeGeneratedVariation),
            });
            // Fase C — commit da reserva: débito definitivo apenas após a
            // aprovação final e a persistência. Idempotente.
            // CR-005: `false` é falha OPERACIONAL TERMINAL — a reserva não
            // virou débito, mas o run precisa terminar com estado explícito
            // (refund + trace failed + log), nunca como "aprovado sem cobrar".
            const committed = await commitSparkReservation(reservation.reservationId, generationTrace.id);
            if (!committed) {
              throw new Error(
                `commitSparkReservation(${reservation.reservationId}) retornou false — reserva não confirmada; run terminado como falha terminal (refund aplicado no catch).`,
              );
            }
            return {
              variations: outcome.snapshots,
              generationRunId: generationTrace.id,
              ...(debugEnabled
                ? {
                    debug: buildGenerationDebugTrace({
                      trace: generationTrace,
                      strategies: outcome.plan,
                      evaluations: outcome.evaluations,
                      output: outcome.snapshots,
                    }),
                  }
                : {}),
            };
          }

          // rejected / failed — o catch abaixo é dono único do refund, do
          // encerramento do trace e do log. A distinção entre rejeição de
          // qualidade e falha operacional é preservada até a borda.
          if (outcome.status === "rejected") {
            const issuesText = outcome.issues.map((issue) => issue.detail).join("; ");
            throw new TRPCError({
              code: "BAD_GATEWAY",
              message: "A IA não conseguiu produzir três variações válidas e distintas. Tente novamente.",
              cause: new Error(issuesText),
            });
          }
          throw new TRPCError({
            code: outcome.error.kind === "deadline" ? "GATEWAY_TIMEOUT" : "INTERNAL_SERVER_ERROR",
            message: "Falha operacional durante a geração. Tente novamente.",
            cause: new Error(outcome.error.message),
          });
        } catch (error) {
          // Fase C — refund cobre qualquer falha terminal: LLM, schema, fit,
          // persistência, timeout e exceções não tipadas. A reserva apenas
          // bloqueava saldo; refund muda status sem precisar devolver débito.
          // CR-005: se o refund também falhar (`false`), o run NUNCA fica em
          // silêncio — registra SPARK_REFUND_FAILED e encerra o trace como
          // falha com detalhe observável.
          const refunded = await refundSparkReservation(
            reservation.reservationId,
            error instanceof Error ? error.message : "Generation failed",
          );
          const refundNote = refunded
            ? ""
            : ` [SPARK_REFUND_FAILED: refundSparkReservation(${reservation.reservationId}) retornou false — reserva pode ter ficado pendente; ação manual necessária]`;
          if (!refunded) {
            await appendOperationalLog("SPARK_REFUND_FAILED", {
              reservationId: reservation.reservationId,
              generationRunId: generationTrace.id,
              userUuid: ctx.user.id,
              originalError: error instanceof Error ? error.message : "Generation failed",
            });
          }
          await finishGenerationTrace({
            trace: generationTrace,
            status: "failed",
            error: `${error instanceof Error ? error.message : "Generation failed"}${refundNote}`,
          });
          await appendOperationalLog("POST_GENERATION_FAILED", {
            generationRunId: generationTrace.id,
            userUuid: ctx.user.id,
            durationMs: Date.now() - generationTrace.startedAt,
            inputType: input.inputType,
            platform: input.platform,
            postMode: input.postMode,
            creationMode: input.creationMode,
            requestedModel: input.model ?? "llama",
            siteIntelligenceId: generationTrace.siteIntelligenceId,
            llmCalls: generationTrace.calls.map((call) => ({
              label: call.label,
              provider: call.provider,
              effectiveModel: call.effectiveModel,
              attempt: call.attempt,
              fallbackFrom: call.fallbackFrom,
              promptHash: call.promptHash,
              promptTokens: call.promptTokens,
              completionTokens: call.completionTokens,
              totalTokens: call.totalTokens,
              latencyMs: call.latencyMs,
              estimatedCostUsd: call.estimatedCostUsd,
              error: call.error,
            })),
            error,
          });
          throw error;
        }
      }),

    /** Generate image for a post */
    generateImage: protectedProcedure
      .input(
        z.object({
          prompt: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Debita Sparks antes de gerar imagem
        const email = ctx.user.email ?? "dev@local.dev";
        const profile = await getBillingProfile(email);
        const debit = await debitSparks(profile.id, SPARK_COSTS.GENERATE_IMAGE, "Geração de imagem IA");
        if (!debit.success) {
          throw new TRPCError({
            code: "PAYMENT_REQUIRED",
            message: "Sparks insuficientes. Faça upgrade ou adquira um pacote de recarga.",
          });
        }

        const result = await generateImage({
          prompt: input.prompt,
        });
        return { imageUrl: result.url || "" };
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
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const validatedSnapshot = input.variationSnapshot
            ? postVisualSnapshotSchema.parse(input.variationSnapshot)
            : undefined;
          const postId = await createPost({
            ...input,
            variationSnapshot: validatedSnapshot,
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
        })
      )
      .mutation(async ({ input, ctx }) => {
        const validatedSnapshot = input.variationSnapshot
          ? postVisualSnapshotSchema.parse(input.variationSnapshot)
          : undefined;
        await updatePost(input.id, ctx.user.id, { ...input, variationSnapshot: validatedSnapshot });
        return { success: true };
      }),

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

        const email = ctx.user.email ?? "dev@local.dev";
        const profile = await getBillingProfile(email);
        const debit = await debitSparks(profile.id, 20, "Brand DNA — extração multi-página + análise visual");
        if (!debit.success) {
          throw new TRPCError({
            code: "PAYMENT_REQUIRED",
            message: "Sparks insuficientes. Faça upgrade ou adquira um pacote de recarga.",
          });
        }

        const extractionTrace = startGenerationTrace({
          userUuid: ctx.user.id,
          inputType: "url",
          inputContent: input.url,
          platform: "site-intelligence",
          postMode: "analysis",
          creationMode: "site-intelligence",
          requestedModel: "gemini",
        });
        recordGenerationEvent({
          stage: "site_collection",
          status: "started",
          detail: "Shared site collection and specialist analysis started.",
        });
        const result = await analyzeSiteIntelligence(input.url, ctx.user.id);
        recordGenerationEvent({
          stage: "site_compilation",
          status: result.fallbackUsed ? "fallback" : "completed",
          detail: "Semantic and visual analyses compiled into SiteIntelligence.",
          data: {
            siteIntelligenceId: result.siteIntelligence.id,
            quality: result.siteIntelligence.quality,
          },
        });
        return {
          ...result,
          ...(input.debug && ENV.aiUiDebugEnabled
            ? {
                debug: buildGenerationDebugTrace({
                  trace: extractionTrace,
                }),
              }
            : {}),
        };
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
