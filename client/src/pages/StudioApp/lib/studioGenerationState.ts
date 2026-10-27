import { historicalGenerationFailure, type GenerationFailure } from "@shared/generationFailure";
import type { OrchestratedGenerationInput } from "@shared/generationRequest";

export const ACTIVE_GENERATION_REQUEST_SESSION_KEY = "postspark.generation.request_id";
export const PENDING_GENERATION_START_SESSION_KEY = "postspark.generation.pending_start";

const LEGACY_ACTIVE_REQUEST_KEY = "postspark.generation_v5.request_id";
const LEGACY_PENDING_START_KEY = "postspark.generation_v5.pending_start";

export interface PendingGenerationStart {
  input: OrchestratedGenerationInput;
  source: "create" | "more";
  promptText: string;
  mode: "static" | "carousel";
  inputType: "text" | "url" | "image";
}

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function readActiveGenerationRequestId(storage: SessionStorageLike): string | null {
  return storage.getItem(ACTIVE_GENERATION_REQUEST_SESSION_KEY) ?? storage.getItem(LEGACY_ACTIVE_REQUEST_KEY);
}

export function persistActiveGenerationRequestId(storage: SessionStorageLike, requestId: string): void {
  storage.setItem(ACTIVE_GENERATION_REQUEST_SESSION_KEY, requestId);
  storage.removeItem(LEGACY_ACTIVE_REQUEST_KEY);
}

export function clearActiveGenerationRequestId(storage: SessionStorageLike): void {
  storage.removeItem(ACTIVE_GENERATION_REQUEST_SESSION_KEY);
  storage.removeItem(LEGACY_ACTIVE_REQUEST_KEY);
}

export function readPendingGenerationStart(storage: SessionStorageLike): PendingGenerationStart | null {
  const raw = storage.getItem(PENDING_GENERATION_START_SESSION_KEY) ?? storage.getItem(LEGACY_PENDING_START_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingGenerationStart;
    return parsed?.input?.ownerId && parsed.input.idempotencyKey && parsed.promptText ? parsed : null;
  } catch {
    return null;
  }
}

export function persistPendingGenerationStart(storage: SessionStorageLike, pending: PendingGenerationStart): void {
  storage.setItem(PENDING_GENERATION_START_SESSION_KEY, JSON.stringify(pending));
  storage.removeItem(LEGACY_PENDING_START_KEY);
}

export function clearPendingGenerationStart(storage: SessionStorageLike): void {
  storage.removeItem(PENDING_GENERATION_START_SESSION_KEY);
  storage.removeItem(LEGACY_PENDING_START_KEY);
}

/** Transport retries share one key; changing the brief/options starts a new request. */
export function sameGenerationAdmissionBody(a: OrchestratedGenerationInput, b: OrchestratedGenerationInput): boolean {
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object") return Object.fromEntries(
      Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
    return value;
  };
  const { idempotencyKey: _a, ...bodyA } = a;
  const { idempotencyKey: _b, ...bodyB } = b;
  return JSON.stringify(canonicalize(bodyA)) === JSON.stringify(canonicalize(bodyB));
}

export function newGenerationIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function proposalDeliveryKey(proposalId: string, revision: number): string {
  return `${proposalId}:${revision}`;
}

/** Claims one proposal revision for materialization; independent proposals remain eligible. */
export function claimProposalDelivery(
  processed: Set<string>,
  proposalId: string,
  revision: number,
): boolean {
  const key = proposalDeliveryKey(proposalId, revision);
  if (processed.has(key)) return false;
  processed.add(key);
  return true;
}

const GENERATION_STATUS_LABELS: Record<string, string> = {
  planned: "Aguardando início",
  running: "Em andamento",
  waiting_input: "Aguardando dados",
  checking: "Conferindo resultado",
  recovering: "Tentando recuperar",
  awaiting_reconciliation:"Revisão pendente de confirmação",
  delivery_pending: "Preparando entrega",
  ready: "Pronta",
  failed: "Falhou",
  cancelled: "Cancelada",
  expired: "Expirada",
  completed: "Concluída",
  partial: "Concluída parcialmente",
};

