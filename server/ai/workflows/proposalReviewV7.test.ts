import { describe, it, expect, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { instantiateCompleteDesign } from "@shared/completeDesignGeneration";
import { resolveArsenalGeometry } from "@shared/arsenalGeometry";
import { proposalReviewRecordSchema } from "@shared/proposalReview";
import { reviewProposal } from "./proposalReview";
import { resolveReviewExecutionConfigV7 } from "./reviewExecutionConfigV7";
import { editorialContextV7 } from "./editorialContextV7";
import {
  healthyReviewV7Fixture,
  reviewPayloadV7,
} from "./proposalReviewV7.fixture";
import { renderReviewFixtureScenes } from "./proposalReview.fixture";
import { executeProposalWorkflow } from "./proposalGraph";
import { decodeReviewV7 } from "./reviewProtocolV7";
const id = "00000000-0000-4000-8000-000000000001";
const definition = completeDesignTestDefinitions()[0];
const metrics = () => ({ height: 20, lines: [{ width: 100 }], runs: [] });
function setup(count = 1) {
  const input: any = {
    requestId: id,
    runId: id,
    proposalId: "v7-proposal",
    slot: 0,
    prompt: "**BizuMiner** reúne questões e permite filtrar por assunto.",
    postMode: count === 1 ? "static" : "carousel",
    reviewPolicyVersion: 7,
    reviewExecutionConfig: resolveReviewExecutionConfigV7(),
  };
  const copy: any = {
    caption: "Conheça a ferramenta",
    hashtags: ["#estudos"],
    slides: Array.from({ length: count }, (_, i) => ({
      values: [
        {
          fieldId: "field-0",
          value: i ? "Escolha seu assunto" : "Seu próximo estudo começa aqui",
        },
        {
          fieldId: "field-1",
          value: "Encontre questões do assunto que você quer estudar.",
        },
      ],
      mediaPrompts: [],
    })),
  };
  const compile = () =>
    copy.slides.map((s: any, slide: number) =>
      resolveArsenalGeometry(
        instantiateCompleteDesign({
          definition,
          values: s.values,
          mediaPrompts: [],
          runId: id,
          slot: 0,
          slide,
          planHash: "a".repeat(64),
          experimental: true,
        }),
        { measureText: metrics }
      )
    );
  const pin = () => {
    input.editorialContextHash = editorialContextV7(input, input.reviewExecutionConfig?.editorialGuidanceVersion).hash;
  };
  pin();
  const calls: any[] = [];
  let amend = (response: any, _data: any) => response;
  const generateText = vi.fn(async (params: any) => {
    calls.push(params);
    const response = amend(
      healthyReviewV7Fixture(params),
      reviewPayloadV7(params)
    );
    return {
      id: "offline-v7",
      model: "fixture",
      choices: [
        {
          message: {
            content:
              typeof response === "string"
                ? response
                : JSON.stringify(response),
          },
          finish_reason: "stop",
        },
      ],
    };
  });
  const deps: any = {
    actor: id,
    generateText,
    renderReviewScenes: renderReviewFixtureScenes,
    reviewOperationCache: new Map(),
  };
  const review = (round: "initial" | "recheck" = "initial") =>
    reviewProposal(
      input,
      deps,
      copy.slides.map(() => definition),
      compile(),
      copy,
      round
    );
  const finding = (data: any, scope = "art", patch: any = {}) => {
    const u = data.textUnits.find((u: any) => u.scope === scope)!;
    return {
      category: "narrative_gap",
      slideIndex: u.slideIndex ?? 0,
      fieldId: u.fieldId,
      unitId: u.id,
      scope: u.scope,
      observed: u.text,
      expected: "Sugestão opcional de pergunta",
      sourceId: data.context.sources[0].id,
      sourceQuote: "BizuMiner reúne questões e permite filtrar por assunto.",
      explanation: "Preferência subjetiva, sem perda da informação.",
      consequence: "none",
      certainty: "established",
      effect: "advisory",
      ...patch,
    };
  };
  return {
    input,
    copy,
    compile,
    pin,
    calls,
    deps,
    review,
    finding,
    setAmend: (fn: typeof amend) => {
      amend = fn;
    },
  };
}
describe("V7 material review; controlled semantics, real policy/journal/schema", () => {
  it("accepts a creative paraphrase with no editorial plan and formatted source", async () => {
    const s = setup(3),
      r = await s.review();
    expect(r.status).toBe("passed");
    expect(r.policyVersion).toBe(7);
    expect(proposalReviewRecordSchema.safeParse(r).success).toBe(true);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0].messages[0].content).not.toContain("16");
  });
  it.each([
    "narrative_gap",
    "narrative_structure",
    "aesthetic",
    "fact_omission",
  ])(
    "keeps optional %s advisory regardless of valid citation",
    async category => {
      const s = setup();
      s.setAmend((r, d) => ({
        ...r,
        findings: [s.finding(d, "art", { category })],
      }));
      const r = await s.review();
      expect(r.status).toBe("passed");
      expect(r.findings[0].effect).toBe("advisory");
      expect(s.calls).toHaveLength(1);
    }
  );
  it("does not veto uncertainty about an optional hook", async () => {
    const s = setup();
    s.setAmend((r, d) => ({
      ...r,
      findings: [s.finding(d, "art", { certainty: "uncertain" })],
    }));
    expect((await s.review()).status).toBe("passed");
    expect(s.calls).toHaveLength(1);
  });
  it.each(["art", "caption"])(
    "blocks unsupported commercial claim in %s even labeled advisory",
    async scope => {
      const s = setup();
      s.setAmend((r, d) => ({
        ...r,
        findings: [
          s.finding(d, scope, {
            category: "unsupported_claim",
            consequence: "false_claim",
            sourceId: null,
            sourceQuote: "",
            expected: "Retirar desconto não fornecido",
            effect: "advisory",
          }),
        ],
      }));
      const r = await s.review();
      expect(r.status).toBe("correction_required");
      expect(r.findings[0].effect).toBe("blocking");
      expect(s.calls).toHaveLength(1);
    }
  );
  it("keeps material uncertainty inconclusive without buying a formal repair", async () => {
    const s = setup();
    s.setAmend((r, d) => ({
      ...r,
      findings: [
        s.finding(d, "art", {
          category: "unsupported_claim",
          consequence: "false_claim",
          certainty: "uncertain",
          sourceId: null,
          sourceQuote: "",
        }),
      ],
    }));
    expect((await s.review()).status).toBe("inconclusive");
    expect(s.calls).toHaveLength(1);
  });
  it("discards harmless auxiliary fields and preserves the original receipt", async () => {
    const s = setup();
    s.setAmend(r => ({ ...r, comentarioAuxiliar: "não autoriza decisão" }));
    const r: any = await s.review();
    expect(r.status).toBe("passed");
    expect(r.discardedFields).toContain("review.comentarioAuxiliar");
    expect(s.calls).toHaveLength(1);
    expect(JSON.stringify([...s.deps.reviewOperationCache.values()])).toContain(
      "comentarioAuxiliar"
    );
  });
  it("rejects duplicate decision keys, including escaped equivalents", () => {
    expect(() =>
      decodeReviewV7('{"outcome":"reviewed","outc\\u006fme":"inconclusive"}')
    ).toThrow("response_invalid");
  });
  it("requires complete text-unit coverage and limits formal repair", async () => {
    const s = setup();
    s.setAmend(r => ({ ...r, checkedTextUnits: [] }));
    expect((await s.review()).status).toBe("inconclusive");
    expect(s.calls).toHaveLength(2);
  });
  it("rejects fabricated source provenance without accepting the content", async () => {
    const s = setup();
    s.setAmend((r, d) => ({
      ...r,
      findings: [s.finding(d, "art", { sourceQuote: "50% de desconto" })],
    }));
    expect((await s.review()).status).toBe("inconclusive");
    expect(s.calls).toHaveLength(2);
  });
  it("reuses completed review but prevents a second initial hash purchase", async () => {
    const s = setup();
    expect((await s.review()).status).toBe("passed");
    expect((await s.review()).status).toBe("passed");
    expect(s.calls).toHaveLength(1);
    s.copy.caption += " outro";
    await expect(s.review()).rejects.toThrow(
      "preparation_contract_incompatible"
    );
    expect(s.calls).toHaveLength(1);
  });
  it("rejects context mutation before any new paid effect", async () => {
    const s = setup();
    s.input.prompt += " novo preço";
    await expect(s.review()).rejects.toThrow(
      "preparation_contract_incompatible"
    );
    expect(s.calls).toHaveLength(0);
  });
  it("does not let caption satisfy an art literal requirement", async () => {
    const s = setup();
    s.input.executionBrief = {
      creationMode: "execution",
      format: "static",
      platform: "instagram",
      objective: "engage",
      interventionLevel: "optimize_structure",
      contentSourceType: "freeform",
      rawInput: s.input.prompt,
      contentRequirements: [
        { kind: "literal", value: "Conheça a ferramenta", scope: "art" },
      ],
    };
    s.pin();
    const r = await s.review();
    expect(r.status).toBe("correction_required");
    expect(r.findings.some(f => f.category === "explicit_requirement")).toBe(
      true
    );
  });
  it("accepts a semantic requirement judgment with visible evidence, without literal matching", async () => {
    const s = setup();
    s.input.executionBrief = {
      creationMode: "execution",
      format: "static",
      platform: "instagram",
      objective: "engage",
      interventionLevel: "optimize_structure",
      contentSourceType: "freeform",
      rawInput: s.input.prompt,
      contentRequirements: [
        {
          kind: "meaning",
          value: "selecionar perguntas por tema",
          scope: "art",
        },
      ],
    };
    s.pin();
    expect((await s.review()).status).toBe("passed");
  });
  it("can reject material text embedded only in image pixels", async () => {
    const s = setup();
    s.setAmend(r => ({
      ...r,
      findings: [
        {
          category: "unsupported_claim",
          slideIndex: 0,
          fieldId: null,
          unitId: null,
          scope: "art",
          observed: "50% de desconto",
          expected: "Retirar a oferta da imagem",
          sourceId: null,
          sourceQuote: "",
          explanation: "Oferta comercial não consta na fonte.",
          consequence: "false_claim",
          certainty: "established",
          effect: "blocking",
        },
      ],
    }));
    expect((await s.review()).status).toBe("correction_required");
  });
  it.each([1, 2, 3, 5, 10])(
    "integrates %i native slides without a factual-plan gate",
    async count => {
      const s = setup(count);
      const generateText = vi.fn(async (params: any) =>
        params.taskRoute === "post_evaluation"
          ? s.deps.generateText(params)
          : { choices: [{ message: { content: JSON.stringify(s.copy) } }] }
      );
      const r = await executeProposalWorkflow(
        {
          ...s.input,
          selectedDefinitions: s.copy.slides.map(() => definition),
        },
        {
          actor: id,
          generateText,
          measureText: metrics,
          renderReviewScenes: renderReviewFixtureScenes,
        }
      );
      expect(r.status).toBe("ready");
      expect(generateText).toHaveBeenCalledTimes(2);
      const prompt = generateText.mock.calls[0][0].messages
        .map((m: any) => m.content)
        .join("\n");
      expect(prompt).not.toContain("planeje a história em editorialPlan");
    }
  );
});
it("does not buy a formal repair for a complete inconclusive envelope without inspected slides", async () => {
  const s = setup();
  s.setAmend(r => ({
    ...r,
    outcome: "inconclusive",
    limitation: "source_conflict",
    reviewedSlides: [],
    checkedTextUnits: [],
    requirementChecks: [],
    messageAssessment: {
      status: "uncertain",
      explanation: "Condições comerciais conflitantes.",
    },
  }));
  const r = await s.review();
  expect(r.status).toBe("inconclusive");
  expect(r.limitation).toBe("proposal_review_source_conflict");
  expect(proposalReviewRecordSchema.safeParse(r).success).toBe(true);
  expect(s.calls).toHaveLength(1);
});
it("does not accept an unsupported guarantee merely because consequence/effect are downgraded", async () => {
  const s = setup();
  s.setAmend((r, d) => ({
    ...r,
    findings: [
      s.finding(d, "art", {
        category: "unsupported_claim",
        consequence: "none",
        sourceId: null,
        sourceQuote: "",
        effect: "advisory",
        expected: "Retirar garantia absoluta",
      }),
    ],
  }));
  expect((await s.review()).status).toBe("inconclusive");
  expect(s.calls).toHaveLength(2);
});
it("repairs contradictory non-material classification instead of buying a copy rewrite", async () => {
  const s = setup();
  let rounds = 0;
  s.setAmend((r, d) => ({ ...r, findings: [s.finding(d, "art", {
    category: rounds++ === 0 ? "unsupported_claim" : "aesthetic",
    consequence: "none", effect: "advisory", sourceId: null, sourceQuote: "",
    explanation: "Benefício razoável; suavizar é uma sugestão de redação, sem dano material.",
  })] }));
  const review = await s.review();
  expect(review.status).toBe("passed");
  expect(review.findings[0].effect).toBe("advisory");
  expect(s.calls).toHaveLength(2);
  expect(s.calls[1].traceLabel).toContain("evidence_repair");
});
it("keeps an invented historical-average rule material in affirmative guidance", async () => {
  const s = setup();
  s.input.platform = "instagram";
  s.input.prompt = "A marca acompanha o preço do produto ao longo dos dias para comparar com o período observado.";
  s.copy.slides[0].values[1].value = "Uma oferta só vale a pena quando está abaixo da média histórica.";
  s.input.editorialContextHash = editorialContextV7(s.input, 6).hash;
  s.setAmend((r, d) => {
    const unit = d.textUnits.find((u:any) => u.fieldId === "field-1");
    return {...r, findings:[s.finding(d, "art", {unitId:unit.id, fieldId:unit.fieldId, observed:unit.text, category:"unsupported_claim", consequence:"false_claim", effect:"blocking", sourceId:null, sourceQuote:"", expected:"Descrever a comparação no período observado sem inventar uma regra de média histórica.", explanation:"A fonte descreve acompanhamento; não estabelece média nem um critério universal de compra."})]};
  });
  const review = await s.review();
  expect(review.status).toBe("correction_required");
  expect(review.findings[0].effect).toBe("blocking");
  expect(s.calls).toHaveLength(1);
  expect(s.calls[0].messages[0].content).toContain("preço abaixo da média são conceitos diferentes");
});
it("recovers only the affected native field and keeps healthy text, caption, hashtags and media pinned", async () => {
  const s = setup();
  s.copy.slides[0].values[1].value = "Assine com 50% de desconto";
  let reviews = 0;
  s.setAmend((r, d) => {
    const u = d.textUnits.find((u: any) => u.fieldId === "field-1");
    return reviews++ === 0
      ? {
          ...r,
          findings: [
            s.finding(d, "art", {
              unitId: u.id,
              fieldId: u.fieldId,
              observed: u.text,
              category: "unsupported_claim",
              consequence: "false_claim",
              sourceId: null,
              sourceQuote: "",
              expected: "Retirar oferta inventada",
            }),
          ],
        }
      : r;
  });
  const generateText = vi.fn(async (params: any) => {
    if (params.taskRoute === "post_evaluation")
      return s.deps.generateText(params);
    const copy = structuredClone(s.copy);
    if (params.traceLabel?.includes("editorial_recovery")) {
      copy.slides[0].values[0].value = "MUDANÇA INDEVIDA";
      copy.slides[0].values[1].value = "Filtre questões por assunto";
      copy.caption = "Legenda indevida";
      copy.hashtags = ["#indevido"];
    }
    return { choices: [{ message: { content: JSON.stringify(copy) } }] };
  });
  const r = await executeProposalWorkflow(
    { ...s.input, selectedDefinitions: [definition] },
    {
      actor: id,
      generateText,
      measureText: metrics,
      renderReviewScenes: renderReviewFixtureScenes,
    }
  );
  expect(r.status).toBe("ready");
  expect(r.reviews?.map(r => r.status)).toEqual([
    "correction_required",
    "passed",
  ]);
  expect(generateText).toHaveBeenCalledTimes(4);
  if (r.status !== "ready") throw new Error("not_ready");
  expect(r.bundle.caption).toBe(s.copy.caption);
  expect(r.bundle.hashtags).toEqual(s.copy.hashtags);
  expect(JSON.stringify(r.bundle)).not.toContain("MUDANÇA INDEVIDA");
  expect(JSON.stringify(r.bundle)).toContain("Filtre questões por assunto");
});
it("does not purchase another copy for optional editorial feedback", async () => {
  const s = setup();
  s.setAmend((r, d) => ({ ...r, findings: [s.finding(d)] }));
  const generateText = vi.fn(async (params: any) =>
    params.taskRoute === "post_evaluation"
      ? s.deps.generateText(params)
      : { choices: [{ message: { content: JSON.stringify(s.copy) } }] }
  );
  const r = await executeProposalWorkflow(
    { ...s.input, selectedDefinitions: [definition] },
    {
      actor: id,
      generateText,
      measureText: metrics,
      renderReviewScenes: renderReviewFixtureScenes,
    }
  );
  expect(r.status).toBe("ready");
  expect(generateText).toHaveBeenCalledTimes(2);
});
it("returns a durable typed failure when the renderer is unavailable, without approving or buying review", async () => {
  const s = setup();
  const generateText = vi.fn(async () => ({
    choices: [{ message: { content: JSON.stringify(s.copy) } }],
  }));
  const r = await executeProposalWorkflow(
    { ...s.input, selectedDefinitions: [definition] },
    {
      actor: id,
      generateText,
      measureText: metrics,
      renderReviewScenes: async () => {
        throw new Error("renderer unavailable");
      },
    }
  );
  expect(r.status).toBe("failed");
  expect(r.failure?.code).toBe("review_render_failed");
  expect(r.reviews?.[0].status).toBe("inconclusive");
  expect(generateText).toHaveBeenCalledTimes(1);
});
it("has no sixteen-fact inventory gate for a dense source", async () => {
  const s = setup(5);
  s.input.prompt +=
    "\n" +
    Array.from(
      { length: 24 },
      (_, i) => `A opção ${i + 1} corresponde ao assunto ${i + 1}.`
    ).join("\n");
  s.pin();
  const r = await s.review();
  expect(r.status).toBe("passed");
  expect(s.calls).toHaveLength(1);
  expect(
    reviewPayloadV7(s.calls[0]).context.sources.some((x: any) =>
      x.text.includes("opção 24")
    )
  ).toBe(true);
});
it("repairs caption only and declares its changed target to the recheck", async () => {
  const s = setup();
  s.copy.caption = "50% de desconto";
  let n = 0;
  s.setAmend((r, d) =>
    n++ === 0
      ? {
          ...r,
          findings: [
            s.finding(d, "caption", {
              category: "unsupported_claim",
              consequence: "false_claim",
              sourceId: null,
              sourceQuote: "",
              expected: "Retirar desconto inventado",
            }),
          ],
        }
      : r
  );
  const generateText = vi.fn(async (params: any) => {
    if (params.taskRoute === "post_evaluation")
      return s.deps.generateText(params);
    const candidate = structuredClone(s.copy);
    if (params.traceLabel?.includes("editorial_recovery")) {
      candidate.caption = "Conheça a ferramenta";
      candidate.slides[0].values[0].value = "ALTERAÇÃO NÃO AUTORIZADA";
    }
    return { choices: [{ message: { content: JSON.stringify(candidate) } }] };
  });
  const r = await executeProposalWorkflow(
    { ...s.input, selectedDefinitions: [definition] },
    {
      actor: id,
      generateText,
      measureText: metrics,
      renderReviewScenes: renderReviewFixtureScenes,
    }
  );
  expect(r.status).toBe("ready");
  if (r.status !== "ready") throw new Error("not_ready");
  expect(r.bundle.caption).toBe("Conheça a ferramenta");
  expect(JSON.stringify(r.bundle)).not.toContain("ALTERAÇÃO NÃO AUTORIZADA");
  expect(reviewPayloadV7(s.calls[1]).previous.changedTargets).toContainEqual({
    slideIndex: 0,
    fieldId: "$caption",
  });
});
it("removes only the unsupported hashtag, preserving other tags and native fields", async () => {
  const s = setup();
  s.copy.hashtags = ["#50off", "#estudos"];
  let n = 0;
  s.setAmend((r, d) => {
    const u = d.textUnits.find(
      (u: any) => u.fieldId === "$hashtags" && u.itemIndex === 0
    );
    return n++ === 0
      ? {
          ...r,
          findings: [
            s.finding(d, "caption", {
              unitId: u.id,
              fieldId: u.fieldId,
              observed: "#50",
              category: "unsupported_claim",
              consequence: "false_claim",
              sourceId: null,
              sourceQuote: "",
              expected: "Remover hashtag de desconto",
            }),
          ],
        }
      : r;
  });
  const generateText = vi.fn(async (params: any) => {
    if (params.taskRoute === "post_evaluation")
      return s.deps.generateText(params);
    const candidate = structuredClone(s.copy);
    if (params.traceLabel?.includes("editorial_recovery"))
      candidate.hashtags = [];
    return { choices: [{ message: { content: JSON.stringify(candidate) } }] };
  });
  const r = await executeProposalWorkflow(
    { ...s.input, selectedDefinitions: [definition] },
    {
      actor: id,
      generateText,
      measureText: metrics,
      renderReviewScenes: renderReviewFixtureScenes,
    }
  );
  expect(r.status).toBe("ready");
  if (r.status !== "ready") throw new Error("not_ready");
  expect(r.bundle.hashtags).toEqual(["#estudos"]);
  expect(r.bundle.caption).toBe(s.copy.caption);
  expect(reviewPayloadV7(s.calls[1]).previous.changedTargets).toContainEqual({
    slideIndex: 0,
    fieldId: "$hashtags",
  });
});

