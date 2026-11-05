/** Controlled journal fixtures: these tests prove replay/audit integrity, not
 * semantic correctness of a provider judgement or a real generation journey. */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { arsenalHash } from "../shared/arsenalContent";
import { describeConciseDesignFamilyRepertoire, describeCoverOnlyDesignFamilyRepertoire, describeDesignFamilyRepertoire } from "../shared/compactDesignProfile";
import { combineEditorialDesignProfile, editorialCatalogHash, type FrozenEditorialCatalog } from "../shared/editorialIntent";
import { resolveDesignFamilyRepertoires, materializeDesignFamilyOffer } from "../shared/designRepertoire";
import { generationEditorialIntentSchema, generationIntentLegacySchema, sealGenerationPlanningReceipt } from "../shared/generationPlan";
import { preparationReceipt } from "../shared/generationPreparationReceipt";
import { electionCatalogFixture, electionCatalogRequest } from "./designCatalog/designElection.fixture";
import { reconcileCatalogCoverage } from "./designCatalog/catalogCoverage";
import { inspectPlannedDesignElection } from "./plannedDesignElectionEvidence";
import { compactComponentCard, createComponentDefinition } from "../shared/componentAssembly";
import { buildFamilySelectionCandidates } from "../shared/designFamilySelection";
import { FAMILY_RETRIEVAL_POLICY, familyRetrievalPolicyHash } from "../shared/familyRetrieval";
import { familyCorpusHash, familySearchQuery } from "./designCatalog/familyRetrieval";
import { planFamilyRecovery, FAMILY_RECOVERY_REASON } from "../shared/familyRecovery";
import { inspectFamilyPlanFit } from "./designCatalog/familyPlanFit";
import { buildHeuristicGenerationPlan } from "./ai/workflows/heuristicPlanBuilder";

