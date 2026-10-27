import { describe, it, expect, vi } from "vitest";
import { carouselNarrativeContract } from "@shared/carouselNarrative";
import {
  narrativeCriteria,
  proposalReviewRecordSchema,
  type NarrativeCheck,
} from "@shared/proposalReview";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { instantiateCompleteDesign } from "@shared/completeDesignGeneration";
import { resolveArsenalGeometry } from "@shared/arsenalGeometry";
import {
  narrativeEditorialPlanSchema,
  validateEditorialPlan,
} from "./proposalEditorial";
import { inspectNarrativeChecks } from "./proposalNarrative";
import { reviewProposal, type ReviewCopy } from "./proposalReview";
import {
  executeProposalWorkflow,
  type ProposalExecutionInput,
  type ProposalGraphDeps,
} from "./proposalGraph";
import { renderReviewFixtureScenes } from "./proposalReview.fixture";

const definition = completeDesignTestDefinitions()[0];
const input: ProposalExecutionInput = {
  requestId: "story-request",
  runId: "00000000-0000-4000-8000-000000000001",
  proposalId: "story-proposal",
  slot: 0,
  prompt: "BizuMiner verifica promoções.",
  postMode: "carousel",
  selectedDefinitions: [definition, definition, definition],
};
function story(): ReviewCopy {
  return {
    caption: "Confira antes de comprar.",
    hashtags: ["#BizuMiner"],
    editorialPlan: narrativeEditorialPlanSchema.parse({
      version: 2,
      mode: "compose",
      centralMessage: "Verificar uma promoção ajuda a decidir a compra.",
      facts: [
        {
          id: "verification",
          sourceQuote: input.prompt,
          meaning: "BizuMiner verifica promoções.",
        },
      ],
      protectedEntities: [],
      slides: [
        {
          slideIndex: 0,
          role: "cover",
          purpose: "Despertar uma dúvida sobre a promoção",
          factIds: [],
          readerTakeaway: "É preciso conferir a oferta",
          bridgeFromPrevious: "",
        },
        {
          slideIndex: 1,
          role: "development",
          purpose: "Responder como o serviço ajuda",
          factIds: ["verification"],
          readerTakeaway: "BizuMiner verifica as promoções",
          bridgeFromPrevious:
            "Responder à dúvida da capa com a ação do serviço",
        },
        {
          slideIndex: 2,
          role: "closing",
          purpose: "Concluir com uma decisão informada",
          factIds: [],
          readerTakeaway: "Conferir antes de comprar",
          bridgeFromPrevious: "Usar a verificação explicada antes para decidir",
        },
      ],
    }),
    slides: [
      "Essa promoção é real?",
      "BizuMiner verifica promoções.",
      "Confira antes de comprar.",
    ].map(value => ({
      values: [
        { fieldId: "field-0", value },
        { fieldId: "field-1", value: "" },
      ],
      mediaPrompts: [],
    })),
  };
}
function checks(copy: ReviewCopy): NarrativeCheck[] {
  return narrativeCriteria.map(criterion => ({
    criterion,
    status: "met",
    revisionSlides: [],
    instructionQuote: "",
    explanation:
      "Julgamento controlado: sequência segue pergunta, explicação e ação.",
    evidence: (criterion === "cover_hook"
      ? [0]
      : criterion === "closing"
        ? [copy.slides.length - 1]
        : criterion === "cohesion"
          ? copy.slides.map((_, i) => i)
          : copy.slides.length === 2
            ? [1]
            : [1]
    ).map(slideIndex => ({
      slideIndex,
      fieldId: "field-0",
      quote: copy.slides[slideIndex].values[0].value as string,
    })),
  }));
}
function scenes(copy: ReviewCopy) {
  return copy.slides.map((s, slide) =>
    resolveArsenalGeometry(
      instantiateCompleteDesign({
        definition,
        values: s.values,
        mediaPrompts: [],
        runId: input.runId,
        slot: 0,
        slide,
        planHash: "a".repeat(64),
        experimental: true,
      }),
      {
        measureText: p => ({
          height: 20,
          lines: [{ width: 100 }],
          runs: [
            { fill: p.fill, fontSize: p.fontSize, fontStyle: p.fontStyle },
          ],
        }),
      }
    )
  );
}
function verdict(
  copy: ReviewCopy,
  narrativeChecks: NarrativeCheck[] | undefined = checks(copy)
) {
  const evidence = [
    {
      slideIndex: 1,
      fieldId: "field-0",
      quote: "BizuMiner verifica promoções.",
    },
  ];
  return {
    outcome: "reviewed",
    reviewedSlides: copy.slides.map((_, i) => i),
    findings: [],
    limitation: "",
    narrativeChecks,
    factCoverage: [
      {
        factId: "verification",
        status: "covered",
        evidence,
        missingSourceQuote: "",
        explanation: "A ação está explícita.",
      },
    ],
    sourceCoverage: [
      {
        factId: "source-verification",
        sourceQuote: input.prompt,
        meaning: input.prompt,
        status: "covered",
        evidence,
        missingSourceQuote: "",
        explanation: "A afirmação da fonte está explícita.",
      },
    ],
  };
}
const reply = (value: unknown) =>
  ({ choices: [{ message: { content: JSON.stringify(value) } }] }) as any;
