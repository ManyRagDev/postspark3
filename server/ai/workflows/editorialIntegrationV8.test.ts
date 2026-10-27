import { describe, it, expect, vi } from "vitest";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { defaultStudioPreferences } from "@shared/studioPreferences";
import { compactComponentCard } from "@shared/componentAssembly";
import { arsenalHash, arsenalCanonicalJson } from "@shared/arsenalContent";
import { electionCatalogFixture } from "../../designCatalog/designElection.fixture";
import { reconcileCatalogCoverage } from "../../designCatalog/catalogCoverage";
import { shortlistCompleteDesigns } from "../../designCatalog/designShortlist";
import { authorCarouselVisualVariant } from "../../designCatalog/carouselVisualVariants";
import {
  prepareOrchestratedGeneration,
  verifyPreparedEligibility,
} from "./generationPreparation";
import { GenerationCoordinator } from "./generationCoordinator";
import { executeProposalWorkflow } from "./proposalGraph";
import { healthyReviewV8Fixture } from "./proposalReviewV8.fixture";
import {
  healthyReviewV7Fixture,
  reviewPayloadV7,
} from "./proposalReviewV7.fixture";
import { renderReviewFixtureScenes } from "./proposalReview.fixture";
import { editorialContextV7 } from "./editorialContextV7";
import { resolveReviewExecutionConfigV7 } from "./reviewExecutionConfigV7";

const owner = "00000000-0000-4000-8000-000000000001",
  requestId = "00000000-0000-4000-8000-000000000002";