function fixture(editorial = true, projection: "concise" | "full" | "cover" = "concise", empty = false, count = 14, pairFamilies = false) {
  const base = electionCatalogFixture(count);
  const definitions = pairFamilies ? base.definitions.map((definition, i) => createComponentDefinition({
    ...definition, completeDesign: { ...definition.completeDesign!, family: `family-${Math.floor(i / 2)}` },
  })) : base.definitions;
  const inventory = pairFamilies ? {
    registered: definitions.map(d => ({ id: d.id, definition_hash: d.hash, status: "approved", aspect_ratios: d.aspectRatios, roles: d.roles, source: d.source, design: d.completeDesign! })),
    indexed: definitions.map(d => ({ component_id: d.id, definition_hash: d.hash, card: compactComponentCard(d) })),
  } : base.inventory;
  const catalog = reconcileCatalogCoverage(electionCatalogRequest, inventory);
  const repertoires = resolveDesignFamilyRepertoires(catalog.cards, { slideCount: 1, contentMode: "compose" });
  const document = {
    version: 1 as const,
    intents: [{ id: "compare", label: "Comparar", description: "Apresentar diferenças entre alternativas." }],
    designs: [{ sourceId: definitions[0].id, sourceHash: definitions[0].hash, intentIds: ["compare"], rationale: "Duas regiões permitem apresentar alternativas." }],
  };
  const editorialCatalog: FrozenEditorialCatalog | null = empty ? null : {
    version: 1, catalogRevision: "7", revision: "00000000-0000-4000-8000-000000000007",
    hash: editorialCatalogHash(document), document,
  };
  const intent = {
    version: 1 as const, objective: "Comparar alternativas",
    tone: { description: "Claro", origin: "inferred" as const, rationale: "Facilitar a leitura." },
    adaptation: "controlled" as const, requirements: [],
    content: [{ id: "idea", meaning: "Diferenças entre alternativas", requirementIds: [], sourceIds: [] }],
    ...(editorial ? { editorial: { version: 1 as const, signals: empty ? [] : [{
      intentId: "compare", state: "requested" as const, origin: "explicit" as const,
      clarity: "clear" as const, requestQuote: "Compare", rationale: "Pedido explícito.",
    }] } } : {}),
  };
  const describe = projection === "full" ? describeDesignFamilyRepertoire : projection === "cover" ? describeCoverOnlyDesignFamilyRepertoire : describeConciseDesignFamilyRepertoire;
  const profileHashes = Object.fromEntries(repertoires.map(r => [r.defaultOffer.offerId, arsenalHash(editorial
    ? combineEditorialDesignProfile(describe(r), editorialCatalog, r.sourceId, r.sourceHash)
    : describe(r))]));
  const slots = [0, 1, 2].map(slot => ({ slot, status: "insufficient_fit" as const, reason: "Nenhuma opção selecionada nesta evidência controlada.", unmetRequirementIds: [] }));
  const config = { version: 1, generationStrategyVersion: 2, model: "controlled-provider", configurationHash: "a".repeat(64), preparationBudget: { version: 1 }, ...(editorial ? { editorialIntentVersion: 1 } : {}) };
  const intentSchema = z.toJSONSchema(editorial ? generationEditorialIntentSchema : generationIntentLegacySchema); delete intentSchema.$schema;
  const expectation = { kind: "generation_preparation_v1" as const, configurationHash: config.configurationHash, model: config.model,
    messagesHash: "b".repeat(64), requestHash: "c".repeat(64),
    responseFormatHash: arsenalHash({ type: "json_schema", json_schema: { name: "generation_intent_v1", strict: true, schema: intentSchema } }),
  };
  const planning = sealGenerationPlanningReceipt({
    version: 1, intent, slots, offers: [null, null, null], catalogReceiptHash: catalog.coverage.receiptHash,
    candidates: repertoires.map(r => ({ id: r.defaultOffer.offerId, signature: r.signature, profileHash: profileHashes[r.defaultOffer.offerId] })),
    selectorIds: repertoires.slice(0, 12).map(r => r.defaultOffer.offerId),
    ranking: repertoires.map(r => ({ id: r.defaultOffer.offerId, score: 4, confidence: 0.8 })),
    recoveryRepertoires: [[], [], []], ...(editorial ? { editorialCatalog } : {}),
  });
  const request: any = {
    generation_config: config, catalog_revision: "7", experimental: false,
    input: { content: "Compare duas alternativas com clareza.", postMode: "static", aspectRatio: "4:5", inputType: "text" }, proposals: [],
    prepared: { preparationVersion: 6, reviewPolicyVersion: 10, planning, selectedDefinitions: [[], [], []],
      editorialContext: { sources: [], guidanceRanges: [] },
      imageObligation: { policy: "optional", required: false, purpose: "none", reason: "Sem obrigação de mídia", slotTargets: 0 },
    },
  };
  const operations: any[] = [
    { operation_key: "prepare:catalog", state: "completed", result: catalog },
    { operation_key: "prepare:selection_input", state: "completed", result: { shortlistProfileEncoding: projection === "cover" ? undefined : "repertoire_pages_v1", ...(editorial ? { editorialCatalog } : {}) } },
    { operation_key: "prepare:intent", state: "completed", expectation,
      result: preparationReceipt({ id: "controlled-intent", model: config.model, choices: [{ message: { content: JSON.stringify(intent) } }] }, expectation) },
    { operation_key: "prepare:selection", state: "completed", result: { version: 1, slots, __generationTrace: { version: 1, calls: [], events: [{ stage: "generation_plan", status: "completed", detail: "deterministic_local", data: { paidEffect: false } }] } } },
    { operation_key: `prepare:design-shortlist:0:${"d".repeat(64)}`, state: "completed", result: {
      answers: Object.fromEntries(repertoires.map(r => [r.defaultOffer.offerId, { type: "score", score: 4, confidence: 0.8 }])),
      assessmentContext: { version: 1, profileVersion: 3, requestHash: "d".repeat(64),
        questionIds: repertoires.map(r => r.defaultOffer.offerId), profileHashes,
        designHashes: Object.fromEntries(repertoires.map(r => [r.defaultOffer.offerId, r.defaultOffer.signature])),
      },
    } },
  ];
  return { request, operations, inspect: () => inspectPlannedDesignElection(request, operations), repertoires, definitions };
}

function reseal(s: ReturnType<typeof fixture>) {
  const { hash: _hash, ...basis } = s.request.prepared.planning;
  s.request.prepared.planning = sealGenerationPlanningReceipt(basis);
}

