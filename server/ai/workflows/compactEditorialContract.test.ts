import { describe, expect, it } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { arsenalHash } from "@shared/arsenalContent";
import { buildCompactEditorialContract, compactEditorialEvidenceKind, positiveEditorialInstructions } from "./compactEditorialContract";
import { compactCopyPrompt, compactCopySystemPrompt, compactCopySystemPromptFor, editorialDesignReviewContext, targetedCopyRepairPrompt, targetedRepairSystemPromptFor, targetedRepairSystemPromptV2 } from "./compactProposalCopy";
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

describe("experimental layout-led writing", () => {
  const [cover, detail, replacement] = completeDesignTestDefinitions();
  const approach = "Abra com a experiência e detalhe a visita na segunda lâmina.";
  const readerPriority = "Entender por que visitar antes de conferir o horário.";
  const coverPurpose = "Apresente o nome da cafeteria como título de abertura.";
  const detailPurpose = "Use o apoio para a condição de gratuidade aos sábados.";
  const experiment: ProposalExecutionInput = {
    ...input,
    postMode: "carousel",
    editorialApproach: approach,
    narrativePlan: {
      slot: 0, status: "viable", candidateId: cover.id, reason: "A estrutura facilita o convite.",
      editorialApproach: approach, editorialDesign: { readerPriority }, captionContentIds: [],
      pages: [
        { slideIndex: 0, componentId: cover.id, purpose: "Convidar", rhythm: "opening",
          assignments: [{ fieldId: "field-0", contentIds: [], itemCount: null, instruction: coverPurpose }] },
        { slideIndex: 1, componentId: detail.id, purpose: "Detalhar condições", rhythm: "reading",
          assignments: [{ fieldId: "field-1", contentIds: [], itemCount: null, instruction: detailPurpose }] },
      ],
    },
  };

  it("adds layout-specific roles to writing and repair while keeping the original editorial contract", () => {
    const slides = [cover, detail];
    for (const value of [experiment, { ...experiment, reviewExecutionConfig: undefined }]) {
      const payload = JSON.parse(compactCopyPrompt(value, slides));
      expect(payload.designReading).toMatchObject({ approach, readerPriority });
      expect(payload.slides[0].fields[0]).toMatchObject({ writingPurpose: coverPurpose, boxes: expect.any(Array) });
      expect(payload.slides[1].fields[0]).not.toHaveProperty("writingPurpose");
      expect(payload.slides[1].fields[1]).toMatchObject({ writingPurpose: detailPurpose });
      expect(payload.approach).toBeUndefined();
      const repairTargets = [{ slideIndex: 1, fieldId: "field-1", itemIndex: null, current: "Apenas aos sábados", reason: ["overflow"] }];
      const repair = JSON.parse(targetedCopyRepairPrompt(value, slides, repairTargets, 2));
      expect(repair.designReading).toMatchObject({ readerPriority });
      expect(repair.targets).toMatchObject([{ slideIndex: 1, fieldId: "field-1", writingPurpose: detailPurpose }]);
    }
    const payload = JSON.parse(compactCopyPrompt(experiment, slides));
    expect(payload.editorial).toEqual(buildCompactEditorialContract(experiment));
    expect(editorialDesignReviewContext(experiment)).toMatchObject({ designReading: { approach, readerPriority, advisory: true } });
  });

  it("ignores a stale field when recovery swaps the component and protects literal writing", () => {
    const rewrite = JSON.parse(compactCopyPrompt({ ...experiment, rewriteForRecovery: true }, [cover, replacement]));
    expect(rewrite).toHaveProperty("recovery.instruction");
    expect(rewrite.designReading.readerPriority).toBe(readerPriority);
    expect(rewrite.slides[1].fields[1]).not.toHaveProperty("writingPurpose");

    const literal: ProposalExecutionInput = {
      ...experiment,
      generationIntent: { ...experiment.generationIntent!, adaptation: "literal" },
    };
    const payload = compactCopyPrompt(literal, [cover, detail]);
    expect(payload).not.toContain('"designReading"');
    expect(payload).not.toContain('"writingPurpose"');
    expect(payload).not.toContain(approach);
    expect(editorialDesignReviewContext(literal)).toEqual({});
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
