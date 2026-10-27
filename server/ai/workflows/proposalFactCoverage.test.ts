import { describe, expect, it, vi } from "vitest";
import { ENV } from "../../_core/env";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { instantiateCompleteDesign } from "@shared/completeDesignGeneration";
import { arsenalHash } from "@shared/arsenalContent";
import { resolveArsenalGeometry } from "@shared/arsenalGeometry";
import {
  proposalReviewRecordSchema,
  type ProposalFactCoverage,
} from "@shared/proposalReview";
import { inspectFactCoverage } from "./proposalFactCoverage";
import { reviewProposal, type ReviewCopy } from "./proposalReview";
import {
  renderReviewFixtureScenes,
  attachFactCoverageFixture,
} from "./proposalReview.fixture";
import { narrativePlanFixture } from "./proposalEditorial.fixture";
import type {
  ProposalExecutionInput,
  ProposalGraphDeps,
} from "./proposalGraph";
import { executeProposalWorkflow as executeRawProposalWorkflow } from "./proposalGraph";

// These workflow tests isolate factual loss; the narrative detector is tested
// independently in proposalNarrative.test.ts. Supplied fact/source decisions stay intact.
const executeProposalWorkflow = (
  input: ProposalExecutionInput,
  deps: ProposalGraphDeps
) =>
  executeRawProposalWorkflow(input, {
    ...deps,
    generateText: async params => {
      const result = await deps.generateText(params);
      if (params.taskRoute === "post_evaluation")
        return attachFactCoverageFixture(result, params);
      const data = JSON.parse(result.choices[0].message.content as string);
      if (data.editorialPlan)
        data.editorialPlan = narrativePlanFixture(
          data.editorialPlan,
          data.slides.length
        );
      return {
        ...result,
        choices: [
          {
            ...result.choices[0],
            message: {
              ...result.choices[0].message,
              content: JSON.stringify(data),
            },
          },
        ],
      };
    },
  });

const prompt =
  "Conheça o BizuMiner: uma plataforma onde você encontra os melhores preços das melhores plataformas de compra. Verificamos as promoções mas acompanhamos os preços diariamente para sempre saber quando um produto está com seu melhor valor";
const input: ProposalExecutionInput = {
  requestId: "coverage-request",
  runId: "00000000-0000-4000-8000-000000000001",
  proposalId: "coverage-proposal",
  slot: 2,
  prompt,
  contextContent: prompt,
};
const copy: ReviewCopy = {
  caption: "A legenda não é evidência na arte.",
  hashtags: ["#BizuMiner"],
  editorialPlan: {
    version: 1,
    mode: "compose",
    centralMessage: "Plataforma que verifica promoções e acompanha preços.",
    facts: [
      {
        id: "fact-1",
        sourceQuote:
          "uma plataforma onde você encontra os melhores preços das melhores plataformas de compra",
        meaning: "Reúne os melhores preços nas plataformas.",
      },
      {
        id: "fact-2",
        sourceQuote:
          "Verificamos as promoções mas acompanhamos os preços diariamente para sempre saber quando um produto está com seu melhor valor",
        meaning:
          "Verifica promoções e acompanha diariamente para identificar melhor valor.",
      },
    ],
    protectedEntities: [],
    slides: [
      { slideIndex: 0, purpose: "Apresentar", factIds: ["fact-1"] },
      { slideIndex: 1, purpose: "Comparar lojas", factIds: ["fact-1"] },
      { slideIndex: 2, purpose: "Acompanhar", factIds: ["fact-2"] },
      {
        slideIndex: 3,
        purpose: "Identificar melhor valor",
        factIds: ["fact-2"],
      },
    ],
  },
  slides: [
    {
      values: [
        { fieldId: "field-0", value: "BIZUMINER" },
        {
          fieldId: "field-1",
          value: "Sua plataforma para economizar em compras",
        },
      ],
      mediaPrompts: [],
    },
    {
      values: [
        { fieldId: "field-0", value: "MELHORES LOJAS" },
        {
          fieldId: "field-1",
          value: "Reunimos os melhores preços das plataformas",
        },
      ],
      mediaPrompts: [],
    },
    {
      values: [
        { fieldId: "field-0", value: "CONTROLE DIÁRIO" },
        { fieldId: "field-1", value: "Acompanhamos os preços todos os dias" },
      ],
      mediaPrompts: [],
    },
    {
      values: [
        { fieldId: "field-0", value: "MELHOR VALOR" },
        { fieldId: "field-1", value: "Saiba a hora certa da promoção real" },
      ],
      mediaPrompts: [],
    },
  ],
};
const definitions = copy.slides.map(() => completeDesignTestDefinitions()[0]);
const measureText = (params: any) => ({
  height: 20,
  lines: [{ width: 80 }],
  runs: [
    {
      fill: params.fill,
      fontSize: params.fontSize,
      fontStyle: params.fontStyle,
    },
  ],
});
const scenes = (candidate = copy) =>
  candidate.slides.map((slide, i) =>
    resolveArsenalGeometry(
      instantiateCompleteDesign({
        definition: definitions[i],
        values: slide.values,
        mediaPrompts: [],
        runId: input.runId!,
        slot: 2,
        slide: i,
        planHash: "a".repeat(64),
        experimental: true,
      }),
      { measureText }
    )
  );
