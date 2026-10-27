import { describe, expect, it, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import selectionHistoryFixture from "./fixtures/selection-handoff-history.json";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { proposalDeliverySchema } from "@shared/generationContracts";
import {
  durableOperations,
  executeClaimedGeneration,
  requestInputHash,
  requestSnapshot,
  proposalRecoveryOperationKeys,
} from "./generationRuntime";
import type { GenerationStore, RequestRecord } from "./generationStore";
import { verifyPreparedEligibility } from "./generationPreparation";
import { compactComponentCard } from "@shared/componentAssembly";
import { resolveCompleteDesignOffers } from "@shared/completeDesignOffers";
import { defaultStudioPreferences } from "@shared/studioPreferences";
import { attachEditorialPlanFixture } from "./proposalEditorial.fixture";
import { attachFactCoverageFixture } from "./proposalReview.fixture";
import {
  getGenerationTrace,
  recordLlmTraceCall,
  type GenerationTrace,
} from "../generationTrace";
import { ENV } from "../../_core/env";
import * as localDiagnostics from "../localDiagnostics";
import { resolveReviewExecutionConfigV7 } from "./reviewExecutionConfigV7";

const fixtureReviewScenes: import("./proposalReview").RenderReviewScenes =
  async ({ compositions }) =>
    compositions.map((_scene, slideIndex) => ({
      slideIndex,
      renderer: "CanvasPostStage",
      width: 864,
      height: 1080,
      dataUri: "data:image/png;base64,aW1hZ2U=",
    }));
const reviewReply = () => ({
  choices: [
    {
      message: {
        content: JSON.stringify({
          outcome: "reviewed",
          reviewedSlides: [0],
          findings: [],
          limitation: "",
        }),
      },
    },
  ],
});

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
      preparationVersion:2, reviewPolicyVersion:5, selectedOffers: definitions.map(d=>resolveCompleteDesignOffers([compactComponentCard(d)],{slideCount:1,contentMode:"compose"})[0]),
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
    savePrepared: vi.fn(async (_id, _lease, prepared) => {
      record = { ...record, prepared };
      return record;
    }),
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
    listOperations: vi.fn(async () =>
      Array.from(journal.entries()).map(([operationKey, v]) => ({
        operationKey,
        state: v.state === "new" ? "started" : v.state,
        result: v.result,
      }))
    ),
  } as unknown as GenerationStore;
  const generateText = vi.fn(async params =>
    attachEditorialPlanFixture(
      params.taskRoute === "post_evaluation"
        ? attachFactCoverageFixture(reviewReply(), params)
        : {
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
                          {
                            fieldId: "field-1",
                            value: "Visite nosso espaço hoje.",
                          },
                        ],
                        mediaPrompts: [],
                      },
                    ],
                  }),
                },
              },
            ],
          },
      {
        requestId: id,
        runId: id,
        proposalId: "fixture",
        slot: 0,
        selectedDefinition: definitions[0],
        prompt: input.content,
        contextContent: input.content,
      }
    )
  ) as any;
  const verifyPrepared = (p:any,e:boolean) => verifyPreparedEligibility(p,e,async ids => definitions.filter(d=>ids.includes(d.id)));
  const graphDeps = {
    generateText,
    renderReviewScenes: fixtureReviewScenes,
    measureText: () => ({ height: 20, lines: [{ width: 100 }], runs: [] }),
  };
  return { store, journal, generateText, graphDeps, verifyPrepared, record: () => record };
}