export function labelGenerationStatus(status: string): string {
  return GENERATION_STATUS_LABELS[status] ?? "Status atualizado";
}

export function labelGenerationCapabilityReason(reason?: string): string {
  switch (reason) {
    case "renderer_configuration_required": return "O serviço de revisão visual precisa ser preparado antes de gerar.";
    case "provider_configuration_required": return "O serviço de geração precisa ser configurado antes de criar posts.";
    case "local_activation_required": return "O executor local precisa ser ativado antes de gerar.";
    case "catalog_publication_required": return "O catálogo está aguardando uma publicação válida. Tente novamente após a publicação.";
    case "durable_worker_required": return "Aguardando o serviço de geração ficar disponível. A disponibilidade será atualizada automaticamente.";
    case "maintenance": return "A geração está em manutenção. Seus pedidos anteriores continuam disponíveis.";
    case "catalogue_required": return "Nenhum design está disponível para gerar agora. Tente novamente mais tarde.";
    case "unauthenticated": return "Entre na sua conta para criar seus posts.";
    default: return "Verificando a disponibilidade da geração…";
  }
}

export function messageGenerationProposalFailure(reason?: string, failure?: GenerationFailure): string {
  switch (failure?.code ?? historicalGenerationFailure(reason)?.code ?? reason) {
    case "catalog_variant_unavailable": return "Este design ainda não possui todos os slides revisados para este pedido. Aguarde a atualização do acervo.";
    case "catalog_component_ineligible": return "Um design ficou indisponível durante a entrega. As outras propostas continuam disponíveis.";
    case "catalog_coverage_incomplete": return "Não foi possível conferir todas as opções do acervo. A seleção não foi concluída; use a referência do pedido para diagnóstico.";
    case "preparation_contract_incompatible": return "Este pedido usa uma preparação anterior incompatível. Aguarde a atualização do ambiente antes de criar outro.";
    case "review_evidence_invalid": return "Não foi possível concluir a conferência desta proposta. Isso não confirma um problema no conteúdo.";
    case "review_response_truncated": return "A resposta da revisão foi interrompida pelo limite de geração. Esta proposta não foi concluída como revisada.";
    case "review_response_invalid": return "A revisão retornou uma resposta inválida. Isso não confirma um problema no conteúdo.";
    case "review_reconciliation_required": return "A revisão aguarda confirmação de uma operação anterior. Não repita este pedido.";
    case "review_inconclusive": return "A revisão não conseguiu concluir uma avaliação segura desta proposta.";
    case "review_content_rejected": return "A proposta manteve um problema de conteúdo após a correção. Revise as informações da criação.";
    case "review_deadline_exceeded": return "A conferência ultrapassou o tempo disponível. O conteúdo não foi concluído como revisado.";
    case "content_requirement_unmet": return "Não foi possível atender a um requisito explícito do briefing.";
    case "source_limitation": return "Não foi possível ler a fonte com informação suficiente. Confira a página ou envie uma imagem legível ou um trecho menor.";
    case "preparation_context_too_large": return "O pedido e suas fontes ultrapassam a capacidade de preparação. Divida o conteúdo em pedidos menores.";
    case "source_conflict": return "As fontes divergem sobre uma informação necessária. Confira os dados do briefing.";
    case "review_render_failed": return "Não foi possível preparar as imagens para conferência. A proposta não foi concluída como revisada.";
    case "artwork_unusable": return "O conteúdo não coube com legibilidade no design escolhido.";
    case "execution_failed": return "Não foi possível concluir esta proposta. Use a referência do pedido para diagnóstico.";
    case "provider_unavailable": return "O serviço de geração está temporariamente indisponível.";
    case "provider_timeout": return "Esta proposta demorou demais para concluir.";
    case "invalid_provider_response": return "A proposta não pôde ser preparada com segurança.";
    case "materialization_failed": return "A proposta foi gerada, mas não pôde ser montada no editor.";
    case "cancelled": return "Esta proposta foi cancelada.";
    default: return "Esta proposta não foi concluída. Você pode tentar uma nova geração.";
  }
}
