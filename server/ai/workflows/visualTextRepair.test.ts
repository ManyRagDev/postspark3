import {describe,expect,it,vi} from "vitest";
import {arsenalHash} from "@shared/arsenalContent";
import {createComponentDefinition} from "@shared/componentAssembly";
import {completeDesignTestDefinitions} from "@shared/completeDesignGeneration.fixture";
import {applyTargetedCopyRepair,targetedCopyRepairPrompt,targetedCopyRepairSchema,targetedRepairSystemPromptFor,visualTextRepairPrompt,visualTextRepairSystemPrompt,type TargetedCopyRepairTarget} from "./compactProposalCopy";
import type {CopyResponse,ProposalExecutionInput} from "./proposalGraph";

const original=completeDesignTestDefinitions()[0];
const definition=createComponentDefinition({...original,fragment:{...original.fragment,instances:[...original.fragment.instances,{...original.fragment.instances[1],id:"cta",y:900}],bindings:[...original.fragment.bindings,{...original.fragment.bindings[1],id:"cta",source:"block:callToAction:0:text",targetIds:["cta"]}]}});
const input:ProposalExecutionInput={requestId:"visual-repair",proposalId:"visual-repair",runId:"00000000-0000-4000-8000-000000000001",slot:0,prompt:"Crie um post para a padaria Miolo com humor leve sobre reunião, café e pão de queijo.",reviewExecutionConfig:{version:5,automaticReviewVersion:4,textFlexibilityVersion:1,visualTextRepairVersion:1} as ProposalExecutionInput["reviewExecutionConfig"]};
const copy:CopyResponse={caption:"Na Miolo, reúna a equipe para um café. Condição material no fim: promoção somente aos sábados.",hashtags:["#Miolo"],slides:[{values:[{fieldId:"field-0",value:"Tem reunião que poderia ser um café com pão de queijo"},{fieldId:"field-1",value:"Troque a sala fechada por uma mesa de padaria: mais aroma, mais assunto e reuniões que ninguém quer encerrar."},{fieldId:"field-2",value:"Marque seu café na Miolo"}],mediaPrompts:[]},{values:[{fieldId:"field-0",value:"Outro slide saudável não pertinente"},{fieldId:"field-1",value:"Nunca reenviar este texto"}],mediaPrompts:[]}]};
const targets:TargetedCopyRepairTarget[]=[0,1].map(index=>({slideIndex:0,fieldId:`field-${index}`,itemIndex:null,current:copy.slides[0].values[index].value,reason:["overflow: Defeito técnico medido"],fit:{widthRatio:.86,heightRatio:1.5,measuredLines:3},coverage:{advisory:true,otherFieldIds:[],caption:true,terms:[]}}));
const definitions=[definition,original];
const patch=(value:string,alternatives:string[]=[])=>({patches:[{slideIndex:0,fieldId:"field-1",itemIndex:null,value,alternatives}]});

