import { describe, expect, it, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { instantiateCompleteDesign } from "@shared/completeDesignGeneration";
import { resolveArsenalGeometry } from "@shared/arsenalGeometry";
import { proposalReviewRecordSchema } from "@shared/proposalReview";
import { proposalReviewResponseV10Schema } from "@shared/proposalReviewV10";
import { arsenalHash } from "@shared/arsenalContent";
import type { GenerationIntent } from "@shared/generationPlan";
import { reviewProposal } from "./proposalReview";
import { editorialContextV9 } from "./editorialContextV9";
import {
  resolveReviewExecutionConfigV10,
  reviewInstructionsV10,
  assertReviewExecutionConfigV10,
} from "./reviewExecutionConfigV10";
import {
  resolveReviewExecutionConfigV9,
  assertReviewExecutionConfigV9,
} from "./reviewExecutionConfigV9";
import { healthyReviewV10Fixture } from "./proposalReviewV10.fixture";
import { reviewPayloadV7 } from "./proposalReviewV7.fixture";
import { renderReviewFixtureScenes } from "./proposalReview.fixture";
import {
  canonicalizeRequirementChecksV10,
  decodeReviewV10,
} from "./proposalReviewPolicyV10";
import {
  buildSourceEvidenceV10,
  reviewTextUnitsV10,
} from "./reviewEvidenceV10";
import { buildReviewEvidenceAliases } from "./reviewEvidence";

const id = "00000000-0000-4000-8000-000000000001";
const definition = completeDesignTestDefinitions()[0];
function setup(
  options: {
    texts?: string[];
    context?: string;
    sourceReferences?: any[];
    amend?: (response: any, data: any, invocation: number) => any;
    error?: Error;
    intent?: GenerationIntent;
    prompt?: string;
    hashtags?: string[];
    bodyTexts?: string[];
  } = {}
) {
  const input: any = {
    requestId: id,
    runId: id,
    proposalId: "v10-proposal",
    slot: 0,
    prompt: options.prompt ?? "Crie um post a partir do material fornecido.",
    generationIntent: options.intent,
    contextContent:
      options.context ??
      "Condição: teste gratuito por sete dias. Conheça o serviço.",
    sourceReferences: options.sourceReferences,
    platform: "instagram",
    postMode: (options.texts?.length ?? 1) > 1 ? "carousel" : "static",
    reviewPolicyVersion: 10,
    reviewExecutionConfig: resolveReviewExecutionConfigV10(),
  };
  input.editorialContext = editorialContextV9(input);
  input.editorialContextHash = input.editorialContext.hash;
  const copy: any = {
    caption: "Conheça o serviço",
    hashtags: options.hashtags ?? [],
    slides: (options.texts ?? ["Venha conhecer"]).map((text, index) => ({
      values: [
        { fieldId: "field-0", value: text },
        {
          fieldId: "field-1",
          value: options.bodyTexts?.[index] ?? "Saiba mais",
        },
      ],
      mediaPrompts: [],
    })),
  };
  const compositions = copy.slides.map((slide: any, i: number) =>
    resolveArsenalGeometry(
      instantiateCompleteDesign({
        definition,
        values: slide.values,
        mediaPrompts: [],
        runId: id,
        slot: 0,
        slide: i,
        planHash: "a".repeat(64),
        experimental: true,
      }),
      { measureText: () => ({ height: 20, lines: [{ width: 100 }], runs: [] }) }
    )
  );
  let calls = 0;
  const generateText = vi.fn(async (params: any) => {
    calls++;
    if (options.error) throw options.error;
    const data = reviewPayloadV7(params);
    const value =
      options.amend?.(healthyReviewV10Fixture(params), data, calls) ??
      healthyReviewV10Fixture(params);
    return {
      choices: [
        {
          message: {
            content: typeof value === "string" ? value : JSON.stringify(value),
          },
          finish_reason: "stop",
        },
      ],
    };
  });
  const render = vi.fn(renderReviewFixtureScenes);
  const deps: any = {
    actor: id,
    generateText,
    renderReviewScenes: render,
    reviewOperationCache: new Map(),
    reviewRepairBudget: new Set(),
  };
  return {
    input,
    copy,
    deps,
    generateText,
    render,
    review: () =>
      reviewProposal(
        input,
        deps,
        copy.slides.map(() => definition),
        compositions,
        copy,
        "initial"
      ),
  };
}
function targetCheck(
  r: any,
  d: any,
  verdict: string,
  evidenceIds: string[] = []
) {
  const target = d.textUnits.find((u: any) => u.fieldId === "field-0");
  const check = r.unitChecks.find((c: any) => c.unitId === target.id);
  Object.assign(check, {
    verdict,
    evidenceIds,
    editorialBasis: null,
    meaning: target.text.replace(/\s+/g, " "),
    explanation: "Julgamento factual controlado pelo cenário de teste.",
  });
  return target;
}
describe("material review V10", () => {
  const fiveIntent: GenerationIntent = {
    version: 1,
    objective: "Apresentar cinco cuidados",
    adaptation: "controlled",
    tone: {
      description: "Direto",
      origin: "inferred",
      rationale: "Orientações práticas",
    },
    requirements: [
      {
        id: "req-cinco-cuidados",
        description: "Liste cinco cuidados completos na arte.",
        surface: "art",
        origin: "explicit",
        requestQuote: "Liste cinco cuidados completos na arte.",
        itemCount: 5,
      },
    ],
    content: [
      "Separar por assunto",
      "Nomear com data",
      "Manter cópia",
      "Revisar permissões",
      "Descartar duplicatas",
    ].map((meaning, i) => ({
      id: `item-${i}`,
      meaning,
      requirementIds: ["req-cinco-cuidados"],
      sourceIds: [],
    })),
  };
  const intentDuplicate = (r: any, d: any, count = 5) => {
    const titles = d.textUnits
      .filter((u: any) => u.fieldId === "field-0")
      .slice(0, count);
    r.intentChecks[0].deliveries = titles.map((u: any, i: number) => ({
      contentId: `item-${i}`,
      unitIds: [u.id],
    }));
    r.requirementChecks.push({
      requirementId: "req-cinco-cuidados",
      status: r.intentChecks[0].status,
      unitIds: titles.map((u: any) => u.id).reverse(),
      explanation: "Duplicata do julgamento de intenção.",
    });
    return r;
  };
  it("reviews execution constraints from the source context without demanding invented content deliveries", async () => {
    const s = setup({
      prompt: "Use somente os fatos fornecidos. Prefira composição tipográfica sem foto.",
      intent: {
        ...fiveIntent,
        requirements: [{ id: "execution", kind: "execution", description: "Composição tipográfica sem foto", origin: "explicit", requestQuote: "Prefira composição tipográfica sem foto.", surface: "art", itemCount: null }],
        content: [{ id: "idea", meaning: "Conheça o serviço", sourceIds: [], requirementIds: [] }],
      },
    });
    const result = await s.review();
    expect(result.status).toBe("passed");
    const data = reviewPayloadV7(s.generateText.mock.calls[0][0]);
    expect(data.generationIntent.requirements).toEqual([]);
    expect(JSON.stringify(data.context)).toContain("composição tipográfica sem foto");
    expect(s.input.generationIntent.requirements[0].kind).toBe("execution");
  });
  it.each([5, 3])(
    "canonicalizes a coherent intent duplicate without inventing any of its %i deliveries",
    async count => {
      const s = setup({
        intent: fiveIntent,
        prompt: fiveIntent.requirements[0].requestQuote!,
        texts: fiveIntent.content.map(c => c.meaning),
        amend: (r, d) => {
          expect(d.checkInventories).toEqual({
            requirementChecks: [],
            intentChecks: ["req-cinco-cuidados"],
          });
          return intentDuplicate(r, d, count);
        },
      });
      const result = await s.review();
      expect(result.status).toBe(
        count === 5 ? "passed" : "correction_required"
      );
      expect(result.requirementChecks).toEqual([]);
      if (result.policyVersion !== 10) throw new Error("Expected V10");
      expect(result.intentChecks[0].deliveries).toHaveLength(count);
      expect(result.intentChecks[0].status).toBe(
        count === 5 ? "met" : "missing"
      );
      expect(result.discardedFields).toEqual([
        "requirementChecks[0]:duplicate_of_intentChecks:req-cinco-cuidados",
      ]);
      expect(s.generateText).toHaveBeenCalledTimes(1);
    }
  );
  it("preserves the legacy inventory and rejects unknown, contradictory or incomplete namespace evidence", () => {
    const response: any = {
      requirementChecks: [
        {
          requirementId: "legacy",
          status: "met",
          unitIds: ["legacy-unit"],
          explanation: "",
        },
        {
          requirementId: "intent",
          status: "met",
          unitIds: ["u1", "u2"],
          explanation: "",
        },
      ],
      intentChecks: [
        {
          requirementId: "intent",
          status: "met",
          deliveries: [
            { contentId: "c1", unitIds: ["u1"] },
            { contentId: "c2", unitIds: ["u2"] },
          ],
          explanation: "",
        },
      ],
    };
    const original = structuredClone(response);
    expect(
      canonicalizeRequirementChecksV10(response, ["legacy"], ["intent"])
        .requirementChecks
    ).toEqual([response.requirementChecks[0]]);
    expect(response).toEqual(original);
    for (const change of [
      (r: any) => {
        r.requirementChecks[1].requirementId = "unknown";
      },
      (r: any) => {
        r.requirementChecks[1].status = "missing";
      },
      (r: any) => {
        r.requirementChecks[1].unitIds = ["u1"];
      },
      (r: any) => {
        r.requirementChecks[1].unitIds = ["u1", "u2", "u3"];
      },
      (r: any) => {
        r.requirementChecks[1].unitIds = ["u1", "u1"];
      },
      (r: any) => {
        r.intentChecks = [];
      },
      (r: any) => {
        r.intentChecks.push(r.intentChecks[0]);
      },
      (r: any) => {
        r.requirementChecks.shift();
      },
      (r: any) => {
        r.requirementChecks.push(r.requirementChecks[1]);
      },
    ]) {
      const bad = structuredClone(response);
      change(bad);
      expect(() =>
        canonicalizeRequirementChecksV10(bad, ["legacy"], ["intent"])
      ).toThrow("proposal_review_incomplete_evidence");
    }
  });
  it("gives formal repair the contradictory namespace judgment and exact inventory", async () => {
    const s = setup({
      intent: fiveIntent,
      prompt: fiveIntent.requirements[0].requestQuote!,
      texts: fiveIntent.content.map(c => c.meaning),
      amend: (r, d, call) => {
        intentDuplicate(r, d);
        if (call === 1) r.requirementChecks[0].status = "missing";
        return r;
      },
    });
    expect((await s.review()).status).toBe("passed");
    const first = reviewPayloadV7(s.generateText.mock.calls[0][0]),
      second = reviewPayloadV7(s.generateText.mock.calls[1][0]);
    expect(second.copy).toEqual(first.copy);
    expect(JSON.parse(second.formalRepair.violations[1])).toMatchObject({
      rule: "intent_duplicate_judgment_mismatch",
      requirementId: "req-cinco-cuidados",
      receivedStatus: "missing",
      expectedStatus: "met",
      expectedUnitIds: expect.any(Array),
    });
    expect(s.render).toHaveBeenCalledTimes(1);
  });
  it("reports invalid schema paths to formal repair instead of an empty diagnostic", async () => {
    const s = setup({
      amend: (r, _d, call) => {
        if (call === 1) r.unitChecks[0].meaning = "";
        return r;
      },
    });
    expect((await s.review()).status).toBe("passed");
    const repair = reviewPayloadV7(s.generateText.mock.calls[1][0]);
    expect(JSON.parse(repair.formalRepair.violations[1])).toMatchObject({
      rule: "response_schema",
      issues: expect.arrayContaining([
        expect.objectContaining({ path: "unitChecks.0.meaning" }),
      ]),
    });
  });
  it.each([
    {
      text: "Criar padrões claros de nomenclatura e backup economiza horas de busca e elimina a perda acidental de dados.",
      verdict: "unsupported",
      status: "correction_required",
    },
    {
      text: "Uma rotina clara pode facilitar a busca e ajudar a reduzir o risco de perda.",
      verdict: "editorial",
      status: "passed",
    },
  ])(
    "preserves a controlled judgment of guarantee versus bounded benefit: $verdict",
    async ({ text, verdict, status }) => {
      const s = setup({
        texts: [text],
        context:
          "Cuidados: separar por assunto; nomear arquivos com data; manter cópia de segurança; revisar permissões; descartar duplicatas.",
        amend: (r, d) => {
          const target = targetCheck(r, d, verdict);
          const check = r.unitChecks.find((c: any) => c.unitId === target.id);
          check.editorialBasis = verdict === "editorial" ? "opinion" : null;
          check.explanation =
            verdict === "editorial"
              ? "Benefício plausível delimitado, sem garantir economia de tempo ou ausência de perda."
              : "A fonte recomenda práticas; não sustenta economia de horas nem eliminação total da perda de dados.";
          return r;
        },
      });
      const result = await s.review();
      expect(result.status).toBe(status);
      expect(s.generateText).toHaveBeenCalledTimes(1);
      if (verdict === "unsupported")
        expect(result.findings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              category: "unsupported_claim",
              effect: "blocking",
              observed: text,
            }),
          ])
        );
      else expect(result.findings).toEqual([]);
      expect(reviewInstructionsV10()).toContain(
        "opinion só cabe em apreciação subjetiva"
      );
      expect(reviewInstructionsV10()).toContain("não neutralize uma garantia");
    }
  );
  it("cannot use opinion to neutralize an otherwise identified unsupported promise", async () => {
    const s = setup({
      texts: ["Uma rotina elimina a perda acidental de dados."],
      amend: (r, d) => {
        const target = d.textUnits.find((u: any) => u.fieldId === "field-0");
        r.unitChecks.find((c: any) => c.unitId === target.id).editorialBasis =
          "opinion";
        r.findings.push({
          category: "unsupported_claim",
          unitId: target.id,
          slideIndex: null,
          observedInImage: "",
          expected: "Delimitar benefício sem garantir ausência de perdas.",
          evidenceIds: [],
          explanation: "A fonte não sustenta risco zero.",
          consequence: "false_claim",
          certainty: "established",
        });
        return r;
      },
    });
    expect((await s.review()).status).toBe("inconclusive");
    const repair = reviewPayloadV7(s.generateText.mock.calls[1][0]);
    expect(JSON.parse(repair.formalRepair.violations[1])).toMatchObject({
      rule: "factual_judgment_inconsistent",
      verdict: "editorial",
      unitId: expect.any(String),
    });
  });
  it("resolves references without the reviewer's whitespace-sensitive quotes or offsets", async () => {
    const s = setup({
      texts: ["Teste gratuito\n\npor sete dias"],
      amend: (r, d) => {
        const source = d.context.sourceEvidence.find((e: any) =>
          e.text.includes("sete dias")
        );
        targetCheck(r, d, "supported", [source.id]);
        expect(source).not.toHaveProperty("start");
        expect(source).not.toHaveProperty("end");
        return r;
      },
    });
    const result = await s.review();
    expect(result.status).toBe("passed");
    expect(s.generateText).toHaveBeenCalledTimes(1);
    expect(result.policyVersion).toBe(10);
    if (result.policyVersion !== 10) throw new Error("Expected V10");
    expect(result.factualAudit.claims[0].observed).toBe(
      "Teste gratuito\n\npor sete dias"
    );
    const ref = result.factualAudit.claims[0].sources[0];
    expect(
      s.input.editorialContext.sources
        .find((source: any) => source.id === ref.sourceId)
        .text.slice(ref.start, ref.end)
    ).toContain("sete dias");
    expect(
      proposalReviewRecordSchema.safeParse(JSON.parse(JSON.stringify(result)))
        .success
    ).toBe(true);
  });
  it("preserves native unit identity when text or native traversal order changes", () => {
    const aliases = buildReviewEvidenceAliases([]);
    const a: any = {
      caption: "Convite",
      hashtags: [],
      slides: [
        {
          values: [
            { fieldId: "title", value: "A" },
            { fieldId: "body", value: "B" },
          ],
        },
      ],
    };
    const b = {
      ...a,
      slides: [
        {
          values: [
            { fieldId: "body", value: "Texto novo" },
            { fieldId: "title", value: "Título novo" },
          ],
        },
      ],
    };
    const original = reviewTextUnitsV10(a, aliases),
      edited = reviewTextUnitsV10(b, aliases);
    for (const u of original)
      expect(edited.find(v => v.fieldId === u.fieldId)?.id).toBe(u.id);
  });
  it("retains original origin, Unicode and guidance type even for duplicate wording", () => {
    const context = editorialContextV9({
      prompt: "Crie",
      platform: "instagram",
      postMode: "static",
      sourceReferences: [
        { id: "voice", kind: "text", purpose: "guidance", facts: "Só aqui 🚀" },
        { id: "facts", kind: "text", purpose: "content", facts: "Só aqui 🚀" },
      ],
    } as any);
    const inventory = buildSourceEvidenceV10(context).filter(
      e => e.text === "Só aqui 🚀"
    );
    expect(inventory.map(e => e.kind).sort()).toEqual(["content", "guidance"]);
    expect(new Set(inventory.map(e => e.id)).size).toBe(2);
    for (const e of inventory)
      expect(
        context.sources
          .find(s => s.id === e.sourceId)!
          .text.slice(e.start, e.end)
      ).toBe(e.text);
    const long = editorialContextV9({
      prompt: "a".repeat(3999) + "🚀" + "b".repeat(4500),
      platform: "instagram",
      postMode: "static",
    } as any);
    expect(
      buildSourceEvidenceV10(long)
        .filter(e => e.sourceId === long.sources[0].id)
        .map(e => e.text)
        .join("")
    ).toBe(long.sources[0].text);
    expect(
      buildSourceEvidenceV10(long).every(
        e => e.text.length <= 4000 && !/[\uD800-\uDBFF]$/.test(e.text)
      )
    ).toBe(true);
  });
  it("does not use valid JSON or a typed guidance ID as proof of a factual assertion", async () => {
    const s = setup({
      sourceReferences: [
        {
          id: "voice",
          kind: "text",
          purpose: "guidance",
          facts: "Entrega garantida",
        },
      ],
      texts: ["Entrega garantida"],
      amend: (r, d) => {
        targetCheck(r, d, "supported", [
          d.context.sourceEvidence.find((e: any) => e.kind === "guidance").id,
        ]);
        expect(proposalReviewResponseV10Schema.safeParse(r).success).toBe(true);
        return r;
      },
    });
    const result = await s.review();
    expect(result.status).toBe("inconclusive");
    expect(result.limitation).toBe("proposal_review_incomplete_evidence");
    expect(s.generateText).toHaveBeenCalledTimes(2);
    expect(s.render).toHaveBeenCalledTimes(1);
  });
  it.each([
    "A falta de itens essenciais quase sempre decorre de compras de última hora",
    "Visibilidade em tempo real é a única base para negociações eficientes",
    "Experimente: o serviço será gratuito para sempre",
  ])(
    "keeps a controlled unsupported causal/exclusive/conditional judgment blocking: %s",
    async text => {
      const s = setup({
        texts: [text],
        amend: (r, d) => {
          targetCheck(r, d, "unsupported");
          return r;
        },
      });
      const result = await s.review();
      expect(result.status).toBe("correction_required");
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: "unsupported_claim",
            effect: "blocking",
            observed: text,
          }),
        ])
      );
      expect(s.generateText).toHaveBeenCalledTimes(1);
    }
  );
  it("rejects the old blanket 26 non_factual / zero-claims response", async () => {
    const s = setup({
      amend: (r, d) => {
        const { unitChecks, sequenceAssessment, ...old } = r;
        return {
          ...old,
          checkedTextUnits: d.textUnits.map((u: any) => u.id),
          factualAudit: {
            units: Array.from({ length: 26 }, (_, i) => ({
              unitId: `t${i + 1}`,
              classification: "non_factual",
              claimIds: [],
            })),
            claims: [],
          },
        };
      },
    });
    expect((await s.review()).status).toBe("inconclusive");
    expect(s.generateText).toHaveBeenCalledTimes(2);
    expect(reviewInstructionsV10()).toContain("causalidade e frequência");
    expect(reviewInstructionsV10()).toContain("afirma exclusividade");
  });
  it("requires a factual/editorial explanation for each unit, not merely coverage IDs", async () => {
    const s = setup({
      amend: r => {
        r.unitChecks[0].meaning = "";
        r.unitChecks[0].explanation = "";
        return r;
      },
    });
    expect((await s.review()).status).toBe("inconclusive");
  });
  it("turns five promised but three identified items into material correction even if declared fulfilled", async () => {
    const s = setup({
      texts: [
        "5 pesadelos",
        "Falta de estoque",
        "Compras urgentes",
        "Dependência de fornecedor",
      ],
      amend: (r, d) => {
        const titles = d.textUnits.filter((u: any) => u.fieldId === "field-0");
        r.sequenceAssessment.promises = [
          {
            unitId: titles[0].id,
            expectedCount: 5,
            deliveredItems: titles
              .slice(1)
              .map((u: any) => ({ meaning: u.text, unitIds: [u.id] })),
            status: "fulfilled",
            explanation:
              "Julgamento controlado inconsistente: três entregas para cinco prometidas.",
          },
        ];
        return r;
      },
    });
    const result = await s.review();
    expect(result.status).toBe("correction_required");
    expect(s.generateText).toHaveBeenCalledTimes(1);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "narrative_gap",
          consequence: "meaning_loss",
          effect: "blocking",
        }),
      ])
    );
  });
  it("refuses caption references as delivery of an art promise", async () => {
    const s = setup({
      texts: ["5 pesadelos"],
      amend: (r, d) => {
        r.sequenceAssessment.promises = [
          {
            unitId: d.textUnits[0].id,
            expectedCount: 1,
            deliveredItems: [
              {
                meaning: "Conteúdo só na legenda",
                unitIds: [
                  d.textUnits.find((u: any) => u.scope === "caption").id,
                ],
              },
            ],
            status: "fulfilled",
            explanation: "A legenda teria o conteúdo.",
          },
        ];
        return r;
      },
    });
    expect((await s.review()).status).toBe("inconclusive");
  });
  it("keeps taste or a proposed different rhythm advisory", async () => {
    const s = setup({
      amend: (r, d) => {
        r.findings = [
          {
            category: "aesthetic",
            unitId: d.textUnits[0].id,
            slideIndex: null,
            observedInImage: "",
            expected: "Considerar mais variedade de composição.",
            evidenceIds: [],
            explanation: "Preferência estética, sem perda de sentido.",
            consequence: "none",
            certainty: "established",
          },
        ];
        return r;
      },
    });
    const result = await s.review();
    expect(result.status).toBe("passed");
    expect(result.findings[0]).toMatchObject({
      effect: "advisory",
      authority: "diagnostic",
    });
  });
  it("does not approve a declared false claim disguised as an aesthetic category", async () => {
    const s = setup({
      amend: (r, d) => {
        r.findings = [
          {
            category: "aesthetic",
            unitId: d.textUnits[0].id,
            slideIndex: null,
            observedInImage: "",
            expected: "Corrigir a afirmação",
            evidenceIds: [],
            explanation:
              "O julgamento declarou uma promessa falsa, apesar da categoria estética.",
            consequence: "false_claim",
            certainty: "established",
          },
        ];
        expect(proposalReviewResponseV10Schema.safeParse(r).success).toBe(true);
        return r;
      },
    });
    expect((await s.review()).status).toBe("inconclusive");
    expect(s.generateText).toHaveBeenCalledTimes(2);
  });
  it("repairs only the review record with identical copy/pixels and replays the stored verdict", async () => {
    const s = setup({ amend: (r, _d, call) => (call === 1 ? "[] his" : r) });
    const before = arsenalHash(s.copy),
      result = await s.review();
    expect(result.status).toBe("passed");
    expect(result.operationKeys).toHaveLength(2);
    expect(arsenalHash(s.copy)).toBe(before);
    expect(s.render).toHaveBeenCalledTimes(1);
    const first = reviewPayloadV7(s.generateText.mock.calls[0][0]),
      second = reviewPayloadV7(s.generateText.mock.calls[1][0]);
    expect(second.copy).toEqual(first.copy);
    expect(second.formalRepair.invalidResponse).toBe("[] his");
    expect((await s.review()).inputHash).toBe(result.inputHash);
    expect(s.generateText).toHaveBeenCalledTimes(2);
  });
  it("does not invent approval when the formal repair or provider fails", async () => {
    const malformed = setup({ amend: () => "[] his" });
    const failed = await malformed.review();
    expect(failed.status).toBe("inconclusive");
    expect(failed.findings).toEqual([]);
    expect(failed.limitation).toBe("proposal_review_response_invalid");
    const unavailable = setup({
      error: Object.assign(new Error("timeout"), { code: "TIMEOUT" }),
    });
    expect(await unavailable.review()).toMatchObject({
      status: "inconclusive",
      limitation: "proposal_review_provider_timeout",
      findings: [],
    });
    expect(unavailable.generateText).toHaveBeenCalledTimes(1);
  });
  it("rejects duplicate verdict keys and unknown evidence instead of dropping semantic content", async () => {
    expect(() =>
      decodeReviewV10('{"outcome":"reviewed","outcome":"inconclusive"}')
    ).toThrow("proposal_review_response_invalid");
    const s = setup({
      amend: (r, d) => {
        targetCheck(r, d, "supported", ["ev_invented"]);
        return r;
      },
    });
    expect((await s.review()).status).toBe("inconclusive");
  });
  it("keeps old config contracts readable and pins the same evaluator for either writer", () => {
    const v9 = resolveReviewExecutionConfigV9();
    expect(assertReviewExecutionConfigV9(v9)).toEqual(v9);
    const gemini = resolveReviewExecutionConfigV10("google/gemini"),
      gpt = resolveReviewExecutionConfigV10("openai/gpt");
    expect(gemini.resolvedModel).toBe(gpt.resolvedModel);
    expect(assertReviewExecutionConfigV10(gpt)).toEqual(gpt);
    expect(() => assertReviewExecutionConfigV10(v9)).toThrow();
  });
  it("audits all 26 actual units and preserves two controlled factual defects among editorial units", async () => {
    const texts = [
      "A falta de itens quase sempre decorre de compras de última hora",
      "Visibilidade é a única base para negociar",
      ...Array.from({ length: 8 }, (_, i) => `Conheça o tópico ${i + 1}`),
    ];
    const s = setup({
      texts,
      hashtags: [
        "#compras",
        "#estoque",
        "#planejamento",
        "#gestao",
        "#organizacao",
      ],
      amend: (r, d) => {
        const targets = d.textUnits.filter(
          (u: any) => u.fieldId === "field-0" && u.slideIndex < 2
        );
        for (const target of targets)
          Object.assign(
            r.unitChecks.find((c: any) => c.unitId === target.id),
            {
              verdict: "unsupported",
              editorialBasis: null,
              explanation:
                "Causalidade ou exclusividade sem suporte na lista de problemas fornecida.",
            }
          );
        return r;
      },
    });
    const result = await s.review();
    expect(result.status).toBe("correction_required");
    if (result.policyVersion !== 10) throw new Error("Expected V10");
    expect(result.unitChecks).toHaveLength(26);
    expect(result.factualAudit.claims).toHaveLength(2);
    expect(
      result.findings.filter(f => f.category === "unsupported_claim")
    ).toHaveLength(2);
  });
  it.each(["explicit", "inferred"] as const)(
    "checks intent cardinality at its declared surface without promoting %s preferences",
    async origin => {
      const prompt = "Liste 5 riscos na arte.";
      const intent: GenerationIntent = {
        version: 1,
        objective: "Apresentar riscos",
        tone: {
          description: "Direto",
          origin: "inferred",
          rationale: "Tema informativo",
        },
        adaptation: "controlled",
        requirements: [
          {
            id: "five-risks",
            description: prompt,
            origin,
            surface: "art",
            requestQuote: origin === "explicit" ? prompt : null,
            itemCount: 5,
          },
        ],
        content: Array.from({ length: 5 }, (_, i) => ({
          id: `c${i + 1}`,
          meaning: `Risco ${i + 1}`,
          requirementIds: ["five-risks"],
          sourceIds: [],
        })),
      };
      const s = setup({
        prompt,
        intent,
        texts: ["Riscos", "Falta de estoque", "Urgência", "Dependência"],
        amend: (r, d) => {
          const titles = d.textUnits.filter(
            (u: any) => u.fieldId === "field-0" && u.slideIndex > 0
          );
          r.intentChecks[0].deliveries = titles.map((u: any, i: number) => ({
            contentId: `c${i + 1}`,
            unitIds: [u.id],
          }));
          // No sequence promise is declared: the explicit request still owns its cardinality.
          return r;
        },
      });
      const result = await s.review();
      expect(result.status).toBe(
        origin === "explicit" ? "correction_required" : "passed"
      );
      if (result.policyVersion !== 10) throw new Error("Expected V10");
      expect(result.intentChecks[0].status).toBe("missing");
      expect(result.findings[0].effect).toBe(
        origin === "explicit" ? "blocking" : "advisory"
      );
      expect(proposalReviewRecordSchema.safeParse(result).success).toBe(true);
    }
  );
  it("does not credit a planned art requirement delivered only in the caption", async () => {
    const prompt = "Explique o risco na arte.";
    const intent: GenerationIntent = {
      version: 1,
      objective: "Explicar risco",
      tone: {
        description: "Direto",
        origin: "inferred",
        rationale: "Tema informativo",
      },
      adaptation: "controlled",
      requirements: [
        {
          id: "risk",
          description: prompt,
          origin: "explicit",
          surface: "art",
          requestQuote: prompt,
          itemCount: 1,
        },
      ],
      content: [
        {
          id: "c1",
          meaning: "Risco de falta de estoque",
          requirementIds: ["risk"],
          sourceIds: [],
        },
      ],
    };
    const s = setup({
      prompt,
      intent,
      amend: (r, d) => {
        r.intentChecks[0].deliveries = [
          {
            contentId: "c1",
            unitIds: [d.textUnits.find((u: any) => u.scope === "caption").id],
          },
        ];
        return r;
      },
    });
    const result = await s.review();
    expect(result.status).toBe("correction_required");
    expect(s.generateText).toHaveBeenCalledTimes(1);
  });
  it("targets an omitted planned native field for recovery, even when its text unit is empty", async () => {
    const prompt = "Liste 2 riscos na arte.";
    const intent: GenerationIntent = {
      version: 1,
      objective: "Explicar riscos",
      tone: {
        description: "Direto",
        origin: "inferred",
        rationale: "Tema informativo",
      },
      adaptation: "controlled",
      requirements: [
        {
          id: "risks",
          description: prompt,
          origin: "explicit",
          surface: "art",
          requestQuote: prompt,
          itemCount: 2,
        },
      ],
      content: [1, 2].map(i => ({
        id: `c${i}`,
        meaning: `Risco ${i}`,
        requirementIds: ["risks"],
        sourceIds: [],
      })),
    };
    const s = setup({
      prompt,
      intent,
      texts: ["2 riscos", "Falta de estoque"],
      bodyTexts: ["Conheça os riscos", ""],
      amend: (r, d) => {
        r.intentChecks[0].deliveries = [
          {
            contentId: "c1",
            unitIds: [
              d.textUnits.find(
                (u: any) => u.slideIndex === 1 && u.fieldId === "field-0"
              ).id,
            ],
          },
        ];
        return r;
      },
    });
    s.input.narrativePlan = {
      slot: 0,
      status: "viable",
      candidateId: definition.id,
      reason: "Espaço para dois riscos",
      editorialApproach: "Explicar riscos",
      captionContentIds: [],
      pages: [
        {
          slideIndex: 0,
          componentId: definition.id,
          purpose: "Abrir",
          rhythm: "opening",
          assignments: [
            {
              fieldId: "field-0",
              contentIds: [],
              itemCount: null,
              instruction: "Título",
            },
          ],
        },
        {
          slideIndex: 1,
          componentId: definition.id,
          purpose: "Explicar",
          rhythm: "reading",
          assignments: [
            {
              fieldId: "field-0",
              contentIds: ["c1"],
              itemCount: null,
              instruction: "Primeiro risco",
            },
            {
              fieldId: "field-1",
              contentIds: ["c2"],
              itemCount: null,
              instruction: "Segundo risco",
            },
          ],
        },
      ],
    };
    const result = await s.review();
    expect(result.status).toBe("correction_required");
    expect(result.findings).toEqual([
      expect.objectContaining({
        category: "explicit_requirement",
        slideIndex: 1,
        fieldId: "field-1",
        unitId: null,
        observed: "",
        effect: "blocking",
      }),
    ]);
    expect(s.generateText).toHaveBeenCalledTimes(1);
  });
});
