import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "../_core/env";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { compactComponentCard } from "@shared/componentAssembly";
import { proposalDeliverySchema } from "@shared/generationContracts";

const state = vi.hoisted(() => ({
  pinned: undefined as string | undefined,
  admission: vi.fn(),
  enqueue: vi.fn(),
  manifest: vi.fn(),
  snapshot: vi.fn(),
  cards: vi.fn(),
}));
vi.mock("../designCatalog/versionedCatalog", () => ({
  readCatalogManifest: state.manifest,
  readCatalogSnapshot: state.snapshot,
  versionedCatalogEnabled: () => ENV.localDemandEnabled,
  withCatalogRevision: async (revision: string, work: () => unknown) => {
    const previous = state.pinned;
    state.pinned = revision;
    try { return await work(); } finally { state.pinned = previous; }
  },
}));
vi.mock("../designCatalog/completeDesignStore", () => ({
  retrieveCompleteDesignCards: state.cards,
}));
vi.mock("../ai/workflows/generationStore", () => ({
  createGenerationStore: () => ({
    isAvailable: async () => true,
    getByIdempotencyKey: async () => null,
    admission: state.admission,
  }),
}));
vi.mock("../ai/workflows/localDemandSupervisor", () => ({
  localExecutorScope: async () => "test-local-executor",
  enqueueLocal: state.enqueue,
}));
vi.mock("../ai/workflows/proposalRenderer", () => ({
  assertReviewRendererConfigured: async () => {},
}));

import { catalogRouter } from "./catalog";
import { generationRouter } from "./generation";
import { designCatalogRouter } from "./designCatalog";

const originalEnv = { ...ENV };
const owner = "00000000-0000-4000-8000-000000000001";
const requestId = "00000000-0000-4000-8000-000000000002";
const input = {
  ownerId: owner,
  inputType: "text" as const,
  content: "Café artesanal",
  platform: "instagram" as const,
  aspectRatio: "4:5" as const,
  postMode: "static" as const,
  generationModel: "gpt" as const,
  includeDraftDesigns: true,
  idempotencyKey: "catalog-admission-test",
};
const ctx = (role = "admin") => ({
  user: { id: owner, email: "test@example.test", role } as any,
  req: {} as any,
  res: {} as any,
});
const counts = (n: number) => ({ staticOfferCount: n, carouselOfferCount: n });
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VERCEL", "");
  Object.assign(ENV, {
    isProduction: false,
    localDemandEnabled: true,
    generationWorkerMode: "local-demand",
    generationAdmissionPaused: false,
    localCatalogRevision: "3",
    generationStrategyVersion: 2,
    openRouterApiKey: "offline-test-only",
  });
  state.manifest.mockImplementation(async (revision?: string) => ({
    revision: revision ?? "1",
    formatVersion: 1,
    summary: {
      approved: counts(revision === "3" ? 13 : 1),
      experimental: counts(revision === "3" ? 29 : 2),
    },
  }));
  state.snapshot.mockImplementation(async (revision: string) => ({
    rows: ["approved", "draft"].map(status => ({
      component_id: `${revision}-${status}`,
      definition_hash: "a".repeat(64),
      card: { id: `${revision}-${status}` },
      design_components: { status },
      definition: { privatePayload: true },
    })),
  }));
  state.cards.mockResolvedValue(completeDesignTestDefinitions().map(compactComponentCard));
  state.admission.mockImplementation(async (admission: any) => ({
    created: true,
    record: {
      id: requestId,
      ownerId: owner,
      input: admission.input,
      status: "queued",
      deadlineAt: Date.now() + 60000,
      proposals: [0, 1, 2].map(slot => proposalDeliverySchema.parse({
        runId: requestId,
        proposalId: `proposal-${slot}`,
        slot,
        status: "planned",
      })),
    },
  }));
});
afterEach(() => {
  Object.assign(ENV, originalEnv);
  state.pinned = undefined;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Studio catalog download before generation admission", () => {
  it("uses the same local staged revision for capabilities, download, readiness and admission", async () => {
    const generation = generationRouter.createCaller(ctx());
    const catalog = catalogRouter.createCaller(ctx());
    const capabilities = await generation.capabilities();
    expect(capabilities).toMatchObject({ enabled: true, catalogRevision: "3" });
    const revision = (capabilities as { catalogRevision: string }).catalogRevision;
    expect(await catalog.manifest()).toMatchObject({ revision, summary: counts(29) });
    // This download is awaited by Studio before it calls generation.start.
    expect(await catalog.snapshot({ revision })).toMatchObject({ revision, rows: [{ component_id: "3-approved" }, { component_id: "3-draft" }] });
    expect(await designCatalogRouter.createCaller(ctx()).generationReadiness()).toMatchObject({ candidateCount: 13, draftCandidateCount: 29 });
    state.cards.mockImplementationOnce(async () => {
      expect(state.pinned).toBe(revision);
      return completeDesignTestDefinitions().map(compactComponentCard);
    });
    await generation.start(input);
    expect(state.admission).toHaveBeenCalledWith(expect.objectContaining({
      catalogRevision: revision,
      stagedCatalog: true,
      executorScope: "test-local-executor",
      generationConfig: expect.objectContaining({ generationStrategyVersion: 2, choice: "gpt" }),
    }));
    expect(state.enqueue).toHaveBeenCalledOnce();
  });

  it("preserves snapshot filtering and forbids a browser-selected revision", async () => {
    const catalog = catalogRouter.createCaller(ctx("user"));
    const snapshot = await catalog.snapshot({ revision: "3" });
    expect(snapshot.scope).toBe("approved");
    expect(snapshot.rows.map(row => row.component_id)).toEqual(["3-approved"]);
    expect(snapshot.rows[0]).not.toHaveProperty("definition");
    await expect(catalog.snapshot({ revision: "2" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(state.snapshot).toHaveBeenCalledOnce();
    expect(await designCatalogRouter.createCaller(ctx("user")).generationReadiness()).toBeNull();
  });

  it.each(["production", "hosted", "external", "unset"])("keeps active revision outside the configured local override: %s", async mode => {
    if (mode === "production") {
      vi.stubEnv("NODE_ENV", "production");
      ENV.isProduction = true;
    } else if (mode === "hosted") vi.stubEnv("VERCEL", "1");
    else if (mode === "external") ENV.generationWorkerMode = "external";
    else ENV.localCatalogRevision = "";
    // Even if an operator leaves localDemandEnabled behind, the override must
    // not expose the staged revision in production/hosted/external execution.
    const catalog = catalogRouter.createCaller(ctx());
    expect(await catalog.manifest()).toMatchObject({ revision: "1", summary: counts(2) });
    await expect(catalog.snapshot({ revision: "3" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await catalog.snapshot({ revision: "1" })).toMatchObject({ revision: "1" });
    expect(await designCatalogRouter.createCaller(ctx()).generationReadiness()).toMatchObject({ candidateCount: 1, draftCandidateCount: 2 });
    await generationRouter.createCaller(ctx()).start(input);
    expect(state.admission).toHaveBeenCalledWith(expect.objectContaining({ catalogRevision: "1", stagedCatalog: false }));
  });
});
