import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostVariation } from "@shared/postspark";
const state = vi.hoisted(() => ({
  rpcError: null as Error | null,
  saveError: null as Error | null,
  persisted: null as unknown,
  filters: [] as unknown[],
  rpcCalls: 0,
  rpcArgs: null as unknown,
}));
const trace = vi.hoisted(() => vi.fn(async () => true));
vi.mock("./trace", () => ({ traceCatalog: trace }));
vi.mock("../db", () => ({
  getDb: () => ({
    rpc: (name: string, args: unknown) => {
      state.rpcArgs = { name, args };
      state.rpcCalls++;
      return { abortSignal: async () => ({ error: state.rpcError }) };
    },
    from: () => {
      const chain = {
        update: (value: unknown) => {
          state.persisted = value;
          return chain;
        },
        eq: (...value: unknown[]) => {
          state.filters.push(value);
          return chain;
        },
        select: () => chain,
        single: () => chain,
        abortSignal: async () => ({
          error: state.saveError,
          data: state.saveError ? null : { id: "run" },
        }),
      };
      return chain;
    },
  }),
}));
import { persistArsenalOutput } from "./arsenalRun";
import {
  assembleOffer,
  retrieveAssemblyPlans,
} from "../../shared/assemblyPilot";
import { arsenalHash, type DesignContent } from "../../shared/arsenalContent";
import { deriveVariableContentContract } from "../../shared/variableContent";
const experimentalOutput = () => {
  const content: DesignContent = {
    schemaVersion: 3,
    blocks: [{ id: "h", type: "text", role: "headline", text: "Teste" }],
    caption: "",
    hashtags: [],
  };
  const offer = assembleOffer(retrieveAssemblyPlans("Teste").plans[0], content);
  return [
    {
      catalogSelectionV2: {
        schemaVersion: 2,
        runId: "00000000-0000-4000-8000-000000000001",
        traceId: "00000000-0000-4000-8000-000000000001",
        slot: 0,
        content,
        contentContract: deriveVariableContentContract("Teste"),
        userContentHash: arsenalHash(content),
        targetAspectRatio: "4:5",
        selection: "llm",
        candidates: [offer.candidate],
        pieces: offer.pieces,
        assets: offer.assets,
      },
    },
  ] as unknown as PostVariation[];
};
const output = () =>
  [
    {
      catalogSelectionV2: {
        content: {
          headline: "Conteúdo inteiro",
          body: "Sem cortes. ".repeat(50),
        },
        userContentHash: "frozen",
        selection: "llm",
        candidates: [
          {
            candidateId: "chosen",
            versionId: "pinned",
            variantHash: "hash",
            variant: {},
          },
        ],
        pieces: { piece: { kind: "text" } },
        assets: [{ id: "private-font" }],
      },
    },
  ] as unknown as PostVariation[];
