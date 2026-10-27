import { describe, it, expect, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { instantiateCompleteDesign } from "@shared/completeDesignGeneration";
import { resolveArsenalGeometry } from "@shared/arsenalGeometry";
import { proposalReviewRecordSchema } from "@shared/proposalReview";
import { reviewProposal } from "./proposalReview";
import { editorialContextV8 } from "./editorialContextV8";
import { resolveReviewExecutionConfigV8 } from "./reviewExecutionConfigV8";
import { healthyReviewV8Fixture } from "./proposalReviewV8.fixture";
import { reviewPayloadV7 } from "./proposalReviewV7.fixture";
import { renderReviewFixtureScenes } from "./proposalReview.fixture";
import { decodeReviewV8 } from "./proposalReviewPolicyV8";

const id = "00000000-0000-4000-8000-000000000001",
  definition = completeDesignTestDefinitions()[0];
function setup(
  text = "Preço com entrega garantida",
  amend = (r: any, d: any) => r
) {
  const input: any = {
    requestId: id,
    runId: id,
    proposalId: "v8-proposal",
    slot: 0,
    prompt: "Confira a oferta",
    contextContent:
      "Histórico de preços no período observado. Envio Full e Prime. Início às 12h. Assinatura de R$ 10 por mês.",
    platform: "instagram",
    postMode: "static",
    reviewPolicyVersion: 8,
    reviewExecutionConfig: resolveReviewExecutionConfigV8(),
  };
  input.editorialContext = editorialContextV8(input);
  input.editorialContextHash = input.editorialContext.hash;
  const copy: any = {
    caption: "Conheça",
    hashtags: ["#ofertas"],
    slides: [
      {
        values: [
          { fieldId: "field-0", value: "Confira" },
          { fieldId: "field-1", value: text },
        ],
        mediaPrompts: [],
      },
    ],
  };
  const compositions = [
    resolveArsenalGeometry(
      instantiateCompleteDesign({
        definition,
        values: copy.slides[0].values,
        mediaPrompts: [],
        runId: id,
        slot: 0,
        slide: 0,
        planHash: "a".repeat(64),
        experimental: true,
      }),
      { measureText: () => ({ height: 20, lines: [{ width: 100 }], runs: [] }) }
    ),
  ];
  const generateText = vi.fn(async (params: any) => ({
    choices: [
      {
        message: {
          content: JSON.stringify(
            amend(healthyReviewV8Fixture(params), reviewPayloadV7(params))
          ),
        },
        finish_reason: "stop",
      },
    ],
  }));
  const deps: any = {
    actor: id,
    generateText,
    renderReviewScenes: renderReviewFixtureScenes,
    reviewOperationCache: new Map(),
  };
  return {
    input,
    copy,
    deps,
    generateText,
    review: () =>
      reviewProposal(input, deps, [definition], compositions, copy, "initial"),
  };
}
function claim(r: any, d: any, status = "unsupported", sources: any[] = []) {
  const unit = d.textUnits.find((u: any) => u.fieldId === "field-1");
  r.factualAudit.units.find((u: any) => u.unitId === unit.id).classification =
    "factual";
  r.factualAudit.units.find((u: any) => u.unitId === unit.id).claimIds = [
    "claim-1",
  ];
  r.factualAudit.claims = [
    {
      id: "claim-1",
      unitId: unit.id,
      observed: unit.text,
      sources,
      status,
      explanation: "Julgamento factual controlado pelo cenário de teste.",
    },
  ];
  return r;
}
describe("factual review V8", () => {
  it("keeps a declared material source conflict explicit without purchasing a formal repair",async()=>{
    const s=setup("Confira",r=>({...r,outcome:"inconclusive",limitation:"source_conflict"}));
    const result=await s.review();expect(result.status).toBe("inconclusive");expect(result.limitation).toBe("proposal_review_source_conflict");expect(s.generateText).toHaveBeenCalledTimes(1);
  });
  it.each([
    "entrega garantida",
    "Preço abaixo da média histórica",
    "Receba em 1 hora",
    "Apenas R$ 5 por mês",
    "Se você não usar, perde dinheiro",
  ])(
    "derives a blocking finding from an unsupported audit even when findings is empty: %s",
    async text => {
      const s = setup(text, (r, d) => claim(r, d));
      const result = await s.review();
      expect(result.status).toBe("correction_required");
      expect(result.findings[0]).toMatchObject({
        category: "unsupported_claim",
        effect: "blocking",
        observed: text,
      });
      expect(s.generateText).toHaveBeenCalledTimes(1);
      expect(proposalReviewRecordSchema.safeParse(result).success).toBe(true);
    }
  );
  it("retains uncertainty and audit evidence instead of approving", async () => {
    const s = setup("Benefício incerto", (r, d) => claim(r, d, "uncertain"));
    const result: any = await s.review();
    expect(result.status).toBe("inconclusive");
    expect(result.factualAudit.claims[0].status).toBe("uncertain");
  });
  it("accepts a supported claim with an exact source range", async () => {
    const s = setup("Início às 12h.", (r, d) => {
      const source = d.context.sources.find((s: any) =>
          s.text.includes("Início às 12h.")
        ),
        start = source.text.indexOf("Início às 12h.");
      return claim(r, d, "supported", [
        { sourceId: source.id, start, end: start + "Início às 12h.".length },
      ]);
    });
    expect((await s.review()).status).toBe("passed");
  });
  it.each([
    "missing_audit",
    "missing_unit",
    "duplicate_unit",
    "missing_claim",
    "bad_quote",
    "no_support",
    "bad_source",
    "conflicting_finding",
  ])(
    "uses only one formal repair and never silently approves %s",
    async mode => {
      const s = setup("Início às 12h.", (r, d) => {
        if (mode === "missing_audit") delete r.factualAudit;
        if (mode === "missing_unit") r.factualAudit.units.pop();
        if (mode === "duplicate_unit")
          r.factualAudit.units.push(r.factualAudit.units[0]);
        if (mode === "missing_claim")
          r.factualAudit.units[0] = {
            ...r.factualAudit.units[0],
            classification: "factual",
            claimIds: ["absent"],
          };
        if (
          [
            "bad_quote",
            "no_support",
            "bad_source",
            "conflicting_finding",
          ].includes(mode)
        ) {
          const source = d.context.sources.find((s: any) =>
              s.text.includes("Início às 12h.")
            ),
            start = source.text.indexOf("Início às 12h.");
          claim(
            r,
            d,
            "supported",
            mode === "no_support"
              ? []
              : [
                  {
                    sourceId: mode === "bad_source" ? "absent" : source.id,
                    start,
                    end:
                      mode === "conflicting_finding"
                        ? start + "Início às 12h.".length
                        : 999999,
                  },
                ]
          );
          if (mode === "conflicting_finding")
            r.findings = [
              {
                category: "unsupported_claim",
                slideIndex: 0,
                fieldId: "field-1",
                unitId: r.factualAudit.claims[0].unitId,
                scope: "art",
                observed: "Início às 12h.",
                expected: "Ajustar ao suporte",
                sourceId: null,
                sourceQuote: "",
                explanation: "Parecer contraditório com a auditoria.",
                consequence: "false_claim",
                certainty: "established",
                effect: "blocking",
              },
            ];
          if (mode === "bad_quote")
            r.factualAudit.claims[0].observed = "Não está no texto";
        }
        return r;
      });
      const result = await s.review();
      expect(result.status).toBe("inconclusive");
      expect(s.generateText).toHaveBeenCalledTimes(2);
    }
  );
  it("reuses completed paid operations and rejects changed source context before a call", async () => {
    const s = setup("Confira", r => r);
    const first = await s.review();
    expect(await s.review()).toEqual(first);
    expect(s.generateText).toHaveBeenCalledTimes(1);
    s.input.contextContent += " alterado";
    await expect(s.review()).rejects.toThrow(
      "preparation_contract_incompatible"
    );
    expect(s.generateText).toHaveBeenCalledTimes(1);
  });
  it("does not accept voice guidance as factual support", async () => {
    const s = setup("Entrega garantida", (r, d) => {
      const ref = d.context.project.structuredData.voiceTone;
      return claim(r, d, "supported", [ref]);
    });
    s.input.projectSnapshot = {
      version: 1,
      name: "Marca",
      niche: "Ofertas",
      structuredData: { voiceTone: "Entrega garantida" },
    };
    s.input.editorialContext = editorialContextV8(s.input);
    s.input.editorialContextHash = s.input.editorialContext.hash;
    expect((await s.review()).status).toBe("inconclusive");
    expect(s.generateText).toHaveBeenCalledTimes(2);
  });
  it("keeps advisory style findings without forcing a rewrite", async () => {
    const s = setup("Confira", (r, d) => ({
      ...r,
      findings: [
        {
          category: "aesthetic",
          slideIndex: 0,
          fieldId: "field-0",
          unitId: d.textUnits[0].id,
          scope: "art",
          observed: d.textUnits[0].text,
          expected: "Preferência de título",
          sourceId: null,
          sourceQuote: "",
          explanation: "Sugestão consultiva de estilo.",
          consequence: "none",
          certainty: "established",
          effect: "advisory",
        },
      ],
    }));
    expect((await s.review()).status).toBe("passed");
    expect(s.generateText).toHaveBeenCalledTimes(1);
  });
  it("rejects duplicate keys, including keys nested inside factualAudit", () => {
    expect(() =>
      decodeReviewV8('{"factualAudit":{"units":[],"units":[],"claims":[]}}')
    ).toThrow("proposal_review_response_invalid");
  });
});
