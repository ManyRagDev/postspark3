import { describe, expect, it } from "vitest";
import {
  ACTIVE_V5_REQUEST_SESSION_KEY,
  PENDING_V5_START_SESSION_KEY,
  claimProposalDelivery,
  clearActiveV5RequestId,
  clearPendingV5Start,
  labelV5CapabilityReason,
  labelV5Status,
  messageV5ProposalFailure,
  newV5IdempotencyKey,
  persistActiveV5RequestId,
  persistPendingV5Start,
  readPendingV5Start,
  readActiveV5RequestId,
} from "./studioGenerationV5State";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("Studio V5 request state", () => {
  it("resumes the same admitted request after a page refresh", () => {
    const storage = memoryStorage();
    persistActiveV5RequestId(storage, "0cc1ff2a-7fbb-40c2-812a-285e25abfba3");

    expect(readActiveV5RequestId(storage)).toBe("0cc1ff2a-7fbb-40c2-812a-285e25abfba3");
    clearActiveV5RequestId(storage);
    expect(readActiveV5RequestId(storage)).toBeNull();
    expect(ACTIVE_V5_REQUEST_SESSION_KEY).toContain("request_id");
  });

  it("persists the exact admission payload and key until the server acknowledges admission", () => {
    const storage = memoryStorage();
    const pending = {
      input: { ownerId: "00000000-0000-4000-8000-000000000001", inputType: "text", content: "Brief original", platform: "instagram", postMode: "static", idempotencyKey: newV5IdempotencyKey() } as any,
      source: "create" as const,
      promptText: "Brief original",
      mode: "static" as const,
      inputType: "text" as const,
    };
    persistPendingV5Start(storage, pending);
    expect(readPendingV5Start(storage)).toEqual(pending);
    expect(readPendingV5Start(storage)?.input).toEqual(pending.input);
    clearPendingV5Start(storage);
    expect(storage.getItem(PENDING_V5_START_SESSION_KEY)).toBeNull();
  });

  it("claims each proposal revision once while allowing independent proposals and newer revisions", () => {
    const processed = new Set<string>();
    expect(claimProposalDelivery(processed, "proposal-a", 1)).toBe(true);
    expect(claimProposalDelivery(processed, "proposal-a", 1)).toBe(false);
    expect(claimProposalDelivery(processed, "proposal-b", 1)).toBe(true);
    expect(claimProposalDelivery(processed, "proposal-a", 2)).toBe(true);
  });

  it("uses user-facing Portuguese labels for progress and capability states", () => {
    expect(labelV5Status("running")).toBe("Em andamento");
    expect(labelV5Status("waiting_input")).toBe("Aguardando dados");
    expect(labelV5Status("cancelled")).toBe("Cancelada");
    expect(labelV5CapabilityReason("durable_worker_required")).toContain("atualizada automaticamente");
    expect(labelV5CapabilityReason("pilot_disabled")).toContain("desligada neste ambiente");
    expect(labelV5CapabilityReason("dev_account_required")).toContain("contas DEV");
    expect(messageV5ProposalFailure("provider_timeout")).toContain("demorou demais");
  });
});
