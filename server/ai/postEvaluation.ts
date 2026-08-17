import type {
  AdvancedLayoutSettings,
  AspectRatio,
  BackgroundValue,
  BgOverlaySettings,
  GenerationEvaluationSummary,
  Platform,
  PostVariation,
  SiteIntelligence,
  TextElement,
} from "@shared/postspark";
import { contrastRatio as sharedContrastRatio, effectiveBackgroundColor } from "@shared/creative/color";
import { advertisedItemCounts } from "@shared/validation";
import { createPostVisualSnapshot, projectSnapshotForSlide } from "@shared/variationSnapshot";
import { validateVisualFit, type VisualFitIssueType } from "@shared/visualFit";
import { invokeLLM } from "../_core/llm";
import { ENV } from "../_core/env";
import type { ContentStrategy } from "./contentStrategy";
import {
  jaccardSimilarity,
  tokenizeVariationText,
  type VariationDiversityInput,
} from "./variationDiversity";

export interface EvaluatedCandidate extends VariationDiversityInput {
  headline?: string;
  body?: string;
  caption?: string;
  hashtags?: string[];
  callToAction?: string;
  platform?: Platform;
  slides?: Array<{ headline?: string; body?: string }>;
  sections?: Array<{ label?: string; description?: string }>;
  // Fase 3: campos visuais para alimentar layoutIntegrity. Opcionais porque
  // o avaliador também aceita candidatos parciais (texto puro) de testes.
  template?: string;
  aspectRatio?: AspectRatio;
  layoutSettings?: AdvancedLayoutSettings;
  textElements?: TextElement[];
  // SPEC-002 passo 5: para medir contraste contra o fundo EFETIVO (imagem +
  // overlay), não só a cor sólida de fallback.
  bgValue?: BackgroundValue;
  bgOverlay?: BgOverlaySettings;
}

type Dimensions = GenerationEvaluationSummary["dimensions"];

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * SPEC-002 (docs/reforma/SPEC-002): delega para `shared/creative/color.ts`,
 * a única implementação produtiva de contraste WCAG do repositório. Este
 * wrapper preserva o contrato antigo deste módulo — `undefined`/hex inválido
 * devolve `1` (sem contraste comprovado) em vez de lançar, porque
 * `deterministicEvaluation` roda sobre candidatos gerados por IA que podem
 * trazer cor malformada; a avaliação precisa de um número, não de uma exceção.
 */
export function contrastRatio(
  foreground: string | undefined,
  background: string | undefined,
): number {
  if (!foreground || !background) return 1;
  try {
    return sharedContrastRatio(foreground, background);
  } catch {
    return 1;
  }
}

function overlapScore(value: string, reference: string): number {
  const valueTokens = tokenizeVariationText(value);
  const referenceTokens = tokenizeVariationText(reference);
  if (valueTokens.length === 0 || referenceTokens.length === 0) return 60;
  const overlap = valueTokens.filter((token) =>
    new Set(referenceTokens).has(token),
  ).length;
  return clampScore(45 + (overlap / valueTokens.length) * 80);
}

/**
 * Fase 3 — Integridade do layout (geometria visual).
 *
 * Constrói um snapshot transitório do candidato e roda validateVisualFit.
 * Como createPostVisualSnapshot aplica applyVisualFitFallback internamente,
 * validateVisualFit só vê issues NÃO-corrigíveis — se o fallback resolveu,
 * integridade é alta; se sobraram issues, penaliza por severidade.
 *
 * Penas por tipo de issue (0-100, somadas e subtraídas de 100):
 * - headline_body_overlap: grave (texto sobre texto)
 * - structured_absolute_layout: médio (template estruturado mal posicionado)
 * - card_too_narrow: médio (card corta conteúdo)
 * - text_element_outside_canvas / text_element_overlaps_copy: decorações
 */
