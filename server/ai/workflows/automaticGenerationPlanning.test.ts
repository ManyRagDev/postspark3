import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { arsenalHash } from "@shared/arsenalContent";
import { compactGenerationIntentSchema, legacyAutomaticGenerationIntentSchema, structuralGenerationIntentSchema } from "@shared/compactGenerationIntent";
import { structuralIntentFixture } from "./generationIntent.fixture";
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
const structuredIntent = structuralIntentFixture(intent);

describe("automatic economic generation integration",()=>{
  it("extracts free intent, judges compact profiles, adapts locally and replays without another provider call",async()=>{
    const definitions=completeDesignTestDefinitions();
    const input=orchestratedGenerationInputSchema.parse({ownerId:owner,inputType:"text",content:"Café artesanal, sem foto, não invente preços",postMode:"static",platform:"instagram",generationModel:"auto",idempotencyKey:"auto-planning"});
    const generationConfig=resolveGenerationModelConfig(input);
    const journal=new Map<string,unknown>(), requests:any[]=[], jev:JevRequest[]=[];
    const generate=vi.fn(async(params:any)=>{requests.push(params);return {id:"known-intent",model:params.pinnedModel,choices:[{message:{role:"assistant",content:JSON.stringify(structuredIntent)},finish_reason:"stop"}]};});
    const hydrate=async(ids:string[])=>definitions.filter(d=>ids.includes(d.id));
    const deps:any={generationConfig,generate,hydrate,readEditorialCatalog:async()=>null,
      automaticSemantic:{engine:{metadata:{modelId:"unavailable"}}},
      operation:async(key:string,work:()=>Promise<unknown>)=>{if(!journal.has(key))journal.set(key,await work());return journal.get(key);},
      loadContext:async()=>input.content,preferences:async()=>defaultStudioPreferences,retrieve:async()=>definitions.map(compactComponentCard),
      shortlist:async(params:any)=>shortlistCompleteDesigns(params,async request=>{jev.push(request);return {model:request.model,answers:Object.fromEntries(Object.keys(request.questions).map(id=>[id,{type:"score" as const,score:3.25,confidence:.9}])),usage:{input_tokens:300,output_tokens:0,cost:0}};})};
    const prepared=await prepareOrchestratedGeneration(input,owner,true,Date.now()+600000,deps);
    expect(generate).toHaveBeenCalledOnce();
    expect(requests[0]).toMatchObject({pinnedModel:"deepseek/deepseek-v4.1-flash",forceTextSchema:false,taskModelConfig:{reasoningEnabled:false},maxTransportAttempts:1,maxCompletionTokens:3500});
    expect(JSON.stringify(requests[0].messages)).not.toMatch(/editorialVocabulary|fieldRelationships|geometry|componentDefinitions/);
    expect((journal.get("selection_input") as any).compactIntentVersion).toBe(2);
    expect(prepared.planning!.intent.requirements).toMatchObject([{ id: "required-photo-free", kind: "execution" }]);
    expect(prepared.planning!.intent.content[0].id).toBe("idea-1");
    expect(JSON.stringify(requests[0].messages)).toContain("não invente preços");
    expect(jev.length).toBeGreaterThan(0);
    for(const request of jev){expect(JSON.stringify(request)).not.toMatch(/"fields"|"slides"|"bindings"|"catalogHash"|"availability"/);expect(Object.keys(request.questions).length).toBeLessThanOrEqual(20);for(const q of Object.values(request.questions) as any[]){expect(q.instructions.design.version).toBe(6);expect(Object.keys(q.instructions.design.structure).sort()).toEqual(["listBlocks","listItemsPerBlock","mediaSlots","relationships","textBlocks"]);expect(q.criteria[4]).not.toContain("specific composition evidence");}}
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
  it("uses the lab assessment over native fields and replays the paid receipt for the same three editable plans", async () => {
    const definitions = completeDesignTestDefinitions();
    const input = orchestratedGenerationInputSchema.parse({
      ownerId: owner,
      inputType: "text",
      content: "Café artesanal",
      platform: "instagram",
      generationModel: "auto",
      selectionStrategy: "editorial_v1",
      idempotencyKey: "editorial-lab",
    });
    const generationConfig = resolveGenerationModelConfig(input, true, true, true);
    const journal = new Map<string, unknown>();
    const shortlist = vi.fn();
    const generate = vi.fn(async (params: import("../../_core/llm").InvokeParams) => {
      const isSelection = params.traceLabel === "generation_selection_v1";
      const payload = JSON.parse(params.messages[1].content as string);
      if (isSelection) {
        expect(payload.brief).toBe(input.content);
        expect(payload.candidates).toHaveLength(3);
      }
      const data = isSelection ? {
        candidates: payload.candidates.map(({ id, fields }: { id: number; fields: unknown[][] }) => ({
          id,
          fit: 3,
          reading: `leitura-${id}`,
          readerPriority: `Priorize a leitura ${id}.`,
          rationale: `A estrutura valoriza a leitura ${id}.`,
          cues: [{ fieldId: fields[0][0], instruction: `Oriente a abertura para a leitura ${id}.` }],
        })),
      } : structuredIntent;
      return { id: isSelection ? "lab-assessment" : "lab-intent", model: params.pinnedModel!, choices: [
        { message: { role: "assistant" as const, content: JSON.stringify(data) }, finish_reason: "stop" },
      ] };
    });
    const hydrate = async (ids: string[]) => definitions.filter(definition => ids.includes(definition.id));
    const deps = {
      generationConfig, generate, hydrate, shortlist,
      readEditorialCatalog: async () => null,
      operation: async <T>(key: string, work: () => Promise<T>): Promise<T> => {
        if (!journal.has(key)) journal.set(key, await work());
        return journal.get(key) as T;
      },
      loadContext: async () => input.content,
      preferences: async () => defaultStudioPreferences,
      retrieve: async () => definitions.map(compactComponentCard),
    };
    const run = () => prepareOrchestratedGeneration(input, owner, true, Date.now() + 600000, deps);
    const prepared = await run();
    expect(shortlist).not.toHaveBeenCalled();
    expect(prepared.planning?.editorialSelection).toEqual({ version: 1, source: "model", evaluated: 3 });
    expect(new Set(prepared.planning?.offers.map(offer => offer?.family)).size).toBe(3);
    for (const plan of prepared.planning!.slots) {
      if (plan.status !== "viable") throw new Error("Expected a viable lab plan");
      expect(plan.editorialDesign?.readerPriority).toContain("Priorize a leitura");
      expect(plan.pages[0].assignments.some(assignment => assignment.instruction.includes("Oriente a abertura"))).toBe(true);
    }
    await verifyPreparedEligibility(prepared, true, hydrate);
    expect((await run()).planning?.hash).toBe(prepared.planning?.hash);
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it.each([structuralGenerationIntentSchema, compactGenerationIntentSchema, legacyAutomaticGenerationIntentSchema])("reconciles the pinned intent model and the recorded schema version",(intentSchema)=>{
    const config=resolveGenerationModelConfig({postMode:"static"});
    const schema=z.toJSONSchema(intentSchema);delete schema.$schema;
    const format={type:"json_schema",json_schema:{name:"generation_intent_v1",strict:true,schema}};
    if(intentSchema === legacyAutomaticGenerationIntentSchema) expect(arsenalHash(format)).toBe("e2df52d7ee4bf3c4a71d7866b22538d4c07403624f43933bce9ba70e49fd482f");
    const messages=[{role:"user",content:"Café"}];
    const expected={kind:"generation_preparation_v1",configurationHash:config.configurationHash,model:config.taskRouting!.intent.model,messagesHash:arsenalHash(messages),responseFormatHash:arsenalHash(format),requestHash:"a".repeat(64)};
    const operation:any={operationKey:"prepare:intent",expectation:expected};
    const record:any={generationConfig:config};
    const recovered={id:"known-id",model:expected.model,messages,completion:JSON.stringify(intentSchema === structuralGenerationIntentSchema ? structuredIntent : intentSchema === compactGenerationIntentSchema ? intent : {version:1,objective:intent.objective,tone:{description:intent.tone,origin:"inferred",rationale:"Momento tranquilo"},adaptation:"controlled",requirements:[],content:[{id:"idea",meaning:"Desfrutar uma pausa",requirementIds:[],sourceIds:[]}],semanticQuery:intent.semanticQuery})};
    expect(validateRecoveredPreparation(record,operation,recovered).model).toBe(expected.model);
    expect(()=>validateRecoveredPreparation(record,operation,{...recovered,model:config.model})).toThrow(/identity mismatch/);
  });
});
