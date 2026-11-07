import { describe, expect, it, vi } from "vitest";
import { arsenalHash } from "@shared/arsenalContent";
import { assemblyIdentity, compactComponentCard, createComponentDefinition } from "@shared/componentAssembly";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { materializeDesignFamilyOffer, resolveDesignFamilyRepertoires, type DesignFamilyRepertoire } from "@shared/designRepertoire";
import { normalizeGenerationIntent, validateGenerationPlan, type GenerationIntent, type ViableGenerationPlan } from "@shared/generationPlan";
import type { RecentDesignSelection } from "@shared/designSelection";
import { proposalSelectionHistory, type FamilyAxes } from "@shared/familyNeutrality";
import { authorFamilyCarouselRepertoire } from "../../designCatalog/familyCarouselRepertoire";
import { buildHeuristicGenerationPlan, deliveryProposalReserves, distinctProposalRecovery, type HeuristicPlanBuilderInput } from "./heuristicPlanBuilder";

const base = completeDesignTestDefinitions()[0];
const intent: GenerationIntent = {
  version: 1, objective: "Explicar uma ideia", adaptation: "controlled",
  tone: { description: "Direto", origin: "inferred", rationale: "Explicação objetiva" },
  requirements: [], content: [{ id: "idea", meaning: "Planejar antes de agir", sourceIds: [], requirementIds: [] }],
};
const imageObligation: HeuristicPlanBuilderInput["imageObligation"] = {
  policy: "optional", required: false, purpose: "none", reason: "Sem imagem obrigatória", slotTargets: 0,
};
function source(family: string, key: string, listMax?: number, axes?: FamilyAxes) {
  return createComponentDefinition({
    ...base, id: assemblyIdentity(["family-first-planner", key]),
    completeDesign: { ...base.completeDesign!, family, ...(axes ? { designGuidance: {
      version: 1, summary: "Composição de teste", motifs: [], preserve: [], contentRules: [], mediaRules: [], knownLimitations: [],
      selection: { version: 1, description: "Composição de teste", axes },
    } } : {}) },
    fragment: { ...base.fragment, bindings: listMax ? [base.fragment.bindings[0], {
      ...base.fragment.bindings[1], kind: "list", source: "block:list:0:items", cardinality: { min: 1, max: listMax },
    }] : base.fragment.bindings },
  });
}
function repertoire(family: string, key: string, options: { slideCount?: number; listMax?: number; axes?: FamilyAxes } = {}) {
  const root = source(family, key, options.listMax, options.axes);
  const count = options.slideCount ?? 1;
  return resolveDesignFamilyRepertoires([root, ...(count > 1 ? authorFamilyCarouselRepertoire(root) : [])].map(compactComponentCard), {
    slideCount: count, contentMode: "compose",
  })[0];
}

