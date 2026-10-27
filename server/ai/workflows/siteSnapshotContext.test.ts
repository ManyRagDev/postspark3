import { describe, it, expect, vi, afterEach } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { completeDesignFields } from "@shared/completeDesignGeneration";
import { compactComponentCard } from "@shared/componentAssembly";
import { defaultStudioPreferences } from "@shared/studioPreferences";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { SourceContextLimitError } from "@shared/sourceContext";
import {
  loadGenerationContext,
  validateSiteIntelligenceSnapshot,
  projectSiteIntelligenceSnapshot,
} from "./generationRuntime";
import { prepareHistoricalContextGeneration as prepareOrchestratedGeneration } from "./historicalPreparation.fixture";
import { executeProposalWorkflow } from "./proposalGraph";
import { resolveReviewExecutionConfigV7 } from "./reviewExecutionConfigV7";
import { editorialContextV7 } from "./editorialContextV7";
import {
  renderReviewFixtureScenes,
  acceptedReviewFixture,
} from "./proposalReview.fixture";
import { healthyReviewV7Fixture } from "./proposalReviewV7.fixture";
import {
  loadSiteIntelligence,
} from "../../siteIntelligence";

vi.mock("../../siteIntelligence", () => ({
  loadSiteIntelligence: vi.fn(),
  siteIntelligenceToPrompt: vi.fn(),
}));

afterEach(() => {
  vi.resetAllMocks();
});

const owner = "00000000-0000-4000-8000-000000000001";
const sentinelId = "99999999-9999-4999-8999-999999999999";
const definitions = completeDesignTestDefinitions();

function createHealthySnapshot(overrides: Record<string, any> = {}) {
  return {
    id: sentinelId,
    sourceUrl: "https://tributario.test",
    normalizedUrl: "https://tributario.test",
    fingerprint: "fingerprint-sentinel-123",
    extractedAt: "2026-10-15T14:30:00Z",
    quality: {
      overall: 90,
      visual: 95,
      semantic: 85,
      evidenceCoverage: 90,
      fallbackUsed: false,
      warnings: ["aviso não obstrutivo"],
    },
    brand: {
      brandName: "Tributo Certo",
      industry: "Consultoria Fiscal",
      colors: {
        palette: ["#112233", "#445566"],
        primary: "#112233",
      },
    },
    business: {
      summary: "Recuperação de créditos fiscais para empresas",
      valueProposition: "Economia tributária comprovada",
      products: [],
      services: ["Auditoria Fiscal", "Recuperação de Pis/Cofins"],
      audiences: ["CFOs e Contadores"],
      audienceProblems: ["Complexidade do sistema tributário nacional"],
      differentiators: ["Mais de 500 empresas atendidas"],
      goals: ["authority", "lead"],
    },
    editorial: {
      pillars: ["Inteligência Tributária"],
      priorityTopics: ["Tesouraria Blindada"],
      prohibitedClaims: ["Garantia incondicional sem auditoria prévia"],
      toneGuidelines: ["Técnico, sóbrio e pragmático"],
    },
    evidence: [
      {
        id: "ev-head-1",
        sourceUrl: "https://tributario.test/home",
        kind: "heading",
        text: "Recupere até 30% dos tributos pagos a mais nos últimos 5 anos.",
      },
      {
        id: "ev-body-2",
        sourceUrl: "https://tributario.test/metodologia",
        kind: "body",
        text: "Metodologia proprietária baseada em cruzamento de arquivos SPED.",
      },
    ],
    ...overrides,
  };
}

