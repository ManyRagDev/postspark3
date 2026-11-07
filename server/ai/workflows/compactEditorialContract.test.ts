import { describe, expect, it } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { arsenalHash } from "@shared/arsenalContent";
import { buildCompactEditorialContract, compactEditorialEvidenceKind, positiveEditorialInstructions } from "./compactEditorialContract";
import { compactCopyPrompt, compactCopySystemPrompt, compactCopySystemPromptFor, targetedCopyRepairPrompt, targetedRepairSystemPromptFor, targetedRepairSystemPromptV2 } from "./compactProposalCopy";
import { editorialContextV9 } from "./editorialContextV9";
import { buildSourceEvidenceV10 } from "./reviewEvidenceV10";
import type { ProposalExecutionInput } from "./proposalGraph";

const request = "Crie um convite para a cafeteria Lume, com café artesanal. Gratuidade de entrega apenas aos sábados.";
const input: ProposalExecutionInput = {requestId:"positive",proposalId:"positive",runId:"00000000-0000-4000-8000-000000000001",slot:0,prompt:request,
  sourceReferences:[{id:"original",kind:"text",purpose:"content",facts:request}],
  generationIntent:{version:1,objective:"Despertar vontade de conhecer a Lume",tone:{description:"Acolhedor",origin:"inferred",rationale:"Convite"},adaptation:"controlled",requirements:[],content:[]},
  reviewExecutionConfig:{version:5,automaticReviewVersion:4} as ProposalExecutionInput["reviewExecutionConfig"],
};
const definitions = [completeDesignTestDefinitions()[0]];
const targets = [{slideIndex:0,fieldId:"field-0",itemIndex:null,current:"Venha conhecer a Lume",reason:["overflow"],fit:{widthRatio:2}}] as any;

describe("positive shared editorial contract",()=>{
  it("gives creator and repair the same objective, facts and real requirement base",()=>{
    const contract = buildCompactEditorialContract(input);
    expect(JSON.parse(compactCopyPrompt(input,definitions)).editorial).toEqual(contract);
    expect(JSON.parse(targetedCopyRepairPrompt(input,definitions,targets,2)).editorial).toEqual(contract);
    expect(contract.objective).toEqual({text:"Despertar vontade de conhecer a Lume",origin:"inferred"});
    expect(contract.direction).toMatchObject({advisory:true,tone:"Acolhedor"});
    expect(compactCopySystemPromptFor(input)).toContain(positiveEditorialInstructions);
    expect(targetedRepairSystemPromptFor(input,2)).toContain(positiveEditorialInstructions);
    expect(targetedRepairSystemPromptFor(input,2)).toContain("reduzir substancialmente");
  });
  it("shares exact texts while preserving every source ID, origin and complete factual tail",()=>{
    const facts = "Fato único. ".repeat(500)+"Condição material no fim: somente aos sábados.";
    const value = {...input,sourceReferences:[...input.sourceReferences!,{id:"long",kind:"url",purpose:"content",facts}]};
    const context = editorialContextV9(value), evidence = buildSourceEvidenceV10(context);
    const before = arsenalHash({context,evidence});
    const contract = buildCompactEditorialContract({...value,editorialContext:context},evidence);
    const texts = new Map<string,string>([["request",request]]);
    for (const row of contract.sourceEvidence) {
      const text = row.text ?? texts.get(row.textRef!);
      expect(text).toBe(evidence.find(e=>e.id===row.id)!.text);
      expect(row.kind).toBe(evidence.find(e=>e.id===row.id)!.kind);
      texts.set(row.id,text!);
    }
    expect([...texts.values()].join("")).toContain("Condição material no fim: somente aos sábados.");
    expect(contract.sourceEvidence.map(e=>e.id)).toEqual(evidence.map(e=>e.id));
    expect(JSON.stringify(contract)).not.toMatch(/socialPlaybook|normalizationVersion|canonicalHash|guidanceRanges/);
    expect(arsenalHash({context,evidence})).toBe(before);
  });
  it("preserves historical prompts and transport when the new marker is absent",()=>{
    const historical = {...input,reviewExecutionConfig:undefined};
    expect(compactCopySystemPromptFor(historical)).toBe(compactCopySystemPrompt);
    expect(targetedRepairSystemPromptFor(historical,2)).toBe(targetedRepairSystemPromptV2);
    expect(JSON.parse(compactCopyPrompt(historical,definitions))).toHaveProperty("version",1);
    expect(JSON.parse(targetedCopyRepairPrompt(historical,definitions,targets,2))).toHaveProperty("context");
    expect(JSON.parse(targetedCopyRepairPrompt(historical,definitions,targets,2))).not.toHaveProperty("editorial");
  });
  it("keeps healthy copy and all geometry out of a targeted repair",()=>{
    const prompt = targetedCopyRepairPrompt(input,definitions,targets,2);
    for(const field of ["bindings","assetIds","instances","editorialPlan","socialPlaybook"]) expect(prompt).not.toContain(`"${field}"`);
    expect(JSON.parse(prompt).targets).toHaveLength(1);
    expect(prompt).not.toContain("maxCharacters");
  });
});


it("keeps visual references advisory while retaining their evidence identities",()=>{
  const value={...input,sourceReferences:[{id:"visual",kind:"image",purpose:"visual_reference",facts:"A fachada possui letreiro dourado."}]};
  const context=editorialContextV9(value), evidence=buildSourceEvidenceV10(context);
  const source=evidence.find(e=>e.origin.endsWith(":visual_reference"))!;
  expect(source.kind).toBe("content"); // Historical inventory remains immutable.
  const contract=buildCompactEditorialContract({...value,editorialContext:context},evidence);
  expect(contract.sourceEvidence.find(e=>e.id===source.id)).toMatchObject({id:source.id,kind:"guidance",origin:source.origin});
  expect(compactEditorialEvidenceKind(source)).toBe("guidance");
  expect(source.kind).toBe("content");
});


it("retains material explicit intent requirements and literal intervention without promoting inferred style",()=>{
  const value={...input,executionBrief:{creationMode:"execution",format:"static",platform:"instagram",interventionLevel:"visual_only",contentSourceType:"freeform",rawInput:request,mustKeep:["Lume"],forbiddenTerms:["grátis"]} as any,
    generationIntent:{...input.generationIntent!,requirements:[
      {id:"real",description:"Dois itens na arte",kind:"content" as const,origin:"explicit" as const,surface:"art" as const,itemCount:2,requestQuote:"Dois itens"},
      {id:"style",description:"Tom acolhedor",kind:"execution" as const,origin:"inferred" as const,surface:"either" as const,itemCount:null,requestQuote:null},
    ]}};
  const contract=buildCompactEditorialContract(value);
  expect(contract.intervention).toBe("visual_only");
  expect(contract.requirements).toEqual(expect.arrayContaining([expect.objectContaining({kind:"forbidden",value:"grátis"})]));
  expect(contract.intentRequirements).toEqual([expect.objectContaining({id:"real",itemCount:2,surface:"art",requestQuote:"Dois itens"})]);
});