function familyFixture(count = 26) {
  const s = fixture(true, "concise", false, count, true);
  const planning = s.request.prepared.planning;
  const families = buildFamilySelectionCandidates(s.repertoires, planning.editorialCatalog);
  s.operations.find(o => o.operation_key === "prepare:selection_input").result.familyRankingVersion = 1;
  planning.familyElection = {
    version: 1,
    candidates: families.map(family => ({ id: family.id, family: family.family, signature: family.signature, profileHash: arsenalHash(family.profile), memberIds: family.repertoires.map(r => r.defaultOffer.offerId) })),
    ranking: families.map(family => ({ id: family.id, score: 4, confidence: 0.8 })),
    shortlistedIds: families.slice(0, 12).map(family => family.id),
  };
  planning.selectorIds = families.slice(0, 12).flatMap(family => family.repertoires.map(r => r.defaultOffer.offerId));
  const op = s.operations.find(o => o.operation_key.startsWith("prepare:design-shortlist:"));
  op.result = {
    answers: Object.fromEntries(families.map(family => [family.id, { type: "score", score: 4, confidence: 0.8 }])),
    assessmentContext: { version: 1, profileVersion: 4, requestHash: "d".repeat(64),
      questionIds: families.map(family => family.id),
      profileHashes: Object.fromEntries(families.map(family => [family.id, arsenalHash(family.profile)])),
      designHashes: Object.fromEntries(families.map(family => [family.id, family.signature])),
    },
  };
  reseal(s);
  return { ...s, families, scoring: op };
}

function retrievedFixture() {
  const s = familyFixture(80), planning = s.request.prepared.planning;
  const ids = s.families.slice(0,24).map(f=>f.id), reserved = s.families.slice(24,36).map(f=>f.id);
  const query=familySearchQuery(planning.intent,planning.editorialCatalog);
  const retrieval={version:1,policyHash:familyRetrievalPolicyHash(),catalogHash:familyCorpusHash(s.families),query,queryHash:arsenalHash(query),
    indexHash:"a".repeat(64),modelFingerprint:"b".repeat(64),eligibleFamilies:40,initialIds:ids,additionalIds:reserved,expanded:false,
    recovered:[...ids,...reserved].map(id=>({id,lexical:1,semantic:.8,editorial:0,structural:0,reason:"relevance"})),
    transport:{batches:0,bytes:0,largestRequestBytes:0}};
  s.operations.push({operation_key:"prepare:family_retrieval",state:"completed",result:structuredClone(retrieval)});
  Object.assign(s.operations.find(o=>o.operation_key==="prepare:selection_input").result,{familyRetrievalVersion:1,familyRetrievalIndex:{hash:retrieval.indexHash,modelFingerprint:retrieval.modelFingerprint}});
  planning.familyElection.version=2;planning.familyElection.retrieval={...retrieval,transport:{batches:1,bytes:1000,largestRequestBytes:1000}};
  planning.familyElection.ranking=planning.familyElection.ranking.filter((r:any)=>ids.includes(r.id));
  planning.familyElection.shortlistedIds=ids.slice(0,12);
  planning.selectorIds=s.families.slice(0,12).flatMap(f=>f.repertoires.map(r=>r.defaultOffer.offerId));
  const members=new Set(s.families.slice(0,24).flatMap(f=>f.repertoires.map(r=>r.defaultOffer.offerId)));
  planning.ranking=planning.ranking.filter((r:any)=>members.has(r.id));
  const result=s.scoring.result;result.answers=Object.fromEntries(Object.entries(result.answers).filter(([id])=>ids.includes(id)));
  result.assessmentContext.questionIds=ids;
  result.assessmentContext.designHashes=Object.fromEntries(Object.entries(result.assessmentContext.designHashes).filter(([id])=>ids.includes(id)));
  result.assessmentContext.profileHashes=Object.fromEntries(Object.entries(result.assessmentContext.profileHashes).filter(([id])=>ids.includes(id)));
  result.assessmentContext.requestBytes=1000;reseal(s);return s;
}