const LAYOUT_INTEGRITY_PENALTY: Record<VisualFitIssueType, number> = {
  headline_body_overlap: 35,
  structured_absolute_layout: 25,
  card_too_narrow: 20,
  text_element_outside_canvas: 15,
  text_element_overlaps_copy: 15,
  text_exceeds_visible_area: 55,
  // SPEC-002 passo 6: menos grave que overlap/overflow de texto — o bloco
  // ainda está legível, só invade a margem de segurança (ex.: zona de UI do
  // Instagram Stories em 9:16).
  outside_safe_area: 10,
  section_overlap: 35, // mesma classe de headline_body_overlap (texto sobre texto)
  section_missing_geometry: 25, // mesma classe de structured_absolute_layout (defeito de autoria)
};

function computeLayoutIntegrity(candidate: EvaluatedCandidate): number {
  try {
    const snapshot = createPostVisualSnapshot(
      candidate as unknown as PostVariation,
      candidate.aspectRatio ?? "1:1",
    );
    // Fase A.4 — carrosséis são avaliados POR SLIDE. Projetamos cada slide
    // (merge de overrides de editorState + headline/body do slide) sobre o
    // snapshot base e validamos cada projeção. Issues de qualquer slide
    // alimentam a penalidade agregada. Referência: shadow.ts:157-186.
    const slides = snapshot.slides ?? [];
    const snapshotsToValidate = slides.length > 0
      ? slides.map((_, slideIndex) => projectSnapshotForSlide(snapshot, slideIndex))
      : [snapshot];
    const allIssues = snapshotsToValidate.flatMap((projected) => validateVisualFit(projected).issues);
    if (allIssues.length === 0) return 100;
    const totalPenalty = allIssues.reduce(
      (sum, issue) => sum + (LAYOUT_INTEGRITY_PENALTY[issue.type] ?? 10),
      0,
    );
    return clampScore(100 - totalPenalty);
  } catch {
    // Se o candidato é parcial (sem campos visuais suficientes para um
    // snapshot), assume integridade neutra para não penalizar indevidamente.
    return 75;
  }
}

