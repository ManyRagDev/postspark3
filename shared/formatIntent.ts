import type { PostMode } from "./postspark";

/**
 * Detector determinístico de intenção de formato (Etapa 3 §8.1).
 *
 * Produz `detectedFormat`, `confidence` e `evidence` a partir do texto do
 * briefing. Usado no frontend para confirmar divergências com o seletor e no
 * backend para revalidar antes de reservar Sparks (contradições claras
 * retornam `format_mismatch` sem chamada generativa).
 */

export interface FormatIntent {
  detectedFormat: PostMode;
  confidence: "high" | "medium" | "low";
  evidence: string[];
}

const CAROUSEL_PATTERNS: Array<{ regex: RegExp; weight: number; label: string }> = [
  { regex: /\bcarrossel\b/i, weight: 3, label: "termo 'carrossel'" },
  { regex: /\bslides\b/i, weight: 3, label: "termo 'slides'" },
  { regex: /\bslide\s*\d+(\s*(de|\/)\s*\d+)?/i, weight: 3, label: "numeração de slide (ex.: 'slide 1/5')" },
  { regex: /\bsequ[êe]ncia\s+de\b/i, weight: 2, label: "termo 'sequência de'" },
  { regex: /\bv[áa]rios\s+slides\b/i, weight: 2, label: "termo 'vários slides'" },
  { regex: /\bparte\s+\d+\s+de\s+\d+/i, weight: 2, label: "termo 'parte N de M'" },
];

const STATIC_PATTERNS: Array<{ regex: RegExp; weight: number; label: string }> = [
  { regex: /\bpost\s+[úu]nico\b/i, weight: 3, label: "termo 'post único'" },
  { regex: /\bimagem\s+[úu]nica\b/i, weight: 3, label: "termo 'imagem única'" },
  { regex: /\buma\s+(s[óo]|unica)\s+imagem\b/i, weight: 3, label: "termo 'uma só imagem'" },
  { regex: /\bpe[çc]a\s+est[áa]tica\b/i, weight: 3, label: "termo 'peça estática'" },
  { regex: /\bpost\s+est[áa]tico\b/i, weight: 3, label: "termo 'post estático'" },
  { regex: /\barte\s+[úu]nica\b/i, weight: 2, label: "termo 'arte única'" },
];

function score(patterns: typeof CAROUSEL_PATTERNS, text: string): { score: number; evidence: string[] } {
  let score = 0;
  const evidence: string[] = [];
  for (const pattern of patterns) {
    if (pattern.regex.test(text)) {
      score += pattern.weight;
      evidence.push(pattern.label);
    }
  }
  return { score, evidence };
}

export function detectFormatIntent(rawInput: string): FormatIntent {
  const text = rawInput || "";
  const carousel = score(CAROUSEL_PATTERNS, text);
  const staticScore = score(STATIC_PATTERNS, text);

  // Empate ou ausência de sinal → sem detecção utilizável.
  if (carousel.score === 0 && staticScore.score === 0) {
    return { detectedFormat: "static", confidence: "low", evidence: [] };
  }

  if (carousel.score > staticScore.score) {
    return {
      detectedFormat: "carousel",
      confidence: carousel.score >= 4 ? "high" : "medium",
      evidence: carousel.evidence,
    };
  }

  if (staticScore.score > carousel.score) {
    return {
      detectedFormat: "static",
      confidence: staticScore.score >= 4 ? "high" : "medium",
      evidence: staticScore.evidence,
    };
  }

  // Empate: sinal contraditório — retorna low sem sobrescrever decisão.
  return { detectedFormat: "static", confidence: "low", evidence: [] };
}

/**
 * Retorna true quando o briefing sinaliza claramente um formato e o seletor
 * diverge. `confidence: high` é contradição detectável localmente; bloqueia
 * antes de reservar Sparks (Etapa 3 §8.2).
 */
export function hasFormatMismatch(rawInput: string, selectedMode: PostMode): boolean {
  const intent = detectFormatIntent(rawInput);
  if (intent.confidence === "low") return false;
  return intent.detectedFormat !== selectedMode;
}