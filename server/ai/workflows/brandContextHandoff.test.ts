import { describe, expect, it, vi } from "vitest";
import {
  interpretRawBriefing,
  creationBriefToExecutionBrief,
} from "@shared/creationBrief";
import {
  executionBriefSchema,
  normalizeExecutionBrief,
  orchestratedGenerationInputSchema,
} from "@shared/generationRequest";
import type { CreativeExecutionBrief } from "@shared/postspark";
import type { ExecutionBriefContext } from "../generationOrchestrator";
import {
  resolveReviewExecutionConfigV7,
  reviewContractHashV7,
  reviewInstructionsV7,
  copyInstructionsV7,
  assertReviewExecutionConfigV7,
} from "./reviewExecutionConfigV7";
import { editorialContextV7 } from "./editorialContextV7";
import { prepareHistoricalGeneration as prepareOrchestratedGeneration } from "./historicalPreparation.fixture";
import { electionCatalogFixture } from "../../designCatalog/designElection.fixture";
import { reconcileCatalogCoverage } from "../../designCatalog/catalogCoverage";
import { shortlistCompleteDesigns, type JevRequest } from "../../designCatalog/designShortlist";
import { defaultStudioPreferences } from "@shared/studioPreferences";
import { executeProposalWorkflow } from "./proposalGraph";
import { reviewProposal } from "./proposalReview";
import { renderReviewFixtureScenes } from "./proposalReview.fixture";
import { arsenalHash } from "@shared/arsenalContent";
import { freezeGenerationProject } from "@shared/projectEditorial";
import { healthyReviewV7Fixture, reviewPayloadV7 } from "./proposalReviewV7.fixture";

const owner = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const runId = "44444444-4444-4444-8444-444444444444";

function mockPreparationDeps(definitions: any[]) {
  const { inventory } = electionCatalogFixture(14);
  const catalog = reconcileCatalogCoverage(
    { aspectRatio: "4:5", postMode: "static", text: "Contexto", slideCount: 1, experimental: false },
    inventory
  );
  const jevCalls: JevRequest[] = [];
  const generateCalls: any[] = [];
  return {
    retrieve: vi.fn(async () => catalog),
    hydrate: vi.fn(async () => definitions),
    shortlist: vi.fn(async (req: any) => {
      const result = await shortlistCompleteDesigns(req, async (r: JevRequest) => {
        jevCalls.push(r);
        return {
          id: "mock-jev",
          model: r.model,
          answers: Object.fromEntries(
            Object.keys(r.questions).map(id => [id, { type: "score" as const, score: 4.0, confidence: 0.95 }])
          ),
          usage: { input_tokens: 10, output_tokens: 10, cost: 0 },
        };
      });
      return result;
    }),
    generate: vi.fn(async (params: any) => {
      generateCalls.push(params);
      const parsed = JSON.parse(params.messages[1].content);
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                version: 2,
                options: parsed.catalog.slice(0, 3).map((o: any) => ({
                  offerId: o.offerId,
                  reason: "Oferta autorada adequada ao tema.",
                })),
              }),
            },
          },
        ],
      } as any;
    }),
    loadContext: vi.fn(async () => "Contexto factual independente"),
    preferences: vi.fn(async () => defaultStudioPreferences),
    recentSelections: vi.fn(async () => []),
    operation: vi.fn(async (_k: string, fn: () => Promise<any>) => fn()),
    jevCalls,
    generateCalls,
  };
}