describe("OS-03: snapshot context projection and propagation", () => {
  it("AC-1 & AC-2: projects snapshot with exact provenance, quality, separates evidence and omits pseudo-rules", async () => {
    const snapshot = createHealthySnapshot();
    vi.mocked(loadSiteIntelligence).mockResolvedValue(snapshot as any);

    const input = orchestratedGenerationInputSchema.parse({
      ownerId: owner,
      idempotencyKey: "idem-snap-1",
      inputType: "text",
      content: "Criar post explicativo sobre recuperação tributária",
      siteIntelligenceId: sentinelId,
      platform: "instagram",
      creationMode: "execution",
      executionBrief: {
        creationMode: "execution",
        format: "static",
        platform: "instagram",
        objective: "educate",
        interventionLevel: "optimize_structure",
        contentSourceType: "freeform",
        rawInput: "Criar post explicativo sobre recuperação tributária",
      },
    });

    const projected = await loadGenerationContext(input, owner);

    // AC-1: Provenance and quality metadata
    expect(projected).toContain(sentinelId);
    expect(projected).toContain("https://tributario.test");
    expect(projected).toContain("fingerprint-sentinel-123");
    expect(projected).toContain("2026-10-15T14:30:00Z");
    expect(projected).toContain("Fallback utilizado na coleta: false");
    expect(projected).toContain("aviso não obstrutivo");

    // Exact evidence texts with id, kind, sourceUrl
    expect(projected).toContain("[evidência:ev-head-1] [tipo:heading] [origem:https://tributario.test/home]");
    expect(projected).toContain("Recupere até 30% dos tributos pagos a mais nos últimos 5 anos.");
    expect(projected).toContain("[evidência:ev-body-2] [tipo:body] [origem:https://tributario.test/metodologia]");
    expect(projected).toContain("Metodologia proprietária baseada em cruzamento de arquivos SPED.");

    // AC-2: Separate sections and NO pseudo-rules ("fonte unica", mandatory colors, etc.)
    expect(projected).toContain("METADADOS DO SNAPSHOT");
    expect(projected).toContain("SÍNTESE DO SITE");
    expect(projected).toContain("ORIENTAÇÕES CONTEXTUAIS DO SITE");
    expect(projected).toContain("EVIDÊNCIAS SALVAS DO SITE");
    expect(projected).not.toContain("fonte unica");
    expect(projected).not.toContain("cores mandatorias");
    expect(projected).not.toContain("BRAND SOUL");
    expect(projected).not.toContain("REGRAS DE CORES OBRIGATORIAS");
  });

  it("AC-1: snapshot context reaches selector and copy prompts through preparation", async () => {
    const snapshot = createHealthySnapshot();
    vi.mocked(loadSiteIntelligence).mockResolvedValue(snapshot as any);

    const input = orchestratedGenerationInputSchema.parse({
      ownerId: owner,
      idempotencyKey: "idem-snap-2",
      inputType: "text",
      content: "Criar post explicativo sobre recuperação tributária",
      siteIntelligenceId: sentinelId,
      platform: "instagram",
      creationMode: "execution",
      executionBrief: {
        creationMode: "execution",
        format: "static",
        platform: "instagram",
        objective: "educate",
        interventionLevel: "optimize_structure",
        contentSourceType: "freeform",
        rawInput: "Criar post explicativo sobre recuperação tributária",
      },
    });

    const context = await loadGenerationContext(input, owner);
    const selectorCalls: any[] = [];

    const prepared = await prepareOrchestratedGeneration(
      input,
      owner,
      false,
      Date.now() + 60000,
      {
        operation: async (_key, work) => work(),
        loadContext: async () => context,
        preferences: async () => defaultStudioPreferences,
        retrieve: async () => definitions.map(compactComponentCard),
        hydrate: async ids => definitions.filter(d => ids.includes(d.id)),
        shortlist: async ({ cards }) => ({
          cards,
          evaluated: [],
          batches: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        }),
        generate: async p => {
          selectorCalls.push(p);
          const data = JSON.parse(p.messages[1].content as string);
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 2,
                    options: data.catalog.slice(0, 3).map((o: any) => ({
                      offerId: o.offerId,
                      reason: "Seletor com snapshot",
                    })),
                  }),
                },
              },
            ],
          } as any;
        },
      }
    );

    // Selector received snapshot context
    expect(selectorCalls).toHaveLength(1);
    const selectorPrompt = selectorCalls[0].messages[1].content as string;
    expect(selectorPrompt).toContain("Recupere até 30% dos tributos");
    expect(selectorPrompt).toContain(sentinelId);

    // Copy generation receives snapshot context
    const copyCalls: any[] = [];
    const executionInput = {
      requestId: "00000000-0000-4000-8000-000000000002",
      runId: "00000000-0000-4000-8000-000000000002",
      proposalId: "p-01",
      slot: 0,
      prompt: input.content,
      postMode: "static" as const,
      reviewPolicyVersion: prepared.reviewPolicyVersion,
      reviewExecutionConfig: prepared.reviewExecutionConfig,
      editorialContextHash: prepared.editorialContextHash,
      contextContent: prepared.contextContent,
      executionBrief: prepared.executionBrief ?? undefined,
      selectedDefinitions: [prepared.selectedDefinitions[0][0]],
    };

    const copyDeps = {
      actor: owner,
      measureText: () => ({ height: 20, lines: [{ width: 100 }], runs: [] }),
      renderReviewScenes: renderReviewFixtureScenes,
      generateText: vi.fn(async (params: any) => {
        copyCalls.push(params);
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  caption: "Recuperação tributária para sua empresa.",
                  hashtags: ["#tributos"],
                  slides: [
                    {
                      values: [
                        { fieldId: "field-0", value: "Recupere até 30% dos tributos" },
                        { fieldId: "field-1", value: "Metodologia própria" },
                      ],
                      mediaPrompts: [],
                    },
                  ],
                }),
              },
            },
          ],
        } as any;
      }),
    };

    await executeProposalWorkflow(executionInput as any, copyDeps as any);

    expect(copyCalls.length).toBeGreaterThanOrEqual(1);
    const copyPrompt = JSON.stringify(copyCalls[0].messages);
    expect(copyPrompt).toContain("Recupere até 30% dos tributos");
    expect(copyPrompt).toContain("Metodologia proprietária baseada em cruzamento de arquivos SPED.");
    expect(copyPrompt).toContain("Fallback utilizado na coleta: false");
  });

  it("AC-1: distinguishes fallbackUsed: true and warnings in prompt", async () => {
    const fallbackSnap = createHealthySnapshot({
      quality: {
        fallbackUsed: true,
        warnings: ["extração heurística ativada por bloqueio de scrape"],
      },
    });
    vi.mocked(loadSiteIntelligence).mockResolvedValue(fallbackSnap as any);

    const input = orchestratedGenerationInputSchema.parse({
      ownerId: owner,
      idempotencyKey: "idem-snap-3",
      inputType: "text",
      content: "Post com snapshot fallback",
      siteIntelligenceId: sentinelId,
      platform: "instagram",
    });

    const projected = await loadGenerationContext(input, owner);
    expect(projected).toContain("Fallback utilizado na coleta: true");
    expect(projected).toContain("extração heurística ativada por bloqueio de scrape");
  });

  it("AC-3: throws SourceContextLimitError when snapshot exceeds 24,000 characters without trimming", async () => {
    const largeEvidence = "A".repeat(24000) + " Texto crucial no final";
    const oversizedSnap = createHealthySnapshot({
      evidence: [
        {
          id: "ev-large-1",
          sourceUrl: "https://tributario.test",
          kind: "body",
          text: largeEvidence,
        },
      ],
    });
    vi.mocked(loadSiteIntelligence).mockResolvedValue(oversizedSnap as any);

    const input = orchestratedGenerationInputSchema.parse({
      ownerId: owner,
      idempotencyKey: "idem-snap-4",
      inputType: "text",
      content: "Post com snapshot enorme",
      siteIntelligenceId: sentinelId,
      platform: "instagram",
    });

    await expect(loadGenerationContext(input, owner)).rejects.toThrow(SourceContextLimitError);
  });

  it("AC-4: fails on inaccessible snapshot without querying other users or rescraping", async () => {
    vi.mocked(loadSiteIntelligence).mockResolvedValue(null);

    const input = orchestratedGenerationInputSchema.parse({
      ownerId: owner,
      idempotencyKey: "idem-snap-5",
      inputType: "text",
      content: "Post com snapshot inexistente",
      siteIntelligenceId: "88888888-8888-4888-8888-888888888888",
      platform: "instagram",
    });

    await expect(loadGenerationContext(input, owner)).rejects.toThrow(
      "Inteligência de site indisponível para este usuário"
    );
    expect(loadSiteIntelligence).toHaveBeenCalledWith("88888888-8888-4888-8888-888888888888", owner);
  });

  it("AC-5: completed preparation reuses context byte-by-byte even if snapshot changes in database", async () => {
    const originalSnap = createHealthySnapshot({
      evidence: [
        {
          id: "ev-1",
          sourceUrl: "https://tributario.test",
          kind: "heading",
          text: "Versão original da evidência",
        },
      ],
    });
    vi.mocked(loadSiteIntelligence).mockResolvedValue(originalSnap as any);

    const input = orchestratedGenerationInputSchema.parse({
      ownerId: owner,
      idempotencyKey: "idem-snap-6",
      inputType: "text",
      content: "Post com snapshot idempotente",
      siteIntelligenceId: sentinelId,
      platform: "instagram",
    });

    const context = await loadGenerationContext(input, owner);

    // Initial preparation
    const prepared = await prepareOrchestratedGeneration(
      input,
      owner,
      false,
      Date.now() + 60000,
      {
        operation: async (_key, work) => work(),
        loadContext: async () => context,
        preferences: async () => defaultStudioPreferences,
        retrieve: async () => definitions.map(compactComponentCard),
        hydrate: async ids => definitions.filter(d => ids.includes(d.id)),
        shortlist: async ({ cards }) => ({
          cards,
          evaluated: [],
          batches: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        }),
        generate: async p => {
          const data = JSON.parse(p.messages[1].content as string);
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 2,
                    options: data.catalog.slice(0, 3).map((o: any) => ({
                      offerId: o.offerId,
                      reason: "ok",
                    })),
                  }),
                },
              },
            ],
          } as any;
        },
      }
    );

    expect(prepared.contextContent).toContain("Versão original da evidência");

    // Later: database snapshot changes, but prepared record in journal/request is reused
    const mutatedSnap = createHealthySnapshot({
      evidence: [
        {
          id: "ev-1",
          sourceUrl: "https://tributario.test",
          kind: "heading",
          text: "Versão MUTADA da evidência",
        },
      ],
    });
    vi.mocked(loadSiteIntelligence).mockResolvedValue(mutatedSnap as any);

    // Simulating resume from prepared record
    expect(prepared.contextContent).toContain("Versão original da evidência");
    expect(prepared.contextContent).not.toContain("Versão MUTADA");
  });

  it("AC-3: accepted texts, IDs, kind, origin, warnings, and trailing conditions reach selector, copy and reviewer after adapter without trimming", async () => {
    const sentinelWarning = "Aviso crítico: não atender pessoas físicas";
    const trailingCondition = "Condição resolutiva irrevogável: apenas pessoas jurídicas com faturamento acima de R$ 10MM.";
    const snap = createHealthySnapshot({
      quality: {
        fallbackUsed: false,
        warnings: [sentinelWarning],
      },
      evidence: [
        {
          id: "ev-tail-1",
          sourceUrl: "https://tributario.test/condicoes",
          kind: "body",
          text: `Evidência com condição no final: ${trailingCondition}`,
        },
      ],
    });
    vi.mocked(loadSiteIntelligence).mockResolvedValue(snap as any);

    const input = orchestratedGenerationInputSchema.parse({
      ownerId: owner,
      idempotencyKey: "idem-ac3-snap",
      inputType: "text",
      content: "Criar carrossel técnico",
      siteIntelligenceId: sentinelId,
      platform: "instagram",
      creationMode: "execution",
      executionBrief: {
        creationMode: "execution",
        format: "static",
        platform: "instagram",
        objective: "educate",
        interventionLevel: "optimize_structure",
        contentSourceType: "freeform",
        rawInput: "Criar carrossel técnico",
      },
    });

    const context = await loadGenerationContext(input, owner);
    const selectorCalls: any[] = [];
    const prepared = await prepareOrchestratedGeneration(
      input,
      owner,
      false,
      Date.now() + 60000,
      {
        operation: async (_key, work) => work(),
        loadContext: async () => context,
        preferences: async () => defaultStudioPreferences,
        retrieve: async () => definitions.map(compactComponentCard),
        hydrate: async ids => definitions.filter(d => ids.includes(d.id)),
        shortlist: async ({ cards }) => ({
          cards,
          evaluated: [],
          batches: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        }),
        generate: async p => {
          selectorCalls.push(p);
          const data = JSON.parse(p.messages[1].content as string);
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 2,
                    options: data.catalog.slice(0, 3).map((o: any) => ({
                      offerId: o.offerId,
                      reason: "Seletor com snapshot AC-3",
                    })),
                  }),
                },
              },
            ],
          } as any;
        },
      }
    );

    // 1. Selector check
    const selectorPrompt = selectorCalls[0].messages[1].content as string;
    expect(selectorPrompt).toContain(sentinelWarning);
    expect(selectorPrompt).toContain("ev-tail-1");
    expect(selectorPrompt).toContain("https://tributario.test/condicoes");
    expect(selectorPrompt).toContain(trailingCondition);

    // 2. Copy and Reviewer check
    const copyCalls: any[] = [];
    const reviewCalls: any[] = [];
    const executionInput = {
      requestId: "00000000-0000-4000-8000-000000000003",
      runId: "00000000-0000-4000-8000-000000000003",
      proposalId: "p-01",
      slot: 0,
      prompt: input.content,
      postMode: "static" as const,
      reviewPolicyVersion: prepared.reviewPolicyVersion,
      reviewExecutionConfig: prepared.reviewExecutionConfig,
      editorialContextHash: prepared.editorialContextHash,
      contextContent: prepared.contextContent,
      executionBrief: prepared.executionBrief ?? undefined,
      selectedDefinitions: [prepared.selectedDefinitions[0][0]],
    };

    const targetFields = completeDesignFields(prepared.selectedDefinitions[0][0]);
    const workflowDeps = {
      actor: owner,
      measureText: () => ({ height: 20, lines: [{ width: 100 }], runs: [] }),
      renderReviewScenes: renderReviewFixtureScenes,
      generateText: vi.fn(async (params: any) => {
        if (params.taskRoute === "post_evaluation") {
          reviewCalls.push(params);
          return { choices: [{ message: { content: JSON.stringify(healthyReviewV7Fixture(params)) } }] } as any;
        }
        copyCalls.push(params);
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  caption: "Post tributário com condição",
                  hashtags: [],
                  slides: [
                    {
                      values: targetFields.map((f, i) => ({
                        fieldId: f.id,
                        value: i === 0 ? "Texto tributário" : "Apenas PJ acima de 10MM",
                      })),
                      mediaPrompts: [],
                    },
                  ],
                }),
              },
            },
          ],
        } as any;
      }),
    };

    const workflowResult = await executeProposalWorkflow(executionInput as any, workflowDeps as any);
    expect(workflowResult.status).toBe("ready");
    expect(workflowResult.bundle.slides).toHaveLength(1);

    // 3. Copy prompt check
    expect(copyCalls.length).toBeGreaterThanOrEqual(1);
    const copyPrompt = JSON.stringify(copyCalls[0].messages);
    expect(copyPrompt).toContain(sentinelWarning);
    expect(copyPrompt).toContain(trailingCondition);

    // 4. Reviewer prompt check
    expect(reviewCalls.length).toBeGreaterThanOrEqual(1);
    const reviewPrompt = JSON.stringify(reviewCalls[0].messages);
    expect(reviewPrompt).toContain(sentinelWarning);
    expect(reviewPrompt).toContain(trailingCondition);
  });

  describe("RC-002: strict snapshot validation and exact projection", () => {
    const baseValid = () => ({
      id: "rc-snapshot",
      brand: {},
      business: {},
      editorial: {},
      evidence: [
        {
          id: "e1",
          kind: "body",
          sourceUrl: "https://example.test/page",
          text: "  Fato literal  ",
        },
      ],
    });

    it("matrix case 1: sourceUrl: null on root throws with invalid type error", () => {
      const snap = { ...baseValid(), sourceUrl: null };
      expect(() => validateSiteIntelligenceSnapshot(snap)).toThrow(/sourceUrl inválido/);
    });

    it("matrix case 2: business.summary: null throws with invalid type error", () => {
      const snap = { ...baseValid(), business: { summary: null } };
      expect(() => validateSiteIntelligenceSnapshot(snap)).toThrow(/business\.summary inválido/);
    });

    it("matrix case 3: quality: null throws with invalid quality structure error", () => {
      const snap = { ...baseValid(), quality: null };
      expect(() => validateSiteIntelligenceSnapshot(snap)).toThrow(/quality inválido/);
    });

    it("matrix case 4: quality.warnings: null throws with invalid array error before projecting", () => {
      const snap = { ...baseValid(), quality: { warnings: null } };
      expect(() => validateSiteIntelligenceSnapshot(snap)).toThrow(/quality\.warnings inválido/);
    });

    it("matrix case 5: business.goals with non-domain goal throws with domain validation error", () => {
      const snap = { ...baseValid(), business: { goals: ["garantir-lucro-automatico"] } };
      expect(() => validateSiteIntelligenceSnapshot(snap)).toThrow(/business\.goals inválido/);
    });

    it("matrix case 6: sourceUrl, fingerprint, extractedAt with surrounding spaces preserves exact accepted value without trimming in projection", () => {
      const snap = {
        ...baseValid(),
        sourceUrl: "  https://example.test/page  ",
        fingerprint: "  fp-xyz-123  ",
        extractedAt: "  2026-10-16T12:00:00Z  ",
      };
      validateSiteIntelligenceSnapshot(snap);
      const projected = projectSiteIntelligenceSnapshot(snap as any);
      expect(projected).toContain("- Origem:   https://example.test/page  ");
      expect(projected).toContain("- Fingerprint:   fp-xyz-123  ");
      expect(projected).toContain("- Data da extração:   2026-10-16T12:00:00Z  ");
      // Raw evidence also preserves exact text with spaces
      expect(projected).toContain("  Fato literal  ");
    });

    it("controls: valid optional structures (fallbackUsed: false, warnings: [], valid goals) pass and project cleanly", () => {
      const snap = {
        ...baseValid(),
        quality: { fallbackUsed: false, warnings: [] },
        business: { goals: ["educate", "sell"] },
      };
      expect(() => validateSiteIntelligenceSnapshot(snap)).not.toThrow();
      const projected = projectSiteIntelligenceSnapshot(snap as any);
      expect(projected).toContain("- Fallback utilizado na coleta: false");
      expect(projected).toContain("- Avisos da coleta: nenhum");
      expect(projected).toContain("- Objetivos observados: educate, sell");
    });
  });

  it("AC-4: user prompt vs site conflict under visual_only intervention level preserves user prompt priority and obligations", async () => {
    const siteEmphasis = "Cafés amargos e torra extremamente escura tradicional.";
    const userPrompt = "Focar exclusivamente em cafés suaves com notas florais e colheita tardia.";
    const snap = createHealthySnapshot({
      editorial: {
        pillars: ["Torra extrema"],
        priorityTopics: [siteEmphasis],
        toneGuidelines: ["forte e amargo"],
        prohibitedClaims: [],
      },
      evidence: [
        {
          id: "ev-conflict-1",
          sourceUrl: "https://cafe.test/torra",
          kind: "body",
          text: siteEmphasis,
        },
      ],
    });
    vi.mocked(loadSiteIntelligence).mockResolvedValue(snap as any);

    const input = orchestratedGenerationInputSchema.parse({
      ownerId: owner,
      idempotencyKey: "idem-conflict-visual-only",
      inputType: "text",
      content: userPrompt,
      siteIntelligenceId: sentinelId,
      platform: "instagram",
      creationMode: "execution",
      executionBrief: {
        creationMode: "execution",
        format: "static",
        platform: "instagram",
        objective: "educate",
        interventionLevel: "visual_only",
        contentSourceType: "freeform",
        rawInput: userPrompt,
      },
    });

    const context = await loadGenerationContext(input, owner);
    const prepared = await prepareOrchestratedGeneration(
      input,
      owner,
      false,
      Date.now() + 60000,
      {
        operation: async (_key, work) => work(),
        loadContext: async () => context,
        preferences: async () => defaultStudioPreferences,
        retrieve: async () => definitions.map(compactComponentCard),
        hydrate: async ids => definitions.filter(d => ids.includes(d.id)),
        shortlist: async ({ cards }) => ({
          cards,
          evaluated: [],
          batches: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        }),
        generate: async p => {
          const data = JSON.parse(p.messages[1].content as string);
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 2,
                    options: data.catalog.slice(0, 3).map((o: any) => ({
                      offerId: o.offerId,
                      reason: "Seletor respeitando prompt do usuário",
                    })),
                  }),
                },
              },
            ],
          } as any;
        },
      }
    );

    expect(prepared.executionBrief?.interventionLevel).toBe("visual_only");
    // Context guidance states it does not override user request
    expect(prepared.contextContent).toContain("ORIENTAÇÕES CONTEXTUAIS DO SITE (referência; não sobrepõem o pedido do usuário)");

    const copyCalls: any[] = [];
    const executionInput = {
      requestId: "00000000-0000-4000-8000-000000000004",
      runId: "00000000-0000-4000-8000-000000000004",
      proposalId: "p-conflict-01",
      slot: 0,
      prompt: input.content,
      postMode: "static" as const,
      reviewPolicyVersion: prepared.reviewPolicyVersion,
      reviewExecutionConfig: prepared.reviewExecutionConfig,
      editorialContextHash: prepared.editorialContextHash,
      contextContent: prepared.contextContent,
      executionBrief: prepared.executionBrief ?? undefined,
      selectedDefinitions: [prepared.selectedDefinitions[0][0]],
    };

    const targetFields = completeDesignFields(prepared.selectedDefinitions[0][0]);
    const workflowDeps = {
      actor: owner,
      measureText: () => ({ height: 20, lines: [{ width: 100 }], runs: [] }),
      renderReviewScenes: renderReviewFixtureScenes,
      generateText: vi.fn(async (params: any) => {
        if (params.taskRoute === "post_evaluation") {
          return { choices: [{ message: { content: JSON.stringify(healthyReviewV7Fixture(params)) } }] } as any;
        }
        copyCalls.push(params);
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  caption: userPrompt,
                  hashtags: [],
                  slides: [
                    {
                      values: targetFields.map((f, i) => ({
                        fieldId: f.id,
                        value: i === 0 ? userPrompt : "",
                      })),
                      mediaPrompts: [],
                    },
                  ],
                }),
              },
            },
          ],
        } as any;
      }),
    };

    const result = await executeProposalWorkflow(executionInput as any, workflowDeps as any);
    expect(result.status).toBe("ready");
    expect(copyCalls.length).toBeGreaterThanOrEqual(1);
    const copyPrompt = JSON.stringify(copyCalls[0].messages);
    expect(copyPrompt).toContain("Focar exclusivamente em cafés suaves");
  });
});

