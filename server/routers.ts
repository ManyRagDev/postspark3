import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { invokeLLM } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { createPost, getUserPosts, updatePost, getPostById } from "./db";
import { storagePut } from "./storage";
import { analyzeBrandFromUrl, generateCardThemeVariations } from "./chameleon";
import { generateBackgroundImage } from "./imageGenerateBackground";
import { extractStyleFromUrlWithMeta } from "./styleExtractor";
import { analyzeDesignPattern, generateThemesFromPatterns } from "./designPatternAnalyzer";
import * as fs from "fs";
import * as path from "path";
import {
  getBillingProfile,
  debitSparks,
  getTopupPackages,
  createSubscriptionCheckout,
  createTopupCheckout,
  getSupabase,
  SPARK_COSTS,
} from "./billing";
import { ENV } from "./_core/env";
import { TRPCError } from "@trpc/server";

// ─── Billing router ───────────────────────────────────────────────────────────
const billingRouter = router({
  /** Retorna perfil de billing do usuário logado (plano, sparks, etc.) */
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const email = ctx.user.email ?? "dev@local.dev";
    return getBillingProfile(email);
  }),

  /** Inicia trial de 7 dias (anti-abuso por e-mail + IP) */
  startTrial: protectedProcedure
    .input(z.object({
      plan: z.enum(["PRO", "AGENCY"]).default("PRO"),
    }))
    .mutation(async ({ input, ctx }) => {
      const email = ctx.user.email ?? "";
      const ip = (ctx.req.headers["x-forwarded-for"] as string | undefined)
        ?.split(",")[0]?.trim() ?? ctx.req.socket.remoteAddress ?? "0.0.0.0";

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
    .input(z.object({
      priceId: z.string(),
      successPath: z.string().default("/billing/success"),
      cancelPath: z.string().default("/pricing"),
    }))
    .mutation(async ({ input, ctx }) => {
      const email = ctx.user.email ?? "";
      const name = ctx.user.name ?? undefined;

      const profile = await getBillingProfile(email);
      if (profile.id === "no-profile" || profile.id === "error") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Perfil de billing não encontrado." });
      }

      const host = `${ctx.req.protocol}://${ctx.req.get("host")}`;
      const url = await createSubscriptionCheckout({
        profileId: profile.id,
        email,
        name,
        priceId: input.priceId,
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
    .input(z.object({
      packageId: z.string(),
      successPath: z.string().default("/billing/topup-success"),
      cancelPath: z.string().default("/billing"),
    }))
    .mutation(async ({ input, ctx }) => {
      const email = ctx.user.email ?? "";
      const name = ctx.user.name ?? undefined;

      const packages = await getTopupPackages();
      const pkg = packages.find(p => p.id === input.packageId);
      if (!pkg) throw new TRPCError({ code: "NOT_FOUND", message: "Pacote não encontrado." });

      const profile = await getBillingProfile(email);
      if (profile.id === "no-profile" || profile.id === "error") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Perfil de billing não encontrado." });
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

  /** Retorna os price IDs disponíveis (para o frontend montar o checkout) */
  getPriceIds: publicProcedure.query(() => ({
    pro: {
      monthly: ENV.stripePriceProMonthly,
      annual: ENV.stripePriceProAnnual,
    },
    agency: {
      monthly: ENV.stripePriceAgencyMonthly,
      annual: ENV.stripePriceAgencyAnnual,
    },
  })),
});

export const appRouter = router({
  system: systemRouter,
  billing: billingRouter,
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
      .input(z.object({
        inputType: z.enum(["text", "url", "image"]),
        content: z.string().min(1),
        platform: z.enum(["instagram", "twitter", "linkedin", "facebook"]),
        imageUrl: z.string().optional(),
        tone: z.string().optional(),
        postMode: z.enum(["static", "carousel"]).default("static"),
        model: z.enum(["gemini", "llama"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Debita Sparks antes de gerar
        const email = ctx.user.email ?? "dev@local.dev";
        const profile = await getBillingProfile(email);
        const cost = input.postMode === "carousel" ? SPARK_COSTS.CAROUSEL : SPARK_COSTS.GENERATE_TEXT;
        const debit = await debitSparks(profile.id, cost, `Geração de post (${input.postMode})`);
        if (!debit.success) {
          throw new TRPCError({
            code: "PAYMENT_REQUIRED",
            message: "Sparks insuficientes. Faça upgrade ou adquira um pacote de recarga.",
          });
        }
        let contextContent = input.content;

        // If URL, scrape it first
        if (input.inputType === "url") {
          try {
            const scrapeResult = await scrapeUrl(input.content);
            contextContent = `URL: ${input.content}\nTítulo: ${scrapeResult.title}\nDescrição: ${scrapeResult.description}\nConteúdo: ${scrapeResult.content}`;
          } catch {
            contextContent = `URL fornecida: ${input.content} (não foi possível extrair conteúdo, crie baseado na URL)`;
          }
        }

        const platformSpecs: Record<string, { label: string; maxChars: number }> = {
          instagram: { label: "Instagram", maxChars: 2200 },
          twitter: { label: "Twitter/X", maxChars: 280 },
          linkedin: { label: "LinkedIn", maxChars: 3000 },
          facebook: { label: "Facebook", maxChars: 63206 },
        };
        const spec = platformSpecs[input.platform];

        const toneHint = input.tone
          ? `\nTom detectado no input do usuário: "${input.tone}" — calibre o conteúdo gerado para esse estado emocional.\n`
          : "";

        // Dynamic system prompt based on postMode
        const isCarousel = input.postMode === "carousel";
        const modeInstruction = isCarousel
          ? `\nIMPORTANTE: Gere conteúdo para um CARROSSEL (múltiplos slides). Cada variação será um carrossel com 5 slides organizados em um array "slides". Cada slide deve ter: headline (título curto máx 50 caracteres), body (mensagem máx 80 caracteres), slideNumber (1-5), isTitleSlide (primeiro slide), isCtaSlide (último slide com call-to-action).`
          : "\nGere posts individuais (estático).";

        const systemPrompt = `Você é um especialista em marketing digital, design visual e criação de conteúdo para redes sociais.
Gere EXATAMENTE 3 variações de post para ${spec.label}.${modeInstruction}
Cada variação deve ter um tom diferente: 1) Profissional/Corporativo, 2) Casual/Engajador, 3) Criativo/Ousado.${toneHint}

REGRAS DE COPY — SIGA COM RIGOR:
- Headline: máximo 60 caracteres. Seja direto e impactante. Sem ponto final.
- Body: máximo 2 frases curtas. Máximo 100 caracteres no total. Sem rodeios.
- Caption/Legenda: texto para acompanhar o post na rede social. Máximo 300 caracteres. Engajador, com personalidade, complementando o conteúdo visual. Pode ter emojis moderados.
- NUNCA coloque hashtags ou emojis dentro do headline ou body.
- Hashtags: máximo 4, somente no campo separado "hashtags".
- CallToAction: máximo 40 caracteres. Verbo de ação. Ex: "Saiba mais", "Experimente agora".
- Seja conciso. Corte qualquer palavra desnecessária. Menos é mais.

PRINCÍPIOS DE DESIGN VISUAL — APLIQUE EM CADA VARIAÇÃO:

1. HIERARQUIA VISUAL (Proporção 3:2:1):
   - O headline deve ser a informação MAIS impactante (peso visual máximo).
   - O body deve complementar, nunca competir com o headline.
   - Pense no conteúdo como uma pirâmide: título grande → subtítulo médio → detalhe pequeno.

2. LAYOUT INTELIGENTE por objetivo do post:
   - "centered": Inspiração, emoção, celebração, perguntas, citações. Melhor em 1:1.
   - "left-aligned": Educação, listas, notícias, tutoriais, conteúdo informativo. Melhor em 5:6 e 9:16.
   - "split": Promoções, impacto, números, chamadas fortes. Versátil.
   - "minimal": Ultra-limpo, essencial. Para marcas que usam muito espaço vazio (white space).
   - REGRA: Varie os layouts entre as 3 variações para oferecer diversidade.

3. PSICOLOGIA DAS CORES (escolha backgroundColor e accentColor baseado no tom):
   - Tom Profissional/Corporativo: fundo neutro escuro ou azul-profundo (#1A1A2E, #16213E, #0F3460), accent azul claro ou prata.
   - Tom Casual/Engajador: fundo vibrante mas acolhedor (tons de roxo suave #6C3483, verde-esmeralda #1ABC9C, índigo #3D5A80), accent contrastante.
   - Tom Criativo/Ousado: fundo impactante (preto #0D0D0D, roxo vivo #7B2D8B, gradiente sugerido no imagePrompt), accent em laranja #FF6B35 ou amarelo-ouro #FFD700.
   - Tom Urgente/CTA forte: accent em vermelho #E74C3C ou laranja #F39C12.
   - Tom Crescimento/Natural: tons de verde (#27AE60, #2ECC71), accent dourado.

4. CONTRASTE E LEGIBILIDADE (WCAG 2.1):
   - SEMPRE garanta contraste alto: fundo escuro → textColor claro (#FFFFFF ou #F0F0F0). Fundo claro → textColor escuro (#1A1A1A ou #0D0D0D).
   - NUNCA use texto cinza médio sobre fundo cinza médio.
   - Quando imagePrompt indicar foto realista com pessoas ou paisagem, sinalize com overlay escuro no imagePrompt (ex: "with dark overlay for text readability").

6. PACOTE CRIATIVO MULTI-FORMATO (Essencial):
   - Cada variação deve ser pensada para funcionar em todos os formatos (1:1, 5:6, 9:16).
   - Preencha o objeto "aspectRatioOptimizations" com os ajustes ideais para as proporções que NÃO são a padrão da variação.
   - 9:16: Exige cores mais saturadas e layouts verticais (centered/split).
   - 5:6: Ideal para storytelling e listas (left-aligned).
   - 1:1: Foco em clareza e centralização.

Responda APENAS com JSON válido no formato especificado.`;

        const userPrompt = input.inputType === "image"
          ? `Crie posts baseados nesta imagem: ${input.imageUrl || input.content}`
          : `Crie posts baseados neste conteúdo: ${contextContent}`;

        // Dynamic schema based on postMode
        const variationSchema = isCarousel ? {
          type: "object",
          properties: {
            headline: { type: "string", description: "Título principal do carrossel" },
            body: { type: "string", description: "Descrição geral do carrossel" },
            hashtags: { type: "array", items: { type: "string" }, description: "Hashtags relevantes" },
            callToAction: { type: "string", description: "Call to action final do carrossel" },
            caption: { type: "string", description: "Legenda do post para a rede social, máximo 300 caracteres" },
            tone: { type: "string", description: "Tom do post" },
            imagePrompt: { type: "string", description: "Prompt em inglês para gerar imagem de fundo" },
            backgroundColor: { type: "string", description: "Cor de fundo hex" },
            textColor: { type: "string", description: "Cor do texto hex" },
            accentColor: { type: "string", description: "Cor de destaque hex" },
            layout: { type: "string", enum: ["centered", "left-aligned", "split", "minimal"], description: "Layout sugerido" },
            aspectRatio: { type: "string", enum: ["1:1", "5:6", "9:16"], description: "Proporção de aspecto" },
            slides: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  headline: { type: "string", description: "Título do slide" },
                  body: { type: "string", description: "Conteúdo do slide" },
                  slideNumber: { type: "integer", description: "Número do slide (1-5)" },
                  isTitleSlide: { type: "boolean", description: "Se é o primeiro slide" },
                  isCtaSlide: { type: "boolean", description: "Se é o último slide" },
                },
                required: ["headline", "body", "slideNumber", "isTitleSlide", "isCtaSlide"],
              },
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
            }
          },
          required: ["headline", "body", "hashtags", "callToAction", "caption", "tone", "imagePrompt", "backgroundColor", "textColor", "accentColor", "layout", "aspectRatio", "slides", "aspectRatioOptimizations"],
          additionalProperties: false,
        } : {
          type: "object",
          properties: {
            headline: { type: "string", description: "Título chamativo do post" },
            body: { type: "string", description: "Corpo principal do post" },
            hashtags: { type: "array", items: { type: "string" }, description: "Hashtags relevantes" },
            callToAction: { type: "string", description: "Call to action final" },
            caption: { type: "string", description: "Legenda do post para a rede social, máximo 300 caracteres" },
            tone: { type: "string", description: "Tom do post" },
            imagePrompt: { type: "string", description: "Prompt em inglês para gerar imagem de fundo do post. Deve ser visual, artístico e relevante ao conteúdo." },
            backgroundColor: { type: "string", description: "Cor de fundo hex" },
            textColor: { type: "string", description: "Cor do texto hex" },
            accentColor: { type: "string", description: "Cor de destaque hex" },
            layout: { type: "string", enum: ["centered", "left-aligned", "split", "minimal"], description: "Layout sugerido" },
            aspectRatio: { type: "string", enum: ["1:1", "5:6", "9:16"], description: "Proporção de aspecto: 1:1 quadrado, 5:6 retrato, 9:16 story/reels — varie entre as variações para oferecer diversidade" },
            aspectRatioOptimizations: {
              type: "object",
              properties: {
                "1:1": { $ref: "#/$defs/formatOptimization" },
                "5:6": { $ref: "#/$defs/formatOptimization" },
                "9:16": { $ref: "#/$defs/formatOptimization" },
              },
              required: ["1:1", "5:6", "9:16"],
              additionalProperties: false,
            }
          },
          required: ["headline", "body", "hashtags", "callToAction", "caption", "tone", "imagePrompt", "backgroundColor", "textColor", "accentColor", "layout", "aspectRatio", "aspectRatioOptimizations"],
          additionalProperties: false,
        };

        const response = await invokeLLM({
          model: input.model as any,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "post_variations",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  variations: {
                    type: "array",
                    items: variationSchema,
                  },
                },
                required: ["variations"],
                $defs: {
                  formatOptimization: {
                    type: "object",
                    properties: {
                      layout: { type: "string", enum: ["centered", "left-aligned", "split", "minimal"] },
                      backgroundColor: { type: "string" },
                      textColor: { type: "string" },
                      accentColor: { type: "string" },
                      headlineFontSize: { type: "number" },
                      bodyFontSize: { type: "number" },
                    },
                    required: ["layout", "backgroundColor", "textColor", "accentColor", "headlineFontSize", "bodyFontSize"],
                    additionalProperties: false,
                  }
                },
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0]?.message?.content;
        let contentStr = typeof content === "string" ? content.trim() : "{}";
        if (contentStr.startsWith("```json")) {
          contentStr = contentStr.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
        } else if (contentStr.startsWith("```")) {
          contentStr = contentStr.replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
        }

        const parsed = JSON.parse(contentStr || "{}");
        const variations = (parsed.variations || []).slice(0, 3);

        // Generate unique IDs and return
        return variations.map((v: any, i: number) => ({
          id: `var-${Date.now()}-${i}`,
          ...v,
          caption: v.caption || "",
          platform: input.platform,
          hashtags: v.hashtags || [],
          postMode: input.postMode,
          slides: isCarousel ? (v.slides || []) : undefined,
        }));
      }),

    /** Generate image for a post */
    generateImage: protectedProcedure
      .input(z.object({
        prompt: z.string().min(1),
      }))
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
      .input(z.object({
        url: z.string().url(),
      }))
      .mutation(async ({ input }) => {
        return scrapeUrl(input.url);
      }),

    /** Save a post to the database */
    save: protectedProcedure
      .input(z.object({
        inputType: z.string(),
        inputContent: z.string(),
        platform: z.string(),
        headline: z.string().optional(),
        body: z.string().optional(),
        hashtags: z.array(z.string()).optional(),
        callToAction: z.string().optional(),
        tone: z.string().optional(),
        imagePrompt: z.string().optional(),
        imageUrl: z.string().optional(),
        backgroundColor: z.string().optional(),
        textColor: z.string().optional(),
        accentColor: z.string().optional(),
        layout: z.string().optional(),
        postMode: z.string().optional(),
        slides: z.array(z.any()).optional(),
        textElements: z.array(z.any()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const postId = await createPost({
          userId: ctx.user.id,
          ...input,
        });
        return { id: postId };
      }),

    /** Update a post */
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        headline: z.string().optional(),
        body: z.string().optional(),
        hashtags: z.array(z.string()).optional(),
        callToAction: z.string().optional(),
        imageUrl: z.string().optional(),
        backgroundColor: z.string().optional(),
        textColor: z.string().optional(),
        accentColor: z.string().optional(),
        layout: z.string().optional(),
        postMode: z.string().optional(),
        slides: z.array(z.any()).optional(),
        textElements: z.array(z.any()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await updatePost(input.id, ctx.user.id, input);
        return { success: true };
      }),

    /** List user's posts */
    list: protectedProcedure.query(async ({ ctx }) => {
      return getUserPosts(ctx.user.id);
    }),

    /** Get single post */
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getPostById(input.id);
      }),

    /** Generate background image via Pollinations or Gemini */
    generateBackground: protectedProcedure
      .input(z.object({
        prompt: z.string().min(1),
        provider: z.enum(['pollinations', 'gemini']).default('pollinations'),
      }))
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

    /** List curated background images grouped by category */
    listBackgrounds: publicProcedure.query(() => {
      const bgRoot = path.join(process.cwd(), "client", "public", "images", "backgrounds");

      try {
        const categories = fs
          .readdirSync(bgRoot, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((dir) => {
            const catPath = path.join(bgRoot, dir.name);
            const images = fs
              .readdirSync(catPath)
              .filter((f) => /\.(webp|jpg|jpeg|png|gif|svg)$/i.test(f))
              .map((f) => `/images/backgrounds/${dir.name}/${f}`);
            return { id: dir.name, name: dir.name, images };
          })
          .filter((c) => c.images.length > 0);

        return categories;
      } catch {
        return [];
      }
    }),

    /** Analyze brand from URL and return theme variations */
    analyzeBrand: protectedProcedure
      .input(z.object({
        url: z.string().url(),
      }))
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
      .input(z.object({
        url: z.string().url(),
      }))
      .mutation(async ({ input }) => {
        console.log("[extractStyles] ==========================================");
        console.log("[extractStyles] Starting extraction for:", input.url);
        console.log("[extractStyles] Timestamp:", new Date().toISOString());

        // Step 1: Extract raw style data (HTML + Vision hybrid pipeline)
        console.log("[extractStyles] Step 1: Running hybrid extraction pipeline...");
        const { data: extractedData, visionUsed } = await extractStyleFromUrlWithMeta(input.url);
        console.log("[extractStyles] Palette found:", extractedData.colors.palette.length, "colors");
        console.log("[extractStyles] Vision used:", visionUsed);
        console.log("[extractStyles] Colors:", {
          primary: extractedData.colors.primary,
          background: extractedData.colors.background,
          accent: extractedData.colors.accent,
          palette: extractedData.colors.palette,
        });

        // Check if extraction returned default values (indicates failure)
        const defaultColors = new Set(["#6366f1", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"]);
        const realColors = extractedData.colors.palette.filter(c => !defaultColors.has(c));
        const fallbackUsed = realColors.length === 0;
        if (fallbackUsed) {
          console.log("[extractStyles] FALLBACK: No real colors extracted (SPA/empty detected)");
        }

        // Step 2: Analyze design patterns using LLM
        console.log("[extractStyles] Step 2: Analyzing design patterns...");
        const designPatterns = await analyzeDesignPattern(extractedData, input.url);
        console.log("[extractStyles] Patterns returned:", designPatterns.length);
        designPatterns.forEach((p, i) => {
          console.log(`[extractStyles] Pattern ${i + 1}:`, {
            name: p.name,
            category: p.category,
            confidence: p.confidence,
            suggestedColors: p.suggestedColors,
          });
        });

        // Step 3: Generate temporary themes from patterns
        console.log("[extractStyles] Step 3: Generating themes...");
        const themes = generateThemesFromPatterns(designPatterns, extractedData, input.url);
        console.log("[extractStyles] Generated themes:", themes.length);
        themes.forEach((t, i) => {
          console.log(`[extractStyles] Theme ${i + 1}:`, {
            id: t.id,
            label: t.label,
            category: t.category,
            colors: t.colors,
          });
        });
        console.log("[extractStyles] ==========================================");

        return {
          extractedData,
          designPatterns,
          themes,
          fallbackUsed,
          visionUsed,
        };
      }),
  }),
});

/** Helper: scrape URL for metadata */
async function scrapeUrl(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PostSpark/1.0)",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });
    const html = await response.text();

    const getMetaContent = (html: string, property: string): string => {
      const patterns = [
        new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, "i"),
        new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']*)["']`, "i"),
        new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`, "i"),
      ];
      for (const p of patterns) {
        const m = html.match(p);
        if (m?.[1]) return m[1];
      }
      return "";
    };

    const title = getMetaContent(html, "og:title") ||
      (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "").trim();
    const description = getMetaContent(html, "og:description") ||
      getMetaContent(html, "description");
    const imageUrl = getMetaContent(html, "og:image");
    const siteName = getMetaContent(html, "og:site_name");

    // Extract text content (simplified)
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyHtml = bodyMatch?.[1] || "";
    const textContent = bodyHtml
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000);

    return {
      title,
      description,
      imageUrl: imageUrl || undefined,
      siteName: siteName || undefined,
      content: textContent,
    };
  } catch {
    return {
      title: url,
      description: "",
      content: `Conteúdo da URL: ${url}`,
    };
  }
}

export type AppRouter = typeof appRouter;