const fact = "Registra preços no período observado.";
function setup(
  mode: "static" | "carousel",
  intervention = "optimize_structure",
  catalogCount = 3
) {
  const input = orchestratedGenerationInputSchema.parse({
    ownerId: owner,
    idempotencyKey: "v8-integration",
    inputType: "text",
    content: "Como saber se uma oferta vale a pena?",
    platform: "instagram",
    postMode: mode,
    slideCount: 5,
    aspectRatio: "4:5",
    projectDossier: "## DIFERENCIAIS FACTUAIS\n" + fact,
    executionBrief: {
      creationMode: "execution",
      format: mode,
      platform: "instagram",
      objective: "engage",
      interventionLevel: intervention,
      contentSourceType: "freeform",
      rawInput: "Como saber se uma oferta vale a pena?",
    },
  });
  const f = electionCatalogFixture(catalogCount),
    definitions =
      mode === "static"
        ? f.definitions
        : f.definitions.flatMap(d => [
            d,
            authorCarouselVisualVariant(d, "development"),
            authorCarouselVisualVariant(d, "closing"),
          ]);
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
  const catalog = reconcileCatalogCoverage(
    {
      aspectRatio: "4:5",
      postMode: mode,
      text: fact,
      slideCount: mode === "static" ? 1 : 5,
      experimental: false,
    },
    inventory
  );
  const journal = new Map<string, any>(),
    calls: any[] = [];
  const generate = vi.fn(async (p: any) => {
    calls.push(p);
    if (p.traceLabel.startsWith("generation_selection")) {
      const d = JSON.parse(p.messages[1].content),
        modern = p.traceLabel.endsWith("v3");
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                version: modern ? 3 : 2,
                options: d.catalog.slice(0, 3).map((o: any, i: number) => ({
                  offerId: o.offerId,
                  reason: `Justificativa visual ${i}`,
                  ...(modern && intervention !== "visual_only"
                    ? {
                        editorialApproach: [
                          "Economia de tempo",
                          "Checagem do preço",
                          "Escolha com critérios",
                        ][i],
                      }
                    : {}),
                })),
              }),
            },
          },
        ],
      };
    }
    if (p.taskRoute === "post_evaluation") {
      const d = reviewPayloadV7(p),
        r: any = healthyReviewV8Fixture(p);
      for (const unit of d.textUnits.filter((u: any) => u.text === fact)) {
        const source = d.context.sources.find((s: any) =>
            s.text.includes(fact)
          ),
          start = source.text.indexOf(fact),
          claimId = `c-${unit.id}`;
        const check = r.factualAudit.units.find(
          (u: any) => u.unitId === unit.id
        );
        check.classification = "factual";
        check.claimIds = [claimId];
        r.factualAudit.claims.push({
          id: claimId,
          unitId: unit.id,
          observed: fact,
          sources: [{ sourceId: source.id, start, end: start + fact.length }],
          status: "supported",
          explanation: "O cenário fornece exatamente este fato.",
        });
      }
      return {
        choices: [
          { message: { content: JSON.stringify(r) }, finish_reason: "stop" },
        ],
      };
    }
    const user = p.messages[1].content,
      slides = JSON.parse(
        user.split("\n").find((l: string) => l.startsWith("["))
      );
    return {
      choices: [
        {
          message: {
            content: JSON.stringify({
              caption: "Confira",
              hashtags: [],
              slides: slides.map((s: any) => ({
                values: s.fields.map((f: any) => ({
                  fieldId: f.id,
                  value:
                    f.role === "headline"
                      ? "Confira"
                      : s.slide === 0
                        ? fact
                        : "",
                })),
                mediaPrompts: [],
              })),
            }),
          },
          finish_reason: "stop",
        },
      ],
    };
  });
  const operation = async <T>(
    key: string,
    work: () => Promise<T>
  ): Promise<T> => {
    if (journal.has(key)) return journal.get(key);
    const r = await work();
    journal.set(key, r);
    return r;
  };
  const deps = {
    generate,
    loadContext: async () => fact,
    preferences: async () => defaultStudioPreferences,
    retrieve: async () => catalog,
    hydrate: async (ids: string[]) =>
      definitions.filter(d => ids.includes(d.id)),
    shortlist: async (p: any) => ({
      cards: p.cards,
      evaluated: [],
      batches: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    }),
    operation,
  };
  return {
    input,
    deps,
    journal,
    calls,
    generate,
    definitions,
    prepare: () =>
      prepareOrchestratedGeneration(
        input,
        owner,
        false,
        Date.now() + 60000,
        deps
      ),
  };
}
describe("integrated editorial revision", () => {
  it("repairs only the unsupported field and keeps healthy text frozen through the final review",async()=>{
    const s=setup("static"),prepared=await s.prepare();let writes=0;
    const generateText=vi.fn(async(p:any)=>{
      if(p.taskRoute!=="post_evaluation")return {choices:[{message:{content:JSON.stringify({caption:"Legenda saudável",hashtags:[],slides:[{values:[{fieldId:"field-0",value:++writes===1?"Confira":"Título alterado indevidamente"},{fieldId:"field-1",value:writes===1?"Entrega garantida":fact}],mediaPrompts:[]}]})},finish_reason:"stop"}]};
      const d=reviewPayloadV7(p),r:any=healthyReviewV8Fixture(p),unit=d.textUnits.find((u:any)=>u.fieldId==="field-1");
      const check=r.factualAudit.units.find((u:any)=>u.unitId===unit.id);check.classification="factual";check.claimIds=["claim"];
      const source=d.context.sources.find((s:any)=>s.text.includes(fact)),start=source.text.indexOf(fact);
      r.factualAudit.claims=[{id:"claim",unitId:unit.id,observed:unit.text,status:unit.text===fact?"supported":"unsupported",sources:unit.text===fact?[{sourceId:source.id,start,end:start+fact.length}]:[],explanation:"Avaliação controlada do campo de apoio."}];
      return {choices:[{message:{content:JSON.stringify(r)},finish_reason:"stop"}]};
    });
    const result=await executeProposalWorkflow({...prepared,requestId,runId:requestId,proposalId:"repair",slot:0,selectedDefinitions:prepared.selectedDefinitions[0],editorialApproach:prepared.editorialApproaches![0],prompt:s.input.content,platform:"instagram",postMode:"static",projectDossier:s.input.projectDossier,executionBrief:s.input.executionBrief},{actor:owner,generateText,renderReviewScenes:renderReviewFixtureScenes,measureText:()=>({height:20,lines:[{width:100}],runs:[]})});
    expect(result.status,result.errorReason).toBe("ready");expect(writes).toBe(2);
    expect(result.reviews?.map(r=>r.status)).toEqual(["correction_required","passed"]);
    const reviewCalls=generateText.mock.calls.map(c=>c[0]).filter(p=>p.taskRoute==="post_evaluation");
    expect(reviewPayloadV7(reviewCalls[1]).copy.slides[0].values).toEqual([{fieldId:"field-0",value:"Confira"},{fieldId:"field-1",value:fact}]);
    expect(reviewPayloadV7(reviewCalls[1]).copy.caption).toBe("Legenda saudável");
  });
  it.each(["visual_only", "light_optimize"])(
    "preserves the intervention and permits empty optional fields for %s",
    async intervention => {
      const s = setup("static", intervention),
        prepared = await s.prepare();
      await verifyPreparedEligibility(prepared, false, s.deps.hydrate);
      if (intervention === "visual_only")
        expect(prepared.editorialApproaches).toEqual([null, null, null]);
      const source = s.input.executionBrief!.rawInput;
      const copy = {
        caption: "",
        hashtags: [],
        slides: [
          {
            values: [
              { fieldId: "field-0", value: source },
              { fieldId: "field-1", value: "" },
            ],
            mediaPrompts: [],
          },
        ],
      };
      const generated = vi.fn(async (p: any) => ({
        choices: [
          {
            message: {
              content: JSON.stringify(
                p.taskRoute === "post_evaluation"
                  ? healthyReviewV8Fixture(p)
                  : copy
              ),
            },
            finish_reason: "stop",
          },
        ],
      }));
      const input = {
        ...prepared,
        requestId,
        runId: requestId,
        proposalId: "intervention",
        slot: 0,
        selectedDefinitions: prepared.selectedDefinitions[0],
        editorialApproach: prepared.editorialApproaches![0],
        prompt: s.input.content,
        platform: "instagram",
        postMode: "static" as const,
        projectDossier: s.input.projectDossier,
        executionBrief: s.input.executionBrief,
      };
      const deps = {
        actor: owner,
        generateText: generated,
        renderReviewScenes: renderReviewFixtureScenes,
        measureText: () => ({ height: 20, lines: [{ width: 100 }], runs: [] }),
      };
      const result = await executeProposalWorkflow(input, deps);
      expect(result.status, result.errorReason).toBe("ready");
      expect(generated).toHaveBeenCalledTimes(2);
      if (intervention === "visual_only") {
        copy.slides[0].values[0].value = "Texto diferente";
        const rejected = await executeProposalWorkflow(
          { ...input, proposalId: "literal-reject" },
          deps
        );
        expect(rejected.status).toBe("failed");
      }
    }
  );
  it.each(["static", "carousel"] as const)(
    "passes the unique context and approaches through preparation, coordinator, writer and reviewer for %s",
    async mode => {
      const s = setup(mode),
        prepared = await s.prepare();
      await verifyPreparedEligibility(prepared, false, s.deps.hydrate);
      expect(prepared).toMatchObject({
        preparationVersion: 5,
        reviewPolicyVersion: 9,
        editorialApproaches: [
          "Economia de tempo",
          "Checagem do preço",
          "Escolha com critérios",
        ],
      });
      const operations = new Map<string, any>();
      const coordinator = new GenerationCoordinator(
        {
          requestId,
          runId: requestId,
          actor: owner,
          prompt: s.input.content,
          platform: "instagram",
          postMode: mode,
          executionBrief: s.input.executionBrief,
          contextContent: fact,
          projectDossier: s.input.projectDossier,
          ...prepared,
        },
        {
          actor: owner,
          generateText: s.generate,
          measureText: () => ({
            height: 20,
            lines: [{ width: 100 }],
            runs: [],
          }),
          renderReviewScenes: renderReviewFixtureScenes,
          operationForProposal:
            proposalId =>
            async ({ operationKey }, work) => {
              const key = proposalId + ":" + operationKey;
              if (operations.has(key)) return operations.get(key);
              const r = await work();
              operations.set(key, r);
              return r;
            },
          reviewOperations: async proposalId =>
            Array.from(operations.entries())
              .filter(([k]) => k.startsWith(proposalId + ":"))
              .map(([k, result]) => ({
                operationKey: k.slice(proposalId.length + 1),
                state: "completed",
                result,
              })),
        }
      );
      const result = await coordinator.start();
      expect(
        result.proposals.map(p => ({ status: p.status, reason: p.errorReason }))
      ).toEqual(
        Array.from({ length: 3 }, () => ({
          status: "ready",
          reason: undefined,
        }))
      );
      const writers = s.calls.filter(p => p.traceLabel.endsWith("_copy")),
        reviews = s.calls.filter(p => p.taskRoute === "post_evaluation");
      expect(writers).toHaveLength(3);
      expect(reviews).toHaveLength(3);
      for (const [i, p] of writers.entries()) {
        expect(p.messages[1].content).not.toContain("Justificativa visual");
        expect(p.messages[0].content).not.toContain(fact);
        const lines = p.messages[1].content.split("\n"),
          context = JSON.parse(lines.find((l: string) => l.startsWith("{"))),
          templates = JSON.parse(lines.find((l: string) => l.startsWith("[")));
        expect(context.hash).toBe(prepared.editorialContextHash);
        expect(templates[0].artboard.width).toBeGreaterThan(0);
        expect(templates[0].fields[0].targets[0].x).toBeTypeOf("number");
        expect(p.messages[1].content).toContain(
          prepared.editorialApproaches![i]
        );
      }
      for (const p of reviews)
        expect(reviewPayloadV7(p).context).toEqual(prepared.editorialContext);
      const before = arsenalHash(Array.from(s.journal));
      expect(await s.prepare()).toEqual(prepared);
      expect(arsenalHash(Array.from(s.journal))).toBe(before);
      expect(
        s.calls.filter(p => p.traceLabel.startsWith("generation_selection"))
      ).toHaveLength(1);
    }
  );
  it.each([5, 6, 7])(
    "keeps JEV keys stable through JSONB ordering on profile %s",
    async profile => {
      const s = setup("static", "optimize_structure", 13);
      if (profile !== 7) {
        const context = editorialContextV7(
          {
            prompt: s.input.content,
            executionBrief: s.input.executionBrief,
            contextContent: fact,
            projectDossier: s.input.projectDossier,
            platform: "instagram",
            postMode: "static",
          },
          profile as 5 | 6
        );
        s.journal.set("selection_input", {
          brief: s.input.content,
          requirements: context.requirements,
          ...(profile === 6 ? { editorialContext: context } : {}),
          reviewExecutionConfig: resolveReviewExecutionConfigV7(
            profile as 5 | 6,
            "controlled-model"
          ),
          jevModel: "controlled-jev",
        });
      }
      const evaluate = vi.fn(async (r: any) => ({
        model: r.model,
        answers: Object.fromEntries(
          Object.keys(r.questions).map(id => [
            id,
            { type: "score", score: 2, confidence: 0.9 },
          ])
        ),
        usage: { input_tokens: 1, output_tokens: 1, cost: 0 },
      }));
      s.deps.shortlist = (p: any) => shortlistCompleteDesigns(p, evaluate);
      s.deps.operation = async <T>(
        key: string,
        work: () => Promise<T>
      ): Promise<T> => {
        if (!s.journal.has(key))
          s.journal.set(key, JSON.parse(arsenalCanonicalJson(await work())));
        return s.journal.get(key);
      };
      const first = await s.prepare(),
        bought = evaluate.mock.calls.length,
        keys = Array.from(s.journal.keys());
      expect(bought).toBeGreaterThan(0);
      expect(await s.prepare()).toEqual(first);
      expect(evaluate).toHaveBeenCalledTimes(bought);
      expect(Array.from(s.journal.keys())).toEqual(keys);
      expect(s.calls).toHaveLength(1);
    }
  );
  it("keeps a historical selection pin and its original response protocol after the upgrade", async () => {
    const s = setup("static"),
      legacy = editorialContextV7(
        {
          prompt: s.input.content,
          executionBrief: s.input.executionBrief,
          contextContent: fact,
          projectDossier: s.input.projectDossier,
          platform: "instagram",
          postMode: "static",
        },
        6
      );
    s.journal.set("selection_input", {
      brief: s.input.content,
      requirements: legacy.requirements,
      editorialContext: legacy,
      reviewExecutionConfig: resolveReviewExecutionConfigV7(
        6,
        "controlled-model"
      ),
      jevModel: "controlled-jev",
    });
    const prepared = await s.prepare();
    expect(prepared).toMatchObject({
      preparationVersion: 3,
      reviewPolicyVersion: 7,
    });
    expect(prepared.editorialApproaches).toBeUndefined();
    expect(s.calls[0].traceLabel).toBe("generation_selection_v2");
    expect(await s.prepare()).toEqual(prepared);
    expect(s.calls).toHaveLength(1);
  });
});
