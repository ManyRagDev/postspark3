/**
 * SPEC-003 — Orquestrador canônico de geração de variações.
 *
 * `post.generate` torna-se uma borda fina; toda a topologia de geração vive
 * aqui, com dependências injetáveis (provider, clock, persistência, trace).
 *
 * Orçamento de chamadas (parte do contrato):
 * - caminho feliz: exatamente 1 chamada generativa (copy/caption/slides);
 * - caminho com reparo: no máximo 1 chamada generativa adicional, contendo
 *   APENAS os slots rejeitados (estrutura, qualidade ou diversidade);
 * - retries de transporte/provider ficam registrados no trace (attempt>1);
 * - embeddings/originalidade rodam em paralelo e nunca reescrevem copy.
 *
 * Estados de saída discriminados até a borda:
 * - "approved": snapshots válidos entregues (rejeição de qualidade residual
 *   fica marcada em generationMeta, como o produto sempre fez);
 * - "rejected": conjunto inválido após o reparo (refund na borda);
 * - "failed": falha operacional (deadline, provider, parse) (refund na borda).
 */

import type {
  AspectRatio,
  CreativeExecutionBrief,
  DesignTokens,
  GenerationDebugEvent,
  GenerationEvaluationSummary,
  Platform,
  PostVariation,
  PostVisualSnapshot,
  SiteIntelligence,
} from "@shared/postspark";
import type { InvokeParams, InvokeResult } from "../_core/llm";
import type { PostRecord } from "../db";
import {
  applyDeterministicCopyGuards,
  hasCoherentStaticItemCount,
  hasRequiredCopy,
  hasValidStaticSections,
} from "@shared/validation";
import { createPostVisualSnapshot } from "@shared/variationSnapshot";
import { composeVisualDiversityPlan } from "@shared/creative";
import { CAROUSEL_SLIDE_TARGET, POST_VARIATION_TARGET, validateVariationSet } from "./generationValidation";
import { variationsNeedDiversification } from "./variationDiversity";
import { enforceBrandVisualGuardian } from "./brandVisualGuardian";
import { synthesizeCaptionDeterministic } from "./captionSynthesis";
import {
  applyOriginalityToEvaluations,
  deterministicEvaluation,
  evaluateCandidates,
} from "./postEvaluation";
import { validateRevisedCandidate } from "./revisionValidation";
import type { ContentStrategyPlan } from "./contentStrategy";
import type { PreparedGenerationPlan } from "./generationPipeline";
import { siteIntelligenceToDesignTokens, siteIntelligenceToPrompt } from "../siteIntelligence";
import { extractTextContent, safeJsonParse } from "./llmJson";
import type { OriginalityResult } from "./semanticOriginality";
import { fontkitMeasurer } from "@shared/typography/fontkitMeasurer";
import { setTypographyMeasurer } from "@shared/typography/measurer";

// O servidor resolve tipografia com fonte real (Fontkit + fontes em disco).
// O cliente nunca configura medidor: consome snapshots v4 já resolvidos.
setTypographyMeasurer(fontkitMeasurer);

// ─── Contrato de saída ───────────────────────────────────────────────────────

export interface GenerationMetrics {
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  /** Chamadas generativas de copy/caption/slides (main + repair). */
  generativeCalls: number;
  /** Chamadas de reparo (0 ou 1). */
  repairCalls: number;
  /** Juízes LLM invocados (0 quando aiLlmJudgeEnabled=false). */
  evaluationCalls: number;
  /** Chamadas de embedding/originalidade (0 ou 1). */
  embeddingCalls: number;
  /** Retries de transporte registrados no trace (via attempt>1). */
  transportRetries: number;
  /** Fallbacks acionados (estratégia, caption, originalidade). */
  fallbacks: string[];
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  deadlineMs: number | null;
  exceededDeadline: boolean;
}

export interface GenerationIssue {
  slot: number | "set";
  type: "missing_slot" | "incomplete_slot" | "invalid_set" | "quality" | "diversity";
  detail: string;
}

export type GenerationFailureKind = "deadline" | "provider" | "parse" | "internal";

export interface GenerationFailure {
  kind: GenerationFailureKind;
  message: string;
  cause?: unknown;
}

export type GenerationOutcome =
  | {
      status: "approved";
      runId: string;
      snapshots: PostVisualSnapshot[];
      evaluations: GenerationEvaluationSummary[];
      originality: OriginalityResult;
      plan: PreparedGenerationPlan;
      metrics: GenerationMetrics;
    }
  | {
      status: "rejected";
      runId: string;
      issues: GenerationIssue[];
      metrics: GenerationMetrics;
    }
  | {
      status: "failed";
      runId: string;
      error: GenerationFailure;
      metrics: GenerationMetrics;
    };

// ─── Dependências injetáveis ─────────────────────────────────────────────────

export interface OrchestratorTrace {
  id: string;
  recordEvent(event: Omit<GenerationDebugEvent, "at">): void;
}

export interface OrchestratorDeps {
  generate: (params: InvokeParams) => Promise<InvokeResult>;
  clock: () => number;
  assessOriginality: (input: {
    candidates: PostVariation[];
    siteIntelligence?: SiteIntelligence | null;
    recentPosts?: PostRecord[];
  }) => Promise<OriginalityResult>;
  loadRecentPosts: (userUuid: string, limit: number) => Promise<PostRecord[]>;
  trace: OrchestratorTrace;
}

// ─── Entrada ─────────────────────────────────────────────────────────────────

export interface GenerationRequest {
  inputType: "text" | "url" | "image";
  content: string;
  platform: Platform;
  imageUrl?: string;
  tone?: string;
  postMode: "static" | "carousel";
  model?: "gemini" | "llama";
  creationMode: "ideation" | "execution";
}

export interface ExecutionBriefContext {
  creationMode: "execution";
  format: string;
  platform: Platform;
  objective: string;
  tone?: string;
  callToAction?: string;
  interventionLevel: "visual_only" | "light_optimize" | "optimize_structure";
  contentSourceType: string;
  rawInput: string;
  slides: Array<{ slideNumber: number; rawText: string; role?: string; locked?: boolean }>;
  mustKeep: string[];
  mustInclude: string[];
  forbiddenTerms: string[];
  notes?: string;
  brandInput?: {
    websiteUrl?: string;
    logoUrl?: string;
    referenceImageUrl?: string;
    brandColors?: string[];
    fontHint?: string;
    adaptationMode: string;
  };
}

