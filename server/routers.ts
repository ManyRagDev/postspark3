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
import { analyzeSiteIntelligence, loadSiteIntelligence, siteIntelligenceToDesignTokens, siteIntelligenceToPrompt } from "./siteIntelligence";
import { scrapeUrl as scrapeSiteUrl } from "./siteContent";
import { extractBrandDNA } from "./brandDNA";
import { chameleonVision } from "./chameleonVision";
import { captureScreenshot } from "./screenshotService";
import { chameleonResultToDesignTokens } from "@shared/postspark";
import { directCreative, composeVariation, hashString } from "@shared/creative";
import * as fs from "fs";
import * as path from "path";
import { getBillingProfile, debitSparks, getTopupPackages, createSubscriptionCheckout, createTopupCheckout, getSubscriptionPriceId, getSupabase, SPARK_COSTS } from "./billing";
import { ENV } from "./_core/env";
import { appendOperationalLog } from "./_core/operationalLog";
import { TRPCError } from "@trpc/server";
import { variationsNeedDiversification } from "./ai/variationDiversity";
import { enforceBrandVisualGuardian } from "./ai/brandVisualGuardian";
import { prepareGenerationPlan } from "./ai/generationPipeline";
import { synthesizeCaptionsForVariations } from "./ai/captionSynthesis";
import { evaluateAndReviseCandidates } from "./ai/postEvaluation";
import { buildGenerationDebugTrace, finishGenerationTrace, recordGenerationEvent, startGenerationTrace } from "./ai/generationTrace";
import { assessSemanticOriginality, persistCandidateFingerprints } from "./ai/semanticOriginality";
import { runHighTicketPipeline } from "./ai/highTicket";
import { assertVariationSet, hasValidStaticSections, POST_VARIATION_TARGET, validateVariationSet } from "./ai/generationValidation";
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

function isLegacySitePipelineEnabled(): boolean {
  return false;
}

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
/**
 * Helper to safely parse JSON from LLM responses, handling markdown blocks and basic malformations.
 */
