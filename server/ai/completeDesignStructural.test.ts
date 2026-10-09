import { describe, expect, it } from "vitest";
import { compactComponentCard } from "../../shared/componentAssembly";
import { completeDesignTestDefinitions } from "../../shared/completeDesignGeneration.fixture";
import { arsenalHash } from "../../shared/arsenalContent";
import { generateCompleteDesignVariations } from "./completeDesignGeneration";
import { prepareGenerationPlan } from "./generationPipeline";

const runId = "c41bd2fd-0b85-43dc-8a2b-b3c62539a64f";

async function setup(overrides: { deadlineMs?: number | null } = {}) {
  const definitions = completeDesignTestDefinitions();
  const selection = {
    options: definitions.map(d => ({
      designIds: [d.id],
      reason: `Adequado ao pedido: ${d.label}`,
    })),
  };
  const copy = {
    options: definitions.map((_, slot) => ({
      caption: `Café artesanal ${slot}`,
      hashtags: ["café"],
      slides: [
        {
          values: [
            { fieldId: "field-0", value: `Café artesanal ${slot}` },
            { fieldId: "field-1", value: "Visite o Café da Tarde." },
          ],
          mediaPrompts: [],
        },
      ],
    })),
  };
  const events: any[] = [],
    requests: any[] = [];
  let now = 1000;
  const input = {
    offered: definitions.map(compactComponentCard),
    resolve: async (ids: string[]) =>
      definitions.filter(d => ids.includes(d.id)),
    aspectRatio: "4:5" as const,
    experimental: false,
    userUuid: "owner",
    request: {
      inputType: "text" as const,
      content: "Café artesanal",
      platform: "instagram" as const,
      postMode: "static" as const,
      creationMode: "ideation" as const,
    },
    siteIntelligence: null,
    executionBrief: null,
    deadlineMs:
      overrides.deadlineMs === undefined ? null : overrides.deadlineMs,
    plan: await prepareGenerationPlan({ sourceContent: "Café artesanal" }),
  };
  const deps = {
    clock: () => now,
    trace: { id: runId, recordEvent: (event: unknown) => events.push(event) },
    measureText: (i: any) => ({
      height: i.fontSize * 1.2,
      lines: [{ width: i.text.length * i.fontSize * 0.3 }],
      runs: [{ fill: i.fill, fontSize: i.fontSize, fontStyle: i.fontStyle }],
    }),
    generate: async (params: any) => {
      requests.push(params);
      if (
        params.traceLabel === "complete_design_select" &&
        overrides.deadlineMs
      ) {
        now = overrides.deadlineMs + 1;
      }
      return {
        choices: [
          {
            message: {
              content: JSON.stringify(
                params.traceLabel?.includes("select") ? selection : copy
              ),
            },
          },
        ],
      } as any;
    },
    loadRecentPosts: async () => [],
    assessOriginality: async () => ({
      assessments: [],
      embeddings: [],
      fallbackUsed: false,
    }),
  };
  return { definitions, selection, copy, events, requests, input, deps };
}

describe("complete design structural boundaries", () => {
  it("shares one deadline across selection and delivery, stopping before the copy call when selection expires", async () => {
    const h = await setup({ deadlineMs: 1500 });
    const result = await generateCompleteDesignVariations(h.input, h.deps);

    expect(result).toMatchObject({
      status: "failed",
      error: { kind: "deadline" },
    });
    expect(h.requests.map(r => r.traceLabel)).toEqual([
      "complete_design_select",
    ]);
    expect(h.events.some(e => e.stage === "complete_design.materialize")).toBe(
      false
    );
  });

  it("rejects copy that cannot fit and leaves the authored definition untouched", async () => {
    const h = await setup();
    const originalHash = arsenalHash(h.definitions);
    h.copy.options.forEach(option => {
      option.slides[0].values[0].value = "Oferta imperdível. ".repeat(100);
      option.slides[0].values[1].value = "Visite hoje. ".repeat(100);
    });
    h.deps.measureText = (i: any) => {
      const charsPerLine = Math.max(
        1,
        Math.floor(i.width / (i.fontSize * 0.55))
      );
      const lineCount = Math.ceil(i.text.length / charsPerLine);
      return {
        height: lineCount * i.fontSize * (i.lineHeight ?? 1.2),
        lines: Array.from({ length: lineCount }, () => ({ width: i.width })),
        runs: [{ fill: i.fill, fontSize: i.fontSize, fontStyle: i.fontStyle }],
      };
    };
    const result = await generateCompleteDesignVariations(h.input, h.deps);

    expect(result.status).toBe("rejected");
    if (result.status === "rejected")
      expect(
        result.issues.some(issue => issue.detail.includes("overflow:"))
      ).toBe(true);
    expect(h.requests.map(r => r.traceLabel)).toEqual([
      "complete_design_select",
      "complete_design_copy",
      "complete_design_copy_repair",
    ]);
    expect(h.events.some(e => e.stage === "complete_design.materialize")).toBe(
      false
    );
    expect(arsenalHash(h.definitions)).toBe(originalHash);
  });
});
