import { describe, expect, it, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { executeProposalWorkflow, type ProposalExecutionInput, type ProposalGraphDeps } from "./proposalGraph";
import { editorialContextV9 } from "./editorialContextV9";
import { resolveReviewExecutionConfigV10 } from "./reviewExecutionConfigV10";
import { healthyReviewV10Fixture } from "./proposalReviewV10.fixture";
import { reviewPayloadV7 } from "./proposalReviewV7.fixture";
import { renderReviewFixtureScenes } from "./proposalReview.fixture";
import { resolveGenerationModelConfig } from "../generationModel";
import { editorialCatalogHash } from "@shared/editorialIntent";

const actor = "00000000-0000-4000-8000-000000000001";
const runId = "00000000-0000-4000-8000-000000000002";
const definition = completeDesignTestDefinitions()[0];
const response = (content: unknown): any => ({ choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }] });
const copy = (title: string, dirty = false) => ({
  caption: dirty ? "MUDOU LEGENDA" : "Legenda preservada", hashtags: dirty ? ["#alterou"] : ["#original"],
  slides: [{ values: [
    { fieldId: "field-0", value: title },
    { fieldId: "field-1", value: dirty ? "MUDOU CAMPO SAUDÁVEL" : "Apoio saudável" },
  ], mediaPrompts: [] }],
});

function scenario(options: { physical?: boolean; priorKeys?: string[]; failCorrection?: boolean } = {}) {
  const generationConfig = resolveGenerationModelConfig({ generationModel: "gpt", postMode: "static" });
  const input: ProposalExecutionInput = {
    requestId: runId, runId, proposalId: "recovery-v10", slot: 0, selectedDefinition: definition,
    prompt: "Apresente o serviço", contextContent: "O serviço oferece um teste de sete dias.",
    platform: "instagram", postMode: "static", reviewPolicyVersion: 10,
    reviewExecutionConfig: resolveReviewExecutionConfigV10(generationConfig.model), generationConfig,
  };
  input.editorialContext = editorialContextV9(input);
  input.editorialContextHash = input.editorialContext.hash;
  const completed = new Map<string, unknown>();
  const generateText = vi.fn(async (params: Parameters<ProposalGraphDeps["generateText"]>[0]) => {
    if (params.taskRoute === "post_evaluation") {
      const review = healthyReviewV10Fixture(params), payload = reviewPayloadV7(params);
      const target = payload.textUnits.find((u: any) => u.fieldId === "field-0");
      if (target.text.includes("para sempre")) {
        const check = review.unitChecks.find(c => c.unitId === target.id)!;
        Object.assign(check, { verdict: "unsupported", editorialBasis: null, meaning: target.text, explanation: "Gratuidade permanente não é sustentada pelo material fornecido." });
      }
      return response(review);
    }
    if (params.traceLabel?.endsWith("_copy_recovery")) return response(copy("Gratuito para sempre", true));
    if (params.traceLabel?.endsWith("_editorial_recovery")) {
      if (options.failCorrection) throw new Error("simulated_provider_timeout");
      return response(copy("Conheça o serviço", true));
    }
    return response(copy(options.physical ? "LONG gratuito para sempre" : "Gratuito para sempre"));
  });
  const deps: ProposalGraphDeps = {
    actor, generateText, renderReviewScenes: vi.fn(renderReviewFixtureScenes),
    measureText: p => ({ height: p.text.includes("LONG") ? 5000 : 20, lines: [{ width: 100 }], runs: [{ fill: p.fill, fontSize: p.fontSize, fontStyle: p.fontStyle }] }),
    recoveryOperationKeys: async () => [
      ...(options.priorKeys ?? []),
      ...Array.from(completed.keys()).filter(key => key === "copy_recovery" || key.startsWith("review_correction:")),
    ],
    reviewOperations: async () => Array.from(completed).map(([operationKey, result]) => ({ operationKey, state: "completed", result })),
    executeOperation: async ({ operationKey }, work) => {
      if (completed.has(operationKey)) return completed.get(operationKey) as any;
      const result = await work();
      completed.set(operationKey, result);
      return result;
    },
  };
  return { input, deps, completed, generateText, run: () => executeProposalWorkflow(input, deps) };
}