export interface OrchestratorInput {
  userUuid: string;
  request: GenerationRequest;
  siteIntelligence: SiteIntelligence | null;
  executionBrief: ExecutionBriefContext | null;
  plan: PreparedGenerationPlan;
  aiLlmJudgeEnabled: boolean;
  deadlineMs: number | null;
}

// ─── Estado interno de uma variação parseada ─────────────────────────────────

type ParsedVariation = Partial<PostVariation>;

interface MutableMetrics extends Omit<GenerationMetrics, "startedAt" | "finishedAt" | "durationMs"> {
  startedAt: number;
  finishedAt?: number;
}


/**
 * Remove qualquer resquício ou frase robótica de assistente virtual
 * que possa vazar no final ou início da legenda gerada por LLMs.
 */
export function cleanAIFillerFromCaption(caption: string): string {
  if (!caption) return "";
  let text = caption;

  const aiPhrases = [
    /(\n*|\s*)(espero que (essas dicas|este conteúdo|este post|isso) (te |lhe )?ajude.*)/gi,
    /(\n*|\s*)(se precisar de mais (dicas|informações|ajuda|conteúdo|estratégias).*)/gi,
    /(\n*|\s*)(estou (sempre )?aqui para (ajudar|o que precisar|tirar dúvidas).*)/gi,
    /(\n*|\s*)(qualquer dúvida(,| )*(estou à disposição|conte comigo|deixe nos comentários|é só chamar).*)/gi,
    /(\n*|\s*)(se tiver (alguma )?dúvida(,| )*(estou à disposição|deixe abaixo|me chame).*)/gi,
    /(\n*|\s*)(vamos juntos nessa jornada.*)/gi,
    /(\n*|\s*)(não se esqueça de salvar e me dizer o que achou.*)/gi,
    /^(aqui está (uma|a|o) (estratégia|post|legenda|conteúdo|opção).*:\s*)/gi,
    /^(neste post (vamos|eu vou|você vai) (ver|aprender|descobrir).*:\s*)/gi,
  ];

  for (const pattern of aiPhrases) {
    text = text.replace(pattern, "");
  }

  return text.trim();
}

// ─── Métricas ────────────────────────────────────────────────────────────────

function createMetrics(deadlineMs: number | null, now: number): MutableMetrics {
  return {
    startedAt: now,
    generativeCalls: 0,
    repairCalls: 0,
    evaluationCalls: 0,
    embeddingCalls: 0,
    transportRetries: 0,
    fallbacks: [],
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    deadlineMs,
    exceededDeadline: false,
  };
}

function addCallMetrics(metrics: MutableMetrics, result: InvokeResult): void {
  metrics.promptTokens += result.usage?.prompt_tokens ?? 0;
  metrics.completionTokens += result.usage?.completion_tokens ?? 0;
  metrics.totalTokens += result.usage?.total_tokens ?? 0;
  metrics.estimatedCostUsd += result.usage?.cost ?? 0;
}

function finishMetrics(metrics: MutableMetrics, now: number): GenerationMetrics {
  const finishedAt = now;
  return {
    ...metrics,
    finishedAt,
    durationMs: finishedAt - metrics.startedAt,
  };
}

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Captions abaixo deste tamanho são substituídas pelo fallback determinístico. */
const CAPTION_MIN_LENGTH = 40;

// ─── Construção de prompts (movido da borda; agora chamada única) ────────────

