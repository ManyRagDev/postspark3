import { z } from "zod";
import { arsenalHash } from "@shared/arsenalContent";
import { positiveEditorialInstructions } from "@shared/compactEditorialContract";
import { proposalReviewExceptionsResponseV10Schema, proposalReviewExceptionsRecordV10Schema, type ProposalReviewExceptionsRecordV10, type ProposalReviewDurableContextV5 } from "@shared/proposalReviewV10";
import type { ComponentDefinitionV1 } from "@shared/componentAssembly";
import type { ArsenalComposition } from "@shared/designArsenal";
import { failureFromError, GenerationFailureError } from "@shared/generationFailure";
import { isFormalReviewFailure } from "@shared/proposalReviewFailure";
import { extractTextContent } from "../llmJson";
import { generationPinnedTaskModelCallOptions } from "../generationModel";
import { knownProviderRejectionReceipt } from "../../_core/llm";
import { recordGenerationEvent } from "../generationTrace";
import type { ProposalExecutionInput, ProposalGraphDeps } from "./proposalGraph";
import type { ReviewCopy } from "./proposalReview";
import { assertReviewExecutionConfigV10 } from "./reviewExecutionConfigV10";
import { compactAutomaticReviewInstructionsV4 } from "./automaticReviewProtocol";
import { buildCompactEditorialContract } from "./compactEditorialContract";
import { validatedEditorialContextV9 } from "./editorialContextV9";
import { reviewEvidenceAnchors, buildReviewEvidenceAliases } from "./reviewEvidence";
import { buildSourceEvidenceV10, reviewTextUnitsV10 } from "./reviewEvidenceV10";
import { readReviewOperations, initialReviewContext, executeReviewOperation, readReviewContext } from "./proposalReviewJournal";
import { decodeReviewExceptionsV10, normalizeReviewExceptionsV10 } from "./proposalReviewExceptionsPolicyV10";

