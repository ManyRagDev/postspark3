import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createComponentDefinition } from "@shared/componentAssembly";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { instantiateCompleteDesign } from "@shared/completeDesignGeneration";
import { arsenalHash } from "@shared/arsenalContent";
import type { CopyResponse, ProposalExecutionInput } from "./proposalGraph";
import { applyTargetedCopyRepair, enrichTargetedCopyRepairTargets, targetedCopyRepairPrompt, targetedCopyRepairSchema, targetedRepairAlternatives, targetedRepairSystemPrompt, targetedRepairSystemPromptV2, type TargetedCopyRepairTarget } from "./compactProposalCopy";

const originalDefinition = completeDesignTestDefinitions()[0];
const definition = createComponentDefinition({ ...originalDefinition, fragment: { ...originalDefinition.fragment,
  bindings: originalDefinition.fragment.bindings.map((binding, index) => ({ ...binding, source: index ? "block:headline:0:text" : "block:label:0:text", required: index === 1 })),
} });
const request = "Crie um post estático para a cafeteria Lume, que serve café artesanal e abre de segunda a sexta, das 8h às 18h. Convide a conhecer o espaço. Use apenas tipografia e formas, sem fotografias nem geração de imagens. Não invente preços ou promoções.";
const input = {
  requestId: "compact-v2", runId: "00000000-0000-4000-8000-000000000001", proposalId: "repair-v2", slot: 0,
  prompt: request, postMode: "static", sourceReferences: [{ kind: "request", purpose: "content", facts: request }],
  generationIntent: { version: 1, objective: "Convide a conhecer a cafeteria Lume", adaptation: "controlled", tone: { description: "Claro", origin: "inferred", rationale: "Convite" }, requirements: [], content: [] },
} satisfies ProposalExecutionInput;
const original: CopyResponse = { caption: "Venha conhecer a Lume. Legenda saudável exclusiva.", hashtags: ["#Lume"], slides: [{ values: [{fieldId:"field-0",value:"LUME"},{fieldId:"field-1",value:"Venha conhecer a Lume"}],mediaPrompts:[] }] };
const targets: TargetedCopyRepairTarget[] = [
  {slideIndex:0,fieldId:"field-0",itemIndex:null,current:"LUME",reason:["overflow:token:indice"],maxCharacters:2},
  {slideIndex:0,fieldId:"field-1",itemIndex:null,current:"Venha conhecer a Lume",reason:["overflow:token:titulo-enfase"],maxCharacters:10},
];
const measure = (value: any) => ({ height:20,lines:[{width:100}],runs:[{fill:value.fill,fontSize:value.fontSize,fontStyle:value.fontStyle}] });
const compose = (copy = original, def = definition) => [instantiateCompleteDesign({ definition:def, ...copy.slides[0],runId:input.runId,slot:0,slide:0,planHash:"a".repeat(64),experimental:true })];

