import { describe, expect, it } from "vitest";
import {
  ACTIVE_GENERATION_REQUEST_SESSION_KEY,
  PENDING_GENERATION_START_SESSION_KEY,
  claimProposalDelivery,
  clearActiveGenerationRequestId,
  clearPendingGenerationStart,
  labelGenerationCapabilityReason,
  labelGenerationStatus,
  messageGenerationProposalFailure,
  newGenerationIdempotencyKey,
  persistActiveGenerationRequestId,
  persistPendingGenerationStart,
  readPendingGenerationStart,
  readActiveGenerationRequestId,
} from "./studioGenerationState";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("Studio Generation request state", () => {
  it("resumes the same admitted request after a page refresh", () => {
    const storage = memoryStorage();
    persistActiveGenerationRequestId(storage, "0cc1ff2a-7fbb-40c2-812a-285e25abfba3");

    expect(readActiveGenerationRequestId(storage)).toBe("0cc1ff2a-7fbb-40c2-812a-285e25abfba3");
    clearActiveGenerationRequestId(storage);
    expect(readActiveGenerationRequestId(storage)).toBeNull();
    expect(ACTIVE_GENERATION_REQUEST_SESSION_KEY).toContain("request_id");
  });

  it("persists the exact admission payload and key until the server acknowledges admission", () => {
    const storage = memoryStorage();
    const pending = {
      input: { ownerId: "00000000-0000-4000-8000-000000000001", inputType: "text", content: "Brief original", platform: "instagram", postMode: "static", idempotencyKey: newGenerationIdempotencyKey() } as any,
      source: "create" as const,
      promptText: "Brief original",
      mode: "static" as const,
      inputType: "text" as const,
    };
    persistPendingGenerationStart(storage, pending);
    expect(readPendingGenerationStart(storage)).toEqual(pending);
    expect(readPendingGenerationStart(storage)?.input).toEqual(pending.input);
    clearPendingGenerationStart(storage);
    expect(storage.getItem(PENDING_GENERATION_START_SESSION_KEY)).toBeNull();
  });

  it("reads legacy session bindings and removes them when the request is cleared", () => {
    const storage = memoryStorage();
    storage.setItem("postspark.generation_v5.request_id", "legacy-request");
    const pending = { input: { ownerId: "owner", idempotencyKey: "key" }, promptText: "Brief antigo" };
    storage.setItem("postspark.generation_v5.pending_start", JSON.stringify(pending));
    expect(readActiveGenerationRequestId(storage)).toBe("legacy-request");
    expect(readPendingGenerationStart(storage)).toEqual(pending);
    clearActiveGenerationRequestId(storage);
    clearPendingGenerationStart(storage);
    expect(readActiveGenerationRequestId(storage)).toBeNull();
    expect(readPendingGenerationStart(storage)).toBeNull();
  });

  it("claims each proposal revision once while allowing independent proposals and newer revisions", () => {
    const processed = new Set<string>();
    expect(claimProposalDelivery(processed, "proposal-a", 1)).toBe(true);
    expect(claimProposalDelivery(processed, "proposal-a", 1)).toBe(false);
    expect(claimProposalDelivery(processed, "proposal-b", 1)).toBe(true);
    expect(claimProposalDelivery(processed, "proposal-a", 2)).toBe(true);
  });

  it("uses user-facing Portuguese labels for progress and capability states", () => {
    expect(labelGenerationStatus("running")).toBe("Em andamento");
    expect(labelGenerationStatus("waiting_input")).toBe("Aguardando dados");
    expect(labelGenerationStatus("cancelled")).toBe("Cancelada");
    expect(labelGenerationCapabilityReason("durable_worker_required")).toContain("atualizada automaticamente");
    expect(labelGenerationCapabilityReason("unauthenticated")).toContain("Entre na sua conta");
    expect(labelGenerationCapabilityReason("catalogue_required")).toContain("Nenhum design está disponível");
    expect(messageGenerationProposalFailure("provider_timeout")).toContain("demorou demais");
  });

  it("distinguishes historical catalog, invalid evidence and material editorial failures with safe guidance", () => {
    const catalog = messageGenerationProposalFailure("generated component provenance is not eligible");
    const editorial = messageGenerationProposalFailure("Perda factual/editorial fundamentada; limite único de correção esgotado.");
    expect(catalog).toContain("indisponível");
    expect(editorial).toContain("conteúdo");
    expect(catalog).not.toBe(editorial);
    expect(messageGenerationProposalFailure("private https://secret", { code: "review_evidence_invalid", stage: "review", retryable: false })).toContain("não confirma");
    expect(messageGenerationProposalFailure(undefined, { code: "review_response_truncated", stage: "review", retryable: false })).toContain("interrompida pelo limite de geração");
    expect(messageGenerationProposalFailure(undefined, { code: "review_response_invalid", stage: "review", retryable: false })).toContain("resposta inválida");
    expect(messageGenerationProposalFailure(undefined, { code: "review_reconciliation_required", stage: "review", retryable: false })).toContain("aguarda confirmação de uma operação anterior");
    expect(labelGenerationCapabilityReason("maintenance")).toContain("manutenção");
  });
});


