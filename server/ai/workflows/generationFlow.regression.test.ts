import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { proposalDeliverySchema } from "@shared/generationContracts";
import { compactComponentCard } from "@shared/componentAssembly";
import { defaultStudioPreferences } from "@shared/studioPreferences";
import {
  executeClaimedGeneration,
  requestInputHash,
  loadGenerationContext,
  loadGenerationSources,
} from "./generationRuntime";
import {
  prepareOrchestratedGeneration,
  verifyPreparedEligibility,
} from "./generationPreparation";
import { GenerationCoordinator } from "./generationCoordinator";
import { electionCatalogFixture } from "../../designCatalog/designElection.fixture";
import { authorCarouselVisualVariant } from "../../designCatalog/carouselVisualVariants";
import { reconcileCatalogCoverage } from "../../designCatalog/catalogCoverage";
import { shortlistCompleteDesigns } from "../../designCatalog/designShortlist";
import { healthyReviewV8Fixture } from "./proposalReviewV8.fixture";
import {
  healthyReviewV7Fixture,
  reviewPayloadV7,
} from "./proposalReviewV7.fixture";
import { resolvedEditorialContext } from "./editorialContextV8";
import { invokeLLM } from "../../_core/llm";
import { scrapeUrl } from "../../siteContent";
import { loadSiteIntelligence } from "../../siteIntelligence";
import { getBrandProjectById } from "../../db";

vi.mock("../../_core/llm", async original => ({
  ...(await original()),
  invokeLLM: vi.fn(),
}));
vi.mock("../../siteContent", () => ({ scrapeUrl: vi.fn() }));
vi.mock("../../siteIntelligence", () => ({ loadSiteIntelligence: vi.fn() }));
vi.mock("../../db", async original => ({
  ...(await original()),
  getBrandProjectById: vi.fn(),
}));
vi.mock("../../ai/localDiagnostics", async original => ({
  ...(await original()),
  localDiagnosticsEnabled: () => false,
}));

const owner = "00000000-0000-4000-8000-000000000001";
const requestId = "00000000-0000-4000-8000-000000000002";
const sourceFact = "FATO_EXCLUSIVO_ARTIGO: atendimento aos domingos.";
const projectFact =
  "FATO_EXCLUSIVO_PROJETO: atendimento apenas por agendamento.";
const forbidden = "PROMESSA_PROIBIDA_731";
const dossier = `# DOSSIÊ DE MARCA: Projeto Geral\n## DIFERENCIAIS FACTUAIS\n${projectFact}\n## POSTURA E TOM DE VOZ\nTOM_EXCLUSIVO_731\n## PÚBLICO-ALVO\nPUBLICO_EXCLUSIVO_731\n## CHAMADA PARA AÇÃO (CTA PADRÃO)\nCTA_EXCLUSIVO_731\n## TERMOS E ABORDAGENS PROIBIDAS\n- ${forbidden}`;
const snapshot = {
  version: 1,
  name: "Projeto Geral",
  niche: "Serviços",
  structuredData: {
    factualDifferentials: projectFact,
    voiceTone: "TOM_EXCLUSIVO_731",
    targetAudience: "PUBLICO_EXCLUSIVO_731",
    defaultCta: "CTA_EXCLUSIVO_731",
    forbiddenTerms: forbidden,
  },
};
const reports: any[] = [];
const reply = (data: any) => ({
  choices: [
    { message: { content: JSON.stringify(data) }, finish_reason: "stop" },
  ],
});
let serial = 0;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(scrapeUrl).mockResolvedValue({
    url: "https://source.example.test/article",
    title: "Artigo independente",
    description: "Fonte do pedido",
    content: sourceFact,
  });
  vi.mocked(loadSiteIntelligence).mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000003",
    sourceUrl: "https://brand.example.test",
    fingerprint: "audit",
    evidence: [
      {
        id: "e1",
        kind: "body",
        sourceUrl: "https://brand.example.test",
        text: "FATO_EXCLUSIVO_SNAPSHOT_SITE",
      },
    ],
  } as any);
  vi.mocked(getBrandProjectById).mockResolvedValue({
    compiled_document: dossier,
  } as any);
});

