import { detectFormatIntent } from "./formatIntent";
import type { ExecutionSlideInput } from "./postspark";
import {
  CREATION_BRIEF_VERSION,
  type CreationBrief,
  creationBriefSchema,
} from "./postsparkSchemas";

/**
 * Regex para detectar URLs completas (http/https/www) no meio de textos livres.
 */
const EMBEDDED_URL_REGEX = /\b(?:https?:\/\/|www\.)[^\s<>"'{}|\\^`[\]]+/gi;

/**
 * Caracteres de pontuação comuns que costumam colar ao final de URLs no texto corrido.
 */
const TRAILING_PUNCTUATION_REGEX = /[.,;:!?)\]'"]+$/;

/**
 * Extrai todas as URLs embutidas no meio de um texto, normalizando e limpando
 * pontuação final colada.
 */
export function extractUrlsFromText(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  const matches = text.match(EMBEDDED_URL_REGEX);
  if (!matches) return [];

  const cleaned = matches.map((raw) => {
    let url = raw.replace(TRAILING_PUNCTUATION_REGEX, "").trim();
    if (url.startsWith("www.")) {
      url = `https://${url}`;
    }
    return url;
  }).filter((url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  });

  return Array.from(new Set(cleaned));
}

/**
 * Tenta extrair a quantidade intencionada de slides quando for carrossel.
 */
function extractSlideCount(text: string): number | undefined {
  const writtenCount = text.match(/\b(dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez)\s+(?:slides?|p[áa]ginas?|l[âa]minas?|telas?|cards?)\b/i)?.[1];
  if (writtenCount) {
    const counts: Record<string, number> = { dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
    return counts[writtenCount.toLowerCase().replace("ê", "e")];
  }
  const match = text.match(/(\d+)\s*(?:slides?|passos?|telas?|cards?|dicas?|etapas?|pontos?)/i);
  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    if (num >= 2 && num <= 10) return num;
  }
  const slideMatches = Array.from(text.matchAll(/(?:slide|l[aâ]mina|tela|p[aá]gina)\s+(\d+)/gi));
  if (slideMatches.length >= 2) {
    const numbers = slideMatches.map(m => parseInt(m[1], 10)).filter(n => n >= 2 && n <= 10);
    if (numbers.length > 0) {
      return Math.max(...numbers);
    }
  }
  return undefined;
}

/**
 * Extrai declarações explícitas e estruturadas de CTA (ex: "CTA: ...").
 * Nunca sintetiza texto de CTA a partir de verbos livres no briefing.
 */
function extractCallToAction(text: string): string | undefined {
  const match = text.match(/(?:^|\n|[.;]\s*)(?:cta|chamada|call to action)\s*[:=-]\s*([^\n.;]+)/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return undefined;
}

export interface BrandKitSummaryInput {
  brand_name?: string | null;
  tone?: string | null;
  font_family?: string | null;
  visual_palette?: string[] | null;
  must_include?: string[] | null;
  forbidden_terms?: string[] | null;
  target_audience?: string | null;
  brand_essence?: string | null;
}

/**
 * Interpreta um briefing bruto digitado pelo usuário, separando a entrada bruta
 * da interpretação estruturada e enriquecendo com inteligência de marca.
 */
export function interpretRawBriefing(
  rawInput: string,
  options?: {
    selectedFormat?: "static" | "carousel";
    brandKit?: BrandKitSummaryInput | null;
  }
): CreationBrief {
  const cleanInput = (rawInput || "").trim();
  const detectedIntent = detectFormatIntent(cleanInput);

  const format: "static" | "carousel" =
    options?.selectedFormat ??
    (detectedIntent.detectedFormat === "carousel" ? "carousel" : "static");

  const slideCount = format === "carousel" ? (extractSlideCount(cleanInput) ?? 5) : undefined;
  const sourceUrls = extractUrlsFromText(cleanInput);
  const callToAction = extractCallToAction(cleanInput);

  const brandKit = options?.brandKit;
  const tone = brandKit?.tone ?? undefined;
  const brandEssence = brandKit?.brand_essence ?? brandKit?.brand_name ?? undefined;
  const audience = brandKit?.target_audience ?? undefined;
  const requiredTerms = brandKit?.must_include && brandKit.must_include.length > 0
    ? [...brandKit.must_include]
    : undefined;
  const forbiddenTerms = brandKit?.forbidden_terms && brandKit.forbidden_terms.length > 0
    ? [...brandKit.forbidden_terms]
    : undefined;

  const candidate: CreationBrief = {
    version: CREATION_BRIEF_VERSION,
    rawInput: cleanInput,
    format,
    slideCount,
    sourceUrls: sourceUrls.length > 0 ? sourceUrls : undefined,
    callToAction,
    tone,
    brandEssence,
    audience,
    requiredTerms,
    forbiddenTerms,
  };

  return creationBriefSchema.parse(candidate);
}

/**
 * Converte um CreationBrief no executionBrief estruturado esperado pelo backend.
 */
export function creationBriefToExecutionBrief(
  brief: CreationBrief,
  overrides?: {
    interventionLevel?: "visual_only" | "light_optimize" | "optimize_structure";
    contentSourceType?: "freeform" | "carousel_topics" | "carousel_slides" | "caption_ready";
    slides?: ExecutionSlideInput[];
  }
) {
  const slides: ExecutionSlideInput[] = overrides?.slides ?? [];

  return {
    creationMode: "execution" as const,
    format: brief.format,
    platform: brief.platform ?? ("instagram" as const),
    tone: brief.tone,
    callToAction: brief.callToAction,
    audience: brief.audience,
    brandEssence: brief.brandEssence,
    interventionLevel: overrides?.interventionLevel ?? ("light_optimize" as const),
    contentSourceType: overrides?.contentSourceType ?? (brief.format === "carousel" ? ("carousel_topics" as const) : ("freeform" as const)),
    slides,
    rawInput: brief.rawInput,
    notes: brief.visualBrief,
    mustInclude: brief.requiredTerms ?? [],
    forbiddenTerms: brief.forbiddenTerms ?? [],
  };
}