function safeJsonParse<T>(str: string, fallback: T): T {
  let cleaned = str.trim();

  // 1. Markdown stripping
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned
      .replace(/^```json\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  // 2. Bound recovery (find the outermost { ... })
  const startIdx = cleaned.indexOf("{");
  const endIdx = cleaned.lastIndexOf("}");
  if (startIdx !== -1 && (endIdx === -1 || endIdx > startIdx)) {
    cleaned = cleaned.substring(startIdx, endIdx !== -1 ? endIdx + 1 : undefined);
  }

  // Helper to attempt parsing
  const tryParse = (jsonStr: string): T | null => {
    try {
      // Basic repair: remove trailing commas before closing braces/brackets
      const repaired = jsonStr.replace(/,\s*([\]}])/g, "$1");
      return JSON.parse(repaired) as T;
    } catch {
      return null;
    }
  };

  // 3. First attempt
  let result = tryParse(cleaned);
  if (result) return result;

  // 4. Heuristic Repair: Handling truncation
  // LLMs often stop in the middle of a string, or deep in nested objects.
  console.warn("[safeJsonParse] Initial parse failed. Attempting heuristic repair...");

  let repairAttempt = cleaned;
  const stack: ("{" | "[")[] = [];
  let inString = false;
  let escaped = false;

  // Walk through to find the state of open structures
  for (let i = 0; i < repairAttempt.length; i++) {
    const char = repairAttempt[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") stack.push("{");
    else if (char === "[") stack.push("[");
    else if (char === "}") stack.pop();
    else if (char === "]") stack.pop();
  }

  // If we are inside a string, close it
  if (inString) {
    repairAttempt += '"';
  }

  // Close all open braces/brackets in reverse order
  while (stack.length > 0) {
    const last = stack.pop();
    if (last === "{") repairAttempt += "}";
    else if (last === "[") repairAttempt += "]";
  }

  // Try again with the surgically repaired JSON
  result = tryParse(repairAttempt);
  if (result) {
    console.log("[safeJsonParse] Heuristic repair successful.");
    return result;
  }

  console.error("[safeJsonParse] Failed to parse JSON even after repair.");
  console.error("[safeJsonParse] Input snippet (100 chars):", str.substring(0, 100));
  return fallback;
}

const CAROUSEL_SLIDE_TARGET = 5;
const EXECUTION_VARIATION_TARGET = 3;

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

function buildExecutionBriefContext(brief: ReturnType<typeof normalizeExecutionBrief>) {
  const slidesBlock =
    brief.slides.length > 0
      ? brief.slides.map(slide => `Slide ${slide.slideNumber} [${slide.role || "custom"}${slide.locked ? ", travado" : ""}]: ${slide.rawText}`).join("\n")
      : "Nenhum slide estruturado foi fornecido.";

  const brandBlock = brief.brandInput
    ? [
        `- Site: ${brief.brandInput.websiteUrl || "não informado"}`,
        `- Referência visual: ${brief.brandInput.referenceImageUrl || "não informada"}`,
        `- Cores: ${brief.brandInput.brandColors?.join(", ") || "não informadas"}`,
        `- Fonte sugerida: ${brief.brandInput.fontHint || "não informada"}`,
        `- Modo de adaptação: ${brief.brandInput.adaptationMode}`,
      ].join("\n")
    : "- Nenhuma identidade visual estruturada foi enviada.";

  const mustKeepBlock = brief.mustKeep.length > 0 ? brief.mustKeep.join(" | ") : "nenhum";
  const mustIncludeBlock = brief.mustInclude.length > 0 ? brief.mustInclude.join(" | ") : "nenhum";
  const forbiddenBlock = brief.forbiddenTerms.length > 0 ? brief.forbiddenTerms.join(" | ") : "nenhum";

  return `BRIEFING DE EXECUÇÃO:
- Formato: ${brief.format}
- Plataforma: ${brief.platform}
- Objetivo: ${brief.objective}
- Tom desejado: ${brief.tone || "não informado"}
- CTA obrigatório: ${brief.callToAction || "não informado"}
- Nível de intervenção: ${brief.interventionLevel}
- Tipo de insumo: ${brief.contentSourceType}

CONTEÚDO BRUTO:
${brief.rawInput}

SLIDES FORNECIDOS:
${slidesBlock}

ITENS QUE DEVEM SER PRESERVADOS:
${mustKeepBlock}

ITENS QUE DEVEM APARECER:
${mustIncludeBlock}

TERMOS PROIBIDOS:
${forbiddenBlock}

IDENTIDADE VISUAL:
${brandBlock}

OBSERVAÇÕES:
${brief.notes || "nenhuma"}`;
}

function buildFallbackCarouselSlides(variation: any): Array<any> {
  const baseHeadline = String(variation?.headline || "Resumo");
  const baseBody = String(variation?.body || "").trim();
  const callToAction = String(variation?.callToAction || "Saiba mais").trim();
  const bodyParts = baseBody
    .split(/(?<=[.!?])\s+/)
    .map(part => part.trim())
    .filter(Boolean);

  const fallbackBodies = [
    baseBody || "Entenda o contexto desta ideia.",
    bodyParts[0] || baseBody || "Veja por que isso importa agora.",
    bodyParts[1] || bodyParts[0] || "Descubra o principal benefício desta proposta.",
    bodyParts[2] || bodyParts[1] || "Veja como aplicar isso no dia a dia.",
    callToAction || "Dê o próximo passo com segurança.",
  ];

  const fallbackHeadlines = [baseHeadline, "O problema", "O que muda", "Na prática", callToAction || "Próximo passo"];

  return fallbackHeadlines.map((headline, index) => ({
    headline,
    body: fallbackBodies[index],
    slideNumber: index + 1,
    isTitleSlide: index === 0,
    isCtaSlide: index === CAROUSEL_SLIDE_TARGET - 1,
  }));
}

function normalizeCarouselSlides(variation: any): Array<any> {
  const rawSlides = Array.isArray(variation?.slides) ? variation.slides : [];
  const normalized = rawSlides
    .filter(Boolean)
    .slice(0, CAROUSEL_SLIDE_TARGET)
    .map((slide: any, index: number) => ({
      headline: String(slide?.headline || variation?.headline || `Slide ${index + 1}`),
      body: String(slide?.body || variation?.body || ""),
      slideNumber: index + 1,
      isTitleSlide: index === 0,
      isCtaSlide: index === CAROUSEL_SLIDE_TARGET - 1,
    }));

  if (normalized.length === CAROUSEL_SLIDE_TARGET) {
    return normalized;
  }

  return buildFallbackCarouselSlides(variation);
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

      const sb = getSupabase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (sb as any).rpc("start_trial", {
        p_user_id: profile.id,
        p_email: email,
        p_ip_address: ip,
        p_plan: input.plan,
      });

      if (error) return { success: false, reason: error.message };
      return data as { success: boolean; reason: string };
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
          debug: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Debita Sparks antes de gerar
        const email = ctx.user.email ?? "dev@local.dev";
        const profile = await getBillingProfile(email);
        const cost = input.postMode === "carousel" ? SPARK_COSTS.CAROUSEL : SPARK_COSTS.GENERATE_TEXT;
        const debit = await debitSparks(profile.id, cost, `Geração de post (${input.postMode})`);
        if (!debit.success) {
          await appendOperationalLog("POST_GENERATION_REJECTED", {
            reason: "INSUFFICIENT_SPARKS",
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
          if (ENV.aiHighTicketPipelineEnabled) {
            try {
              recordGenerationEvent({
                stage: "high_ticket_pipeline",
                status: "started",
                detail: "High Ticket pipeline branch enabled.",
              });
              const result = await runHighTicketPipeline({
                runId: generationTrace.id,
                userUuid: ctx.user.id,
                inputType: input.inputType,
                content: input.content,
                platform: input.platform,
                postMode: input.postMode,
                model: input.model,
                creationMode: input.creationMode,
                executionBrief: normalizedExecutionBrief ?? undefined,
                siteIntelligenceId: input.siteIntelligenceId,
                debug: debugEnabled,
              });
              await finishGenerationTrace({
                trace: generationTrace,
                status: "completed",
                strategies: result.graphState.routing,
                evaluations: result.graphState.qa.map((item) => item.evaluation),
                revisionCount: result.graphState.attempt,
                strategyFallbackUsed: result.graphState.routing?.fallbackUsed,
                originalityFallbackUsed: result.graphState.originality?.fallbackUsed,
                output: result.variations,
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
                highTicketPipeline: true,
                variationCount: result.variations.length,
                graphStatus: result.graphState.status,
                graphEvents: result.graphState.events.map((event) => ({
                  status: event.status,
                  detail: event.detail,
                  at: event.at,
                })),
              });
              return {
                variations: result.variations,
                generationRunId: result.generationRunId,
                ...(debugEnabled
                  ? {
                      debug: buildGenerationDebugTrace({
                        trace: generationTrace,
                        strategies: result.graphState.routing,
                        evaluations: result.graphState.qa.map((item) => item.evaluation),
                        output: result.variations,
                      }),
                    }
                  : {}),
              };
            } catch (highTicketError) {
              recordGenerationEvent({
                stage: "high_ticket_pipeline",
                status: ENV.aiHighTicketLegacyFallbackEnabled ? "fallback" : "failed",
                detail: highTicketError instanceof Error ? highTicketError.message : String(highTicketError),
              });
              if (!ENV.aiHighTicketLegacyFallbackEnabled) {
                throw highTicketError;
              }
            }
          }
          const recentPostsPromise = getUserPosts(ctx.user.id, 20).catch(error => {
            console.warn("[post.generate] Recent post history unavailable:", error);
            return [];
          });
          let contextContent = input.content;
          let brandDnaContext = "";
          let chameleonResult: import("@shared/postspark").ChameleonVisionResult | null = null;
          let siteIntelligence: SiteIntelligence | null = null;

          // If URL, scrape it first and extract Brand DNA for visual cloning
          if (isLegacySitePipelineEnabled() && input.inputType === "url") {
            try {
              // 1. Extração de conteúdo bruto
              const scrapeResult = await scrapeUrl(input.content);
              contextContent = `URL: ${input.content}\nTítulo: ${scrapeResult.title}\nDescrição: ${scrapeResult.description}\nConteúdo: ${scrapeResult.content}`;

              // 2. Chameleon Vision — direct CSS extraction (parallel with BrandDNA)
              const [screenshot, brandDNA] = await Promise.all([
                captureScreenshot(input.content).catch(() => null),
                extractBrandDNA(input.content).catch((err: unknown) => {
                  console.warn("Falha ao extrair Brand DNA no processamento da geração.", err);
                  return null;
                }),
              ]);

              // 2a. Chameleon Vision: image → CSS tokens + copy (primary source)
              if (screenshot) {
                try {
                  chameleonResult = await chameleonVision(screenshot, contextContent);
                  if (chameleonResult) {
                    console.log("[Chameleon Vision] Extraction successful — CSS tokens + 5 copy angles ready");
                  }
                } catch (cvErr) {
                  console.warn("[Chameleon Vision] Failed, falling back to BrandDNA:", cvErr);
                }
              }

              // 2b. BrandDNA context for copy generation enrichment
              if (brandDNA) {
                brandDnaContext = `

INSTRUÇÕES DE CLONAGEM DE MARCA (BRAND SOUL):
Você DEVE FORÇAR o post gerado a ser uma extensão orgânica do site original.
Dados da Marca extraídos:
- Nome/Setor: ${brandDNA.brandName} (${brandDNA.industry})
- Cores Sugeridas (UTILIZE OBRIGATORIAMENTE ESTAS BASEADAS EM PSICOLOGIA DE CONTRASTE):
  Primária: ${chameleonResult?.colors.primary || brandDNA.colors.primary}
  Secundárias: ${chameleonResult?.colors.secondary || brandDNA.colors.secondary}
  Background Sugerido: ${chameleonResult?.colors.background || brandDNA.colors.background}
  Accent Sugerido: ${chameleonResult?.colors.primary || brandDNA.colors.accent}
  Paleta Geral: ${brandDNA.colors.palette.join(", ")}
- Ritmo Visual/Dinâmica: ${brandDNA.composition.dynamics} / ${brandDNA.composition.rhythm}

REGRA CARDINAL DE CORES (A FONTE É URL):
1) Você NÃO PODE IGNORAR a paleta fornecida acima. O post DEVE pertencer ao site visualmente.
2) Selecione backgroundColor, accentColor e textColor EXCLUSIVAMENTE extraídos dessa paleta extraída, garantindo ratio > 4.5:1 WCAG.
3) Se o site for Dark Mode, gere posts escuros. Se o site for claro, gere variabilidades claras.
              `;
              }
            } catch {
              contextContent = `URL fornecida: ${input.content} (não foi possível extrair conteúdo, crie baseado na URL)`;
            }
          }

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

          const platformSpecs: Record<string, { label: string; maxChars: number }> = {
            instagram: { label: "Instagram", maxChars: 2200 },
            twitter: { label: "Twitter/X", maxChars: 280 },
            linkedin: { label: "LinkedIn", maxChars: 3000 },
            facebook: { label: "Facebook", maxChars: 63206 },
          };
          const spec = platformSpecs[input.platform];

          const effectiveTone = normalizedExecutionBrief?.tone || input.tone;
          const toneHint = effectiveTone ? `\nTom detectado no input do usuário: "${effectiveTone}" — calibre o conteúdo gerado para esse estado emocional.\n` : "";

          // Dynamic system prompt based on postMode
          const isCarousel = input.postMode === "carousel";
          const modeInstruction = normalizedExecutionBrief
            ? isCarousel
              ? `\nIMPORTANTE: Gere conteúdo para um CARROSSEL de execução guiada. Cada variação DEVE ter exatamente 5 slides organizados em "slides". Preserve a estrutura fornecida pelo usuário sempre que ela existir. Slide 1 = gancho, slides 2-4 = desenvolvimento, slide 5 = CTA final. Não coloque CTA nos slides 1-4.`
              : "\nIMPORTANTE: Gere uma peça de execução guiada, fiel ao briefing, com baixa distância entre as variações."
            : isCarousel
              ? `\nIMPORTANTE: Gere conteúdo para um CARROSSEL (múltiplos slides). Cada variação DEVE ter exatamente 5 slides organizados em um array "slides". Não retorne array vazio, parcial ou simplificado. Estrutura obrigatória do carrossel: slide 1 = gancho forte e altamente curioso para fazer a pessoa folhear; slides 2, 3 e 4 = desenvolvimento progressivo do tema; slide 5 = CTA final, e somente ele deve conter call-to-action. Não coloque CTA nos slides 1-4. Cada slide deve ter: headline (título curto máx 50 caracteres), body (mensagem máx 80 caracteres), slideNumber (1-5), isTitleSlide (true apenas no slide 1), isCtaSlide (true apenas no slide 5). O headline/body de nível superior são apenas um resumo do carrossel; o conteúdo principal vive nos slides.`
              : "\nGere posts individuais (estático).";

          const executionSystemContext = normalizedExecutionBrief
            ? `
