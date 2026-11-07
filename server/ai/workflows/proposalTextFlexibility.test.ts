/** Geometry/contract tests use controlled glyph metrics; real Nexo Fontkit replay
 * is recorded separately and does not claim a new model review. */
import { describe, expect, it, vi } from "vitest";
import { arsenalHash } from "@shared/arsenalContent";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { createComponentDefinition } from "@shared/componentAssembly";
import { instantiateCompleteDesign } from "@shared/completeDesignGeneration";
import { readArsenalComposition } from "@shared/designArsenal";
import { resolveArsenalGeometry, type ArsenalTextMeasurer } from "@shared/arsenalGeometry";
import { resolveGenerationModelConfig } from "../generationModel";
import { assertReviewExecutionConfigV10, resolveReviewExecutionConfigV10 } from "./reviewExecutionConfigV10";
import { fitExistingProposalCopy, inspectProposalScenes } from "./proposalGraph";
const measure: ArsenalTextMeasurer = e => {
 const lineWidth=e.text.length*e.fontSize*.5, count=e.text?Math.max(1,Math.ceil(lineWidth/e.width)):0;
 return {height:count*e.fontSize*(e.lineHeight??1.15),lines:Array.from({length:count},()=>({width:Math.min(e.width,lineWidth)})),runs:[{fill:e.fill,fontSize:e.fontSize,fontStyle:e.fontStyle}]};
};
function fixture(empty=false){
 const original=completeDesignTestDefinitions()[0],body=original.fragment.instances.find(i=>i.id==="support")!;
 const piece={...original.pieces[body.pieceHash],fontSize:44,lineHeight:1.15},hash=arsenalHash(piece);
 const definition=createComponentDefinition({...original,pieces:{...original.pieces,[hash]:piece},fragment:{...original.fragment,relations:[{id:"fit-support",version:1,enabled:true,kind:"textFit",inputs:[],outputs:[{targetId:"support",properties:["width","height","fontSize"]}],parameters:{anchor:"left",maxWidth:300,maxHeight:100,minFontSize:44}}],instances:original.fragment.instances.map(i=>i.id===body.id?{...i,pieceHash:hash,width:300,height:100}:i)}});
 const copy={caption:"Legenda preservada",hashtags:[],slides:[{values:[{fieldId:"field-0",value:"Nexo"},{fieldId:"field-1",value:empty?"":"Uma pausa para focar no futuro"}],mediaPrompts:[]}]};
 const id="00000000-0000-4000-8000-000000000001";
 const scene=instantiateCompleteDesign({definition,...copy.slides[0],runId:id,slot:0,slide:0,planHash:"a".repeat(64),experimental:true});
 const generationConfig=resolveGenerationModelConfig({generationModel:"auto",postMode:"static"});
 const reviewExecutionConfig=resolveReviewExecutionConfigV10(generationConfig.model,generationConfig.taskRouting!.copy);
 const input:any={requestId:id,runId:id,proposalId:"font-window",slot:0,prompt:"Convide para conhecer.",postMode:"static",generationConfig,reviewExecutionConfig};
 return {definition,copy,scene,input};
}
describe("versioned font window in proposal preflight",()=>{
 it("fits the same text before repair, persists the size and keeps historical behavior",()=>{
  const s=fixture(),original=arsenalHash(s.scene);
  const legacy=inspectProposalScenes([s.scene],[s.definition],measure,true,true);
  const modern=inspectProposalScenes([s.scene],[s.definition],measure,true,true,false,1);
  expect(legacy.findings.some(f=>f.target.endsWith(":support"))).toBe(true);
  expect(modern.findings).toEqual([]);
  const result=modern.slides[0].composition,target=result.elements.find(e=>e.id==="support")!;
  expect(target.fontSize).toBeLessThan(44);expect(target.text).toBe(s.copy.slides[0].values[1].value);
  expect(result.overrides.support.fontSize).toBe(target.fontSize);
  const reopened=resolveArsenalGeometry(readArsenalComposition(JSON.parse(JSON.stringify(result))),{measureText:measure});
  expect(reopened.elements.find(e=>e.id==="support")!.fontSize).toBe(target.fontSize);
  expect(inspectProposalScenes([result],[s.definition],measure,true,true,false,1).slides[0].composition).toEqual(result);
  expect(arsenalHash(s.scene)).toBe(original);
 });
 it("reuses copy in a reserve only with the new pinned policy, with no provider calls",async()=>{
  const s=fixture();const createTextMeasurer=vi.fn(async()=>measure);
  const args={copy:s.copy,source:[s.definition],target:[s.definition],input:s.input,deps:{createTextMeasurer}};
  expect(await fitExistingProposalCopy(args)).toEqual(s.copy);
  const {configurationHash:_,...data}=s.input.reviewExecutionConfig;delete data.textFlexibilityVersion;delete data.visualTextRepairVersion;
  const historical=assertReviewExecutionConfigV10({...data,configurationHash:arsenalHash(data)});
  expect(await fitExistingProposalCopy({...args,input:{...s.input,reviewExecutionConfig:historical}})).toBeUndefined();
  expect(createTextMeasurer).toHaveBeenCalledTimes(2);
 });
 it("keeps optional empty fields empty",()=>{
  const s=fixture(true);const result=inspectProposalScenes([s.scene],[s.definition],measure,true,true,false,1);
  expect(result.findings).toEqual([]);expect(result.slides[0].composition.elements.find(e=>e.id==="support")!.text).toBe("");
  expect(result.slides[0].composition.overrides.support).toBeUndefined();
 });
});