export function deterministicEvaluation(input: {
  candidate: EvaluatedCandidate;
  allCandidates: EvaluatedCandidate[];
  strategy?: ContentStrategy;
  siteIntelligence?: SiteIntelligence | null;
  platform: Platform;
  originalityScore?: number;
}): GenerationEvaluationSummary {
  const { candidate, allCandidates, strategy, siteIntelligence, platform } = input;
  const fullText = `${candidate.headline ?? ""} ${candidate.body ?? ""} ${candidate.caption ?? ""} ${candidate.callToAction ?? ""}`;
  const brandReference = siteIntelligence
    ? `${siteIntelligence.business.summary} ${siteIntelligence.business.valueProposition} ${siteIntelligence.editorial.toneGuidelines.join(" ")}`
    : fullText;
  const audienceReference = strategy?.audience
    ?? siteIntelligence?.business.audiences.join(" ")
    ?? fullText;
  const objectiveReference = strategy
    ? `${strategy.topic} ${strategy.hook} ${strategy.promise}`
    : siteIntelligence?.editorial.priorityTopics.join(" ") ?? fullText;
  const evidenceText = siteIntelligence?.evidence.map((item) => item.text).join(" ") ?? "";
  const containsUnverifiedNumber =
    /\b\d+(?:[.,]\d+)?%?\b/.test(fullText) &&
    !normalizeNumbers(evidenceText).some((number) => fullText.includes(number));

  const otherSimilarities = allCandidates
    .filter((item) => item !== candidate)
    .map((item) =>
      jaccardSimilarity(
        tokenizeVariationText(fullText),
        tokenizeVariationText(
          `${item.headline ?? ""} ${item.body ?? ""} ${item.caption ?? ""}`,
        ),
      ),
    );
  const maxSimilarity = Math.max(0, ...otherSimilarities);
  const headlineLength = candidate.headline?.length ?? 0;
  const bodyLength = candidate.body?.length ?? 0;
  const captionLength = candidate.caption?.length ?? 0;
  const platformLimit =
    platform === "twitter" ? 280 : platform === "instagram" ? 2200 : 3000;
  // SPEC-002 passo 5: mede contra o fundo EFETIVO, não a cor sólida crua.
  // Fundo de imagem sem overlay opaco o bastante é "unproven" — política
  // explícita (não assumida): o score nunca pode alegar leitura perfeita
  // (100) quando não há como provar o contraste real contra a imagem.
  const effectiveBg = effectiveBackgroundColor(
    {
      backgroundType: candidate.bgValue?.type ?? "solid",
      solidColor: candidate.bgValue?.color ?? candidate.backgroundColor,
      overlayColor: candidate.bgOverlay?.color,
      overlayOpacity: candidate.bgOverlay?.opacity,
    },
    candidate.backgroundColor ?? "#000000",
  );
  const contrast = contrastRatio(candidate.textColor, effectiveBg.color);
  const UNPROVEN_READABILITY_CAP = 70;

  const dimensions: Dimensions = {
    brandAlignment: overlapScore(fullText, brandReference),
    objectiveAlignment: overlapScore(fullText, objectiveReference),
    audienceRelevance: overlapScore(fullText, audienceReference),
    factuality: containsUnverifiedNumber ? 35 : siteIntelligence ? 85 : 75,
    originality:
      input.originalityScore ?? clampScore(100 - maxSimilarity * 100),
    clarity: clampScore(
      100 -
        Math.max(0, headlineLength - 60) * 1.5 -
        Math.max(0, bodyLength - 120) * 0.8,
    ),
    platformFit: clampScore(
      100 - Math.max(0, captionLength - platformLimit) * 0.5,
    ),
    visualReadability:
      effectiveBg.basis === "unproven"
        ? Math.min(UNPROVEN_READABILITY_CAP, clampScore(contrast * 20))
        : contrast >= 4.5
          ? 100
          : clampScore(contrast * 20),
    captionCoherence: computeCaptionCoherence(candidate),
    layoutIntegrity: computeLayoutIntegrity(candidate),
  };

  return summarize(dimensions, []);
}

function normalizeNumbers(value: string): string[] {
  return value.match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? [];
}

/**
 * Calcula a coerência entre a legenda (caption) e o conteúdo visual
 * (slides ou seções) do post.
 *
 * Esta dimensão detecta discrepâncias como:
 * - Caption diz "3 dicas" quando há 5 slides
 * - Caption menciona tópicos que não aparecem nos slides
 * - Caption não referencia o conteúdo principal
 */
function computeCaptionCoherence(candidate: EvaluatedCandidate): number {
  const caption = candidate.caption?.trim() ?? "";
  if (!caption) return 40;

  // Extrair conteúdo visual
  const slides = candidate.slides ?? [];
  const sections = candidate.sections ?? [];

  let visualContent = "";
  let itemCount = 0;

  if (slides.length > 0) {
    visualContent = slides
      .map((s) => `${s.headline ?? ""} ${s.body ?? ""}`)
      .join(" ");
    itemCount = slides.length;
  } else if (sections.length > 0) {
    visualContent = sections
      .map((s) => `${s.label ?? ""} ${s.description ?? ""}`)
      .join(" ");
    itemCount = sections.length;
  } else {
    // Sem slides/seções: compara caption com headline+body
    visualContent = `${candidate.headline ?? ""} ${candidate.body ?? ""}`;
    itemCount = 1;
  }

  if (!visualContent.trim()) return 50;

  // 1. Overlap lexical entre caption e conteúdo visual
  const captionTokens = tokenizeVariationText(caption);
  const visualTokens = tokenizeVariationText(visualContent);
  const overlap = captionTokens.length > 0
    ? captionTokens.filter((t) => new Set(visualTokens).has(t)).length / captionTokens.length
    : 0;
  const overlapScore = clampScore(40 + overlap * 70);

  // 2. Detecção de discrepância de números
  // Se a caption menciona um número de itens diferente do conteúdo visual
  const captionNumbers = caption.match(/\b(\d+)\b/g)?.map(Number) ?? [];
  const relevantNumbers = captionNumbers.filter((n) => n >= 2 && n <= 20);
  let numberCoherence = 100;
  if (itemCount > 1 && relevantNumbers.length > 0) {
    const matchingNumber = relevantNumbers.some((n) => n === itemCount);
    if (!matchingNumber) {
      // Caption menciona um número diferente de itens — penalidade severa
      numberCoherence = 25;
    }
  }

  // 3. Comprimento da caption (muito curta = baixa coerência potencial)
  if (itemCount > 1 && advertisedItemCounts(candidate.headline).some((n) => n !== itemCount)) {
    numberCoherence = Math.min(numberCoherence, 20);
  }

  const lengthScore = caption.length < 80 ? 45 : caption.length > 2000 ? 80 : 90;

  // Combinação ponderada
  return clampScore(
    overlapScore * 0.45 +
    numberCoherence * 0.4 +
    lengthScore * 0.15,
  );
}

