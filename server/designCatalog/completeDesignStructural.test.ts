import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostVariation } from "@shared/postspark";
import { compactComponentCard } from "../../shared/componentAssembly";
import { completeDesignTestDefinitions } from "../../shared/completeDesignGeneration.fixture";
import { generateCompleteDesignVariations } from "../ai/completeDesignGeneration";
import { prepareGenerationPlan } from "../ai/generationPipeline";

const state = vi.hoisted(() => ({ rpcCalls: 0 }));
vi.mock("./trace", () => ({ traceCatalog: vi.fn(async () => true) }));
vi.mock("../db", () => ({
  getDb: () => ({
    rpc: () => {
      state.rpcCalls++;
      return { abortSignal: async () => ({ error: null }) };
    },
  }),
}));

import { persistArsenalOutput } from "./arsenalRun";

const runId = "06746fc1-9cfe-4fae-9a71-f37013ad180a";

async function completeOutput(): Promise<PostVariation[]> {
  const definitions = completeDesignTestDefinitions();
  const selection = {
    options: definitions.map(d => ({
      designIds: [d.id],
      reason: "Composição nativa adequada ao pedido.",
    })),
  };
  const copy = {
    options: definitions.map((_, slot) => ({
      caption: `Café artesanal ${slot}`,
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
      trace: { id: runId, recordEvent: () => {} },
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

beforeEach(() => {
  state.rpcCalls = 0;
});

describe("complete design provenance boundary", () => {
  it.each(["runId", "traceId", "slot"] as const)(
    "rejects a %s mismatch before requesting asset grants",
    async field => {
      const output = await completeOutput();
      if (field === "slot") output[0].completeDesignV1!.slot = 2;
      else
        output[0].completeDesignV1![field] =
          "8c488efd-f44e-44f0-8fcb-6b96fcabcc8b";

      await expect(
        persistArsenalOutput(runId, "owner", output)
      ).rejects.toThrow("Identidade do design completo divergente");
      expect(state.rpcCalls).toBe(0);
    }
  );
});
