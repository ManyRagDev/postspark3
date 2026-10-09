import { describe, it, expect, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import {
  instantiateCompleteDesign,
  type CompleteDesignVariationV1,
} from "@shared/completeDesignGeneration";
import { resolveArsenalGeometry } from "@shared/arsenalGeometry";
import { arsenalHash } from "@shared/arsenalContent";
import { compileCompleteDesign } from "./completeDesignCompiler";
import {
  materializeCatalogVariations,
  ensureDistinctFamilies,
} from "../../StudioApp/lib/studioGeneration";
import { normalizeCanvasModel, canvasModelToSavePayload } from "./saveAdapter";
import { ensureArsenalFont } from "./arsenalAssets";
vi.mock("./arsenalAssets", () => ({
  ensureArsenalFont: vi.fn(async () => {}),
}));
vi.mock("./arsenalGenerationCompiler", () => ({
  compileComponentAssembly: vi.fn(() => {
    throw new Error("Legacy assembly called");
  }),
  compileArsenalGeneration: vi.fn(() => {
    throw new Error("Generic compiler called");
  }),
}));
function fixture(): CompleteDesignVariationV1 {
  const d = completeDesignTestDefinitions()[0],
    runId = crypto.randomUUID();
  const composition = resolveArsenalGeometry(
    instantiateCompleteDesign({
      definition: d,
      values: [
        { fieldId: "field-0", value: "Café artesanal" },
        { fieldId: "field-1", value: "Visite o Café da Tarde." },
      ],
      mediaPrompts: [],
      runId,
      slot: 0,
      slide: 0,
      planHash: arsenalHash("selection"),
      experimental: true,
    }),
    {
      measureText: i => ({
        height: i.fontSize * 1.2,
        lines: [{ width: i.text.length * i.fontSize * 0.3 }],
        runs: [{ fill: i.fill, fontSize: i.fontSize, fontStyle: i.fontStyle }],
      }),
    }
  );
  return {
    schemaVersion: 1,
    pipeline: "complete-design-v1",
    runId,
    traceId: runId,
    slot: 0,
    name: d.label,
    reason: "Texto curto adequado ao modelo.",
    family: d.completeDesign!.family,
    visualPreference: {
      enabled: true,
      language: "graphic",
      intensity: "balanced",
    },
    caption: "Legenda",
    hashtags: ["café"],
    slides: [{ id: "slide-1", role: "static", composition }],
  };
}
describe("complete design delivery in Studio", () => {
  it("uses the resolved server scene without adaptation or generic compiler and saves/reopens the same document", async () => {
    const input = fixture(),
      report = vi.fn();
    const [post] = await materializeCatalogVariations(
      [
        {
          completeDesignV1: input,
          componentAssemblyV1: {} as any,
          headline: "ignored projection",
        },
      ],
      "pedido",
      undefined,
      0,
      report
    );
    expect(post.slides[0].composition).toEqual(input.slides[0].composition);
    expect(post.familyName).toBe(input.name);
    expect(post.completeDesign?.reason).toBe(input.reason);
    expect(report).toHaveBeenCalledTimes(1);
    const reopened = normalizeCanvasModel(
      JSON.parse(
        JSON.stringify(
          canvasModelToSavePayload(post, {
            inputType: "text",
            inputContent: "pedido",
          }).canvasModel
        )
      )
    );
    expect(reopened.slides[0].composition).toEqual(input.slides[0].composition);
    expect(reopened.completeDesign).toEqual(post.completeDesign);
    expect(reopened.componentCompilationReports?.[0].report.status).toBe(
      "applied"
    );
  });
  it("never relabels a pinned catalogue design as a preset family", () => {
    const variation = { completeDesignV1: fixture(), familyId: "unknown" };
    expect(ensureDistinctFamilies([variation], "seed")[0]).toBe(variation);
  });
  it("fails clearly on unavailable fonts or expired loading budget without manufacturing another composition", async () => {
    const input = fixture(),
      before = arsenalHash(input);
    vi.mocked(ensureArsenalFont).mockRejectedValueOnce(
      new Error("font unavailable")
    );
    await expect(
      compileCompleteDesign(input, { assetDeadline: performance.now() + 1000 })
    ).rejects.toMatchObject({
      data: {
        generationFailure: { generationRunId: input.runId, reason: "unknown" },
      },
    });
    await expect(
      compileCompleteDesign(input, { assetDeadline: performance.now() - 1 })
    ).rejects.toThrow("fontes da composição escolhida");
    expect(arsenalHash(input)).toBe(before);
  });
  it("preserves stable deterministic id across recompilations of the same bundle", async () => {
    const input = fixture();
    const post1 = await compileCompleteDesign(input, { assetDeadline: performance.now() + 5000 });
    const post2 = await compileCompleteDesign(input, { assetDeadline: performance.now() + 5000 });
    expect(post1.id).toBe(`cd-${input.runId}-${input.slot}`);
    expect(post1.id).toBe(post2.id);
  });
});
