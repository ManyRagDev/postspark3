import {describe,it,expect,vi} from "vitest";
import {visualTextRepairCall,usesVisualTextRepair} from "./visualTextRepair";
import {completeDesignTestDefinitions} from "@shared/completeDesignGeneration.fixture";
import {instantiateCompleteDesign} from "@shared/completeDesignGeneration";
import {resolveGenerationModelConfig} from "../generationModel";
import {resolveReviewExecutionConfigV10} from "./reviewExecutionConfigV10";
function setup(){
 const d=completeDesignTestDefinitions()[0];
 const generation=resolveGenerationModelConfig({generationModel:"auto",postMode:"static"});
 const config=resolveReviewExecutionConfigV10(generation.model,generation.taskRouting!.copy);
 const copy={caption:"Contexto na legenda",hashtags:[],slides:Array.from({length:2},()=>({values:[{fieldId:"field-0",value:"Título"},{fieldId:"field-1",value:"Texto de apoio"}],mediaPrompts:[]}))};
 const input:any={requestId:"test",proposalId:"test",runId:"11111111-1111-4111-8111-111111111111",slot:0,prompt:"Divulgue um café",postMode:"carousel",generationConfig:generation,reviewExecutionConfig:config};
 const scene=instantiateCompleteDesign({definition:d,...copy.slides[0],runId:input.runId,slot:0,slide:0,planHash:"a".repeat(64),experimental:true});
 const render=vi.fn(async(_args:any)=>[{slideIndex:0,renderer:"CanvasPostStage" as const,width:1080,height:1350,dataUri:"data:image/png;base64,AAAA"}]);
 const deps:any={actor:"test",renderReviewScenes:render};
 const targets:any=[{slideIndex:1,fieldId:"field-1",itemIndex:null,current:"Texto de apoio",reason:["overflow:height"],fit:{widthRatio:.8,heightRatio:1.5,measuredLines:3}}];
 return {d,copy,input,scene,render,deps,targets};
}
describe("bounded visual correction evidence",()=>{
 it("renders only affected slides and sends their original indices with the pinned vision model",async()=>{
  const s=setup();const out=await visualTextRepairCall(s.input,s.deps,[s.d,s.d],[s.scene,s.scene],s.targets,s.copy);
  expect(s.render).toHaveBeenCalledTimes(1);expect(s.render.mock.calls[0][0].compositions).toHaveLength(1);
  expect(out.options.taskModelConfig).toEqual(s.input.reviewExecutionConfig.taskModelConfig);
  expect(out.options.pinnedModel).toBe("anthropic/claude-haiku-5.5");
  const content=out.messages[1].content as any[];expect(content.filter(x=>x.type==="image_url")).toHaveLength(1);
  expect(content[1].text).toContain("slide 1");expect(out.evidence.slides[0].slideIndex).toBe(1);
  expect(JSON.stringify(content[0])).not.toContain("pieceHash");expect(JSON.stringify(content[0])).not.toContain("fontSize");
 });
 it("rejects an incomplete or foreign render before any provider call",async()=>{
  const s=setup();s.render.mockResolvedValueOnce([]);await expect(visualTextRepairCall(s.input,s.deps,[s.d,s.d],[s.scene,s.scene],s.targets,s.copy)).rejects.toThrow("renderer_unavailable");
 });
 it("leaves historical policy off and refuses a call without its marker",async()=>{
  const s=setup();delete s.input.reviewExecutionConfig.visualTextRepairVersion;expect(usesVisualTextRepair(s.input)).toBe(false);
  await expect(visualTextRepairCall(s.input,s.deps,[s.d,s.d],[s.scene,s.scene],s.targets,s.copy)).rejects.toThrow("config_missing");expect(s.render).not.toHaveBeenCalled();
 });
});
