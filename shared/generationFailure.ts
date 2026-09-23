import type {
  GenerationFailureMetadata,
  GenerationFailureReason,
} from "./postspark";
import { GENERATION_FAILURE_REASONS } from "./postspark";

/**
 * Taxonomia compartilhada de falhas de geração (Etapa 1 §6.3).
 *
 * Funções puras, sem dependência de backend/frontend. Converte exceções e
 * estados internos em `GenerationFailureReason` e produz o `userMessage`
 * apropriado — garantindo que uma reprovação editorial nunca seja descrita
 * como falha de conexão/provider.
 */

const RETRYABLE_REASONS: ReadonlySet<GenerationFailureReason> = new Set<GenerationFailureReason>([
  "provider_unavailable",
  "provider_timeout",
  "invalid_provider_response",
  "persistence_failed",
  "unknown",
]);

/** Mensagem direta, sem stack trace, sem payload sensível. */
const USER_MESSAGES: Record<GenerationFailureReason, string> = {
  insufficient_sparks:
    "Sparks insuficientes. Faça upgrade ou adquira um pacote de recarga.",
  authentication: "Sua sessão expirou. Entre novamente para continuar.",
  provider_unavailable:
    "O provedor de IA está indisponível no momento. Tente novamente.",
  provider_timeout:
    "A geração demorou demais para responder. Tente novamente.",
  invalid_provider_response:
    "A resposta da IA veio em um formato inesperado. Tente novamente.",
  format_mismatch:
    "O formato escolhido não combina com o seu pedido. Revise antes de gerar.",
  quality_rejected:
    "A IA não conseguiu produzir conteúdo aprovado pela qualidade editorial para este pedido.",
  variations_not_distinct:
    "As opções geradas ficaram parecidas demais. Tente gerar novamente.",
  persistence_failed:
    "Não foi possível salvar o resultado da geração. Tente novamente.",
  billing_commit_failed:
    "Não foi possível confirmar a cobrança desta geração. Entre em contato com o suporte.",
  unknown: "Não foi possível concluir a geração. Tente novamente.",
};

export function isGenerationFailureReason(value: unknown): value is GenerationFailureReason {
  return (
    typeof value === "string" &&
    (GENERATION_FAILURE_REASONS as string[]).includes(value)
  );
}

export function isRetryable(reason: GenerationFailureReason): boolean {
  return RETRYABLE_REASONS.has(reason);
}

export function userMessageFor(reason: GenerationFailureReason): string {
  return USER_MESSAGES[reason];
}

/**
 * Converte uma exceção/estado arbitrário em `GenerationFailureReason`.
 * A ordem importa: padrões mais específicos primeiro.
 */
export function classifyGenerationError(error: unknown): GenerationFailureReason {
  const message = extractErrorMessage(error).toLowerCase();
  const code = extractErrorCode(error);

  if (code === "PAYMENT_REQUIRED" || /insufficient (sparks|balance|credits)/.test(message)) {
    return "insufficient_sparks";
  }
  if (
    code === "UNAUTHORIZED" ||
    /auth|401|token expir|session expir|not authenticated/.test(message)
  ) {
    return "authentication";
  }
  if (/format_mismatch|mismatch.*format|incompatible.*format/.test(message)) {
    return "format_mismatch";
  }
  if (
    /quality_rejected|quality refused|rejeitad|não conseguiu produzir três|editorial/i.test(message)
  ) {
    return "quality_rejected";
  }
  if (/not (sufficiently )?distinct|variat.*distinct|parecidas demais/i.test(message)) {
    return "variations_not_distinct";
  }
  if (/persist|save failed|database|statement timeout|duplicate key/.test(message)) {
    return "persistence_failed";
  }
  if (/commit.*reservation|billing.*(commit|confirm)|cobrança/.test(message)) {
    return "billing_commit_failed";
  }
  if (/timeout|timed out|deadline|etimedout|aborted|504|408/.test(message)) {
    return "provider_timeout";
  }
  if (
    /parse|invalid.*(json|schema|response)|no parseable|response_format|unexpected/
      .test(message)
  ) {
    return "invalid_provider_response";
  }
  if (
    /provider|openrouter|groq|gemini|upstream|network|fetch failed|econnrefused|enotfound|429|503|rate limit/
      .test(message)
  ) {
    return "provider_unavailable";
  }
  return "unknown";
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown };
    if (typeof candidate.message === "string") return candidate.message;
  }
  return "";
}

function extractErrorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown };
    if (typeof candidate.code === "string") return candidate.code.toUpperCase();
    if (candidate.code && typeof candidate.code === "object") {
      const inner = candidate.code as { code?: unknown };
      if (typeof inner.code === "string") return inner.code.toUpperCase();
    }
  }
  return "";
}

/** Monta o metadado estruturado exposto à borda da API. */
export function toFailureMetadata(input: {
  generationRunId: string;
  reason?: GenerationFailureReason;
  error?: unknown;
  refunded?: boolean;
  validationIssues?: GenerationFailureMetadata["validationIssues"];
}): GenerationFailureMetadata {
  const reason = input.reason ?? classifyGenerationError(input.error);
  return {
    generationRunId: input.generationRunId,
    reason,
    retryable: isRetryable(reason),
    refunded: input.refunded,
    userMessage: userMessageFor(reason),
    validationIssues: input.validationIssues,
  };
}