beforeEach(() => {
  state.rpcError = null;
  state.saveError = null;
  state.persisted = null;
  state.filters = [];
  state.rpcCalls = 0;
  state.rpcArgs = null;
  trace.mockClear();
});
describe("functional delivery before generation success", () => {
  it("persists an assembly with owner/status filters and no published-version grants", async () => {
    const value = experimentalOutput();
    await persistArsenalOutput("run", "owner", value);
    expect(state.rpcCalls).toBe(0);
    expect(state.persisted).toEqual({ output_snapshot: value });
    expect(state.filters).toEqual([
      ["id", "run"],
      ["user_uuid", "owner"],
      ["status", "completed"],
    ]);
    expect(trace).toHaveBeenCalledWith(
      "run",
      "owner",
      "assembly.delivery",
      "completed",
      expect.objectContaining({
        experimental: true,
        functionalOutputPersisted: true,
      }),
      "assembly-delivery:v1"
    );
  });
  it("rejects unsuccessful assembly persistence and emits no successful delivery", async () => {
    state.saveError = new Error("failed");
    await expect(
      persistArsenalOutput("run", "owner", experimentalOutput())
    ).rejects.toThrow("Não foi possível salvar");
    expect(trace).not.toHaveBeenCalled();
  });
  it("rejects unknown assets instead of bypassing catalogue authorization", async () => {
    const value = experimentalOutput();
    value[0].catalogSelectionV2!.assets[0].kind = "catalog";
    await expect(persistArsenalOutput("run", "owner", value)).rejects.toThrow(
      "Asset do piloto não autorizado"
    );
    expect(state.persisted).toBeNull();
  });
  it("delivers pinned identity and reports durable grants", async () => {
    const value = output();
    await persistArsenalOutput("run", "owner", value);
    expect(value[0].catalogSelectionV2!.candidates).toHaveLength(1);
    expect(trace).toHaveBeenCalledWith(
      "run",
      "owner",
      "catalog.assets",
      "completed",
      expect.objectContaining({
        assetIds: ["private-font"],
        grantsDelivered: true,
      }),
      "delivery:v2"
    );
  });
  it("falls back on exhausted budget without losing canonical copy, ownership or trace reason", async () => {
    const value = output(),
      copy = structuredClone(value[0].catalogSelectionV2!.content);
    await persistArsenalOutput("run", "owner", value, { remainingMs: 0 });
    expect(state.rpcCalls).toBe(0);
    expect(value[0].catalogSelectionV2).toMatchObject({
      selection: "none",
      content: copy,
      userContentHash: "frozen",
      candidates: [],
      assets: [],
      pieces: {},
    });
    expect(state.filters).toEqual([
      ["id", "run"],
      ["user_uuid", "owner"],
      ["status", "completed"],
    ]);
    expect(trace).toHaveBeenCalledWith(
      "run",
      "owner",
      "catalog.assets",
      "fallback",
      expect.objectContaining({
        reason: "catalog_unavailable",
        functionalOutputPersisted: true,
        grantsDelivered: false,
      }),
      "delivery:v2"
    );
  });
  it("throws when functional fallback cannot be persisted, enabling the existing refund path", async () => {
    state.rpcError = new Error("catalog unavailable");
    state.saveError = new Error("storage failure");
    await expect(
      persistArsenalOutput("run", "owner", output())
    ).rejects.toThrow("Não foi possível salvar");
    expect(trace).not.toHaveBeenCalled();
  });
});

import {
  componentAssemblyFixture,
  componentAssemblyPlanFixture,
} from "../../shared/componentAssembly.fixture";
import { materializeAssemblyPlan } from "../../shared/componentAssembly";
import { compactComponentCard } from "../../shared/componentAssembly";
import { completeDesignTestDefinitions } from "../../shared/completeDesignGeneration.fixture";
import { generateCompleteDesignVariations } from "../ai/completeDesignGeneration";
import { prepareGenerationPlan } from "../ai/generationPipeline";
const componentRunId = "a20b3bc0-2c41-4080-8b29-fb257b61b7a0";
function componentsOutput(slides = 5): PostVariation[] {
  const generation = materializeAssemblyPlan(
    componentAssemblyPlanFixture(slides),
    componentAssemblyFixture(),
    { traceId: componentRunId, runId: componentRunId, experimental: true }
  );
  return generation.variations.map(componentAssemblyV1 => ({
    componentAssemblyV1,
  })) as PostVariation[];
}
describe("component delivery is atomic before billing commit", () => {
  it("pins all three sequences, grants their assets, and scopes delivery to the owner", async () => {
    const output = componentsOutput(10);
    await persistArsenalOutput(componentRunId, "owner", output);
    expect(state.rpcArgs).toEqual({
      name: "design_component_deliver_v1",
      args: {
        p_run: componentRunId,
        p_actor: "owner",
        p_output: output,
        p_experimental: true,
      },
    });
    expect(trace).toHaveBeenCalledWith(
      componentRunId,
      "owner",
      "component.delivery",
      "completed",
      expect.objectContaining({
        slideCount: 30,
        functionalOutputPersisted: true,
        grantsDelivered: true,
      }),
      "component-delivery:v1"
    );
  });
  it("does not downgrade a component delivery failure to an unpinned local fallback", async () => {
    state.rpcError = new Error("grant unavailable");
    const output = componentsOutput(2),
      before = structuredClone(output);
    await expect(
      persistArsenalOutput(componentRunId, "owner", output)
    ).rejects.toThrow("Não foi possível salvar a montagem");
    expect(output).toEqual(before);
    expect(state.persisted).toBeNull();
    expect(trace).toHaveBeenCalledWith(
      componentRunId,
      "owner",
      "component.delivery",
      "failed",
      { source: "server", code: "unavailable", reason: "delivery_unavailable" },
      "component-delivery:v1"
    );
  });
  it("records a whitelisted database rejection without logging copy or arbitrary error text", async () => {
    state.rpcError = {
      code: "P0001",
      message: "Assembly plan mismatch",
    } as any;
    await expect(
      persistArsenalOutput(componentRunId, "owner", componentsOutput(2))
    ).rejects.toThrow("Não foi possível salvar a montagem");
    expect(trace).toHaveBeenCalledWith(
      componentRunId,
      "owner",
      "component.delivery",
      "failed",
      { source: "server", code: "P0001", reason: "assembly_plan_mismatch" },
      "component-delivery:v1"
    );
  });
  it("rejects an output belonging to another run before database access", async () => {
    await expect(
      persistArsenalOutput(
        "00000000-0000-4000-8000-000000000001",
        "owner",
        componentsOutput()
      )
    ).rejects.toThrow("Identidade da montagem divergente");
    expect(state.rpcCalls).toBe(0);
  });
});