// Captured responses: gen-1793975881-odAPh573iuRb2DTMIARR and gen-1793975954-UJwSEiifclTueCFU4SlE.
describe("compact targeted repair v2", () => {
  it("keeps estimated lengths advisory while retaining the native field and list contract", () => {
    const patch = {patches:[{slideIndex:0,fieldId:"field-1",itemIndex:null,value:"Conheça a Lume",alternatives:["Visite a Lume"]}]};
    expect(targetedCopyRepairSchema([targets[1]],[definition],1).safeParse(patch).success).toBe(false);
    expect(targetedCopyRepairSchema([targets[1]],[definition],2).safeParse(patch).success).toBe(true);
    const schema = z.toJSONSchema(targetedCopyRepairSchema(targets,[definition],2));
    expect(JSON.stringify(schema)).not.toContain('"maxLength"');
    expect(targetedCopyRepairSchema([targets[1]],[definition],2).safeParse({patches:[{...patch.patches[0],fieldId:"other"}]}).success).toBe(false);
    expect(targetedCopyRepairSchema([targets[1]],[definition],2).safeParse({patches:[{...patch.patches[0],value:""}]}).success).toBe(false);
    expect(targetedCopyRepairSchema([targets[1]],[definition],2).safeParse({patches:[{...patch.patches[0],alternatives:["a","b","c"]}]}).success).toBe(false);
    expect(targetedCopyRepairSchema([{...targets[1],current:"Comece com alguns minutos",maxCharacters:14}],[definition],2).safeParse({patches:[{...patch.patches[0],value:"Comece aos poucos"}]}).success).toBe(true);
  });

  it("excludes all mutable peers from coverage and keeps the exact named source once", () => {
    const before = arsenalHash({original,targets,definition,input});
    const enriched = enrichTargetedCopyRepairTargets(input,[definition],original,targets,compose(),measure,2);
    expect(enriched.every(target=>target.maxCharacters===undefined)).toBe(true);
    expect(enriched.map(target=>target.coverage?.otherFieldIds)).toEqual([[],[]]);
    expect(enriched.every(target=>target.coverage?.caption)).toBe(true);
    const prompt = targetedCopyRepairPrompt(input,[definition],enriched,2), payload = JSON.parse(prompt);
    expect(payload.context.objective).toContain("cafeteria Lume");
    expect(payload.context.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({text:request.split(". ")[0]+"."}),
      expect.objectContaining({text:"Convide a conhecer o espaço."}),
    ]));
    expect(payload.context.facts.filter((fact:any)=>fact.text.includes("cafeteria Lume"))).toHaveLength(1);
    expect(payload.targets[0].factIds.length).toBeGreaterThan(0);
    expect(payload.targets[1].factIds.length).toBeGreaterThan(0);
    expect(prompt).not.toContain('"maxCharacters"');
    expect(prompt).not.toContain(original.caption);
    for(const forbidden of ["pieceHash","bindings","assetIds","instances","fontSize","description"])expect(prompt).not.toContain(`"${forbidden}"`);
    expect(arsenalHash({original,targets,definition,input})).toBe(before);
  });

  it("does not claim coverage from a mutable caption or list item, but keeps untouched list items", () => {
    const listDefinition=createComponentDefinition({...definition,fragment:{...definition.fragment,bindings:definition.fragment.bindings.map((binding,index)=>index?{...binding,source:"block:list:0:items",kind:"list",cardinality:{min:1,max:3}}:binding)}});
    const copy:CopyResponse={...original,slides:[{values:[{fieldId:"field-0",value:"LUME"},{fieldId:"field-1",value:["Lume","Lume","Hoje"]}],mediaPrompts:[]}]};
    const mutable:TargetedCopyRepairTarget[]=[targets[0],{...targets[1],current:"Lume",itemIndex:0},{slideIndex:0,fieldId:"$caption",itemIndex:null,current:copy.caption,reason:["editorial"]}];
    const result=enrichTargetedCopyRepairTargets(input,[listDefinition],copy,mutable,compose(copy,listDefinition),measure,2);
    expect(result[0].coverage).toMatchObject({otherFieldIds:["0:field-1[1]"],caption:false});
    expect(result[1].coverage).toMatchObject({otherFieldIds:["0:field-1[1]"],caption:false});
    mutable[1]={...mutable[1],itemIndex:null,current:["Lume","Lume","Hoje"]};
    const whole=enrichTargetedCopyRepairTargets(input,[listDefinition],copy,mutable,compose(copy,listDefinition),measure,2);
    expect(whole[0].coverage).toMatchObject({otherFieldIds:[],caption:false});
    const schema=targetedCopyRepairSchema([mutable[1]],[listDefinition],2);
    expect(schema.safeParse({patches:[{slideIndex:0,fieldId:"field-1",itemIndex:null,value:["um","dois","três","quatro"]}]}).success).toBe(false);
  });

  it("uses a soft ending preference to choose the captured complete alternative without changing it", () => {
    const captured={patches:[{slideIndex:0,fieldId:"field-0",itemIndex:null,value:"",alternatives:[]},{slideIndex:0,fieldId:"field-1",itemIndex:null,value:"Conheça a",alternatives:["Venha à","Conheça"]}]};
    const fits=vi.fn((copy:CopyResponse,target:TargetedCopyRepairTarget)=>copy.slides[0].values.find(row=>row.fieldId===target.fieldId)!.value!=="Conheça a");
    const repaired=applyTargetedCopyRepair(original,targets,captured,[definition],fits,2);
    expect(repaired.slides[0].values[1].value).toBe("Conheça");
    expect(repaired.caption).toBe(original.caption);
    expect(repaired.hashtags).toEqual(original.hashtags);
    expect(repaired.slides[0].mediaPrompts).toEqual(original.slides[0].mediaPrompts);
    expect(fits.mock.calls.filter(([,target])=>target.fieldId==="field-1")).toHaveLength(1);
    const historical=applyTargetedCopyRepair(original,targets,captured,[definition],fits,1);
    expect(historical.slides[0].values[1].value).toBe("Venha à");
    expect(original.slides[0].values[1].value).toBe("Venha conhecer a Lume");
  });

  it("deduplicates repeated alternatives before measurement without fabricating a replacement", () => {
    const target={...targets[1],current:"Comece com alguns minutos",maxCharacters:14};
    const fits=vi.fn(()=>false);
    const result=applyTargetedCopyRepair(original,[target],{patches:[{slideIndex:0,fieldId:"field-1",itemIndex:null,value:"Comece aos pou",alternatives:["Comece aos pou"," Comece  aos pou "]}]},[definition],fits,2);
    expect(fits).toHaveBeenCalledTimes(1);
    expect(result.slides[0].values[1].value).toBe("Comece aos pou"); // Final semantic review remains necessary.
    expect(targetedRepairSystemPromptV2).toContain("alternativas realmente distintas");
    expect(targetedRepairSystemPromptV2).toContain("nunca limites de caracteres");
    expect(targetedRepairSystemPrompt).toContain("maxCharacters");
  });

  it("preserves model order when an authored sequence has a frozen continuation", () => {
    const sequenced=createComponentDefinition({...definition,completeDesign:{...definition.completeDesign!,designGuidance:{version:1,summary:"Sequência",motifs:[],preserve:[],contentRules:[],mediaRules:[],knownLimitations:[],fieldRelationships:[{kind:"sequence",sources:["block:headline:0:text","block:label:0:text"],label:"Convite e destino"}]}}});
    const result=enrichTargetedCopyRepairTargets(input,[sequenced],original,[targets[1]],compose(original,sequenced),measure,2);
    expect(result[0].frozenContinuation).toBe(true);
    expect(targetedRepairAlternatives(result[0],["Venha à","Conheça"],2)).toEqual(["Venha à","Conheça"]);
    expect(targetedRepairAlternatives({...result[0],frozenContinuation:false},["Venha à","Conheça"],2)).toEqual(["Conheça","Venha à"]);
  });

  it("does not convert the soft ending preference into a grammar veto", () => {
    const target={...targets[1],current:"Uma pergunta"};
    expect(targetedRepairAlternatives(target,["Venha à"],2)).toEqual(["Venha à"]);
    expect(targetedRepairAlternatives(target,["Plano A","Conheça"],2)).toEqual(["Plano A","Conheça"]);
  });
});