function buildExecutionBriefContext(brief: ExecutionBriefContext): string {
  const slidesBlock =
    brief.slides.length > 0
      ? brief.slides
          .map(
            (slide) =>
              `Slide ${slide.slideNumber} [${slide.role || "custom"}${slide.locked ? ", travado" : ""}]: ${slide.rawText}`,
          )
          .join("\n")
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

function buildGenerationInstructionCore(input: {
  isCarousel: boolean;
  executionBrief: ExecutionBriefContext | null;
  toneHint: string;
  brandDnaContext: string;
  promptContext: string;
}): string {
  const { isCarousel, executionBrief } = input;
  const modeInstruction = executionBrief
    ? isCarousel
      ? `\nIMPORTANTE: Gere conteúdo para um CARROSSEL de execução guiada. Cada variação DEVE ter exatamente 5 slides organizados em "slides". Preserve a estrutura fornecida pelo usuário sempre que ela existir. Slide 1 = gancho, slides 2-4 = desenvolvimento, slide 5 = CTA final. Não coloque CTA nos slides 1-4.`
      : "\nIMPORTANTE: Gere uma peça de execução guiada, fiel ao briefing, com baixa distância entre as variações."
    : isCarousel
      ? `\nIMPORTANTE: Gere conteúdo para um CARROSSEL (múltiplos slides). Cada variação DEVE ter exatamente 5 slides organizados em um array "slides". Não retorne array vazio, parcial ou simplificado. Estrutura obrigatória do carrossel: slide 1 = gancho forte e altamente curioso para fazer a pessoa folhear; slides 2, 3 e 4 = desenvolvimento progressivo do tema; slide 5 = CTA final, e somente ele deve conter call-to-action. Não coloque CTA nos slides 1-4. Cada slide deve ter: headline (título curto máx 50 caracteres), body (mensagem máx 80 caracteres), slideNumber (1-5), isTitleSlide (true apenas no slide 1), isCtaSlide (true apenas no slide 5). O headline/body de nível superior são apenas um resumo do carrossel; o conteúdo principal vive nos slides.`
      : "\nGere posts individuais (estático).";

  const executionSystemContext = executionBrief
    ? `
MODO DE EXECUÇÃO ATIVADO:
- Você NÃO está criando do zero. Você está executando um briefing.
- Preserve a intenção, a estrutura, o CTA e os termos obrigatórios enviados pelo usuário.
- Se houver slides fornecidos, trate-os como material fonte prioritário.
- Não reescreva agressivamente sem necessidade.
- O nível de intervenção permitido é: ${executionBrief.interventionLevel}.
- Gere EXATAMENTE ${POST_VARIATION_TARGET} variações próximas entre si. Varie principalmente acabamento visual, microcopy e hierarquia, não o conceito central.
- Se o nível for "visual_only", mantenha o texto quase intacto.
- Se o nível for "light_optimize", melhore clareza, ritmo e impacto sem alterar a estrutura principal.
- Se o nível for "optimize_structure", você pode reorganizar trechos, mas sem trair a mensagem central.
`
    : "";

  const copyRules = `
CATÁLOGO DOS 8 ARQUÉTIPOS VISUAIS DISPONÍVEIS (SELEÇÃO INTELIGENTE):
Para cada uma das 3 variações geradas, selecione no campo "familyId" o arquétipo que melhor traduza a psicologia e nicho do post.
⚠️ REGRA OBRIGATÓRIA: As 3 variações DEVEM usar 3 "familyId" TOTALMENTE DIFERENTES entre si (nunca repita a mesma família no mesmo conjunto de 3).

1. "editorial-poster" ➔ Luxo, consultoria, moda, gastronomia, finanças. (Serifas elegantes, Playfair Display, aspas decorativas).
2. "glass-veil" ➔ Inovação, SaaS, tecnologia, modernidade. (Cartão translúcido flutuante de vidro fosco com borda iluminada).
3. "chromatic-block" ➔ Impacto direto, marketing de resposta rápida, varejo, notícias urgentes. (Sticker angular rotacionado, Anton massiva).
4. "brutal-split" ➔ Alto contraste, educação, comparações 'antes/depois', hacks de produtividade. (Divisão 50/50 em duas cores puras com selo central).
5. "stroke-impact" ➔ Lifestyle, fitness, música, moda streetwear, eventos. (Títulos com palavras vazadas em contorno stroke outline).
6. "cyber-glitch" ➔ Cripto, inteligência artificial, desenvolvimento, segurança, futuro. (Miras táticas +, scanlines, estética terminal).
7. "cinematic-depth" ➔ Narrativas profundas, cinema, cultura, storytelling denso. (Tipografia monumental condensada em camadas).
8. "duotone-wash" ➔ Criatividade, design, psicologia, autoridade suave. (Gradiente diagonal a 135° com composição limpa).

DIRETRIZES DE COPYWRITING SUPER PREMIUM (ZERO VÍCIOS DE IA & QUIET AUTHORITY):

1. PERSONA E POSTURA (ALTA AUTORIDADE SILENCIOSA):
   - Escreva na voz de um DIRETOR / FUNDADOR / EDITORIALISTA SÊNIOR que domina profundamente o ofício e fala de igual para igual com pessoas inteligentes.
   - O tom é calmo, analítico, afiado e seguro de si. Quem realmente tem autoridade não precisa forçar entusiasmo, não usa pontos de exclamação (!) e não recorre a suspense barato.

2. A REGRA DE ORDEM DIRETA (FIM DA ANTÍTESE VICIADA):
   - Declare toda ideia na ordem afirmativa direta: Sujeito ➔ Verbo ➔ Predicado/Impacto.
   - NUNCA estruture frases negando uma premissa para só depois fazer uma revelação (proibido o padrão "Não é X, é Y", "O segredo não é o produto, é..."). Declare a verdade positiva imediatamente com solidez.

3. O TESTE DA SUBSTITUIÇÃO UNIVERSAL (DENSIDADE FACTUAL OBRIGATÓRIA):
   - Critério mandatório de validação: Se a sua copy puder ser aplicada a outro nicho trocando apenas uma palavra, ela foi reprovada por ser vazia e genérica.
   - O post DEVE conter pelo menos um elemento tátil, sintoma físico observável, unidade de medida, erro operacional prático ou critério técnico do nicho em questão.

4. ELIMINAÇÃO DE GATILHOS MEME & VÍCIOS SINTÉTICOS:
   - 🚫 PROIBIDO suspense artificial e meta-anúncios ("e isso muda tudo", "aqui vai o pulo do gato", "prepare-se", "o que ninguém te conta", "spoiler", "pare agora").
   - 🚫 PROIBIDO tom de assistente ("Espero ter ajudado", "Se precisar estou aqui", "Comente aqui embaixo").
   - 🚫 PROIBIDO preâmbulos conversacionais ("Neste post eu vou te mostrar", "Hoje eu trouxe uma reflexão"). Vá direto ao ponto.
   - 🚫 PROIBIDO vazar nomes técnicos de estratégia no texto final (NUNCA escreva "— objeção comum", "[dor]", "gatilho" no headline ou body).

5. AS 3 MATRIZES COGNITIVAS OBRIGATÓRIAS (UMA PARA CADA VARIAÇÃO):
   - Variação 1 ➔ O DIAGNÓSTICO DO SINTOMA OCULTO:
     Identifique um hábito ou detalhe do cotidiano que parece inocente ou comum, mas que na verdade revela um processo ineficiente ou amador. Aponte a causa invisível.
   - Variação 2 ➔ O CRITÉRIO DE JULGAMENTO TÉCNICO:
     Apresente a régua prática de corte ou regra de avaliação que veteranos e profissionais sêniores usam nos bastidores para diferenciar o bom do excelente.
   - Variação 3 ➔ A RELAÇÃO CAUSA-EFEITO CONTRAINTUITIVA:
     Mostre onde o esforço comum é desperdiçado e qual ajuste específico de fundamentos gera o resultado de longo prazo.

6. REGRAS POR CAMPO:
   - Headline: máximo 65 caracteres. Título conciso, provocativo e magnético. Sem ponto final.
   - Body: 1 a 3 frases densas (máx 200 caracteres). Complementa o headline com precisão e densidade de informação.
     • Se o post for uma lista ou número (ex: "3 sinais", "3 erros", "3 critérios"), entregue os pontos estruturados diretamente no body com marcadores limpos: "1. [Item A]  •  2. [Item B]  •  3. [Item C]".
   - Caption/Legenda: Legenda completa pronta para publicação no Instagram/LinkedIn com formatação e respiros reais:
     • Gancho de abertura provocativo que expande o título sem repetir o texto do card;
     • Conflito / Causa raiz da dor ou mecanismo em debate;
     • 2 ou 3 tópicos estratégicos com quebras de linha duplas;
     • CTA maduro e profissional (ex: "Qual é o padrão que a sua marca quer consolidar?", "Salve para consultar no próximo alinhamento.").
   - NUNCA coloque hashtags ou emojis dentro do headline ou body.
   - Hashtags: máximo 4, somente no campo separado "hashtags".
   - CallToAction: máximo 40 caracteres com verbo de ação direto.

7. HIERARQUIA VISUAL E LAYOUT:
   - "centered": Para princípios de autoridade, citações nobres e teses contraintuitivas.
   - "left-aligned": Para diagnósticos, tutoriais e listas condensadas.
   - Varie o campo "layout" entre as 3 variações para que cada uma ofereça uma diagramação visual única!
   - Em posts estáticos normais, use 'simple' em template e passe [] em sections, mantendo o conteúdo rico no headline e body.

Responda APENAS com JSON válido.`;

  return `${modeInstruction}
${executionBrief ? `As ${POST_VARIATION_TARGET} variações devem ser próximas entre si e altamente fiéis ao briefing.` : `As 3 variações DEVEM seguir as 3 matrizes cognitivas: 1) Diagnóstico do Sintoma Oculto, 2) Critério de Julgamento Técnico, 3) Causa-Efeito Contraintuitiva.`}${input.toneHint}
${input.brandDnaContext}
${executionSystemContext}
${input.promptContext}
${copyRules}`;
}