function summarize(
  dimensions: Dimensions,
  feedback: string[],
): GenerationEvaluationSummary {
  const weights: Record<keyof Dimensions, number> = {
    brandAlignment: 0.1,
    objectiveAlignment: 0.12,
    audienceRelevance: 0.09,
    factuality: 0.12,
    originality: 0.09,
    clarity: 0.07,
    platformFit: 0.05,
    visualReadability: 0.09,
    captionCoherence: 0.17,
    layoutIntegrity: 0.1,
  };
  const overallScore = clampScore(
    (Object.keys(dimensions) as Array<keyof Dimensions>).reduce(
      (sum, key) => sum + dimensions[key] * weights[key],
      0,
    ),
  );
  const accepted =
    overallScore >= 70 &&
    dimensions.factuality >= 65 &&
    dimensions.visualReadability >= 65 &&
    dimensions.objectiveAlignment >= 60 &&
    dimensions.captionCoherence >= 50 &&
    dimensions.layoutIntegrity >= 50;

  // Fase 3: feedback geométrico acionável para a revisão. Quando o layout está
  // quebrado, orienta o revisor a encurtar textos (o que reduz overflow e
  // permite que applyVisualFitFallback resolva a geometria).
  const layoutFeedback =
    dimensions.layoutIntegrity < 50
      ? [
          "Layout com sobreposicao, estouro ou texto truncado: ajuste a caixa de texto quando houver espaco; caso contrario, encurte headline/body ate todo o conteudo ficar visivel, sem reticencias.",
        ]
      : [];

  return {
    overallScore,
    accepted,
    dimensions,
    feedback: [...layoutFeedback, ...feedback],
  };
}