it("delivers the same frozen project/playbook to JEV, selector, native copy and mandatory reviewer", async () => {
  const projectDossier = "# DOSSIÊ DE MARCA: BizuMiner\n## O QUE FAZEMOS & TRANSFORMAÇÃO\nAcompanha preços ao longo dos dias.\n## POSTURA E TOM DE VOZ\nNatural, clara e próxima.\n## PÚBLICO-ALVO\nPessoas pesquisando ofertas\n## CHAMADA PARA AÇÃO (CTA PADRÃO)\nConheça o acompanhamento\n## TERMOS E ABORDAGENS PROIBIDAS\n- milagre garantido\n## Condição histórica\nO histórico se refere ao período acompanhado.";
  const projectSnapshot = freezeGenerationProject({name:"BizuMiner", niche:"Ofertas", compiledDocument:projectDossier});
  const input = orchestratedGenerationInputSchema.parse({ownerId:owner, inputType:"text", content:"Benefício do acompanhamento de preços", platform:"instagram", postMode:"static", idempotencyKey:"affirmative-context-test", projectDossier, projectSnapshot,
    executionBrief:creationBriefToExecutionBrief({...interpretRawBriefing("Benefício do acompanhamento de preços", {selectedFormat:"static"}), tone:"Direto", audience:"Quem compara preços", callToAction:"Salve para a próxima compra"}),
  });
  const {definitions} = electionCatalogFixture(14);
  const deps = mockPreparationDeps(definitions);
  deps.loadContext.mockResolvedValue(projectDossier);
  const prepared = await prepareOrchestratedGeneration(input, owner, false, Date.now()+60000, deps);
  const context = prepared.editorialContext!;
  expect(context.instructions).toMatchObject({tone:"Direto", audience:"Quem compara preços", callToAction:"Salve para a próxima compra"});
  expect(context.instructionOrigins).toEqual({tone:"piece", audience:"piece", callToAction:"piece"});
  expect(context.requirements.map(r => r.value)).toContain("milagre garantido");
  expect(context.sources.some(s => s.text.includes("Condição histórica"))).toBe(true);
  for (const call of deps.jevCalls) expect(JSON.parse(call.state).context.editorialContext).toEqual(context);
  expect(JSON.parse(deps.generateCalls[0].messages[1].content).editorialContext).toEqual(context);
  const calls:any[] = [];
  const outcome = await executeProposalWorkflow({requestId, runId, proposalId:"affirmative-proposal", slot:0, prompt:input.content, platform:input.platform, postMode:input.postMode,
    projectDossier, projectSnapshot, executionBrief:prepared.executionBrief!, contextContent:prepared.contextContent, editorialContext:context, editorialContextHash:context.hash,
    reviewPolicyVersion:7, reviewExecutionConfig:prepared.reviewExecutionConfig, selectedDefinitions:prepared.selectedDefinitions[0],
  }, {actor:owner, measureText:(e:any) => ({height:e.fontSize*1.2, lines:[{text:e.text,width:e.text.length*e.fontSize*.4}], runs:[{fill:e.fill,fontSize:e.fontSize,fontStyle:e.fontStyle}]}), renderReviewScenes:renderReviewFixtureScenes,
    generateText:async params => {
      calls.push(params);
      if (params.taskRoute === "post_evaluation") {
        expect(reviewPayloadV7(params).context).toEqual(context);
        expect(params.pinnedModel).toBe(prepared.reviewExecutionConfig?.resolvedModel);
        return {choices:[{message:{content:JSON.stringify(healthyReviewV7Fixture(params))}}]} as any;
      }
      expect(params.pinnedModel).toBe(prepared.reviewExecutionConfig?.textModel);
      expect(params.messages[1].content).toContain(JSON.stringify(context));
      expect(params.messages[0].content).not.toContain("Use o espaço disponível para frases");
      return {choices:[{message:{content:JSON.stringify({caption:"O histórico ajuda a comparar o preço no período acompanhado.", hashtags:[], slides:[{values:[{fieldId:"field-0",value:"Compare com o histórico"},{fieldId:"field-1",value:""}],mediaPrompts:[]}]})}}]} as any;
    },
  });
  expect(outcome.status).toBe("ready");
  expect(calls.filter(c => c.taskRoute !== "post_evaluation")).toHaveLength(1);
  expect(calls.filter(c => c.taskRoute === "post_evaluation")).toHaveLength(1);
});

