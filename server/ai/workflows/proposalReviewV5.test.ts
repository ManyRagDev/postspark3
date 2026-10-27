import { resolveArsenalGeometry } from "@shared/arsenalGeometry";
import { describe, it, expect, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { instantiateCompleteDesign } from "@shared/completeDesignGeneration";
import { proposalReviewRecordSchema } from "@shared/proposalReview";
import { reviewProposal } from "./proposalReview";
import { reviewEvidenceAnchors } from "./reviewEvidence";
import { canonicalizeEditorialNames } from "./proposalEditorial";
import { renderReviewFixtureScenes } from "./proposalReview.fixture";
const d = completeDesignTestDefinitions()[0],
  runId = "00000000-0000-4000-8000-000000000001";
const input: any = {
  requestId: runId,
  runId,
  proposalId: "p-test",
  slot: 0,
  prompt:
    "BizuMiner acompanha preços diariamente e verifica promoções para encontrar melhores preços.",
  reviewPolicyVersion: 5,
  postMode: "static",
};
function setup() {
  const copy: any = {
    caption: "Legenda preservada",
    hashtags: [],
    editorialPlan: {
      version: 1,
      mode: "compose",
      centralMessage: "Acompanhar preços",
      facts: [
        {
          id: "fact1",
          sourceQuote: input.prompt,
          meaning: "Acompanhamento diário e verificação de promoções",
        },
      ],
      protectedEntities: [{ value: "BizuMiner", sourceQuote: "BizuMiner" }],
      slides: [
        { slideIndex: 0, purpose: "Explicar serviço", factIds: ["fact1"] },
      ],
    },
    slides: [
      {
        values: [
          {
            fieldId: "field-0",
            value: "BizuMiner acompanha preços diariamente",
          },
          {
            fieldId: "field-1",
            value: "Verifica promoções para encontrar bons preços.",
          },
        ],
        mediaPrompts: [],
      },
    ],
  };
  const scene = instantiateCompleteDesign({
    definition: d,
    values: copy.slides[0].values,
    mediaPrompts: [],
    runId,
    slot: 0,
    slide: 0,
    planHash: "a".repeat(64),
    experimental: true,
  });
  const compiled = resolveArsenalGeometry(scene, {
    measureText: () => ({ height: 20, lines: [{ width: 100 }], runs: [] }),
  });
  const anchors = reviewEvidenceAnchors(copy, [compiled]);
  const coverage = {
    factId: "fact1",
    status: "covered",
    evidenceIds: anchors.map(a => a.anchorId),
    missingSourceQuote: "",
    explanation: "Mecanismos completos na arte",
    materiality: "essential",
    materialityReason: "Mecanismo e frequência essenciais",
  };
  const response: any = {
    outcome: "reviewed",
    reviewedSlides: [0],
    findings: [],
    limitation: "",
    factCoverage: [coverage],
    sourceCoverage: [
      {
        ...coverage,
        sourceQuote: input.prompt,
        meaning: "Ação, frequência e verificação",
      },
    ],
  };
  const reply = (r: any) =>
    ({ choices: [{ message: { content: JSON.stringify(r) } }] }) as any;
  const generateText = vi.fn(async () => reply(response));
  const deps: any = {
    actor: runId,
    generateText,
    renderReviewScenes: renderReviewFixtureScenes,
    reviewRepairBudget: new Set<string>(),
  };
  return {
    copy,
    scene: compiled,
    anchors,
    response,
    reply,
    generateText,
    deps,
  };
}
describe("policy 5 evidence and durable bounded formal repair", () => {
  it("offers no narrative field for static, resolves exact server evidence and passes with a provider receipt", async () => {
    const s = setup();
    const r = await reviewProposal(
      input,
      s.deps,
      [d],
      [s.scene],
      s.copy,
      "initial"
    );
    expect(r.status, r.limitation).toBe("passed");
    expect(r.policyVersion).toBe(5);
    expect(proposalReviewRecordSchema.safeParse(r).success).toBe(true);
    expect(
      s.generateText.mock.calls[0][0].response_format.json_schema.schema
        .properties
    ).not.toHaveProperty("narrativeChecks");
    expect(r.factCoverage?.[0].evidence[0].quote).toBe(s.anchors[0].quote);
    expect(s.generateText).toHaveBeenCalledTimes(1);
  });
  it("repairs one unknown reference, retains both raw receipts, and shares the budget across rounds", async () => {
    const s = setup(),
      journal = new Map<string, any>();
    s.generateText.mockImplementationOnce(async () =>
      s.reply({
        ...s.response,
        factCoverage: [
          { ...s.response.factCoverage[0], evidenceIds: ["f".repeat(64)] },
        ],
      })
    );
    s.deps.executeOperation = async ({ operationKey }: any, work: any) => {
      if (journal.has(operationKey)) return journal.get(operationKey);
      const value = await work();
      journal.set(operationKey, value);
      return value;
    };
    const r = await reviewProposal(
      input,
      s.deps,
      [d],
      [s.scene],
      s.copy,
      "initial"
    );
    expect(r.status, r.limitation).toBe("passed");
    expect(s.generateText).toHaveBeenCalledTimes(2);
    expect(journal.size).toBe(2);
    expect(r.policyVersion === 5 && r.operationKeys).toHaveLength(2);
    const again = await reviewProposal(
      input,
      s.deps,
      [d],
      [s.scene],
      s.copy,
      "initial"
    );
    expect(again).toEqual(r);
    expect(s.generateText).toHaveBeenCalledTimes(2);
    s.generateText.mockImplementation(async () => s.reply({ broken: true }));
    const recheck = await reviewProposal(
      input,
      s.deps,
      [d],
      [s.scene],
      s.copy,
      "recheck"
    );
    expect(recheck.status).toBe("inconclusive");
    expect(s.generateText).toHaveBeenCalledTimes(3);
  });
  it("does not repair genuine uncertainty or replay an uncertain formal effect", async () => {
    const s = setup();
    s.response.factCoverage[0].status = "uncertain";
    s.response.factCoverage[0].evidenceIds = [];
    const r = await reviewProposal(
      input,
      s.deps,
      [d],
      [s.scene],
      s.copy,
      "initial"
    );
    expect(r.status).toBe("inconclusive");
    expect(s.generateText).toHaveBeenCalledTimes(1);
    const t = setup();
    t.generateText.mockImplementation(async () => t.reply({ broken: true }));
    t.deps.executeOperation = async ({ operationKey }: any, work: any) => {
      if (operationKey.startsWith("review_evidence_repair:"))
        throw new Error(`reconciliation_required:${operationKey}`);
      return work();
    };
    const uncertain = await reviewProposal(
      input,
      t.deps,
      [d],
      [t.scene],
      t.copy,
      "initial"
    );
    expect(uncertain.limitation).toBe(
      "proposal_review_reconciliation_required"
    );
    expect(t.generateText).toHaveBeenCalledTimes(1);
  });
  it("retains advisory promotional wording while blocking absolute guarantees and essential frequency loss", async () => {
    const s = setup();
    for (const row of [
      s.response.factCoverage[0],
      s.response.sourceCoverage[0],
    ])
      Object.assign(row, {
        status: "partial",
        missingSourceQuote: "melhores",
        materiality: "supporting",
        materialityReason:
          "Benefício preservado pela explicação e bons preços na sequência",
      });
    const advisory = await reviewProposal(
      input,
      s.deps,
      [d],
      [s.scene],
      s.copy,
      "initial"
    );
    expect(advisory.status).toBe("passed");
    expect(
      advisory.findings.every(f => "effect" in f && f.effect === "advisory")
    ).toBe(true);
    s.response.factCoverage[0].missingSourceQuote = "diariamente";
    const blocked = await reviewProposal(
      input,
      s.deps,
      [d],
      [s.scene],
      s.copy,
      "initial"
    );
    expect(blocked.status).not.toBe("passed");
    const t = setup();
    t.copy.slides[0].values[1].value = "Você compra sempre no menor preço.";
    const scene = instantiateCompleteDesign({
      definition: d,
      values: t.copy.slides[0].values,
      mediaPrompts: [],
      runId,
      slot: 0,
      slide: 0,
      planHash: "b".repeat(64),
      experimental: true,
    });
    const compiled = resolveArsenalGeometry(scene, {
      measureText: () => ({ height: 20, lines: [{ width: 100 }], runs: [] }),
    });
    const anchors = reviewEvidenceAnchors(t.copy, [compiled]);
    t.response.factCoverage[0].evidenceIds = anchors.map(a => a.anchorId);
    t.response.sourceCoverage[0].evidenceIds = anchors.map(a => a.anchorId);
    t.response.findings = [
      {
        category: "unsupported_claim",
        slideIndex: 0,
        fieldId: "field-1",
        evidenceIds: [anchors.find(a => a.fieldId === "field-1")!.anchorId],
        expected: "Não garantir menor preço absoluto",
        sourceQuote: input.prompt,
        explanation: "A fonte sustenta acompanhamento, não garantia",
        action: "none",
        effect: "advisory",
      },
    ];
    const absolute = await reviewProposal(
      input,
      t.deps,
      [d],
      [compiled],
      t.copy,
      "initial"
    );
    expect(absolute.status).toBe("correction_required");
  });
  it("excludes hidden fields, segments Unicode exactly and rejects divergent bindings", () => {
    const s = setup();
    s.scene.elements.find(
      e =>
        e.bindingId ===
        s.scene.base.bindings.find(b => b.source === "content:field-1:text")?.id
    )!.opacity = 0;
    expect(
      reviewEvidenceAnchors(s.copy, [s.scene]).every(
        a => a.fieldId !== "field-1"
      )
    ).toBe(true);
    const value = "a".repeat(499) + "😀" + "b".repeat(510);
    s.copy.slides[0].values[0].value = value;
    s.scene.elements.find(
      e =>
        e.bindingId ===
        s.scene.base.bindings.find(b => b.source === "content:field-0:text")?.id
    )!.text = value;
    const anchors = reviewEvidenceAnchors(s.copy, [s.scene]);
    expect(anchors.map(a => a.quote).join("")).toBe(value);
    expect(anchors.every(a => a.quote.length <= 500)).toBe(true);
  });
  it("normalizes only source-unambiguous spacing once without touching healthy fields, arrays, caption or receipts", () => {
    const s = setup();
    s.copy.slides[0].values[0].value = "Conheça Bizu Miner hoje";
    const before = structuredClone(s.copy);
    const normalized = canonicalizeEditorialNames(s.copy, input);
    expect(normalized.copy.slides[0].values[0].value).toBe(
      "Conheça BizuMiner hoje"
    );
    expect(normalized.copy.caption).toBe(before.caption);
    expect(s.copy).toEqual(before);
    expect(canonicalizeEditorialNames(normalized.copy, input).patches).toEqual(
      []
    );
    expect(
      canonicalizeEditorialNames(s.copy, {
        ...input,
        prompt: input.prompt + " Bizu Miner",
      }).patches
    ).toEqual([]);
    expect(
      canonicalizeEditorialNames(s.copy, {
        ...input,
        executionBrief: { interventionLevel: "visual_only" },
      }).patches
    ).toEqual([]);
  });
});

it("does not spend formal recovery on a valid explicit semantic inconclusion, cancellation or deadline",async()=>{
 const s=setup();s.response.outcome="inconclusive";s.response.limitation="Não consegui confirmar o sentido.";s.response.factCoverage=[];s.response.sourceCoverage=[];
 const r=await reviewProposal(input,s.deps,[d],[s.scene],s.copy,"initial");expect(r.status).toBe("inconclusive");expect(s.generateText).toHaveBeenCalledTimes(1);
 const t=setup(),controller=new AbortController();controller.abort(new Error("cancelled"));
 await expect(reviewProposal({...input,signal:controller.signal},t.deps,[d],[t.scene],t.copy,"initial")).rejects.toThrow();expect(t.generateText).not.toHaveBeenCalled();
 const timed=await reviewProposal({...input,deadlineMs:Date.now()-1},t.deps,[d],[t.scene],t.copy,"initial");expect(timed.limitation).toBe("proposal_review_timeout");expect(t.generateText).not.toHaveBeenCalled();
});
