import { describe, it, expect, vi } from "vitest";
import { completeDesignTestDefinitions } from "../../shared/completeDesignGeneration.fixture";
import { compactComponentCard } from "../../shared/componentAssembly";
import { arsenalHash } from "../../shared/arsenalContent";
import {
  generateCompleteDesignVariations,
  type CompleteDesignInput,
  type CompleteDesignDeps,
} from "./completeDesignGeneration";
import { prepareGenerationPlan } from "./generationPipeline";
import { StructuredOutputError } from "../_core/llm";
const runId = "7406c096-cd30-4d61-b85c-e26cddca7691";
async function fixture(count = 3) {
  const definitions = completeDesignTestDefinitions(),
    events: any[] = [],
    requests: any[] = [];
  const selection = {
    options: definitions.map(d => ({
      designIds: Array(count).fill(d.id),
      reason: `Adequado ao pedido: ${d.label}`,
    })),
  };
  const copy = {
    options: definitions.map((_, slot) => ({
      caption: `Café artesanal ${slot}`,
      hashtags: ["café"],
      slides: Array.from({ length: count }, (_, i) => ({
        values: [
          { fieldId: "field-0", value: `Café ${slot} ${i}` },
          {
            fieldId: "field-1",
            value:
              i === count - 1
                ? "Visite o Café da Tarde."
                : "Uma pausa com aromas.",
          },
        ],
        mediaPrompts: [],
      })),
    })),
  };
  const input: CompleteDesignInput = {
    offered: definitions.map(compactComponentCard),
    resolve: async ids => definitions.filter(d => ids.includes(d.id)),
    aspectRatio: "4:5",
    experimental: true,
    slideCount: count,
    userUuid: "owner",
    request: {
      inputType: "text",
      content:
        "Café artesanal com apoio e encerramento com convite para visitar Café da Tarde.",
      platform: "instagram",
      postMode: count === 1 ? "static" : "carousel",
      creationMode: "ideation",
    },
    siteIntelligence: null,
    executionBrief: null,
    deadlineMs: null,
    plan: await prepareGenerationPlan({ sourceContent: "Café artesanal" }),
  };
  const deps: CompleteDesignDeps = {
    clock: () => 1000,
    trace: { id: runId, recordEvent: e => events.push(e) },
    measureText: i => ({
      height: i.fontSize * 1.2,
      lines: [{ width: i.text.length * i.fontSize * 0.3 }],
      runs: [{ fill: i.fill, fontSize: i.fontSize, fontStyle: i.fontStyle }],
    }),
    generate: async p => {
      requests.push(p);
      return {
        choices: [
          {
            message: {
              content: JSON.stringify(
                p.traceLabel?.includes("select") ? selection : copy
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
  return { input, deps, definitions, selection, copy, events, requests };
}
describe("complete design architecture", () => {
  it("limits selection to the shortlist and accounts for its evaluation cost", async () => {
    const h = await fixture(1),
      offered = h.input.offered;
    const excluded = {
      ...offered[0],
      id: "00000000-0000-4000-8000-000000000999",
    };
    h.input.offered = [...offered, excluded];
    h.deps.shortlist = vi
      .fn()
      .mockResolvedValue({
        cards: offered,
        evaluated: [],
        batches: 2,
        inputTokens: 123,
        outputTokens: 4,
        costUsd: 0.001,
      });
    const result = await generateCompleteDesignVariations(h.input, h.deps);
    expect(result.status).toBe("approved");
    expect(h.deps.shortlist).toHaveBeenCalledWith(
      expect.objectContaining({ cards: h.input.offered, slideCount: 1 })
    );
    expect(JSON.stringify(h.requests[0])).not.toContain(excluded.id);
    expect(JSON.stringify(h.requests[0])).toContain(offered[0].id);
    expect(result.metrics.evaluationCalls).toBe(2);
    expect(result.metrics.promptTokens).toBe(123);
    expect(result.metrics.estimatedCostUsd).toBe(0.001);
  });
  it("does not continue with an incomplete catalog when preselection fails", async () => {
    const h = await fixture(1);
    h.deps.shortlist = vi
      .fn()
      .mockRejectedValue(new Error("incomplete_answers"));
    const result = await generateCompleteDesignVariations(h.input, h.deps);
    expect(result.status).toBe("failed");
    expect(h.requests).toHaveLength(0);
    expect(
      h.events.some(
        e => e.stage === "complete_design.shortlist" && e.status === "rejected"
      )
    ).toBe(true);
  });
  it.each([1, 3, 5])(
    "selects then fills only native fields and delivers %i immutable scenes per option",
    async count => {
      const h = await fixture(count),
        before = arsenalHash(h.definitions),
        result = await generateCompleteDesignVariations(h.input, h.deps);
      expect(
        result.status,
        result.status === "rejected" ? JSON.stringify(result.issues) : undefined
      ).toBe("approved");
      expect(h.requests.map(r => r.traceLabel)).toEqual([
        "complete_design_select",
        "complete_design_copy",
      ]);
      expect(arsenalHash(h.definitions)).toBe(before);
      if (result.status !== "approved") return;
      result.snapshots.forEach((v, slot) => {
        const complete = v.completeDesignV1!;
        expect(complete.slides).toHaveLength(count);
        for (const slide of complete.slides) {
          const scene = slide.composition,
            source = h.definitions[slot];
          expect(scene.base.instances).toEqual(source.fragment.instances);
          expect(scene.base.groups).toEqual(source.fragment.groups);
          expect(scene.pieces).toEqual(source.pieces);
          expect(scene.assets).toEqual(source.assets);
          expect(scene.origin.componentAssembly!.componentIds).toEqual([
            source.id,
          ]);
          expect(scene.origin.definitionHash).toBe(source.hash);
          expect(scene.content.blocks).toHaveLength(2);
          expect(scene.issues).toEqual([]);
        }
        expect(complete.name).toBe(h.definitions[slot].label);
        expect(
          v.componentAssemblyV1!.slides[0].bundle.candidates[0].candidateId
        ).toBe(complete.slides[0].composition.origin.candidateId);
      });
      expect(
        h.events.some(
          e =>
            e.stage === "complete_design.materialize" &&
            e.data.fallbackUsed === false
        )
      ).toBe(true);
    }
  );
  it("repairs selection before writing and never combines two families", async () => {
    const h = await fixture(),
      generate = h.deps.generate;
    h.deps.generate = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                options: h.selection.options.map(o => ({
                  ...o,
                  designIds: [
                    o.designIds[0],
                    h.definitions[1].id,
                    o.designIds[2],
                  ],
                })),
              }),
            },
          },
        ],
      })
      .mockImplementation(generate);
    const result = await generateCompleteDesignVariations(h.input, h.deps);
    expect(result.status).toBe("approved");
    expect(h.deps.generate).toHaveBeenCalledTimes(3);
  });
  it("rejects foreign fields and retains the selected IDs through a bounded copy repair", async () => {
    const h = await fixture();
    h.copy.options.forEach(o =>
      o.slides.forEach(s =>
        s.values.push({ fieldId: "invented", value: "Frankenstein" })
      )
    );
    const result = await generateCompleteDesignVariations(h.input, h.deps);
    expect(result.status).toBe("rejected");
    expect(h.requests.map(r => r.traceLabel)).toEqual([
      "complete_design_select",
      "complete_design_copy",
      "complete_design_copy_repair",
    ]);
    expect(h.events.some(e => e.stage === "complete_design.materialize")).toBe(
      false
    );
  });
  it("fails when the hydrated definition differs from the offered hash", async () => {
    const h = await fixture();
    h.input.resolve = async () =>
      h.definitions.map(d => ({ ...d, hash: "f".repeat(64) }));
    const result = await generateCompleteDesignVariations(h.input, h.deps);
    expect(result).toMatchObject({
      status: "failed",
      error: { kind: "internal" },
    });
    expect(h.requests).toHaveLength(1);
  });
  it("uses extracted source evidence in both selection and copy", async () => {
    const h = await fixture();
    h.input.request.inputType = "url";
    h.input.request.content = "https://example.test/cafe";
    h.input.contextContent =
      "Fonte extraída: Café da Tarde, torra artesanal, aberto aos sábados.";
    expect(
      (await generateCompleteDesignVariations(h.input, h.deps)).status
    ).toBe("approved");
    for (const request of h.requests)
      expect(JSON.stringify(request.messages)).toContain(
        h.input.contextContent
      );
  });
  it("classifies font or catalogue failures separately from the provider", async () => {
    const h = await fixture();
    h.deps.measureText = undefined;
    h.deps.createTextMeasurer = vi.fn(async () => {
      throw new Error("component_font_unavailable");
    });
    expect(
      await generateCompleteDesignVariations(h.input, h.deps)
    ).toMatchObject({ status: "failed", error: { kind: "internal" } });
    expect(h.requests).toHaveLength(1);
  });
  it("does not replace a provider failure or exhausted malformed replies with a design", async () => {
    const h = await fixture();
    h.deps.generate = vi.fn(async () => {
      throw new Error("provider unavailable");
    });
    expect(
      await generateCompleteDesignVariations(h.input, h.deps)
    ).toMatchObject({ status: "failed", error: { kind: "provider" } });
    expect(h.deps.generate).toHaveBeenCalledTimes(1);
    h.deps.generate = vi.fn(async () => {
      throw new StructuredOutputError("schema_mismatch", "bad schema");
    });
    expect(
      (await generateCompleteDesignVariations(h.input, h.deps)).status
    ).toBe("rejected");
    expect(h.deps.generate).toHaveBeenCalledTimes(2);
  });
});
