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
import { extractBrandDNA } from "./brandDNA";
import { generateThemesFromBrandDNA } from "./brandThemeGenerator";
import { evaluatePostQuality } from "./postJudge";
import { chameleonVision } from "./chameleonVision";
import { captureScreenshot } from "./screenshotService";
import { chameleonResultToDesignTokens } from "@shared/postspark";
import * as fs from "fs";
import * as path from "path";
import {
  getBillingProfile,
  debitSparks,
  getTopupPackages,
  createSubscriptionCheckout,
  createTopupCheckout,
  getSubscriptionPriceId,
  getSupabase,
  SPARK_COSTS,
} from "./billing";
import { ENV } from "./_core/env";
import { TRPCError } from "@trpc/server";
/**
 * Helper to safely parse JSON from LLM responses, handling markdown blocks and basic malformations.
 */
function safeJsonParse<T>(str: string, fallback: T): T {
  let cleaned = str.trim();

  // 1. Markdown stripping
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
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

function normalizeVariationText(value: string | undefined): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeVariationText(value: string | undefined): string[] {
  return normalizeVariationText(value)
    .split(" ")
    .filter((token) => token.length > 2);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const aSet = new Set(a);
  const bSet = new Set(b);
  let intersection = 0;

  for (const token of Array.from(aSet)) {
    if (bSet.has(token)) intersection += 1;
  }

  const union = new Set([...Array.from(aSet), ...Array.from(bSet)]).size;
  return union === 0 ? 0 : intersection / union;
}

function variationsNeedDiversification(variations: Array<any>): boolean {
  if (variations.length < 3) return true;

  for (let i = 0; i < variations.length; i++) {
    for (let j = i + 1; j < variations.length; j++) {
      const a = variations[i];
      const b = variations[j];
      const aText = tokenizeVariationText(`${a.headline} ${a.body} ${a.callToAction} ${a.caption}`);
      const bText = tokenizeVariationText(`${b.headline} ${b.body} ${b.callToAction} ${b.caption}`);
      const copySimilarity = jaccardSimilarity(aText, bText);

      const sameHeadline = normalizeVariationText(a.headline) === normalizeVariationText(b.headline);
      const sameBody = normalizeVariationText(a.body) === normalizeVariationText(b.body);
      const sameTone = normalizeVariationText(a.tone) === normalizeVariationText(b.tone);
      const sameLayout = a.layout === b.layout;
      const sameColors = a.backgroundColor === b.backgroundColor
        && a.textColor === b.textColor
        && a.accentColor === b.accentColor;

      if (sameHeadline || (sameBody && sameLayout) || (copySimilarity >= 0.78 && sameLayout) || (copySimilarity >= 0.9 && sameColors) || (sameTone && sameLayout && sameColors)) {
        return true;
      }
    }
  }

  return false;
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
      plan: z.enum(["PRO", "AGENCY"]),
      cycle: z.enum(["monthly", "annual"]).default("monthly"),
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
        let brandDnaContext = "";
        let chameleonResult: import("@shared/postspark").ChameleonVisionResult | null = null;

        // If URL, scrape it first and extract Brand DNA for visual cloning
        if (input.inputType === "url") {
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
${brandDnaContext}

REGRAS DE COPY — SIGA COM RIGOR:
- Headline: máximo 60 caracteres. Seja direto e impactante. Sem ponto final.
- Body: máximo 2 frases curtas. Máximo 100 caracteres no total. Sem rodeios.
- Caption/Legenda: texto para acompanhar o post na rede social. Máximo 300 caracteres. Engajador, complementando o conteúdo visual. Pode ter emojis moderados.
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
   - Use 'feature-grid' ou 'step-by-step' onde listagem for detectada. Default: 'simple'.

7. FLOATING CARDS & ELEMENT STYLING (NEW):
   - O card PRINCIPAL não precisa estar sempre centralizado ou ocupar 100% da tela.
   - Use o objeto "card" dentro das otimizações para criar composições dinâmicas (ex: card inclinado, card menor no canto, layout Figma/Canva).
   - Isso é especialmente útil quando o fundo (backgroundImage) é rico visualmente.
   - Use 'backgroundColor' e 'borderRadius' em 'headline' ou 'body' para criar efeitos de BADGE ou STIKER (texto com fundo colorido e cantos arredondados). Isso ajuda a destacar informações de forma "divertida" e moderna. Use cores contrastantes.
   
Responda APENAS com JSON válido.`;

        const userPrompt = input.inputType === "image"
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
            backgroundColor: { type: "string", description: "Cor de fundo opcional para o elemento (RGBA ou Hex)" },
            borderRadius: { type: "number", description: "Raio da borda em px (0-40)" }
          },
          required: ["x", "y", "width", "textAlign", "backgroundColor", "borderRadius"],
          additionalProperties: false,
        };

        const formatOptimizationSchema = {
          type: "object",
          properties: {
            layout: { type: "string", enum: ["centered", "left-aligned", "split", "minimal"] },
            backgroundColor: { type: "string" },
            textColor: { type: "string" },
            accentColor: { type: "string" },
            headline: { $ref: "#/$defs/layoutPosition" },
            body: { $ref: "#/$defs/layoutPosition" },
            card: { $ref: "#/$defs/layoutPosition" },
            padding: { type: "number" }
          },
          required: ["layout", "backgroundColor", "textColor", "accentColor", "headline", "body", "card", "padding"],
          additionalProperties: false,
        };

        const layoutDefs = {
          layoutPosition: layoutPositionSchema,
          formatOptimization: formatOptimizationSchema,
        };

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
                additionalProperties: false,
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
            },
            copyAngle: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["dor", "beneficio", "objecao", "autoridade", "escassez", "storytelling", "mito_vs_verdade"] },
                label: { type: "string" },
                badge: { type: "string" },
                stickerText: { type: "string" }
              },
              required: ["type", "label", "badge", "stickerText"],
              additionalProperties: false
            }
          },
          required: ["headline", "body", "hashtags", "callToAction", "caption", "tone", "imagePrompt", "backgroundColor", "textColor", "accentColor", "layout", "aspectRatio", "slides", "aspectRatioOptimizations", "copyAngle"],
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
            template: { type: "string", enum: ["simple", "feature-grid", "numbered-list", "step-by-step"], description: "Template de conteúdo estruturado. Use 'simple' para mensagens únicas, outros para conteúdo rico." },
            sections: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  icon: { type: "string", description: "Nome de ícone lucide (ex: Users, Star, Zap, Heart, Globe)" },
                  label: { type: "string", description: "Título curto da seção" },
                  description: { type: "string", description: "Texto de suporte opcional" },
                  number: { type: "integer", description: "Número para listas numeradas" },
                },
                required: ["icon", "label", "description", "number"],
                additionalProperties: false,
              },
              description: "Seções de conteúdo estruturado (3-5 itens). Obrigatório quando template != 'simple'.",
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
                type: { type: "string", enum: ["dor", "beneficio", "objecao", "autoridade", "escassez", "storytelling", "mito_vs_verdade"] },
                label: { type: "string" },
                badge: { type: "string" },
                stickerText: { type: "string" }
              },
              required: ["type", "label", "badge", "stickerText"],
              additionalProperties: false
            }
          },
          required: ["headline", "body", "hashtags", "callToAction", "caption", "tone", "imagePrompt", "backgroundColor", "textColor", "accentColor", "layout", "aspectRatio", "template", "sections", "aspectRatioOptimizations", "copyAngle"],
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
                $defs: layoutDefs,
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0]?.message?.content;
        const contentStr = typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content.filter(c => 'text' in c).map(c => (c as any).text).join("\n")
            : "{}";
        const parsed = safeJsonParse<{ variations: any[] }>(contentStr, { variations: [] });
        let variations = (parsed.variations || []).slice(0, 3);

        // --------------------------------------------------------------------------------
        // QA PASSPORT / BRAND SOUL GUARDIAN (Apenas ativado em clonagens de site / URL)
        // --------------------------------------------------------------------------------
        if (input.inputType === "url" && brandDnaContext.length > 0) {
          try {
            console.log("[QA Guard] Validating Brand Mimetism...");
            const qaPrompt = `Você é um Quality Assurance rigoroso de Design Visual e Acessibilidade técnica (WCAG).
O LLM Anterior gerou 3 variações de Post. O seu único objetivo é VARRER falhas e ARRUMAR o JSON.

DIRETRIZES CARDINAIS DO BRAND SOUL (Não podem ser violadas):
${brandDnaContext}

AVALIAÇÕES A FAZER EM CADA VARIAÇÃO:
1) A \`backgroundColor\` e a \`textColor\` escolhidas são EXATAMENTE (hex) derivadas das Sugeridas pela Marca acima? Se ele alocou hexes azuis num site laranja/vermelho, OVERRIDE para o laranja/vermelho sugerido.
2) O contraste WCAG entre \`backgroundColor\` e \`textColor\` é viável (>4.5:1)? Se não for (ex: texto cinza no fundo cinza, texto branco no fundo creme), inverta a cor de um deles.
3) A \`accentColor\` é chamativa dentro do Brand DNA?
4) O \`layout\` faz sentido analiticamente para o tipo de conteúdo?

Variations Originais Brutas:
${JSON.stringify(variations, null, 2)}

Retorne um JSON contendo O MESMO ARRAY, de mesmo formato, substituindo estritamente as propriedades listadas caso estejam ruins. Mantenha os textos inteiramente idênticos.
Respond APENAS COM JSON, usando o mesmo VariationSchema.`;

            const qaResponse = await invokeLLM({
              model: "gemini", // O QA pode rodar no gemini-flash fixo pela velocidade
              messages: [{ role: "user", content: qaPrompt }],
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "post_variations_qa",
                  strict: true,
                  schema: {
                    type: "object",
                    properties: {
                      variations: {
                        type: "array",
                        items: variationSchema
                      }
                    },
                    required: ["variations"],
                    $defs: layoutDefs,
                    additionalProperties: false
                  }
                }
              }
            });

            const qaContent = qaResponse.choices[0]?.message?.content;
            const qaContentStr = typeof qaContent === "string"
              ? qaContent
              : Array.isArray(qaContent)
                ? qaContent.filter(c => 'text' in c).map(c => (c as any).text).join("\n")
                : "{}";
            const qaParsed = safeJsonParse<{ variations: any[] }>(qaContentStr, { variations: [] });
            if (qaParsed.variations && qaParsed.variations.length > 0) {
              variations = qaParsed.variations.slice(0, 3);
              console.log("[QA Guard] Mimetism validation approved & patched.");
            }
          } catch (qaErr) {
            console.warn("[QA Guard] Failing gracefull. Returning raw variations.", qaErr);
          }
        }

        if (variationsNeedDiversification(variations)) {
          try {
            console.warn("[Variation Guard] Similar variations detected. Requesting diversified rewrite...");
            const diversificationPrompt = `Você recebeu 3 variações de post que ficaram parecidas demais.
Reescreva o array para entregar EXATAMENTE 3 variações nitidamente diferentes entre si.

REGRAS OBRIGATÓRIAS:
- Preserve o mesmo tema central e as regras de marca já aplicadas.
- Não repita headline, body, CTA, hashtags, copyAngle, nem a mesma combinação de layout + paleta.
- Garanta pelo menos 2 layouts diferentes no conjunto final.
- Garanta ângulos de copy diferentes e facilmente distinguíveis.
- Mantenha o JSON no mesmo schema exato.

Variações atuais:
${JSON.stringify(variations, null, 2)}

Responda APENAS com JSON válido.`;

            const diversificationResponse = await invokeLLM({
              model: input.model as any,
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
            const diversifiedContentStr = typeof diversifiedContent === "string"
              ? diversifiedContent
              : Array.isArray(diversifiedContent)
                ? diversifiedContent.filter(c => "text" in c).map(c => (c as any).text).join("\n")
                : "{}";
            const diversifiedParsed = safeJsonParse<{ variations: any[] }>(diversifiedContentStr, { variations: [] });
            const diversifiedVariations = (diversifiedParsed.variations || []).slice(0, 3);

            if (diversifiedVariations.length > 0 && !variationsNeedDiversification(diversifiedVariations)) {
              variations = diversifiedVariations;
              console.log("[Variation Guard] Diversified variations accepted.");
            } else {
              console.warn("[Variation Guard] Diversification attempt still too similar. Keeping original output.");
            }
          } catch (diversificationErr) {
            console.warn("[Variation Guard] Diversification retry failed. Keeping original output.", diversificationErr);
          }
        }

        // Build DesignTokens from Chameleon Vision result if available
        const chameleonDesignTokens = chameleonResult
          ? chameleonResultToDesignTokens(chameleonResult)
          : undefined;

        // Map Chameleon Vision copy angles to variations
        const chameleonPosts = chameleonResult?.posts || [];

        // Generate unique IDs and return — enrich with Chameleon Vision data
        return variations.map((v: any, i: number) => {
          const chameleonPost = chameleonPosts[i];
          return {
            id: `var-${Date.now()}-${i}`,
            ...v,
            caption: v.caption || "",
            platform: input.platform,
            hashtags: v.hashtags || [],
            postMode: input.postMode,
            slides: isCarousel ? (v.slides || []) : undefined,
            // Chameleon Vision enrichments
            ...(chameleonDesignTokens ? { designTokens: chameleonDesignTokens } : {}),
            ...(chameleonPost ? {
              copyAngle: {
                type: chameleonPost.angle,
                label: chameleonPost.label,
                badge: chameleonPost.badge,
                stickerText: chameleonPost.stickerText,
              },
            } : {}),
          };
        });
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
        imageSettings: z.any().optional(),
        layoutSettings: z.any().optional(),
        bgValue: z.any().optional(),
        bgOverlay: z.any().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const postId = await createPost({
          ...input,
          userUuid: ctx.user.id,
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
        imageSettings: z.any().optional(),
        layoutSettings: z.any().optional(),
        bgValue: z.any().optional(),
        bgOverlay: z.any().optional(),
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
      .query(async ({ input, ctx }) => {
        return getPostById(input.id, ctx.user.id);
      }),

    /** Generate background image via Pollinations or Gemini */
    generateBackground: protectedProcedure
      .input(z.object({
        prompt: z.string().min(1),
        provider: z.enum(['pollinations_fast', 'pollinations_hd']).default('pollinations_fast'),
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

    /** Automatically adjust layout based on current canvas */
    autoPilotDesign: protectedProcedure
      .input(z.object({
        imageBase64: z.string(),
        currentState: z.any(),
      }))
      .mutation(async ({ input }) => {
        const systemPrompt = `Você é um Diretor de Arte Sênior e Especialista em Qualidade Visual (QA) e Acessibilidade (WCAG).
Seu trabalho é avaliar a imagem logada (fotografia do render do post) com o JSON do estado atual fornecido.
O objetivo é garantir Legibilidade perfeita, Hierarquia e Margens de Respiro.

REGRAS:
1. Contraste (WCAG): Verifique se o texto está legível contra o fundo. Se o fundo na área delimitada pelo texto for muito claro, force a cor do texto para bem escuro (ex: #000000). Se o fundo for muito escuro, texto claro (ex: #FFFFFF). Use hexadecimais de estilo de acordo com a foto caso encontre uma cor que contrasta perfeitamente (color picking).
2. Layout: Sugira novas posições X e Y (em porcentagem 0-100) para evitar que o texto corte nas bordas, e mantenha alinhamento harmonioso de design premium (esquerda, centro).
CRÍTICO SOBRE X e Y: As coordenadas (x, y) representam o **CENTRO EXATO** do bloco de texto, e não o canto superior esquerdo (pois usamos \`transform: translate(-50%, -50%)\` no Frontend).
- Se você quer alinhar um bloco de \`width: 80\` à esquerda com margem de \`10%\`, o X (centro) NÃO deve ser 10, e sim \`50\` (10 de margem + 40 da metade da largura).
- Se você usar X=10 para um bloco largo, metade do bloco ficará PARA FORA da tela!
- Reflita antes de definir o X e Y, garantindo que o \`width\` inteiro caiba na tela somando/subtraindo do centro.
3. Caso o texto esteja "vazando" do card, reduza \`width\` ou reposicione o \`x\` e \`y\` (lembrando da regra do centro).
4. Retorne as coordenadas ajustadas e corrigidas, para que possamos plugar direto e o texto se alinhar graciosamente no fundo.

JSON ESTADO ATUAL:
${JSON.stringify(input.currentState, null, 2)}
`;

        const response = await invokeLLM({
          model: "gemini-2.5-flash" as any,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: "Analise a imagem e o posicionamento abaixo para gerar o JSON refatorado." },
                { type: "image_url", image_url: { url: input.imageBase64 } }
              ]
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "auto_pilot_design",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  score: { type: "number", description: "Sua nota para o design inicial (0 a 100)" },
                  feedback: { type: "string", description: "Descrição curta em português sobre o erro visível e por que você corrigiu do jeito que corrigiu." },
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
                          borderRadius: { type: "number" }
                        },
                        required: ["x", "y", "width", "textAlign", "backgroundColor", "borderRadius"],
                        additionalProperties: false
                      },
                      body: {
                        type: "object",
                        properties: {
                          x: { type: "number" },
                          y: { type: "number" },
                          width: { type: "number" },
                          textAlign: { type: "string" },
                          backgroundColor: { type: "string" },
                          borderRadius: { type: "number" }
                        },
                        required: ["x", "y", "width", "textAlign", "backgroundColor", "borderRadius"],
                        additionalProperties: false
                      },
                      textColor: { type: "string", description: "Cor HEX sugerida para todos os textos" }
                    },
                    required: ["textColor"],
                    additionalProperties: false
                  }
                },
                required: ["score", "feedback", "suggestedLayoutMoves"],
                additionalProperties: false
              }
            }
          }
        });

        const content = response.choices[0]?.message?.content;
        const contentStr = typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join("\n")
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
          .filter((d) => d.isDirectory())
          .map((dir) => {
            const catPath = path.join(bgRoot, dir.name);
            const images = fs
              .readdirSync(catPath)
              .filter((f) => /\.(webp|jpg|jpeg|png|gif|svg)$/i.test(f))
              .map((f) => `/ images / backgrounds / ${dir.name} / ${f}`);
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
          console.log(`[extractStyles] Pattern ${i + 1}: `, {
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
          console.log(`[extractStyles] Theme ${i + 1}: `, {
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

    /**
     * Extract full Brand DNA from a website URL (Tom & Matiz enhanced pipeline).
     * Multi-page screenshots + Gemini Vision + synthesis + musical composition mapping.
     * Cost: 20 Sparks (replaces the 15✦ ChameleonProtocol)
     */
    extractBrandDNA: protectedProcedure
      .input(z.object({
        url: z.string().url(),
      }))
      .mutation(async ({ input, ctx }) => {
        const email = ctx.user.email ?? "dev@local.dev";
        const profile = await getBillingProfile(email);
        const debit = await debitSparks(profile.id, 20, "Brand DNA — extração multi-página + análise visual");
        if (!debit.success) {
          throw new TRPCError({
            code: "PAYMENT_REQUIRED",
            message: "Sparks insuficientes. Faça upgrade ou adquira um pacote de recarga.",
          });
        }

        const brandDNA = await extractBrandDNA(input.url);
        const themes = generateThemesFromBrandDNA(brandDNA, input.url);

        return {
          brandDNA,
          themes,
          fallbackUsed: !brandDNA.metadata.visionUsed,
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
      .input(z.object({
        variations: z.array(z.object({
          id: z.string(),
          headline: z.string(),
          body: z.string(),
          callToAction: z.string(),
          backgroundColor: z.string(),
          textColor: z.string(),
          accentColor: z.string(),
          layout: z.string(),
          platform: z.string(),
        })),
        brandDNA: z.object({
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
        }).optional(),
      }))
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
        "Accept": "text/html",
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