function makeInput(overrides: any = {}) {
  const mode = overrides.postMode ?? "static";
  const platform = overrides.platform ?? "instagram";
  const creationMode = overrides.creationMode ?? "ideation";
  const brief =
    creationMode === "execution"
      ? {
          creationMode: "execution",
          format: mode,
          platform,
          objective: "educate",
          interventionLevel: "optimize_structure",
          contentSourceType: "freeform",
          rawInput: "PEDIDO_EXCLUSIVO_731: apresente uma orientação.",
          ...overrides.executionBrief,
        }
      : undefined;
  return orchestratedGenerationInputSchema.parse({
    ownerId: owner,
    idempotencyKey: "audit-" + ++serial,
    inputType: "text",
    content: "PEDIDO_EXCLUSIVO_731: apresente uma orientação.",
    platform,
    postMode: mode,
    slideCount: mode === "carousel" ? 3 : undefined,
    creationMode,
    ...overrides,
    executionBrief: brief ?? overrides.executionBrief,
  });
}

function setup(input: any, options: any = {}) {
  const base = electionCatalogFixture(options.catalogCount ?? 4).definitions;
  const definitions =
    input.postMode === "carousel"
      ? base.flatMap(d => [
          d,
          authorCarouselVisualVariant(
            d,
            "development",
            input.executionBrief?.interventionLevel !== "visual_only"
          ),
          authorCarouselVisualVariant(
            d,
            "closing",
            input.executionBrief?.interventionLevel !== "visual_only"
          ),
        ])
      : base;
  const inventory = {
    registered: definitions.map(d => ({
      id: d.id,
      definition_hash: d.hash,
      status: "approved",
      aspect_ratios: d.aspectRatios,
      roles: d.roles,
      source: d.source,
      design: d.completeDesign!,
    })),
    indexed: definitions.map(d => ({
      component_id: d.id,
      definition_hash: d.hash,
      card: compactComponentCard(d),
    })),
  };
  let record: any = {
    id: requestId,
    ownerId: owner,
    input,
    inputHash: requestInputHash(input),
    status: "running",
    experimental: false,
    deadlineAt: Date.now() + 60000,
    billingMode: "dev_pilot",
    proposals: [0, 1, 2].map(slot =>
      proposalDeliverySchema.parse({
        proposalId: `p-${requestId}-${slot}`,
        runId: requestId,
        slot,
        status: "planned",
      })
    ),
  };
  const journal = new Map<string, any>();
  const calls: any[] = [];
  const checkpoints: any[] = [];
  const completed = new Map<string, number>();
  const store: any = {
    get: vi.fn(async () => record),
    heartbeat: vi.fn(async () => record),
    savePrepared: vi.fn(
      async (_id: any, _lease: any, prepared: any) =>
        (record = { ...record, prepared })
    ),
    listOperations: vi.fn(async () =>
      Array.from(journal, ([operationKey, value]) => ({
        operationKey,
        ...value,
      }))
    ),
    recentSelections: vi.fn(async () => []),
    beginOperation: vi.fn(async (_id: any, _lease: any, key: string) => {
      const saved = journal.get(key);
      if (saved) return saved;
      journal.set(key, { state: "started" });
      return { state: "new" };
    }),
    persistOperationResult: vi.fn(
      async (_id: any, _lease: any, key: string, result: any) => {
        journal.set(key, { state: "completed", result });
        completed.set(key, (completed.get(key) ?? 0) + 1);
        options.afterPersist?.(key);
      }
    ),
    markOperationUncertain: vi.fn(
      async (_id: any, _lease: any, key: string) => {
        if (journal.get(key)?.state !== "completed")
          journal.set(key, { state: "uncertain" });
      }
    ),
    checkpointProposal: vi.fn(async (_id: any, _lease: any, delivery: any) => {
      checkpoints.push(delivery);
      record = {
        ...record,
        proposals: record.proposals.map((p: any) =>
          p.slot === delivery.slot ? delivery : p
        ),
      };
      return record;
    }),
    commitDelivery: vi.fn(async (_id: any, _lease: any, delivery: any) => {
      record = {
        ...record,
        proposals: record.proposals.map((p: any) =>
          p.slot === delivery.slot ? delivery : p
        ),
      };
      return record;
    }),
    finish: vi.fn(
      async (_id: any, _lease: any, status: any, errorReason: any) =>
        (record = { ...record, status, errorReason })
    ),
  };
  let reviewCount = 0,
    copySequence = 0;
  const generated = async (p: any) => {
    calls.push(p);
    if (p.traceLabel === "generation_source_reading")
      return reply({
        extractedText: "FATO_EXCLUSIVO_IMAGEM: aberto aos domingos",
        facts: ["Aberto aos domingos"],
        uncertainties: [],
      });
    if (p.traceLabel.startsWith("generation_selection")) {
      const data = JSON.parse(
          typeof p.messages[1].content === "string"
            ? p.messages[1].content
            : p.messages[1].content.find((c: any) => c.type === "text").text
        ),
        modern = p.traceLabel.endsWith("v3");
      return reply({
        version: modern ? 3 : 2,
        options: data.catalog.slice(0, 3).map((o: any, i: number) => ({
          offerId: o.offerId,
          reason: "Adequação visual " + i,
          ...(modern &&
          input.executionBrief?.interventionLevel !== "visual_only"
            ? { editorialApproach: "RECORTE_" + i }
            : {}),
        })),
      });
    }
    if (p.taskRoute === "post_evaluation") {
      reviewCount++;
      const data = reviewPayloadV7(p);
      if (options.reviewFault) {
        const fault = options.reviewFault(p, data, reviewCount);
        if (fault) return fault;
      }
      return reply(
        ["proposal_review_v8", "proposal_review_v9"].includes(
          p.response_format.json_schema.name
        )
          ? healthyReviewV8Fixture(p)
          : healthyReviewV7Fixture(p)
      );
    }
    const literal = input.executionBrief?.interventionLevel === "visual_only";
    const title = options.layoutFault
      ? p.traceLabel.endsWith("_copy")
        ? ++copySequence <= 3 * (options.layoutFaultDepth ?? 1)
          ? "BAD_OVERFLOW"
          : "Uma orientação"
        : "BAD_OVERFLOW"
      : (options.badCopy ??
        (literal ? input.executionBrief.rawInput : "Uma orientação"));
    const user = p.messages.find((m: any) => m.role === "user").content;
    const marker = "Condições de composição dos templates reais:\n";
    const schemas =
      typeof user === "string" && user.includes(marker)
        ? JSON.parse(user.split(marker)[1].split("\n")[0])
        : undefined;
    return reply({
      caption: "",
      hashtags: [],
      slides: schemas
        ? schemas.map((s: any, slideIndex: number) => ({
            values: s.fields.map((f: any, i: number) => ({
              fieldId: f.id,
              value:
                i === 0
                  ? literal && input.executionBrief?.slides?.length
                    ? (input.executionBrief.slides[slideIndex]?.rawText ?? "")
                    : title
                  : "",
            })),
            mediaPrompts: [],
          }))
        : Array.from(
            { length: input.postMode === "carousel" ? input.slideCount : 1 },
            () => ({
              values: [
                { fieldId: "field-0", value: title },
                { fieldId: "field-1", value: "" },
              ],
              mediaPrompts: [],
            })
          ),
    });
  };
  vi.mocked(invokeLLM).mockImplementation(generated as any);
  const prepare = vi.fn(async (i: any, o: any, e: any, d: any, provided: any) =>
    prepareOrchestratedGeneration(i, o, e, d, {
      ...provided,
      preferences: async () => defaultStudioPreferences,
      retrieve: async (req: any) => reconcileCatalogCoverage(req, inventory),
      hydrate: async (ids: string[]) =>
        definitions.filter(d => ids.includes(d.id)),
      shortlist: (req: any) =>
        shortlistCompleteDesigns(req, async (r: any) => ({
          id: "audit-jev",
          model: r.model,
          answers: Object.fromEntries(
            Object.keys(r.questions).map(k => [
              k,
              { type: "score", score: 4, confidence: 1 },
            ])
          ),
          usage: { input_tokens: 1, output_tokens: 1, cost: 0 },
        })),
    })
  );
  const run = (shutdownSignal?: AbortSignal) =>
    executeClaimedGeneration(record, "audit-lease", {
      shutdownSignal,
      store,
      prepare,
      verifyPrepared: (p: any, e: any) =>
        verifyPreparedEligibility(p, e, async ids =>
          definitions.filter(d => ids.includes(d.id))
        ),
      loadContext: loadGenerationSources,
      loadTraceCalls: async () => [],
      persistTrace: async () => {},
      graphDeps: {
        generateText: generated,
        measureText: (value: any) => ({
          height:
            options.layoutFault && String(value.text).includes("BAD_OVERFLOW")
              ? 10000
              : 20,
          lines: [{ width: 100 }],
          runs: [],
        }),
        renderReviewScenes: async ({ compositions }: any) => {
          options.advanceClock?.();
          return compositions.map((_: any, slideIndex: number) => ({
            slideIndex,
            renderer: "CanvasPostStage",
            width: 864,
            height: 1080,
            dataUri: "data:image/png;base64,YXVkaXQ=",
          }));
        },
      },
    });
  return {
    run,
    record: () => record,
    calls,
    journal,
    prepare,
    store,
    definitions,
    checkpoints,
    completed,
  };
}

