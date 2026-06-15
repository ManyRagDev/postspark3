import { createHash, randomUUID } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import type {
  PostVariation,
  SiteIntelligence,
} from "@shared/postspark";
import { ENV } from "../_core/env";
import {
  createContentFingerprints,
  type PostRecord,
} from "../db";

export interface OriginalityAssessment {
  score: number;
  maxCandidateSimilarity: number;
  maxSiteSimilarity: number;
  maxHistorySimilarity: number;
  closestSource: "candidate" | "site" | "history" | "none";
  fallbackUsed: boolean;
}

export interface OriginalityResult {
  assessments: OriginalityAssessment[];
  embeddings: number[][];
  fallbackUsed: boolean;
}

function variationText(
  variation: Pick<
    PostVariation,
    "headline" | "body" | "caption" | "callToAction"
  >,
): string {
  return [
    variation.headline,
    variation.body,
    variation.caption,
    variation.callToAction,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4_000);
}

function postRecordText(post: PostRecord): string {
  return [
    post.headline,
    post.body,
    post.caption,
    post.callToAction,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4_000);
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0),
  );
  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

function fallbackEmbedding(text: string, dimensions = 768): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  const tokens =
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .match(/[a-z0-9]{3,}/g) ?? [];

  for (let index = 0; index < tokens.length; index++) {
    const unigram = tokens[index];
    const bigram = `${tokens[index]}_${tokens[index + 1] ?? ""}`;
    for (const feature of [unigram, bigram]) {
      const hash = createHash("sha256").update(feature).digest();
      const bucket = hash.readUInt16BE(0) % dimensions;
      const sign = hash[2] % 2 === 0 ? 1 : -1;
      vector[bucket] += sign;
    }
  }

  return normalizeVector(vector);
}

async function embedTexts(
  texts: string[],
): Promise<{ vectors: number[][]; fallbackUsed: boolean }> {
  if (texts.length === 0) return { vectors: [], fallbackUsed: false };

  if (ENV.aiSemanticEmbeddingsEnabled && ENV.geminiApiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: ENV.geminiApiKey });
      const response = await ai.models.embedContent({
        model: "gemini-embedding-001",
        contents: texts,
        config: {
          taskType: "SEMANTIC_SIMILARITY",
          outputDimensionality: 768,
        },
      });
      const vectors = response.embeddings?.map((item) =>
        normalizeVector(item.values ?? []),
      );
      if (
        vectors &&
        vectors.length === texts.length &&
        vectors.every((vector) => vector.length > 0)
      ) {
        return { vectors, fallbackUsed: false };
      }
    } catch (error) {
      console.warn("[semanticOriginality] Embedding API unavailable:", error);
    }
  }

  return {
    vectors: texts.map((text) => fallbackEmbedding(text)),
    fallbackUsed: true,
  };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  return Math.max(
    -1,
    Math.min(
      1,
      a.reduce((sum, value, index) => sum + value * b[index], 0),
    ),
  );
}

function maxSimilarity(vector: number[], references: number[][]): number {
  return Math.max(0, ...references.map((item) => cosineSimilarity(vector, item)));
}

export async function assessSemanticOriginality(input: {
  candidates: PostVariation[];
  siteIntelligence?: SiteIntelligence | null;
  recentPosts?: PostRecord[];
}): Promise<OriginalityResult> {
  const candidateTexts = input.candidates.map(variationText);
  const siteTexts =
    input.siteIntelligence?.evidence.slice(0, 8).map((item) => item.text) ?? [];
  const historyTexts = (input.recentPosts ?? []).slice(0, 20).map(postRecordText);
  const allTexts = [...candidateTexts, ...siteTexts, ...historyTexts];
  const embedded = await embedTexts(allTexts);
  const candidateVectors = embedded.vectors.slice(0, candidateTexts.length);
  const siteStart = candidateTexts.length;
  const historyStart = siteStart + siteTexts.length;
  const siteVectors = embedded.vectors.slice(siteStart, historyStart);
  const historyVectors = embedded.vectors.slice(historyStart);

  const assessments = candidateVectors.map((vector, index) => {
    const otherCandidates = candidateVectors.filter(
      (_, otherIndex) => otherIndex !== index,
    );
    const maxCandidateSimilarity = maxSimilarity(vector, otherCandidates);
    const maxSiteSimilarity = maxSimilarity(vector, siteVectors);
    const maxHistorySimilarity = maxSimilarity(vector, historyVectors);
    const weightedSimilarity = Math.max(
      maxCandidateSimilarity,
      maxHistorySimilarity,
      maxSiteSimilarity * 0.65,
    );
    const sources = [
      ["candidate", maxCandidateSimilarity] as const,
      ["site", maxSiteSimilarity * 0.65] as const,
      ["history", maxHistorySimilarity] as const,
    ].sort((a, b) => b[1] - a[1]);

    const closestSource: OriginalityAssessment["closestSource"] =
      weightedSimilarity > 0 ? sources[0][0] : "none";

    return {
      score: Math.max(0, Math.min(100, Math.round((1 - weightedSimilarity) * 100))),
      maxCandidateSimilarity,
      maxSiteSimilarity,
      maxHistorySimilarity,
      closestSource,
      fallbackUsed: embedded.fallbackUsed,
    };
  });

  return {
    assessments,
    embeddings: candidateVectors,
    fallbackUsed: embedded.fallbackUsed,
  };
}

export async function persistCandidateFingerprints(input: {
  userUuid: string;
  generationRunId: string;
  candidates: PostVariation[];
  embeddings: number[][];
  assessments: OriginalityAssessment[];
}): Promise<void> {
  try {
    await createContentFingerprints(
      input.candidates.map((candidate, index) => ({
        id: randomUUID(),
        userUuid: input.userUuid,
        generationRunId: input.generationRunId,
        sourceType: "candidate",
        sourceId: candidate.id || `candidate-${index + 1}`,
        textHash: createHash("sha256")
          .update(variationText(candidate))
          .digest("hex"),
        embedding: input.embeddings[index] ?? [],
        metadata: input.assessments[index] as any,
      })),
    );
  } catch (error) {
    console.warn("[semanticOriginality] Could not persist fingerprints:", error);
  }
}
