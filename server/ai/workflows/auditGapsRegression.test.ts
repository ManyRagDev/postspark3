import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { compactComponentCard, componentCardV1Schema, createComponentDefinition, assemblyIdentity } from "@shared/componentAssembly";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { defaultStudioPreferences } from "@shared/studioPreferences";
import { buildFamilySelectionCandidates, familyAssessmentProfile } from "@shared/designFamilySelection";
import { resolveDesignFamilyRepertoires } from "@shared/designRepertoire";
import { familyAxes } from "@shared/familyNeutrality";
import {
  AFFIRMATIVE_COPY_LANGUAGE_ANCHOR_V2,
  affirmativeCopyInstructions,
  affirmativeCopyInstructionsV2,
} from "@shared/affirmativeSocialPlaybook";
import { reconcile82Data } from "../../../scripts/reconcile82Catalog";
import { resolveGenerationModelConfig } from "../generationModel";
import { ENV } from "../../_core/env";
import {
  batches,
  criteriaV2,
  assessmentTaskV2,
  shortlistCompleteDesigns,
  type JevRequest,
} from "../../designCatalog/designShortlist";
import { electionCatalogFixture } from "../../designCatalog/designElection.fixture";
import { reconcileCatalogCoverage } from "../../designCatalog/catalogCoverage";
import { withCatalogRevision } from "../../designCatalog/versionedCatalog";
import { inspectPlannedDesignElection } from "../../plannedDesignElectionEvidence";
import { prepareOrchestratedGeneration, verifyPreparedEligibility } from "./generationPreparation";
import { journalResultWithTrace, readJournalResult } from "./generationJournalTrace";
import { recordLlmTraceCall, runWithGenerationTrace, type GenerationTrace } from "../generationTrace";
import { resolveReviewExecutionConfigV10, reviewContractHashV10 } from "./reviewExecutionConfigV10";
import { editorialContextV9 } from "./editorialContextV9";
import { executeProposalWorkflow } from "./proposalGraph";

const execFileAsync = promisify(execFile);
const owner = "00000000-0000-4000-8000-000000000001";
const definitions = completeDesignTestDefinitions();

function makeCatalog(count: number) {
  return Array.from({ length: count }, (_, i) =>
    createComponentDefinition({
      ...definitions[i % definitions.length],
      id: assemblyIdentity(["audit-gaps", i]),
      source: { ...definitions[i % definitions.length].source, variantKey: `gap-${i}` },
      completeDesign: {
        ...definitions[i % definitions.length].completeDesign!,
        family: `gap-family-${String(i).padStart(2, "0")}`,
      },
    })
  );
}