const covered: ProposalFactCoverage[] = [
  {
    factId: "fact-1",
    status: "covered",
    evidence: [
      {
        slideIndex: 1,
        fieldId: "field-1",
        quote: "Reunimos os melhores preços das plataformas",
      },
    ],
    missingSourceQuote: "",
    explanation: "Reúne preços entre plataformas.",
  },
  {
    factId: "fact-2",
    status: "covered",
    evidence: [
      {
        slideIndex: 2,
        fieldId: "field-1",
        quote: "Acompanhamos os preços todos os dias",
      },
    ],
    missingSourceQuote: "",
    explanation:
      "Fixture of a detector's semantic assertion, not independent proof.",
  },
];
const partial: ProposalFactCoverage[] = [
  covered[0],
  {
    ...covered[1],
    status: "partial",
    missingSourceQuote: "Verificamos as promoções",
    explanation:
      "Acompanhamento diário aparece; verificação não foi comunicada.",
  },
];
// Existing tests exercise plan coverage; provide an explicit matching detector
// fixture for the separate source audit. It is not a semantic model benchmark.
const reply = (value: any) => {
  if (value.factCoverage && value.sourceCoverage === undefined)
    value = {
      ...value,
      sourceCoverage: value.factCoverage.map((row: ProposalFactCoverage) => {
        const fact = copy.editorialPlan!.facts.find(f => f.id === row.factId)!;
        return { ...row, sourceQuote: fact.sourceQuote, meaning: fact.meaning };
      }),
    };
  return { choices: [{ message: { content: JSON.stringify(value) } }] } as any;
};
const clean = {
  outcome: "reviewed",
  reviewedSlides: [0, 1, 2, 3],
  findings: [],
  limitation: "",
};
const deps = (response: unknown): ProposalGraphDeps => ({
  actor: "00000000-0000-4000-8000-000000000001",
  generateText: vi.fn(async () => reply(response)),
  renderReviewScenes: renderReviewFixtureScenes,
});

