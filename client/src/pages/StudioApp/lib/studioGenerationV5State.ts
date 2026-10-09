import type { OrchestratedGenerationInput } from "@shared/generationRequest";

export const ACTIVE_V5_REQUEST_SESSION_KEY = "postspark.generation_v5.request_id";
export const PENDING_V5_START_SESSION_KEY = "postspark.generation_v5.pending_start";

export interface PendingV5Start {
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

export function readActiveV5RequestId(storage: SessionStorageLike): string | null {
  return storage.getItem(ACTIVE_V5_REQUEST_SESSION_KEY);
}

export function persistActiveV5RequestId(storage: SessionStorageLike, requestId: string): void {
  storage.setItem(ACTIVE_V5_REQUEST_SESSION_KEY, requestId);
}

export function clearActiveV5RequestId(storage: SessionStorageLike): void {
  storage.removeItem(ACTIVE_V5_REQUEST_SESSION_KEY);
}

export function readPendingV5Start(storage: SessionStorageLike): PendingV5Start | null {
  const raw = storage.getItem(PENDING_V5_START_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingV5Start;
    return parsed?.input?.ownerId && parsed.input.idempotencyKey && parsed.promptText ? parsed : null;
  } catch {
    return null;
  }
}

export function persistPendingV5Start(storage: SessionStorageLike, pending: PendingV5Start): void {
  storage.setItem(PENDING_V5_START_SESSION_KEY, JSON.stringify(pending));
}

export function clearPendingV5Start(storage: SessionStorageLike): void {
  storage.removeItem(PENDING_V5_START_SESSION_KEY);
}

export function newV5IdempotencyKey(): string {
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

const V5_STATUS_LABELS: Record<string, string> = {
  planned: "Aguardando início",
  running: "Em andamento",
  waiting_input: "Aguardando dados",
  checking: "Conferindo resultado",
  recovering: "Tentando recuperar",
  delivery_pending: "Preparando entrega",
  ready: "Pronta",
  failed: "Falhou",
  cancelled: "Cancelada",
  expired: "Expirada",
  completed: "Concluída",
  partial: "Concluída parcialmente",
};

export function labelV5Status(status: string): string {
  return V5_STATUS_LABELS[status] ?? "Status atualizado";
}

export function labelV5CapabilityReason(reason?: string): string {
  switch (reason) {
    case "pilot_disabled": return "A geração V5 está desligada neste ambiente.";
    case "dev_account_required": return "A geração V5 está disponível para contas DEV neste piloto.";
    case "durable_worker_required": return "Aguardando o processamento V5 ficar disponível. A disponibilidade será atualizada automaticamente ao selecionar a opção.";
    default: return "As condições para geração progressiva estão sendo verificadas.";
  }
}

export function messageV5ProposalFailure(reason?: string): string {
  switch (reason) {
    case "provider_unavailable": return "O serviço de geração está temporariamente indisponível.";
    case "provider_timeout": return "Esta proposta demorou demais para concluir.";
    case "invalid_provider_response": return "A proposta não pôde ser preparada com segurança.";
    case "materialization_failed": return "A proposta foi gerada, mas não pôde ser montada no editor.";
    case "cancelled": return "Esta proposta foi cancelada.";
    default: return "Esta proposta não foi concluída. Você pode tentar uma nova geração.";
  }
}
