import type {
  GenerationEvaluationSummary,
  Platform,
  SiteIntelligence,
} from "@shared/postspark";
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
}

export interface EvaluationPipelineResult<T extends EvaluatedCandidate> {
  candidates: T[];
  evaluations: GenerationEvaluationSummary[];
  revisionCount: number;
  revisedIndexes: number[];
  revisionFailedIndexes: number[];
}

type Dimensions = GenerationEvaluationSummary["dimensions"];

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hexToRgb(hex: string | undefined): [number, number, number] | null {
  if (!hex) return null;
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

function luminance(rgb: [number, number, number]): number {
  const values = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}

export function contrastRatio(
  foreground: string | undefined,
  background: string | undefined,
): number {
  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);
  if (!fg || !bg) return 1;
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
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

function deterministicEvaluation(input: {
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
  const contrast = contrastRatio(
    candidate.textColor,
    candidate.backgroundColor,
  );

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
    visualReadability: contrast >= 4.5 ? 100 : clampScore(contrast * 20),
    captionCoherence: computeCaptionCoherence(candidate),
  };

  return summarize(dimensions, []);
}

function normalizeNumbers(value: string): string[] {
  return value.match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? [];
}

function advertisedItemCounts(text: string | undefined): number[] {
  if (!text) return [];
  const normalized = text.toLowerCase();
  const counts = new Set<number>();
  const itemWords = "(dicas|criterios|critérios|perguntas|passos|sinais|motivos|erros|formas|maneiras|itens|pontos|topicos|tópicos|metricas|métricas)";
  const explicitPattern = new RegExp(`\\b([2-9]|1[0-9]|20)\\s+${itemWords}\\b`, "gi");
  let match: RegExpExecArray | null;
  while ((match = explicitPattern.exec(normalized))) counts.add(Number(match[1]));
  const danglingCountPattern = /[:\-–—]\s*([2-9]|1[0-9]|20)\s*(?:\.{2,}|…)?\s*$/g;
  while ((match = danglingCountPattern.exec(normalized))) counts.add(Number(match[1]));
  return Array.from(counts);
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
    brandAlignment: 0.12,
    objectiveAlignment: 0.14,
    audienceRelevance: 0.1,
    factuality: 0.14,
    originality: 0.1,
    clarity: 0.08,
    platformFit: 0.06,
    visualReadability: 0.1,
    captionCoherence: 0.16,
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
    dimensions.captionCoherence >= 50;

  return {
    overallScore,
    accepted,
    dimensions,
    feedback,
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

async function evaluateCandidates<T extends EvaluatedCandidate>(input: {
  candidates: T[];
  strategies: ContentStrategy[];
  siteIntelligence?: SiteIntelligence | null;
  platform: Platform;
  originalityScores?: number[];
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

export async function evaluateAndReviseCandidates<
  T extends EvaluatedCandidate,
>(input: {
  candidates: T[];
  strategies: ContentStrategy[];
  siteIntelligence?: SiteIntelligence | null;
  platform: Platform;
  originalityScores?: number[];
  revise: (
    candidate: T,
    evaluation: GenerationEvaluationSummary,
    index: number,
  ) => Promise<T | null>;
}): Promise<EvaluationPipelineResult<T>> {
  let candidates = input.candidates;
  let evaluations = await evaluateCandidates({
    candidates,
    strategies: input.strategies,
    siteIntelligence: input.siteIntelligence,
    platform: input.platform,
    originalityScores: input.originalityScores,
  });

  if (evaluations.every((evaluation) => evaluation.accepted)) {
    return { candidates, evaluations, revisionCount: 0, revisedIndexes: [], revisionFailedIndexes: [] };
  }

  if (!ENV.aiLlmJudgeEnabled) {
    return { candidates, evaluations, revisionCount: 0, revisedIndexes: [], revisionFailedIndexes: [] };
  }

  const revisedCandidates = [...candidates];
  const revisedIndexes: number[] = [];
  const revisionFailedIndexes: number[] = [];
  let revisionCount = 0;

  await Promise.all(
    evaluations.map(async (evaluation, index) => {
      if (evaluation.accepted) return;
      try {
        const revised = await input.revise(candidates[index], evaluation, index);
        if (revised) {
          revisedCandidates[index] = revised;
          revisedIndexes.push(index);
          revisionCount += 1;
        } else {
          revisionFailedIndexes.push(index);
        }
      } catch (error) {
        console.warn(`[postEvaluation] Revision failed for candidate ${index + 1}:`, error);
        revisionFailedIndexes.push(index);
      }
    }),
  );

  if (revisionCount === 0) {
    return { candidates, evaluations, revisionCount: 0, revisedIndexes: [], revisionFailedIndexes };
  }

  candidates = revisedCandidates;
  evaluations = await evaluateCandidates({
    candidates,
    strategies: input.strategies,
    siteIntelligence: input.siteIntelligence,
    platform: input.platform,
    originalityScores: input.originalityScores,
  });
  return { candidates, evaluations, revisionCount, revisedIndexes, revisionFailedIndexes };
}
