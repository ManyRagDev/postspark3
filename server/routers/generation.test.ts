vi.mock("../designCatalog/versionedCatalog",()=>({readCatalogManifest:async()=>({revision:"1"}),withCatalogRevision:(_revision:string,work:()=>unknown)=>work()}));
import { ENV } from "../_core/env";
import { resolveGenerationModelConfig } from "../ai/generationModel";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { proposalDeliverySchema } from "@shared/generationContracts";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { compactComponentCard } from "@shared/componentAssembly";
import { authorFamilyCarouselRepertoire } from "../designCatalog/familyCarouselRepertoire";
const originalProviderKey=ENV.openRouterApiKey;
const originalStrategy=ENV.generationStrategyVersion;
beforeEach(()=>{ENV.openRouterApiKey="offline-test-configured";});
afterEach(()=>{ENV.openRouterApiKey=originalProviderKey;});
const state = vi.hoisted(() => ({
  plan: "DEV",
  available: true,
  preparationAvailable: true,
  taskRoutingAvailable: true,
  reviewExceptionsAvailable: true,
  approved: 3,
  draft: 0,
  catalogCards: null as any[] | null,
  saveMedia: vi.fn(async (_data: string, owner: string) => ({
    url: `/api/post-media/${owner}/${"a".repeat(64)}`,
  })),
  admission: vi.fn(),
  getBy: vi.fn(async () => null as any),
  get: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("../designCatalog/completeDesignStore", async () => {
  const { completeDesignTestDefinitions } = await import(
    "../../shared/completeDesignGeneration.fixture"
  );
  const { compactComponentCard } = await import(
    "../../shared/componentAssembly"
  );
  return {
    retrieveCompleteDesignCards: vi.fn(
      async ({ experimental }) =>
        state.catalogCards ??
        (state.approved + (experimental ? state.draft : 0)
          ? completeDesignTestDefinitions().map(compactComponentCard)
          : [])
    ),
  };
});
vi.mock("../mediaAssets", async importOriginal => {
  const actual = await importOriginal<typeof import("../mediaAssets")>();
  return { ...actual, saveUserMediaAsset: state.saveMedia };
});
vi.mock("../ai/workflows/generationStore", () => ({
  createGenerationStore: () => ({
    isAvailable: async () => state.available,
    isFixedDesignAvailable: async () => true,
    isPreparationAvailable: async () => state.preparationAvailable,
    isTaskRoutingAvailable: async () => state.taskRoutingAvailable,
    isReviewExceptionsAvailable: async () => state.reviewExceptionsAvailable,
    catalogAvailability: async () => ({
      approved: state.approved,
      draft: state.draft,
    }),
    admission: state.admission,
    getByIdempotencyKey: state.getBy,
    get: state.get,
    cancel: state.cancel,
  }),
}));
import { generationRouter } from "./generation";
import { requestInputHash } from "../ai/workflows/generationRuntime";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { retrieveCompleteDesignCards } from "../designCatalog/completeDesignStore";
const owner = "00000000-0000-4000-8000-000000000001",
  id = "00000000-0000-4000-8000-000000000002";
afterEach(() => {
  ENV.generationAdmissionPaused = false;
  ENV.generationStrategyVersion = originalStrategy;
  state.plan = "DEV";
  state.available = true;
  state.preparationAvailable = true;
  state.taskRoutingAvailable = true;
  state.reviewExceptionsAvailable = true;
  state.getBy.mockResolvedValue(null);
  state.approved = 3;
  state.draft = 0;
  state.catalogCards = null;
  vi.clearAllMocks();
});
const input = {
  generationModel: "gemini" as const,
  ownerId: owner,
  inputType: "text" as const,
  content: "Café artesanal",
  platform: "instagram" as const,
  idempotencyKey: "same-key",
};
function caller(
  user: any = { id: owner, email: "dev@example.test", role: "admin" }
) {
  return generationRouter.createCaller({
    user,
    req: {} as any,
    res: {} as any,
  });
}

it("pins the exact showcase card before admitting and skips general catalog retrieval", async () => {
  const fixedDesign = { kind: "showcase", id: "risograph" } as const;
  state.admission.mockImplementationOnce(async request => ({
    created: true,
    record: { id, ownerId: owner, input: request.input, deadlineAt: Date.now() + 10000, status: "queued", proposals: [
      proposalDeliverySchema.parse({ proposalId: `p-${id}-0`, runId: id, slot: 0, status: "planned" }),
    ] },
  }));
  const result = await caller().start({ ...input, fixedDesign, aspectRatio: "4:5" });
  expect(retrieveCompleteDesignCards).not.toHaveBeenCalled();
  expect(result.snapshot.proposals).toHaveLength(1);
  expect(state.admission.mock.calls[0][0].input.pinnedDesign).toMatchObject({
    sourceId: "showcase:risograph", canvas: { familyName: "Risograph Print Zine" },
  });
});

it("rejects an incompatible fixed format before reserving", async () => {
  await expect(caller().start({ ...input, fixedDesign: { kind: "showcase", id: "risograph" }, aspectRatio: "1:1" }))
    .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  expect(state.admission).not.toHaveBeenCalled();
});
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
  it("defaults new requests to auto and treats media preference as creative direction", async () => {
    state.admission.mockResolvedValue({record:record(),created:true});
    await caller().start({...input, generationModel: undefined, content:"Café com uma foto"});
    expect(state.admission.mock.calls[0][0].generationConfig).toMatchObject({choice:"auto",generationStrategyVersion:2,taskRouting:{policy:"deepseek_haiku_v2"}});
  });
  it("refuses auto before reserving Sparks when its database protocol is missing", async () => {
    state.taskRoutingAvailable=false;
    await expect(caller().start({...input,generationModel:"auto"})).rejects.toMatchObject({code:"PRECONDITION_FAILED"});
    expect(state.admission).not.toHaveBeenCalled();
  });
  it("blocks automatic admission before billing when exception review migration is missing", async () => {
    state.reviewExceptionsAvailable=false;
    await expect(caller().start({...input,generationModel:"auto"})).rejects.toMatchObject({code:"PRECONDITION_FAILED"});
    expect(state.admission).not.toHaveBeenCalled();
  });

  it("rejects strategy-2 admission before any reservation when preparation migration is absent", async () => {
    ENV.generationStrategyVersion = 2;
    state.preparationAvailable = false;
    await expect(caller().start({ ...input, postMode: "static" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(state.admission).not.toHaveBeenCalled();
  });
  it("admits a V3-only carousel with strategy2 and uses the pinned parent strategy for generate-more", async () => {
    const source=completeDesignTestDefinitions()[0];
    state.catalogCards=[source,...authorFamilyCarouselRepertoire(source)].map(compactComponentCard);
    state.admission.mockResolvedValue({record:record(),created:true});
    const carousel={...input,content:"Explique o tema em 5 slides",postMode:"carousel" as const,slideCount:5};
    ENV.generationStrategyVersion=2;
    await caller().start(carousel);
    const config=state.admission.mock.calls[0][0].generationConfig;
    expect(config.generationStrategyVersion).toBe(2);
    ENV.generationStrategyVersion=1;
    state.get.mockResolvedValue({...record(),generationConfig:config});
    await caller().start({...carousel,generationParentRequestId:id});
    expect(state.admission.mock.calls[1][0].generationConfig).toEqual(config);
    const historical=resolveGenerationModelConfig(carousel);
    state.get.mockResolvedValue({...record(),generationConfig:historical});
    ENV.generationStrategyVersion=2;
    await expect(caller().start({...carousel,generationParentRequestId:id})).rejects.toMatchObject({code:"PRECONDITION_FAILED"});
    expect(state.admission).toHaveBeenCalledTimes(2);
  });
  it("lets strategy2 plan partial delivery when a requested photo/type mix is only partly available", async () => {
    const source=completeDesignTestDefinitions()[0];
    state.catalogCards=[source,...authorFamilyCarouselRepertoire(source)].map(compactComponentCard);
    ENV.generationStrategyVersion=2;
    state.admission.mockResolvedValue({record:record(),created:true});
    await caller().start({...input,content:"duas propostas com foto e uma tipográfica",postMode:"carousel",slideCount:5});
    expect(state.admission).toHaveBeenCalledOnce();
  });
  it("admits an explicit GPT receipt without changing the client input hash", async () => {
    state.admission.mockResolvedValue({ record: record(), created: true });
    const parsed = orchestratedGenerationInputSchema.parse({ ...input, generationModel: "gpt" });
    await caller().start(parsed);
    const admitted = state.admission.mock.calls[0][0];
    expect(admitted.generationConfig).toMatchObject({ choice: "gpt", model: "openai/gpt-6.1-sol", reasoningEffort: "medium", structuredOutputMode: "native_schema" });
    expect(admitted.input).toEqual(parsed);
    expect(admitted.inputHash).toBe(requestInputHash(parsed));
    expect(admitted.input).not.toHaveProperty("generationConfig");
  });

  it("inherits the exact admitted configuration for generate-more and checks parent ownership", async () => {
    const config = resolveGenerationModelConfig({ generationModel: "gpt", postMode: "static" });
    state.get.mockResolvedValue({ ...record(), generationConfig: config });
    state.admission.mockResolvedValue({ record: record(), created: true });
    await caller().start({ ...input, generationModel: "gpt", generationParentRequestId: id });
    expect(state.get).toHaveBeenCalledWith(id, owner);
    expect(state.admission.mock.calls[0][0].generationConfig).toEqual(config);
    await expect(caller().start({ ...input, generationModel: "gemini", generationParentRequestId: id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    state.get.mockResolvedValue(null);
    await expect(caller().start({ ...input, generationParentRequestId: id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(state.admission).toHaveBeenCalledTimes(1);
  });

  it("returns an existing idempotent GPT request without re-resolving its config", async () => {
    const parsed = orchestratedGenerationInputSchema.parse({ ...input, generationModel: "gpt" });
    state.getBy.mockResolvedValue({ ...record(), input: parsed, inputHash: requestInputHash(parsed), generationConfig: resolveGenerationModelConfig(parsed) });
    expect(await caller().start(parsed)).toMatchObject({ created: false });
    expect(state.admission).not.toHaveBeenCalled();
  });
  it("logs the configured route and the public early rejection without logging the briefing", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    state.catalogCards = [];
    try {
      await expect(caller().start({
        ...input,
        content: "private briefing marker",
        model: "llama",
        postMode: "carousel",
        slideCount: 3,
      })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect(info).toHaveBeenCalledWith(expect.stringContaining(
        `rota=carousel_generation | modelo_configurado=${ENV.openRouterCarouselModel}`
      ));
      expect(error).toHaveBeenCalledWith("[trpc:generation.start] Pedido recusado", {
        code: "PRECONDITION_FAILED",
        message: expect.stringContaining("Nenhum Spark foi reservado"),
      });
      expect(JSON.stringify([...info.mock.calls, ...error.mock.calls])).not.toContain("private briefing marker");
      expect(state.admission).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
      error.mockRestore();
    }
  });
  it("allows DEV to select V5 while the worker starts, but still refuses admission without it", async () => {
    state.available = false;
    const api = caller();
    expect(await api.capabilities()).toMatchObject({
      selectable: true,
      enabled: false,
      reason: "durable_worker_required",
    });
    await expect(api.start(input)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(state.admission).not.toHaveBeenCalled();
    state.available = true;
    expect(await api.capabilities()).toMatchObject({
      selectable: true,
      enabled: true,
      reason: "ready",
    });
  });
  it("makes the same durable pipeline available to authenticated FREE/PRO/DEV accounts", async () => {
    for (const plan of ["FREE", "PRO", "DEV"]) {
      state.plan = plan;
      expect(await caller().capabilities()).toMatchObject({
        enabled: true,
        selectable: true,
        reason: "ready",
      });
    }
  });
  it("reports a missing published catalogue and refuses admission before reserving funds", async () => {
    state.approved = 0;
    state.draft = 3;
    const api = caller({ id: owner, email: "user@example.test", role: "user" });
    expect(await api.capabilities()).toMatchObject({
      enabled: false,
      reason: "catalogue_required",
    });
    await expect(api.start(input)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(state.admission).not.toHaveBeenCalled();
    expect(await caller().capabilities()).toMatchObject({
      enabled: true,
      reason: "ready",
    });
  });
  it("returns an exact admitted retry during worker/catalog/media outage without revalidating admission dependencies", async () => {
    state.available = false;
    state.approved = 0;
    const parsed = orchestratedGenerationInputSchema.parse({
      ...input,
      imageUrl: "https://invalid-private-reference.test/image.png",
    });
    state.getBy.mockResolvedValue({
      ...record(),
      input: parsed,
      inputHash: requestInputHash(parsed),
    });
    expect(await caller().start(parsed)).toMatchObject({ created: false });
    expect(retrieveCompleteDesignCards).not.toHaveBeenCalled();
    expect(state.admission).not.toHaveBeenCalled();
    await expect(
      caller().start({ ...parsed, content: "Changed brief" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("rejects exact-format or authored-revision unavailability before admission despite positive advisory counts", async () => {
    state.catalogCards = [];
    await expect(
      caller().start({
        ...input,
        aspectRatio: "4:5",
        postMode: "carousel",
        slideCount: 3,
        includeDraftDesigns: true,
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(retrieveCompleteDesignCards).toHaveBeenCalledTimes(1);
    expect(retrieveCompleteDesignCards).toHaveBeenCalledWith(
      expect.objectContaining({
        aspectRatio: "4:5",
        postMode: "carousel",
        slideCount: 3,
        experimental: true,
      })
    );
    expect(state.admission).not.toHaveBeenCalled();
  });
  it("rejects a photo-required request before billing when the eligible catalog has only typography", async () => {
    await expect(
      caller().start({ ...input, content: "Café com uma foto" })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(state.admission).not.toHaveBeenCalled();
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
  it("requires authentication before admission", async () => {
    await expect(caller(null).start(input)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
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
    expect(result.input).toMatchObject({
      inputType: "text",
      content: "Café artesanal",
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
  it("persists validated inline references privately while retaining the original retry hash", async () => {
    state.catalogCards =
      completeDesignTestDefinitions().map(compactComponentCard);
    state.catalogCards[0].mediaSlots.push({
      id: "photo",
      label: "Foto",
      function: "Foto editorial",
      prompt: "",
      deferred: true,
      policy: "cover",
    });
    const image =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
    const parsed = orchestratedGenerationInputSchema.parse({
      ...input,
      imageUrl: image,
    });
    state.admission.mockResolvedValue({ record: record(), created: true });
    await caller().start(parsed);
    expect(state.saveMedia).toHaveBeenCalledTimes(1);
    const admitted = state.admission.mock.calls[0][0];
    expect(admitted.input.imageUrl).toBe(
      `/api/post-media/${owner}/${"a".repeat(64)}`
    );
    expect(admitted.inputHash).toBe(requestInputHash(parsed));
    state.getBy.mockResolvedValue({
      ...record(),
      input: admitted.input,
      inputHash: admitted.inputHash,
    });
    await caller().start(parsed);
    expect(state.saveMedia).toHaveBeenCalledTimes(1);
    expect(state.admission).toHaveBeenCalledTimes(1);
    state.get.mockResolvedValue({
      ...record(),
      input: admitted.input,
      inputHash: admitted.inputHash,
    });
    expect((await caller().get({ requestId: id })).input.imageUrl).toBe(
      admitted.input.imageUrl
    );
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
  it("maps an atomic admission insufficient-funds error without a separate reserve/refund phase", async () => {
    state.admission.mockRejectedValueOnce(
      Object.assign(new Error("Insufficient sparks"), { code: "PT402" })
    );
    await expect(caller().start(input)).rejects.toMatchObject({
      code: "PAYMENT_REQUIRED",
    });
    expect(state.admission).toHaveBeenCalledTimes(1);
  });
  it("returns cancellation after the database has preserved ready proposals and settled their charge", async () => {
    state.cancel.mockResolvedValueOnce({ ...record(), status: "cancelled" });
    const result = await caller().cancel({ requestId: id });
    expect(result.snapshot.overallStatus).toBe("cancelled");
    expect(state.cancel).toHaveBeenCalledWith(id, owner);
  });

  it("admits executionBrief with audience and brandEssence, enforcing limits and owner identity", async () => {
    const validExecution = {
      ...input,
      creationMode: "execution" as const,
      executionBrief: {
        creationMode: "execution" as const,
        format: "static" as const,
        platform: "instagram" as const,
        objective: "engage" as const,
        interventionLevel: "optimize_structure" as const,
        contentSourceType: "freeform" as const,
        rawInput: "Texto principal do briefing",
        audience: "Público B2B nichado",
        brandEssence: "Essência de inovação",
      },
    };
    state.admission.mockResolvedValueOnce({ record: record(), created: true });
    await caller().start(validExecution);
    expect(state.admission).toHaveBeenCalledTimes(1);
    const admitted = state.admission.mock.calls[0][0];
    expect(admitted.input.executionBrief.audience).toBe("Público B2B nichado");
    expect(admitted.input.executionBrief.brandEssence).toBe("Essência de inovação");

    // >2000 chars rejected
    const tooLongAudience = {
      ...validExecution,
      executionBrief: {
        ...validExecution.executionBrief,
        audience: "a".repeat(2001),
      },
    };
    await expect(caller().start(tooLongAudience)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    const tooLongEssence = {
      ...validExecution,
      executionBrief: {
        ...validExecution.executionBrief,
        brandEssence: "b".repeat(2001),
      },
    };
    await expect(caller().start(tooLongEssence)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    // Owner mismatch rejected with FORBIDDEN
    const wrongOwner = {
      ...validExecution,
      ownerId: "00000000-0000-4000-8000-000000000099",
    };
    await expect(caller().start(wrongOwner)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

 it("pauses only new admissions before reserve, preserving idempotent returns, get and cancel",async()=>{
   ENV.generationAdmissionPaused=true;state.available=false;
   ENV.openRouterApiKey="";
   expect(await caller().capabilities()).toMatchObject({enabled:false,reason:"maintenance"});
   await expect(caller().start(input)).rejects.toMatchObject({
     code:"PRECONDITION_FAILED",
     failure:{reason:"generation_paused",retryable:false},
   });
   expect(state.admission).not.toHaveBeenCalled();
   state.getBy.mockResolvedValueOnce({...record(),inputHash:requestInputHash(orchestratedGenerationInputSchema.parse(input))});
   expect((await caller().start(input)).created).toBe(false);
   state.get.mockResolvedValueOnce(record());expect((await caller().get({requestId:id})).snapshot.requestId).toBe(id);
   state.cancel.mockResolvedValueOnce({...record(),status:"cancelled"});expect((await caller().cancel({requestId:id})).snapshot.overallStatus).toBe("cancelled");
 });

it("refuses new local admissions when the worker pipeline needs reconfiguration", async () => {
  const workerMode = ENV.generationWorkerMode;
  ENV.generationWorkerMode = "local-demand";
  vi.stubGlobal("__acervo82ManualAdmissionReason", async () => "pipeline_reconfiguration_required");
  try {
    expect(await caller().capabilities()).toMatchObject({
      enabled: false, reason: "pipeline_reconfiguration_required",
    });
    await expect(caller().start(input)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      failure: { reason: "generation_paused", userMessage: expect.stringContaining("reiniciado") },
    });
    expect(state.admission).not.toHaveBeenCalled();
  } finally {
    ENV.generationWorkerMode = workerMode;
    vi.unstubAllGlobals();
  }
});