function buildSystemPrompt(input: {
  platformLabel: string;
  isCarousel: boolean;
  executionBrief: ExecutionBriefContext | null;
  toneHint: string;
  brandDnaContext: string;
  promptContext: string;
}): string {
  const core = buildGenerationInstructionCore({
    isCarousel: input.isCarousel,
    executionBrief: input.executionBrief,
    toneHint: input.toneHint,
    brandDnaContext: input.brandDnaContext,
    promptContext: input.promptContext,
  });
  return `Você é um especialista em marketing digital, design visual e criação de conteúdo para redes sociais.
Gere EXATAMENTE ${POST_VARIATION_TARGET} variações de post para ${input.platformLabel}.
${core}`;
}

function buildUserPrompt(input: {
  request: GenerationRequest;
  executionBrief: ExecutionBriefContext | null;
  contextContent: string;
}): { content: InvokeParams["messages"][number]["content"] } {
  const userPrompt = input.executionBrief
    ? `Execute este briefing com fidelidade. Otimize apenas no grau permitido.

${buildExecutionBriefContext(input.executionBrief)}`
    : input.request.inputType === "image"
      ? `Crie posts baseados nesta imagem: ${input.request.imageUrl || input.request.content}`
      : `Crie posts baseados neste conteúdo: ${input.contextContent}`;

  if (input.request.inputType === "image") {
    // CR-008: o bloco de imagem só entra quando existe uma URL VÁLIDA — um
    // input "image" com descrição textual (sem imagem de referência) é texto
    // puro. Enviar o conteúdo como `image_url` faz o provider rejeitar com
    // 400 (invalid_value) em TODO run.
    const imageUrl = input.request.imageUrl;
    const isValidImageUrl =
      typeof imageUrl === "string" && /^(https?:\/\/|data:image\/)/i.test(imageUrl.trim());
    if (isValidImageUrl) {
      return {
        content: [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: imageUrl.trim(), detail: "high" } },
        ],
      };
    }
    return { content: userPrompt };
  }
  return { content: userPrompt };
}

// ─── Schemas de resposta ─────────────────────────────────────────────────────

function formatOptimizationSchema() {
  return {
    type: "object",
    properties: {
      layout: { type: "string", enum: ["centered", "left-aligned", "split", "minimal"] },
      backgroundColor: { type: "string" },
      textColor: { type: "string" },
      accentColor: { type: "string" },
    },
    required: ["layout", "backgroundColor", "textColor", "accentColor"],
    additionalProperties: false,
  };
}

function variationSchema(isCarousel: boolean): Record<string, unknown> {
  const commonProperties: Record<string, unknown> = {
    headline: { type: "string", description: "Título principal do post" },
    body: { type: "string", description: "Corpo principal do post" },
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
      description: "Legenda final do post, coerente com o conteúdo visual.",
    },
    tone: { type: "string", description: "Tom do post" },
    imagePrompt: {
      type: "string",
      description: "Prompt em inglês para gerar imagem de fundo do post. Deve ser visual, artístico e relevante ao conteúdo.",
    },
    backgroundColor: { type: "string", description: "Cor de fundo hex" },
    textColor: { type: "string", description: "Cor do texto hex" },
    accentColor: { type: "string", description: "Cor de destaque hex" },
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
          icon: { type: "string", description: "Nome de ícone lucide (ex: Users, Star, Zap, Heart, Globe)" },
          label: { type: "string", maxLength: 24, description: "Título curto da seção, máximo 24 caracteres" },
          description: { type: "string", maxLength: 36, description: "Texto de suporte opcional, máximo 36 caracteres" },
          number: { type: "integer", description: "Número para listas numeradas" },
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
    // `badge`/`stickerText` NÃO são gerados pelo LLM: são ornamentos visuais,
    // não estratégia de copy. Gerados aqui, o modelo só tinha acesso à copy
    // que ele mesmo acabou de escrever e ecoava uma palavra dela (headline
    // "…com confiança" → badge "Confiança"), somando zero informação e uma
    // camada de texto a mais no card. A identidade de marca real é
    // `brandMeta` (logo + brandName, via BrandOverlay); o selo avulso continua
    // disponível como entrada MANUAL no Workbench (FontColorBlock/CopyEditorPanel).
    copyAngle: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["dor", "beneficio", "objecao", "autoridade", "escassez", "storytelling", "mito_vs_verdade"],
        },
        label: { type: "string" },
      },
      required: ["type", "label"],
      additionalProperties: false,
    },
  };

  if (isCarousel) {
    return {
      type: "object",
      properties: {
        ...commonProperties,
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
          minItems: CAROUSEL_SLIDE_TARGET,
          maxItems: CAROUSEL_SLIDE_TARGET,
          description: "Slides do carrossel (5 itens)",
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
        "slides",
        "aspectRatioOptimizations",
        "copyAngle",
      ],
      additionalProperties: false,
    };
  }

  return {
    type: "object",
    properties: {
      ...commonProperties,
      sections: commonProperties.sections,
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
}

function buildVariationsSchema(
  isCarousel: boolean,
  count: number,
  schemaName: string,
): InvokeParams["response_format"] {
  return {
    type: "json_schema",
    json_schema: {
      name: schemaName,
      strict: true,
      schema: {
        type: "object",
        properties: {
          variations: {
            type: "array",
            minItems: count,
            maxItems: count,
            items: variationSchema(isCarousel),
          },
        },
        required: ["variations"],
        $defs: {
          formatOptimization: formatOptimizationSchema(),
        },
        additionalProperties: false,
      },
    },
  };
}

// ─── Validação por slot ──────────────────────────────────────────────────────

/**
 * SPEC-006 — Remove caracteres de controle que PostgREST/Postgres rejeitam
 * em JSONB (ex.: `\u0000` emitido literalmente pelo LLM). Preserva \n \r \t.
 * Aplicado recursivamente a toda variação antes da composição/persistência.
 */
export function stripUnsupportedControlChars(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripUnsupportedControlChars(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, stripUnsupportedControlChars(item)]),
    );
  }
  return value;
}

