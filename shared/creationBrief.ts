import { detectFormatIntent } from "./formatIntent";
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
  const match = text.match(/(\d+)\s*(?:slides?|passos?|telas?|cards?|dicas?|etapas?|pontos?)/i);
  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    if (num >= 2 && num <= 10) return num;
  }
  return undefined;
}

/**
 * Extrai sugestões explícitas de CTA a partir do texto.
 */
function extractCallToAction(text: string): string | undefined {
  const match = text.match(/(?:cta|chamada|call to action)\s*[:=-]\s*([^\n.;]+)/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  if (/link na bio/i.test(text)) return "Link na bio";
  if (/comente /i.test(text)) return "Comente abaixo";
  if (/compartilhe/i.test(text)) return "Compartilhe com um amigo";
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
export function creationBriefToExecutionBrief(brief: CreationBrief) {
  return {
    creationMode: "execution" as const,
    format: brief.format,
    platform: "instagram" as const,
    objective: "engage" as const,
    tone: brief.tone,
    callToAction: brief.callToAction,
    interventionLevel: "optimize_structure" as const,
    contentSourceType: brief.format === "carousel" ? "carousel_topics" as const : "freeform" as const,
    rawInput: brief.rawInput,
    mustInclude: brief.requiredTerms ?? [],
    forbiddenTerms: brief.forbiddenTerms ?? [],
    brandInput: brief.sourceUrls && brief.sourceUrls.length > 0
      ? {
          websiteUrl: brief.sourceUrls[0],
          adaptationMode: "adaptive" as const,
        }
      : undefined,
  };
}