describe("explicit fact coverage in the existing multimodal review", () => {
  it("reproduces the real BizuMiner empty-findings reply and refuses to infer coverage", async () => {
    const d = deps(clean);
    const result = await reviewProposal(
      input,
      d,
      definitions,
      scenes(),
      copy,
      "initial"
    );
    expect(result.status).toBe("inconclusive");
    expect(result.policyVersion).toBe(3);
    expect(d.generateText).toHaveBeenCalledTimes(1);
    expect(
      JSON.stringify(vi.mocked(d.generateText).mock.calls[0][0].messages)
    ).toContain("'Promoção real' não demonstra");
  });
  it("turns partial compound-fact coverage into a grounded omission with an exact localized target", async () => {
    const before = arsenalHash(copy);
    const result = await reviewProposal(
      input,
      deps({ ...clean, factCoverage: partial }),
      definitions,
      scenes(),
      copy,
      "initial"
    );
    expect(result.status).toBe("correction_required");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        category: "fact_omission",
        slideIndex: 2,
        fieldId: "field-1",
        observed: "Acompanhamos os preços todos os dias",
        sourceQuote: "Verificamos as promoções",
        authority: "source_grounded",
        action: "none",
      })
    );
    expect(result.factCoverage).toEqual(partial);
    expect(arsenalHash(copy)).toBe(before);
    expect(proposalReviewRecordSchema.safeParse(result).success).toBe(true);
  });
  it("targets an empty optional native field when a whole fact is absent, without inventing observed text", () => {
    const candidate = structuredClone(copy);
    candidate.slides[2].values[1].value = "";
    const coverage = [
      covered[0],
      {
        ...covered[1],
        status: "missing" as const,
        evidence: [],
        missingSourceQuote: "Verificamos as promoções",
      },
    ];
    const result = inspectFactCoverage(
      input,
      candidate,
      scenes(candidate),
      definitions,
      coverage
    );
    expect(result.limitation).toBeUndefined();
    expect(result.findings[0]).toMatchObject({
      slideIndex: 2,
      fieldId: "field-1",
      observed: "",
      sourceQuote: "Verificamos as promoções",
    });
  });
  it.each([
    undefined,
    [],
    [covered[0]],
    [covered[0], covered[0]],
    [covered[0], { ...covered[1], factId: "invented" }],
    [covered[0], { ...covered[1], evidence: [] }],
    [covered[0], { ...covered[1], status: "uncertain" as const }],
    [
      covered[0],
      {
        ...covered[1],
        evidence: [{ slideIndex: 2, fieldId: "$caption", quote: "A legenda" }],
      },
    ],
    [
      covered[0],
      {
        ...covered[1],
        evidence: [
          { slideIndex: 8, fieldId: "field-1", quote: "Acompanhamos" },
        ],
      },
    ],
    [
      covered[0],
      {
        ...covered[1],
        evidence: [
          {
            slideIndex: 2,
            fieldId: "field-1",
            quote: "Verificamos as promoções",
          },
        ],
      },
    ],
    [covered[0], { ...partial[1], missingSourceQuote: "Garantimos descontos" }],
  ])(
    "keeps incomplete, unknown, uncertain or fabricated coverage inconclusive: %j",
    coverage => {
      expect(
        inspectFactCoverage(input, copy, scenes(), definitions, coverage)
          .limitation
      ).toMatch(/^proposal_review_/);
    }
  );
  it("checks current rendered field text and rejects old pixels/hidden fields even when canonical copy contains the quote", () => {
    const compositions = scenes();
    const binding = compositions[2].base.bindings.find(
      b => b.source === "content:field-1:text"
    )!.id;
    for (const element of compositions[2].elements.filter(
      e => e.bindingId === binding
    ))
      element.text = "Texto antigo";
    expect(
      inspectFactCoverage(input, copy, compositions, definitions, covered)
        .limitation
    ).toBe("proposal_review_invalid_fact_evidence");
    const hidden = scenes();
    for (const e of hidden[2].elements.filter(e => e.bindingId === binding))
      e.opacity = 0;
    expect(
      inspectFactCoverage(input, copy, hidden, definitions, covered).limitation
    ).toBe("proposal_review_invalid_fact_evidence");
  });
  it("permits a faithful paraphrase with literal visible evidence and still checks source findings outside the plan", async () => {
    const candidate = structuredClone(copy);
    candidate.slides[2].values[1].value =
      "Checamos ofertas e acompanhamos preços todo dia";
    const coverage = [
      covered[0],
      {
        ...covered[1],
        evidence: [
          {
            slideIndex: 2,
            fieldId: "field-1",
            quote: "Checamos ofertas e acompanhamos preços todo dia",
          },
        ],
      },
    ];
    const d = deps({ ...clean, factCoverage: coverage });
    const result = await reviewProposal(
      input,
      d,
      definitions,
      scenes(candidate),
      candidate,
      "recheck"
    );
    expect(result.status).toBe("passed");
    expect(
      JSON.stringify(vi.mocked(d.generateText).mock.calls[0][0].messages)
    ).toContain("informação essencial omitida do plano");
  });
  it("rejects malformed/unbacked narrative plans before spending on a render or review", async () => {
    for (const plan of [
      { ...copy.editorialPlan, facts: [] },
      { ...copy.editorialPlan, slides: [] },
      {
        ...copy.editorialPlan,
        facts: [
          {
            id: "bad",
            sourceQuote: "Garantia inventada",
            meaning: "Inventado",
          },
        ],
      },
    ]) {
      const d = deps({ ...clean, factCoverage: covered });
      d.renderReviewScenes = vi.fn(renderReviewFixtureScenes);
      const result = await reviewProposal(
        input,
        d,
        definitions,
        scenes(),
        { ...copy, editorialPlan: plan as any },
        "initial"
      );
      expect(result.limitation).toBe("proposal_review_invalid_editorial_plan");
      expect(d.generateText).not.toHaveBeenCalled();
      expect(d.renderReviewScenes).not.toHaveBeenCalled();
    }
  });
  it("reuses paid reviews but invalidates after a graphical or reviewer model change", async () => {
    const d = deps({ ...clean, factCoverage: partial }),
      journal = new Map<string, any>();
    d.executeOperation = async ({ operationKey }, work) => {
      if (journal.has(operationKey)) return journal.get(operationKey);
      const result = await work();
      journal.set(operationKey, result);
      return result;
    };
    const first = await reviewProposal(
      input,
      d,
      definitions,
      scenes(),
      copy,
      "initial"
    );
    const repeated = await reviewProposal(
      input,
      d,
      definitions,
      scenes(),
      copy,
      "initial"
    );
    expect(first).toEqual(repeated);
    expect(d.generateText).toHaveBeenCalledTimes(1);
    d.renderReviewScenes = async request =>
      (await renderReviewFixtureScenes(request)).map(s => ({
        ...s,
        dataUri: "data:image/png;base64,bmV3=",
      }));
    const changed = await reviewProposal(
      input,
      d,
      definitions,
      scenes(),
      copy,
      "initial"
    );
    expect(changed.inputHash).not.toBe(first.inputHash);
    expect(d.generateText).toHaveBeenCalledTimes(2);
    const previousModel = ENV.openRouterProposalReviewModel;
    try {
      ENV.openRouterProposalReviewModel = "test/another-multimodal-reviewer";
      const differentModel = await reviewProposal(
        input,
        d,
        definitions,
        scenes(),
        copy,
        "initial"
      );
      expect(differentModel.inputHash).not.toBe(changed.inputHash);
      expect(d.generateText).toHaveBeenCalledTimes(3);
      expect(
        await reviewProposal(input, d, definitions, scenes(), copy, "initial")
      ).toEqual(differentModel);
      expect(d.generateText).toHaveBeenCalledTimes(3);
    } finally {
      ENV.openRouterProposalReviewModel = previousModel;
    }
    const legacy = { ...first, policyVersion: 1 };
    delete (legacy as any).factCoverage;
    expect(proposalReviewRecordSchema.safeParse(legacy).success).toBe(true);
    expect(
      proposalReviewRecordSchema.safeParse({ ...legacy, policyVersion: 2 })
        .success
    ).toBe(false);
  });
  it("does not create coverage obligations in literal visual_only mode", async () => {
    const literal = {
      ...copy,
      editorialPlan: {
        ...copy.editorialPlan!,
        mode: "literal" as const,
        facts: [],
        slides: copy.editorialPlan!.slides.map(s => ({ ...s, factIds: [] })),
      },
    };
    const job = {
      ...input,
      executionBrief: { interventionLevel: "visual_only" } as any,
    };
    const result = await reviewProposal(
      job,
      deps(clean),
      definitions,
      scenes(),
      literal,
      "initial"
    );
    expect(result.status).toBe("passed");
    expect(result.factCoverage).toEqual([]);
  });
  it("repairs only the grounded field, rerenders/rechecks coverage, and replays all paid operations without rebilling", async () => {
    const repaired = structuredClone(copy);
    repaired.slides[2].values[1].value =
      "Verificamos promoções e acompanhamos os preços diariamente";
    const rechecked = [
      covered[0],
      {
        ...covered[1],
        evidence: [
          {
            slideIndex: 2,
            fieldId: "field-1",
            quote: repaired.slides[2].values[1].value as string,
          },
        ],
      },
    ];
    const d = deps(clean);
    d.measureText = measureText;
    let reviewCount = 0;
    d.generateText = vi.fn(async params => {
      if (params.taskRoute === "post_evaluation")
        return reply({
          ...clean,
          factCoverage: reviewCount++ ? rechecked : partial,
        });
      if (params.traceLabel?.includes("editorial_recovery"))
        return reply({
          ...repaired,
          caption: "Adulterada",
          hashtags: ["#adulterada"],
        });
      return reply(copy);
    });
    d.renderReviewScenes = vi.fn(renderReviewFixtureScenes);
    const journal = new Map<string, any>();
    d.executeOperation = async ({ operationKey }, work) => {
      if (journal.has(operationKey)) return journal.get(operationKey);
      const result = await work();
      journal.set(operationKey, result);
      return result;
    };
    const job = {
      ...input,
      selectedDefinitions: definitions,
      postMode: "carousel" as const,
    };
    const result = await executeProposalWorkflow(job, d);
    expect(result.status).toBe("ready");
    expect(result.reviews?.map(r => r.status)).toEqual([
      "correction_required",
      "passed",
    ]);
    expect(result.bundle?.caption).toBe(copy.caption);
    expect(result.bundle?.hashtags).toEqual(copy.hashtags);
    expect(JSON.stringify(result.bundle)).toContain(
      repaired.slides[2].values[1].value
    );
    expect(JSON.stringify(result.bundle)).toContain(
      copy.slides[1].values[1].value
    );
    expect(d.generateText).toHaveBeenCalledTimes(4);
    expect(d.renderReviewScenes).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(d.renderReviewScenes).mock.calls;
    expect(JSON.stringify(calls[0][0].compositions)).not.toContain(
      "Verificamos promoções e acompanhamos"
    );
    expect(JSON.stringify(calls[1][0].compositions)).toContain(
      "Verificamos promoções e acompanhamos"
    );
    expect((await executeProposalWorkflow(job, d)).status).toBe("ready");
    expect(d.generateText).toHaveBeenCalledTimes(4);
    expect(
      [...journal.keys()].filter(k => k.startsWith("review_correction:"))
    ).toHaveLength(1);
  });
  it("does not buy a second recovery when a purchased copy recovery already consumed the shared budget", async () => {
    const d = deps(clean);
    d.measureText = measureText;
    d.recoveryOperationKeys = async () => ["copy_recovery"];
    d.generateText = vi.fn(async params =>
      reply(
        params.taskRoute === "post_evaluation"
          ? { ...clean, factCoverage: partial }
          : copy
      )
    );
    const result = await executeProposalWorkflow(
      { ...input, selectedDefinitions: definitions, postMode: "carousel" },
      d
    );
    expect(result.status).toBe("failed");
    expect(result.reviews?.[0].status).toBe("correction_required");
    expect(d.generateText).toHaveBeenCalledTimes(2);
  });
});

