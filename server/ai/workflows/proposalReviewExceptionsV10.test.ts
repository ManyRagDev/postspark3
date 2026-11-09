/** Controlled offline judgments; these tests do not certify a model's semantics. */
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { arsenalHash } from "@shared/arsenalContent";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { instantiateCompleteDesign } from "@shared/completeDesignGeneration";
import { resolveArsenalGeometry } from "@shared/arsenalGeometry";
import { proposalReviewRecordSchema } from "@shared/proposalReview";
import { proposalReviewExceptionsResponseV10Schema } from "@shared/proposalReviewV10";
import { resolveGenerationModelConfig } from "../generationModel";
import { reviewProposal } from "./proposalReview";
import { editorialContextV9 } from "./editorialContextV9";
import { resolveReviewExecutionConfigV10, reviewContractHashV10, assertReviewExecutionConfigV10 } from "./reviewExecutionConfigV10";
import { renderReviewFixtureScenes } from "./proposalReview.fixture";
import { reviewPayloadV7 } from "./proposalReviewV7.fixture";
import { decodeReviewExceptionsV10 } from "./proposalReviewExceptionsPolicyV10";
import { inspectModernReviewEvidence } from "../../modernGenerationReviewEvidence";
import { providerRejectionErrorFromReceipt } from "../../_core/llm";
const id="00000000-0000-4000-8000-000000000001";
function setup(amend?:(response:any,data:any,call:number)=>any, count=1){
 const definition=completeDesignTestDefinitions()[0];const input:any={requestId:id,runId:id,proposalId:"exceptions",revision:1,slot:0,prompt:"Convide para conhecer o serviço.",contextContent:"Teste gratuito por sete dias.",platform:"instagram",postMode:count>1?"carousel":"static",reviewPolicyVersion:10,
  reviewExecutionConfig:resolveReviewExecutionConfigV10(undefined,resolveGenerationModelConfig({generationModel:"auto",postMode:"static"}).taskRouting!.copy)};
 input.editorialContext=editorialContextV9(input);input.editorialContextHash=input.editorialContext.hash;
 const copy:any={caption:"Conheça o serviço",hashtags:[],slides:Array.from({length:count},()=>({values:[{fieldId:"field-0",value:"Venha conhecer"},{fieldId:"field-1",value:"Saiba mais"}],mediaPrompts:[]}))};
 const compositions=copy.slides.map((s:any,i:number)=>resolveArsenalGeometry(instantiateCompleteDesign({definition,values:s.values,mediaPrompts:[],runId:id,slot:0,slide:i,planHash:"a".repeat(64),experimental:true}),{measureText:()=>({height:20,lines:[{width:100}],runs:[]})}));
 let calls=0;const generateText=vi.fn(async(params:any)=>{calls++;const data=reviewPayloadV7(params);const response={status:"reviewed",reviewedSlides:data.slides.map((s:any)=>s.index),limitation:null,findings:[]};const result=amend?.(response,data,calls)??response;return{id:"controlled-provider-id",model:"anthropic/claude-haiku-5.5",choices:[{message:{content:typeof result==="string"?result:JSON.stringify(result)},finish_reason:"stop"}]};});
 const deps:any={actor:id,generateText,renderReviewScenes:vi.fn(renderReviewFixtureScenes),reviewOperationCache:new Map(),reviewRepairBudget:new Set()};
 return{input,copy,compositions,deps,generateText,review:()=>reviewProposal(input,deps,copy.slides.map(()=>definition),compositions,copy,"initial")};
}
const issue=(d:any,extra:any={})=>({targetId:d.targets[0].id,category:"visible_text_loss",consequence:"meaning_loss",certainty:"established",evidenceIds:[],detail:"O convite está cortado e não completa seu sentido.",expected:"Completar o convite dentro do espaço.",...extra});
describe("automatic exceptions review v4",()=>{
 it("pins a small native schema and never fabricates a positive unit audit",async()=>{
  const s=setup();const r:any=await s.review();expect(r).toMatchObject({automaticReviewVersion:4,status:"passed",inspectionStatus:"reviewed",findings:[]});
  expect(proposalReviewRecordSchema.safeParse(r).success).toBe(true);for(const key of ["unitChecks","factualAudit","checkedTextUnits","factCoverage","intentChecks"])expect(r).not.toHaveProperty(key);
  const p=s.generateText.mock.calls[0][0];expect(p.forceTextSchema).toBe(false);expect(p.response_format.json_schema.name).toBe("proposal_review_exceptions_v10");
  const wire=JSON.stringify(p.response_format.json_schema.schema);expect(Buffer.byteLength(wire)).toBeLessThan(1700);expect(wire.match(/"anyOf"/g)).toHaveLength(1);
  const data=reviewPayloadV7(p);expect(data.editorial).toHaveProperty("objective");expect(data).not.toHaveProperty("context");expect(data).not.toHaveProperty("nativeConstraints");expect(data).not.toHaveProperty("textUnits");
  expect(p.messages[0].content).not.toContain("auditoria operacional");expect(s.generateText).toHaveBeenCalledTimes(1);
  const again=await s.review();expect(again).toEqual(r);expect(s.generateText).toHaveBeenCalledTimes(1);
 });
 it.each(["partial","unavailable"])("does not approve %s even with no findings",async status=>{
  const s=setup(r=>({...r,status,reviewedSlides:[],limitation:"Não consegui inspecionar a imagem."}));const r:any=await s.review();expect(r.status).toBe("inconclusive");expect(r.inspectionStatus).toBe(status);expect(s.generateText).toHaveBeenCalledTimes(1);
 });
 it("cannot pass a visibly broken editorial title",async()=>{const s=setup((r,d)=>({...r,findings:[issue(d)]}));const r:any=await s.review();expect(r.status).toBe("correction_required");expect(r.findings[0]).toMatchObject({category:"visible_text_loss",effect:"blocking"});});
 it("treats visible_text_loss as advisory aesthetic when detail explicitly states text is not cut",async()=>{const s=setup((r,d)=>({...r,findings:[issue(d,{category:"visible_text_loss",consequence:"meaning_loss",detail:"O título está visualmente quebrado, mas o texto não aparece cortado.",expected:"Manter estilo uniforme."})]}));const r:any=await s.review();expect(r.status).toBe("passed");expect(r.findings[0]).toMatchObject({category:"aesthetic",effect:"advisory"});});
 it("keeps genuine factual uncertainty inconclusive",async()=>{const s=setup((r,d)=>({...r,findings:[issue(d,{category:"unsupported_claim",consequence:"false_claim",certainty:"uncertain",detail:"Não é possível confirmar o alcance da promessa.",expected:"Esclarecer o alcance com a fonte."})]}));expect((await s.review()).status).toBe("inconclusive");});
 it("blocks a grounded changed condition instead of certifying it as style",async()=>{const s=setup((r,d)=>({...r,findings:[issue(d,{category:"factual_contradiction",consequence:"lost_condition",evidenceIds:[d.editorial.sourceEvidence.find((e:any)=>e.kind==="content"&&e.text?.includes("sete dias")).id],detail:"A oferta omite o limite de sete dias.",expected:"Preservar sete dias na oferta utilizada."})]}));expect((await s.review()).status).toBe("correction_required");});
 it.each(["unknown_target","unknown_evidence","duplicate_slide","missing_slide","missing_limitation","inconsistent_category","narrative_false_claim","guidance_as_fact"])("rejects %s and exhausts only the existing formal repair",async mode=>{
  const s=setup((r,d)=>{
   if(mode==="duplicate_slide")return{...r,reviewedSlides:[0,0]};if(mode==="missing_slide")return{...r,reviewedSlides:[]};if(mode==="missing_limitation")return{...r,status:"unavailable",reviewedSlides:[],limitation:null};
   const f=issue(d);if(mode==="unknown_target")f.targetId="invented";if(mode==="unknown_evidence")f.evidenceIds=["invented"];
   if(mode==="inconsistent_category")f.consequence="none";
   if(mode==="narrative_false_claim"){f.category="narrative_gap";f.consequence="false_claim";}
   if(mode==="guidance_as_fact"){f.category="factual_contradiction";f.evidenceIds=[d.editorial.sourceEvidence.find((e:any)=>e.kind==="guidance").id];}
   return{...r,findings:[f]};
  });const r:any=await s.review();expect(r.status).toBe("inconclusive");expect(s.generateText).toHaveBeenCalledTimes(2);
  await s.review();expect(s.generateText).toHaveBeenCalledTimes(2);
 });
 it("preserves technical renderer failure without buying a review",async()=>{const s=setup();s.deps.renderReviewScenes.mockRejectedValue(new Error("renderer offline"));const r:any=await s.review();expect(r).toMatchObject({status:"inconclusive",inspectionStatus:"unavailable",rawResponseHash:null});expect(s.generateText).not.toHaveBeenCalled();});
 it("retains a known provider rejection without a formal retry",async()=>{const s=setup();s.generateText.mockRejectedValue(providerRejectionErrorFromReceipt({__providerRejection:{version:1,provider:"openrouter",model:"anthropic/claude-haiku-5.5",httpStatus:400,reason:"invalid_request_error",providerRequestId:"controlled",requestHash:"a".repeat(64),responseHash:"b".repeat(64),costStatus:"unreported"}}));expect((await s.review()).status).toBe("inconclusive");expect(s.generateText).toHaveBeenCalledTimes(1);
  const saved=s.deps.reviewOperationCache.values().next().value;expect(saved.state).toBe("completed");expect(saved.result.__providerRejection.costStatus).toBe("unreported");
  expect((await s.review()).status).toBe("inconclusive");expect(s.generateText).toHaveBeenCalledTimes(1);
 });
 it("rejects duplicate raw keys",()=>{expect(()=>decodeReviewExceptionsV10('{"status":"reviewed","status":"unavailable","reviewedSlides":[],"limitation":null,"findings":[]}')).toThrow();});
 it.each([undefined,2,3] as const)("still validates historical automatic marker %s without reinterpretation",version=>{const s=setup();const {configurationHash:_,...data}=s.input.reviewExecutionConfig;delete data.localContrastPolicyVersion;delete data.textFlexibilityVersion;delete data.visualTextRepairVersion;delete data.profileHandlePolicyVersion;delete data.nativeGlyphProjection;delete data.nativeGlyphManifestHash;delete data.automaticReviewVersion;if(version)data.automaticReviewVersion=version;data.contractHash=reviewContractHashV10(false,true,1,version);const old={...data,configurationHash:arsenalHash(data)};expect(assertReviewExecutionConfigV10(old)).toEqual(old);});
 it("pins optional local policies only on new admissions and rejects a changed glyph manifest",()=>{
  const s=setup();const {configurationHash:_,...data}=s.input.reviewExecutionConfig;
  expect(data).toMatchObject({localContrastPolicyVersion:1,textFlexibilityVersion:1,visualTextRepairVersion:1,profileHandlePolicyVersion:1,nativeGlyphProjection:1});
  const forged={...data,nativeGlyphManifestHash:"f".repeat(64)};expect(()=>assertReviewExecutionConfigV10({...forged,configurationHash:arsenalHash(forged)})).toThrow();
  delete data.localContrastPolicyVersion;delete data.textFlexibilityVersion;delete data.visualTextRepairVersion;delete data.profileHandlePolicyVersion;delete data.nativeGlyphProjection;delete data.nativeGlyphManifestHash;
  const historical={...data,configurationHash:arsenalHash(data)};expect(assertReviewExecutionConfigV10(historical)).toEqual(historical);
 });
 it("audits the raw exceptions receipt and rejects a changed approval",async()=>{
  const s=setup();const review:any=await s.review();const key=review.operationKeys[0];const result=s.deps.reviewOperationCache.values().next().value.result;const ctx=result.__proposalReview;
  const proposal:any={proposalId:s.input.proposalId,slot:0,revision:1,status:"ready",reviews:[review],bundle:{caption:s.copy.caption,hashtags:s.copy.hashtags,slides:s.compositions.map((composition:any)=>({composition}))}};
  const request:any={id,input:{content:s.input.prompt,platform:"instagram",postMode:"static"},prepared:{preparationVersion:6,reviewPolicyVersion:10,reviewExecutionConfig:s.input.reviewExecutionConfig,contextContent:s.input.contextContent,editorialContext:s.input.editorialContext,editorialContextHash:s.input.editorialContextHash}};
  const operations=[{operation_key:key,state:"completed",result,expectation:{...ctx,transport:{}}}];const checks=new Map<string,boolean>();inspectModernReviewEvidence(request,operations,proposal,(code,pass)=>checks.set(code,pass));
  expect(checks.get("review_exception_record_matches_receipt")).toBe(true);expect(checks.get("final_review_matches_delivered_text")).toBe(true);expect(checks.has("review_text_units_complete")).toBe(false);
  result.choices[0].message.content=JSON.stringify({status:"unavailable",reviewedSlides:[],limitation:"Imagem ausente",findings:[]});inspectModernReviewEvidence(request,operations,proposal,(code,pass)=>checks.set(code,pass));expect(checks.get("review_exception_record_matches_receipt")).toBe(false);
 });
});
