import { describe, expect, it, vi } from "vitest";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { defaultStudioPreferences } from "@shared/studioPreferences";
import { compactComponentCard } from "@shared/componentAssembly";
import { sealElectionReceipt } from "@shared/designElection";
import { reconcileCatalogCoverage } from "../../designCatalog/catalogCoverage";
import { electionCatalogFixture, electionCatalogRequest } from "../../designCatalog/designElection.fixture";
import { authorCarouselVisualVariant } from "../../designCatalog/carouselVisualVariants";
import { shortlistCompleteDesigns, type JevRequest } from "../../designCatalog/designShortlist";
import { verifyPreparedEligibility } from "./generationPreparation";
import { prepareHistoricalGeneration as prepareOrchestratedGeneration } from "./historicalPreparation.fixture";
import { inspectDesignElection } from "../../designElectionEvidence";
import { inspectGenerationEvidence } from "../../generationEvidence";
import { arsenalHash } from "@shared/arsenalContent";

const owner='11111111-1111-4111-8111-111111111111';
const input=(extra={})=>orchestratedGenerationInputSchema.parse({ownerId:owner,idempotencyKey:'election',inputType:'text',content:'Café fresco.',platform:'instagram',postMode:'static',aspectRatio:'4:5',...extra});
function setup(n=13) {
  const {definitions,inventory}=electionCatalogFixture(n);
  const catalog=reconcileCatalogCoverage(electionCatalogRequest,inventory);
  const journal=new Map<string,any>();
  const questions:string[]=[];
  const evaluate=vi.fn(async(r:JevRequest)=>{
    questions.push(...Object.keys(r.questions));
    return {id:'controlled-jev',model:r.model,answers:Object.fromEntries(Object.keys(r.questions).map(id=>[id,{type:'score' as const,score:id===Object.keys(r.questions).at(-1)?4:2,confidence:0.9}])),usage:{input_tokens:1,output_tokens:1,cost:0}};
  });
  const generate=vi.fn(async(p:any)=>{
    const data=JSON.parse(p.messages[1].content);
    return {choices:[{message:{content:JSON.stringify({version:2,options:data.catalog.slice(0,3).map((o:any)=>({offerId:o.offerId,reason:'Estrutura compatível com este briefing.'}))})}}]} as any;
  });
  const deps={loadContext:async()=>input().content,preferences:async()=>defaultStudioPreferences,
    retrieve:vi.fn(async()=>catalog),hydrate:vi.fn(async(ids:string[])=>definitions.filter(d=>ids.includes(d.id))),
    operation:async<T>(key:string,work:()=>Promise<T>):Promise<T>=>{if(journal.has(key))return journal.get(key);const r=await work();journal.set(key,r);return r;},
    shortlist:(p:any)=>shortlistCompleteDesigns(p,evaluate),generate};
  const operations=()=>Array.from(journal,([key,result])=>({operation_key:`prepare:${key}`,state:'completed',result}));
  return {definitions,inventory,catalog,journal,questions,evaluate,generate,deps,operations};
}
describe('complete design election journal',()=>{
  it('uses identical compact profiles in both stages and audits every new catalog entry',async()=>{
    const s=setup(14);
    const prepared=await prepareOrchestratedGeneration(input(),owner,false,Date.now()+60000,s.deps);
    const candidates=s.journal.get('election_candidates');
    expect(s.journal.get('catalog').selectionProfileVersion).toBe(2);
    expect(candidates.selectionProfiles).toHaveLength(14);
    const profiles=new Map(candidates.selectionProfiles.map((p:any)=>[p.offerId,p]));
    for(const [request] of s.evaluate.mock.calls) {
      expect(JSON.parse(request.state)).toHaveProperty('profileLegend');
      for(const [id,q] of Object.entries(request.questions))
        expect(q.instructions.design).toEqual((profiles.get(id) as any).profile);
    }
    const payload=JSON.parse(s.generate.mock.calls[0][0].messages[1].content);
    expect(payload.profileLegend).toContain('Design profile v2');
    for(const c of payload.catalog) {
      expect(c.profile).toEqual((profiles.get(c.offerId) as any).profile);
      expect(c.slides).toBeUndefined();
    }
    const evidence=inspectDesignElection({prepared},s.operations());
    expect(evidence).toMatchObject({complete:true,selectionProfileVersion:2,evaluated:14});
    expect(evidence.candidates.every(c=>c.profileHash&&c.profileVersion===2)).toBe(true);
    const batch=[...s.journal.keys()].find(k=>k.startsWith('design-shortlist:'))!;
    s.journal.get(batch).assessmentContext.profileHashes={};
    expect(inspectDesignElection({prepared},s.operations()).complete).toBe(false);
  });
  it('keeps a historical pinned catalog on the original protocol and reuses its completed work',async()=>{
    const s=setup();
    // A catalog persisted before this change has no profile protocol marker.
    s.journal.set('catalog',structuredClone(s.catalog));
    const prepared=await prepareOrchestratedGeneration(input(),owner,false,Date.now()+60000,s.deps);
    expect(s.journal.get('election_candidates').selectionProfiles).toBeUndefined();
    const payload=JSON.parse(s.generate.mock.calls[0][0].messages[1].content);
    expect(payload.profileLegend).toBeUndefined();
    expect(payload.catalog[0].slides).toBeDefined();
    expect(inspectDesignElection({prepared},s.operations())).toMatchObject({complete:true,selectionProfileVersion:1});
    const before=arsenalHash(s.operations()), calls=s.evaluate.mock.calls.length;
    expect(await prepareOrchestratedGeneration(input(),owner,false,Date.now()+60000,s.deps)).toEqual(prepared);
    expect(arsenalHash(s.operations())).toBe(before);
    expect(s.evaluate).toHaveBeenCalledTimes(calls);
    expect(s.generate).toHaveBeenCalledTimes(1);
    expect(s.deps.retrieve).not.toHaveBeenCalled();
  });
  it('persists an invalid selector response so replay cannot purchase another selection',async()=>{
    const s=setup(3);
    s.generate.mockResolvedValue({choices:[{message:{content:JSON.stringify({version:2,options:[]})}}]} as any);
    for(let i=0;i<2;i++)
      await expect(prepareOrchestratedGeneration(input(),owner,false,Date.now()+60000,s.deps)).rejects.toThrow();
    expect(s.journal.get('selection')).toMatchObject({version:2,options:[],profileContext:{version:2}});
    expect(s.generate).toHaveBeenCalledTimes(1);
  });
  it('rejects changed profile evidence even when its receipt has been re-sealed',async()=>{
    const s=setup(3), prepared=await prepareOrchestratedGeneration(input(),owner,false,Date.now()+60000,s.deps);
    s.journal.get('selection').profileContext.profileHashes={};
    expect(inspectDesignElection({prepared},s.operations()).complete).toBe(false);
    const candidates=structuredClone(s.journal.get('election_candidates'));
    candidates.selectionProfiles[0].profile.contentMode='literal';
    candidates.selectionProfiles[0].hash=arsenalHash(candidates.selectionProfiles[0].profile);
    const {receiptHash,...data}=candidates;
    s.journal.set('election_candidates',sealElectionReceipt(data));
    expect(inspectDesignElection({prepared},s.operations()).complete).toBe(false);
    await expect(prepareOrchestratedGeneration(input(),owner,false,Date.now()+60000,s.deps)).rejects.toThrow('catalog_coverage_incomplete');
  });
  it('links every registration, score and choice; resumes without another evaluation or selection',async()=>{
    const s=setup();
    const prepared=await prepareOrchestratedGeneration(input(),owner,false,Date.now()+60000,s.deps);
    const evidence=inspectDesignElection({prepared,proposals:[{slot:0,proposalId:'p0',status:'ready',reviews:[{status:'passed',findings:[]}]},{slot:1,proposalId:'p1',status:'failed',failure:{code:'review_content_rejected'},reviews:[{status:'correction_required',findings:[{category:'unsupported_claim',effect:'blocking',consequence:'false_claim'}]}]}]},s.operations());
    expect(evidence).toMatchObject({status:'verified',complete:true,registered:13,eligibleOffers:13,evaluated:13,selectorOptions:12,method:'scored_batches'});
    expect(new Set(s.questions).size).toBe(13);
    expect(evidence.candidates.filter(c=>c.outcome==='selected')).toHaveLength(3);
    expect(evidence.candidates.some(c=>c.outcome==='not_shortlisted')).toBe(true);
    expect(evidence.candidates.flatMap(c=>c.generatedPosts).map(p=>p.status)).toContain('failed');
    expect(inspectDesignElection({prepared},s.operations().filter(o=>!o.operation_key.startsWith('prepare:design-shortlist:'))).complete).toBe(false);
    const buys=s.evaluate.mock.calls.length;
    expect(await prepareOrchestratedGeneration(input(),owner,false,Date.now()+60000,s.deps)).toEqual(prepared);
    expect(s.evaluate).toHaveBeenCalledTimes(buys);expect(s.generate).toHaveBeenCalledTimes(1);
    await verifyPreparedEligibility(prepared,false,s.deps.hydrate);
    const corrupted={...prepared,electionReceipt:sealElectionReceipt({...prepared.electionReceipt!,choices:prepared.electionReceipt!.choices.map(c=>({...c,chosenOfferId:'missing'}))})};
    await expect(verifyPreparedEligibility(corrupted,false,s.deps.hydrate)).rejects.toThrow('catalog_coverage_incomplete');
  });
  it('sends a small catalog in full without inventing scores',async()=>{
    const s=setup(3);const prepared=await prepareOrchestratedGeneration(input(),owner,false,Date.now()+60000,s.deps);
    const evidence=inspectDesignElection({prepared},s.operations());
    expect(evidence).toMatchObject({complete:true,evaluated:0,selectorOptions:3,method:'all_sent_to_selector'});
    expect(evidence.candidates.every(c=>c.score===null&&c.evaluated==='direct_selection_without_score')).toBe(true);
    expect(s.evaluate).not.toHaveBeenCalled();
  });
  it('records the original election and a bounded diversity substitution separately',async()=>{
    const s=setup();
    s.generate.mockImplementation(async(p:any)=>{const catalog=JSON.parse(p.messages[1].content).catalog;return {choices:[{message:{content:JSON.stringify({version:2,options:[0,0,0].map(i=>({offerId:catalog[i].offerId,reason:'Escolha original do seletor.'}))})}}]} as any;});
    const prepared=await prepareOrchestratedGeneration(input(),owner,false,Date.now()+60000,s.deps);
    expect(prepared.electionReceipt!.choices.some(c=>c.originalOfferId!==c.chosenOfferId&&c.substitutionReason)).toBe(true);
    expect(new Set(prepared.electionReceipt!.choices.map(c=>c.chosenOfferId)).size).toBe(3);
    expect(inspectDesignElection({prepared},s.operations()).complete).toBe(true);
  });
  it('persists the invisible candidate before stopping and spends no AI calls',async()=>{
    const s=setup(3);s.inventory.indexed.pop();s.deps.retrieve=vi.fn(async()=>reconcileCatalogCoverage(electionCatalogRequest,s.inventory));
    await expect(prepareOrchestratedGeneration(input(),owner,false,Date.now()+60000,s.deps)).rejects.toThrow('catalog_coverage_incomplete');
    const evidence=inspectDesignElection({},s.operations());
    expect(evidence).toMatchObject({complete:false,status:'incomplete'});
    expect(evidence.registeredDesigns.at(-1)).toMatchObject({indexState:'missing',reasons:['index_missing']});
    expect(s.generate).not.toHaveBeenCalled();expect(s.evaluate).not.toHaveBeenCalled();
  });
  it('persists partial scoring and prevents selecting from an incomplete classification',async()=>{
    const s=setup();s.deps.shortlist=async(p:any)=>({cards:p.cards.slice(0,12),evaluated:p.cards.slice(0,12).map((c:any)=>({id:c.id,hash:c.hash,score:2,confidence:0.9})),batches:1,inputTokens:1,outputTokens:1,costUsd:0});
    await expect(prepareOrchestratedGeneration(input(),owner,false,Date.now()+60000,s.deps)).rejects.toThrow('catalog_coverage_incomplete');
    expect(s.journal.has('election_classification')).toBe(true);expect(s.generate).not.toHaveBeenCalled();
    expect(inspectDesignElection({},s.operations()).complete).toBe(false);
  });
  it('reports missing carousel roles and variants for other text modes before choosing',async()=>{
    const s=setup(3);const defs=s.definitions.flatMap((d,i)=>[d,authorCarouselVisualVariant(d,'development'),...(i===2?[]:[authorCarouselVisualVariant(d,'closing')]),authorCarouselVisualVariant(d,'development',false)]);
    const inventory={registered:defs.map(d=>({id:d.id,definition_hash:d.hash,status:'approved',aspect_ratios:d.aspectRatios,roles:d.roles,source:d.source,design:d.completeDesign!})),indexed:defs.map(d=>({component_id:d.id,definition_hash:d.hash,card:compactComponentCard(d)}))};
    const covered=reconcileCatalogCoverage({...electionCatalogRequest,postMode:'carousel',slideCount:3},inventory);
    s.deps.retrieve=vi.fn(async()=>covered);s.deps.hydrate=vi.fn(async(ids:string[])=>defs.filter(d=>ids.includes(d.id)));
    s.generate.mockImplementation(async(p:any)=>{const catalog=JSON.parse(p.messages[1].content).catalog;return {choices:[{message:{content:JSON.stringify({version:2,options:[0,1,0].map(i=>({offerId:catalog[i].offerId,reason:'Sequência compatível.'}))})}}]} as any;});
    const prepared=await prepareOrchestratedGeneration(input({postMode:'carousel',slideCount:3}),owner,false,Date.now()+60000,s.deps);
    const report=inspectDesignElection({prepared},s.operations());
    expect(report.complete).toBe(true);expect(report).toMatchObject({eligibleOffers:2});
    expect(report.registeredDesigns.find(e=>e.id===s.definitions[2].id)?.reasons).toContain('missing_exact_slide_role:closing');
    expect(report.registeredDesigns.some(e=>e.reasons.includes('variant_content_mode_mismatch'))).toBe(true);
  });
  it('distinguishes historical absence from broken new receipts and catches equal counts with different identities',async()=>{
    expect(inspectDesignElection({prepared:{}},[])).toMatchObject({status:'legacy_unverified',complete:false});
    const s=setup(3);const prepared=await prepareOrchestratedGeneration(input(),owner,false,Date.now()+60000,s.deps);
    const classification=s.journal.get('election_classification');
    // A same-length list with a different ID must fail even if re-sealed.
    const {receiptHash,...data}=classification;s.journal.set('election_classification',sealElectionReceipt({...data,selectorIds:[...data.selectorIds.slice(0,2),'another-offer']}));
    expect(inspectDesignElection({prepared},s.operations()).complete).toBe(false);
    const full=inspectGenerationEvidence({request:{prepared},operations:s.operations()});
    expect(full.checks.find(c=>c.code==='design_election_coverage_complete')?.passed).toBe(false);
  });
});