describe("independent source audit in policy 3", () => {
  const sourceAudit = () =>
    structuredClone([
      {
        ...covered[0],
        factId: "source-platform",
        sourceQuote: copy.editorialPlan!.facts[0].sourceQuote,
        meaning: "Reúne preços das plataformas.",
      },
      {
        factId: "source-verification",
        sourceQuote: "Verificamos as promoções",
        meaning: "O serviço verifica promoções.",
        status: "missing" as const,
        evidence: [],
        missingSourceQuote: "Verificamos as promoções",
        explanation:
          "A arte comunica acompanhamento, mas omite a atividade de verificar promoções.",
      },
      {
        ...covered[1],
        factId: "source-monitoring",
        sourceQuote: "acompanhamos os preços diariamente",
        meaning: "Acompanhamento diário de preços.",
      },
    ]);

  it("requires source audit even when a recorded policy-2 reply claims every compound fact is covered", async () => {
    const d = deps(clean);
    // Intentionally bypass the fixture adapter: this is the old wire response.
    d.generateText = vi.fn(
      async () =>
        ({
          choices: [
            {
              message: {
                content: JSON.stringify({ ...clean, factCoverage: covered }),
              },
            },
          ],
        }) as any
    );
    const result = await reviewProposal(
      input,
      d,
      definitions,
      scenes(),
      copy,
      "initial"
    );
    expect(result.status).toBe("inconclusive");
    expect(result.policyVersion).toBe(3);
    expect(result.limitation).toBe("proposal_review_malformed_response");
  });

  it("blocks a missing source action even if the writer omitted it from the plan and plan coverage passes", async () => {
    const candidate = structuredClone(copy);
    candidate.editorialPlan!.facts[1] = {
      id: "fact-2",
      sourceQuote: "acompanhamos os preços diariamente",
      meaning: "Acompanhamento diário.",
    };
    const before = arsenalHash(candidate);
    const audit = sourceAudit();
    const d = deps({ ...clean, factCoverage: covered, sourceCoverage: audit });
    const result = await reviewProposal(
      input,
      d,
      definitions,
      scenes(candidate),
      candidate,
      "initial"
    );
    expect(result.status).toBe("correction_required");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        category: "fact_omission",
        sourceQuote: "Verificamos as promoções",
        authority: "source_grounded",
      })
    );
    expect(result.sourceCoverage).toEqual(audit);
    expect(arsenalHash(candidate)).toBe(before); // no mutation of the frozen writing plan
    const { authority: _authority, ...grounded } = result.findings.find(
      f => f.category === "fact_omission"
    )!;
    const hostileDuplicate = { ...grounded, action: "replace_text" };
    const duplicateResult = await reviewProposal(
      input,
      deps({
        ...clean,
        findings: [hostileDuplicate],
        factCoverage: covered,
        sourceCoverage: audit,
      }),
      definitions,
      scenes(candidate),
      candidate,
      "initial"
    );
    expect(duplicateResult.status).toBe("correction_required");
    expect(
      duplicateResult.findings.find(f => f.category === "fact_omission")?.action
    ).toBe("none");
    expect(proposalReviewRecordSchema.safeParse(result).success).toBe(true);
  });

  it.each([
    "invented-source",
    "invented-evidence",
    "duplicate-id",
    "uncertain",
  ])("refuses an invalid source audit: %s", async failure => {
    const audit: any[] = sourceAudit();
    if (failure === "invented-source")
      audit[1].sourceQuote = "Entrega gratuita em todo o Brasil";
    if (failure === "invented-evidence")
      audit[0].evidence[0].quote = "Texto inexistente";
    if (failure === "duplicate-id") audit[1].factId = audit[0].factId;
    if (failure === "uncertain") audit[1].status = "uncertain";
    const result = await reviewProposal(
      input,
      deps({ ...clean, factCoverage: covered, sourceCoverage: audit }),
      definitions,
      scenes(),
      copy,
      "initial"
    );
    expect(result.status).toBe("inconclusive");
    expect(result.limitation).toMatch(
      /^proposal_review_(source_|incomplete_source)/
    );
  });

  it("accepts a grounded faithful paraphrase after checking current native evidence, without requiring lexical identity", async () => {
    const candidate = structuredClone(copy);
    candidate.slides[0].values[1].value = "Checamos as ofertas para você";
    const audit = sourceAudit();
    audit[1] = {
      ...audit[1],
      status: "covered",
      missingSourceQuote: "",
      evidence: [
        {
          slideIndex: 0,
          fieldId: "field-1",
          quote: "Checamos as ofertas para você",
        },
      ],
    } as any;
    const result = await reviewProposal(
      input,
      deps({ ...clean, factCoverage: covered, sourceCoverage: audit }),
      definitions,
      scenes(candidate),
      candidate,
      "initial"
    );
    expect(result.status).toBe("passed");
    expect(proposalReviewRecordSchema.safeParse(result).success).toBe(true);
    expect(
      proposalReviewRecordSchema.safeParse({ ...result, sourceCoverage: [] })
        .success
    ).toBe(false);
    const legacy = { ...result, policyVersion: 2, sourceCoverage: undefined };
    expect(proposalReviewRecordSchema.safeParse(legacy).success).toBe(true);
  });
});

