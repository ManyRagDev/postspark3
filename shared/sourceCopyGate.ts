/**
 * Gate de similaridade com o input (Etapa 3 §8.4).
 *
 * Compara o prompt original com headline/body/caption/slides/CTA e bloqueia
 * reprodução literal não autorizada. Permite reprodução apenas quando o
 * briefing marcar explicitamente termos obrigatórios (slogan, citação, nome
 * de produto, texto legal, expressão obrigatória).
 *
 * Funções puras e determinísticas — sem chamada externa.
 */

export type RequiredCopyKind =
  | "slogan"
  | "quote"
  | "product_name"
  | "legal"
  | "mandatory_expression";

export interface SourceCopyViolation {
  code: "source_copy_too_similar";
  slot?: number;
  field: "headline" | "body" | "caption" | "slide_headline" | "slide_body" | "callToAction";
  detail: string;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalize(value).split(" ").filter(Boolean);
}

/** Sobreposição de n-gramas entre candidato e prompt normalizados. */
export function ngramOverlap(candidate: string, prompt: string, n = 4): number {
  const candidateTokens = tokenize(candidate);
  const promptTokens = tokenize(prompt);

  if (candidateTokens.length < n || promptTokens.length < n) {
    return normalize(candidate) === normalize(prompt) ? 1 : 0;
  }

  const candidateGrams = new Set<string>();
  for (let i = 0; i <= candidateTokens.length - n; i++) {
    candidateGrams.add(candidateTokens.slice(i, i + n).join(" "));
  }

  const promptGrams = new Set<string>();
  for (let i = 0; i <= promptTokens.length - n; i++) {
    promptGrams.add(promptTokens.slice(i, i + n).join(" "));
  }
  if (promptGrams.size === 0) return 0;

  let overlap = 0;
  candidateGrams.forEach((gram) => {
    if (promptGrams.has(gram)) overlap += 1;
  });
  return overlap / candidateGrams.size;
}

/** Remove trechos obrigatórios presentes literalmente; estes não geram violação. */
export function stripRequiredTerms(text: string, requiredTerms: string[]): string {
  let result = text;
  const sorted = [...requiredTerms.filter(Boolean)].sort((a, b) => b.length - a.length);
  for (const term of sorted) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result
      .split(new RegExp(`(${escaped})`, "gi"))
      .filter((part) => normalize(part) !== normalize(term))
      .join(" ");
  }
  return result;
}

const NGRAM_SIZE = 4;
const NGRAM_THRESHOLD = 0.75;

interface FieldInput {
  field: SourceCopyViolation["field"];
  value: string;
}

export interface SourceCopyGateInput {
  prompt: string;
  requiredTerms?: string[];
  fields: FieldInput[];
}

/**
 * Bloqueia copy idêntica ou excessivamente semelhante ao prompt, salvo
 * conteúdo explicitamente obrigatório (Etapa 3 §8.4). Retorna violações.
 */
export function evaluateSourceCopyGate(input: SourceCopyGateInput): SourceCopyViolation[] {
  const violations: SourceCopyViolation[] = [];
  const promptNormalized = normalize(input.prompt);
  if (!promptNormalized) return violations;

  for (const field of input.fields) {
    const raw = field.value ?? "";
    const stripped = input.requiredTerms?.length
      ? stripRequiredTerms(raw, input.requiredTerms)
      : raw;
    const candidate = normalize(stripped);
    if (!candidate) continue;

    if (candidate === promptNormalized) {
      violations.push({
        code: "source_copy_too_similar",
        field: field.field,
        detail: `${field.field} reproduz literalmente o prompt`,
      });
      continue;
    }

    const overlap = ngramOverlap(candidate, input.prompt, NGRAM_SIZE);
    if (overlap >= NGRAM_THRESHOLD) {
      violations.push({
        code: "source_copy_too_similar",
        field: field.field,
        detail: `${field.field} excessivamente semelhante ao prompt (sobreposição ${Math.round(overlap * 100)}%)`,
      });
      continue;
    }

    if (tokenize(candidate).length >= NGRAM_SIZE && promptNormalized.includes(candidate)) {
      violations.push({
        code: "source_copy_too_similar",
        field: field.field,
        detail: `${field.field} contém o prompt de forma integral`,
      });
    }
  }

  return violations;
}