describe("V10 bounded physical and editorial recovery", () => {
  it("preserves the frozen partial interpretation through both repair prompts", async () => {
    const s = scenario({ physical: true });
    const document = { version: 1 as const, intents: [{ id: "apresentar_servico", label: "Apresentação", description: "Apresentar o serviço com contexto suficiente." }], designs: [] };
    s.input.editorialCatalog = { version: 1, catalogRevision: "4", revision: actor, hash: editorialCatalogHash(document), document };
    s.input.generationIntent = {
      version: 1, objective: s.input.prompt, adaptation: "controlled",
      tone: { description: "Claro", origin: "inferred", rationale: "Apresentação concisa" }, requirements: [],
      content: [{ id: "service", meaning: "Apresentar o serviço", requirementIds: [], sourceIds: [] }],
      editorial: { version: 1, signals: [{ intentId: "apresentar_servico", state: "requested", origin: "explicit", clarity: "clear", requestQuote: "Apresente o serviço", rationale: "Pedido direto" }] },
    };
    expect((await s.run()).status).toBe("ready");
    const repairs = s.generateText.mock.calls.map(([p]) => p).filter(p => /_(copy|editorial)_recovery$/.test(p.traceLabel ?? ""));
    expect(repairs).toHaveLength(2);
    for (const repair of repairs) {
      expect(JSON.stringify(repair.messages)).toContain("apresentar_servico");
      expect(JSON.stringify(repair.messages)).toContain(document.intents[0].description);
      expect(JSON.stringify(repair.messages)).toContain("ausência é neutra");
    }
  });
  it("repairs overflow then a material claim, preserving healthy fields and replaying without another purchase", async () => {
    const s = scenario({ physical: true });
    const first = await s.run();
    expect(first.status, first.errorReason).toBe("ready");
    expect(first.reviews?.map(r => r.status)).toEqual(["correction_required", "passed"]);
    expect(first.bundle?.caption).toBe("Legenda preservada");
    expect(first.bundle?.hashtags).toEqual(["#original"]);
    expect(first.bundle?.slides[0].composition.content.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "field-0", text: "Conheça o serviço" }),
      expect.objectContaining({ id: "field-1", text: "Apoio saudável" }),
    ]));
    expect(first.bundle?.slides[0].composition.pieces).toEqual(definition.pieces);
    const calls = s.generateText.mock.calls.map(([p]) => p);
    expect(calls).toHaveLength(5);
    const repairs = calls.filter(p => /_(copy|editorial)_recovery$/.test(p.traceLabel ?? ""));
    expect(repairs).toHaveLength(2);
    for (const call of repairs)
      expect(call).toMatchObject({ pinnedModel: "openai/gpt-6.1-sol", reasoningEffort: "medium", forceTextSchema: false, disableFallback: true });
    const replay = await s.run();
    expect(replay.status, replay.errorReason).toBe("ready");
    expect(s.generateText).toHaveBeenCalledTimes(5);
    expect(Array.from(s.completed.keys()).filter(k => k === "copy_recovery" || k.startsWith("review_correction:"))).toHaveLength(2);
  });

  it("a physical repair on a previous template leaves the editorial budget available", async () => {
    const s = scenario({ priorKeys: ["previous_attempt:copy_recovery"] });
    const result = await s.run();
    expect(result.status, result.errorReason).toBe("ready");
    expect(s.generateText.mock.calls.some(([p]) => p.traceLabel?.endsWith("_editorial_recovery"))).toBe(true);
    expect(s.generateText.mock.calls.some(([p]) => p.traceLabel?.endsWith("_copy_recovery"))).toBe(false);
  });

  it("consumed or uncertain recovery keys prevent repeat purchases across fallback attempts", async () => {
    const physical = scenario({ physical: true, priorKeys: ["previous_attempt:copy_recovery"] });
    expect((await physical.run()).status).toBe("failed");
    expect(physical.generateText).toHaveBeenCalledTimes(1);
    const editorial = scenario({ priorKeys: ["previous_attempt:review_correction:older-artifact-hash"] });
    expect((await editorial.run()).status).toBe("failed");
    expect(editorial.generateText).toHaveBeenCalledTimes(2);
    expect(editorial.generateText.mock.calls.some(([p]) => /_(copy|editorial)_recovery$/.test(p.traceLabel ?? ""))).toBe(false);
  });

  it("records the active V10 policy on failures", async () => {
    const s = scenario({ failCorrection: true });
    const failed = await s.run();
    expect(failed.status).toBe("failed");
    const diagnostic = failed.diagnostics.find(d => d.target === "proposal" && d.code === failed.failure?.code);
    expect(JSON.parse(diagnostic!.evidence)).toMatchObject({ policyVersion: 10 });
  });

  it("does not repurchase an uncertain physical effect when replay reaches its journal key", async () => {
    const s = scenario({ physical: true, priorKeys: ["copy_recovery"] });
    const execute = s.deps.executeOperation!;
    s.deps.executeOperation = async (operation, work) => {
      if (operation.operationKey === "copy_recovery") throw new Error("uncertain_external_effect");
      return execute(operation, work);
    };
    expect((await s.run()).status).toBe("failed");
    expect(s.generateText).toHaveBeenCalledTimes(1);
  });
});
