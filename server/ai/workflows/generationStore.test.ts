import { describe, expect, it, vi } from "vitest";
import { createGenerationStore } from "./generationStore";
import type { OrchestratedGenerationInput } from "../../../shared/generationRequest";
import type { ProposalDelivery } from "../../../shared/generationContracts";

const requestId = "2f12c2f5-c75e-49e2-a4e9-65296bbac0f1";
const ownerId = "734940f6-a8e7-42d4-a6cb-7d5e61976870";
const input = {
  ownerId,
  inputType: "text",
  content: "brief",
  platform: "instagram",
  postMode: "static",
  creationMode: "ideation",
  idempotencyKey: "key-1",
} as OrchestratedGenerationInput;

function proposal(slot: number, status: ProposalDelivery["status"] = "planned") {
  return {
    contractVersion: 1,
    proposalId: `p-${requestId}-${slot}`,
    runId: requestId,
    slot,
    revision: 1,
    status,
    findings: [],
    diagnostics: [],
  } as ProposalDelivery;
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: requestId,
    owner_id: ownerId,
    input,
    input_hash: "a".repeat(64),
    status: "queued",
    experimental: false,
    deadline_at: "2026-10-08T18:10:00.000Z",
    proposals: [proposal(0), proposal(1), proposal(2)],
    billing_mode: "dev_pilot",
    ...overrides,
  };
}

function makeDb(responses: Record<string, unknown> = {}) {
  const rpc = vi.fn(async (name: string) => ({
    data: responses[name] ?? null,
    error: null,
  }));
  return { db: { rpc } as any, rpc };
}

describe("durable generation store", () => {
  it("admits with a stable request/run id and the persisted 10 minute deadline", async () => {
    const { db, rpc } = makeDb({ generation_v5_admit: { ...row(), created: true } });
    const store = createGenerationStore(db);
    const before = Date.now();
    const result = await store.admission({
      ownerId,
      idempotencyKey: "key-1",
      inputHash: "a".repeat(64),
      input,
      experimental: false,
    });

    expect(result.created).toBe(true);
    expect(result.record.id).toBe(requestId);
    expect(result.record.proposals).toHaveLength(3);
    expect(result.record.billingMode).toBe("dev_pilot");
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(Date.parse(args.p_deadline_at as string)).toBeGreaterThanOrEqual(before + 9 * 60_000);
    expect(Date.parse(args.p_deadline_at as string)).toBeLessThanOrEqual(before + 10 * 60_000 + 100);
  });

  it("claims with the lease token and exposes the persisted snapshot", async () => {
    const token = "a9a9ec5e-206a-4ae0-a0c0-79c75ecb3f84";
    const { db } = makeDb({
      generation_v5_claim: { ...row({ status: "running", lease_token: token }), leaseToken: token },
    });
    const claimed = await createGenerationStore(db).claim("worker-a");
    expect(claimed?.leaseToken).toBe(token);
    expect(claimed?.record.status).toBe("running");
    expect(claimed?.record.leaseToken).toBe(token);
  });

  it("checkpoints in-flight proposals through the lease-fenced mutation", async () => {
    const { db, rpc } = makeDb({
      generation_v5_lease_update: row({ status: "running" }),
    });
    const store = createGenerationStore(db);
    const record = await store.checkpointProposal(
      requestId,
      "lease",
      proposal(0, "checking"),
    );
    expect(record.id).toBe(requestId);
    expect(rpc).toHaveBeenCalledWith(
      "generation_v5_lease_update",
      expect.objectContaining({
        p_lease_token: "lease",
        p_action: "checkpoint",
        p_payload: expect.objectContaining({
          delivery: expect.objectContaining({ status: "checking", slot: 0 }),
        }),
      }),
    );
  });

  it("passes owner identity to the authenticated polling lookup", async () => {
    const { db } = makeDb();
    const maybeSingle = vi.fn().mockResolvedValue({ data: row(), error: null });
    const eqOwner = vi.fn(() => ({ maybeSingle }));
    const eqId = vi.fn(() => ({ eq: eqOwner }));
    db.from = vi.fn(() => ({ select: vi.fn(() => ({ eq: eqId })) }));
    const record = await createGenerationStore(db).get(requestId, ownerId);
    expect(record?.id).toBe(requestId);
    expect(eqId).toHaveBeenCalledWith("id", requestId);
    expect(eqOwner).toHaveBeenCalledWith("owner_id", ownerId);
  });

  it("treats a started provider operation as uncertain instead of retrying it", async () => {
    const { db, rpc } = makeDb({
      generation_v5_operation: { state: "uncertain" },
    });
    const outcome = await createGenerationStore(db).beginOperation(
      requestId,
      "lease",
      "slot-0:selection",
    );
    expect(outcome).toEqual({ state: "uncertain" });
    expect(rpc).toHaveBeenCalledWith(
      "generation_v5_operation",
      expect.objectContaining({ p_action: "begin", p_operation_key: "slot-0:selection" }),
    );
  });
});