describe("Generation journey regressions", () => {
  for (const platform of ["instagram", "linkedin", "twitter", "facebook"])
    for (const mode of ["static", "carousel"])
      for (const type of ["text", "url", "image"])
        for (const creationMode of ["ideation", "execution"]) {
          it(`runtime matrix ${platform}/${mode}/${type}/${creationMode}`, async () => {
            const image = type === "image";
            const input = makeInput({
              platform,
              postMode: mode,
              inputType: type,
              creationMode,
              content:
                type === "url"
                  ? "https://source.example.test/article"
                  : image
                    ? "Use a informação da imagem; sem fotos na arte."
                    : "PEDIDO_EXCLUSIVO_731: apresente uma orientação.",
              ...(image
                ? {
                    imageUrl:
                      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
                  }
                : {}),
            });
            const s = setup(input);
            const result = await s.run();
            const writer = s.calls.filter(p => p.traceLabel.endsWith("_copy"));
            const reviews = s.calls.filter(
              p => p.taskRoute === "post_evaluation"
            );
            reports.push({
              case: `${mode}/${type}/${creationMode}`,
              status: result.overallStatus,
              proposals: result.proposals.map((p: any) => ({
                status: p.status,
                failure: p.failure,
              })),
              selection: s.calls.filter(p =>
                p.traceLabel.startsWith("generation_selection")
              ).length,
              copy: writer.length,
              review: reviews.length,
              pixelsInWriter: writer.some(p =>
                p.messages.some(
                  (m: any) =>
                    Array.isArray(m.content) &&
                    m.content.some((c: any) => c.type === "image_url")
                )
              ),
              articleInWriter: writer.some(p =>
                JSON.stringify(p.messages).includes(sourceFact)
              ),
              alternatives: s.record().prepared?.alternativeDefinitions ?? null,
            });
            expect(result.overallStatus).toBe("completed");
            expect(writer).toHaveLength(3);
            expect(reviews).toHaveLength(3);
            expect(s.prepare).toHaveBeenCalledTimes(1);
            if (image) {
              expect(
                s.calls.filter(
                  p => p.traceLabel === "generation_source_reading"
                )
              ).toHaveLength(1);
              expect(
                writer.every(p =>
                  JSON.stringify(p.messages).includes("FATO_EXCLUSIVO_IMAGEM")
                )
              ).toBe(true);
              expect(
                reviews.every(p =>
                  p.messages.some(
                    (m: any) =>
                      Array.isArray(m.content) &&
                      m.content.some(
                        (c: any) =>
                          c.type === "image_url" &&
                          c.image_url.url === input.imageUrl
                      )
                  )
                )
              ).toBe(true);
            }
            const before = s.calls.length,
              ready = JSON.stringify(s.record().proposals);
            await s.run();
            expect(s.calls).toHaveLength(before);
            expect(JSON.stringify(s.record().proposals)).toBe(ready);
          });
        }

  for (const context of [
    "none",
    "dossier",
    "snapshot",
    "remote_project",
    "site_snapshot",
  ]) {
    it(`explicit article source with ${context}`, async () => {
      const extra =
        context === "dossier"
          ? { projectDossier: dossier }
          : context === "snapshot"
            ? { projectSnapshot: snapshot }
            : context === "remote_project"
              ? { projectId: "project-731" }
              : context === "site_snapshot"
                ? { siteIntelligenceId: "00000000-0000-4000-8000-000000000003" }
                : {};
      const input = makeInput({
        inputType: "url",
        content: "https://source.example.test/article",
        ...extra,
      });
      const s = setup(input);
      const result = await s.run();
      reports.push({
        case: `article+${context}`,
        status: result.overallStatus,
        scraperCalls: vi.mocked(scrapeUrl).mock.calls.length,
        articleInPrepared: s
          .record()
          .prepared.contextContent.includes(sourceFact),
        articleInWriter: s.calls.some(
          p =>
            p.traceLabel.endsWith("_copy") &&
            JSON.stringify(p.messages).includes(sourceFact)
        ),
        contextInPrepared:
          s.record().prepared.contextContent.includes("PROJETO") ||
          s.record().prepared.contextContent.includes("SNAPSHOT_SITE"),
      });
      expect(result.overallStatus).toBe("completed");
      expect(scrapeUrl).toHaveBeenCalled();
      expect(s.record().prepared.contextContent).toContain(sourceFact);
    });
  }

  for (const platform of ["instagram", "linkedin", "facebook", "twitter"]) {
    it(`project restrictions on ${platform}`, async () => {
      const s = setup(
        makeInput({
          platform,
          projectDossier: dossier,
          projectSnapshot: snapshot,
        }),
        { badCopy: forbidden }
      );
      const result = await s.run(),
        prepared = s.record().prepared;
      const contexts = s.calls
        .filter(p => p.taskRoute === "post_evaluation")
        .map(p => reviewPayloadV7(p).context);
      reports.push({
        case: `platform/${platform}`,
        status: result.overallStatus,
        policy: prepared.reviewPolicyVersion,
        guidance: prepared.reviewExecutionConfig.editorialGuidanceVersion,
        preparedRequirements: prepared.editorialContext
          ? resolvedEditorialContext(
              prepared.editorialContext
            ).requirements.map((r: any) => r.value)
          : [],
        reviewRequirements: contexts.flatMap((c: any) =>
          c.requirements.map((r: any) => r.value)
        ),
        proposals: result.proposals.map((p: any) => ({
          status: p.status,
          failure: p.failure,
        })),
        forbiddenReachedDelivery: result.proposals.some(
          (p: any) =>
            p.status === "ready" && JSON.stringify(p.bundle).includes(forbidden)
        ),
      });
      if (platform === "instagram")
        expect(result.proposals.every((p: any) => p.status === "failed")).toBe(
          true
        );
      else
        expect(result.proposals.every((p: any) => p.status === "failed")).toBe(
          true
        );
    });
  }

  for (const platform of ["instagram", "linkedin", "twitter", "facebook"])
    for (const postMode of ["static", "carousel"])
      for (const interventionLevel of [
        "visual_only",
        "light_optimize",
        "optimize_structure",
      ]) {
        it(`explicit intervention ${platform}/${postMode}/${interventionLevel}`, async () => {
          const s = setup(
            makeInput({
              platform,
              postMode,
              creationMode: "execution",
              executionBrief: {
                interventionLevel,
                ...(interventionLevel === "visual_only" &&
                postMode === "carousel"
                  ? {
                      rawInput:
                        "Primeira página. Segunda página. Terceira página.",
                      slides: [
                        { slideNumber: 1, rawText: "Primeira página." },
                        { slideNumber: 2, rawText: "Segunda página." },
                        { slideNumber: 3, rawText: "Terceira página." },
                      ],
                    }
                  : {}),
              },
            })
          );
          const r = await s.run();
          reports.push({
            case: `intervention/${interventionLevel}`,
            status: r.overallStatus,
            reviews: s.calls.filter(p => p.taskRoute === "post_evaluation")
              .length,
          });
          expect(r.overallStatus, JSON.stringify(r.proposals)).toBe(
            "completed"
          );
        });
      }

  for (const representation of ["headings", "structured_snapshot"]) {
    it(`guidance cannot certify facts: ${representation}`, async () => {
      const guidance = "Entrega garantida";
      const extra =
        representation === "headings"
          ? {
              projectDossier: `# DOSSIÊ DE MARCA: Projeto Geral\n## DIFERENCIAIS FACTUAIS\nAtendimento por agendamento.\n## CHAMADA PARA AÇÃO (CTA PADRÃO)\n${guidance}`,
            }
          : {
              projectSnapshot: {
                ...snapshot,
                structuredData: {
                  defaultCta: guidance,
                  factualDifferentials: "Atendimento por agendamento.",
                },
              },
            };
      const s = setup(makeInput(extra), {
        badCopy: guidance,
        reviewFault: (p: any, data: any) => {
          const response = healthyReviewV8Fixture(p),
            unit = data.textUnits.find((u: any) => u.fieldId === "field-0");
          const check = response.factualAudit.units.find(
            (u: any) => u.unitId === unit.id
          );
          check.classification = "factual";
          check.claimIds = ["claim"];
          response.factualAudit.claims = [
            {
              id: "claim",
              unitId: unit.id,
              observed: unit.text,
              sources: [data.context.instructions.callToAction],
              status: "supported",
              explanation:
                "Parecer controlado: cita exclusivamente uma orientação de CTA.",
            },
          ];
          return reply(response);
        },
      });
      const r = await s.run();
      reports.push({
        case: `guidance/${representation}`,
        status: r.overallStatus,
        guidanceRanges: s.record().prepared.editorialContext.guidanceRanges,
        failures: r.proposals.map((p: any) => p.failure),
      });
      expect(r.overallStatus).toBe("failed");
    });
  }

  it("an explicit art requirement is enforced even if the reviewer would approve", async () => {
    const s = setup(
      makeInput({
        creationMode: "execution",
        executionBrief: {
          contentRequirements: [
            { kind: "literal", value: "CONDICAO_EXCLUSIVA_731", scope: "art" },
          ],
        },
      })
    );
    const r = await s.run();
    reports.push({
      case: "explicit-art-requirement",
      status: r.overallStatus,
      failures: r.proposals.map((p: any) => p.failure),
      reviews: s.calls.filter(p => p.taskRoute === "post_evaluation").length,
    });
    expect(
      r.proposals.every(
        (p: any) => p.failure?.code === "content_requirement_unmet"
      )
    ).toBe(true);
  });

  it("interruption reuses preparation and completed copies without resetting operations", async () => {
    const shutdown = new AbortController();
    let stopped = false;
    const s = setup(makeInput({ projectDossier: dossier }), {
      afterPersist: (key: string) => {
        if (!stopped && key.endsWith(":copy")) {
          stopped = true;
          shutdown.abort();
        }
      },
    });
    await expect(s.run(shutdown.signal)).rejects.toThrow(
      "local_executor_shutdown"
    );
    const copyCallsBefore = s.calls.filter(p =>
      p.traceLabel.endsWith("_copy")
    ).length;
    const beforePrepared = s.record().prepared;
    const r = await s.run();
    reports.push({
      case: "interrupted-resume",
      status: r.overallStatus,
      prepareCalls: s.prepare.mock.calls.length,
      copyCallsBefore,
      copyCallsAfter: s.calls.filter(p => p.traceLabel.endsWith("_copy"))
        .length,
      preparedIdentityPreserved: beforePrepared === s.record().prepared,
      maxCommitsPerOperation: Math.max(...s.completed.values()),
    });
    expect(r.overallStatus).toBe("completed");
    expect(s.prepare).toHaveBeenCalledTimes(1);
    expect(Math.max(...s.completed.values())).toBe(1);
    expect(s.calls.filter(p => p.traceLabel.endsWith("_copy"))).toHaveLength(3);
  });

  it("a missing or invalid review cannot become ready", async () => {
    const s = setup(makeInput(), { reviewFault: () => reply({}) });
    const r = await s.run();
    reports.push({
      case: "invalid-review",
      status: r.overallStatus,
      reviewCalls: s.calls.filter(p => p.taskRoute === "post_evaluation")
        .length,
      states: Array.from(s.journal.values()).map((o: any) => o.state),
      failures: r.proposals.map((p: any) => p.failure),
    });
    expect(r.proposals.every((p: any) => p.status === "failed")).toBe(true);
    expect(s.calls.filter(p => p.taskRoute === "post_evaluation")).toHaveLength(
      6
    );
  });

  it("review timeout awaits reconciliation without repeating paid work", async () => {
    const timeout = Object.assign(new Error("LLM request deadline exceeded"), {
      name: "LlmDeadlineExceededError",
    });
    const s = setup(makeInput(), {
      reviewFault: () => {
        throw timeout;
      },
    });
    const r = await s.run();
    const before = s.calls.length;
    await s.run();
    reports.push({
      case: "review-timeout",
      status: r.overallStatus,
      uncertain: Array.from(s.journal)
        .filter(([k, v]) => v.state === "uncertain")
        .map(([k]) => k),
      additionalCalls: s.calls.length - before,
      failures: r.proposals.map((p: any) => p.failure),
    });
    expect(r.overallStatus).toBe("awaiting_reconciliation");
    expect(
      r.proposals.every((p: any) => p.status === "awaiting_reconciliation")
    ).toBe(true);
    expect(s.calls).toHaveLength(before);
  });

  it("real preparation persists evaluated compatible alternatives", async () => {
    const s = setup(makeInput(), {
      catalogCount: 14,
      reviewFault: () => reply({}),
    });
    const r = await s.run();
    const copyKeys = Array.from(s.journal.keys()).filter(k =>
      k.endsWith(":copy")
    );
    reports.push({
      case: "fallback-real-preparation",
      status: r.overallStatus,
      evaluatedOffers: s.record().prepared.electionReceipt?.choices.length,
      alternatives: s.record().prepared.alternativeDefinitions ?? null,
      copyKeys,
      fallbackKeys: Array.from(s.journal.keys()).filter(k => k.includes("-fb")),
    });
    expect(s.record().prepared.alternativeDefinitions).toHaveLength(3);
    expect(
      s
        .record()
        .prepared.alternativeDefinitions.every(
          (a: any) => a.length > 0 && a.length <= 3
        )
    ).toBe(true);
    expect(copyKeys).toHaveLength(3);
  });
  it("persistent layout failure uses alternatives produced by preparation and keeps logical IDs and budgets after interruption", async () => {
    const shutdown = new AbortController();
    let stopped = false;
    const s = setup(makeInput(), {
      catalogCount: 14,
      layoutFault: true,
      afterPersist: (key: string) => {
        if (!stopped && key.includes("-fb1:copy")) {
          stopped = true;
          shutdown.abort();
        }
      },
    });
    await expect(s.run(shutdown.signal)).rejects.toThrow(
      "local_executor_shutdown"
    );
    const prepared = s.record().prepared;
    expect(
      prepared.alternativeDefinitions.every((a: any) => a.length > 0)
    ).toBe(true);
    const result = await s.run();
    expect(result.overallStatus).toBe("completed");
    expect(s.prepare).toHaveBeenCalledTimes(1);
    expect(
      result.proposals.every(
        (p: any) =>
          p.proposalId === `p-${requestId}-${p.slot}` && p.attempt.index === 1
      )
    ).toBe(true);
    const keys = Array.from(s.journal.keys());
    expect(keys.filter(k => k.endsWith(":copy"))).toHaveLength(6);
    expect(keys.filter(k => k.endsWith(":copy_recovery"))).toHaveLength(3);
    expect(Math.max(...s.completed.values())).toBe(1);
  });
  it("BizuMiner is an ordinary brand scenario and guidance cannot support a guarantee", async () => {
    const s = setup(
      makeInput({
        content:
          "Você também abre 12 abas pra comprar um fone? Sobre o cansaço de comparar modelos, preços, fretes e avaliações.",
        projectSnapshot: {
          version: 1,
          name: "BizuMiner",
          niche: "Curadoria",
          structuredData: {
            offerAndTransformation: "Curadoria para organizar a pesquisa.",
            defaultCta: "Pesquise antes de escolher.",
            forbiddenTerms: "menor preço garantido",
          },
        },
      }),
      { badCopy: "menor preço garantido" }
    );
    const result = await s.run();
    expect(
      result.proposals.every(
        (p: any) =>
          p.status === "failed" &&
          p.failure.code === "content_requirement_unmet"
      )
    ).toBe(true);
  });
  it("shares the single text recovery across successive template replacements", async () => {
    const s = setup(makeInput(), {
      catalogCount: 14,
      layoutFault: true,
      layoutFaultDepth: 2,
    });
    const result = await s.run();
    expect(result.overallStatus).toBe("completed");
    expect(result.proposals.every(p => p.attempt?.index === 2)).toBe(true);
    expect(
      Array.from(s.journal.keys()).filter(k => k.endsWith(":copy_recovery"))
    ).toHaveLength(3);
  });
  it("resumes a completed formal repair on a replacement without buying another repair", async () => {
    const shutdown = new AbortController();
    let stopped = false;
    const s = setup(makeInput(), {
      catalogCount: 14,
      layoutFault: true,
      reviewFault: (p: any) =>
        p.traceLabel.includes("evidence_repair") ? null : reply({}),
      afterPersist: (key: string) => {
        if (!stopped && key.includes("-fb1:review_evidence_repair:")) {
          stopped = true;
          shutdown.abort();
        }
      },
    });
    await expect(s.run(shutdown.signal)).rejects.toThrow(
      "local_executor_shutdown"
    );
    const result = await s.run();
    expect(result.overallStatus).toBe("completed");
    expect(
      s.calls.filter(p => p.traceLabel.includes("evidence_repair"))
    ).toHaveLength(3);
    expect(s.calls.filter(p => p.traceLabel.endsWith("_copy"))).toHaveLength(6);
  });
  it("sends an appearance reference as native pixels to selection without turning it into factual source content", async () => {
    const pixels =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
    const s = setup(
      makeInput({
        sources: [
          {
            id: "reference-1",
            kind: "image",
            purpose: "visual_reference",
            value: pixels,
          },
        ],
      })
    );
    const result = await s.run();
    expect(result.overallStatus).toBe("completed");
    expect(
      s.calls.filter(p => p.traceLabel === "generation_source_reading")
    ).toHaveLength(0);
    const selector = s.calls.find(p =>
      p.traceLabel.startsWith("generation_selection")
    );
    expect(
      selector.messages.some(
        (m: any) =>
          Array.isArray(m.content) &&
          m.content.some(
            (p: any) => p.type === "image_url" && p.image_url.url === pixels
          )
      )
    ).toBe(true);
    expect(
      s.record().prepared.sourceReferences.every((s: any) => s.kind !== "image")
    ).toBe(true);
  });
  it("shares the standard review deadline between rendering and provider transport", async () => {
    const start = Date.now();
    let now = start;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    try {
      const s = setup(makeInput(), {
        advanceClock: () => {
          now += 12000;
        },
      });
      const result = await s.run();
      expect(result.overallStatus).toBe("completed");
      const reviews = s.calls.filter(p => p.taskRoute === "post_evaluation");
      expect(Math.min(...reviews.map(p => p.deadlineMs))).toBe(start + 45000);
    } finally {
      clock.mockRestore();
    }
  });
});