describe("frozen editorial catalog election evidence", () => {
  it("verifies the canonical recovery reason but still rejects a changed assignment after resealing",()=>{
    const s=familyFixture(2),p=s.request.prepared.planning,obligation=s.request.prepared.imageObligation;
    const query=familySearchQuery(p.intent,p.editorialCatalog),id=s.families[0].id;
    const retrieval={version:1,policyHash:familyRetrievalPolicyHash(),catalogHash:familyCorpusHash(s.families),query,queryHash:arsenalHash(query),indexHash:null,modelFingerprint:null,eligibleFamilies:1,initialIds:[id],additionalIds:[],expanded:false,recovered:[{id,lexical:1,semantic:null,editorial:0,structural:0,reason:"relevance"}],transport:{batches:0,bytes:0,largestRequestBytes:0}};
    s.operations.push({operation_key:"prepare:family_retrieval",state:"completed",result:structuredClone(retrieval)});
    Object.assign(s.operations.find(o=>o.operation_key==="prepare:selection_input").result,{familyRetrievalVersion:1,familyRecoveryVersion:1});
    p.familyElection.version=3;p.familyElection.retrieval={...retrieval,transport:{batches:1,bytes:1000,largestRequestBytes:1000}};
    p.familyElection.ranking.forEach((r:any)=>{r.score=1.5;r.confidence=.12;});
    p.ranking.forEach((r:any)=>{r.score=1.5;r.confidence=.12;});
    Object.values(s.scoring.result.answers).forEach((r:any)=>{r.score=1.5;r.confidence=.12;});s.scoring.result.assessmentContext.requestBytes=1000;
    p.familyElection.recovery=planFamilyRecovery(p.familyElection.ranking,ids=>inspectFamilyPlanFit({families:s.families,ids,scores:p.familyElection.ranking,intent:p.intent,imageObligation:obligation,requestedPhotoMix:false,slideCount:1,recentSelections:[]}));
    const evaluated=s.repertoires.map(r=>({id:r.defaultOffer.offerId,hash:r.defaultOffer.signature,score:1.5,confidence:.12}));
    const selected=buildHeuristicGenerationPlan({familyFirst:true,intent:p.intent,eligible:s.repertoires,shortlist:{cards:[],evaluated,batches:1,inputTokens:0,outputTokens:0,costUsd:0},imageObligation:obligation,slideCount:1});
    s.operations.find(o=>o.operation_key==="prepare:selection").result.slots=structuredClone(selected.slots);
    p.slots=selected.slots.map(slot=>({...slot,reason:FAMILY_RECOVERY_REASON}));
    p.offers=p.slots.map((slot:any)=>materializeDesignFamilyOffer(s.repertoires.find(r=>r.defaultOffer.offerId===slot.candidateId)!,slot.pages.map((page:any)=>page.componentId)));
    s.request.prepared.selectedDefinitions=p.offers.map((o:any)=>o.slides.map((slide:any)=>s.definitions.find(d=>d.id===slide.componentId)));
    reseal(s);expect(s.inspect().issues).toEqual([]);
    p.slots[0].pages[0].assignments[0].instruction="Different assignment";reseal(s);
    expect(s.inspect().issues).toContain("selection_plan_mismatch:0");
  });
  it("reconstructs the pinned recovery policy and refuses a resealed fabricated attempt", () => {
    const s=retrievedFixture(),planning=s.request.prepared.planning;
    s.operations.find(o=>o.operation_key==="prepare:selection_input").result.familyRecoveryVersion=1;
    planning.familyElection.version=3;
    planning.familyElection.recovery=planFamilyRecovery(planning.familyElection.ranking,ids=>inspectFamilyPlanFit({families:s.families,ids,scores:planning.familyElection.ranking,intent:planning.intent,imageObligation:s.request.prepared.imageObligation,requestedPhotoMix:false,slideCount:1,recentSelections:[]}));
    planning.familyElection.shortlistedIds=planning.familyElection.recovery.normalIds;
    planning.selectorIds=s.families.filter(f=>planning.familyElection.shortlistedIds.includes(f.id)).flatMap(f=>f.repertoires.map(r=>r.defaultOffer.offerId));
    reseal(s);expect(s.inspect().issues).toEqual([]);
    planning.familyElection.recovery.attempts.push({id:s.families[39].id,score:1.5,confidence:.1,fit:{viableSlots:[0,1,2],planHash:"a".repeat(64)},accepted:true,reason:"verified_gain"});
    reseal(s);expect(s.inspect().issues).toContain("family_recovery_local_evidence_mismatch");
  });
  it("distinguishes 40 eligible families, 24 assessed families and sources outside retrieval", () => {
    const s=retrievedFixture();expect(s.inspect().issues).toEqual([]);
    expect(s.inspect().eligibleFamilies).toBe(40);expect(s.inspect().evaluatedFamilies).toBe(24);
    const reopened=JSON.parse(JSON.stringify({request:s.request,operations:s.operations}));
    expect(inspectPlannedDesignElection(reopened.request,reopened.operations).issues).toEqual([]);
  });
  it.each(["query","index","invented_vote","transport","unknown_member"])("rejects resealed retrieval corruption: %s", fault=>{
    const s=retrievedFixture(),retrieval=s.request.prepared.planning.familyElection.retrieval;
    if(fault==="query")retrieval.query="Outra consulta";
    if(fault==="index")retrieval.indexHash="f".repeat(64);
    if(fault==="invented_vote")s.request.prepared.planning.familyElection.ranking.push({id:s.families[39].id,score:4,confidence:1});
    if(fault==="transport"){s.scoring.result.assessmentContext.requestBytes=FAMILY_RETRIEVAL_POLICY.maxTotalRequestBytes+1;retrieval.transport.bytes=FAMILY_RETRIEVAL_POLICY.maxTotalRequestBytes+1;}
    if(fault==="unknown_member")retrieval.initialIds[0]="unknown";
    reseal(s);expect(s.inspect().issues.length).toBeGreaterThan(0);
  });
  it.each(["full", "concise", "cover"] as const)("preserves historical %s profiles without adding editorial interpretation", projection => {
    const s = fixture(false, projection);
    expect(s.inspect().issues).toEqual([]);
  });

  it("reconstructs enhanced JEV profiles from the stored sidecar after JSON transport", () => {
    const s = fixture();
    const reopened = JSON.parse(JSON.stringify({ request: s.request, operations: s.operations }));
    const evidence = inspectPlannedDesignElection(reopened.request, reopened.operations);
    expect(evidence.issues).toEqual([]);
    expect(evidence.evaluated).toBe(14);
    expect(evidence.candidates.every(c => c.profileHash === s.request.prepared.planning.candidates.find((p: any) => p.id === c.offerId).profileHash)).toBe(true);
  });

  it.each([1, 3, 12])("requires semantic scoring coverage even with only %i editorial candidates", count => {
    const s = fixture(true, "concise", false, count);
    expect(s.inspect().issues).toEqual([]);
    expect(s.inspect().method).toBe("scored_batches");
    expect(s.inspect().evaluated).toBe(count);
    s.operations.splice(s.operations.findIndex(o => o.operation_key.startsWith("prepare:design-shortlist:")), 1);
    expect(s.inspect().issues).toContain("scoring_coverage_incomplete");
    expect(s.inspect().candidates.every(c => c.evaluated === null)).toBe(true);
  });

  it("accepts an explicitly frozen empty catalog, but not an absent catalog receipt", () => {
    const s = fixture(true, "concise", true);
    expect(s.inspect().issues).toEqual([]);
    delete s.operations.find(o => o.operation_key === "prepare:selection_input").result.editorialCatalog;
    expect(s.inspect().issues).toContain("editorial_catalog_receipt_missing");
    const missingPlan = fixture();
    delete missingPlan.request.prepared.planning.editorialCatalog;
    reseal(missingPlan);
    expect(missingPlan.inspect().issues).toContain("editorial_catalog_receipt_missing");
  });

  it("rejects changed or mismatched sidecars even when the planning receipt is resealed", () => {
    const s = fixture();
    s.request.prepared.planning.editorialCatalog = structuredClone(s.request.prepared.planning.editorialCatalog);
    const frozen = s.request.prepared.planning.editorialCatalog;
    frozen.document.intents[0].description = "Outra intencionalidade depois da preparação.";
    frozen.hash = editorialCatalogHash(frozen.document);
    reseal(s);
    expect(s.inspect().issues).toContain("editorial_catalog_receipt_mismatch");
    const wrongRevision = fixture();
    wrongRevision.request.catalog_revision = "8";
    expect(wrongRevision.inspect().issues).toContain("editorial_catalog_revision_mismatch");
  });

  it("does not accept legacy unannotated profile hashes under the editorial protocol", () => {
    const s = fixture();
    const annotated = s.request.prepared.planning.editorialCatalog.document.designs[0];
    const repertoire = s.repertoires.find(r => r.sourceId === annotated.sourceId)!;
    const candidate = s.request.prepared.planning.candidates.find((c: any) => c.id === repertoire.defaultOffer.offerId);
    candidate.profileHash = arsenalHash(describeConciseDesignFamilyRepertoire(repertoire));
    reseal(s);
    expect(s.inspect().issues).toContain("planning_candidates_reconstruction_mismatch");
  });

  it.each(["unknown_id", "unattributed_quote", "inferred_prohibition"])("rejects editorial %s despite matching provider and planning values", fault => {
    const s = fixture(), intent = s.request.prepared.planning.intent;
    if (fault === "unknown_id") intent.editorial.signals[0].intentId = "invented";
    if (fault === "unattributed_quote") intent.editorial.signals[0].requestQuote = "Pedido que nunca foi feito";
    if (fault === "inferred_prohibition") Object.assign(intent.editorial.signals[0], { state: "forbidden", origin: "inferred", requestQuote: null });
    s.operations.find(o => o.operation_key === "prepare:intent").result.choices[0].message.content = JSON.stringify(intent);
    reseal(s);
    expect(s.inspect().issues).toContain("editorial_intent_evidence_mismatch");
  });

  it("requires the admitted marker and never upgrades a historical receipt implicitly", () => {
    const s = fixture();
    delete s.request.generation_config.editorialIntentVersion;
    expect(s.inspect().issues).toContain("editorial_protocol_unpinned");
    const historical = fixture(false);
    historical.request.generation_config.editorialIntentVersion = 1;
    expect(historical.inspect().issues).toContain("editorial_catalog_receipt_missing");
  });

  it("requires the editorial response schema even when the provider receipt is consistently rewritten", () => {
    const s = fixture();
    const operation = s.operations.find(o => o.operation_key === "prepare:intent");
    const schema = z.toJSONSchema(generationIntentLegacySchema); delete schema.$schema;
    operation.expectation.responseFormatHash = arsenalHash({ type: "json_schema", json_schema: { name: "generation_intent_v1", strict: true, schema } });
    operation.result.__preparationReceipt.expectation = structuredClone(operation.expectation);
    expect(s.inspect().issues).toContain("editorial_intent_schema_mismatch");
  });

  it("audits one vote per family and complete member expansion after JSON transport", () => {
    const s = familyFixture();
    const reopened = JSON.parse(JSON.stringify({ request: s.request, operations: s.operations }));
    const evidence = inspectPlannedDesignElection(reopened.request, reopened.operations);
    expect(evidence.issues).toEqual([]);
    expect(evidence).toMatchObject({ assessmentUnit: "family", method: "scored_family_batches", eligibleOffers: 26, eligibleFamilies: 13, evaluated: 13, evaluatedFamilies: 13, shortlistedFamilies: 12, selectorOptions: 24 });
    expect(evidence.familyCandidates).toHaveLength(13);
    expect(evidence.candidates.every(c => c.scoreOrigin === "family" && c.familyCandidateId)).toBe(true);
  });

  it.each([2, 6, 24])("scores every family even when %i sources produce at most twelve families", count => {
    const s = familyFixture(count);
    expect(s.inspect().issues).toEqual([]);
    expect(s.inspect().evaluated).toBe(count / 2);
    const missing = s.families[0].id;
    delete s.scoring.result.answers[missing];
    delete s.scoring.result.assessmentContext.designHashes[missing];
    delete s.scoring.result.assessmentContext.profileHashes[missing];
    s.scoring.result.assessmentContext.questionIds = s.scoring.result.assessmentContext.questionIds.filter((id: string) => id !== missing);
    expect(s.inspect().issues).toContain("family_scoring_coverage_incomplete");
  });

  it("rejects repeated family votes rather than counting member alternatives as independent votes", () => {
    const s = familyFixture();
    const duplicate = structuredClone(s.scoring);
    duplicate.operation_key = `prepare:design-shortlist:1:${"d".repeat(64)}`;
    s.operations.push(duplicate);
    expect(s.inspect().issues).toContain(`duplicate_scoring_receipt:${s.families[0].id}`);
    expect(s.inspect().evaluatedFamilies).toBe(13);
    s.operations.pop();
    s.scoring.result.assessmentContext.profileVersion = 3;
    expect(s.inspect().issues).toContain(`scoring_receipt_invalid:${s.scoring.operation_key}`);
  });

  it.each(["missing_member", "wrong_family", "changed_signature", "changed_profile"])("rejects resealed family grouping corruption: %s", fault => {
    const s = familyFixture();
    const candidate = s.request.prepared.planning.familyElection.candidates[0];
    if (fault === "missing_member") candidate.memberIds.pop();
    if (fault === "wrong_family") candidate.family = "other-family";
    if (fault === "changed_signature") candidate.signature = "f".repeat(64);
    if (fault === "changed_profile") candidate.profileHash = "e".repeat(64);
    reseal(s);
    expect(s.inspect().issues).toContain("family_candidates_reconstruction_mismatch");
  });

  it("requires complete expansion and faithful projected scores for every member", () => {
    const s = familyFixture();
    s.request.prepared.planning.selectorIds.pop();
    reseal(s);
    expect(s.inspect().issues).toContain("family_shortlist_expansion_mismatch");
    const changed = familyFixture();
    changed.request.prepared.planning.ranking[0].score = 0;
    reseal(changed);
    expect(changed.inspect().issues).toContain("planning_family_score_projection_mismatch");
  });

  it("selects the twelve strongest family effective scores and does not fall back to raw scores", () => {
    const s = familyFixture();
    const planning = s.request.prepared.planning;
    for (const [i, family] of s.families.entries()) {
      const score = i === 0 ? { score: 4, confidence: 0 } : { score: 3, confidence: 1 };
      Object.assign(s.scoring.result.answers[family.id], score);
      Object.assign(planning.familyElection.ranking.find((r: any) => r.id === family.id), score);
      for (const member of family.repertoires)
        Object.assign(planning.ranking.find((r: any) => r.id === member.defaultOffer.offerId), score);
    }
    planning.familyElection.shortlistedIds = s.families.slice(1).map(f => f.id);
    planning.selectorIds = s.families.slice(1).flatMap(f => f.repertoires.map(r => r.defaultOffer.offerId));
    reseal(s);
    expect(s.inspect().issues).toEqual([]);
    planning.familyElection.shortlistedIds = s.families.slice(0, 12).map(f => f.id);
    planning.selectorIds = s.families.slice(0, 12).flatMap(f => f.repertoires.map(r => r.defaultOffer.offerId));
    reseal(s);
    expect(s.inspect().issues).toContain("family_shortlist_suitability_coverage_mismatch");
  });

  it("requires agreement between the frozen selection protocol and family receipt", () => {
    const s = familyFixture();
    delete s.operations.find(o => o.operation_key === "prepare:selection_input").result.familyRankingVersion;
    expect(s.inspect().issues).toContain("family_ranking_protocol_mismatch");
    const missing = familyFixture();
    delete missing.request.prepared.planning.familyElection;
    reseal(missing);
    expect(missing.inspect().issues).toContain("family_ranking_protocol_mismatch");
  });

  it("does not extend the family shortlist without a frozen media obligation", () => {
    const s = familyFixture();
    s.request.prepared.planning.familyElection.shortlistedIds = s.families.map(f => f.id);
    s.request.prepared.planning.selectorIds = s.repertoires.map(r => r.defaultOffer.offerId);
    reseal(s);
    expect(s.inspect().issues).toContain("family_shortlist_unjustified_extension");
  });

  it("cross-checks retained JEV payloads against the aggregate family profile", () => {
    const s = familyFixture();
    const questions = Object.fromEntries(s.families.map(family => [family.id, { type: "score", instructions: { design: structuredClone(family.profile) } }]));
    s.scoring.result.__generationTrace = { calls: [{ messages: [{ questions }] }] };
    expect(s.inspect().issues).toEqual([]);
    questions[s.families[0].id].instructions.design = describeConciseDesignFamilyRepertoire(s.families[0].repertoires[0]) as any;
    expect(s.inspect().issues).toContain(`family_scoring_actual_payload_mismatch:${s.scoring.operation_key}`);
  });
});
