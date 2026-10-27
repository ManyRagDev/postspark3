import { describe, it, expect, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import {
  executeProposalWorkflow as executeRawProposalWorkflow,
  type ProposalExecutionInput,
  type ProposalGraphDeps,
} from "./proposalGraph";
import { proposalDeliverySchema } from "@shared/generationContracts";
import { attachFactCoverageFixture } from "./proposalReview.fixture";

import {
  attachEditorialPlanFixture,
  editorialPlanFixture,
} from "./proposalEditorial.fixture";

// Geometry/review fixtures supply the new writing contract; explicit editorial tests use raw workflow.
const executeProposalWorkflow = (
  input: ProposalExecutionInput,
  deps: ProposalGraphDeps
) =>
  executeRawProposalWorkflow(input, {
    ...deps,
    generateText: async params =>
      attachEditorialPlanFixture(
        attachFactCoverageFixture(await deps.generateText(params), params),
        input
      ),
  });

const actor = "00000000-0000-4000-8000-000000000001";
const runId = "00000000-0000-4000-8000-000000000002";
const definition = completeDesignTestDefinitions()[0];
const input: ProposalExecutionInput = {
  requestId: "req",
  runId,
  proposalId: "proposal",
  slot: 0,
  selectedDefinition: definition,
  prompt: "Evento começa às 12h",
  contextContent: "Evento começa às 12h",
};
const cleanReview = {
  outcome: "reviewed",
  reviewedSlides: [0],
  findings: [],
  limitation: "",
};
const copy = (title: string) => ({
  caption: "Legenda original",
  hashtags: ["#evento"],
  slides: [
    {
      values: [
        { fieldId: "field-0", value: title },
        { fieldId: "field-1", value: "Apoio saudável" },
      ],
      mediaPrompts: [],
    },
  ],
});
const contradiction = (observed = "Evento começa às 13h") => ({
  ...cleanReview,
  findings: [
    {
      category: "factual_contradiction",
      slideIndex: 0,
      fieldId: "field-0",
      observed,
      expected: "Evento começa às 12h",
      sourceQuote: "Evento começa às 12h",
      explanation: "Horário comprovadamente divergente",
      action: "replace_text",
    },
  ],
});
const response = (
  value: unknown,
  params?: Parameters<ProposalGraphDeps["generateText"]>[0]
) =>
  attachFactCoverageFixture(
    { choices: [{ message: { content: JSON.stringify(value) } }] } as any,
    params
  );
function deps(
  reviews: unknown[],
  titles = ["Evento começa às 13h"]
): ProposalGraphDeps {
  let reviewIndex = 0;
  let copyIndex = 0;
  return {
    actor,
    generateText: vi.fn(async params =>
      response(
        params.taskRoute === "post_evaluation"
          ? reviews[reviewIndex++]
          : copy(titles[copyIndex++]),
        params
      )
    ),
    renderReviewScenes: vi.fn(async ({ compositions }) =>
      compositions.map((_scene, slideIndex) => ({
        slideIndex,
        renderer: "CanvasPostStage" as const,
        width: 864,
        height: 1080,
        dataUri: "data:image/png;base64,aW1hZ2U=",
      }))
    ),
    measureText: params => ({
      height: params.text.includes("LONG") ? 5000 : 20,
      lines: [{ width: 100 }],
      runs: [
        {
          fill: params.fill,
          fontSize: params.fontSize,
          fontStyle: params.fontStyle,
        },
      ],
    }),
  };
}

describe("canonical proposal review gate", () => {
  it("keeps a previously purchased copy recovery in the shared recovery budget even if current fitting no longer needs it", async () => {
    const implementation = deps([contradiction()]);
    implementation.recoveryOperationKeys = async () => ["copy_recovery"];
    const result = await executeProposalWorkflow(input, implementation);
    expect(result.status).toBe("failed");
    expect(implementation.generateText).toHaveBeenCalledTimes(2); // copy + initial review, no second repair/recheck
    expect(result.reviews?.map(review => review.round)).toEqual(["initial"]);
  });

  it("reapplies a cached copy recovery without purchasing it again, but never purchases a second recovery type", async () => {
    const implementation = deps([cleanReview], ["LONG"]);
    implementation.recoveryOperationKeys = async () => ["copy_recovery"];
    const operations: string[] = [];
    implementation.executeOperation = async ({ operationKey }, work) => {
      operations.push(operationKey);
      return operationKey === "copy_recovery"
        ? response(copy("Evento começa às 12h"))
        : work();
    };
    const result = await executeProposalWorkflow(input, implementation);
    expect(result.status, result.errorReason).toBe("ready");
    expect(operations).toContain("copy_recovery");
    expect(implementation.generateText).toHaveBeenCalledTimes(2); // initial copy and review only
    const priorEditorial = deps([], ["LONG"]);
    priorEditorial.recoveryOperationKeys = async () => [
      "review_correction:already-purchased",
    ];
    const rejected = await executeProposalWorkflow(input, priorEditorial);
    expect(rejected.status).toBe("failed");
    expect(priorEditorial.generateText).toHaveBeenCalledTimes(1);
    expect(priorEditorial.renderReviewScenes).not.toHaveBeenCalled();
  });

  it("requires a validated editorial plan for fresh copy but reads historical copy journals without rebilling", async () => {
    const fresh = deps([cleanReview]);
    const rejected = await executeRawProposalWorkflow(input, fresh);
    expect(rejected.status).toBe("failed");
    expect(rejected.errorReason).toBe("editorial_plan_required");
    expect(fresh.generateText).toHaveBeenCalledTimes(1);
    expect(fresh.renderReviewScenes).not.toHaveBeenCalled();
    const legacy = deps([cleanReview]);
    legacy.executeOperation = async ({ operationKey }, work) =>
      operationKey === "copy" ? response(copy("Evento começa às 12h")) : work();
    const restored = await executeRawProposalWorkflow(input, legacy);
    expect(restored.status).toBe("ready");
    expect(legacy.generateText).toHaveBeenCalledTimes(1);
    expect(vi.mocked(legacy.generateText).mock.calls[0][0].taskRoute).toBe(
      "post_evaluation"
    );
  });

  it("repairs BizuMiner's changed name and missing differential in one durable editorial operation, preserving healthy fields and plan", async () => {
    const prompt =
      "BizuMiner verifica promoções e acompanha preços todos os dias nas grandes lojas.";
    const job = {
      ...input,
      prompt,
      contextContent: prompt,
      selectedDefinition: undefined,
      selectedDefinitions: [definition, definition, definition, definition],
      postMode: "carousel" as const,
    };
    const bad = {
      caption: "Serviço para acompanhar ofertas.",
      hashtags: ["#BizuMiner"],
      slides: [
        {
          values: [
            { fieldId: "field-0", value: "Bizu Miner" },
            { fieldId: "field-1", value: "Melhores preços online" },
          ],
          mediaPrompts: [],
        },
        {
          values: [
            { fieldId: "field-0", value: "Grandes Lojas" },
            { fieldId: "field-1", value: "Nas melhores plataformas" },
          ],
          mediaPrompts: [],
        },
        {
          values: [
            { fieldId: "field-0", value: "Preço Diário" },
            { fieldId: "field-1", value: "Monitoramento constante" },
          ],
          mediaPrompts: [],
        },
        {
          values: [
            { fieldId: "field-0", value: "Melhor Valor" },
            { fieldId: "field-1", value: "Promoção de verdade" },
          ],
          mediaPrompts: [],
        },
      ],
    };
    const plan = editorialPlanFixture(job, bad),
      initial = { ...bad, editorialPlan: plan };
    const grounded = {
      category: "fact_omission",
      slideIndex: 1,
      fieldId: "field-1",
      observed: "Nas melhores plataformas",
      expected: "Explicar a verificação de promoções",
      sourceQuote: "verifica promoções",
      explanation: "O diferencial do serviço não foi explicado na arte",
      action: "none",
    };
    let reviews = 0;
    const d = deps([]);
    d.generateText = vi.fn(async params => {
      if (params.taskRoute === "post_evaluation")
        return response(
          {
            ...cleanReview,
            reviewedSlides: [0, 1, 2, 3],
            findings: reviews++ === 0 ? [grounded] : [],
          },
          params
        );
      if (params.traceLabel?.includes("editorial_recovery"))
        return response({
          ...initial,
          caption: "Legenda adulterada",
          hashtags: ["#inventada"],
          editorialPlan: { ...plan, centralMessage: "Plano adulterado" },
          slides: initial.slides.map((slide, i) => ({
            ...slide,
            values: slide.values.map(row => ({
              fieldId: row.fieldId,
              value:
                i === 0 && row.fieldId === "field-0"
                  ? "BizuMiner"
                  : i === 1 && row.fieldId === "field-1"
                    ? "Verifica se a promoção é real."
                    : "Campo saudável adulterado",
            })),
          })),
        });
      return response(initial);
    });
    const operations: string[] = [];
    d.executeOperation = async ({ operationKey }, work) => {
      operations.push(operationKey);
      return work();
    };
    const result = await executeRawProposalWorkflow(job, d);
    expect(result.status).toBe("ready");
    expect(result.reviews?.[0].findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "entity_changed",
          authority: "source_grounded",
        }),
        expect.objectContaining({
          category: "fact_omission",
          authority: "source_grounded",
        }),
      ])
    );
    expect(result.reviews?.map(r => r.status)).toEqual([
      "correction_required",
      "passed",
    ]);
    expect(result.bundle?.caption).toBe(initial.caption);
    expect(result.bundle?.hashtags).toEqual(initial.hashtags);
    expect(JSON.stringify(result.bundle)).toContain(
      "Verifica se a promoção é real."
    );
    expect(JSON.stringify(result.bundle)).toContain("Melhores preços online");
    expect(JSON.stringify(result.bundle)).not.toContain("adulterado");
    expect(d.generateText).toHaveBeenCalledTimes(4);
    expect(
      operations.filter(key => key.startsWith("review_correction:"))
    ).toHaveLength(1);
    const checks = vi
      .mocked(d.generateText)
      .mock.calls.filter(([p]) => p.taskRoute === "post_evaluation");
    expect(JSON.stringify(checks[1][0].messages)).toContain(
      plan.centralMessage
    );
    expect(JSON.stringify(checks[1][0].messages)).not.toContain(
      "Plano adulterado"
    );
  });

  it("does not deliver cafeteria copy whose opening hours were replaced by a generic slogan after recovery", async () => {
    const prompt = "Cafeteria artesanal. Aberto das 8h às 18h.";
    const job = { ...input, prompt, contextContent: prompt };
    const candidate = copy("Café artesanal"),
      initial = {
        ...candidate,
        editorialPlan: editorialPlanFixture(job, candidate),
      };
    const loss = {
      ...cleanReview,
      findings: [
        {
          category: "fact_omission",
          slideIndex: 0,
          fieldId: "field-1",
          observed: "Apoio saudável",
          expected: "Informar o horário fornecido",
          sourceQuote: "Aberto das 8h às 18h.",
          explanation: "Horário essencial foi substituído por apoio genérico",
          action: "none",
        },
      ],
    };
    const d = deps([]);
    d.generateText = vi.fn(async params =>
      response(params.taskRoute === "post_evaluation" ? loss : initial, params)
    );
    const result = await executeRawProposalWorkflow(job, d);
    expect(result.status).toBe("failed");
    expect(result.bundle).toBeUndefined();
    expect(result.findings).toContainEqual(
      expect.objectContaining({ rule: "source_backed_fact_omission" })
    );
    expect(d.generateText).toHaveBeenCalledTimes(4);
    expect(d.renderReviewScenes).toHaveBeenCalledTimes(2);
  });

  it("delivers only after full review and records its policy/hash", async () => {
    const result = await executeProposalWorkflow(input, deps([cleanReview]));
    expect(result.status).toBe("ready");
    expect(result.reviews?.[0]).toMatchObject({
      status: "passed",
      round: "initial",
      policyVersion: 3,
      reviewedSlides: [0],
    });
    expect(
      proposalDeliverySchema.safeParse({
        ...result,
        reviews: [{ ...result.reviews![0], status: "inconclusive" }],
      }).success
    ).toBe(false);
  });

  it("repairs only corroborated text and rechecks actual rerendered scene within the single recovery cycle", async () => {
    const d = deps([contradiction(), cleanReview]);
    const completed = new Map<string, unknown>();
    d.executeOperation = vi.fn(async ({ operationKey }, work) => {
      if (completed.has(operationKey))
        return completed.get(operationKey) as any;
      const value = await work();
      completed.set(operationKey, value);
      return value;
    });
    const first = await executeProposalWorkflow(input, d);
    expect(first.status).toBe("ready");
    expect(first.reviews?.map(review => review.status)).toEqual([
      "correction_required",
      "passed",
    ]);
    expect(first.bundle?.caption).toBe("Legenda original");
    expect(first.bundle?.hashtags).toEqual(["#evento"]);
    expect(first.bundle?.slides[0].composition.content.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "field-0",
          text: "Evento começa às 12h",
        }),
        expect.objectContaining({ id: "field-1", text: "Apoio saudável" }),
      ])
    );
    expect(first.bundle?.slides[0].composition.pieces).toEqual(
      definition.pieces
    );
    expect(d.renderReviewScenes).toHaveBeenCalledTimes(2);
    expect(d.generateText).toHaveBeenCalledTimes(3); // copy + two reviews, no paid rewrite
    const calls = vi.mocked(d.renderReviewScenes!).mock.calls;
    expect(JSON.stringify(calls[0][0].compositions)).toContain("13h");
    expect(JSON.stringify(calls[1][0].compositions)).toContain("12h");
    const retried = await executeProposalWorkflow(input, d);
    expect(retried.status).toBe("ready");
    expect(d.generateText).toHaveBeenCalledTimes(3);
    expect(
      [...completed.keys()].filter(key => key.startsWith("review:")).length
    ).toBe(2);
    expect(
      [...completed.keys()].filter(key => key.startsWith("review_correction:"))
        .length
    ).toBe(1);
  });

  it("does not consume a second correction after overflow recovery", async () => {
    const d = deps([contradiction()], ["LONG", "Evento começa às 13h"]);
    const checkpoint = vi.fn(async () => undefined);
    d.checkpoint = checkpoint;
    const result = await executeProposalWorkflow(input, d);
    expect(result.status).toBe("failed");
    expect(result.errorReason).toContain("limite único");
    expect(d.generateText).toHaveBeenCalledTimes(3); // initial copy, overflow repair, review
    expect(d.renderReviewScenes).toHaveBeenCalledTimes(1);
    expect(checkpoint).not.toHaveBeenCalledWith(
      "recovering",
      expect.objectContaining({ reason: "corroborated_review_correction" })
    );
  });

  it("does not deliver an inconclusive recheck or schedule another recovery", async () => {
    const d = deps([
      contradiction(),
      {
        ...cleanReview,
        outcome: "inconclusive",
        limitation: "Não consegui ler o novo título",
      },
    ]);
    const result = await executeProposalWorkflow(input, d);
    expect(result.status).toBe("failed");
    expect(result.bundle).toBeUndefined();
    expect(result.reviews?.at(-1)?.status).toBe("inconclusive");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "review_inconclusive" })
    );
    expect(d.generateText).toHaveBeenCalledTimes(3);
  });

  it("preserves authored scenes when the reviewer dislikes them", async () => {
    const d = deps([
      {
        ...contradiction(),
        findings: contradiction().findings.map(f => ({
          ...f,
          category: "aesthetic",
          explanation: "Não parece premium",
        })),
      },
    ]);
    const result = await executeProposalWorkflow(input, d);
    expect(result.status).toBe("ready");
    expect(result.bundle?.slides[0].composition.pieces).toEqual(
      definition.pieces
    );
    expect(
      JSON.stringify(result.bundle?.slides[0].composition.content)
    ).toContain("13h");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "review_aesthetic" })
    );
    expect(d.generateText).toHaveBeenCalledTimes(2);
  });

  it("reviews every carousel slide in one call and fails incomplete sequence coverage", async () => {
    const definitions = [definition, definition, definition];
    const d = deps([cleanReview]);
    d.generateText = vi.fn(async params =>
      response(
        params.taskRoute === "post_evaluation"
          ? cleanReview
          : {
              ...copy("Título"),
              slides: definitions.map(() => copy("Título").slides[0]),
            }
      )
    );
    const result = await executeProposalWorkflow(
      {
        ...input,
        selectedDefinition: undefined,
        selectedDefinitions: definitions,
        postMode: "carousel",
      },
      d
    );
    expect(result.status).toBe("failed");
    expect(result.reviews?.[0]?.status).toBe("inconclusive");
    const evaluation = vi
      .mocked(d.generateText)
      .mock.calls.find(
        ([params]) => params.taskRoute === "post_evaluation"
      )![0];
    expect(evaluation.messages[1].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text", text: "Slide 0 (864x1080)" }),
        expect.objectContaining({ type: "text", text: "Slide 1 (864x1080)" }),
        expect.objectContaining({ type: "text", text: "Slide 2 (864x1080)" }),
      ])
    );
  });

  it("preserves visual_only source order on canvas, even when response values are returned in reverse order", async () => {
    const d = deps([cleanReview]);
    d.generateText = vi.fn(async params =>
      response(
        params.taskRoute === "post_evaluation"
          ? cleanReview
          : {
              caption: "Café artesanal. Visite hoje.",
              hashtags: [],
              slides: [
                {
                  values: [
                    { fieldId: "field-1", value: "Visite hoje." },
                    { fieldId: "field-0", value: "Café artesanal." },
                  ],
                  mediaPrompts: [],
                },
              ],
            }
      )
    );
    const result = await executeProposalWorkflow(
      {
        ...input,
        executionBrief: {
          interventionLevel: "visual_only",
          rawInput: "Café artesanal.\n\nVisite hoje.",
          mustKeep: [],
          mustInclude: [],
          forbiddenTerms: [],
        } as any,
      },
      d
    );
    expect(result.status).toBe("ready");
    expect(result.bundle?.caption).toBe("Café artesanal. Visite hoje.");
    expect(result.bundle?.slides[0].composition.pieces).toEqual(
      definition.pieces
    );
  });

  it.each([
    { title: "Texto reescrito", support: "", caption: "Café artesanal." },
    { title: "Café artesanal.", support: "Oferta inventada", caption: "" },
    { title: "Café artesanal.", support: "", caption: "Legenda nova" },
    {
      title: "Café artesanal.",
      support: "",
      caption: "",
      hashtags: ["#promoção"],
    },
  ])(
    "rejects visual_only expansion before media/review: %j",
    async candidate => {
      const d = deps([cleanReview]);
      d.generateText = vi.fn(async () =>
        response({
          caption: candidate.caption,
          hashtags: candidate.hashtags ?? [],
          slides: [
            {
              values: [
                { fieldId: "field-0", value: candidate.title },
                { fieldId: "field-1", value: candidate.support },
              ],
              mediaPrompts: [],
            },
          ],
        })
      );
      const result = await executeProposalWorkflow(
        {
          ...input,
          executionBrief: {
            interventionLevel: "visual_only",
            rawInput: "Café artesanal.",
            mustKeep: [],
            mustInclude: [],
            forbiddenTerms: [],
          } as any,
        },
        d
      );
      expect(result.status).toBe("failed");
      expect(result.errorReason).toContain("visual_only_");
      expect(d.generateText).toHaveBeenCalledTimes(1);
      expect(d.renderReviewScenes).not.toHaveBeenCalled();
    }
  );

  it("does not rewrite a visual_only source to fix overflow", async () => {
    const d = deps([cleanReview]);
    d.generateText = vi.fn(async () =>
      response({
        ...copy("LONG"),
        caption: "",
        hashtags: [],
        slides: [
          {
            values: [
              { fieldId: "field-0", value: "LONG" },
              { fieldId: "field-1", value: "" },
            ],
            mediaPrompts: [],
          },
        ],
      })
    );
    const result = await executeProposalWorkflow(
      {
        ...input,
        executionBrief: {
          interventionLevel: "visual_only",
          rawInput: "LONG",
          mustKeep: [],
          mustInclude: [],
          forbiddenTerms: [],
        } as any,
      },
      d
    );
    expect(result.status).toBe("failed");
    expect(result.findings.some(f => f.rule === "overflow")).toBe(true);
    expect(d.generateText).toHaveBeenCalledTimes(1);
    expect(d.renderReviewScenes).not.toHaveBeenCalled();
  });

  it.each([
    { mustKeep: ["Literal obrigatório"], mustInclude: [], forbiddenTerms: [] },
    {
      mustKeep: [],
      mustInclude: ["Outro requisito literal"],
      forbiddenTerms: [],
    },
    { mustKeep: [], mustInclude: [], forbiddenTerms: ["13h"] },
  ])(
    "keeps deterministic brief constraints authoritative before paid media/review: %j",
    async constraints => {
      const d = deps([cleanReview]);
      const result = await executeProposalWorkflow(
        {
          ...input,
          executionBrief: {
            interventionLevel: "light_optimize",
            rawInput: input.prompt,
            ...constraints,
          } as any,
        },
        d
      );
      expect(result.status).toBe("failed");
      expect(result.errorReason).toContain(
        "execution_brief_constraints_failed"
      );
      expect(d.generateText).toHaveBeenCalledTimes(1);
      expect(d.renderReviewScenes).not.toHaveBeenCalled();
    }
  );
});