MODO DE EXECUÇÃO ATIVADO:
- Você NÃO está criando do zero. Você está executando um briefing.
- Preserve a intenção, a estrutura, o CTA e os termos obrigatórios enviados pelo usuário.
- Se houver slides fornecidos, trate-os como material fonte prioritário.
- Não reescreva agressivamente sem necessidade.
- O nível de intervenção permitido é: ${normalizedExecutionBrief.interventionLevel}.
- Gere EXATAMENTE ${EXECUTION_VARIATION_TARGET} variações próximas entre si. Varie principalmente acabamento visual, microcopy e hierarquia, não o conceito central.
- Se o nível for "visual_only", mantenha o texto quase intacto.
- Se o nível for "light_optimize", melhore clareza, ritmo e impacto sem alterar a estrutura principal.
- Se o nível for "optimize_structure", você pode reorganizar trechos, mas sem trair a mensagem central.
`
            : "";

          const generationInstructionCore = `${modeInstruction}
${normalizedExecutionBrief ? "As 3 variações devem ser próximas entre si e altamente fiéis ao briefing." : "Cada variação deve ter um tom diferente: 1) Profissional/Corporativo, 2) Casual/Engajador, 3) Criativo/Ousado."}${toneHint}
${brandDnaContext}
${executionSystemContext}
${generationPlan.promptContext}

REGRAS DE COPY — SIGA COM RIGOR:
- Headline: máximo 60 caracteres. Seja direto e impactante. Sem ponto final.
- Body: máximo 2 frases curtas. Máximo 100 caracteres no total. Sem rodeios.
- Caption/Legenda: forneça uma legenda INICIAL curta (1-2 frases). Esta legenda será substituída por uma versão mais rica e coerente em um passo dedicado posterior, então não precisa ser longa — apenas garantida.
- NUNCA coloque hashtags ou emojis dentro do headline ou body.
- Hashtags: máximo 4, somente no campo separado "hashtags".
- CallToAction: máximo 40 caracteres. Verbo de ação. Ex: "Saiba mais", "Experimente agora".
- copyAngle: Para cada variação, forneça um objeto com o Propósito e Ganchos do post com type (dor, beneficio, objecao, autoridade, escassez, storytelling, mito_vs_verdade), label (nome da abordagem), badge (palavra curta para o selo da marca/tema) e stickerText (uma palavra de impacto para adesivo decorativo).
- As 3 variações DEVEM ser claramente distinguíveis entre si. Não repita headline, body, copyAngle, CTA, hashtags ou a mesma combinação de layout + paleta.
- Faça cada variação abrir por uma ideia diferente: 1) institucional/autoridade, 2) conversa/engajamento, 3) criativa ou provocativa.
- Seja conciso. Corte qualquer palavra desnecessária. Menos é mais.