describe("distinct proposal selection v1", () => {
  const policy = { version: 1, seed: "stable-order", planningVersion: 3, proposalSelectionVersion: 1 } as const;
  const basic = { organization: "single", density: "light", typography: "sans", imageRole: "type" };
  const visual = { organization: "grid", density: "dense", typography: "serif", imageRole: "decoration" };

  it("uses continuous automatic suitability across a 4-versus-2 gap without suppressing the third viable proposal", () => {
    const eligible = [repertoire("a", "flex-a"), repertoire("b", "flex-b"), repertoire("c", "flex-c"), repertoire("d", "flex-d")];
    const historical = { ...input(eligible, {a:4,b:4,c:2,d:0}), neutrality: policy };
    expect(families(buildHeuristicGenerationPlan(historical),eligible)).toContain("insufficient_fit");
    const automatic = {...historical,neutrality:{...policy,creativeFlexibility:1 as const}};
    const plan=buildHeuristicGenerationPlan(automatic);
    expect(plan.slots.every(slot=>slot.status==="viable")).toBe(true);
    expect(new Set(families(plan,eligible))).toEqual(new Set(["a","b","c"]));
    const offers=plan.slots.map(slot=>slot.status==="viable"?eligible.find(r=>r.defaultOffer.offerId===slot.candidateId)!.defaultOffer:null);
    expect(distinctProposalRecovery(automatic,offers)[2].map(r=>r.family)).toContain("d");
    expect(deliveryProposalReserves(automatic,offers).flat().map(r=>r.family)).toContain("d");
    const onlyTwo=buildHeuristicGenerationPlan({...automatic,eligible:eligible.slice(0,2)});
    expect(onlyTwo.slots.filter(slot=>slot.status==="viable")).toHaveLength(2);
  });

  it("pins compatible reserves even when the JEV shortlist leaves no viable design", () => {
    const eligible = [repertoire("low-score", "low"), repertoire("unassessed", "unassessed")];
    const request = { ...input(eligible, { "low-score": 0.5 }), neutrality: { ...policy, deliveryRecoveryVersion: 1 as const } };
    request.shortlist.evaluated = request.shortlist.evaluated.slice(0, 1);
    const reserves = deliveryProposalReserves(request, [null, null, null]);
    expect(reserves.map(slot => slot.map(candidate => candidate.family))).toEqual([["low-score", "unassessed"], [], []]);
    expect(reserves[0][0].componentHashes).toEqual([eligible[0].sourceHash]);
  });

  it("delivers only one proposal when several sources have the same design identity", () => {
    const eligible = [repertoire("only", "old"), repertoire("only", "new")];
    const request = { ...input(eligible, { only: 4 }), neutrality: policy };
    const result = buildHeuristicGenerationPlan(request);
    expect(families(result, eligible)).toEqual(["only", "insufficient_fit", "insufficient_fit"]);
    const slot = result.slots[0] as ViableGenerationPlan;
    const source = eligible.find(r => r.defaultOffer.offerId === slot.candidateId)!;
    expect(distinctProposalRecovery(request, [source.defaultOffer, null, null])).toEqual([[], [], []]);
  });

  it("chooses the most visually distinct compatible third family without lowering the suitability floor", () => {
    const eligible = [
      repertoire("a", "a", { axes: basic }), repertoire("b", "b", { axes: { ...basic, organization: "columns" } }),
      repertoire("near", "near", { axes: { ...basic, organization: "columns" } }),
      repertoire("contrast", "contrast", { axes: { ...visual, imageRole: "type" } }), repertoire("weak", "weak", { axes: visual }),
    ];
    const request = { ...input(eligible, { a: 4, b: 3.95, near: 3.85, contrast: 3.62, weak: 3.59 }), neutrality: policy };
    const plan = buildHeuristicGenerationPlan(request);
    expect(families(plan, eligible)).toEqual(["a", "b", "contrast"]);
    expect(plan.slots[2].reason).toContain("Alternativa visual");
    expect(buildHeuristicGenerationPlan({ ...request, eligible: [...eligible].reverse() })).toEqual(plan);
    const offers = plan.slots.map(slot => slot.status === "viable" ? eligible.find(r => r.defaultOffer.offerId === slot.candidateId)!.defaultOffer : null);
    expect(distinctProposalRecovery(request, offers)[2].map(r => r.family)).toEqual(["near"]);
    expect(families(buildHeuristicGenerationPlan({ ...request, eligible: [eligible[0], eligible[1], eligible[4]] }), eligible))
      .toEqual(["a", "b", "insufficient_fit"]);
  });

  it("rests a recent or parent family only when another family is similarly suitable", () => {
    const eligible = [repertoire("recent", "recent"), repertoire("fresh", "fresh")];
    const parent = { requestId: "older-parent", selections: [{ family: "recent", designIds: [] }] };
    const request = (score: number) => ({ ...input(eligible, { recent: 4, fresh: score }, proposalSelectionHistory([], parent)), neutrality: policy });
    expect(families(buildHeuristicGenerationPlan(request(3.8)), eligible)).toEqual(["fresh", "recent", "insufficient_fit"]);
    expect(families(buildHeuristicGenerationPlan(request(3.5)), eligible)).toEqual(["recent", "fresh", "insufficient_fit"]);
  });
});
function input(eligible: DesignFamilyRepertoire[], scores: Record<string, number | [number, number]>, recentSelections: RecentDesignSelection[] = []): HeuristicPlanBuilderInput {
  return { familyFirst: true, intent, eligible, imageObligation, slideCount: eligible[0].slides.length, recentSelections,
    shortlist: { cards: [], evaluated: eligible.map(r => {
      const assessment = scores[r.family] ?? 2.5;
      const [score, confidence] = Array.isArray(assessment) ? assessment : [assessment, 1];
      return { id: r.defaultOffer.offerId, hash: r.signature, score, confidence };
    }), batches: 1, inputTokens: 0, outputTokens: 0, costUsd: 0 },
  };
}
function families(result: ReturnType<typeof buildHeuristicGenerationPlan>, eligible: DesignFamilyRepertoire[]) {
  return result.slots.map(slot => slot.status === "viable"
    ? eligible.find(r => r.defaultOffer.offerId === slot.candidateId)?.family : slot.status);
}

