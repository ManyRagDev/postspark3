import { describe, expect, it } from "vitest";
import { resolveArsenalGeometry } from "@shared/arsenalGeometry";
import { arsenalHash } from "@shared/arsenalContent";
import { compactComponentCard, createComponentDefinition } from "@shared/componentAssembly";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { completeDesignFields, instantiateCompleteDesign } from "@shared/completeDesignGeneration";
import { compactTextFieldFlexibility } from "@shared/textFieldFlexibility";
import { buildFamilySelectionCandidates, familyAssessmentProfile } from "@shared/designFamilySelection";
import { resolveDesignFamilyRepertoires } from "@shared/designRepertoire";
import { buildCompactEditorialContract, textFlexibilityEditorialInstruction } from "./compactEditorialContract";
import { compactCopyPrompt, compactCopySystemPromptFor, compactCopyValidationSchema, compactWritableSlides, enrichTargetedCopyRepairTargets, targetedCopyRepairPrompt, targetedCopyRepairSchema, type TargetedCopyRepairTarget } from "./compactProposalCopy";
import type { CopyResponse, ProposalExecutionInput } from "./proposalGraph";

const definition = completeDesignTestDefinitions()[0];
const input: ProposalExecutionInput = {requestId:"flex",proposalId:"flex",runId:"00000000-0000-4000-8000-000000000001",slot:0,prompt:"Divulgue café artesanal. Entrada gratuita aos sábados.",postMode:"static",reviewExecutionConfig:{version:5,automaticReviewVersion:4,textFlexibilityVersion:1} as ProposalExecutionInput["reviewExecutionConfig"]};
const oldInput = {...input, reviewExecutionConfig:{version:5,automaticReviewVersion:4} as ProposalExecutionInput["reviewExecutionConfig"]};
const copy: CopyResponse={caption:"Detalhes sem teto numérico",hashtags:[],slides:[{values:[{fieldId:"field-0",value:"Café artesanal"},{fieldId:"field-1",value:""}],mediaPrompts:[]}]};
const keys=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(keys):value&&typeof value==="object"?Object.entries(value).flatMap(([key,child])=>[key,...keys(child)]):[];