PRINCÍPIOS DE DESIGN VISUAL E MIMETISMO:

1. HIERARQUIA VISUAL (Proporção 3:2:1):
   - O headline deve ser a informação MAIS impactante (peso visual máximo).
   - O body deve complementar, nunca competir com o headline.

2. LAYOUT INTELIGENTE por objetivo do post:
   - "centered": Inspiração, emoção, celebração, citações. Melhor em 1:1.
   - "left-aligned": Educação, listas, tutoriais. Melhor em 5:6 e 9:16.
   - "split": Promoções, impacto. Versátil.
   - "minimal": Ultra-limpo, essencial. Para marcas focadas no white-space.

3. PSICOLOGIA E CLONAGEM DE CORES:
   - SE houver [INSTRUÇÕES DE CLONAGEM DE MARCA] no prompt, AS CORES SÃO MANDATÓRIAS. Mimetize a "Alma" injetando backgroundColor e textColor apenas baseados na Extração Fornecida.
   - SE NÃO houver extração, use a psicologia clássica: backgroundColor neutro escuro/azul para tom Corporativo, cores quentes para Criativo, etc.

4. CONTRASTE (WCAG 2.1):
   - SEMPRE garanta contraste alto: fundo escuro → textColor claro (#FFFFFF). Fundo claro → textColor escuro (#1A1A1A).
   - NUNCA use texto cinza médio sobre fundo cinza médio.

5. PACOTE CRIATIVO MULTI-FORMATO:
   - Cada variação deve fluir formatada no aspectRatio correspondente.

6. TEMPLATES ESTRUTURADOS:
   - Use 'simple' quando headline e body forem suficientes. Não invente seções apenas para preencher o layout.
   - Use 'feature-grid', 'numbered-list' ou 'step-by-step' somente quando a mensagem realmente exigir itens distintos.
   - Todo template estruturado deve ter EXATAMENTE 3 seções. Nunca gere 4 ou 5 itens em um único post estático.
   - Cada label deve ter no máximo 24 caracteres e cada description no máximo 48 caracteres.
   - Resuma cada item em uma única ideia. Não repita no item o que já está no headline ou body.

7. FLOATING CARDS & ELEMENT STYLING (NEW):
   - O card PRINCIPAL não precisa estar sempre centralizado ou ocupar 100% da tela.
   - Use o objeto "card" dentro das otimizações para criar composições dinâmicas (ex: card inclinado, card menor no canto, layout Figma/Canva).
   - Isso é especialmente útil quando o fundo (backgroundImage) é rico visualmente.
   - Use 'backgroundColor' e 'borderRadius' em 'headline' ou 'body' para criar efeitos de BADGE ou STIKER (texto com fundo colorido e cantos arredondados). Isso ajuda a destacar informações de forma "divertida" e moderna. Use cores contrastantes.
   
Responda APENAS com JSON válido.`;

          const systemPrompt = `Você é um especialista em marketing digital, design visual e criação de conteúdo para redes sociais.
Gere EXATAMENTE 3 variações de post para ${spec.label}.
${generationInstructionCore}`;

          const slotGenerationInstructionCore = generationInstructionCore
            .replace(generationPlan.promptContext, "")
            .replace(
              "As 3 variações devem ser próximas entre si e altamente fiéis ao briefing.",
              "Esta variação deve ser altamente fiel ao briefing e ao contrato estratégico do slot.",
            )
            .replace(
              "Cada variação deve ter um tom diferente: 1) Profissional/Corporativo, 2) Casual/Engajador, 3) Criativo/Ousado.",
              "Esta variação deve seguir exclusivamente o tom e o ângulo definidos no contrato estratégico do slot.",
            )
            .replace(
              "- As 3 variações DEVEM ser claramente distinguíveis entre si. Não repita headline, body, copyAngle, CTA, hashtags ou a mesma combinação de layout + paleta.",
              "- Esta variação DEVE ser claramente alinhada ao contrato estratégico do slot. Não reaproveite mecanicamente headline, body, copyAngle, CTA, hashtags ou combinação de layout + paleta de outros ângulos.",
            )
            .replace(
              "- Faça cada variação abrir por uma ideia diferente: 1) institucional/autoridade, 2) conversa/engajamento, 3) criativa ou provocativa.",
              "- Faça esta variação abrir por uma ideia forte e alinhada ao contrato estratégico do slot, sem cair em fórmulas genéricas.",
            );

          const slotSystemPrompt = `Você é um especialista em marketing digital, design visual e criação de conteúdo para redes sociais.
Gere exatamente UMA variação de post para ${spec.label}, correspondente ao slot solicitado pelo usuário.

PRIORIDADE CRIATIVA:
- O schema é apenas o contêiner de entrega; a peça precisa sair pronta para produção.
- A variação deve ter uma ideia clara, copy objetiva, coerência visual e diferença real em relação aos outros ângulos.
- Não preencha campos mecanicamente. Cada headline, body, seção, CTA e cor deve servir ao contrato estratégico do slot.

${slotGenerationInstructionCore}`;

          const userPrompt = normalizedExecutionBrief
            ? `Execute este briefing com fidelidade. Otimize apenas no grau permitido.

${buildExecutionBriefContext(normalizedExecutionBrief)}`
            : input.inputType === "image"
              ? `Crie posts baseados nesta imagem: ${input.imageUrl || input.content}`
              : `Crie posts baseados neste conteúdo: ${contextContent}`;

          // ─── JSON Schema Layout Definitions ───
          const layoutPositionSchema = {
            type: "object",
            properties: {
              x: { type: "number", description: "Posição X em % (0-100)" },
              y: { type: "number", description: "Posição Y em % (0-100)" },
              width: { type: "number", description: "Largura em % (10-100)" },
              textAlign: { type: "string", enum: ["left", "center", "right"] },
              backgroundColor: {
                type: "string",
                description: "Cor de fundo opcional para o elemento (RGBA ou Hex)",
              },
              borderRadius: {
                type: "number",
                description: "Raio da borda em px (0-40)",
              },
            },
            required: ["x", "y", "width", "textAlign", "backgroundColor", "borderRadius"],
            additionalProperties: false,
          };

          const formatOptimizationSchema = {
            type: "object",
            properties: {
              layout: {
                type: "string",
                enum: ["centered", "left-aligned", "split", "minimal"],
              },
              backgroundColor: { type: "string" },
              textColor: { type: "string" },
              accentColor: { type: "string" },
              headline: { $ref: "#/$defs/layoutPosition" },
              body: { $ref: "#/$defs/layoutPosition" },
              card: { $ref: "#/$defs/layoutPosition" },
              padding: { type: "number" },
            },
            required: ["layout", "backgroundColor", "textColor", "accentColor", "headline", "body", "card", "padding"],
            additionalProperties: false,
          };

          const layoutDefs = {
            layoutPosition: layoutPositionSchema,
            formatOptimization: formatOptimizationSchema,
          };

          // Dynamic schema based on postMode
          const variationSchema = isCarousel
            ? {
                type: "object",
                properties: {
                  headline: {
                    type: "string",
                    description: "Título principal do carrossel",
                  },
                  body: {
                    type: "string",
                    description: "Descrição geral do carrossel",
                  },
                  hashtags: {
                    type: "array",
                    items: { type: "string" },
                    description: "Hashtags relevantes",
                  },
                  callToAction: {
                    type: "string",
                    description: "Call to action final do carrossel",
                  },
                  caption: {
                    type: "string",
                    description: "Legenda inicial do post. Será refinada posteriormente.",
                  },
                  tone: { type: "string", description: "Tom do post" },
                  imagePrompt: {
                    type: "string",
                    description: "Prompt em inglês para gerar imagem de fundo",
                  },
                  backgroundColor: {
                    type: "string",
                    description: "Cor de fundo hex",
                  },
                  textColor: {
                    type: "string",
                    description: "Cor do texto hex",
                  },
                  accentColor: {
                    type: "string",
                    description: "Cor de destaque hex",
                  },
                  layout: {
                    type: "string",
                    enum: ["centered", "left-aligned", "split", "minimal"],
                    description: "Layout sugerido",
                  },
                  aspectRatio: {
                    type: "string",
                    enum: ["1:1", "5:6", "9:16"],
                    description: "Proporção de aspecto",
                  },
                  slides: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        headline: {
                          type: "string",
                          description: "Título do slide",
                        },
                        body: {
                          type: "string",
                          description: "Conteúdo do slide",
                        },
                        slideNumber: {
                          type: "integer",
                          description: "Número do slide (1-5)",
                        },
                        isTitleSlide: {
                          type: "boolean",
                          description: "Se é o primeiro slide",
                        },
                        isCtaSlide: {
                          type: "boolean",
                          description: "Se é o último slide",
                        },
                      },
                      required: ["headline", "body", "slideNumber", "isTitleSlide", "isCtaSlide"],
                      additionalProperties: false,
                    },
                    minItems: CAROUSEL_SLIDE_TARGET,
                    maxItems: CAROUSEL_SLIDE_TARGET,
                    description: "Slides do carrossel (5 itens)",
                  },
                  aspectRatioOptimizations: {
                    type: "object",
                    properties: {
                      "1:1": { $ref: "#/$defs/formatOptimization" },
                      "5:6": { $ref: "#/$defs/formatOptimization" },
                      "9:16": { $ref: "#/$defs/formatOptimization" },
                    },
                    required: ["1:1", "5:6", "9:16"],
                    additionalProperties: false,
                  },
                  copyAngle: {
                    type: "object",
                    properties: {
                      type: {
                        type: "string",
                        enum: ["dor", "beneficio", "objecao", "autoridade", "escassez", "storytelling", "mito_vs_verdade"],
                      },
                      label: { type: "string" },
                      badge: { type: "string" },
                      stickerText: { type: "string" },
                    },
                    required: ["type", "label", "badge", "stickerText"],
                    additionalProperties: false,
                  },
                },
                required: [
                  "headline",
                  "body",
                  "hashtags",
                  "callToAction",
                  "caption",
                  "tone",
                  "imagePrompt",
                  "backgroundColor",
                  "textColor",
                  "accentColor",
                  "layout",
                  "aspectRatio",
                  "slides",
                  "aspectRatioOptimizations",
                  "copyAngle",
                ],
                additionalProperties: false,
              }
            : {
                type: "object",
                properties: {
                  headline: {
                    type: "string",
                    description: "Título chamativo do post",
                  },
                  body: {
                    type: "string",
                    description: "Corpo principal do post",
                  },
                  hashtags: {
                    type: "array",
                    items: { type: "string" },
                    description: "Hashtags relevantes",
                  },
                  callToAction: {
                    type: "string",
                    description: "Call to action final",
                  },
                  caption: {
                    type: "string",
                    description: "Legenda inicial do post. Será refinada posteriormente.",
                  },
                  tone: { type: "string", description: "Tom do post" },
                  imagePrompt: {
                    type: "string",
                    description: "Prompt em inglês para gerar imagem de fundo do post. Deve ser visual, artístico e relevante ao conteúdo.",
                  },
                  backgroundColor: {
                    type: "string",
                    description: "Cor de fundo hex",
                  },
                  textColor: {
                    type: "string",
                    description: "Cor do texto hex",
                  },
                  accentColor: {
                    type: "string",
                    description: "Cor de destaque hex",
                  },
                  layout: {
                    type: "string",
                    enum: ["centered", "left-aligned", "split", "minimal"],
                    description: "Layout sugerido",
                  },
                  aspectRatio: {
                    type: "string",
                    enum: ["1:1", "5:6", "9:16"],
                    description: "Proporção de aspecto: 1:1 quadrado, 5:6 retrato, 9:16 story/reels — varie entre as variações para oferecer diversidade",
                  },
                  template: {
                    type: "string",
                    enum: ["simple", "feature-grid", "numbered-list", "step-by-step"],
                    description: "Template de conteúdo estruturado. Use 'simple' para mensagens únicas, outros para conteúdo rico.",
                  },
                  sections: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        icon: {
                          type: "string",
                          description: "Nome de ícone lucide (ex: Users, Star, Zap, Heart, Globe)",
                        },
                        label: {
                          type: "string",
                          maxLength: 24,
                          description: "Título curto da seção, máximo 24 caracteres",
                        },
                        description: {
                          type: "string",
                          maxLength: 48,
                          description: "Texto de suporte opcional, máximo 48 caracteres",
                        },
                        number: {
                          type: "integer",
                          description: "Número para listas numeradas",
                        },
                      },
                      required: ["icon", "label", "description", "number"],
                      additionalProperties: false,
                    },
                    maxItems: 3,
                    description: "Use [] para template simple. Para templates estruturados, gere exatamente 3 itens curtos.",
                  },
                  aspectRatioOptimizations: {
                    type: "object",
                    properties: {
                      "1:1": { $ref: "#/$defs/formatOptimization" },
                      "5:6": { $ref: "#/$defs/formatOptimization" },
                      "9:16": { $ref: "#/$defs/formatOptimization" },
                    },
                    required: ["1:1", "5:6", "9:16"],
                    additionalProperties: false,
                  },
                  copyAngle: {
                    type: "object",
                    properties: {
                      type: {
                        type: "string",
                        enum: ["dor", "beneficio", "objecao", "autoridade", "escassez", "storytelling", "mito_vs_verdade"],
                      },
                      label: { type: "string" },
                      badge: { type: "string" },
                      stickerText: { type: "string" },
                    },
                    required: ["type", "label", "badge", "stickerText"],
                    additionalProperties: false,
                  },
                },
                required: [
                  "headline",
                  "body",
                  "hashtags",
                  "callToAction",
                  "caption",
                  "tone",
                  "imagePrompt",
                  "backgroundColor",
                  "textColor",
                  "accentColor",
                  "layout",
                  "aspectRatio",
                  "template",
                  "sections",
                  "aspectRatioOptimizations",
                  "copyAngle",
                ],
                additionalProperties: false,
              };

          const slotResponses = await Promise.all(
            generationPlan.strategies.selected.map(async (strategy, index) => {
              const slotPrompt = `${userPrompt}

TAREFA DESTE AGENTE:
- Gere somente a variacao ${index + 1} de 3.
- Execute exclusivamente este contrato estrategico:
${JSON.stringify(strategy, null, 2)}
- Nao misture os outros angulos.
- Retorne um array "variations" com exatamente 1 item.`;
              const generateSlot = async (attempt: number) => {
                const userContent =
                  input.inputType === "image" && (input.imageUrl || input.content)
                    ? [
                        {
                          type: "text" as const,
                          text:
                            attempt === 1
                              ? slotPrompt
                              : `${slotPrompt}

A tentativa anterior retornou um item ausente ou incompleto.
Preencha todos os campos obrigatorios do schema sem alterar o contrato estrategico.`,
                        },
                        {
                          type: "image_url" as const,
                          image_url: { url: input.imageUrl || input.content, detail: "high" as const },
                        },
                      ]
                    : attempt === 1
                      ? slotPrompt
                      : `${slotPrompt}

A tentativa anterior retornou um item ausente ou incompleto.
Preencha todos os campos obrigatorios do schema sem alterar o contrato estrategico.`;
                const response = await invokeLLM({
                  traceLabel: attempt === 1 ? `post_generation_${index + 1}` : `post_generation_${index + 1}_retry`,
                  taskRoute: isCarousel ? "carousel_generation" : "static_generation",
                  model: input.model as any,
                  maxCompletionTokens:
                    attempt === 1
                      ? isCarousel ? 4096 : 3072
                      : isCarousel ? 3072 : 2048,
                  messages: [
                    {
                      role: "system",
                      content: slotSystemPrompt,
                    },
                    {
                      role: "user",
                      content: userContent,
                    },
                  ],
                  response_format: {
                    type: "json_schema",
                    json_schema: {
                      name: `post_variation_${index + 1}`,
                      strict: true,
                      schema: {
                        type: "object",
                        properties: {
                          variations: {
                            type: "array",
                            minItems: 1,
                            maxItems: 1,
                            items: variationSchema,
                          },
                        },
                        required: ["variations"],
                        $defs: layoutDefs,
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
                          .filter(c => "text" in c)
                          .map(c => (c as any).text)
                          .join("\n")
                      : "{}";
                return safeJsonParse<{ variations: any[] }>(contentStr, {
                  variations: [],
                }).variations[0];
              };

              let first: any = null;
              try {
                first = await generateSlot(1);
              } catch (error) {
                recordGenerationEvent({
                  stage: `post_generation_${index + 1}`,
                  status: "rejected",
                  detail: "Slot generation failed fast; requesting one targeted retry.",
                  data: error instanceof Error ? error.message : String(error),
                });
              }
              const firstIsComplete = Boolean(
                first?.headline?.trim() &&
                  first?.body?.trim() &&
                  first?.caption?.trim() &&
                  first?.callToAction?.trim() &&
                  first?.imagePrompt?.trim() &&
                  first?.copyAngle?.type &&
                  (input.postMode === "carousel" || hasValidStaticSections(first)) &&
                  (input.postMode !== "carousel" || first?.slides?.length === CAROUSEL_SLIDE_TARGET)
              );
              if (firstIsComplete) return first;

              recordGenerationEvent({
                stage: `post_generation_${index + 1}`,
                status: "rejected",
                detail: "Slot incomplete; requesting one targeted retry.",
                data: first,
              });
              try {
                return await generateSlot(2);
              } catch (error) {
                recordGenerationEvent({
                  stage: `post_generation_${index + 1}`,
                  status: "failed",
                  detail: "Targeted retry failed; slot will be omitted.",
                  data: error instanceof Error ? error.message : String(error),
                });
                return null;
              }
            })
          );
          let variations = slotResponses
            .filter(Boolean)
            .slice(0, POST_VARIATION_TARGET)
            .map((variation) => applyDeterministicCopyGuards(variation));
          recordGenerationEvent({
            stage: "post_generation",
            status: variations.length === POST_VARIATION_TARGET ? "completed" : "rejected",
            detail: `Primary generation returned ${variations.length} variation(s).`,
            data: variations,
          });

          // --------------------------------------------------------------------------------
          // BRAND SOUL GUARDIAN — deterministic WCAG + palette enforcement
          // (Substitui o antigo `brand_visual_qa` baseado em LLM, que estava
          // falhando repetidamente: 3 aborts + Gemini 400 schema-too-complex.)
          // --------------------------------------------------------------------------------
          if (siteIntelligence && brandDnaContext.length > 0) {
            try {
              console.log("[Brand Guardian] Deterministically enforcing brand palette + WCAG contrast...");
              const beforeCount = variations.length;
              variations = enforceBrandVisualGuardian(
                variations,
                siteIntelligence,
                { enforcePalette: true, backgroundSnapTolerance: 40 },
              ) as typeof variations;
              console.log(
                "[Brand Guardian] Enforced %d variation(s) against brand palette.",
                variations.length,
              );
              recordGenerationEvent({
                stage: "brand_visual_qa",
                status: variations.length === beforeCount ? "completed" : "rejected",
                detail: "Deterministic brand visual guardian applied palette + WCAG corrections.",
                data: variations,
              });
            } catch (guardianErr) {
              console.warn("[Brand Guardian] Failing gracefully. Returning raw variations.", guardianErr);
            }
          }

          if (!normalizedExecutionBrief && variationsNeedDiversification(variations)) {
            try {
              console.warn("[Variation Guard] Similar variations detected. Requesting diversified rewrite...");
              const diversificationPrompt = `Você recebeu 3 variações de post que ficaram parecidas demais.
Reescreva o array para entregar EXATAMENTE 3 variações nitidamente diferentes entre si.

REGRAS OBRIGATÓRIAS:
- Preserve o mesmo tema central e as regras de marca já aplicadas.
- Não repita headline, body, CTA, hashtags, copyAngle, nem a mesma combinação de layout + paleta.
- Garanta pelo menos 2 layouts diferentes no conjunto final.
- Garanta ângulos de copy diferentes e facilmente distinguíveis.
- ${isCarousel ? "Se for carrossel, preserve exatamente 5 slides por variação, com narrativa completa e `slides` nunca vazio." : "Mantenha o formato estático atual."}
- Mantenha o JSON no mesmo schema exato.

Variações atuais:
${JSON.stringify(variations, null, 2)}

Responda APENAS com JSON válido.`;

              const diversificationResponse = await invokeLLM({
                traceLabel: "lexical_diversification",
                taskRoute: isCarousel ? "carousel_generation" : "static_generation",
                model: input.model as any,
                maxCompletionTokens: 4096,
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: diversificationPrompt },
                ],
                response_format: {
                  type: "json_schema",
                  json_schema: {
                    name: "post_variations_diversified",
                    strict: true,
                    schema: {
                      type: "object",
                      properties: {
                        variations: {
                          type: "array",
                          minItems: POST_VARIATION_TARGET,
                          maxItems: POST_VARIATION_TARGET,
                          items: variationSchema,
                        },
                      },
                      required: ["variations"],
                      $defs: layoutDefs,
                      additionalProperties: false,
                    },
                  },
                },
              });

              const diversifiedContent = diversificationResponse.choices[0]?.message?.content;
              const diversifiedContentStr =
                typeof diversifiedContent === "string"
                  ? diversifiedContent
                  : Array.isArray(diversifiedContent)
                    ? diversifiedContent
                        .filter(c => "text" in c)
                        .map(c => (c as any).text)
                        .join("\n")
                    : "{}";
              const diversifiedParsed = safeJsonParse<{ variations: any[] }>(diversifiedContentStr, { variations: [] });
              const diversifiedVariations = (diversifiedParsed.variations || []).slice(0, 3);

              if (diversifiedVariations.length > 0 && !variationsNeedDiversification(diversifiedVariations)) {
                if (diversifiedVariations.length === POST_VARIATION_TARGET) {
                  variations = diversifiedVariations;
                }
                console.log("[Variation Guard] Diversified variations accepted.");
                recordGenerationEvent({
                  stage: "diversification",
                  status: diversifiedVariations.length === POST_VARIATION_TARGET ? "completed" : "rejected",
                  detail: `Diversification returned ${diversifiedVariations.length} variation(s).`,
                  data: diversifiedVariations,
                });
              } else {
                console.warn("[Variation Guard] Diversification attempt still too similar. Keeping original output.");
              }
            } catch (diversificationErr) {
              console.warn("[Variation Guard] Diversification retry failed. Keeping original output.", diversificationErr);
            }
          }

          const recentPosts = await recentPostsPromise;
          const initialOriginality = await assessSemanticOriginality({
            candidates: variations as import("@shared/postspark").PostVariation[],
            siteIntelligence,
            recentPosts,
          });

          const evaluationPipeline = await evaluateAndReviseCandidates({
            candidates: variations,
            strategies: generationPlan.strategies.selected,
            siteIntelligence,
            platform: input.platform,
            originalityScores: initialOriginality.assessments.map(assessment => assessment.score),
            revise: async (candidate, evaluation, index) => {
              const revisionResponse = await invokeLLM({
                traceLabel: `quality_revision_${index + 1}`,
                taskRoute: "quality_revision",
                model: input.model as any,
                maxCompletionTokens: isCarousel ? 3072 : 2048,
                messages: [
                  {
                    role: "system",
                    content: `Voce e um revisor cirurgico do PostSpark.
Revise exatamente UMA variacao rejeitada, preservando a estrategia, o layout e a estrutura.
Corrija apenas os problemas apontados na avaliacao.
Nao reescreva do zero, nao misture estrategias, nao invente fatos e responda somente JSON valido.
COERENCIA DA LEGENDA: se houver slides ou secoes, a caption deve refletir o mesmo numero de topicos. Se os slides apresentam 5 dicas, a legenda nao deve dizer "3 dicas".`,
                  },
                  {
                    role: "user",
                    content: `Indice: ${index + 1}

Contrato estrategico:
${JSON.stringify(generationPlan.strategies.selected[index], null, 2)}

Avaliacao:
${JSON.stringify(evaluation, null, 2)}

Variacao:
${JSON.stringify(candidate, null, 2)}

Retorne um objeto com "variations" contendo exatamente 1 variacao corrigida.`,
                  },
                ],
                response_format: {
                  type: "json_schema",
                  json_schema: {
                    name: `post_variation_revised_${index + 1}`,
                    strict: true,
                    schema: {
                      type: "object",
                      properties: {
                        variations: {
                          type: "array",
                          minItems: 1,
                          maxItems: 1,
                          items: variationSchema,
                        },
                      },
                      required: ["variations"],
                      $defs: layoutDefs,
                      additionalProperties: false,
                    },
                  },
                },
              });
              const revisedContent = revisionResponse.choices[0]?.message?.content;
              const revisedText = typeof revisedContent === "string" ? revisedContent : "{}";
              return safeJsonParse<{ variations: any[] }>(revisedText, {
                variations: [],
              }).variations[0] ?? null;
            },
          });
          variations = evaluationPipeline.candidates.map((variation) =>
            applyDeterministicCopyGuards(variation),
          );

          // ─── Caption Synthesis Pass ────────────────────────────────────────
          // Gera legendas coerentes com o conteúdo visual FINAL (slides/seções)
          // em um passo dedicado, posterior a toda a pipeline de geração/revisão.
          // Isto garante que a legenda NUNCA contradiga ou invente conteúdo
          // diferente do que aparece nos slides ou seções do post visual.
          recordGenerationEvent({
            stage: "caption_synthesis",
            status: "started",
            detail: "Synthesizing captions from final visual content.",
          });
          try {
            const synthesized = await synthesizeCaptionsForVariations(
              variations,
              {
                platform: input.platform,
                tone: effectiveTone,
                strategies: generationPlan.strategies.selected,
                isCarousel,
              },
            );
            variations = synthesized.map((variation) =>
              applyDeterministicCopyGuards(variation),
            );
            recordGenerationEvent({
              stage: "caption_synthesis",
              status: "completed",
              detail: "Captions synthesized from final visual content.",
            });
          } catch (synthesisError) {
            recordGenerationEvent({
              stage: "caption_synthesis",
              status: "fallback",
              detail: "Caption synthesis failed; original captions preserved.",
              data: synthesisError instanceof Error ? synthesisError.message : String(synthesisError),
            });
          }
          const originality =
            evaluationPipeline.revisionCount > 0
              ? await assessSemanticOriginality({
                  candidates: variations as import("@shared/postspark").PostVariation[],
                  siteIntelligence,
                  recentPosts,
                })
              : initialOriginality;

          // Build DesignTokens from Chameleon Vision result if available
          const chameleonDesignTokens = siteIntelligence ? siteIntelligenceToDesignTokens(siteIntelligence) : chameleonResult ? chameleonResultToDesignTokens(chameleonResult) : undefined;

          // Map Chameleon Vision copy angles to variations
          const chameleonPosts = chameleonResult?.posts || [];

          // Generate unique IDs and return — enrich with Chameleon Vision data
          const generatedVariations = variations.map((v: any, i: number) => {
            const chameleonPost = chameleonPosts[i];
            const normalizedSlides = isCarousel ? normalizeCarouselSlides(v) : undefined;
            const baseVar: import("@shared/postspark").PostVariation = {
              id: `var-${Date.now()}-${i}`,
              ...v,
              caption: v.caption || "",
              platform: input.platform,
              hashtags: v.hashtags || [],
              postMode: input.postMode,
              slides: normalizedSlides,
              // Chameleon Vision enrichments
              ...(chameleonDesignTokens ? { designTokens: chameleonDesignTokens } : {}),
              ...(chameleonPost
                ? {
                    copyAngle: {
                      type: chameleonPost.angle,
                      label: chameleonPost.label,
                      badge: chameleonPost.badge,
                      stickerText: chameleonPost.stickerText,
                    },
                  }
                : {}),
              generationMeta: {
                creationMode: input.creationMode,
                fidelity: normalizedExecutionBrief ? "high" : "medium",
                interventionLevel: normalizedExecutionBrief?.interventionLevel,
                siteIntelligenceId: siteIntelligence?.id,
                strategyId: generationPlan.strategies.selected[i]?.id,
                revisionCount: evaluationPipeline.revisionCount,
                revisionApplied: evaluationPipeline.revisedIndexes.includes(i),
                revisionFailed: evaluationPipeline.revisionFailedIndexes.includes(i),
                evaluation: evaluationPipeline.evaluations[i],
                originality: originality.assessments[i],
              },
            } as any;
            
            // --- Injeção do Motor de Variabilidade Criativa ---
            // Passa a variação, null para intent (o motor deduz), e uma seed determinística do ID
            const seed = hashString(baseVar.id);
            const dir = directCreative(baseVar, null, seed);
            return composeVariation(baseVar, chameleonDesignTokens || {} as any);
          });
          const finalValidation = validateVariationSet(generatedVariations, input.postMode);
          recordGenerationEvent({
            stage: "final_validation",
            status: finalValidation.valid ? "completed" : "rejected",
            detail: finalValidation.valid ? "Exactly three complete and distinct variations approved." : finalValidation.errors.join("; "),
            data: finalValidation,
          });
          try {
            assertVariationSet(generatedVariations, input.postMode);
          } catch (error) {
            throw new TRPCError({
              code: "BAD_GATEWAY",
              message: "A IA não conseguiu produzir três variações válidas e distintas. Tente novamente.",
              cause: error,
            });
          }
          generationTrace.siteIntelligenceId = siteIntelligence?.id;
          await persistCandidateFingerprints({
            userUuid: ctx.user.id,
            generationRunId: generationTrace.id,
            candidates: generatedVariations,
            embeddings: originality.embeddings,
            assessments: originality.assessments,
          });
          await finishGenerationTrace({
            trace: generationTrace,
            status: "completed",
            strategies: generationPlan.strategies,
            evaluations: evaluationPipeline.evaluations,
            revisionCount: evaluationPipeline.revisionCount,
            strategyFallbackUsed: generationPlan.strategies.fallbackUsed,
            originalityFallbackUsed: originality.fallbackUsed,
            output: generatedVariations,
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
            variationCount: generatedVariations.length,
            revisionCount: evaluationPipeline.revisionCount,
            strategyFallbackUsed: generationPlan.strategies.fallbackUsed,
            originalityFallbackUsed: originality.fallbackUsed,
            finalValidation,
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
            outputSummary: generatedVariations.map(summarizeGeneratedVariation),
          });
          return {
            variations: generatedVariations,
            generationRunId: generationTrace.id,
            ...(debugEnabled
              ? {
                  debug: buildGenerationDebugTrace({
                    trace: generationTrace,
                    strategies: generationPlan.strategies,
                    evaluations: evaluationPipeline.evaluations,
                    output: generatedVariations,
                  }),
                }
              : {}),
          };
        } catch (error) {
          await finishGenerationTrace({
            trace: generationTrace,
            status: "failed",
            error: error instanceof Error ? error.message : "Generation failed",
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
          const postId = await createPost({
            ...input,
            variationSnapshot: input.variationSnapshot as any,
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
        await updatePost(input.id, ctx.user.id, { ...input, variationSnapshot: input.variationSnapshot as any });
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

function applyDeterministicCopyGuards<T extends Record<string, any>>(variation: T): T {
  const next: Record<string, any> = { ...variation };
  if (typeof next.headline === "string") next.headline = next.headline.slice(0, 60).trim();
  if (typeof next.body === "string") next.body = next.body.slice(0, 140).trim();
  if (typeof next.caption === "string") {
    next.caption = next.caption.slice(0, 1500).trim();
  }
  if (typeof next.callToAction === "string") next.callToAction = next.callToAction.slice(0, 40).trim();
  if (Array.isArray(next.hashtags)) {
    next.hashtags = next.hashtags
      .filter((item: unknown): item is string => typeof item === "string" && item.trim().startsWith("#"))
      .map((item: string) => item.trim())
      .slice(0, 4);
  }
  return next as T;
}

export type AppRouter = typeof appRouter;