it("repairs a source omission absent from the frozen plan, rechecks native copy and replays without another purchase", async () => {
  const candidate = structuredClone(copy);
  candidate.editorialPlan!.facts[1] = {
    id: "fact-2",
    sourceQuote: "acompanhamos os preços diariamente",
    meaning: "Monitoramento diário",
  };
  const repaired = structuredClone(candidate);
  repaired.slides[0].values[1].value = "Verificamos as promoções para você";
  const sourceBase = covered.map((row, i) => ({
    ...row,
    factId: `source-${i}`,
    sourceQuote: candidate.editorialPlan!.facts[i].sourceQuote,
    meaning: candidate.editorialPlan!.facts[i].meaning,
  }));
  let reviews = 0;
  const d = deps(clean);
  d.measureText = measureText;
  d.generateText = vi.fn(async params => {
    if (params.taskRoute === "post_evaluation") {
      const fixed = reviews++ > 0;
      return reply({
        ...clean,
        factCoverage: covered,
        sourceCoverage: [
          ...sourceBase,
          {
            factId: "source-verification",
            sourceQuote: "Verificamos as promoções",
            meaning: "Atividade de verificar promoções",
            status: fixed ? "covered" : "missing",
            evidence: fixed
              ? [
                  {
                    slideIndex: 0,
                    fieldId: "field-1",
                    quote: repaired.slides[0].values[1].value,
                  },
                ]
              : [],
            missingSourceQuote: fixed ? "" : "Verificamos as promoções",
            explanation: fixed
              ? "Atividade explícita na arte"
              : "O diferencial foi omitido do plano e da arte",
          },
        ],
      });
    }
    return reply(
      params.traceLabel?.includes("editorial_recovery")
        ? { ...repaired, caption: "Não deve ser aplicada", hashtags: ["#novo"] }
        : candidate
    );
  });
  const journal = new Map<string, any>();
  d.executeOperation = async ({ operationKey }, work) => {
    if (journal.has(operationKey)) return journal.get(operationKey);
    const result = await work();
    journal.set(operationKey, result);
    return result;
  };
  const job = {
    ...input,
    selectedDefinitions: definitions,
    postMode: "carousel" as const,
  };
  const result = await executeProposalWorkflow(job, d);
  expect(result.status).toBe("ready");
  expect(result.reviews?.map(r => r.status)).toEqual([
    "correction_required",
    "passed",
  ]);
  expect(result.reviews?.[0].sourceCoverage?.at(-1)?.status).toBe("missing");
  expect(result.reviews?.[1].sourceCoverage?.at(-1)?.status).toBe("covered");
  expect(result.bundle?.caption).toBe(candidate.caption);
  expect(result.bundle?.hashtags).toEqual(candidate.hashtags);
  expect(JSON.stringify(result.bundle)).toContain(
    "Verificamos as promoções para você"
  );
  const correctionCall = vi
    .mocked(d.generateText)
    .mock.calls.find(([p]) => p.traceLabel?.includes("editorial_recovery"))![0];
  expect(JSON.stringify(correctionCall.messages)).toContain("PLANO CONGELADO");
  expect((await executeProposalWorkflow(job, d)).status).toBe("ready");
  expect(d.generateText).toHaveBeenCalledTimes(4);
  expect(
    [...journal.keys()].filter(k => k.startsWith("review_correction:"))
  ).toHaveLength(1);
});