// These are transport tests: the solver's numeric interval has its own geometry tests.
describe("versioned compact text flexibility",()=>{
  it("projects the solver's ranges only for selected fields, without geometry or repeated optional flags",()=>{
    const fields=completeDesignFields(definition);
    const projected=JSON.parse(compactCopyPrompt(input,[definition]));
    expect(projected.slides).toHaveLength(1);
    projected.slides[0].fields.forEach((field:any,index:number)=>{
      const range=compactTextFieldFlexibility(definition,fields[index])!;
      expect(field.capacity).toMatchObject({chars:[range.characters.min,range.characters.max],lines:[range.lines.min,range.lines.max],scope:range.scope});
      expect(field.required).toBe(!range.optional);
      expect(field.capacity).not.toHaveProperty("optional");
      expect(field.capacity).not.toHaveProperty("estimatedCharacters");
    });
    expect(projected.slides[0].fields[1].capacity.chars[0]).toBe(0);
    for(const key of ["fontSize","minFontSize","maxFontSize","preferredFontSize","width","height","x","y","bindings","instances","assets","pieceHash","artboard"])
      expect(keys(projected)).not.toContain(key);
    expect(JSON.stringify(projected)).not.toContain(completeDesignTestDefinitions()[1].id);
  });

  it("keeps caption scope and advisory ranges in the same contract used by author, repair and review",()=>{
    const target:TargetedCopyRepairTarget={slideIndex:0,fieldId:"field-0",itemIndex:null,current:"Café artesanal",reason:["overflow:height:title"]};
    const contract=buildCompactEditorialContract(input);
    const authored=JSON.parse(compactCopyPrompt(input,[definition]));
    const repair=JSON.parse(targetedCopyRepairPrompt(input,[definition],[target],2));
    expect(authored.editorial).toEqual(contract);
    expect(repair.editorial).toEqual(contract);
    expect(contract.textFlexibility).toEqual({version:1,instruction:textFlexibilityEditorialInstruction});
    expect(contract.textFlexibility!.instruction).toContain("A legenda aprofunda");
    expect(repair.targets[0].capacity).toEqual(authored.slides[0].fields[0].capacity);
    expect(JSON.stringify(authored).split(textFlexibilityEditorialInstruction)).toHaveLength(2);
    expect(authored).not.toHaveProperty("captionCapacity");
  });

  it("retains historical single estimates and system text without the marker",()=>{
    const historical=JSON.parse(compactCopyPrompt(oldInput,[definition]));
    expect(historical.editorial).not.toHaveProperty("textFlexibility");
    expect(historical.slides[0].fields[0].capacity).toEqual({estimatedCharacters:48,advisory:true,distribution:"continuous"});
    expect(compactCopySystemPromptFor(oldInput)).toContain("Capacidades são estimativas consultivas; o servidor mede o encaixe real. Campos opcionais podem ficar vazios.");
    expect(compactCopySystemPromptFor(input)).not.toContain("Capacidades são estimativas consultivas;");
  });

  it("leaves native values and caption unconstrained by advisory ranges",()=>{
    const maximum=compactWritableSlides(input,[definition])[0].fields[0].capacity!;
    if(!("chars" in maximum))throw Error("expected ranges");
    const long="i ".repeat(maximum.chars![1]+1);
    const proposed={...copy,caption:"Condições materiais e explicação. ".repeat(200),slides:[{...copy.slides[0],values:[{fieldId:"field-0",value:long},{fieldId:"field-1",value:""}]}]};
    expect(compactCopyValidationSchema([definition]).safeParse(proposed).success).toBe(true);
    expect(targetedCopyRepairSchema([{slideIndex:0,fieldId:"field-0",itemIndex:null,current:"Café",reason:["overflow"],maxCharacters:1}],[definition],2).safeParse({patches:[{slideIndex:0,fieldId:"field-0",itemIndex:null,value:long}]}).success).toBe(true);
  });

  it("measures only the requested list item and uses per-item ranges",()=>{
    const list=createComponentDefinition({...definition,fragment:{...definition.fragment,bindings:definition.fragment.bindings.map((binding,index)=>index?{...binding,kind:"list",source:"block:list:0:items",cardinality:{min:1,max:3}}:binding)}});
    const current:CopyResponse={...copy,slides:[{values:[{fieldId:"field-0",value:"Café"},{fieldId:"field-1",value:["Um","Dois\nTrês\nQuatro"]}],mediaPrompts:[]}]};
    const measure=(element:any)=>({height:element.text.split("\n").length*20,lines:element.text.split("\n").map(()=>({width:100})),runs:[{fill:element.fill,fontSize:element.fontSize,fontStyle:element.fontStyle}]});
    const scene=resolveArsenalGeometry(instantiateCompleteDesign({definition:list,...current.slides[0],runId:input.runId,slot:0,slide:0,planHash:"a".repeat(64),experimental:true}),{measureText:measure});
    const target:TargetedCopyRepairTarget={slideIndex:0,fieldId:"field-1",itemIndex:0,current:"Um",reason:["overflow:height:support"]};
    const [enriched]=enrichTargetedCopyRepairTargets(input,[list],current,[target],[scene],measure,2);
    expect(enriched.fit?.measuredLines).toBe(1);
    const repair=JSON.parse(targetedCopyRepairPrompt(input,[list],[enriched],2));
    expect(repair.targets[0].capacity.scope).toBe("item");
    expect(repair.targets[0].fit.measuredLines).toBe(1);
    const [old]=enrichTargetedCopyRepairTargets(oldInput,[list],current,[target],[scene],measure,2);
    expect(old.fit).not.toHaveProperty("measuredLines");
  });

  it("does not mutate catalogue cards or the family assessment sent to JEV",()=>{
    const definitions=completeDesignTestDefinitions();
    const cards=definitions.map(compactComponentCard);
    const profile=()=>buildFamilySelectionCandidates(resolveDesignFamilyRepertoires(definitions.map(compactComponentCard),{slideCount:1,contentMode:"compose"}),null,true,true).map(candidate=>familyAssessmentProfile(candidate.profile));
    const before=JSON.stringify({definitions,cards,assessment:profile()});
    compactWritableSlides(input,[definitions[1]]);
    expect(JSON.stringify({definitions,cards:definitions.map(compactComponentCard),assessment:profile()})).toBe(before);
    expect(arsenalHash(cards)).toBe(arsenalHash(definitions.map(compactComponentCard)));
    for(const key of ["chars","lines","textFlexibility","flexibility","fontSize"])
      expect(keys(profile())).not.toContain(key);
  });
});
