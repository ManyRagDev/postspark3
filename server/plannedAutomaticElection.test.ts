/** Audit reconstruction of an actual preparation with simulated provider
 * answers. It validates provenance/replay, not real provider suitability. */
import { describe, expect, it } from "vitest";
import { compactComponentCard } from "../shared/componentAssembly";
import { orchestratedGenerationInputSchema } from "../shared/generationRequest";
import { sealGenerationPlanningReceipt } from "../shared/generationPlan";
import { defaultStudioPreferences } from "../shared/studioPreferences";
import { resolveGenerationModelConfig } from "./ai/generationModel";
import { prepareOrchestratedGeneration } from "./ai/workflows/generationPreparation";
import { shortlistCompleteDesigns } from "./designCatalog/designShortlist";
import { electionCatalogFixture } from "./designCatalog/designElection.fixture";
import { reconcileCatalogCoverage } from "./designCatalog/catalogCoverage";
import { withCatalogRevision } from "./designCatalog/versionedCatalog";
import { inspectPlannedDesignElection } from "./plannedDesignElectionEvidence";

async function fixture(score = 0, legacy = false) {
  const {definitions,inventory}=electionCatalogFixture(25);
  const owner="00000000-0000-4000-8000-000000000001";
  const input=orchestratedGenerationInputSchema.parse({ownerId:owner,inputType:"text",content:"Uma pausa tranquila para café",postMode:"static",platform:"instagram",aspectRatio:"4:5",generationModel:"auto",idempotencyKey:"automatic-audit"});
  const generationConfig=resolveGenerationModelConfig(input);
  const operations:any[]=[],expectations=new Map<string,unknown>();
  const legacyIntent={version:1,objective:"Uma pausa tranquila",tone:{description:"Acolhedor",origin:"inferred",rationale:"Convite sereno"},adaptation:"controlled",requirements:[],
    content:[{id:"idea",meaning:"Aproveitar uma pausa para café",sourceIds:[],requirementIds:[]}],semanticQuery:"Acolhedor, pausa para café, convite editorial livre"};
  const intent = legacy ? legacyIntent : {objective:legacyIntent.objective,tone:legacyIntent.tone.description,semanticQuery:legacyIntent.semanticQuery,ideas:legacyIntent.content.map(({meaning,sourceIds})=>({meaning,sourceIds}))};
  const prepared=await withCatalogRevision("7",()=>prepareOrchestratedGeneration(input,owner,false,Date.now()+600000,{
    generationConfig,loadContext:async()=>input.content,preferences:async()=>defaultStudioPreferences,readEditorialCatalog:async()=>null,
    retrieve:async args=>reconcileCatalogCoverage(args,inventory),hydrate:async ids=>definitions.filter(d=>ids.includes(d.id)),
    automaticSemantic:{engine:{metadata:{modelId:"unavailable",fingerprint:"a".repeat(64)}} as any},
    expectPreparation:async(key,expected)=>{expectations.set(key,expected);},
    generate:async params=>({id:"controlled-intent",model:params.pinnedModel,choices:[{message:{role:"assistant",content:JSON.stringify(intent)},finish_reason:"stop"}]} as any),
    operation:async(key,work)=>{
      const result=await work();
      if(legacy && key === "selection_input") delete (result as any).compactIntentVersion;
      operations.push({operation_key:`prepare:${key}`,state:"completed",expectation:expectations.get(key),result:key==="selection"?{...result as object,__generationTrace:{version:1,calls:[],events:[{stage:"generation_plan",status:"completed",detail:"deterministic_local",data:{paidEffect:false}}]}}:structuredClone(result)});
      return result;
    },
    shortlist:async args=>shortlistCompleteDesigns(args,async request=>({model:request.model,answers:Object.fromEntries(Object.keys(request.questions).map(id=>[id,{type:"score" as const,score,confidence:.99}])),usage:{input_tokens:100,output_tokens:0,cost:0}})),
  }));
  return {request:{generation_config:generationConfig,catalog_revision:"7",experimental:false,input,prepared,proposals:[]},operations};
}
describe("automatic planning audit",()=>{
  it("reconstructs compact intent, continuous zero-score judgments, bounded retrieval and technical proof after JSON reopening",async()=>{
    const original=await fixture();
    const {request,operations}=JSON.parse(JSON.stringify(original));
    const result=inspectPlannedDesignElection(request,operations);
    expect(result.issues).toEqual([]);expect(result.complete).toBe(true);
    expect(result.method).toBe("semantic_retrieval_then_scored_families");
    expect(result.evaluatedFamilies).toBe(20);expect(result.selectorOptions).toBe(20);
    expect(request.prepared.planning.slots.every((slot:any)=>slot.status==="viable")).toBe(true);
  });
  it("reconstructs the original paid automatic schema when its receipt has no compact version", async () => {
    const {request,operations}=await fixture(3,false);
    expect(operations.find(o=>o.operation_key==="prepare:selection_input").result.compactIntentVersion).toBe(1);
    const old = await fixture(3,true);
    expect(old.operations.find(o=>o.operation_key==="prepare:selection_input").result.compactIntentVersion).toBeUndefined();
    expect(inspectPlannedDesignElection(old.request,old.operations).issues).toEqual([]);
  });
  it("preserves fractional provider scores while auditing the rounded 0–100 projection", async () => {
    const {request,operations}=await fixture(3.123456);
    expect(request.prepared.planning!.familyElection!.ranking[0]).toMatchObject({score:3.123456,score100:78.09});
    expect(inspectPlannedDesignElection(request,operations).issues).toEqual([]);
  });
  it.each(["score100","query","index","technical","revision","flexibility","intentVersion"])("rejects a resealed automatic receipt with altered %s",async fault=>{
    const {request,operations}=await fixture();const planning=request.prepared.planning!;
    if(fault==="intentVersion")delete operations.find(o=>o.operation_key==="prepare:selection_input").result.compactIntentVersion;
    if(fault==="score100")planning.familyElection!.ranking[0].score100=90;
    if(fault==="query")planning.familyElection!.retrieval!.query="Other interpretation";
    if(fault==="index")planning.familyElection!.retrieval!.indexHash="f".repeat(64);
    if(fault==="technical")planning.familyElection!.retrieval!.semanticRetrieval!.technicalFit!.viableSlots=[];
    if(fault==="revision")(request as any).catalog_revision="8";
    if(fault==="flexibility")delete operations.find(o=>o.operation_key==="prepare:selection_input").result.familyNeutrality.creativeFlexibility;
    const {hash:_,...basis}=planning;request.prepared.planning=sealGenerationPlanningReceipt(basis);
    expect(inspectPlannedDesignElection(request,operations).issues.length).toBeGreaterThan(0);
  });
});