function collectSlotIssues(variation: ParsedVariation | null, isCarousel: boolean, index: number): string[] {
  if (!variation) {
    return [`slot ${index + 1} ausente na resposta do modelo`];
  }
  const issues: string[] = [];
  if (!hasRequiredCopy(variation)) {
    issues.push(`slot ${index + 1} com copy obrigatório incompleto (headline, body, caption, CTA ou imagePrompt)`);
  }
  if (!variation.copyAngle?.type || !variation.copyAngle.label) {
    issues.push(`slot ${index + 1} sem copyAngle completo`);
  }
  if (!isCarousel) {
    if (!hasValidStaticSections(variation)) {
      issues.push(`slot ${index + 1} com sections inválidas (simple sem seções ou estruturado com exatamente 3)`);
    }
    if (!hasCoherentStaticItemCount(variation)) {
      issues.push(`slot ${index + 1} com contagem de itens incoerente entre headline e sections`);
    }
  }
  if (isCarousel && (variation.slides?.length ?? 0) !== CAROUSEL_SLIDE_TARGET) {
    issues.push(`slot ${index + 1} com ${variation.slides?.length ?? 0} slides (esperado ${CAROUSEL_SLIDE_TARGET})`);
  }
  return issues;
}

function normalizeCarouselSlides(variation: ParsedVariation): Array<Record<string, unknown>> {
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

function buildFallbackCarouselSlides(variation: ParsedVariation): Array<Record<string, unknown>> {
  const baseHeadline = String(variation?.headline || "Resumo");
  const baseBody = String(variation?.body || "").trim();
  const callToAction = String(variation?.callToAction || "Saiba mais").trim();
  const bodyParts = baseBody
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
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

// ─── Reparo ──────────────────────────────────────────────────────────────────

function buildRepairPrompt(input: {
  request: GenerationRequest;
  executionBrief: ExecutionBriefContext | null;
  siteIntelligence: SiteIntelligence | null;
  isCarousel: boolean;
  targets: number[];
  issuesBySlot: Map<number, string[]>;
  qualityFeedbackBySlot: Map<number, string[]>;
  diversityDirective: boolean;
  variations: ParsedVariation[];
  contextContent: string;
}): string {
  const reasons = input.targets
    .map((slotIndex) => {
      const structural = input.issuesBySlot.get(slotIndex) ?? [];
      const quality = input.qualityFeedbackBySlot.get(slotIndex) ?? [];
      const allReasons = [...structural, ...quality];
      const current = input.variations[slotIndex] ? JSON.stringify(input.variations[slotIndex], null, 2) : "(slot ausente)";
      return `SLOT ${slotIndex + 1}:
- Motivos da rejeição: ${allReasons.length > 0 ? allReasons.join("; ") : "falha na validação de qualidade"}
- Conteúdo atual: ${current}`;
    })
    .join("\n\n");

  const diversityDirective = input.diversityDirective
    ? `
DIVERSIDADE: o conjunto ficou parecido demais. Reescreva os slots listados para que fiquem nitidamente distintos entre si:
- Não repita headline, body, CTA, hashtags, copyAngle, nem a mesma combinação de layout + paleta.
- Garanta pelo menos 2 layouts diferentes no conjunto final.
- Garanta ângulos de copy diferentes e facilmente distinguíveis.
${input.isCarousel ? "- Preserve exatamente 5 slides por variação de carrossel, com narrativa completa." : ""}`
    : "";

  const brandContext = input.siteIntelligence
    ? `REGRA DE MARCA: respeite a identidade visual extraída (cores, paleta e WCAG) já aplicada.`
    : "";

  const userContent = `Você recebeu ${input.targets.length} variação(ões) rejeitada(s) de um conjunto de ${POST_VARIATION_TARGET} variações do mesmo post.

${input.executionBrief ? `Execute este briefing com fidelidade. Otimize apenas no grau permitido.\n\n${buildExecutionBriefContext(input.executionBrief)}` : `Tema: ${input.contextContent.slice(0, 3000)}`}

SLOTS REJEITADOS (reescreva SOMENTE estes):
${reasons}
${diversityDirective}
${brandContext}

REGRAS:
- Responda com um objeto "variations" contendo EXATAMENTE ${input.targets.length} item(ns), na ordem dos slots listados acima.
- Mantenha o mesmo schema e o tema central; não altere slots que não foram listados.
- Preencha todos os campos obrigatórios.
- Responda APENAS com JSON válido.`;

  return userContent;
}

// ─── Orquestração principal ──────────────────────────────────────────────────

function parseMainResponse(content: string): ParsedVariation[] {
  const parsed = safeJsonParse<{ variations?: unknown }>(content, { variations: [] });
  const raw = Array.isArray(parsed.variations) ? (parsed.variations as unknown[]) : [];
  return raw
    .slice(0, POST_VARIATION_TARGET)
    .map((item) => (item && typeof item === "object" ? (item as ParsedVariation) : null))
    .concat(Array.from({ length: Math.max(0, POST_VARIATION_TARGET - raw.length) }, () => null)) as ParsedVariation[];
}

function applyBrandGuardian(
  variations: ParsedVariation[],
  siteIntelligence: SiteIntelligence | null,
): ParsedVariation[] {
  if (!siteIntelligence) return variations;
  try {
    const beforeCount = variations.length;
    const guarded = enforceBrandVisualGuardian(
      variations as PostVariation[],
      siteIntelligence,
      { enforcePalette: true, backgroundSnapTolerance: 40 },
    ) as unknown as ParsedVariation[];
    return guarded.length === beforeCount ? guarded : variations;
  } catch (error) {
    console.warn("[Brand Guardian] Failing gracefully. Returning raw variations.", error);
    return variations;
  }
}

function buildComposition(input: {
  variations: ParsedVariation[];
  isCarousel: boolean;
  request: GenerationRequest;
  executionBrief: ExecutionBriefContext | null;
  siteIntelligence: SiteIntelligence | null;
  plan: PreparedGenerationPlan;
  evaluations: GenerationEvaluationSummary[];
  originality: OriginalityResult;
  revisionCount: number;
  revisedIndexes: number[];
  revisionFailedIndexes: number[];
  clock: () => number;
}): PostVariation[] {
  const chameleonDesignTokens = input.siteIntelligence
    ? siteIntelligenceToDesignTokens(input.siteIntelligence)
    : undefined;
  const executionBrief = input.request.creationMode === "execution" ? input.executionBrief : null;

  return input.variations.map((variation, index) => {
    const normalizedSlides = input.isCarousel ? normalizeCarouselSlides(variation) : undefined;
    // A variação parseada é dado não confiável da borda LLM; o alargamento
    // para PostVariation acontece aqui, no único ponto de entrada do snapshot.
    const baseVar = {
      id: `var-${input.clock()}-${index}`,
      ...variation,
      caption: cleanAIFillerFromCaption(variation.caption || ""),
      // Ornamentos nascem VAZIOS e o render já é silencioso com string vazia
      // (`renderTopBar`/`renderBottomBar` em PostCardV2). O usuário preenche
      // manualmente no Workbench quando quiser um selo.
      ...(variation.copyAngle
        ? {
            copyAngle: {
              ...variation.copyAngle,
              badge: variation.copyAngle.badge ?? "",
              stickerText: variation.copyAngle.stickerText ?? "",
            },
          }
        : {}),
      platform: input.request.platform,
      hashtags: variation.hashtags || [],
      postMode: input.request.postMode,
      slides: normalizedSlides as PostVariation["slides"],
      ...(chameleonDesignTokens ? { designTokens: chameleonDesignTokens } : {}),
      generationMeta: {
        creationMode: input.request.creationMode,
        fidelity: executionBrief ? "high" : "medium",
        interventionLevel: executionBrief?.interventionLevel,
        siteIntelligenceId: input.siteIntelligence?.id,
        strategyId: input.plan.strategies.selected[index]?.id,
        revisionCount: input.revisionCount,
        revisionApplied: input.revisedIndexes.includes(index),
        revisionFailed: input.revisionFailedIndexes.includes(index),
        evaluation: input.evaluations[index],
        originality: input.originality.assessments[index],
      },
    } as PostVariation;
    return baseVar;
  });
}

export async function generatePostVariations(
  input: OrchestratorInput,
  deps: OrchestratorDeps,
): Promise<GenerationOutcome> {
  const metrics = createMetrics(input.deadlineMs, deps.clock());
  const { request, siteIntelligence, executionBrief, plan } = input;
  const isCarousel = request.postMode === "carousel";
  const platformSpecs: Record<Platform, { label: string }> = {
    instagram: { label: "Instagram" },
    twitter: { label: "Twitter/X" },
    linkedin: { label: "LinkedIn" },
    facebook: { label: "Facebook" },
  };
  const spec = platformSpecs[request.platform];
  const effectiveTone = executionBrief?.tone || request.tone;
  const toneHint = effectiveTone ? `\nTom detectado no input do usuário: "${effectiveTone}" — calibre o conteúdo gerado para esse estado emocional.\n` : "";
  const brandDnaContext = siteIntelligence ? siteIntelligenceToPrompt(siteIntelligence) : "";
  const contextContent = request.content;

  const deadlineExceeded = (): boolean => {
    if (input.deadlineMs === null) return false;
    const exceeded = deps.clock() > input.deadlineMs;
    if (exceeded) metrics.exceededDeadline = true;
    return exceeded;
  };

  const recordEvent = (stage: string, status: "started" | "completed" | "rejected" | "failed" | "fallback", detail: string, data?: unknown) => {
    deps.trace.recordEvent({ stage, status, detail, data });
  };

  recordEvent("orchestrator", "started", `Orchestrating ${request.postMode} generation (${request.creationMode}).`);

  if (input.plan.strategies.fallbackUsed) {
    metrics.fallbacks.push("strategy_deterministic");
  }

  try {
    // ── 1. Chamada generativa principal (única) ─────────────────────────────
    if (deadlineExceeded()) {
      return { status: "failed", runId: deps.trace.id, error: { kind: "deadline", message: "Deadline excedido antes da chamada principal." }, metrics: finishMetrics(metrics, deps.clock()) };
    }

    const systemPrompt = buildSystemPrompt({
      platformLabel: spec.label,
      isCarousel,
      executionBrief,
      toneHint,
      brandDnaContext,
      promptContext: plan.promptContext,
    });
    const { content: userContent } = buildUserPrompt({ request, executionBrief, contextContent });

    let mainResponse: InvokeResult;
    try {
      mainResponse = await deps.generate({
        traceLabel: "post_generation",
        taskRoute: isCarousel ? "carousel_generation" : "static_generation",
        model: request.model,
        maxCompletionTokens: isCarousel ? 12000 : 9000,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        response_format: buildVariationsSchema(isCarousel, POST_VARIATION_TARGET, "post_variations"),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordEvent("post_generation", "failed", `Main generation call failed: ${message}`);
      return { status: "failed", runId: deps.trace.id, error: { kind: "provider", message, cause: error }, metrics: finishMetrics(metrics, deps.clock()) };
    }
    metrics.generativeCalls += 1;
    addCallMetrics(metrics, mainResponse);

    if (deadlineExceeded()) {
      return { status: "failed", runId: deps.trace.id, error: { kind: "deadline", message: "Deadline excedido após a chamada principal." }, metrics: finishMetrics(metrics, deps.clock()) };
    }

    const content = extractTextContent(mainResponse.choices[0]?.message?.content);
    let variations = parseMainResponse(content);
    variations = variations.map((variation) =>
      variation ? (stripUnsupportedControlChars(variation) as ParsedVariation) : null,
    ) as ParsedVariation[];
    if (variations.every((variation) => variation === null)) {
      recordEvent("post_generation", "failed", "Main call returned no parseable variations.");
      return { status: "failed", runId: deps.trace.id, error: { kind: "parse", message: "Resposta principal não retornou variações parseáveis." }, metrics: finishMetrics(metrics, deps.clock()) };
    }
    recordEvent("post_generation", "completed", `Primary generation returned ${variations.filter(Boolean).length} variation(s).`);

    // ── 2. Validação estrutural por slot ────────────────────────────────────
    const issuesBySlot = new Map<number, string[]>();
    variations.forEach((variation, index) => {
      const issues = collectSlotIssues(variation, isCarousel, index);
      if (issues.length > 0) issuesBySlot.set(index, issues);
    });

    // ── 3. Originalidade (paralela) + avaliação de qualidade ────────────────
    const recentPosts = await deps.loadRecentPosts(input.userUuid, 20).catch(() => [] as PostRecord[]);
    const originalityPromise = deps
      .assessOriginality({
        candidates: variations.filter((v): v is PostVariation => v !== null) as PostVariation[],
        siteIntelligence,
        recentPosts,
      })
      .catch(
        (error): OriginalityResult => ({
          assessments: variations.filter(Boolean).map(() => ({ score: 50, maxCandidateSimilarity: 0, maxSiteSimilarity: 0, maxHistorySimilarity: 0, closestSource: "none", fallbackUsed: true })),
          embeddings: [],
          fallbackUsed: true,
        }),
      );

    metrics.embeddingCalls += 1;
    // Slots ausentes (null) são avaliados como candidatos vazios: a rejeição
    // estrutural já está registrada; aqui só evitamos crash na avaliação.
    const evaluatedCandidates = variations.map(
      (variation) => (variation ?? {}) as PostVariation,
    );
    let evaluations = await evaluateCandidates({
      candidates: evaluatedCandidates,
      strategies: plan.strategies.selected,
      siteIntelligence,
      platform: request.platform,
      originalityScores: undefined,
      skipJudgeIndexes: Array.from(issuesBySlot.keys()),
    });
    metrics.evaluationCalls += input.aiLlmJudgeEnabled
      ? variations.length - issuesBySlot.size
      : 0;

    const originality = await originalityPromise;
    if (originality.fallbackUsed) metrics.fallbacks.push("originality");
    const originalityScores = originality.assessments.map((assessment) => assessment.score);
    evaluations = applyOriginalityToEvaluations(evaluations, originalityScores);
    recordEvent("originality", originality.fallbackUsed ? "fallback" : "completed", `Originality assessed (${originality.assessments.length} assessments).`);
    recordEvent("quality_evaluation", evaluations.every((evaluation) => evaluation.accepted) ? "completed" : "rejected", `Evaluation round: ${evaluations.filter((evaluation) => evaluation.accepted).length}/${evaluations.length} accepted.`);

    // ── 4. Alvos de reparo (estrutura ∪ qualidade ∪ diversidade) ────────────
    const qualityFeedbackBySlot = new Map<number, string[]>();
    const structuralTargets = Array.from(issuesBySlot.keys());
    const qualityTargets = evaluations
      .map((evaluation, index) => (evaluation.accepted ? -1 : index))
      .filter((index) => index >= 0);
    qualityTargets.forEach((index) => {
      qualityFeedbackBySlot.set(index, evaluations[index].feedback.slice(0, 3));
    });
    const needsDiversity = variations.every((variation) => variation !== null) && variationsNeedDiversification(variations as PostVariation[]);
    const repairTargets = needsDiversity
      ? [0, 1, 2]
      : Array.from(new Set([...structuralTargets, ...qualityTargets])).sort((a, b) => a - b);

    // ── 5. Reparo único (no máximo 1 chamada generativa) ────────────────────
    const revisedIndexes: number[] = [];
    const revisionFailedIndexes: number[] = [];
    let revisionCount = 0;

    if (repairTargets.length > 0) {
      if (deadlineExceeded()) {
        return { status: "failed", runId: deps.trace.id, error: { kind: "deadline", message: "Deadline excedido antes do reparo." }, metrics: finishMetrics(metrics, deps.clock()) };
      }
      // Orçamento do reparo: o timeout da rota de geração/revisão é 60 s
      // (OPENROUTER_TASK_POLICY em server/_core/llm.ts). Sem essa folga, entrar
      // no reparo só garante estourar o deadline e devolver 504 — melhor
      // entregar o conjunto atual, que já passou pela validação estrutural.
      const REPAIR_BUDGET_MS = 60_000;
      const hasRepairBudget =
        input.deadlineMs === null || input.deadlineMs === undefined || deps.clock() + REPAIR_BUDGET_MS <= input.deadlineMs;
      if (!hasRepairBudget && input.deadlineMs !== null && input.deadlineMs !== undefined) {
        metrics.fallbacks.push("repair_skipped_deadline");
        recordEvent("repair", "fallback", "Reparo pulado: orçamento restante menor que o timeout da rota.");
      }
      if (hasRepairBudget) {
        recordEvent("repair", "started", `Repairing ${repairTargets.length} slot(s): ${repairTargets.map((i) => i + 1).join(", ")}`);

      const repairSystemPrompt = `Você é um revisor cirúrgico do PostSpark.
Revise exatamente as variações listadas pelo usuário, preservando a estratégia, o layout e a estrutura.
Corrija apenas os problemas apontados. Não reescreva do zero, não misture estratégias, não invente fatos e responda somente JSON válido.
COERENCIA DA LEGENDA: se houver slides ou secoes, a caption deve refletir o mesmo numero de topicos. Se os slides apresentam 5 dicas, a legenda nao deve dizer "3 dicas".
COERENCIA DO HEADLINE: em post estatico estruturado, o headline nao pode prometer 5, 7 ou 10 itens quando o visual tem exatamente 3 secoes. Reformule sem numero ou prometa 3.`;

      const repairUserPrompt = buildRepairPrompt({
        request,
        executionBrief,
        siteIntelligence,
        isCarousel,
        targets: repairTargets,
        issuesBySlot,
        qualityFeedbackBySlot,
        diversityDirective: needsDiversity,
        variations,
        contextContent,
      });

      let repairResponse: InvokeResult | undefined;
      try {
        repairResponse = await deps.generate({
          traceLabel: "generation_repair",
          taskRoute: isCarousel ? "carousel_generation" : "static_generation",
          model: request.model,
          // Mesmo orçamento por slot da chamada principal (9000/3 estático,
          // 12000/3 carrossel): o reparo de diversidade reescreve os 3 slots.
          maxCompletionTokens: Math.min(
            isCarousel ? 12000 : 9000,
            Math.max(2048, (isCarousel ? 4000 : 3000) * repairTargets.length),
          ),
          messages: [
            { role: "system", content: repairSystemPrompt },
            { role: "user", content: repairUserPrompt },
          ],
          response_format: buildVariationsSchema(isCarousel, repairTargets.length, "post_variations_repair"),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        recordEvent("repair", "failed", `Repair call failed: ${message}`);
        metrics.fallbacks.push("repair_failed");
      }
      if (repairResponse) {
        metrics.generativeCalls += 1;
        metrics.repairCalls += 1;
        addCallMetrics(metrics, repairResponse);
        if (deadlineExceeded()) {
          return { status: "failed", runId: deps.trace.id, error: { kind: "deadline", message: "Deadline excedido após o reparo." }, metrics: finishMetrics(metrics, deps.clock()) };
        }

        const repairContent = extractTextContent(repairResponse.choices[0]?.message?.content);
        const repaired = safeJsonParse<{ variations?: unknown }>(repairContent, { variations: [] });
        const repairedItems = Array.isArray(repaired.variations)
          ? (repaired.variations as unknown[]).map((item) => stripUnsupportedControlChars(item))
          : [];
        const candidateSet = [...variations];

        repairTargets.forEach((slotIndex, position) => {
          const rawItem = repairedItems[position];
          const candidate = rawItem && typeof rawItem === "object" ? (rawItem as ParsedVariation) : null;
          if (!candidate) {
            revisionFailedIndexes.push(slotIndex);
            return;
          }
          const guarded = applyDeterministicCopyGuards(candidate);
          const validated = validateRevisedCandidate({
            candidate: guarded as PostVariation,
            candidateIndex: slotIndex,
            candidates: candidateSet as PostVariation[],
            postMode: request.postMode,
            siteIntelligence,
          });
          const stillBroken = collectSlotIssues(validated.candidate as ParsedVariation, isCarousel, slotIndex).length > 0;
          if (validated.errors.length > 0 || stillBroken) {
            recordEvent("repair", "rejected", `Slot ${slotIndex + 1} repair rejected: ${validated.errors.join("; ")}`);
            revisionFailedIndexes.push(slotIndex);
            return;
          }
          candidateSet[slotIndex] = validated.candidate as ParsedVariation;
          revisedIndexes.push(slotIndex);
          revisionCount += 1;
        });
        variations = candidateSet;
      }

      // Reavaliação determinística dos slots reparados (sem novo juiz LLM).
      const repairedSet = variations as PostVariation[];
      revisedIndexes.forEach((slotIndex) => {
        evaluations[slotIndex] = deterministicEvaluation({
          candidate: repairedSet[slotIndex] as PostVariation,
          allCandidates: repairedSet,
          strategy: plan.strategies.selected[slotIndex],
          siteIntelligence,
          platform: request.platform,
          originalityScore: originalityScores[slotIndex],
        });
      });
        recordEvent("repair", revisedIndexes.length > 0 ? "completed" : "rejected", `Repair applied to ${revisedIndexes.length} slot(s); failed for ${revisionFailedIndexes.length}.`);
      }
    }

    // ── 6. Fallback determinístico de caption ───────────────────────────────
    const captionFallbackSlots: number[] = [];
    variations = variations.map((variation, index) => {
      if (variation && String(variation.caption ?? "").trim().length < CAPTION_MIN_LENGTH) {
        captionFallbackSlots.push(index);
        return { ...variation, caption: synthesizeCaptionDeterministic(variation, request.platform) };
      }
      return variation;
    });
    if (captionFallbackSlots.length > 0) {
      metrics.fallbacks.push(`caption_deterministic_slots:${captionFallbackSlots.join(",")}`);
      recordEvent("caption_synthesis", "fallback", `Deterministic captions applied for slots ${captionFallbackSlots.map((i) => i + 1).join(", ")}.`);
    }

    // ── 7. Composição visual + snapshots + validação final ──────────────────
    // Slides fabricados por fallback (carrossel incompleto que sobreviveu ao
    // reparo) são identificados no trace e passam pelas mesmas validações.
    if (isCarousel) {
      const carouselFallbackSlots: number[] = [];
      variations.forEach((variation, index) => {
        if (variation && (variation.slides?.length ?? 0) < CAROUSEL_SLIDE_TARGET) {
          carouselFallbackSlots.push(index);
        }
      });
      if (carouselFallbackSlots.length > 0) {
        metrics.fallbacks.push(`carousel_slide_fabrication:${carouselFallbackSlots.join(",")}`);
        recordEvent(
          "carousel_slide_fabrication",
          "fallback",
          `Slides fabricados deterministicamente para slots ${carouselFallbackSlots.map((i) => i + 1).join(", ")}.`,
        );
      }
    }
    variations = applyBrandGuardian(variations, siteIntelligence);
    const compositionInputs = buildComposition({
      variations,
      isCarousel,
      request,
      executionBrief,
      siteIntelligence,
      plan,
      evaluations,
      originality,
      revisionCount,
      revisedIndexes,
      revisionFailedIndexes,
      clock: deps.clock,
    });
    const chameleonDesignTokens = siteIntelligence ? siteIntelligenceToDesignTokens(siteIntelligence) : undefined;
    const visualDiversity = composeVisualDiversityPlan(
      compositionInputs,
      (chameleonDesignTokens ?? {}) as DesignTokens,
      { brandLocked: Boolean(chameleonDesignTokens) },
    );
    const generatedVariations = visualDiversity.variations;
    recordEvent("visual_diversity_plan", visualDiversity.plan.issues.length === 0 ? "completed" : "fallback", visualDiversity.plan.issues.length === 0 ? `Composed ${visualDiversity.plan.layouts.length} layouts across ${visualDiversity.plan.familyIds.length} creative families.` : visualDiversity.plan.issues.join("; "));

    const frozenSnapshots = generatedVariations.map((variation) =>
      createPostVisualSnapshot(variation, variation.aspectRatio ?? ("1:1" as AspectRatio)),
    );
    const unresolvedSlots = frozenSnapshots
      .map((snapshot, index) => (snapshot.resolvedTypography ? -1 : index))
      .filter((index) => index >= 0);
    if (unresolvedSlots.length > 0) {
      metrics.fallbacks.push(`typography_unresolved_slots:${unresolvedSlots.join(",")}`);
      recordEvent(
        "typography_resolution",
        "fallback",
        `Slots sem tipografia resolvida: ${unresolvedSlots.map((i) => i + 1).join(", ")}.`,
      );
    }
    const finalValidation = validateVariationSet(frozenSnapshots, request.postMode);
    recordEvent("final_validation", finalValidation.valid ? "completed" : "rejected", finalValidation.valid ? "Exactly three complete and distinct variations approved." : finalValidation.errors.join("; "));

    if (!finalValidation.valid) {
      const issues: GenerationIssue[] = finalValidation.errors.map((detail) => ({
        slot: "set",
        type: detail.includes("distinct") ? "diversity" : "invalid_set",
        detail,
      }));
      const rejectedMetrics = finishMetrics(metrics, deps.clock());
      recordEvent("generation_metrics", "completed", `Rejected run: ${JSON.stringify(rejectedMetrics)}`, rejectedMetrics);
      return { status: "rejected", runId: deps.trace.id, issues, metrics: rejectedMetrics };
    }

    recordEvent("orchestrator", "completed", `Generation approved with ${metrics.generativeCalls} generative call(s), ${metrics.repairCalls} repair(s).`);
    const approvedMetrics = finishMetrics(metrics, deps.clock());
    recordEvent("generation_metrics", "completed", `Approved run: ${JSON.stringify(approvedMetrics)}`, approvedMetrics);

    return {
      status: "approved",
      runId: deps.trace.id,
      snapshots: frozenSnapshots,
      evaluations,
      originality,
      plan,
      metrics: approvedMetrics,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "failed", runId: deps.trace.id, error: { kind: "internal", message, cause: error }, metrics: finishMetrics(metrics, deps.clock()) };
  }
}