describe("targeted repair pending context", () => {
  it("passes only later provider patches, keeping list item coordinates and V1 callback arity", () => {
    const allowed: TargetedCopyRepairTarget[] = [
      { ...targets[1], current: "primeiro", itemIndex: 0 },
      { ...targets[1], current: "segundo", itemIndex: 1 },
    ];
    const source: CopyResponse = { ...original, slides: [{ values: [{ fieldId: "field-1", value: ["primeiro", "segundo"] }], mediaPrompts: [] }] };
    const response = { patches: [
      { slideIndex: 0, fieldId: "field-1", itemIndex: 1, value: "novo segundo" },
      { slideIndex: 0, fieldId: "field-1", itemIndex: 0, value: "novo primeiro" },
    ] };
    const fits = vi.fn(() => true);
    applyTargetedCopyRepair(source, allowed, response, undefined, fits, 2);
    expect(fits.mock.calls.map(call => (call as unknown[])[2])).toEqual([{ pendingTargets: [allowed[0]] }, { pendingTargets: [] }]);
    fits.mockClear();
    applyTargetedCopyRepair(source, allowed.map(({ maxCharacters, ...target }) => target), response, undefined, fits, 1);
    expect(fits.mock.calls.every(call => call.length === 2)).toBe(true);
  });
});