describe("family-first deterministic planner", () => {
  it("does not give siblings extra votes or transfer exact-source recency into family ranking", () => {
    const a = repertoire("alpha", "a"), old = repertoire("alpha", "old"), b = repertoire("beta", "b"), c = repertoire("gamma", "c");
    const recent = [{ requestId: "previous", selections: [{ family: "alpha", designIds: [old.sourceId] }] }];
    const scores = { alpha: 3.1, beta: 2.85, gamma: 2.7 };
    const baseline = [a, b, c];
    const expanded = [c, old, ...Array.from({ length: 8 }, (_, index) => repertoire("alpha", `extra-${index}`)), b, a, a];
    const original = buildHeuristicGenerationPlan(input(baseline, scores, recent));
    const duplicate = buildHeuristicGenerationPlan(input(expanded, scores, recent));
    expect(families(original, baseline)).toEqual(["alpha", "beta", "gamma"]);
    expect(families(duplicate, expanded)).toEqual(families(original, baseline));
    expect(new Set(families(duplicate, expanded)).size).toBe(3);
  });

  it("ranks distinct families by confidence-adjusted judgment before choosing compositions", () => {
    const eligible = [repertoire("alpha", "a"), repertoire("alpha", "a2"), repertoire("beta", "b"), repertoire("gamma", "c")];
    const result = buildHeuristicGenerationPlan(input(eligible, { alpha: [4, 0.3], beta: [3, 1], gamma: [2.8, 1] }));
    expect(families(result, eligible)).toEqual(["beta", "gamma", "alpha"]);
  });

  it("tries a viable sibling before another family and keeps its source/hash and child provenance", () => {
    const bad = repertoire("alpha", "too-small", { slideCount: 3, listMax: 2 });
    const good = repertoire("alpha", "adequate", { slideCount: 3, listMax: 6 });
    const fallback = repertoire("beta", "fallback", { slideCount: 3, listMax: 6 });
    const eligible = [bad, fallback, good];
    const request = input(eligible, { alpha: 4, beta: 3 });
    request.intent = { ...intent,
      requirements: [{ id: "items", description: "Seis itens na arte", kind: "content", surface: "art", origin: "explicit", requestQuote: "seis itens", itemCount: 6 }],
      content: Array.from({ length: 6 }, (_, index) => ({ id: `item-${index}`, meaning: `Item ${index + 1}`, sourceIds: [], requirementIds: ["items"] })),
    };
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const rejectedAlone = buildHeuristicGenerationPlan({ ...request, eligible: [bad] });
      expect(rejectedAlone.slots.every(slot => slot.status === "insufficient_fit")).toBe(true);
      const before = arsenalHash(eligible);
      const result = buildHeuristicGenerationPlan(request);
      const selected = result.slots[0] as ViableGenerationPlan;
      expect(selected.status).toBe("viable");
      expect(selected.candidateId).toBe(good.defaultOffer.offerId);
      const offer = materializeDesignFamilyOffer(good, selected.pages.map(page => page.componentId));
      expect([offer.sourceId, offer.sourceHash]).toEqual([good.sourceId, good.sourceHash]);
      expect(offer.slides[0].componentId).toBe(good.sourceId);
      for (const slide of offer.slides.slice(1)) {
        expect(slide.card.completeDesign!.designGuidance!.carouselVariant).toMatchObject({ sourceId: good.sourceId, sourceHash: good.sourceHash });
        expect(bad.slides.flatMap(s => s.variants).some(c => c.id === slide.componentId)).toBe(false);
      }
      expect(validateGenerationPlan(selected, offer, request.intent)).toEqual([]);
      expect(arsenalHash(eligible)).toBe(before);
    } finally { warning.mockRestore(); }
  });

  it("uses component history only to choose among equally fitting sources inside an elected family", () => {
    const old = repertoire("alpha", "old"), fresh = repertoire("alpha", "fresh"), other = repertoire("beta", "b");
    const eligible = [old, other, fresh];
    const result = buildHeuristicGenerationPlan(input(eligible, { alpha: 4, beta: 3 }, [
      { requestId: "previous", selections: [{ family: "alpha", designIds: [old.sourceId] }] },
    ]));
    expect(result.slots[0]).toMatchObject({ status: "viable", candidateId: fresh.defaultOffer.offerId });
    expect(families(result, eligible)).toEqual(["alpha", "beta", "alpha"]);
  });

  it("keeps three requested items on their own slide and reserves the closing for its own message",()=>{
    const family=repertoire("checklist","three-items",{slideCount:3,listMax:3});
    const requirement=(id:string,itemCount:number)=>({id,description:id,kind:"content" as const,surface:"art" as const,origin:"explicit" as const,requestQuote:id,itemCount});
    const request=input([family],{checklist:4});
    request.neutrality={version:1,seed:"same-brief",planningVersion:2};
    request.intent={...intent,requirements:[requirement("opening",1),requirement("items",3),requirement("closing",1)],content:[
      {id:"cover",meaning:"Três passos",sourceIds:[],requirementIds:["opening"]},
      ...["a","b","c"].map(id=>({id,meaning:id,sourceIds:[],requirementIds:["items"]})),
      {id:"finish",meaning:"Aplique o roteiro",sourceIds:[],requirementIds:["closing"]},
    ]};
    const plan=buildHeuristicGenerationPlan(request).slots[0] as ViableGenerationPlan;
    expect(plan.status).toBe("viable");
    expect(plan.pages[1].assignments.find(field=>field.itemCount===3)?.contentIds).toEqual(["a","b","c"]);
    expect(plan.pages[2].assignments.every(field=>field.contentIds.includes("finish"))).toBe(true);
  });
  it("normalizes a written page count only when it matches the admitted format and quotation",()=>{
    const brief="Crie um carrossel narrativo com cinco lâminas, sem fotografia.";
    const item={...intent,requirements:[{id:"format",description:"cinco páginas",kind:"execution" as const,surface:"art" as const,origin:"explicit" as const,requestQuote:"com cinco lâminas",itemCount:5}]};
    expect(normalizeGenerationIntent(item,5,new Set(),brief,true).requirements[0].itemCount).toBeNull();
    expect(normalizeGenerationIntent(item,4,new Set(),brief,true).requirements[0].itemCount).toBe(5);
    expect(normalizeGenerationIntent(item,5,new Set(),brief).requirements[0].itemCount).toBe(5);
  });

  it.each([true, false])("plans caption details separately for family-first=%s", familyFirst => {
    const family = repertoire("editorial", "art-and-caption", { slideCount: 5, listMax: 3 });
    const requirement = (id: string, surface: "art" | "caption", itemCount: number | null) => ({
      id, description: id, kind: "content" as const, origin: "explicit" as const, surface,
      requestQuote: id, itemCount,
    });
    const item = (id: string, ...requirementIds: string[]) => ({ id, meaning: id, requirementIds, sourceIds: [] });
    const request: HeuristicPlanBuilderInput = {
      ...input([family], { editorial: 4 }),
      familyFirst,
      neutrality: { version: 1, seed: "art-and-caption", planningVersion: 3 },
      intent: {
        ...intent,
        requirements: [requirement("opening", "art", null), requirement("steps", "art", 3),
          requirement("shared-detail", "caption", null), requirement("detail", "caption", 1), requirement("closing", "art", null)],
        content: [item("cover", "opening"), item("objective", "steps", "shared-detail"),
          item("facts", "steps"), item("audience", "steps"), item("why", "detail"), item("save", "closing")],
      },
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const previous = buildHeuristicGenerationPlan({ ...request, neutrality: { version: 1, seed: "art-and-caption", planningVersion: 2 } });
      expect(previous.slots.every(slot => slot.status === "insufficient_fit")).toBe(true);
    } finally { warn.mockRestore(); }

    const plan = buildHeuristicGenerationPlan(request).slots[0];
    expect(plan.status).toBe("viable");
    if (plan.status !== "viable") throw new Error(plan.reason);
    expect(plan.captionContentIds).toEqual(["objective", "why"]);
    expect(plan.pages.map(page => Array.from(new Set(page.assignments.flatMap(a => a.contentIds)))))
      .toEqual([["cover"], ["objective"], ["facts"], ["audience"], ["save"]]);
    const offer = materializeDesignFamilyOffer(family, plan.pages.map(page => page.componentId));
    expect(validateGenerationPlan(plan, offer, request.intent)).toEqual([]);
  });
  it("preserves the historical branch when the version flag is absent or false", () => {
    const old = repertoire("alpha", "old"), fresh = repertoire("alpha", "fresh"), other = repertoire("beta", "b");
    const eligible = [old, fresh, other];
    const request = input(eligible, { alpha: 3.1, beta: 2.85 }, [
      { requestId: "previous", selections: [{ family: "alpha", designIds: [old.sourceId] }] },
    ]);
    const { familyFirst: _flag, ...historical } = request;
    const legacy = buildHeuristicGenerationPlan(historical);
    expect(buildHeuristicGenerationPlan({ ...request, familyFirst: false })).toEqual(legacy);
    expect(families(legacy, eligible)).toEqual(["alpha", "beta", "alpha"]);
    expect(arsenalHash(legacy)).toBe("0666d8f82996adeb1ccfceb4648c5728d319580fa8d549240d96de7ae64cf638");
  });
});
