import { describe, expect, it, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { proposalDeliverySchema } from "@shared/generationContracts";
import {
  durableOperations,
  executeClaimedGeneration,
  requestInputHash,
  requestSnapshot,
} from "./generationRuntime";
import type { GenerationStore, RequestRecord } from "./generationStore";
import { defaultStudioPreferences } from "@shared/studioPreferences";

const id = "00000000-0000-4000-8000-000000000002",
  owner = "00000000-0000-4000-8000-000000000001";
function setup() {
  const input = orchestratedGenerationInputSchema.parse({
    ownerId: owner,
    inputType: "text",
    content: "Café artesanal",
    platform: "instagram",
    idempotencyKey: "stable",
  });
  const definitions = completeDesignTestDefinitions();
  let record: RequestRecord = {
    id,
    ownerId: owner,
    input,
    inputHash: requestInputHash(input),
    status: "running",
    experimental: true,
    deadlineAt: Date.now() + 60000,
    proposals: [0, 1, 2].map(slot =>
      proposalDeliverySchema.parse({
        proposalId: `p-${id}-${slot}`,
        runId: id,
        slot,
        status: "planned",
      })
    ),
    billingMode: "dev_pilot",
    prepared: {
      selectedDefinitions: definitions.map(d => [d]),
      contextContent: input.content,
      visualPreference: defaultStudioPreferences,
    },
  };
  const journal = new Map<
    string,
    { state: "new" | "completed" | "uncertain"; result?: unknown }
  >();
  const store = {
    get: vi.fn(async () => record),
    heartbeat: vi.fn(async () => record),
    savePrepared: vi.fn(async () => record),
    beginOperation: vi.fn(async (_id, _lease, key) => {
      const saved = journal.get(key);
      if (saved) return saved;
      journal.set(key, { state: "uncertain" });
      return { state: "new" };
    }),
    persistOperationResult: vi.fn(async (_id, _lease, key, result) => {
      journal.set(key, { state: "completed", result });
    }),
    markOperationUncertain: vi.fn(async () => {}),
    checkpointProposal: vi.fn(async (_id, _lease, delivery) => {
      if (delivery.status === "ready") throw new Error("ready must commit");
      record = {
        ...record,
        proposals: record.proposals.map(p =>
          p.slot === delivery.slot ? delivery : p
        ),
      };
      return record;
    }),
    commitDelivery: vi.fn(async (_id, _lease, delivery) => {
      record = {
        ...record,
        proposals: record.proposals.map(p =>
          p.slot === delivery.slot ? delivery : p
        ),
      };
      return record;
    }),
    finish: vi.fn(async (_id, _lease, status, errorReason) => {
      record = { ...record, status, errorReason };
      return record;
    }),
  } as unknown as GenerationStore;
  const generateText = vi.fn(async () => ({
    choices: [
      {
        message: {
          content: JSON.stringify({
            caption: "Café da tarde",
            hashtags: [],
            slides: [
              {
                values: [
                  { fieldId: "field-0", value: "Café artesanal" },
                  { fieldId: "field-1", value: "Visite nosso espaço hoje." },
                ],
                mediaPrompts: [],
              },
            ],
          }),
        },
      },
    ],
  })) as any;
  const graphDeps = {
    generateText,
    measureText: () => ({ height: 20, lines: [{ width: 100 }], runs: [] }),
  };
  return { store, journal, generateText, graphDeps, record: () => record };
}

describe("durable runtime and independent delivery", () => {
  it("reconciles a committed delivery with a lost response and lets sibling proposals finish", async () => {
    const s = setup(),
      commit = vi.mocked(s.store.commitDelivery).getMockImplementation()!;
    vi.mocked(s.store.commitDelivery).mockImplementationOnce(
      async (...args) => {
        await commit(...args);
        throw new Error("response lost after commit");
      }
    );
    const snapshot = await executeClaimedGeneration(s.record(), "lease", {
      store: s.store,
      graphDeps: s.graphDeps,
    });
    expect(snapshot.overallStatus).toBe("completed");
    expect(snapshot.proposals.every(p => p.status === "ready")).toBe(true);
    expect(s.generateText).toHaveBeenCalledTimes(3);
    expect(s.store.finish).toHaveBeenCalledWith(id, "lease", "completed");
  });
  it("commits canonical bundles before exposing ready and resumes without a second paid call", async () => {
    const s = setup();
    const snapshot = await executeClaimedGeneration(s.record(), "lease", {
      store: s.store,
      graphDeps: s.graphDeps,
    });
    expect(snapshot.overallStatus).toBe("completed");
    expect(snapshot.proposals.every(p => p.status === "ready")).toBe(true);
    expect(s.store.commitDelivery).toHaveBeenCalledTimes(3);
    expect(s.generateText).toHaveBeenCalledTimes(3);
    const replay = await executeClaimedGeneration(
      { ...s.record(), status: "running" },
      "new-lease",
      { store: s.store, graphDeps: s.graphDeps }
    );
    expect(replay.overallStatus).toBe("completed");
    expect(s.generateText).toHaveBeenCalledTimes(3);
  });
  it("reuses completed copy after a grant failure rather than purchasing new copy", async () => {
    const s = setup();
    vi.mocked(s.store.commitDelivery).mockRejectedValueOnce(
      new Error("grant unavailable")
    );
    const first = await executeClaimedGeneration(s.record(), "lease", {
      store: s.store,
      graphDeps: s.graphDeps,
    });
    expect(first.proposals.filter(p => p.status === "ready")).toHaveLength(2);
    expect(first.proposals.some(p => p.status === "delivery_pending")).toBe(
      true
    );
    expect(s.store.finish).not.toHaveBeenCalled();
    const second = await executeClaimedGeneration(s.record(), "new-lease", {
      store: s.store,
      graphDeps: s.graphDeps,
    });
    expect(second.overallStatus).toBe("completed");
    expect(s.generateText).toHaveBeenCalledTimes(3);
  });
  it.each(["selection", "design-shortlist:0:hash"])(
    "does not repeat uncertain %s after a worker restart",
    async key => {
      const s = setup();
      s.journal.set(`prepare:${key}`, { state: "uncertain" });
      const effect = vi.fn();
      await expect(
        durableOperations(
          s.store,
          s.record(),
          "lease",
          new AbortController().signal,
          "prepare:"
        )(key, effect)
      ).rejects.toThrow("reconciliation_required");
      expect(effect).not.toHaveBeenCalled();
    }
  );
  it("treats Jev batches as paid operations and propagates runtime cancellation", async () => {
    const s = setup(),
      record = { ...s.record(), prepared: undefined };
    const prepare = vi.fn(
      async (_input, _owner, _experimental, _deadline, deps) => {
        expect(deps.signal).toBeInstanceOf(AbortSignal);
        await deps.operation("catalog", async () => []);
        await deps.operation("design-shortlist:0:hash", async () => ({
          answers: {},
        }));
        return s.record().prepared!;
      }
    );
    await executeClaimedGeneration(record, "lease", {
      store: s.store,
      graphDeps: s.graphDeps,
      prepare,
    });
    expect(s.store.beginOperation).toHaveBeenCalledWith(
      id,
      "lease",
      "prepare:catalog",
      true
    );
    expect(s.store.beginOperation).toHaveBeenCalledWith(
      id,
      "lease",
      "prepare:design-shortlist:0:hash",
      false
    );
  });
  it("does not start effects after cancellation or deadline and stops polling an expired request", async () => {
    const s = setup(),
      controller = new AbortController();
    controller.abort();
    const effect = vi.fn();
    await expect(
      durableOperations(
        s.store,
        s.record(),
        "lease",
        controller.signal
      )("copy", effect)
    ).rejects.toThrow();
    expect(effect).not.toHaveBeenCalled();
    const snapshot = requestSnapshot({
      ...s.record(),
      deadlineAt: Date.now() - 1,
    });
    expect(snapshot.overallStatus).toBe("failed");
    expect(snapshot.proposals.every(p => p.status === "expired")).toBe(true);
    await executeClaimedGeneration(
      { ...s.record(), deadlineAt: Date.now() - 1 },
      "lease",
      { store: s.store, graphDeps: s.graphDeps }
    );
    expect(s.generateText).not.toHaveBeenCalled();
  });
  it("keeps the same payload identity for admission retries without including the transport key", () => {
    const s = setup();
    expect(
      requestInputHash({ ...s.record().input, idempotencyKey: "retry" })
    ).toBe(s.record().inputHash);
    expect(
      requestInputHash({ ...s.record().input, content: "Other" })
    ).not.toBe(s.record().inputHash);
  });

  it("invokes settleReservation with proportional ready count upon completion", async () => {
    const s = setup();
    const settleReservation = vi.fn().mockResolvedValue({
      settled: true,
      debitedSparks: 35,
      refundedSparks: 0,
    });
    const snapshot = await executeClaimedGeneration(s.record(), "lease", {
      store: s.store,
      graphDeps: s.graphDeps,
      settleReservation,
    });
    expect(snapshot.overallStatus).toBe("completed");
    expect(settleReservation).toHaveBeenCalledTimes(1);
    expect(settleReservation).toHaveBeenCalledWith({
      reservationId: "dev-mock",
      postMode: "static",
      deliveredReadyCount: 3,
      totalProposalsCount: 3,
      generationRunId: id,
    });
  });
});

import { GenerationCoordinator } from "./generationCoordinator";
it("publishes A after its grant commit while B is still pending, and start is idempotent", async () => {
  const definitions = completeDesignTestDefinitions();
  let releaseB!: () => void;
  const waitB = new Promise<void>(resolve => {
    releaseB = resolve;
  });
  let call = 0;
  const response = {
    choices: [
      {
        message: {
          content: JSON.stringify({
            caption: "Café",
            hashtags: [],
            slides: [
              {
                values: [
                  { fieldId: "field-0", value: "Café" },
                  { fieldId: "field-1", value: "Hoje" },
                ],
                mediaPrompts: [],
              },
            ],
          }),
        },
      },
    ],
  };
  const grants = new Set<number>();
  let observedA!: () => void;
  const aReady = new Promise<void>(resolve => {
    observedA = resolve;
  });
  const coordinator = new GenerationCoordinator(
    {
      requestId: id,
      runId: id,
      actor: owner,
      prompt: "Café",
      offeredDefinitions: definitions,
    },
    {
      actor: owner,
      generateText: vi.fn(async () => {
        const slot = call++;
        if (slot === 1) await waitB;
        return response;
      }) as any,
      measureText: () => ({ height: 20, lines: [{ width: 100 }], runs: [] }),
      deliver: async delivery => {
        grants.add(delivery.slot);
      },
    }
  );
  coordinator.onUpdate(snapshot => {
    for (const proposal of snapshot.proposals)
      if (proposal.status === "ready")
        expect(grants.has(proposal.slot)).toBe(true);
    if (
      snapshot.proposals[0].status === "ready" &&
      snapshot.proposals[1].status !== "ready"
    )
      observedA();
  });
  const first = coordinator.start(),
    second = coordinator.start();
  expect(first).toBe(second);
  await aReady;
  expect(coordinator.getSnapshot().overallStatus).toBe("running");
  releaseB();
  expect((await first).overallStatus).toBe("completed");
});