describe("durable runtime and independent delivery", () => {
  it("hot reload stops admission of paid effects without terminalizing recoverable proposals", async()=>{
    const s=setup(),shutdown=new AbortController();shutdown.abort();
    const finish=vi.spyOn(s.store,'finish');
    await expect(executeClaimedGeneration(s.record(),'lease',{store:s.store,shutdownSignal:shutdown.signal,verifyPrepared:s.verifyPrepared,graphDeps:s.graphDeps,persistTrace:vi.fn()})).rejects.toThrow('local_executor_shutdown');
    expect(s.generateText).not.toHaveBeenCalled();expect(finish).not.toHaveBeenCalled();
    expect(s.record().proposals.every(p=>p.status==='planned')).toBe(true);
  });

  it("restores the repair budget from exact owner/proposal operation keys, including uncertain effects", async () => {
    const s = setup(),
      proposalId = s.record().proposals[0].proposalId;
    s.store.listOperations = vi.fn(async () => [
      { operationKey: `${proposalId}:copy_recovery`, state: "uncertain" },
      {
        operationKey: `${proposalId}:review_correction:old-review-hash`,
        state: "completed",
      },
      { operationKey: `${proposalId}:review:initial:hash`, state: "completed" },
      { operationKey: `${proposalId}-other:copy_recovery`, state: "completed" },
    ]);
    expect(
      await proposalRecoveryOperationKeys(s.store, s.record(), proposalId)
    ).toEqual(["copy_recovery", "review_correction:old-review-hash"]);
    expect(s.store.listOperations).toHaveBeenCalledWith(id, owner);
  });
  it("records the real request trace and sums all persisted provider operations once across a full resume", async () => {
    const s = setup();
    s.store.listOperations = vi.fn(async () =>
      Array.from(s.journal, ([operationKey, value]) => ({
        operationKey,
        ...value,
      }))
    );
    const emit = (label: string, cost: number, tokens = 15) =>
      recordLlmTraceCall({
        label,
        requestedModel: "requested",
        effectiveModel: label,
        provider: "fixture",
        providerId: `receipt-${label}`,
        promptHash: "hash",
        messages: ["Private content"],
        promptTokens: tokens - 5,
        completionTokens: 5,
        totalTokens: tokens,
        latencyMs: 1,
        estimatedCostUsd: cost,
        costSource: "provider",
      });
    const base = s.generateText.getMockImplementation();
    const generateText = vi.fn(async (params: any) => {
      await Promise.resolve();
      emit(params.taskRoute, 0.01);
      return base!(params);
    });
    const prepare = vi.fn(
      async (_input, _owner, _experimental, _deadline, deps) => {
        expect(getGenerationTrace()?.id).toBe(id);
        await deps.operation("design-shortlist:0:hash", async () => {
          emit("jev-effective", 0.02, 35);
          return { answers: {} };
        });
        await deps.operation("selection", async () => {
          emit("selection-effective", 0.03, 50);
          return { options: [] };
        });
        return s.record().prepared!;
      }
    );
    const saved: GenerationTrace[] = [];
    const persistTrace = vi.fn(async (trace: GenerationTrace) => {
      saved.push(structuredClone(trace));
    });
    const loadTraceCalls = vi.fn(async () => saved.at(-1)?.calls ?? []);
    await executeClaimedGeneration(
      { ...s.record(), prepared: undefined },
      "lease",
      {
        store: s.store,
        verifyPrepared: s.verifyPrepared,
        prepare,
        graphDeps: { ...s.graphDeps, generateText },
        persistTrace,
        loadTraceCalls,
        workerIdentity: {
          workerId: "sha256:version:instance",
          codeVersion: "sha256:version",
          startedAt: "2026-10-10T19:00:00.000Z",
        },
      }
    );
    expect(saved[0].id).toBe(id);
    expect(
      saved[0].events.find(event => event.stage === "generation_worker")?.data
    ).toMatchObject({
      workerId: "sha256:version:instance",
      codeVersion: "sha256:version",
    });
    expect(saved[0].calls).toHaveLength(8);
    expect(
      saved[0].calls.reduce((sum, call) => sum + call.totalTokens, 0)
    ).toBe(175);
    expect(
      saved[0].calls.reduce((sum, call) => sum + call.estimatedCostUsd, 0)
    ).toBeCloseTo(0.11);
    expect(
      saved[0].events.find(event => event.stage === "generation_metrics")?.data
    ).toMatchObject({ costComplete: true, calls: 8 });
    for (const [key, value] of s.journal)
      if (key.endsWith(":copy") || key.includes(":review:"))
        expect((value.result as any).__generationTrace.calls).toHaveLength(1);
    await executeClaimedGeneration(
      { ...s.record(), status: "running" },
      "new-lease",
      {
        store: s.store,
        verifyPrepared: s.verifyPrepared,
        prepare,
        graphDeps: { ...s.graphDeps, generateText },
        persistTrace,
        loadTraceCalls,
      }
    );
    expect(generateText).toHaveBeenCalledTimes(6);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(saved[1].calls).toEqual(saved[0].calls);
    expect(getGenerationTrace()).toBeUndefined();
  });
  it("preserves a known provider charge before a local failure and keeps it on uncertain replay", async () => {
    const s = setup();
    s.store.listOperations = vi.fn(async () =>
      Array.from(s.journal, ([operationKey, value]) => ({
        operationKey,
        ...value,
      }))
    );
    const effect = vi.fn(async () => {
      recordLlmTraceCall({
        label: "selection",
        requestedModel: "requested",
        effectiveModel: "actual",
        provider: "fixture",
        providerId: "charged-receipt",
        promptHash: "hash",
        messages: [],
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        latencyMs: 1,
        estimatedCostUsd: 0.09,
        costSource: "provider",
      });
      throw new Error("local validation failed after charged response");
    });
    const prepare = vi.fn(
      async (_input, _owner, _experimental, _deadline, deps) => {
        await deps.operation("selection", effect);
        return s.record().prepared!;
      }
    );
    const saved: GenerationTrace[] = [];
    const overrides = {
      store: s.store,
        verifyPrepared: s.verifyPrepared,
      prepare,
      graphDeps: s.graphDeps,
      persistTrace: async (trace: GenerationTrace) => {
        saved.push(structuredClone(trace));
      },
      loadTraceCalls: async () => saved.at(-1)?.calls ?? [],
    };
    await executeClaimedGeneration(
      { ...s.record(), prepared: undefined },
      "lease",
      overrides
    );
    await executeClaimedGeneration(
      { ...s.record(), status: "running", prepared: undefined },
      "new-lease",
      overrides
    );
    expect(effect).toHaveBeenCalledTimes(1);
    expect(
      saved.map(trace =>
        trace.calls.reduce((sum, call) => sum + call.estimatedCostUsd, 0)
      )
    ).toEqual([0.09, 0.09]);
    expect(
      saved[1].events.find(event => event.stage === "generation_metrics")?.data
    ).toMatchObject({
      costComplete: false,
      unknownCostOperations: ["prepare:selection"],
    });
  });
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
        verifyPrepared: s.verifyPrepared,
      graphDeps: s.graphDeps,
    });
    expect(snapshot.overallStatus).toBe("completed");
    expect(snapshot.proposals.every(p => p.status === "ready")).toBe(true);
    expect(s.generateText).toHaveBeenCalledTimes(6);
    expect(s.store.finish).toHaveBeenCalledWith(id, "lease", "completed");
  });
  it("reconciles a terminal finish whose response was lost without attempting a second settlement", async () => {
    const s = setup();
    const finish = vi.mocked(s.store.finish).getMockImplementation()!;
    vi.mocked(s.store.finish).mockImplementationOnce(async (...args) => {
      await finish(...args);
      throw new Error("response lost after terminal commit");
    });
    const snapshot = await executeClaimedGeneration(s.record(), "lease", {
      store: s.store,
        verifyPrepared: s.verifyPrepared,
      graphDeps: s.graphDeps,
    });
    expect(snapshot.overallStatus).toBe("completed");
    expect(s.store.finish).toHaveBeenCalledTimes(1);
    expect(s.generateText).toHaveBeenCalledTimes(6);
  });
  it("commits canonical bundles before exposing ready and resumes without a second paid call", async () => {
    const s = setup();
    const snapshot = await executeClaimedGeneration(s.record(), "lease", {
      store: s.store,
        verifyPrepared: s.verifyPrepared,
      graphDeps: s.graphDeps,
    });
    expect(snapshot.overallStatus).toBe("completed");
    expect(snapshot.proposals.every(p => p.status === "ready")).toBe(true);
    expect(s.store.commitDelivery).toHaveBeenCalledTimes(3);
    expect(s.generateText).toHaveBeenCalledTimes(6);
    const replay = await executeClaimedGeneration(
      { ...s.record(), status: "running" },
      "new-lease",
      { store: s.store,
        verifyPrepared: s.verifyPrepared, graphDeps: s.graphDeps }
    );
    expect(replay.overallStatus).toBe("completed");
    expect(s.generateText).toHaveBeenCalledTimes(6);
  });
  it("reuses completed copy after a grant failure rather than purchasing new copy", async () => {
    const s = setup();
    vi.mocked(s.store.commitDelivery).mockRejectedValueOnce(
      new Error("grant unavailable")
    );
    const first = await executeClaimedGeneration(s.record(), "lease", {
      store: s.store,
        verifyPrepared: s.verifyPrepared,
      graphDeps: s.graphDeps,
    });
    expect(first.proposals.filter(p => p.status === "ready")).toHaveLength(2);
    expect(first.proposals.some(p => p.status === "delivery_pending")).toBe(
      true
    );
    expect(s.store.finish).not.toHaveBeenCalled();
    const second = await executeClaimedGeneration(s.record(), "new-lease", {
      store: s.store,
        verifyPrepared: s.verifyPrepared,
      graphDeps: s.graphDeps,
    });
    expect(second.overallStatus).toBe("completed");
    expect(s.generateText).toHaveBeenCalledTimes(6);
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
        verifyPrepared: s.verifyPrepared,
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
      { store: s.store,
        verifyPrepared: s.verifyPrepared, graphDeps: s.graphDeps }
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
      renderReviewScenes: fixtureReviewScenes,
      generateText: vi.fn(async params => {
        if (params.taskRoute === "post_evaluation")
          return attachFactCoverageFixture(reviewReply(), params);
        const slot = call++;
        if (slot === 1) await waitB;
        return attachEditorialPlanFixture(response, {
          requestId: id,
          runId: id,
          proposalId: "fixture",
          slot,
          selectedDefinition: definitions[slot],
          prompt: "Café",
          contextContent: "Café",
        });
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

it("retains a reviewed proposal's diagnostics after catalog rejection and delivers its siblings independently",async()=>{
 const s=setup();vi.mocked(s.store.commitDelivery).mockRejectedValueOnce(Object.assign(new Error("generated component provenance is not eligible"),{code:"22023"}));
 const snapshot=await executeClaimedGeneration(s.record(),"lease",{store:s.store,verifyPrepared:s.verifyPrepared,graphDeps:s.graphDeps});
 expect(snapshot.overallStatus).toBe("partial");expect(snapshot.proposals.filter(p=>p.status==="ready")).toHaveLength(2);
 const failed=snapshot.proposals.find(p=>p.status==="failed")!;expect(failed.failure?.code).toBe("catalog_component_ineligible");expect(failed.reviews?.at(-1)?.status).toBe("passed");expect(failed).not.toHaveProperty("bundle");
});

it("reuses prepared snapshot context byte-by-byte without reloading even if snapshot in db changes", async () => {
  const s = setup();
  const originalSnapshotContext = "SNAPSHOT ORIGINAL: evidências de café fresco";
  const mutatedSnapshotContext = "SNAPSHOT MUTADO: evidências alteradas";

  const rec = s.record();
  rec.input.siteIntelligenceId = "snap-test-id";
  rec.prepared!.contextContent = originalSnapshotContext;

  const mockLoadContext = vi.fn(async () => mutatedSnapshotContext);
  const mockPrepare = vi.fn();

  const snapshot = await executeClaimedGeneration(rec, "lease", {
    store: s.store,
    verifyPrepared: s.verifyPrepared,
    graphDeps: s.graphDeps,
    loadContext: mockLoadContext,
    prepare: mockPrepare,
  });

  expect(mockLoadContext).not.toHaveBeenCalled();
  expect(mockPrepare).not.toHaveBeenCalled();
  expect(snapshot.proposals.filter(p => p.status === "ready")).toHaveLength(3);
  expect(rec.prepared!.contextContent).toBe(originalSnapshotContext);
});

describe("C-01: selection handoff and resume protection", () => {
  it("writes the persisted terminal state locally without changing delivery or charging operations", async () => {
    const s = setup();
    const enabled = vi.spyOn(localDiagnostics,"localDiagnosticsEnabled").mockReturnValue(true);
    const writer = vi.spyOn(localDiagnostics,"writeLocalDiagnostic").mockResolvedValue(undefined);
    try {
      const result = await executeClaimedGeneration(s.record(),"lease", {store:s.store,verifyPrepared:s.verifyPrepared,graphDeps:s.graphDeps,persistTrace:async()=>{}});
      const terminal = writer.mock.calls.map(c => c[1] as any).find(r => r.kind === "generation_terminal");
      expect(terminal.ownerId).toBe(owner);
      expect(terminal.status).toBe(result.overallStatus);
      expect(terminal.proposals.map((p:any) => p.status)).toEqual(["ready","ready","ready"]);
      expect(terminal.proposals.every((p:any) => p.stage === "delivery")).toBe(true);
      expect(terminal.operations.filter((o:any) => o.key.endsWith(":copy"))).toHaveLength(3);
    } finally { enabled.mockRestore(); writer.mockRestore(); }
  });

  it("AC-1: historical journal without selection_input fails closed before calling new models", async () => {
    // 1. jevCompleted
    const s1 = setup();
    const rec1 = s1.record();
    rec1.prepared = undefined;
    s1.store.listOperations = vi.fn(async () =>
      selectionHistoryFixture.historicalOperationsWithoutSelectionInput.jevCompleted as any
    );
    const mockPrepare1 = vi.fn();
    const snapshot1 = await executeClaimedGeneration(rec1, "lease", {
      store: s1.store,
      prepare: mockPrepare1,
      verifyPrepared: s1.verifyPrepared,
      graphDeps: s1.graphDeps,
    });
    expect(snapshot1.overallStatus).toBe("failed");
    expect(snapshot1.proposals.every(p => p.status === "failed")).toBe(true);
    expect(snapshot1.proposals[0].failure?.code).toBe("preparation_contract_incompatible");
    expect(snapshot1.proposals[0].failure?.stage).toBe("selection");
    expect(snapshot1.proposals[0].failure?.retryable).toBe(false);
    expect(mockPrepare1).not.toHaveBeenCalled();
    expect(s1.generateText).not.toHaveBeenCalled();

    // 2. jevUncertain
    const s2 = setup();
    const rec2 = s2.record();
    rec2.prepared = undefined;
    s2.store.listOperations = vi.fn(async () =>
      selectionHistoryFixture.historicalOperationsWithoutSelectionInput.jevUncertain as any
    );
    const mockPrepare2 = vi.fn();
    const snapshot2 = await executeClaimedGeneration(rec2, "lease", {
      store: s2.store,
      prepare: mockPrepare2,
      verifyPrepared: s2.verifyPrepared,
      graphDeps: s2.graphDeps,
    });
    expect(snapshot2.overallStatus).toBe("failed");
    expect(snapshot2.proposals[0].failure?.code).toBe("preparation_contract_incompatible");
    expect(mockPrepare2).not.toHaveBeenCalled();
    expect(s2.generateText).not.toHaveBeenCalled();

    // 3. selectionCompleted (prior to savePrepared)
    const s3 = setup();
    const rec3 = s3.record();
    rec3.prepared = undefined;
    s3.store.listOperations = vi.fn(async () =>
      selectionHistoryFixture.historicalOperationsWithoutSelectionInput.selectionCompleted as any
    );
    const mockPrepare3 = vi.fn();
    const snapshot3 = await executeClaimedGeneration(rec3, "lease", {
      store: s3.store,
      prepare: mockPrepare3,
      verifyPrepared: s3.verifyPrepared,
      graphDeps: s3.graphDeps,
    });
    expect(snapshot3.overallStatus).toBe("failed");
    expect(snapshot3.proposals[0].failure?.code).toBe("preparation_contract_incompatible");
    expect(mockPrepare3).not.toHaveBeenCalled();
    expect(s3.generateText).not.toHaveBeenCalled();
  });

  it("AC-2: invalid or corrupted journal operations fail closed with preparation_contract_incompatible", async () => {
    // 1. Store listOperations throws
    const s1 = setup();
    const rec1 = s1.record();
    rec1.prepared = undefined;
    s1.store.listOperations = vi.fn(async () => {
      throw new Error("journal read error");
    });
    const snapshot1 = await executeClaimedGeneration(rec1, "lease", {
      store: s1.store,
      prepare: vi.fn(),
      verifyPrepared: s1.verifyPrepared,
      graphDeps: s1.graphDeps,
    });
    expect(snapshot1.overallStatus).toBe("failed");
    expect(snapshot1.proposals[0].failure?.code).toBe("preparation_contract_incompatible");

    // 2. Unknown state
    const s2 = setup();
    const rec2 = s2.record();
    rec2.prepared = undefined;
    s2.store.listOperations = vi.fn(async () => [
      { operationKey: "prepare:context", state: "corrupted_state", result: {} },
    ]);
    const snapshot2 = await executeClaimedGeneration(rec2, "lease", {
      store: s2.store,
      prepare: vi.fn(),
      verifyPrepared: s2.verifyPrepared,
      graphDeps: s2.graphDeps,
    });
    expect(snapshot2.overallStatus).toBe("failed");
    expect(snapshot2.proposals[0].failure?.code).toBe("preparation_contract_incompatible");

    // 3. Invalid selection_input receipt schema
    const s3 = setup();
    const rec3 = s3.record();
    rec3.prepared = undefined;
    s3.store.listOperations = vi.fn(async () => [
      { operationKey: "prepare:selection_input", state: "completed", result: { brief: 123 } },
    ]);
    const snapshot3 = await executeClaimedGeneration(rec3, "lease", {
      store: s3.store,
      prepare: vi.fn(),
      verifyPrepared: s3.verifyPrepared,
      graphDeps: s3.graphDeps,
    });
    expect(snapshot3.overallStatus).toBe("failed");
    expect(snapshot3.proposals[0].failure?.code).toBe("preparation_contract_incompatible");

    // 4. selection_input not completed (e.g. uncertain)
    const s4 = setup();
    const rec4 = s4.record();
    rec4.prepared = undefined;
    s4.store.listOperations = vi.fn(async () => [
      { operationKey: "prepare:selection_input", state: "uncertain", result: null },
    ]);
    const snapshot4 = await executeClaimedGeneration(rec4, "lease", {
      store: s4.store,
      prepare: vi.fn(),
      verifyPrepared: s4.verifyPrepared,
      graphDeps: s4.graphDeps,
    });
    expect(snapshot4.overallStatus).toBe("failed");
    expect(snapshot4.proposals[0].failure?.code).toBe("preparation_contract_incompatible");
  });

  it("AC-2: completed selection_input allows resume without re-buying completed Jev/selector operations", async () => {
    const s = setup();
    const preparedBackup = structuredClone(s.record().prepared!);
    const rec = s.record();
    rec.prepared = undefined;
    const validReceipt = {
      ...selectionHistoryFixture.validSelectionInputReceipt,
      reviewExecutionConfig: resolveReviewExecutionConfigV7(),
      jevModel: ENV.openRouterDesignSelectionModel,
    };

    s.store.listOperations = vi.fn(async () => [
      { operationKey: "prepare:selection_input", state: "completed", result: validReceipt },
      {
        operationKey: "prepare:selection",
        state: "completed",
        result: {
          version: 2,
          options: [
            { offerId: "test-0", reason: "Reused selection" },
            { offerId: "test-1", reason: "Reused selection" },
            { offerId: "test-2", reason: "Reused selection" },
          ],
        },
      },
    ]);

    const mockPrepare = vi.fn(async () => {
      return preparedBackup;
    });

    const snapshot = await executeClaimedGeneration(rec, "lease", {
      store: s.store,
      prepare: mockPrepare,
      verifyPrepared: s.verifyPrepared,
      graphDeps: s.graphDeps,
    });

    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(snapshot.proposals.filter(p => p.status === "ready")).toHaveLength(3);
  });

  it("AC-3: prepared historical state resumes with exact byte-by-byte context, no pin rewrite, no re-buying", async () => {
    const s = setup();
    const rec = s.record();
    const originalHash = "test-editorial-context-hash-original";
    rec.prepared!.editorialContextHash = originalHash;

    const mockPrepare = vi.fn();
    const mockLoadContext = vi.fn();

    const snapshot = await executeClaimedGeneration(rec, "lease", {
      store: s.store,
      prepare: mockPrepare,
      loadContext: mockLoadContext,
      verifyPrepared: s.verifyPrepared,
      graphDeps: s.graphDeps,
    });

    expect(mockPrepare).not.toHaveBeenCalled();
    expect(mockLoadContext).not.toHaveBeenCalled();
    expect(rec.prepared!.editorialContextHash).toBe(originalHash);
    expect(snapshot.proposals.filter(p => p.status === "ready")).toHaveLength(3);
  });

  it("AC-2: modified environment review model or configurationHash in selection_input fails closed before calling prepare", async () => {
    const s = setup();
    const rec = s.record();
    rec.prepared = undefined;
    const validReceipt = selectionHistoryFixture.validSelectionInputReceipt;

    const invalidReceipt = {
      ...validReceipt,
      reviewExecutionConfig: {
        ...validReceipt.reviewExecutionConfig,
        configurationHash: "0".repeat(64),
      },
    };

    s.store.listOperations = vi.fn(async () => [
      { operationKey: "prepare:selection_input", state: "completed", result: invalidReceipt },
      { operationKey: "prepare:selection", state: "completed", result: {} },
    ]);

    const mockPrepare = vi.fn();
    const snapshot = await executeClaimedGeneration(rec, "lease", {
      store: s.store,
      prepare: mockPrepare,
      verifyPrepared: s.verifyPrepared,
      graphDeps: s.graphDeps,
    });

    expect(mockPrepare).not.toHaveBeenCalled();
    expect(snapshot.overallStatus).toBe("failed");
    expect(snapshot.proposals[0].failure?.code).toBe("preparation_contract_incompatible");
  });
});


