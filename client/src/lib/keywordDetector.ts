import type { AmbientState, KeywordMatch } from "@/types/ambient";
import { AMBIENT_STATES } from "./ambientStates";

/**
 * Normaliza texto para matching
 * - Lowercase
 * - Remove acentos
 * - Remove pontuação extra (mantém % e $ para promos)
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^\w\s%$]/g, " ") // Mantém % e $
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calcula o score de match para um estado específico.
 * Pesos: primary exato 6pts / parcial 3pts | secondary exato 2pts / parcial 1pt.
 * Exclusões invalidam o estado completamente (-100).
 */
function calculateStateScore(
  normalizedText: string,
  state: AmbientState
): KeywordMatch {
  const config = AMBIENT_STATES[state];
  const keywords = config.keywords;
  const matches: string[] = [];
  let score = 0;

  // Verificar exclusões primeiro — invalidam o estado
  for (const excludeWord of keywords.exclude) {
    const normalizedExclude = normalizeText(excludeWord);
    if (normalizedText.includes(normalizedExclude)) {
      return { state, score: -100, matches: [] };
    }
  }

  // Keywords primárias (peso 6)
  for (const keyword of keywords.primary) {
    const normalizedKeyword = normalizeText(keyword);
    const exactRegex = new RegExp(`\\b${normalizedKeyword}\\b`, "gi");
    if (exactRegex.test(normalizedText)) {
      score += 6;
      matches.push(keyword);
    } else if (normalizedText.includes(normalizedKeyword)) {
      score += 3;
      matches.push(keyword);
    }
  }

  // Keywords secundárias (peso 2)
  for (const keyword of keywords.secondary) {
    const normalizedKeyword = normalizeText(keyword);
    const exactRegex = new RegExp(`\\b${normalizedKeyword}\\b`, "gi");
    if (exactRegex.test(normalizedText)) {
      score += 2;
      matches.push(keyword);
    } else if (normalizedText.includes(normalizedKeyword)) {
      score += 1;
      matches.push(keyword);
    }
  }

  // Bonus para múltiplos matches (indica maior certeza)
  if (matches.length >= 3) {
    score *= 1.3;
  }

  return { state, score, matches };
}

// Threshold mínimo: precisa de pelo menos 1 keyword primária (score >= 6)
const MINIMUM_SCORE_THRESHOLD = 6;

/**
 * Detecta o estado ambiental dominante do texto.
 * Retorna o estado com maior score, ou 'neutral' se nenhum for detectado.
 */
export function detectAmbientState(text: string): {
  state: AmbientState;
  confidence: number;
  matches: string[];
} {
  if (!text || text.trim().length < 3) {
    return { state: "neutral", confidence: 0, matches: [] };
  }

  const normalizedText = normalizeText(text);
  const results: KeywordMatch[] = [];

  const states = (Object.keys(AMBIENT_STATES) as AmbientState[]).filter(
    (s) => s !== "neutral"
  );

  for (const state of states) {
    const result = calculateStateScore(normalizedText, state);
    if (result.score > 0) {
      results.push(result);
    }
  }

  results.sort((a, b) => b.score - a.score);

  if (results.length === 0 || results[0].score < MINIMUM_SCORE_THRESHOLD) {
    return { state: "neutral", confidence: 0, matches: [] };
  }

  const winner = results[0];

  // Confiança 0–100 baseada no score relativo ao threshold
  const confidence = Math.min(100, Math.round((winner.score / 20) * 100));

  return {
    state: winner.state,
    confidence,
    matches: winner.matches,
  };
}

/**
 * Retorna todos os estados detectados ordenados por relevância.
 * Útil para sugestões secundárias.
 */
export function detectAllAmbientStates(text: string): KeywordMatch[] {
  if (!text || text.trim().length < 3) {
    return [];
  }

  const normalizedText = normalizeText(text);
  const results: KeywordMatch[] = [];

  const states = (Object.keys(AMBIENT_STATES) as AmbientState[]).filter(
    (s) => s !== "neutral"
  );

  for (const state of states) {
    const result = calculateStateScore(normalizedText, state);
    if (result.score >= MINIMUM_SCORE_THRESHOLD) {
      results.push(result);
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