describe("versioned visual text repair",()=>{
 it("preserves historical prompts byte for byte when the marker is absent",()=>{
  const historical={...input,reviewExecutionConfig:{...input.reviewExecutionConfig!}};delete (historical.reviewExecutionConfig as any).visualTextRepairVersion;
  expect(visualTextRepairSystemPrompt(historical)).toBe(targetedRepairSystemPromptFor(historical,2));
  expect(visualTextRepairPrompt(historical,definitions,targets,copy)).toBe(targetedCopyRepairPrompt(historical,definitions,targets,2));
 });
 it("asks for principal, concise and minimal alternatives using actual fit as advisory guidance",()=>{
  const prompt=JSON.parse(visualTextRepairPrompt(input,definitions,targets,copy));
  const body=prompt.targets[1];
  expect(body.fit).toMatchObject({characters:109,measuredLines:3,heightRatio:1.5});
  expect(body.suggestedLengths).toEqual({value:72,alternatives:[50,32],scope:"field",advisory:true});
  expect(prompt.visualContext).toEqual({stage:"text_fit_draft",media:"pending_if_unfilled"});
  const system=visualTextRepairSystemPrompt(input);
  for(const word of ["alternatives[0]","alternatives[1]","mesmo design","condições materiais","anterio","consultivas"])expect(system).toContain(word);
  expect(system).toContain("Identidade já preservada em campo congelado dispensa repetição");
 });
 it("includes the exact healthy CTA entity and complete relevant caption once, never mutable or other-page copy",()=>{
  const before=arsenalHash({input,definitions,targets,copy});
  const wire=visualTextRepairPrompt(input,definitions,targets,copy),prompt=JSON.parse(wire);
  expect(prompt.frozenFields).toEqual([{slideIndex:0,fieldId:"field-2",role:"callToAction",text:"Marque seu café na Miolo"}]);
  expect(prompt.frozenCaption).toEqual({scope:"caption",text:copy.caption});
  expect(wire.split("Marque seu café na Miolo")).toHaveLength(2);
  expect(wire).not.toContain("Outro slide saudável");expect(wire).not.toContain("Nunca reenviar");
  for(const key of ["instances","bindings","fontSize","pieceHash","assets","artboard","maxCharacters","maxLength"])expect(wire).not.toContain(`"${key}"`);
  expect(arsenalHash({input,definitions,targets,copy})).toBe(before);
 });
 it("omits a caption that is unreferenced or mutable",()=>{
  expect(JSON.parse(visualTextRepairPrompt(input,definitions,targets.map(t=>({...t,coverage:undefined})),copy))).not.toHaveProperty("frozenCaption");
  const captionTarget:TargetedCopyRepairTarget={slideIndex:0,fieldId:"$caption",itemIndex:null,current:copy.caption,reason:["editorial"]};
  expect(JSON.parse(visualTextRepairPrompt(input,definitions,[...targets,captionTarget],copy))).not.toHaveProperty("frozenCaption");
 });
 it("keeps list item coordinates and excludes both individual and whole-list mutable targets",()=>{
  const list=createComponentDefinition({...definition,fragment:{...definition.fragment,bindings:definition.fragment.bindings.map((binding,index)=>index===1?{...binding,kind:"list",source:"block:list:0:items",cardinality:{min:1,max:3}}:binding)}});
  const listCopy:CopyResponse={...copy,slides:[{...copy.slides[0],values:[copy.slides[0].values[0],{fieldId:"field-1",value:["Mutável","Miolo já preservada aqui","Condição saudável"]},copy.slides[0].values[2]]}]};
  const item={...targets[1],current:"Mutável",itemIndex:0};
  const parsed=JSON.parse(visualTextRepairPrompt(input,[list],[targets[0],item],listCopy));
  expect(parsed.frozenFields).toContainEqual({slideIndex:0,fieldId:"field-1",itemIndex:1,role:"label",text:"Miolo já preservada aqui"});
  expect(parsed.frozenFields.some((field:any)=>field.text==="Mutável")).toBe(false);
  expect(parsed.targets[1].suggestedLengths.scope).toBe("item");
  const all=JSON.parse(visualTextRepairPrompt(input,[list],[targets[0],{...item,itemIndex:null,current:listCopy.slides[0].values[1].value}],listCopy));
  expect(all.frozenFields.some((field:any)=>field.fieldId==="field-1")).toBe(false);
 });
 it("does not turn progressive suggestions into schema maxLength or manufacture a semantic verdict",()=>{
  const long="Texto ainda longo, sem uma promessa de que cabe ".repeat(8);
  expect(targetedCopyRepairSchema([targets[1]],definitions,2).safeParse(patch(long,["Sintética","Mínima"])).success).toBe(true);
 });
});

describe("concise unfitted candidate retention",()=>{
 it("keeps historical primary fallback by default, choosing shortest supplied candidate only under the new flag",()=>{
  const response=patch("Texto principal longo",["Texto sintético","Breve"]),before=arsenalHash({copy,targets,response});
  const fits=vi.fn(()=>false);
  const historical=applyTargetedCopyRepair(copy,[targets[1]],response,definitions,fits,2);
  const concise=applyTargetedCopyRepair(copy,[targets[1]],response,definitions,fits,2,undefined,undefined,true);
  expect(historical.slides[0].values[1].value).toBe("Texto principal longo");expect(concise.slides[0].values[1].value).toBe("Breve");
  expect(concise.caption).toBe(copy.caption);expect(concise.hashtags).toEqual(copy.hashtags);
  expect(concise.slides[0].values.filter(v=>v.fieldId!=="field-1")).toEqual(copy.slides[0].values.filter(v=>v.fieldId!=="field-1"));expect(concise.slides[1]).toEqual(copy.slides[1]);
  expect(arsenalHash({copy,targets,response})).toBe(before);
 });
 it("always uses the first fitting candidate even when a shorter option exists",()=>{
  const fits=vi.fn((candidate:CopyResponse)=>candidate.slides[0].values[1].value==="Médio cabe");
  const result=applyTargetedCopyRepair(copy,[targets[1]],patch("Muito longo",["Médio cabe","Curto"]),definitions,fits,2,undefined,undefined,true);
  expect(result.slides[0].values[1].value).toBe("Médio cabe");expect(fits).toHaveBeenCalledTimes(2);
 });
 it("uses total item length with stable provider-order ties and never truncates an item",()=>{
  const current:CopyResponse={...copy,slides:[{...copy.slides[0],values:[{fieldId:"field-1",value:["Fato A","Fato B"]}]}]};
  const target={...targets[1],current:["Fato A","Fato B"]};
  const response={patches:[{slideIndex:0,fieldId:"field-1",itemIndex:null,value:["Um fato longo","Outro fato longo"],alternatives:[["A","BB"],["CC","D"]]}]};
  const result=applyTargetedCopyRepair(current,[target],response,undefined,()=>false,2,undefined,undefined,true);
  expect(result.slides[0].values[0].value).toEqual(["A","BB"]);
 });
});