async function llmEvaluation(input: {
  candidate: EvaluatedCandidate;
  strategy?: ContentStrategy;
  siteIntelligence?: SiteIntelligence | null;
}): Promise<{ dimensions: Dimensions; feedback: string[] } | null> {
  if (!ENV.aiLlmJudgeEnabled) return null;

  try {
    const response = await invokeLLM({
      traceLabel: "post_evaluation",
      taskRoute: "post_evaluation",
      messages: [
        {
          role: "system",
          content: `Voce e um avaliador rigoroso de conteudo social. Avalie somente o que esta no candidato e no contexto.
Penalize afirmacoes nao sustentadas, tema generico, desalinhamento com objetivo/publico e copy semelhante a cliches.
Retorne notas 0-100 e ate 4 feedbacks objetivos.`,
        },
        {
          role: "user",
          content: `Candidato:
${JSON.stringify(input.candidate)}

Estrategia:
${JSON.stringify(input.strategy ?? null)}

Site:
${JSON.stringify(
  input.siteIntelligence
    ? {
        business: input.siteIntelligence.business,
        editorial: input.siteIntelligence.editorial,
        evidence: input.siteIntelligence.evidence,
      }
    : null,
)}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "post_generation_evaluation",
          strict: true,
          schema: {
            type: "object",
            properties: {
              dimensions: {
                type: "object",
                properties: {
                  brandAlignment: { type: "number" },
                  objectiveAlignment: { type: "number" },
                  audienceRelevance: { type: "number" },
                  factuality: { type: "number" },
                  originality: { type: "number" },
                  clarity: { type: "number" },
                  platformFit: { type: "number" },
                  visualReadability: { type: "number" },
                  captionCoherence: { type: "number" },
                  layoutIntegrity: { type: "number" },
                },
                required: [
                  "brandAlignment",
                  "objectiveAlignment",
                  "audienceRelevance",
                  "factuality",
                  "originality",
                  "clarity",
                  "platformFit",
                  "visualReadability",
                  "captionCoherence",
                  "layoutIntegrity",
                ],
                additionalProperties: false,
              },
              feedback: { type: "array", items: { type: "string" } },
            },
            required: ["dimensions", "feedback"],
            additionalProperties: false,
          },
        },
      },
    });
    const content = response.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const parsed = JSON.parse(text) as {
      dimensions: Dimensions;
      feedback: string[];
    };
    const dimensionKeys: Array<keyof Dimensions> = [
      "brandAlignment",
      "objectiveAlignment",
      "audienceRelevance",
      "factuality",
      "originality",
      "clarity",
      "platformFit",
      "visualReadability",
      "captionCoherence",
      "layoutIntegrity",
    ];
    if (
      !parsed.dimensions ||
      !dimensionKeys.every(
        (key) => typeof parsed.dimensions[key] === "number",
      ) ||
      !Array.isArray(parsed.feedback)
    ) {
      throw new Error("Judge response did not match evaluation schema");
    }
    return parsed;
  } catch (error) {
    console.warn("[postEvaluation] LLM judge unavailable:", error);
    return null;
  }
}

export async function evaluateCandidates<T extends EvaluatedCandidate>(input: {
  candidates: T[];
  strategies: ContentStrategy[];
  siteIntelligence?: SiteIntelligence | null;
  platform: Platform;
  originalityScores?: number[];
  /** Índices que já falharam na validação estrutural — não vale pagar um juiz. */
  skipJudgeIndexes?: number[];
}): Promise<GenerationEvaluationSummary[]> {
  return Promise.all(
    input.candidates.map(async (candidate, index) => {
      const deterministic = deterministicEvaluation({
        candidate,
        allCandidates: input.candidates,
        strategy: input.strategies[index],
        siteIntelligence: input.siteIntelligence,
        platform: input.platform,
        originalityScore: input.originalityScores?.[index],
      });
      if (input.skipJudgeIndexes?.includes(index)) return deterministic;
      const judged = await llmEvaluation({
        candidate,
        strategy: input.strategies[index],
        siteIntelligence: input.siteIntelligence,
      });
      if (!judged) return deterministic;

      const dimensions = Object.fromEntries(
        (Object.keys(deterministic.dimensions) as Array<keyof Dimensions>).map(
          (key) => [
            key,
            clampScore(
              deterministic.dimensions[key] * 0.45 +
                judged.dimensions[key] * 0.55,
            ),
          ],
        ),
      ) as unknown as Dimensions;
      return summarize(dimensions, judged.feedback.slice(0, 4));
    }),
  );
}

/**
 * SPEC-003 — Reaplica os scores de originalidade (embeddings) sobre avaliações
 * já computadas, recomputando o resumo e o estado `accepted` sem nova chamada
 * de juiz. Slots sem score são preservados.
 */
export function applyOriginalityToEvaluations(
  evaluations: GenerationEvaluationSummary[],
  originalityScores: number[],
): GenerationEvaluationSummary[] {
  return evaluations.map((evaluation, index) => {
    const score = originalityScores[index];
    if (score === undefined || !Number.isFinite(score)) return evaluation;
    const dimensions = {
      ...evaluation.dimensions,
      originality: clampScore(score),
    };
    return summarize(dimensions, evaluation.feedback);
  });
}