it("in profile 5, tone preference remains advisory/passed while explicit requirement or false claim blocks", async () => {
  const s1 = setup();
  s1.input.executionBrief = {
    creationMode: "execution",
    format: "static",
    platform: "instagram",
    objective: "engage",
    tone: "formal",
    audience: "Advogados",
    brandEssence: "Justiça e rigor",
    interventionLevel: "optimize_structure",
    contentSourceType: "freeform",
    rawInput: s1.input.prompt,
  };
  s1.input.reviewExecutionConfig = resolveReviewExecutionConfigV7(5);
  s1.input.editorialContextHash = editorialContextV7(s1.input, 5).hash;

  // Mere tone preference is advisory -> outcome passes
  s1.setAmend((r, d) => ({
    ...r,
    findings: [
      s1.finding(d, "art", {
        category: "aesthetic",
        consequence: "none",
        effect: "advisory",
        observed: "Seu próximo estudo começa aqui",
        expected: "Preferível manter tom mais formal",
      }),
    ],
  }));

  const resPassed = await s1.review();
  expect(resPassed.status).toBe("passed");
  expect(resPassed.findings[0].effect).toBe("advisory");

  // False claim or unfulfilled requirement blocks -> correction_required
  const s2 = setup();
  s2.input.executionBrief = {
    creationMode: "execution",
    format: "static",
    platform: "instagram",
    objective: "engage",
    tone: "formal",
    audience: "Advogados",
    brandEssence: "Justiça e rigor",
    interventionLevel: "optimize_structure",
    contentSourceType: "freeform",
    rawInput: s2.input.prompt,
  };
  s2.input.reviewExecutionConfig = resolveReviewExecutionConfigV7(5);
  s2.input.editorialContextHash = editorialContextV7(s2.input, 5).hash;

  s2.setAmend((r, d) => ({
    ...r,
    findings: [
      s2.finding(d, "art", {
        category: "unsupported_claim",
        consequence: "false_claim",
        observed: "Seu próximo estudo começa aqui",
        expected: "Remover alegação não comprovada",
        sourceId: null,
        sourceQuote: "",
        effect: "blocking",
      }),
    ],
  }));

  const resBlocked = await s2.review();
  expect(resBlocked.status).toBe("correction_required");
});