describe("OS-02 — brand context handoff and editorial guidance (C1/C3)", () => {
  it("AC-1: sentinel brand kit values traverse the funnel up to copy and user messages", async () => {
    const sentinelKit = {
      brand_name: "SENTINEL_BRAND_NAME",
      brand_essence: "ESSENCIA_SENTINELA_K1",
      target_audience: "PUBLICO_ORIGINAL_KIT",
      tone: "TOM_SENTINELA_K1",
    };

    // 1. interpretRawBriefing with Kit
    const initialBrief = interpretRawBriefing("Texto neutro sobre café", {
      selectedFormat: "static",
      brandKit: sentinelKit,
    });
    expect(initialBrief.brandEssence).toBe("ESSENCIA_SENTINELA_K1");
    expect(initialBrief.tone).toBe("TOM_SENTINELA_K1");
    expect(initialBrief.audience).toBe("PUBLICO_ORIGINAL_KIT");

    // 2. User edits audience in modal: current edition prevails over original Kit
    const editedBrief = {
      ...initialBrief,
      audience: "PUBLICO_EDITADO_E1",
    };

    // 3. Adapter creationBriefToExecutionBrief
    const execBrief = creationBriefToExecutionBrief(editedBrief);
    expect(execBrief.audience).toBe("PUBLICO_EDITADO_E1");
    expect(execBrief.brandEssence).toBe("ESSENCIA_SENTINELA_K1");
    expect(execBrief.tone).toBe("TOM_SENTINELA_K1");

    // 4. Schema parsing & normalization
    const validatedBrief = executionBriefSchema.parse(execBrief);
    const normalized = normalizeExecutionBrief(validatedBrief);
    expect(normalized.audience).toBe("PUBLICO_EDITADO_E1");
    expect(normalized.brandEssence).toBe("ESSENCIA_SENTINELA_K1");

    // 5. Admitted input
    const input = orchestratedGenerationInputSchema.parse({
      ownerId: owner,
      inputType: "text",
      content: "Texto neutro sobre café",
      platform: "instagram",
      postMode: "static",
      creationMode: "execution",
      idempotencyKey: "test-idem-ac1",
      executionBrief: normalized,
    });

    // 6. Preparation: verify messages sent to Jev and selector LLM
    const { definitions } = electionCatalogFixture(14);
    const deps = mockPreparationDeps(definitions);
    const prepared = await prepareOrchestratedGeneration(
      input,
      owner,
      false,
      Date.now() + 60000,
      deps
    );

    // Verify Jev brief contains audience and brand essence
    expect(deps.jevCalls.length).toBeGreaterThan(0);
    const jevContext = JSON.parse(deps.jevCalls[0].state).context;
    expect(jevContext.editorialContext.instructions.audience).toBe("PUBLICO_EDITADO_E1");
    expect(jevContext.editorialContext.instructions.brandEssence).toBe("ESSENCIA_SENTINELA_K1");
    expect(jevContext.editorialContext.instructions.tone).toBe("TOM_SENTINELA_K1");

    // Verify Selector user message contains audience and brand essence
    expect(deps.generateCalls.length).toBeGreaterThan(0);
    const selectorUserMsg = deps.generateCalls[0].messages[1].content;
    expect(selectorUserMsg).toContain("PUBLICO_EDITADO_E1");
    expect(selectorUserMsg).toContain("ESSENCIA_SENTINELA_K1");
    expect(selectorUserMsg).toContain("TOM_SENTINELA_K1");

    // 7. Workflow / Copy generation: copy prompt receives execution instructions with brand and audience
    const copyCalls: any[] = [];
    const workflowDeps = {
      actor: owner,
      generateText: vi.fn(async (params: any) => {
        copyCalls.push(params);
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  caption: "Legenda para " + normalized.audience,
                  hashtags: ["#cafe"],
                  slides: [
                    {
                      values: [
                        { fieldId: "field-0", value: "Café para " + normalized.audience },
                        { fieldId: "field-1", value: "Descubra o sabor" },
                      ],
                      mediaPrompts: [],
                    },
                  ],
                }),
              },
            },
          ],
        };
      }),
      measureText: () => ({ height: 20, lines: [{ width: 100 }], runs: [] }),
      renderReviewScenes: renderReviewFixtureScenes,
    };

    const workflowInput = {
      requestId,
      runId,
      proposalId: "proposal-ac1",
      slot: 0,
      prompt: input.content,
      postMode: "static" as const,
      reviewPolicyVersion: prepared.reviewPolicyVersion,
      reviewExecutionConfig: prepared.reviewExecutionConfig,
      editorialContextHash: prepared.editorialContextHash,
      platform: input.platform,
      editorialContext: prepared.editorialContext,
      contextContent: prepared.contextContent,
      executionBrief: prepared.executionBrief ?? undefined,
      selectedDefinitions: [prepared.selectedDefinitions[0][0]],
    };

    await executeProposalWorkflow(workflowInput as any, workflowDeps as any);
    expect(copyCalls.length).toBeGreaterThan(0);
    const copyUserPrompt = copyCalls[0].messages.find((m: any) => m.role === "user")?.content;
    expect(copyUserPrompt).toContain("PUBLICO_EDITADO_E1");
    expect(copyUserPrompt).toContain("ESSENCIA_SENTINELA_K1");
  });

  it("AC-2: absence is preserved; limits (2000 chars, 96000 aggregate) are strictly enforced", () => {
    // Absent audience and brandEssence are undefined, not invented
    const absentBrief = executionBriefSchema.parse({
      creationMode: "execution",
      format: "static",
      platform: "instagram",
      objective: "engage",
      interventionLevel: "optimize_structure",
      contentSourceType: "freeform",
      rawInput: "Texto simples",
    });
    expect(absentBrief.audience).toBeUndefined();
    expect(absentBrief.brandEssence).toBeUndefined();

    // Mirrored types compile and accept the fields
    const testExecBrief: CreativeExecutionBrief = {
      creationMode: "execution",
      format: "static",
      platform: "instagram",
      objective: "engage",
      interventionLevel: "optimize_structure",
      contentSourceType: "freeform",
      rawInput: "Texto",
      audience: "Público alvo",
      brandEssence: "Essência",
    };
    expect(testExecBrief.audience).toBe("Público alvo");

    const testContextBrief: ExecutionBriefContext = {
      creationMode: "execution",
      format: "static",
      platform: "instagram",
      objective: "engage",
      interventionLevel: "optimize_structure",
      contentSourceType: "freeform",
      rawInput: "Texto",
      slides: [],
      mustKeep: [],
      mustInclude: [],
      forbiddenTerms: [],
      audience: "Público contexto",
      brandEssence: "Essência contexto",
    };
    expect(testContextBrief.brandEssence).toBe("Essência contexto");

    // Fields > 2000 chars fail Zod
    expect(
      executionBriefSchema.safeParse({
        ...absentBrief,
        audience: "x".repeat(2001),
      }).success
    ).toBe(false);

    expect(
      executionBriefSchema.safeParse({
        ...absentBrief,
        brandEssence: "y".repeat(2001),
      }).success
    ).toBe(false);

    // Aggregate > 96000 chars fails Zod
    expect(
      executionBriefSchema.safeParse({
        ...absentBrief,
        rawInput: "a".repeat(24000),
        notes: "b".repeat(8000),
        audience: "c".repeat(2000),
        brandEssence: "d".repeat(2000),
        slides: [
          { slideNumber: 1, rawText: "s".repeat(8000) },
          { slideNumber: 2, rawText: "s".repeat(8000) },
          { slideNumber: 3, rawText: "s".repeat(8000) },
          { slideNumber: 4, rawText: "s".repeat(8000) },
          { slideNumber: 5, rawText: "s".repeat(8000) },
          { slideNumber: 6, rawText: "s".repeat(8000) },
          { slideNumber: 7, rawText: "s".repeat(8000) },
          { slideNumber: 8, rawText: "s".repeat(8000) },
          { slideNumber: 9, rawText: "s".repeat(8000) },
          { slideNumber: 10, rawText: "s".repeat(8000) },
        ],
      }).success
    ).toBe(false);

    // Legacy input without new fields continues valid
    const legacyInput = orchestratedGenerationInputSchema.parse({
      ownerId: owner,
      inputType: "text",
      content: "Post sem briefing",
      platform: "instagram",
      idempotencyKey: "test-legacy-ac2",
    });
    expect(legacyInput.executionBrief).toBeUndefined();
  });

  it("AC-3: in profile 5, review receives contextual orientation separated from sources; tone preference is advisory while false claims block", () => {
    const brief = normalizeExecutionBrief(
      executionBriefSchema.parse({
        creationMode: "execution",
        format: "static",
        platform: "instagram",
        objective: "sell",
        tone: "persuasivo e elegante",
        audience: "Executivos de tecnologia",
        brandEssence: "Inovação segura",
        interventionLevel: "optimize_structure",
        contentSourceType: "freeform",
        rawInput: "Software empresarial para automação",
      })
    );

    // Profile 5 context includes tone, audience, brandEssence, platform under instructions
    const ctx5 = editorialContextV7(
      { prompt: "Software empresarial", executionBrief: brief, contextContent: "Fatos da empresa" },
      5
    );
    expect(ctx5.instructions).toMatchObject({
      objective: "sell",
      tone: "persuasivo e elegante",
      audience: "Executivos de tecnologia",
      brandEssence: "Inovação segura",
      platform: "instagram",
    });

    // Sources remain purely factual, not polluted with audience or brandEssence
    for (const src of ctx5.sources) {
      expect(src.text).not.toContain("Executivos de tecnologia");
      expect(src.text).not.toContain("Inovação segura");
    }

    // Requirements remain separate
    expect(Array.isArray(ctx5.requirements)).toBe(true);

    // Profile 4 does NOT include tone, audience, brandEssence under instructions
    const ctx4 = editorialContextV7(
      { prompt: "Software empresarial", executionBrief: brief, contextContent: "Fatos da empresa" },
      4
    );
    expect((ctx4.instructions as any).audience).toBeUndefined();
    expect((ctx4.instructions as any).brandEssence).toBeUndefined();
    expect((ctx4.instructions as any).tone).toBeUndefined();
    expect(ctx5.hash).not.toBe(ctx4.hash);
  });

  it("AC-4: historical guidance versions 1-4 preserve instructions, contract hashes and receipt schemas; profile 5 inherits protections", () => {
    // Verified immutable hashes for 1, 2, 3
    expect(reviewContractHashV7(1)).toBe("caaa057fcc28a0e6c34408bcf946afd1ccd9f7a0695aea490458c01f183c05d8");
    expect(reviewContractHashV7(2)).toBe("011a07590a5e8f5210964ba972f4942214cbbd815277f1a9a40478690fc2d628");
    expect(reviewContractHashV7(3)).toBe("f8d4c0667857dfbaeee6f9fdb135d81c91b902898010741a3debf5a0bba21407");

    // Profile 4 and 5 hashes are distinct
    expect(reviewContractHashV7(4)).not.toBe(reviewContractHashV7(3));
    expect(reviewContractHashV7(5)).not.toBe(reviewContractHashV7(4));

    // Profile 5 inherits category/consequence consistency from 4
    expect(reviewInstructionsV7(undefined, undefined, 5)).toContain("Categoria e consequência devem concordar");
    expect(reviewInstructionsV7(undefined, undefined, 5)).toContain("Público, essência da marca, tom e plataforma");
    expect(reviewInstructionsV7(undefined, undefined, 4)).not.toContain("Público, essência da marca, tom e plataforma");

    // Profile 5 inherits bounded benefit guidance from 3
    expect(copyInstructionsV7(5)).toContain("Distinga capacidade, finalidade e resultado");
    expect(reviewInstructionsV7(undefined, undefined, 5)).toContain("Não faça bloqueio lexical");

    // Tampered configuration is rejected before provider call
    const config5 = resolveReviewExecutionConfigV7(5);
    expect(config5.editorialGuidanceVersion).toBe(5);
    const tampered = {
      ...config5,
      contractHash: reviewContractHashV7(4), // contract hash of 4 paired with version 5
    };
    expect(() =>
      assertReviewExecutionConfigV7({
        ...tampered,
        configurationHash: arsenalHash(tampered),
      })
    ).toThrow("preparation_contract_incompatible");
  });

  it("AC-5: admission preserves brand context and does not repurchase completed operations", async () => {
    const brief = normalizeExecutionBrief(
      executionBriefSchema.parse({
        creationMode: "execution",
        format: "static",
        platform: "instagram",
        objective: "engage",
        tone: "acolhedor",
        audience: "Pais de primeira viagem",
        brandEssence: "Cuidado e segurança infantil",
        interventionLevel: "light_optimize",
        contentSourceType: "freeform",
        rawInput: "Dicas de segurança para bebês",
      })
    );

    const input = orchestratedGenerationInputSchema.parse({
      ownerId: owner,
      inputType: "text",
      content: "Dicas de segurança para bebês",
      platform: "instagram",
      postMode: "static",
      creationMode: "execution",
      idempotencyKey: "test-idem-ac5",
      executionBrief: brief,
    });

    const { definitions } = electionCatalogFixture(14);
    const deps = mockPreparationDeps(definitions);

    // First preparation
    const prep1 = await prepareOrchestratedGeneration(input, owner, false, Date.now() + 60000, deps);
    expect(prep1.executionBrief?.audience).toBe("Pais de primeira viagem");
    expect(prep1.executionBrief?.brandEssence).toBe("Cuidado e segurança infantil");

    // Replay / simulated idempotent retry with identical input
    const prep2 = await prepareOrchestratedGeneration(input, owner, false, Date.now() + 60000, deps);
    expect(prep2.editorialContextHash).toBe(prep1.editorialContextHash);
    expect(prep2.reviewExecutionConfig.configurationHash).toBe(prep1.reviewExecutionConfig.configurationHash);
  });
});
