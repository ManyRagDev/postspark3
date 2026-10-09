import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV } from "../_core/env";
import { proposalDeliverySchema } from "@shared/generationContracts";
const state = vi.hoisted(() => ({
  plan: "DEV",
  available: true,
  admission: vi.fn(),
  get: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("../billing", async importOriginal => {
  const actual = await importOriginal<typeof import("../billing")>();
  return {
    ...actual,
    getBillingProfile: async () => ({ plan: state.plan, id: "test-user-id" }),
    reserveSparks: vi.fn(async () => ({ reservationId: "dev-mock" })),
    refundSparkReservation: vi.fn(async () => true),
    settleV5GenerationReservation: vi.fn(async () => ({
      settled: true,
      debitedSparks: 0,
      refundedSparks: 0,
    })),
    getReservationByIdempotencyKey: vi.fn(async () => null),
  };
});
vi.mock("../ai/workflows/generationStore", () => ({
  createGenerationStore: () => ({
    isAvailable: async () => state.available,
    admission: state.admission,
    get: state.get,
    cancel: state.cancel,
  }),
}));
import { generationRouter } from "./generation";
const owner = "00000000-0000-4000-8000-000000000001",
  id = "00000000-0000-4000-8000-000000000002";
const original = ENV.generationV5Mode;
afterEach(() => {
  ENV.generationV5Mode = original;
  state.plan = "DEV";
  state.available = true;
  vi.clearAllMocks();
});
const input = {
  ownerId: owner,
  inputType: "text" as const,
  content: "Café artesanal",
  platform: "instagram" as const,
  idempotencyKey: "same-key",
};
function caller(
  user: any = { id: owner, email: "dev@example.test", role: "admin" }
) {
  ENV.generationV5Mode = "dev";
  return generationRouter.createCaller({
    user,
    req: {} as any,
    res: {} as any,
  });
}
function record() {
  return {
    id,
    ownerId: owner,
    input,
    status: "queued",
    deadlineAt: Date.now() + 60000,
    proposals: [0, 1, 2].map(slot =>
      proposalDeliverySchema.parse({
        runId: id,
        proposalId: "p-" + id + "-" + slot,
        slot,
        status: "planned",
      })
    ),
  };
}

describe("orchestrated authenticated API", () => {
  it("allows DEV to select V5 while the worker starts, but still refuses admission without it", async () => {
    state.available = false;
    const api = caller();
    expect(await api.capabilities()).toMatchObject({
      selectable: true,
      enabled: false,
      reason: "durable_worker_required",
    });
    await expect(api.start(input)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(state.admission).not.toHaveBeenCalled();
    state.available = true;
    expect(await api.capabilities()).toMatchObject({ selectable: true, enabled: true, reason: "ready" });
  });
  it("distinguishes an environment with V5 off from an account outside the DEV pilot", async () => {
    const api = caller();
    ENV.generationV5Mode = "off";
    expect(await api.capabilities()).toMatchObject({ selectable: false, enabled: false, reason: "pilot_disabled" });
    ENV.generationV5Mode = "dev";
    state.plan = "PRO";
    expect(await api.capabilities()).toMatchObject({ selectable: false, enabled: false, reason: "dev_account_required" });
  });
  it("rejects a locally persisted retry belonging to a previous account before admission", async () => {
    expect((await caller().capabilities()).ownerId).toBe(owner);
    await expect(
      caller().start({
        ...input,
        ownerId: "00000000-0000-4000-8000-000000000004",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.admission).not.toHaveBeenCalled();
  });
  it("requires authentication and DEV eligibility before admission", async () => {
    await expect(caller(null).start(input)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    state.plan = "PRO";
    expect((await caller().capabilities()).enabled).toBe(false);
    await expect(caller().start(input)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(state.admission).not.toHaveBeenCalled();
  });
  it("fails before admission when there is no durable executor or draft permission", async () => {
    state.available = false;
    await expect(caller().start(input)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    state.available = true;
    await expect(
      caller({ id: owner, email: "dev@example.test", role: "user" }).start({
        ...input,
        includeDraftDesigns: true,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.admission).not.toHaveBeenCalled();
  });
  it("admits once with owner and stable payload hash and returns without executing an LLM", async () => {
    state.admission.mockResolvedValue({ record: record(), created: true });
    const result = await caller().start(input);
    expect(result.created).toBe(true);
    expect(result.snapshot.proposals).toHaveLength(3);
    expect(state.admission).toHaveBeenCalledTimes(1);
    expect(state.admission.mock.calls[0][0]).toMatchObject({
      ownerId: owner,
      idempotencyKey: "same-key",
      experimental: false,
    });
    expect(state.admission.mock.calls[0][0].inputHash).toMatch(
      /^[a-f0-9]{64}$/
    );
  });
  it("never returns another owner's request and forwards identity when polling/cancelling", async () => {
    state.get.mockResolvedValue(null);
    await expect(caller().get({ requestId: id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(state.get).toHaveBeenCalledWith(id, owner);
    state.cancel.mockResolvedValue(null);
    await expect(caller().cancel({ requestId: id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(state.cancel).toHaveBeenCalledWith(id, owner);
  });
  it("returns only restoration context when polling, without resending inline images or transport keys", async () => {
    const stored = record();
    state.get.mockResolvedValue({
      ...stored,
      input: {
        ...stored.input,
        imageUrl: "data:image/png;base64,large-image",
        executionBrief: {
          rawInput: "Texto original",
          brandInput: {
            referenceImageUrl: "data:image/png;base64,another-image",
            logoUrl: "data:image/png;base64,logo",
          },
        },
      },
    });
    const result = await caller().get({ requestId: id });
    expect(result.input).toEqual({
      inputType: "text",
      content: "Café artesanal",
      postMode: undefined,
      executionBrief: { rawInput: "Texto original" },
    });
    expect(JSON.stringify(result)).not.toContain("base64");
    expect(JSON.stringify(result)).not.toContain("idempotencyKey");
  });
  it("rejects arbitrary image references before any paid stage", async () => {
    await expect(
      caller().start({ ...input, imageUrl: "https://external.test/image.png" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.admission).not.toHaveBeenCalled();
  });
  it("rejects external logos and corrupt inline references before admission", async () => {
    await expect(
      caller().start({
        ...input,
        creationMode: "execution",
        executionBrief: {
          creationMode: "execution",
          rawInput: "Café",
          format: "static",
          platform: "instagram",
          objective: "sell",
          interventionLevel: "visual_only",
          contentSourceType: "freeform",
          brandInput: {
            logoUrl: "https://external.test/logo.png",
            adaptationMode: "strict",
          },
        },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller().start({ ...input, imageUrl: "data:image/png;base64,aGVsbG8=" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.admission).not.toHaveBeenCalled();
  });
  it("reports idempotency collisions and active capacity as explicit errors", async () => {
    state.admission.mockRejectedValueOnce(
      new Error("Idempotency key reused with different input")
    );
    await expect(caller().start(input)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    state.admission.mockRejectedValueOnce(
      new Error("Active generation limit reached")
    );
    await expect(caller().start(input)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });
  it("rejects admission when user has insufficient sparks", async () => {
    const { reserveSparks } = await import("../billing");
    vi.mocked(reserveSparks).mockResolvedValueOnce({
      reservationId: null,
      reason: "insufficient_sparks",
    });
    await expect(caller().start(input)).rejects.toMatchObject({
      code: "PAYMENT_REQUIRED",
    });
    expect(state.admission).not.toHaveBeenCalled();
  });
  it("refunds reservation if admission throws a transient error", async () => {
    const { reserveSparks, refundSparkReservation } = await import("../billing");
    vi.mocked(reserveSparks).mockResolvedValueOnce({
      reservationId: "res-refund-test",
    });
    state.admission.mockRejectedValueOnce(
      new Error("Active generation limit reached")
    );
    await expect(caller().start(input)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(refundSparkReservation).toHaveBeenCalledWith(
      "res-refund-test",
      expect.stringContaining("Admissão persistente falhou")
    );
  });
  it("settles billing on generation cancel", async () => {
    const { settleV5GenerationReservation } = await import("../billing");
    state.cancel.mockResolvedValueOnce({
      ...record(),
      status: "cancelled",
    });
    const result = await caller().cancel({ requestId: id });
    expect(result.snapshot.overallStatus).toBe("cancelled");
    expect(settleV5GenerationReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveredReadyCount: 0,
        generationRunId: id,
        postMode: "static",
      })
    );
  });
});