const deps = (value: unknown): ProposalGraphDeps => ({
  actor: input.runId,
  generateText: vi.fn(async () => reply(value)),
  renderReviewScenes: renderReviewFixtureScenes,
});

describe("composed carousel story contract", () => {
  it("distinguishes roles and excludes static/literal copy without forcing word quotas", () => {
    expect(carouselNarrativeContract(1)).toBeNull();
    expect(carouselNarrativeContract(4, "visual_only")).toBeNull();
    expect(carouselNarrativeContract(2)?.slides.map(s => s.role)).toEqual([
      "cover",
      "closing",
    ]);
    expect(carouselNarrativeContract(2)?.slides[1].density).toContain(
      "desenvolvimento"
    );
    expect(carouselNarrativeContract(4)?.slides.map(s => s.role)).toEqual([
      "cover",
      "development",
      "development",
      "closing",
    ]);
  });
  it("validates role, a distinct takeaway, and a bridge after the opening; keeps V1 readable", () => {
    const copy = story();
    expect(validateEditorialPlan(copy, input)).toEqual([]);
    const plan = copy.editorialPlan!;
    if (plan.version !== 2) throw new Error("fixture version");
    plan.slides[0].role = "development";
    plan.slides[1].bridgeFromPrevious = "";
    plan.slides[1].readerTakeaway = plan.slides[0].readerTakeaway;
    expect(validateEditorialPlan(copy, input)).toEqual(
      expect.arrayContaining([
        "editorial_plan_narrative_role:0",
        "editorial_plan_narrative_bridge:1",
        "editorial_plan_repeated_takeaway",
      ])
    );
  });
  it.each([
    "missing",
    "duplicate",
    "uncertain",
    "invented_quote",
    "hidden",
    "partial_sequence",
    "invented_override",
    "unanchored_revision",
  ])("refuses incomplete or ungrounded narrative evidence: %s", mode => {
    const copy = story(),
      evidence = checks(copy),
      compositions = scenes(copy);
    if (mode === "duplicate") evidence[1] = evidence[0];
    if (mode === "uncertain") evidence[0].status = "uncertain";
    if (mode === "invented_quote")
      evidence[0].evidence[0].quote = "Outra oferta";
    if (mode === "hidden")
      compositions[0].elements.forEach(e => (e.opacity = 0));
    if (mode === "partial_sequence") evidence[2].evidence.pop();
    if (mode === "invented_override") {
      evidence[0].status = "user_directed";
      evidence[0].instructionQuote = "Explique tudo na capa";
    }
    if (mode === "unanchored_revision") {
      evidence[0].status = "needs_revision";
      evidence[0].revisionSlides = [1];
    }
    expect(
      inspectNarrativeChecks(
        input,
        copy,
        compositions,
        mode === "missing" ? undefined : evidence
      ).limitation
    ).toBeTruthy();
  });
  it("separates complete reading evidence from permission to rewrite only the affected slide", () => {
    const copy = story(),
      evidence = checks(copy);
    evidence[2].status = "needs_revision";
    evidence[2].revisionSlides = [1];
    const result = inspectNarrativeChecks(input, copy, scenes(copy), evidence);
    expect(result.limitation).toBeUndefined();
    expect(result.findings.map(f => f.slideIndex)).toEqual([1]);
  });
  it("accepts an explicit user override with a literal instruction anchor", () => {
    const copy = story(),
      evidence = checks(copy);
    evidence[0].status = "user_directed";
    evidence[0].instructionQuote = "Mantenha a abertura explicativa.";
    expect(
      inspectNarrativeChecks(
        {
          ...input,
          prompt: input.prompt + " Mantenha a abertura explicativa.",
        },
        copy,
        scenes(copy),
        evidence
      )
    ).toEqual({ findings: [] });
  });
  it("reviews two-slide progression and closure without requiring a nonexistent middle", () => {
    const copy = story();
    copy.slides.splice(1, 1);
    copy.slides[1].values[0].value =
      "BizuMiner verifica promoções. Confira antes de comprar.";
    if (copy.editorialPlan?.version === 2) {
      copy.editorialPlan.slides.splice(1, 1);
      copy.editorialPlan.slides[1].slideIndex = 1;
      copy.editorialPlan.slides[1].factIds = ["verification"];
    }
    expect(
      inspectNarrativeChecks(input, copy, scenes(copy), checks(copy))
    ).toEqual({ findings: [] });
  });
  it("requires narrative review even when factual/source coverage already passes", async () => {
    const copy = story();
    const accepted = await reviewProposal(
      input,
      deps(verdict(copy)),
      input.selectedDefinitions!,
      scenes(copy),
      copy,
      "initial"
    );
    const missing = verdict(copy);
    delete (missing as any).narrativeChecks;
    expect(
      (
        await reviewProposal(
          input,
          deps(missing),
          input.selectedDefinitions!,
          scenes(copy),
          copy,
          "initial"
        )
      ).status
    ).toBe("inconclusive");
    expect(accepted.status).toBe("passed");
    const bad = checks(copy);
    bad[0].status = "needs_revision";
    bad[0].revisionSlides = [0];
    bad[0].explanation =
      "A abertura entrega a explicação inteira em vez do gancho.";
    const record = await reviewProposal(
      input,
      deps(verdict(copy, bad)),
      input.selectedDefinitions!,
      scenes(copy),
      copy,
      "initial"
    );
    expect(record).toMatchObject({
      policyVersion: 4,
      status: "correction_required",
      findings: [
        expect.objectContaining({
          category: "narrative_structure",
          authority: "contract_grounded",
          slideIndex: 0,
          fieldId: null,
        }),
      ],
    });
    expect(proposalReviewRecordSchema.safeParse(record).success).toBe(true);
    expect(
      proposalReviewRecordSchema.safeParse({
        ...record,
        status: "passed",
        findings: [],
      }).success
    ).toBe(false);
  });
  it("repairs only the affected slide, rerenders/rechecks and replays without purchasing again", async () => {
    const original = story(),
      repaired = story();
    repaired.slides[0].values[0].value = "Oferta boa ou só aparência?";
    const bad = checks(original);
    bad[0].status = "needs_revision";
    bad[0].revisionSlides = [0];
    let reviewCount = 0;
    const d = deps(null);
    d.measureText = p => ({
      height: 20,
      lines: [{ width: 100 }],
      runs: [{ fill: p.fill, fontSize: p.fontSize, fontStyle: p.fontStyle }],
    });
    d.renderReviewScenes = vi.fn(renderReviewFixtureScenes);
    d.generateText = vi.fn(async params => {
      if (params.taskRoute === "post_evaluation")
        return reply(
          reviewCount++ ? verdict(repaired) : verdict(original, bad)
        );
      if (params.traceLabel?.includes("editorial_recovery")) {
        const candidate = structuredClone(repaired);
        candidate.slides[1].values[0].value = "ALTERAÇÃO NÃO AUTORIZADA";
        candidate.caption = "Legenda adulterada";
        candidate.editorialPlan!.centralMessage = "Plano adulterado";
        return reply(candidate);
      }
      return reply(original);
    });
    const journal = new Map<string, unknown>();
    d.executeOperation = async ({ operationKey }, work) => {
      if (journal.has(operationKey)) return journal.get(operationKey) as any;
      const result = await work();
      journal.set(operationKey, result);
      return result;
    };
    const result = await executeProposalWorkflow(input, d);
    expect(result.status, result.errorReason).toBe("ready");
    expect(result.reviews?.map(r => r.status)).toEqual([
      "correction_required",
      "passed",
    ]);
    expect(JSON.stringify(result.bundle)).toContain(
      "Oferta boa ou só aparência?"
    );
    expect(JSON.stringify(result.bundle)).not.toContain(
      "ALTERAÇÃO NÃO AUTORIZADA"
    );
    expect(result.bundle?.caption).toBe(original.caption);
    expect(d.generateText).toHaveBeenCalledTimes(4);
    expect(d.renderReviewScenes).toHaveBeenCalledTimes(2);
    expect((await executeProposalWorkflow(input, d)).status).toBe("ready");
    expect(d.generateText).toHaveBeenCalledTimes(4);
    expect(
      Array.from(journal.keys()).filter(k => k.startsWith("review_correction:"))
    ).toHaveLength(1);
  });
  it("rejects fresh V1 carousel copy but resumes that completed journal without recopying", async () => {
    const old = story(),
      plan = old.editorialPlan!;
    old.editorialPlan = {
      version: 1,
      mode: "compose",
      centralMessage: plan.centralMessage,
      facts: plan.facts,
      protectedEntities: [],
      slides: plan.slides.map(({ slideIndex, purpose, factIds }) => ({
        slideIndex,
        purpose,
        factIds,
      })),
    };
    const response = verdict(old);
    delete (response as any).narrativeChecks;
    const d = deps(null);
    d.measureText = p => ({
      height: 20,
      lines: [{ width: 100 }],
      runs: [{ fill: p.fill, fontSize: p.fontSize, fontStyle: p.fontStyle }],
    });
    d.generateText = vi.fn(async p =>
      reply(p.taskRoute === "post_evaluation" ? response : old)
    );
    expect((await executeProposalWorkflow(input, d)).errorReason).toBe(
      "editorial_narrative_plan_required"
    );
    vi.mocked(d.generateText).mockClear();
    d.executeOperation = async ({ operationKey }, work) =>
      operationKey === "copy" ? reply(old) : work();
    const result = await executeProposalWorkflow(input, d);
    expect(result.status, result.errorReason).toBe("ready");
    expect(result.reviews?.[0].policyVersion).toBe(3);
    expect(d.generateText).toHaveBeenCalledTimes(1);
  });
});
