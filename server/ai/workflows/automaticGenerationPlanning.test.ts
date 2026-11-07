import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { arsenalHash } from "@shared/arsenalContent";
import { compactGenerationIntentSchema, legacyAutomaticGenerationIntentSchema } from "@shared/compactGenerationIntent";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { compactComponentCard } from "@shared/componentAssembly";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { defaultStudioPreferences } from "@shared/studioPreferences";
import { resolveGenerationModelConfig } from "../generationModel";
import { prepareOrchestratedGeneration, verifyPreparedEligibility } from "./generationPreparation";
import { validateRecoveredPreparation } from "./generationReconciliation";
import { shortlistCompleteDesigns, type JevRequest } from "../../designCatalog/designShortlist";

const owner="00000000-0000-4000-8000-000000000001";
const intent={objective:"Uma pausa para café",tone:"Acolhedor",ideas:[{meaning:"Desfrutar uma pausa",sourceIds:[]}],semanticQuery:"Café artesanal, pausa tranquila, composição tipográfica livre"};

describe("automatic economic generation integration",()=>{
  it("extracts free intent, judges compact profiles, adapts locally and replays without another provider call",async()=>{
    const definitions=completeDesignTestDefinitions();
    const input=orchestratedGenerationInputSchema.parse({ownerId:owner,inputType:"text",content:"Café artesanal, sem foto, não invente preços",postMode:"static",platform:"instagram",generationModel:"auto",idempotencyKey:"auto-planning"});
    const generationConfig=resolveGenerationModelConfig(input);
    const journal=new Map<string,unknown>(), requests:any[]=[], jev:JevRequest[]=[];
    const generate=vi.fn(async(params:any)=>{requests.push(params);return {id:"known-intent",model:params.pinnedModel,choices:[{message:{role:"assistant",content:JSON.stringify(intent)},finish_reason:"stop"}]};});
    const hydrate=async(ids:string[])=>definitions.filter(d=>ids.includes(d.id));
    const deps:any={generationConfig,generate,hydrate,readEditorialCatalog:async()=>null,
      automaticSemantic:{engine:{metadata:{modelId:"unavailable"}}},
      operation:async(key:string,work:()=>Promise<unknown>)=>{if(!journal.has(key))journal.set(key,await work());return journal.get(key);},
      loadContext:async()=>input.content,preferences:async()=>defaultStudioPreferences,retrieve:async()=>definitions.map(compactComponentCard),
      shortlist:async(params:any)=>shortlistCompleteDesigns(params,async request=>{jev.push(request);return {model:request.model,answers:Object.fromEntries(Object.keys(request.questions).map(id=>[id,{type:"score" as const,score:3.25,confidence:.9}])),usage:{input_tokens:300,output_tokens:0,cost:0}};})};
    const prepared=await prepareOrchestratedGeneration(input,owner,true,Date.now()+600000,deps);
    expect(generate).toHaveBeenCalledOnce();
    expect(requests[0]).toMatchObject({pinnedModel:"deepseek/deepseek-v4.1-flash",forceTextSchema:false,taskModelConfig:{reasoningEnabled:false},maxTransportAttempts:1,maxCompletionTokens:1500});
    expect(JSON.stringify(requests[0].messages)).not.toMatch(/editorialVocabulary|fieldRelationships|geometry|componentDefinitions/);
    expect((journal.get("selection_input") as any).compactIntentVersion).toBe(1);
    expect(prepared.planning!.intent.requirements).toEqual([]);
    expect(prepared.planning!.intent.content[0].id).toBe("idea-1");
    expect(JSON.stringify(requests[0].messages)).toContain("não invente preços");
    expect(jev.length).toBeGreaterThan(0);
    for(const request of jev){expect(JSON.stringify(request)).not.toMatch(/"fields"|"slides"|"bindings"|"structure"|"catalogHash"/);expect(Object.keys(request.questions).length).toBeLessThanOrEqual(20);}
    expect(prepared.planning?.familyElection?.retrieval?.semanticRetrieval?.status).toBe("fallback");
    expect(prepared.planning?.familyElection?.ranking.every(r=>r.score100===81.25)).toBe(true);
    expect(prepared.selectedDefinitions.some(d=>d.length>0)).toBe(true);
    expect(prepared.planning?.visualRequirements).toBeUndefined();
    expect(prepared.imageObligation.required).toBe(false);
    await verifyPreparedEligibility(prepared,true,hydrate);
    const replay=await prepareOrchestratedGeneration(input,owner,true,Date.now()+600000,deps);
    expect(replay.planning?.hash).toBe(prepared.planning?.hash);
    expect(generate).toHaveBeenCalledOnce();
  });
  it.each([compactGenerationIntentSchema, legacyAutomaticGenerationIntentSchema])("reconciles the pinned intent model and both paid schema versions",(intentSchema)=>{
    const config=resolveGenerationModelConfig({postMode:"static"});
    const schema=z.toJSONSchema(intentSchema);delete schema.$schema;
    const format={type:"json_schema",json_schema:{name:"generation_intent_v1",strict:true,schema}};
    if(intentSchema === legacyAutomaticGenerationIntentSchema) expect(arsenalHash(format)).toBe("e2df52d7ee4bf3c4a71d7866b22538d4c07403624f43933bce9ba70e49fd482f");
    const messages=[{role:"user",content:"Café"}];
    const expected={kind:"generation_preparation_v1",configurationHash:config.configurationHash,model:config.taskRouting!.intent.model,messagesHash:arsenalHash(messages),responseFormatHash:arsenalHash(format),requestHash:"a".repeat(64)};
    const operation:any={operationKey:"prepare:intent",expectation:expected};
    const record:any={generationConfig:config};
    const recovered={id:"known-id",model:expected.model,messages,completion:JSON.stringify(intentSchema === compactGenerationIntentSchema ? intent : {version:1,objective:intent.objective,tone:{description:intent.tone,origin:"inferred",rationale:"Momento tranquilo"},adaptation:"controlled",requirements:[],content:[{id:"idea",meaning:"Desfrutar uma pausa",requirementIds:[],sourceIds:[]}],semanticQuery:intent.semanticQuery})};
    expect(validateRecoveredPreparation(record,operation,recovered).model).toBe(expected.model);
    expect(()=>validateRecoveredPreparation(record,operation,{...recovered,model:config.model})).toThrow(/identity mismatch/);
  });
});