/** Separate versioned workflow: no legacy positive audit is synthesized. */
export async function reviewProposalExceptionsV10(input:ProposalExecutionInput,deps:ProposalGraphDeps,definitions:ComponentDefinitionV1[],compositions:ArsenalComposition[],copy:ReviewCopy,round:"initial"|"recheck"):Promise<ProposalReviewExceptionsRecordV10>{
  const config=assertReviewExecutionConfigV10(input.reviewExecutionConfig);
  if(config.automaticReviewVersion!==4||!config.taskModelConfig)throw new GenerationFailureError("preparation_contract_incompatible","review");
  let inputHash=arsenalHash({policyVersion:10,automaticReviewVersion:4,copy,compositions,round});const operationKeys:string[]=[];
  const empty=(limitation:string)=>proposalReviewExceptionsRecordV10Schema.parse({policyVersion:10,automaticReviewVersion:4,round,inputHash,status:"inconclusive",inspectionStatus:"unavailable",expectedSlideCount:copy.slides.length,reviewedSlides:[],findings:[],limitation,operationKeys,rawResponseHash:null,evidenceInventory:[]});
  try{
    const context=validatedEditorialContextV9(input);
    if(context.hash!==input.editorialContextHash)throw new GenerationFailureError("preparation_contract_incompatible","review");
    const prior=await readReviewOperations(deps,input);const initial=initialReviewContext(prior,input,config);
    const aliases=buildReviewEvidenceAliases(reviewEvidenceAnchors(copy,compositions));const units=reviewTextUnitsV10(copy,aliases);
    const evidenceInventory=buildSourceEvidenceV10(context);
    const profile=initial?.profile??(copy.slides.length<=4&&units.length<=20&&context.requirements.length<=8?"standard":"extended");
    const maxCompletionTokens=config.profiles[profile].maxCompletionTokens;
    let phaseDeadline=Date.now()+(profile==="extended"?config.extendedTimeoutMs:config.timeoutMs);
    const bounded=async<T>(work:(signal:AbortSignal,deadlineMs:number)=>Promise<T>):Promise<T>=>{
      input.signal?.throwIfAborted();const deadlineMs=Math.min(input.deadlineMs??Infinity,phaseDeadline);if(deadlineMs<=Date.now())throw new Error("proposal_review_timeout");
      const controller=new AbortController();const abort=()=>controller.abort(input.signal?.reason);input.signal?.addEventListener("abort",abort,{once:true});
      const timer=setTimeout(()=>controller.abort(new Error("proposal_review_timeout")),deadlineMs-Date.now());
      try{return await work(controller.signal,deadlineMs);}catch(error){if(knownProviderRejectionReceipt(error))throw error;if(controller.signal.aborted&&!input.signal?.aborted)throw new Error("proposal_review_timeout");throw error;}
      finally{clearTimeout(timer);input.signal?.removeEventListener("abort",abort);}
    };
    const renderer=deps.renderReviewScenes??(await import("./proposalRenderer")).renderReviewScenes;
    let scenes:Awaited<ReturnType<typeof renderer>>;
    try{scenes=await bounded((signal,deadlineMs)=>renderer({compositions,definitions,actor:deps.actor,signal,deadlineMs}));}
    catch(error){if(input.signal?.aborted||(error as Error)?.message==="proposal_review_timeout")throw error;throw new Error("proposal_review_renderer_unavailable");}
    scenes.sort((a,b)=>a.slideIndex-b.slideIndex);
    if(scenes.length!==copy.slides.length||scenes.some((s,i)=>s.slideIndex!==i||s.renderer!=="CanvasPostStage"||s.width<256||s.height<256||s.width>4096||s.height>4096||!/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(s.dataUri))||scenes.reduce((n,s)=>n+s.dataUri.length,0)>16_000_000)throw new Error("proposal_review_renderer_unavailable");
    const reviewData={editorial:buildCompactEditorialContract({...input,editorialContext:context},evidenceInventory),
      caption:copy.caption,hashtags:copy.hashtags,
      targets:units.map(u=>({id:u.id,scope:u.scope,...(u.slideIndex===null?{}:{slideIndex:u.slideIndex}),text:u.text,
        ...(u.visibleAliases.length?{visibleFragments:aliases.promptInventory.filter(a=>u.visibleAliases.includes(a.alias)).map(a=>({id:a.alias,text:a.quote}))}:{})})),
      slides:scenes.map(s=>({id:`slide:${s.slideIndex}`,index:s.slideIndex})),
      ...(input.previousReviewContext?{previous:{findings:input.previousReviewContext.previous.findings,changedTargets:input.previousReviewContext.changedTargets}}:{})};
    const renderHashes=scenes.map(s=>({slideIndex:s.slideIndex,hash:arsenalHash(s.dataUri)}));
    inputHash=arsenalHash({policyVersion:10,automaticReviewVersion:4,configurationHash:config.configurationHash,identity:{requestId:input.requestId,proposalId:input.proposalId,revision:input.revision??1},reviewData,compositions,round,renderHashes,sourceImageHashes:input.sourceImages?.map(arsenalHash),profile,maxCompletionTokens});
    const durableContext:ProposalReviewDurableContextV5={version:5,policyVersion:10,requestId:input.requestId,proposalId:input.proposalId,revision:input.revision??1,round,inputHash,configurationHash:config.configurationHash,sourceContextHash:context.hash,renderHashes,anchorInventory:aliases.inventory,aliasMap:aliases.aliasMap,textUnitInventory:units,evidenceInventory,profile};
    const schema=z.toJSONSchema(proposalReviewExceptionsResponseV10Schema);delete schema.$schema;
    const execute=async(key:string,violations?:string[],invalidHash?:string)=>{
      operationKeys.push(`${input.proposalId}:${key}`);
      if(violations)phaseDeadline=Date.now()+config.extendedTimeoutMs;
      return executeReviewOperation(input,deps,key,durableContext,config,()=>bounded(async(signal,deadlineMs)=>{
        const params:Parameters<typeof deps.generateText>[0]={taskRoute:"post_evaluation",traceLabel:violations?`proposal_review_evidence_repair_${round}`:`proposal_review_${round}`,
          ...generationPinnedTaskModelCallOptions(config.taskModelConfig!),signal,deadlineMs,maxCompletionTokens,structuredValidationOwner:"caller",
          response_format:{type:"json_schema",json_schema:{name:"proposal_review_exceptions_v10",strict:true,schema}},
          messages:[{role:"system",content:compactAutomaticReviewInstructionsV4(positiveEditorialInstructions,violations,invalidHash)},
            {role:"user",content:[{type:"text",text:JSON.stringify(reviewData)},...(input.sourceImages??[]).flatMap((url,index)=>[{type:"text" as const,text:`Imagem fonte original ${index}; não é a arte gerada.`},{type:"image_url" as const,image_url:{url,detail:"high" as const}}]),
              ...scenes.flatMap(s=>[{type:"text" as const,text:`Slide ${s.slideIndex}`},{type:"image_url" as const,image_url:{url:s.dataUri,detail:"high" as const}}])]}]};
        await deps.persistReviewExpectation?.(key,{...durableContext,transport:{model:config.resolvedModel,messagesHash:arsenalHash(params.messages),configurationHash:config.configurationHash}});
        recordGenerationEvent({stage:"proposal_review_protocol",status:"started",detail:violations?"formal_repair":"evaluation",data:{policyVersion:10,automaticReviewVersion:4,proposalId:input.proposalId,round,profile,slides:copy.slides.length,maxCompletionTokens,configurationHash:config.configurationHash}});
        const result=await deps.generateText(params);return {...result,__proposalReview:durableContext};
      }));
    };
    const parse=(result:Awaited<ReturnType<typeof execute>>,key:string)=>{
      const receipt=readReviewContext(result,input,config,key);if(arsenalHash(receipt)!==arsenalHash(durableContext))throw new GenerationFailureError("preparation_contract_incompatible","review");
      const choice=result.choices?.[0];if(/length|max_token|max_output|limit/i.test(`${choice?.finish_reason??""} ${choice?.native_finish_reason??""}`))throw new Error("proposal_review_response_truncated");
      return normalizeReviewExceptionsV10({response:decodeReviewExceptionsV10(extractTextContent(choice?.message?.content)),units,evidenceInventory,context,aliases,slideCount:copy.slides.length,round,inputHash,operationKeys:[...operationKeys]});
    };
    const key=`review:${round}:${inputHash}`;const result=await execute(key);
    try{return parse(result,key);}catch(error){
      if(error instanceof GenerationFailureError)throw error;const reason=(error as Error)?.message??"proposal_review_response_invalid";
      if(!isFormalReviewFailure(reason))return empty(reason);
      const violations=[reason,JSON.stringify((error as any)?.violation??{rule:reason})];const invalidHash=arsenalHash(result);const repairKey=`review_evidence_repair:${round}:${arsenalHash({policyVersion:10,automaticReviewVersion:4,inputHash,invalidHash,violations})}`;
      const operations=await readReviewOperations(deps,input);const prefix=input.firstDeliveryReviewRecovery?`review_evidence_repair:${round}:`:"review_evidence_repair:";
      if(operations.some(o=>o.operationKey.startsWith(prefix)&&o.operationKey!==repairKey)||Array.from(deps.reviewRepairBudget??[]).some(k=>input.firstDeliveryReviewRecovery?k.includes(prefix):true)&&!operations.some(o=>o.operationKey===repairKey))return empty(reason);
      deps.reviewRepairBudget?.add(repairKey);
      const repaired=await execute(repairKey,violations,invalidHash);
      try{return parse(repaired,repairKey);}catch(repairError){if(repairError instanceof GenerationFailureError)throw repairError;return empty((repairError as Error)?.message??"proposal_review_response_invalid");}
    }
  }catch(error){
    const failure=failureFromError(error,"review");if(failure.code==="provider_route_unavailable")throw Object.assign(new GenerationFailureError(failure.code,"review",true),{cause:error});
    if(input.signal?.aborted||error instanceof GenerationFailureError)throw error;
    const message=(error as Error)?.message??"";
    return empty(message.startsWith("reconciliation_required:")?"proposal_review_reconciliation_required":/^proposal_review_[a-z_]+$/.test(message)?message:"proposal_review_unavailable");
  }
}