describe("Auditoria IA — Regressões ponta a ponta (Gaps 2, 3, 4, 5 e 7)", () => {
  it("Gap 7: distribui 10 perguntas em 4 lotes homogeneamente (3,3,2,2) sob limite de bytes", () => {
    const sources = makeCatalog(10);
    const cards = sources.map(compactComponentCard);
    const repertoires = resolveDesignFamilyRepertoires(cards, {
      slideCount: 1,
      contentMode: "compose",
    });
    const candidates = buildFamilySelectionCandidates(
      repertoires,
      null,
      true,
      true,
      undefined,
      { profileVersion: 6, axesVersion: 2, reconcileRoles: true }
    );
    const profiles = Object.fromEntries(candidates.map(c => [c.id, c.profile]));
    const familyCards = candidates.map(c => ({
      ...cards.find(card => card.completeDesign?.family === c.family)!,
      id: c.id,
      hash: c.signature,
    }));

    // Medir payload base + 1 questão para escolher maxRequestBytes que comporte exatamente ~3 questões/lote (10 -> 4 lotes)
    const single = batches(familyCards.slice(0, 1), "Brief de teste", profiles, true, undefined, undefined, 100000, 2);
    const triple = batches(familyCards.slice(0, 3), "Brief de teste", profiles, true, undefined, undefined, 100000, 2);
    const baseBytes = Buffer.byteLength(JSON.stringify({ ...single[0], questions: {} }));
    const threeQuestionsBytes = Buffer.byteLength(JSON.stringify(triple[0]));
    const fourQuestionsLimit = threeQuestionsBytes + 200; // cabe 3 por lote, não cabe 4 -> 10 perguntas geram 4 lotes

    expect(threeQuestionsBytes).toBeGreaterThan(baseBytes);
    const v2Batches = batches(familyCards, "Brief de teste", profiles, true, undefined, undefined, fourQuestionsLimit, 2);
    const sizesV2 = v2Batches.map(b => Object.keys(b.questions).length);
    expect(sizesV2).toEqual([3, 3, 2, 2]);
    expect(v2Batches.every(b => Buffer.byteLength(JSON.stringify(b)) <= fourQuestionsLimit)).toBe(true);

    // Lotes V1 históricos preservam fatiamento guloso sem balanceamento (3,3,3,1)
    const v1Batches = batches(familyCards, "Brief de teste", profiles, true, undefined, undefined, fourQuestionsLimit, 1);
    expect(v1Batches.map(b => Object.keys(b.questions).length)).toEqual([3, 3, 3, 1]);
  });

  it("Gap 3: conecta Perfil v6 ao planejador, à requisição real do JEV e à inspeção de evidência", async () => {
    const baseCatalog = electionCatalogFixture(14);
    const sources = baseCatalog.definitions;
    const input = orchestratedGenerationInputSchema.parse({
      ownerId: owner,
      inputType: "text",
      content: "Explique os 3 benefícios de café moído na hora",
      postMode: "static",
      platform: "instagram",
      generationModel: "auto",
      idempotencyKey: "gap3-v6-evidence",
    });
    const generationConfig = resolveGenerationModelConfig(input);
    const operations = new Map<string, any>();
    const jevRequests: JevRequest[] = [];

    const recordProvider = (params: any, result: any) => {
      recordLlmTraceCall({
        label: params.traceLabel ?? "controlled_jev",
        requestedModel: params.pinnedModel ?? "controlled-offline",
        effectiveModel: result.model ?? "controlled-offline",
        effectiveModelReported: true,
        provider: "controlled-offline",
        providerId: "controlled-provider",
        promptHash: "a".repeat(64),
        messages: params.messages ?? [params],
        response: result,
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        latencyMs: 1,
        estimatedCostUsd: 0,
        costSource: "provider",
      });
      return result;
    };

    const generate = vi.fn(async (params: any) =>
      recordProvider(params, {
        id: "intent-1",
        model: params.pinnedModel,
        choices: [
          {
            message: {
              role: "assistant",
              content: JSON.stringify({
                objective: "Explicar benefícios do café moído na hora",
                tone: "Didático",
                ideas: [{ meaning: "3 benefícios práticos", sourceIds: [] }],
                semanticQuery: "café moído benefícios didático",
              }),
            },
            finish_reason: "stop",
          },
        ],
      })
    );

    const prepared = await withCatalogRevision("1", () =>
      prepareOrchestratedGeneration(input, owner, true, Date.now() + 600_000, {
        generationConfig,
        generate,
        hydrate: async ids => sources.filter(s => ids.includes(s.id)),
        readEditorialCatalog: async () => null,
        automaticSemantic: { engine: { metadata: { modelId: "offline-unavailable" } } as any },
        loadContext: async () => input.content,
        preferences: async () => defaultStudioPreferences,
        recentSelections: async () => [],
        retrieve: async req =>
          reconcileCatalogCoverage(req, baseCatalog.inventory),
        operation: async (key, work) => {
          const fullKey = `prepare:${key}`;
          if (operations.has(fullKey)) {
            return readJournalResult(operations.get(fullKey).result);
          }
          const entry: any = { operation_key: fullKey, state: "started", expectation: null };
          operations.set(fullKey, entry);
          const trace: GenerationTrace = {
            id: fullKey,
            userUuid: owner,
            inputType: "text",
            inputContent: input.content,
            platform: input.platform,
            postMode: input.postMode,
            startedAt: Date.now(),
            calls: [],
            events: [],
          };
          const value = await runWithGenerationTrace(trace, work);
          entry.state = "completed";
          entry.result = journalResultWithTrace(value, trace);
          return value;
        },
        expectPreparation: async (key, expectation) => {
          const op = operations.get(`prepare:${key}`);
          if (op) op.expectation = expectation;
        },
        shortlist: async params =>
          shortlistCompleteDesigns(params, async req => {
            jevRequests.push(req);
            return recordProvider(req, {
              model: req.model,
              answers: Object.fromEntries(
                Object.keys(req.questions).map((id, idx) => [
                  id,
                  { type: "score" as const, score: Math.max(2.2, 3.9 - idx * 0.05), confidence: 0.9 },
                ])
              ),
              usage: { input_tokens: 100, output_tokens: 10, cost: 0 },
            });
          }),
      })
    );

    // Receipt gravou os pinos v2/v6/reconciliação/idioma
    const selInput = readJournalResult(operations.get("prepare:selection_input").result);
    expect(selInput).toMatchObject({
      familyProfileVersion: 6,
      shortlistBatchVersion: 2,
      shortlistRankingVersion: 2,
      familyReconciliationVersion: 1,
      reviewExecutionConfig: { copyInstructionsVersion: 2 },
    });

    // Payload REAL enviado ao JEV contém Perfil v6, 5 campos estruturais e rubrica V2
    expect(jevRequests.length).toBeGreaterThanOrEqual(1);
    const firstReq = jevRequests[0];
    expect(JSON.parse(firstReq.state).assessmentTask).toBe(assessmentTaskV2);
    for (const q of Object.values(firstReq.questions) as any[]) {
      expect(q.criteria).toEqual(criteriaV2);
      expect(q.instructions.design.version).toBe(6);
      expect(Object.keys(q.instructions.design.structure).sort()).toEqual([
        "listBlocks",
        "listItemsPerBlock",
        "mediaSlots",
        "relationships",
        "textBlocks",
      ]);
      expect(q.instructions.design).not.toHaveProperty("availability");
      expect(q.instructions.design).not.toHaveProperty("roles");
    }

    // Evidência real (`inspectPlannedDesignElection`) valida o pedido com Perfil v6 nos receipts do JEV
    const shortlistOps = Array.from(operations.values()).filter(o =>
      String(o.operation_key).startsWith("prepare:design-shortlist:")
    );
    expect(shortlistOps.length).toBeGreaterThanOrEqual(1);
    for (const op of shortlistOps) {
      expect(op.result.assessmentContext.profileVersion).toBe(6);
      expect(op.result.assessmentContext.criteria).toEqual(criteriaV2);
      expect(op.result.assessmentContext.assessmentTask).toBe(assessmentTaskV2);
    }
    const inspection = await withCatalogRevision("1", async () =>
      inspectPlannedDesignElection(
        {
          prepared,
          input,
          generation_config: generationConfig,
          experimental: true,
          catalogRevision: "1",
        },
        Array.from(operations.values())
      )
    );
    expect(inspection.issues).toEqual([]);
    await expect(verifyPreparedEligibility(prepared, true, async ids => sources.filter(s => ids.includes(s.id)))).resolves.toBeUndefined();
  });

  it("Gap 4: seleção consome as 157 correções reconciliadas das 82 famílias e script roda direto em caminho com espaços", async () => {
    const rawCards = JSON.parse(
      readFileSync(path.resolve("artifacts/design-audit-20261111/cards-82-completos.json"), "utf8")
    ) as any[];
    const reconciled = reconcile82Data();
    expect(reconciled.changes).toHaveLength(157);
    expect(reconciled.reconciled).toHaveLength(82);

    const componentCards = rawCards.map(raw => componentCardV1Schema.parse(raw));
    const repertoires = resolveDesignFamilyRepertoires(componentCards, {
      slideCount: 1,
      contentMode: "compose",
    });

    const selectedV2 = buildFamilySelectionCandidates(
      repertoires,
      null,
      true,
      true,
      undefined,
      { profileVersion: 6, axesVersion: 2, reconcileRoles: true }
    );
    const byFamily = new Map(selectedV2.map(c => [c.family, c.profile]));

    for (const expected of reconciled.reconciled) {
      const actual = byFamily.get(expected.family);
      expect(actual, `Família ausente na seleção real: ${expected.family}`).toBeDefined();
      expect(actual!.aesthetic.identity.essential).toEqual(expected.aesthetic.identity.essential);
      expect(actual!.availability.roles).toEqual(expected.availability.roles);
      expect(familyAssessmentProfile({ ...actual!, version: 6 }).characteristics).toEqual(
        expected.aesthetic.identity.essential
      );
    }

    // Contrato histórico (axesVersion=1): preserva comportamento anterior sem aplicar overrides v2
    const legacySelected = buildFamilySelectionCandidates(repertoires, null, true, true);
    expect(familyAxes(componentCards[0], 1)).toBeDefined();
    expect(legacySelected[0].profile.version).toBe(5);

    // Execução direta de reconcile82Catalog.ts no diretório atual (que possui espaços no caminho)
    const tsxBin = path.resolve("node_modules/.bin/tsx");
    const { stdout } = await execFileAsync(tsxBin, [path.resolve("scripts/reconcile82Catalog.ts")]);
    expect(stdout).toContain("Reconciliação v2 concluída para 82 perfis");
    expect(stdout).toContain("Total de correções aplicadas: 157");
  }, 20000);

  it("Gap 2: retomada histórica preserva operationKeys e ranking v1 sem nova inferência, mesmo com ENV.rankingV2=true", async () => {
    const sources = makeCatalog(14);
    const cards = sources.map(compactComponentCard);
    const input = orchestratedGenerationInputSchema.parse({
      ownerId: owner,
      inputType: "text",
      content: "Cafeteria artesanal minimalista",
      postMode: "static",
      platform: "instagram",
      generationModel: "auto",
      idempotencyKey: "gap2-historical-replay",
    });
    const generationConfig = resolveGenerationModelConfig(input);
    const journal = new Map<string, any>();

    // Passo 1: simular pedido histórico que NÃO possuía os pinos v2 (criado antes do patch)
    const generate = vi.fn(async (params: any) => ({
      id: "intent-hist",
      model: params.pinnedModel,
      choices: [
        {
          message: {
            role: "assistant",
            content: JSON.stringify({
              objective: "Apresentar cafeteria minimalista",
              tone: "Sobriedade",
              ideas: [{ meaning: "Destacar grãos", sourceIds: [] }],
              semanticQuery: "cafeteria minimalista",
            }),
          },
          finish_reason: "stop",
        },
      ],
    }));

    const evaluate = vi.fn(async (req: JevRequest) => ({
      model: req.model,
      answers: Object.fromEntries(
        Object.keys(req.questions).map((id, idx) => [
          id,
          { type: "score" as const, score: idx === 1 ? 3.51 : idx === 2 ? 3.5 : 2.5, confidence: 0.9 },
        ])
      ),
      usage: { input_tokens: 100, output_tokens: 10, cost: 0 },
    }));

    const runWithHistoricalJournal = () =>
      prepareOrchestratedGeneration(input, owner, true, Date.now() + 600_000, {
        generationConfig,
        generate,
        hydrate: async ids => sources.filter(s => ids.includes(s.id)),
        readEditorialCatalog: async () => null,
        automaticSemantic: { engine: { metadata: { modelId: "offline-unavailable" } } as any },
        loadContext: async () => input.content,
        preferences: async () => defaultStudioPreferences,
        recentSelections: async () => [],
        retrieve: async () => cards,
        operation: async (key, work) => {
          if (!journal.has(key)) {
            const val = await work();
            // Emula receipt histórico gravado ANTES da introdução dos pinos v2
            if (key === "selection_input" && val && typeof val === "object") {
              const v = val as Record<string, unknown>;
              delete v.shortlistBatchVersion;
              delete v.shortlistRankingVersion;
              delete v.familyProfileVersion;
              delete v.familyReconciliationVersion;
            }
            journal.set(key, JSON.parse(JSON.stringify(val)));
          }
          return structuredClone(journal.get(key));
        },
        shortlist: params => shortlistCompleteDesigns(params, evaluate),
      });

    const first = await runWithHistoricalJournal();
    const shortlistKeysBefore = Array.from(journal.keys()).filter(k => k.startsWith("design-shortlist:"));
    expect(shortlistKeysBefore.length).toBeGreaterThan(0);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(evaluate).toHaveBeenCalledTimes(shortlistKeysBefore.length);

    // Passo 2: retomar com ENV.rankingV2 ligado — NÃO pode gerar novos keys nem chamar generate/evaluate!
    const prevRankingV2 = ENV.rankingV2;
    (ENV as any).rankingV2 = true;
    try {
      generate.mockClear();
      evaluate.mockClear();
      const replayed = await runWithHistoricalJournal();
      expect(generate).not.toHaveBeenCalled();
      expect(evaluate).not.toHaveBeenCalled();
      expect(replayed.planning).toEqual(first.planning);
      const shortlistKeysAfter = Array.from(journal.keys()).filter(k => k.startsWith("design-shortlist:"));
      expect(shortlistKeysAfter).toEqual(shortlistKeysBefore);
    } finally {
      (ENV as any).rankingV2 = prevRankingV2;
    }
  });

  it("Gap 5: entrega affirmativeCopyInstructionsV2 ao redator no contrato novo e preserva v1/hashes históricos", async () => {
    const def = definitions[0];
    const historicalConfig = resolveReviewExecutionConfigV10("openai/gpt-4o", undefined);
    const v2Config = resolveReviewExecutionConfigV10("openai/gpt-4o", undefined, {
      copyInstructionsVersion: 2,
    });

    // Hash histórico V10 permanece bit-a-bit idêntico quando copyInstructionsVersion não está definido
    expect(historicalConfig.copyInstructionsVersion).toBeUndefined();
    expect(historicalConfig.contractHash).toBe(reviewContractHashV10(false, false));
    expect(v2Config.copyInstructionsVersion).toBe(2);
    expect(v2Config.contractHash).not.toBe(historicalConfig.contractHash);

    const capturedSystemPrompts: string[] = [];
    const textFields = compactComponentCard(def).fields.filter(f => f.kind === "text");
    const generateText = vi.fn(async (params: any) => {
      capturedSystemPrompts.push(String(params.messages[0]?.content ?? ""));
      const content =
        params.traceLabel?.includes("copy")
          ? JSON.stringify({
              caption: "Café direto da fazenda",
              hashtags: [],
              slides: [
                {
                  values: textFields.map(f => ({
                    fieldId: f.id,
                    value: "Texto curto aprovado",
                  })),
                  mediaPrompts: [],
                },
              ],
            })
          : JSON.stringify({
              version: 4,
              status: "reviewed",
              findings: [],
              reasons: [],
            });
      return {
        id: "gen-gap5",
        model: params.pinnedModel ?? "openai/gpt-4o",
        choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
      };
    });

    const promptText = "Café especial direto da fazenda";
    const editorialContext = editorialContextV9({ prompt: promptText, platform: "instagram", postMode: "static" });
    const baseInput = {
      requestId: "00000000-0000-4000-8000-000000000051",
      proposalId: "p-gap5-v2",
      runId: "00000000-0000-4000-8000-000000000051",
      slot: 0,
      postMode: "static" as const,
      platform: "instagram" as const,
      prompt: promptText,
      editorialContext,
      editorialContextHash: editorialContext.hash,
      selectedDefinitions: [def],
      generationIntent: {
        version: 1 as const,
        objective: "Destacar origem artesanal",
        tone: { description: "Direto", origin: "inferred" as const, rationale: "Brief" },
        adaptation: "controlled" as const,
        requirements: [],
        content: [{ id: "idea-1", meaning: "Origem direta", requirementIds: [], sourceIds: [] }],
      },
      reviewPolicyVersion: 10 as const,
    };

    const runWorkflow = (config: typeof v2Config) =>
      executeProposalWorkflow(
        {
          ...baseInput,
          reviewExecutionConfig: config as any,
        },
        {
          generateText: generateText as any,
          renderReviewScenes: async () => [],
          createTextMeasurer: async () => p => ({ height: 20, lines: [{ width: 100 }], runs: [{ fill: p.fill, fontSize: p.fontSize, fontStyle: p.fontStyle }] }),
          operation: async (_op, work) => work(),
          measureText: () => ({ height: 20, lines: [{ width: 100 }] }),
        } as any
      );

    // 1) Contrato novo com copyInstructionsVersion: 2 -> redator recebe instruções afirmativas V2
    await runWorkflow(v2Config);
    expect(capturedSystemPrompts.length).toBeGreaterThanOrEqual(1);
    expect(capturedSystemPrompts[0]).toContain(affirmativeCopyInstructionsV2);
    expect(capturedSystemPrompts[0]).not.toContain("Jamais use frases");

    // 2) Modo compacto automático com copyInstructionsVersion: 2 -> redator recebe âncora V2
    capturedSystemPrompts.length = 0;
    const autoCfg = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    const compactV2Config = resolveReviewExecutionConfigV10(autoCfg.model, autoCfg.taskRouting!.copy, {
      copyInstructionsVersion: 2,
    });
    await executeProposalWorkflow(
      {
        ...baseInput,
        generationConfig: autoCfg as any,
        reviewExecutionConfig: { ...compactV2Config, automaticReviewVersion: 4 } as any,
      },
      {
        generateText: generateText as any,
        renderReviewScenes: async () => [],
        createTextMeasurer: async () => p => ({ height: 20, lines: [{ width: 100 }], runs: [{ fill: p.fill, fontSize: p.fontSize, fontStyle: p.fontStyle }] }),
        operation: async (_op, work) => work(),
        measureText: () => ({ height: 20, lines: [{ width: 100 }] }),
      } as any
    );
    expect(capturedSystemPrompts.length).toBeGreaterThanOrEqual(1);
    expect(capturedSystemPrompts[0]).toContain(AFFIRMATIVE_COPY_LANGUAGE_ANCHOR_V2);

    // 3) Contrato histórico sem copyInstructionsVersion -> redator preserva V1 intacto
    capturedSystemPrompts.length = 0;
    await runWorkflow(historicalConfig);
    expect(capturedSystemPrompts[0]).toContain(affirmativeCopyInstructions);
  });
});