async function completeOutput(): Promise<PostVariation[]> {
  const definitions = completeDesignTestDefinitions();
  const selection = {
    options: definitions.map(d => ({
      designIds: [d.id],
      reason: "Composição nativa adequada ao pedido.",
    })),
  };
  const copy = {
    options: definitions.map(() => ({
      caption: "Café artesanal",
      hashtags: [],
      slides: [
        {
          values: [
            { fieldId: "field-0", value: "Café artesanal" },
            { fieldId: "field-1", value: "Visite o café." },
          ],
          mediaPrompts: [],
        },
      ],
    })),
  };
  const result = await generateCompleteDesignVariations(
    {
      offered: definitions.map(compactComponentCard),
      resolve: async ids => definitions.filter(d => ids.includes(d.id)),
      experimental: true,
      aspectRatio: "4:5",
      userUuid: "owner",
      request: {
        inputType: "text",
        content: "Café artesanal",
        platform: "instagram",
        postMode: "static",
        creationMode: "ideation",
      },
      executionBrief: null,
      siteIntelligence: null,
      deadlineMs: null,
      plan: await prepareGenerationPlan({ sourceContent: "Café artesanal" }),
    },
    {
      clock: () => 1000,
      trace: { id: componentRunId, recordEvent: () => {} },
      measureText: i => ({
        height: i.fontSize * 1.2,
        lines: [{ width: i.text.length * i.fontSize * 0.3 }],
        runs: [{ fill: i.fill, fontSize: i.fontSize, fontStyle: i.fontStyle }],
      }),
      generate: async p =>
        ({
          choices: [
            {
              message: {
                content: JSON.stringify(
                  p.traceLabel?.includes("select") ? selection : copy
                ),
              },
            },
          ],
        }) as any,
      loadRecentPosts: async () => [],
      assessOriginality: async () => ({
        assessments: [],
        embeddings: [],
        fallbackUsed: false,
      }),
    }
  );
  if (result.status !== "approved")
    throw new Error("Invalid complete design fixture");
  return result.snapshots;
}

describe("complete design delivery boundary", () => {
  it("authorizes the assets of the same resolved scenes delivered to Studio", async () => {
    const output = await completeOutput();
    await persistArsenalOutput(componentRunId, "owner", output);
    expect(state.rpcArgs).toEqual({
      name: "design_component_deliver_v1",
      args: {
        p_run: componentRunId,
        p_actor: "owner",
        p_output: output,
        p_experimental: true,
      },
    });
    expect(trace).toHaveBeenCalledWith(
      componentRunId,
      "owner",
      "complete_design.delivery",
      "completed",
      expect.objectContaining({ slideCount: 3, grantsDelivered: true }),
      "component-delivery:v1"
    );
  });
  it("rejects a missing or divergent asset manifest before database access", async () => {
    const output = await completeOutput();
    output[0].componentAssemblyV1!.slides[0].bundle.assets[0].license =
      "changed";
    await expect(
      persistArsenalOutput(componentRunId, "owner", output)
    ).rejects.toThrow("Manifesto de assets diverge");
    delete output[0].componentAssemblyV1;
    await expect(
      persistArsenalOutput(componentRunId, "owner", output)
    ).rejects.toThrow("Manifesto de assets do design completo ausente");
    expect(state.rpcCalls).toBe(0);
  });
  it("preserves the full document and fails delivery when asset grants are unavailable", async () => {
    state.rpcError = new Error("grant unavailable");
    const output = await completeOutput(),
      before = structuredClone(output);
    await expect(
      persistArsenalOutput(componentRunId, "owner", output)
    ).rejects.toThrow("Não foi possível salvar");
    expect(output).toEqual(before);
    expect(state.persisted).toBeNull();
    expect(trace).toHaveBeenCalledWith(
      componentRunId,
      "owner",
      "complete_design.delivery",
      "failed",
      expect.objectContaining({ reason: "delivery_unavailable" }),
      "component-delivery:v1"
    );
  });
});
